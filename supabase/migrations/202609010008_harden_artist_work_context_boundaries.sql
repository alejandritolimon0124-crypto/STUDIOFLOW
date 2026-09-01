create or replace function public.studio_flow_artist_client_has_context_access(
  p_client_id uuid,
  p_context_type text default 'artist',
  p_membership_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_context jsonb;
begin
  if p_client_id is null then
    return false;
  end if;

  v_context := public.studio_flow_artist_assert_work_context(p_context_type, p_membership_id);

  if (v_context ->> 'owner_type') = 'artist' then
    return exists (
      select 1
      from appointments appt
      where appt.client_id = p_client_id
        and appt.artist_id = (v_context ->> 'artist_id')::uuid
        and appt.studio_id is null
        and appt.membership_id is null
        and appt.status <> 'cancelled'
    );
  end if;

  if (v_context ->> 'owner_type') = 'membership' then
    return exists (
      select 1
      from appointments appt
      where appt.client_id = p_client_id
        and appt.studio_id = (v_context ->> 'studio_id')::uuid
        and appt.membership_id = (v_context ->> 'membership_id')::uuid
        and appt.status <> 'cancelled'
    );
  end if;

  return false;
end;
$$;

create or replace function public.studio_flow_artist_get_clients(
  p_search text default null,
  p_limit integer default 5,
  p_context_type text default 'artist',
  p_membership_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_context jsonb;
  v_clients jsonb;
  v_search text := lower(trim(coalesce(p_search, '')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 5), 5));
begin
  if auth.uid() is null then
    raise exception 'Auth session required';
  end if;

  v_context := public.studio_flow_artist_assert_work_context(p_context_type, p_membership_id);

  with scoped_appointments as (
    select appt.*
    from appointments appt
    where appt.artist_id = (v_context ->> 'artist_id')::uuid
      and (
        ((v_context ->> 'owner_type') = 'artist' and appt.studio_id is null and appt.membership_id is null)
        or (
          (v_context ->> 'owner_type') = 'membership'
          and appt.studio_id = (v_context ->> 'studio_id')::uuid
          and appt.membership_id = (v_context ->> 'membership_id')::uuid
        )
      )
  ),
  related_client_rollup as (
    select
      c.id,
      c.profile_id,
      c.display_name,
      c.email,
      c.phone,
      cp.photo_path,
      count(appt.id)::integer as total_visits,
      max(appt.starts_at) as last_visit_at,
      jsonb_agg(
        jsonb_build_object(
          'id', appt.id,
          'service', so.name,
          'date', to_char(appt.starts_at at time zone 'America/Mexico_City', 'YYYY-MM-DD'),
          'time', to_char(appt.starts_at at time zone 'America/Mexico_City', 'HH24:MI'),
          'status', case appt.status
            when 'scheduled' then 'Confirmada'
            when 'completed' then 'Completada'
            when 'cancelled' then 'Cancelada'
            when 'no_show' then 'No show'
            when 'disputed' then 'Disputada'
            else initcap(appt.status::text)
          end
        )
        order by appt.starts_at desc
      ) as history,
      case when c.profile_id is not null then 3 else 1 end as relationship_rank
    from scoped_appointments appt
    join clients c on c.id = appt.client_id
    left join client_profiles cp on cp.client_id = c.id
    join service_offerings so on so.id = appt.service_offering_id
    where coalesce(c.status::text, 'active') <> 'archived'
    group by c.id, c.profile_id, c.display_name, c.email, c.phone, cp.photo_path
  ),
  filtered_clients as (
    select *
    from related_client_rollup
    where v_search = ''
      or lower(coalesce(display_name, '')) like '%' || v_search || '%'
      or lower(coalesce(phone, '')) like '%' || v_search || '%'
      or lower(coalesce(email, '')) like '%' || v_search || '%'
  ),
  ranked_clients as (
    select *
    from filtered_clients
    order by relationship_rank desc, last_visit_at desc nulls last, display_name asc
    limit v_limit
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'profileId', profile_id,
        'profile_id', profile_id,
        'name', display_name,
        'displayName', display_name,
        'email', email,
        'phone', phone,
        'photoUrl', photo_path,
        'photo_path', photo_path,
        'totalVisits', total_visits,
        'total_visits', total_visits,
        'visits', total_visits,
        'lastVisitAt', last_visit_at,
        'last_visit_at', last_visit_at,
        'lastVisit', case
          when last_visit_at is null then ''
          else to_char(last_visit_at at time zone 'America/Mexico_City', 'YYYY-MM-DD')
        end,
        'history', coalesce(history, '[]'::jsonb)
      )
    ),
    '[]'::jsonb
  )
  into v_clients
  from ranked_clients;

  return jsonb_build_object('clients', v_clients);
end;
$$;

create or replace function public.studio_flow_artist_assert_service_in_context(
  p_service_offering_id uuid,
  p_context_type text default 'artist',
  p_membership_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_context jsonb;
  v_service service_offerings%rowtype;
begin
  v_context := public.studio_flow_artist_assert_work_context(p_context_type, p_membership_id);

  select *
  into v_service
  from service_offerings
  where id = p_service_offering_id
    and status = 'active'
    and archived_at is null;

  if v_service.id is null then
    raise exception 'Active service offering required';
  end if;

  if not (
    ((v_context ->> 'owner_type') = 'artist' and v_service.owner_type = 'artist' and v_service.artist_id = (v_context ->> 'artist_id')::uuid)
    or ((v_context ->> 'owner_type') = 'membership' and v_service.owner_type = 'membership' and v_service.membership_id = (v_context ->> 'membership_id')::uuid)
  ) then
    raise exception 'Service does not belong to the active workspace';
  end if;

  return v_context;
end;
$$;

create or replace function public.studio_flow_artist_get_manual_availability(
  p_service_offering_id uuid,
  p_date date,
  p_context_type text default 'artist',
  p_membership_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.studio_flow_artist_assert_service_in_context(p_service_offering_id, p_context_type, p_membership_id);
  return public.studio_flow_artist_get_manual_availability(p_service_offering_id, p_date);
end;
$$;

create or replace function public.studio_flow_artist_create_manual_appointment_for_client(
  p_client_id uuid,
  p_service_offering_id uuid,
  p_date date,
  p_time time,
  p_notes text default null,
  p_context_type text default 'artist',
  p_membership_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.studio_flow_artist_assert_service_in_context(p_service_offering_id, p_context_type, p_membership_id);

  if not public.studio_flow_artist_client_has_context_access(p_client_id, p_context_type, p_membership_id) then
    raise exception 'Esta clienta no pertenece a este entorno de trabajo';
  end if;

  return public.studio_flow_artist_create_manual_appointment_core(
    p_client_id,
    p_service_offering_id,
    p_date,
    p_time,
    p_notes
  );
end;
$$;

create or replace function public.studio_flow_artist_create_manual_appointment(
  p_client_first_name text,
  p_client_last_name text,
  p_client_phone text,
  p_service_offering_id uuid,
  p_date date,
  p_time time,
  p_notes text default null,
  p_context_type text default 'artist',
  p_membership_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_client clients%rowtype;
  v_client_display_name text;
  v_clean_phone text;
begin
  perform public.studio_flow_artist_assert_service_in_context(p_service_offering_id, p_context_type, p_membership_id);

  if nullif(trim(p_client_first_name), '') is null then
    raise exception 'Client first name is required';
  end if;

  if nullif(trim(p_client_last_name), '') is null then
    raise exception 'Client last name is required';
  end if;

  if nullif(regexp_replace(coalesce(p_client_phone, ''), '\D', '', 'g'), '') is null then
    raise exception 'Client phone is required';
  end if;

  v_clean_phone := regexp_replace(coalesce(p_client_phone, ''), '\D', '', 'g');
  v_client_display_name := concat_ws(' ', trim(p_client_first_name), trim(p_client_last_name));

  select *
  into v_client
  from clients
  where regexp_replace(coalesce(phone, ''), '\D', '', 'g') = v_clean_phone
    and status <> 'archived'
  order by created_at desc
  limit 1;

  if v_client.id is not null and not public.studio_flow_artist_client_has_context_access(v_client.id, p_context_type, p_membership_id) then
    raise exception 'Esta clienta ya existe, pero no pertenece a este entorno de trabajo';
  end if;

  if v_client.id is null then
    insert into clients (
      display_name,
      phone,
      status
    )
    values (
      v_client_display_name,
      p_client_phone,
      'active'
    )
    returning * into v_client;

    insert into client_profiles (client_id)
    values (v_client.id)
    on conflict (client_id) do nothing;
  else
    update clients
    set
      display_name = coalesce(nullif(v_client_display_name, ''), display_name),
      phone = coalesce(nullif(p_client_phone, ''), phone),
      status = 'active',
      updated_at = now()
    where id = v_client.id
    returning * into v_client;
  end if;

  return public.studio_flow_artist_create_manual_appointment_core(
    v_client.id,
    p_service_offering_id,
    p_date,
    p_time,
    p_notes
  );
end;
$$;

create or replace function public.studio_flow_client_points_balance_for_reward(
  p_client_id uuid,
  p_artist_id uuid default null,
  p_studio_id uuid default null,
  p_exclusive boolean default true
)
returns integer
language sql
security definer
set search_path = public
as $$
  with account as (
    select id
    from loyalty_accounts
    where client_id = p_client_id
      and status = 'active'
    limit 1
  ),
  active_earns as (
    select fpl.*
    from flow_point_ledger fpl
    join account on account.id = fpl.loyalty_account_id
    where fpl.movement_type = 'earn'
      and coalesce(fpl.expires_at, fpl.occurred_at + interval '90 days') > now()
      and (
        not p_exclusive
        or (
          p_artist_id is not null
          and p_studio_id is null
          and fpl.metadata ->> 'artistId' = p_artist_id::text
          and nullif(fpl.metadata ->> 'studioId', '') is null
        )
        or (
          p_studio_id is not null
          and fpl.metadata ->> 'studioId' = p_studio_id::text
        )
      )
  ),
  active_earn_window as (
    select min(occurred_at) as first_active_earn_at
    from active_earns
  ),
  eligible_spends as (
    select fpl.*
    from flow_point_ledger fpl
    join account on account.id = fpl.loyalty_account_id
    cross join active_earn_window earn_window
    where fpl.movement_type in ('spend', 'expire')
      and earn_window.first_active_earn_at is not null
      and fpl.occurred_at >= earn_window.first_active_earn_at
      and (
        not p_exclusive
        or (
          p_artist_id is not null
          and p_studio_id is null
          and (
            fpl.metadata ->> 'rewardArtistId' = p_artist_id::text
            or fpl.metadata ->> 'artistId' = p_artist_id::text
          )
          and nullif(coalesce(fpl.metadata ->> 'rewardStudioId', fpl.metadata ->> 'studioId'), '') is null
        )
        or (
          p_studio_id is not null
          and (
            fpl.metadata ->> 'rewardStudioId' = p_studio_id::text
            or fpl.metadata ->> 'studioId' = p_studio_id::text
          )
        )
      )
  )
  select greatest(
    coalesce((select sum(points) from active_earns), 0)
    + coalesce((select sum(points) from eligible_spends), 0),
    0
  )::integer;
$$;

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.studio_flow_artist_award_appointment_points(uuid)'::regprocedure)
  into v_definition;

  if v_definition is null then
    raise exception 'studio_flow_artist_award_appointment_points was not found';
  end if;

  v_definition := replace(
    v_definition,
    'where amp.artist_id = v_appointment.artist_id
      and amp.flow_points_enabled',
    'where amp.artist_id = v_appointment.artist_id
      and v_appointment.studio_id is null
      and v_appointment.membership_id is null
      and amp.flow_points_enabled'
  );

  v_definition := replace(
    v_definition,
    'v_points := coalesce(v_service.flow_points_awarded, 0) * public.studio_flow_artist_active_double_points_multiplier(v_appointment.artist_id, v_appointment.studio_id, now());',
    'v_points := coalesce(v_service.flow_points_awarded, 0) * case
    when v_appointment.studio_id is null and v_appointment.membership_id is null then public.studio_flow_artist_active_double_points_multiplier(v_appointment.artist_id, null, now())
    else public.studio_flow_artist_active_double_points_multiplier(null, v_appointment.studio_id, now())
  end;'
  );

  v_definition := replace(
    v_definition,
    '''studioId'', v_appointment.studio_id,
      ''source'', ''manual_artist_button'',
      ''doublePointsMultiplier'', public.studio_flow_artist_active_double_points_multiplier(v_appointment.artist_id, v_appointment.studio_id, now())',
    '''studioId'', v_appointment.studio_id,
      ''membershipId'', v_appointment.membership_id,
      ''source'', ''manual_artist_button'',
      ''doublePointsMultiplier'', case
        when v_appointment.studio_id is null and v_appointment.membership_id is null then public.studio_flow_artist_active_double_points_multiplier(v_appointment.artist_id, null, now())
        else public.studio_flow_artist_active_double_points_multiplier(null, v_appointment.studio_id, now())
      end'
  );

  execute v_definition;
end;
$$;

revoke all on function public.studio_flow_artist_client_has_context_access(uuid, text, uuid) from public;
grant execute on function public.studio_flow_artist_client_has_context_access(uuid, text, uuid) to authenticated;

revoke all on function public.studio_flow_artist_get_clients(text, integer, text, uuid) from public;
grant execute on function public.studio_flow_artist_get_clients(text, integer, text, uuid) to authenticated;

revoke all on function public.studio_flow_artist_assert_service_in_context(uuid, text, uuid) from public;
grant execute on function public.studio_flow_artist_assert_service_in_context(uuid, text, uuid) to authenticated;

revoke all on function public.studio_flow_artist_get_manual_availability(uuid, date, text, uuid) from public;
grant execute on function public.studio_flow_artist_get_manual_availability(uuid, date, text, uuid) to authenticated;

revoke all on function public.studio_flow_artist_create_manual_appointment_for_client(uuid, uuid, date, time, text, text, uuid) from public;
grant execute on function public.studio_flow_artist_create_manual_appointment_for_client(uuid, uuid, date, time, text, text, uuid) to authenticated;

revoke all on function public.studio_flow_artist_create_manual_appointment(text, text, text, uuid, date, time, text, text, uuid) from public;
grant execute on function public.studio_flow_artist_create_manual_appointment(text, text, text, uuid, date, time, text, text, uuid) to authenticated;

revoke all on function public.studio_flow_client_points_balance_for_reward(uuid, uuid, uuid, boolean) from public;
grant execute on function public.studio_flow_client_points_balance_for_reward(uuid, uuid, uuid, boolean) to authenticated;
