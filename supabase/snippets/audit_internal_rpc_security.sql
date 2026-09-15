-- Existing restored records only; no production calls or persistent mutations.
begin;
do $$ begin
  if current_database()<>'studioflow_audit_verified_20260913' then raise exception 'Isolated database required'; end if;
end $$;
select set_config('audit.artist', (select id::text from artists limit 1),true) is not null;
select set_config('audit.client', (select id::text from clients limit 1),true) is not null;
select set_config('audit.appointment', (select id::text from appointments limit 1),true) is not null;
select set_config('request.jwt.claim.sub','',true)='';
set local role anon;
do $$
declare result jsonb; balance integer;
begin
  begin
    result:=public.studio_flow_artist_schedule_payload(current_setting('audit.artist')::uuid);
    raise notice 'FAIL: anonymous caller can read artist schedule settings: %', result ? 'schedule';
  exception when insufficient_privilege then raise notice 'PASS: schedule helper blocked';
  end;
  begin
    balance:=public.studio_flow_client_monthly_points_balance(current_setting('audit.client')::uuid);
    raise notice 'FAIL: anonymous caller can query another client points balance';
  exception when insufficient_privilege then raise notice 'PASS: points helper blocked';
  end;
  begin
    result:=public.studio_flow_sync_appointment_commission(current_setting('audit.appointment')::uuid);
    raise notice 'FAIL: anonymous caller can synchronize commission and read appointment amounts: %', result ? 'grossAmount';
  exception when insufficient_privilege then raise notice 'PASS: commission helper blocked';
  end;
end $$;
reset role;
select count(*) as active_owner_profiles from profiles p where p.status='active' and (
  p.default_role='platform_owner' or exists(select 1 from user_role_assignments u join roles r on r.id=u.role_id
    where u.profile_id=p.id and u.status='active' and r.code='platform_owner'));
select count(*) as non_global_platform_owner_assignments from user_role_assignments u
  join roles r on r.id=u.role_id where r.code='platform_owner' and u.status='active' and u.studio_id is not null;
rollback;
