begin;
do $$
declare target record; day date; rows jsonb; expected integer;
begin
 if current_database()<>'studioflow_audit_verified_20260913' then raise exception 'Isolated database required'; end if;
 perform set_config('request.jwt.claim.sub',(select id::text from public.profiles where default_role='platform_owner' and status='active' limit 1),true);
 for target in select 'artist' as kind,artist_id as id from public.appointments union select 'studio',studio_id from public.appointments where studio_id is not null loop
   select (starts_at at time zone 'America/Mexico_City')::date into day from public.appointments where (target.kind='artist' and artist_id=target.id) or (target.kind='studio' and studio_id=target.id) limit 1;
   rows:=public.studio_flow_owner_get_agenda(target.kind,target.id,0,day);
   select least(count(*),10)::int into expected from public.appointments where ((target.kind='artist' and artist_id=target.id) or (target.kind='studio' and studio_id=target.id)) and (starts_at at time zone 'America/Mexico_City')::date=day;
   if jsonb_array_length(rows)<>expected then raise exception 'Wrong day result count'; end if;
   if exists(select 1 from jsonb_array_elements(rows) r where ((r->>'startsAt')::timestamptz at time zone 'America/Mexico_City')::date<>day) then raise exception 'Wrong local day'; end if;
   rows:=public.studio_flow_owner_get_agenda(target.kind,target.id,0,null);
   if jsonb_array_length(rows)>10 then raise exception 'Page too large'; end if;
   if exists(select 1 from jsonb_array_elements(rows) x join jsonb_array_elements(public.studio_flow_owner_get_agenda(target.kind,target.id,10,null)) y on x->>'id'=y->>'id') then raise exception 'Duplicate across pages'; end if;
 end loop;
 raise notice 'PASS: artist/studio date filter and ten-item pagination';
end $$;
rollback;
