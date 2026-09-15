begin;
do $$
declare d text; old_guard text := $old$  if v_studio_id is not null and exists (
    select 1
    from studios studio
    where studio.id = v_studio_id
      and (studio.archived_at is not null or studio.studio_status = 'suspended')
  ) then
    raise exception 'Studio is not available';
  end if;$old$;
begin
 select pg_get_functiondef('public.studio_flow_marketplace_book_appointment(uuid[],uuid,text)'::regprocedure) into d;
 d:=replace(d,chr(13),'');
 old_guard:=replace(old_guard,chr(13),'');
 if position(old_guard in d)=0 then raise exception 'Unexpected booking function'; end if;
 d:=replace(d,old_guard,$new$  if v_studio_id is not null then
    -- Serialize new studio bookings against approval and suspension changes.
    perform 1 from public.studios s
    where s.id=v_studio_id and s.studio_status='approved' and s.archived_at is null
    for share;
    if not found then
      raise exception 'Studio is not available';
    end if;
  end if;$new$);
 execute d;
end $$;
commit;
