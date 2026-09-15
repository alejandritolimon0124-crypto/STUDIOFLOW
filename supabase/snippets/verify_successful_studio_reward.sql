-- Existing restored records only; all award and redemption changes roll back.
begin;
do $$
declare a record; r public.rewards%rowtype; result jsonb; original numeric; expected numeric; balance_before integer; balance_after integer; rejected boolean:=false;
begin
 if current_database()<>'studioflow_audit_verified_20260913' then raise exception 'Isolated audit database required'; end if;
 select ap.*,c.profile_id as client_actor,ar.profile_id as artist_actor into a
 from public.appointments ap
 join public.clients c on c.id=ap.client_id
 join public.artists ar on ar.id=ap.artist_id
 join public.profiles cp on cp.id=c.profile_id
 join public.profiles p on p.id=ar.profile_id
 join public.studios s on s.id=ap.studio_id
 join public.appointment_economies e on e.appointment_id=ap.id
 where ap.status='scheduled' and ap.starts_at<now() and c.status='active' and c.archived_at is null
 and cp.status='active' and p.status='active' and ar.status='active' and ar.archived_at is null
 and s.studio_status='approved' and s.archived_at is null
 and e.calculation_version not like '%happy-hour-discount-%'
 and not exists(select 1 from public.flow_point_ledger l where l.appointment_id=ap.id)
 and not exists(select 1 from public.reward_redemptions rr where rr.appointment_id=ap.id and rr.status='applied')
 and exists(select 1 from public.rewards rw where rw.artist_id=ap.artist_id and rw.status='active' and rw.archived_at is null and rw.reward_type='discount') limit 1;
 if a.id is null then raise exception 'Existing eligible studio appointment required'; end if;
 select * into r from public.rewards where artist_id=a.artist_id and status='active' and archived_at is null and reward_type='discount' limit 1;
 update public.appointments set reward_points_snapshot=r.points_cost,reward_multiplier_snapshot=1 where id=a.id;
 perform set_config('request.jwt.claim.sub',a.artist_actor::text,true);
 perform public.studio_flow_artist_award_appointment_points(a.id);
 select gross_amount into original from public.appointment_economies where appointment_id=a.id;
 balance_before:=public.studio_flow_client_monthly_points_balance(a.client_id);
 perform set_config('request.jwt.claim.sub',a.client_actor::text,true);
 result:=public.studio_flow_client_apply_appointment_reward(a.id,r.id);
 expected:=round(original*(100-(r.metadata->>'discountPercent')::numeric)/100,2);
 if (result->'economy'->>'grossAmount')::numeric<>expected then raise exception 'Wrong discounted total'; end if;
 if (result->'economy'->>'platformFeeAmount')::numeric<>round(expected*0.10,2) then raise exception 'Wrong commission'; end if;
 balance_after:=public.studio_flow_client_monthly_points_balance(a.client_id);
 if balance_after<>balance_before-r.points_cost then raise exception 'Wrong points deduction'; end if;
 begin
   perform public.studio_flow_client_apply_appointment_reward(a.id,r.id);
 exception when raise_exception then
   if sqlerrm<>'Esta cita ya tiene un canje de puntos aplicado.' then raise; end if;
   rejected:=true;
 end;
 if not rejected then raise exception 'Duplicate reward accepted'; end if;
 if public.studio_flow_client_monthly_points_balance(a.client_id)<>balance_after then raise exception 'Duplicate points spent'; end if;
 if (select count(*) from public.reward_redemptions where appointment_id=a.id and status='applied')<>1 then raise exception 'Unexpected redemption count'; end if;
 raise notice 'PASS: approved studio appointment reward, final price, 10 percent commission, points deduction and duplicate rejection';
end $$;
rollback;
