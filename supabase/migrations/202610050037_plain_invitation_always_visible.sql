update public.studio_flow_invitation_cards c
set expires_at = 'infinity'::timestamptz
where c.benefit_type = 'none'
  and c.deleted_at is null
  and c.archived_at is null
  and c.expires_at <> 'infinity'::timestamptz
  and not exists (
    select 1 from public.studio_flow_pong_offers po where po.card_id = c.id
  );

do $$
declare definition text;
  old_guard text := 'if not exists(select 1 from public.marketplace_profiles mp';
  new_guard text := 'if (v_row.benefit_type <> ''none'' or exists(select 1 from public.studio_flow_pong_offers po where po.card_id = v_row.id)) and not exists(select 1 from public.marketplace_profiles mp';
begin
  select pg_get_functiondef('public.studio_flow_get_invitation_card(text)'::regprocedure)
    into definition;
  if position(old_guard in definition) = 0 then
    raise exception 'Review invitation visibility guard before updating plain cards';
  end if;
  execute replace(definition, old_guard, new_guard);
end $$;
