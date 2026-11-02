create or replace function public.studio_flow_public_dennis_catalog()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with published as (
    select entry.value as listing
    from jsonb_array_elements(
      coalesce(public.studio_flow_public_booking_get_listings()->'listings', '[]'::jsonb)
    ) as entry(value)
    where entry.value->>'listingId' = '6c5b751e-700c-4bcd-a12e-f6876792f43e'
    limit 1
  )
  select jsonb_build_object(
    'listingId', published.listing->>'listingId',
    'services', coalesce(published.listing->'services', '[]'::jsonb),
    'flowPointsEnabled', coalesce(preferences.flow_points_enabled, false),
    'flowPointsRewardPercentage', coalesce(preferences.flow_points_reward_percentage, 5)
  )
  from published
  left join public.artist_marketing_preferences as preferences
    on preferences.artist_id = 'ea078c9a-b939-4fe6-98e1-05a4d1488379'::uuid;
$$;

revoke execute on function public.studio_flow_public_dennis_catalog() from public;
grant execute on function public.studio_flow_public_dennis_catalog() to anon, authenticated;
