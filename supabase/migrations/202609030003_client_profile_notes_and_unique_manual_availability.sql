alter table client_profiles
  add column if not exists notes text;

create or replace function public.studio_flow_get_own_client_profile()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile profiles%rowtype;
  v_client clients%rowtype;
  v_client_profile client_profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Auth session required';
  end if;

  select * into v_profile from profiles where id = auth.uid() and status = 'active';

  if v_profile.id is null then
    raise exception 'Active profile required';
  end if;

  select *
  into v_client
  from clients
  where profile_id = v_profile.id
    and status <> 'archived'
  order by created_at
  limit 1;

  if v_client.id is null then
    return jsonb_build_object('client', null, 'clientProfile', null, 'client_profile', null);
  end if;

  insert into client_profiles (client_id)
  values (v_client.id)
  on conflict (client_id) do nothing;

  select * into v_client_profile from client_profiles where client_id = v_client.id;

  return jsonb_build_object(
    'client', to_jsonb(v_client),
    'clientProfile', to_jsonb(v_client_profile),
    'client_profile', to_jsonb(v_client_profile)
  );
end;
$$;

create or replace function public.studio_flow_update_own_client_profile(
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile profiles%rowtype;
  v_client clients%rowtype;
  v_client_profile client_profiles%rowtype;
  v_birthday date;
  v_latitude numeric(10, 7);
  v_longitude numeric(10, 7);
begin
  if auth.uid() is null then
    raise exception 'Auth session required';
  end if;

  select * into v_profile from profiles where id = auth.uid() and status = 'active';

  if v_profile.id is null then
    raise exception 'Active profile required';
  end if;

  select *
  into v_client
  from clients
  where profile_id = v_profile.id
    and status <> 'archived'
  order by created_at
  limit 1;

  if v_client.id is null then
    raise exception 'Client profile required';
  end if;

  select * into v_client_profile from client_profiles where client_id = v_client.id;

  v_birthday := coalesce(nullif(trim(coalesce(p_patch ->> 'birthday', '')), '')::date, v_client_profile.birthday);
  v_latitude := coalesce(nullif(trim(coalesce(p_patch ->> 'latitude', '')), '')::numeric, v_client_profile.latitude);
  v_longitude := coalesce(nullif(trim(coalesce(p_patch ->> 'longitude', '')), '')::numeric, v_client_profile.longitude);

  perform public.studio_flow_validate_birth_date(v_birthday);

  if v_latitude is not null and (v_latitude < -90 or v_latitude > 90) then
    raise exception 'Latitud invalida';
  end if;

  if v_longitude is not null and (v_longitude < -180 or v_longitude > 180) then
    raise exception 'Longitud invalida';
  end if;

  update clients
  set
    display_name = coalesce(nullif(trim(p_patch ->> 'name'), ''), nullif(trim(p_patch ->> 'display_name'), ''), display_name),
    email = coalesce(nullif(trim(p_patch ->> 'email'), ''), email),
    phone = coalesce(nullif(trim(p_patch ->> 'phone'), ''), phone),
    updated_at = now()
  where id = v_client.id
  returning * into v_client;

  insert into client_profiles (
    client_id,
    birthday,
    photo_path,
    city,
    state,
    postal_code,
    latitude,
    longitude,
    notes
  )
  values (
    v_client.id,
    v_birthday,
    nullif(p_patch ->> 'photoUrl', ''),
    nullif(trim(coalesce(p_patch ->> 'city', '')), ''),
    nullif(trim(coalesce(p_patch ->> 'state', '')), ''),
    nullif(trim(coalesce(p_patch ->> 'postalCode', p_patch ->> 'postal_code', '')), ''),
    v_latitude,
    v_longitude,
    nullif(trim(coalesce(p_patch ->> 'notes', '')), '')
  )
  on conflict (client_id) do update
  set
    birthday = v_birthday,
    photo_path = case
      when p_patch ? 'photoUrl' then nullif(p_patch ->> 'photoUrl', '')
      when p_patch ? 'photo_path' then nullif(p_patch ->> 'photo_path', '')
      else client_profiles.photo_path
    end,
    city = coalesce(nullif(trim(coalesce(p_patch ->> 'city', '')), ''), client_profiles.city),
    state = coalesce(nullif(trim(coalesce(p_patch ->> 'state', '')), ''), client_profiles.state),
    postal_code = coalesce(nullif(trim(coalesce(p_patch ->> 'postalCode', p_patch ->> 'postal_code', '')), ''), client_profiles.postal_code),
    latitude = v_latitude,
    longitude = v_longitude,
    notes = case
      when p_patch ? 'notes' then nullif(trim(coalesce(p_patch ->> 'notes', '')), '')
      else client_profiles.notes
    end,
    updated_at = now()
  returning * into v_client_profile;

  return jsonb_build_object(
    'client', to_jsonb(v_client),
    'clientProfile', to_jsonb(v_client_profile),
    'client_profile', to_jsonb(v_client_profile)
  );
end;
$$;

create or replace function public.studio_flow_artist_get_clients(
  p_search text default null,
  p_limit integer default 5,
  p_context_type text default 'artist',
  p_membership_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_context jsonb;
  v_clients jsonb;
  v_search text := lower(trim(coalesce(p_search, '')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 5), 5));
begin
  if auth.uid() is null then
    raise exception 'Auth session required';
  end if;

  v_context := public.studio_flow_artist_assert_work_context(p_context_type, p_membership_id);

  with scoped_appointments as (
    select appt.*
    from appointments appt
    where appt.artist_id = (v_context ->> 'artist_id')::uuid
      and (
        ((v_context ->> 'owner_type') = 'artist' and appt.studio_id is null and appt.membership_id is null)
        or (
          (v_context ->> 'owner_type') = 'membership'
          and appt.studio_id = (v_context ->> 'studio_id')::uuid
          and appt.membership_id = (v_context ->> 'membership_id')::uuid
        )
      )
  ),
  related_client_rollup as (
    select
      c.id,
      c.profile_id,
      c.display_name,
      c.email,
      c.phone,
      cp.photo_path,
      cp.notes,
      count(appt.id)::integer as total_visits,
      max(appt.starts_at) as last_visit_at,
      jsonb_agg(
        jsonb_build_object(
          'id', appt.id,
          'service', so.name,
          'date', to_char(appt.starts_at at time zone 'America/Mexico_City', 'YYYY-MM-DD'),
          'time', to_char(appt.starts_at at time zone 'America/Mexico_City', 'HH24:MI'),
          'status', case appt.status
            when 'scheduled' then 'Confirmada'
            when 'completed' then 'Completada'
            when 'cancelled' then 'Cancelada'
            when 'no_show' then 'No show'
            when 'disputed' then 'Disputada'
            else initcap(appt.status::text)
          end
        )
        order by appt.starts_at desc
      ) as history,
      case when c.profile_id is not null then 3 else 1 end as relationship_rank
    from scoped_appointments appt
    join clients c on c.id = appt.client_id
    left join client_profiles cp on cp.client_id = c.id
    join service_offerings so on so.id = appt.service_offering_id
    where coalesce(c.status::text, 'active') <> 'archived'
    group by c.id, c.profile_id, c.display_name, c.email, c.phone, cp.photo_path, cp.notes
  ),
  filtered_clients as (
    select *
    from related_client_rollup
    where v_search = ''
      or lower(coalesce(display_name, '')) like '%' || v_search || '%'
      or lower(coalesce(phone, '')) like '%' || v_search || '%'
      or lower(coalesce(email, '')) like '%' || v_search || '%'
  ),
  ranked_clients as (
    select *
    from filtered_clients
    order by relationship_rank desc, last_visit_at desc nulls last, display_name asc
    limit v_limit
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'profileId', profile_id,
        'profile_id', profile_id,
        'name', display_name,
        'displayName', display_name,
        'email', email,
        'phone', phone,
        'photoUrl', photo_path,
        'photo_path', photo_path,
        'notes', notes,
        'totalVisits', total_visits,
        'total_visits', total_visits,
        'visits', total_visits,
        'lastVisitAt', last_visit_at,
        'last_visit_at', last_visit_at,
        'lastVisit', case
          when last_visit_at is null then ''
          else to_char(last_visit_at at time zone 'America/Mexico_City', 'YYYY-MM-DD')
        end,
        'history', coalesce(history, '[]'::jsonb)
      )
    ),
    '[]'::jsonb
  )
  into v_clients
  from ranked_clients;

  return jsonb_build_object('clients', coalesce(v_clients, '[]'::jsonb));
end;
$$;

drop function if exists public.studio_flow_artist_get_manual_availability(uuid, date, text, uuid);

create or replace function public.studio_flow_artist_get_manual_availability_scoped(
  p_service_offering_id uuid,
  p_date date,
  p_context_type text default 'artist',
  p_membership_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.studio_flow_artist_assert_service_in_context(p_service_offering_id, p_context_type, p_membership_id);
  return public.studio_flow_artist_get_manual_availability(p_service_offering_id, p_date);
end;
$$;

revoke all on function public.studio_flow_artist_get_manual_availability_scoped(uuid, date, text, uuid) from public;
grant execute on function public.studio_flow_artist_get_manual_availability_scoped(uuid, date, text, uuid) to authenticated;
