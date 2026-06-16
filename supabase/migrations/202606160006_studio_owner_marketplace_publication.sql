create or replace function public.studio_flow_publish_studio_marketplace(
  p_studio_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile profiles%rowtype;
  v_studio studios%rowtype;
  v_studio_profile studio_profiles%rowtype;
  v_marketplace_profile marketplace_profiles%rowtype;
  v_marketplace_listing marketplace_listings%rowtype;
  v_title text;
  v_summary text;
  v_city text;
begin
  if auth.uid() is null then
    raise exception 'Auth session required';
  end if;

  if p_studio_id is null then
    raise exception 'Studio is required';
  end if;

  select *
  into v_profile
  from profiles
  where id = auth.uid();

  if v_profile.id is null or v_profile.status <> 'active' then
    raise exception 'Active profile required';
  end if;

  select *
  into v_studio
  from studios
  where id = p_studio_id
    and archived_at is null
    and (
      owner_profile_id = v_profile.id
      or exists (
        select 1
        from user_role_assignments ura
        join roles r on r.id = ura.role_id
        where ura.profile_id = v_profile.id
          and ura.studio_id = studios.id
          and ura.status = 'active'
          and r.code = 'studio_owner'
      )
    );

  if v_studio.id is null then
    raise exception 'Studio owner access required';
  end if;

  if v_studio.studio_status <> 'approved' then
    raise exception 'Studio must be approved before publishing marketplace';
  end if;

  select *
  into v_studio_profile
  from studio_profiles
  where studio_id = v_studio.id;

  v_title := nullif(trim(coalesce(v_studio_profile.commercial_name, v_studio.name, '')), '');
  v_summary := nullif(trim(coalesce(v_studio_profile.description, '')), '');
  v_city := nullif(trim(coalesce(v_studio_profile.city, '')), '');

  if v_title is null then
    raise exception 'Commercial name is required to publish marketplace';
  end if;

  if v_city is null then
    raise exception 'City is required to publish marketplace';
  end if;

  if nullif(trim(coalesce(v_studio_profile.address_line, '')), '') is null
    and (v_studio_profile.geo_lat is null or v_studio_profile.geo_lng is null)
  then
    raise exception 'Address or coordinates are required to publish marketplace';
  end if;

  select *
  into v_marketplace_profile
  from marketplace_profiles
  where profile_type = 'studio'
    and studio_id = v_studio.id
  for update;

  if v_marketplace_profile.id is null then
    insert into marketplace_profiles (
      profile_type,
      studio_id,
      title,
      summary,
      visibility_status,
      published_at,
      hidden_at
    )
    values (
      'studio',
      v_studio.id,
      v_title,
      v_summary,
      'visible',
      now(),
      null
    )
    returning *
    into v_marketplace_profile;
  else
    update marketplace_profiles
    set
      title = v_title,
      summary = v_summary,
      visibility_status = 'visible',
      published_at = coalesce(published_at, now()),
      hidden_at = null,
      updated_at = now()
    where id = v_marketplace_profile.id
    returning *
    into v_marketplace_profile;
  end if;

  select *
  into v_marketplace_listing
  from marketplace_listings
  where marketplace_profile_id = v_marketplace_profile.id
    and studio_id = v_studio.id
  order by generated_at desc
  limit 1
  for update;

  if v_marketplace_listing.id is null then
    insert into marketplace_listings (
      marketplace_profile_id,
      studio_id,
      city,
      visibility_status,
      generated_at,
      expires_at
    )
    values (
      v_marketplace_profile.id,
      v_studio.id,
      v_city,
      'visible',
      now(),
      null
    )
    returning *
    into v_marketplace_listing;
  else
    update marketplace_listings
    set
      city = v_city,
      visibility_status = 'visible',
      generated_at = now(),
      expires_at = null,
      updated_at = now()
    where id = v_marketplace_listing.id
    returning *
    into v_marketplace_listing;
  end if;

  return jsonb_build_object(
    'studioId', v_studio.id,
    'studio_id', v_studio.id,
    'marketplaceProfileId', v_marketplace_profile.id,
    'marketplace_profile_id', v_marketplace_profile.id,
    'marketplaceListingId', v_marketplace_listing.id,
    'marketplace_listing_id', v_marketplace_listing.id,
    'visibilityStatus', v_marketplace_profile.visibility_status,
    'visibility_status', v_marketplace_profile.visibility_status
  );
end;
$$;

create or replace function public.studio_flow_get_own_studios()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile profiles%rowtype;
  v_studios jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Auth session required';
  end if;

  select *
  into v_profile
  from profiles
  where id = auth.uid();

  if v_profile.id is null then
    raise exception 'Profile required';
  end if;

  if v_profile.status <> 'active' then
    raise exception 'Active profile required';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'studioId', s.id,
        'studio_id', s.id,
        'studioStatus', s.studio_status,
        'studio_status', s.studio_status,
        'commercialName', coalesce(sp.commercial_name, s.name),
        'commercial_name', coalesce(sp.commercial_name, s.name),
        'city', sp.city,
        'addressLine', sp.address_line,
        'address_line', sp.address_line,
        'geoLat', sp.geo_lat,
        'geo_lat', sp.geo_lat,
        'geoLng', sp.geo_lng,
        'geo_lng', sp.geo_lng,
        'marketplaceProfileId', mp.id,
        'marketplace_profile_id', mp.id,
        'marketplaceListingId', ml.id,
        'marketplace_listing_id', ml.id,
        'marketplaceStatus', coalesce(mp.visibility_status::text, 'not_published'),
        'marketplace_status', coalesce(mp.visibility_status::text, 'not_published'),
        'createdAt', s.created_at,
        'created_at', s.created_at
      )
      order by s.created_at desc
    ),
    '[]'::jsonb
  )
  into v_studios
  from studios s
  left join studio_profiles sp on sp.studio_id = s.id
  left join marketplace_profiles mp
    on mp.profile_type = 'studio'
    and mp.studio_id = s.id
  left join lateral (
    select *
    from marketplace_listings listing
    where listing.marketplace_profile_id = mp.id
      and listing.studio_id = s.id
    order by listing.generated_at desc
    limit 1
  ) ml on true
  where s.archived_at is null
    and (
      s.owner_profile_id = v_profile.id
      or exists (
        select 1
        from user_role_assignments ura
        join roles r on r.id = ura.role_id
        where ura.profile_id = v_profile.id
          and ura.studio_id = s.id
          and ura.status = 'active'
          and r.code = 'studio_owner'
      )
    );

  return jsonb_build_object('studios', v_studios);
end;
$$;

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
    left join artists a on a.id = lt.artist_id
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
          (lt.artist_id is not null and slot.artist_id = lt.artist_id)
          or (lt.membership_id is not null and slot.membership_id = lt.membership_id)
          or (lt.profile_type = 'studio' and lt.studio_id is not null and slot.studio_id = lt.studio_id)
        )
        and (lt.studio_id is null or slot.studio_id is null or slot.studio_id = lt.studio_id)
    ) availability
    where (lt.profile_type = 'studio' or a.status = 'active')
      and (s.id is null or s.archived_at is null)
      and (s.id is null or s.studio_status = 'approved')
      and (lt.profile_type = 'studio' or services.service_count > 0)
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

create or replace function public.studio_flow_admin_review_studio(
  p_studio_id uuid,
  p_decision text,
  p_reason text default null,
  p_decision_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_context jsonb;
  v_actor_profile_id uuid;
  v_studio_before studios%rowtype;
  v_studio_after studios%rowtype;
  v_review governance_reviews%rowtype;
  v_decision text;
  v_review_status governance_review_status;
  v_studio_status studio_status;
  v_review_type governance_review_type;
  v_studio_owner_role_id uuid;
begin
  v_context := public.studio_flow_admin_assert_platform_owner();
  v_actor_profile_id := (v_context ->> 'actor_profile_id')::uuid;
  v_decision := lower(trim(coalesce(p_decision, '')));

  if v_decision not in ('approve', 'reject', 'suspend', 'request_changes') then
    raise exception 'Unsupported governance decision: %', p_decision;
  end if;

  select *
  into v_studio_before
  from studios
  where id = p_studio_id
  for update;

  if v_studio_before.id is null then
    raise exception 'Studio not found';
  end if;

  if v_studio_before.studio_status = 'archived' then
    raise exception 'Archived studios cannot be reviewed';
  end if;

  v_review_status := case v_decision
    when 'approve' then 'approved'::governance_review_status
    when 'reject' then 'rejected'::governance_review_status
    when 'suspend' then 'suspended'::governance_review_status
    else 'changes_requested'::governance_review_status
  end;

  v_studio_status := case v_decision
    when 'approve' then 'approved'::studio_status
    when 'reject' then 'rejected'::studio_status
    when 'suspend' then 'suspended'::studio_status
    else 'pending'::studio_status
  end;

  v_review_type := case
    when v_studio_before.studio_status = 'pending' then 'onboarding'::governance_review_type
    when v_decision = 'suspend' then 'risk'::governance_review_type
    else 'status_change'::governance_review_type
  end;

  select *
  into v_review
  from governance_reviews
  where studio_id = p_studio_id
    and status = 'open'
  order by created_at desc
  limit 1
  for update;

  if v_review.id is null then
    insert into governance_reviews (
      studio_id,
      review_type,
      status,
      reason,
      decision_notes,
      reviewed_by_profile_id,
      resolved_at
    )
    values (
      p_studio_id,
      v_review_type,
      v_review_status,
      nullif(trim(coalesce(p_reason, '')), ''),
      nullif(trim(coalesce(p_decision_notes, '')), ''),
      v_actor_profile_id,
      now()
    )
    returning *
    into v_review;
  else
    update governance_reviews
    set
      review_type = v_review_type,
      status = v_review_status,
      reason = nullif(trim(coalesce(p_reason, '')), ''),
      decision_notes = nullif(trim(coalesce(p_decision_notes, '')), ''),
      reviewed_by_profile_id = v_actor_profile_id,
      resolved_at = now()
    where id = v_review.id
    returning *
    into v_review;
  end if;

  update studios
  set
    studio_status = v_studio_status,
    approved_at = case
      when v_studio_status = 'approved' then now()
      when v_studio_before.studio_status = 'approved' and v_studio_status <> 'approved' then null
      else approved_at
    end,
    suspended_at = case
      when v_studio_status = 'suspended' then now()
      when v_studio_status = 'approved' then null
      else suspended_at
    end,
    updated_at = now()
  where id = p_studio_id
  returning *
  into v_studio_after;

  if v_studio_status = 'approved' and v_studio_after.owner_profile_id is not null then
    select id
    into v_studio_owner_role_id
    from roles
    where code = 'studio_owner';

    if v_studio_owner_role_id is null then
      raise exception 'Studio owner role is not configured';
    end if;

    insert into user_role_assignments (
      profile_id,
      role_id,
      studio_id,
      status,
      assigned_by_profile_id
    )
    values (
      v_studio_after.owner_profile_id,
      v_studio_owner_role_id,
      v_studio_after.id,
      'active',
      v_actor_profile_id
    )
    on conflict (profile_id, role_id, studio_id)
    where status = 'active'
    do update
    set
      revoked_at = null,
      updated_at = now();
  end if;

  insert into audit_events (
    actor_profile_id,
    context,
    entity_type,
    entity_id,
    studio_id,
    event_type,
    before_data,
    after_data,
    metadata
  )
  values (
    v_actor_profile_id,
    'studio',
    'governance_review',
    v_review.id,
    p_studio_id,
    'studio_governance_reviewed',
    to_jsonb(v_studio_before),
    to_jsonb(v_studio_after),
    jsonb_build_object(
      'decision', v_decision,
      'review_status', v_review.status,
      'reason', p_reason,
      'decision_notes', p_decision_notes
    )
  );

  return jsonb_build_object(
    'studio', jsonb_build_object(
      'id', v_studio_after.id,
      'name', v_studio_after.name,
      'studioStatus', v_studio_after.studio_status,
      'studio_status', v_studio_after.studio_status,
      'approvedAt', v_studio_after.approved_at,
      'approved_at', v_studio_after.approved_at,
      'suspendedAt', v_studio_after.suspended_at,
      'suspended_at', v_studio_after.suspended_at
    ),
    'governanceReview', jsonb_build_object(
      'id', v_review.id,
      'reviewType', v_review.review_type,
      'review_type', v_review.review_type,
      'status', v_review.status,
      'reason', v_review.reason,
      'decisionNotes', v_review.decision_notes,
      'decision_notes', v_review.decision_notes,
      'reviewedByProfileId', v_review.reviewed_by_profile_id,
      'reviewed_by_profile_id', v_review.reviewed_by_profile_id,
      'createdAt', v_review.created_at,
      'created_at', v_review.created_at,
      'resolvedAt', v_review.resolved_at,
      'resolved_at', v_review.resolved_at
    ),
    'queue', public.studio_flow_admin_governance_payload(p_studio_id) -> 'queue'
  );
end;
$$;

revoke all on function public.studio_flow_publish_studio_marketplace(uuid) from public;
revoke all on function public.studio_flow_get_own_studios() from public;
revoke all on function public.studio_flow_marketplace_get_listings() from public;
revoke all on function public.studio_flow_admin_review_studio(uuid, text, text, text) from public;

grant execute on function public.studio_flow_publish_studio_marketplace(uuid) to authenticated;
grant execute on function public.studio_flow_get_own_studios() to authenticated;
grant execute on function public.studio_flow_marketplace_get_listings() to authenticated;
grant execute on function public.studio_flow_admin_review_studio(uuid, text, text, text) to authenticated;
