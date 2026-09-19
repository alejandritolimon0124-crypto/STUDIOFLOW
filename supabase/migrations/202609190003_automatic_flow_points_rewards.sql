begin;

alter table public.artist_marketing_preferences
  add column if not exists flow_points_reward_percentage smallint not null default 5;
alter table public.artist_marketing_preferences
  drop constraint if exists artist_marketing_preferences_reward_percentage_check;
alter table public.artist_marketing_preferences
  add constraint artist_marketing_preferences_reward_percentage_check
  check (flow_points_reward_percentage in (5, 10));

alter table public.studio_marketing_preferences
  add column if not exists flow_points_reward_percentage smallint not null default 5;
alter table public.studio_marketing_preferences
  drop constraint if exists studio_marketing_preferences_reward_percentage_check;
alter table public.studio_marketing_preferences
  add constraint studio_marketing_preferences_reward_percentage_check
  check (flow_points_reward_percentage in (5, 10));

create or replace function public.studio_flow_artist_get_flow_points_reward_percentage(p_artist_id uuid default null)
returns integer language plpgsql security definer set search_path=public,auth as $$
declare v_artist public.artists%rowtype; v_percentage integer;
begin
  v_artist := public.studio_flow_artist_current_owned_artist(p_artist_id);
  insert into public.artist_marketing_preferences(artist_id,updated_at)
  values(v_artist.id,now()) on conflict(artist_id) do update set updated_at=artist_marketing_preferences.updated_at;
  select flow_points_reward_percentage into v_percentage from public.artist_marketing_preferences where artist_id=v_artist.id;
  return coalesce(v_percentage,5);
end;$$;

create or replace function public.studio_flow_artist_set_flow_points_reward_percentage(p_percentage integer,p_artist_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_artist public.artists%rowtype;
begin
  if p_percentage not in (5,10) then raise exception 'El porcentaje de recompensa solo puede ser 5 o 10.'; end if;
  v_artist := public.studio_flow_artist_current_owned_artist(p_artist_id);
  insert into public.artist_marketing_preferences(artist_id,flow_points_reward_percentage,updated_at)
  values(v_artist.id,p_percentage,now()) on conflict(artist_id) do update
  set flow_points_reward_percentage=excluded.flow_points_reward_percentage,updated_at=now();
  return public.studio_flow_artist_get_marketing_settings(v_artist.id)
    || jsonb_build_object('flowPointsRewardPercentage',p_percentage,'flow_points_reward_percentage',p_percentage);
end;$$;

create or replace function public.studio_flow_studio_get_flow_points_reward_percentage(p_studio_id uuid default null)
returns integer language plpgsql security definer set search_path=public,auth as $$
declare v_studio_id uuid; v_percentage integer;
begin
  v_studio_id := public.studio_flow_owner_assert_studio_access(p_studio_id);
  insert into public.studio_marketing_preferences(studio_id,updated_at)
  values(v_studio_id,now()) on conflict(studio_id) do update set updated_at=studio_marketing_preferences.updated_at;
  select flow_points_reward_percentage into v_percentage from public.studio_marketing_preferences where studio_id=v_studio_id;
  return coalesce(v_percentage,5);
end;$$;

create or replace function public.studio_flow_studio_set_flow_points_reward_percentage(p_percentage integer,p_studio_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_studio_id uuid;
begin
  if p_percentage not in (5,10) then raise exception 'El porcentaje de recompensa solo puede ser 5 o 10.'; end if;
  v_studio_id := public.studio_flow_owner_assert_studio_access(p_studio_id);
  insert into public.studio_marketing_preferences(studio_id,flow_points_reward_percentage,updated_at)
  values(v_studio_id,p_percentage,now()) on conflict(studio_id) do update
  set flow_points_reward_percentage=excluded.flow_points_reward_percentage,updated_at=now();
  return public.studio_flow_studio_get_marketing_settings(v_studio_id)
    || jsonb_build_object('flowPointsRewardPercentage',p_percentage,'flow_points_reward_percentage',p_percentage);
end;$$;

create or replace function public.studio_flow_award_completed_appointment_points(p_appointment_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare
  v_appointment public.appointments%rowtype;
  v_account public.loyalty_accounts%rowtype;
  v_enabled boolean:=false;
  v_percentage integer:=5;
  v_base_amount numeric:=0;
  v_multiplier integer:=1;
  v_points integer:=0;
  v_existing_points integer:=0;
begin
  select * into v_appointment from public.appointments where id=p_appointment_id for update;
  if v_appointment.id is null then return jsonb_build_object('awarded',false,'reason','appointment_not_found','points',0); end if;
  if v_appointment.status <> 'completed' or v_appointment.completed_at is null then
    return jsonb_build_object('awarded',false,'reason','appointment_not_completed','points',0);
  end if;
  if not exists(
    select 1 from public.clients c join public.profiles p on p.id=c.profile_id
    where c.id=v_appointment.client_id and c.status='active' and p.status='active'
  ) then
    return jsonb_build_object('awarded',false,'reason','client_not_eligible','points',0);
  end if;

  select coalesce(sum(points),0)::integer into v_existing_points
  from public.flow_point_ledger where appointment_id=v_appointment.id and movement_type='earn';
  if v_existing_points > 0 then
    return jsonb_build_object('awarded',false,'reason','already_awarded','points',v_existing_points);
  end if;

  if exists(select 1 from public.reward_redemptions where appointment_id=v_appointment.id and points_spent>0 and status='applied') then
    return jsonb_build_object('awarded',false,'reason','flow_points_used','points',0);
  end if;

  if v_appointment.studio_id is not null then
    insert into public.studio_marketing_preferences(studio_id,updated_at) values(v_appointment.studio_id,now())
    on conflict(studio_id) do update set updated_at=studio_marketing_preferences.updated_at;
    select flow_points_enabled,flow_points_reward_percentage into v_enabled,v_percentage
    from public.studio_marketing_preferences where studio_id=v_appointment.studio_id;
  else
    insert into public.artist_marketing_preferences(artist_id,updated_at) values(v_appointment.artist_id,now())
    on conflict(artist_id) do update set updated_at=artist_marketing_preferences.updated_at;
    select flow_points_enabled,flow_points_reward_percentage into v_enabled,v_percentage
    from public.artist_marketing_preferences where artist_id=v_appointment.artist_id;
  end if;
  if not coalesce(v_enabled,false) then return jsonb_build_object('awarded',false,'reason','flow_points_disabled','points',0); end if;
  if v_percentage not in (5,10) then raise exception 'Invalid Flow Points reward percentage'; end if;

  perform public.studio_flow_sync_appointment_commission(v_appointment.id);
  select gross_amount into v_base_amount from public.appointment_economies where appointment_id=v_appointment.id;
  v_base_amount:=greatest(coalesce(v_base_amount,0),0);
  v_multiplier:=greatest(coalesce(v_appointment.reward_multiplier_snapshot,1),1);
  v_points:=round(v_base_amount*v_percentage/10.0)::integer*v_multiplier;
  if v_points<=0 then return jsonb_build_object('awarded',false,'reason','zero_amount','points',0); end if;

  insert into public.loyalty_accounts(client_id,points_balance,streak_count,status,updated_at)
  values(v_appointment.client_id,0,0,'active',now()) on conflict(client_id) do update set status='active',updated_at=now()
  returning * into v_account;

  insert into public.flow_point_ledger(loyalty_account_id,appointment_id,movement_type,points,reason,idempotency_key,expires_at,occurred_at,metadata)
  values(v_account.id,v_appointment.id,'earn',v_points,'appointment_completed',concat('appointment-points:',v_appointment.id),
    now()+interval '180 days',now(),jsonb_build_object(
      'artistId',v_appointment.artist_id,'studioId',v_appointment.studio_id,'rewardPercentage',v_percentage,
      'baseAmountMxn',v_base_amount,'benefitMxn',round(v_points*0.10,2),'doublePointsMultiplier',v_multiplier,'source','automatic_completion'))
  on conflict(idempotency_key) do nothing;

  update public.loyalty_accounts set points_balance=public.studio_flow_client_monthly_points_balance(v_appointment.client_id),updated_at=now()
  where id=v_account.id;
  return jsonb_build_object('awarded',true,'reason','appointment_completed','points',v_points,'rewardPercentage',v_percentage);
end;$$;

create or replace function public.studio_flow_auto_award_completed_appointment_points()
returns trigger language plpgsql security definer set search_path=public,auth as $$
begin
  if new.status='completed' and old.status is distinct from 'completed' then
    perform public.studio_flow_award_completed_appointment_points(new.id);
  end if;
  return new;
end;$$;

drop trigger if exists auto_award_completed_appointment_points on public.appointments;
create trigger auto_award_completed_appointment_points after update of status on public.appointments
for each row execute function public.studio_flow_auto_award_completed_appointment_points();

revoke all on function public.studio_flow_award_completed_appointment_points(uuid) from public,anon,authenticated;
revoke all on function public.studio_flow_auto_award_completed_appointment_points() from public,anon,authenticated;
revoke all on function public.studio_flow_artist_get_flow_points_reward_percentage(uuid) from public,anon;
revoke all on function public.studio_flow_artist_set_flow_points_reward_percentage(integer,uuid) from public,anon;
revoke all on function public.studio_flow_studio_get_flow_points_reward_percentage(uuid) from public,anon;
revoke all on function public.studio_flow_studio_set_flow_points_reward_percentage(integer,uuid) from public,anon;
grant execute on function public.studio_flow_artist_get_flow_points_reward_percentage(uuid) to authenticated;
grant execute on function public.studio_flow_artist_set_flow_points_reward_percentage(integer,uuid) to authenticated;
grant execute on function public.studio_flow_studio_get_flow_points_reward_percentage(uuid) to authenticated;
grant execute on function public.studio_flow_studio_set_flow_points_reward_percentage(integer,uuid) to authenticated;

commit;
