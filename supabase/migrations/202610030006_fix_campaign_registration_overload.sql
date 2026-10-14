create or replace function public.studio_flow_campaign_register(
  p_slug text,p_full_name text,p_whatsapp text,p_email text,p_event_type text,
  p_approximate_event_date date,p_interested_service text,p_accepts_promotions boolean default false,
  p_answers jsonb default '{}'::jsonb,p_channel_slug text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_campaign public.registration_campaigns;
  v_participant public.campaign_participants;
  v_channel_id uuid;
  v_folio text;
  v_email text:=lower(trim(p_email));
  v_phone text:=regexp_replace(p_whatsapp,'\D','','g');
  v_studio_name text;
  v_answers jsonb:=coalesce(p_answers,'{}'::jsonb);
  v_question jsonb;
  v_answer jsonb;
  v_option text;
begin
  select * into v_campaign from public.registration_campaigns
  where slug=lower(trim(p_slug)) and status='active' for update;
  if not found then raise exception 'Campaña no disponible'; end if;
  if v_campaign.starts_at is not null and now()<v_campaign.starts_at then raise exception 'Esta campaña aún no inicia.'; end if;
  if v_campaign.ends_at is not null and now()>=v_campaign.ends_at then raise exception 'Esta campaña ha finalizado.'; end if;
  if length(trim(p_full_name))<3 or length(v_phone)<10 or position('@' in v_email)<2 then raise exception 'Datos de contacto incompletos'; end if;
  if jsonb_typeof(v_answers)<>'object' or length(v_answers::text)>12000 then raise exception 'Respuestas inválidas'; end if;
  if jsonb_array_length(coalesce(v_campaign.form_config->'eventTypes','[]'::jsonb))>0
     and not coalesce((v_campaign.form_config->'eventTypes') ? trim(p_event_type),false) then
    raise exception 'Selecciona un tipo de evento válido';
  end if;

  for v_question in select value from jsonb_array_elements(coalesce(v_campaign.form_config->'questions','[]'::jsonb)) loop
    v_answer:=v_answers->(v_question->>'id');
    if coalesce((v_question->>'required')::boolean,false) and (
      v_answer is null or v_answer='null'::jsonb
      or (jsonb_typeof(v_answer)='string' and length(trim(v_answer#>>'{}'))=0)
      or (jsonb_typeof(v_answer)='array' and jsonb_array_length(v_answer)=0)
    ) then raise exception 'Falta responder: %',v_question->>'label'; end if;
    if v_answer is not null and v_answer<>'null'::jsonb then
      if v_question->>'type'='short' then
        if jsonb_typeof(v_answer)<>'string' or length(v_answer#>>'{}')>300 then raise exception 'Respuesta inválida para: %',v_question->>'label'; end if;
      elsif v_question->>'type'='multiple' then
        if jsonb_typeof(v_answer)<>'array' or jsonb_array_length(v_answer)>20 then raise exception 'Respuesta inválida para: %',v_question->>'label'; end if;
        for v_option in select value from jsonb_array_elements_text(v_answer) loop
          if not coalesce((v_question->'options') ? v_option,false) then raise exception 'Opción inválida para: %',v_question->>'label'; end if;
        end loop;
      else
        if jsonb_typeof(v_answer)<>'string' or not coalesce((v_question->'options') ? (v_answer#>>'{}'),false) then raise exception 'Opción inválida para: %',v_question->>'label'; end if;
      end if;
    end if;
  end loop;

  if nullif(trim(coalesce(p_channel_slug,'')),'') is not null then
    select id into v_channel_id from public.campaign_channels where campaign_id=v_campaign.id and slug=lower(trim(p_channel_slug));
    if v_channel_id is null then raise exception 'Canal de campaña inválido'; end if;
  end if;
  if exists(select 1 from public.campaign_participants where campaign_id=v_campaign.id and lower(trim(email))=v_email) then raise exception 'Este correo electrónico ya está registrado en esta campaña.'; end if;
  if exists(select 1 from public.campaign_participants where campaign_id=v_campaign.id and regexp_replace(whatsapp,'\D','','g')=v_phone) then raise exception 'Este número de celular ya está registrado en esta campaña.'; end if;

  v_folio:=v_campaign.folio_prefix||'-'||lpad(v_campaign.next_folio::text,4,'0');
  update public.registration_campaigns set next_folio=next_folio+1,updated_at=now() where id=v_campaign.id;
  insert into public.campaign_participants(
    campaign_id,folio,full_name,whatsapp,email,event_type,approximate_event_date,
    interested_service,accepts_promotions,answers,source_channel_id
  ) values(
    v_campaign.id,v_folio,trim(p_full_name),trim(p_whatsapp),v_email,trim(p_event_type),
    p_approximate_event_date,trim(p_interested_service),coalesce(p_accepts_promotions,false),v_answers,v_channel_id
  ) returning * into v_participant;

  select coalesce(sp.commercial_name,s.name,ap.artistic_name,a.display_name,'Studio Flow') into v_studio_name
  from public.registration_campaigns c
  left join public.studios s on s.id=c.studio_id left join public.studio_profiles sp on sp.studio_id=s.id
  left join public.artists a on a.id=c.artist_id left join public.artist_profiles ap on ap.artist_id=a.id
  where c.id=v_campaign.id;
  return jsonb_build_object('participantId',v_participant.id,'folio',v_folio,'deliveryToken',v_participant.email_delivery_token,'studioName',v_studio_name);
end $$;

revoke all on function public.studio_flow_campaign_register(text,text,text,text,text,date,text,boolean,jsonb,text) from public;
grant execute on function public.studio_flow_campaign_register(text,text,text,text,text,date,text,boolean,jsonb,text) to anon,authenticated;
