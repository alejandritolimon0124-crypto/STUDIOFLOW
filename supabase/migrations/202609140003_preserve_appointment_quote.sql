begin;

-- Reuse the original persisted quote when synchronizing appointment status.
-- Reward redemption remains the explicit path for applying a points discount.
do $$
declare definition text; expected text;
begin
 select pg_get_functiondef('public.studio_flow_sync_appointment_commission(uuid)'::regprocedure)
 into definition;
 expected := E'where id = p_appointment_id;';
 if position(expected in definition)=0 then raise exception 'Unexpected commission appointment lookup'; end if;
 definition := replace(definition,expected,'where id = p_appointment_id for update;');

 expected := E'    and calculation_version like ''%flow-points-discount%''';
 if position(expected in definition)=0 then raise exception 'Unexpected commission quote lookup'; end if;
 definition := replace(definition,expected,'');

 expected := 'v_calculation_version := v_existing_discount.calculation_version;';
 if position(expected in definition)=0 then raise exception 'Unexpected saved quote calculation'; end if;
 definition := replace(definition,expected,expected || E'\n'
 || $patch$
    v_discount_percent := coalesce(
      substring(v_calculation_version from 'happy-hour-discount-([0-9]+)$')::integer,
      0
    );
 $patch$);
 execute definition;
end;$$;

commit;
