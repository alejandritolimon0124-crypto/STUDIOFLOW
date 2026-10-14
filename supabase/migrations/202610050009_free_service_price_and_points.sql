do $$
declare
  v_create text := pg_get_functiondef('public.studio_flow_create_invitation_card(uuid,text,integer,uuid,uuid,integer)'::regprocedure);
  v_award text := pg_get_functiondef('public.studio_flow_award_completed_appointment_points(uuid)'::regprocedure);
  v_old text;
begin
  v_old := '  elsif p_paid_service_id is not null or p_free_service_id is not null then';
  if position(v_old in v_create) = 0 then raise exception 'Invitation card validation changed'; end if;
  v_create := replace(v_create, v_old,
    '    if not exists (select 1 from public.service_offerings paid join public.service_offerings gift on gift.id = p_free_service_id ' ||
    'where paid.id = p_paid_service_id and paid.price_amount > gift.price_amount and paid.price_amount > 0) then ' ||
    'raise exception ''El servicio gratis debe costar menos que el servicio comprado''; end if;' || chr(10) || v_old);
  execute v_create;

  v_old := '  select coalesce(sum(points),0)::integer into v_existing_points';
  if position(v_old in v_award) = 0 then raise exception 'FlowPoints award validation changed'; end if;
  v_award := replace(v_award, v_old,
    '  if exists (select 1 from public.studio_flow_invitation_bookings ib ' ||
    'where ib.appointment_id = v_appointment.id and ib.benefit_applied = ''free_service'' and ib.voided_at is null) then ' ||
    'return jsonb_build_object(''awarded'',false,''reason'',''gift_service'',''points'',0); end if;' || chr(10) || v_old);
  execute v_award;
end $$;
