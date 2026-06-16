create or replace function public.studio_flow_artist_service_to_json(
  p_service_offering_id uuid
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', so.id,
    'owner_type', so.owner_type,
    'artist_id', so.artist_id,
    'studio_id', so.studio_id,
    'membership_id', so.membership_id,
    'category_id', so.category_id,
    'tier_id', so.tier_id,
    'category', coalesce(sc.name, 'Servicios'),
    'name', so.name,
    'description', so.description,
    'price_amount', so.price_amount,
    'price', so.price_amount,
    'duration_minutes', so.duration_minutes,
    'duration', concat(so.duration_minutes, ' min'),
    'bookings', 0,
    'demand', 'Nueva',
    'status', so.status,
    'serviceTier', coalesce(st.code::text, 'basic'),
    'created_at', so.created_at,
    'updated_at', so.updated_at,
    'archived_at', so.archived_at
  )
  from service_offerings so
  left join service_categories sc on sc.id = so.category_id
  left join service_tiers st on st.id = so.tier_id
  where so.id = p_service_offering_id;
$$;

create or replace function public.studio_flow_artist_get_work_contexts()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_artist artists%rowtype;
  v_contexts jsonb := '[]'::jsonb;
begin
  v_artist := public.studio_flow_artist_current_owned_artist(null);

  select jsonb_build_array(
    jsonb_build_object(
      'id', 'artist:' || v_artist.id,
      'contextType', 'artist',
      'context_type', 'artist',
      'label', coalesce(v_artist.display_name, 'Artista') || ' (Independiente)',
      'artistId', v_artist.id,
      'artist_id', v_artist.id,
      'studioId', null,
      'studio_id', null,
      'membershipId', null,
      'membership_id', null
    )
  )
  into v_contexts;

  select v_contexts || coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', 'membership:' || asm.id,
        'contextType', 'membership',
        'context_type', 'membership',
        'label', coalesce(sp.commercial_name, s.name, 'Estudio'),
        'artistId', asm.artist_id,
        'artist_id', asm.artist_id,
        'studioId', asm.studio_id,
        'studio_id', asm.studio_id,
        'studioName', coalesce(sp.commercial_name, s.name, 'Estudio'),
        'studio_name', coalesce(sp.commercial_name, s.name, 'Estudio'),
        'membershipId', asm.id,
        'membership_id', asm.id
      )
      order by coalesce(sp.commercial_name, s.name, 'Estudio')
    ),
    '[]'::jsonb
  )
  into v_contexts
  from artist_studio_memberships asm
  join studios s on s.id = asm.studio_id
  left join studio_profiles sp on sp.studio_id = s.id
  where asm.artist_id = v_artist.id
    and asm.status = 'active'
    and asm.archived_at is null
    and s.archived_at is null;

  return jsonb_build_object(
    'artistId', v_artist.id,
    'artist_id', v_artist.id,
    'contexts', v_contexts
  );
end;
$$;

create or replace function public.studio_flow_artist_assert_work_context(
  p_context_type text default 'artist',
  p_membership_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_artist artists%rowtype;
  v_membership artist_studio_memberships%rowtype;
begin
  v_artist := public.studio_flow_artist_current_owned_artist(null);

  if coalesce(p_context_type, 'artist') = 'artist' then
    return jsonb_build_object(
      'ownerType', 'artist',
      'owner_type', 'artist',
      'artistId', v_artist.id,
      'artist_id', v_artist.id,
      'studioId', null,
      'studio_id', null,
      'membershipId', null,
      'membership_id', null
    );
  end if;

  if p_context_type <> 'membership' or p_membership_id is null then
    raise exception 'Invalid artist work context';
  end if;

  select *
  into v_membership
  from artist_studio_memberships
  where id = p_membership_id
    and artist_id = v_artist.id
    and status = 'active'
    and archived_at is null;

  if v_membership.id is null then
    raise exception 'Active membership context required';
  end if;

  return jsonb_build_object(
    'ownerType', 'membership',
    'owner_type', 'membership',
    'artistId', v_artist.id,
    'artist_id', v_artist.id,
    'studioId', v_membership.studio_id,
    'studio_id', v_membership.studio_id,
    'membershipId', v_membership.id,
    'membership_id', v_membership.id
  );
end;
$$;

create or replace function public.studio_flow_artist_get_context_service_offerings(
  p_context_type text default 'artist',
  p_membership_id uuid default null,
  p_include_archived boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_context jsonb;
  v_services jsonb;
begin
  v_context := public.studio_flow_artist_assert_work_context(p_context_type, p_membership_id);

  select coalesce(
    jsonb_agg(public.studio_flow_artist_service_to_json(so.id) order by so.created_at desc),
    '[]'::jsonb
  )
  into v_services
  from service_offerings so
  where so.owner_type = (v_context ->> 'owner_type')::service_owner_type
    and (
      ((v_context ->> 'owner_type') = 'artist' and so.artist_id = (v_context ->> 'artist_id')::uuid)
      or ((v_context ->> 'owner_type') = 'membership' and so.membership_id = (v_context ->> 'membership_id')::uuid)
    )
    and (p_include_archived or so.status <> 'archived');

  return jsonb_build_object('context', v_context, 'services', v_services);
end;
$$;

create or replace function public.studio_flow_artist_create_context_service_offering(
  p_service jsonb,
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
  v_category service_categories%rowtype;
  v_tier service_tiers%rowtype;
  v_service service_offerings%rowtype;
  v_name text;
  v_price numeric;
  v_duration integer;
  v_status service_status;
begin
  v_context := public.studio_flow_artist_assert_work_context(p_context_type, p_membership_id);
  v_name := nullif(trim(coalesce(p_service ->> 'name', '')), '');

  if v_name is null then
    raise exception 'Service name is required';
  end if;

  v_price := coalesce(nullif(trim(coalesce(p_service ->> 'price_amount', p_service ->> 'price', '')), '')::numeric, 0);
  v_duration := coalesce(nullif(regexp_replace(coalesce(p_service ->> 'duration_minutes', p_service ->> 'duration', '60'), '\D', '', 'g'), '')::integer, 60);
  v_status := case
    when coalesce(p_service ->> 'status', 'active') in ('active', 'draft', 'suspended')
      then (p_service ->> 'status')::service_status
    else 'active'::service_status
  end;

  v_category := public.studio_flow_artist_get_or_create_service_category(p_service ->> 'category');
  v_tier := public.studio_flow_artist_get_or_create_service_tier(coalesce(p_service ->> 'tier_code', p_service ->> 'serviceTier'));

  insert into service_offerings (
    owner_type,
    artist_id,
    studio_id,
    membership_id,
    category_id,
    tier_id,
    name,
    description,
    price_amount,
    duration_minutes,
    status,
    archived_at,
    updated_at
  )
  values (
    (v_context ->> 'owner_type')::service_owner_type,
    case when (v_context ->> 'owner_type') = 'artist' then nullif(v_context ->> 'artist_id', '')::uuid else null end,
    case when (v_context ->> 'owner_type') = 'studio' then nullif(v_context ->> 'studio_id', '')::uuid else null end,
    case when (v_context ->> 'owner_type') = 'membership' then nullif(v_context ->> 'membership_id', '')::uuid else null end,
    v_category.id,
    v_tier.id,
    v_name,
    nullif(trim(coalesce(p_service ->> 'description', '')), ''),
    v_price,
    v_duration,
    v_status,
    null,
    now()
  )
  returning *
  into v_service;

  insert into audit_events (
    actor_profile_id,
    context,
    entity_type,
    entity_id,
    artist_id,
    studio_id,
    membership_id,
    event_type,
    after_data
  )
  values (
    auth.uid(),
    'marketplace',
    'service_offering',
    v_service.id,
    nullif(v_context ->> 'artist_id', '')::uuid,
    nullif(v_context ->> 'studio_id', '')::uuid,
    nullif(v_context ->> 'membership_id', '')::uuid,
    'artist_context_service_created',
    to_jsonb(v_service)
  );

  return jsonb_build_object('service', public.studio_flow_artist_service_to_json(v_service.id));
end;
$$;

create or replace function public.studio_flow_artist_assert_context_service(
  p_service_offering_id uuid
)
returns service_offerings
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_artist artists%rowtype;
  v_service service_offerings%rowtype;
begin
  v_artist := public.studio_flow_artist_current_owned_artist(null);

  select *
  into v_service
  from service_offerings so
  where so.id = p_service_offering_id
    and (
      (so.owner_type = 'artist' and so.artist_id = v_artist.id)
      or (
        so.owner_type = 'membership'
        and exists (
          select 1
          from artist_studio_memberships asm
          where asm.id = so.membership_id
            and asm.artist_id = v_artist.id
            and asm.status = 'active'
            and asm.archived_at is null
        )
      )
    );

  if v_service.id is null then
    raise exception 'Service offering not found for current context';
  end if;

  return v_service;
end;
$$;

create or replace function public.studio_flow_artist_update_context_service_offering(
  p_service_offering_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_current service_offerings%rowtype;
  v_category service_categories%rowtype;
  v_tier service_tiers%rowtype;
  v_service service_offerings%rowtype;
  v_name text;
  v_price numeric;
  v_duration integer;
  v_status service_status;
begin
  v_current := public.studio_flow_artist_assert_context_service(p_service_offering_id);

  if v_current.status = 'archived' then
    raise exception 'Archived service offerings cannot be edited';
  end if;

  v_name := coalesce(nullif(trim(coalesce(p_patch ->> 'name', '')), ''), v_current.name);
  v_price := coalesce(nullif(trim(coalesce(p_patch ->> 'price_amount', p_patch ->> 'price', '')), '')::numeric, v_current.price_amount);
  v_duration := coalesce(nullif(regexp_replace(coalesce(p_patch ->> 'duration_minutes', p_patch ->> 'duration', ''), '\D', '', 'g'), '')::integer, v_current.duration_minutes);
  v_status := case
    when p_patch ? 'status' and (p_patch ->> 'status') in ('active', 'draft', 'suspended')
      then (p_patch ->> 'status')::service_status
    else v_current.status
  end;

  if p_patch ? 'category' then
    v_category := public.studio_flow_artist_get_or_create_service_category(p_patch ->> 'category');
  else
    select * into v_category from service_categories where id = v_current.category_id;
  end if;

  if p_patch ? 'tier_code' or p_patch ? 'serviceTier' then
    v_tier := public.studio_flow_artist_get_or_create_service_tier(coalesce(p_patch ->> 'tier_code', p_patch ->> 'serviceTier'));
  else
    select * into v_tier from service_tiers where id = v_current.tier_id;
  end if;

  update service_offerings
  set
    category_id = v_category.id,
    tier_id = v_tier.id,
    name = v_name,
    description = case when p_patch ? 'description' then nullif(trim(coalesce(p_patch ->> 'description', '')), '') else description end,
    price_amount = v_price,
    duration_minutes = v_duration,
    status = v_status,
    archived_at = null,
    updated_at = now()
  where id = v_current.id
  returning *
  into v_service;

  insert into audit_events (actor_profile_id, context, entity_type, entity_id, artist_id, studio_id, membership_id, event_type, before_data, after_data)
  values (auth.uid(), 'marketplace', 'service_offering', v_service.id, v_service.artist_id, v_service.studio_id, v_service.membership_id, 'artist_context_service_updated', to_jsonb(v_current), to_jsonb(v_service));

  return jsonb_build_object('service', public.studio_flow_artist_service_to_json(v_service.id));
end;
$$;

create or replace function public.studio_flow_artist_update_context_service_status(
  p_service_offering_id uuid,
  p_status text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_current service_offerings%rowtype;
  v_service service_offerings%rowtype;
  v_status service_status;
begin
  v_current := public.studio_flow_artist_assert_context_service(p_service_offering_id);
  v_status := case
    when p_status in ('active', 'suspended', 'archived') then p_status::service_status
    else 'active'::service_status
  end;

  update service_offerings
  set
    status = v_status,
    archived_at = case when v_status = 'archived' then coalesce(archived_at, now()) else null end,
    updated_at = now()
  where id = v_current.id
  returning *
  into v_service;

  insert into audit_events (actor_profile_id, context, entity_type, entity_id, artist_id, studio_id, membership_id, event_type, before_data, after_data, metadata)
  values (auth.uid(), 'marketplace', 'service_offering', v_service.id, v_service.artist_id, v_service.studio_id, v_service.membership_id, 'artist_context_service_status_updated', to_jsonb(v_current), to_jsonb(v_service), jsonb_build_object('reason', p_reason));

  return jsonb_build_object('service', public.studio_flow_artist_service_to_json(v_service.id));
end;
$$;

create or replace function public.studio_flow_artist_schedule_payload_for_context(
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
  v_schedule schedules%rowtype;
  v_rules jsonb := '[]'::jsonb;
  v_blocked_dates jsonb := '[]'::jsonb;
  v_slot_count integer := 0;
begin
  v_context := public.studio_flow_artist_assert_work_context(p_context_type, p_membership_id);

  select *
  into v_schedule
  from schedules
  where owner_type = (v_context ->> 'owner_type')::schedule_owner_type
    and (
      ((v_context ->> 'owner_type') = 'artist' and artist_id = (v_context ->> 'artist_id')::uuid)
      or ((v_context ->> 'owner_type') = 'membership' and membership_id = (v_context ->> 'membership_id')::uuid)
    )
    and status <> 'archived'
  order by created_at desc
  limit 1;

  if v_schedule.id is null then
    return jsonb_build_object(
      'scheduleId', null,
      'schedule_id', null,
      'artistId', nullif(v_context ->> 'artist_id', '')::uuid,
      'artist_id', nullif(v_context ->> 'artist_id', '')::uuid,
      'studioId', nullif(v_context ->> 'studio_id', '')::uuid,
      'studio_id', nullif(v_context ->> 'studio_id', '')::uuid,
      'membershipId', nullif(v_context ->> 'membership_id', '')::uuid,
      'membership_id', nullif(v_context ->> 'membership_id', '')::uuid,
      'context', v_context,
      'timezone', 'America/Mexico_City',
      'intervalMinutes', 15,
      'interval_minutes', 15,
      'schedule', '[]'::jsonb,
      'blockedDates', '[]'::jsonb,
      'blocked_dates', '[]'::jsonb,
      'availabilitySlotCount', 0,
      'availability_slot_count', 0,
      'source', 'empty'
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', sr.id,
    'weekday', sr.weekday,
    'isActive', sr.is_active,
    'is_active', sr.is_active,
    'startTime', sr.start_time,
    'start_time', sr.start_time,
    'endTime', sr.end_time,
    'end_time', sr.end_time,
    'breakStartTime', sr.break_start_time,
    'break_start_time', sr.break_start_time,
    'breakEndTime', sr.break_end_time,
    'break_end_time', sr.break_end_time
  ) order by sr.weekday), '[]'::jsonb)
  into v_rules
  from schedule_rules sr
  where sr.schedule_id = v_schedule.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', to_char(cb.starts_at at time zone v_schedule.timezone, 'YYYY-MM-DD'),
    'label', to_char(cb.starts_at at time zone v_schedule.timezone, 'YYYY-MM-DD'),
    'startsAt', cb.starts_at,
    'starts_at', cb.starts_at,
    'endsAt', cb.ends_at,
    'ends_at', cb.ends_at,
    'reason', cb.reason
  ) order by cb.starts_at), '[]'::jsonb)
  into v_blocked_dates
  from calendar_blocks cb
  where cb.schedule_id = v_schedule.id
    and cb.status = 'active'
    and cb.block_type = 'personal'
    and cb.reason = 'blocked_date';

  select count(*)::integer
  into v_slot_count
  from availability_slots slot
  where slot.schedule_id = v_schedule.id
    and slot.status = 'available'
    and slot.starts_at >= now();

  return jsonb_build_object(
    'scheduleId', v_schedule.id,
    'schedule_id', v_schedule.id,
    'artistId', nullif(v_context ->> 'artist_id', '')::uuid,
    'artist_id', nullif(v_context ->> 'artist_id', '')::uuid,
    'studioId', nullif(v_context ->> 'studio_id', '')::uuid,
    'studio_id', nullif(v_context ->> 'studio_id', '')::uuid,
    'membershipId', nullif(v_context ->> 'membership_id', '')::uuid,
    'membership_id', nullif(v_context ->> 'membership_id', '')::uuid,
    'context', v_context,
    'timezone', v_schedule.timezone,
    'intervalMinutes', v_schedule.slot_interval_minutes,
    'interval_minutes', v_schedule.slot_interval_minutes,
    'schedule', v_rules,
    'blockedDates', v_blocked_dates,
    'blocked_dates', v_blocked_dates,
    'availabilitySlotCount', v_slot_count,
    'availability_slot_count', v_slot_count,
    'source', 'supabase'
  );
end;
$$;

create or replace function public.studio_flow_artist_get_context_schedule_settings(
  p_context_type text default 'artist',
  p_membership_id uuid default null
)
returns jsonb
language sql
security definer
set search_path = public, auth
as $$
  select public.studio_flow_artist_schedule_payload_for_context(p_context_type, p_membership_id);
$$;

create or replace function public.studio_flow_artist_save_context_schedule_settings(
  p_payload jsonb,
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
  v_schedule schedules%rowtype;
  v_timezone text := coalesce(nullif(trim(p_payload ->> 'timezone'), ''), 'America/Mexico_City');
  v_interval integer := greatest(5, coalesce((p_payload ->> 'intervalMinutes')::integer, (p_payload ->> 'interval_minutes')::integer, 15));
  v_days jsonb := coalesce(p_payload -> 'schedule', '[]'::jsonb);
  v_blocked_dates jsonb := coalesce(p_payload -> 'blockedDates', p_payload -> 'blocked_dates', '[]'::jsonb);
  v_day jsonb;
  v_blocked jsonb;
  v_weekday integer;
  v_date date;
  v_start_time time;
  v_end_time time;
  v_break_start_time time;
  v_break_end_time time;
  v_generation_date date;
  v_generation_end date := (now() at time zone v_timezone)::date + 14;
  v_rule schedule_rules%rowtype;
  v_slot_start_local timestamp;
  v_slot_end_local timestamp;
  v_slot_start timestamptz;
  v_slot_end timestamptz;
  v_available_deleted integer := 0;
  v_slots_inserted integer := 0;
begin
  v_context := public.studio_flow_artist_assert_work_context(p_context_type, p_membership_id);

  select *
  into v_schedule
  from schedules
  where owner_type = (v_context ->> 'owner_type')::schedule_owner_type
    and (
      ((v_context ->> 'owner_type') = 'artist' and artist_id = (v_context ->> 'artist_id')::uuid)
      or ((v_context ->> 'owner_type') = 'membership' and membership_id = (v_context ->> 'membership_id')::uuid)
    )
    and status <> 'archived'
  order by created_at desc
  limit 1
  for update;

  if v_schedule.id is null then
    insert into schedules (owner_type, artist_id, membership_id, timezone, slot_interval_minutes, status)
    values (
      (v_context ->> 'owner_type')::schedule_owner_type,
      case when (v_context ->> 'owner_type') = 'artist' then (v_context ->> 'artist_id')::uuid else null end,
      nullif(v_context ->> 'membership_id', '')::uuid,
      v_timezone,
      v_interval,
      'active'
    )
    returning *
    into v_schedule;
  else
    update schedules
    set timezone = v_timezone, slot_interval_minutes = v_interval, status = 'active', updated_at = now()
    where id = v_schedule.id
    returning *
    into v_schedule;
  end if;

  delete from schedule_rules where schedule_id = v_schedule.id;

  for v_day in select * from jsonb_array_elements(v_days)
  loop
    v_weekday := case lower(coalesce(v_day ->> 'day', v_day ->> 'label', ''))
      when 'domingo' then 0
      when 'lunes' then 1
      when 'martes' then 2
      when 'miercoles' then 3
      when 'miÃ©rcoles' then 3
      when 'jueves' then 4
      when 'viernes' then 5
      when 'sabado' then 6
      when 'sÃ¡bado' then 6
      else coalesce((v_day ->> 'weekday')::integer, null)
    end;

    if v_weekday is null or v_weekday < 0 or v_weekday > 6 then
      continue;
    end if;

    if coalesce((v_day ->> 'active')::boolean, (v_day ->> 'isActive')::boolean, false) then
      v_start_time := nullif(v_day ->> 'start', '')::time;
      v_end_time := nullif(v_day ->> 'end', '')::time;
      v_break_start_time := null;
      v_break_end_time := null;

      if jsonb_array_length(coalesce(v_day -> 'blocks', '[]'::jsonb)) > 0 then
        v_break_start_time := nullif((v_day -> 'blocks' -> 0 ->> 'start'), '')::time;
        v_break_end_time := nullif((v_day -> 'blocks' -> 0 ->> 'end'), '')::time;
      elsif nullif(v_day ->> 'breakStart', '') is not null and nullif(v_day ->> 'breakStart', '') <> '-' then
        v_break_start_time := nullif(v_day ->> 'breakStart', '')::time;
        v_break_end_time := nullif(v_day ->> 'breakEnd', '')::time;
      end if;

      insert into schedule_rules (schedule_id, weekday, is_active, start_time, end_time, break_start_time, break_end_time)
      values (v_schedule.id, v_weekday, true, v_start_time, v_end_time, v_break_start_time, v_break_end_time);
    else
      insert into schedule_rules (schedule_id, weekday, is_active)
      values (v_schedule.id, v_weekday, false);
    end if;
  end loop;

  delete from calendar_blocks
  where schedule_id = v_schedule.id
    and status = 'active'
    and reason = 'blocked_date';

  for v_blocked in select * from jsonb_array_elements(v_blocked_dates)
  loop
    v_date := nullif(coalesce(v_blocked ->> 'id', v_blocked ->> 'date'), '')::date;
    if v_date is null then
      continue;
    end if;

    insert into calendar_blocks (schedule_id, block_type, starts_at, ends_at, reason, status)
    values (
      v_schedule.id,
      'personal',
      (v_date::timestamp at time zone v_timezone),
      ((v_date + 1)::timestamp at time zone v_timezone),
      'blocked_date',
      'active'
    );
  end loop;

  delete from availability_slots
  where schedule_id = v_schedule.id
    and status in ('available', 'expired', 'hidden')
    and starts_at >= ((now() at time zone v_timezone)::date::timestamp at time zone v_timezone)
    and starts_at < ((v_generation_end + 1)::timestamp at time zone v_timezone);

  get diagnostics v_available_deleted = row_count;
  v_generation_date := (now() at time zone v_timezone)::date;

  while v_generation_date <= v_generation_end loop
    if not exists (
      select 1
      from calendar_blocks cb
      where cb.schedule_id = v_schedule.id
        and cb.status = 'active'
        and cb.starts_at < ((v_generation_date + 1)::timestamp at time zone v_timezone)
        and cb.ends_at > (v_generation_date::timestamp at time zone v_timezone)
    ) then
      select *
      into v_rule
      from schedule_rules
      where schedule_id = v_schedule.id
        and weekday = extract(dow from v_generation_date)::integer
        and is_active = true;

      if v_rule.id is not null then
        v_slot_start_local := v_generation_date + v_rule.start_time;

        while v_slot_start_local + make_interval(mins => v_interval) <= v_generation_date + v_rule.end_time loop
          v_slot_end_local := v_slot_start_local + make_interval(mins => v_interval);
          v_slot_start := v_slot_start_local at time zone v_timezone;
          v_slot_end := v_slot_end_local at time zone v_timezone;

          if (v_rule.break_start_time is null or v_rule.break_end_time is null
            or v_slot_end_local <= v_generation_date + v_rule.break_start_time
            or v_slot_start_local >= v_generation_date + v_rule.break_end_time)
            and v_slot_start >= now()
            and not exists (
              select 1
              from availability_slots existing
              where existing.schedule_id = v_schedule.id
                and existing.status in ('booked', 'held')
                and existing.starts_at < v_slot_end
                and existing.ends_at > v_slot_start
            ) then
            insert into availability_slots (schedule_id, artist_id, studio_id, membership_id, starts_at, ends_at, status)
            values (
              v_schedule.id,
              nullif(v_context ->> 'artist_id', '')::uuid,
              nullif(v_context ->> 'studio_id', '')::uuid,
              nullif(v_context ->> 'membership_id', '')::uuid,
              v_slot_start,
              v_slot_end,
              'available'
            );

            v_slots_inserted := v_slots_inserted + 1;
          end if;

          v_slot_start_local := v_slot_start_local + make_interval(mins => v_interval);
        end loop;
      end if;
    end if;

    v_generation_date := v_generation_date + 1;
  end loop;

  return public.studio_flow_artist_schedule_payload_for_context(p_context_type, p_membership_id)
    || jsonb_build_object(
      'availabilitySlotsDeleted', v_available_deleted,
      'availability_slots_deleted', v_available_deleted,
      'availabilitySlotsGenerated', v_slots_inserted,
      'availability_slots_generated', v_slots_inserted
    );
end;
$$;

revoke all on function public.studio_flow_artist_get_work_contexts() from public;
revoke all on function public.studio_flow_artist_assert_work_context(text, uuid) from public;
revoke all on function public.studio_flow_artist_get_context_service_offerings(text, uuid, boolean) from public;
revoke all on function public.studio_flow_artist_create_context_service_offering(jsonb, text, uuid) from public;
revoke all on function public.studio_flow_artist_assert_context_service(uuid) from public;
revoke all on function public.studio_flow_artist_update_context_service_offering(uuid, jsonb) from public;
revoke all on function public.studio_flow_artist_update_context_service_status(uuid, text, text) from public;
revoke all on function public.studio_flow_artist_schedule_payload_for_context(text, uuid) from public;
revoke all on function public.studio_flow_artist_get_context_schedule_settings(text, uuid) from public;
revoke all on function public.studio_flow_artist_save_context_schedule_settings(jsonb, text, uuid) from public;

grant execute on function public.studio_flow_artist_get_work_contexts() to authenticated;
grant execute on function public.studio_flow_artist_get_context_service_offerings(text, uuid, boolean) to authenticated;
grant execute on function public.studio_flow_artist_create_context_service_offering(jsonb, text, uuid) to authenticated;
grant execute on function public.studio_flow_artist_update_context_service_offering(uuid, jsonb) to authenticated;
grant execute on function public.studio_flow_artist_update_context_service_status(uuid, text, text) to authenticated;
grant execute on function public.studio_flow_artist_get_context_schedule_settings(text, uuid) to authenticated;
grant execute on function public.studio_flow_artist_save_context_schedule_settings(jsonb, text, uuid) to authenticated;
