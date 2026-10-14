alter table public.studio_flow_invitation_bookings
  drop constraint invitation_bookings_benefit_applied_check;
alter table public.studio_flow_invitation_bookings
  add constraint invitation_bookings_benefit_applied_check
  check (benefit_applied in ('none','discount','qualifying_purchase','free_service',
    'referral_friend','referral_pending','referral_reward','pong_reward'));

update public.studio_flow_invitation_cards
set max_redemptions = 1
where max_redemptions <> 1 and redemptions <= 1;

create or replace function public.studio_flow_activate_referral_reward(p_card_id uuid, p_inviter_client_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_appointment_id uuid; v_amount numeric; v_discount numeric; v_final numeric;
begin
  if not exists (
    select 1 from public.studio_flow_invitation_bookings ib
    join public.appointments a on a.id = ib.appointment_id
    join public.appointment_economies e on e.appointment_id = a.id
    where ib.card_id = p_card_id and ib.referral_client_id = p_inviter_client_id
      and ib.benefit_applied = 'referral_friend' and ib.voided_at is null
      and a.status in ('scheduled','completed') and e.gross_amount > 0
  ) then return; end if;

  select ib.appointment_id into v_appointment_id
  from public.studio_flow_invitation_bookings ib
  join public.appointments a on a.id = ib.appointment_id
  where ib.card_id = p_card_id and ib.client_id = p_inviter_client_id
    and ib.benefit_applied = 'referral_pending' and ib.voided_at is null
    and a.status in ('scheduled','completed')
  order by ib.created_at limit 1;
  if v_appointment_id is null then return; end if;

  select gross_amount into v_amount from public.appointment_economies
    where appointment_id = v_appointment_id for update;
  if v_amount is null or v_amount <= 0 then return; end if;
  if not exists (select 1 from public.studio_flow_invitation_cards
    where id = p_card_id and redemptions < max_redemptions for update) then return; end if;

  v_discount := round(v_amount * 0.50, 2);
  v_final := v_amount - v_discount;
  update public.appointment_economies set gross_amount = v_final,
    platform_fee_amount = round(v_final * 0.10, 2),
    artist_revenue_amount = greatest(v_final - round(v_final * 0.10, 2), 0),
    calculation_version = 'studio-flow-invitation-referral_reward-50', updated_at = now()
  where appointment_id = v_appointment_id;
  update public.commissions set amount = round(v_final * 0.10, 2), rate = 0.10,
    updated_at = now() where appointment_id = v_appointment_id;
  update public.studio_flow_invitation_bookings
    set benefit_applied = 'referral_reward', discount_amount = v_discount
    where appointment_id = v_appointment_id;
  update public.studio_flow_invitation_cards
    set redemptions = redemptions + 1 where id = p_card_id;
end $$;
revoke all on function public.studio_flow_activate_referral_reward(uuid,uuid) from public, anon, authenticated;

create or replace function public.studio_flow_get_invitation_referral(p_code text)
returns text language plpgsql security definer set search_path = public, auth as $$
declare v_card_id uuid; v_client_id uuid; v_token text;
begin
  select id into v_card_id from public.studio_flow_invitation_cards
    where code = p_code and benefit_type = 'referral' and archived_at is null
      and deleted_at is null and expires_at > now() for update;
  if v_card_id is null then raise exception 'Invitacion no disponible'; end if;
  select id into v_client_id from public.clients
    where profile_id = auth.uid() and status = 'active' and archived_at is null;
  if v_client_id is null then raise exception 'Crea tu perfil de clienta primero'; end if;
  if exists (select 1 from public.studio_flow_invitation_referrals
    where card_id = v_card_id and inviter_client_id <> v_client_id) then
    raise exception 'Esta tarjeta ya pertenece a otra clienta';
  end if;
  insert into public.studio_flow_invitation_referrals(card_id, inviter_client_id)
    values (v_card_id, v_client_id) on conflict(card_id, inviter_client_id) do nothing;
  select token into v_token from public.studio_flow_invitation_referrals
    where card_id = v_card_id and inviter_client_id = v_client_id;
  return v_token;
end $$;
revoke all on function public.studio_flow_get_invitation_referral(text) from public, anon;
grant execute on function public.studio_flow_get_invitation_referral(text) to authenticated;

do $$
declare v_create text := pg_get_functiondef('public.studio_flow_create_invitation_card(uuid,text,integer,uuid,uuid,integer)'::regprocedure);
  v_update text := pg_get_functiondef('public.studio_flow_update_invitation_card(text,jsonb)'::regprocedure);
  v_apply text := pg_get_functiondef('public.studio_flow_apply_invitation_to_booking(text,uuid,text)'::regprocedure);
  v_start integer; v_end integer;
  v_referral text := $body$
  elsif v_card.benefit_type = 'referral' then
    if p_referral_token is not null then
      select inviter_client_id into v_inviter_client_id
      from public.studio_flow_invitation_referrals
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
        where ib.card_id = v_card.id and ib.benefit_applied = 'referral_friend'
          and ib.voided_at is null) then
        raise exception 'La amiga de esta tarjeta ya reservo';
      end if;
      v_applied_type := 'referral_friend';
    else
      if exists (select 1 from public.studio_flow_invitation_referrals
        where card_id = v_card.id and inviter_client_id <> v_client.id) then
        raise exception 'Esta tarjeta ya pertenece a otra clienta';
      end if;
      insert into public.studio_flow_invitation_referrals(card_id, inviter_client_id)
        values (v_card.id, v_client.id) on conflict(card_id, inviter_client_id) do nothing;
      if exists (select 1 from public.studio_flow_invitation_bookings ib
        where ib.card_id = v_card.id and ib.client_id = v_client.id
          and ib.benefit_applied in ('referral_pending','referral_reward') and ib.voided_at is null) then
        raise exception 'Ya reservaste con esta tarjeta';
      end if;
      v_inviter_client_id := v_client.id;
      if exists (select 1 from public.studio_flow_invitation_bookings ib
        join public.appointments friend on friend.id = ib.appointment_id
        join public.appointment_economies e on e.appointment_id = friend.id
        where ib.card_id = v_card.id and ib.referral_client_id = v_client.id
          and ib.benefit_applied = 'referral_friend' and ib.voided_at is null
          and friend.status in ('scheduled','completed') and e.gross_amount > 0) then
        v_applied_type := 'referral_reward';
        v_reward_percent := 50;
      else
        v_applied_type := 'referral_pending';
      end if;
    end if;
  end if;
  $body$;
begin
  if position('or p_max_redemptions not between 1 and 100 then' in v_create) = 0 then
    raise exception 'Invitation create validation changed'; end if;
  v_create := replace(v_create, 'or p_max_redemptions not between 1 and 100 then',
    'or p_max_redemptions <> 1 then');
  execute v_create;

  if position('if v_max not between 1 and 100 or v_game is not null then' in v_update) = 0 then
    raise exception 'Invitation update validation changed'; end if;
  v_update := replace(v_update, 'if v_max not between 1 and 100 or v_game is not null then',
    'if v_max <> 1 or v_game is not null then');
  execute v_update;

  v_start := position('  elsif v_card.benefit_type = ''referral'' then' in v_apply);
  v_end := position('  if v_reward_percent > 0 then' in v_apply);
  if v_start = 0 or v_end <= v_start then raise exception 'Invitation referral booking changed'; end if;
  v_apply := substring(v_apply from 1 for v_start - 1) || v_referral || substring(v_apply from v_end);
  if position('  if v_card.benefit_type = ''discount'' then' in v_apply) = 0 then
    raise exception 'Invitation benefit selection changed'; end if;
  v_apply := replace(v_apply, '  if v_card.benefit_type = ''discount'' then',
    '  if v_card.benefit_type <> ''referral'' and exists (' ||
    'select 1 from public.studio_flow_invitation_bookings ib where ib.card_id = v_card.id ' ||
    'and ib.client_id <> v_client.id and ib.voided_at is null) then ' ||
    'raise exception ''Esta tarjeta ya fue usada por otra clienta''; end if;' || chr(10) ||
    '  if v_card.benefit_type = ''none'' and exists (' ||
    'select 1 from public.studio_flow_invitation_bookings ib where ib.card_id = v_card.id ' ||
    'and ib.voided_at is null) then ' ||
    'raise exception ''Esta tarjeta ya fue usada''; end if;' || chr(10) ||
    '  if v_card.benefit_type = ''discount'' then');
  if position('  return jsonb_build_object(''benefit'', v_card.benefit_type' in v_apply) = 0 then
    raise exception 'Invitation booking result changed'; end if;
  v_apply := replace(v_apply, '  return jsonb_build_object(''benefit'', v_card.benefit_type',
    '  if v_card.benefit_type = ''referral'' then ' ||
    'perform public.studio_flow_activate_referral_reward(v_card.id, v_inviter_client_id); end if;' || chr(10) ||
    '  return jsonb_build_object(''benefit'', v_card.benefit_type');
  execute v_apply;
end $$;

create or replace function public.studio_flow_get_invitation_card(p_code text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_card jsonb; v_card_id uuid; v_client_id uuid; v_own_booked boolean := false;
  v_friend_booked boolean := false;
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
        and mp.artist_id = (v_card->>'artistId')::uuid))) then
    return null;
  end if;
  if v_card->>'benefitType' = 'referral' then
    select id into v_card_id from public.studio_flow_invitation_cards where code = p_code;
    select id into v_client_id from public.clients where profile_id = auth.uid()
      and status = 'active' and archived_at is null;
    if v_client_id is not null then
      select exists (select 1 from public.studio_flow_invitation_bookings ib
        join public.appointments a on a.id = ib.appointment_id
        where ib.card_id = v_card_id and ib.client_id = v_client_id
          and ib.benefit_applied in ('referral_pending','referral_reward','referral_friend')
          and ib.voided_at is null and a.status in ('scheduled','completed')) into v_own_booked;
      select exists (select 1 from public.studio_flow_invitation_bookings ib
        join public.appointments a on a.id = ib.appointment_id
        where ib.card_id = v_card_id and ib.referral_client_id = v_client_id
          and ib.benefit_applied = 'referral_friend' and ib.voided_at is null
          and a.status in ('scheduled','completed')) into v_friend_booked;
    end if;
    v_card := v_card || jsonb_build_object('referralOwnBooked', v_own_booked,
      'referralFriendBooked', v_friend_booked,
      'referralEarned', v_own_booked and v_friend_booked);
  end if;
  return v_card;
end $$;
revoke all on function public.studio_flow_get_invitation_card(text) from public;
grant execute on function public.studio_flow_get_invitation_card(text) to anon, authenticated;
