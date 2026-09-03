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
        'logoUrl', sp.logo_path,
        'logo_url', sp.logo_path,
        'logoPath', sp.logo_path,
        'logo_path', sp.logo_path,
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
        'created_at', s.created_at,
        'profile', jsonb_build_object(
          'commercialName', coalesce(sp.commercial_name, s.name),
          'commercial_name', coalesce(sp.commercial_name, s.name),
          'description', sp.description,
          'email', sp.email,
          'phone', sp.phone,
          'hours', sp.hours,
          'city', sp.city,
          'addressLine', sp.address_line,
          'address_line', sp.address_line,
          'logoUrl', sp.logo_path,
          'logo_url', sp.logo_path,
          'logoPath', sp.logo_path,
          'logo_path', sp.logo_path
        )
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

revoke all on function public.studio_flow_get_own_studios() from public;
grant execute on function public.studio_flow_get_own_studios() to authenticated;
