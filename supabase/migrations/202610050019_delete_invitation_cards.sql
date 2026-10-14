alter table public.studio_flow_invitation_cards
  add column if not exists deleted_at timestamptz;

create or replace function public.studio_flow_delete_invitation_card(p_code text)
returns boolean language plpgsql security definer set search_path = public, auth as $$
declare v_card public.studio_flow_invitation_cards%rowtype;
begin
  select * into v_card from public.studio_flow_invitation_cards where code = p_code for update;
  if v_card.id is null then raise exception 'Tarjeta no encontrada'; end if;
  if v_card.studio_id is not null then
    perform public.studio_flow_owner_assert_studio_access(v_card.studio_id);
  elsif not exists (
    select 1 from public.artists
    where id = v_card.artist_id and profile_id = auth.uid() and archived_at is null
  ) then
    raise exception 'No puedes eliminar esta tarjeta';
  end if;
  if v_card.deleted_at is not null then return true; end if;

  -- Existing benefits and booked appointments keep their server-side audit trail.
  perform public.studio_flow_revoke_invitation_card(p_code);
  if exists (select 1 from public.studio_flow_invitation_bookings where card_id = v_card.id)
    or exists (select 1 from public.studio_flow_pong_runs where card_id = v_card.id and status = 'won') then
    update public.studio_flow_invitation_cards
    set deleted_at = now(), archived_at = coalesce(archived_at, now())
    where id = v_card.id;
  else
    delete from public.studio_flow_pong_runs where card_id = v_card.id;
    delete from public.studio_flow_pong_offers where card_id = v_card.id;
    delete from public.studio_flow_invitation_referrals where card_id = v_card.id;
    delete from public.studio_flow_invitation_cards where id = v_card.id;
  end if;
  return true;
end $$;
revoke all on function public.studio_flow_delete_invitation_card(text) from public, anon;
grant execute on function public.studio_flow_delete_invitation_card(text) to authenticated;

create or replace function public.studio_flow_list_invitation_cards(p_studio_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_artist_id uuid; v_items jsonb;
begin
  if p_studio_id is not null then
    perform public.studio_flow_owner_assert_studio_access(p_studio_id);
  else
    select id into v_artist_id from public.artists where profile_id = auth.uid() and archived_at is null;
    if v_artist_id is null then raise exception 'Perfil de artista requerido'; end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'code', c.code,
    'benefitType', case when po.card_id is not null then 'pong' else c.benefit_type end,
    'discountPercent', coalesce(po.discount_percent, c.discount_percent),
    'createdAt', c.created_at, 'expiresAt', c.expires_at,
    'redemptions', c.redemptions, 'maxRedemptions', c.max_redemptions,
    'active', true
  ) order by c.created_at desc), '[]'::jsonb) into v_items
  from (
    select * from public.studio_flow_invitation_cards
    where deleted_at is null and archived_at is null and expires_at > now()
      and ((p_studio_id is not null and studio_id = p_studio_id)
        or (v_artist_id is not null and artist_id = v_artist_id))
    order by created_at desc limit 20
  ) c
  left join public.studio_flow_pong_offers po on po.card_id = c.id;
  return v_items;
end $$;
revoke all on function public.studio_flow_list_invitation_cards(uuid) from public, anon;
grant execute on function public.studio_flow_list_invitation_cards(uuid) to authenticated;

create or replace function public.studio_flow_restore_invitation_card(p_code text)
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
  if v_card.deleted_at is not null then raise exception 'La tarjeta fue eliminada y no puede recuperarse'; end if;
  if v_card.expires_at <= now() then raise exception 'Esta tarjeta ya vencio; crea una nueva'; end if;
  update public.studio_flow_invitation_cards set archived_at = null where id = v_card.id;
  return true;
end $$;
revoke all on function public.studio_flow_restore_invitation_card(text) from public, anon;
grant execute on function public.studio_flow_restore_invitation_card(text) to authenticated;
