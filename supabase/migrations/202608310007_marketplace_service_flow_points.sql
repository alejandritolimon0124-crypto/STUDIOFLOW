do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.studio_flow_marketplace_get_listings()'::regprocedure)
  into v_definition;

  if v_definition is not null then
    v_definition := replace(
      v_definition,
      '''durationMinutes'', service_rows.duration_minutes,
              ''category'', service_rows.category_name,',
      '''durationMinutes'', service_rows.duration_minutes,
              ''flowPointsAwarded'', service_rows.flow_points_awarded,
              ''flow_points_awarded'', service_rows.flow_points_awarded,
              ''category'', service_rows.category_name,'
    );
    v_definition := replace(
      v_definition,
      'so.duration_minutes,
          sc.name as category_name,',
      'so.duration_minutes,
          coalesce(so.flow_points_awarded, 0) as flow_points_awarded,
          sc.name as category_name,'
    );
    execute v_definition;
  end if;
end;
$$;
