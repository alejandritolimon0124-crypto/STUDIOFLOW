create or replace function public.studio_flow_hide_studio_marketplace(
  p_studio_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_studio_id uuid;
  v_marketplace_profile marketplace_profiles%rowtype;
begin
  v_studio_id := public.studio_flow_owner_assert_studio_access(p_studio_id);

  update marketplace_profiles
  set visibility_status = 'hidden',
      hidden_at = now(),
      updated_at = now()
  where profile_type = 'studio'
    and studio_id = v_studio_id
  returning *
  into v_marketplace_profile;

  update marketplace_listings
  set visibility_status = 'hidden',
      expires_at = coalesce(expires_at, now()),
      updated_at = now()
  where studio_id = v_studio_id
    and (
      v_marketplace_profile.id is null
      or marketplace_profile_id = v_marketplace_profile.id
    );

  return jsonb_build_object(
    'studioId', v_studio_id,
    'studio_id', v_studio_id,
    'marketplaceProfileId', v_marketplace_profile.id,
    'marketplace_profile_id', v_marketplace_profile.id,
    'visibilityStatus', coalesce(v_marketplace_profile.visibility_status::text, 'hidden'),
    'visibility_status', coalesce(v_marketplace_profile.visibility_status::text, 'hidden')
  );
end;
$$;

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
  order by case when p.status = 'active' then 0 else 1 end, p.updated_at desc
  limit 1;

  select jsonb_build_object('id', p.id, 'type', 'happy_hour', 'name', 'Happy Hour', 'status', p.status, 'rules', coalesce(p.rules, '{}'::jsonb))
  into v_happy_hour
  from promotions p
  where p.scope_type = 'studio'
    and p.studio_id = v_studio_id
    and p.promotion_type = 'happy_hour'
    and p.status in ('active', 'paused')
  order by case when p.status = 'active' then 0 else 1 end, p.updated_at desc
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

revoke all on function public.studio_flow_hide_studio_marketplace(uuid) from public;
grant execute on function public.studio_flow_hide_studio_marketplace(uuid) to authenticated;

revoke all on function public.studio_flow_studio_get_marketing_settings(uuid) from public;
grant execute on function public.studio_flow_studio_get_marketing_settings(uuid) to authenticated;
