create or replace function public.studio_flow_create_pong_card(
  p_studio_id uuid, p_service_id uuid, p_max_winners integer default 1,
  p_discount_percent integer default 50
) returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_created jsonb; v_card public.studio_flow_invitation_cards%rowtype;
begin
  if p_service_id is null or p_max_winners is distinct from 1
    or p_discount_percent not in (10,20,30,50) then
    raise exception 'Configura un servicio, un descuento valido y una ganadora por tarjeta';
  end if;
  v_created := public.studio_flow_create_invitation_card(p_studio_id,'none',null,null,null,1);
  select * into v_card from public.studio_flow_invitation_cards where code = v_created->>'code' for update;
  if not exists (select 1 from public.service_offerings so where so.id = p_service_id
    and so.status = 'active' and so.archived_at is null and so.price_amount > 0
    and ((v_card.artist_id is not null and so.owner_type = 'artist' and so.artist_id = v_card.artist_id)
      or (v_card.studio_id is not null and so.owner_type = 'studio' and so.studio_id = v_card.studio_id))) then
    raise exception 'El premio debe ser un servicio activo y con precio de este negocio';
  end if;
  update public.studio_flow_invitation_cards set expires_at = now() + interval '14 days' where id = v_card.id;
  insert into public.studio_flow_pong_offers(card_id,service_id,max_winners,play_ends_at,discount_percent,reward_valid_days)
    values(v_card.id,p_service_id,1,now() + interval '7 days',p_discount_percent,7);
  return v_created || jsonb_build_object('expiresAt',now() + interval '14 days','gameServiceId',p_service_id);
end $$;
