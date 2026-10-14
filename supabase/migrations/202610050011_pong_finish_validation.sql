do $$
declare v_function text := pg_get_functiondef('public.studio_flow_finish_pong(uuid,jsonb)'::regprocedure);
begin
  if position('  v_seed := v_run.seed;' in v_function) = 0
    or position('    if v_x < 0 or v_x > 1 or abs(v_time - v_expected) > 240 then' in v_function) = 0 then
    raise exception 'Pong validation function changed';
  end if;
  v_function := replace(v_function, '  v_seed := v_run.seed;',
    '  if v_offer.card_id is null or v_offer.play_ends_at <= now() or not exists (' || chr(10) ||
    '    select 1 from public.studio_flow_invitation_cards c where c.id = v_run.card_id' || chr(10) ||
    '      and c.archived_at is null and c.expires_at > now()) then' || chr(10) ||
    '    raise exception ''El juego ya no esta disponible'';' || chr(10) ||
    '  end if;' || chr(10) ||
    '  v_seed := v_run.seed;');
  v_function := replace(v_function,
    '    if v_x < 0 or v_x > 1 or abs(v_time - v_expected) > 240 then',
    '    if v_x is null or v_time is null or v_x < 0 or v_x > 1 or abs(v_time - v_expected) > 240 then');
  execute v_function;
end $$;
