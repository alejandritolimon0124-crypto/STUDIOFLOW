do $$
declare v_definition text;
begin
  select pg_get_functiondef('public.studio_flow_send_invitation_card(text,uuid)'::regprocedure)
    into v_definition;
  if position('if v_card.benefit_type <> ''none'' or v_pong then' in v_definition) = 0 then
    raise exception 'Review personal card sending before changing referral behavior';
  end if;
  v_definition := replace(v_definition,
    'if v_card.benefit_type <> ''none'' or v_pong then',
    'if v_card.benefit_type not in (''none'',''referral'') or v_pong then');
  execute v_definition;
end $$;
