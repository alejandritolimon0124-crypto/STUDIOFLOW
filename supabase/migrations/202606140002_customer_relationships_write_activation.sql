create or replace function public.studio_flow_upsert_customer_relationship(
  p_client_id uuid,
  p_scope_type customer_scope_type,
  p_artist_id uuid default null,
  p_studio_id uuid default null,
  p_membership_id uuid default null,
  p_relationship_type relationship_type default 'appointment',
  p_status relationship_status default 'active',
  p_last_interaction_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_relationship customer_relationships%rowtype;
  v_last_interaction_at timestamptz := coalesce(p_last_interaction_at, now());
begin
  if p_client_id is null then
    raise exception 'Client is required';
  end if;

  if p_scope_type is null then
    raise exception 'Relationship scope is required';
  end if;

  if p_relationship_type is null then
    raise exception 'Relationship type is required';
  end if;

  if p_status is null then
    raise exception 'Relationship status is required';
  end if;

  if p_scope_type = 'artist' and not (
    p_artist_id is not null and p_studio_id is null and p_membership_id is null
  ) then
    raise exception 'Artist relationship requires only artist_id';
  end if;

  if p_scope_type = 'studio' and not (
    p_studio_id is not null and p_artist_id is null and p_membership_id is null
  ) then
    raise exception 'Studio relationship requires only studio_id';
  end if;

  if p_scope_type = 'membership' and not (
    p_membership_id is not null and p_artist_id is null and p_studio_id is null
  ) then
    raise exception 'Membership relationship requires only membership_id';
  end if;

  if p_status <> 'active' then
    if p_scope_type = 'artist' then
      update customer_relationships
      set
        status = p_status,
        last_interaction_at = greatest(
          coalesce(last_interaction_at, '-infinity'::timestamptz),
          v_last_interaction_at
        ),
        updated_at = now()
      where client_id = p_client_id
        and scope_type = 'artist'
        and artist_id = p_artist_id
        and relationship_type = p_relationship_type
        and status = 'active'
      returning * into v_relationship;
    elsif p_scope_type = 'studio' then
      update customer_relationships
      set
        status = p_status,
        last_interaction_at = greatest(
          coalesce(last_interaction_at, '-infinity'::timestamptz),
          v_last_interaction_at
        ),
        updated_at = now()
      where client_id = p_client_id
        and scope_type = 'studio'
        and studio_id = p_studio_id
        and relationship_type = p_relationship_type
        and status = 'active'
      returning * into v_relationship;
    else
      update customer_relationships
      set
        status = p_status,
        last_interaction_at = greatest(
          coalesce(last_interaction_at, '-infinity'::timestamptz),
          v_last_interaction_at
        ),
        updated_at = now()
      where client_id = p_client_id
        and scope_type = 'membership'
        and membership_id = p_membership_id
        and relationship_type = p_relationship_type
        and status = 'active'
      returning * into v_relationship;
    end if;

    if v_relationship.id is not null then
      return v_relationship.id;
    end if;
  end if;

  if p_scope_type = 'artist' then
    insert into customer_relationships (
      client_id,
      scope_type,
      artist_id,
      relationship_type,
      status,
      last_interaction_at
    )
    values (
      p_client_id,
      'artist',
      p_artist_id,
      p_relationship_type,
      p_status,
      v_last_interaction_at
    )
    on conflict (client_id, artist_id, relationship_type)
    where scope_type = 'artist' and status = 'active'
    do update
    set
      status = 'active',
      last_interaction_at = greatest(
        coalesce(customer_relationships.last_interaction_at, '-infinity'::timestamptz),
        excluded.last_interaction_at
      ),
      updated_at = now()
    returning * into v_relationship;
  elsif p_scope_type = 'studio' then
    insert into customer_relationships (
      client_id,
      scope_type,
      studio_id,
      relationship_type,
      status,
      last_interaction_at
    )
    values (
      p_client_id,
      'studio',
      p_studio_id,
      p_relationship_type,
      p_status,
      v_last_interaction_at
    )
    on conflict (client_id, studio_id, relationship_type)
    where scope_type = 'studio' and status = 'active'
    do update
    set
      status = 'active',
      last_interaction_at = greatest(
        coalesce(customer_relationships.last_interaction_at, '-infinity'::timestamptz),
        excluded.last_interaction_at
      ),
      updated_at = now()
    returning * into v_relationship;
  else
    insert into customer_relationships (
      client_id,
      scope_type,
      membership_id,
      relationship_type,
      status,
      last_interaction_at
    )
    values (
      p_client_id,
      'membership',
      p_membership_id,
      p_relationship_type,
      p_status,
      v_last_interaction_at
    )
    on conflict (client_id, membership_id, relationship_type)
    where scope_type = 'membership' and status = 'active'
    do update
    set
      status = 'active',
      last_interaction_at = greatest(
        coalesce(customer_relationships.last_interaction_at, '-infinity'::timestamptz),
        excluded.last_interaction_at
      ),
      updated_at = now()
    returning * into v_relationship;
  end if;

  return v_relationship.id;
end;
$$;

revoke all on function public.studio_flow_upsert_customer_relationship(
  uuid,
  customer_scope_type,
  uuid,
  uuid,
  uuid,
  relationship_type,
  relationship_status,
  timestamptz
) from public;
revoke all on function public.studio_flow_upsert_customer_relationship(
  uuid,
  customer_scope_type,
  uuid,
  uuid,
  uuid,
  relationship_type,
  relationship_status,
  timestamptz
) from anon;
revoke all on function public.studio_flow_upsert_customer_relationship(
  uuid,
  customer_scope_type,
  uuid,
  uuid,
  uuid,
  relationship_type,
  relationship_status,
  timestamptz
) from authenticated;

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
  ),
  available_locked_slots as (
    select *
    from locked_slots
    where status = 'available'
      and starts_at >= now()
  ),
  slot_summary as (
    select
      count(*)::integer as slot_count,
      min(starts_at) as starts_at,
      max(ends_at) as ends_at
    from available_locked_slots
  ),
  target_slot as (
    select
      artist_id,
      studio_id,
      membership_id
    from available_locked_slots
    order by starts_at, id
    limit 1
  )
  select
    slot_summary.slot_count,
    slot_summary.starts_at,
    slot_summary.ends_at,
    target_slot.artist_id,
    target_slot.studio_id,
    target_slot.membership_id
  into
    v_slot_count,
    v_starts_at,
    v_ends_at,
    v_artist_id,
    v_studio_id,
    v_membership_id
  from slot_summary
  left join target_slot on true;

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

  if v_appointment.studio_id is null then
    perform public.studio_flow_upsert_customer_relationship(
      v_appointment.client_id,
      'artist',
      v_appointment.artist_id,
      null,
      null,
      'appointment',
      'active',
      v_appointment.starts_at
    );
  else
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

    if v_appointment.membership_id is not null then
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
    end if;
  end if;

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

  if v_appointment.studio_id is null then
    perform public.studio_flow_upsert_customer_relationship(
      v_appointment.client_id,
      'artist',
      v_appointment.artist_id,
      null,
      null,
      'appointment',
      'active',
      v_appointment.starts_at
    );
  else
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

    if v_appointment.membership_id is not null then
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
    end if;
  end if;

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
