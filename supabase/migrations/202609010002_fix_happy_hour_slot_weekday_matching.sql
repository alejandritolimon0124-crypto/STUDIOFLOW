do $$
declare
  v_definition text;
  v_updated_definition text;
  v_old_condition text := 'coalesce((promo.rules -> ''weekdays'') ? extract(dow from candidate.starts_at at time zone ''America/Mexico_City'')::int::text, true)';
  v_new_condition text := '(
              jsonb_typeof(coalesce(promo.rules -> ''weekdays'', ''[]''::jsonb)) <> ''array''
              or jsonb_array_length(coalesce(promo.rules -> ''weekdays'', ''[]''::jsonb)) = 0
              or exists (
                select 1
                from jsonb_array_elements_text(coalesce(promo.rules -> ''weekdays'', ''[]''::jsonb)) happy_hour_weekday(value)
                where happy_hour_weekday.value::integer = extract(dow from candidate.starts_at at time zone ''America/Mexico_City'')::integer
              )
            )';
begin
  select pg_get_functiondef('public.studio_flow_marketplace_get_availability(uuid, uuid, date)'::regprocedure)
  into v_definition;

  if v_definition is null then
    raise exception 'studio_flow_marketplace_get_availability function was not found';
  end if;

  if position('jsonb_array_elements_text(coalesce(promo.rules -> ''weekdays''' in v_definition) = 0 then
    v_updated_definition := replace(v_definition, v_old_condition, v_new_condition);

    if v_updated_definition = v_definition then
      raise exception 'Could not patch happy hour weekday matching';
    end if;

    execute v_updated_definition;
  end if;
end $$;
