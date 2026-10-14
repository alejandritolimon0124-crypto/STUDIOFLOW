create function public.studio_flow_artist_create_manual_appointment_private_email(
  p_client_first_name text,p_client_last_name text,p_client_phone text,p_client_email text,
  p_service_offering_id uuid,p_date date,p_time time,p_notes text default null,
  p_context_type text default 'artist',p_membership_id uuid default null
) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_result jsonb; v_email text:=lower(trim(coalesce(p_client_email,'')));
declare v_guest public.clients%rowtype; v_claim_email text; v_appointment_id uuid;
begin
  if v_email<>'' and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Escribe un correo válido o déjalo vacío.';
  end if;
  if v_email<>'' and exists(select 1 from public.clients c
    join public.profiles p on p.id=c.profile_id
    where lower(trim(c.email))=v_email
      and public.studio_flow_phone_key(coalesce(nullif(c.phone,''),p.phone))
        <>public.studio_flow_phone_key(p_client_phone)) then
    raise exception 'El correo no coincide con el teléfono de esa cuenta. Confirma los datos con la clienta.';
  end if;
  v_result:=public.studio_flow_artist_create_manual_appointment_private(
    p_client_first_name,p_client_last_name,p_client_phone,p_service_offering_id,
    p_date,p_time,p_notes,p_context_type,p_membership_id);
  if v_email='' or coalesce((v_result->>'requiresConfirmation')::boolean,false) then
    return v_result;
  end if;
  v_appointment_id:=(v_result->'appointment'->>'id')::uuid;
  select c.* into v_guest from public.appointments a join public.clients c on c.id=a.client_id
    where a.id=v_appointment_id and c.profile_id is null;
  if v_guest.id is null then return v_result; end if;
  if nullif(trim(v_guest.email),'') is not null and lower(trim(v_guest.email))<>v_email then
    raise exception 'El correo no coincide con el contacto existente de esta clienta.';
  end if;
  select contact_email into v_claim_email from public.studio_flow_guest_booking_claims
    where guest_client_id=v_guest.id;
  if v_claim_email is not null and v_claim_email<>v_email then
    raise exception 'El correo no coincide con el contacto existente de esta clienta.';
  end if;
  insert into public.studio_flow_guest_booking_claims(guest_client_id,contact_email)
    values(v_guest.id,v_email) on conflict(guest_client_id) do nothing;
  perform public.studio_flow_queue_guest_booking_email(v_appointment_id,v_email);
  return v_result||jsonb_build_object('emailQueued',true);
end $$;
revoke all on function public.studio_flow_artist_create_manual_appointment_private_email(text,text,text,text,uuid,date,time,text,text,uuid)
  from public,anon;
grant execute on function public.studio_flow_artist_create_manual_appointment_private_email(text,text,text,text,uuid,date,time,text,text,uuid)
  to authenticated;
revoke execute on function public.studio_flow_artist_create_manual_appointment_private(text,text,text,uuid,date,time,text,text,uuid)
  from public,anon,authenticated;
