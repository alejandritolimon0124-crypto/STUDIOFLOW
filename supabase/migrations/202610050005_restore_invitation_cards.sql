create function public.studio_flow_restore_invitation_card(p_code text)
returns boolean language plpgsql security definer set search_path = public, auth as $$
declare v_card public.studio_flow_invitation_cards%rowtype;
begin
  select * into v_card from public.studio_flow_invitation_cards where code = p_code for update;
  if v_card.id is null then raise exception 'Tarjeta no encontrada'; end if;
  if v_card.studio_id is not null then
    perform public.studio_flow_owner_assert_studio_access(v_card.studio_id);
  elsif not exists (select 1 from public.artists where id = v_card.artist_id and profile_id = auth.uid() and archived_at is null) then
    raise exception 'No puedes cambiar esta tarjeta';
  end if;
  if v_card.expires_at <= now() then raise exception 'Esta tarjeta ya vencio; crea una nueva'; end if;
  update public.studio_flow_invitation_cards set archived_at = null where id = v_card.id;
  return true;
end $$;
revoke all on function public.studio_flow_restore_invitation_card(text) from public, anon;
grant execute on function public.studio_flow_restore_invitation_card(text) to authenticated;
