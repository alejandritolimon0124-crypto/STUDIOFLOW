create or replace function public.studio_flow_sync_appointment_commission(
  p_appointment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appointment appointments%rowtype;
  v_service service_offerings%rowtype;
  v_economy appointment_economies%rowtype;
  v_commission commissions%rowtype;
  v_gross_amount numeric := 0;
  v_platform_fee_amount numeric := 0;
  v_artist_revenue_amount numeric := 0;
  v_economy_status appointment_economy_status := 'quoted';
  v_commission_status commission_status := 'potential';
  v_earned_at timestamptz := null;
  v_chargeable_at timestamptz := null;
begin
  if p_appointment_id is null then
    raise exception 'Appointment is required';
  end if;

  select *
  into v_appointment
  from appointments
  where id = p_appointment_id;

  if v_appointment.id is null then
    raise exception 'Appointment not found';
  end if;

  select *
  into v_service
  from service_offerings
  where id = v_appointment.service_offering_id;

  if v_service.id is null then
    raise exception 'Service offering not found';
  end if;

  v_gross_amount := coalesce(v_service.price_amount, 0);
  v_platform_fee_amount := round(v_gross_amount * 0.10, 2);
  v_artist_revenue_amount := greatest(v_gross_amount - v_platform_fee_amount, 0);

  if v_appointment.status = 'completed' then
    v_economy_status := 'earned';
    v_commission_status := 'chargeable';
    v_earned_at := coalesce(v_appointment.completed_at, now());
    v_chargeable_at := v_earned_at;
  end if;

  insert into appointment_economies (
    appointment_id,
    gross_amount,
    platform_fee_amount,
    artist_revenue_amount,
    studio_revenue_amount,
    currency,
    calculation_status,
    calculation_version,
    earned_at,
    updated_at
  )
  values (
    v_appointment.id,
    v_gross_amount,
    v_platform_fee_amount,
    v_artist_revenue_amount,
    null,
    'MXN',
    v_economy_status,
    'studio-flow-commission-10-v3-scheduled-due',
    v_earned_at,
    now()
  )
  on conflict (appointment_id) do update
  set gross_amount = excluded.gross_amount,
      platform_fee_amount = excluded.platform_fee_amount,
      artist_revenue_amount = excluded.artist_revenue_amount,
      studio_revenue_amount = excluded.studio_revenue_amount,
      currency = excluded.currency,
      calculation_status = excluded.calculation_status,
      calculation_version = excluded.calculation_version,
      earned_at = excluded.earned_at,
      updated_at = now()
  returning *
  into v_economy;

  insert into commissions (
    appointment_id,
    appointment_economy_id,
    amount,
    rate,
    currency,
    status,
    chargeable_at,
    updated_at
  )
  values (
    v_appointment.id,
    v_economy.id,
    v_platform_fee_amount,
    0.10,
    'MXN',
    v_commission_status,
    v_chargeable_at,
    now()
  )
  on conflict (appointment_id) do update
  set appointment_economy_id = excluded.appointment_economy_id,
      amount = excluded.amount,
      rate = excluded.rate,
      currency = excluded.currency,
      status = excluded.status,
      chargeable_at = excluded.chargeable_at,
      updated_at = now()
  where commissions.status <> 'adjusted'
  returning *
  into v_commission;

  return jsonb_build_object(
    'appointmentId', v_appointment.id,
    'appointment_id', v_appointment.id,
    'grossAmount', v_gross_amount,
    'gross_amount', v_gross_amount,
    'platformFeeAmount', v_platform_fee_amount,
    'platform_fee_amount', v_platform_fee_amount,
    'artistRevenueAmount', v_artist_revenue_amount,
    'artist_revenue_amount', v_artist_revenue_amount,
    'commissionStatus', v_commission_status,
    'commission_status', v_commission_status
  );
end;
$$;

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
      coalesce(comm.amount, ae.platform_fee_amount, round(coalesce(so.price_amount, 0) * 0.10, 2), 0) as commission_amount,
      coalesce(comm.status::text, 'potential') as commission_status
    from appointments appt
    join service_offerings so on so.id = appt.service_offering_id
  left join appointment_economies ae on ae.appointment_id = appt.id
    left join commissions comm on comm.appointment_id = appt.id
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
      coalesce(comm.amount, ae.platform_fee_amount, round(coalesce(so.price_amount, 0) * 0.10, 2), 0) as commission_amount,
      coalesce(comm.status::text, 'potential') as commission_status
    from appointments appt
    join service_offerings so on so.id = appt.service_offering_id
    left join appointment_economies ae on ae.appointment_id = appt.id
    left join commissions comm on comm.appointment_id = appt.id
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

select public.studio_flow_sync_appointment_commission(id)
from appointments;

revoke all on function public.studio_flow_sync_appointment_commission(uuid) from public;
grant execute on function public.studio_flow_sync_appointment_commission(uuid) to authenticated;

revoke all on function public.studio_flow_admin_get_billing_summary(date, text) from public;
grant execute on function public.studio_flow_admin_get_billing_summary(date, text) to authenticated;
