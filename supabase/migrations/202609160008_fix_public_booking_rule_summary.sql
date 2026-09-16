do $$
declare
  definition text;
begin
  select pg_get_functiondef(
    'public.studio_flow_public_get_booking_rule_summary(uuid,date)'::regprocedure
  ) into definition;

  definition := replace(
    definition,
    'schedule.owner_type = CASE',
    'schedule.owner_type::text = CASE'
  );

  execute definition;
end;
$$;
