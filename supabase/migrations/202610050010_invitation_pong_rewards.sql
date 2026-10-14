-- Pong rewards are separate from ordinary invitation benefits. A client cannot
-- supply a score or price to the booking function.
create table public.studio_flow_pong_offers (
  card_id uuid primary key references public.studio_flow_invitation_cards(id),
  service_id uuid not null references public.service_offerings(id),
  max_winners integer not null check (max_winners between 1 and 20),
  claimed integer not null default 0 check (claimed >= 0),
  play_ends_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.studio_flow_pong_runs (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.studio_flow_invitation_cards(id),
  client_id uuid not null references public.clients(id),
  seed bigint not null,
  status text not null default 'playing' check (status in ('playing','won','lost','expired')),
  score integer not null default 0,
  misses integer not null default 0,
  restarts integer not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique(card_id,client_id)
);
create index studio_flow_pong_runs_status_idx on public.studio_flow_pong_runs(card_id,status,started_at);
alter table public.studio_flow_pong_offers enable row level security;
alter table public.studio_flow_pong_runs enable row level security;
revoke all on public.studio_flow_pong_offers, public.studio_flow_pong_runs from public, anon, authenticated;

alter table public.studio_flow_invitation_bookings drop constraint studio_flow_invitation_bookings_benefit_applied_check;
alter table public.studio_flow_invitation_bookings add constraint invitation_bookings_benefit_applied_check
  check (benefit_applied in ('none','discount','qualifying_purchase','free_service','referral_friend','referral_reward','pong_reward'));
drop index public.invitation_one_discount_per_client;
create unique index invitation_one_discount_per_client on public.studio_flow_invitation_bookings(card_id,client_id)
  where benefit_applied in ('discount','free_service','referral_reward','pong_reward') and voided_at is null;

create function public.studio_flow_create_pong_card(p_studio_id uuid, p_service_id uuid, p_max_winners integer default 3)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_created jsonb; v_card public.studio_flow_invitation_cards%rowtype;
begin
  if p_service_id is null or p_max_winners not between 1 and 20 then raise exception 'Configura un servicio y de 1 a 20 premios'; end if;
  v_created := public.studio_flow_create_invitation_card(p_studio_id,'none',null,null,null,p_max_winners);
  select * into v_card from public.studio_flow_invitation_cards where code = v_created->>'code' for update;
  if not exists (select 1 from public.service_offerings so where so.id = p_service_id and so.status = 'active'
    and so.archived_at is null and so.price_amount > 0 and
    ((v_card.artist_id is not null and so.owner_type = 'artist' and so.artist_id = v_card.artist_id)
      or (v_card.studio_id is not null and so.owner_type = 'studio' and so.studio_id = v_card.studio_id))) then
    raise exception 'El premio debe ser un servicio activo y con precio de este negocio';
  end if;
  update public.studio_flow_invitation_cards set expires_at = now() + interval '30 days' where id = v_card.id;
  insert into public.studio_flow_pong_offers(card_id,service_id,max_winners,play_ends_at)
    values(v_card.id,p_service_id,p_max_winners,now() + interval '7 days');
  return v_created || jsonb_build_object('expiresAt',now() + interval '30 days','gameServiceId',p_service_id);
end $$;
revoke all on function public.studio_flow_create_pong_card(uuid,uuid,integer) from public, anon;
grant execute on function public.studio_flow_create_pong_card(uuid,uuid,integer) to authenticated;

create function public.studio_flow_get_pong_status(p_code text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_card public.studio_flow_invitation_cards%rowtype; v_offer public.studio_flow_pong_offers%rowtype;
  v_client_id uuid; v_run public.studio_flow_pong_runs%rowtype; v_redeemed boolean := false;
begin
  if length(coalesce(p_code,'')) <> 24 then return null; end if;
  select * into v_card from public.studio_flow_invitation_cards where code = p_code and archived_at is null;
  if v_card.id is null then return null; end if;
  select * into v_offer from public.studio_flow_pong_offers where card_id = v_card.id;
  if v_offer.card_id is null then return null; end if;
  select id into v_client_id from public.clients where profile_id = auth.uid() and status = 'active' and archived_at is null;
  if v_client_id is not null then
    select * into v_run from public.studio_flow_pong_runs where card_id = v_card.id and client_id = v_client_id;
    select exists(select 1 from public.studio_flow_invitation_bookings ib
      where ib.card_id = v_card.id and ib.client_id = v_client_id and ib.benefit_applied = 'pong_reward'
        and ib.voided_at is null) into v_redeemed;
  end if;
  return jsonb_build_object('serviceId',v_offer.service_id,'scoreTarget',10,'maxWinners',v_offer.max_winners,
    'remaining',greatest(v_offer.max_winners - v_offer.claimed,0),'playEndsAt',v_offer.play_ends_at,
    'canPlay',v_offer.play_ends_at > now() and v_card.expires_at > now() and v_offer.claimed < v_offer.max_winners
      and v_run.id is null,
    'won',v_run.status = 'won' and not v_redeemed and v_card.expires_at > now(),
    'played',v_run.id is not null,'playing',v_run.status = 'playing' and v_run.started_at > now() - interval '3 minutes' and v_run.restarts < 1,
    'redeemed',v_redeemed);
end $$;
revoke all on function public.studio_flow_get_pong_status(text) from public;
grant execute on function public.studio_flow_get_pong_status(text) to anon, authenticated;

create function public.studio_flow_start_pong(p_code text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_card public.studio_flow_invitation_cards%rowtype; v_offer public.studio_flow_pong_offers%rowtype;
  v_client_id uuid; v_run public.studio_flow_pong_runs%rowtype; v_expired integer := 0;
begin
  select id into v_client_id from public.clients where profile_id = auth.uid() and status = 'active' and archived_at is null;
  if v_client_id is null then raise exception 'Crea tu perfil de clienta para jugar'; end if;
  if public.studio_flow_get_invitation_card(p_code) is null then raise exception 'Esta tarjeta no esta disponible'; end if;
  select * into v_card from public.studio_flow_invitation_cards where code = p_code and archived_at is null;
  select * into v_offer from public.studio_flow_pong_offers where card_id = v_card.id for update;
  if v_offer.card_id is null or v_offer.play_ends_at <= now() or v_card.expires_at <= now() then
    raise exception 'El juego ya no esta disponible';
  end if;
  with expired as (update public.studio_flow_pong_runs set status = 'expired',finished_at = now()
    where card_id = v_card.id and status = 'playing' and started_at < now() - interval '3 minutes'
    returning id) select count(*) into v_expired from expired;
  if v_expired > 0 then
    update public.studio_flow_pong_offers set claimed = greatest(claimed - v_expired,0)
      where card_id = v_card.id returning * into v_offer;
  end if;
  select * into v_run from public.studio_flow_pong_runs where card_id = v_card.id and client_id = v_client_id for update;
  if v_run.id is not null then
    if v_run.status <> 'playing' then raise exception 'Ya jugaste esta tarjeta'; end if;
    if v_run.restarts >= 1 then raise exception 'Esta partida ya esta en curso'; end if;
    update public.studio_flow_pong_runs set seed = floor(random() * 2000000000)::bigint + 1,
      started_at = now(),restarts = restarts + 1 where id = v_run.id returning * into v_run;
  else
    if v_offer.claimed >= v_offer.max_winners then raise exception 'Los premios ya estan reservados'; end if;
    insert into public.studio_flow_pong_runs(card_id,client_id,seed)
      values(v_card.id,v_client_id,floor(random() * 2000000000)::bigint + 1) returning * into v_run;
    update public.studio_flow_pong_offers set claimed = claimed + 1 where card_id = v_card.id;
  end if;
  return jsonb_build_object('runId',v_run.id,'seed',v_run.seed,'startedAt',v_run.started_at,'scoreTarget',10);
end $$;
revoke all on function public.studio_flow_start_pong(text) from public, anon;
grant execute on function public.studio_flow_start_pong(text) to authenticated;

create function public.studio_flow_finish_pong(p_run_id uuid, p_moves jsonb)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_client_id uuid; v_run public.studio_flow_pong_runs%rowtype;
  v_offer public.studio_flow_pong_offers%rowtype; v_seed bigint; v_target numeric;
  v_move jsonb; v_x numeric; v_time integer; v_duration integer; v_total integer := 0;
  v_expected integer; v_score integer := 0; v_misses integer := 0;
begin
  select id into v_client_id from public.clients where profile_id = auth.uid() and status = 'active' and archived_at is null;
  if v_client_id is null then raise exception 'Perfil de clienta requerido'; end if;
  select * into v_run from public.studio_flow_pong_runs where id = p_run_id and client_id = v_client_id for update;
  if v_run.id is null or v_run.status <> 'playing' or v_run.started_at < now() - interval '3 minutes' then
    raise exception 'Partida no disponible';
  end if;
  if jsonb_typeof(p_moves) <> 'array' or jsonb_array_length(p_moves) < 3 or jsonb_array_length(p_moves) > 40 then
    raise exception 'Movimientos invalidos';
  end if;
  select * into v_offer from public.studio_flow_pong_offers where card_id = v_run.card_id for update;
  v_seed := v_run.seed;
  for v_move in select value from jsonb_array_elements(p_moves) loop
    v_seed := (v_seed * 48271) % 2147483647;
    v_target := 0.08 + (v_seed % 840)::numeric / 1000;
    v_duration := case v_misses when 0 then 1600 when 1 then 1250 else 980 end;
    v_expected := v_total + round(v_duration * 0.75);
    v_total := v_total + v_duration;
    v_x := (v_move->>'x')::numeric;
    v_time := (v_move->>'t')::integer;
    if v_x < 0 or v_x > 1 or abs(v_time - v_expected) > 240 then
      raise exception 'La secuencia de juego no es valida';
    end if;
    if abs(v_x - v_target) <= 0.12 then v_score := v_score + 1;
    else v_misses := v_misses + 1; end if;
    exit when v_score >= 10 or v_misses >= 3;
  end loop;
  if v_score < 10 and v_misses < 3 then raise exception 'La partida no ha terminado'; end if;
  if extract(epoch from now() - v_run.started_at) * 1000 < v_time - 240 then
    raise exception 'La partida termino demasiado pronto';
  end if;
  if v_score >= 10 then
    update public.studio_flow_pong_runs set status = 'won',score = v_score,misses = v_misses,finished_at = now()
      where id = v_run.id;
  else
    update public.studio_flow_pong_runs set status = 'lost',score = v_score,misses = v_misses,finished_at = now()
      where id = v_run.id;
    update public.studio_flow_pong_offers set claimed = greatest(claimed - 1,0) where card_id = v_run.card_id;
  end if;
  return jsonb_build_object('won',v_score >= 10,'score',v_score,'misses',v_misses);
end $$;
revoke all on function public.studio_flow_finish_pong(uuid,jsonb) from public, anon;
grant execute on function public.studio_flow_finish_pong(uuid,jsonb) to authenticated;

create function public.studio_flow_book_pong_reward(
  p_code text, p_availability_slot_ids uuid[], p_service_offering_id uuid, p_notes text default null
) returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_client_id uuid; v_card public.studio_flow_invitation_cards%rowtype;
  v_offer public.studio_flow_pong_offers%rowtype; v_run public.studio_flow_pong_runs%rowtype;
  v_booking jsonb; v_appointment_id uuid; v_economy public.appointment_economies%rowtype;
  v_discount numeric; v_final numeric; v_fee numeric;
begin
  select id into v_client_id from public.clients where profile_id = auth.uid() and status = 'active' and archived_at is null;
  if v_client_id is null then raise exception 'Perfil de clienta requerido'; end if;
  select * into v_card from public.studio_flow_invitation_cards where code = p_code and archived_at is null for update;
  select * into v_offer from public.studio_flow_pong_offers where card_id = v_card.id;
  select * into v_run from public.studio_flow_pong_runs where card_id = v_card.id and client_id = v_client_id;
  if v_card.id is null or v_card.expires_at <= now() or v_offer.card_id is null
    or v_run.status is distinct from 'won' or p_service_offering_id is distinct from v_offer.service_id
    or v_card.redemptions >= v_card.max_redemptions then raise exception 'El premio no esta disponible para esta reserva'; end if;
  if exists (select 1 from public.studio_flow_invitation_bookings
    where card_id = v_card.id and client_id = v_client_id and benefit_applied = 'pong_reward' and voided_at is null) then
    raise exception 'Este premio ya se uso';
  end if;
  v_booking := public.studio_flow_marketplace_book_appointment(p_availability_slot_ids,p_service_offering_id,p_notes);
  v_appointment_id := (v_booking->'appointment'->>'id')::uuid;
  if not exists(select 1 from public.appointments a where a.id = v_appointment_id and a.client_id = v_client_id
    and a.status = 'scheduled' and a.booking_source = 'marketplace'
    and ((v_card.artist_id is not null and a.artist_id = v_card.artist_id and a.studio_id is null)
      or (v_card.studio_id is not null and a.studio_id = v_card.studio_id))) then
    raise exception 'La cita no corresponde a este premio';
  end if;
  select * into v_economy from public.appointment_economies where appointment_id = v_appointment_id for update;
  if v_economy.id is null or v_economy.gross_amount <= 0
    or v_economy.calculation_version like '%happy-hour-discount-%'
    or v_economy.calculation_version like '%flow-points-discount%' then
    raise exception 'Este servicio no admite otro descuento';
  end if;
  v_discount := round(v_economy.gross_amount * 0.50,2);
  v_final := v_economy.gross_amount - v_discount;
  v_fee := round(v_final * 0.10,2);
  update public.appointment_economies set gross_amount = v_final,platform_fee_amount = v_fee,
    artist_revenue_amount = greatest(v_final - v_fee,0),
    calculation_version = 'studio-flow-invitation-pong-50',updated_at = now() where id = v_economy.id;
  update public.commissions set amount = v_fee,rate = 0.10,updated_at = now() where appointment_id = v_appointment_id;
  insert into public.studio_flow_invitation_bookings(appointment_id,card_id,client_id,benefit_applied,discount_amount)
    values(v_appointment_id,v_card.id,v_client_id,'pong_reward',v_discount);
  update public.studio_flow_invitation_cards set redemptions = redemptions + 1 where id = v_card.id;
  return v_booking || jsonb_build_object('invitation',jsonb_build_object('benefit','pong_reward',
    'discountAmount',v_discount,'finalAmount',v_final));
end $$;
revoke all on function public.studio_flow_book_pong_reward(text,uuid[],uuid,text) from public, anon;
grant execute on function public.studio_flow_book_pong_reward(text,uuid[],uuid,text) to authenticated;

do $$
declare v_list text := pg_get_functiondef('public.studio_flow_list_invitation_cards(uuid)'::regprocedure);
  v_revoke text := pg_get_functiondef('public.studio_flow_revoke_invitation_card(text)'::regprocedure);
  v_void text := pg_get_functiondef('public.studio_flow_void_invitation_on_cancel()'::regprocedure);
begin
  if position('''benefitType'',c.benefit_type' in v_list) = 0 then raise exception 'Invitation list changed'; end if;
  v_list := replace(v_list, '''benefitType'',c.benefit_type',
    '''benefitType'',case when exists(select 1 from public.studio_flow_pong_offers po where po.card_id = c.id) then ''pong'' else c.benefit_type end');
  execute v_list;
  if position('  if exists (select 1 from public.studio_flow_invitation_bookings ib' in v_revoke) = 0 then raise exception 'Invitation revoke changed'; end if;
  v_revoke := replace(v_revoke,'  if exists (select 1 from public.studio_flow_invitation_bookings ib',
    '  if exists (select 1 from public.studio_flow_pong_runs gr where gr.card_id = v_card.id and gr.status = ''won'' ' ||
    'and not exists(select 1 from public.studio_flow_invitation_bookings ib where ib.card_id = v_card.id ' ||
    'and ib.client_id = gr.client_id and ib.benefit_applied = ''pong_reward'' and ib.voided_at is null)) then ' ||
    'raise exception ''La tarjeta tiene un premio de juego pendiente''; end if;' || chr(10) ||
    '  if exists (select 1 from public.studio_flow_invitation_bookings ib');
  execute v_revoke;
  if position('(''discount'',''free_service'',''referral_reward'')' in v_void) = 0 then raise exception 'Invitation cancel trigger changed'; end if;
  v_void := replace(v_void,'(''discount'',''free_service'',''referral_reward'')',
    '(''discount'',''free_service'',''referral_reward'',''pong_reward'')');
  execute v_void;
end $$;
