begin;

alter table public.appointments
  add column if not exists arrived_at timestamptz;

create or replace function public.studio_flow_client_check_in(
  p_appointment_id uuid,
  p_latitude numeric,
  p_longitude numeric,
  p_accuracy_m numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_appointment public.appointments%rowtype;
  v_latitude numeric;
  v_longitude numeric;
  v_distance_m double precision;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para registrar tu llegada'; end if;
  if p_latitude is null or p_longitude is null or p_accuracy_m is null
    or p_latitude not between -90 and 90 or p_longitude not between -180 and 180
    or p_accuracy_m <= 0 or p_accuracy_m > 200 then
    raise exception 'No se pudo verificar tu ubicación con suficiente precisión';
  end if;

  select a.* into v_appointment
  from public.appointments a
  join public.clients c on c.id = a.client_id
  join public.profiles p on p.id = c.profile_id
  where a.id = p_appointment_id and p.id = auth.uid() and p.status = 'active'
  for update of a;

  if v_appointment.id is null then raise exception 'No se encontró esta cita en tu cuenta'; end if;
  if v_appointment.arrived_at is not null then
    return jsonb_build_object('arrivedAt', v_appointment.arrived_at);
  end if;
  if v_appointment.status <> 'scheduled' then raise exception 'Esta cita ya no acepta registro de llegada'; end if;
  if now() < v_appointment.starts_at - interval '90 minutes'
    or now() > v_appointment.ends_at + interval '30 minutes' then
    raise exception 'Podrás registrar tu llegada desde 90 minutos antes de la cita y hasta 30 minutos después de su término';
  end if;

  if v_appointment.studio_id is not null then
    select geo_lat, geo_lng into v_latitude, v_longitude
    from public.studio_profiles where studio_id = v_appointment.studio_id;
  else
    select latitude, longitude into v_latitude, v_longitude
    from public.artist_profiles where artist_id = v_appointment.artist_id;
  end if;
  if v_latitude is null or v_longitude is null then
    raise exception 'Este negocio aún no tiene una ubicación configurada para registrar llegadas';
  end if;

  v_distance_m := 6371000 * 2 * asin(sqrt(
    power(sin(radians((p_latitude - v_latitude)::double precision) / 2), 2)
    + cos(radians(v_latitude::double precision)) * cos(radians(p_latitude::double precision))
    * power(sin(radians((p_longitude - v_longitude)::double precision) / 2), 2)
  ));
  if v_distance_m > least(350, greatest(200, p_accuracy_m + 100)) then
    raise exception 'Aún no estás suficientemente cerca del lugar de tu cita';
  end if;

  update public.appointments set arrived_at = now(), updated_at = now()
  where id = v_appointment.id
  returning * into v_appointment;
  return jsonb_build_object('arrivedAt', v_appointment.arrived_at);
end;
$$;

revoke all on function public.studio_flow_client_check_in(uuid, numeric, numeric, numeric) from public;
grant execute on function public.studio_flow_client_check_in(uuid, numeric, numeric, numeric) to authenticated;

do $$
declare
  v_signature text;
  v_definition text;
  v_marker text := '''bookingSource'', appt.booking_source,';
begin
  foreach v_signature in array array[
    'public.studio_flow_get_client_appointments()',
    'public.studio_flow_get_artist_appointments(uuid)'
  ] loop
    select pg_get_functiondef(v_signature::regprocedure) into v_definition;
    if strpos(v_definition, v_marker) = 0 then
      raise exception 'Appointment read function % changed; cannot expose arrival safely', v_signature;
    end if;
    v_definition := replace(v_definition, v_marker,
      v_marker || E'\n        ''arrivedAt'', appt.arrived_at,');
    execute v_definition;
  end loop;
end;
$$;

commit;
