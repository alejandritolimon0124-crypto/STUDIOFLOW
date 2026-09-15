begin;
-- Internal payload and audit writers are reached only through authorized definer RPCs.
revoke all on function public.studio_flow_admin_artist_payload(uuid) from public,anon,authenticated;
revoke all on function public.studio_flow_admin_governance_payload(uuid) from public,anon,authenticated;
revoke all on function public.studio_flow_record_claim_audit(text,public.artist_claim_invitations,uuid,jsonb) from public,anon,authenticated;
commit;
