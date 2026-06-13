alter type booking_source add value if not exists 'manual_artist_booking';

create or replace function public.studio_flow_artist_create_manual_appointment(
  p_client_first_name text,
  p_client_last_name text,
  p_client_phone text,
  p_service_offering_id uuid,
  p_date date,
  p_time time,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile profiles%rowtype;
  v_artist artists%rowtype;
  v_service service_offerings%rowtype;
  v_client clients%rowtype;
  v_client_display_name text;
  v_clean_phone text;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_studio_id uuid;
  v_membership_id uuid;
  v_slot_ids uuid[];
  v_primary_slot_id uuid;
  v_has_gap boolean;
  v_coverage_end timestamptz;
  v_overlapping_slot_count integer;
  v_appointment appointments%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Auth session required';
  end if;

  if nullif(trim(p_client_first_name), '') is null then
    raise exception 'Client first name is required';
  end if;

  if nullif(trim(p_client_last_name), '') is null then
    raise exception 'Client last name is required';
  end if;

  if nullif(regexp_replace(coalesce(p_client_phone, ''), '\D', '', 'g'), '') is null then
    raise exception 'Client phone is required';
  end if;

  if p_service_offering_id is null then
    raise exception 'Service offering is required';
  end if;

  if p_date is null then
    raise exception 'Appointment date is required';
  end if;

  if p_time is null then
    raise exception 'Appointment time is required';
  end if;

  select *
  into v_profile
  from profiles
  where id = auth.uid()
    and status = 'active';

  if v_profile.id is null then
    raise exception 'Active profile required';
  end if;

  select *
  into v_artist
  from artists
  where profile_id = v_profile.id
    and status = 'active'
    and archived_at is null
  limit 1;

  if v_artist.id is null then
    raise exception 'Active artist required';
  end if;

  select *
  into v_service
  from service_offerings
  where id = p_service_offering_id
    and status = 'active'
    and archived_at is null;

  if v_service.id is null then
    raise exception 'Active service offering required';
  end if;

  if v_service.owner_type = 'artist' and v_service.artist_id <> v_artist.id then
    raise exception 'Service does not belong to the authenticated artist';
  end if;

  if v_service.owner_type = 'membership' and not exists (
    select 1
    from artist_studio_memberships membership
    where membership.id = v_service.membership_id
      and membership.artist_id = v_artist.id
      and membership.status = 'active'
      and membership.archived_at is null
  ) then
    raise exception 'Service membership does not belong to the authenticated artist';
  end if;

  if v_service.owner_type = 'studio' and not exists (
    select 1
    from artist_studio_memberships membership
    where membership.studio_id = v_service.studio_id
      and membership.artist_id = v_artist.id
      and membership.status = 'active'
      and membership.archived_at is null
  ) then
    raise exception 'Service studio does not belong to the authenticated artist';
  end if;

  v_clean_phone := regexp_replace(coalesce(p_client_phone, ''), '\D', '', 'g');
  v_client_display_name := concat_ws(' ', trim(p_client_first_name), trim(p_client_last_name));
  v_starts_at := ((p_date::text || ' ' || p_time::text)::timestamp at time zone 'America/Mexico_City');
  v_ends_at := v_starts_at + make_interval(mins => v_service.duration_minutes);

  if v_starts_at <= now() then
    raise exception 'Appointment time must be in the future';
  end if;

  if exists (
    select 1
    from appointments appointment
    where appointment.artist_id = v_artist.id
      and appointment.status in ('scheduled', 'disputed')
      and appointment.starts_at < v_ends_at
      and appointment.ends_at > v_starts_at
  ) then
    raise exception 'Artist already has an appointment at this time';
  end if;

  select *
  into v_client
  from clients
  where regexp_replace(coalesce(phone, ''), '\D', '', 'g') = v_clean_phone
    and status <> 'archived'
  order by created_at desc
  limit 1;

  if v_client.id is null then
    insert into clients (
      display_name,
      phone,
      status
    )
    values (
      v_client_display_name,
      p_client_phone,
      'active'
    )
    returning * into v_client;

    insert into client_profiles (client_id)
    values (v_client.id)
    on conflict (client_id) do nothing;
  else
    update clients
    set
      display_name = coalesce(nullif(v_client_display_name, ''), display_name),
      phone = coalesce(nullif(p_client_phone, ''), phone),
      status = 'active',
      updated_at = now()
    where id = v_client.id
    returning * into v_client;
  end if;

  v_studio_id := case
    when v_service.owner_type = 'studio' then v_service.studio_id
    when v_service.owner_type = 'membership' then (
      select membership.studio_id
      from artist_studio_memberships membership
      where membership.id = v_service.membership_id
      limit 1
    )
    else (
      select membership.studio_id
      from artist_studio_memberships membership
      where membership.artist_id = v_artist.id
        and membership.status = 'active'
        and membership.archived_at is null
      order by membership.created_at desc
      limit 1
    )
  end;

  v_membership_id := case
    when v_service.owner_type = 'membership' then v_service.membership_id
    else (
      select membership.id
      from artist_studio_memberships membership
      where membership.artist_id = v_artist.id
        and (v_studio_id is null or membership.studio_id = v_studio_id)
        and membership.status = 'active'
        and membership.archived_at is null
      order by membership.created_at desc
      limit 1
    )
  end;

  with overlapping_slots as (
    select *
    from availability_slots slot
    where slot.artist_id = v_artist.id
      and slot.starts_at < v_ends_at
      and slot.ends_at > v_starts_at
      and (v_studio_id is null or slot.studio_id is null or slot.studio_id = v_studio_id)
      and (v_membership_id is null or slot.membership_id is null or slot.membership_id = v_membership_id)
    order by slot.starts_at
    for update
  ),
  available_slots as (
    select *
    from overlapping_slots slot
    where slot.status = 'available'
      and slot.starts_at >= v_starts_at
      and slot.starts_at < v_ends_at
  ),
  ordered_slots as (
    select
      slot.id,
      slot.starts_at,
      slot.ends_at,
      lead(slot.starts_at) over (order by slot.starts_at) as next_start
    from available_slots slot
  )
  select
    count(*)::integer,
    array_agg(ordered_slots.id order by ordered_slots.starts_at),
    (array_agg(ordered_slots.id order by ordered_slots.starts_at) filter (where ordered_slots.starts_at = v_starts_at))[1],
    max(ordered_slots.ends_at),
    coalesce(bool_or(ordered_slots.next_start is not null and ordered_slots.next_start > ordered_slots.ends_at), false)
  into
    v_overlapping_slot_count,
    v_slot_ids,
    v_primary_slot_id,
    v_coverage_end,
    v_has_gap
  from ordered_slots;

  if exists (
    select 1
    from availability_slots slot
    where slot.artist_id = v_artist.id
      and slot.starts_at < v_ends_at
      and slot.ends_at > v_starts_at
      and slot.status in ('booked', 'held')
  ) then
    raise exception 'Selected time is not available';
  end if;

  if v_overlapping_slot_count > 0 and (
    v_primary_slot_id is null
    or v_coverage_end < v_ends_at
    or v_has_gap
  ) then
    raise exception 'Selected availability slots do not cover the service duration';
  end if;

  insert into appointments (
    client_id,
    artist_id,
    studio_id,
    membership_id,
    service_offering_id,
    availability_slot_id,
    starts_at,
    ends_at,
    status,
    booking_source,
    client_notes,
    created_by_profile_id
  )
  values (
    v_client.id,
    v_artist.id,
    v_studio_id,
    v_membership_id,
    v_service.id,
    v_primary_slot_id,
    v_starts_at,
    v_ends_at,
    'scheduled',
    'manual_artist_booking',
    nullif(trim(p_notes), ''),
    v_profile.id
  )
  returning * into v_appointment;

  insert into appointment_status_events (
    appointment_id,
    from_status,
    to_status,
    reason,
    changed_by_profile_id
  )
  values (
    v_appointment.id,
    null,
    'scheduled',
    'manual_artist_booking_created',
    v_profile.id
  );

  if v_slot_ids is not null and array_length(v_slot_ids, 1) > 0 then
    update availability_slots
    set
      status = 'booked',
      held_by_profile_id = null,
      held_until = null,
      updated_at = now()
    where id = any(v_slot_ids);
  end if;

  return jsonb_build_object(
    'appointment', jsonb_build_object(
      'id', v_appointment.id,
      'type', 'appointment',
      'clientId', v_appointment.client_id,
      'client_id', v_appointment.client_id,
      'artistId', v_appointment.artist_id,
      'artist_id', v_appointment.artist_id,
      'studioId', v_appointment.studio_id,
      'studio_id', v_appointment.studio_id,
      'membershipId', v_appointment.membership_id,
      'membership_id', v_appointment.membership_id,
      'serviceOfferingId', v_appointment.service_offering_id,
      'service_offering_id', v_appointment.service_offering_id,
      'availabilitySlotId', v_appointment.availability_slot_id,
      'availability_slot_id', v_appointment.availability_slot_id,
      'client', v_client.display_name,
      'artist', v_artist.display_name,
      'service', v_service.name,
      'date', to_char(v_appointment.starts_at at time zone 'America/Mexico_City', 'YYYY-MM-DD'),
      'time', to_char(v_appointment.starts_at at time zone 'America/Mexico_City', 'HH24:MI'),
      'end', to_char(v_appointment.ends_at at time zone 'America/Mexico_City', 'HH24:MI'),
      'startsAt', v_appointment.starts_at,
      'starts_at', v_appointment.starts_at,
      'endsAt', v_appointment.ends_at,
      'ends_at', v_appointment.ends_at,
      'durationMinutes', v_service.duration_minutes,
      'duration_minutes', v_service.duration_minutes,
      'duration', concat(v_service.duration_minutes, ' min'),
      'room', 'Agenda',
      'address', 'Agenda Studio Flow',
      'status', 'Confirmada',
      'appointmentStatus', v_appointment.status,
      'appointment_status', v_appointment.status,
      'bookingSource', v_appointment.booking_source,
      'booking_source', v_appointment.booking_source,
      'clientNotes', v_appointment.client_notes,
      'client_notes', v_appointment.client_notes
    )
  );
end;
$$;

revoke all on function public.studio_flow_artist_create_manual_appointment(text, text, text, uuid, date, time, text) from public;
grant execute on function public.studio_flow_artist_create_manual_appointment(text, text, text, uuid, date, time, text) to authenticated;
