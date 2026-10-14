create table public.studio_flow_pong_card_shares (
  child_card_id uuid primary key references public.studio_flow_invitation_cards(id),
  parent_card_id uuid not null references public.studio_flow_invitation_cards(id),
  root_card_id uuid not null references public.studio_flow_invitation_cards(id),
  shared_at timestamptz not null default now()
);
create index studio_flow_pong_card_shares_root_idx on public.studio_flow_pong_card_shares(root_card_id);
alter table public.studio_flow_pong_card_shares enable row level security;
revoke all on public.studio_flow_pong_card_shares from public, anon, authenticated;

create function public.studio_flow_pong_share_state(p_code text, p_guest_token text default null)
returns jsonb language plpgsql security definer set search_path = public, auth, extensions as $$
declare v_card public.studio_flow_invitation_cards%rowtype; v_root_id uuid; v_client_id uuid;
  v_used integer; v_can_share boolean := false; v_winner_taken boolean := false;
begin
  select * into v_card from public.studio_flow_invitation_cards where code = p_code;
  if v_card.id is null or v_card.archived_at is not null or v_card.deleted_at is not null
    or not exists(select 1 from public.studio_flow_pong_offers where card_id = v_card.id) then
    return jsonb_build_object('remaining',0,'canShare',false,'winnerTaken',false);
  end if;
  select coalesce((select root_card_id from public.studio_flow_pong_card_shares
    where child_card_id = v_card.id),v_card.id) into v_root_id;
  select count(*) into v_used from public.studio_flow_pong_card_shares where root_card_id = v_root_id;
  select id into v_client_id from public.clients
    where profile_id = auth.uid() and status = 'active' and archived_at is null;
  select exists(select 1 from public.studio_flow_pong_runs pr
    where pr.card_id = v_card.id and pr.status = 'won'
      and ((v_client_id is not null and pr.client_id = v_client_id)
        or (p_guest_token ~ '^[a-f0-9]{64}$' and pr.guest_token_hash = encode(digest(p_guest_token,'sha256'),'hex'))))
    into v_can_share;
  select po.claimed >= po.max_winners into v_winner_taken
    from public.studio_flow_pong_offers po where po.card_id = v_card.id;
  return jsonb_build_object('remaining',greatest(3-v_used,0),
    'canShare',v_can_share and v_used < 3 and v_card.expires_at > now(),
    'winnerTaken',v_winner_taken);
end $$;
revoke all on function public.studio_flow_pong_share_state(text,text) from public;
grant execute on function public.studio_flow_pong_share_state(text,text) to anon, authenticated;

create function public.studio_flow_share_pong_card(p_code text, p_guest_token text default null)
returns jsonb language plpgsql security definer set search_path = public, auth, extensions as $$
declare v_parent public.studio_flow_invitation_cards%rowtype;
  v_root public.studio_flow_invitation_cards%rowtype;
  v_child public.studio_flow_invitation_cards%rowtype;
  v_offer public.studio_flow_pong_offers%rowtype;
  v_client_id uuid; v_root_id uuid; v_used integer;
begin
  select * into v_parent from public.studio_flow_invitation_cards where code = p_code;
  if v_parent.id is null or v_parent.archived_at is not null or v_parent.deleted_at is not null
    or v_parent.expires_at <= now() then raise exception 'Esta tarjeta ya no se puede compartir'; end if;
  select * into v_offer from public.studio_flow_pong_offers where card_id = v_parent.id;
  if v_offer.card_id is null then raise exception 'Esta tarjeta no tiene juego'; end if;
  select id into v_client_id from public.clients
    where profile_id = auth.uid() and status = 'active' and archived_at is null;
  if not exists(select 1 from public.studio_flow_pong_runs pr
    where pr.card_id = v_parent.id and pr.status = 'won'
      and ((v_client_id is not null and pr.client_id = v_client_id)
        or (p_guest_token ~ '^[a-f0-9]{64}$' and pr.guest_token_hash = encode(digest(p_guest_token,'sha256'),'hex')))) then
    raise exception 'Solo la ganadora puede compartir una nueva oportunidad';
  end if;
  select coalesce((select root_card_id from public.studio_flow_pong_card_shares
    where child_card_id = v_parent.id),v_parent.id) into v_root_id;
  select * into v_root from public.studio_flow_invitation_cards where id = v_root_id for update;
  if v_root.id is null or v_root.archived_at is not null or v_root.deleted_at is not null then
    raise exception 'El reto original ya no esta disponible'; end if;
  select count(*) into v_used from public.studio_flow_pong_card_shares where root_card_id = v_root_id;
  if v_used >= 3 then raise exception 'Las tres oportunidades para compartir ya se usaron'; end if;
  if not exists(select 1 from public.service_offerings so where so.id = v_offer.service_id
    and so.status = 'active' and so.archived_at is null) then
    raise exception 'Este servicio ya no esta disponible'; end if;

  insert into public.studio_flow_invitation_cards
    (artist_id,studio_id,created_by_profile_id,benefit_type,max_redemptions,expires_at)
  values (v_parent.artist_id,v_parent.studio_id,v_parent.created_by_profile_id,'none',1,
    now() + interval '14 days') returning * into v_child;
  insert into public.studio_flow_pong_offers
    (card_id,service_id,max_winners,play_ends_at,discount_percent,reward_valid_days)
  values (v_child.id,v_offer.service_id,1,now() + interval '7 days',
    v_offer.discount_percent,7);
  insert into public.studio_flow_pong_card_shares(child_card_id,parent_card_id,root_card_id)
  values(v_child.id,v_parent.id,v_root_id);
  return jsonb_build_object('code',v_child.code,'remaining',2-v_used);
end $$;
revoke all on function public.studio_flow_share_pong_card(text,text) from public;
grant execute on function public.studio_flow_share_pong_card(text,text) to anon, authenticated;

create function public.studio_flow_closed_pong_card(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_card public.studio_flow_invitation_cards%rowtype; v_name text; v_phone text;
  v_claimed boolean;
begin
  select * into v_card from public.studio_flow_invitation_cards where code = p_code;
  if v_card.id is null or v_card.archived_at is not null or v_card.deleted_at is not null
    or not exists(select 1 from public.studio_flow_pong_offers where card_id = v_card.id)
    or not exists (select 1 from public.marketplace_profiles mp
      join public.marketplace_listings ml on ml.marketplace_profile_id = mp.id
      where mp.visibility_status = 'visible' and ml.visibility_status = 'visible'
        and (ml.expires_at is null or ml.expires_at > now())
        and ((v_card.studio_id is not null and mp.profile_type = 'studio' and mp.studio_id = v_card.studio_id)
          or (v_card.artist_id is not null and mp.profile_type = 'artist' and mp.artist_id = v_card.artist_id))) then
    return null;
  end if;
  if v_card.studio_id is not null then
    select coalesce(sp.commercial_name,s.name),coalesce(sp.whatsapp,sp.phone)
      into v_name,v_phone from public.studios s
      left join public.studio_profiles sp on sp.studio_id = s.id
      where s.id = v_card.studio_id and s.archived_at is null and s.studio_status = 'approved';
  else
    select coalesce(ap.artistic_name,a.display_name),ap.whatsapp
      into v_name,v_phone from public.artists a
      left join public.artist_profiles ap on ap.artist_id = a.id
      where a.id = v_card.artist_id and a.archived_at is null and a.status = 'active';
  end if;
  if v_name is null then return null; end if;
  select claimed >= max_winners into v_claimed from public.studio_flow_pong_offers where card_id = v_card.id;
  return jsonb_build_object('name',v_name,'phone',v_phone,'winnerTaken',v_claimed);
end $$;
revoke all on function public.studio_flow_closed_pong_card(text) from public;
grant execute on function public.studio_flow_closed_pong_card(text) to anon, authenticated;
