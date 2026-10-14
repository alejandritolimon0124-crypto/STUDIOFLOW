-- Provider growth signals are derived from appointments and their recorded booking source.
-- The first recorded marketplace booking is evidence of discovery in Studio Flow,
-- not proof that the client had no previous offline relationship.
create or replace function public.studio_flow_growth_metrics_internal(
  p_artist_id uuid,
  p_studio_id uuid,
  p_months integer default 6
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_today date := (now() at time zone 'America/Mexico_City')::date;
  v_month date := date_trunc('month', (now() at time zone 'America/Mexico_City'))::date;
  v_from date;
  v_result jsonb;
begin
  if (p_artist_id is null) = (p_studio_id is null) then
    raise exception 'Selecciona exactamente un negocio';
  end if;
  if p_months not between 1 and 6 then raise exception 'Periodo invalido'; end if;
  v_from := (v_month - make_interval(months => p_months - 1))::date;

  with scoped as (
    select a.id, a.client_id, a.service_offering_id, a.starts_at,
      (a.starts_at at time zone 'America/Mexico_City')::date as local_day,
      a.status, a.booking_source::text as source, a.confirmation_requested_at,
      a.reschedule_count, a.cancelled_by_provider, a.promotion_id,
      coalesce(e.gross_amount, 0) as amount,
      coalesce(c.amount, e.platform_fee_amount, 0) as fee,
      row_number() over (partition by a.client_id order by a.starts_at, a.id) as visit_number,
      first_value(a.booking_source::text) over (partition by a.client_id order by a.starts_at, a.id) as first_source
    from public.appointments a
    left join public.appointment_economies e on e.appointment_id = a.id
    left join public.commissions c on c.appointment_id = a.id
    where (p_studio_id is not null and a.studio_id = p_studio_id)
       or (p_artist_id is not null and a.artist_id = p_artist_id and a.studio_id is null)
  ), current_month as (
    select * from scoped where local_day >= v_month and local_day < (v_month + interval '1 month')::date
  ), previous_month as (
    select coalesce(sum(amount) filter (where status = 'completed'), 0) as revenue
    from scoped where local_day >= (v_month - interval '1 month')::date and local_day < v_month
  ), totals as (
    select coalesce(sum(amount) filter (where status = 'completed'), 0) as revenue,
      count(*) filter (where status = 'completed') as completed,
      count(distinct client_id) filter (where status = 'completed') as served_clients,
      count(distinct client_id) filter (where status = 'completed' and visit_number = 1) as first_clients,
      count(distinct client_id) filter (where status = 'completed' and visit_number > 1) as returning_clients,
      count(distinct client_id) filter (where status = 'completed' and visit_number = 1 and source = 'marketplace') as marketplace_first_clients,
      coalesce(sum(amount) filter (where status = 'completed' and visit_number = 1 and source = 'marketplace'), 0) as marketplace_first_revenue,
      count(distinct client_id) filter (where status = 'completed' and visit_number > 1 and first_source = 'marketplace') as marketplace_returning_clients,
      coalesce(sum(amount) filter (where status = 'completed' and visit_number > 1 and first_source = 'marketplace'), 0) as marketplace_returning_revenue,
      count(*) filter (where source in ('marketplace','google','client_portal')) as self_booked,
      count(*) filter (where confirmation_requested_at is not null) as confirmation_requests,
      count(*) filter (where status = 'cancelled') as cancelled,
      coalesce(sum(reschedule_count), 0) as rescheduled,
      count(*) filter (where status = 'completed' and promotion_id is not null) as promotion_bookings,
      coalesce(sum(amount) filter (where status = 'completed' and promotion_id is not null), 0) as promotion_revenue,
      coalesce(sum(fee) filter (where status = 'completed' or (status = 'cancelled' and cancelled_by_provider)), 0) as commission
    from current_month
  ), months as (
    select to_char(m.month_start, 'YYYY-MM') as month,
      coalesce(sum(s.amount) filter (where s.status = 'completed'), 0) as revenue,
      count(s.id) filter (where s.status = 'completed') as completed,
      count(distinct s.client_id) filter (where s.status = 'completed' and s.visit_number = 1) as new_clients
    from generate_series(v_from, v_month, interval '1 month') as m(month_start)
    left join scoped s on s.local_day >= m.month_start::date
      and s.local_day < (m.month_start + interval '1 month')::date
    group by m.month_start
  )
  select jsonb_build_object(
    'month', v_month, 'periodStart', v_from, 'months', p_months,
    'revenue', t.revenue, 'previousRevenue', p.revenue,
    'completed', t.completed, 'servedClients', t.served_clients,
    'firstClients', t.first_clients, 'returningClients', t.returning_clients,
    'marketplaceFirstClients', t.marketplace_first_clients,
    'marketplaceFirstRevenue', t.marketplace_first_revenue,
    'marketplaceReturningClients', t.marketplace_returning_clients,
    'marketplaceReturningRevenue', t.marketplace_returning_revenue,
    'selfBooked', t.self_booked, 'confirmationRequests', t.confirmation_requests,
    'cancelled', t.cancelled, 'rescheduled', t.rescheduled,
    'promotionBookings', t.promotion_bookings, 'promotionRevenue', t.promotion_revenue,
    'commission', t.commission,
    'series', (select coalesce(jsonb_agg(to_jsonb(m) order by m.month), '[]'::jsonb) from months m),
    'firstBookingSources', (
      select jsonb_build_object(
        'marketplace', count(*) filter (where source = 'marketplace'),
        'googleLink', count(*) filter (where source = 'google'),
        'other', count(*) filter (where source not in ('marketplace','google'))
      ) from current_month where status = 'completed' and visit_number = 1
    ),
    'topService', (
      select jsonb_build_object('name', so.name, 'revenue', sum(cm.amount), 'count', count(*))
      from current_month cm join public.service_offerings so on so.id = cm.service_offering_id
      where cm.status = 'completed' group by so.id, so.name order by sum(cm.amount) desc limit 1
    ),
    'inactiveClients', (
      select count(*) from (
        select client_id, max(local_day) as last_visit from scoped
        where status = 'completed' group by client_id
      ) last_visit where last_visit.last_visit between v_today - 180 and v_today - 60
    ),
    'availableNextWeek', (
      select count(*) from public.availability_slots slot
      where slot.status = 'available'
        and slot.starts_at >= now() and slot.starts_at < now() + interval '7 days'
        and ((p_studio_id is not null and slot.studio_id = p_studio_id)
          or (p_artist_id is not null and slot.artist_id = p_artist_id and slot.studio_id is null))
    ),
    'quietWindow', (
      select jsonb_build_object('weekday', q.weekday, 'hour', q.hour, 'slots', q.slots)
      from (
        select extract(isodow from slot.starts_at at time zone 'America/Mexico_City')::integer as weekday,
          extract(hour from slot.starts_at at time zone 'America/Mexico_City')::integer as hour,
          count(*) as slots
        from public.availability_slots slot
        where slot.status = 'available'
          and slot.starts_at >= now() and slot.starts_at < now() + interval '14 days'
          and ((p_studio_id is not null and slot.studio_id = p_studio_id)
            or (p_artist_id is not null and slot.artist_id = p_artist_id and slot.studio_id is null))
        group by 1, 2 order by count(*) desc limit 1
      ) q
    ),
    'pointsVisits', (
      select count(distinct cm.id) from current_month cm
      join public.flow_point_ledger l on l.appointment_id = cm.id
      where cm.status = 'completed' and l.movement_type = 'earn'
    ),
    'redemptionVisits', (
      select count(distinct cm.id) from current_month cm
      join public.flow_point_ledger l on l.appointment_id = cm.id
      where cm.status = 'completed' and l.movement_type = 'spend'
    )
  ) into v_result from totals t cross join previous_month p;
  return v_result;
end;
$$;

revoke all on function public.studio_flow_growth_metrics_internal(uuid, uuid, integer) from public, anon, authenticated;

create or replace function public.studio_flow_get_growth_report(p_studio_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_artist_id uuid;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and status = 'active') then
    raise exception 'Sesion activa requerida';
  end if;
  if p_studio_id is not null then
    perform public.studio_flow_owner_assert_studio_access(p_studio_id);
  else
    select id into v_artist_id from public.artists
    where profile_id = auth.uid() and archived_at is null;
    if v_artist_id is null then raise exception 'Perfil de artista requerido'; end if;
  end if;
  return public.studio_flow_growth_metrics_internal(v_artist_id, p_studio_id, 6);
end;
$$;
revoke all on function public.studio_flow_get_growth_report(uuid) from public, anon;
grant execute on function public.studio_flow_get_growth_report(uuid) to authenticated;

create or replace function public.studio_flow_admin_get_growth_report()
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_items jsonb;
begin
  perform public.studio_flow_admin_assert_platform_owner();
  select coalesce(jsonb_agg(row_data order by row_data->>'name'), '[]'::jsonb) into v_items
  from (
    select jsonb_build_object('id', s.id, 'type', 'studio',
      'name', coalesce(sp.commercial_name, s.name), 'joinedAt', s.created_at,
      'metrics', public.studio_flow_growth_metrics_internal(null, s.id, 6)) as row_data
    from public.studios s left join public.studio_profiles sp on sp.studio_id = s.id
    where s.archived_at is null
    union all
    select jsonb_build_object('id', a.id, 'type', 'artist',
      'name', coalesce(ap.artistic_name, a.display_name), 'joinedAt', a.created_at,
      'metrics', public.studio_flow_growth_metrics_internal(a.id, null, 6)) as row_data
    from public.artists a left join public.artist_profiles ap on ap.artist_id = a.id
    where a.archived_at is null
      and (not exists (select 1 from public.artist_studio_memberships m
        where m.artist_id = a.id and m.status = 'active' and m.archived_at is null)
        or exists (select 1 from public.appointments independent
          where independent.artist_id = a.id and independent.studio_id is null))
  ) rows;
  return jsonb_build_object('months', 6, 'entities', v_items);
end;
$$;
revoke all on function public.studio_flow_admin_get_growth_report() from public, anon;
grant execute on function public.studio_flow_admin_get_growth_report() to authenticated;
