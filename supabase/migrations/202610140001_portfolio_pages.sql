create or replace function public.studio_flow_artist_get_own_portfolio_page(
  p_artist_id uuid,
  p_offset integer default 0
)
returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  select jsonb_build_object(
    'photos', to_jsonb(coalesce(ap.portfolio_paths[gREATEST(p_offset, 0) + 1:LEAST(GREATEST(p_offset, 0) + 3, 12)], array[]::text[])),
    'total', LEAST(coalesce(cardinality(ap.portfolio_paths), 0), 12)
  )
  from public.artists a
  join public.profiles p on p.id = a.profile_id and p.status = 'active'
  join public.artist_profiles ap on ap.artist_id = a.id
  where a.id = p_artist_id
    and a.profile_id = auth.uid()
    and p_offset between 0 and 11;
$$;

create or replace function public.studio_flow_marketplace_get_listing_portfolio_page(
  p_listing_id uuid,
  p_offset integer default 0
)
returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  with listing_photos as (
    select case when mp.profile_type = 'studio' then sp.gallery_paths else ap.portfolio_paths end as paths
    from public.marketplace_listings ml
    join public.marketplace_profiles mp on mp.id = ml.marketplace_profile_id
    left join public.artist_studio_memberships membership
      on membership.id = coalesce(ml.membership_id, mp.membership_id)
    left join public.artist_profiles ap
      on ap.artist_id = coalesce(ml.artist_id, mp.artist_id, membership.artist_id)
    left join public.studio_profiles sp
      on sp.studio_id = coalesce(ml.studio_id, mp.studio_id, membership.studio_id)
    where ml.id = p_listing_id
      and auth.uid() is not null
      and ml.visibility_status = 'visible'
      and mp.visibility_status = 'visible'
      and (ml.expires_at is null or ml.expires_at > now())
      and p_offset between 0 and 11
  )
  select jsonb_build_object(
    'photos', to_jsonb(coalesce(paths[GREATEST(p_offset, 0) + 1:LEAST(GREATEST(p_offset, 0) + 3, 12)], array[]::text[])),
    'total', LEAST(coalesce(cardinality(paths), 0), 12)
  )
  from listing_photos;
$$;

revoke execute on function public.studio_flow_artist_get_own_portfolio_page(uuid, integer) from public, anon;
revoke execute on function public.studio_flow_marketplace_get_listing_portfolio_page(uuid, integer) from public, anon;
grant execute on function public.studio_flow_artist_get_own_portfolio_page(uuid, integer) to authenticated;
grant execute on function public.studio_flow_marketplace_get_listing_portfolio_page(uuid, integer) to authenticated;
