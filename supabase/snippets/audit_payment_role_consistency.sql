\set ON_ERROR_STOP on
begin;
do $$
declare
 a record;
 actor uuid;
 expected jsonb;
 actual jsonb;
 roles_checked integer:=0;
 denied boolean:=false;
begin
 if current_database()<>'studioflow_audit_verified_20260913' then raise exception 'Isolated audit required'; end if;
 select ap.*,c.profile_id client_profile,ar.profile_id artist_profile,s.owner_profile_id owner_profile
 into strict a from appointments ap join clients c on c.id=ap.client_id
 join artists ar on ar.id=ap.artist_id join studios s on s.id=ap.studio_id
 where ap.status='scheduled' and c.profile_id is not null
 and exists(select 1 from profiles p where p.id=c.profile_id and p.status='active')
 limit 1;
 -- A controlled saved discount, not a change to the public service price.
 update appointment_economies set gross_amount=700,platform_fee_amount=70,artist_revenue_amount=630,
 calculation_version='studio-flow-commission-10-v4-happy-hour-discount-30' where appointment_id=a.id;
 foreach actor in array array[a.client_profile,a.artist_profile,a.owner_profile] loop
  perform set_config('request.jwt.claim.sub',actor::text,true);
  actual:=studio_flow_get_appointment_payment_details(array[a.id])->a.id::text;
  if actual is null then raise exception 'FAIL: related role cannot read price'; end if;
  if (actual->>'total')::numeric<>700 or (actual->>'original')::numeric<>1000
   or (actual->>'discountPercent')::numeric<>30 then raise exception 'FAIL: price breakdown'; end if;
  if expected is not null and expected<>actual then raise exception 'FAIL: role mismatch'; end if;
  expected:=actual;
  roles_checked:=roles_checked+1;
 end loop;
 select u.profile_id into strict actor from user_role_assignments u join roles r on r.id=u.role_id
 join profiles p on p.id=u.profile_id and p.status='active'
 where r.code='platform_owner' and u.status='active' limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 actual:=studio_flow_get_appointment_payment_details(array[a.id])->a.id::text;
 if actual is distinct from expected then raise exception 'FAIL: platform owner mismatch'; end if;
 raise notice 'PASS: client, artist, studio owner and platform owner return identical saved discount breakdown';
 perform set_config('request.jwt.claim.sub',a.client_profile::text,true);
 begin
  perform studio_flow_client_apply_appointment_reward(a.id,gen_random_uuid());
 exception when others then
  if sqlerrm not like '%promocion aplicada%' then raise; end if;
  denied:=true;
 end;
 if not denied then raise exception 'FAIL: Happy Hour stacking'; end if;
 raise notice 'PASS: Happy Hour rejects additional point redemption';
end;
$$;
rollback;
