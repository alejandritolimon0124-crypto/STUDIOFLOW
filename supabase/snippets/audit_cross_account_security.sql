-- Diagnostic only. Existing restored data; every change is rolled back.
begin;
do $$
begin
  if current_database() <> 'studioflow_audit_verified_20260913' then
    raise exception 'Isolated audit database required';
  end if;
end $$;
select set_config('request.jwt.claim.sub', (
  select profile_id::text from public.clients
  where profile_id is not null and status = 'active' limit 1
), true) is not null as existing_client_selected;
set local role authenticated;
do $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'Existing client required'; end if;
  select count(*) into n from public.clients where profile_id is distinct from auth.uid();
  raise notice 'Other client rows accessible to a client: %', n;
  select count(*) into n from public.appointments a
  where not exists (select 1 from public.clients c where c.id=a.client_id and c.profile_id=auth.uid());
  raise notice 'Other client appointment rows accessible: %', n;
  begin
    update public.studio_profiles set description=description;
    get diagnostics n = row_count;
    if n > 0 then
      raise notice 'SECURITY FAILURE: client can update studio profile rows: %', n;
    else
      raise notice 'PASS: no studio profile rows writable by client';
    end if;
  exception when insufficient_privilege then
    raise notice 'PASS: studio profile update rejected';
  end;
  begin
    perform public.studio_flow_admin_get_clients();
    raise notice 'SECURITY FAILURE: client can call admin client list';
  exception when others then
    raise notice 'Admin client list rejected: %', sqlerrm;
  end;
end $$;
reset role;
savepoint role_escalation_probe;
set local role authenticated;
do $$
begin
  begin
    perform public.studio_flow_assign_role(auth.uid(), 'platform_owner', null);
    perform public.studio_flow_admin_get_billing_summary(null::date, ''::text);
    raise notice 'CRITICAL: client self-assigned platform_owner and accessed owner billing';
  exception when others then
    raise notice 'Role escalation rejected: %', sqlerrm;
  end;
end $$;
reset role;
rollback to savepoint role_escalation_probe;
savepoint bootstrap_role_probe;
set local role authenticated;
do $$
begin
  begin
    perform public.studio_flow_bootstrap_profile(null, null, 'platform_owner');
    perform public.studio_flow_admin_get_billing_summary(null::date, ''::text);
    raise notice 'CRITICAL: bootstrap granted platform_owner to a client';
  exception when others then
    raise notice 'Bootstrap role escalation rejected: %', sqlerrm;
  end;
end $$;
reset role;
rollback to savepoint bootstrap_role_probe;
select set_config('request.jwt.claim.sub', '', true) = '' as anonymous_identity;
set local role anon;
do $$
begin
  begin
    perform public.studio_flow_admin_get_clients();
    raise notice 'SECURITY FAILURE: anonymous admin client list accepted';
  exception when others then
    raise notice 'Anonymous admin client list rejected: %', sqlerrm;
  end;
end $$;
rollback;
