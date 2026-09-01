do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.studio_flow_artist_save_context_schedule_settings(jsonb,text,uuid)'::regprocedure)
  into v_definition;

  if v_definition is not null and position('::date + 45' in v_definition) = 0 then
    v_definition := replace(
      v_definition,
      'v_generation_end date := (now() at time zone v_timezone)::date + 14;',
      'v_generation_end date := (now() at time zone v_timezone)::date + 45;'
    );
    execute v_definition;
  end if;

  select pg_get_functiondef('public.studio_flow_artist_save_schedule_settings(jsonb)'::regprocedure)
  into v_definition;

  if v_definition is not null and position('::date + 45' in v_definition) = 0 then
    v_definition := replace(
      v_definition,
      'v_generation_end date := (now() at time zone v_timezone)::date + 14;',
      'v_generation_end date := (now() at time zone v_timezone)::date + 45;'
    );
    execute v_definition;
  end if;
end $$;

insert into availability_slots (
  schedule_id,
  artist_id,
  studio_id,
  membership_id,
  starts_at,
  ends_at,
  status
)
select
  schedule.id,
  coalesce(schedule.artist_id, membership.artist_id),
  membership.studio_id,
  schedule.membership_id,
  slot_bounds.starts_at,
  slot_bounds.ends_at,
  'available'::availability_slot_status
from schedules schedule
left join artist_studio_memberships membership
  on membership.id = schedule.membership_id
cross join lateral generate_series(
  (now() at time zone schedule.timezone)::date,
  (now() at time zone schedule.timezone)::date + 45,
  interval '1 day'
) generated_day(day_value)
join schedule_rules rule
  on rule.schedule_id = schedule.id
  and rule.is_active
  and rule.weekday = extract(dow from generated_day.day_value::date)::integer
cross join lateral generate_series(
  generated_day.day_value::date + rule.start_time,
  generated_day.day_value::date + rule.end_time - make_interval(mins => schedule.slot_interval_minutes),
  make_interval(mins => schedule.slot_interval_minutes)
) generated_slot(slot_start_local)
cross join lateral (
  select
    generated_slot.slot_start_local at time zone schedule.timezone as starts_at,
    (generated_slot.slot_start_local + make_interval(mins => schedule.slot_interval_minutes)) at time zone schedule.timezone as ends_at
) slot_bounds
where schedule.status = 'active'
  and schedule.archived_at is null
  and coalesce(schedule.artist_id, membership.artist_id) is not null
  and slot_bounds.starts_at >= now()
  and (
    rule.break_start_time is null
    or rule.break_end_time is null
    or generated_slot.slot_start_local + make_interval(mins => schedule.slot_interval_minutes) <= generated_day.day_value::date + rule.break_start_time
    or generated_slot.slot_start_local >= generated_day.day_value::date + rule.break_end_time
  )
  and not exists (
    select 1
    from calendar_blocks block
    where block.schedule_id = schedule.id
      and block.status = 'active'
      and block.starts_at < slot_bounds.ends_at
      and block.ends_at > slot_bounds.starts_at
  )
  and not exists (
    select 1
    from availability_slots existing
    where existing.schedule_id = schedule.id
      and existing.starts_at = slot_bounds.starts_at
  )
  and not exists (
    select 1
    from availability_slots blocking_slot
    where blocking_slot.schedule_id = schedule.id
      and blocking_slot.status in ('booked', 'held')
      and blocking_slot.starts_at < slot_bounds.ends_at
      and blocking_slot.ends_at > slot_bounds.starts_at
  );
