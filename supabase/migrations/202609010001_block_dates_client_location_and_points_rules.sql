alter table client_profiles
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists postal_code text,
  add column if not exists latitude numeric(10, 7),
  add column if not exists longitude numeric(10, 7);

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
    longitude
  )
  values (
    v_client.id,
    v_birthday,
    nullif(p_patch ->> 'photoUrl', ''),
    nullif(trim(coalesce(p_patch ->> 'city', '')), ''),
    nullif(trim(coalesce(p_patch ->> 'state', '')), ''),
    nullif(trim(coalesce(p_patch ->> 'postalCode', p_patch ->> 'postal_code', '')), ''),
    v_latitude,
    v_longitude
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
    updated_at = now()
  returning * into v_client_profile;

  return jsonb_build_object(
    'client', to_jsonb(v_client),
    'clientProfile', to_jsonb(v_client_profile),
    'client_profile', to_jsonb(v_client_profile)
  );
end;
$$;

create or replace function public.studio_flow_artist_block_context_date(
  p_date date,
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
  v_schedule schedules%rowtype;
  v_timezone text := 'America/Mexico_City';
begin
  if p_date is null then
    raise exception 'Fecha requerida';
  end if;

  v_context := public.studio_flow_artist_assert_work_context(p_context_type, p_membership_id);

  select *
  into v_schedule
  from schedules
  where owner_type = (v_context ->> 'owner_type')::schedule_owner_type
    and (
      ((v_context ->> 'owner_type') = 'artist' and artist_id = (v_context ->> 'artist_id')::uuid)
      or ((v_context ->> 'owner_type') = 'membership' and membership_id = (v_context ->> 'membership_id')::uuid)
    )
    and status <> 'archived'
  order by created_at desc
  limit 1
  for update;

  if v_schedule.id is null then
    insert into schedules (owner_type, artist_id, membership_id, timezone, slot_interval_minutes, status)
    values (
      (v_context ->> 'owner_type')::schedule_owner_type,
      case when (v_context ->> 'owner_type') = 'artist' then (v_context ->> 'artist_id')::uuid else null end,
      nullif(v_context ->> 'membership_id', '')::uuid,
      v_timezone,
      15,
      'active'
    )
    returning * into v_schedule;
  end if;

  v_timezone := coalesce(v_schedule.timezone, v_timezone);

  insert into calendar_blocks (schedule_id, block_type, starts_at, ends_at, reason, status)
  values (
    v_schedule.id,
    'personal',
    (p_date::timestamp at time zone v_timezone),
    ((p_date + 1)::timestamp at time zone v_timezone),
    'blocked_date',
    'active'
  );

  update availability_slots
  set status = 'hidden', updated_at = now()
  where schedule_id = v_schedule.id
    and status = 'available'
    and starts_at >= (p_date::timestamp at time zone v_timezone)
    and starts_at < ((p_date + 1)::timestamp at time zone v_timezone);

  return public.studio_flow_artist_schedule_payload_for_context(p_context_type, p_membership_id);
end;
$$;

create or replace function public.studio_flow_artist_unblock_context_date(
  p_date date,
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
  v_schedule schedules%rowtype;
  v_timezone text := 'America/Mexico_City';
begin
  if p_date is null then
    raise exception 'Fecha requerida';
  end if;

  v_context := public.studio_flow_artist_assert_work_context(p_context_type, p_membership_id);

  select *
  into v_schedule
  from schedules
  where owner_type = (v_context ->> 'owner_type')::schedule_owner_type
    and (
      ((v_context ->> 'owner_type') = 'artist' and artist_id = (v_context ->> 'artist_id')::uuid)
      or ((v_context ->> 'owner_type') = 'membership' and membership_id = (v_context ->> 'membership_id')::uuid)
    )
    and status <> 'archived'
  order by created_at desc
  limit 1
  for update;

  if v_schedule.id is null then
    return public.studio_flow_artist_schedule_payload_for_context(p_context_type, p_membership_id);
  end if;

  v_timezone := coalesce(v_schedule.timezone, v_timezone);

  update calendar_blocks
  set status = 'cancelled', updated_at = now()
  where schedule_id = v_schedule.id
    and status = 'active'
    and reason = 'blocked_date'
    and starts_at >= (p_date::timestamp at time zone v_timezone)
    and starts_at < ((p_date + 1)::timestamp at time zone v_timezone);

  return public.studio_flow_artist_schedule_payload_for_context(p_context_type, p_membership_id);
end;
$$;

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.studio_flow_artist_award_appointment_points(uuid)'::regprocedure)
  into v_definition;

  if v_definition is not null and position('studio_flow_points_after_appointment_start_guard' in v_definition) = 0 then
    v_definition := replace(
      v_definition,
      '  select *
  into v_service
  from service_offerings
  where id = v_appointment.service_offering_id;',
      '  -- studio_flow_points_after_appointment_start_guard
  if now() < v_appointment.starts_at then
    raise exception ''Los Flow Points solo pueden otorgarse desde la hora de la cita.'';
  end if;

  select *
  into v_service
  from service_offerings
  where id = v_appointment.service_offering_id;'
    );

    execute v_definition;
  end if;
end $$;

revoke all on function public.studio_flow_artist_block_context_date(date, text, uuid) from public;
revoke all on function public.studio_flow_artist_unblock_context_date(date, text, uuid) from public;
grant execute on function public.studio_flow_artist_block_context_date(date, text, uuid) to authenticated;
grant execute on function public.studio_flow_artist_unblock_context_date(date, text, uuid) to authenticated;
