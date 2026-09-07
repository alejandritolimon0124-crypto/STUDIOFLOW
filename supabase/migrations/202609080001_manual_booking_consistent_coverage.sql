-- Availability and booking must cover the service in one schedule and workspace.
-- Fail rather than silently patch an unexpected deployed function definition.
do $$
declare
  definition text;
  expected text;
begin
  select pg_get_functiondef('public.studio_flow_artist_get_manual_availability(uuid,date)'::regprocedure)
  into definition;

  expected := 'and covered.artist_id = v_artist.id';
  if position(expected in definition) = 0 then
    raise exception 'Manual availability coverage definition requires review';
  end if;
  definition := replace(definition, expected, expected || '
        and covered.schedule_id = candidate.schedule_id
        and covered.studio_id is not distinct from candidate.studio_id
        and covered.membership_id is not distinct from candidate.membership_id');

  expected := 'where coverage.coverage_end >= candidate.candidate_end';
  if position(expected in definition) = 0 then
    raise exception 'Manual availability candidate definition requires review';
  end if;
  definition := replace(definition, expected, expected || '
    and public.studio_flow_slot_obeys_booking_rules(candidate.id, candidate.candidate_end)');
  execute definition;

  select pg_get_functiondef('public.studio_flow_artist_create_manual_appointment_core(uuid,uuid,date,time,text)'::regprocedure)
  into definition;

  expected := 'with overlapping_slots as (';
  if position(expected in definition) = 0 then
    raise exception 'Manual booking coverage definition requires review';
  end if;
  definition := replace(definition, expected, '
  perform pg_advisory_xact_lock(hashtextextended(v_artist.id::text, 0));
  ' || expected);

  expected := 'and slot.starts_at < v_ends_at';
  if position(expected in definition) = 0 then
    raise exception 'Manual booking slot definition requires review';
  end if;
  -- Restrict all coverage reads to the same valid starting schedule.
  definition := replace(definition, expected, expected || '
      and slot.schedule_id = (
        select first_slot.schedule_id
        from availability_slots first_slot
        where first_slot.artist_id = v_artist.id
          and first_slot.starts_at = v_starts_at
          and first_slot.status = ''available''
          and (
            (v_service.owner_type = ''artist'' and first_slot.studio_id is null and first_slot.membership_id is null)
            or (v_service.owner_type = ''membership'' and first_slot.membership_id = v_membership_id)
            or (v_service.owner_type = ''studio'' and first_slot.studio_id = v_studio_id)
          )
          and public.studio_flow_slot_obeys_booking_rules(first_slot.id, v_ends_at)
        order by first_slot.id
        limit 1
      )');

  expected := 'if v_overlapping_slot_count > 0 and (';
  if position(expected in definition) = 0 then
    raise exception 'Manual booking duration guard requires review';
  end if;
  definition := replace(definition, expected, 'if v_overlapping_slot_count = 0 or (');
  execute definition;
end;
$$;

-- Recover stale hidden slots only where the current schedule permits booking.
update public.availability_slots slot
set status = 'available'
from public.schedules schedule
where schedule.id = slot.schedule_id
  and slot.status = 'hidden'
  and slot.starts_at > now()
  and slot.ends_at > slot.starts_at
  and public.studio_flow_slot_obeys_booking_rules(slot.id, slot.ends_at)
  and exists (
    select 1 from public.schedule_rules rule
    where rule.schedule_id = schedule.id and rule.is_active
      and rule.weekday = extract(dow from slot.starts_at at time zone schedule.timezone)::integer
      and mod(
        extract(epoch from ((slot.starts_at at time zone schedule.timezone)::time - rule.start_time))::numeric,
        greatest(schedule.slot_interval_minutes, 1) * 60
      ) = 0
  );
