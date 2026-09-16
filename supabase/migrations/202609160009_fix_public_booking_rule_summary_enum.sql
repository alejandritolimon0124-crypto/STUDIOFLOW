do $$
declare
  definition text;
  corrected text;
begin
  select pg_get_functiondef(
    'public.studio_flow_public_get_booking_rule_summary(uuid,date)'::regprocedure
  ) into definition;

  corrected := regexp_replace(
    definition,
    'schedule\.owner_type\s*=\s*CASE',
    'schedule.owner_type::text = CASE',
    'i'
  );

  if corrected = definition then
    return;
  end if;

  execute corrected;
end;
$$;
