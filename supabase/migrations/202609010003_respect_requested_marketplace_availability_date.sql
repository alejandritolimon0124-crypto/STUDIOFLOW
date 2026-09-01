do $$
declare
  v_definition text;
  v_updated_definition text;
begin
  select pg_get_functiondef('public.studio_flow_marketplace_get_availability(uuid, uuid, date)'::regprocedure)
  into v_definition;

  if v_definition is null then
    raise exception 'studio_flow_marketplace_get_availability function was not found';
  end if;

  v_updated_definition := replace(
    v_definition,
    'v_search_end_date := v_search_start_date + 14;',
    'v_search_end_date := v_search_start_date;'
  );

  v_updated_definition := replace(
    v_updated_definition,
    '  select coalesce(
    min(candidate_date) filter (where candidate_date = v_requested_date),
    min(candidate_date)
  )',
    '  select min(candidate_date) filter (where candidate_date = v_requested_date)'
  );

  if v_updated_definition = v_definition then
    raise exception 'Could not patch marketplace availability date fallback';
  end if;

  execute v_updated_definition;
end $$;
