begin;

alter table public.marketing_maintenance_rules
  drop constraint marketing_maintenance_rules_days_check;
alter table public.marketing_maintenance_rules
  add constraint marketing_maintenance_rules_days_check check (days in (7, 14, 21, 30));

alter table public.studio_marketing_maintenance_rules
  drop constraint studio_marketing_maintenance_rules_days_check;
alter table public.studio_marketing_maintenance_rules
  add constraint studio_marketing_maintenance_rules_days_check check (days in (7, 14, 21, 30));

do $$
declare
  v_definition text;
  v_function regprocedure;
  v_pattern text := 'v_days[[:space:]]+not[[:space:]]+in[[:space:]]*\(7[[:space:]]*,[[:space:]]*14[[:space:]]*,[[:space:]]*30\)';
begin
  foreach v_function in array array[
    'public.studio_flow_marketing_reminder_settings(uuid,jsonb)'::regprocedure,
    'public.studio_flow_studio_marketing_reminder_settings(uuid,jsonb)'::regprocedure
  ] loop
    v_definition := pg_get_functiondef(v_function);
    if v_definition !~* v_pattern then
      raise exception 'Review maintenance validation in % before enabling 21 days', v_function;
    end if;
    v_definition := regexp_replace(v_definition, v_pattern, 'v_days not in (7,14,21,30)', 'gi');
    v_definition := replace(v_definition, '7, 14 o 30 dias', '7, 14, 21 o 30 dias');
    execute v_definition;
  end loop;
end;
$$;

commit;
