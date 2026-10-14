create or replace function public.studio_flow_campaign_create_for_entity(
  p_entity_type text,p_entity_id uuid,p_name text,p_event_name text,p_event_date date,
  p_starts_at timestamptz,p_ends_at timestamptz,
  p_description text,p_promotion_name text,p_client_raffle_name text,p_welcome_text text,
  p_image_url text,p_slug text,p_folio_prefix text,p_form_config jsonb default '{}'::jsonb,
  p_channels jsonb default '[]'::jsonb,p_raffles jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_campaign public.registration_campaigns;
  v_questions jsonb := coalesce(p_form_config->'questions','[]'::jsonb);
  v_question jsonb;
  v_options jsonb;
  v_item jsonb;
  v_channel_id uuid;
  v_position integer := 0;
begin
  if p_entity_type='studio' and not public.studio_flow_is_studio_owner(p_entity_id) then raise exception 'Studio owner access required'; end if;
  if p_entity_type='artist' and not public.studio_flow_is_artist_owner(p_entity_id) then raise exception 'Artist access required'; end if;
  if p_entity_type not in ('studio','artist') then raise exception 'Invalid campaign owner'; end if;
  if p_starts_at is null or p_ends_at is null then raise exception 'Indica la fecha y hora de inicio y término de la campaña.'; end if;
  if p_ends_at<=p_starts_at then raise exception 'La fecha y hora de término debe ser posterior al inicio.'; end if;

  if jsonb_typeof(v_questions)<>'array' or jsonb_array_length(v_questions)>20 then raise exception 'El formulario admite hasta 20 preguntas'; end if;
  for v_question in select value from jsonb_array_elements(v_questions) loop
    if coalesce(length(trim(v_question->>'id')),0)<3 or coalesce(length(trim(v_question->>'label')),0)<3 then raise exception 'Cada pregunta necesita un título'; end if;
    if v_question->>'type' not in ('single','multiple','short','dichotomous') then raise exception 'Tipo de pregunta inválido'; end if;
    if v_question->>'type'<>'short' then
      v_options:=coalesce(v_question->'options','[]'::jsonb);
      if jsonb_typeof(v_options)<>'array' or jsonb_array_length(v_options)<2 or jsonb_array_length(v_options)>20 then raise exception 'Cada pregunta de opciones necesita entre 2 y 20 respuestas'; end if;
    end if;
  end loop;

  if jsonb_typeof(coalesce(p_channels,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_channels,'[]'::jsonb))>12 then raise exception 'Puedes agregar hasta 12 canales'; end if;
  if jsonb_typeof(coalesce(p_raffles,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_raffles,'[]'::jsonb))<1 or jsonb_array_length(coalesce(p_raffles,'[]'::jsonb))>12 then raise exception 'Agrega entre 1 y 12 premios'; end if;

  insert into public.registration_campaigns(
    studio_id,artist_id,name,event_name,event_date,starts_at,ends_at,description,
    promotion_name,client_raffle_name,welcome_text,image_url,slug,folio_prefix,form_config
  ) values(
    case when p_entity_type='studio' then p_entity_id end,
    case when p_entity_type='artist' then p_entity_id end,
    trim(p_name),trim(p_event_name),p_event_date,p_starts_at,p_ends_at,nullif(trim(p_description),''),
    coalesce(nullif(trim(p_promotion_name),''),'Rifa Visitantes'),
    coalesce(nullif(trim(p_client_raffle_name),''),'Rifa Clientas Expo'),
    nullif(trim(p_welcome_text),''),nullif(trim(p_image_url),''),
    lower(regexp_replace(trim(p_slug),'[^a-zA-Z0-9]+','-','g')),
    upper(regexp_replace(coalesce(nullif(trim(p_folio_prefix),''),'EXPO'),'[^a-zA-Z0-9]','','g')),
    p_form_config || jsonb_build_object('questions',v_questions)
  ) returning * into v_campaign;

  v_position:=0;
  for v_item in select value from jsonb_array_elements(coalesce(p_channels,'[]'::jsonb)) loop
    if length(trim(v_item->>'name'))<2 or length(trim(v_item->>'slug'))<1 then raise exception 'Cada canal necesita un nombre'; end if;
    insert into public.campaign_channels(campaign_id,name,slug,position)
    values(v_campaign.id,left(trim(v_item->>'name'),80),lower(trim(v_item->>'slug')),v_position);
    v_position:=v_position+1;
  end loop;

  v_position:=0;
  for v_item in select value from jsonb_array_elements(p_raffles) loop
    if length(trim(v_item->>'name'))<3 then raise exception 'Cada premio necesita un nombre'; end if;
    if coalesce(v_item->>'groupType','all') not in ('all','channel','hired') then raise exception 'Grupo de sorteo inválido'; end if;
    v_channel_id:=null;
    if v_item->>'groupType'='channel' then
      select id into v_channel_id from public.campaign_channels where campaign_id=v_campaign.id and slug=v_item->>'channelSlug';
      if v_channel_id is null then raise exception 'Selecciona un canal válido para el premio'; end if;
    end if;
    insert into public.campaign_raffles(campaign_id,name,group_type,channel_id,winner_count,allow_repeat,position)
    values(v_campaign.id,left(trim(v_item->>'name'),160),coalesce(v_item->>'groupType','all'),v_channel_id,
      least(20,greatest(1,coalesce((v_item->>'winnerCount')::integer,1))),coalesce((v_item->>'allowRepeat')::boolean,false),v_position);
    v_position:=v_position+1;
  end loop;

  return to_jsonb(v_campaign);
end $$;

revoke all on function public.studio_flow_campaign_create_for_entity(text,uuid,text,text,date,timestamptz,timestamptz,text,text,text,text,text,text,text,jsonb,jsonb,jsonb) from public;
grant execute on function public.studio_flow_campaign_create_for_entity(text,uuid,text,text,date,timestamptz,timestamptz,text,text,text,text,text,text,text,jsonb,jsonb,jsonb) to authenticated;
