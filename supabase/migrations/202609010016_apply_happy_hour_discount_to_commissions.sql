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
  v_existing_discount appointment_economies%rowtype;
  v_economy appointment_economies%rowtype;
  v_commission commissions%rowtype;
  v_discount_percent integer := 0;
  v_gross_amount numeric := 0;
  v_platform_fee_amount numeric := 0;
  v_artist_revenue_amount numeric := 0;
  v_economy_status appointment_economy_status := 'quoted';
  v_commission_status commission_status := 'potential';
  v_earned_at timestamptz := null;
  v_chargeable_at timestamptz := null;
  v_calculation_version text := 'studio-flow-commission-10-v4-happy-hour';
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

  select *
  into v_existing_discount
  from appointment_economies
  where appointment_id = v_appointment.id
    and calculation_version like '%flow-points-discount%'
  order by updated_at desc
  limit 1;

  if v_existing_discount.id is not null then
    v_gross_amount := v_existing_discount.gross_amount;
    v_platform_fee_amount := v_existing_discount.platform_fee_amount;
    v_artist_revenue_amount := v_existing_discount.artist_revenue_amount;
    v_calculation_version := v_existing_discount.calculation_version;
  else
    select coalesce(max(coalesce((promo.rules ->> 'discountPercent')::integer, (promo.rules ->> 'discount_percent')::integer, 0)), 0)
    into v_discount_percent
    from promotions promo
    where promo.promotion_type = 'happy_hour'
      and promo.status = 'active'
      and (promo.starts_at is null or promo.starts_at <= v_appointment.starts_at)
      and (promo.ends_at is null or promo.ends_at > v_appointment.starts_at)
      and (
        (promo.scope_type = 'artist' and promo.artist_id = v_appointment.artist_id)
        or (promo.scope_type = 'studio' and promo.studio_id = v_appointment.studio_id)
        or (promo.scope_type = 'membership' and promo.membership_id = v_appointment.membership_id)
      )
      and (
        jsonb_typeof(coalesce(promo.rules -> 'weekdays', promo.rules -> 'weekDays', promo.rules -> 'week_days', '[]'::jsonb)) <> 'array'
        or jsonb_array_length(coalesce(promo.rules -> 'weekdays', promo.rules -> 'weekDays', promo.rules -> 'week_days', '[]'::jsonb)) = 0
        or exists (
          select 1
          from jsonb_array_elements_text(coalesce(promo.rules -> 'weekdays', promo.rules -> 'weekDays', promo.rules -> 'week_days', '[]'::jsonb)) happy_hour_weekday(value)
          where happy_hour_weekday.value::integer = extract(dow from v_appointment.starts_at at time zone 'America/Mexico_City')::integer
        )
      )
      and coalesce(nullif(coalesce(promo.rules ->> 'startTime', promo.rules ->> 'start_time'), ''), '00:00')::time <= (v_appointment.starts_at at time zone 'America/Mexico_City')::time
      and coalesce(nullif(coalesce(promo.rules ->> 'endTime', promo.rules ->> 'end_time'), ''), '23:59')::time >= (v_appointment.ends_at at time zone 'America/Mexico_City')::time;

    v_discount_percent := greatest(0, least(coalesce(v_discount_percent, 0), 100));
    v_gross_amount := round(coalesce(v_service.price_amount, 0) * (100 - v_discount_percent) / 100, 2);
    v_platform_fee_amount := round(v_gross_amount * 0.10, 2);
    v_artist_revenue_amount := greatest(v_gross_amount - v_platform_fee_amount, 0);

    if v_discount_percent > 0 then
      v_calculation_version := concat(v_calculation_version, '-discount-', v_discount_percent);
    end if;
  end if;

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
    v_calculation_version,
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
    'happyHourDiscountPercent', v_discount_percent,
    'happy_hour_discount_percent', v_discount_percent,
    'commissionStatus', v_commission_status,
    'commission_status', v_commission_status
  );
end;
$$;

revoke all on function public.studio_flow_sync_appointment_commission(uuid) from public;
grant execute on function public.studio_flow_sync_appointment_commission(uuid) to authenticated;
