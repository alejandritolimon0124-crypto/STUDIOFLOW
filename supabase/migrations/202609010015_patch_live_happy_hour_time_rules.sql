do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.studio_flow_marketplace_get_availability(uuid, uuid, date)'::regprocedure)
  into v_definition;

  if v_definition is null then
    raise exception 'studio_flow_marketplace_get_availability function was not found';
  end if;

  v_definition := replace(
    v_definition,
    'and (promo.rules ->> ''startTime'')::time <= (candidate.starts_at at time zone ''America/Mexico_City'')::time',
    'and coalesce(nullif(coalesce(promo.rules ->> ''startTime'', promo.rules ->> ''start_time''), ''''), ''00:00'')::time <= (candidate.starts_at at time zone ''America/Mexico_City'')::time'
  );

  v_definition := replace(
    v_definition,
    'and (promo.rules ->> ''endTime'')::time > (candidate.starts_at at time zone ''America/Mexico_City'')::time',
    'and coalesce(nullif(coalesce(promo.rules ->> ''endTime'', promo.rules ->> ''end_time''), ''''), ''23:59'')::time > (candidate.starts_at at time zone ''America/Mexico_City'')::time'
  );

  v_definition := replace(
    v_definition,
    'coalesce(promo.rules -> ''weekdays'', ''[]''::jsonb)',
    'coalesce(promo.rules -> ''weekdays'', promo.rules -> ''weekDays'', promo.rules -> ''week_days'', ''[]''::jsonb)'
  );

  execute v_definition;
end;
$$;
