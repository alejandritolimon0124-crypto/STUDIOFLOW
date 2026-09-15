begin;
do $$
declare target record; day date; result jsonb; expected integer; denied boolean := false;
begin
 if current_database()<>'studioflow_audit_verified_20260913' then raise exception 'Isolated database required'; end if;
 perform set_config('request.jwt.claim.sub',(select id::text from profiles where default_role='platform_owner' and status='active' limit 1),true);
 for target in select 'artist' as kind,artist_id as id from appointments union select 'studio',studio_id from appointments where studio_id is not null loop
  select (starts_at at time zone 'America/Mexico_City')::date into day from appointments where (target.kind='artist' and artist_id=target.id) or (target.kind='studio' and studio_id=target.id) limit 1;
  result:=studio_flow_owner_export_events(target.kind,target.id,extract(year from day)::int,extract(month from day)::int);
  select count(*) into expected from appointments where ((target.kind='artist' and artist_id=target.id) or (target.kind='studio' and studio_id=target.id)) and date_trunc('month',starts_at at time zone 'America/Mexico_City')=date_trunc('month',day::timestamp);
  if jsonb_array_length(result->'events')<>expected then raise exception 'Monthly count mismatch'; end if;
  if result->'profile'->>'name' is null then raise exception 'Missing profile'; end if;
 end loop;
 perform set_config('request.jwt.claim.sub',(select a.profile_id::text from artists a join profiles p on p.id=a.profile_id where p.default_role='artist' and not exists(select 1 from user_role_assignments u join roles r on r.id=u.role_id where u.profile_id=p.id and r.code='platform_owner' and u.status='active') limit 1),true);
 begin perform studio_flow_owner_export_events('artist',(select id from artists limit 1),2026,9); exception when others then denied:=true; end;
 if not denied then raise exception 'Non-owner export allowed'; end if;
 raise notice 'PASS monthly exports, profile fields, owner-only access';
end $$;
rollback;
