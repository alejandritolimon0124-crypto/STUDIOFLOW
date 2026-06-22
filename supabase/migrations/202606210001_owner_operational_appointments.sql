create or replace function public.studio_flow_owner_create_manual_appointment(
  p_studio_id uuid,
  p_membership_id uuid,
  p_service_offering_id uuid,
  p_availability_slot_id uuid,
  p_client_id uuid default null,
  p_client_name text default null,
  p_client_phone text default null,
  p_client_email text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile profiles%rowtype;
  v_studio_id uuid;
  v_membership artist_studio_memberships%rowtype;
  v_service service_offerings%rowtype;
  v_primary_slot availability_slots%rowtype;
  v_client clients%rowtype;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
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

  v_studio_id := public.studio_flow_owner_assert_studio_access(p_studio_id);

  select *
  into v_profile
  from profiles
  where id = auth.uid()
    and status = 'active';

  if v_profile.id is null then
    raise exception 'Active profile required';
  end if;

  select *
  into v_membership
  from artist_studio_memberships
  where id = p_membership_id
    and studio_id = v_studio_id
    and status = 'active'
    and archived_at is null;

  if v_membership.id is null then
    raise exception 'Active studio membership required';
  end if;

  select *
  into v_service
  from service_offerings
  where id = p_service_offering_id
    and owner_type = 'membership'
    and membership_id = v_membership.id
    and status = 'active'
    and archived_at is null;

  if v_service.id is null then
    raise exception 'Active membership service required';
  end if;

  select *
  into v_primary_slot
  from availability_slots
  where id = p_availability_slot_id
    and membership_id = v_membership.id
    and studio_id = v_studio_id
    and status = 'available'
  for update;

  if v_primary_slot.id is null then
    raise exception 'Available slot required';
  end if;

  v_starts_at := v_primary_slot.starts_at;
  v_ends_at := v_starts_at + make_interval(mins => v_service.duration_minutes);

  if p_client_id is not null then
    select *
    into v_client
    from clients
    where id = p_client_id
      and status <> 'archived';
  elsif nullif(trim(coalesce(p_client_email, '')), '') is not null then
    select *
    into v_client
    from clients
    where lower(email) = lower(trim(p_client_email))
      and status <> 'archived'
    order by created_at desc
    limit 1;
  end if;

  if v_client.id is null then
    if nullif(trim(coalesce(p_client_name, '')), '') is null then
      raise exception 'Client name is required';
    end if;

    if nullif(regexp_replace(coalesce(p_client_phone, ''), '\D', '', 'g'), '') is null then
      raise exception 'Client phone is required';
    end if;

    insert into clients (display_name, email, phone)
    values (
      trim(p_client_name),
      nullif(trim(p_client_email), ''),
      nullif(trim(p_client_phone), '')
    )
    returning * into v_client;
  end if;

  if exists (
    select 1
    from appointments appointment
    where appointment.artist_id = v_membership.artist_id
      and appointment.status in ('scheduled', 'disputed')
      and appointment.starts_at < v_ends_at
      and appointment.ends_at > v_starts_at
  ) then
    raise exception 'Selected time is not available';
  end if;

  with overlapping_slots as (
    select *
    from availability_slots slot
    where slot.membership_id = v_membership.id
      and slot.starts_at < v_ends_at
      and slot.ends_at > v_starts_at
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

  if v_overlapping_slot_count = 0
    or v_primary_slot_id is null
    or v_coverage_end < v_ends_at
    or v_has_gap
  then
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
    v_membership.artist_id,
    v_studio_id,
    v_membership.id,
    v_service.id,
    v_primary_slot_id,
    v_starts_at,
    v_ends_at,
    'scheduled',
    'studio',
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
    'studio_owner_manual_created',
    v_profile.id
  );

  perform public.studio_flow_upsert_customer_relationship(
    v_appointment.client_id,
    'studio',
    null,
    v_appointment.studio_id,
    null,
    'appointment',
    'active',
    v_appointment.starts_at
  );

  perform public.studio_flow_upsert_customer_relationship(
    v_appointment.client_id,
    'membership',
    null,
    null,
    v_appointment.membership_id,
    'appointment',
    'active',
    v_appointment.starts_at
  );

  update availability_slots
  set
    status = 'booked',
    held_by_profile_id = null,
    held_until = null,
    updated_at = now()
  where id = any(v_slot_ids);

  return jsonb_build_object(
    'appointment', jsonb_build_object(
      'id', v_appointment.id,
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
      'startsAt', v_appointment.starts_at,
      'starts_at', v_appointment.starts_at,
      'endsAt', v_appointment.ends_at,
      'ends_at', v_appointment.ends_at,
      'date', to_char(v_appointment.starts_at at time zone 'America/Mexico_City', 'YYYY-MM-DD'),
      'time', to_char(v_appointment.starts_at at time zone 'America/Mexico_City', 'HH24:MI'),
      'end', to_char(v_appointment.ends_at at time zone 'America/Mexico_City', 'HH24:MI'),
      'status', 'Confirmada',
      'appointmentStatus', v_appointment.status,
      'appointment_status', v_appointment.status,
      'bookingSource', v_appointment.booking_source,
      'booking_source', v_appointment.booking_source
    ),
    'client', jsonb_build_object(
      'id', v_client.id,
      'name', v_client.display_name,
      'email', v_client.email,
      'phone', v_client.phone,
      'status', v_client.status
    )
  );
end;
$$;

revoke all on function public.studio_flow_owner_create_manual_appointment(uuid, uuid, uuid, uuid, uuid, text, text, text, text) from public;
grant execute on function public.studio_flow_owner_create_manual_appointment(uuid, uuid, uuid, uuid, uuid, text, text, text, text) to authenticated;
