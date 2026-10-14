do $$
declare v_get text := pg_get_functiondef('public.studio_flow_get_invitation_card(text)'::regprocedure);
  v_old text := '  return v_card;';
begin
  if position(v_old in v_get) = 0 then
    raise exception 'Invitation availability response changed';
  end if;
  if position('  if v_card->>''benefitType'' = ''referral'' then' in v_get) = 0 then
    raise exception 'Invitation client lookup changed';
  end if;
  v_get := replace(v_get, '  if v_card->>''benefitType'' = ''referral'' then',
    '  select id into v_client_id from public.clients where profile_id = auth.uid() ' ||
    'and status = ''active'' and archived_at is null;' || chr(10) ||
    '  if v_card->>''benefitType'' = ''referral'' then');
  v_get := replace(v_get, v_old,
    '  if v_card->>''benefitType'' <> ''referral'' and exists (' ||
    'select 1 from public.studio_flow_invitation_bookings ib ' ||
    'join public.studio_flow_invitation_cards c on c.id = ib.card_id ' ||
    'where c.code = p_code and ib.voided_at is null ' ||
    'and (v_card->>''benefitType'' = ''none'' or ' ||
    '(v_client_id is distinct from ib.client_id))) then ' ||
    'v_card := jsonb_set(v_card, ''{available}'', ''false''::jsonb); end if;' || chr(10) ||
    v_old);
  execute v_get;
end $$;
