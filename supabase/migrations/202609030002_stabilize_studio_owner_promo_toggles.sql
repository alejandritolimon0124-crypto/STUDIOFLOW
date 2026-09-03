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
  v_promotion_id uuid;
begin
  v_studio_id := public.studio_flow_owner_assert_studio_access(p_studio_id);

  select p.id
  into v_promotion_id
  from promotions p
  where p.scope_type = 'studio'
    and p.studio_id = v_studio_id
    and p.promotion_type = 'double_points'
  order by case when p.status in ('active', 'paused') then 0 else 1 end, p.updated_at desc nulls last, p.created_at desc
  limit 1;

  if v_promotion_id is null then
    insert into promotions (scope_type, studio_id, created_by_profile_id, promotion_type, name, status, starts_at, ends_at, rules, updated_at)
    values (
      'studio',
      v_studio_id,
      auth.uid(),
      'double_points',
      'Puntos dobles',
      case when v_active then 'active'::promotion_status else 'paused'::promotion_status end,
      case when v_active then now() else null end,
      null,
      jsonb_build_object('multiplier', 2),
      now()
    )
    returning id into v_promotion_id;
  else
    update promotions
    set status = case when v_active then 'active'::promotion_status else 'paused'::promotion_status end,
        starts_at = case when v_active then coalesce(starts_at, now()) else starts_at end,
        ends_at = null,
        rules = jsonb_build_object('multiplier', 2),
        updated_at = now()
    where id = v_promotion_id;
  end if;

  update promotions
  set status = 'paused'::promotion_status,
      updated_at = now()
  where scope_type = 'studio'
    and studio_id = v_studio_id
    and promotion_type = 'double_points'
    and id <> v_promotion_id
    and status = 'active';

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
  v_promotion_id uuid;
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

  select p.id
  into v_promotion_id
  from promotions p
  where p.scope_type = 'studio'
    and p.studio_id = v_studio_id
    and p.promotion_type = 'happy_hour'
  order by case when p.status in ('active', 'paused') then 0 else 1 end, p.updated_at desc nulls last, p.created_at desc
  limit 1;

  if v_promotion_id is null then
    insert into promotions (scope_type, studio_id, created_by_profile_id, promotion_type, name, status, starts_at, ends_at, rules, updated_at)
    values (
      'studio',
      v_studio_id,
      auth.uid(),
      'happy_hour',
      'Happy Hour',
      case when v_active then 'active'::promotion_status else 'paused'::promotion_status end,
      case when v_active then now() else null end,
      null,
      v_rules,
      now()
    )
    returning id into v_promotion_id;
  else
    update promotions
    set status = case when v_active then 'active'::promotion_status else 'paused'::promotion_status end,
        starts_at = case when v_active then coalesce(starts_at, now()) else starts_at end,
        ends_at = null,
        rules = v_rules,
        updated_at = now()
    where id = v_promotion_id;
  end if;

  update promotions
  set status = 'paused'::promotion_status,
      updated_at = now()
  where scope_type = 'studio'
    and studio_id = v_studio_id
    and promotion_type = 'happy_hour'
    and id <> v_promotion_id
    and status = 'active';

  return public.studio_flow_studio_get_marketing_settings(v_studio_id);
end;
$$;

revoke all on function public.studio_flow_studio_set_double_points_promotion(boolean, uuid) from public;
revoke all on function public.studio_flow_studio_save_happy_hour_promotion(boolean, integer, integer[], time, time, uuid) from public;

grant execute on function public.studio_flow_studio_set_double_points_promotion(boolean, uuid) to authenticated;
grant execute on function public.studio_flow_studio_save_happy_hour_promotion(boolean, integer, integer[], time, time, uuid) to authenticated;
