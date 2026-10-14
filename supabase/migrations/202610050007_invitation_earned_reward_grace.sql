do $$
declare
  v_get text := pg_get_functiondef('public.studio_flow_get_invitation_card_base(text)'::regprocedure);
  v_apply text := pg_get_functiondef('public.studio_flow_apply_invitation_to_booking(text,uuid,text)'::regprocedure);
  v_old text;
begin
  v_old := 'where code = p_code and archived_at is null and expires_at > now();';
  if position(v_old in v_get) = 0 then raise exception 'Invitation lookup changed; review reward grace migration'; end if;
  v_get := replace(v_get, v_old, 'where code = p_code and archived_at is null;');

  v_old := 'and a.status = ''completed'') into v_free_earned;';
  if position(v_old in v_get) = 0 then raise exception 'Free reward lookup changed'; end if;
  v_get := replace(v_get, v_old, 'and a.status = ''completed'' and a.completed_at >= now() - interval ''30 days'') into v_free_earned;');
  v_old := 'and ib.benefit_applied = ''referral_friend'' and a.status = ''completed'') into v_referral_earned;';
  if position(v_old in v_get) = 0 then raise exception 'Referral reward lookup changed'; end if;
  v_get := replace(v_get, v_old, 'and ib.benefit_applied = ''referral_friend'' and a.status = ''completed'' and a.completed_at >= now() - interval ''30 days'') into v_referral_earned;');
  v_old := '  return jsonb_build_object(''code'',v_card.code,';
  if position(v_old in v_get) = 0 then raise exception 'Invitation response changed'; end if;
  v_get := replace(v_get, v_old,
    '  if v_card.expires_at <= now() and not (v_free_earned or v_referral_earned) then return null; end if;' || chr(10) || v_old);
  execute v_get;

  v_old := 'if v_card.id is null or v_card.archived_at is not null or v_card.expires_at <= now() then';
  if position(v_old in v_apply) = 0 then raise exception 'Invitation booking validation changed'; end if;
  v_apply := replace(v_apply, v_old,
    'if v_card.id is null or v_card.archived_at is not null or (v_card.expires_at <= now() and not exists (' ||
    'select 1 from public.studio_flow_invitation_bookings ib join public.appointments a on a.id = ib.appointment_id ' ||
    'where ib.card_id = v_card.id and ib.voided_at is null and a.status = ''completed'' ' ||
    'and a.completed_at >= now() - interval ''30 days'' and ' ||
    '((v_card.benefit_type = ''free_service'' and ib.client_id = v_client.id and ib.benefit_applied = ''qualifying_purchase'') ' ||
    'or (v_card.benefit_type = ''referral'' and ib.referral_client_id = v_client.id and ib.benefit_applied = ''referral_friend''))' ||
    ')) then');

  v_old := 'and a.status = ''completed'' and e.gross_amount > 0) then';
  if position(v_old in v_apply) = 0 then raise exception 'Free reward qualification changed'; end if;
  v_apply := replace(v_apply, v_old,
    'and a.status = ''completed'' and a.completed_at >= now() - interval ''30 days'' and e.gross_amount > 0) then');
  v_old := 'and friend.status = ''completed'' and e.gross_amount > 0) then';
  if position(v_old in v_apply) = 0 then raise exception 'Referral reward qualification changed'; end if;
  v_apply := replace(v_apply, v_old,
    'and friend.status = ''completed'' and friend.completed_at >= now() - interval ''30 days'' and e.gross_amount > 0) then');
  execute v_apply;
end $$;
