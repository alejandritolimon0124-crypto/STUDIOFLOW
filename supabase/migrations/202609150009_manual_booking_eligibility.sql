begin;
do $$
declare d text; marker text;
begin
 select pg_get_functiondef('public.studio_flow_artist_create_manual_appointment_core(uuid,uuid,date,time without time zone,text)'::regprocedure) into d;
 d:=replace(d,chr(13),'');
 marker:='    and status <> ''archived'';';
 if position(marker in d)=0 then raise exception 'Unexpected manual client guard'; end if;
 d:=replace(d,marker,'    and status = ''active'' and archived_at is null for share;');
 marker:='  select *'||chr(10)||'  into v_service';
 if position(marker in d)=0 then raise exception 'Unexpected manual service lookup'; end if;
 d:=replace(d,marker,$guard$
  if v_client.profile_id is not null then
    perform 1 from public.profiles p where p.id=v_client.profile_id and p.status='active' for share;
    if not found then raise exception 'Active client required'; end if;
  end if;
$guard$||marker);
 marker:='  perform pg_advisory_xact_lock(hashtextextended(v_artist.id::text, 0));';
 if position(marker in d)=0 then raise exception 'Unexpected manual booking lock'; end if;
 d:=replace(d,marker,$guard$
  if v_studio_id is not null then
    perform 1 from public.studios s where s.id=v_studio_id
      and s.studio_status='approved' and s.archived_at is null for share;
    if not found then raise exception 'Studio is not available'; end if;
  end if;
$guard$||marker);
 execute d;
end $$;
commit;
