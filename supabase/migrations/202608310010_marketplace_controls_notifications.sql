create table if not exists public.artist_marketing_preferences (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references artists(id),
  flow_points_enabled boolean not null default false,
  low_occupancy_enabled boolean not null default false,
  low_occupancy_period text not null default 'week',
  low_occupancy_threshold integer not null default 40,
  maintenance_reminder_days integer not null default 14,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint artist_marketing_preferences_artist_unique unique (artist_id),
  constraint artist_marketing_preferences_period_check check (low_occupancy_period in ('week', 'month')),
  constraint artist_marketing_preferences_threshold_check check (low_occupancy_threshold between 1 and 40),
  constraint artist_marketing_preferences_maintenance_check check (maintenance_reminder_days in (7, 14, 30))
);

create table if not exists public.client_notifications (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  artist_id uuid references artists(id),
  studio_id uuid references studios(id),
  notification_type text not null,
  title text not null,
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint client_notifications_type_check check (notification_type in ('birthday', 'reactivation', 'maintenance', 'double_points', 'happy_hour', 'flow_points'))
);

create index if not exists client_notifications_client_created_idx
on public.client_notifications (client_id, created_at desc);

create index if not exists client_notifications_artist_created_idx
on public.client_notifications (artist_id, created_at desc);

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
begin
  v_artist := public.studio_flow_artist_current_owned_artist(null);

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

  select jsonb_build_object('id', p.id, 'type', p.promotion_type, 'name', p.name, 'status', p.status, 'rules', coalesce(p.rules, '{}'::jsonb))
  into v_double_points
  from promotions p
  where p.scope_type = 'artist'
    and p.artist_id = v_artist.id
    and p.promotion_type = 'double_points'
    and p.status in ('active', 'paused')
  order by case when p.status = 'active' then 0 else 1 end, p.updated_at desc
  limit 1;

  select jsonb_build_object('id', p.id, 'type', p.promotion_type, 'name', p.name, 'status', p.status, 'rules', coalesce(p.rules, '{}'::jsonb))
  into v_happy_hour
  from promotions p
  where p.scope_type = 'artist'
    and p.artist_id = v_artist.id
    and p.promotion_type = 'happy_hour'
    and p.status in ('active', 'paused')
  order by case when p.status = 'active' then 0 else 1 end, p.updated_at desc
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

  insert into artist_marketing_preferences (artist_id, flow_points_enabled, updated_at)
  values (v_artist.id, coalesce(p_active, false), now())
  on conflict (artist_id) do update
  set flow_points_enabled = excluded.flow_points_enabled,
      updated_at = now();

  update promotions
  set status = case when p_active then 'active'::promotion_status else 'paused'::promotion_status end,
      starts_at = case when p_active then coalesce(starts_at, now()) else starts_at end,
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
      case when p_active then 'active' else 'paused' end,
      now(), jsonb_build_object('clientRequiresCompletedVisit', true), now()
    );
  end if;

  update rewards
  set status = case when p_active then 'active'::reward_status else 'paused'::reward_status end,
      updated_at = now()
  where scope_type = 'artist'
    and artist_id = v_artist.id
    and archived_at is null
    and status in ('active', 'paused');

  return public.studio_flow_artist_get_marketing_settings();
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

  update promotions
  set status = case when p_active then 'active'::promotion_status else 'paused'::promotion_status end,
      starts_at = case when p_active then coalesce(starts_at, now()) else starts_at end,
      ends_at = null,
      rules = jsonb_build_object('multiplier', 2, 'source', 'manual'),
      updated_at = now()
  where scope_type = 'artist'
    and artist_id = v_artist.id
    and promotion_type = 'double_points';

  select * into v_promotion
  from promotions
  where scope_type = 'artist'
    and artist_id = v_artist.id
    and promotion_type = 'double_points'
  order by updated_at desc
  limit 1;

  if v_promotion.id is null then
    insert into promotions (
      scope_type, artist_id, created_by_profile_id, promotion_type, name, status, starts_at, rules, updated_at
    )
    values (
      'artist', v_artist.id, auth.uid(), 'double_points', 'Puntos dobles',
      case when p_active then 'active' else 'paused' end,
      now(), jsonb_build_object('multiplier', 2, 'source', 'manual'), now()
    )
    returning * into v_promotion;
  end if;

  return jsonb_build_object('promotion', jsonb_build_object(
    'id', v_promotion.id,
    'type', v_promotion.promotion_type,
    'status', v_promotion.status,
    'rules', coalesce(v_promotion.rules, '{}'::jsonb)
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
  v_rules jsonb;
  v_promotion promotions%rowtype;
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

  select * into v_promotion
  from promotions
  where scope_type = 'artist'
    and artist_id = v_artist.id
    and promotion_type = 'happy_hour'
  order by updated_at desc
  limit 1;

  if v_promotion.id is null then
    insert into promotions (
      scope_type, artist_id, created_by_profile_id, promotion_type, name, status, starts_at, rules, updated_at
    )
    values (
      'artist', v_artist.id, auth.uid(), 'happy_hour', 'Happy Hour',
      case when p_active then 'active' else 'paused' end,
      now(), v_rules, now()
    )
    returning * into v_promotion;
  end if;

  return jsonb_build_object('promotion', jsonb_build_object(
    'id', v_promotion.id,
    'type', v_promotion.promotion_type,
    'status', v_promotion.status,
    'rules', coalesce(v_promotion.rules, '{}'::jsonb)
  ));
end;
$$;

create or replace function public.studio_flow_artist_set_low_occupancy_automation(
  p_active boolean,
  p_period text default 'week',
  p_threshold integer default 40
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_artist artists%rowtype;
  v_threshold integer := least(greatest(coalesce(p_threshold, 40), 1), 40);
  v_period text := case when p_period in ('week', 'month') then p_period else 'week' end;
begin
  v_artist := public.studio_flow_artist_current_owned_artist(null);

  insert into artist_marketing_preferences (
    artist_id, low_occupancy_enabled, low_occupancy_period, low_occupancy_threshold, updated_at
  )
  values (v_artist.id, coalesce(p_active, false), v_period, v_threshold, now())
  on conflict (artist_id) do update
  set low_occupancy_enabled = excluded.low_occupancy_enabled,
      low_occupancy_period = excluded.low_occupancy_period,
      low_occupancy_threshold = excluded.low_occupancy_threshold,
      updated_at = now();

  update promotions
  set status = case when p_active then 'active'::promotion_status else 'paused'::promotion_status end,
      starts_at = case when p_active then coalesce(starts_at, now()) else starts_at end,
      ends_at = null,
      rules = jsonb_build_object('period', v_period, 'threshold', v_threshold),
      updated_at = now()
  where scope_type = 'artist'
    and artist_id = v_artist.id
    and promotion_type = 'low_occupancy';

  if not found then
    insert into promotions (
      scope_type, artist_id, created_by_profile_id, promotion_type, name, status, starts_at, rules, updated_at
    )
    values (
      'artist', v_artist.id, auth.uid(), 'low_occupancy', 'Baja ocupacion',
      case when p_active then 'active' else 'paused' end,
      now(), jsonb_build_object('period', v_period, 'threshold', v_threshold), now()
    );
  end if;

  return public.studio_flow_artist_get_marketing_settings();
end;
$$;

create or replace function public.studio_flow_artist_send_marketing_notification(
  p_type text,
  p_maintenance_days integer default 14
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_artist artists%rowtype;
  v_title text;
  v_body text;
  v_inserted integer := 0;
  v_maintenance_days integer := case when p_maintenance_days in (7, 14, 30) then p_maintenance_days else 14 end;
begin
  if p_type not in ('birthday', 'reactivation', 'maintenance') then
    raise exception 'Unsupported notification type';
  end if;

  v_artist := public.studio_flow_artist_current_owned_artist(null);

  v_title := case p_type
    when 'birthday' then 'Feliz cumpleanos de parte de ' || v_artist.display_name
    when 'reactivation' then v_artist.display_name || ' te espera de vuelta'
    else 'Recordatorio de mantenimiento'
  end;

  v_body := case p_type
    when 'birthday' then 'Tenemos una felicitacion especial para ti en Studio Flow.'
    when 'reactivation' then 'Han pasado 30 dias desde tu ultima visita. Agenda tu siguiente servicio cuando quieras.'
    else 'Ya puedes programar tu mantenimiento con ' || v_artist.display_name || '.'
  end;

  with last_visits as (
    select appt.client_id, max(appt.starts_at) as last_visit_at
    from appointments appt
    where appt.artist_id = v_artist.id
      and appt.status = 'completed'
    group by appt.client_id
  ),
  eligible_clients as (
    select c.id as client_id
    from clients c
    join last_visits lv on lv.client_id = c.id
    left join client_profiles cp on cp.client_id = c.id
    where c.status = 'active'
      and c.archived_at is null
      and (
        (p_type = 'birthday' and cp.birthday is not null and to_char(cp.birthday, 'MM-DD') = to_char(current_date, 'MM-DD'))
        or (p_type = 'reactivation' and lv.last_visit_at <= now() - interval '30 days' and not exists (
          select 1 from appointments future
          where future.client_id = c.id
            and future.artist_id = v_artist.id
            and future.status = 'scheduled'
            and future.starts_at >= now()
        ))
        or (p_type = 'maintenance' and lv.last_visit_at <= now() - (v_maintenance_days || ' days')::interval)
      )
  ),
  inserted as (
    insert into client_notifications (client_id, artist_id, notification_type, title, body, metadata)
    select client_id, v_artist.id, p_type, v_title, v_body, jsonb_build_object('maintenanceDays', v_maintenance_days)
    from eligible_clients
    returning id
  )
  select count(*) into v_inserted from inserted;

  return jsonb_build_object('insertedCount', v_inserted, 'inserted_count', v_inserted);
end;
$$;

create or replace function public.studio_flow_client_get_notifications()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_client clients%rowtype;
  v_notifications jsonb;
begin
  select * into v_client
  from clients
  where profile_id = auth.uid()
    and status = 'active'
    and archived_at is null
  limit 1;

  if v_client.id is null then
    raise exception 'Active client required';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', n.id,
    'type', n.notification_type,
    'title', n.title,
    'body', n.body,
    'readAt', n.read_at,
    'createdAt', n.created_at
  ) order by n.created_at desc), '[]'::jsonb)
  into v_notifications
  from (
    select *
    from client_notifications
    where client_id = v_client.id
    order by created_at desc
    limit 20
  ) n;

  return jsonb_build_object('notifications', v_notifications);
end;
$$;

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
    from artist_marketing_preferences amp
    where amp.artist_id = p_artist_id
      and amp.flow_points_enabled
  ) and exists (
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

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.studio_flow_artist_award_appointment_points(uuid)'::regprocedure)
  into v_definition;

  if v_definition is not null and v_definition not like '%Flow Points are paused for this profile%' then
    v_definition := replace(
      v_definition,
      'select *
  into v_service
  from service_offerings
  where id = v_appointment.service_offering_id;',
      'select *
  into v_service
  from service_offerings
  where id = v_appointment.service_offering_id;

  if not exists (
    select 1
    from artist_marketing_preferences amp
    where amp.artist_id = v_appointment.artist_id
      and amp.flow_points_enabled
  ) then
    raise exception ''Flow Points are paused for this profile'';
  end if;'
    );
    execute v_definition;
  end if;

  select pg_get_functiondef('public.studio_flow_marketplace_get_listings()'::regprocedure)
  into v_definition;

  if v_definition is not null and v_definition not like '%amp.flow_points_enabled%' then
    v_definition := replace(
      v_definition,
      'from rewards r
          where r.status = ''active''',
      'from rewards r
          where r.status = ''active''
            and exists (
              select 1
              from artist_marketing_preferences amp
              where amp.artist_id = r.artist_id
                and amp.flow_points_enabled
            )'
    );
    execute v_definition;
  end if;
end;
$$;

revoke all on function public.studio_flow_artist_get_marketing_settings() from public;
revoke all on function public.studio_flow_artist_set_flow_points_enabled(boolean) from public;
revoke all on function public.studio_flow_artist_set_double_points_promotion(boolean) from public;
revoke all on function public.studio_flow_artist_save_happy_hour_promotion(boolean, integer, integer[], time, time) from public;
revoke all on function public.studio_flow_artist_set_low_occupancy_automation(boolean, text, integer) from public;
revoke all on function public.studio_flow_artist_send_marketing_notification(text, integer) from public;
revoke all on function public.studio_flow_client_get_notifications() from public;
revoke all on function public.studio_flow_artist_active_double_points_multiplier(uuid, uuid, timestamptz) from public;

grant execute on function public.studio_flow_artist_get_marketing_settings() to authenticated;
grant execute on function public.studio_flow_artist_set_flow_points_enabled(boolean) to authenticated;
grant execute on function public.studio_flow_artist_set_double_points_promotion(boolean) to authenticated;
grant execute on function public.studio_flow_artist_save_happy_hour_promotion(boolean, integer, integer[], time, time) to authenticated;
grant execute on function public.studio_flow_artist_set_low_occupancy_automation(boolean, text, integer) to authenticated;
grant execute on function public.studio_flow_artist_send_marketing_notification(text, integer) to authenticated;
grant execute on function public.studio_flow_client_get_notifications() to authenticated;
grant execute on function public.studio_flow_artist_active_double_points_multiplier(uuid, uuid, timestamptz) to authenticated;
