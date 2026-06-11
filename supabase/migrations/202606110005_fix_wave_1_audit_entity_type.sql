create or replace function public.studio_flow_artist_save_own_profile(
  p_artist_id uuid,
  p_profile jsonb,
  p_update_phone boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile profiles%rowtype;
  v_artist artists%rowtype;
  v_artist_profile artist_profiles%rowtype;
  v_phone text;
begin
  if auth.uid() is null then
    raise exception 'Auth session required';
  end if;

  select *
  into v_profile
  from profiles
  where id = auth.uid()
    and status = 'active'
  for update;

  if v_profile.id is null then
    raise exception 'Active profile required';
  end if;

  select *
  into v_artist
  from artists
  where id = p_artist_id
    and profile_id = v_profile.id
  for update;

  if v_artist.id is null then
    raise exception 'Artist profile not found for current user';
  end if;

  if v_artist.status = 'archived' then
    raise exception 'Artist is archived';
  end if;

  if nullif(trim(coalesce(p_profile ->> 'artistic_name', '')), '') is null then
    raise exception 'Artistic name is required';
  end if;

  if p_update_phone then
    v_phone := nullif(trim(coalesce(p_profile ->> 'phone', '')), '');

    update profiles
    set
      phone = v_phone,
      updated_at = now()
    where id = v_profile.id
    returning *
    into v_profile;
  end if;

  insert into artist_profiles (
    artist_id,
    artistic_name,
    bio,
    specialties,
    primary_specialty,
    years_experience,
    payment_methods,
    whatsapp,
    instagram,
    facebook,
    tiktok,
    website,
    photo_path,
    portfolio_paths,
    use_studio_location,
    address_line,
    city,
    state,
    postal_code,
    latitude,
    longitude,
    address_references,
    google_maps_url,
    updated_at
  )
  values (
    v_artist.id,
    nullif(trim(p_profile ->> 'artistic_name'), ''),
    nullif(trim(coalesce(p_profile ->> 'bio', '')), ''),
    array(select jsonb_array_elements_text(coalesce(p_profile -> 'specialties', '[]'::jsonb))),
    nullif(trim(coalesce(p_profile ->> 'primary_specialty', '')), ''),
    nullif(trim(coalesce(p_profile ->> 'years_experience', '')), '')::integer,
    coalesce(p_profile -> 'payment_methods', '{}'::jsonb),
    nullif(trim(coalesce(p_profile ->> 'whatsapp', '')), ''),
    nullif(trim(coalesce(p_profile ->> 'instagram', '')), ''),
    nullif(trim(coalesce(p_profile ->> 'facebook', '')), ''),
    nullif(trim(coalesce(p_profile ->> 'tiktok', '')), ''),
    nullif(trim(coalesce(p_profile ->> 'website', '')), ''),
    nullif(trim(coalesce(p_profile ->> 'photo_path', '')), ''),
    array(select jsonb_array_elements_text(coalesce(p_profile -> 'portfolio_paths', '[]'::jsonb))),
    coalesce((p_profile ->> 'use_studio_location')::boolean, true),
    nullif(trim(coalesce(p_profile ->> 'address_line', '')), ''),
    nullif(trim(coalesce(p_profile ->> 'city', '')), ''),
    nullif(trim(coalesce(p_profile ->> 'state', '')), ''),
    nullif(trim(coalesce(p_profile ->> 'postal_code', '')), ''),
    nullif(trim(coalesce(p_profile ->> 'latitude', '')), '')::numeric,
    nullif(trim(coalesce(p_profile ->> 'longitude', '')), '')::numeric,
    nullif(trim(coalesce(p_profile ->> 'address_references', '')), ''),
    nullif(trim(coalesce(p_profile ->> 'google_maps_url', '')), ''),
    now()
  )
  on conflict (artist_id) do update
  set
    artistic_name = excluded.artistic_name,
    bio = excluded.bio,
    specialties = excluded.specialties,
    primary_specialty = excluded.primary_specialty,
    years_experience = excluded.years_experience,
    payment_methods = excluded.payment_methods,
    whatsapp = excluded.whatsapp,
    instagram = excluded.instagram,
    facebook = excluded.facebook,
    tiktok = excluded.tiktok,
    website = excluded.website,
    photo_path = excluded.photo_path,
    portfolio_paths = excluded.portfolio_paths,
    use_studio_location = excluded.use_studio_location,
    address_line = excluded.address_line,
    city = excluded.city,
    state = excluded.state,
    postal_code = excluded.postal_code,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    address_references = excluded.address_references,
    google_maps_url = excluded.google_maps_url,
    updated_at = now()
  returning *
  into v_artist_profile;

  update artists
  set
    display_name = v_artist_profile.artistic_name,
    updated_at = now()
  where id = v_artist.id
  returning *
  into v_artist;

  insert into audit_events (
    actor_profile_id,
    context,
    entity_type,
    entity_id,
    artist_id,
    event_type,
    after_data
  )
  values (
    v_profile.id,
    'identity',
    'artist_profile',
    v_artist_profile.id,
    v_artist.id,
    'artist_profile_saved',
    to_jsonb(v_artist_profile)
  );

  return jsonb_build_object(
    'artist_profile',
    jsonb_build_object(
      'id', v_artist_profile.id,
      'artist_id', v_artist_profile.artist_id,
      'artistic_name', v_artist_profile.artistic_name,
      'bio', v_artist_profile.bio,
      'specialties', coalesce(to_jsonb(v_artist_profile.specialties), '[]'::jsonb),
      'primary_specialty', v_artist_profile.primary_specialty,
      'years_experience', v_artist_profile.years_experience,
      'payment_methods', coalesce(v_artist_profile.payment_methods, '{}'::jsonb),
      'whatsapp', v_artist_profile.whatsapp,
      'instagram', v_artist_profile.instagram,
      'facebook', v_artist_profile.facebook,
      'tiktok', v_artist_profile.tiktok,
      'website', v_artist_profile.website,
      'photo_path', v_artist_profile.photo_path,
      'portfolio_paths', coalesce(to_jsonb(v_artist_profile.portfolio_paths), '[]'::jsonb),
      'use_studio_location', v_artist_profile.use_studio_location,
      'address_line', v_artist_profile.address_line,
      'city', v_artist_profile.city,
      'state', v_artist_profile.state,
      'postal_code', v_artist_profile.postal_code,
      'latitude', v_artist_profile.latitude,
      'longitude', v_artist_profile.longitude,
      'address_references', v_artist_profile.address_references,
      'google_maps_url', v_artist_profile.google_maps_url,
      'created_at', v_artist_profile.created_at,
      'updated_at', v_artist_profile.updated_at
    ),
    'profile',
    jsonb_build_object(
      'id', v_profile.id,
      'phone', v_profile.phone,
      'updated_at', v_profile.updated_at
    ),
    'artist',
    jsonb_build_object(
      'id', v_artist.id,
      'display_name', v_artist.display_name,
      'status', v_artist.status
    )
  );
end;
$$;
