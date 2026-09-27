create or replace function public.studio_flow_artist_get_context_week_slots(
  p_week_start date,
  p_context_type text default 'artist',
  p_membership_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_context jsonb;
  v_schedule schedules%rowtype;
  v_timezone text;
  v_slots jsonb := '[]'::jsonb;
begin
  if p_week_start is null then
    raise exception 'Week start is required';
  end if;

  v_context := public.studio_flow_artist_assert_work_context(p_context_type, p_membership_id);

  select *
  into v_schedule
  from schedules
  where owner_type = (v_context ->> 'owner_type')::schedule_owner_type
    and (
      ((v_context ->> 'owner_type') = 'artist' and artist_id = (v_context ->> 'artist_id')::uuid)
      or ((v_context ->> 'owner_type') = 'membership' and membership_id = (v_context ->> 'membership_id')::uuid)
    )
    and status = 'active'
  order by created_at desc
  limit 1;

  if v_schedule.id is null then
    return jsonb_build_object('slots', '[]'::jsonb);
  end if;

  v_timezone := coalesce(v_schedule.timezone, 'America/Mexico_City');

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', slot.id,
    'date', to_char(timezone(v_timezone, slot.starts_at), 'YYYY-MM-DD'),
    'time', to_char(timezone(v_timezone, slot.starts_at), 'HH24:MI'),
    'end', to_char(timezone(v_timezone, slot.ends_at), 'HH24:MI'),
    'startsAt', slot.starts_at,
    'endsAt', slot.ends_at,
    'status', slot.status,
    'blocked', slot.status = 'hidden'
  ) order by slot.starts_at), '[]'::jsonb)
  into v_slots
  from availability_slots slot
  where slot.schedule_id = v_schedule.id
    and slot.starts_at >= (p_week_start::timestamp at time zone v_timezone)
    and slot.starts_at < ((p_week_start + 7)::timestamp at time zone v_timezone)
    and slot.status in ('available', 'booked', 'hidden');

  return jsonb_build_object(
    'context', v_context,
    'weekStart', p_week_start,
    'weekEnd', p_week_start + 6,
    'intervalMinutes', v_schedule.slot_interval_minutes,
    'slots', v_slots
  );
end;
$$;

create or replace function public.studio_flow_artist_set_context_slot_block(
  p_slot_id uuid,
  p_blocked boolean,
  p_context_type text default 'artist',
  p_membership_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_context jsonb;
  v_slot availability_slots%rowtype;
  v_schedule schedules%rowtype;
begin
  if p_slot_id is null then
    raise exception 'Availability slot is required';
  end if;

  v_context := public.studio_flow_artist_assert_work_context(p_context_type, p_membership_id);

  select *
  into v_slot
  from availability_slots
  where id = p_slot_id
  for update;

  if v_slot.id is null then
    raise exception 'Availability slot not found';
  end if;

  select * into v_schedule from schedules where id = v_slot.schedule_id;

  if v_schedule.id is null
    or v_schedule.owner_type <> (v_context ->> 'owner_type')::schedule_owner_type
    or (v_schedule.owner_type = 'artist' and v_schedule.artist_id is distinct from (v_context ->> 'artist_id')::uuid)
    or (v_schedule.owner_type = 'membership' and v_schedule.membership_id is distinct from (v_context ->> 'membership_id')::uuid)
  then
    raise exception 'Availability slot does not belong to this work context';
  end if;

  if p_blocked and v_slot.status = 'available' then
    update availability_slots set status = 'hidden', updated_at = now() where id = v_slot.id;
  elsif not p_blocked and v_slot.status = 'hidden' then
    update availability_slots set status = 'available', updated_at = now() where id = v_slot.id;
  elsif v_slot.status not in ('available', 'hidden') then
    raise exception 'Only free slots can be blocked or restored';
  end if;

  select * into v_slot from availability_slots where id = p_slot_id;

  return jsonb_build_object(
    'slot', jsonb_build_object(
      'id', v_slot.id,
      'status', v_slot.status,
      'blocked', v_slot.status = 'hidden'
    )
  );
end;
$$;

revoke all on function public.studio_flow_artist_get_context_week_slots(date, text, uuid) from public;
revoke all on function public.studio_flow_artist_set_context_slot_block(uuid, boolean, text, uuid) from public;
grant execute on function public.studio_flow_artist_get_context_week_slots(date, text, uuid) to authenticated;
grant execute on function public.studio_flow_artist_set_context_slot_block(uuid, boolean, text, uuid) to authenticated;
