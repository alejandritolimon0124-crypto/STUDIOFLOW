create table if not exists public.registration_campaigns (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id),
  name text not null,
  event_name text not null,
  event_date date,
  description text,
  promotion_name text not null default 'Rifa Visitantes',
  client_raffle_name text not null default 'Rifa Clientas Expo',
  welcome_text text,
  image_url text,
  slug text not null unique,
  folio_prefix text not null default 'EXPO',
  status text not null default 'active' check (status in ('draft', 'active', 'closed', 'archived')),
  next_folio integer not null default 1 check (next_folio > 0),
  form_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaign_participants (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.registration_campaigns(id) on delete cascade,
  folio text not null,
  full_name text not null,
  whatsapp text not null,
  email text not null,
  event_type text not null,
  approximate_event_date date,
  interested_service text not null,
  accepts_promotions boolean not null default false,
  hired boolean not null default false,
  hired_at timestamptz,
  confirmation_email_status text not null default 'pending' check (confirmation_email_status in ('pending', 'sending', 'sent', 'failed')),
  confirmation_email_error text,
  confirmation_email_sent_at timestamptz,
  email_delivery_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, folio)
);

create table if not exists public.campaign_raffle_draws (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.registration_campaigns(id) on delete cascade,
  raffle_type text not null check (raffle_type in ('visitors', 'clients')),
  participant_id uuid not null references public.campaign_participants(id),
  drawn_by_profile_id uuid not null references public.profiles(id),
  drawn_at timestamptz not null default now(),
  unique (campaign_id, raffle_type)
);

create index if not exists registration_campaigns_studio_idx on public.registration_campaigns(studio_id, created_at desc);
create index if not exists campaign_participants_campaign_idx on public.campaign_participants(campaign_id, created_at desc);
create index if not exists campaign_participants_search_idx on public.campaign_participants(campaign_id, folio, whatsapp);

alter table public.registration_campaigns enable row level security;
alter table public.campaign_participants enable row level security;
alter table public.campaign_raffle_draws enable row level security;

revoke all on public.registration_campaigns, public.campaign_participants, public.campaign_raffle_draws from anon, authenticated;

create or replace function public.studio_flow_is_studio_owner(p_studio_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.studios s
    where s.id = p_studio_id and s.owner_profile_id = auth.uid()
  ) or exists (
    select 1 from public.user_role_assignments ura
    join public.roles r on r.id = ura.role_id and r.code = 'studio_owner'
    where ura.profile_id = auth.uid() and ura.studio_id = p_studio_id and ura.status = 'active'
  );
$$;

create or replace function public.studio_flow_campaign_create(
  p_studio_id uuid, p_name text, p_event_name text, p_event_date date,
  p_description text, p_promotion_name text, p_client_raffle_name text,
  p_welcome_text text, p_image_url text, p_slug text, p_folio_prefix text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_campaign public.registration_campaigns;
begin
  if not public.studio_flow_is_studio_owner(p_studio_id) then raise exception 'Studio owner access required'; end if;
  insert into public.registration_campaigns (
    studio_id, name, event_name, event_date, description, promotion_name,
    client_raffle_name, welcome_text, image_url, slug, folio_prefix
  ) values (
    p_studio_id, trim(p_name), trim(p_event_name), p_event_date, nullif(trim(p_description), ''),
    coalesce(nullif(trim(p_promotion_name), ''), 'Rifa Visitantes'),
    coalesce(nullif(trim(p_client_raffle_name), ''), 'Rifa Clientas Expo'),
    nullif(trim(p_welcome_text), ''), nullif(trim(p_image_url), ''),
    lower(regexp_replace(trim(p_slug), '[^a-zA-Z0-9]+', '-', 'g')),
    upper(regexp_replace(coalesce(nullif(trim(p_folio_prefix), ''), 'EXPO'), '[^a-zA-Z0-9]', '', 'g'))
  ) returning * into v_campaign;
  return to_jsonb(v_campaign);
end $$;

create or replace function public.studio_flow_campaign_list(p_studio_id uuid)
returns setof public.registration_campaigns language plpgsql security definer set search_path = public as $$
begin
  if not public.studio_flow_is_studio_owner(p_studio_id) then raise exception 'Studio owner access required'; end if;
  return query select * from public.registration_campaigns where studio_id = p_studio_id order by created_at desc;
end $$;

create or replace function public.studio_flow_campaign_public(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', c.id, 'name', c.name, 'eventName', c.event_name, 'eventDate', c.event_date,
    'description', c.description, 'welcomeText', c.welcome_text, 'imageUrl', coalesce(c.image_url, sp.logo_path),
    'studioName', coalesce(sp.commercial_name, s.name), 'promotionName', c.promotion_name,
    'formConfig', c.form_config
  )
  from public.registration_campaigns c
  join public.studios s on s.id = c.studio_id
  left join public.studio_profiles sp on sp.studio_id = s.id
  where c.slug = lower(trim(p_slug)) and c.status = 'active';
$$;

create or replace function public.studio_flow_campaign_register(
  p_slug text, p_full_name text, p_whatsapp text, p_email text,
  p_event_type text, p_approximate_event_date date, p_interested_service text,
  p_accepts_promotions boolean default false
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_campaign public.registration_campaigns; v_participant public.campaign_participants; v_folio text;
begin
  select * into v_campaign from public.registration_campaigns
  where slug = lower(trim(p_slug)) and status = 'active' for update;
  if not found then raise exception 'Campaña no disponible'; end if;
  if length(trim(p_full_name)) < 3 or length(regexp_replace(p_whatsapp, '\D', '', 'g')) < 10
     or position('@' in trim(p_email)) < 2 then raise exception 'Datos de contacto incompletos'; end if;
  v_folio := v_campaign.folio_prefix || '-' || lpad(v_campaign.next_folio::text, 4, '0');
  update public.registration_campaigns set next_folio = next_folio + 1, updated_at = now() where id = v_campaign.id;
  insert into public.campaign_participants (
    campaign_id, folio, full_name, whatsapp, email, event_type,
    approximate_event_date, interested_service, accepts_promotions
  ) values (
    v_campaign.id, v_folio, trim(p_full_name), trim(p_whatsapp), lower(trim(p_email)),
    trim(p_event_type), p_approximate_event_date, trim(p_interested_service), coalesce(p_accepts_promotions, false)
  ) returning * into v_participant;
  return jsonb_build_object('participantId', v_participant.id, 'folio', v_folio,
    'deliveryToken', v_participant.email_delivery_token, 'studioName',
    (select coalesce(sp.commercial_name, s.name) from public.studios s left join public.studio_profiles sp on sp.studio_id=s.id where s.id=v_campaign.studio_id));
end $$;

create or replace function public.studio_flow_campaign_participants(p_campaign_id uuid)
returns setof public.campaign_participants language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.registration_campaigns c where c.id=p_campaign_id and public.studio_flow_is_studio_owner(c.studio_id)) then raise exception 'Studio owner access required'; end if;
  return query select * from public.campaign_participants where campaign_id=p_campaign_id order by created_at desc;
end $$;

create or replace function public.studio_flow_campaign_mark_hired(p_participant_id uuid, p_hired boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_participant public.campaign_participants;
begin
  if not exists (
    select 1 from public.campaign_participants p join public.registration_campaigns c on c.id=p.campaign_id
    where p.id=p_participant_id and public.studio_flow_is_studio_owner(c.studio_id)
  ) then raise exception 'Studio owner access required'; end if;
  update public.campaign_participants set hired=p_hired, hired_at=case when p_hired then now() else null end, updated_at=now()
  where id=p_participant_id returning * into v_participant;
  return to_jsonb(v_participant);
end $$;

create or replace function public.studio_flow_campaign_draw(p_campaign_id uuid, p_raffle_type text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_existing public.campaign_raffle_draws; v_participant public.campaign_participants; v_draw public.campaign_raffle_draws;
begin
  if p_raffle_type not in ('visitors','clients') then raise exception 'Tipo de rifa inválido'; end if;
  if not exists (select 1 from public.registration_campaigns c where c.id=p_campaign_id and public.studio_flow_is_studio_owner(c.studio_id)) then raise exception 'Studio owner access required'; end if;
  select * into v_existing from public.campaign_raffle_draws where campaign_id=p_campaign_id and raffle_type=p_raffle_type;
  if found then
    select * into v_participant from public.campaign_participants where id=v_existing.participant_id;
    return jsonb_build_object('participant',to_jsonb(v_participant),'draw',to_jsonb(v_existing),'alreadyDrawn',true);
  end if;
  select * into v_participant from public.campaign_participants
  where campaign_id=p_campaign_id and (p_raffle_type='visitors' or hired=true)
  order by random() limit 1;
  if not found then raise exception 'No hay participantes elegibles'; end if;
  insert into public.campaign_raffle_draws(campaign_id,raffle_type,participant_id,drawn_by_profile_id)
  values(p_campaign_id,p_raffle_type,v_participant.id,auth.uid()) returning * into v_draw;
  return jsonb_build_object('participant',to_jsonb(v_participant),'draw',to_jsonb(v_draw),'alreadyDrawn',false);
end $$;

revoke all on function public.studio_flow_is_studio_owner(uuid) from public;
revoke all on function public.studio_flow_campaign_public(text) from public;
revoke all on function public.studio_flow_campaign_register(text,text,text,text,text,date,text,boolean) from public;
revoke all on function public.studio_flow_campaign_create(uuid,text,text,date,text,text,text,text,text,text,text) from public;
revoke all on function public.studio_flow_campaign_list(uuid) from public;
revoke all on function public.studio_flow_campaign_participants(uuid) from public;
revoke all on function public.studio_flow_campaign_mark_hired(uuid,boolean) from public;
revoke all on function public.studio_flow_campaign_draw(uuid,text) from public;

grant execute on function public.studio_flow_campaign_public(text) to anon, authenticated;
grant execute on function public.studio_flow_campaign_register(text,text,text,text,text,date,text,boolean) to anon, authenticated;
grant execute on function public.studio_flow_campaign_create(uuid,text,text,date,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.studio_flow_campaign_list(uuid) to authenticated;
grant execute on function public.studio_flow_campaign_participants(uuid) to authenticated;
grant execute on function public.studio_flow_campaign_mark_hired(uuid,boolean) to authenticated;
grant execute on function public.studio_flow_campaign_draw(uuid,text) to authenticated;
grant execute on function public.studio_flow_is_studio_owner(uuid) to authenticated;

insert into public.registration_campaigns (
  studio_id, name, event_name, description, promotion_name, client_raffle_name,
  welcome_text, image_url, slug, folio_prefix, status
)
select s.id,
  'Expo Boda y XV Años 2026 – Dennis Chávez Beauty Studio',
  'Expo Boda y XV Años 2026',
  'Visítanos y participa automáticamente en nuestra rifa para visitantes.',
  'Rifa Visitantes', 'Rifa Clientas Expo',
  'Registra tus datos para participar. Al finalizar recibirás tu folio único.',
  sp.logo_path, 'expo-boda-xv-2026-dennis-chavez-beauty-studio', 'EXPO', 'active'
from public.studios s
join public.studio_profiles sp on sp.studio_id = s.id
where lower(coalesce(sp.commercial_name, s.name)) like '%dennis%beauty%studio%'
order by s.created_at asc
limit 1
on conflict (slug) do nothing;
