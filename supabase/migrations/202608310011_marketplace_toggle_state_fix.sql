create or replace function public.studio_flow_artist_get_marketing_settings()
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
  v_flow_points_enabled boolean := false;
begin
  v_artist := public.studio_flow_artist_current_owned_artist(null);

  insert into artist_marketing_preferences (artist_id, updated_at)
  values (v_artist.id, now())
  on conflict (artist_id) do update
  set updated_at = artist_marketing_preferences.updated_at
  returning * into v_preferences;

  v_flow_points_enabled := v_preferences.flow_points_enabled or exists (
    select 1
    from promotions p
    where p.scope_type = 'artist'
      and p.artist_id = v_artist.id
      and p.promotion_type = 'private_promo'
      and p.name = 'Flow Points'
      and p.status = 'active'
  );

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
    'id', max(p.id::text)::uuid,
    'type', 'double_points',
    'name', 'Puntos dobles',
    'status', case when bool_or(p.status = 'active') then 'active' else 'paused' end,
    'rules', coalesce((array_agg(coalesce(p.rules, '{}'::jsonb) order by p.updated_at desc))[1], '{}'::jsonb)
  )
  into v_double_points
  from promotions p
  where p.scope_type = 'artist'
    and p.artist_id = v_artist.id
    and p.promotion_type = 'double_points'
    and p.status in ('active', 'paused');

  select jsonb_build_object(
    'id', max(p.id::text)::uuid,
    'type', 'happy_hour',
    'name', 'Happy Hour',
    'status', case when bool_or(p.status = 'active') then 'active' else 'paused' end,
    'rules', coalesce((array_agg(coalesce(p.rules, '{}'::jsonb) order by p.updated_at desc))[1], '{}'::jsonb)
  )
  into v_happy_hour
  from promotions p
  where p.scope_type = 'artist'
    and p.artist_id = v_artist.id
    and p.promotion_type = 'happy_hour'
    and p.status in ('active', 'paused');

  return jsonb_build_object(
    'rewards', v_rewards,
    'flowPointsEnabled', v_flow_points_enabled,
    'flow_points_enabled', v_flow_points_enabled,
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

create or replace function public.studio_flow_artist_set_double_points_promotion(
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_artist artists%rowtype;
begin
  v_artist := public.studio_flow_artist_current_owned_artist(null);

  update promotions
  set status = case when p_active then 'active'::promotion_status else 'paused'::promotion_status end,
      starts_at = case when p_active then coalesce(starts_at, now()) else starts_at end,
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
      case when p_active then 'active' else 'paused' end,
      now(), jsonb_build_object('multiplier', 2, 'source', 'manual'), now()
    );
  end if;

  return public.studio_flow_artist_get_marketing_settings();
end;
$$;

create or replace function public.studio_flow_artist_save_happy_hour_promotion(
  p_active boolean,
  p_discount_percent integer,
  p_weekdays integer[],
  p_start_time time,
  p_end_time time
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
begin
  v_artist := public.studio_flow_artist_current_owned_artist(null);

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
  set status = case when p_active then 'active'::promotion_status else 'paused'::promotion_status end,
      starts_at = case when p_active then coalesce(starts_at, now()) else starts_at end,
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
      case when p_active then 'active' else 'paused' end,
      now(), v_rules, now()
    );
  end if;

  return public.studio_flow_artist_get_marketing_settings();
end;
$$;

revoke all on function public.studio_flow_artist_get_marketing_settings() from public;
revoke all on function public.studio_flow_artist_set_double_points_promotion(boolean) from public;
revoke all on function public.studio_flow_artist_save_happy_hour_promotion(boolean, integer, integer[], time, time) from public;

grant execute on function public.studio_flow_artist_get_marketing_settings() to authenticated;
grant execute on function public.studio_flow_artist_set_double_points_promotion(boolean) to authenticated;
grant execute on function public.studio_flow_artist_save_happy_hour_promotion(boolean, integer, integer[], time, time) to authenticated;
