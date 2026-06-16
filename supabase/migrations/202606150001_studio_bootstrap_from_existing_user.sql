create or replace function public.studio_flow_bootstrap_studio(
  p_studio_name text,
  p_commercial_name text,
  p_city text,
  p_phone text default null,
  p_email text default null,
  p_address_line text default null,
  p_geo_lat numeric default null,
  p_geo_lng numeric default null,
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile profiles%rowtype;
  v_role_id uuid;
  v_studio studios%rowtype;
  v_studio_profile studio_profiles%rowtype;
  v_role_assignment user_role_assignments%rowtype;
  v_governance_review governance_reviews%rowtype;
  v_studio_name text := nullif(trim(coalesce(p_studio_name, '')), '');
  v_commercial_name text := nullif(trim(coalesce(p_commercial_name, '')), '');
  v_city text := nullif(trim(coalesce(p_city, '')), '');
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_address_line text := nullif(trim(coalesce(p_address_line, '')), '');
  v_description text := nullif(trim(coalesce(p_description, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Auth session required';
  end if;

  select *
  into v_profile
  from profiles
  where id = auth.uid()
  for update;

  if v_profile.id is null then
    raise exception 'Profile required';
  end if;

  if v_profile.status <> 'active' then
    raise exception 'Active profile required';
  end if;

  if v_studio_name is null then
    raise exception 'Studio name is required';
  end if;

  if v_commercial_name is null then
    raise exception 'Commercial name is required';
  end if;

  if v_city is null then
    raise exception 'City is required';
  end if;

  if (p_geo_lat is null and p_geo_lng is not null)
    or (p_geo_lat is not null and p_geo_lng is null)
  then
    raise exception 'Latitude and longitude must be provided together';
  end if;

  if p_geo_lat is not null and (p_geo_lat < -90 or p_geo_lat > 90) then
    raise exception 'Latitude is out of range';
  end if;

  if p_geo_lng is not null and (p_geo_lng < -180 or p_geo_lng > 180) then
    raise exception 'Longitude is out of range';
  end if;

  if exists (
    select 1
    from studios studio
    left join user_role_assignments ura
      on ura.studio_id = studio.id
      and ura.profile_id = v_profile.id
      and ura.status = 'active'
    left join roles role
      on role.id = ura.role_id
      and role.code = 'studio_owner'
    where studio.archived_at is null
      and studio.studio_status in ('pending', 'approved')
      and (
        studio.owner_profile_id = v_profile.id
        or role.id is not null
      )
  ) then
    raise exception 'This profile already owns an active or pending studio';
  end if;

  select id
  into v_role_id
  from roles
  where code = 'studio_owner';

  if v_role_id is null then
    raise exception 'Studio owner role is not configured';
  end if;

  insert into studios (
    owner_profile_id,
    name,
    studio_status
  )
  values (
    v_profile.id,
    v_studio_name,
    'pending'
  )
  returning *
  into v_studio;

  insert into studio_profiles (
    studio_id,
    commercial_name,
    description,
    email,
    phone,
    address_line,
    city,
    geo_lat,
    geo_lng
  )
  values (
    v_studio.id,
    v_commercial_name,
    v_description,
    coalesce(v_email, v_profile.email),
    coalesce(v_phone, v_profile.phone),
    v_address_line,
    v_city,
    p_geo_lat,
    p_geo_lng
  )
  returning *
  into v_studio_profile;

  insert into user_role_assignments (
    profile_id,
    role_id,
    studio_id,
    status,
    assigned_by_profile_id
  )
  values (
    v_profile.id,
    v_role_id,
    v_studio.id,
    'active',
    v_profile.id
  )
  on conflict (profile_id, role_id, studio_id)
  where status = 'active'
  do update
  set
    revoked_at = null,
    updated_at = now()
  returning *
  into v_role_assignment;

  insert into governance_reviews (
    studio_id,
    review_type,
    status,
    reason
  )
  values (
    v_studio.id,
    'onboarding',
    'open',
    'studio_created_by_existing_user'
  )
  returning *
  into v_governance_review;

  return jsonb_build_object(
    'studio', jsonb_build_object(
      'id', v_studio.id,
      'studioId', v_studio.id,
      'studio_id', v_studio.id,
      'ownerProfileId', v_studio.owner_profile_id,
      'owner_profile_id', v_studio.owner_profile_id,
      'name', v_studio.name,
      'studioStatus', v_studio.studio_status,
      'studio_status', v_studio.studio_status,
      'createdAt', v_studio.created_at,
      'created_at', v_studio.created_at,
      'updatedAt', v_studio.updated_at,
      'updated_at', v_studio.updated_at
    ),
    'studioProfile', jsonb_build_object(
      'id', v_studio_profile.id,
      'studioId', v_studio_profile.studio_id,
      'studio_id', v_studio_profile.studio_id,
      'commercialName', v_studio_profile.commercial_name,
      'commercial_name', v_studio_profile.commercial_name,
      'description', v_studio_profile.description,
      'email', v_studio_profile.email,
      'phone', v_studio_profile.phone,
      'addressLine', v_studio_profile.address_line,
      'address_line', v_studio_profile.address_line,
      'city', v_studio_profile.city,
      'geoLat', v_studio_profile.geo_lat,
      'geo_lat', v_studio_profile.geo_lat,
      'geoLng', v_studio_profile.geo_lng,
      'geo_lng', v_studio_profile.geo_lng,
      'createdAt', v_studio_profile.created_at,
      'created_at', v_studio_profile.created_at,
      'updatedAt', v_studio_profile.updated_at,
      'updated_at', v_studio_profile.updated_at
    ),
    'roleAssignment', jsonb_build_object(
      'id', v_role_assignment.id,
      'profileId', v_role_assignment.profile_id,
      'profile_id', v_role_assignment.profile_id,
      'roleId', v_role_assignment.role_id,
      'role_id', v_role_assignment.role_id,
      'role', 'studio_owner',
      'studioId', v_role_assignment.studio_id,
      'studio_id', v_role_assignment.studio_id,
      'status', v_role_assignment.status
    ),
    'governanceReview', jsonb_build_object(
      'id', v_governance_review.id,
      'studioId', v_governance_review.studio_id,
      'studio_id', v_governance_review.studio_id,
      'reviewType', v_governance_review.review_type,
      'review_type', v_governance_review.review_type,
      'status', v_governance_review.status,
      'reason', v_governance_review.reason,
      'createdAt', v_governance_review.created_at,
      'created_at', v_governance_review.created_at
    )
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

revoke all on function public.studio_flow_bootstrap_studio(
  text,
  text,
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  text
) from public;
revoke all on function public.studio_flow_get_own_studios() from public;

grant execute on function public.studio_flow_bootstrap_studio(
  text,
  text,
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  text
) to authenticated;
grant execute on function public.studio_flow_get_own_studios() to authenticated;
