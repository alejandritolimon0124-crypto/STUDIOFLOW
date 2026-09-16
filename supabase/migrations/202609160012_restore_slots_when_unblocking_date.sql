do $$
declare
  definition text;
  target text := E'  return public.studio_flow_artist_schedule_payload_for_context(p_context_type, p_membership_id);\nend;';
  replacement text := E'  -- restore_slots_after_unblocking_date\n  update availability_slots slot\n  set status = ''available'', updated_at = now()\n  where slot.schedule_id = v_schedule.id\n    and slot.status = ''hidden''\n    and slot.starts_at >= greatest(now(), p_date::timestamp at time zone v_timezone)\n    and slot.starts_at < ((p_date + 1)::timestamp at time zone v_timezone)\n    and public.studio_flow_slot_obeys_booking_rules(slot.id, slot.ends_at);\n\n  return public.studio_flow_artist_schedule_payload_for_context(p_context_type, p_membership_id);\nend;';
begin
  select pg_get_functiondef(
    'public.studio_flow_artist_unblock_context_date(date,text,uuid)'::regprocedure
  ) into definition;

  if position('restore_slots_after_unblocking_date' in definition) = 0 then
    if position(target in definition) = 0 then
      raise exception 'Unblock schedule return point was not found';
    end if;
    definition := replace(definition, target, replacement);
    execute definition;
  end if;
end;
$$;

-- Repair future slots left hidden by dates that have already been unblocked.
update public.availability_slots slot
set status = 'available', updated_at = now()
from public.schedules schedule
where schedule.id = slot.schedule_id
  and slot.status = 'hidden'
  and slot.starts_at > now()
  and public.studio_flow_slot_obeys_booking_rules(slot.id, slot.ends_at)
  and not exists (
    select 1
    from public.calendar_blocks block
    where block.schedule_id = slot.schedule_id
      and block.status = 'active'
      and block.starts_at < slot.ends_at
      and block.ends_at > slot.starts_at
  );
