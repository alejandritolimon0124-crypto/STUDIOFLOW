alter table public.rewards
add column if not exists metadata jsonb not null default '{}'::jsonb;

create or replace function public.studio_flow_artist_active_double_points_multiplier(
  p_artist_id uuid,
  p_studio_id uuid default null,
  p_at timestamptz default now()
)
returns integer
language sql
security definer
set search_path = public, auth
as $$
  select case when exists (
    select 1
    from promotions p
    where p.promotion_type = 'double_points'
      and p.status = 'active'
      and (p.starts_at is null or p.starts_at <= p_at)
      and (p.ends_at is null or p.ends_at > p_at)
      and (
        (p.scope_type = 'artist' and p.artist_id = p_artist_id)
        or (p.scope_type = 'studio' and p.studio_id = p_studio_id)
      )
  ) then 2 else 1 end;
$$;

create or replace function public.studio_flow_artist_get_marketing_settings()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_artist artists%rowtype;
  v_rewards jsonb;
  v_double_points jsonb;
  v_happy_hour jsonb;
begin
  v_artist := public.studio_flow_artist_current_owned_artist(null);

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
    and r.status in ('active', 'draft');

  select jsonb_build_object('id', p.id, 'type', p.promotion_type, 'name', p.name, 'status', p.status, 'rules', p.rules)
  into v_double_points
  from promotions p
  where p.scope_type = 'artist'
    and p.artist_id = v_artist.id
    and p.promotion_type = 'double_points'
    and p.status in ('active', 'paused')
  order by p.updated_at desc
  limit 1;

  select jsonb_build_object('id', p.id, 'type', p.promotion_type, 'name', p.name, 'status', p.status, 'rules', p.rules)
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
    'doublePoints', coalesce(v_double_points, jsonb_build_object('status', 'paused', 'rules', '{}'::jsonb)),
    'double_points', coalesce(v_double_points, jsonb_build_object('status', 'paused', 'rules', '{}'::jsonb)),
    'happyHour', coalesce(v_happy_hour, jsonb_build_object('status', 'paused', 'rules', '{}'::jsonb)),
    'happy_hour', coalesce(v_happy_hour, jsonb_build_object('status', 'paused', 'rules', '{}'::jsonb))
  );
end;
$$;

create or replace function public.studio_flow_artist_save_flow_point_reward(
  p_discount_percent integer,
  p_points_cost integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_artist artists%rowtype;
  v_discount integer := coalesce(p_discount_percent, 0);
  v_reward rewards%rowtype;
begin
  v_artist := public.studio_flow_artist_current_owned_artist(null);

  if v_discount not in (5, 10, 15, 20, 25, 30) then
    raise exception 'Invalid discount percent';
  end if;

  if coalesce(p_points_cost, 0) <= 0 then
    raise exception 'Points cost is required';
  end if;

  insert into rewards (
    scope_type,
    artist_id,
    name,
    reward_type,
    points_cost,
    status,
    validity_days,
    metadata,
    updated_at
  )
  values (
    'artist',
    v_artist.id,
    concat(v_discount, '% de descuento'),
    'discount',
    p_points_cost,
    'active',
    30,
    jsonb_build_object('discountPercent', v_discount),
    now()
  )
  returning *
  into v_reward;

  return jsonb_build_object('reward', jsonb_build_object(
    'id', v_reward.id,
    'name', v_reward.name,
    'discountPercent', v_discount,
    'discount_percent', v_discount,
    'pointsCost', v_reward.points_cost,
    'points_cost', v_reward.points_cost,
    'status', v_reward.status
  ));
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
  v_promotion promotions%rowtype;
begin
  v_artist := public.studio_flow_artist_current_owned_artist(null);

  insert into promotions (
    scope_type,
    artist_id,
    created_by_profile_id,
    promotion_type,
    name,
    status,
    starts_at,
    rules,
    updated_at
  )
  values (
    'artist',
    v_artist.id,
    auth.uid(),
    'double_points',
    'Puntos dobles',
    case when p_active then 'active' else 'paused' end,
    now(),
    jsonb_build_object('multiplier', 2),
    now()
  )
  on conflict do nothing;

  update promotions
  set status = case when p_active then 'active'::promotion_status else 'paused'::promotion_status end,
      starts_at = case when p_active then coalesce(starts_at, now()) else starts_at end,
      ends_at = null,
      rules = jsonb_build_object('multiplier', 2),
      updated_at = now()
  where id = (
    select p.id
    from promotions p
    where p.scope_type = 'artist'
      and p.artist_id = v_artist.id
      and p.promotion_type = 'double_points'
    order by p.updated_at desc
    limit 1
  )
  returning *
  into v_promotion;

  return jsonb_build_object('promotion', jsonb_build_object(
    'id', v_promotion.id,
    'type', v_promotion.promotion_type,
    'status', v_promotion.status,
    'rules', v_promotion.rules
  ));
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
  v_promotion promotions%rowtype;
begin
  v_artist := public.studio_flow_artist_current_owned_artist(null);

  if v_discount not in (5, 10, 15, 20, 25, 30) then
    raise exception 'Invalid discount percent';
  end if;

  if p_start_time is null or p_end_time is null or p_end_time <= p_start_time then
    raise exception 'Invalid happy hour interval';
  end if;

  insert into promotions (
    scope_type,
    artist_id,
    created_by_profile_id,
    promotion_type,
    name,
    status,
    starts_at,
    rules,
    updated_at
  )
  values (
    'artist',
    v_artist.id,
    auth.uid(),
    'happy_hour',
    'Happy Hour',
    case when p_active then 'active' else 'paused' end,
    now(),
    jsonb_build_object(
      'discountPercent', v_discount,
      'weekdays', coalesce(p_weekdays, array[]::integer[]),
      'startTime', p_start_time::text,
      'endTime', p_end_time::text
    ),
    now()
  )
  on conflict do nothing;

  update promotions
  set status = case when p_active then 'active'::promotion_status else 'paused'::promotion_status end,
      starts_at = coalesce(starts_at, now()),
      ends_at = null,
      rules = jsonb_build_object(
        'discountPercent', v_discount,
        'weekdays', coalesce(p_weekdays, array[]::integer[]),
        'startTime', p_start_time::text,
        'endTime', p_end_time::text
      ),
      updated_at = now()
  where id = (
    select p.id
    from promotions p
    where p.scope_type = 'artist'
      and p.artist_id = v_artist.id
      and p.promotion_type = 'happy_hour'
    order by p.updated_at desc
    limit 1
  )
  returning *
  into v_promotion;

  return jsonb_build_object('promotion', jsonb_build_object(
    'id', v_promotion.id,
    'type', v_promotion.promotion_type,
    'status', v_promotion.status,
    'rules', v_promotion.rules
  ));
end;
$$;

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.studio_flow_artist_award_appointment_points(uuid)'::regprocedure)
  into v_definition;

  if v_definition is not null then
    v_definition := replace(
      v_definition,
      'v_points := coalesce(v_service.flow_points_awarded, 0);',
      'v_points := coalesce(v_service.flow_points_awarded, 0) * public.studio_flow_artist_active_double_points_multiplier(v_appointment.artist_id, v_appointment.studio_id, now());'
    );
    v_definition := replace(
      v_definition,
      '''source'', ''manual_artist_button''',
      '''source'', ''manual_artist_button'',
      ''doublePointsMultiplier'', public.studio_flow_artist_active_double_points_multiplier(v_appointment.artist_id, v_appointment.studio_id, now())'
    );
    execute v_definition;
  end if;
end;
$$;

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.studio_flow_marketplace_get_listings()'::regprocedure)
  into v_definition;

  if v_definition is not null then
    v_definition := replace(
      v_definition,
      'availability.available_today_count',
      'availability.available_today_count,
      coalesce(promotions.active_promotions, ''[]''::jsonb) as active_promotions'
    );
    v_definition := replace(
      v_definition,
      'cross join lateral (
      select
        count(*)::integer as available_count,',
      'cross join lateral (
      select
        count(*)::integer as available_count,'
    );
    v_definition := replace(
      v_definition,
      '    where (lt.profile_type = ''studio'' or a.status = ''active'')',
      '    left join lateral (
      select coalesce(jsonb_agg(jsonb_build_object(
        ''type'', p.promotion_type,
        ''status'', p.status,
        ''rules'', p.rules
      )), ''[]''::jsonb) as active_promotions
      from promotions p
      where p.status = ''active''
        and (p.starts_at is null or p.starts_at <= now())
        and (p.ends_at is null or p.ends_at > now())
        and (
          (p.scope_type = ''artist'' and p.artist_id = lt.artist_id)
          or (p.scope_type = ''studio'' and p.studio_id = lt.studio_id)
        )
    ) promotions on true
    where (lt.profile_type = ''studio'' or a.status = ''active'')'
    );
    v_definition := replace(
      v_definition,
      '''visibilityStatus'', visibility_status,
        ''services'', services,',
      '''visibilityStatus'', visibility_status,
        ''activePromotions'', active_promotions,
        ''active_promotions'', active_promotions,
        ''services'', services,'
    );
    execute v_definition;
  end if;

  select pg_get_functiondef('public.studio_flow_marketplace_get_availability(uuid,uuid,date)'::regprocedure)
  into v_definition;

  if v_definition is not null then
    v_definition := replace(
      v_definition,
      '''available'', true,
        ''status'', ''available''',
      '''available'', true,
        ''isHappyHour'', exists (
          select 1
          from promotions promo
          where promo.promotion_type = ''happy_hour''
            and promo.status = ''active''
            and (promo.starts_at is null or promo.starts_at <= candidate.starts_at)
            and (promo.ends_at is null or promo.ends_at > candidate.starts_at)
            and (
              (promo.scope_type = ''artist'' and promo.artist_id = candidate.artist_id)
              or (promo.scope_type = ''studio'' and promo.studio_id = candidate.studio_id)
            )
            and coalesce((promo.rules -> ''weekdays'') ? extract(dow from candidate.starts_at at time zone ''America/Mexico_City'')::int::text, true)
            and (promo.rules ->> ''startTime'')::time <= (candidate.starts_at at time zone ''America/Mexico_City'')::time
            and (promo.rules ->> ''endTime'')::time > (candidate.starts_at at time zone ''America/Mexico_City'')::time
        ),
        ''happyHourDiscountPercent'', coalesce((
          select (promo.rules ->> ''discountPercent'')::integer
          from promotions promo
          where promo.promotion_type = ''happy_hour''
            and promo.status = ''active''
            and (promo.starts_at is null or promo.starts_at <= candidate.starts_at)
            and (promo.ends_at is null or promo.ends_at > candidate.starts_at)
            and (
              (promo.scope_type = ''artist'' and promo.artist_id = candidate.artist_id)
              or (promo.scope_type = ''studio'' and promo.studio_id = candidate.studio_id)
            )
            and coalesce((promo.rules -> ''weekdays'') ? extract(dow from candidate.starts_at at time zone ''America/Mexico_City'')::int::text, true)
            and (promo.rules ->> ''startTime'')::time <= (candidate.starts_at at time zone ''America/Mexico_City'')::time
            and (promo.rules ->> ''endTime'')::time > (candidate.starts_at at time zone ''America/Mexico_City'')::time
          order by promo.updated_at desc
          limit 1
        ), 0),
        ''happy_hour_discount_percent'', coalesce((
          select (promo.rules ->> ''discountPercent'')::integer
          from promotions promo
          where promo.promotion_type = ''happy_hour''
            and promo.status = ''active''
            and (promo.starts_at is null or promo.starts_at <= candidate.starts_at)
            and (promo.ends_at is null or promo.ends_at > candidate.starts_at)
            and (
              (promo.scope_type = ''artist'' and promo.artist_id = candidate.artist_id)
              or (promo.scope_type = ''studio'' and promo.studio_id = candidate.studio_id)
            )
            and coalesce((promo.rules -> ''weekdays'') ? extract(dow from candidate.starts_at at time zone ''America/Mexico_City'')::int::text, true)
            and (promo.rules ->> ''startTime'')::time <= (candidate.starts_at at time zone ''America/Mexico_City'')::time
            and (promo.rules ->> ''endTime'')::time > (candidate.starts_at at time zone ''America/Mexico_City'')::time
          order by promo.updated_at desc
          limit 1
        ), 0),
        ''status'', ''available'''
    );
    execute v_definition;
  end if;
end;
$$;

revoke all on function public.studio_flow_artist_active_double_points_multiplier(uuid, uuid, timestamptz) from public;
revoke all on function public.studio_flow_artist_get_marketing_settings() from public;
revoke all on function public.studio_flow_artist_save_flow_point_reward(integer, integer) from public;
revoke all on function public.studio_flow_artist_set_double_points_promotion(boolean) from public;
revoke all on function public.studio_flow_artist_save_happy_hour_promotion(boolean, integer, integer[], time, time) from public;

grant execute on function public.studio_flow_artist_active_double_points_multiplier(uuid, uuid, timestamptz) to authenticated;
grant execute on function public.studio_flow_artist_get_marketing_settings() to authenticated;
grant execute on function public.studio_flow_artist_save_flow_point_reward(integer, integer) to authenticated;
grant execute on function public.studio_flow_artist_set_double_points_promotion(boolean) to authenticated;
grant execute on function public.studio_flow_artist_save_happy_hour_promotion(boolean, integer, integer[], time, time) to authenticated;
