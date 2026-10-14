create function public.studio_flow_list_invitation_cards(p_studio_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_artist_id uuid; v_items jsonb;
begin
  if p_studio_id is not null then
    perform public.studio_flow_owner_assert_studio_access(p_studio_id);
  else
    select id into v_artist_id from public.artists where profile_id = auth.uid() and archived_at is null;
    if v_artist_id is null then raise exception 'Perfil de artista requerido'; end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('code',c.code,'benefitType',c.benefit_type,
    'discountPercent',c.discount_percent,'createdAt',c.created_at,'expiresAt',c.expires_at,
    'redemptions',c.redemptions,'maxRedemptions',c.max_redemptions,
    'active',c.archived_at is null and c.expires_at > now()) order by c.created_at desc),'[]'::jsonb)
  into v_items from (select * from public.studio_flow_invitation_cards
    where (p_studio_id is not null and studio_id = p_studio_id)
      or (v_artist_id is not null and artist_id = v_artist_id)
    order by created_at desc limit 20) c;
  return v_items;
end $$;
revoke all on function public.studio_flow_list_invitation_cards(uuid) from public, anon;
grant execute on function public.studio_flow_list_invitation_cards(uuid) to authenticated;

create function public.studio_flow_revoke_invitation_card(p_code text)
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
  if exists (select 1 from public.studio_flow_invitation_bookings ib
    join public.appointments a on a.id = ib.appointment_id
    where ib.card_id = v_card.id and ib.voided_at is null and a.status = 'completed'
      and ((ib.benefit_applied = 'qualifying_purchase' and not exists (
        select 1 from public.studio_flow_invitation_bookings gift
        where gift.card_id = v_card.id and gift.client_id = ib.client_id
          and gift.benefit_applied = 'free_service' and gift.voided_at is null))
      or (ib.benefit_applied = 'referral_friend' and not exists (
        select 1 from public.studio_flow_invitation_bookings reward
        where reward.card_id = v_card.id and reward.client_id = ib.referral_client_id
          and reward.benefit_applied = 'referral_reward' and reward.voided_at is null)))) then
    raise exception 'La tarjeta tiene un beneficio ganado pendiente de usar';
  end if;
  update public.studio_flow_invitation_cards set archived_at = coalesce(archived_at,now()) where id = v_card.id;
  return true;
end $$;
revoke all on function public.studio_flow_revoke_invitation_card(text) from public, anon;
grant execute on function public.studio_flow_revoke_invitation_card(text) to authenticated;
