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
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', slot.id,
        'availabilitySlotId', slot.id,
        'availability_slot_id', slot.id,
        'listingId', v_listing.id,
        'listing_id', v_listing.id,
        'artistId', slot.artist_id,
        'artist_id', slot.artist_id,
        'studioId', slot.studio_id,
        'studio_id', slot.studio_id,
        'membershipId', slot.membership_id,
        'membership_id', slot.membership_id,
        'serviceOfferingId', p_service_offering_id,
        'service_offering_id', p_service_offering_id,
        'startsAt', slot.starts_at,
        'starts_at', slot.starts_at,
        'endsAt', slot.ends_at,
        'ends_at', slot.ends_at,
        'date', to_char(slot.starts_at at time zone 'America/Mexico_City', 'YYYY-MM-DD'),
        'time', to_char(slot.starts_at at time zone 'America/Mexico_City', 'HH24:MI'),
        'end', to_char(slot.ends_at at time zone 'America/Mexico_City', 'HH24:MI'),
        'durationMinutes', greatest(1, floor(extract(epoch from (slot.ends_at - slot.starts_at)) / 60)::integer),
        'duration_minutes', greatest(1, floor(extract(epoch from (slot.ends_at - slot.starts_at)) / 60)::integer),
        'available', true,
        'status', slot.status
      )
      order by slot.starts_at
    ),
    '[]'::jsonb
  )
  into v_slots
  from availability_slots slot
  where slot.status = 'available'
    and slot.starts_at >= now()
    and (slot.starts_at at time zone 'America/Mexico_City')::date = p_date
    and (
      slot.artist_id = v_artist_id
      or (v_membership_id is not null and slot.membership_id = v_membership_id)
    )
    and (v_studio_id is null or slot.studio_id is null or slot.studio_id = v_studio_id)
    and (
      v_service.id is null
      or floor(extract(epoch from (slot.ends_at - slot.starts_at)) / 60)::integer >= v_service.duration_minutes
    );

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
    'date', p_date,
    'slots', v_slots
  );
end;
$$;

revoke all on function public.studio_flow_marketplace_get_availability(uuid, uuid, date) from public;
grant execute on function public.studio_flow_marketplace_get_availability(uuid, uuid, date) to authenticated;
