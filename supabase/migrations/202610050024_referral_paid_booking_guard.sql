do $$
declare v_apply text := pg_get_functiondef('public.studio_flow_apply_invitation_to_booking(text,uuid,text)'::regprocedure);
  v_old text := '  elsif v_card.benefit_type = ''referral'' then';
begin
  if position(v_old in v_apply) = 0 then
    raise exception 'Referral booking branch changed';
  end if;
  v_apply := replace(v_apply, v_old,
    v_old || chr(10) ||
    '    if not exists (select 1 from public.appointment_economies e ' ||
    'where e.appointment_id = v_appointment.id and e.gross_amount > 0 ' ||
    'and e.calculation_version not like ''%happy-hour-discount-%'' ' ||
    'and e.calculation_version not like ''%flow-points-discount%'') then ' ||
    'raise exception ''Elige un servicio pagado sin otro descuento para esta invitacion''; end if;');
  execute v_apply;
end $$;
