begin;

alter table public.artist_marketing_preferences add column if not exists flow_points_max_discount_percentage smallint not null default 5;
alter table public.artist_marketing_preferences drop constraint if exists artist_marketing_preferences_max_discount_check;
alter table public.artist_marketing_preferences add constraint artist_marketing_preferences_max_discount_check check(flow_points_max_discount_percentage in(5,10,20,30,50));
alter table public.studio_marketing_preferences add column if not exists flow_points_max_discount_percentage smallint not null default 5;
alter table public.studio_marketing_preferences drop constraint if exists studio_marketing_preferences_max_discount_check;
alter table public.studio_marketing_preferences add constraint studio_marketing_preferences_max_discount_check check(flow_points_max_discount_percentage in(5,10,20,30,50));

with ranked as (
 select id,row_number() over(partition by scope_type,coalesce(artist_id,studio_id) order by created_at,id) as position
 from public.rewards where reward_type='discount' and scope_type in('artist','studio') and archived_at is null
)
update public.rewards r set
 points_cost=1000,
 name='Descuento flexible FlowPoints',
 validity_days=180,
 metadata=jsonb_build_object('discountPercent',5,'variablePoints',true),
 archived_at=case when ranked.position>1 then coalesce(r.archived_at,now()) else null end,
 status=case when ranked.position>1 then 'paused'::reward_status else r.status end,
 updated_at=now()
from ranked where ranked.id=r.id;

insert into public.rewards(scope_type,artist_id,name,reward_type,points_cost,status,validity_days,metadata,updated_at)
select 'artist',p.artist_id,'Descuento flexible FlowPoints','discount',1000,
 case when p.flow_points_enabled then 'active'::reward_status else 'paused'::reward_status end,180,
 jsonb_build_object('discountPercent',p.flow_points_max_discount_percentage,'variablePoints',true),now()
from public.artist_marketing_preferences p
where not exists(select 1 from public.rewards r where r.scope_type='artist' and r.artist_id=p.artist_id and r.reward_type='discount' and r.archived_at is null);

insert into public.rewards(scope_type,studio_id,name,reward_type,points_cost,status,validity_days,metadata,updated_at)
select 'studio',p.studio_id,'Descuento flexible FlowPoints','discount',1000,
 case when p.flow_points_enabled then 'active'::reward_status else 'paused'::reward_status end,180,
 jsonb_build_object('discountPercent',p.flow_points_max_discount_percentage,'variablePoints',true),now()
from public.studio_marketing_preferences p
where not exists(select 1 from public.rewards r where r.scope_type='studio' and r.studio_id=p.studio_id and r.reward_type='discount' and r.archived_at is null);

create or replace function public.studio_flow_artist_get_flow_points_max_discount_percentage(p_artist_id uuid default null)
returns integer language plpgsql security definer set search_path=public,auth as $$
declare v_artist public.artists%rowtype; v_value integer;
begin
 v_artist:=public.studio_flow_artist_current_owned_artist(p_artist_id);
 insert into artist_marketing_preferences(artist_id,updated_at) values(v_artist.id,now()) on conflict(artist_id) do update set updated_at=artist_marketing_preferences.updated_at;
 select flow_points_max_discount_percentage into v_value from artist_marketing_preferences where artist_id=v_artist.id;
 return coalesce(v_value,5);
end;$$;

create or replace function public.studio_flow_artist_set_flow_points_max_discount_percentage(p_percentage integer,p_artist_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_artist public.artists%rowtype; v_reward_id uuid;
begin
 if p_percentage not in(5,10,20,30,50) then raise exception 'El descuento maximo solo puede ser 5, 10, 20, 30 o 50 por ciento.'; end if;
 v_artist:=public.studio_flow_artist_current_owned_artist(p_artist_id);
 insert into artist_marketing_preferences(artist_id,flow_points_max_discount_percentage,updated_at) values(v_artist.id,p_percentage,now())
 on conflict(artist_id) do update set flow_points_max_discount_percentage=excluded.flow_points_max_discount_percentage,updated_at=now();
 select id into v_reward_id from rewards where scope_type='artist' and artist_id=v_artist.id and reward_type='discount' and archived_at is null order by created_at limit 1;
 if v_reward_id is null then
  insert into rewards(scope_type,artist_id,name,reward_type,points_cost,status,validity_days,metadata,updated_at)
  values('artist',v_artist.id,'Descuento flexible FlowPoints','discount',1000,'active',180,jsonb_build_object('discountPercent',p_percentage,'variablePoints',true),now());
 else
  update rewards set name='Descuento flexible FlowPoints',points_cost=1000,status='active',validity_days=180,
   metadata=jsonb_build_object('discountPercent',p_percentage,'variablePoints',true),updated_at=now() where id=v_reward_id;
  update rewards set archived_at=coalesce(archived_at,now()),status='paused',updated_at=now()
   where scope_type='artist' and artist_id=v_artist.id and reward_type='discount' and id<>v_reward_id and archived_at is null;
 end if;
 return public.studio_flow_artist_get_marketing_settings(v_artist.id)||jsonb_build_object('flowPointsMaxDiscountPercentage',p_percentage,'flow_points_max_discount_percentage',p_percentage);
end;$$;

create or replace function public.studio_flow_studio_get_flow_points_max_discount_percentage(p_studio_id uuid default null)
returns integer language plpgsql security definer set search_path=public,auth as $$
declare v_studio_id uuid; v_value integer;
begin
 v_studio_id:=public.studio_flow_owner_assert_studio_access(p_studio_id);
 insert into studio_marketing_preferences(studio_id,updated_at) values(v_studio_id,now()) on conflict(studio_id) do update set updated_at=studio_marketing_preferences.updated_at;
 select flow_points_max_discount_percentage into v_value from studio_marketing_preferences where studio_id=v_studio_id;
 return coalesce(v_value,5);
end;$$;

create or replace function public.studio_flow_studio_set_flow_points_max_discount_percentage(p_percentage integer,p_studio_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_studio_id uuid; v_reward_id uuid;
begin
 if p_percentage not in(5,10,20,30,50) then raise exception 'El descuento maximo solo puede ser 5, 10, 20, 30 o 50 por ciento.'; end if;
 v_studio_id:=public.studio_flow_owner_assert_studio_access(p_studio_id);
 insert into studio_marketing_preferences(studio_id,flow_points_max_discount_percentage,updated_at) values(v_studio_id,p_percentage,now())
 on conflict(studio_id) do update set flow_points_max_discount_percentage=excluded.flow_points_max_discount_percentage,updated_at=now();
 select id into v_reward_id from rewards where scope_type='studio' and studio_id=v_studio_id and reward_type='discount' and archived_at is null order by created_at limit 1;
 if v_reward_id is null then
  insert into rewards(scope_type,studio_id,name,reward_type,points_cost,status,validity_days,metadata,updated_at)
  values('studio',v_studio_id,'Descuento flexible FlowPoints','discount',1000,'active',180,jsonb_build_object('discountPercent',p_percentage,'variablePoints',true),now());
 else
  update rewards set name='Descuento flexible FlowPoints',points_cost=1000,status='active',validity_days=180,
   metadata=jsonb_build_object('discountPercent',p_percentage,'variablePoints',true),updated_at=now() where id=v_reward_id;
  update rewards set archived_at=coalesce(archived_at,now()),status='paused',updated_at=now()
   where scope_type='studio' and studio_id=v_studio_id and reward_type='discount' and id<>v_reward_id and archived_at is null;
 end if;
 return public.studio_flow_studio_get_marketing_settings(v_studio_id)||jsonb_build_object('flowPointsMaxDiscountPercentage',p_percentage,'flow_points_max_discount_percentage',p_percentage);
end;$$;

create or replace function public.studio_flow_client_apply_appointment_points(p_appointment_id uuid,p_points_to_use integer)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare
 v_profile profiles%rowtype; v_client clients%rowtype; v_appointment appointments%rowtype; v_economy appointment_economies%rowtype;
 v_account loyalty_accounts%rowtype; v_reward rewards%rowtype; v_redemption reward_redemptions%rowtype;
 v_balance integer; v_max_percent integer:=5; v_max_points integer; v_original numeric; v_total numeric; v_fee numeric; v_scope text:='exclusive';
begin
 if auth.uid() is null then raise exception 'Auth session required'; end if;
 if coalesce(p_points_to_use,0)<1000 or p_points_to_use%10<>0 then raise exception 'Selecciona al menos 1,000 FlowPoints en multiplos de 10.'; end if;
 select * into v_profile from profiles where id=auth.uid() and status='active';
 select * into v_client from clients where profile_id=v_profile.id and status='active' and archived_at is null limit 1 for update;
 if v_client.id is null then raise exception 'Active client required'; end if;
 select * into v_appointment from appointments where id=p_appointment_id and client_id=v_client.id and status='scheduled' for update;
 if v_appointment.id is null then raise exception 'Appointment not available for reward'; end if;
 if exists(select 1 from reward_redemptions rr join appointments a on a.id=rr.appointment_id
   where rr.loyalty_account_id in(select id from loyalty_accounts where client_id=v_client.id) and rr.status='applied'
   and (a.starts_at at time zone 'America/Mexico_City')::date=(v_appointment.starts_at at time zone 'America/Mexico_City')::date)
 then raise exception 'Solo puedes aplicar un descuento de FlowPoints por dia.'; end if;
 select * into v_economy from appointment_economies where appointment_id=v_appointment.id for update;
 if v_economy.id is null then raise exception 'No se encontro el importe guardado de la cita.'; end if;
 if v_economy.calculation_version like '%happy-hour-discount-%' then raise exception 'Happy Hour no permite aplicar FlowPoints.'; end if;
 if v_appointment.studio_id is not null then
  select flow_points_max_discount_percentage into v_max_percent from studio_marketing_preferences where studio_id=v_appointment.studio_id and flow_points_enabled;
  select * into v_reward from rewards where scope_type='studio' and studio_id=v_appointment.studio_id and reward_type='discount' and status='active' and archived_at is null order by created_at limit 1;
 else
  select flow_points_max_discount_percentage into v_max_percent from artist_marketing_preferences where artist_id=v_appointment.artist_id and flow_points_enabled;
  select * into v_reward from rewards where scope_type='artist' and artist_id=v_appointment.artist_id and reward_type='discount' and status='active' and archived_at is null order by created_at limit 1;
 end if;
 if v_reward.id is null or v_max_percent not in(5,10,20,30,50) then raise exception 'FlowPoints no estan disponibles para esta cita.'; end if;
 v_balance:=public.studio_flow_client_points_balance_for_reward(v_client.id,case when v_appointment.studio_id is null then v_appointment.artist_id end,v_appointment.studio_id,true);
 if p_points_to_use>v_balance then raise exception 'No tienes suficientes FlowPoints para este servicio.'; end if;
 v_original:=v_economy.gross_amount;
 v_max_points:=floor(v_original*v_max_percent/100*10)::integer;
 if p_points_to_use>v_max_points then raise exception 'La cantidad supera el descuento maximo permitido para este servicio.'; end if;
 v_total:=greatest(round(v_original-p_points_to_use*0.10,2),0); v_fee:=round(v_total*0.10,2);
 insert into loyalty_accounts(client_id,points_balance,streak_count,status,updated_at) values(v_client.id,0,0,'active',now())
 on conflict(client_id) do update set status='active',updated_at=now() returning * into v_account;
 insert into reward_redemptions(loyalty_account_id,reward_id,appointment_id,points_spent,status,redeemed_at,applied_at,updated_at)
 values(v_account.id,v_reward.id,v_appointment.id,p_points_to_use,'applied',now(),now(),now()) returning * into v_redemption;
 insert into flow_point_ledger(loyalty_account_id,reward_redemption_id,appointment_id,movement_type,points,reason,idempotency_key,occurred_at,metadata)
 values(v_account.id,v_redemption.id,v_appointment.id,'spend',-p_points_to_use,'reward_redeemed',concat('appointment-points-redemption:',v_appointment.id),now(),
 jsonb_build_object('discountPercent',round((p_points_to_use*0.10/v_original)*100,2),'pointsUsed',p_points_to_use,'rewardArtistId',v_appointment.artist_id,'rewardStudioId',v_appointment.studio_id));
 update appointment_economies set gross_amount=v_total,platform_fee_amount=v_fee,artist_revenue_amount=greatest(v_total-v_fee,0),
  calculation_version='studio-flow-commission-10-flow-points-discount',updated_at=now() where id=v_economy.id returning * into v_economy;
 update commissions set appointment_economy_id=v_economy.id,amount=v_fee,rate=0.10,updated_at=now() where appointment_id=v_appointment.id;
 update loyalty_accounts set points_balance=public.studio_flow_client_monthly_points_balance(v_client.id),updated_at=now() where id=v_account.id;
 return jsonb_build_object('reward',jsonb_build_object('pointsCost',p_points_to_use,'discountAmount',p_points_to_use*0.10,'maxDiscountPercent',v_max_percent),
  'economy',jsonb_build_object('originalAmount',v_original,'grossAmount',v_total,'platformFeeAmount',v_fee));
end;$$;

create or replace function public.studio_flow_marketplace_book_with_reward(p_availability_slot_ids uuid[],p_service_offering_id uuid,p_points_to_use integer,p_notes text default null)
returns jsonb language plpgsql security invoker set search_path=public,auth as $$
declare booking jsonb; redeemed jsonb;
begin
 booking:=public.studio_flow_marketplace_book_appointment(p_availability_slot_ids,p_service_offering_id,p_notes);
 if coalesce(p_points_to_use,0)>0 then
  redeemed:=public.studio_flow_client_apply_appointment_points((booking->'appointment'->>'id')::uuid,p_points_to_use);
  booking:=booking||jsonb_build_object('reward',redeemed->'reward','economy',redeemed->'economy');
 end if;
 return booking;
end;$$;

revoke all on function public.studio_flow_client_apply_appointment_points(uuid,integer) from public,anon;
revoke all on function public.studio_flow_marketplace_book_with_reward(uuid[],uuid,integer,text) from public,anon;
grant execute on function public.studio_flow_client_apply_appointment_points(uuid,integer) to authenticated;
grant execute on function public.studio_flow_marketplace_book_with_reward(uuid[],uuid,integer,text) to authenticated;
grant execute on function public.studio_flow_artist_get_flow_points_max_discount_percentage(uuid) to authenticated;
grant execute on function public.studio_flow_artist_set_flow_points_max_discount_percentage(integer,uuid) to authenticated;
grant execute on function public.studio_flow_studio_get_flow_points_max_discount_percentage(uuid) to authenticated;
grant execute on function public.studio_flow_studio_set_flow_points_max_discount_percentage(integer,uuid) to authenticated;

commit;
