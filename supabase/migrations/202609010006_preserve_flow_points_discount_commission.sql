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
  v_gross_amount numeric := 0;
  v_platform_fee_amount numeric := 0;
  v_artist_revenue_amount numeric := 0;
  v_economy_status appointment_economy_status := 'quoted';
  v_commission_status commission_status := 'potential';
  v_earned_at timestamptz := null;
  v_chargeable_at timestamptz := null;
  v_calculation_version text := 'studio-flow-commission-10-v3-scheduled-due';
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
    v_gross_amount := coalesce(v_service.price_amount, 0);
    v_platform_fee_amount := round(v_gross_amount * 0.10, 2);
    v_artist_revenue_amount := greatest(v_gross_amount - v_platform_fee_amount, 0);
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
    'commissionStatus', v_commission_status,
    'commission_status', v_commission_status
  );
end;
$$;
