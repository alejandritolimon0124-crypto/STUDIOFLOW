create index if not exists campaign_participants_email_lookup_idx
  on public.campaign_participants (campaign_id, lower(trim(email)));

create index if not exists campaign_participants_phone_lookup_idx
  on public.campaign_participants (campaign_id, regexp_replace(whatsapp, '\D', '', 'g'));

create or replace function public.studio_flow_campaign_register(
  p_slug text, p_full_name text, p_whatsapp text, p_email text,
  p_event_type text, p_approximate_event_date date, p_interested_service text,
  p_accepts_promotions boolean default false
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_campaign public.registration_campaigns;
  v_participant public.campaign_participants;
  v_folio text;
  v_email text := lower(trim(p_email));
  v_phone text := regexp_replace(p_whatsapp, '\D', '', 'g');
  v_studio_name text;
begin
  select * into v_campaign
  from public.registration_campaigns
  where slug = lower(trim(p_slug)) and status = 'active'
  for update;

  if not found then
    raise exception 'Campaña no disponible';
  end if;

  if length(trim(p_full_name)) < 3 or length(v_phone) < 10 or position('@' in v_email) < 2 then
    raise exception 'Datos de contacto incompletos';
  end if;

  if exists (
    select 1 from public.campaign_participants
    where campaign_id = v_campaign.id and lower(trim(email)) = v_email
  ) then
    raise exception 'Este correo electrónico ya está registrado en esta campaña.';
  end if;

  if exists (
    select 1 from public.campaign_participants
    where campaign_id = v_campaign.id
      and regexp_replace(whatsapp, '\D', '', 'g') = v_phone
  ) then
    raise exception 'Este número de celular ya está registrado en esta campaña.';
  end if;

  v_folio := v_campaign.folio_prefix || '-' || lpad(v_campaign.next_folio::text, 4, '0');
  update public.registration_campaigns
  set next_folio = next_folio + 1, updated_at = now()
  where id = v_campaign.id;

  insert into public.campaign_participants (
    campaign_id, folio, full_name, whatsapp, email, event_type,
    approximate_event_date, interested_service, accepts_promotions
  ) values (
    v_campaign.id, v_folio, trim(p_full_name), trim(p_whatsapp), v_email,
    trim(p_event_type), p_approximate_event_date, trim(p_interested_service),
    coalesce(p_accepts_promotions, false)
  ) returning * into v_participant;

  select coalesce(sp.commercial_name, s.name, ap.artistic_name, a.display_name, 'Studio Flow')
  into v_studio_name
  from public.registration_campaigns c
  left join public.studios s on s.id = c.studio_id
  left join public.studio_profiles sp on sp.studio_id = s.id
  left join public.artists a on a.id = c.artist_id
  left join public.artist_profiles ap on ap.artist_id = a.id
  where c.id = v_campaign.id;

  return jsonb_build_object(
    'participantId', v_participant.id,
    'folio', v_folio,
    'deliveryToken', v_participant.email_delivery_token,
    'studioName', v_studio_name
  );
end $$;

revoke all on function public.studio_flow_campaign_register(text,text,text,text,text,date,text,boolean) from public;
grant execute on function public.studio_flow_campaign_register(text,text,text,text,text,date,text,boolean) to anon, authenticated;
