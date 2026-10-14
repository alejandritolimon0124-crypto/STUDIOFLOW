alter table public.registration_campaigns
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz;

alter table public.registration_campaigns
  drop constraint if exists registration_campaigns_schedule_window_check;
alter table public.registration_campaigns
  add constraint registration_campaigns_schedule_window_check
  check (
    (starts_at is null and ends_at is null)
    or (starts_at is not null and ends_at is not null and ends_at > starts_at)
  );

create or replace function public.studio_flow_campaign_create_for_entity(
  p_entity_type text,p_entity_id uuid,p_name text,p_event_name text,p_event_date date,
  p_starts_at timestamptz,p_ends_at timestamptz,
  p_description text,p_promotion_name text,p_client_raffle_name text,p_welcome_text text,
  p_image_url text,p_slug text,p_folio_prefix text,p_form_config jsonb default '{}'::jsonb,
  p_channels jsonb default '[]'::jsonb,p_raffles jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_result jsonb;
  v_campaign_id uuid;
begin
  if p_starts_at is null or p_ends_at is null then
    raise exception 'Indica la fecha y hora de inicio y término de la campaña.';
  end if;
  if p_ends_at <= p_starts_at then
    raise exception 'La fecha y hora de término debe ser posterior al inicio.';
  end if;

  v_result := public.studio_flow_campaign_create_for_entity(
    p_entity_type,p_entity_id,p_name,p_event_name,p_event_date,p_description,
    p_promotion_name,p_client_raffle_name,p_welcome_text,p_image_url,p_slug,
    p_folio_prefix,p_form_config,p_channels,p_raffles
  );
  v_campaign_id := (v_result->>'id')::uuid;

  update public.registration_campaigns
  set starts_at=p_starts_at, ends_at=p_ends_at, updated_at=now()
  where id=v_campaign_id;

  return v_result || jsonb_build_object('starts_at',p_starts_at,'ends_at',p_ends_at);
end $$;

create or replace function public.studio_flow_enforce_campaign_window()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_campaign public.registration_campaigns;
begin
  select * into v_campaign from public.registration_campaigns where id=new.campaign_id;
  if not found or v_campaign.status <> 'active' then
    raise exception 'Campaña no disponible';
  end if;
  if v_campaign.starts_at is not null and now() < v_campaign.starts_at then
    raise exception 'Esta campaña aún no inicia.';
  end if;
  if v_campaign.ends_at is not null and now() >= v_campaign.ends_at then
    raise exception 'Esta campaña ha finalizado.';
  end if;
  return new;
end $$;

drop trigger if exists campaign_participants_enforce_window on public.campaign_participants;
create trigger campaign_participants_enforce_window
before insert on public.campaign_participants
for each row execute function public.studio_flow_enforce_campaign_window();

create or replace function public.studio_flow_campaign_public(p_slug text)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'id',c.id,'name',c.name,'eventName',c.event_name,'eventDate',c.event_date,
    'startsAt',c.starts_at,'endsAt',c.ends_at,
    'registrationStatus',case
      when c.starts_at is not null and now()<c.starts_at then 'upcoming'
      when c.ends_at is not null and now()>=c.ends_at then 'closed'
      else 'open'
    end,
    'description',c.description,'welcomeText',c.welcome_text,
    'imageUrl',coalesce(c.image_url,sp.logo_path,ap.photo_path),
    'studioName',coalesce(sp.commercial_name,s.name,ap.artistic_name,a.display_name),
    'promotionName',c.promotion_name,'formConfig',c.form_config,
    'channels',coalesce((select jsonb_agg(jsonb_build_object('id',ch.id,'name',ch.name,'slug',ch.slug) order by ch.position) from public.campaign_channels ch where ch.campaign_id=c.id),'[]'::jsonb)
  ) from public.registration_campaigns c
  left join public.studios s on s.id=c.studio_id left join public.studio_profiles sp on sp.studio_id=s.id
  left join public.artists a on a.id=c.artist_id left join public.artist_profiles ap on ap.artist_id=a.id
  where c.slug=lower(trim(p_slug)) and c.status='active';
$$;

revoke all on function public.studio_flow_campaign_create_for_entity(text,uuid,text,text,date,timestamptz,timestamptz,text,text,text,text,text,text,text,jsonb,jsonb,jsonb) from public;
grant execute on function public.studio_flow_campaign_create_for_entity(text,uuid,text,text,date,timestamptz,timestamptz,text,text,text,text,text,text,text,jsonb,jsonb,jsonb) to authenticated;
