begin;
do $$
declare f text; r text;
begin
  if current_database()<>'studioflow_audit_verified_20260913' then raise exception 'Isolated database required'; end if;
  foreach f in array array[
    'public.studio_flow_artist_schedule_payload(uuid)',
    'public.studio_flow_client_monthly_points_balance(uuid)',
    'public.studio_flow_sync_appointment_commission(uuid)'
  ] loop
    foreach r in array array['anon','authenticated'] loop
      if has_function_privilege(r,f,'EXECUTE') then raise exception 'Helper still exposed: % / %',r,f; end if;
    end loop;
  end loop;
  raise notice 'PASS: all three helpers reject anonymous and authenticated API roles';
end $$;
select set_config('request.jwt.claim.sub',(
  select c.profile_id::text from clients c join profiles p on p.id=c.profile_id
  where p.default_role='client' and p.status='active' and c.status='active' limit 1),true) is not null;
set local role authenticated;
do $$ begin
  if auth.uid() is null then raise exception 'Existing client required'; end if;
  perform studio_flow_client_get_flow_points_balance();
  perform studio_flow_get_own_client_profile();
  raise notice 'PASS: client keeps authorized points balance and own profile';
end $$;
reset role;
select set_config('request.jwt.claim.sub',(
  select a.profile_id::text from artists a join profiles p on p.id=a.profile_id
  where p.status='active' and a.status='active' limit 1),true) is not null;
set local role authenticated;
do $$ begin
  if auth.uid() is null then raise exception 'Existing artist required'; end if;
  perform studio_flow_artist_get_schedule_settings();
  perform studio_flow_get_accounting_summary(null);
  raise notice 'PASS: artist keeps authorized schedule and accounting';
end $$;
rollback;
