create or replace function public.studio_flow_admin_artist_payload(
  p_artist_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_artist_ids uuid[];
  v_artists jsonb;
  v_artist_profiles jsonb;
  v_profiles jsonb;
  v_memberships jsonb;
  v_studios jsonb;
begin
  v_artist_ids := array[p_artist_id];

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
    and asm.status <> 'archived';

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
  where exists (
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

create or replace function public.studio_flow_admin_assert_can_manage_artist(
  p_artist_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile profiles%rowtype;
  v_is_platform_owner boolean := false;
  v_scoped_studio_ids uuid[];
  v_membership artist_studio_memberships%rowtype;
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

  if v_is_platform_owner then
    select *
    into v_membership
    from artist_studio_memberships
    where artist_id = p_artist_id
      and status <> 'archived'
    order by created_at desc
    limit 1;
  else
    select *
    into v_membership
    from artist_studio_memberships
    where artist_id = p_artist_id
      and studio_id = any(v_scoped_studio_ids)
      and status <> 'archived'
    order by created_at desc
    limit 1;

    if v_membership.id is null then
      raise exception 'Admin scope does not allow managing this artist';
    end if;
  end if;

  return jsonb_build_object(
    'actor_profile_id', v_profile.id,
    'is_platform_owner', v_is_platform_owner,
    'studio_id', v_membership.studio_id,
    'membership_id', v_membership.id
  );
end;
$$;

create or replace function public.studio_flow_admin_activate_artist(
  p_artist_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_context jsonb;
  v_before artists%rowtype;
  v_after artists%rowtype;
begin
  v_context := studio_flow_admin_assert_can_manage_artist(p_artist_id);

  select *
  into v_before
  from artists
  where id = p_artist_id
  for update;

  if v_before.id is null then
    raise exception 'Artist not found';
  end if;

  if v_before.status = 'archived' then
    raise exception 'Archived artists cannot be activated';
  end if;

  update artists
  set status = 'active', updated_at = now()
  where id = v_before.id
  returning *
  into v_after;

  if nullif(v_context ->> 'membership_id', '') is not null then
    update artist_studio_memberships
    set status = 'active', updated_at = now()
    where id = (v_context ->> 'membership_id')::uuid
      and status <> 'archived';
  end if;

  insert into audit_events (
    actor_profile_id,
    context,
    entity_type,
    entity_id,
    studio_id,
    artist_id,
    membership_id,
    event_type,
    before_data,
    after_data
  )
  values (
    (v_context ->> 'actor_profile_id')::uuid,
    'identity',
    'artist',
    v_after.id,
    nullif(v_context ->> 'studio_id', '')::uuid,
    v_after.id,
    nullif(v_context ->> 'membership_id', '')::uuid,
    'artist_activated',
    to_jsonb(v_before),
    to_jsonb(v_after)
  );

  return studio_flow_admin_artist_payload(v_after.id);
end;
$$;

create or replace function public.studio_flow_admin_deactivate_artist(
  p_artist_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_context jsonb;
  v_before artists%rowtype;
  v_after artists%rowtype;
begin
  v_context := studio_flow_admin_assert_can_manage_artist(p_artist_id);

  select *
  into v_before
  from artists
  where id = p_artist_id
  for update;

  if v_before.id is null then
    raise exception 'Artist not found';
  end if;

  if v_before.status = 'archived' then
    raise exception 'Archived artists cannot be deactivated';
  end if;

  update artists
  set status = 'inactive', updated_at = now()
  where id = v_before.id
  returning *
  into v_after;

  if nullif(v_context ->> 'membership_id', '') is not null then
    update artist_studio_memberships
    set status = 'inactive', updated_at = now()
    where id = (v_context ->> 'membership_id')::uuid
      and status <> 'archived';
  end if;

  insert into audit_events (
    actor_profile_id,
    context,
    entity_type,
    entity_id,
    studio_id,
    artist_id,
    membership_id,
    event_type,
    before_data,
    after_data
  )
  values (
    (v_context ->> 'actor_profile_id')::uuid,
    'identity',
    'artist',
    v_after.id,
    nullif(v_context ->> 'studio_id', '')::uuid,
    v_after.id,
    nullif(v_context ->> 'membership_id', '')::uuid,
    'artist_deactivated',
    to_jsonb(v_before),
    to_jsonb(v_after)
  );

  return studio_flow_admin_artist_payload(v_after.id);
end;
$$;

create or replace function public.studio_flow_admin_update_artist_profile(
  p_artist_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_context jsonb;
  v_artist_before artists%rowtype;
  v_artist_after artists%rowtype;
  v_profile_before artist_profiles%rowtype;
  v_profile_after artist_profiles%rowtype;
  v_name text;
  v_description text;
  v_city text;
  v_services text[];
  v_location jsonb;
  v_custom_location jsonb;
begin
  v_context := studio_flow_admin_assert_can_manage_artist(p_artist_id);

  select *
  into v_artist_before
  from artists
  where id = p_artist_id
  for update;

  if v_artist_before.id is null then
    raise exception 'Artist not found';
  end if;

  if v_artist_before.status = 'archived' then
    raise exception 'Archived artists cannot be edited';
  end if;

  select *
  into v_profile_before
  from artist_profiles
  where artist_id = p_artist_id
  for update;

  v_name := coalesce(
    nullif(trim(coalesce(p_patch ->> 'name', '')), ''),
    v_profile_before.artistic_name,
    v_artist_before.display_name
  );
  v_description := case
    when p_patch ? 'description' then nullif(trim(coalesce(p_patch ->> 'description', '')), '')
    else v_profile_before.bio
  end;
  v_city := coalesce(
    nullif(trim(coalesce(p_patch ->> 'city', '')), ''),
    v_profile_before.city
  );
  v_location := coalesce(p_patch -> 'professionalLocation', '{}'::jsonb);
  v_custom_location := coalesce(v_location -> 'customLocation', '{}'::jsonb);

  if p_patch ? 'services' then
    v_services := array(
      select nullif(trim(item.value), '')
      from unnest(string_to_array(coalesce(p_patch ->> 'services', ''), ',')) as item(value)
      where nullif(trim(item.value), '') is not null
    );
  else
    v_services := v_profile_before.specialties;
  end if;

  update artists
  set display_name = v_name, updated_at = now()
  where id = p_artist_id
  returning *
  into v_artist_after;

  insert into artist_profiles (
    artist_id,
    artistic_name,
    bio,
    specialties,
    primary_specialty,
    city,
    use_studio_location,
    address_line,
    state,
    postal_code,
    latitude,
    longitude,
    address_references,
    google_maps_url,
    updated_at
  )
  values (
    p_artist_id,
    v_name,
    v_description,
    v_services,
    coalesce(v_services[1], v_profile_before.primary_specialty),
    coalesce(nullif(trim(coalesce(v_custom_location ->> 'city', '')), ''), v_city),
    coalesce((v_location ->> 'useStudioLocation')::boolean, v_profile_before.use_studio_location, true),
    coalesce(nullif(trim(coalesce(v_custom_location ->> 'address', '')), ''), v_profile_before.address_line),
    coalesce(nullif(trim(coalesce(v_custom_location ->> 'state', '')), ''), v_profile_before.state),
    coalesce(nullif(trim(coalesce(v_custom_location ->> 'postalCode', '')), ''), v_profile_before.postal_code),
    coalesce(nullif(trim(coalesce(v_custom_location ->> 'latitude', '')), '')::numeric, v_profile_before.latitude),
    coalesce(nullif(trim(coalesce(v_custom_location ->> 'longitude', '')), '')::numeric, v_profile_before.longitude),
    coalesce(nullif(trim(coalesce(v_custom_location ->> 'address_references', '')), ''), v_profile_before.address_references),
    coalesce(nullif(trim(coalesce(v_custom_location ->> 'googleMapsUrl', '')), ''), v_profile_before.google_maps_url),
    now()
  )
  on conflict (artist_id) do update
  set
    artistic_name = excluded.artistic_name,
    bio = excluded.bio,
    specialties = excluded.specialties,
    primary_specialty = excluded.primary_specialty,
    city = excluded.city,
    use_studio_location = excluded.use_studio_location,
    address_line = excluded.address_line,
    state = excluded.state,
    postal_code = excluded.postal_code,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    address_references = excluded.address_references,
    google_maps_url = excluded.google_maps_url,
    updated_at = now()
  returning *
  into v_profile_after;

  insert into audit_events (
    actor_profile_id,
    context,
    entity_type,
    entity_id,
    studio_id,
    artist_id,
    membership_id,
    event_type,
    before_data,
    after_data
  )
  values (
    (v_context ->> 'actor_profile_id')::uuid,
    'identity',
    'artist_profile',
    v_profile_after.id,
    nullif(v_context ->> 'studio_id', '')::uuid,
    p_artist_id,
    nullif(v_context ->> 'membership_id', '')::uuid,
    'admin_artist_profile_updated',
    jsonb_build_object('artist', to_jsonb(v_artist_before), 'artist_profile', to_jsonb(v_profile_before)),
    jsonb_build_object('artist', to_jsonb(v_artist_after), 'artist_profile', to_jsonb(v_profile_after))
  );

  return studio_flow_admin_artist_payload(p_artist_id);
end;
$$;

revoke all on function public.studio_flow_admin_artist_payload(uuid) from public;
revoke all on function public.studio_flow_admin_assert_can_manage_artist(uuid) from public;
revoke all on function public.studio_flow_admin_activate_artist(uuid) from public;
revoke all on function public.studio_flow_admin_deactivate_artist(uuid) from public;
revoke all on function public.studio_flow_admin_update_artist_profile(uuid, jsonb) from public;

grant execute on function public.studio_flow_admin_activate_artist(uuid) to authenticated;
grant execute on function public.studio_flow_admin_deactivate_artist(uuid) to authenticated;
grant execute on function public.studio_flow_admin_update_artist_profile(uuid, jsonb) to authenticated;
