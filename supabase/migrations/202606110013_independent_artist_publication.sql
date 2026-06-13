create or replace function public.studio_flow_admin_get_independent_artist_publication_readiness(
  p_artist_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile profiles%rowtype;
  v_is_platform_owner boolean := false;
  v_artist artists%rowtype;
  v_artist_profile artist_profiles%rowtype;
  v_marketplace_profile marketplace_profiles%rowtype;
  v_service_count integer := 0;
  v_listing_count integer := 0;
  v_missing text[] := array[]::text[];
  v_listings jsonb := '[]'::jsonb;
  v_publication_status text := 'not_published';
begin
  if auth.uid() is null then
    raise exception 'Auth session required';
  end if;

  select *
  into v_profile
  from profiles
  where id = auth.uid()
    and status = 'active';

  if v_profile.id is null then
    raise exception 'Active profile required';
  end if;

  select exists (
    select 1
    from user_role_assignments ura
    join roles r on r.id = ura.role_id
    where ura.profile_id = v_profile.id
      and ura.status = 'active'
      and r.code = 'platform_owner'
  ) or v_profile.default_role = 'platform_owner'
  into v_is_platform_owner;

  if p_artist_id is null then
    select *
    into v_artist
    from artists
    where profile_id = v_profile.id
      and status <> 'archived'
    limit 1;
  else
    select *
    into v_artist
    from artists
    where id = p_artist_id
      and status <> 'archived';

    if not v_is_platform_owner and v_artist.profile_id <> v_profile.id then
      raise exception 'Artist publication scope not allowed';
    end if;
  end if;

  if v_artist.id is null then
    raise exception 'Artist not found';
  end if;

  select *
  into v_artist_profile
  from artist_profiles
  where artist_id = v_artist.id;

  select count(*)::integer
  into v_service_count
  from service_offerings
  where owner_type = 'artist'
    and artist_id = v_artist.id
    and status = 'active'
    and archived_at is null;

  select *
  into v_marketplace_profile
  from marketplace_profiles
  where profile_type = 'artist'
    and artist_id = v_artist.id
  order by created_at desc
  limit 1;

  if v_artist.status <> 'active' then
    v_missing := array_append(v_missing, 'artist_active');
  end if;

  if v_artist_profile.id is null then
    v_missing := array_append(v_missing, 'artist_profile');
  else
    if nullif(trim(coalesce(v_artist_profile.artistic_name, '')), '') is null then
      v_missing := array_append(v_missing, 'artistic_name');
    end if;

    if nullif(trim(coalesce(v_artist_profile.city, '')), '') is null then
      v_missing := array_append(v_missing, 'city');
    end if;
  end if;

  if v_service_count = 0 then
    v_missing := array_append(v_missing, 'active_services');
  end if;

  if v_marketplace_profile.id is not null then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', ml.id,
          'visibilityStatus', ml.visibility_status,
          'visibility_status', ml.visibility_status,
          'city', ml.city,
          'generatedAt', ml.generated_at,
          'generated_at', ml.generated_at,
          'expiresAt', ml.expires_at,
          'expires_at', ml.expires_at
        )
        order by ml.created_at desc
      ),
      '[]'::jsonb
    ),
    count(*)::integer
    into v_listings, v_listing_count
    from marketplace_listings ml
    where ml.marketplace_profile_id = v_marketplace_profile.id;

    v_publication_status := v_marketplace_profile.visibility_status::text;

    if v_marketplace_profile.visibility_status = 'visible'
      and exists (
        select 1
        from marketplace_listings ml
        where ml.marketplace_profile_id = v_marketplace_profile.id
          and ml.visibility_status = 'visible'
          and (ml.expires_at is null or ml.expires_at > now())
      ) then
      v_publication_status := 'visible';
    elsif cardinality(v_missing) > 0 then
      v_publication_status := 'blocked';
    end if;
  elsif cardinality(v_missing) > 0 then
    v_publication_status := 'blocked';
  end if;

  return jsonb_build_object(
    'artist', jsonb_build_object(
      'id', v_artist.id,
      'profileId', v_artist.profile_id,
      'profile_id', v_artist.profile_id,
      'displayName', v_artist.display_name,
      'display_name', v_artist.display_name,
      'status', v_artist.status,
      'createdAt', v_artist.created_at,
      'created_at', v_artist.created_at
    ),
    'artistProfile', case when v_artist_profile.id is null then null else jsonb_build_object(
      'id', v_artist_profile.id,
      'artistId', v_artist_profile.artist_id,
      'artist_id', v_artist_profile.artist_id,
      'artisticName', v_artist_profile.artistic_name,
      'artistic_name', v_artist_profile.artistic_name,
      'bio', v_artist_profile.bio,
      'primarySpecialty', v_artist_profile.primary_specialty,
      'primary_specialty', v_artist_profile.primary_specialty,
      'specialties', coalesce(v_artist_profile.specialties, array[]::text[]),
      'photoPath', v_artist_profile.photo_path,
      'photo_path', v_artist_profile.photo_path,
      'city', v_artist_profile.city
    ) end,
    'activeServiceCount', v_service_count,
    'active_service_count', v_service_count,
    'marketplaceProfile', case when v_marketplace_profile.id is null then null else jsonb_build_object(
      'id', v_marketplace_profile.id,
      'profileType', v_marketplace_profile.profile_type,
      'profile_type', v_marketplace_profile.profile_type,
      'artistId', v_marketplace_profile.artist_id,
      'artist_id', v_marketplace_profile.artist_id,
      'title', v_marketplace_profile.title,
      'summary', v_marketplace_profile.summary,
      'visibilityStatus', v_marketplace_profile.visibility_status,
      'visibility_status', v_marketplace_profile.visibility_status,
      'publishedAt', v_marketplace_profile.published_at,
      'published_at', v_marketplace_profile.published_at,
      'hiddenAt', v_marketplace_profile.hidden_at,
      'hidden_at', v_marketplace_profile.hidden_at
    ) end,
    'marketplaceListings', v_listings,
    'marketplace_listings', v_listings,
    'listingCount', v_listing_count,
    'listing_count', v_listing_count,
    'publicationStatus', v_publication_status,
    'publication_status', v_publication_status,
    'canPublish', cardinality(v_missing) = 0,
    'can_publish', cardinality(v_missing) = 0,
    'missing', to_jsonb(v_missing)
  );
end;
$$;

create or replace function public.studio_flow_admin_publish_independent_artist(
  p_artist_id uuid,
  p_title text default null,
  p_summary text default null,
  p_city text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor jsonb;
  v_actor_profile_id uuid;
  v_artist artists%rowtype;
  v_artist_profile artist_profiles%rowtype;
  v_marketplace_profile marketplace_profiles%rowtype;
  v_marketplace_profile_before marketplace_profiles%rowtype;
  v_marketplace_listing marketplace_listings%rowtype;
  v_marketplace_listing_before marketplace_listings%rowtype;
  v_service_count integer := 0;
  v_title text;
  v_summary text;
  v_city text;
begin
  if p_artist_id is null then
    raise exception 'Artist id required';
  end if;

  v_actor := public.studio_flow_admin_assert_platform_owner();
  v_actor_profile_id := (v_actor ->> 'actor_profile_id')::uuid;

  select *
  into v_artist
  from artists
  where id = p_artist_id
    and status <> 'archived'
  for update;

  if v_artist.id is null then
    raise exception 'Artist not found';
  end if;

  if v_artist.status <> 'active' then
    raise exception 'Only active artists can be published';
  end if;

  select *
  into v_artist_profile
  from artist_profiles
  where artist_id = v_artist.id;

  if v_artist_profile.id is null then
    raise exception 'Artist profile required';
  end if;

  if nullif(trim(coalesce(v_artist_profile.artistic_name, '')), '') is null then
    raise exception 'Artist public name required';
  end if;

  select count(*)::integer
  into v_service_count
  from service_offerings
  where owner_type = 'artist'
    and artist_id = v_artist.id
    and status = 'active'
    and archived_at is null;

  if v_service_count = 0 then
    raise exception 'At least one active artist-owned service is required';
  end if;

  v_title := coalesce(nullif(trim(p_title), ''), nullif(trim(v_artist_profile.artistic_name), ''), v_artist.display_name);
  v_summary := coalesce(nullif(trim(p_summary), ''), v_artist_profile.bio);
  v_city := coalesce(nullif(trim(p_city), ''), nullif(trim(v_artist_profile.city), ''));

  select *
  into v_marketplace_profile_before
  from marketplace_profiles
  where profile_type = 'artist'
    and artist_id = v_artist.id
  order by created_at desc
  limit 1
  for update;

  if v_marketplace_profile_before.id is not null
    and v_marketplace_profile_before.visibility_status = 'suspended' then
    raise exception 'Marketplace profile is suspended';
  end if;

  if v_marketplace_profile_before.id is null then
    insert into marketplace_profiles (
      profile_type,
      artist_id,
      studio_id,
      membership_id,
      title,
      summary,
      visibility_status,
      published_at,
      hidden_at
    )
    values (
      'artist',
      v_artist.id,
      null,
      null,
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
      published_at = now(),
      hidden_at = null,
      updated_at = now()
    where id = v_marketplace_profile_before.id
    returning *
    into v_marketplace_profile;
  end if;

  select *
  into v_marketplace_listing_before
  from marketplace_listings
  where marketplace_profile_id = v_marketplace_profile.id
  order by created_at desc
  limit 1
  for update;

  if v_marketplace_listing_before.id is null then
    insert into marketplace_listings (
      marketplace_profile_id,
      artist_id,
      studio_id,
      membership_id,
      city,
      visibility_status,
      expires_at
    )
    values (
      v_marketplace_profile.id,
      v_artist.id,
      null,
      null,
      v_city,
      'visible',
      null
    )
    returning *
    into v_marketplace_listing;
  else
    update marketplace_listings
    set
      artist_id = v_artist.id,
      studio_id = null,
      membership_id = null,
      city = v_city,
      visibility_status = 'visible',
      expires_at = null,
      updated_at = now()
    where id = v_marketplace_listing_before.id
    returning *
    into v_marketplace_listing;
  end if;

  insert into audit_events (
    actor_profile_id,
    context,
    entity_type,
    entity_id,
    artist_id,
    event_type,
    before_data,
    after_data,
    metadata
  )
  values (
    v_actor_profile_id,
    'marketplace',
    'marketplace_profile',
    v_marketplace_profile.id,
    v_artist.id,
    'independent_artist_published',
    jsonb_build_object(
      'profile', to_jsonb(v_marketplace_profile_before),
      'listing', to_jsonb(v_marketplace_listing_before)
    ),
    jsonb_build_object(
      'profile', to_jsonb(v_marketplace_profile),
      'listing', to_jsonb(v_marketplace_listing)
    ),
    jsonb_build_object(
      'artistId', v_artist.id,
      'profileType', 'artist',
      'listingId', v_marketplace_listing.id,
      'activeServiceCount', v_service_count,
      'decision', 'publish'
    )
  );

  return public.studio_flow_admin_get_independent_artist_publication_readiness(v_artist.id);
end;
$$;

revoke all on function public.studio_flow_admin_get_independent_artist_publication_readiness(uuid) from public;
revoke all on function public.studio_flow_admin_publish_independent_artist(uuid, text, text, text) from public;

grant execute on function public.studio_flow_admin_get_independent_artist_publication_readiness(uuid) to authenticated;
grant execute on function public.studio_flow_admin_publish_independent_artist(uuid, text, text, text) to authenticated;
