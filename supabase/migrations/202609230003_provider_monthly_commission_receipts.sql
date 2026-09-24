begin;

create or replace function public.studio_flow_get_accounting_summary(p_studio_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  artist uuid;
  today date := (now() at time zone 'America/Mexico_City')::date;
  month_start date;
  week_start date;
  previous_month date;
  receipt_paid numeric := 0;
  result jsonb;
begin
  if not exists(select 1 from profiles where id=auth.uid() and status='active') then
    raise exception 'Sesion activa requerida';
  end if;
  if p_studio_id is not null then
    perform public.studio_flow_owner_assert_studio_access(p_studio_id);
  else
    select id into artist from artists where profile_id=auth.uid() and archived_at is null;
    if artist is null then raise exception 'Perfil de artista requerido'; end if;
  end if;

  month_start := date_trunc('month',today)::date;
  week_start := date_trunc('week',today)::date;
  previous_month := (month_start-interval '1 month')::date;

  select coalesce(paid_amount,0) into receipt_paid
  from studio_flow_commission_payments
  where entity_type=case when p_studio_id is null then 'artist' else 'studio' end
    and entity_id=coalesce(p_studio_id,artist)
    and billing_month=previous_month;
  receipt_paid := coalesce(receipt_paid,0);

  with scoped as (
    select a.id,(a.starts_at at time zone 'America/Mexico_City')::date as day,a.status,a.cancelled_by_provider,
      e.gross_amount,coalesce(c.amount,e.platform_fee_amount,round(e.gross_amount*0.10,2),0) as fee
    from appointments a
    join appointment_economies e on e.appointment_id=a.id
    left join commissions c on c.appointment_id=a.id
    where ((p_studio_id is not null and a.studio_id=p_studio_id)
      or (p_studio_id is null and a.artist_id=artist and a.studio_id is null))
  ), totals as (
    select coalesce(sum(gross_amount) filter(where status='completed' and day=today),0) as daily,
      coalesce(sum(gross_amount) filter(where status='completed' and day between week_start and today),0) as weekly,
      coalesce(sum(gross_amount) filter(where status='completed' and day between month_start and today),0) as monthly,
      coalesce(sum(gross_amount) filter(where status='completed' and day>=previous_month and day<month_start),0) as previous,
      coalesce(sum(fee) filter(where (status='completed' or (status='cancelled' and cancelled_by_provider)) and day>=previous_month and day<month_start),0) as previous_fee,
      coalesce(sum(fee) filter(where (status='completed' or (status='cancelled' and cancelled_by_provider)) and day between month_start and today),0) as monthly_fee,
      count(*) filter(where status='completed' and day=today) as daily_count
    from scoped
  )
  select jsonb_build_object(
    'date',today,'weekStart',week_start,'monthStart',month_start,'receiptMonth',previous_month,
    'dueDate',month_start+4,'daily',daily,'weekly',weekly,'monthly',monthly,'dailyCount',daily_count,
    'receiptIncome',previous,'commission',previous_fee,'monthCommission',monthly_fee,
    'receiptPaid',receipt_paid,'receiptAvailable',(previous_fee>receipt_paid and previous_fee>0),
    'receiptStatus',case when previous_fee<=0 then 'empty' when receipt_paid>=previous_fee then 'paid' else 'pending' end
  ) into result from totals;

  result := result || jsonb_build_object('cancelledAppointments',(
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',a.id,'client',client.display_name,'service',service.name,'scheduledAt',a.starts_at,
      'cancelledAt',a.cancelled_at,'amount',economy.gross_amount,'providerCancelled',a.cancelled_by_provider,
      'commissionAmount',case when a.cancelled_by_provider then coalesce(commission.amount,economy.platform_fee_amount,0) else 0 end
    ) order by a.starts_at desc,a.id),'[]'::jsonb)
    from appointments a
    left join clients client on client.id=a.client_id
    left join service_offerings service on service.id=a.service_offering_id
    left join appointment_economies economy on economy.appointment_id=a.id
    left join commissions commission on commission.appointment_id=a.id
    where a.status='cancelled'
      and (a.starts_at at time zone 'America/Mexico_City')::date>=month_start
      and (a.starts_at at time zone 'America/Mexico_City')::date<(month_start+interval '1 month')::date
      and ((p_studio_id is not null and a.studio_id=p_studio_id)
        or (p_studio_id is null and a.artist_id=artist and a.studio_id is null))
  ));
  return result;
end;
$$;

create or replace function public.studio_flow_provider_export_events(p_studio_id uuid,p_year integer,p_month integer)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  start_day date;
  artist uuid;
  profile jsonb;
  events jsonb;
  ids uuid[];
begin
  if not exists(select 1 from profiles where id=auth.uid() and status='active') then raise exception 'Sesion activa requerida'; end if;
  if p_year is null or p_year not between 1900 and 9998 or p_month is null or p_month not between 1 and 12 then raise exception 'Periodo invalido'; end if;
  start_day:=make_date(p_year,p_month,1);

  if p_studio_id is not null then
    perform public.studio_flow_owner_assert_studio_access(p_studio_id);
    select jsonb_build_object(
      'name',coalesce(sp.commercial_name,s.name),'fullName',owner_profile.display_name,
      'phone',coalesce(sp.phone,owner_profile.phone),'email',coalesce(sp.email,owner_profile.email),
      'address',concat_ws(', ',nullif(sp.address_line,''),nullif(sp.city,''))
    ) into profile
    from studios s left join profiles owner_profile on owner_profile.id=s.owner_profile_id
    left join studio_profiles sp on sp.studio_id=s.id where s.id=p_studio_id;
  else
    select a.id,jsonb_build_object(
      'name',coalesce(ap.artistic_name,a.display_name),'fullName',p.display_name,'phone',p.phone,'email',p.email,
      'address',concat_ws(', ',nullif(ap.address_line,''),nullif(ap.city,''))
    ) into artist,profile
    from artists a left join profiles p on p.id=a.profile_id left join artist_profiles ap on ap.artist_id=a.id
    where a.profile_id=auth.uid() and a.archived_at is null;
  end if;
  if profile is null then raise exception 'Perfil no encontrado'; end if;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.date,q.id),'[]'::jsonb),array_agg(q.id) into events,ids from (
    select a.id,to_char(a.starts_at at time zone 'America/Mexico_City','YYYY-MM-DD HH24:MI') as date,
      c.display_name as client,so.name as service,a.status,a.cancelled_by_provider as provider_cancelled,
      s.name as studio,coalesce((select sum(l.points) from flow_point_ledger l where l.appointment_id=a.id and l.movement_type='earn'),0) as awarded,
      a.reward_multiplier_snapshot as multiplier,coalesce(e.calculation_version like '%happy-hour-discount-%',false) as happy_hour,
      coalesce(comm.amount,e.platform_fee_amount,round(e.gross_amount*0.10,2),0) as commission_amount
    from appointments a left join clients c on c.id=a.client_id left join service_offerings so on so.id=a.service_offering_id
    left join studios s on s.id=a.studio_id left join appointment_economies e on e.appointment_id=a.id
    left join commissions comm on comm.appointment_id=a.id
    where ((p_studio_id is not null and a.studio_id=p_studio_id)
      or (p_studio_id is null and a.artist_id=artist and a.studio_id is null))
      and a.starts_at >= (start_day::timestamp at time zone 'America/Mexico_City')
      and a.starts_at < ((start_day+interval '1 month')::timestamp at time zone 'America/Mexico_City')
  ) q;
  return jsonb_build_object('profile',profile,'events',events,'payments',public.studio_flow_get_appointment_payment_details(coalesce(ids,'{}'::uuid[])));
end;
$$;

revoke all on function public.studio_flow_get_accounting_summary(uuid) from public;
grant execute on function public.studio_flow_get_accounting_summary(uuid) to authenticated;
revoke all on function public.studio_flow_provider_export_events(uuid,integer,integer) from public,anon;
grant execute on function public.studio_flow_provider_export_events(uuid,integer,integer) to authenticated;

commit;
