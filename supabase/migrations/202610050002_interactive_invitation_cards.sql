-- A shareable invitation is a server-owned offer, not a client-side price override.
create table public.studio_flow_invitation_cards (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default left(replace(gen_random_uuid()::text, '-', ''), 24),
  artist_id uuid references public.artists(id),
  studio_id uuid references public.studios(id),
  created_by_profile_id uuid not null references public.profiles(id),
  benefit_type text not null check (benefit_type in ('none', 'discount', 'free_service', 'referral')),
  discount_percent integer check (discount_percent in (10, 20, 30)),
  paid_service_id uuid references public.service_offerings(id),
  free_service_id uuid references public.service_offerings(id),
  max_redemptions integer not null default 1 check (max_redemptions between 1 and 100),
  redemptions integer not null default 0 check (redemptions >= 0),
  expires_at timestamptz not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invitation_card_entity check ((artist_id is null) <> (studio_id is null)),
  constraint invitation_card_benefit check (
    (benefit_type = 'discount' and discount_percent is not null and free_service_id is null)
    or (benefit_type = 'free_service' and paid_service_id is not null and free_service_id is not null and discount_percent is null and paid_service_id <> free_service_id)
    or (benefit_type in ('none', 'referral') and discount_percent is null and paid_service_id is null and free_service_id is null)
  )
);

create table public.studio_flow_invitation_bookings (
  appointment_id uuid primary key references public.appointments(id),
  card_id uuid not null references public.studio_flow_invitation_cards(id),
  client_id uuid not null references public.clients(id),
  benefit_applied text not null check (benefit_applied in ('none', 'discount', 'qualifying_purchase', 'free_service', 'referral_friend', 'referral_reward')),
  discount_amount numeric not null default 0 check (discount_amount >= 0),
  referral_client_id uuid references public.clients(id),
  voided_at timestamptz,
  created_at timestamptz not null default now()
);
create index invitation_bookings_card_idx on public.studio_flow_invitation_bookings(card_id, client_id);
create unique index invitation_one_discount_per_client on public.studio_flow_invitation_bookings(card_id, client_id)
  where benefit_applied in ('discount', 'free_service', 'referral_reward') and voided_at is null;

create table public.studio_flow_invitation_referrals (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.studio_flow_invitation_cards(id),
  inviter_client_id uuid not null references public.clients(id),
  token text not null unique default left(replace(gen_random_uuid()::text, '-', ''), 24),
  created_at timestamptz not null default now(),
  unique(card_id, inviter_client_id)
);

alter table public.studio_flow_invitation_cards enable row level security;
alter table public.studio_flow_invitation_bookings enable row level security;
alter table public.studio_flow_invitation_referrals enable row level security;
revoke all on public.studio_flow_invitation_cards, public.studio_flow_invitation_bookings,
  public.studio_flow_invitation_referrals from public, anon, authenticated;

create function public.studio_flow_create_invitation_card(
  p_studio_id uuid, p_benefit_type text, p_discount_percent integer default null,
  p_paid_service_id uuid default null, p_free_service_id uuid default null,
  p_max_redemptions integer default 1
) returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_artist_id uuid; v_card public.studio_flow_invitation_cards%rowtype;
begin
  if auth.uid() is null or not exists (select 1 from public.profiles where id = auth.uid() and status = 'active') then
    raise exception 'Inicia sesion para crear la tarjeta';
  end if;
  if p_studio_id is not null then
    perform public.studio_flow_owner_assert_studio_access(p_studio_id);
  else
    select id into v_artist_id from public.artists where profile_id = auth.uid() and status = 'active' and archived_at is null;
    if v_artist_id is null then raise exception 'Perfil de artista activo requerido'; end if;
  end if;
  if not exists (select 1 from public.marketplace_profiles mp
    join public.marketplace_listings ml on ml.marketplace_profile_id = mp.id
    where mp.visibility_status = 'visible' and ml.visibility_status = 'visible'
      and (ml.expires_at is null or ml.expires_at > now())
      and ((v_artist_id is not null and mp.profile_type = 'artist' and mp.artist_id = v_artist_id)
        or (p_studio_id is not null and mp.profile_type = 'studio' and mp.studio_id = p_studio_id))) then
    raise exception 'Publica primero tu perfil y agenda para poder compartir una tarjeta';
  end if;
  if p_benefit_type not in ('none','discount','free_service','referral')
    or (p_benefit_type = 'discount' and p_discount_percent not in (10,20,30))
    or (p_benefit_type <> 'discount' and p_discount_percent is not null)
    or p_max_redemptions not between 1 and 100 then
    raise exception 'Beneficio invalido';
  end if;
  if p_benefit_type = 'free_service' then
    if p_paid_service_id is null or p_free_service_id is null or p_paid_service_id = p_free_service_id then
      raise exception 'Elige el servicio comprado y el servicio gratis';
    end if;
    if (select count(*) from public.service_offerings so
      where so.id in (p_paid_service_id,p_free_service_id) and so.status = 'active' and so.archived_at is null
        and ((v_artist_id is not null and so.owner_type = 'artist' and so.artist_id = v_artist_id)
          or (p_studio_id is not null and so.owner_type = 'studio' and so.studio_id = p_studio_id))) <> 2 then
      raise exception 'Los dos servicios deben pertenecer al negocio y estar activos';
    end if;
  elsif p_paid_service_id is not null or p_free_service_id is not null then
    raise exception 'Estos servicios solo aplican al beneficio de servicio gratis';
  end if;
  insert into public.studio_flow_invitation_cards
    (artist_id, studio_id, created_by_profile_id, benefit_type, discount_percent, paid_service_id, free_service_id, max_redemptions, expires_at)
  values (v_artist_id, p_studio_id, auth.uid(), p_benefit_type, p_discount_percent,
    p_paid_service_id, p_free_service_id, p_max_redemptions,
    now() + case when p_benefit_type = 'none' then interval '1 year'
      when p_benefit_type in ('free_service','referral') then interval '30 days'
      else interval '7 days' end)
  returning * into v_card;
  return jsonb_build_object('code', v_card.code, 'expiresAt', v_card.expires_at);
end $$;
revoke all on function public.studio_flow_create_invitation_card(uuid,text,integer,uuid,uuid,integer) from public, anon;
grant execute on function public.studio_flow_create_invitation_card(uuid,text,integer,uuid,uuid,integer) to authenticated;

create function public.studio_flow_get_invitation_card(p_code text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_card public.studio_flow_invitation_cards%rowtype; v_name text; v_services jsonb;
  v_client_id uuid; v_free_earned boolean := false; v_referral_earned boolean := false;
  v_already_redeemed boolean := false;
begin
  if length(coalesce(p_code,'')) <> 24 then return null; end if;
  select * into v_card from public.studio_flow_invitation_cards where code = p_code and archived_at is null and expires_at > now();
  if v_card.id is null then return null; end if;
  if v_card.studio_id is not null then
    select coalesce(sp.commercial_name,s.name) into v_name from public.studios s
      left join public.studio_profiles sp on sp.studio_id = s.id
      where s.id = v_card.studio_id and s.archived_at is null and s.studio_status = 'approved';
  else
    select coalesce(ap.artistic_name,a.display_name) into v_name from public.artists a
      left join public.artist_profiles ap on ap.artist_id = a.id
      where a.id = v_card.artist_id and a.archived_at is null and a.status = 'active';
  end if;
  if v_name is null then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',so.id,'name',so.name,'price',so.price_amount,'minutes',so.duration_minutes)
      order by so.price_amount,so.name), '[]'::jsonb) into v_services
    from public.service_offerings so
    where so.status = 'active' and so.archived_at is null and
      ((v_card.artist_id is not null and so.owner_type = 'artist' and so.artist_id = v_card.artist_id)
       or (v_card.studio_id is not null and so.owner_type = 'studio' and so.studio_id = v_card.studio_id));
  select id into v_client_id from public.clients where profile_id = auth.uid() and status = 'active' and archived_at is null;
  if v_client_id is not null then
    select exists(select 1 from public.studio_flow_invitation_bookings ib
      join public.appointments a on a.id = ib.appointment_id
      where ib.card_id = v_card.id and ib.client_id = v_client_id and ib.benefit_applied = 'qualifying_purchase' and ib.voided_at is null
        and a.status = 'completed') into v_free_earned;
    select exists(select 1 from public.studio_flow_invitation_bookings ib
      join public.appointments a on a.id = ib.appointment_id
      where ib.card_id = v_card.id and ib.referral_client_id = v_client_id and ib.voided_at is null
        and ib.benefit_applied = 'referral_friend' and a.status = 'completed') into v_referral_earned;
    select exists(select 1 from public.studio_flow_invitation_bookings ib
      where ib.card_id = v_card.id and ib.client_id = v_client_id and ib.voided_at is null
        and ib.benefit_applied in ('discount','free_service','referral_reward')) into v_already_redeemed;
  end if;
  return jsonb_build_object('code',v_card.code,'name',v_name,'artistId',v_card.artist_id,'studioId',v_card.studio_id,
    'benefitType',v_card.benefit_type,'discountPercent',v_card.discount_percent,
    'paidServiceId',v_card.paid_service_id,'freeServiceId',v_card.free_service_id,
    'expiresAt',v_card.expires_at,'available',v_card.benefit_type = 'none' or v_card.redemptions < v_card.max_redemptions,
    'freeEarned',v_free_earned,'referralEarned',v_referral_earned,'alreadyRedeemed',v_already_redeemed,
    'services',v_services);
end $$;
revoke all on function public.studio_flow_get_invitation_card(text) from public;
grant execute on function public.studio_flow_get_invitation_card(text) to anon, authenticated;

create function public.studio_flow_get_invitation_services(p_studio_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_artist_id uuid; v_services jsonb;
begin
  if p_studio_id is not null then
    perform public.studio_flow_owner_assert_studio_access(p_studio_id);
  else
    select id into v_artist_id from public.artists where profile_id = auth.uid() and status = 'active' and archived_at is null;
    if v_artist_id is null then raise exception 'Perfil de artista activo requerido'; end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',so.id,'name',so.name,'price',so.price_amount)
    order by so.price_amount,so.name), '[]'::jsonb) into v_services
  from public.service_offerings so where so.status = 'active' and so.archived_at is null and
    ((v_artist_id is not null and so.owner_type = 'artist' and so.artist_id = v_artist_id)
     or (p_studio_id is not null and so.owner_type = 'studio' and so.studio_id = p_studio_id));
  return v_services;
end $$;
revoke all on function public.studio_flow_get_invitation_services(uuid) from public, anon;
grant execute on function public.studio_flow_get_invitation_services(uuid) to authenticated;

create function public.studio_flow_get_invitation_referral(p_code text)
returns text language plpgsql security definer set search_path = public, auth as $$
declare v_card_id uuid; v_client_id uuid; v_token text;
begin
  select id into v_card_id from public.studio_flow_invitation_cards
    where code = p_code and benefit_type = 'referral' and archived_at is null and expires_at > now();
  if v_card_id is null then raise exception 'Invitacion no disponible'; end if;
  select id into v_client_id from public.clients where profile_id = auth.uid() and status = 'active' and archived_at is null;
  if v_client_id is null then raise exception 'Crea tu perfil de clienta primero'; end if;
  insert into public.studio_flow_invitation_referrals(card_id, inviter_client_id)
    values (v_card_id,v_client_id) on conflict(card_id,inviter_client_id) do nothing;
  select token into v_token from public.studio_flow_invitation_referrals
    where card_id = v_card_id and inviter_client_id = v_client_id;
  return v_token;
end $$;
revoke all on function public.studio_flow_get_invitation_referral(text) from public, anon;
grant execute on function public.studio_flow_get_invitation_referral(text) to authenticated;

create function public.studio_flow_apply_invitation_to_booking(p_code text, p_appointment_id uuid, p_referral_token text default null)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_card public.studio_flow_invitation_cards%rowtype;
  v_appointment public.appointments%rowtype; v_client public.clients%rowtype;
  v_economy public.appointment_economies%rowtype; v_discount numeric := 0; v_new_amount numeric;
  v_applied_type text := 'none'; v_inviter_client_id uuid; v_reward_percent integer := 0;
begin
  select * into v_client from public.clients where profile_id = auth.uid() and status = 'active' and archived_at is null;
  if v_client.id is null then raise exception 'Crea tu perfil de clienta para usar esta invitacion'; end if;
  select * into v_card from public.studio_flow_invitation_cards where code = p_code for update;
  if v_card.id is null or v_card.archived_at is not null or v_card.expires_at <= now() then
    raise exception 'Esta invitacion ya no esta disponible';
  end if;
  select * into v_appointment from public.appointments where id = p_appointment_id and client_id = v_client.id
    and status = 'scheduled' and booking_source = 'marketplace' for update;
  if v_appointment.id is null or (v_card.artist_id is not null and (v_appointment.artist_id <> v_card.artist_id or v_appointment.studio_id is not null))
    or (v_card.studio_id is not null and v_appointment.studio_id is distinct from v_card.studio_id) then
    raise exception 'La cita no corresponde a esta tarjeta';
  end if;
  if exists (select 1 from public.studio_flow_invitation_bookings where appointment_id = v_appointment.id) then
    raise exception 'Esta cita ya uso una tarjeta';
  end if;
  if p_referral_token is not null and v_card.benefit_type <> 'referral' then
    raise exception 'Este enlace no es de referido';
  end if;
  if v_card.benefit_type = 'discount' then
    v_applied_type := 'discount';
    v_reward_percent := v_card.discount_percent;
  elsif v_card.benefit_type = 'free_service' then
    if v_appointment.service_offering_id = v_card.paid_service_id then
      if (select count(distinct ib.client_id) from public.studio_flow_invitation_bookings ib
        join public.appointments a on a.id = ib.appointment_id
        where ib.card_id = v_card.id and ib.benefit_applied = 'qualifying_purchase'
          and ib.voided_at is null and a.status in ('scheduled','completed')) >= v_card.max_redemptions then
        raise exception 'Los regalos de esta invitacion ya estan reservados';
      end if;
      v_applied_type := 'qualifying_purchase';
    elsif v_appointment.service_offering_id = v_card.free_service_id then
      if not exists (select 1 from public.studio_flow_invitation_bookings ib
        join public.appointments a on a.id = ib.appointment_id
        join public.appointment_economies e on e.appointment_id = a.id
        where ib.card_id = v_card.id and ib.client_id = v_client.id
          and ib.benefit_applied = 'qualifying_purchase' and ib.voided_at is null
          and a.status = 'completed' and e.gross_amount > 0) then
        raise exception 'Primero completa el servicio comprado para recibir tu regalo';
      end if;
      v_applied_type := 'free_service';
      v_reward_percent := 100;
    else
      raise exception 'Este servicio no forma parte de la invitacion';
    end if;
  elsif v_card.benefit_type = 'referral' then
    if p_referral_token is not null then
      select inviter_client_id into v_inviter_client_id from public.studio_flow_invitation_referrals
        where token = p_referral_token and card_id = v_card.id;
      if v_inviter_client_id is null or v_inviter_client_id = v_client.id then
        raise exception 'Enlace de amiga invalido';
      end if;
      if exists (select 1 from public.appointments prior
        where prior.client_id = v_client.id and prior.id <> v_appointment.id
          and prior.status = 'completed' and
          ((v_card.studio_id is not null and prior.studio_id = v_card.studio_id)
            or (v_card.artist_id is not null and prior.artist_id = v_card.artist_id and prior.studio_id is null))) then
        raise exception 'Este beneficio es para amigas nuevas en este negocio';
      end if;
      if exists (select 1 from public.studio_flow_invitation_bookings ib
        where ib.card_id = v_card.id and ib.client_id = v_client.id and ib.benefit_applied = 'referral_friend' and ib.voided_at is null) then
        raise exception 'Ya reservaste con esta invitacion de amiga';
      end if;
      if exists (select 1 from public.studio_flow_invitation_bookings ib
        where ib.card_id = v_card.id and ib.referral_client_id = v_inviter_client_id
          and ib.benefit_applied = 'referral_friend' and ib.voided_at is null) then
        raise exception 'Ya hay una cita de amiga ligada a esta invitacion';
      end if;
      if (select count(*) from public.studio_flow_invitation_bookings ib
        where ib.card_id = v_card.id and ib.benefit_applied = 'referral_friend' and ib.voided_at is null) >= v_card.max_redemptions then
        raise exception 'Los beneficios de esta invitacion ya estan reservados';
      end if;
      v_applied_type := 'referral_friend';
    else
      if not exists (select 1 from public.studio_flow_invitation_bookings ib
        join public.appointments friend on friend.id = ib.appointment_id
        join public.appointment_economies e on e.appointment_id = friend.id
        where ib.card_id = v_card.id and ib.referral_client_id = v_client.id
          and ib.benefit_applied = 'referral_friend' and ib.voided_at is null
          and friend.status = 'completed' and e.gross_amount > 0) then
        raise exception 'Tu amiga debe completar primero su cita pagada';
      end if;
      v_applied_type := 'referral_reward';
      v_reward_percent := 50;
    end if;
  end if;
  if v_reward_percent > 0 then
    if v_card.redemptions >= v_card.max_redemptions then raise exception 'El beneficio ya se agoto'; end if;
    if exists (select 1 from public.studio_flow_invitation_bookings
      where card_id = v_card.id and client_id = v_client.id and benefit_applied = v_applied_type and voided_at is null) then
      raise exception 'Ya utilizaste este beneficio';
    end if;
    select * into v_economy from public.appointment_economies where appointment_id = v_appointment.id for update;
    if v_economy.id is null or v_economy.calculation_version like '%happy-hour-discount-%'
      or v_economy.calculation_version like '%flow-points-discount' then
      raise exception 'Esta cita no admite otro descuento';
    end if;
    v_discount := round(v_economy.gross_amount * v_reward_percent / 100, 2);
    v_new_amount := greatest(v_economy.gross_amount - v_discount, 0);
    update public.appointment_economies set gross_amount = v_new_amount,
      platform_fee_amount = round(v_new_amount * 0.10, 2),
      artist_revenue_amount = greatest(v_new_amount - round(v_new_amount * 0.10, 2), 0),
      calculation_version = 'studio-flow-invitation-' || v_applied_type || '-' || v_reward_percent,
      updated_at = now() where id = v_economy.id;
    update public.commissions set amount = round(v_new_amount * 0.10, 2), rate = 0.10,
      updated_at = now() where appointment_id = v_appointment.id;
    update public.studio_flow_invitation_cards set redemptions = redemptions + 1 where id = v_card.id;
  end if;
  insert into public.studio_flow_invitation_bookings
    (appointment_id, card_id, client_id, benefit_applied, discount_amount, referral_client_id)
  values (v_appointment.id, v_card.id, v_client.id, v_applied_type, v_discount, v_inviter_client_id);
  return jsonb_build_object('benefit', v_card.benefit_type, 'discountAmount', v_discount,
    'finalAmount', v_new_amount);
end $$;
revoke all on function public.studio_flow_apply_invitation_to_booking(text,uuid,text) from public, anon, authenticated;

create function public.studio_flow_book_with_invitation(
  p_code text, p_availability_slot_ids uuid[], p_service_offering_id uuid,
  p_notes text default null, p_referral_token text default null
) returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_booking jsonb; v_applied jsonb;
begin
  v_booking := public.studio_flow_marketplace_book_appointment(p_availability_slot_ids, p_service_offering_id, p_notes);
  v_applied := public.studio_flow_apply_invitation_to_booking(p_code, (v_booking->'appointment'->>'id')::uuid, p_referral_token);
  return v_booking || jsonb_build_object('invitation',v_applied);
end $$;
revoke all on function public.studio_flow_book_with_invitation(text,uuid[],uuid,text,text) from public, anon;
grant execute on function public.studio_flow_book_with_invitation(text,uuid[],uuid,text,text) to authenticated;

create function public.studio_flow_void_invitation_on_cancel()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_booking public.studio_flow_invitation_bookings%rowtype;
begin
  if new.status in ('cancelled','no_show') and old.status is distinct from new.status then
    update public.studio_flow_invitation_bookings set voided_at = now()
      where appointment_id = new.id and voided_at is null returning * into v_booking;
    if v_booking.appointment_id is not null and v_booking.benefit_applied in ('discount','free_service','referral_reward') then
      update public.studio_flow_invitation_cards set redemptions = greatest(redemptions - 1, 0)
        where id = v_booking.card_id;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.studio_flow_void_invitation_on_cancel() from public, anon, authenticated;
create trigger studio_flow_void_invitation_on_cancel
after update of status on public.appointments
for each row execute function public.studio_flow_void_invitation_on_cancel();
