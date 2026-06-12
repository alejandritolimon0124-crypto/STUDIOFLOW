create or replace function public.studio_flow_get_client_appointments()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile profiles%rowtype;
  v_client clients%rowtype;
  v_appointments jsonb;
begin
  if auth.uid() is null then
    raise exception 'Auth session required';
  end if;

  select *
  into v_profile
  from profiles
  where id = auth.uid()
    and status = 'active';

  if v_profile.id is null then
    raise exception 'Active profile required';
  end if;

  select *
  into v_client
  from clients
  where profile_id = v_profile.id
    and status <> 'archived'
  limit 1;

  if v_client.id is null then
    return jsonb_build_object('appointments', '[]'::jsonb);
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', appt.id,
        'type', 'appointment',
        'clientId', appt.client_id,
        'artistId', appt.artist_id,
        'studioId', appt.studio_id,
        'membershipId', appt.membership_id,
        'serviceOfferingId', appt.service_offering_id,
        'availabilitySlotId', appt.availability_slot_id,
        'client', c.display_name,
        'artist', coalesce(ap.artistic_name, artist.display_name),
        'service', so.name,
        'serviceTier', coalesce(st.code::text, 'basic'),
        'date', to_char(appt.starts_at at time zone 'America/Mexico_City', 'YYYY-MM-DD'),
        'time', to_char(appt.starts_at at time zone 'America/Mexico_City', 'HH24:MI'),
        'end', to_char(appt.ends_at at time zone 'America/Mexico_City', 'HH24:MI'),
        'startsAt', appt.starts_at,
        'endsAt', appt.ends_at,
        'durationMinutes', greatest(1, floor(extract(epoch from (appt.ends_at - appt.starts_at)) / 60)::integer),
        'duration', concat(greatest(1, floor(extract(epoch from (appt.ends_at - appt.starts_at)) / 60)::integer), ' min'),
        'room', coalesce(sp.commercial_name, s.name, 'Agenda'),
        'address', coalesce(sp.address_line, sp.city, 'Agenda Studio Flow'),
        'status', case appt.status
          when 'scheduled' then 'Confirmada'
          when 'completed' then 'Completada'
          when 'cancelled' then 'Cancelada'
          when 'no_show' then 'No show'
          when 'disputed' then 'Disputada'
          else initcap(appt.status::text)
        end,
        'appointmentStatus', appt.status,
        'bookingSource', appt.booking_source,
        'grossAmount', coalesce(ae.gross_amount, so.price_amount, 0),
        'platformFee', coalesce(ae.platform_fee_amount, round(coalesce(so.price_amount, 0) * 0.10), 0),
        'artistRevenue', coalesce(ae.artist_revenue_amount, coalesce(so.price_amount, 0) - round(coalesce(so.price_amount, 0) * 0.10), 0),
        'pointsGranted', 0,
        'riskScore', 'low'
      )
      order by appt.starts_at desc
    ),
    '[]'::jsonb
  )
  into v_appointments
  from appointments appt
  join clients c on c.id = appt.client_id
  join artists artist on artist.id = appt.artist_id
  left join artist_profiles ap on ap.artist_id = artist.id
  left join studios s on s.id = appt.studio_id
  left join studio_profiles sp on sp.studio_id = s.id
  join service_offerings so on so.id = appt.service_offering_id
  left join service_tiers st on st.id = so.tier_id
  left join appointment_economies ae on ae.appointment_id = appt.id
  where appt.client_id = v_client.id;

  return jsonb_build_object('appointments', v_appointments);
end;
$$;

create or replace function public.studio_flow_get_artist_appointments(
  p_artist_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile profiles%rowtype;
  v_artist artists%rowtype;
  v_artist_id uuid;
  v_appointments jsonb;
begin
  if auth.uid() is null then
    raise exception 'Auth session required';
  end if;

  select *
  into v_profile
  from profiles
  where id = auth.uid()
    and status = 'active';

  if v_profile.id is null then
    raise exception 'Active profile required';
  end if;

  select *
  into v_artist
  from artists
  where profile_id = v_profile.id
    and status <> 'archived'
  limit 1;

  if v_artist.id is null then
    return jsonb_build_object('appointments', '[]'::jsonb);
  end if;

  v_artist_id := coalesce(p_artist_id, v_artist.id);

  if v_artist_id <> v_artist.id then
    raise exception 'Artist scope does not allow reading these appointments';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', appt.id,
        'type', 'appointment',
        'clientId', appt.client_id,
        'artistId', appt.artist_id,
        'studioId', appt.studio_id,
        'membershipId', appt.membership_id,
        'serviceOfferingId', appt.service_offering_id,
        'availabilitySlotId', appt.availability_slot_id,
        'client', c.display_name,
        'artist', coalesce(ap.artistic_name, artist.display_name),
        'service', so.name,
        'serviceTier', coalesce(st.code::text, 'basic'),
        'date', to_char(appt.starts_at at time zone 'America/Mexico_City', 'YYYY-MM-DD'),
        'time', to_char(appt.starts_at at time zone 'America/Mexico_City', 'HH24:MI'),
        'end', to_char(appt.ends_at at time zone 'America/Mexico_City', 'HH24:MI'),
        'startsAt', appt.starts_at,
        'endsAt', appt.ends_at,
        'durationMinutes', greatest(1, floor(extract(epoch from (appt.ends_at - appt.starts_at)) / 60)::integer),
        'duration', concat(greatest(1, floor(extract(epoch from (appt.ends_at - appt.starts_at)) / 60)::integer), ' min'),
        'room', coalesce(sp.commercial_name, s.name, 'Agenda'),
        'address', coalesce(sp.address_line, sp.city, 'Agenda Studio Flow'),
        'status', case appt.status
          when 'scheduled' then 'Confirmada'
          when 'completed' then 'Completada'
          when 'cancelled' then 'Cancelada'
          when 'no_show' then 'No show'
          when 'disputed' then 'Disputada'
          else initcap(appt.status::text)
        end,
        'appointmentStatus', appt.status,
        'bookingSource', appt.booking_source,
        'grossAmount', coalesce(ae.gross_amount, so.price_amount, 0),
        'platformFee', coalesce(ae.platform_fee_amount, round(coalesce(so.price_amount, 0) * 0.10), 0),
        'artistRevenue', coalesce(ae.artist_revenue_amount, coalesce(so.price_amount, 0) - round(coalesce(so.price_amount, 0) * 0.10), 0),
        'pointsGranted', 0,
        'riskScore', 'low'
      )
      order by appt.starts_at desc
    ),
    '[]'::jsonb
  )
  into v_appointments
  from appointments appt
  join clients c on c.id = appt.client_id
  join artists artist on artist.id = appt.artist_id
  left join artist_profiles ap on ap.artist_id = artist.id
  left join studios s on s.id = appt.studio_id
  left join studio_profiles sp on sp.studio_id = s.id
  join service_offerings so on so.id = appt.service_offering_id
  left join service_tiers st on st.id = so.tier_id
  left join appointment_economies ae on ae.appointment_id = appt.id
  where appt.artist_id = v_artist_id;

  return jsonb_build_object('appointments', v_appointments);
end;
$$;

revoke all on function public.studio_flow_get_client_appointments() from public;
revoke all on function public.studio_flow_get_artist_appointments(uuid) from public;

grant execute on function public.studio_flow_get_client_appointments() to authenticated;
grant execute on function public.studio_flow_get_artist_appointments(uuid) to authenticated;
