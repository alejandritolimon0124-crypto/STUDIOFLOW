create or replace function public.studio_flow_get_invitation_card(p_code text)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_card jsonb; v_row public.studio_flow_invitation_cards%rowtype;
begin
  select * into v_row from public.studio_flow_invitation_cards where code=p_code
    and deleted_at is null and archived_at is null and expires_at>now();
  if v_row.id is null then return null; end if;
  if v_row.recipient_client_id is not null and v_row.created_by_profile_id is distinct from auth.uid()
    and not exists(select 1 from public.clients c where c.id=v_row.recipient_client_id
      and c.profile_id=auth.uid() and c.status='active' and c.archived_at is null) then
    return jsonb_build_object('private',true);
  end if;
  v_card := public.studio_flow_get_invitation_card_base(p_code);
  if v_card is null then return null; end if;
  if not exists(select 1 from public.marketplace_profiles mp
    join public.marketplace_listings ml on ml.marketplace_profile_id=mp.id
    where mp.visibility_status='visible' and ml.visibility_status='visible'
      and (ml.expires_at is null or ml.expires_at>now())
      and (((v_card->>'studioId') is not null and mp.profile_type='studio'
        and mp.studio_id=(v_card->>'studioId')::uuid)
        or ((v_card->>'artistId') is not null and mp.profile_type='artist'
        and mp.artist_id=(v_card->>'artistId')::uuid))) then return null; end if;
  v_card := v_card || jsonb_build_object('discountServiceId',v_row.discount_service_id);
  if v_card->>'benefitType'='none' and not exists(select 1 from public.studio_flow_pong_offers
    where card_id=v_row.id) then
    v_card := jsonb_set(v_card,'{available}','true'::jsonb);
  end if;
  return v_card;
end $$;
