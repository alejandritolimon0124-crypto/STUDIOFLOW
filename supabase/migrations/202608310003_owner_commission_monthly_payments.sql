create table if not exists public.studio_flow_commission_payments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('studio', 'artist')),
  entity_id uuid not null,
  billing_month date not null,
  gross_amount numeric not null default 0,
  commission_amount numeric not null default 0,
  paid_amount numeric not null default 0,
  payment_method text,
  notes text,
  paid_by_profile_id uuid references profiles(id),
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint studio_flow_commission_payments_month_start check (billing_month = date_trunc('month', billing_month)::date),
  constraint studio_flow_commission_payments_unique unique (entity_type, entity_id, billing_month)
);

create index if not exists studio_flow_commission_payments_entity_idx
on public.studio_flow_commission_payments (entity_type, entity_id, billing_month);

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
      appt.starts_at::date as appointment_date,
      date_trunc('month', appt.starts_at)::date as billing_month,
      coalesce(ae.gross_amount, so.price_amount, 0) as gross_amount,
      coalesce(comm.amount, ae.platform_fee_amount, round(coalesce(so.price_amount, 0) * 0.10, 2), 0) as commission_amount
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
      appt.starts_at::date as appointment_date,
      date_trunc('month', appt.starts_at)::date as billing_month,
      coalesce(ae.gross_amount, so.price_amount, 0) as gross_amount,
      coalesce(comm.amount, ae.platform_fee_amount, round(coalesce(so.price_amount, 0) * 0.10, 2), 0) as commission_amount
    from appointments appt
    join service_offerings so on so.id = appt.service_offering_id
    left join appointment_economies ae on ae.appointment_id = appt.id
    left join commissions comm on comm.appointment_id = appt.id
  ),
  studio_months as (
    select
      'studio'::text as entity_type,
      aa.studio_id as entity_id,
      aa.billing_month,
      sum(aa.gross_amount) as gross_amount,
      sum(aa.commission_amount) as commission_amount,
      count(*) as appointment_count,
      sum(aa.commission_amount) filter (where aa.appointment_date = v_today) as today_commission
    from appointment_amounts aa
    where aa.studio_id is not null
    group by aa.studio_id, aa.billing_month
  ),
  artist_months as (
    select
      'artist'::text as entity_type,
      aa.artist_id as entity_id,
      aa.billing_month,
      sum(aa.gross_amount) as gross_amount,
      sum(aa.commission_amount) as commission_amount,
      count(*) as appointment_count,
      sum(aa.commission_amount) filter (where aa.appointment_date = v_today) as today_commission
    from appointment_amounts aa
    where aa.artist_id is not null
    group by aa.artist_id, aa.billing_month
  ),
  entity_months as (
    select * from studio_months
    union all
    select * from artist_months
  ),
  studio_entities as (
    select
      s.id,
      'studio'::text as type,
      coalesce(sp.commercial_name, s.name, 'Estudio') as name,
      coalesce(sp.email, owner_profile.email, '') as email,
      coalesce(sp.phone, owner_profile.phone, '') as phone,
      coalesce(sum(em.gross_amount) filter (where em.billing_month = v_month_start), 0) as current_month_gross,
      coalesce(sum(em.commission_amount) filter (where em.billing_month = v_month_start), 0) as current_month_commission,
      coalesce(sum(pay.paid_amount) filter (where em.billing_month = v_month_start), 0) as current_month_paid,
      coalesce(sum(em.commission_amount) filter (where em.billing_month = v_month_start), 0)
        - coalesce(sum(pay.paid_amount) filter (where em.billing_month = v_month_start), 0) as current_month_unpaid,
      coalesce(sum(em.commission_amount) filter (where em.billing_month < v_month_start), 0)
        - coalesce(sum(pay.paid_amount) filter (where em.billing_month < v_month_start), 0) as overdue_commission,
      coalesce(sum(em.commission_amount) filter (where em.billing_month <= v_month_start), 0)
        - coalesce(sum(pay.paid_amount) filter (where em.billing_month <= v_month_start), 0) as unpaid_commission,
      coalesce(sum(em.today_commission), 0) as today_commission,
      coalesce(sum(em.appointment_count) filter (where em.billing_month = v_month_start), 0) as appointment_count
    from studios s
    left join studio_profiles sp on sp.studio_id = s.id
    left join profiles owner_profile on owner_profile.id = s.owner_profile_id
    left join entity_months em on em.entity_type = 'studio' and em.entity_id = s.id
    left join studio_flow_commission_payments pay on pay.entity_type = em.entity_type and pay.entity_id = em.entity_id and pay.billing_month = em.billing_month
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
      coalesce(sum(em.gross_amount) filter (where em.billing_month = v_month_start), 0) as current_month_gross,
      coalesce(sum(em.commission_amount) filter (where em.billing_month = v_month_start), 0) as current_month_commission,
      coalesce(sum(pay.paid_amount) filter (where em.billing_month = v_month_start), 0) as current_month_paid,
      coalesce(sum(em.commission_amount) filter (where em.billing_month = v_month_start), 0)
        - coalesce(sum(pay.paid_amount) filter (where em.billing_month = v_month_start), 0) as current_month_unpaid,
      coalesce(sum(em.commission_amount) filter (where em.billing_month < v_month_start), 0)
        - coalesce(sum(pay.paid_amount) filter (where em.billing_month < v_month_start), 0) as overdue_commission,
      coalesce(sum(em.commission_amount) filter (where em.billing_month <= v_month_start), 0)
        - coalesce(sum(pay.paid_amount) filter (where em.billing_month <= v_month_start), 0) as unpaid_commission,
      coalesce(sum(em.today_commission), 0) as today_commission,
      coalesce(sum(em.appointment_count) filter (where em.billing_month = v_month_start), 0) as appointment_count
    from artists a
    left join profiles p on p.id = a.profile_id
    left join artist_profiles ap on ap.artist_id = a.id
    left join entity_months em on em.entity_type = 'artist' and em.entity_id = a.id
    left join studio_flow_commission_payments pay on pay.entity_type = em.entity_type and pay.entity_id = em.entity_id and pay.billing_month = em.billing_month
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
        'currentMonthGross', greatest(current_month_gross, 0),
        'current_month_gross', greatest(current_month_gross, 0),
        'currentMonthCommission', greatest(current_month_commission, 0),
        'current_month_commission', greatest(current_month_commission, 0),
        'currentMonthPaid', greatest(current_month_paid, 0),
        'current_month_paid', greatest(current_month_paid, 0),
        'currentMonthUnpaid', greatest(current_month_unpaid, 0),
        'current_month_unpaid', greatest(current_month_unpaid, 0),
        'todayCommission', greatest(today_commission, 0),
        'today_commission', greatest(today_commission, 0),
        'overdueCommission', greatest(overdue_commission, 0),
        'overdue_commission', greatest(overdue_commission, 0),
        'unpaidCommission', greatest(unpaid_commission, 0),
        'unpaid_commission', greatest(unpaid_commission, 0),
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

create or replace function public.studio_flow_admin_mark_commission_paid(
  p_entity_type text,
  p_entity_id uuid,
  p_month date default current_date,
  p_payment_method text default 'manual',
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_month_start date := date_trunc('month', coalesce(p_month, current_date))::date;
  v_paid_months integer := 0;
  v_gross_amount numeric := 0;
  v_commission_amount numeric := 0;
begin
  perform public.studio_flow_admin_assert_platform_owner();

  if p_entity_type not in ('studio', 'artist') then
    raise exception 'Invalid entity type';
  end if;

  with appointment_amounts as (
    select
      appt.id,
      date_trunc('month', appt.starts_at)::date as billing_month,
      coalesce(ae.gross_amount, so.price_amount, 0) as gross_amount,
      coalesce(comm.amount, ae.platform_fee_amount, round(coalesce(so.price_amount, 0) * 0.10, 2), 0) as commission_amount
    from appointments appt
    join service_offerings so on so.id = appt.service_offering_id
    left join appointment_economies ae on ae.appointment_id = appt.id
    left join commissions comm on comm.appointment_id = appt.id
    where date_trunc('month', appt.starts_at)::date <= v_month_start
      and (
        (p_entity_type = 'studio' and appt.studio_id = p_entity_id)
        or (p_entity_type = 'artist' and appt.artist_id = p_entity_id)
      )
  ),
  monthly_amounts as (
    select
      billing_month,
      sum(gross_amount) as gross_amount,
      sum(commission_amount) as commission_amount
    from appointment_amounts
    group by billing_month
  ),
  upserted_payments as (
    insert into studio_flow_commission_payments (
      entity_type,
      entity_id,
      billing_month,
      gross_amount,
      commission_amount,
      paid_amount,
      payment_method,
      notes,
      paid_by_profile_id,
      paid_at,
      updated_at
    )
    select
      p_entity_type,
      p_entity_id,
      billing_month,
      gross_amount,
      commission_amount,
      commission_amount,
      coalesce(nullif(trim(p_payment_method), ''), 'manual'),
      p_notes,
      auth.uid(),
      now(),
      now()
    from monthly_amounts
    where commission_amount > 0
    on conflict (entity_type, entity_id, billing_month) do update
    set gross_amount = excluded.gross_amount,
        commission_amount = excluded.commission_amount,
        paid_amount = excluded.paid_amount,
        payment_method = excluded.payment_method,
        notes = excluded.notes,
        paid_by_profile_id = excluded.paid_by_profile_id,
        paid_at = now(),
        updated_at = now()
    returning *
  )
  select count(*), coalesce(sum(gross_amount), 0), coalesce(sum(commission_amount), 0)
  into v_paid_months, v_gross_amount, v_commission_amount
  from upserted_payments;

  return jsonb_build_object(
    'entityType', p_entity_type,
    'entity_type', p_entity_type,
    'entityId', p_entity_id,
    'entity_id', p_entity_id,
    'paidThroughMonth', to_char(v_month_start, 'YYYY-MM'),
    'paid_through_month', to_char(v_month_start, 'YYYY-MM'),
    'paidMonths', v_paid_months,
    'paid_months', v_paid_months,
    'grossAmount', v_gross_amount,
    'gross_amount', v_gross_amount,
    'commissionAmount', v_commission_amount,
    'commission_amount', v_commission_amount,
    'paidAmount', v_commission_amount,
    'paid_amount', v_commission_amount
  );
end;
$$;

create or replace function public.studio_flow_admin_get_billing_history(
  p_query text,
  p_year integer default extract(year from current_date)::integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_query text := lower(trim(coalesce(p_query, '')));
  v_year_start date := make_date(coalesce(p_year, extract(year from current_date)::integer), 1, 1);
  v_year_end date := make_date(coalesce(p_year, extract(year from current_date)::integer) + 1, 1, 1);
  v_entities jsonb;
begin
  perform public.studio_flow_admin_assert_platform_owner();

  if v_query = '' then
    return jsonb_build_object('year', extract(year from v_year_start)::integer, 'entities', '[]'::jsonb);
  end if;

  with appointment_amounts as (
    select
      appt.id,
      appt.artist_id,
      appt.studio_id,
      date_trunc('month', appt.starts_at)::date as billing_month,
      coalesce(ae.gross_amount, so.price_amount, 0) as gross_amount,
      coalesce(comm.amount, ae.platform_fee_amount, round(coalesce(so.price_amount, 0) * 0.10, 2), 0) as commission_amount
    from appointments appt
    join service_offerings so on so.id = appt.service_offering_id
    left join appointment_economies ae on ae.appointment_id = appt.id
    left join commissions comm on comm.appointment_id = appt.id
    where appt.starts_at >= v_year_start
      and appt.starts_at < v_year_end
  ),
  entity_months as (
    select 'studio'::text as entity_type, studio_id as entity_id, billing_month, sum(gross_amount) as gross_amount, sum(commission_amount) as commission_amount, count(*) as appointment_count
    from appointment_amounts
    where studio_id is not null
    group by studio_id, billing_month
    union all
    select 'artist'::text as entity_type, artist_id as entity_id, billing_month, sum(gross_amount) as gross_amount, sum(commission_amount) as commission_amount, count(*) as appointment_count
    from appointment_amounts
    where artist_id is not null
    group by artist_id, billing_month
  ),
  entities as (
    select
      s.id,
      'studio'::text as type,
      coalesce(sp.commercial_name, s.name, 'Estudio') as name,
      coalesce(sp.email, owner_profile.email, '') as email,
      coalesce(sp.phone, owner_profile.phone, '') as phone
    from studios s
    left join studio_profiles sp on sp.studio_id = s.id
    left join profiles owner_profile on owner_profile.id = s.owner_profile_id
    where s.archived_at is null
    union all
    select
      a.id,
      'artist'::text as type,
      coalesce(ap.artistic_name, a.display_name, p.display_name, 'Artista') as name,
      coalesce(p.email, '') as email,
      coalesce(p.phone, '') as phone
    from artists a
    left join profiles p on p.id = a.profile_id
    left join artist_profiles ap on ap.artist_id = a.id
    where a.status <> 'archived'
  ),
  filtered_entities as (
    select *
    from entities
    where lower(name) like '%' || v_query || '%'
      or lower(email) like '%' || v_query || '%'
      or lower(phone) like '%' || v_query || '%'
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', fe.id,
        'type', fe.type,
        'name', fe.name,
        'email', fe.email,
        'phone', fe.phone,
        'months', coalesce(month_rows.months, '[]'::jsonb)
      )
      order by fe.name
    ),
    '[]'::jsonb
  )
  into v_entities
  from filtered_entities fe
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'month', to_char(em.billing_month, 'YYYY-MM'),
        'grossAmount', em.gross_amount,
        'gross_amount', em.gross_amount,
        'commissionAmount', em.commission_amount,
        'commission_amount', em.commission_amount,
        'paidAmount', coalesce(pay.paid_amount, 0),
        'paid_amount', coalesce(pay.paid_amount, 0),
        'unpaidAmount', greatest(em.commission_amount - coalesce(pay.paid_amount, 0), 0),
        'unpaid_amount', greatest(em.commission_amount - coalesce(pay.paid_amount, 0), 0),
        'appointmentCount', em.appointment_count,
        'appointment_count', em.appointment_count,
        'status', case when coalesce(pay.paid_amount, 0) >= em.commission_amount then 'paid' else 'pending' end,
        'paidAt', pay.paid_at,
        'paid_at', pay.paid_at
      )
      order by em.billing_month desc
    ) as months
    from entity_months em
    left join studio_flow_commission_payments pay on pay.entity_type = em.entity_type and pay.entity_id = em.entity_id and pay.billing_month = em.billing_month
    where em.entity_type = fe.type
      and em.entity_id = fe.id
  ) month_rows on true;

  return jsonb_build_object(
    'year', extract(year from v_year_start)::integer,
    'entities', v_entities
  );
end;
$$;

revoke all on table public.studio_flow_commission_payments from public;
grant select, insert, update on table public.studio_flow_commission_payments to authenticated;

revoke all on function public.studio_flow_admin_get_billing_summary(date, text) from public;
grant execute on function public.studio_flow_admin_get_billing_summary(date, text) to authenticated;

revoke all on function public.studio_flow_admin_mark_commission_paid(text, uuid, date, text, text) from public;
grant execute on function public.studio_flow_admin_mark_commission_paid(text, uuid, date, text, text) to authenticated;

revoke all on function public.studio_flow_admin_get_billing_history(text, integer) from public;
grant execute on function public.studio_flow_admin_get_billing_history(text, integer) to authenticated;
