CREATE OR REPLACE FUNCTION public.studio_flow_admin_clients_payload(p_client_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_context jsonb;
  v_is_platform_owner boolean;
  v_scoped_studio_ids uuid[];
  v_clients jsonb;
begin
  v_context := studio_flow_admin_client_scope_context(null);
  v_is_platform_owner := coalesce((v_context ->> 'is_platform_owner')::boolean, false);

  select coalesce(array_agg(value::uuid), '{}'::uuid[])
  into v_scoped_studio_ids
  from jsonb_array_elements_text(coalesce(v_context -> 'scoped_studio_ids', '[]'::jsonb)) as value;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'profile_id', c.profile_id,
        'name', c.display_name,
        'email', coalesce(c.email, p.email),
        'phone', coalesce(c.phone, p.phone),
        'status', case c.status
          when 'active' then 'Activo'
          when 'inactive' then 'Inactivo'
          when 'archived' then 'Archivado'
          else initcap(c.status::text)
        end,
        'db_status', c.status,
        'segment', case
          when coalesce(la.points_balance, 0) >= 1200 then 'Icon'
          when coalesce(la.points_balance, 0) >= 600 then 'Muse'
          when coalesce(la.points_balance, 0) >= 250 then 'Glow'
          else 'Essential'
        end,
        'appointments', coalesce(client_metrics.appointment_count, 0),
        'spend_amount', coalesce(client_metrics.spend_amount, 0),
        'spend', coalesce(client_metrics.spend_amount, 0),
        'flowPoints', coalesce(la.points_balance, 0),
        'studioId', client_metrics.primary_studio_id,
        'studioName', client_metrics.primary_studio_name,
        'lastAppointmentAt', client_metrics.last_appointment_at,
        'lastAppointment', client_metrics.last_appointment_at,
        'notes', coalesce(cp.notes, ''),
        'photoUrl', cp.photo_path,
        'history', coalesce(client_history.history, '[]'::jsonb)
      )
      order by c.created_at desc
    ),
    '[]'::jsonb
  )
  into v_clients
  from clients c
  left join profiles p on p.id = c.profile_id
  left join client_profiles cp on cp.client_id = c.id
  left join loyalty_accounts la on la.client_id = c.id and la.status = 'active'
  left join lateral (
    select
      count(distinct appt.id) as appointment_count,
      coalesce(sum(ae.gross_amount), 0) as spend_amount,
      max(appt.starts_at) as last_appointment_at,
      (
        array_agg(appt.studio_id order by appt.starts_at desc)
        filter (where appt.studio_id is not null)
      )[1] as primary_studio_id,
      (
        array_agg(coalesce(sp.commercial_name, s.name) order by appt.starts_at desc)
        filter (where appt.studio_id is not null)
      )[1] as primary_studio_name
    from appointments appt
    left join appointment_economies ae on ae.appointment_id = appt.id
    left join studios s on s.id = appt.studio_id
    left join studio_profiles sp on sp.studio_id = s.id
    where appt.client_id = c.id
      and (
        v_is_platform_owner
        or appt.studio_id = any(v_scoped_studio_ids)
      )
  ) client_metrics on true
  left join lateral (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', appt.id,
          'artist', coalesce(ap.artistic_name, a.display_name),
          'date', to_char(appt.starts_at, 'YYYY-MM-DD'),
          'service', so.name,
          'status', case appt.status
            when 'scheduled' then 'Programada'
            when 'completed' then 'Completada'
            when 'cancelled' then 'Cancelada'
            when 'no_show' then 'No show'
            when 'disputed' then 'Disputada'
            else initcap(appt.status::text)
          end,
          'studioId', appt.studio_id
        )
        order by appt.starts_at desc
      ),
      '[]'::jsonb
    ) as history
    from (
      select *
      from appointments scoped_appt
      where scoped_appt.client_id = c.id
        and (
          v_is_platform_owner
          or scoped_appt.studio_id = any(v_scoped_studio_ids)
        )
      order by scoped_appt.starts_at desc
      limit 10
    ) appt
    join artists a on a.id = appt.artist_id
    left join artist_profiles ap on ap.artist_id = a.id
    join service_offerings so on so.id = appt.service_offering_id
  ) client_history on true
  where c.status <> 'archived'
    and (p_client_ids is null or c.id = any(p_client_ids))
    and (
      v_is_platform_owner
      or exists (
        select 1
        from appointments scoped_appointment
        where scoped_appointment.client_id = c.id
          and scoped_appointment.studio_id = any(v_scoped_studio_ids)
      )
      or exists (
        select 1
        from customer_relationships cr
        where cr.client_id = c.id
          and cr.scope_type = 'studio'
          and cr.status = 'active'
          and cr.studio_id = any(v_scoped_studio_ids)
      )
      or exists (
        select 1
        from customer_relationships cr
        join artist_studio_memberships asm on asm.id = cr.membership_id
        where cr.client_id = c.id
          and cr.scope_type = 'membership'
          and cr.status = 'active'
          and asm.studio_id = any(v_scoped_studio_ids)
          and asm.status <> 'archived'
      )
    );

  return jsonb_build_object('clients', v_clients);
end;
$function$;
