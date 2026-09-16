\set ON_ERROR_STOP on
begin;
do $$
declare
 a public.appointments%rowtype;
 actor uuid;
 denied boolean;
 payload jsonb;
 n integer;
begin
 if current_database()<>'studioflow_audit_verified_20260913' then raise exception 'Isolated audit required'; end if;
 select ap.* into strict a from appointments ap
 join artists ar on ar.id=ap.artist_id and ar.status='active'
 join profiles p on p.id=ar.profile_id and p.status='active'
 join clients c on c.id=ap.client_id and c.status='active' and c.archived_at is null
 where ap.status='scheduled' and ap.ends_at<now()
 and not exists(select 1 from flow_point_ledger l where l.appointment_id=ap.id)
 order by ap.starts_at limit 1;
 select profile_id into actor from artists where id=a.artist_id;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 denied:=false;
 begin
  perform studio_flow_artist_award_appointment_points(a.id);
 exception when others then
  if sqlerrm not like '%completada%' then raise; end if;
  denied:=true;
 end;
 if not denied then raise exception 'FAIL: points before completion'; end if;
 raise notice 'PASS: points require completion';
 begin
 update appointments set status='cancelled',cancelled_at=now() where id=a.id;
 denied:=false;
 begin
  perform studio_flow_artist_award_appointment_points(a.id);
 exception when others then
  if sqlerrm not like '%canceladas%' then raise; end if;
  denied:=true;
 end;
 if not denied then raise exception 'FAIL: cancelled points'; end if;
 raise notice 'PASS: cancelled appointments cannot award points';
 raise exception 'Rollback cancellation fixture' using errcode='ZX001';
 exception when sqlstate 'ZX001' then null;
 end;
 update appointments set status='completed',completed_at=now(),cancelled_at=null,
 reward_points_snapshot=40,reward_multiplier_snapshot=2 where id=a.id;
 payload:=studio_flow_artist_award_appointment_points(a.id);
 if (payload->>'pointsAwarded')::integer<>40 then raise exception 'FAIL: reward snapshot'; end if;
 perform studio_flow_artist_award_appointment_points(a.id);
 select count(*) into n from flow_point_ledger where idempotency_key='appointment-points:'||a.id;
 if n<>1 then raise exception 'FAIL: duplicate points'; end if;
 if not exists(select 1 from flow_point_ledger where idempotency_key='appointment-points:'||a.id
 and points=40 and (metadata->>'doublePointsMultiplier')::integer=2) then raise exception 'FAIL: double points metadata'; end if;
 raise notice 'PASS: saved double-points reward granted once after completion';
end;
$$;
rollback;
