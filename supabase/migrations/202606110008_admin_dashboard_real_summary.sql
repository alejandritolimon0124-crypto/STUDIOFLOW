create or replace function public.studio_flow_admin_get_dashboard_summary(
  p_scope_studio_id uuid default null,
  p_date_from date default null,
  p_date_to date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile profiles%rowtype;
  v_is_platform_owner boolean := false;
  v_scoped_studio_ids uuid[];
  v_allowed_studio_ids uuid[];
  v_date_from timestamptz;
  v_date_to timestamptz;
  v_studios jsonb;
  v_artists jsonb;
  v_clients jsonb;
  v_appointments jsonb;
  v_users jsonb;
  v_system_status jsonb;
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

  select exists (
    select 1
    from user_role_assignments ura
    join roles r on r.id = ura.role_id
    where ura.profile_id = v_profile.id
      and ura.status = 'active'
      and r.code = 'platform_owner'
  ) or v_profile.default_role = 'platform_owner'
  into v_is_platform_owner;

  select coalesce(array_agg(distinct ura.studio_id) filter (where ura.studio_id is not null), '{}'::uuid[])
  into v_scoped_studio_ids
  from user_role_assignments ura
  join roles r on r.id = ura.role_id
  where ura.profile_id = v_profile.id
    and ura.status = 'active'
    and r.code in ('studio_owner', 'studio_manager');

  if not v_is_platform_owner and coalesce(array_length(v_scoped_studio_ids, 1), 0) = 0 then
    return jsonb_build_object(
      'source', 'supabase',
      'studios', '[]'::jsonb,
      'artists', '[]'::jsonb,
      'clients', '[]'::jsonb,
      'appointments', '[]'::jsonb,
      'users', '[]'::jsonb,
      'system_status', '[]'::jsonb
    );
  end if;

  if v_is_platform_owner then
    if p_scope_studio_id is null then
      select coalesce(array_agg(id), '{}'::uuid[])
      into v_allowed_studio_ids
      from studios
      where archived_at is null;
    else
      v_allowed_studio_ids := array[p_scope_studio_id];
    end if;
  else
    if p_scope_studio_id is not null and not p_scope_studio_id = any(v_scoped_studio_ids) then
      raise exception 'Admin scope does not allow this studio';
    end if;

    v_allowed_studio_ids := case
      when p_scope_studio_id is null then v_scoped_studio_ids
      else array[p_scope_studio_id]
    end;
  end if;

  v_date_from := coalesce(p_date_from, current_date - 30)::timestamptz;
  v_date_to := (coalesce(p_date_to, current_date + 30) + 1)::timestamptz;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'city', sp.city,
        'studioStatus', s.studio_status,
        'studio_status', s.studio_status,
        'riskScore', coalesce(s.risk_score, 0),
        'risk_score', coalesce(s.risk_score, 0),
        'totalArtists', coalesce(studio_counts.artist_count, 0),
        'totalClients', coalesce(studio_counts.client_count, 0),
        'revenue', coalesce(studio_counts.revenue, 0),
        'profile', jsonb_build_object(
          'commercialName', coalesce(sp.commercial_name, s.name),
          'commercial_name', coalesce(sp.commercial_name, s.name),
          'description', sp.description,
          'email', sp.email,
          'phone', sp.phone,
          'addressLine', sp.address_line,
          'address_line', sp.address_line,
          'city', sp.city,
          'geoLat', sp.geo_lat,
          'geoLng', sp.geo_lng,
          'logoPath', sp.logo_path,
          'galleryPaths', coalesce(to_jsonb(sp.gallery_paths), '[]'::jsonb)
        )
      )
      order by s.created_at desc
    ),
    '[]'::jsonb
  )
  into v_studios
  from studios s
  left join studio_profiles sp on sp.studio_id = s.id
  left join lateral (
    select
      (
        select count(distinct asm.artist_id)
        from artist_studio_memberships asm
        where asm.studio_id = s.id
          and asm.status = 'active'
      ) as artist_count,
      (
        select count(distinct appt.client_id)
        from appointments appt
        where appt.studio_id = s.id
          and appt.starts_at >= v_date_from
          and appt.starts_at < v_date_to
          and appt.status <> 'cancelled'
      ) as client_count,
      (
        select coalesce(sum(ae.gross_amount), 0)
        from appointments appt
        left join appointment_economies ae on ae.appointment_id = appt.id
        where appt.studio_id = s.id
          and appt.starts_at >= v_date_from
          and appt.starts_at < v_date_to
          and appt.status <> 'cancelled'
      ) as revenue
  ) studio_counts on true
  where s.id = any(v_allowed_studio_ids)
    and s.archived_at is null;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'name', coalesce(ap.artistic_name, a.display_name),
        'owner', coalesce(owner_profile.display_name, ap.artistic_name, a.display_name),
        'city', ap.city,
        'plan', coalesce(asm.role::text, 'Artist'),
        'status', case a.status
          when 'active' then 'Activo'
          when 'inactive' then 'Inactivo'
          when 'archived' then 'Archivado'
          else initcap(a.status::text)
        end,
        'studioStatus', coalesce(asm.status::text, 'independent'),
        'studioId', asm.studio_id,
        'membershipId', asm.id,
        'services', array_to_string(coalesce(ap.specialties, '{}'::text[]), ', '),
        'description', ap.bio,
        'revenue', coalesce(artist_counts.revenue, 0)
      )
      order by a.created_at desc
    ),
    '[]'::jsonb
  )
  into v_artists
  from artists a
  left join profiles owner_profile on owner_profile.id = a.profile_id
  left join artist_profiles ap on ap.artist_id = a.id
  left join lateral (
    select *
    from artist_studio_memberships membership
    where membership.artist_id = a.id
      and membership.status <> 'archived'
      and (
        v_is_platform_owner
        or membership.studio_id = any(v_allowed_studio_ids)
      )
    order by membership.created_at desc
    limit 1
  ) asm on true
  left join lateral (
    select coalesce(sum(ae.gross_amount), 0) as revenue
    from appointments appt
    left join appointment_economies ae on ae.appointment_id = appt.id
    where appt.artist_id = a.id
      and appt.starts_at >= v_date_from
      and appt.starts_at < v_date_to
      and appt.status <> 'cancelled'
      and (
        v_is_platform_owner
        or appt.studio_id = any(v_allowed_studio_ids)
      )
  ) artist_counts on true
  where a.status <> 'archived'
    and (
      v_is_platform_owner
      or exists (
        select 1
        from artist_studio_memberships scoped_membership
        where scoped_membership.artist_id = a.id
          and scoped_membership.studio_id = any(v_allowed_studio_ids)
          and scoped_membership.status <> 'archived'
      )
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'studioId', latest_appointment.studio_id,
        'name', c.display_name,
        'email', coalesce(c.email, p.email),
        'phone', coalesce(c.phone, p.phone),
        'status', case c.status
          when 'active' then 'Activo'
          when 'inactive' then 'Inactivo'
          when 'archived' then 'Archivado'
          else initcap(c.status::text)
        end,
        'flowPoints', coalesce(la.points_balance, 0),
        'vipTier', case
          when coalesce(la.points_balance, 0) >= 1200 then 'Icon'
          when coalesce(la.points_balance, 0) >= 600 then 'Muse'
          when coalesce(la.points_balance, 0) >= 250 then 'Glow'
          else 'Essential'
        end,
        'spend', coalesce(client_counts.spend, 0),
        'appointments', coalesce(client_counts.appointment_count, 0)
      )
      order by c.created_at desc
    ),
    '[]'::jsonb
  )
  into v_clients
  from clients c
  left join profiles p on p.id = c.profile_id
  left join loyalty_accounts la on la.client_id = c.id and la.status = 'active'
  left join lateral (
    select appt.studio_id
    from appointments appt
    where appt.client_id = c.id
      and appt.studio_id = any(v_allowed_studio_ids)
    order by appt.starts_at desc
    limit 1
  ) latest_appointment on true
  left join lateral (
    select
      count(appt.id) as appointment_count,
      coalesce(sum(ae.gross_amount), 0) as spend
    from appointments appt
    left join appointment_economies ae on ae.appointment_id = appt.id
    where appt.client_id = c.id
      and appt.starts_at >= v_date_from
      and appt.starts_at < v_date_to
      and appt.status <> 'cancelled'
      and (
        v_is_platform_owner
        or appt.studio_id = any(v_allowed_studio_ids)
      )
  ) client_counts on true
  where c.status <> 'archived'
    and (
      v_is_platform_owner
      or exists (
        select 1
        from appointments scoped_appointment
        where scoped_appointment.client_id = c.id
          and scoped_appointment.studio_id = any(v_allowed_studio_ids)
      )
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', appt.id,
        'type', 'appointment',
        'artistId', appt.artist_id,
        'studioId', appt.studio_id,
        'clientId', appt.client_id,
        'client', c.display_name,
        'artist', coalesce(ap.artistic_name, artist.display_name),
        'service', so.name,
        'serviceTier', coalesce(st.code::text, 'basic'),
        'time', to_char(appt.starts_at, 'HH24:MI'),
        'end', to_char(appt.ends_at, 'HH24:MI'),
        'status', case appt.status
          when 'scheduled' then 'Confirmada'
          when 'completed' then 'Completada'
          when 'cancelled' then 'Cancelada'
          when 'no_show' then 'No show'
          else initcap(appt.status::text)
        end,
        'appointmentStatus', appt.status,
        'grossAmount', coalesce(ae.gross_amount, so.price_amount, 0),
        'platformFee', coalesce(ae.platform_fee_amount, round(coalesce(so.price_amount, 0) * 0.10), 0),
        'artistRevenue', coalesce(ae.artist_revenue_amount, coalesce(so.price_amount, 0) - round(coalesce(so.price_amount, 0) * 0.10), 0),
        'pointsGranted', 0,
        'riskScore', coalesce(risk_counts.risk_score, 'low')
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
  join service_offerings so on so.id = appt.service_offering_id
  left join service_tiers st on st.id = so.tier_id
  left join appointment_economies ae on ae.appointment_id = appt.id
  left join lateral (
    select case
      when count(*) filter (where rf.severity = 'critical') > 0 then 'critical'
      when count(*) filter (where rf.severity = 'high') > 0 then 'high'
      when count(*) filter (where rf.severity = 'medium') > 0 then 'medium'
      else 'low'
    end as risk_score
    from risk_flags rf
    where rf.appointment_id = appt.id
      and rf.status = 'open'
  ) risk_counts on true
  where appt.starts_at >= v_date_from
    and appt.starts_at < v_date_to
    and (
      v_is_platform_owner
      or appt.studio_id = any(v_allowed_studio_ids)
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'name', p.display_name,
        'email', p.email,
        'role', coalesce(r.code::text, p.default_role::text),
        'status', case p.status
          when 'active' then 'Activo'
          when 'suspended' then 'Suspendido'
          when 'archived' then 'Archivado'
          else initcap(p.status::text)
        end,
        'studioId', ura.studio_id
      )
      order by p.created_at desc
    ),
    '[]'::jsonb
  )
  into v_users
  from profiles p
  left join user_role_assignments ura on ura.profile_id = p.id and ura.status = 'active'
  left join roles r on r.id = ura.role_id
  where p.status <> 'archived'
    and (
      v_is_platform_owner
      or ura.studio_id = any(v_allowed_studio_ids)
      or p.id = v_profile.id
    );

  v_system_status := jsonb_build_array(
    jsonb_build_object(
      'label', 'Auth',
      'status', 'Activo',
      'detail', 'Sesion Supabase real'
    ),
    jsonb_build_object(
      'label', 'Audit events',
      'status', 'Activo',
      'detail', (
        select concat(count(*), ' eventos registrados')
        from audit_events
      )
    ),
    jsonb_build_object(
      'label', 'Risk flags',
      'status', 'Activo',
      'detail', (
        select concat(count(*), ' flags abiertos')
        from risk_flags
        where status = 'open'
      )
    )
  );

  return jsonb_build_object(
    'source', 'supabase',
    'studios', v_studios,
    'artists', v_artists,
    'clients', v_clients,
    'appointments', v_appointments,
    'users', v_users,
    'system_status', v_system_status,
    'date_from', v_date_from,
    'date_to', v_date_to
  );
end;
$$;

revoke all on function public.studio_flow_admin_get_dashboard_summary(uuid, date, date) from public;
grant execute on function public.studio_flow_admin_get_dashboard_summary(uuid, date, date) to authenticated;
