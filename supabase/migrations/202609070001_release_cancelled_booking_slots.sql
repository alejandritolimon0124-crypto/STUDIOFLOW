alter table public.appointments drop constraint appointments_availability_slot_unique;
create unique index appointments_availability_slot_unique
on public.appointments(availability_slot_id) where status <> 'cancelled';

alter table public.schedules add column if not exists min_advance_hours integer not null default 2 check (min_advance_hours >= 0);

create or replace function public.studio_flow_slot_obeys_booking_rules(p_slot_id uuid, p_end timestamptz)
returns boolean language sql volatile security definer set search_path = public, auth as $$
select exists (
 select 1 from availability_slots slot join schedules s on s.id=slot.schedule_id
 where slot.id=p_slot_id and s.status='active' and s.archived_at is null
 and slot.starts_at >= now() + make_interval(hours => s.min_advance_hours)
 and p_end > slot.starts_at
 and exists (
  select 1 from schedule_rules r where r.schedule_id=s.id and r.is_active
  and r.weekday=extract(dow from slot.starts_at at time zone s.timezone)::integer
  and slot.starts_at at time zone s.timezone >= (slot.starts_at at time zone s.timezone)::date + r.start_time
  and p_end at time zone s.timezone <= (slot.starts_at at time zone s.timezone)::date + r.end_time
  and (r.break_start_time is null or r.break_end_time is null
    or p_end at time zone s.timezone <= (slot.starts_at at time zone s.timezone)::date + r.break_start_time
    or slot.starts_at at time zone s.timezone >= (slot.starts_at at time zone s.timezone)::date + r.break_end_time)
 )
 and not exists (select 1 from calendar_blocks b where b.schedule_id=s.id and b.status='active' and b.starts_at<p_end and b.ends_at>slot.starts_at)
 and not exists (
  select 1 from appointments a where a.artist_id=slot.artist_id
  and a.status in ('scheduled','disputed','completed')
  and a.starts_at < p_end + make_interval(mins=>s.slot_interval_minutes)
  and a.ends_at + make_interval(mins=>s.slot_interval_minutes) > slot.starts_at
 )
);
$$;
revoke all on function public.studio_flow_slot_obeys_booking_rules(uuid,timestamptz) from public;

create or replace function public.studio_flow_guard_new_booking_rules()
returns trigger language plpgsql security definer set search_path=public,auth as $$
begin
 if new.status='scheduled' and new.availability_slot_id is not null then
  perform pg_advisory_xact_lock(hashtextextended(new.artist_id::text,0));
  if not public.studio_flow_slot_obeys_booking_rules(new.availability_slot_id,new.ends_at) then
   raise exception 'Este horario ya no esta disponible segun las reglas de la agenda.';
  end if;
 end if;
 return new;
end;
$$;
create trigger studio_flow_new_booking_rules before insert on public.appointments for each row execute function public.studio_flow_guard_new_booking_rules();
CREATE OR REPLACE FUNCTION public.studio_flow_artist_save_context_schedule_settings(p_payload jsonb, p_context_type text DEFAULT 'artist'::text, p_membership_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_context jsonb;
  v_schedule schedules%rowtype;
  v_timezone text := coalesce(nullif(trim(p_payload ->> 'timezone'), ''), 'America/Mexico_City');
  v_interval integer := greatest(5, coalesce((p_payload ->> 'intervalMinutes')::integer, (p_payload ->> 'interval_minutes')::integer, 15));
  v_days jsonb := coalesce(p_payload -> 'schedule', '[]'::jsonb);
  v_blocked_dates jsonb := coalesce(p_payload -> 'blockedDates', p_payload -> 'blocked_dates', '[]'::jsonb);
  v_day jsonb;
  v_blocked jsonb;
  v_weekday integer;
  v_date date;
  v_start_time time;
  v_end_time time;
  v_break_start_time time;
  v_break_end_time time;
  v_generation_date date;
  v_generation_end date := (now() at time zone v_timezone)::date + 45;
  v_rule schedule_rules%rowtype;
  v_slot_start_local timestamp;
  v_slot_end_local timestamp;
  v_slot_start timestamptz;
  v_slot_end timestamptz;
  v_available_deleted integer := 0;
  v_slots_inserted integer := 0;
begin
  v_context := public.studio_flow_artist_assert_work_context(p_context_type, p_membership_id);

  select *
  into v_schedule
  from schedules
  where owner_type = (v_context ->> 'owner_type')::schedule_owner_type
    and (
      ((v_context ->> 'owner_type') = 'artist' and artist_id = (v_context ->> 'artist_id')::uuid)
      or ((v_context ->> 'owner_type') = 'membership' and membership_id = (v_context ->> 'membership_id')::uuid)
    )
    and status <> 'archived'
  order by created_at desc
  limit 1
  for update;

  if v_schedule.id is null then
    insert into schedules (owner_type, artist_id, membership_id, timezone, slot_interval_minutes, status)
    values (
      (v_context ->> 'owner_type')::schedule_owner_type,
      case when (v_context ->> 'owner_type') = 'artist' then (v_context ->> 'artist_id')::uuid else null end,
      nullif(v_context ->> 'membership_id', '')::uuid,
      v_timezone,
      v_interval,
      'active'
    )
    returning *
    into v_schedule;
  else
    update schedules
    set timezone = v_timezone, slot_interval_minutes = v_interval, status = 'active', updated_at = now()
    where id = v_schedule.id
    returning *
    into v_schedule;
  end if;

  update schedules set min_advance_hours = greatest(0, coalesce((p_payload->>'minAdvanceHours')::integer, min_advance_hours)) where id = v_schedule.id;
  delete from schedule_rules where schedule_id = v_schedule.id;

  for v_day in select * from jsonb_array_elements(v_days)
  loop
    v_weekday := case lower(coalesce(v_day ->> 'day', v_day ->> 'label', ''))
      when 'domingo' then 0
      when 'lunes' then 1
      when 'martes' then 2
      when 'miercoles' then 3
      when 'miÃ©rcoles' then 3
      when 'jueves' then 4
      when 'viernes' then 5
      when 'sabado' then 6
      when 'sÃ¡bado' then 6
      else coalesce((v_day ->> 'weekday')::integer, null)
    end;

    if v_weekday is null or v_weekday < 0 or v_weekday > 6 then
      continue;
    end if;

    if coalesce((v_day ->> 'active')::boolean, (v_day ->> 'isActive')::boolean, false) then
      v_start_time := nullif(v_day ->> 'start', '')::time;
      v_end_time := nullif(v_day ->> 'end', '')::time;
      v_break_start_time := null;
      v_break_end_time := null;

      if jsonb_array_length(coalesce(v_day -> 'blocks', '[]'::jsonb)) > 0 then
        v_break_start_time := nullif((v_day -> 'blocks' -> 0 ->> 'start'), '')::time;
        v_break_end_time := nullif((v_day -> 'blocks' -> 0 ->> 'end'), '')::time;
      elsif nullif(v_day ->> 'breakStart', '') is not null and nullif(v_day ->> 'breakStart', '') <> '-' then
        v_break_start_time := nullif(v_day ->> 'breakStart', '')::time;
        v_break_end_time := nullif(v_day ->> 'breakEnd', '')::time;
      end if;

      insert into schedule_rules (schedule_id, weekday, is_active, start_time, end_time, break_start_time, break_end_time)
      values (v_schedule.id, v_weekday, true, v_start_time, v_end_time, v_break_start_time, v_break_end_time);
    else
      insert into schedule_rules (schedule_id, weekday, is_active)
      values (v_schedule.id, v_weekday, false);
    end if;
  end loop;

  delete from calendar_blocks
  where schedule_id = v_schedule.id
    and status = 'active'
    and reason = 'blocked_date';

  for v_blocked in select * from jsonb_array_elements(v_blocked_dates)
  loop
    v_date := nullif(coalesce(v_blocked ->> 'id', v_blocked ->> 'date'), '')::date;
    if v_date is null then
      continue;
    end if;

    insert into calendar_blocks (schedule_id, block_type, starts_at, ends_at, reason, status)
    values (
      v_schedule.id,
      'personal',
      (v_date::timestamp at time zone v_timezone),
      ((v_date + 1)::timestamp at time zone v_timezone),
      'blocked_date',
      'active'
    );
  end loop;

  delete from availability_slots slot
  where slot.schedule_id = v_schedule.id
    and slot.status in ('available', 'expired', 'hidden')
    and slot.starts_at >= ((now() at time zone v_timezone)::date::timestamp at time zone v_timezone)
    and slot.starts_at < ((v_generation_end + 1)::timestamp at time zone v_timezone)
    and not exists (
      select 1
      from appointments appt
      where appt.availability_slot_id = slot.id
    );

  get diagnostics v_available_deleted = row_count;
  v_generation_date := (now() at time zone v_timezone)::date;

  while v_generation_date <= v_generation_end loop
    if not exists (
      select 1
      from calendar_blocks cb
      where cb.schedule_id = v_schedule.id
        and cb.status = 'active'
        and cb.starts_at < ((v_generation_date + 1)::timestamp at time zone v_timezone)
        and cb.ends_at > (v_generation_date::timestamp at time zone v_timezone)
    ) then
      select *
      into v_rule
      from schedule_rules
      where schedule_id = v_schedule.id
        and weekday = extract(dow from v_generation_date)::integer
        and is_active = true;

      if v_rule.id is not null then
        v_slot_start_local := v_generation_date + v_rule.start_time;

        while v_slot_start_local + make_interval(mins => v_interval) <= v_generation_date + v_rule.end_time loop
          v_slot_end_local := v_slot_start_local + make_interval(mins => v_interval);
          v_slot_start := v_slot_start_local at time zone v_timezone;
          v_slot_end := v_slot_end_local at time zone v_timezone;

          if (v_rule.break_start_time is null or v_rule.break_end_time is null
            or v_slot_end_local <= v_generation_date + v_rule.break_start_time
            or v_slot_start_local >= v_generation_date + v_rule.break_end_time)
            and v_slot_start >= now()
            and not exists (
              select 1
              from availability_slots existing
              where existing.schedule_id = v_schedule.id
                and existing.status in ('booked', 'held')
                and existing.starts_at < v_slot_end
                and existing.ends_at > v_slot_start
            ) then
            insert into availability_slots (schedule_id, artist_id, studio_id, membership_id, starts_at, ends_at, status)
            values (
              v_schedule.id,
              nullif(v_context ->> 'artist_id', '')::uuid,
              nullif(v_context ->> 'studio_id', '')::uuid,
              nullif(v_context ->> 'membership_id', '')::uuid,
              v_slot_start,
              v_slot_end,
              'available'
            );

            v_slots_inserted := v_slots_inserted + 1;
          end if;

          v_slot_start_local := v_slot_start_local + make_interval(mins => v_interval);
        end loop;
      end if;
    end if;

    v_generation_date := v_generation_date + 1;
  end loop;

  return public.studio_flow_artist_schedule_payload_for_context(p_context_type, p_membership_id)
    || jsonb_build_object(
      'availabilitySlotsDeleted', v_available_deleted,
      'availability_slots_deleted', v_available_deleted,
      'availabilitySlotsGenerated', v_slots_inserted,
      'availability_slots_generated', v_slots_inserted
    );
end;
$function$;
CREATE OR REPLACE FUNCTION public.studio_flow_artist_schedule_payload_for_context(p_context_type text DEFAULT 'artist'::text, p_membership_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_context jsonb;
  v_schedule schedules%rowtype;
  v_rules jsonb := '[]'::jsonb;
  v_blocked_dates jsonb := '[]'::jsonb;
  v_slot_count integer := 0;
begin
  v_context := public.studio_flow_artist_assert_work_context(p_context_type, p_membership_id);

  select *
  into v_schedule
  from schedules
  where owner_type = (v_context ->> 'owner_type')::schedule_owner_type
    and (
      ((v_context ->> 'owner_type') = 'artist' and artist_id = (v_context ->> 'artist_id')::uuid)
      or ((v_context ->> 'owner_type') = 'membership' and membership_id = (v_context ->> 'membership_id')::uuid)
    )
    and status <> 'archived'
  order by created_at desc
  limit 1;

  if v_schedule.id is null then
    return jsonb_build_object(
      'scheduleId', null,
      'schedule_id', null,
      'artistId', nullif(v_context ->> 'artist_id', '')::uuid,
      'artist_id', nullif(v_context ->> 'artist_id', '')::uuid,
      'studioId', nullif(v_context ->> 'studio_id', '')::uuid,
      'studio_id', nullif(v_context ->> 'studio_id', '')::uuid,
      'membershipId', nullif(v_context ->> 'membership_id', '')::uuid,
      'membership_id', nullif(v_context ->> 'membership_id', '')::uuid,
      'context', v_context,
      'timezone', 'America/Mexico_City',
      'intervalMinutes', 15,
      'interval_minutes', 15,
      'schedule', '[]'::jsonb,
      'blockedDates', '[]'::jsonb,
      'blocked_dates', '[]'::jsonb,
      'availabilitySlotCount', 0,
      'availability_slot_count', 0,
      'source', 'empty'
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', sr.id,
    'weekday', sr.weekday,
    'isActive', sr.is_active,
    'is_active', sr.is_active,
    'startTime', sr.start_time,
    'start_time', sr.start_time,
    'endTime', sr.end_time,
    'end_time', sr.end_time,
    'breakStartTime', sr.break_start_time,
    'break_start_time', sr.break_start_time,
    'breakEndTime', sr.break_end_time,
    'break_end_time', sr.break_end_time
  ) order by sr.weekday), '[]'::jsonb)
  into v_rules
  from schedule_rules sr
  where sr.schedule_id = v_schedule.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', to_char(cb.starts_at at time zone v_schedule.timezone, 'YYYY-MM-DD'),
    'label', to_char(cb.starts_at at time zone v_schedule.timezone, 'YYYY-MM-DD'),
    'startsAt', cb.starts_at,
    'starts_at', cb.starts_at,
    'endsAt', cb.ends_at,
    'ends_at', cb.ends_at,
    'reason', cb.reason
  ) order by cb.starts_at), '[]'::jsonb)
  into v_blocked_dates
  from calendar_blocks cb
  where cb.schedule_id = v_schedule.id
    and cb.status = 'active'
    and cb.block_type = 'personal'
    and cb.reason = 'blocked_date';

  select count(*)::integer
  into v_slot_count
  from availability_slots slot
  where slot.schedule_id = v_schedule.id
    and slot.status = 'available'
    and slot.starts_at >= now();

  return jsonb_build_object(
    'scheduleId', v_schedule.id,
    'schedule_id', v_schedule.id,
    'artistId', nullif(v_context ->> 'artist_id', '')::uuid,
    'artist_id', nullif(v_context ->> 'artist_id', '')::uuid,
    'studioId', nullif(v_context ->> 'studio_id', '')::uuid,
    'studio_id', nullif(v_context ->> 'studio_id', '')::uuid,
    'membershipId', nullif(v_context ->> 'membership_id', '')::uuid,
    'membership_id', nullif(v_context ->> 'membership_id', '')::uuid,
    'context', v_context,
    'timezone', v_schedule.timezone,
    'minAdvanceHours', v_schedule.min_advance_hours,
    'intervalMinutes', v_schedule.slot_interval_minutes,
    'interval_minutes', v_schedule.slot_interval_minutes,
    'schedule', v_rules,
    'blockedDates', v_blocked_dates,
    'blocked_dates', v_blocked_dates,
    'availabilitySlotCount', v_slot_count,
    'availability_slot_count', v_slot_count,
    'source', 'supabase'
  );
end;
$function$;
do $$
declare d text;
begin
 select pg_get_functiondef('public.studio_flow_marketplace_get_availability(uuid,uuid,date)'::regprocedure) into d;
 if position('where slot.status = ''available''' in d)=0 then raise exception 'Availability filter not found'; end if;
 d := replace(d, 'where slot.status = ''available''', 'where slot.status = ''available'' and public.studio_flow_slot_obeys_booking_rules(slot.id,slot.starts_at + make_interval(mins => v_service_duration))');
 execute d;
end;
$$;
