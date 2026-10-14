create table public.studio_flow_pong_client_campaigns (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid references public.artists(id),
  studio_id uuid references public.studios(id),
  created_by_profile_id uuid not null references public.profiles(id),
  service_id uuid not null references public.service_offerings(id),
  discount_percent integer not null check(discount_percent in (10,20,30,50)),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint pong_campaign_owner check ((artist_id is null) <> (studio_id is null)),
  constraint pong_campaign_window check (ends_at > starts_at and ends_at <= starts_at + interval '7 days')
);
create table public.studio_flow_pong_campaign_cards (
  campaign_id uuid not null references public.studio_flow_pong_client_campaigns(id),
  client_id uuid not null references public.clients(id),
  card_id uuid not null unique references public.studio_flow_invitation_cards(id),
  primary key(campaign_id,client_id)
);
alter table public.studio_flow_pong_client_campaigns enable row level security;
alter table public.studio_flow_pong_campaign_cards enable row level security;
revoke all on public.studio_flow_pong_client_campaigns,public.studio_flow_pong_campaign_cards
  from public,anon,authenticated;

create function public.studio_flow_generate_pong_client_campaigns(
  p_client_id uuid default null,p_campaign_id uuid default null
)
returns integer language plpgsql security definer set search_path=public,auth as $$
declare v_item record; v_card public.studio_flow_invitation_cards%rowtype;
  v_name text; v_count integer := 0;
begin
  for v_item in
    select campaign.*, eligible.id as client_id
    from public.studio_flow_pong_client_campaigns campaign
    cross join lateral (
      select c.id from public.clients c
      join public.profiles p on p.id=c.profile_id and p.status='active'
      where c.status='active' and c.archived_at is null
        and (p_client_id is null or c.id=p_client_id)
        and exists(select 1 from public.appointments a where a.client_id=c.id
          and a.status='completed'
          and ((campaign.studio_id is not null and a.studio_id=campaign.studio_id)
            or (campaign.artist_id is not null and a.artist_id=campaign.artist_id
              and a.studio_id is null)))
        and not exists(select 1 from public.studio_flow_pong_campaign_cards sent
          where sent.campaign_id=campaign.id and sent.client_id=c.id)
      order by c.id limit 100
    ) eligible
    where campaign.starts_at<=now() and campaign.ends_at>now()
      and (p_campaign_id is null or campaign.id=p_campaign_id)
    order by campaign.created_at,eligible.id
  loop
    perform pg_advisory_xact_lock(hashtext(v_item.id::text || ':' || v_item.client_id::text));
    if exists(select 1 from public.studio_flow_pong_campaign_cards sent
      where sent.campaign_id=v_item.id and sent.client_id=v_item.client_id) then
      continue;
    end if;
    insert into public.studio_flow_invitation_cards
      (artist_id,studio_id,created_by_profile_id,benefit_type,max_redemptions,
        recipient_client_id,expires_at)
    values(v_item.artist_id,v_item.studio_id,v_item.created_by_profile_id,'none',1,
      v_item.client_id,v_item.ends_at+interval '7 days')
    returning * into v_card;
    insert into public.studio_flow_pong_offers
      (card_id,service_id,max_winners,play_ends_at,discount_percent,reward_valid_days)
    values(v_card.id,v_item.service_id,1,v_item.ends_at,v_item.discount_percent,7);
    insert into public.studio_flow_pong_campaign_cards(campaign_id,client_id,card_id)
      values(v_item.id,v_item.client_id,v_card.id);
    if v_item.studio_id is not null then
      select coalesce(sp.commercial_name,s.name) into v_name from public.studios s
        left join public.studio_profiles sp on sp.studio_id=s.id where s.id=v_item.studio_id;
    else
      select coalesce(ap.artistic_name,a.display_name) into v_name from public.artists a
        left join public.artist_profiles ap on ap.artist_id=a.id where a.id=v_item.artist_id;
    end if;
    insert into public.client_notifications(client_id,artist_id,studio_id,notification_type,
      title,body,metadata,reminder_key)
    values(v_item.client_id,v_item.artist_id,v_item.studio_id,'campaign',
      'Un reto de ' || coalesce(v_name,'Studio Flow') || ' para ti',
      'Juega Pong y descubre si desbloqueas un descuento especial. Tienes hasta el cierre de la campaña para intentarlo.',
      jsonb_build_object('targetUrl','/invitacion/' || v_card.code,
        'cardCode',v_card.code,'pongCampaignId',v_item.id),
      'pong-campaign:' || v_item.id || ':' || v_item.client_id)
    on conflict(reminder_key) do nothing;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke all on function public.studio_flow_generate_pong_client_campaigns(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.studio_flow_generate_pong_client_campaigns(uuid,uuid) to postgres;

create function public.studio_flow_create_pong_client_campaign(
  p_studio_id uuid,p_service_id uuid,p_discount_percent integer,
  p_starts_at timestamptz,p_ends_at timestamptz
) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_artist_id uuid; v_id uuid; v_count integer := 0;
begin
  if p_discount_percent not in (10,20,30,50) or p_service_id is null
    or p_starts_at is null or p_ends_at is null
    or p_starts_at < now()-interval '5 minutes'
    or p_starts_at > now()+interval '90 days'
    or p_ends_at <= greatest(p_starts_at,now())
    or p_ends_at > p_starts_at+interval '7 days' then
    raise exception 'Elige un servicio, descuento y un periodo de hasta 7 dias';
  end if;
  if p_studio_id is not null then
    perform public.studio_flow_owner_assert_studio_access(p_studio_id);
  else
    select id into v_artist_id from public.artists where profile_id=auth.uid()
      and status='active' and archived_at is null;
    if v_artist_id is null then raise exception 'Perfil independiente requerido'; end if;
  end if;
  if not exists(select 1 from public.service_offerings so where so.id=p_service_id
    and so.status='active' and so.archived_at is null and so.price_amount>0
    and ((p_studio_id is not null and so.owner_type='studio' and so.studio_id=p_studio_id)
      or (v_artist_id is not null and so.owner_type='artist' and so.artist_id=v_artist_id))) then
    raise exception 'El servicio debe estar activo en este negocio';
  end if;
  insert into public.studio_flow_pong_client_campaigns
    (artist_id,studio_id,created_by_profile_id,service_id,discount_percent,starts_at,ends_at)
  values(v_artist_id,p_studio_id,auth.uid(),p_service_id,p_discount_percent,p_starts_at,p_ends_at)
  returning id into v_id;
  if p_starts_at<=now() then
    v_count := public.studio_flow_generate_pong_client_campaigns(null,v_id);
  end if;
  return jsonb_build_object('id',v_id,'sentNow',v_count);
end $$;
revoke all on function public.studio_flow_create_pong_client_campaign(uuid,uuid,integer,timestamptz,timestamptz)
  from public,anon;
grant execute on function public.studio_flow_create_pong_client_campaign(uuid,uuid,integer,timestamptz,timestamptz)
  to authenticated;

create function public.studio_flow_list_pong_client_campaigns(p_studio_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_artist_id uuid; v_result jsonb;
begin
  if p_studio_id is not null then
    perform public.studio_flow_owner_assert_studio_access(p_studio_id);
  else
    select id into v_artist_id from public.artists where profile_id=auth.uid()
      and status='active' and archived_at is null;
    if v_artist_id is null then raise exception 'Perfil independiente requerido'; end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'serviceName',x.service_name,
    'discountPercent',x.discount_percent,'startsAt',x.starts_at,'endsAt',x.ends_at,
    'sentCount',x.sent_count) order by x.created_at desc),'[]'::jsonb)
  into v_result from (
    select c.*,so.name as service_name,
      (select count(*) from public.studio_flow_pong_campaign_cards sent
        where sent.campaign_id=c.id) as sent_count
    from public.studio_flow_pong_client_campaigns c
    join public.service_offerings so on so.id=c.service_id
    where (p_studio_id is not null and c.studio_id=p_studio_id)
      or (v_artist_id is not null and c.artist_id=v_artist_id)
    order by c.created_at desc limit 10
  ) x;
  return v_result;
end $$;
revoke all on function public.studio_flow_list_pong_client_campaigns(uuid) from public,anon;
grant execute on function public.studio_flow_list_pong_client_campaigns(uuid) to authenticated;

do $$ declare v_sql text;
begin
  select pg_get_functiondef('public.studio_flow_client_get_notifications()'::regprocedure)
    into v_sql;
  if position('perform public.studio_flow_generate_studio_marketing_reminders(client_id_value);' in v_sql)=0 then
    raise exception 'Review client notification generation before adding Pong campaigns';
  end if;
  v_sql := replace(v_sql,
    'perform public.studio_flow_generate_studio_marketing_reminders(client_id_value);',
    'perform public.studio_flow_generate_studio_marketing_reminders(client_id_value); ' ||
      'perform public.studio_flow_generate_pong_client_campaigns(client_id_value);');
  execute v_sql;
end $$;
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule('studioflow-pong-client-campaigns','0 * * * *',
      'select public.studio_flow_generate_pong_client_campaigns()');
  end if;
end $$;
