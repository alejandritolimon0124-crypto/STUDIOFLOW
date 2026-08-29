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
      availability.available_count,
      availability.available_today_count
    from listing_targets lt
    left join artists a on a.id = lt.artist_id
    left join artist_profiles ap on ap.artist_id = a.id
    left join studios s on s.id = lt.studio_id
    left join studio_profiles sp on sp.studio_id = s.id
    cross join lateral (
      select
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', service_rows.id,
              'name', service_rows.name,
              'description', service_rows.description,
              'ownerType', service_rows.owner_type,
              'priceAmount', service_rows.price_amount,
              'durationMinutes', service_rows.duration_minutes,
              'category', service_rows.category_name,
              'serviceTier', service_rows.service_tier,
              'status', service_rows.status
            )
            order by service_rows.category_name, service_rows.name
          ),
          '[]'::jsonb
        ) as services,
        count(*)::integer as service_count
      from (
        select distinct on (so.id)
          so.id,
          so.name,
          so.description,
          so.owner_type,
          so.price_amount,
          so.duration_minutes,
          sc.name as category_name,
          coalesce(st.code::text, 'basic') as service_tier,
          so.status
        from service_offerings so
        join service_categories sc on sc.id = so.category_id
        left join service_tiers st on st.id = so.tier_id
        left join artist_studio_memberships service_membership on service_membership.id = so.membership_id
        left join artists service_artist on service_artist.id = coalesce(so.artist_id, service_membership.artist_id)
        where so.status = 'active'
          and so.archived_at is null
          and (
            (lt.profile_type <> 'studio' and so.owner_type = 'artist' and so.artist_id = lt.artist_id)
            or (lt.profile_type <> 'studio' and so.owner_type = 'membership' and so.membership_id = lt.membership_id)
            or (lt.profile_type <> 'studio' and so.owner_type = 'studio' and so.studio_id = lt.studio_id)
            or (lt.profile_type = 'studio' and so.owner_type = 'studio' and so.studio_id = lt.studio_id)
            or (
              lt.profile_type = 'studio'
              and so.owner_type = 'artist'
              and exists (
                select 1
                from artist_studio_memberships asm_service
                where asm_service.artist_id = so.artist_id
                  and asm_service.studio_id = lt.studio_id
                  and asm_service.status = 'active'
                  and asm_service.archived_at is null
              )
            )
            or (
              lt.profile_type = 'studio'
              and so.owner_type = 'membership'
              and service_membership.studio_id = lt.studio_id
              and service_membership.status = 'active'
              and service_membership.archived_at is null
            )
          )
          and (
            lt.profile_type = 'studio'
            or service_artist.id is null
            or service_artist.status = 'active'
          )
      ) service_rows
    ) services
    cross join lateral (
      select
        count(*)::integer as available_count,
        count(*) filter (where slot.starts_at::date = current_date)::integer as available_today_count
      from availability_slots slot
      where slot.status = 'available'
        and slot.starts_at >= now()
        and (
          (lt.artist_id is not null and slot.artist_id = lt.artist_id)
          or (lt.membership_id is not null and slot.membership_id = lt.membership_id)
          or (lt.profile_type = 'studio' and lt.studio_id is not null and slot.studio_id = lt.studio_id)
        )
        and (lt.studio_id is null or slot.studio_id is null or slot.studio_id = lt.studio_id)
    ) availability
    where (lt.profile_type = 'studio' or a.status = 'active')
      and (s.id is null or s.archived_at is null)
      and (s.id is null or s.studio_status = 'approved')
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
        'name',
          case
            when profile_type = 'studio' then coalesce(commercial_name, studio_name, title)
            else coalesce(artistic_name, artist_display_name, title)
          end,
        'artistName', coalesce(artistic_name, artist_display_name),
        'studioName', coalesce(commercial_name, studio_name),
        'city', coalesce(city, artist_city, studio_city),
        'visibilityStatus', visibility_status,
        'services', services,
        'availability', jsonb_build_object(
          'availableCount', available_count,
          'available_count', available_count,
          'availableTodayCount', available_today_count,
          'available_today_count', available_today_count,
          'hasFutureSlots', available_count > 0,
          'has_future_slots', available_count > 0
        ),
        'specialties', coalesce(specialties, array[]::text[]),
        'profile', jsonb_build_object(
          'photoUrl', case when profile_type = 'studio' then logo_path else photo_path end,
          'photoPath', case when profile_type = 'studio' then logo_path else photo_path end,
          'portfolioPaths', coalesce(portfolio_paths, array[]::text[]),
          'specialties', coalesce(specialties, array[]::text[]),
          'primarySpecialty', primary_specialty,
          'biography', case when profile_type = 'studio' then studio_description else artist_bio end,
          'contactLinks', jsonb_build_object(
            'whatsapp', whatsapp,
            'instagram', instagram,
            'facebook', facebook,
            'tiktok', tiktok,
            'website', website
          ),
          'professionalLocation', jsonb_build_object(
            'useStudioLocation', use_studio_location,
            'addressLine', case when profile_type = 'studio' then studio_address_line else artist_address_line end,
            'city', case when profile_type = 'studio' then studio_city else artist_city end,
            'state', artist_state,
            'postalCode', artist_postal_code,
            'latitude', case when profile_type = 'studio' then studio_latitude else artist_latitude end,
            'longitude', case when profile_type = 'studio' then studio_longitude else artist_longitude end,
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
            'logoPath', logo_path,
            'logoUrl', logo_path
          ),
          'professionalLocation', jsonb_build_object(
            'address', studio_address_line,
            'addressLine', studio_address_line,
            'city', studio_city,
            'latitude', studio_latitude,
            'longitude', studio_longitude,
            'logoPath', logo_path,
            'logoUrl', logo_path
          )
        ) end
      )
      order by available_count desc, generated_at desc, title asc
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
