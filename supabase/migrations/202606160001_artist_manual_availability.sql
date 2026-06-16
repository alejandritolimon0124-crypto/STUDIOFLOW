create or replace function public.studio_flow_artist_get_manual_availability(
  p_service_offering_id uuid,
  p_date date
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
  v_studio_id uuid;
  v_membership_id uuid;
  v_requested_date date;
  v_slots jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Auth session required';
  end if;

  if p_service_offering_id is null then
    raise exception 'Service offering is required';
  end if;

  if p_date is null then
    raise exception 'Appointment date is required';
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

  v_requested_date := greatest(
    p_date,
    (now() at time zone 'America/Mexico_City')::date
  );

  with candidates as (
    select
      slot.id,
      slot.schedule_id,
      slot.artist_id,
      slot.studio_id,
      slot.membership_id,
      slot.starts_at,
      slot.starts_at + make_interval(mins => v_service.duration_minutes) as candidate_end
    from availability_slots slot
    where slot.status = 'available'
      and slot.artist_id = v_artist.id
      and slot.starts_at >= now()
      and (slot.starts_at at time zone 'America/Mexico_City')::date = v_requested_date
      and (v_studio_id is null or slot.studio_id is null or slot.studio_id = v_studio_id)
      and (v_membership_id is null or slot.membership_id is null or slot.membership_id = v_membership_id)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', candidate.id,
        'availabilitySlotId', candidate.id,
        'availability_slot_id', candidate.id,
        'availabilitySlotIds', coverage.availability_slot_ids,
        'availability_slot_ids', coverage.availability_slot_ids,
        'artistId', candidate.artist_id,
        'artist_id', candidate.artist_id,
        'studioId', candidate.studio_id,
        'studio_id', candidate.studio_id,
        'membershipId', candidate.membership_id,
        'membership_id', candidate.membership_id,
        'serviceOfferingId', v_service.id,
        'service_offering_id', v_service.id,
        'start', candidate.starts_at,
        'startsAt', candidate.starts_at,
        'starts_at', candidate.starts_at,
        'endsAt', candidate.candidate_end,
        'ends_at', candidate.candidate_end,
        'date', to_char(candidate.starts_at at time zone 'America/Mexico_City', 'YYYY-MM-DD'),
        'time', to_char(candidate.starts_at at time zone 'America/Mexico_City', 'HH24:MI'),
        'end', to_char(candidate.candidate_end at time zone 'America/Mexico_City', 'HH24:MI'),
        'durationMinutes', v_service.duration_minutes,
        'duration_minutes', v_service.duration_minutes,
        'available', true,
        'status', 'available'
      )
      order by candidate.starts_at
    ),
    '[]'::jsonb
  )
  into v_slots
  from candidates candidate
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
        and covered.artist_id = v_artist.id
        and covered.starts_at >= candidate.starts_at
        and covered.starts_at < candidate.candidate_end
        and (v_studio_id is null or covered.studio_id is null or covered.studio_id = v_studio_id)
        and (v_membership_id is null or covered.membership_id is null or covered.membership_id = v_membership_id)
      order by covered.starts_at
    ) ordered
  ) coverage
  where coverage.coverage_end >= candidate.candidate_end
    and not coverage.has_gap;

  return jsonb_build_object(
    'artistId', v_artist.id,
    'artist_id', v_artist.id,
    'studioId', v_studio_id,
    'studio_id', v_studio_id,
    'membershipId', v_membership_id,
    'membership_id', v_membership_id,
    'serviceOfferingId', v_service.id,
    'service_offering_id', v_service.id,
    'date', v_requested_date,
    'requestedDate', p_date,
    'requested_date', p_date,
    'durationMinutes', v_service.duration_minutes,
    'duration_minutes', v_service.duration_minutes,
    'slots', v_slots
  );
end;
$$;

revoke all on function public.studio_flow_artist_get_manual_availability(uuid, date) from public;
grant execute on function public.studio_flow_artist_get_manual_availability(uuid, date) to authenticated;
