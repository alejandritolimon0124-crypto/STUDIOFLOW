CREATE OR REPLACE FUNCTION public.studio_flow_marketplace_get_availability(p_listing_id uuid, p_service_offering_id uuid DEFAULT NULL::uuid, p_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
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

  if v_artist_id is null and v_studio_id is null then
    raise exception 'Listing has no artist target';
  end if;

  if v_artist_id is not null and not exists (
    select 1
    from artists artist
    where artist.id = v_artist_id
      and artist.status = 'active'
  ) then
    raise exception 'Artist is not active';
  end if;

  if v_studio_id is not null and exists (
    select 1
    from studios studio
    where studio.id = v_studio_id
      and (studio.archived_at is not null or studio.studio_status = 'suspended')
  ) then
    raise exception 'Studio is not available for marketplace';
  end if;

  if p_service_offering_id is not null then
    select *
    into v_service
    from service_offerings service
    where service.id = p_service_offering_id
      and service.status = 'active'
      and service.archived_at is null;

    if v_service.id is null then
      raise exception 'Active service offering not found';
    end if;

    if v_studio_id is not null and v_membership_id is null and v_service.owner_type = 'membership' then
      select * into v_membership
      from artist_studio_memberships
      where id = v_service.membership_id
        and studio_id = v_studio_id
        and status = 'active' and archived_at is null
        and (v_artist_id is null or artist_id = v_artist_id);
      if v_membership.id is null then
        raise exception 'Service offering does not belong to this studio';
      end if;
      v_membership_id := v_membership.id;
      v_artist_id := v_membership.artist_id;
    end if;

    if not coalesce((
      (v_service.owner_type = 'artist' and v_service.artist_id = v_artist_id and v_studio_id is null and v_membership_id is null)
      or (v_service.owner_type = 'studio' and v_service.studio_id = v_studio_id)
      or (v_service.owner_type = 'membership' and v_service.membership_id = v_membership_id)
    ), false) then
      raise exception 'Service offering does not belong to this listing';
    end if;

    v_service_duration := v_service.duration_minutes;
  end if;

  v_requested_date := greatest(
    coalesce(p_date, (now() at time zone 'America/Mexico_City')::date),
    (now() at time zone 'America/Mexico_City')::date
  );
  v_search_start_date := v_requested_date;
  v_search_end_date := v_search_start_date;

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
      and exists (select 1 from artists a where a.id = slot.artist_id and a.status = 'active')
      and (v_studio_id is null or exists (
        select 1 from artist_studio_memberships m
        where m.id = slot.membership_id and m.artist_id = slot.artist_id
          and m.studio_id = v_studio_id and m.status = 'active' and m.archived_at is null
      ))
      and slot.starts_at >= now()
      and (slot.starts_at at time zone 'America/Mexico_City')::date between v_search_start_date and v_search_end_date
      and (
        (v_membership_id is not null and slot.membership_id = v_membership_id)
        or (
          v_membership_id is null
          and v_studio_id is not null
          and (v_artist_id is null or slot.artist_id = v_artist_id)
          and slot.studio_id = v_studio_id
        )
        or (
          v_membership_id is null
          and v_studio_id is null
          and slot.artist_id = v_artist_id
          and slot.studio_id is null
          and slot.membership_id is null
        )
      )
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
          and covered.artist_id is not distinct from candidate.artist_id
          and covered.studio_id is not distinct from candidate.studio_id
          and covered.membership_id is not distinct from candidate.membership_id
        order by covered.starts_at
      ) ordered
    ) coverage
    where coverage.coverage_end >= candidate.candidate_end
      and not coverage.has_gap
  )
  select min(candidate_date) filter (where candidate_date = v_requested_date)
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
        'isHappyHour', exists (
          select 1
          from promotions promo
          where promo.promotion_type = 'happy_hour'
            and promo.status = 'active'
            and (promo.starts_at is null or promo.starts_at <= candidate.starts_at)
            and (promo.ends_at is null or promo.ends_at > candidate.starts_at)
            and (
              (promo.scope_type = 'artist' and promo.artist_id = candidate.artist_id)
              or (promo.scope_type = 'studio' and promo.studio_id = candidate.studio_id)
            )
            and (
              jsonb_typeof(coalesce(promo.rules -> 'weekdays', promo.rules -> 'weekDays', promo.rules -> 'week_days', '[]'::jsonb)) <> 'array'
              or jsonb_array_length(coalesce(promo.rules -> 'weekdays', promo.rules -> 'weekDays', promo.rules -> 'week_days', '[]'::jsonb)) = 0
              or exists (
                select 1
                from jsonb_array_elements_text(coalesce(promo.rules -> 'weekdays', promo.rules -> 'weekDays', promo.rules -> 'week_days', '[]'::jsonb)) happy_hour_weekday(value)
                where happy_hour_weekday.value::integer = extract(dow from candidate.starts_at at time zone 'America/Mexico_City')::integer
              )
            )
            and coalesce(nullif(coalesce(promo.rules ->> 'startTime', promo.rules ->> 'start_time'), ''), '00:00')::time <= (candidate.starts_at at time zone 'America/Mexico_City')::time
            and coalesce(nullif(coalesce(promo.rules ->> 'endTime', promo.rules ->> 'end_time'), ''), '23:59')::time >= (candidate.candidate_end at time zone 'America/Mexico_City')::time
        ),
        'happyHourDiscountPercent', coalesce((
          select coalesce((promo.rules ->> 'discountPercent')::integer, (promo.rules ->> 'discount_percent')::integer, 0)
          from promotions promo
          where promo.promotion_type = 'happy_hour'
            and promo.status = 'active'
            and (promo.starts_at is null or promo.starts_at <= candidate.starts_at)
            and (promo.ends_at is null or promo.ends_at > candidate.starts_at)
            and (
              (promo.scope_type = 'artist' and promo.artist_id = candidate.artist_id)
              or (promo.scope_type = 'studio' and promo.studio_id = candidate.studio_id)
            )
            and (
              jsonb_typeof(coalesce(promo.rules -> 'weekdays', promo.rules -> 'weekDays', promo.rules -> 'week_days', '[]'::jsonb)) <> 'array'
              or jsonb_array_length(coalesce(promo.rules -> 'weekdays', promo.rules -> 'weekDays', promo.rules -> 'week_days', '[]'::jsonb)) = 0
              or exists (
                select 1
                from jsonb_array_elements_text(coalesce(promo.rules -> 'weekdays', promo.rules -> 'weekDays', promo.rules -> 'week_days', '[]'::jsonb)) happy_hour_weekday(value)
                where happy_hour_weekday.value::integer = extract(dow from candidate.starts_at at time zone 'America/Mexico_City')::integer
              )
            )
            and coalesce(nullif(coalesce(promo.rules ->> 'startTime', promo.rules ->> 'start_time'), ''), '00:00')::time <= (candidate.starts_at at time zone 'America/Mexico_City')::time
            and coalesce(nullif(coalesce(promo.rules ->> 'endTime', promo.rules ->> 'end_time'), ''), '23:59')::time >= (candidate.candidate_end at time zone 'America/Mexico_City')::time
          order by promo.updated_at desc
          limit 1
        ), 0),
        'happy_hour_discount_percent', coalesce((
          select coalesce((promo.rules ->> 'discountPercent')::integer, (promo.rules ->> 'discount_percent')::integer, 0)
          from promotions promo
          where promo.promotion_type = 'happy_hour'
            and promo.status = 'active'
            and (promo.starts_at is null or promo.starts_at <= candidate.starts_at)
            and (promo.ends_at is null or promo.ends_at > candidate.starts_at)
            and (
              (promo.scope_type = 'artist' and promo.artist_id = candidate.artist_id)
              or (promo.scope_type = 'studio' and promo.studio_id = candidate.studio_id)
            )
            and (
              jsonb_typeof(coalesce(promo.rules -> 'weekdays', promo.rules -> 'weekDays', promo.rules -> 'week_days', '[]'::jsonb)) <> 'array'
              or jsonb_array_length(coalesce(promo.rules -> 'weekdays', promo.rules -> 'weekDays', promo.rules -> 'week_days', '[]'::jsonb)) = 0
              or exists (
                select 1
                from jsonb_array_elements_text(coalesce(promo.rules -> 'weekdays', promo.rules -> 'weekDays', promo.rules -> 'week_days', '[]'::jsonb)) happy_hour_weekday(value)
                where happy_hour_weekday.value::integer = extract(dow from candidate.starts_at at time zone 'America/Mexico_City')::integer
              )
            )
            and coalesce(nullif(coalesce(promo.rules ->> 'startTime', promo.rules ->> 'start_time'), ''), '00:00')::time <= (candidate.starts_at at time zone 'America/Mexico_City')::time
            and coalesce(nullif(coalesce(promo.rules ->> 'endTime', promo.rules ->> 'end_time'), ''), '23:59')::time >= (candidate.candidate_end at time zone 'America/Mexico_City')::time
          order by promo.updated_at desc
          limit 1
        ), 0),
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
      and exists (select 1 from artists a where a.id = slot.artist_id and a.status = 'active')
      and (v_studio_id is null or exists (
        select 1 from artist_studio_memberships m
        where m.id = slot.membership_id and m.artist_id = slot.artist_id
          and m.studio_id = v_studio_id and m.status = 'active' and m.archived_at is null
      ))
      and slot.starts_at >= now()
      and (slot.starts_at at time zone 'America/Mexico_City')::date = v_result_date
      and (
        (v_membership_id is not null and slot.membership_id = v_membership_id)
        or (
          v_membership_id is null
          and v_studio_id is not null
          and (v_artist_id is null or slot.artist_id = v_artist_id)
          and slot.studio_id = v_studio_id
        )
        or (
          v_membership_id is null
          and v_studio_id is null
          and slot.artist_id = v_artist_id
          and slot.studio_id is null
          and slot.membership_id is null
        )
      )
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
        and covered.artist_id is not distinct from candidate.artist_id
        and covered.studio_id is not distinct from candidate.studio_id
        and covered.membership_id is not distinct from candidate.membership_id
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
$function$;
