create or replace function public.studio_flow_public_book_google_reservation(
  p_listing_id uuid,
  p_availability_slot_ids uuid[],
  p_service_offering_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_notes text default null
) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare
  v_listing marketplace_listings%rowtype;
  v_marketplace_profile marketplace_profiles%rowtype;
  v_membership artist_studio_memberships%rowtype;
  v_service service_offerings%rowtype;
  v_client clients%rowtype;
  v_appointment appointments%rowtype;
  v_slot_ids uuid[];
  v_expected integer;
  v_count integer;
  v_artist_id uuid;
  v_studio_id uuid;
  v_membership_id uuid;
  v_target_artist_id uuid;
  v_target_studio_id uuid;
  v_target_membership_id uuid;
  v_schedule_id uuid;
  v_first_slot_id uuid;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_has_gap boolean;
  v_name text := trim(coalesce(p_name, ''));
  v_email text := lower(trim(coalesce(p_email, '')));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
begin
  if length(v_name) < 3 or length(v_name) > 120 then raise exception 'Escribe tu nombre completo.'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Escribe un correo valido.'; end if;
  if length(regexp_replace(v_phone, '[^0-9]', '', 'g')) < 10 then raise exception 'Escribe un celular valido.'; end if;
  if p_listing_id is null or p_service_offering_id is null then raise exception 'Perfil y servicio requeridos.'; end if;

  select ml.* into v_listing from marketplace_listings ml
  join marketplace_profiles mp on mp.id=ml.marketplace_profile_id
  where ml.id=p_listing_id and ml.visibility_status='visible' and mp.visibility_status='visible'
    and (ml.expires_at is null or ml.expires_at>now());
  if v_listing.id is null then raise exception 'El perfil ya no esta disponible.'; end if;
  select * into v_marketplace_profile from marketplace_profiles where id=v_listing.marketplace_profile_id;
  if coalesce(v_listing.membership_id,v_marketplace_profile.membership_id) is not null then
    select * into v_membership from artist_studio_memberships
    where id=coalesce(v_listing.membership_id,v_marketplace_profile.membership_id)
      and status='active' and archived_at is null;
  end if;
  v_artist_id:=coalesce(v_listing.artist_id,v_marketplace_profile.artist_id,v_membership.artist_id);
  v_studio_id:=coalesce(v_listing.studio_id,v_marketplace_profile.studio_id,v_membership.studio_id);
  v_membership_id:=coalesce(v_listing.membership_id,v_marketplace_profile.membership_id,v_membership.id);
  v_target_artist_id:=v_artist_id;
  v_target_studio_id:=v_studio_id;
  v_target_membership_id:=v_membership_id;

  select * into v_service from service_offerings
  where id=p_service_offering_id and status='active' and archived_at is null;
  if v_service.id is null then raise exception 'El servicio ya no esta disponible.'; end if;
  if not (
    (v_service.owner_type='artist' and v_service.artist_id=v_artist_id)
    or (v_service.owner_type='studio' and v_service.studio_id=v_studio_id)
    or (v_service.owner_type='membership' and v_service.membership_id=v_membership_id)
  ) then raise exception 'El servicio no pertenece a este perfil.'; end if;

  select array_agg(distinct x order by x) into v_slot_ids from unnest(p_availability_slot_ids) x where x is not null;
  v_expected:=coalesce(array_length(v_slot_ids,1),0);
  if v_expected=0 then raise exception 'Selecciona un horario.'; end if;

  perform 1 from availability_slots where id=any(v_slot_ids) order by starts_at for update;
  select count(*),min(starts_at),max(ends_at)
  into v_count,v_starts_at,v_ends_at
  from availability_slots where id=any(v_slot_ids) and status='available' and starts_at>=now();
  if v_count<>v_expected then raise exception 'Ese horario ya no esta disponible.'; end if;
  select id,artist_id,studio_id,membership_id,schedule_id
  into v_first_slot_id,v_artist_id,v_studio_id,v_membership_id,v_schedule_id
  from availability_slots where id=any(v_slot_ids) order by starts_at,id limit 1;
  if exists(select 1 from availability_slots s where s.id=any(v_slot_ids) and (
    s.artist_id is distinct from v_artist_id or s.studio_id is distinct from v_studio_id
    or s.membership_id is distinct from v_membership_id or s.schedule_id is distinct from v_schedule_id
  )) then raise exception 'Los bloques del horario no son compatibles.'; end if;
  if v_artist_id is distinct from v_target_artist_id
    or (v_target_studio_id is not null and v_studio_id is distinct from v_target_studio_id)
    or (v_target_membership_id is not null and v_membership_id is distinct from v_target_membership_id)
  then raise exception 'El horario no pertenece a este perfil.'; end if;
  select coalesce(bool_or(next_start is not null and next_start<>ends_at),false) into v_has_gap
  from (select ends_at,lead(starts_at) over(order by starts_at) next_start from availability_slots where id=any(v_slot_ids)) ordered;
  if v_has_gap or v_ends_at<v_starts_at+make_interval(mins=>v_service.duration_minutes) then raise exception 'El horario no cubre la duracion del servicio.'; end if;
  if not public.studio_flow_slot_obeys_booking_rules(v_first_slot_id,v_ends_at) then raise exception 'Ese horario ya no cumple las reglas de la agenda.'; end if;

  if (select count(*) from appointments a join clients c on c.id=a.client_id
      where a.booking_source='google' and a.status='scheduled' and a.starts_at>now()
        and (lower(c.email)=v_email or regexp_replace(c.phone,'[^0-9+]','','g')=v_phone))>=3 then
    raise exception 'Ya existen varias reservas activas con estos datos. Contacta al negocio.';
  end if;
  if exists(select 1 from appointments a join clients c on c.id=a.client_id
      where a.booking_source='google' and a.status='scheduled' and a.artist_id=v_artist_id
        and a.service_offering_id=v_service.id and a.starts_at=v_starts_at
        and (lower(c.email)=v_email or regexp_replace(c.phone,'[^0-9+]','','g')=v_phone)) then
    raise exception 'Esta reserva ya fue registrada.';
  end if;

  select * into v_client from clients where profile_id is null and status='active'
    and (lower(email)=v_email or regexp_replace(phone,'[^0-9+]','','g')=v_phone)
    order by created_at limit 1 for update;
  if v_client.id is null then
    insert into clients(display_name,email,phone,status) values(v_name,v_email,v_phone,'active') returning * into v_client;
  else
    update clients set display_name=v_name,email=v_email,phone=v_phone,updated_at=now() where id=v_client.id returning * into v_client;
  end if;

  insert into appointments(client_id,artist_id,studio_id,membership_id,service_offering_id,
    availability_slot_id,marketplace_listing_id,starts_at,ends_at,status,booking_source,client_notes)
  values(v_client.id,v_artist_id,v_studio_id,v_membership_id,v_service.id,v_first_slot_id,v_listing.id,
    v_starts_at,v_ends_at,'scheduled','google',nullif(trim(p_notes),'')) returning * into v_appointment;
  insert into appointment_status_events(appointment_id,from_status,to_status,reason)
  values(v_appointment.id,null,'scheduled','public_google_booking_created');
  update availability_slots set status='booked',held_by_profile_id=null,held_until=null,updated_at=now() where id=any(v_slot_ids);

  return jsonb_build_object('appointmentId',v_appointment.id,'date',to_char(v_starts_at at time zone 'America/Mexico_City','YYYY-MM-DD'),
    'time',to_char(v_starts_at at time zone 'America/Mexico_City','HH24:MI'),'bookingSource','google','service',v_service.name);
end;
$$;

revoke all on function public.studio_flow_public_book_google_reservation(uuid,uuid[],uuid,text,text,text,text) from public;
grant execute on function public.studio_flow_public_book_google_reservation(uuid,uuid[],uuid,text,text,text,text) to anon;

create or replace function public.studio_flow_artist_cancel_appointment(p_appointment_id uuid) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare a appointments%rowtype;
begin
  if auth.uid() is null then raise exception 'Sesion requerida.'; end if;
  select * into a from appointments where id=p_appointment_id for update;
  if a.id is null then raise exception 'Cita no encontrada.'; end if;
  if not (
    exists(select 1 from artists ar where ar.id=a.artist_id and ar.profile_id=auth.uid() and ar.status='active' and ar.archived_at is null)
    or exists(select 1 from studios s where s.id=a.studio_id and s.owner_profile_id=auth.uid() and s.archived_at is null)
    or exists(select 1 from user_role_assignments u join roles r on r.id=u.role_id where u.profile_id=auth.uid() and u.status='active' and u.studio_id=a.studio_id and r.code in ('studio_owner','studio_manager'))
  ) then raise exception 'No tienes permiso para cancelar esta cita.'; end if;
  if a.status='cancelled' then return jsonb_build_object('id',a.id,'status','cancelled'); end if;
  if a.status<>'scheduled' then raise exception 'Solo se pueden cancelar citas activas.'; end if;
  update appointments set status='cancelled',cancelled_at=now(),updated_at=now() where id=a.id;
  update availability_slots set status='available',held_by_profile_id=null,held_until=null,updated_at=now()
    where artist_id=a.artist_id and studio_id is not distinct from a.studio_id and membership_id is not distinct from a.membership_id
      and starts_at>=a.starts_at and ends_at<=a.ends_at and status='booked';
  insert into appointment_status_events(appointment_id,from_status,to_status,reason,changed_by_profile_id)
    values(a.id,a.status,'cancelled','provider_cancelled_appointment',auth.uid());
  return jsonb_build_object('id',a.id,'status','cancelled');
end;
$$;
revoke all on function public.studio_flow_artist_cancel_appointment(uuid) from public;
grant execute on function public.studio_flow_artist_cancel_appointment(uuid) to authenticated;
