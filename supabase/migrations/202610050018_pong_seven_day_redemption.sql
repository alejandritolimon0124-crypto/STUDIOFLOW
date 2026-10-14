-- Existing cards keep their original 30-day promise. New Pong cards allow
-- seven days to play and seven days after a win to make the booking.
alter table public.studio_flow_pong_offers
  add column reward_valid_days integer not null default 30
  check (reward_valid_days between 1 and 30);

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
  update public.studio_flow_invitation_cards set expires_at = now() + interval '14 days' where id = v_card.id;
  insert into public.studio_flow_pong_offers(card_id,service_id,max_winners,play_ends_at,discount_percent,reward_valid_days)
    values(v_card.id,p_service_id,p_max_winners,now() + interval '7 days',p_discount_percent,7);
  return v_created || jsonb_build_object('expiresAt',now() + interval '14 days','gameServiceId',p_service_id);
end $$;

do $$
declare
  v_status text := pg_get_functiondef('public.studio_flow_get_pong_status(text)'::regprocedure);
  v_guest text := pg_get_functiondef('public.studio_flow_get_guest_pong_status(text,text)'::regprocedure);
  v_claim text := pg_get_functiondef('public.studio_flow_claim_guest_pong(text,text)'::regprocedure);
  v_book text := pg_get_functiondef('public.studio_flow_book_pong_reward(text,uuid[],uuid,text)'::regprocedure);
begin
  if position('''won'',v_run.status = ''won'' and not v_redeemed and v_card.expires_at > now()' in v_status) = 0
    or position('''playEndsAt'',v_offer.play_ends_at,' in v_status) = 0
    or position('''won'',v_run.status = ''won'' and not exists (' in v_guest) = 0
    or position('if v_run.id is null or v_run.status <> ''won'' then' in v_claim) = 0
    or position('or v_run.status is distinct from ''won'' or p_service_offering_id' in v_book) = 0 then
    raise exception 'Review Pong reward functions before changing their expiry';
  end if;

  v_status := replace(v_status,
    '''playEndsAt'',v_offer.play_ends_at,',
    '''playEndsAt'',v_offer.play_ends_at,''rewardValidDays'',v_offer.reward_valid_days,');
  v_status := replace(v_status,
    '''won'',v_run.status = ''won'' and not v_redeemed and v_card.expires_at > now()',
    '''won'',v_run.status = ''won'' and not v_redeemed and v_card.expires_at > now()' ||
    ' and v_run.finished_at + make_interval(days => v_offer.reward_valid_days) > now()');
  execute v_status;

  v_guest := replace(v_guest,
    '''won'',v_run.status = ''won'' and not exists (',
    '''won'',v_run.status = ''won'' and v_run.finished_at + ' ||
    'make_interval(days => (v_status->>''rewardValidDays'')::integer) > now() and not exists (');
  execute v_guest;

  v_claim := replace(v_claim,
    'if v_run.id is null or v_run.status <> ''won'' then',
    'if v_run.id is null or v_run.status <> ''won'' or v_run.finished_at + ' ||
    'make_interval(days => (select po.reward_valid_days from public.studio_flow_pong_offers po ' ||
    'where po.card_id = v_card.id)) <= now() then');
  execute v_claim;

  v_book := replace(v_book,
    'or v_run.status is distinct from ''won'' or p_service_offering_id',
    'or v_run.status is distinct from ''won'' or v_run.finished_at + ' ||
    'make_interval(days => v_offer.reward_valid_days) <= now() or p_service_offering_id');
  execute v_book;
end $$;
