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

  with related_client_rollup as (
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
      ) as history,
      1 as relationship_rank
    from appointments appt
    join clients c on c.id = appt.client_id
    left join client_profiles cp on cp.client_id = c.id
    join service_offerings so on so.id = appt.service_offering_id
    where appt.artist_id = v_artist.id
      and c.status <> 'archived'
    group by c.id, c.display_name, c.email, c.phone, cp.photo_path
  ),
  registered_client_matches as (
    select
      c.id,
      c.display_name,
      c.email,
      c.phone,
      cp.photo_path,
      0::integer as total_visits,
      null::timestamptz as last_visit_at,
      '[]'::jsonb as history,
      0 as relationship_rank
    from clients c
    left join client_profiles cp on cp.client_id = c.id
    where v_search <> ''
      and c.status <> 'archived'
      and (
        lower(coalesce(c.display_name, '')) like '%' || v_search || '%'
        or lower(coalesce(c.phone, '')) like '%' || v_search || '%'
        or lower(coalesce(c.email, '')) like '%' || v_search || '%'
      )
      and not exists (
        select 1
        from related_client_rollup related
        where related.id = c.id
      )
  ),
  filtered_clients as (
    select *
    from related_client_rollup
    where v_search = ''
      or lower(coalesce(display_name, '')) like '%' || v_search || '%'
      or lower(coalesce(phone, '')) like '%' || v_search || '%'
      or lower(coalesce(email, '')) like '%' || v_search || '%'

    union all

    select *
    from registered_client_matches
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

revoke all on function public.studio_flow_artist_get_clients(text, integer) from public;
grant execute on function public.studio_flow_artist_get_clients(text, integer) to authenticated;
