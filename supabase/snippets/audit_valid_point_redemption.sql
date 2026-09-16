\set ON_ERROR_STOP on
begin;
do $$
declare
 a record;
 account_id uuid;
 reward_id uuid;
 balance_before integer;
 balance_after integer;
 result jsonb;
 denied boolean:=false;
 n integer;
begin
 if current_database()<>'studioflow_audit_verified_20260913' then raise exception 'Isolated audit required'; end if;
 select ap.*,c.profile_id into strict a from appointments ap
 join clients c on c.id=ap.client_id and c.status='active' and c.archived_at is null
 join profiles p on p.id=c.profile_id and p.status='active'
 join studios s on s.id=ap.studio_id and s.studio_status='approved' and s.archived_at is null
 where ap.status='scheduled'
 and not exists(select 1 from reward_redemptions r where r.appointment_id=ap.id)
 limit 1;
 perform set_config('request.jwt.claim.sub',a.profile_id::text,true);
 update appointment_economies set gross_amount=1000,platform_fee_amount=100,artist_revenue_amount=900,
 calculation_version='studio-flow-commission-10-test' where appointment_id=a.id;
 insert into loyalty_accounts(client_id,points_balance,streak_count,status)
 values(a.client_id,0,0,'active') on conflict(client_id) do update set status='active'
 returning id into account_id;
 insert into flow_point_ledger(loyalty_account_id,movement_type,points,reason,occurred_at,expires_at,metadata)
 values(account_id,'earn',100,'appointment_completed',now(),now()+interval '90 days',
 jsonb_build_object('artistId',a.artist_id,'studioId',a.studio_id));
 insert into rewards(scope_type,studio_id,name,reward_type,points_cost,status,metadata)
 values('studio',a.studio_id,'Isolated audit reward','discount',10,'active','{"discountPercent":20}') returning id into reward_id;
 balance_before:=studio_flow_client_monthly_points_balance(a.client_id);
 result:=studio_flow_client_apply_appointment_reward(a.id,reward_id);
 balance_after:=studio_flow_client_monthly_points_balance(a.client_id);
 if balance_before-balance_after<>10 then raise exception 'FAIL: balance debit %',balance_before-balance_after; end if;
 if (result#>>'{economy,grossAmount}')::numeric<>800
 or (result#>>'{economy,platformFeeAmount}')::numeric<>80 then raise exception 'FAIL: final amount or commission'; end if;
 if not exists(select 1 from commissions where appointment_id=a.id and amount=80 and status='potential') then
 raise exception 'FAIL: commission must remain potential before completion'; end if;
 result:=studio_flow_get_appointment_payment_details(array[a.id])->a.id::text;
 if (result->>'original')::numeric<>1000 or (result->>'total')::numeric<>800
 or (result->>'points')::integer<>10 then raise exception 'FAIL: displayed breakdown'; end if;
 begin
 perform studio_flow_client_apply_appointment_reward(a.id,reward_id);
 exception when others then
 if sqlerrm not like '%ya tiene un canje%' then raise; end if;
 denied:=true;
 end;
 if not denied then raise exception 'FAIL: duplicate redemption accepted'; end if;
 select count(*) into n from flow_point_ledger where appointment_id=a.id and movement_type='spend' and reason='reward_redeemed';
 if n<>1 or studio_flow_client_monthly_points_balance(a.client_id)<>balance_after then raise exception 'FAIL: repeated debit'; end if;
 raise notice 'PASS: 10 points debited once; 1000 original, 20 percent discount, 800 final, 80 potential commission; payment breakdown agrees; repeat rejected';
end;
$$;
rollback;
