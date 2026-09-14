-- Existing restored records only. No changes survive this transaction.
begin;
do $$
declare a record; result jsonb; rejected boolean := false; n integer;
begin
 if current_database() <> 'studioflow_audit_verified_20260913' then
  raise exception 'Isolated audit database required';
 end if;
 select ap.*, c.profile_id as client_actor, ar.profile_id as artist_actor into a
 from public.appointments ap
 join public.clients c on c.id=ap.client_id
 join public.artists ar on ar.id=ap.artist_id
 join public.profiles cp on cp.id=c.profile_id and cp.status='active'
 join public.profiles p on p.id=ar.profile_id and p.status='active'
 where ap.status='scheduled' and ap.starts_at<now() and ar.status='active'
 and ar.archived_at is null and c.status<>'archived'
 and not exists(select 1 from public.flow_point_ledger l where l.appointment_id=ap.id)
 limit 1;
 if a.id is null then raise exception 'Existing appointment required'; end if;
 perform set_config('request.jwt.claim.sub',a.client_actor::text,true);
 begin
  perform public.studio_flow_client_update_appointment_response(a.id,'cancel');
 exception when others then
  if sqlerrm not like 'Esta cita ya comenzo%' then raise; end if;
  rejected:=true;
 end;
 if not rejected then raise exception 'Past cancellation allowed'; end if;
 update public.appointments set reward_points_snapshot=30,reward_multiplier_snapshot=1 where id=a.id;
 update public.artist_marketing_preferences set flow_points_enabled=true where artist_id=a.artist_id;
 update public.service_offerings set flow_points_awarded=300 where id=a.service_offering_id;
 perform set_config('request.jwt.claim.sub',a.artist_actor::text,true);
 result:=public.studio_flow_artist_award_appointment_points(a.id);
 if (result->>'pointsAwarded')::int<>30 then raise exception 'Snapshot ignored'; end if;
 perform public.studio_flow_artist_award_appointment_points(a.id);
 select count(*) into n from public.flow_point_ledger where idempotency_key=concat('appointment-points:',a.id);
 if n<>1 then raise exception 'Duplicate points'; end if;
 update public.appointments set status='cancelled',cancelled_at=now() where id=a.id;
 rejected:=false;
 begin
  perform public.studio_flow_artist_award_appointment_points(a.id);
 exception when others then
  if sqlerrm not like 'Las citas canceladas%' then raise; end if;
  rejected:=true;
 end;
 if not rejected then raise exception 'Cancelled reward allowed'; end if;
 raise notice 'Past cancellation, reward snapshot, idempotency and cancelled reward guards passed';
end;$$;
rollback;
