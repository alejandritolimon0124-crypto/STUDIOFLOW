alter table public.registration_campaigns alter column studio_id drop not null;
alter table public.registration_campaigns add column if not exists artist_id uuid references public.artists(id);
alter table public.registration_campaigns drop constraint if exists registration_campaigns_owner_check;
alter table public.registration_campaigns add constraint registration_campaigns_owner_check
  check (num_nonnulls(studio_id, artist_id) = 1);
create index if not exists registration_campaigns_artist_idx on public.registration_campaigns(artist_id, created_at desc);

create or replace function public.studio_flow_is_artist_owner(p_artist_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.artists a where a.id=p_artist_id and a.profile_id=auth.uid());
$$;

create or replace function public.studio_flow_can_manage_campaign(p_campaign_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.registration_campaigns c where c.id=p_campaign_id
    and ((c.studio_id is not null and public.studio_flow_is_studio_owner(c.studio_id))
      or (c.artist_id is not null and public.studio_flow_is_artist_owner(c.artist_id)))
  );
$$;

create or replace function public.studio_flow_campaign_create_for_entity(
  p_entity_type text, p_entity_id uuid, p_name text, p_event_name text, p_event_date date,
  p_description text, p_promotion_name text, p_client_raffle_name text,
  p_welcome_text text, p_image_url text, p_slug text, p_folio_prefix text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_campaign public.registration_campaigns;
begin
  if p_entity_type='studio' and not public.studio_flow_is_studio_owner(p_entity_id) then raise exception 'Studio owner access required'; end if;
  if p_entity_type='artist' and not public.studio_flow_is_artist_owner(p_entity_id) then raise exception 'Artist access required'; end if;
  if p_entity_type not in ('studio','artist') then raise exception 'Invalid campaign owner'; end if;
  insert into public.registration_campaigns (
    studio_id, artist_id, name, event_name, event_date, description, promotion_name,
    client_raffle_name, welcome_text, image_url, slug, folio_prefix
  ) values (
    case when p_entity_type='studio' then p_entity_id end,
    case when p_entity_type='artist' then p_entity_id end,
    trim(p_name), trim(p_event_name), p_event_date, nullif(trim(p_description), ''),
    coalesce(nullif(trim(p_promotion_name), ''), 'Rifa Visitantes'),
    coalesce(nullif(trim(p_client_raffle_name), ''), 'Rifa Clientas Expo'),
    nullif(trim(p_welcome_text), ''), nullif(trim(p_image_url), ''),
    lower(regexp_replace(trim(p_slug), '[^a-zA-Z0-9]+', '-', 'g')),
    upper(regexp_replace(coalesce(nullif(trim(p_folio_prefix), ''), 'EXPO'), '[^a-zA-Z0-9]', '', 'g'))
  ) returning * into v_campaign;
  return to_jsonb(v_campaign);
end $$;

create or replace function public.studio_flow_campaign_list_for_entity(p_entity_type text, p_entity_id uuid)
returns setof public.registration_campaigns language plpgsql security definer set search_path = public as $$
begin
  if p_entity_type='studio' and not public.studio_flow_is_studio_owner(p_entity_id) then raise exception 'Studio owner access required'; end if;
  if p_entity_type='artist' and not public.studio_flow_is_artist_owner(p_entity_id) then raise exception 'Artist access required'; end if;
  return query select * from public.registration_campaigns c
    where (p_entity_type='studio' and c.studio_id=p_entity_id)
       or (p_entity_type='artist' and c.artist_id=p_entity_id)
    order by c.created_at desc;
end $$;

create or replace function public.studio_flow_campaign_public(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', c.id, 'name', c.name, 'eventName', c.event_name, 'eventDate', c.event_date,
    'description', c.description, 'welcomeText', c.welcome_text,
    'imageUrl', coalesce(c.image_url, sp.logo_path, ap.photo_path),
    'studioName', coalesce(sp.commercial_name, s.name, ap.artistic_name, a.display_name),
    'promotionName', c.promotion_name, 'formConfig', c.form_config
  ) from public.registration_campaigns c
  left join public.studios s on s.id=c.studio_id
  left join public.studio_profiles sp on sp.studio_id=s.id
  left join public.artists a on a.id=c.artist_id
  left join public.artist_profiles ap on ap.artist_id=a.id
  where c.slug=lower(trim(p_slug)) and c.status='active';
$$;

create or replace function public.studio_flow_campaign_participants(p_campaign_id uuid)
returns setof public.campaign_participants language plpgsql security definer set search_path = public as $$
begin
  if not public.studio_flow_can_manage_campaign(p_campaign_id) then raise exception 'Campaign owner access required'; end if;
  return query select * from public.campaign_participants where campaign_id=p_campaign_id order by created_at desc;
end $$;

create or replace function public.studio_flow_campaign_mark_hired(p_participant_id uuid, p_hired boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_participant public.campaign_participants;
begin
  if not exists(select 1 from public.campaign_participants p where p.id=p_participant_id and public.studio_flow_can_manage_campaign(p.campaign_id)) then raise exception 'Campaign owner access required'; end if;
  update public.campaign_participants set hired=p_hired,hired_at=case when p_hired then now() else null end,updated_at=now() where id=p_participant_id returning * into v_participant;
  return to_jsonb(v_participant);
end $$;

create or replace function public.studio_flow_campaign_draw(p_campaign_id uuid, p_raffle_type text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_existing public.campaign_raffle_draws; v_participant public.campaign_participants; v_draw public.campaign_raffle_draws;
begin
  if p_raffle_type not in ('visitors','clients') then raise exception 'Tipo de rifa inválido'; end if;
  if not public.studio_flow_can_manage_campaign(p_campaign_id) then raise exception 'Campaign owner access required'; end if;
  select * into v_existing from public.campaign_raffle_draws where campaign_id=p_campaign_id and raffle_type=p_raffle_type;
  if found then select * into v_participant from public.campaign_participants where id=v_existing.participant_id; return jsonb_build_object('participant',to_jsonb(v_participant),'draw',to_jsonb(v_existing),'alreadyDrawn',true); end if;
  select * into v_participant from public.campaign_participants where campaign_id=p_campaign_id and (p_raffle_type='visitors' or hired=true) order by random() limit 1;
  if not found then raise exception 'No hay participantes elegibles'; end if;
  insert into public.campaign_raffle_draws(campaign_id,raffle_type,participant_id,drawn_by_profile_id) values(p_campaign_id,p_raffle_type,v_participant.id,auth.uid()) returning * into v_draw;
  return jsonb_build_object('participant',to_jsonb(v_participant),'draw',to_jsonb(v_draw),'alreadyDrawn',false);
end $$;

revoke all on function public.studio_flow_is_artist_owner(uuid) from public;
revoke all on function public.studio_flow_can_manage_campaign(uuid) from public;
revoke all on function public.studio_flow_campaign_create_for_entity(text,uuid,text,text,date,text,text,text,text,text,text,text) from public;
revoke all on function public.studio_flow_campaign_list_for_entity(text,uuid) from public;
grant execute on function public.studio_flow_is_artist_owner(uuid) to authenticated;
grant execute on function public.studio_flow_can_manage_campaign(uuid) to authenticated;
grant execute on function public.studio_flow_campaign_create_for_entity(text,uuid,text,text,date,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.studio_flow_campaign_list_for_entity(text,uuid) to authenticated;

insert into public.registration_campaigns (
  artist_id,name,event_name,description,promotion_name,client_raffle_name,welcome_text,image_url,slug,folio_prefix,status
)
select a.id,'Expo Boda y XV Años 2026 – Dennis Chávez Beauty Studio','Expo Boda y XV Años 2026',
  'Visítanos y participa automáticamente en nuestra rifa para visitantes.','Rifa Visitantes','Rifa Clientas Expo',
  'Registra tus datos para participar. Al finalizar recibirás tu folio único.',ap.photo_path,
  'expo-boda-xv-2026-dennis-chavez-beauty-studio','EXPO','active'
from public.artists a join public.artist_profiles ap on ap.artist_id=a.id
where a.id='ea078c9a-b939-4fe6-98e1-05a4d1488379'
on conflict(slug) do nothing;
