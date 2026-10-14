alter table public.campaign_participants
  add column if not exists answers jsonb not null default '{}'::jsonb;

create or replace function public.studio_flow_campaign_create_for_entity(
  p_entity_type text, p_entity_id uuid, p_name text, p_event_name text, p_event_date date,
  p_description text, p_promotion_name text, p_client_raffle_name text,
  p_welcome_text text, p_image_url text, p_slug text, p_folio_prefix text,
  p_form_config jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_campaign public.registration_campaigns;
  v_questions jsonb := coalesce(p_form_config->'questions', '[]'::jsonb);
  v_question jsonb;
  v_options jsonb;
begin
  if p_entity_type='studio' and not public.studio_flow_is_studio_owner(p_entity_id) then raise exception 'Studio owner access required'; end if;
  if p_entity_type='artist' and not public.studio_flow_is_artist_owner(p_entity_id) then raise exception 'Artist access required'; end if;
  if p_entity_type not in ('studio','artist') then raise exception 'Invalid campaign owner'; end if;
  if jsonb_typeof(v_questions) <> 'array' or jsonb_array_length(v_questions) > 20 then raise exception 'El formulario admite hasta 20 preguntas'; end if;

  for v_question in select value from jsonb_array_elements(v_questions)
  loop
    if coalesce(length(trim(v_question->>'id')),0) < 3 or coalesce(length(trim(v_question->>'label')),0) < 3 then raise exception 'Cada pregunta necesita un título'; end if;
    if v_question->>'type' not in ('single','multiple','short','dichotomous') then raise exception 'Tipo de pregunta inválido'; end if;
    if v_question->>'type' <> 'short' then
      v_options := coalesce(v_question->'options', '[]'::jsonb);
      if jsonb_typeof(v_options) <> 'array' or jsonb_array_length(v_options) < 2 or jsonb_array_length(v_options) > 20 then raise exception 'Cada pregunta de opciones necesita entre 2 y 20 respuestas'; end if;
    end if;
  end loop;

  insert into public.registration_campaigns (
    studio_id, artist_id, name, event_name, event_date, description, promotion_name,
    client_raffle_name, welcome_text, image_url, slug, folio_prefix, form_config
  ) values (
    case when p_entity_type='studio' then p_entity_id end,
    case when p_entity_type='artist' then p_entity_id end,
    trim(p_name), trim(p_event_name), p_event_date, nullif(trim(p_description), ''),
    coalesce(nullif(trim(p_promotion_name), ''), 'Rifa Visitantes'),
    coalesce(nullif(trim(p_client_raffle_name), ''), 'Rifa Clientas Expo'),
    nullif(trim(p_welcome_text), ''), nullif(trim(p_image_url), ''),
    lower(regexp_replace(trim(p_slug), '[^a-zA-Z0-9]+', '-', 'g')),
    upper(regexp_replace(coalesce(nullif(trim(p_folio_prefix), ''), 'EXPO'), '[^a-zA-Z0-9]', '', 'g')),
    jsonb_build_object('questions', v_questions)
  ) returning * into v_campaign;
  return to_jsonb(v_campaign);
end $$;

create or replace function public.studio_flow_campaign_register(
  p_slug text, p_full_name text, p_whatsapp text, p_email text,
  p_event_type text, p_approximate_event_date date, p_interested_service text,
  p_accepts_promotions boolean default false, p_answers jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_campaign public.registration_campaigns;
  v_participant public.campaign_participants;
  v_folio text;
  v_email text := lower(trim(p_email));
  v_phone text := regexp_replace(p_whatsapp, '\D', '', 'g');
  v_studio_name text;
  v_answers jsonb := coalesce(p_answers, '{}'::jsonb);
  v_question jsonb;
  v_answer jsonb;
  v_option text;
begin
  select * into v_campaign from public.registration_campaigns
  where slug=lower(trim(p_slug)) and status='active' for update;
  if not found then raise exception 'Campaña no disponible'; end if;
  if length(trim(p_full_name)) < 3 or length(v_phone) < 10 or position('@' in v_email) < 2 then raise exception 'Datos de contacto incompletos'; end if;
  if jsonb_typeof(v_answers) <> 'object' or length(v_answers::text) > 12000 then raise exception 'Respuestas inválidas'; end if;

  for v_question in select value from jsonb_array_elements(coalesce(v_campaign.form_config->'questions','[]'::jsonb))
  loop
    v_answer := v_answers->(v_question->>'id');
    if coalesce((v_question->>'required')::boolean, false) and (
      v_answer is null or v_answer = 'null'::jsonb or
      (jsonb_typeof(v_answer)='string' and length(trim(v_answer#>>'{}'))=0) or
      (jsonb_typeof(v_answer)='array' and jsonb_array_length(v_answer)=0)
    ) then raise exception 'Falta responder: %', v_question->>'label'; end if;

    if v_answer is not null and v_answer <> 'null'::jsonb then
      if v_question->>'type'='short' then
        if jsonb_typeof(v_answer)<>'string' or length(v_answer#>>'{}')>300 then raise exception 'Respuesta inválida para: %', v_question->>'label'; end if;
      elsif v_question->>'type'='multiple' then
        if jsonb_typeof(v_answer)<>'array' or jsonb_array_length(v_answer)>20 then raise exception 'Respuesta inválida para: %', v_question->>'label'; end if;
        for v_option in select value from jsonb_array_elements_text(v_answer)
        loop
          if not coalesce((v_question->'options') ? v_option, false) then raise exception 'Opción inválida para: %', v_question->>'label'; end if;
        end loop;
      else
        if jsonb_typeof(v_answer)<>'string' or not coalesce((v_question->'options') ? (v_answer#>>'{}'), false) then raise exception 'Opción inválida para: %', v_question->>'label'; end if;
      end if;
    end if;
  end loop;

  if exists(select 1 from public.campaign_participants where campaign_id=v_campaign.id and lower(trim(email))=v_email) then raise exception 'Este correo electrónico ya está registrado en esta campaña.'; end if;
  if exists(select 1 from public.campaign_participants where campaign_id=v_campaign.id and regexp_replace(whatsapp,'\D','','g')=v_phone) then raise exception 'Este número de celular ya está registrado en esta campaña.'; end if;

  v_folio := v_campaign.folio_prefix || '-' || lpad(v_campaign.next_folio::text,4,'0');
  update public.registration_campaigns set next_folio=next_folio+1,updated_at=now() where id=v_campaign.id;
  insert into public.campaign_participants (
    campaign_id,folio,full_name,whatsapp,email,event_type,approximate_event_date,
    interested_service,accepts_promotions,answers
  ) values (
    v_campaign.id,v_folio,trim(p_full_name),trim(p_whatsapp),v_email,trim(p_event_type),
    p_approximate_event_date,trim(p_interested_service),coalesce(p_accepts_promotions,false),v_answers
  ) returning * into v_participant;

  select coalesce(sp.commercial_name,s.name,ap.artistic_name,a.display_name,'Studio Flow') into v_studio_name
  from public.registration_campaigns c
  left join public.studios s on s.id=c.studio_id left join public.studio_profiles sp on sp.studio_id=s.id
  left join public.artists a on a.id=c.artist_id left join public.artist_profiles ap on ap.artist_id=a.id
  where c.id=v_campaign.id;
  return jsonb_build_object('participantId',v_participant.id,'folio',v_folio,'deliveryToken',v_participant.email_delivery_token,'studioName',v_studio_name);
end $$;

revoke all on function public.studio_flow_campaign_create_for_entity(text,uuid,text,text,date,text,text,text,text,text,text,text,jsonb) from public;
revoke all on function public.studio_flow_campaign_register(text,text,text,text,text,date,text,boolean,jsonb) from public;
revoke execute on function public.studio_flow_campaign_create_for_entity(text,uuid,text,text,date,text,text,text,text,text,text,text) from authenticated;
revoke execute on function public.studio_flow_campaign_register(text,text,text,text,text,date,text,boolean) from anon, authenticated;
grant execute on function public.studio_flow_campaign_create_for_entity(text,uuid,text,text,date,text,text,text,text,text,text,text,jsonb) to authenticated;
grant execute on function public.studio_flow_campaign_register(text,text,text,text,text,date,text,boolean,jsonb) to anon, authenticated;
