begin;
-- Only authorized definer service/reward RPCs may call these internal helpers.
revoke all on function public.studio_flow_artist_get_or_create_service_category(text) from public, anon, authenticated;
revoke all on function public.studio_flow_artist_get_or_create_service_tier(text) from public, anon, authenticated;
revoke all on function public.studio_flow_artist_service_to_json(uuid) from public, anon, authenticated;
revoke all on function public.studio_flow_client_points_balance_for_reward(uuid,uuid,uuid,boolean) from public, anon, authenticated;
commit;
