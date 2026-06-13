create or replace function public.studio_flow_marketplace_get_availability(
  p_listing_id uuid,
  p_service_offering_id uuid default null,
  p_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_listing marketplace_listings%rowtype;
  v_profile marketplace_profiles%rowtype;
  v_membership artist_studio_memberships%rowtype;
  v_artist_id uuid;
  v_studio_id uuid;
  v_membership_id uuid;
  v_service service_offerings%rowtype;
  v_service_duration integer := 60;
  v_requested_date date;
  v_search_start_date date;
  v_search_end_date date;
  v_result_date date;
  v_slots jsonb;
begin
  if auth.uid() is null then
    raise exception 'Auth session required';
  end if;

  if p_listing_id is null then
    raise exception 'Listing id required';
  end if;

  select *
  into v_listing
  from marketplace_listings
  where id = p_listing_id
    and visibility_status = 'visible'
    and (expires_at is null or expires_at > now());

  if v_listing.id is null then
    raise exception 'Visible listing not found';
  end if;

  select *
  into v_profile
  from marketplace_profiles
  where id = v_listing.marketplace_profile_id
    and visibility_status = 'visible';

  if v_profile.id is null then
    raise exception 'Visible marketplace profile not found';
  end if;

  if coalesce(v_listing.membership_id, v_profile.membership_id) is not null then
    select *
    into v_membership
    from artist_studio_memberships
    where id = coalesce(v_listing.membership_id, v_profile.membership_id)
      and status = 'active'
      and archived_at is null;
  end if;

  v_artist_id := coalesce(v_listing.artist_id, v_profile.artist_id, v_membership.artist_id);
  v_studio_id := coalesce(v_listing.studio_id, v_profile.studio_id, v_membership.studio_id);
  v_membership_id := coalesce(v_listing.membership_id, v_profile.membership_id, v_membership.id);

  if v_artist_id is null then
    raise exception 'Listing has no artist target';
  end if;

  if not exists (
    select 1
    from artists a
    where a.id = v_artist_id
      and a.status = 'active'
  ) then
    raise exception 'Artist is not active';
  end if;

  if v_studio_id is not null and exists (
    select 1
    from studios s
    where s.id = v_studio_id
      and (s.archived_at is not null or s.studio_status = 'suspended')
  ) then
    raise exception 'Studio is not available for marketplace';
  end if;

  if p_service_offering_id is not null then
    select *
    into v_service
    from service_offerings
    where id = p_service_offering_id
      and status = 'active'
      and archived_at is null;

    if v_service.id is null then
      raise exception 'Active service offering not found';
    end if;

    if not (
      (v_service.owner_type = 'artist' and v_service.artist_id = v_artist_id)
      or (v_service.owner_type = 'studio' and v_service.studio_id = v_studio_id)
      or (v_service.owner_type = 'membership' and v_service.membership_id = v_membership_id)
    ) then
      raise exception 'Service offering does not belong to this listing';
    end if;

    v_service_duration := v_service.duration_minutes;
  end if;

  v_requested_date := greatest(
    coalesce(p_date, (now() at time zone 'America/Mexico_City')::date),
    (now() at time zone 'America/Mexico_City')::date
  );
  v_search_start_date := v_requested_date;
  v_search_end_date := v_search_start_date + 14;

  with candidate_pool as (
    select
      slot.id,
      slot.artist_id,
      slot.studio_id,
      slot.membership_id,
      slot.starts_at,
      slot.starts_at + make_interval(mins => v_service_duration) as candidate_end,
      (slot.starts_at at time zone 'America/Mexico_City')::date as candidate_date
    from availability_slots slot
    where slot.status = 'available'
      and slot.starts_at >= now()
      and (slot.starts_at at time zone 'America/Mexico_City')::date between v_search_start_date and v_search_end_date
      and (
        slot.artist_id = v_artist_id
        or (v_membership_id is not null and slot.membership_id = v_membership_id)
      )
      and (v_studio_id is null or slot.studio_id is null or slot.studio_id = v_studio_id)
  ),
  evaluated_candidates as (
    select
      candidate.*,
      coverage.coverage_end,
      coverage.has_gap
    from candidate_pool candidate
    cross join lateral (
      select
        max(ordered.ends_at) as coverage_end,
        coalesce(bool_or(ordered.next_start is not null and ordered.next_start > ordered.ends_at), false) as has_gap
      from (
        select
          covered.starts_at,
          covered.ends_at,
          lead(covered.starts_at) over (order by covered.starts_at) as next_start
        from availability_slots covered
        where covered.status = 'available'
          and covered.starts_at >= candidate.starts_at
          and covered.starts_at < candidate.candidate_end
          and (
            covered.artist_id = v_artist_id
            or (v_membership_id is not null and covered.membership_id = v_membership_id)
          )
          and (v_studio_id is null or covered.studio_id is null or covered.studio_id = v_studio_id)
        order by covered.starts_at
      ) ordered
    ) coverage
    where coverage.coverage_end >= candidate.candidate_end
      and not coverage.has_gap
  )
  select coalesce(
    min(candidate_date) filter (where candidate_date = v_requested_date),
    min(candidate_date)
  )
  into v_result_date
  from evaluated_candidates;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', candidate.id,
        'availabilitySlotId', candidate.id,
        'availability_slot_id', candidate.id,
        'availabilitySlotIds', coverage.availability_slot_ids,
        'availability_slot_ids', coverage.availability_slot_ids,
        'listingId', v_listing.id,
        'listing_id', v_listing.id,
        'artistId', candidate.artist_id,
        'artist_id', candidate.artist_id,
        'studioId', candidate.studio_id,
        'studio_id', candidate.studio_id,
        'membershipId', candidate.membership_id,
        'membership_id', candidate.membership_id,
        'serviceOfferingId', p_service_offering_id,
        'service_offering_id', p_service_offering_id,
        'start', candidate.starts_at,
        'startsAt', candidate.starts_at,
        'starts_at', candidate.starts_at,
        'endAt', candidate.candidate_end,
        'endsAt', candidate.candidate_end,
        'ends_at', candidate.candidate_end,
        'date', to_char(candidate.starts_at at time zone 'America/Mexico_City', 'YYYY-MM-DD'),
        'time', to_char(candidate.starts_at at time zone 'America/Mexico_City', 'HH24:MI'),
        'end', to_char(candidate.candidate_end at time zone 'America/Mexico_City', 'HH24:MI'),
        'durationMinutes', v_service_duration,
        'duration_minutes', v_service_duration,
        'available', true,
        'status', 'available'
      )
      order by candidate.starts_at
    ),
    '[]'::jsonb
  )
  into v_slots
  from (
    select
      slot.id,
      slot.artist_id,
      slot.studio_id,
      slot.membership_id,
      slot.starts_at,
      slot.starts_at + make_interval(mins => v_service_duration) as candidate_end
    from availability_slots slot
    where slot.status = 'available'
      and slot.starts_at >= now()
      and (slot.starts_at at time zone 'America/Mexico_City')::date = v_result_date
      and (
        slot.artist_id = v_artist_id
        or (v_membership_id is not null and slot.membership_id = v_membership_id)
      )
      and (v_studio_id is null or slot.studio_id is null or slot.studio_id = v_studio_id)
  ) candidate
  cross join lateral (
    select
      coalesce(jsonb_agg(ordered.id order by ordered.starts_at), '[]'::jsonb) as availability_slot_ids,
      max(ordered.ends_at) as coverage_end,
      coalesce(bool_or(ordered.next_start is not null and ordered.next_start > ordered.ends_at), false) as has_gap
    from (
      select
        covered.id,
        covered.starts_at,
        covered.ends_at,
        lead(covered.starts_at) over (order by covered.starts_at) as next_start
      from availability_slots covered
      where covered.status = 'available'
        and covered.starts_at >= candidate.starts_at
        and covered.starts_at < candidate.candidate_end
        and (
          covered.artist_id = v_artist_id
          or (v_membership_id is not null and covered.membership_id = v_membership_id)
        )
        and (v_studio_id is null or covered.studio_id is null or covered.studio_id = v_studio_id)
      order by covered.starts_at
    ) ordered
  ) coverage
  where coverage.coverage_end >= candidate.candidate_end
    and not coverage.has_gap;

  return jsonb_build_object(
    'listingId', v_listing.id,
    'listing_id', v_listing.id,
    'artistId', v_artist_id,
    'artist_id', v_artist_id,
    'studioId', v_studio_id,
    'studio_id', v_studio_id,
    'membershipId', v_membership_id,
    'membership_id', v_membership_id,
    'serviceOfferingId', p_service_offering_id,
    'service_offering_id', p_service_offering_id,
    'date', coalesce(v_result_date, v_requested_date),
    'requestedDate', p_date,
    'requested_date', p_date,
    'durationMinutes', v_service_duration,
    'duration_minutes', v_service_duration,
    'slots', v_slots
  );
end;
$$;

revoke all on function public.studio_flow_marketplace_get_availability(uuid, uuid, date) from public;
grant execute on function public.studio_flow_marketplace_get_availability(uuid, uuid, date) to authenticated;
