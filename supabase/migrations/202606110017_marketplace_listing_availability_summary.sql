create or replace function public.studio_flow_marketplace_get_listings()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_listings jsonb;
begin
  if auth.uid() is null then
    raise exception 'Auth session required';
  end if;

  with listing_targets as (
    select
      ml.id as listing_id,
      mp.id as profile_id,
      mp.profile_type,
      mp.title,
      mp.summary,
      coalesce(ml.artist_id, mp.artist_id, asm.artist_id) as artist_id,
      coalesce(ml.studio_id, mp.studio_id, asm.studio_id) as studio_id,
      coalesce(ml.membership_id, mp.membership_id) as membership_id,
      ml.city,
      ml.visibility_status,
      ml.generated_at,
      ml.expires_at
    from marketplace_listings ml
    join marketplace_profiles mp on mp.id = ml.marketplace_profile_id
    left join artist_studio_memberships asm on asm.id = coalesce(ml.membership_id, mp.membership_id)
    where ml.visibility_status = 'visible'
      and mp.visibility_status = 'visible'
      and (ml.expires_at is null or ml.expires_at > now())
  ),
  enriched_listings as (
    select
      lt.*,
      a.display_name as artist_display_name,
      ap.artistic_name,
      ap.bio as artist_bio,
      ap.specialties,
      ap.primary_specialty,
      ap.photo_path,
      ap.portfolio_paths,
      ap.city as artist_city,
      ap.whatsapp,
      ap.instagram,
      ap.facebook,
      ap.tiktok,
      ap.website,
      ap.use_studio_location,
      ap.address_line as artist_address_line,
      ap.state as artist_state,
      ap.postal_code as artist_postal_code,
      ap.latitude as artist_latitude,
      ap.longitude as artist_longitude,
      ap.google_maps_url as artist_google_maps_url,
      s.name as studio_name,
      s.studio_status,
      sp.commercial_name,
      sp.description as studio_description,
      sp.address_line as studio_address_line,
      sp.city as studio_city,
      sp.geo_lat as studio_latitude,
      sp.geo_lng as studio_longitude,
      sp.logo_path,
      services.services,
      services.service_count,
      availability.available_count
    from listing_targets lt
    join artists a on a.id = lt.artist_id
    left join artist_profiles ap on ap.artist_id = a.id
    left join studios s on s.id = lt.studio_id
    left join studio_profiles sp on sp.studio_id = s.id
    cross join lateral (
      select
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', so.id,
              'name', so.name,
              'description', so.description,
              'ownerType', so.owner_type,
              'priceAmount', so.price_amount,
              'durationMinutes', so.duration_minutes,
              'category', sc.name,
              'serviceTier', coalesce(st.code::text, 'basic'),
              'status', so.status
            )
            order by sc.name, so.name
          ),
          '[]'::jsonb
        ) as services,
        count(*)::integer as service_count
      from service_offerings so
      join service_categories sc on sc.id = so.category_id
      left join service_tiers st on st.id = so.tier_id
      where so.status = 'active'
        and so.archived_at is null
        and (
          (so.owner_type = 'artist' and so.artist_id = lt.artist_id)
          or (so.owner_type = 'studio' and so.studio_id = lt.studio_id)
          or (so.owner_type = 'membership' and so.membership_id = lt.membership_id)
        )
    ) services
    cross join lateral (
      select count(*)::integer as available_count
      from availability_slots slot
      where slot.status = 'available'
        and slot.starts_at >= now()
        and (
          slot.artist_id = lt.artist_id
          or (lt.membership_id is not null and slot.membership_id = lt.membership_id)
        )
        and (lt.studio_id is null or slot.studio_id is null or slot.studio_id = lt.studio_id)
    ) availability
    where a.status = 'active'
      and (s.id is null or s.archived_at is null)
      and (s.id is null or s.studio_status <> 'suspended')
      and services.service_count > 0
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', listing_id,
        'listingId', listing_id,
        'profileId', profile_id,
        'profileType', profile_type,
        'artistId', artist_id,
        'studioId', studio_id,
        'membershipId', membership_id,
        'title', title,
        'summary', summary,
        'name', coalesce(artistic_name, artist_display_name, title),
        'artistName', coalesce(artistic_name, artist_display_name, title),
        'studioName', coalesce(commercial_name, studio_name),
        'city', coalesce(city, artist_city, studio_city),
        'visibilityStatus', visibility_status,
        'services', services,
        'availability', jsonb_build_object(
          'availableCount', available_count,
          'available_count', available_count,
          'hasFutureSlots', available_count > 0,
          'has_future_slots', available_count > 0
        ),
        'specialties', coalesce(specialties, array[]::text[]),
        'profile', jsonb_build_object(
          'photoUrl', photo_path,
          'photoPath', photo_path,
          'portfolioPaths', coalesce(portfolio_paths, array[]::text[]),
          'specialties', coalesce(specialties, array[]::text[]),
          'primarySpecialty', primary_specialty,
          'biography', artist_bio,
          'contactLinks', jsonb_build_object(
            'whatsapp', whatsapp,
            'instagram', instagram,
            'facebook', facebook,
            'tiktok', tiktok,
            'website', website
          ),
          'professionalLocation', jsonb_build_object(
            'useStudioLocation', use_studio_location,
            'addressLine', artist_address_line,
            'city', artist_city,
            'state', artist_state,
            'postalCode', artist_postal_code,
            'latitude', artist_latitude,
            'longitude', artist_longitude,
            'googleMapsUrl', artist_google_maps_url
          )
        ),
        'studio', case when studio_id is null then null else jsonb_build_object(
          'id', studio_id,
          'name', coalesce(commercial_name, studio_name),
          'studioStatus', studio_status,
          'profile', jsonb_build_object(
            'commercialName', coalesce(commercial_name, studio_name),
            'description', studio_description,
            'addressLine', studio_address_line,
            'city', studio_city,
            'latitude', studio_latitude,
            'longitude', studio_longitude,
            'logoPath', logo_path
          )
        ) end
      )
      order by generated_at desc, title asc
    ),
    '[]'::jsonb
  )
  into v_listings
  from enriched_listings;

  return jsonb_build_object('listings', v_listings);
end;
$$;

revoke all on function public.studio_flow_marketplace_get_listings() from public;
grant execute on function public.studio_flow_marketplace_get_listings() to authenticated;
