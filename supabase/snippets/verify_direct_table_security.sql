begin;
do $$
declare t record;
begin
  if current_database() <> 'studioflow_audit_verified_20260913' then
    raise exception 'Isolated audit database required';
  end if;
  for t in select tablename from pg_tables where schemaname = 'public' loop
    if has_table_privilege('anon', format('public.%I',t.tablename), 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') then
      raise exception 'Anonymous table access remains: %', t.tablename;
    end if;
    if t.tablename <> 'studio_profiles' and has_table_privilege('authenticated',format('public.%I',t.tablename),'INSERT,UPDATE,DELETE,TRUNCATE') then
      raise exception 'Direct write access remains: %',t.tablename;
    end if;
  end loop;
  raise notice 'Anonymous table access and direct writes blocked (studio profile upsert excluded).';
end $$;
set local role anon;
do $$
begin
  begin
    perform id from public.profiles limit 1;
    raise exception 'Anonymous private profile read succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', (
  select profile_id::text from public.clients where profile_id is not null and status = 'active' limit 1
), true);
set local role authenticated;
do $$
declare result jsonb;
begin
  result := public.studio_flow_get_own_client_profile();
  if result is null then raise exception 'Own profile RPC returned null'; end if;
  perform public.studio_flow_marketplace_get_listings();
  begin
    perform public.studio_flow_admin_get_billing_summary(null::date, ''::text);
    raise exception 'Client accessed owner billing';
  exception when others then
    if sqlerrm = 'Client accessed owner billing' then raise; end if;
    raise notice 'Owner billing rejects client: %', sqlerrm;
  end;
  begin
    update public.appointments set status = status where false;
    raise exception 'Direct appointment update permitted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform id from public.flow_point_ledger limit 1;
    raise exception 'Direct points ledger read permitted';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
