\set ON_ERROR_STOP on
begin;
do $$
declare actor uuid; foreign_ids uuid[]; own_ids uuid[];
begin
 if current_database()<>'studioflow_audit_verified_20260913' then raise exception 'Isolated audit required'; end if;
 select c.profile_id into strict actor from clients c join profiles p on p.id=c.profile_id
 where c.status='active' and p.status='active'
 and exists(select 1 from appointments a where a.client_id=c.id)
 and exists(select 1 from appointments a where a.client_id<>c.id)
 limit 1;
 select array_agg(a.id) into foreign_ids from appointments a join clients c on c.id=a.client_id where c.profile_id is distinct from actor;
 select array_agg(a.id) into own_ids from appointments a join clients c on c.id=a.client_id
 join appointment_economies e on e.appointment_id=a.id where c.profile_id=actor;
 if cardinality(foreign_ids)=0 or cardinality(own_ids)=0 then raise exception 'Fixtures required'; end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('audit.foreign_ids',foreign_ids::text,true);
 perform set_config('audit.own_ids',own_ids::text,true);
end;$$;
set local role authenticated;
do $$
declare result jsonb; denied boolean:=false;
begin
 result:=studio_flow_get_appointment_payment_details(current_setting('audit.foreign_ids')::uuid[]);
 if result<>'{}'::jsonb then raise exception 'FAIL: foreign payment details exposed'; end if;
 result:=studio_flow_get_appointment_payment_details(current_setting('audit.own_ids')::uuid[]);
 if result='{}'::jsonb then raise exception 'FAIL: own payment details unavailable'; end if;
 raise notice 'PASS: own payment details accessible; foreign payment details hidden';
 begin
 perform studio_flow_owner_export_events('artist',gen_random_uuid(),2026,9);
 exception when insufficient_privilege then denied:=true;
 when others then
 if sqlerrm not like '%owner%' and sqlerrm not like '%Owner%' and sqlerrm not like '%Admin%' then raise; end if;
 denied:=true;
 end;
 if not denied then raise exception 'FAIL: client accessed owner export'; end if;
 raise notice 'PASS: client cannot invoke owner event export';
end;$$;
rollback;
