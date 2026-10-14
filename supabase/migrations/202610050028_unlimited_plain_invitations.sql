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
  v_card := v_card || jsonb_build_object('discountServiceId',v_service_id);
  if v_card->>'benefitType' = 'none' then
    v_card := jsonb_set(v_card,'{available}','true'::jsonb);
  end if;
  return v_card;
end $$;
