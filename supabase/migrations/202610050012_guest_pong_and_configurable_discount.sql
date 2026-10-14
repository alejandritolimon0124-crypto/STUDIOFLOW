alter table public.studio_flow_pong_offers
  add column discount_percent integer not null default 50 check (discount_percent in (10,20,30,50));

alter table public.studio_flow_pong_runs
  alter column client_id drop not null,
  add column guest_token_hash text unique,
  add constraint pong_run_identity check ((client_id is null) <> (guest_token_hash is null));

create or replace function public.studio_flow_create_pong_card(
  p_studio_id uuid, p_service_id uuid, p_max_winners integer default 3,
  p_discount_percent integer default 50
) returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_created jsonb; v_card public.studio_flow_invitation_cards%rowtype;
begin
  if p_service_id is null or p_max_winners not between 1 and 20
    or p_discount_percent not in (10,20,30,50) then
    raise exception 'Configura un servicio, un descuento valido y de 1 a 20 premios';
  end if;
  v_created := public.studio_flow_create_invitation_card(p_studio_id,'none',null,null,null,p_max_winners);
  select * into v_card from public.studio_flow_invitation_cards where code = v_created->>'code' for update;
  if not exists (select 1 from public.service_offerings so where so.id = p_service_id
    and so.status = 'active' and so.archived_at is null and so.price_amount > 0
    and ((v_card.artist_id is not null and so.owner_type = 'artist' and so.artist_id = v_card.artist_id)
      or (v_card.studio_id is not null and so.owner_type = 'studio' and so.studio_id = v_card.studio_id))) then
    raise exception 'El premio debe ser un servicio activo y con precio de este negocio';
  end if;
  update public.studio_flow_invitation_cards set expires_at = now() + interval '30 days' where id = v_card.id;
  insert into public.studio_flow_pong_offers(card_id,service_id,max_winners,play_ends_at,discount_percent)
    values(v_card.id,p_service_id,p_max_winners,now() + interval '7 days',p_discount_percent);
  return v_created || jsonb_build_object('expiresAt',now() + interval '30 days','gameServiceId',p_service_id);
end $$;
revoke all on function public.studio_flow_create_pong_card(uuid,uuid,integer,integer) from public, anon;
grant execute on function public.studio_flow_create_pong_card(uuid,uuid,integer,integer) to authenticated;
revoke all on function public.studio_flow_create_pong_card(uuid,uuid,integer) from public, anon, authenticated;
drop function public.studio_flow_create_pong_card(uuid,uuid,integer);

create or replace function public.studio_flow_get_pong_status(p_code text)
returns jsonb language plpgsql security definer set search_path = public, auth, extensions as $$
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
  return jsonb_build_object('serviceId',v_offer.service_id,'discountPercent',v_offer.discount_percent,
    'scoreTarget',10,'maxWinners',v_offer.max_winners,'remaining',greatest(v_offer.max_winners - v_offer.claimed,0),
    'playEndsAt',v_offer.play_ends_at,
    'canPlay',v_offer.play_ends_at > now() and v_card.expires_at > now() and v_offer.claimed < v_offer.max_winners and v_run.id is null,
    'won',v_run.status = 'won' and not v_redeemed and v_card.expires_at > now(),
    'played',v_run.id is not null,
    'playing',v_run.status = 'playing' and v_run.started_at > now() - interval '3 minutes' and v_run.restarts < 1,
    'redeemed',v_redeemed);
end $$;

create or replace function public.studio_flow_score_pong(p_seed bigint,p_moves jsonb,p_started_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_seed bigint := p_seed; v_target numeric; v_move jsonb; v_x numeric; v_time integer;
  v_duration integer; v_total integer := 0; v_expected integer; v_score integer := 0; v_misses integer := 0;
  v_count integer := 0;
begin
  if jsonb_typeof(p_moves) <> 'array' or jsonb_array_length(p_moves) < 3 or jsonb_array_length(p_moves) > 40 then
    raise exception 'Movimientos invalidos';
  end if;
  for v_move in select value from jsonb_array_elements(p_moves) loop
    v_count := v_count + 1;
    v_seed := (v_seed * 48271) % 2147483647;
    v_target := 0.08 + (v_seed % 840)::numeric / 1000;
    v_duration := case v_misses when 0 then 1600 when 1 then 1250 else 980 end;
    v_expected := v_total + round(v_duration * 0.75);
    v_total := v_total + v_duration;
    if jsonb_typeof(v_move) <> 'object' or (v_move->>'x') !~ '^[0-9]+([.][0-9]+)?$'
      or (v_move->>'t') !~ '^[0-9]+$' then raise exception 'Movimiento invalido'; end if;
    v_x := (v_move->>'x')::numeric;
    v_time := (v_move->>'t')::integer;
    if v_x < 0 or v_x > 1 or abs(v_time - v_expected) > 240 then raise exception 'La secuencia de juego no es valida'; end if;
    if abs(v_x - v_target) <= 0.12 then v_score := v_score + 1; else v_misses := v_misses + 1; end if;
    if v_score >= 10 or v_misses >= 3 then exit; end if;
  end loop;
  if v_score < 10 and v_misses < 3 or v_count <> jsonb_array_length(p_moves) then
    raise exception 'La partida no ha terminado correctamente';
  end if;
  if extract(epoch from now() - p_started_at) * 1000 < v_time - 240 then
    raise exception 'La partida termino demasiado pronto';
  end if;
  return jsonb_build_object('won',v_score >= 10,'score',v_score,'misses',v_misses);
end $$;
revoke all on function public.studio_flow_score_pong(bigint,jsonb,timestamptz) from public, anon, authenticated;

create function public.studio_flow_start_guest_pong(p_code text,p_guest_token text)
returns jsonb language plpgsql security definer set search_path = public, auth, extensions as $$
declare v_card public.studio_flow_invitation_cards%rowtype; v_offer public.studio_flow_pong_offers%rowtype;
  v_run public.studio_flow_pong_runs%rowtype; v_hash text; v_expired integer;
begin
  if auth.uid() is not null then raise exception 'Usa tu perfil para jugar'; end if;
  if p_guest_token !~ '^[a-f0-9]{64}$' then raise exception 'Partida invalida'; end if;
  if public.studio_flow_get_invitation_card(p_code) is null then raise exception 'Esta tarjeta no esta disponible'; end if;
  select * into v_card from public.studio_flow_invitation_cards where code = p_code and archived_at is null;
  select * into v_offer from public.studio_flow_pong_offers where card_id = v_card.id for update;
  if v_offer.card_id is null or v_offer.play_ends_at <= now() or v_card.expires_at <= now() then
    raise exception 'El juego ya no esta disponible';
  end if;
  v_hash := encode(digest(p_guest_token,'sha256'),'hex');
  with expired as (update public.studio_flow_pong_runs set status = 'expired',finished_at = now()
    where card_id = v_card.id and status = 'playing' and started_at < now() - interval '3 minutes'
    returning id) select count(*) into v_expired from expired;
  if v_expired > 0 then
    update public.studio_flow_pong_offers set claimed = greatest(claimed - v_expired,0)
      where card_id = v_card.id returning * into v_offer;
  end if;
  select * into v_run from public.studio_flow_pong_runs where guest_token_hash = v_hash and card_id = v_card.id for update;
  if v_run.id is not null then
    if v_run.status <> 'playing' or v_run.restarts >= 1 then raise exception 'Esta tarjeta ya tuvo su partida'; end if;
    update public.studio_flow_pong_runs set seed = floor(random() * 2000000000)::bigint + 1,
      started_at = now(),restarts = restarts + 1 where id = v_run.id returning * into v_run;
  else
    if v_offer.claimed >= v_offer.max_winners then raise exception 'Los premios ya estan reservados'; end if;
    insert into public.studio_flow_pong_runs(card_id,guest_token_hash,seed)
      values(v_card.id,v_hash,floor(random() * 2000000000)::bigint + 1) returning * into v_run;
    update public.studio_flow_pong_offers set claimed = claimed + 1 where card_id = v_card.id;
  end if;
  return jsonb_build_object('runId',v_run.id,'seed',v_run.seed,'startedAt',v_run.started_at,'scoreTarget',10);
end $$;
revoke all on function public.studio_flow_start_guest_pong(text,text) from public, authenticated;
grant execute on function public.studio_flow_start_guest_pong(text,text) to anon;

create function public.studio_flow_finish_guest_pong(p_run_id uuid,p_guest_token text,p_moves jsonb)
returns jsonb language plpgsql security definer set search_path = public, auth, extensions as $$
declare v_run public.studio_flow_pong_runs%rowtype; v_offer public.studio_flow_pong_offers%rowtype;
  v_result jsonb;
begin
  if auth.uid() is not null or p_guest_token !~ '^[a-f0-9]{64}$' then raise exception 'Partida invalida'; end if;
  select * into v_run from public.studio_flow_pong_runs
    where id = p_run_id and guest_token_hash = encode(digest(p_guest_token,'sha256'),'hex') for update;
  if v_run.id is null or v_run.status <> 'playing' or v_run.started_at < now() - interval '3 minutes' then
    raise exception 'Partida no disponible';
  end if;
  select * into v_offer from public.studio_flow_pong_offers where card_id = v_run.card_id for update;
  if v_offer.card_id is null or v_offer.play_ends_at <= now() or not exists (
    select 1 from public.studio_flow_invitation_cards c where c.id = v_run.card_id
      and c.archived_at is null and c.expires_at > now()) then raise exception 'El juego ya no esta disponible'; end if;
  v_result := public.studio_flow_score_pong(v_run.seed,p_moves,v_run.started_at);
  update public.studio_flow_pong_runs set status = case when (v_result->>'won')::boolean then 'won' else 'lost' end,
    score = (v_result->>'score')::integer,misses = (v_result->>'misses')::integer,finished_at = now() where id = v_run.id;
  if not (v_result->>'won')::boolean then
    update public.studio_flow_pong_offers set claimed = greatest(claimed - 1,0) where card_id = v_run.card_id;
  end if;
  return v_result;
end $$;
revoke all on function public.studio_flow_finish_guest_pong(uuid,text,jsonb) from public, authenticated;
grant execute on function public.studio_flow_finish_guest_pong(uuid,text,jsonb) to anon;

create function public.studio_flow_get_guest_pong_status(p_code text,p_guest_token text)
returns jsonb language plpgsql security definer set search_path = public, auth, extensions as $$
declare v_status jsonb; v_card_id uuid; v_run public.studio_flow_pong_runs%rowtype;
begin
  v_status := public.studio_flow_get_pong_status(p_code);
  if v_status is null or p_guest_token !~ '^[a-f0-9]{64}$' then return v_status; end if;
  select id into v_card_id from public.studio_flow_invitation_cards where code = p_code and archived_at is null;
  select * into v_run from public.studio_flow_pong_runs
    where card_id = v_card_id and guest_token_hash = encode(digest(p_guest_token,'sha256'),'hex');
  return v_status || jsonb_build_object('won',v_run.status = 'won' and not exists (
      select 1 from public.studio_flow_invitation_cards c where c.id = v_card_id and c.expires_at <= now()),
    'played',v_run.id is not null,
    'playing',v_run.status = 'playing' and v_run.started_at > now() - interval '3 minutes' and v_run.restarts < 1,
    'canPlay',(v_status->>'canPlay')::boolean and v_run.id is null);
end $$;
revoke all on function public.studio_flow_get_guest_pong_status(text,text) from public;
grant execute on function public.studio_flow_get_guest_pong_status(text,text) to anon, authenticated;

create function public.studio_flow_claim_guest_pong(p_code text,p_guest_token text)
returns jsonb language plpgsql security definer set search_path = public, auth, extensions as $$
declare v_client_id uuid; v_card public.studio_flow_invitation_cards%rowtype;
  v_run public.studio_flow_pong_runs%rowtype;
begin
  if p_guest_token !~ '^[a-f0-9]{64}$' then raise exception 'Premio invalido'; end if;
  select id into v_client_id from public.clients where profile_id = auth.uid() and status = 'active' and archived_at is null;
  if v_client_id is null then raise exception 'Crea tu perfil de clienta para guardar el premio'; end if;
  select * into v_card from public.studio_flow_invitation_cards where code = p_code and archived_at is null for update;
  if v_card.id is null or v_card.expires_at <= now() then raise exception 'La tarjeta ya no esta disponible'; end if;
  select * into v_run from public.studio_flow_pong_runs
    where card_id = v_card.id and guest_token_hash = encode(digest(p_guest_token,'sha256'),'hex') for update;
  if v_run.id is null or v_run.status <> 'won' then raise exception 'Este premio no se ha ganado'; end if;
  if v_run.client_id = v_client_id then return jsonb_build_object('claimed',true); end if;
  if exists (select 1 from public.studio_flow_pong_runs where card_id = v_card.id and client_id = v_client_id) then
    raise exception 'Ya jugaste esta tarjeta con tu perfil';
  end if;
  update public.studio_flow_pong_runs set client_id = v_client_id,guest_token_hash = null where id = v_run.id;
  return jsonb_build_object('claimed',true);
end $$;
revoke all on function public.studio_flow_claim_guest_pong(text,text) from public, anon;
grant execute on function public.studio_flow_claim_guest_pong(text,text) to authenticated;

do $$
declare v_book text := pg_get_functiondef('public.studio_flow_book_pong_reward(text,uuid[],uuid,text)'::regprocedure);
  v_list text := pg_get_functiondef('public.studio_flow_list_invitation_cards(uuid)'::regprocedure);
begin
  if position('v_economy.gross_amount * 0.50' in v_book) = 0
    or position('''serviceId'',v_offer.service_id' in v_book) > 0 then
    raise exception 'Pong booking function changed';
  end if;
  v_book := replace(v_book,'v_economy.gross_amount * 0.50','v_economy.gross_amount * v_offer.discount_percent / 100');
  v_book := replace(v_book,'''studio-flow-invitation-pong-50''',
    '''studio-flow-invitation-pong-'' || v_offer.discount_percent::text');
  execute v_book;
  if position('''benefitType'',case when exists' in v_list) = 0 then raise exception 'Invitation listing changed'; end if;
  v_list := replace(v_list,'''discountPercent'',c.discount_percent',
    '''discountPercent'',coalesce((select po.discount_percent from public.studio_flow_pong_offers po where po.card_id = c.id),c.discount_percent)');
  execute v_list;
end $$;
