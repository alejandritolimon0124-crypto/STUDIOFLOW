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
    '(promo.scope_type = ''artist'' and promo.artist_id = candidate.artist_id and candidate.studio_id is null and candidate.membership_id is null)',
    '(promo.scope_type = ''artist'' and promo.artist_id = candidate.artist_id)'
  );

  execute v_definition;
end;
$$;
