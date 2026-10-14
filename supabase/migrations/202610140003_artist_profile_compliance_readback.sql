create or replace function public.studio_flow_artist_get_own_profile(p_artist_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile profiles%rowtype;
  v_artist artists%rowtype;
  v_artist_profile artist_profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Auth session required';
  end if;

  select * into v_profile
  from profiles
  where id = auth.uid() and status = 'active';

  if v_profile.id is null then
    raise exception 'Active profile required';
  end if;

  select * into v_artist
  from artists
  where profile_id = v_profile.id
    and (p_artist_id is null or id = p_artist_id)
  order by created_at
  limit 1;

  if v_artist.id is null then
    raise exception 'Artist profile not found for current user';
  end if;

  if v_artist.status = 'archived' then
    raise exception 'Artist is archived';
  end if;

  select * into v_artist_profile
  from artist_profiles
  where artist_id = v_artist.id;

  return jsonb_build_object(
    'artist_profile',
    case
      when v_artist_profile.id is null then null
      else jsonb_build_object(
        'id', v_artist_profile.id,
        'artist_id', v_artist_profile.artist_id,
        'artistic_name', v_artist_profile.artistic_name,
        'birthday', v_artist_profile.birthday,
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
        'studio_photo_paths', coalesce(v_artist_profile.studio_photo_paths, '{}'::jsonb),
        'portfolio_paths', coalesce(to_jsonb(v_artist_profile.portfolio_paths), '[]'::jsonb),
        'beauty_space', v_artist_profile.beauty_space,
        'beauty_spaces', coalesce(to_jsonb(v_artist_profile.beauty_spaces), '[]'::jsonb),
        'has_health_officer', v_artist_profile.has_health_officer,
        'health_officer_name', v_artist_profile.health_officer_name,
        'health_officer_title', v_artist_profile.health_officer_title,
        'health_officer_license', v_artist_profile.health_officer_license,
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
      )
    end,
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
