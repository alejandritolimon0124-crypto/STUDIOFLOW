begin;
do $$
declare d text; marker text := '  if v_client.id is null then';
begin
 select pg_get_functiondef('public.studio_flow_owner_create_manual_appointment(uuid,uuid,uuid,uuid,uuid,text,text,text,text)'::regprocedure) into d;
 d:=replace(d,chr(13),'');
 if position(marker in d)=0 then raise exception 'Unexpected owner client lookup'; end if;
 -- Include inactive/archived matches so they are rejected instead of recreated.
 d:=replace(d,'      and status <> ''archived'';','      for share;');
 d:=replace(d,'      and status <> ''archived'''||chr(10),'');
 d:=replace(d,'    limit 1;','    limit 1 for share;');
 d:=replace(d,marker,$guard$
  if p_client_id is not null and v_client.id is null then
    raise exception 'Active client required';
  end if;
  if v_client.id is not null then
    if v_client.status <> 'active' or v_client.archived_at is not null then
      raise exception 'Active client required';
    end if;
    if v_client.profile_id is not null then
      perform 1 from public.profiles p where p.id=v_client.profile_id and p.status='active' for share;
      if not found then raise exception 'Active client required'; end if;
    end if;
  end if;
$guard$||marker);
 execute d;
end $$;
commit;
