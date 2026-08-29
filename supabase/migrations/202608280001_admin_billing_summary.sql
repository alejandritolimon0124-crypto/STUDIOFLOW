create or replace function public.studio_flow_admin_get_billing_summary(
  p_month date default current_date,
  p_query text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_month_start date := date_trunc('month', coalesce(p_month, current_date))::date;
  v_month_end date := (date_trunc('month', coalesce(p_month, current_date)) + interval '1 month')::date;
  v_today date := current_date;
  v_query text := lower(trim(coalesce(p_query, '')));
  v_entities jsonb;
  v_current_month_gross numeric := 0;
  v_current_month_commission numeric := 0;
begin
  perform public.studio_flow_admin_assert_platform_owner();

  with appointment_amounts as (
    select
      appt.id,
      appt.artist_id,
      appt.studio_id,
      appt.starts_at,
      coalesce(ae.gross_amount, so.price_amount, 0) as gross_amount,
      coalesce(ae.platform_fee_amount, round(coalesce(so.price_amount, 0) * 0.10), 0) as commission_amount
    from appointments appt
    join service_offerings so on so.id = appt.service_offering_id
    left join appointment_economies ae on ae.appointment_id = appt.id
    where appt.status <> 'cancelled'
  )
  select
    coalesce(sum(gross_amount) filter (where starts_at >= v_month_start and starts_at < v_month_end), 0),
    coalesce(sum(commission_amount) filter (where starts_at >= v_month_start and starts_at < v_month_end), 0)
  into v_current_month_gross, v_current_month_commission
  from appointment_amounts;

  with appointment_amounts as (
    select
      appt.id,
      appt.artist_id,
      appt.studio_id,
      appt.starts_at,
      coalesce(ae.gross_amount, so.price_amount, 0) as gross_amount,
      coalesce(ae.platform_fee_amount, round(coalesce(so.price_amount, 0) * 0.10), 0) as commission_amount,
      coalesce(comm.status::text, 'potential') as commission_status
    from appointments appt
    join service_offerings so on so.id = appt.service_offering_id
    left join appointment_economies ae on ae.appointment_id = appt.id
    left join commissions comm on comm.appointment_id = appt.id
    where appt.status <> 'cancelled'
  ),
  studio_entities as (
    select
      s.id,
      'studio'::text as type,
      coalesce(sp.commercial_name, s.name, 'Estudio') as name,
      coalesce(sp.email, owner_profile.email, '') as email,
      coalesce(sp.phone, owner_profile.phone, '') as phone,
      coalesce(sum(aa.gross_amount) filter (where aa.starts_at >= v_month_start and aa.starts_at < v_month_end), 0) as current_month_gross,
      coalesce(sum(aa.commission_amount) filter (where aa.starts_at >= v_month_start and aa.starts_at < v_month_end), 0) as current_month_commission,
      coalesce(sum(aa.commission_amount) filter (where aa.starts_at::date = v_today), 0) as today_commission,
      coalesce(sum(aa.commission_amount) filter (
        where aa.starts_at < v_month_start
          and aa.commission_status in ('chargeable', 'disputed', 'adjusted')
      ), 0) as overdue_commission,
      count(aa.id) filter (where aa.starts_at >= v_month_start and aa.starts_at < v_month_end) as appointment_count
    from studios s
    left join studio_profiles sp on sp.studio_id = s.id
    left join profiles owner_profile on owner_profile.id = s.owner_profile_id
    left join appointment_amounts aa on aa.studio_id = s.id
    where s.archived_at is null
    group by s.id, sp.commercial_name, sp.email, sp.phone, owner_profile.email, owner_profile.phone
  ),
  artist_entities as (
    select
      a.id,
      'artist'::text as type,
      coalesce(ap.artistic_name, a.display_name, p.display_name, 'Artista') as name,
      coalesce(p.email, '') as email,
      coalesce(p.phone, '') as phone,
      coalesce(sum(aa.gross_amount) filter (where aa.starts_at >= v_month_start and aa.starts_at < v_month_end), 0) as current_month_gross,
      coalesce(sum(aa.commission_amount) filter (where aa.starts_at >= v_month_start and aa.starts_at < v_month_end), 0) as current_month_commission,
      coalesce(sum(aa.commission_amount) filter (where aa.starts_at::date = v_today), 0) as today_commission,
      coalesce(sum(aa.commission_amount) filter (
        where aa.starts_at < v_month_start
          and aa.commission_status in ('chargeable', 'disputed', 'adjusted')
      ), 0) as overdue_commission,
      count(aa.id) filter (where aa.starts_at >= v_month_start and aa.starts_at < v_month_end) as appointment_count
    from artists a
    left join profiles p on p.id = a.profile_id
    left join artist_profiles ap on ap.artist_id = a.id
    left join appointment_amounts aa on aa.artist_id = a.id
    where a.status <> 'archived'
    group by a.id, ap.artistic_name, a.display_name, p.display_name, p.email, p.phone
  ),
  all_entities as (
    select * from studio_entities
    union all
    select * from artist_entities
  ),
  filtered_entities as (
    select *
    from all_entities
    where v_query = ''
      or lower(name) like '%' || v_query || '%'
      or lower(email) like '%' || v_query || '%'
      or lower(phone) like '%' || v_query || '%'
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'type', type,
        'name', name,
        'email', email,
        'phone', phone,
        'currentMonthGross', current_month_gross,
        'current_month_gross', current_month_gross,
        'currentMonthCommission', current_month_commission,
        'current_month_commission', current_month_commission,
        'todayCommission', today_commission,
        'today_commission', today_commission,
        'overdueCommission', overdue_commission,
        'overdue_commission', overdue_commission,
        'appointmentCount', appointment_count,
        'appointment_count', appointment_count,
        'status', case when overdue_commission > 0 then 'overdue' else 'current' end
      )
      order by overdue_commission desc, current_month_commission desc, name
    ),
    '[]'::jsonb
  )
  into v_entities
  from filtered_entities;

  return jsonb_build_object(
    'source', 'supabase',
    'month', to_char(v_month_start, 'YYYY-MM'),
    'currentMonthGross', v_current_month_gross,
    'current_month_gross', v_current_month_gross,
    'currentMonthCommission', v_current_month_commission,
    'current_month_commission', v_current_month_commission,
    'currentStudios', (
      select count(*) from jsonb_array_elements(v_entities) item
      where item ->> 'type' = 'studio' and item ->> 'status' = 'current'
    ),
    'current_studios', (
      select count(*) from jsonb_array_elements(v_entities) item
      where item ->> 'type' = 'studio' and item ->> 'status' = 'current'
    ),
    'overdueStudios', (
      select count(*) from jsonb_array_elements(v_entities) item
      where item ->> 'type' = 'studio' and item ->> 'status' = 'overdue'
    ),
    'overdue_studios', (
      select count(*) from jsonb_array_elements(v_entities) item
      where item ->> 'type' = 'studio' and item ->> 'status' = 'overdue'
    ),
    'currentArtists', (
      select count(*) from jsonb_array_elements(v_entities) item
      where item ->> 'type' = 'artist' and item ->> 'status' = 'current'
    ),
    'current_artists', (
      select count(*) from jsonb_array_elements(v_entities) item
      where item ->> 'type' = 'artist' and item ->> 'status' = 'current'
    ),
    'overdueArtists', (
      select count(*) from jsonb_array_elements(v_entities) item
      where item ->> 'type' = 'artist' and item ->> 'status' = 'overdue'
    ),
    'overdue_artists', (
      select count(*) from jsonb_array_elements(v_entities) item
      where item ->> 'type' = 'artist' and item ->> 'status' = 'overdue'
    ),
    'entities', v_entities
  );
end;
$$;

revoke all on function public.studio_flow_admin_get_billing_summary(date, text) from public;
grant execute on function public.studio_flow_admin_get_billing_summary(date, text) to authenticated;
