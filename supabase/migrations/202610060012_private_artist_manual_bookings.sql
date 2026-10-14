begin;

alter table public.studio_flow_pending_manual_bookings
  alter column studio_id drop not null;
alter table public.studio_flow_pending_manual_bookings
  add column artist_id uuid references public.artists(id);
alter table public.studio_flow_pending_manual_bookings
  add constraint studio_flow_pending_manual_context_check
  check (studio_id is not null or artist_id is not null);
create index studio_flow_pending_manual_artist_idx
  on public.studio_flow_pending_manual_bookings(artist_id,status,created_at desc);

create function public.studio_flow_artist_create_manual_appointment_private(
  p_client_first_name text,p_client_last_name text,p_client_phone text,
  p_service_offering_id uuid,p_date date,p_time time,p_notes text default null,
  p_context_type text default 'artist',p_membership_id uuid default null
) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_context jsonb; v_match clients%rowtype; v_guest clients%rowtype;
declare v_result jsonb; v_appointment_id uuid; v_artist_id uuid; v_studio_id uuid;
declare v_name text; v_business_name text; v_expires_at timestamptz;
begin
  v_context:=public.studio_flow_artist_assert_service_in_context(
    p_service_offering_id,p_context_type,p_membership_id);
  if nullif(trim(coalesce(p_client_first_name,'')),'') is null
    or nullif(trim(coalesce(p_client_last_name,'')),'') is null
    or length(public.studio_flow_phone_key(p_client_phone))<>10 then
    raise exception 'Escribe nombre, apellido y teléfono de diez dígitos.';
  end if;
  v_name:=trim(p_client_first_name)||' '||trim(p_client_last_name);
  v_artist_id:=(v_context->>'artist_id')::uuid;
  v_studio_id:=(v_context->>'studio_id')::uuid;
  select * into v_match from public.clients c
    where c.status='active' and c.archived_at is null
      and public.studio_flow_phone_key(c.phone)=public.studio_flow_phone_key(p_client_phone)
    order by case when c.profile_id is not null then 0 else 1 end,c.created_at desc limit 1;
  if v_match.id is not null and public.studio_flow_artist_client_has_context_access(
      v_match.id,p_context_type,p_membership_id) then
    return public.studio_flow_artist_create_manual_appointment_core(
      v_match.id,p_service_offering_id,p_date,p_time,p_notes);
  end if;
  if v_match.id is null then
    return public.studio_flow_artist_create_manual_appointment(
      p_client_first_name,p_client_last_name,p_client_phone,p_service_offering_id,
      p_date,p_time,p_notes,p_context_type,p_membership_id);
  end if;
  if v_match.profile_id is null or not exists(
    select 1 from public.profiles p where p.id=v_match.profile_id and p.status='active') then
    insert into public.clients(display_name,phone)
      values(v_name,trim(p_client_phone)) returning * into v_guest;
    return public.studio_flow_artist_create_manual_appointment_core(
      v_guest.id,p_service_offering_id,p_date,p_time,p_notes);
  end if;
  if (select count(*) from public.studio_flow_pending_manual_bookings
      where artist_id=v_artist_id and created_at>now()-interval '1 day')>=100 then
    raise exception 'Límite temporal de solicitudes. Comunícate con soporte de Studio Flow.';
  end if;
  if (select count(*) from public.studio_flow_pending_manual_bookings
      where artist_id=v_artist_id and target_client_id=v_match.id
        and created_at>now()-interval '1 day')>=3 then
    raise exception 'Ya se enviaron varias solicitudes para este contacto. Intenta más tarde.';
  end if;
  insert into public.clients(display_name) values(v_name) returning * into v_guest;
  v_result:=public.studio_flow_artist_create_manual_appointment_core(
    v_guest.id,p_service_offering_id,p_date,p_time,p_notes);
  v_appointment_id:=(v_result->'appointment'->>'id')::uuid;
  select least(now()+interval '24 hours',greatest(now()+interval '2 hours',a.starts_at+interval '1 hour'))
    into v_expires_at from public.appointments a where a.id=v_appointment_id;
  insert into public.studio_flow_pending_manual_bookings(
    appointment_id,studio_id,artist_id,target_client_id,guest_client_id,expires_at)
    values(v_appointment_id,v_studio_id,v_artist_id,v_match.id,v_guest.id,v_expires_at);
  select coalesce(sp.commercial_name,s.name,ap.artistic_name,ar.display_name,'Studio Flow')
    into v_business_name from public.artists ar
    left join public.artist_profiles ap on ap.artist_id=ar.id
    left join public.studios s on s.id=v_studio_id
    left join public.studio_profiles sp on sp.studio_id=s.id
    where ar.id=v_artist_id;
  insert into public.client_notifications(
    client_id,artist_id,studio_id,notification_type,title,body,metadata)
    values(v_match.id,v_artist_id,v_studio_id,'manual_booking','¿Te agendaron una cita?',
      v_business_name||' apartó un horario a tu nombre. Confirma si solicitaste esta cita.',
      jsonb_build_object('targetUrl','/client'));
  return v_result||jsonb_build_object('requiresConfirmation',true);
end $$;
revoke all on function public.studio_flow_artist_create_manual_appointment_private(text,text,text,uuid,date,time,text,text,uuid) from public,anon;
grant execute on function public.studio_flow_artist_create_manual_appointment_private(text,text,text,uuid,date,time,text,text,uuid) to authenticated;
revoke execute on function public.studio_flow_artist_create_manual_appointment(text,text,text,uuid,date,time,text,text,uuid)
  from public,anon,authenticated;
revoke execute on function public.studio_flow_artist_create_manual_appointment_core(uuid,uuid,date,time,text)
  from public,anon,authenticated;
revoke execute on function public.studio_flow_artist_get_clients(text,integer)
  from public,anon,authenticated;
revoke execute on function public.studio_flow_artist_create_manual_appointment(text,text,text,uuid,date,time,text)
  from public,anon,authenticated;
revoke execute on function public.studio_flow_artist_create_manual_appointment_for_client(uuid,uuid,date,time,text)
  from public,anon,authenticated;

create or replace function public.studio_flow_client_pending_manual_bookings()
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_client_id uuid; v_result jsonb;
begin
  select c.id into v_client_id from public.clients c join public.profiles p on p.id=c.profile_id
    where c.profile_id=auth.uid() and c.status='active' and c.archived_at is null and p.status='active';
  if v_client_id is null then raise exception 'Se requiere una cuenta de clienta activa'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'studio',coalesce(sp.commercial_name,s.name,ap.artistic_name,ar.display_name,'Studio Flow'),
    'service',so.name,'startsAt',a.starts_at,'expiresAt',r.expires_at)
    order by a.starts_at),'[]'::jsonb) into v_result
  from public.studio_flow_pending_manual_bookings r
  join public.appointments a on a.id=r.appointment_id
  left join public.studios s on s.id=r.studio_id
  left join public.studio_profiles sp on sp.studio_id=s.id
  left join public.artists ar on ar.id=r.artist_id
  left join public.artist_profiles ap on ap.artist_id=ar.id
  join public.service_offerings so on so.id=a.service_offering_id
  where r.target_client_id=v_client_id and r.status='pending' and r.expires_at>now()
    and a.status='scheduled';
  return jsonb_build_object('requests',v_result);
end $$;

create or replace function public.studio_flow_client_respond_manual_booking(p_request_id uuid,p_accept boolean)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_client_id uuid; v_request public.studio_flow_pending_manual_bookings%rowtype;
declare v_appointment public.appointments%rowtype;
begin
  select c.id into v_client_id from public.clients c join public.profiles p on p.id=c.profile_id
    where c.profile_id=auth.uid() and c.status='active' and c.archived_at is null and p.status='active';
  if v_client_id is null then raise exception 'Se requiere una cuenta de clienta activa'; end if;
  select * into v_request from public.studio_flow_pending_manual_bookings
    where id=p_request_id and target_client_id=v_client_id for update;
  if v_request.id is null or v_request.status<>'pending' or v_request.expires_at<=now() then
    raise exception 'Esta solicitud ya no está disponible';
  end if;
  select * into v_appointment from public.appointments where id=v_request.appointment_id for update;
  if v_appointment.status<>'scheduled' then raise exception 'Esta cita ya no está activa'; end if;
  if p_accept then
    update public.appointments set client_id=v_client_id,updated_at=now()
      where id=v_appointment.id;
    if v_request.studio_id is not null then
      perform public.studio_flow_upsert_customer_relationship(
        v_client_id,'studio',null,v_request.studio_id,null,'appointment','active',v_appointment.starts_at);
      if v_appointment.membership_id is not null then
        perform public.studio_flow_upsert_customer_relationship(
          v_client_id,'membership',null,null,v_appointment.membership_id,'appointment','active',v_appointment.starts_at);
      end if;
    else
      perform public.studio_flow_upsert_customer_relationship(
        v_client_id,'artist',v_appointment.artist_id,null,null,'appointment','active',v_appointment.starts_at);
    end if;
    update public.studio_flow_pending_manual_bookings set status='accepted',resolved_at=now()
      where id=v_request.id;
  else
    update public.appointments set status='cancelled',cancelled_at=now(),updated_at=now()
      where id=v_appointment.id;
    update public.availability_slots set status='available',held_by_profile_id=null,held_until=null,updated_at=now()
      where artist_id=v_appointment.artist_id
        and studio_id is not distinct from v_appointment.studio_id
        and membership_id is not distinct from v_appointment.membership_id
        and starts_at>=v_appointment.starts_at and starts_at<v_appointment.ends_at and status='booked';
    insert into public.appointment_status_events(appointment_id,from_status,to_status,reason,changed_by_profile_id)
      values(v_appointment.id,'scheduled','cancelled','client_rejected_private_manual_booking',auth.uid());
    update public.studio_flow_pending_manual_bookings set status='rejected',resolved_at=now()
      where id=v_request.id;
  end if;
  return jsonb_build_object('status',case when p_accept then 'accepted' else 'rejected' end);
end $$;

create or replace function public.studio_flow_expire_pending_manual_bookings()
returns integer language plpgsql security definer set search_path=public,auth as $$
declare v_request public.studio_flow_pending_manual_bookings%rowtype;
declare v_appointment public.appointments%rowtype; v_count integer:=0;
begin
  for v_request in select * from public.studio_flow_pending_manual_bookings
    where status='pending' and expires_at<=now() for update skip locked loop
    select * into v_appointment from public.appointments where id=v_request.appointment_id for update;
    if v_appointment.status='scheduled' then
      update public.appointments set status='cancelled',cancelled_at=now(),updated_at=now()
        where id=v_appointment.id;
      update public.availability_slots set status='available',held_by_profile_id=null,held_until=null,updated_at=now()
        where artist_id=v_appointment.artist_id
          and studio_id is not distinct from v_appointment.studio_id
          and membership_id is not distinct from v_appointment.membership_id
          and starts_at>=v_appointment.starts_at and starts_at<v_appointment.ends_at and status='booked';
      insert into public.appointment_status_events(appointment_id,from_status,to_status,reason)
        values(v_appointment.id,'scheduled','cancelled','private_manual_booking_expired');
    end if;
    update public.studio_flow_pending_manual_bookings set status='expired',resolved_at=now()
      where id=v_request.id;
    v_count:=v_count+1;
  end loop;
  return v_count;
end $$;

create function public.studio_flow_artist_pending_manual_bookings(
  p_context_type text default 'artist',p_membership_id uuid default null
) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_context jsonb; v_result jsonb;
begin
  v_context:=public.studio_flow_artist_assert_work_context(p_context_type,p_membership_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'appointmentId',r.appointment_id,'expiresAt',r.expires_at)),'[]'::jsonb)
    into v_result from public.studio_flow_pending_manual_bookings r
    join public.appointments a on a.id=r.appointment_id
    where r.artist_id=(v_context->>'artist_id')::uuid
      and r.studio_id is not distinct from (v_context->>'studio_id')::uuid
      and a.membership_id is not distinct from (v_context->>'membership_id')::uuid
      and r.status='pending' and r.expires_at>now() and a.status='scheduled';
  return v_result;
end $$;
revoke all on function public.studio_flow_artist_pending_manual_bookings(text,uuid) from public,anon;
grant execute on function public.studio_flow_artist_pending_manual_bookings(text,uuid) to authenticated;

create function public.studio_flow_artist_pending_manual_booking_ids(p_artist_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_result jsonb;
begin
  if not exists(select 1 from public.artists a join public.profiles p on p.id=a.profile_id
    where a.id=p_artist_id and a.profile_id=auth.uid() and p.status='active'
      and a.status='active' and a.archived_at is null) then
    raise exception 'Artista activa requerida';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'appointmentId',r.appointment_id,'expiresAt',r.expires_at)),'[]'::jsonb)
    into v_result from public.studio_flow_pending_manual_bookings r
    join public.appointments a on a.id=r.appointment_id
    where r.artist_id=p_artist_id and r.status='pending'
      and r.expires_at>now() and a.status='scheduled';
  return v_result;
end $$;
revoke all on function public.studio_flow_artist_pending_manual_booking_ids(uuid) from public,anon;
grant execute on function public.studio_flow_artist_pending_manual_booking_ids(uuid) to authenticated;

commit;
