create or replace function public.studio_flow_admin_client_scope_context(
  p_client_id uuid default null
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
  v_studio_id uuid;
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
    raise exception 'Admin scope required';
  end if;

  if p_client_id is not null and not v_is_platform_owner then
    select scoped.studio_id
    into v_studio_id
    from (
      select appt.studio_id
      from appointments appt
      where appt.client_id = p_client_id
        and appt.studio_id = any(v_scoped_studio_ids)
      union
      select cr.studio_id
      from customer_relationships cr
      where cr.client_id = p_client_id
        and cr.scope_type = 'studio'
        and cr.status = 'active'
        and cr.studio_id = any(v_scoped_studio_ids)
      union
      select asm.studio_id
      from customer_relationships cr
      join artist_studio_memberships asm on asm.id = cr.membership_id
      where cr.client_id = p_client_id
        and cr.scope_type = 'membership'
        and cr.status = 'active'
        and asm.studio_id = any(v_scoped_studio_ids)
        and asm.status <> 'archived'
    ) scoped
    where scoped.studio_id is not null
    limit 1;

    if v_studio_id is null then
      raise exception 'Admin scope does not allow managing this client';
    end if;
  end if;

  return jsonb_build_object(
    'actor_profile_id', v_profile.id,
    'is_platform_owner', v_is_platform_owner,
    'scoped_studio_ids', coalesce(to_jsonb(v_scoped_studio_ids), '[]'::jsonb),
    'studio_id', v_studio_id
  );
end;
$$;

create or replace function public.studio_flow_admin_clients_payload(
  p_client_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
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
        'notes', '',
        'history', coalesce(client_history.history, '[]'::jsonb)
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
$$;

create or replace function public.studio_flow_admin_get_clients()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  return studio_flow_admin_clients_payload(null);
end;
$$;

create or replace function public.studio_flow_admin_activate_client(
  p_client_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_context jsonb;
  v_before clients%rowtype;
  v_after clients%rowtype;
begin
  v_context := studio_flow_admin_client_scope_context(p_client_id);

  select *
  into v_before
  from clients
  where id = p_client_id
  for update;

  if v_before.id is null then
    raise exception 'Client not found';
  end if;

  if v_before.status = 'archived' then
    raise exception 'Archived clients cannot be activated';
  end if;

  update clients
  set status = 'active', updated_at = now()
  where id = v_before.id
  returning *
  into v_after;

  insert into audit_events (
    actor_profile_id,
    context,
    entity_type,
    entity_id,
    studio_id,
    client_id,
    event_type,
    before_data,
    after_data
  )
  values (
    (v_context ->> 'actor_profile_id')::uuid,
    'identity',
    'client',
    v_after.id,
    nullif(v_context ->> 'studio_id', '')::uuid,
    v_after.id,
    'client_activated',
    to_jsonb(v_before),
    to_jsonb(v_after)
  );

  return studio_flow_admin_clients_payload(array[v_after.id]);
end;
$$;

create or replace function public.studio_flow_admin_deactivate_client(
  p_client_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_context jsonb;
  v_before clients%rowtype;
  v_after clients%rowtype;
begin
  v_context := studio_flow_admin_client_scope_context(p_client_id);

  select *
  into v_before
  from clients
  where id = p_client_id
  for update;

  if v_before.id is null then
    raise exception 'Client not found';
  end if;

  if v_before.status = 'archived' then
    raise exception 'Archived clients cannot be deactivated';
  end if;

  update clients
  set status = 'inactive', updated_at = now()
  where id = v_before.id
  returning *
  into v_after;

  insert into audit_events (
    actor_profile_id,
    context,
    entity_type,
    entity_id,
    studio_id,
    client_id,
    event_type,
    before_data,
    after_data
  )
  values (
    (v_context ->> 'actor_profile_id')::uuid,
    'identity',
    'client',
    v_after.id,
    nullif(v_context ->> 'studio_id', '')::uuid,
    v_after.id,
    'client_deactivated',
    to_jsonb(v_before),
    to_jsonb(v_after)
  );

  return studio_flow_admin_clients_payload(array[v_after.id]);
end;
$$;

create or replace function public.studio_flow_admin_update_client_profile(
  p_client_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_context jsonb;
  v_before clients%rowtype;
  v_after clients%rowtype;
  v_profile_before profiles%rowtype;
  v_profile_after profiles%rowtype;
  v_name text;
  v_email text;
  v_phone text;
begin
  v_context := studio_flow_admin_client_scope_context(p_client_id);

  select *
  into v_before
  from clients
  where id = p_client_id
  for update;

  if v_before.id is null then
    raise exception 'Client not found';
  end if;

  if v_before.status = 'archived' then
    raise exception 'Archived clients cannot be edited';
  end if;

  if v_before.profile_id is not null then
    select *
    into v_profile_before
    from profiles
    where id = v_before.profile_id
    for update;
  end if;

  v_name := coalesce(nullif(trim(coalesce(p_patch ->> 'name', '')), ''), v_before.display_name);
  v_email := nullif(trim(coalesce(p_patch ->> 'email', coalesce(v_before.email, v_profile_before.email, ''))), '');
  v_phone := nullif(trim(coalesce(p_patch ->> 'phone', coalesce(v_before.phone, v_profile_before.phone, ''))), '');

  update clients
  set
    display_name = v_name,
    email = v_email,
    phone = v_phone,
    updated_at = now()
  where id = v_before.id
  returning *
  into v_after;

  if v_after.profile_id is not null then
    update profiles
    set
      display_name = v_name,
      email = coalesce(v_email, email),
      phone = v_phone,
      updated_at = now()
    where id = v_after.profile_id
    returning *
    into v_profile_after;
  end if;

  insert into audit_events (
    actor_profile_id,
    context,
    entity_type,
    entity_id,
    studio_id,
    client_id,
    event_type,
    before_data,
    after_data
  )
  values (
    (v_context ->> 'actor_profile_id')::uuid,
    'identity',
    'client',
    v_after.id,
    nullif(v_context ->> 'studio_id', '')::uuid,
    v_after.id,
    'admin_client_profile_updated',
    jsonb_build_object('client', to_jsonb(v_before), 'profile', to_jsonb(v_profile_before)),
    jsonb_build_object('client', to_jsonb(v_after), 'profile', to_jsonb(v_profile_after))
  );

  return studio_flow_admin_clients_payload(array[v_after.id]);
end;
$$;

revoke all on function public.studio_flow_admin_client_scope_context(uuid) from public;
revoke all on function public.studio_flow_admin_clients_payload(uuid[]) from public;
revoke all on function public.studio_flow_admin_get_clients() from public;
revoke all on function public.studio_flow_admin_activate_client(uuid) from public;
revoke all on function public.studio_flow_admin_deactivate_client(uuid) from public;
revoke all on function public.studio_flow_admin_update_client_profile(uuid, jsonb) from public;

grant execute on function public.studio_flow_admin_get_clients() to authenticated;
grant execute on function public.studio_flow_admin_activate_client(uuid) to authenticated;
grant execute on function public.studio_flow_admin_deactivate_client(uuid) to authenticated;
grant execute on function public.studio_flow_admin_update_client_profile(uuid, jsonb) to authenticated;
