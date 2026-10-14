create table if not exists public.campaign_channels (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.registration_campaigns(id) on delete cascade,
  name text not null,
  slug text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique(campaign_id,slug)
);

create table if not exists public.campaign_raffles (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.registration_campaigns(id) on delete cascade,
  name text not null,
  group_type text not null default 'all' check(group_type in ('all','channel','hired')),
  channel_id uuid references public.campaign_channels(id) on delete cascade,
  winner_count integer not null default 1 check(winner_count between 1 and 20),
  allow_repeat boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  check((group_type='channel' and channel_id is not null) or (group_type<>'channel' and channel_id is null))
);

alter table public.campaign_participants
  add column if not exists source_channel_id uuid references public.campaign_channels(id) on delete set null;

alter table public.campaign_raffle_draws
  add column if not exists raffle_id uuid references public.campaign_raffles(id) on delete cascade;
alter table public.campaign_raffle_draws
  add column if not exists winner_position integer not null default 1;
alter table public.campaign_raffle_draws alter column raffle_type drop not null;
alter table public.campaign_raffle_draws drop constraint if exists campaign_raffle_draws_raffle_type_check;
alter table public.campaign_raffle_draws drop constraint if exists campaign_raffle_draws_campaign_id_raffle_type_key;
create unique index if not exists campaign_raffle_draws_raffle_position_unique
  on public.campaign_raffle_draws(raffle_id,winner_position) where raffle_id is not null;

alter table public.campaign_channels enable row level security;
alter table public.campaign_raffles enable row level security;
revoke all on public.campaign_channels,public.campaign_raffles from anon,authenticated;

insert into public.campaign_raffles(campaign_id,name,group_type,winner_count,position)
select c.id,c.promotion_name,'all',1,0 from public.registration_campaigns c
where not exists(select 1 from public.campaign_raffles r where r.campaign_id=c.id)
on conflict do nothing;

insert into public.campaign_raffles(campaign_id,name,group_type,winner_count,position)
select c.id,c.client_raffle_name,'hired',1,1 from public.registration_campaigns c
where not exists(select 1 from public.campaign_raffles r where r.campaign_id=c.id and r.position=1)
on conflict do nothing;

update public.campaign_raffle_draws d set raffle_id=r.id
from public.campaign_raffles r
where d.raffle_id is null and r.campaign_id=d.campaign_id
  and r.position=case when d.raffle_type='clients' then 1 else 0 end;

create or replace function public.studio_flow_campaign_create_for_entity(
  p_entity_type text,p_entity_id uuid,p_name text,p_event_name text,p_event_date date,
  p_description text,p_promotion_name text,p_client_raffle_name text,p_welcome_text text,
  p_image_url text,p_slug text,p_folio_prefix text,p_form_config jsonb default '{}'::jsonb,
  p_channels jsonb default '[]'::jsonb,p_raffles jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_result jsonb;
  v_campaign_id uuid;
  v_item jsonb;
  v_channel_id uuid;
  v_position integer := 0;
begin
  if jsonb_typeof(coalesce(p_channels,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_channels,'[]'::jsonb))>12 then raise exception 'Puedes agregar hasta 12 canales'; end if;
  if jsonb_typeof(coalesce(p_raffles,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_raffles,'[]'::jsonb))<1 or jsonb_array_length(coalesce(p_raffles,'[]'::jsonb))>12 then raise exception 'Agrega entre 1 y 12 premios'; end if;

  v_result := public.studio_flow_campaign_create_for_entity(p_entity_type,p_entity_id,p_name,p_event_name,p_event_date,p_description,p_promotion_name,p_client_raffle_name,p_welcome_text,p_image_url,p_slug,p_folio_prefix,p_form_config);
  v_campaign_id := (v_result->>'id')::uuid;

  v_position := 0;
  for v_item in select value from jsonb_array_elements(coalesce(p_channels,'[]'::jsonb)) loop
    if length(trim(v_item->>'name'))<2 or length(trim(v_item->>'slug'))<1 then raise exception 'Cada canal necesita un nombre'; end if;
    insert into public.campaign_channels(campaign_id,name,slug,position)
    values(v_campaign_id,left(trim(v_item->>'name'),80),lower(trim(v_item->>'slug')),v_position);
    v_position := v_position+1;
  end loop;

  v_position := 0;
  for v_item in select value from jsonb_array_elements(p_raffles) loop
    if length(trim(v_item->>'name'))<3 then raise exception 'Cada premio necesita un nombre'; end if;
    if coalesce(v_item->>'groupType','all') not in ('all','channel','hired') then raise exception 'Grupo de sorteo inválido'; end if;
    v_channel_id := null;
    if v_item->>'groupType'='channel' then
      select id into v_channel_id from public.campaign_channels where campaign_id=v_campaign_id and slug=v_item->>'channelSlug';
      if v_channel_id is null then raise exception 'Selecciona un canal válido para el premio'; end if;
    end if;
    insert into public.campaign_raffles(campaign_id,name,group_type,channel_id,winner_count,allow_repeat,position)
    values(v_campaign_id,left(trim(v_item->>'name'),160),coalesce(v_item->>'groupType','all'),v_channel_id,least(20,greatest(1,coalesce((v_item->>'winnerCount')::integer,1))),coalesce((v_item->>'allowRepeat')::boolean,false),v_position);
    v_position := v_position+1;
  end loop;
  return v_result;
end $$;

create or replace function public.studio_flow_campaign_register(
  p_slug text,p_full_name text,p_whatsapp text,p_email text,p_event_type text,
  p_approximate_event_date date,p_interested_service text,p_accepts_promotions boolean default false,
  p_answers jsonb default '{}'::jsonb,p_channel_slug text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_result jsonb; v_campaign_id uuid; v_channel_id uuid;
begin
  select id into v_campaign_id from public.registration_campaigns where slug=lower(trim(p_slug)) and status='active';
  if v_campaign_id is null then raise exception 'Campaña no disponible'; end if;
  if nullif(trim(coalesce(p_channel_slug,'')),'') is not null then
    select id into v_channel_id from public.campaign_channels where campaign_id=v_campaign_id and slug=lower(trim(p_channel_slug));
    if v_channel_id is null then raise exception 'Canal de campaña inválido'; end if;
  end if;
  v_result := public.studio_flow_campaign_register(p_slug,p_full_name,p_whatsapp,p_email,p_event_type,p_approximate_event_date,p_interested_service,p_accepts_promotions,p_answers);
  update public.campaign_participants set source_channel_id=v_channel_id where id=(v_result->>'participantId')::uuid;
  return v_result;
end $$;

create or replace function public.studio_flow_campaign_public(p_slug text)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'id',c.id,'name',c.name,'eventName',c.event_name,'eventDate',c.event_date,
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

create or replace function public.studio_flow_campaign_dashboard(p_campaign_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not public.studio_flow_can_manage_campaign(p_campaign_id) then raise exception 'Campaign owner access required'; end if;
  return jsonb_build_object(
    'channels',coalesce((select jsonb_agg(to_jsonb(ch) order by ch.position) from public.campaign_channels ch where ch.campaign_id=p_campaign_id),'[]'::jsonb),
    'raffles',coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id,'name',r.name,'group_type',r.group_type,'channel_id',r.channel_id,
      'group_label',case r.group_type when 'all' then 'Todas las participantes' when 'hired' then 'Solo quienes contrataron' else coalesce(ch.name,'Canal') end,
      'winner_count',r.winner_count,'allow_repeat',r.allow_repeat,'position',r.position,
      'draw_count',(select count(*) from public.campaign_raffle_draws d where d.raffle_id=r.id)
    ) order by r.position) from public.campaign_raffles r left join public.campaign_channels ch on ch.id=r.channel_id where r.campaign_id=p_campaign_id),'[]'::jsonb)
  );
end $$;

create or replace function public.studio_flow_campaign_draw_raffle(p_campaign_id uuid,p_raffle_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_raffle public.campaign_raffles; v_participant public.campaign_participants; v_draw public.campaign_raffle_draws; v_draw_count integer;
begin
  if not public.studio_flow_can_manage_campaign(p_campaign_id) then raise exception 'Campaign owner access required'; end if;
  select * into v_raffle from public.campaign_raffles where id=p_raffle_id and campaign_id=p_campaign_id for update;
  if not found then raise exception 'Sorteo no encontrado'; end if;
  select count(*) into v_draw_count from public.campaign_raffle_draws where raffle_id=v_raffle.id;
  if v_draw_count>=v_raffle.winner_count then
    select p.* into v_participant from public.campaign_raffle_draws d join public.campaign_participants p on p.id=d.participant_id where d.raffle_id=v_raffle.id order by d.winner_position desc limit 1;
    return jsonb_build_object('participant',to_jsonb(v_participant),'alreadyDrawn',true,'completed',true);
  end if;
  select p.* into v_participant from public.campaign_participants p
  where p.campaign_id=p_campaign_id
    and (v_raffle.group_type='all' or (v_raffle.group_type='hired' and p.hired) or (v_raffle.group_type='channel' and p.source_channel_id=v_raffle.channel_id))
    and not exists(select 1 from public.campaign_raffle_draws own where own.raffle_id=v_raffle.id and own.participant_id=p.id)
    and (v_raffle.allow_repeat or not exists(select 1 from public.campaign_raffle_draws previous where previous.campaign_id=p_campaign_id and previous.participant_id=p.id))
  order by random() limit 1;
  if not found then raise exception 'No hay participantes elegibles sin premio previo para este sorteo.'; end if;
  insert into public.campaign_raffle_draws(campaign_id,raffle_id,participant_id,drawn_by_profile_id,winner_position)
  values(p_campaign_id,v_raffle.id,v_participant.id,auth.uid(),v_draw_count+1) returning * into v_draw;
  return jsonb_build_object('participant',to_jsonb(v_participant),'draw',to_jsonb(v_draw),'alreadyDrawn',false,'completed',v_draw_count+1>=v_raffle.winner_count);
end $$;

revoke execute on function public.studio_flow_campaign_create_for_entity(text,uuid,text,text,date,text,text,text,text,text,text,text,jsonb) from authenticated;
revoke execute on function public.studio_flow_campaign_register(text,text,text,text,text,date,text,boolean,jsonb) from anon,authenticated;
revoke all on function public.studio_flow_campaign_create_for_entity(text,uuid,text,text,date,text,text,text,text,text,text,text,jsonb,jsonb,jsonb) from public;
revoke all on function public.studio_flow_campaign_register(text,text,text,text,text,date,text,boolean,jsonb,text) from public;
revoke all on function public.studio_flow_campaign_dashboard(uuid) from public;
revoke all on function public.studio_flow_campaign_draw_raffle(uuid,uuid) from public;
grant execute on function public.studio_flow_campaign_create_for_entity(text,uuid,text,text,date,text,text,text,text,text,text,text,jsonb,jsonb,jsonb) to authenticated;
grant execute on function public.studio_flow_campaign_register(text,text,text,text,text,date,text,boolean,jsonb,text) to anon,authenticated;
grant execute on function public.studio_flow_campaign_dashboard(uuid) to authenticated;
grant execute on function public.studio_flow_campaign_draw_raffle(uuid,uuid) to authenticated;
