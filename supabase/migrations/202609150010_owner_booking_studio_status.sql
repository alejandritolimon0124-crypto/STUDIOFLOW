begin;
do $$
declare d text; marker text := '  v_studio_id := public.studio_flow_owner_assert_studio_access(p_studio_id);';
begin
 select pg_get_functiondef('public.studio_flow_owner_create_manual_appointment(uuid,uuid,uuid,uuid,uuid,text,text,text,text)'::regprocedure) into d;
 if position(marker in d)=0 then raise exception 'Unexpected owner booking function'; end if;
 d:=replace(d,marker,marker||$guard$
  perform 1 from public.studios s where s.id=v_studio_id
    and s.studio_status='approved' and s.archived_at is null for share;
  if not found then raise exception 'Studio is not available'; end if;
$guard$);
 execute d;
end $$;
commit;
