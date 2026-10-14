do $$
declare
  v_apply text := pg_get_functiondef('public.studio_flow_apply_invitation_to_booking(text,uuid,text)'::regprocedure);
  v_old text := '  if v_card.benefit_type = ''discount'' then';
begin
  if position(v_old in v_apply) = 0 then raise exception 'Invitation benefit selection changed'; end if;
  v_apply := replace(v_apply, v_old,
    '  if v_card.expires_at <= now() and not (' ||
    '(v_card.benefit_type = ''free_service'' and v_appointment.service_offering_id = v_card.free_service_id) ' ||
    'or (v_card.benefit_type = ''referral'' and p_referral_token is null)) then ' ||
    'raise exception ''Solo puedes canjear el beneficio que ya ganaste''; end if;' || chr(10) || v_old);
  execute v_apply;
end $$;
