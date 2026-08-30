with duplicate_candidates as (
  select
    orphan.id as orphan_client_id,
    registered.id as registered_client_id,
    row_number() over (
      partition by orphan.id
      order by registered.created_at asc
    ) as match_rank
  from clients orphan
  join clients registered
    on registered.profile_id is not null
   and registered.status <> 'archived'
   and orphan.id <> registered.id
   and (
     regexp_replace(lower(coalesce(registered.display_name, '')), '[^a-z0-9]+', ' ', 'g')
       like regexp_replace(lower(coalesce(orphan.display_name, '')), '[^a-z0-9]+', ' ', 'g') || '%'
     or (
       nullif(regexp_replace(coalesce(orphan.phone, ''), '\D', '', 'g'), '') is not null
       and regexp_replace(coalesce(registered.phone, ''), '\D', '', 'g') = regexp_replace(coalesce(orphan.phone, ''), '\D', '', 'g')
     )
     or (
       nullif(lower(trim(coalesce(orphan.email, ''))), '') is not null
       and lower(trim(coalesce(registered.email, ''))) = lower(trim(coalesce(orphan.email, '')))
     )
   )
  where orphan.profile_id is null
    and orphan.status <> 'archived'
),
best_matches as (
  select orphan_client_id, registered_client_id
  from duplicate_candidates
  where match_rank = 1
),
moved_appointments as (
  update appointments appointment
  set
    client_id = best_matches.registered_client_id,
    updated_at = now()
  from best_matches
  where appointment.client_id = best_matches.orphan_client_id
  returning best_matches.orphan_client_id
)
update clients orphan
set
  status = 'archived',
  archived_at = now(),
  updated_at = now()
where orphan.id in (
  select distinct orphan_client_id
  from moved_appointments
);

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
    and coalesce(status::text, 'active') = 'active';

  if v_profile.id is null then
    raise exception 'Active profile required';
  end if;

  select *
  into v_artist
  from artists
  where profile_id = v_profile.id
    and coalesce(status::text, 'active') <> 'archived'
  order by created_at
  limit 1;

  if v_artist.id is null then
    return jsonb_build_object('clients', '[]'::jsonb);
  end if;

  with related_client_rollup as (
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
    from appointments appt
    join clients c on c.id = appt.client_id
    left join client_profiles cp on cp.client_id = c.id
    join service_offerings so on so.id = appt.service_offering_id
    where appt.artist_id = v_artist.id
      and coalesce(c.status::text, 'active') <> 'archived'
    group by c.id, c.profile_id, c.display_name, c.email, c.phone, cp.photo_path
  ),
  registered_client_matches as (
    select
      c.id,
      c.profile_id,
      c.display_name,
      c.email,
      c.phone,
      cp.photo_path,
      0::integer as total_visits,
      null::timestamptz as last_visit_at,
      '[]'::jsonb as history,
      case when c.profile_id is not null then 2 else 0 end as relationship_rank
    from clients c
    left join client_profiles cp on cp.client_id = c.id
    where v_search <> ''
      and coalesce(c.status::text, 'active') <> 'archived'
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

revoke all on function public.studio_flow_artist_get_clients(text, integer) from public;
grant execute on function public.studio_flow_artist_get_clients(text, integer) to authenticated;
