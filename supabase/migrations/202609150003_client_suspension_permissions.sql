begin;
do $$
declare f text; d text; target text;
begin
  foreach f in array array['studio_flow_admin_activate_client','studio_flow_admin_deactivate_client'] loop
    select pg_get_functiondef(to_regprocedure('public.'||f||'(uuid)')) into d;
    target:='  v_context := studio_flow_admin_client_scope_context(p_client_id);';
    if position(target in d)=0 then raise exception 'Unexpected function: %',f; end if;
    d:=replace(d,target,'  perform public.studio_flow_admin_assert_platform_owner();'||chr(10)||target);
    execute d;
  end loop;
  select pg_get_functiondef('public.studio_flow_update_own_client_profile(jsonb)'::regprocedure) into d;
  target:='    and status <> ''archived''';
  if position(target in d)=0 then raise exception 'Unexpected client profile function'; end if;
  execute replace(d,target,'    and status = ''active''');
end $$;
commit;
