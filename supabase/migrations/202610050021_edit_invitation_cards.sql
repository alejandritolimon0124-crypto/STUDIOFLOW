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
    'paidServiceId', c.paid_service_id, 'freeServiceId', c.free_service_id,
    'gameServiceId', po.service_id,
    'createdAt', c.created_at, 'expiresAt', c.expires_at,
    'redemptions', c.redemptions, 'maxRedemptions', c.max_redemptions,
    'active', true,
    'editable', not exists (select 1 from public.studio_flow_invitation_bookings ib where ib.card_id = c.id)
      and not exists (select 1 from public.studio_flow_pong_runs pr where pr.card_id = c.id)
      and not exists (select 1 from public.studio_flow_invitation_referrals rf where rf.card_id = c.id)
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
end; $$;
revoke all on function public.studio_flow_list_invitation_cards(uuid) from public, anon;
grant execute on function public.studio_flow_list_invitation_cards(uuid) to authenticated;

create or replace function public.studio_flow_update_invitation_card(p_code text, p_config jsonb)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  v_card public.studio_flow_invitation_cards%rowtype;
  v_offer public.studio_flow_pong_offers%rowtype;
  v_discount integer;
  v_max integer;
  v_paid uuid;
  v_free uuid;
  v_game uuid;
  v_type text;
begin
  select * into v_card from public.studio_flow_invitation_cards where code = p_code for update;
  if v_card.id is null or v_card.deleted_at is not null or v_card.archived_at is not null
    or v_card.expires_at <= now() then raise exception 'La tarjeta no esta disponible'; end if;
  if v_card.studio_id is not null then
    perform public.studio_flow_owner_assert_studio_access(v_card.studio_id);
  elsif not exists (select 1 from public.artists
    where id = v_card.artist_id and profile_id = auth.uid() and archived_at is null) then
    raise exception 'No puedes editar esta tarjeta';
  end if;
  if exists (select 1 from public.studio_flow_invitation_bookings where card_id = v_card.id)
    or exists (select 1 from public.studio_flow_pong_runs where card_id = v_card.id)
    or exists (select 1 from public.studio_flow_invitation_referrals where card_id = v_card.id) then
    raise exception 'Esta tarjeta ya tiene actividad. Para ofrecer otro premio, crea una nueva';
  end if;
  if p_config is null or jsonb_typeof(p_config) <> 'object' then raise exception 'Configuracion invalida'; end if;
  if exists (select 1 from jsonb_object_keys(p_config) as fields(field)
    where field not in ('benefitType','discountPercent','paidServiceId','freeServiceId','gameServiceId','maxRedemptions')) then
    raise exception 'Configuracion invalida';
  end if;
  v_type := v_card.benefit_type;
  if exists (select 1 from public.studio_flow_pong_offers where card_id = v_card.id) then
    v_type := 'pong';
  end if;
  if p_config->>'benefitType' is distinct from v_type then
    raise exception 'El tipo de tarjeta no se puede cambiar; crea una nueva';
  end if;
  v_discount := nullif(p_config->>'discountPercent','')::integer;
  v_max := nullif(p_config->>'maxRedemptions','')::integer;
  v_paid := nullif(p_config->>'paidServiceId','')::uuid;
  v_free := nullif(p_config->>'freeServiceId','')::uuid;
  v_game := nullif(p_config->>'gameServiceId','')::uuid;

  select * into v_offer from public.studio_flow_pong_offers where card_id = v_card.id for update;
  if v_offer.card_id is not null then
    if v_discount not in (10,20,30,50) or v_game is null or v_max is distinct from 1 then
      raise exception 'Elige un servicio, un descuento valido y una ganadora';
    end if;
    if not exists (select 1 from public.service_offerings so where so.id = v_game
      and so.status = 'active' and so.archived_at is null and so.price_amount > 0
      and ((v_card.artist_id is not null and so.owner_type = 'artist' and so.artist_id = v_card.artist_id)
        or (v_card.studio_id is not null and so.owner_type = 'studio' and so.studio_id = v_card.studio_id))) then
      raise exception 'El premio debe ser un servicio activo de este negocio';
    end if;
    update public.studio_flow_pong_offers set service_id = v_game, discount_percent = v_discount
      where card_id = v_card.id;
  else
    if v_max not between 1 and 100 or v_game is not null then raise exception 'Configuracion invalida'; end if;
    if v_card.benefit_type = 'discount' then
      if v_discount not in (10,20,30) or v_paid is not null or v_free is not null then
        raise exception 'Descuento invalido'; end if;
    elsif v_card.benefit_type = 'free_service' then
      if v_discount is not null or v_paid is null or v_free is null or v_paid = v_free then
        raise exception 'Elige dos servicios distintos'; end if;
      if not exists (select 1 from public.service_offerings paid
        join public.service_offerings gift on gift.id = v_free
        where paid.id = v_paid and paid.status = 'active' and gift.status = 'active'
          and paid.archived_at is null and gift.archived_at is null
          and paid.price_amount > gift.price_amount and paid.price_amount > 0
          and ((v_card.artist_id is not null and paid.owner_type = 'artist' and gift.owner_type = 'artist'
            and paid.artist_id = v_card.artist_id and gift.artist_id = v_card.artist_id)
            or (v_card.studio_id is not null and paid.owner_type = 'studio' and gift.owner_type = 'studio'
              and paid.studio_id = v_card.studio_id and gift.studio_id = v_card.studio_id))) then
        raise exception 'El servicio de regalo debe costar menos y pertenecer al negocio'; end if;
    elsif v_discount is not null or v_paid is not null or v_free is not null then
      raise exception 'Configuracion invalida';
    end if;
    if v_card.benefit_type = 'none' and v_max <> 1 then raise exception 'Configuracion invalida'; end if;
    update public.studio_flow_invitation_cards
    set discount_percent = v_discount, paid_service_id = v_paid,
      free_service_id = v_free, max_redemptions = v_max
    where id = v_card.id;
  end if;
  return jsonb_build_object('code', v_card.code, 'expiresAt', v_card.expires_at);
end; $$;
revoke all on function public.studio_flow_update_invitation_card(text,jsonb) from public, anon;
grant execute on function public.studio_flow_update_invitation_card(text,jsonb) to authenticated;
