\set ON_ERROR_STOP on
begin;
do $$
declare s public.studios%rowtype; state text; denied boolean;
begin
 if current_database()<>'studioflow_audit_verified_20260913' then raise exception 'Isolated audit required'; end if;
 select * into strict s from studios limit 1;
 perform set_config('request.jwt.claim.sub',s.owner_profile_id::text,true);
 foreach state in array array['pending','approved','suspended','rejected'] loop
  update studios set studio_status=state::studio_status where id=s.id;
  denied:=false;
  begin
   perform studio_flow_bootstrap_studio('Audit second','Audit second','Audit city');
  exception when others then
   if sqlerrm not like '%Solo puedes registrar un estudio%' then raise; end if;
   denied:=true;
  end;
  if not denied then raise exception 'Second studio accepted for %',state; end if;
  raise notice 'PASS: second studio rejected for %',state;
 end loop;
 update studios set archived_at=now() where id=s.id;
 denied:=false;
 begin
  insert into studios(owner_profile_id,name) values(s.owner_profile_id,'Audit duplicate');
 exception when unique_violation then denied:=true;
 end;
 if not denied then raise exception 'Unique owner constraint missing'; end if;
 raise notice 'PASS: direct insert blocked even with archived original';
end;$$;
rollback;
