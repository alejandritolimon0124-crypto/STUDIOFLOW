create or replace function public.studio_flow_public_booking_get_listings()
returns jsonb
language sql
stable
as $$
  with source as (
    select public.studio_flow_marketplace_get_listings() as payload
  )
  select jsonb_set(
    payload,
    '{listings}',
    coalesce((
      select jsonb_agg(jsonb_set(
        listing,
        '{profile}',
        coalesce(listing->'profile', '{}'::jsonb)
          - 'portfolioPaths' - 'portfolio_paths' - 'photoPath' - 'photo_path'
      ))
      from jsonb_array_elements(payload->'listings') as listing
    ), '[]'::jsonb)
  )
  from source;
$$;

revoke execute on function public.studio_flow_public_booking_get_listings() from public;
grant execute on function public.studio_flow_public_booking_get_listings() to anon, authenticated;
