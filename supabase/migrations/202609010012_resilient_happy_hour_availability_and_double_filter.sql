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
    'and (
              (promo.scope_type = ''artist'' and promo.artist_id = candidate.artist_id)
              or (promo.scope_type = ''studio'' and promo.studio_id = candidate.studio_id)
            )
            and coalesce((promo.rules -> ''weekdays'') ? extract(dow from candidate.starts_at at time zone ''America/Mexico_City'')::int::text, true)
            and (promo.rules ->> ''startTime'')::time <= (candidate.starts_at at time zone ''America/Mexico_City'')::time
            and (promo.rules ->> ''endTime'')::time > (candidate.starts_at at time zone ''America/Mexico_City'')::time',
    'and (
              (promo.scope_type = ''artist'' and promo.artist_id = candidate.artist_id and candidate.studio_id is null and candidate.membership_id is null)
              or (promo.scope_type = ''studio'' and promo.studio_id = candidate.studio_id)
              or (promo.scope_type = ''membership'' and promo.membership_id = candidate.membership_id)
            )
            and (
              coalesce(jsonb_array_length(coalesce(promo.rules -> ''weekdays'', promo.rules -> ''weekDays'', promo.rules -> ''week_days'', ''[]''::jsonb)), 0) = 0
              or coalesce(promo.rules -> ''weekdays'', promo.rules -> ''weekDays'', promo.rules -> ''week_days'', ''[]''::jsonb) ? extract(dow from candidate.starts_at at time zone ''America/Mexico_City'')::int::text
            )
            and coalesce(nullif(coalesce(promo.rules ->> ''startTime'', promo.rules ->> ''start_time''), ''''), ''00:00'')::time <= (candidate.starts_at at time zone ''America/Mexico_City'')::time
            and coalesce(nullif(coalesce(promo.rules ->> ''endTime'', promo.rules ->> ''end_time''), ''''), ''23:59'')::time > (candidate.starts_at at time zone ''America/Mexico_City'')::time'
  );

  execute v_definition;
end;
$$;
