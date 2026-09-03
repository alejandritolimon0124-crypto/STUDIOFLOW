create table if not exists public.studio_marketing_preferences (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id),
  flow_points_enabled boolean not null default false,
  point_redemption_scope text not null default 'exclusive',
  low_occupancy_enabled boolean not null default false,
  low_occupancy_period text not null default 'week',
  low_occupancy_threshold integer not null default 40,
  maintenance_reminder_days integer not null default 14,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint studio_marketing_preferences_studio_unique unique (studio_id),
  constraint studio_marketing_preferences_point_scope_check check (point_redemption_scope in ('exclusive', 'open')),
  constraint studio_marketing_preferences_period_check check (low_occupancy_period in ('week', 'month')),
  constraint studio_marketing_preferences_threshold_check check (low_occupancy_threshold between 1 and 40),
  constraint studio_marketing_preferences_maintenance_check check (maintenance_reminder_days in (7, 14, 30))
);

create or replace function public.studio_flow_studio_get_marketing_settings(
  p_studio_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_studio_id uuid;
  v_preferences studio_marketing_preferences%rowtype;
  v_rewards jsonb;
  v_double_points jsonb;
  v_happy_hour jsonb;
begin
  v_studio_id := public.studio_flow_owner_assert_studio_access(p_studio_id);

  insert into studio_marketing_preferences (studio_id, updated_at)
  values (v_studio_id, now())
  on conflict (studio_id) do update
  set updated_at = studio_marketing_preferences.updated_at
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
  where r.scope_type = 'studio'
    and r.studio_id = v_studio_id
    and r.archived_at is null
    and r.status in ('active', 'paused', 'draft');

  select jsonb_build_object('id', p.id, 'type', 'double_points', 'name', 'Puntos dobles', 'status', p.status, 'rules', coalesce(p.rules, '{}'::jsonb))
  into v_double_points
  from promotions p
  where p.scope_type = 'studio'
    and p.studio_id = v_studio_id
    and p.promotion_type = 'double_points'
    and p.status in ('active', 'paused')
  order by p.updated_at desc
  limit 1;

  select jsonb_build_object('id', p.id, 'type', 'happy_hour', 'name', 'Happy Hour', 'status', p.status, 'rules', coalesce(p.rules, '{}'::jsonb))
  into v_happy_hour
  from promotions p
  where p.scope_type = 'studio'
    and p.studio_id = v_studio_id
    and p.promotion_type = 'happy_hour'
    and p.status in ('active', 'paused')
  order by p.updated_at desc
  limit 1;

  return jsonb_build_object(
    'rewards', v_rewards,
    'flowPointsEnabled', v_preferences.flow_points_enabled,
    'flow_points_enabled', v_preferences.flow_points_enabled,
    'flowPointRedemptionScope', v_preferences.point_redemption_scope,
    'flow_point_redemption_scope', v_preferences.point_redemption_scope,
    'lowOccupancy', jsonb_build_object('active', v_preferences.low_occupancy_enabled, 'period', v_preferences.low_occupancy_period, 'threshold', v_preferences.low_occupancy_threshold),
    'low_occupancy', jsonb_build_object('active', v_preferences.low_occupancy_enabled, 'period', v_preferences.low_occupancy_period, 'threshold', v_preferences.low_occupancy_threshold),
    'maintenanceReminderDays', v_preferences.maintenance_reminder_days,
    'maintenance_reminder_days', v_preferences.maintenance_reminder_days,
    'doublePoints', coalesce(v_double_points, jsonb_build_object('status', 'paused', 'rules', '{}'::jsonb)),
    'double_points', coalesce(v_double_points, jsonb_build_object('status', 'paused', 'rules', '{}'::jsonb)),
    'happyHour', coalesce(v_happy_hour, jsonb_build_object('status', 'paused', 'rules', '{}'::jsonb)),
    'happy_hour', coalesce(v_happy_hour, jsonb_build_object('status', 'paused', 'rules', '{}'::jsonb))
  );
end;
$$;

create or replace function public.studio_flow_studio_set_flow_points_enabled(
  p_active boolean,
  p_studio_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_studio_id uuid;
begin
  v_studio_id := public.studio_flow_owner_assert_studio_access(p_studio_id);

  insert into studio_marketing_preferences (studio_id, flow_points_enabled, updated_at)
  values (v_studio_id, coalesce(p_active, false), now())
  on conflict (studio_id) do update
  set flow_points_enabled = excluded.flow_points_enabled,
      updated_at = now();

  return public.studio_flow_studio_get_marketing_settings(v_studio_id);
end;
$$;

create or replace function public.studio_flow_studio_set_flow_points_redemption_scope(
  p_scope text,
  p_studio_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_studio_id uuid;
  v_scope text := case when p_scope = 'open' then 'open' else 'exclusive' end;
begin
  v_studio_id := public.studio_flow_owner_assert_studio_access(p_studio_id);

  insert into studio_marketing_preferences (studio_id, point_redemption_scope, updated_at)
  values (v_studio_id, v_scope, now())
  on conflict (studio_id) do update
  set point_redemption_scope = excluded.point_redemption_scope,
      updated_at = now();

  return public.studio_flow_studio_get_marketing_settings(v_studio_id);
end;
$$;

create or replace function public.studio_flow_studio_save_flow_point_reward(
  p_discount_percent integer,
  p_points_cost integer,
  p_studio_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_studio_id uuid;
  v_discount integer := coalesce(p_discount_percent, 0);
  v_reward rewards%rowtype;
begin
  v_studio_id := public.studio_flow_owner_assert_studio_access(p_studio_id);

  if v_discount not in (5, 10, 15, 20, 25, 30) then
    raise exception 'Invalid discount percent';
  end if;

  if coalesce(p_points_cost, 0) <= 0 then
    raise exception 'Points cost must be greater than zero';
  end if;

  insert into rewards (scope_type, studio_id, name, reward_type, points_cost, status, validity_days, metadata, updated_at)
  values ('studio', v_studio_id, concat(v_discount, '% de descuento'), 'discount', p_points_cost, 'active', 90, jsonb_build_object('discountPercent', v_discount), now())
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

create or replace function public.studio_flow_studio_delete_flow_point_reward(
  p_reward_id uuid,
  p_studio_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_studio_id uuid;
begin
  v_studio_id := public.studio_flow_owner_assert_studio_access(p_studio_id);

  update rewards
  set status = 'paused',
      archived_at = now(),
      updated_at = now()
  where id = p_reward_id
    and scope_type = 'studio'
    and studio_id = v_studio_id;

  if not found then
    raise exception 'Reward not found for this studio';
  end if;

  return public.studio_flow_studio_get_marketing_settings(v_studio_id);
end;
$$;

create or replace function public.studio_flow_studio_set_double_points_promotion(
  p_active boolean,
  p_studio_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_studio_id uuid;
  v_active boolean := coalesce(p_active, false);
begin
  v_studio_id := public.studio_flow_owner_assert_studio_access(p_studio_id);

  update promotions
  set status = case when v_active then 'active'::promotion_status else 'paused'::promotion_status end,
      starts_at = case when v_active then coalesce(starts_at, now()) else starts_at end,
      ends_at = null,
      rules = jsonb_build_object('multiplier', 2),
      updated_at = now()
  where scope_type = 'studio'
    and studio_id = v_studio_id
    and promotion_type = 'double_points';

  if not found then
    insert into promotions (scope_type, studio_id, created_by_profile_id, promotion_type, name, status, starts_at, rules, updated_at)
    values ('studio', v_studio_id, auth.uid(), 'double_points', 'Puntos dobles', case when v_active then 'active' else 'paused' end, case when v_active then now() else null end, jsonb_build_object('multiplier', 2), now());
  end if;

  return public.studio_flow_studio_get_marketing_settings(v_studio_id);
end;
$$;

create or replace function public.studio_flow_studio_save_happy_hour_promotion(
  p_active boolean,
  p_discount_percent integer,
  p_weekdays integer[],
  p_start_time time,
  p_end_time time,
  p_studio_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_studio_id uuid;
  v_active boolean := coalesce(p_active, false);
  v_discount integer := coalesce(p_discount_percent, 0);
  v_rules jsonb;
begin
  v_studio_id := public.studio_flow_owner_assert_studio_access(p_studio_id);

  if v_discount not in (5, 10, 15, 20, 25, 30) then
    raise exception 'Invalid discount percent';
  end if;

  if p_start_time is null or p_end_time is null or p_start_time >= p_end_time then
    raise exception 'Invalid happy hour time range';
  end if;

  v_rules := jsonb_build_object(
    'discountPercent', v_discount,
    'weekdays', coalesce(p_weekdays, array[]::integer[]),
    'startTime', p_start_time::text,
    'endTime', p_end_time::text
  );

  update promotions
  set status = case when v_active then 'active'::promotion_status else 'paused'::promotion_status end,
      starts_at = case when v_active then coalesce(starts_at, now()) else starts_at end,
      ends_at = null,
      rules = v_rules,
      updated_at = now()
  where scope_type = 'studio'
    and studio_id = v_studio_id
    and promotion_type = 'happy_hour';

  if not found then
    insert into promotions (scope_type, studio_id, created_by_profile_id, promotion_type, name, status, starts_at, rules, updated_at)
    values ('studio', v_studio_id, auth.uid(), 'happy_hour', 'Happy Hour', case when v_active then 'active' else 'paused' end, case when v_active then now() else null end, v_rules, now());
  end if;

  return public.studio_flow_studio_get_marketing_settings(v_studio_id);
end;
$$;

revoke all on function public.studio_flow_studio_get_marketing_settings(uuid) from public;
revoke all on function public.studio_flow_studio_set_flow_points_enabled(boolean, uuid) from public;
revoke all on function public.studio_flow_studio_set_flow_points_redemption_scope(text, uuid) from public;
revoke all on function public.studio_flow_studio_save_flow_point_reward(integer, integer, uuid) from public;
revoke all on function public.studio_flow_studio_delete_flow_point_reward(uuid, uuid) from public;
revoke all on function public.studio_flow_studio_set_double_points_promotion(boolean, uuid) from public;
revoke all on function public.studio_flow_studio_save_happy_hour_promotion(boolean, integer, integer[], time, time, uuid) from public;

grant execute on function public.studio_flow_studio_get_marketing_settings(uuid) to authenticated;
grant execute on function public.studio_flow_studio_set_flow_points_enabled(boolean, uuid) to authenticated;
grant execute on function public.studio_flow_studio_set_flow_points_redemption_scope(text, uuid) to authenticated;
grant execute on function public.studio_flow_studio_save_flow_point_reward(integer, integer, uuid) to authenticated;
grant execute on function public.studio_flow_studio_delete_flow_point_reward(uuid, uuid) to authenticated;
grant execute on function public.studio_flow_studio_set_double_points_promotion(boolean, uuid) to authenticated;
grant execute on function public.studio_flow_studio_save_happy_hour_promotion(boolean, integer, integer[], time, time, uuid) to authenticated;
