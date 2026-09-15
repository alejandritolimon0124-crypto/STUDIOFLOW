begin;
do $$
declare f text; r text;
begin
  if current_database()<>'studioflow_audit_verified_20260913' then raise exception 'Isolated database required'; end if;
  foreach f in array array[
    'public.studio_flow_admin_artist_payload(uuid)',
    'public.studio_flow_admin_governance_payload(uuid)',
    'public.studio_flow_record_claim_audit(text,public.artist_claim_invitations,uuid,jsonb)'
  ] loop
    foreach r in array array['anon','authenticated'] loop
      if has_function_privilege(r,f,'EXECUTE') then raise exception 'Exposed helper: % / %',r,f; end if;
    end loop;
  end loop;
  raise notice 'PASS: administrative payloads and audit writer blocked for direct API callers';
end $$;
select set_config('request.jwt.claim.sub',(
  select p.id::text from profiles p where p.status='active' and p.default_role='platform_owner' limit 1
),true) is not null;
select set_config('audit.artist', (select id::text from artists where status='active' limit 1),true) is not null;
set local role authenticated;
do $$ begin
  if not studio_flow_security_is_owner() then raise exception 'Existing owner required'; end if;
  perform studio_flow_admin_get_governance_queue();
  perform studio_flow_admin_get_artists();
  perform studio_flow_admin_update_artist_profile(current_setting('audit.artist')::uuid,'{}'::jsonb);
  raise notice 'PASS: authorized owner governance, artists and profile update';
end $$;
reset role;
set local role anon;
do $$ begin
  begin
    perform studio_flow_admin_governance_payload(null);
    raise exception 'Anonymous governance access accepted';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS: anonymous governance helper rejects execution';
end $$;
rollback;
