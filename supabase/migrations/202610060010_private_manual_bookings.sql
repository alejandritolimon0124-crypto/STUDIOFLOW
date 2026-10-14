begin;

create table public.studio_flow_pending_manual_bookings (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.appointments(id),
  studio_id uuid not null references public.studios(id),
  target_client_id uuid not null references public.clients(id),
  guest_client_id uuid not null references public.clients(id),
  status text not null default 'pending' check (status in ('pending','accepted','rejected','expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index studio_flow_pending_manual_client_idx
  on public.studio_flow_pending_manual_bookings(target_client_id,status,created_at desc);
alter table public.studio_flow_pending_manual_bookings enable row level security;
revoke all on public.studio_flow_pending_manual_bookings from public,anon,authenticated;

create table public.studio_flow_guest_booking_claims (
  guest_client_id uuid primary key references public.clients(id),
  contact_email text not null,
  created_at timestamptz not null default now()
);
alter table public.studio_flow_guest_booking_claims enable row level security;
revoke all on public.studio_flow_guest_booking_claims from public,anon,authenticated;

alter table public.client_notifications drop constraint if exists client_notifications_type_check;
alter table public.client_notifications add constraint client_notifications_type_check
  check (notification_type in ('birthday','reactivation','maintenance','double_points','happy_hour','flow_points','campaign','manual_booking'));

create or replace function public.studio_flow_owner_client_related(p_studio_id uuid,p_client_id uuid)
returns boolean language sql stable security definer set search_path=public,auth as $$
  select exists(select 1 from public.appointments a
    where a.studio_id=p_studio_id and a.client_id=p_client_id)
    or exists(select 1 from public.customer_relationships r
      where r.client_id=p_client_id and r.status='active'
        and (r.scope_type='studio' and r.studio_id=p_studio_id
          or r.scope_type='membership' and exists(
            select 1 from public.artist_studio_memberships m
            where m.id=r.membership_id and m.studio_id=p_studio_id)));
$$;
revoke all on function public.studio_flow_owner_client_related(uuid,uuid) from public,anon,authenticated;

create or replace function public.studio_flow_owner_find_existing_client(
  p_studio_id uuid,p_phone text default null,p_email text default null
) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_client clients%rowtype;
begin
  perform public.studio_flow_owner_assert_studio_access(p_studio_id);
  if length(public.studio_flow_phone_key(p_phone))<>10
    and nullif(trim(coalesce(p_email,'')),'') is null then return null; end if;
  select * into v_client from clients c
  where c.status='active' and c.archived_at is null
    and public.studio_flow_owner_client_related(p_studio_id,c.id)
    and ((length(public.studio_flow_phone_key(p_phone))=10
      and public.studio_flow_phone_key(c.phone)=public.studio_flow_phone_key(p_phone))
      or (nullif(trim(coalesce(p_email,'')),'') is not null
      and lower(trim(c.email))=lower(trim(p_email))))
  order by c.created_at desc limit 1;
  if v_client.id is null then return null; end if;
  return jsonb_build_object('id',v_client.id,'display_name',v_client.display_name,
    'phone',v_client.phone,'email',v_client.email,'status',v_client.status);
end $$;

create function public.studio_flow_owner_search_clients(
  p_studio_id uuid,p_query text,p_limit integer default 5
) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_query text:=lower(trim(coalesce(p_query,''))); v_result jsonb;
begin
  perform public.studio_flow_owner_assert_studio_access(p_studio_id);
  if length(v_query)<2 then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'display_name',c.display_name,'phone',c.phone,'email',c.email,'status',c.status)
    order by c.display_name),'[]'::jsonb) into v_result
  from (select * from public.clients c
    where c.status='active' and c.archived_at is null
      and public.studio_flow_owner_client_related(p_studio_id,c.id)
      and (lower(c.display_name) like '%'||v_query||'%'
        or lower(coalesce(c.email,'')) like '%'||v_query||'%'
        or (length(public.studio_flow_phone_key(v_query))>=4
          and public.studio_flow_phone_key(c.phone) like '%'||public.studio_flow_phone_key(v_query)||'%'))
    order by c.display_name limit greatest(1,least(coalesce(p_limit,5),10))) c;
  return v_result;
end $$;
revoke all on function public.studio_flow_owner_search_clients(uuid,text,integer) from public,anon;
grant execute on function public.studio_flow_owner_search_clients(uuid,text,integer) to authenticated;

create or replace function public.studio_flow_owner_create_manual_appointment_checked(
  p_studio_id uuid,p_membership_id uuid,p_service_offering_id uuid,
  p_availability_slot_id uuid,p_client_id uuid default null,
  p_client_name text default null,p_client_phone text default null,
  p_client_email text default null,p_notes text default null
) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare
  v_match clients%rowtype;
  v_guest clients%rowtype;
  v_result jsonb;
  v_appt_id uuid;
  v_studio_name text;
  v_expires_at timestamptz;
begin
  perform public.studio_flow_owner_assert_studio_access(p_studio_id);
  if p_client_id is not null then
    if not public.studio_flow_owner_client_related(p_studio_id,p_client_id) then
      raise exception 'Selecciona una clienta de tu estudio o ingresa sus datos para una cita nueva.';
    end if;
    return public.studio_flow_owner_create_manual_appointment(
      p_studio_id,p_membership_id,p_service_offering_id,p_availability_slot_id,
      p_client_id,p_client_name,p_client_phone,p_client_email,p_notes);
  end if;
  if nullif(trim(coalesce(p_client_name,'')),'') is null
    or length(public.studio_flow_phone_key(p_client_phone))<>10 then
    raise exception 'Escribe nombre y teléfono de diez dígitos para la nueva cita.';
  end if;
  select * into v_match from public.clients c
  where c.status='active' and c.archived_at is null
    and ((public.studio_flow_phone_key(c.phone)=public.studio_flow_phone_key(p_client_phone))
      or (nullif(trim(coalesce(p_client_email,'')),'') is not null
        and lower(trim(c.email))=lower(trim(p_client_email))))
  order by case when c.profile_id is not null then 0 else 1 end,
    case when lower(trim(c.email))=lower(trim(coalesce(p_client_email,''))) then 0 else 1 end,
    c.created_at desc limit 1;
  if v_match.id is not null and public.studio_flow_owner_client_related(p_studio_id,v_match.id) then
    raise exception 'Esta clienta ya forma parte de tu estudio. Busca su perfil para agendar.';
  end if;
  if v_match.id is null then
    return public.studio_flow_owner_create_manual_appointment(
      p_studio_id,p_membership_id,p_service_offering_id,p_availability_slot_id,
      null,p_client_name,p_client_phone,p_client_email,p_notes);
  end if;
  if v_match.profile_id is null or not exists(
    select 1 from public.profiles p where p.id=v_match.profile_id and p.status='active') then
    insert into public.clients(display_name,phone)
      values(trim(p_client_name),trim(p_client_phone)) returning * into v_guest;
    if nullif(trim(coalesce(p_client_email,'')),'') is not null then
      insert into public.studio_flow_guest_booking_claims(guest_client_id,contact_email)
        values(v_guest.id,lower(trim(p_client_email)));
    end if;
    return public.studio_flow_owner_create_manual_appointment(
      p_studio_id,p_membership_id,p_service_offering_id,p_availability_slot_id,
      v_guest.id,p_client_name,p_client_phone,null,p_notes);
  end if;
  if (select count(*) from public.studio_flow_pending_manual_bookings
      where studio_id=p_studio_id and created_at>now()-interval '1 day')>=100 then
    raise exception 'Límite temporal de solicitudes. Comunícate con soporte de Studio Flow.';
  end if;
  if (select count(*) from public.studio_flow_pending_manual_bookings
      where studio_id=p_studio_id and target_client_id=v_match.id
        and created_at>now()-interval '1 day')>=3 then
    raise exception 'Ya se enviaron varias solicitudes para este contacto. Intenta más tarde.';
  end if;
  insert into public.clients(display_name)
    values(trim(p_client_name)) returning * into v_guest;
  v_result:=public.studio_flow_owner_create_manual_appointment(
    p_studio_id,p_membership_id,p_service_offering_id,p_availability_slot_id,
    v_guest.id,p_client_name,null,null,p_notes);
  v_appt_id:=(v_result->'appointment'->>'id')::uuid;
  select least(now()+interval '24 hours',greatest(now()+interval '2 hours',a.starts_at+interval '1 hour'))
    into v_expires_at from public.appointments a where a.id=v_appt_id;
  insert into public.studio_flow_pending_manual_bookings(
    appointment_id,studio_id,target_client_id,guest_client_id,expires_at)
    values(v_appt_id,p_studio_id,v_match.id,v_guest.id,v_expires_at);
  select coalesce(sp.commercial_name,s.name,'el estudio') into v_studio_name
    from public.studios s left join public.studio_profiles sp on sp.studio_id=s.id
    where s.id=p_studio_id;
  insert into public.client_notifications(
    client_id,studio_id,notification_type,title,body,metadata)
    values(v_match.id,p_studio_id,'manual_booking','¿Te agendaron una cita?',
      coalesce(v_studio_name,'Un estudio')||' apartó un horario a tu nombre. Confirma si solicitaste esta cita.',
      jsonb_build_object('targetUrl','/client'));
  return v_result||jsonb_build_object('requiresConfirmation',true);
end $$;

revoke execute on function public.studio_flow_owner_create_manual_appointment(uuid,uuid,uuid,uuid,uuid,text,text,text,text)
  from public,anon,authenticated;

create or replace function public.studio_flow_client_pending_manual_bookings()
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_client_id uuid; v_result jsonb;
begin
  select c.id into v_client_id from public.clients c join public.profiles p on p.id=c.profile_id
    where c.profile_id=auth.uid() and c.status='active' and c.archived_at is null and p.status='active';
  if v_client_id is null then raise exception 'Se requiere una cuenta de clienta activa'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'studio',coalesce(sp.commercial_name,s.name),
    'service',so.name,'startsAt',a.starts_at,'expiresAt',r.expires_at)
    order by a.starts_at),'[]'::jsonb) into v_result
  from public.studio_flow_pending_manual_bookings r
  join public.appointments a on a.id=r.appointment_id
  join public.studios s on s.id=r.studio_id
  left join public.studio_profiles sp on sp.studio_id=s.id
  join public.service_offerings so on so.id=a.service_offering_id
  where r.target_client_id=v_client_id and r.status='pending' and r.expires_at>now()
    and a.status='scheduled';
  return jsonb_build_object('requests',v_result);
end $$;
revoke all on function public.studio_flow_client_pending_manual_bookings() from public,anon;
grant execute on function public.studio_flow_client_pending_manual_bookings() to authenticated;

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
    perform public.studio_flow_upsert_customer_relationship(
      v_client_id,'studio',null,v_request.studio_id,null,'appointment','active',v_appointment.starts_at);
    perform public.studio_flow_upsert_customer_relationship(
      v_client_id,'membership',null,null,v_appointment.membership_id,'appointment','active',v_appointment.starts_at);
    update public.studio_flow_pending_manual_bookings set status='accepted',resolved_at=now()
      where id=v_request.id;
  else
    update public.appointments set status='cancelled',cancelled_at=now(),updated_at=now()
      where id=v_appointment.id;
    update public.availability_slots set status='available',held_by_profile_id=null,held_until=null,updated_at=now()
      where membership_id=v_appointment.membership_id
        and starts_at>=v_appointment.starts_at and starts_at<v_appointment.ends_at and status='booked';
    insert into public.appointment_status_events(appointment_id,from_status,to_status,reason,changed_by_profile_id)
      values(v_appointment.id,'scheduled','cancelled','client_rejected_private_manual_booking',auth.uid());
    update public.studio_flow_pending_manual_bookings set status='rejected',resolved_at=now()
      where id=v_request.id;
  end if;
  return jsonb_build_object('status',case when p_accept then 'accepted' else 'rejected' end);
end $$;
revoke all on function public.studio_flow_client_respond_manual_booking(uuid,boolean) from public,anon;
grant execute on function public.studio_flow_client_respond_manual_booking(uuid,boolean) to authenticated;

create function public.studio_flow_client_guest_booking_candidates()
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_email text; v_result jsonb;
begin
  select lower(u.email) into v_email from auth.users u
    join public.profiles p on p.id=u.id and p.status='active'
    where u.id=auth.uid() and u.email_confirmed_at is not null;
  if v_email is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'studio',coalesce(sp.commercial_name,s.name),
    'service',so.name,'startsAt',a.starts_at) order by a.starts_at),'[]'::jsonb)
    into v_result
  from public.appointments a
  join public.clients guest on guest.id=a.client_id and guest.profile_id is null and guest.status='active'
  left join public.studio_flow_guest_booking_claims claim on claim.guest_client_id=guest.id
  left join public.studios s on s.id=a.studio_id
  left join public.studio_profiles sp on sp.studio_id=s.id
  join public.service_offerings so on so.id=a.service_offering_id
  where a.status='scheduled' and a.starts_at>now()-interval '1 day'
    and (lower(trim(guest.email))=v_email or claim.contact_email=v_email);
  return v_result;
end $$;
revoke all on function public.studio_flow_client_guest_booking_candidates() from public,anon;
grant execute on function public.studio_flow_client_guest_booking_candidates() to authenticated;

create function public.studio_flow_client_claim_guest_booking(p_appointment_id uuid)
returns boolean language plpgsql security definer set search_path=public,auth as $$
declare v_client_id uuid; v_email text; v_appointment public.appointments%rowtype; v_guest public.clients%rowtype;
begin
  select c.id,lower(u.email) into v_client_id,v_email
    from auth.users u join public.clients c on c.profile_id=u.id
    join public.profiles p on p.id=u.id
    where u.id=auth.uid() and u.email_confirmed_at is not null
      and c.status='active' and c.archived_at is null and p.status='active';
  if v_client_id is null then raise exception 'Se requiere una cuenta con correo verificado'; end if;
  select * into v_appointment from public.appointments
    where id=p_appointment_id and status='scheduled' for update;
  select * into v_guest from public.clients where id=v_appointment.client_id
    and profile_id is null and status='active' for update;
  if v_appointment.id is null or v_guest.id is null or not (
    lower(trim(v_guest.email))=v_email or exists(
      select 1 from public.studio_flow_guest_booking_claims claim
      where claim.guest_client_id=v_guest.id and claim.contact_email=v_email)) then
    raise exception 'Esta cita no se puede vincular a tu cuenta';
  end if;
  update public.appointments set client_id=v_client_id,updated_at=now()
    where id=v_appointment.id;
  if v_appointment.studio_id is not null then
    perform public.studio_flow_upsert_customer_relationship(
      v_client_id,'studio',null,v_appointment.studio_id,null,'appointment','active',v_appointment.starts_at);
    if v_appointment.membership_id is not null then
      perform public.studio_flow_upsert_customer_relationship(
        v_client_id,'membership',null,null,v_appointment.membership_id,'appointment','active',v_appointment.starts_at);
    end if;
  else
    perform public.studio_flow_upsert_customer_relationship(
      v_client_id,'artist',v_appointment.artist_id,null,null,'appointment','active',v_appointment.starts_at);
  end if;
  if not exists(select 1 from public.appointments where client_id=v_guest.id) then
    delete from public.studio_flow_guest_booking_claims where guest_client_id=v_guest.id;
    update public.clients set status='archived',archived_at=now(),updated_at=now()
      where id=v_guest.id;
  end if;
  return true;
end $$;
revoke all on function public.studio_flow_client_claim_guest_booking(uuid) from public,anon;
grant execute on function public.studio_flow_client_claim_guest_booking(uuid) to authenticated;

create or replace function public.studio_flow_expire_pending_manual_bookings()
returns integer language plpgsql security definer set search_path=public,auth as $$
declare v_request public.studio_flow_pending_manual_bookings%rowtype;
declare v_appointment public.appointments%rowtype;
declare v_count integer:=0;
begin
  for v_request in select * from public.studio_flow_pending_manual_bookings
    where status='pending' and expires_at<=now() for update skip locked loop
    select * into v_appointment from public.appointments where id=v_request.appointment_id for update;
    if v_appointment.status='scheduled' then
      update public.appointments set status='cancelled',cancelled_at=now(),updated_at=now()
        where id=v_appointment.id;
      update public.availability_slots set status='available',held_by_profile_id=null,held_until=null,updated_at=now()
        where membership_id=v_appointment.membership_id
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
revoke all on function public.studio_flow_expire_pending_manual_bookings() from public,anon,authenticated;
create function public.studio_flow_guard_pending_manual_booking_resolution()
returns trigger language plpgsql set search_path=public as $$
begin
  if old.status='scheduled' and new.status in ('completed','no_show') and exists(
    select 1 from public.studio_flow_pending_manual_bookings r
    where r.appointment_id=old.id and r.status='pending') then
    raise exception 'La clienta aún no confirmó esta reserva privada.';
  end if;
  return new;
end $$;
create trigger studio_flow_guard_pending_manual_booking_resolution
  before update of status on public.appointments for each row
  execute function public.studio_flow_guard_pending_manual_booking_resolution();
revoke all on function public.studio_flow_guard_pending_manual_booking_resolution() from public,anon,authenticated;
select cron.schedule('studioflow-private-manual-bookings','*/5 * * * *',
  'select public.studio_flow_expire_pending_manual_bookings()');

commit;
