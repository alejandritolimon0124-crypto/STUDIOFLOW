create table public.studio_flow_client_attendance_claims (
  appointment_id uuid primary key references public.appointments(id) on delete cascade,
  client_id uuid not null references public.clients(id),
  attended boolean not null,
  claimed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index studio_flow_client_attendance_claims_client_idx
  on public.studio_flow_client_attendance_claims(client_id);

create table public.studio_flow_attendance_policy (
  id boolean primary key default true check (id),
  active_since timestamptz not null default now()
);
insert into public.studio_flow_attendance_policy(id) values (true);
revoke all on public.studio_flow_attendance_policy from anon, authenticated;

alter table public.studio_flow_client_attendance_claims enable row level security;
revoke all on public.studio_flow_client_attendance_claims from anon, authenticated;

create function public.studio_flow_client_claim_attendance(p_appointment_id uuid, p_attended boolean)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_appointment public.appointments%rowtype; v_client_id uuid;
begin
  if p_attended is null then raise exception 'Elige si asististe o no'; end if;
  select id into v_client_id from public.clients
    where profile_id = auth.uid() and status = 'active' and archived_at is null limit 1;
  if v_client_id is null then raise exception 'Perfil de clienta activo requerido'; end if;
  select * into v_appointment from public.appointments
    where id = p_appointment_id and client_id = v_client_id for update;
  if v_appointment.id is null then raise exception 'Cita no encontrada'; end if;
  if v_appointment.ends_at > now() then raise exception 'Puedes responder cuando termine tu cita'; end if;
  if v_appointment.status not in ('scheduled', 'completed', 'cancelled', 'no_show') then
    raise exception 'Esta cita aun no admite respuesta';
  end if;
  insert into public.studio_flow_client_attendance_claims(appointment_id, client_id, attended)
    values(v_appointment.id, v_client_id, p_attended)
    on conflict (appointment_id) do update
      set attended = excluded.attended, claimed_at = now(), updated_at = now();
  return jsonb_build_object('appointmentId', v_appointment.id, 'attended', p_attended,
    'providerStatus', v_appointment.status,
    'conflict', (p_attended and v_appointment.status in ('cancelled','no_show'))
      or (not p_attended and v_appointment.status = 'completed'));
end $$;
revoke all on function public.studio_flow_client_claim_attendance(uuid,boolean) from public, anon;
grant execute on function public.studio_flow_client_claim_attendance(uuid,boolean) to authenticated;

create function public.studio_flow_client_attendance_claims()
returns jsonb language sql stable security definer set search_path = public, auth as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'appointmentId', claim.appointment_id, 'attended', claim.attended,
    'claimedAt', claim.claimed_at) order by claim.claimed_at desc), '[]'::jsonb)
  from public.studio_flow_client_attendance_claims claim
  join public.clients client on client.id = claim.client_id
  where client.profile_id = auth.uid() and client.status = 'active' and client.archived_at is null;
$$;
revoke all on function public.studio_flow_client_attendance_claims() from public, anon;
grant execute on function public.studio_flow_client_attendance_claims() to authenticated;

create function public.studio_flow_provider_attendance_cases(p_studio_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare v_artist_id uuid; v_result jsonb;
begin
  if p_studio_id is not null then
    perform public.studio_flow_owner_assert_studio_access(p_studio_id);
  else
    select id into v_artist_id from public.artists
      where profile_id = auth.uid() and status = 'active' and archived_at is null limit 1;
    if v_artist_id is null then raise exception 'Perfil de artista activo requerido'; end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'clientId', a.client_id, 'client', c.display_name,
    'service', so.name, 'startsAt', a.starts_at, 'endsAt', a.ends_at,
    'status', a.status, 'claim', claim.attended,
    'claimAt', claim.claimed_at, 'overdue', a.status = 'scheduled' and a.ends_at <= now() - interval '24 hours'
      and a.ends_at >= (select active_since from public.studio_flow_attendance_policy where id = true),
    'conflict', (claim.attended and a.status in ('cancelled','no_show'))
      or (claim.attended = false and a.status = 'completed')) order by a.ends_at desc), '[]'::jsonb)
    into v_result
  from public.appointments a
  join public.clients c on c.id = a.client_id
  join public.service_offerings so on so.id = a.service_offering_id
  left join public.studio_flow_client_attendance_claims claim on claim.appointment_id = a.id
  where ((p_studio_id is not null and a.studio_id = p_studio_id)
    or (p_studio_id is null and a.artist_id = v_artist_id))
    and ((a.status = 'scheduled' and a.ends_at <= now())
      or (claim.attended and a.status in ('cancelled','no_show'))
      or (claim.attended = false and a.status = 'completed'));
  return v_result;
end $$;
revoke all on function public.studio_flow_provider_attendance_cases(uuid) from public, anon;
grant execute on function public.studio_flow_provider_attendance_cases(uuid) to authenticated;

create or replace function public.studio_flow_guard_appointment_completion() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from new.status or old.ends_at is distinct from new.ends_at) then
    if new.ends_at > now() then raise exception 'La cita solo puede completarse cuando termine su horario.'; end if;
    if tg_op = 'UPDATE' and old.status in ('cancelled','no_show')
      and current_setting('studio_flow.attendance_resolution', true) is distinct from 'on' then
      raise exception 'Esta cita cancelada requiere resolver la diferencia con la clienta.';
    end if;
  end if;
  return new;
end $$;

create function public.studio_flow_guard_client_attendance() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.status = 'scheduled' and new.status in ('cancelled','no_show')
    and exists(select 1 from public.studio_flow_client_attendance_claims claim
      where claim.appointment_id = old.id and claim.attended) then
    raise exception 'La clienta confirmo que asistio. Completa la cita o comunicate con ella para aclararlo.';
  end if;
  return new;
end $$;
create trigger studio_flow_guard_client_attendance
  before update of status on public.appointments for each row
  execute function public.studio_flow_guard_client_attendance();

create function public.studio_flow_provider_correct_attendance(p_appointment_id uuid)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare a public.appointments%rowtype; v_claim boolean;
begin
  select * into a from public.appointments where id = p_appointment_id for update;
  if a.id is null or a.status not in ('cancelled','no_show') or a.ends_at > now() then
    raise exception 'Esta cita no admite correccion';
  end if;
  if not (exists(select 1 from public.artists ar where ar.id = a.artist_id and ar.profile_id = auth.uid()
      and ar.status = 'active' and ar.archived_at is null)
    or exists(select 1 from public.studios s where s.id = a.studio_id and s.owner_profile_id = auth.uid()
      and s.studio_status = 'approved' and s.archived_at is null)
    or exists(select 1 from public.user_role_assignments u join public.roles r on r.id = u.role_id
      where u.profile_id = auth.uid() and u.studio_id = a.studio_id and u.status = 'active'
        and r.code in ('studio_owner','studio_manager'))) then
    raise exception 'No puedes corregir esta cita';
  end if;
  select attended into v_claim from public.studio_flow_client_attendance_claims
    where appointment_id = a.id;
  if v_claim is distinct from true then raise exception 'La clienta debe confirmar primero que asistio'; end if;
  perform set_config('studio_flow.attendance_resolution', 'on', true);
  update public.appointments set status = 'completed', completed_at = now(), cancelled_at = null,
    cancelled_by_provider = false, cancelled_by_profile_id = null, updated_at = now()
    where id = a.id;
  insert into public.appointment_status_events(appointment_id, from_status, to_status, reason, changed_by_profile_id)
    values(a.id, a.status, 'completed', 'client_attendance_reconciled', auth.uid());
  return jsonb_build_object('id', a.id, 'status', 'completed');
end $$;
revoke all on function public.studio_flow_provider_correct_attendance(uuid) from public, anon;
grant execute on function public.studio_flow_provider_correct_attendance(uuid) to authenticated;
