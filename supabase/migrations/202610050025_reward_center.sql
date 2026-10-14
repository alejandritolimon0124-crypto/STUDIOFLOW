create or replace function public.studio_flow_client_reward_center()
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_client_id uuid; v_verified_email text; v_cards jsonb; v_campaigns jsonb;
begin
  select id into v_client_id from public.clients
  where profile_id = auth.uid() and status = 'active' and archived_at is null;
  if v_client_id is null then raise exception 'Perfil de clienta requerido'; end if;

  select lower(trim(email)) into v_verified_email from auth.users
  where id = auth.uid() and email_confirmed_at is not null;

  select coalesce(jsonb_agg(item order by item->>'wonAt' desc), '[]'::jsonb) into v_cards
  from (
    select jsonb_build_object(
      'kind', 'pong', 'code', c.code, 'businessName',
        coalesce(sp.commercial_name, s.name, ap.artistic_name, a.display_name, 'Studio Flow'),
      'title', so.name, 'discountPercent', po.discount_percent,
      'wonAt', pr.finished_at, 'expiresAt',
        pr.finished_at + make_interval(days => po.reward_valid_days),
      'used', exists (select 1 from public.studio_flow_invitation_bookings ib
        where ib.card_id = c.id and ib.client_id = v_client_id
          and ib.benefit_applied = 'pong_reward' and ib.voided_at is null),
      'available', c.archived_at is null and c.deleted_at is null
        and c.expires_at > now() and pr.finished_at + make_interval(days => po.reward_valid_days) > now()
    ) as item
    from public.studio_flow_pong_runs pr
    join public.studio_flow_invitation_cards c on c.id = pr.card_id
    join public.studio_flow_pong_offers po on po.card_id = c.id
    join public.service_offerings so on so.id = po.service_id
    left join public.studios s on s.id = c.studio_id
    left join public.studio_profiles sp on sp.studio_id = s.id
    left join public.artists a on a.id = c.artist_id
    left join public.artist_profiles ap on ap.artist_id = a.id
    where pr.client_id = v_client_id and pr.status = 'won'
    union all
    select jsonb_build_object(
      'kind', 'gift', 'code', c.code, 'businessName',
        coalesce(sp.commercial_name, s.name, ap.artistic_name, a.display_name, 'Studio Flow'),
      'title', coalesce(gift.name, 'Servicio de regalo'), 'discountPercent', 100,
      'wonAt', paid.completed_at,
      'expiresAt', paid.completed_at + interval '30 days',
      'used', false,
      'available', c.archived_at is null and c.deleted_at is null
        and paid.completed_at + interval '30 days' > now()
    ) as item
    from public.studio_flow_invitation_bookings ib
    join public.appointments paid on paid.id = ib.appointment_id
    join public.studio_flow_invitation_cards c on c.id = ib.card_id
    left join public.service_offerings gift on gift.id = c.free_service_id
    left join public.studios s on s.id = c.studio_id
    left join public.studio_profiles sp on sp.studio_id = s.id
    left join public.artists a on a.id = c.artist_id
    left join public.artist_profiles ap on ap.artist_id = a.id
    where ib.client_id = v_client_id and ib.voided_at is null
      and ib.benefit_applied = 'qualifying_purchase' and paid.status = 'completed'
      and not exists (select 1 from public.studio_flow_invitation_bookings claimed
        where claimed.card_id = c.id and claimed.client_id = v_client_id
          and claimed.benefit_applied = 'free_service' and claimed.voided_at is null)
    union all
    select jsonb_build_object(
      'kind', 'invitation', 'code', c.code, 'businessName',
        coalesce(sp.commercial_name, s.name, ap.artistic_name, a.display_name, 'Studio Flow'),
      'title', case ib.benefit_applied
        when 'free_service' then coalesce(gift.name, 'Servicio de regalo')
        when 'referral_reward' then 'Ven con una amiga'
        else 'Descuento especial' end,
      'discountPercent', case ib.benefit_applied
        when 'free_service' then 100 when 'referral_reward' then 50 else c.discount_percent end,
      'wonAt', ib.created_at, 'expiresAt', c.expires_at,
      'used', true, 'available', false
    ) as item
    from public.studio_flow_invitation_bookings ib
    join public.studio_flow_invitation_cards c on c.id = ib.card_id
    left join public.service_offerings gift on gift.id = c.free_service_id
    left join public.studios s on s.id = c.studio_id
    left join public.studio_profiles sp on sp.studio_id = s.id
    left join public.artists a on a.id = c.artist_id
    left join public.artist_profiles ap on ap.artist_id = a.id
    where ib.client_id = v_client_id and ib.voided_at is null
      and ib.benefit_applied in ('discount','free_service','referral_reward')
  ) rewards;

  select coalesce(jsonb_agg(jsonb_build_object(
    'campaignName', c.name, 'eventName', c.event_name,
    'prizeName', coalesce(r.name, case d.raffle_type
      when 'clients' then c.client_raffle_name else c.promotion_name end),
    'businessName', coalesce(sp.commercial_name, s.name, ap.artistic_name, a.display_name, 'Studio Flow'),
    'wonAt', d.drawn_at, 'folio', p.folio
  ) order by d.drawn_at desc), '[]'::jsonb) into v_campaigns
  from public.campaign_raffle_draws d
  join public.campaign_participants p on p.id = d.participant_id
  join public.registration_campaigns c on c.id = d.campaign_id
  left join public.campaign_raffles r on r.id = d.raffle_id
  left join public.studios s on s.id = c.studio_id
  left join public.studio_profiles sp on sp.studio_id = s.id
  left join public.artists a on a.id = c.artist_id
  left join public.artist_profiles ap on ap.artist_id = a.id
  where v_verified_email is not null and lower(trim(p.email)) = v_verified_email;

  return jsonb_build_object('cards', v_cards, 'campaigns', v_campaigns);
end $$;
revoke all on function public.studio_flow_client_reward_center() from public, anon;
grant execute on function public.studio_flow_client_reward_center() to authenticated;

create or replace function public.studio_flow_invitation_card_winners(p_code text, p_studio_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_card public.studio_flow_invitation_cards%rowtype; v_winners jsonb;
begin
  select * into v_card from public.studio_flow_invitation_cards where code = p_code;
  if v_card.id is null then raise exception 'Tarjeta no encontrada'; end if;
  if p_studio_id is not null then
    if v_card.studio_id is distinct from p_studio_id then raise exception 'Tarjeta no encontrada'; end if;
    perform public.studio_flow_owner_assert_studio_access(p_studio_id);
  elsif v_card.studio_id is not null or not exists (
    select 1 from public.artists a where a.id = v_card.artist_id
      and a.profile_id = auth.uid() and a.archived_at is null
  ) then raise exception 'No puedes consultar esta tarjeta'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'name', coalesce(cl.display_name, 'Aún sin perfil'),
    'phone', coalesce(nullif(cl.phone, ''), nullif(p.phone, '')),
    'wonAt', pr.finished_at,
    'expiresAt', pr.finished_at + make_interval(days => po.reward_valid_days),
    'discountPercent', po.discount_percent,
    'serviceName', so.name,
    'claimed', pr.client_id is not null,
    'used', exists (select 1 from public.studio_flow_invitation_bookings ib
      where ib.card_id = v_card.id and ib.client_id = pr.client_id
        and ib.benefit_applied = 'pong_reward' and ib.voided_at is null)
  ) order by pr.finished_at desc), '[]'::jsonb) into v_winners
  from public.studio_flow_pong_runs pr
  join public.studio_flow_pong_offers po on po.card_id = pr.card_id
  join public.service_offerings so on so.id = po.service_id
  left join public.clients cl on cl.id = pr.client_id
  left join public.profiles p on p.id = cl.profile_id
  where pr.card_id = v_card.id and pr.status = 'won';

  return v_winners;
end $$;
revoke all on function public.studio_flow_invitation_card_winners(text,uuid) from public, anon;
grant execute on function public.studio_flow_invitation_card_winners(text,uuid) to authenticated;
