alter table public.studio_flow_invitation_cards
  add column discount_service_id uuid references public.service_offerings(id);

update public.studio_flow_invitation_cards c set expires_at = 'infinity'::timestamptz
where c.benefit_type = 'none' and c.archived_at is null and c.deleted_at is null
  and not exists (select 1 from public.studio_flow_pong_offers po where po.card_id = c.id);

alter function public.studio_flow_create_invitation_card(uuid,text,integer,uuid,uuid,integer)
  rename to studio_flow_create_invitation_card_base;
revoke all on function public.studio_flow_create_invitation_card_base(uuid,text,integer,uuid,uuid,integer)
  from public, anon, authenticated;

create function public.studio_flow_create_invitation_card(
  p_studio_id uuid, p_benefit_type text, p_discount_percent integer default null,
  p_paid_service_id uuid default null, p_free_service_id uuid default null,
  p_max_redemptions integer default 1
) returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_created jsonb; v_expiry timestamptz;
begin
  v_created := public.studio_flow_create_invitation_card_base(
    p_studio_id,p_benefit_type,p_discount_percent,p_paid_service_id,p_free_service_id,p_max_redemptions);
  if p_benefit_type = 'none' then
    update public.studio_flow_invitation_cards set expires_at = 'infinity'::timestamptz
      where code = v_created->>'code' returning expires_at into v_expiry;
    return v_created || jsonb_build_object('expiresAt',v_expiry);
  end if;
  return v_created;
end $$;
revoke all on function public.studio_flow_create_invitation_card(uuid,text,integer,uuid,uuid,integer)
  from public, anon;
grant execute on function public.studio_flow_create_invitation_card(uuid,text,integer,uuid,uuid,integer)
  to authenticated;

create function public.studio_flow_create_discount_card(
  p_studio_id uuid, p_discount_percent integer, p_service_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_created jsonb; v_card public.studio_flow_invitation_cards%rowtype;
begin
  v_created := public.studio_flow_create_invitation_card(
    p_studio_id,'discount',p_discount_percent,null,null,1);
  select * into v_card from public.studio_flow_invitation_cards where code = v_created->>'code';
  if p_service_id is not null then
    if not exists(select 1 from public.service_offerings so where so.id = p_service_id
      and so.status = 'active' and so.archived_at is null and so.price_amount > 0
      and ((v_card.studio_id is not null and so.owner_type = 'studio' and so.studio_id = v_card.studio_id)
        or (v_card.artist_id is not null and so.owner_type = 'artist' and so.artist_id = v_card.artist_id))) then
      raise exception 'Elige un servicio activo de tu negocio para el descuento';
    end if;
    update public.studio_flow_invitation_cards set discount_service_id = p_service_id where id = v_card.id;
  end if;
  return v_created;
end $$;
revoke all on function public.studio_flow_create_discount_card(uuid,integer,uuid) from public, anon;
grant execute on function public.studio_flow_create_discount_card(uuid,integer,uuid) to authenticated;

create function public.studio_flow_update_discount_card(
  p_code text, p_discount_percent integer, p_service_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_card public.studio_flow_invitation_cards%rowtype;
begin
  select * into v_card from public.studio_flow_invitation_cards where code = p_code for update;
  if v_card.id is null or v_card.benefit_type <> 'discount' or v_card.deleted_at is not null
    or v_card.archived_at is not null or v_card.expires_at <= now() then
    raise exception 'La tarjeta de descuento ya no esta disponible'; end if;
  if v_card.studio_id is not null then
    perform public.studio_flow_owner_assert_studio_access(v_card.studio_id);
  elsif not exists(select 1 from public.artists a where a.id = v_card.artist_id
    and a.profile_id = auth.uid() and a.archived_at is null) then
    raise exception 'No puedes editar esta tarjeta'; end if;
  if p_discount_percent not in (10,20,30) then raise exception 'Elige un descuento valido'; end if;
  if exists(select 1 from public.studio_flow_invitation_bookings where card_id = v_card.id)
    or exists(select 1 from public.studio_flow_invitation_referrals where card_id = v_card.id) then
    raise exception 'Esta tarjeta ya tiene actividad. Crea una nueva para cambiar la oferta'; end if;
  if p_service_id is not null and not exists(select 1 from public.service_offerings so
    where so.id = p_service_id and so.status = 'active' and so.archived_at is null
      and so.price_amount > 0
      and ((v_card.studio_id is not null and so.owner_type = 'studio' and so.studio_id = v_card.studio_id)
        or (v_card.artist_id is not null and so.owner_type = 'artist' and so.artist_id = v_card.artist_id))) then
    raise exception 'Elige un servicio activo de tu negocio'; end if;
  update public.studio_flow_invitation_cards
    set discount_percent = p_discount_percent, discount_service_id = p_service_id where id = v_card.id;
  return jsonb_build_object('code',v_card.code,'expiresAt',v_card.expires_at);
end $$;
revoke all on function public.studio_flow_update_discount_card(text,integer,uuid) from public, anon;
grant execute on function public.studio_flow_update_discount_card(text,integer,uuid) to authenticated;

create or replace function public.studio_flow_get_invitation_card(p_code text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_card jsonb; v_service_id uuid;
begin
  v_card := public.studio_flow_get_invitation_card_base(p_code);
  if v_card is null then return null; end if;
  if not exists (select 1 from public.marketplace_profiles mp
    join public.marketplace_listings ml on ml.marketplace_profile_id = mp.id
    where mp.visibility_status = 'visible' and ml.visibility_status = 'visible'
      and (ml.expires_at is null or ml.expires_at > now())
      and (((v_card->>'studioId') is not null and mp.profile_type = 'studio'
        and mp.studio_id = (v_card->>'studioId')::uuid)
        or ((v_card->>'artistId') is not null and mp.profile_type = 'artist'
        and mp.artist_id = (v_card->>'artistId')::uuid))) then return null; end if;
  select discount_service_id into v_service_id from public.studio_flow_invitation_cards where code = p_code;
  return v_card || jsonb_build_object('discountServiceId',v_service_id);
end $$;

alter function public.studio_flow_apply_invitation_to_booking(text,uuid,text)
  rename to studio_flow_apply_invitation_to_booking_base;
revoke all on function public.studio_flow_apply_invitation_to_booking_base(text,uuid,text)
  from public, anon, authenticated;

create function public.studio_flow_apply_invitation_to_booking(
  p_code text, p_appointment_id uuid, p_referral_token text default null
) returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_service_id uuid; v_booked_service_id uuid;
begin
  select discount_service_id into v_service_id from public.studio_flow_invitation_cards
    where code = p_code and benefit_type = 'discount';
  if v_service_id is not null then
    select service_offering_id into v_booked_service_id from public.appointments where id = p_appointment_id;
    if v_booked_service_id is distinct from v_service_id then
      raise exception 'El descuento de esta tarjeta es solo para el servicio seleccionado';
    end if;
  end if;
  return public.studio_flow_apply_invitation_to_booking_base(p_code,p_appointment_id,p_referral_token);
end $$;
revoke all on function public.studio_flow_apply_invitation_to_booking(text,uuid,text)
  from public, anon, authenticated;

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
    'code',c.code,
    'benefitType',case when po.card_id is not null then 'pong' else c.benefit_type end,
    'discountPercent',coalesce(po.discount_percent,c.discount_percent),
    'discountServiceId',c.discount_service_id,
    'paidServiceId',c.paid_service_id,'freeServiceId',c.free_service_id,
    'gameServiceId',po.service_id,'createdAt',c.created_at,'expiresAt',c.expires_at,
    'redemptions',c.redemptions,'maxRedemptions',c.max_redemptions,'active',true,
    'editable',not exists(select 1 from public.studio_flow_invitation_bookings ib where ib.card_id = c.id)
      and not exists(select 1 from public.studio_flow_pong_runs pr where pr.card_id = c.id)
      and not exists(select 1 from public.studio_flow_invitation_referrals rf where rf.card_id = c.id)
  ) order by c.created_at desc),'[]'::jsonb) into v_items
  from (select * from public.studio_flow_invitation_cards where deleted_at is null
    and archived_at is null and expires_at > now()
    and ((p_studio_id is not null and studio_id = p_studio_id)
      or (v_artist_id is not null and artist_id = v_artist_id))
    order by created_at desc limit 20) c
  left join public.studio_flow_pong_offers po on po.card_id = c.id;
  return v_items;
end $$;
revoke all on function public.studio_flow_list_invitation_cards(uuid) from public, anon;
grant execute on function public.studio_flow_list_invitation_cards(uuid) to authenticated;

create function public.studio_flow_invitation_export_details(p_ids uuid[])
returns jsonb language sql stable security definer set search_path = public, auth as $$
  select coalesce(jsonb_object_agg(ib.appointment_id::text,jsonb_build_object(
    'code',c.code,
    'type',case when po.card_id is not null then 'pong' else c.benefit_type end,
    'benefit',ib.benefit_applied,
    'discountPercent',case when ib.discount_amount = 0 then 0
      when po.card_id is not null then po.discount_percent
      when ib.benefit_applied = 'free_service' then 100
      when ib.benefit_applied = 'referral_reward' then 50
      else coalesce(c.discount_percent,0) end,
    'discountAmount',ib.discount_amount,
    'serviceName',so.name,
    'netAmount',ae.gross_amount,
    'points',coalesce((select sum(l.points) from public.flow_point_ledger l
      where l.appointment_id = ib.appointment_id and l.movement_type = 'earn'),0)
  )),'{}'::jsonb)
  from public.studio_flow_invitation_bookings ib
  join public.studio_flow_invitation_cards c on c.id = ib.card_id
  join public.appointments a on a.id = ib.appointment_id
  left join public.studio_flow_pong_offers po on po.card_id = c.id
  left join public.service_offerings so on so.id = coalesce(c.discount_service_id,po.service_id,a.service_offering_id)
  left join public.appointment_economies ae on ae.appointment_id = a.id
  left join public.artists ar on ar.id = a.artist_id
  left join public.studios st on st.id = a.studio_id
  where ib.appointment_id = any(coalesce(p_ids,'{}'::uuid[])) and ib.voided_at is null
    and exists(select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active')
    and (st.owner_profile_id = auth.uid()
      or (ar.profile_id = auth.uid() and a.studio_id is null)
      or exists(select 1 from public.user_role_assignments ura
        join public.roles r on r.id = ura.role_id where ura.profile_id = auth.uid()
          and ura.status = 'active' and r.code = 'platform_owner'));
$$;
revoke all on function public.studio_flow_invitation_export_details(uuid[]) from public, anon;
grant execute on function public.studio_flow_invitation_export_details(uuid[]) to authenticated;
