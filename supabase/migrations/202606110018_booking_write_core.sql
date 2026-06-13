create or replace function public.studio_flow_marketplace_book_appointment(
  p_availability_slot_ids uuid[],
  p_service_offering_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile profiles%rowtype;
  v_client clients%rowtype;
  v_service service_offerings%rowtype;
  v_listing marketplace_listings%rowtype;
  v_profile_listing marketplace_profiles%rowtype;
  v_membership artist_studio_memberships%rowtype;
  v_artist_id uuid;
  v_studio_id uuid;
  v_membership_id uuid;
  v_slot_ids uuid[];
  v_slot_count integer;
  v_expected_slot_count integer;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_has_gap boolean;
  v_appointment appointments%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Auth session required';
  end if;

  if p_availability_slot_ids is null or array_length(p_availability_slot_ids, 1) is null then
    raise exception 'At least one availability slot is required';
  end if;

  if p_service_offering_id is null then
    raise exception 'Service offering is required';
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
  into v_client
  from clients
  where profile_id = v_profile.id
    and status = 'active'
    and archived_at is null
  limit 1;

  if v_client.id is null then
    raise exception 'Active client required';
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

  select array_agg(distinct slot_id order by slot_id)
  into v_slot_ids
  from unnest(p_availability_slot_ids) as slot_id
  where slot_id is not null;

  v_expected_slot_count := coalesce(array_length(v_slot_ids, 1), 0);

  if v_expected_slot_count = 0 then
    raise exception 'At least one valid availability slot is required';
  end if;

  with locked_slots as (
    select *
    from availability_slots
    where id = any(v_slot_ids)
    order by starts_at
    for update
  )
  select
    count(*)::integer,
    min(starts_at),
    max(ends_at),
    min(artist_id),
    min(studio_id),
    min(membership_id)
  into
    v_slot_count,
    v_starts_at,
    v_ends_at,
    v_artist_id,
    v_studio_id,
    v_membership_id
  from locked_slots
  where status = 'available'
    and starts_at >= now();

  if v_slot_count <> v_expected_slot_count then
    raise exception 'One or more slots are no longer available';
  end if;

  if exists (
    select 1
    from availability_slots slot
    where slot.id = any(v_slot_ids)
      and (
        slot.status <> 'available'
        or slot.starts_at < now()
        or slot.artist_id is distinct from v_artist_id
        or slot.studio_id is distinct from v_studio_id
        or slot.membership_id is distinct from v_membership_id
      )
  ) then
    raise exception 'Slots do not belong to the same available booking target';
  end if;

  select coalesce(bool_or(ordered.next_start is not null and ordered.next_start > ordered.ends_at), false)
  into v_has_gap
  from (
    select
      slot.starts_at,
      slot.ends_at,
      lead(slot.starts_at) over (order by slot.starts_at) as next_start
    from availability_slots slot
    where slot.id = any(v_slot_ids)
  ) ordered;

  if v_has_gap then
    raise exception 'Selected slots are not contiguous';
  end if;

  if v_artist_id is null then
    raise exception 'Availability slot has no artist target';
  end if;

  if not exists (
    select 1
    from artists artist
    where artist.id = v_artist_id
      and artist.status = 'active'
      and artist.archived_at is null
  ) then
    raise exception 'Artist is not active';
  end if;

  if v_studio_id is not null and exists (
    select 1
    from studios studio
    where studio.id = v_studio_id
      and (studio.archived_at is not null or studio.studio_status = 'suspended')
  ) then
    raise exception 'Studio is not available';
  end if;

  if not (
    (v_service.owner_type = 'artist' and v_service.artist_id = v_artist_id)
    or (v_service.owner_type = 'studio' and v_service.studio_id = v_studio_id)
    or (v_service.owner_type = 'membership' and v_service.membership_id = v_membership_id)
  ) then
    raise exception 'Service does not belong to this availability target';
  end if;

  if v_ends_at < v_starts_at + make_interval(mins => v_service.duration_minutes) then
    raise exception 'Selected slots do not cover the service duration';
  end if;

  select ml.*
  into v_listing
  from marketplace_listings ml
  join marketplace_profiles mp on mp.id = ml.marketplace_profile_id
  left join artist_studio_memberships asm on asm.id = coalesce(ml.membership_id, mp.membership_id)
  where ml.visibility_status = 'visible'
    and mp.visibility_status = 'visible'
    and (ml.expires_at is null or ml.expires_at > now())
    and coalesce(ml.artist_id, mp.artist_id, asm.artist_id) = v_artist_id
    and (
      v_studio_id is null
      or coalesce(ml.studio_id, mp.studio_id, asm.studio_id) is null
      or coalesce(ml.studio_id, mp.studio_id, asm.studio_id) = v_studio_id
    )
    and (
      v_membership_id is null
      or coalesce(ml.membership_id, mp.membership_id, asm.id) is null
      or coalesce(ml.membership_id, mp.membership_id, asm.id) = v_membership_id
    )
  order by ml.generated_at desc
  limit 1;

  if v_listing.id is null then
    raise exception 'Visible marketplace listing required';
  end if;

  select *
  into v_profile_listing
  from marketplace_profiles
  where id = v_listing.marketplace_profile_id
    and visibility_status = 'visible';

  if coalesce(v_listing.membership_id, v_profile_listing.membership_id) is not null then
    select *
    into v_membership
    from artist_studio_memberships
    where id = coalesce(v_listing.membership_id, v_profile_listing.membership_id)
      and status = 'active'
      and archived_at is null;

    if v_membership.id is null then
      raise exception 'Active marketplace membership required';
    end if;
  end if;

  insert into appointments (
    client_id,
    artist_id,
    studio_id,
    membership_id,
    service_offering_id,
    availability_slot_id,
    marketplace_listing_id,
    starts_at,
    ends_at,
    status,
    booking_source,
    client_notes,
    created_by_profile_id
  )
  values (
    v_client.id,
    v_artist_id,
    v_studio_id,
    v_membership_id,
    v_service.id,
    v_slot_ids[1],
    v_listing.id,
    v_starts_at,
    v_ends_at,
    'scheduled',
    'marketplace',
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
    'marketplace_booking_created',
    v_profile.id
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
      'marketplaceListingId', v_appointment.marketplace_listing_id,
      'marketplace_listing_id', v_appointment.marketplace_listing_id,
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
      'booking_source', v_appointment.booking_source,
      'clientNotes', v_appointment.client_notes,
      'client_notes', v_appointment.client_notes
    ),
    'service', jsonb_build_object(
      'id', v_service.id,
      'name', v_service.name,
      'durationMinutes', v_service.duration_minutes,
      'duration_minutes', v_service.duration_minutes,
      'priceAmount', v_service.price_amount,
      'price_amount', v_service.price_amount
    ),
    'artist', jsonb_build_object(
      'id', v_artist_id
    ),
    'starts_at', v_appointment.starts_at,
    'startsAt', v_appointment.starts_at,
    'ends_at', v_appointment.ends_at,
    'endsAt', v_appointment.ends_at,
    'status', v_appointment.status
  );
end;
$$;

revoke all on function public.studio_flow_marketplace_book_appointment(uuid[], uuid, text) from public;
grant execute on function public.studio_flow_marketplace_book_appointment(uuid[], uuid, text) to authenticated;
