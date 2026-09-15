begin;
-- These helpers are called by authorized definer RPCs/triggers, never directly by the UI.
revoke all on function public.studio_flow_artist_schedule_payload(uuid) from public, anon, authenticated;
revoke all on function public.studio_flow_client_monthly_points_balance(uuid) from public, anon, authenticated;
revoke all on function public.studio_flow_sync_appointment_commission(uuid) from public, anon, authenticated;
commit;
