do $$
declare
  definition text;
  old_days text := 'and slot.artist_id=v_artist_id and slot.status=''available'' and slot.starts_at>now()';
  old_slots text := 'and slot.artist_id=v_artist_id and slot.status=''available'' and slot.starts_at>now()';
  old_coverage text := 'where coverage.first_start=candidate.starts_at and coverage.coverage_end>=candidate.candidate_end';
begin
  select pg_get_functiondef('public.studio_flow_owner_booking_calendar(uuid,uuid,date,uuid,date)'::regprocedure)
  into definition;
  if (select count(*) from regexp_matches(definition, old_days, 'g')) <> 2
     or position(old_coverage in definition) = 0 then
    raise exception 'Owner booking calendar definition changed; review required';
  end if;
  definition := replace(definition, old_days,
    'and slot.artist_id=v_artist_id and slot.status=''available'' '
    || 'and public.studio_flow_slot_obeys_booking_rules(slot.id,slot.ends_at)');
  definition := replace(definition, old_coverage,
    old_coverage || ' and public.studio_flow_slot_obeys_booking_rules(candidate.id,candidate.candidate_end)');
  execute definition;
end $$;
