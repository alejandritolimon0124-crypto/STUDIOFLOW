-- Existing restored appointments only; every mutation is rolled back.
begin;
do $$
declare a record; owner_id uuid; payload jsonb; quoted numeric; total_before numeric; total_after numeric; n integer;
begin
 if current_database()<>'studioflow_audit_verified_20260913' then raise exception 'Isolated audit required'; end if;
 select p.id into owner_id from profiles p where p.status='active' and (p.default_role='platform_owner' or exists(select 1 from user_role_assignments u join roles r on r.id=u.role_id where u.profile_id=p.id and u.status='active' and r.code='platform_owner')) limit 1;
 if owner_id is null then raise exception 'Existing owner required'; end if;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 select ap.* into a from appointments ap where ap.status='scheduled' and ap.ends_at<now() order by ap.starts_at limit 1;
 if a.id is null then raise exception 'Existing past appointment required'; end if;
 payload:=studio_flow_admin_get_billing_summary(date_trunc('month',a.starts_at)::date,'');
 total_before:=(payload->>'currentMonthCommission')::numeric;
 select gross_amount into quoted from appointment_economies where appointment_id=a.id;
 update appointments set status='completed',completed_at=now() where id=a.id;
 payload:=studio_flow_admin_get_billing_summary(date_trunc('month',a.starts_at)::date,'');
 total_after:=(payload->>'currentMonthCommission')::numeric;
 if total_after-total_before<>round(quoted*0.10,2) then raise exception 'Completion commission mismatch'; end if;
 update appointments set status='completed' where id=a.id;
 select count(*) into n from commissions where appointment_id=a.id;
 if n<>1 then raise exception 'Commission duplicated'; end if;
 update appointments set status='cancelled',cancelled_at=now() where id=a.id;
 payload:=studio_flow_admin_get_billing_summary(date_trunc('month',a.starts_at)::date,'');
 if (payload->>'currentMonthCommission')::numeric<>total_before then raise exception 'Cancelled appointment remains in billing'; end if;
 raise notice 'Completion adds saved 10 percent once; cancellation excludes it from billing';
 select ap.* into a from appointments ap where ap.status='scheduled' and ap.ends_at>now() order by ap.starts_at limit 1;
 if a.id is null then raise exception 'Existing future appointment required'; end if;
 begin
  update appointments set status='completed',completed_at=now() where id=a.id;
  raise warning 'CONFIRMED: database accepts completion before appointment ends (privileged SQL)';
 exception when check_violation then
  raise notice 'Early completion rejected by constraint';
 end;
end;$$;
rollback;
