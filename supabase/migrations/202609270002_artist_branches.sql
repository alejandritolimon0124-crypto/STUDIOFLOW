create table if not exists public.artist_branches (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  name text not null,
  description text,
  phone text,
  address_line text not null,
  city text not null,
  state text not null,
  postal_code text,
  latitude numeric,
  longitude numeric,
  services jsonb not null default '[]'::jsonb,
  weekly_schedule jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists artist_branches_artist_status_idx
  on public.artist_branches (artist_id, status, created_at);

alter table public.artist_branches enable row level security;

create or replace function public.studio_flow_artist_get_branches()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_artist artists%rowtype;
  v_branches jsonb;
begin
  v_artist := public.studio_flow_artist_current_owned_artist(null);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', branch.id,
    'artistId', branch.artist_id,
    'name', branch.name,
    'description', coalesce(branch.description, ''),
    'phone', coalesce(branch.phone, ''),
    'location', jsonb_build_object(
      'address', branch.address_line,
      'city', branch.city,
      'state', branch.state,
      'postalCode', coalesce(branch.postal_code, ''),
      'latitude', branch.latitude,
      'longitude', branch.longitude
    ),
    'services', branch.services,
    'weeklySchedule', branch.weekly_schedule,
    'status', branch.status,
    'createdAt', branch.created_at,
    'updatedAt', branch.updated_at
  ) order by branch.created_at), '[]'::jsonb)
  into v_branches
  from public.artist_branches branch
  where branch.artist_id = v_artist.id
    and branch.status = 'active';

  return jsonb_build_object('branches', v_branches);
end;
$$;

create or replace function public.studio_flow_artist_save_branch(
  p_branch_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_artist artists%rowtype;
  v_branch artist_branches%rowtype;
  v_name text := trim(coalesce(p_payload ->> 'name', ''));
  v_address text := trim(coalesce(p_payload -> 'location' ->> 'address', ''));
  v_city text := trim(coalesce(p_payload -> 'location' ->> 'city', ''));
  v_state text := trim(coalesce(p_payload -> 'location' ->> 'state', ''));
begin
  v_artist := public.studio_flow_artist_current_owned_artist(null);

  if v_name = '' or v_address = '' or v_city = '' or v_state = '' then
    raise exception 'Branch name, address, city and state are required';
  end if;

  if p_branch_id is null then
    insert into public.artist_branches (
      artist_id, name, description, phone, address_line, city, state, postal_code,
      latitude, longitude, services, weekly_schedule
    ) values (
      v_artist.id,
      v_name,
      nullif(trim(coalesce(p_payload ->> 'description', '')), ''),
      nullif(trim(coalesce(p_payload ->> 'phone', '')), ''),
      v_address,
      v_city,
      v_state,
      nullif(trim(coalesce(p_payload -> 'location' ->> 'postalCode', '')), ''),
      nullif(trim(coalesce(p_payload -> 'location' ->> 'latitude', '')), '')::numeric,
      nullif(trim(coalesce(p_payload -> 'location' ->> 'longitude', '')), '')::numeric,
      coalesce(p_payload -> 'services', '[]'::jsonb),
      coalesce(p_payload -> 'weeklySchedule', '[]'::jsonb)
    ) returning * into v_branch;
  else
    update public.artist_branches
    set
      name = v_name,
      description = nullif(trim(coalesce(p_payload ->> 'description', '')), ''),
      phone = nullif(trim(coalesce(p_payload ->> 'phone', '')), ''),
      address_line = v_address,
      city = v_city,
      state = v_state,
      postal_code = nullif(trim(coalesce(p_payload -> 'location' ->> 'postalCode', '')), ''),
      latitude = nullif(trim(coalesce(p_payload -> 'location' ->> 'latitude', '')), '')::numeric,
      longitude = nullif(trim(coalesce(p_payload -> 'location' ->> 'longitude', '')), '')::numeric,
      services = coalesce(p_payload -> 'services', services),
      weekly_schedule = coalesce(p_payload -> 'weeklySchedule', weekly_schedule),
      updated_at = now()
    where id = p_branch_id
      and artist_id = v_artist.id
      and status = 'active'
    returning * into v_branch;
  end if;

  if v_branch.id is null then
    raise exception 'Branch not found or unavailable';
  end if;

  return jsonb_build_object('branchId', v_branch.id);
end;
$$;

revoke all on function public.studio_flow_artist_get_branches() from public;
revoke all on function public.studio_flow_artist_save_branch(uuid, jsonb) from public;
grant execute on function public.studio_flow_artist_get_branches() to authenticated;
grant execute on function public.studio_flow_artist_save_branch(uuid, jsonb) to authenticated;
