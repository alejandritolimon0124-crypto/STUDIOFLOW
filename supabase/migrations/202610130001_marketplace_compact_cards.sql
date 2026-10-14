create or replace function public.studio_flow_marketplace_get_compact_listings()
returns jsonb
language sql
security invoker
set search_path = public, auth
as $$
  select jsonb_set(
    payload,
    '{listings}',
    coalesce((
      select jsonb_agg(
        listing #- '{profile,portfolioPaths}'
                #- '{profile,portfolio_paths}'
                #- '{profile,photoPath}'
                #- '{profile,photo_path}'
      )
      from jsonb_array_elements(coalesce(payload->'listings', '[]'::jsonb)) listing
    ), '[]'::jsonb)
  )
  from (select public.studio_flow_marketplace_get_listings() as payload) source;
$$;

create or replace function public.studio_flow_marketplace_get_listing_portfolio(p_listing_id uuid)
returns jsonb
language sql
security definer
set search_path = public, auth
as $$
  select coalesce(to_jsonb(ap.portfolio_paths), '[]'::jsonb)
  from marketplace_listings ml
  join marketplace_profiles mp on mp.id = ml.marketplace_profile_id
  left join artist_studio_memberships membership
    on membership.id = coalesce(ml.membership_id, mp.membership_id)
  left join artist_profiles ap
    on ap.artist_id = coalesce(ml.artist_id, mp.artist_id, membership.artist_id)
  where ml.id = p_listing_id
    and auth.uid() is not null
    and ml.visibility_status = 'visible'
    and mp.visibility_status = 'visible'
    and (ml.expires_at is null or ml.expires_at > now());
$$;

revoke all on function public.studio_flow_marketplace_get_compact_listings() from public;
revoke all on function public.studio_flow_marketplace_get_listing_portfolio(uuid) from public;
grant execute on function public.studio_flow_marketplace_get_compact_listings() to authenticated;
grant execute on function public.studio_flow_marketplace_get_listing_portfolio(uuid) to authenticated;
