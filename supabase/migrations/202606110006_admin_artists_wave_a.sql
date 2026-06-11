create or replace function public.studio_flow_admin_get_artists()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile profiles%rowtype;
  v_is_platform_owner boolean := false;
  v_scoped_studio_ids uuid[];
  v_artist_ids uuid[];
  v_artists jsonb;
  v_artist_profiles jsonb;
  v_profiles jsonb;
  v_memberships jsonb;
  v_studios jsonb;
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

  select coalesce(array_agg(distinct ura.studio_id) filter (where ura.studio_id is not null), '{}'::uuid[])
  into v_scoped_studio_ids
  from user_role_assignments ura
  join roles r on r.id = ura.role_id
  where ura.profile_id = v_profile.id
    and ura.status = 'active'
    and r.code in ('studio_owner', 'studio_manager');

  if not v_is_platform_owner and coalesce(array_length(v_scoped_studio_ids, 1), 0) = 0 then
    return jsonb_build_object(
      'artists', '[]'::jsonb,
      'artist_profiles', '[]'::jsonb,
      'profiles', '[]'::jsonb,
      'memberships', '[]'::jsonb,
      'studios', '[]'::jsonb
    );
  end if;

  select coalesce(array_agg(distinct a.id), '{}'::uuid[])
  into v_artist_ids
  from artists a
  left join artist_studio_memberships asm on asm.artist_id = a.id
  where v_is_platform_owner
    or (
      asm.studio_id = any(v_scoped_studio_ids)
      and asm.status <> 'archived'
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'profile_id', a.profile_id,
        'display_name', a.display_name,
        'status', a.status,
        'created_at', a.created_at,
        'updated_at', a.updated_at,
        'archived_at', a.archived_at
      )
      order by a.created_at desc
    ),
    '[]'::jsonb
  )
  into v_artists
  from artists a
  where a.id = any(v_artist_ids);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', ap.id,
        'artist_id', ap.artist_id,
        'artistic_name', ap.artistic_name,
        'bio', ap.bio,
        'specialties', coalesce(to_jsonb(ap.specialties), '[]'::jsonb),
        'primary_specialty', ap.primary_specialty,
        'years_experience', ap.years_experience,
        'payment_methods', coalesce(ap.payment_methods, '{}'::jsonb),
        'whatsapp', ap.whatsapp,
        'instagram', ap.instagram,
        'facebook', ap.facebook,
        'tiktok', ap.tiktok,
        'website', ap.website,
        'photo_path', ap.photo_path,
        'portfolio_paths', coalesce(to_jsonb(ap.portfolio_paths), '[]'::jsonb),
        'use_studio_location', ap.use_studio_location,
        'address_line', ap.address_line,
        'city', ap.city,
        'state', ap.state,
        'postal_code', ap.postal_code,
        'latitude', ap.latitude,
        'longitude', ap.longitude,
        'address_references', ap.address_references,
        'google_maps_url', ap.google_maps_url,
        'created_at', ap.created_at,
        'updated_at', ap.updated_at
      )
      order by ap.updated_at desc
    ),
    '[]'::jsonb
  )
  into v_artist_profiles
  from artist_profiles ap
  where ap.artist_id = any(v_artist_ids);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'display_name', p.display_name,
        'email', p.email,
        'phone', p.phone,
        'default_role', p.default_role,
        'status', p.status,
        'created_at', p.created_at,
        'updated_at', p.updated_at,
        'archived_at', p.archived_at
      )
      order by p.created_at desc
    ),
    '[]'::jsonb
  )
  into v_profiles
  from profiles p
  join artists a on a.profile_id = p.id
  where a.id = any(v_artist_ids);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', asm.id,
        'artist_id', asm.artist_id,
        'artistId', asm.artist_id,
        'studio_id', asm.studio_id,
        'studioId', asm.studio_id,
        'role', asm.role,
        'status', asm.status,
        'started_at', asm.started_at,
        'ended_at', asm.ended_at,
        'created_at', asm.created_at,
        'updated_at', asm.updated_at,
        'archived_at', asm.archived_at
      )
      order by asm.created_at desc
    ),
    '[]'::jsonb
  )
  into v_memberships
  from artist_studio_memberships asm
  where asm.artist_id = any(v_artist_ids)
    and asm.status <> 'archived'
    and (
      v_is_platform_owner
      or asm.studio_id = any(v_scoped_studio_ids)
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'owner_profile_id', s.owner_profile_id,
        'name', s.name,
        'studio_status', s.studio_status,
        'risk_score', s.risk_score,
        'created_at', s.created_at,
        'updated_at', s.updated_at,
        'approved_at', s.approved_at,
        'suspended_at', s.suspended_at,
        'archived_at', s.archived_at,
        'profile', case
          when sp.id is null then null
          else jsonb_build_object(
            'id', sp.id,
            'studio_id', sp.studio_id,
            'commercial_name', sp.commercial_name,
            'description', sp.description,
            'email', sp.email,
            'phone', sp.phone,
            'address_line', sp.address_line,
            'city', sp.city,
            'geo_lat', sp.geo_lat,
            'geo_lng', sp.geo_lng,
            'logo_path', sp.logo_path,
            'gallery_paths', coalesce(to_jsonb(sp.gallery_paths), '[]'::jsonb),
            'created_at', sp.created_at,
            'updated_at', sp.updated_at
          )
        end
      )
      order by s.created_at desc
    ),
    '[]'::jsonb
  )
  into v_studios
  from studios s
  left join studio_profiles sp on sp.studio_id = s.id
  where v_is_platform_owner
    or s.id = any(v_scoped_studio_ids)
    or exists (
      select 1
      from artist_studio_memberships asm
      where asm.studio_id = s.id
        and asm.artist_id = any(v_artist_ids)
        and asm.status <> 'archived'
    );

  return jsonb_build_object(
    'artists', v_artists,
    'artist_profiles', v_artist_profiles,
    'profiles', v_profiles,
    'memberships', v_memberships,
    'studios', v_studios
  );
end;
$$;

revoke all on function public.studio_flow_admin_get_artists() from public;
grant execute on function public.studio_flow_admin_get_artists() to authenticated;
