begin;
do $$
declare a record; before_count bigint; rejected boolean;
begin
 if current_database()<>'studioflow_audit_verified_20260913' then raise exception 'Isolated database required'; end if;
 select ap.*,ar.profile_id as actor,c.profile_id as client_actor into a
 from appointments ap join artists ar on ar.id=ap.artist_id
 join clients c on c.id=ap.client_id join profiles p on p.id=ar.profile_id
 where ar.status='active' and p.status='active' and c.profile_id is not null
 and ap.status in ('scheduled','completed') limit 1;
 if a.id is null then raise exception 'Existing appointment required'; end if;
 select count(*) into before_count from flow_point_ledger;
 perform set_config('request.jwt.claim.sub',a.actor::text,true);
 update clients set status='inactive' where id=a.client_id;
 rejected:=false;
 begin
   perform studio_flow_artist_award_appointment_points(a.id);
 exception when insufficient_privilege then
   if sqlerrm not like '%no puede recibir beneficios de Studio Flow.%' then raise; end if;
   rejected:=true;
 end;
 if not rejected then raise exception 'Inactive client received benefits'; end if;
 update clients set status='active' where id=a.client_id;
 update profiles set status='suspended' where id=a.client_actor;
 rejected:=false;
 begin
   perform studio_flow_artist_award_appointment_points(a.id);
 exception when insufficient_privilege then
   if sqlerrm not like '%no puede recibir beneficios de Studio Flow.%' then raise; end if;
   rejected:=true;
 end;
 if not rejected then raise exception 'Suspended account received benefits'; end if;
 if (select count(*) from flow_point_ledger)<>before_count then raise exception 'Points ledger changed'; end if;
 raise notice 'PASS: inactive client and suspended account cannot receive benefits; ledger unchanged';
end $$;
rollback;
