alter table client_profiles
  add column if not exists photo_path text;

create or replace function public.studio_flow_get_own_client_profile()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile profiles%rowtype;
  v_client clients%rowtype;
  v_client_profile client_profiles%rowtype;
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
  order by created_at
  limit 1;

  if v_client.id is null then
    return jsonb_build_object('client', null, 'clientProfile', null);
  end if;

  insert into client_profiles (client_id)
  values (v_client.id)
  on conflict (client_id) do nothing;

  select *
  into v_client_profile
  from client_profiles
  where client_id = v_client.id;

  return jsonb_build_object(
    'client', to_jsonb(v_client),
    'clientProfile', to_jsonb(v_client_profile),
    'client_profile', to_jsonb(v_client_profile)
  );
end;
$$;

create or replace function public.studio_flow_update_own_client_profile(
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile profiles%rowtype;
  v_client clients%rowtype;
  v_client_profile client_profiles%rowtype;
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
  order by created_at
  limit 1;

  if v_client.id is null then
    raise exception 'Client profile required';
  end if;

  update clients
  set
    display_name = coalesce(nullif(trim(p_patch ->> 'name'), ''), nullif(trim(p_patch ->> 'display_name'), ''), display_name),
    email = coalesce(nullif(trim(p_patch ->> 'email'), ''), email),
    phone = coalesce(nullif(trim(p_patch ->> 'phone'), ''), phone),
    updated_at = now()
  where id = v_client.id
  returning * into v_client;

  insert into client_profiles (
    client_id,
    photo_path
  )
  values (
    v_client.id,
    nullif(p_patch ->> 'photoUrl', '')
  )
  on conflict (client_id) do update
  set
    photo_path = case
      when p_patch ? 'photoUrl' then nullif(p_patch ->> 'photoUrl', '')
      when p_patch ? 'photo_path' then nullif(p_patch ->> 'photo_path', '')
      else client_profiles.photo_path
    end,
    updated_at = now()
  returning * into v_client_profile;

  return jsonb_build_object(
    'client', to_jsonb(v_client),
    'clientProfile', to_jsonb(v_client_profile),
    'client_profile', to_jsonb(v_client_profile)
  );
end;
$$;

create or replace function public.studio_flow_artist_get_clients(
  p_search text default null,
  p_limit integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile profiles%rowtype;
  v_artist artists%rowtype;
  v_clients jsonb;
  v_search text := lower(trim(coalesce(p_search, '')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 5), 5));
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
  order by created_at
  limit 1;

  if v_artist.id is null then
    return jsonb_build_object('clients', '[]'::jsonb);
  end if;

  with client_rollup as (
    select
      c.id,
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
      ) as history
    from appointments appt
    join clients c on c.id = appt.client_id
    left join client_profiles cp on cp.client_id = c.id
    join service_offerings so on so.id = appt.service_offering_id
    where appt.artist_id = v_artist.id
      and c.status <> 'archived'
    group by c.id, c.display_name, c.email, c.phone, cp.photo_path
  ),
  filtered_clients as (
    select *
    from client_rollup
    where v_search = ''
      or lower(coalesce(display_name, '')) like '%' || v_search || '%'
      or lower(coalesce(phone, '')) like '%' || v_search || '%'
      or lower(coalesce(email, '')) like '%' || v_search || '%'
    order by last_visit_at desc nulls last, display_name asc
    limit v_limit
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
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
        'lastVisit', to_char(last_visit_at at time zone 'America/Mexico_City', 'YYYY-MM-DD'),
        'history', coalesce(history, '[]'::jsonb)
      )
    ),
    '[]'::jsonb
  )
  into v_clients
  from filtered_clients;

  return jsonb_build_object('clients', v_clients);
end;
$$;

revoke all on function public.studio_flow_get_own_client_profile() from public;
revoke all on function public.studio_flow_update_own_client_profile(jsonb) from public;
revoke all on function public.studio_flow_artist_get_clients(text, integer) from public;

grant execute on function public.studio_flow_get_own_client_profile() to authenticated;
grant execute on function public.studio_flow_update_own_client_profile(jsonb) to authenticated;
grant execute on function public.studio_flow_artist_get_clients(text, integer) to authenticated;
