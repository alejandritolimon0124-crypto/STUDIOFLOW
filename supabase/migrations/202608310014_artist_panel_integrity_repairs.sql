do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.studio_flow_artist_save_context_schedule_settings(jsonb,text,uuid)'::regprocedure)
  into v_definition;

  if v_definition is not null then
    v_definition := replace(
      v_definition,
      'delete from availability_slots
  where schedule_id = v_schedule.id
    and status in (''available'', ''expired'', ''hidden'')
    and starts_at >= ((now() at time zone v_timezone)::date::timestamp at time zone v_timezone)
    and starts_at < ((v_generation_end + 1)::timestamp at time zone v_timezone);',
      'delete from availability_slots slot
  where slot.schedule_id = v_schedule.id
    and slot.status in (''available'', ''expired'', ''hidden'')
    and slot.starts_at >= ((now() at time zone v_timezone)::date::timestamp at time zone v_timezone)
    and slot.starts_at < ((v_generation_end + 1)::timestamp at time zone v_timezone)
    and not exists (
      select 1
      from appointments appt
      where appt.availability_slot_id = slot.id
    );'
    );
    execute v_definition;
  end if;

  select pg_get_functiondef('public.studio_flow_artist_save_schedule_settings(jsonb)'::regprocedure)
  into v_definition;

  if v_definition is not null then
    v_definition := replace(
      v_definition,
      'delete from availability_slots
  where schedule_id = v_schedule.id
    and status in (''available'', ''expired'', ''hidden'')
    and starts_at >= ((now() at time zone v_timezone)::date::timestamp at time zone v_timezone)
    and starts_at < ((v_generation_end + 1)::timestamp at time zone v_timezone);',
      'delete from availability_slots slot
  where slot.schedule_id = v_schedule.id
    and slot.status in (''available'', ''expired'', ''hidden'')
    and slot.starts_at >= ((now() at time zone v_timezone)::date::timestamp at time zone v_timezone)
    and slot.starts_at < ((v_generation_end + 1)::timestamp at time zone v_timezone)
    and not exists (
      select 1
      from appointments appt
      where appt.availability_slot_id = slot.id
    );'
    );
    execute v_definition;
  end if;
end;
$$;

create or replace function public.studio_flow_artist_get_marketing_settings(
  p_artist_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_artist artists%rowtype;
  v_preferences artist_marketing_preferences%rowtype;
  v_rewards jsonb;
  v_double_points jsonb;
  v_happy_hour jsonb;
begin
  v_artist := public.studio_flow_artist_current_owned_artist(p_artist_id);

  insert into artist_marketing_preferences (artist_id, updated_at)
  values (v_artist.id, now())
  on conflict (artist_id) do update
  set updated_at = artist_marketing_preferences.updated_at
  returning * into v_preferences;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'name', r.name,
    'discountPercent', coalesce((r.metadata ->> 'discountPercent')::integer, 0),
    'discount_percent', coalesce((r.metadata ->> 'discountPercent')::integer, 0),
    'pointsCost', r.points_cost,
    'points_cost', r.points_cost,
    'status', r.status
  ) order by r.points_cost), '[]'::jsonb)
  into v_rewards
  from rewards r
  where r.scope_type = 'artist'
    and r.artist_id = v_artist.id
    and r.archived_at is null
    and r.status in ('active', 'paused', 'draft');

  select jsonb_build_object(
    'id', p.id,
    'type', 'double_points',
    'name', 'Puntos dobles',
    'status', p.status,
    'rules', coalesce(p.rules, '{}'::jsonb)
  )
  into v_double_points
  from promotions p
  where p.scope_type = 'artist'
    and p.artist_id = v_artist.id
    and p.promotion_type = 'double_points'
    and p.status in ('active', 'paused')
  order by p.updated_at desc
  limit 1;

  select jsonb_build_object(
    'id', p.id,
    'type', 'happy_hour',
    'name', 'Happy Hour',
    'status', p.status,
    'rules', coalesce(p.rules, '{}'::jsonb)
  )
  into v_happy_hour
  from promotions p
  where p.scope_type = 'artist'
    and p.artist_id = v_artist.id
    and p.promotion_type = 'happy_hour'
    and p.status in ('active', 'paused')
  order by p.updated_at desc
  limit 1;

  return jsonb_build_object(
    'rewards', v_rewards,
    'flowPointsEnabled', v_preferences.flow_points_enabled,
    'flow_points_enabled', v_preferences.flow_points_enabled,
    'lowOccupancy', jsonb_build_object(
      'active', v_preferences.low_occupancy_enabled,
      'period', v_preferences.low_occupancy_period,
      'threshold', v_preferences.low_occupancy_threshold
    ),
    'low_occupancy', jsonb_build_object(
      'active', v_preferences.low_occupancy_enabled,
      'period', v_preferences.low_occupancy_period,
      'threshold', v_preferences.low_occupancy_threshold
    ),
    'maintenanceReminderDays', v_preferences.maintenance_reminder_days,
    'maintenance_reminder_days', v_preferences.maintenance_reminder_days,
    'doublePoints', coalesce(v_double_points, jsonb_build_object('status', 'paused', 'rules', '{}'::jsonb)),
    'double_points', coalesce(v_double_points, jsonb_build_object('status', 'paused', 'rules', '{}'::jsonb)),
    'happyHour', coalesce(v_happy_hour, jsonb_build_object('status', 'paused', 'rules', '{}'::jsonb)),
    'happy_hour', coalesce(v_happy_hour, jsonb_build_object('status', 'paused', 'rules', '{}'::jsonb))
  );
end;
$$;

create or replace function public.studio_flow_artist_set_flow_points_enabled(
  p_active boolean,
  p_artist_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_artist artists%rowtype;
  v_status promotion_status := case when coalesce(p_active, false) then 'active'::promotion_status else 'paused'::promotion_status end;
  v_reward_status reward_status := case when coalesce(p_active, false) then 'active'::reward_status else 'paused'::reward_status end;
begin
  v_artist := public.studio_flow_artist_current_owned_artist(p_artist_id);

  insert into artist_marketing_preferences (artist_id, flow_points_enabled, updated_at)
  values (v_artist.id, coalesce(p_active, false), now())
  on conflict (artist_id) do update
  set flow_points_enabled = excluded.flow_points_enabled,
      updated_at = now();

  update promotions
  set status = v_status,
      starts_at = case when coalesce(p_active, false) then coalesce(starts_at, now()) else starts_at end,
      ends_at = null,
      rules = jsonb_build_object('clientRequiresCompletedVisit', true),
      updated_at = now()
  where scope_type = 'artist'
    and artist_id = v_artist.id
    and promotion_type = 'private_promo'
    and name = 'Flow Points';

  if not found then
    insert into promotions (
      scope_type, artist_id, created_by_profile_id, promotion_type, name, status, starts_at, rules, updated_at
    )
    values (
      'artist', v_artist.id, auth.uid(), 'private_promo', 'Flow Points',
      v_status, now(), jsonb_build_object('clientRequiresCompletedVisit', true), now()
    );
  end if;

  update rewards
  set status = v_reward_status,
      updated_at = now()
  where scope_type = 'artist'
    and artist_id = v_artist.id
    and archived_at is null
    and status in ('active', 'paused');

  return public.studio_flow_artist_get_marketing_settings(v_artist.id);
end;
$$;

create or replace function public.studio_flow_artist_set_double_points_promotion(
  p_active boolean,
  p_artist_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_artist artists%rowtype;
  v_status promotion_status := case when coalesce(p_active, false) then 'active'::promotion_status else 'paused'::promotion_status end;
begin
  v_artist := public.studio_flow_artist_current_owned_artist(p_artist_id);

  update promotions
  set status = v_status,
      starts_at = case when coalesce(p_active, false) then coalesce(starts_at, now()) else starts_at end,
      ends_at = null,
      rules = jsonb_build_object('multiplier', 2, 'source', 'manual'),
      updated_at = now()
  where scope_type = 'artist'
    and artist_id = v_artist.id
    and promotion_type = 'double_points';

  if not found then
    insert into promotions (
      scope_type, artist_id, created_by_profile_id, promotion_type, name, status, starts_at, rules, updated_at
    )
    values (
      'artist', v_artist.id, auth.uid(), 'double_points', 'Puntos dobles',
      v_status, now(), jsonb_build_object('multiplier', 2, 'source', 'manual'), now()
    );
  end if;

  return public.studio_flow_artist_get_marketing_settings(v_artist.id);
end;
$$;

create or replace function public.studio_flow_artist_save_happy_hour_promotion(
  p_active boolean,
  p_discount_percent integer,
  p_weekdays integer[],
  p_start_time time,
  p_end_time time,
  p_artist_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_artist artists%rowtype;
  v_discount integer := coalesce(p_discount_percent, 0);
  v_rules jsonb;
  v_status promotion_status := case when coalesce(p_active, false) then 'active'::promotion_status else 'paused'::promotion_status end;
begin
  v_artist := public.studio_flow_artist_current_owned_artist(p_artist_id);

  if v_discount not in (5, 10, 15, 20, 25, 30) then
    raise exception 'Invalid discount percent';
  end if;

  if p_start_time is null or p_end_time is null or p_end_time <= p_start_time then
    raise exception 'Invalid happy hour interval';
  end if;

  v_rules := jsonb_build_object(
    'discountPercent', v_discount,
    'weekdays', coalesce(p_weekdays, array[]::integer[]),
    'startTime', p_start_time::text,
    'endTime', p_end_time::text,
    'source', 'manual'
  );

  update promotions
  set status = v_status,
      starts_at = case when coalesce(p_active, false) then coalesce(starts_at, now()) else starts_at end,
      ends_at = null,
      rules = v_rules,
      updated_at = now()
  where scope_type = 'artist'
    and artist_id = v_artist.id
    and promotion_type = 'happy_hour';

  if not found then
    insert into promotions (
      scope_type, artist_id, created_by_profile_id, promotion_type, name, status, starts_at, rules, updated_at
    )
    values (
      'artist', v_artist.id, auth.uid(), 'happy_hour', 'Happy Hour',
      v_status, now(), v_rules, now()
    );
  end if;

  return public.studio_flow_artist_get_marketing_settings(v_artist.id);
end;
$$;

create or replace function public.studio_flow_artist_save_flow_point_reward(
  p_discount_percent integer,
  p_points_cost integer,
  p_artist_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_artist artists%rowtype;
  v_reward rewards%rowtype;
  v_discount integer := coalesce(p_discount_percent, 0);
  v_points integer := coalesce(p_points_cost, 0);
  v_enabled boolean := false;
begin
  v_artist := public.studio_flow_artist_current_owned_artist(p_artist_id);

  if v_discount not in (5, 10, 15, 20, 25, 30) then
    raise exception 'Invalid discount percent';
  end if;

  if v_points <= 0 then
    raise exception 'Invalid points cost';
  end if;

  select coalesce(flow_points_enabled, false)
  into v_enabled
  from artist_marketing_preferences
  where artist_id = v_artist.id;

  insert into rewards (
    scope_type, artist_id, name, reward_type, points_cost, status, validity_days, updated_at
  )
  values (
    'artist',
    v_artist.id,
    'Beneficio Flow Points',
    'discount',
    v_points,
    case when coalesce(v_enabled, false) then 'active'::reward_status else 'paused'::reward_status end,
    31,
    now()
  )
  returning * into v_reward;

  update rewards
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('discountPercent', v_discount),
      updated_at = now()
  where id = v_reward.id
  returning * into v_reward;

  return jsonb_build_object(
    'reward', jsonb_build_object(
      'id', v_reward.id,
      'name', v_reward.name,
      'discountPercent', v_discount,
      'discount_percent', v_discount,
      'pointsCost', v_reward.points_cost,
      'points_cost', v_reward.points_cost,
      'status', v_reward.status
    )
  );
end;
$$;

revoke all on function public.studio_flow_artist_get_marketing_settings(uuid) from public;
revoke all on function public.studio_flow_artist_set_flow_points_enabled(boolean, uuid) from public;
revoke all on function public.studio_flow_artist_set_double_points_promotion(boolean, uuid) from public;
revoke all on function public.studio_flow_artist_save_happy_hour_promotion(boolean, integer, integer[], time, time, uuid) from public;
revoke all on function public.studio_flow_artist_save_flow_point_reward(integer, integer, uuid) from public;

grant execute on function public.studio_flow_artist_get_marketing_settings(uuid) to authenticated;
grant execute on function public.studio_flow_artist_set_flow_points_enabled(boolean, uuid) to authenticated;
grant execute on function public.studio_flow_artist_set_double_points_promotion(boolean, uuid) to authenticated;
grant execute on function public.studio_flow_artist_save_happy_hour_promotion(boolean, integer, integer[], time, time, uuid) to authenticated;
grant execute on function public.studio_flow_artist_save_flow_point_reward(integer, integer, uuid) to authenticated;
