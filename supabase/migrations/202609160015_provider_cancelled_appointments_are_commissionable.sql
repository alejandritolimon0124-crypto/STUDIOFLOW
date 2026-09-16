begin;

alter table public.appointments
  add column if not exists cancelled_by_provider boolean not null default false,
  add column if not exists cancelled_by_profile_id uuid references public.profiles(id) on delete set null;

update public.appointments appointment
set cancelled_by_provider = true,
    cancelled_by_profile_id = coalesce(appointment.cancelled_by_profile_id, (
      select status_event.changed_by_profile_id
      from public.appointment_status_events status_event
      where status_event.appointment_id = appointment.id
        and status_event.to_status = 'cancelled'
        and status_event.reason = 'provider_cancelled_appointment'
      order by status_event.changed_at desc
      limit 1
    ))
where appointment.status = 'cancelled'
  and not appointment.cancelled_by_provider
  and exists (
    select 1
    from public.appointment_status_events status_event
    where status_event.appointment_id = appointment.id
      and status_event.to_status = 'cancelled'
      and status_event.reason = 'provider_cancelled_appointment'
  );

do $$
declare
  definition text;
  expected text;
begin
  select pg_get_functiondef('public.studio_flow_artist_cancel_appointment(uuid)'::regprocedure)
  into definition;

  expected := 'update appointments set status=''cancelled'',cancelled_at=now(),updated_at=now() where id=a.id;';
  if position(expected in definition) = 0 then
    raise exception 'Provider cancellation update was not found';
  end if;

  definition := replace(
    definition,
    expected,
    'update appointments set status=''cancelled'',cancelled_at=now(),cancelled_by_provider=true,cancelled_by_profile_id=auth.uid(),updated_at=now() where id=a.id;'
  );
  execute definition;
end;
$$;

do $$
declare
  definition text;
  expected text;
begin
  select pg_get_functiondef('public.studio_flow_sync_appointment_commission(uuid)'::regprocedure)
  into definition;

  expected := 'if v_appointment.status = ''completed'' then';
  if position(expected in definition) = 0 then
    raise exception 'Commissionable appointment condition was not found';
  end if;
  definition := replace(
    definition,
    expected,
    'if v_appointment.status = ''completed'' or (v_appointment.status = ''cancelled'' and v_appointment.cancelled_by_provider) then'
  );

  expected := 'v_earned_at := coalesce(v_appointment.completed_at, now());';
  if position(expected in definition) = 0 then
    raise exception 'Commission earned timestamp was not found';
  end if;
  definition := replace(
    definition,
    expected,
    'v_earned_at := coalesce(v_appointment.completed_at, v_appointment.cancelled_at, now());'
  );
  execute definition;
end;
$$;

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

  with scoped as (
    select
      a.id,
      (a.starts_at at time zone 'America/Mexico_City')::date as day,
      a.status,
      a.cancelled_by_provider,
      e.gross_amount,
      coalesce(c.amount, e.platform_fee_amount, round(e.gross_amount * 0.10, 2), 0) as fee
    from appointments a
    join appointment_economies e on e.appointment_id=a.id
    left join commissions c on c.appointment_id=a.id
    where (
      (p_studio_id is not null and a.studio_id=p_studio_id)
      or (p_studio_id is null and a.artist_id=artist and a.studio_id is null)
    )
  ), totals as (
    select
      coalesce(sum(gross_amount) filter(where status='completed' and day=today),0) as daily,
      coalesce(sum(gross_amount) filter(where status='completed' and day between week_start and today),0) as weekly,
      coalesce(sum(gross_amount) filter(where status='completed' and day between month_start and today),0) as monthly,
      coalesce(sum(gross_amount) filter(where status='completed' and day>=previous_month and day<month_start),0) as previous,
      coalesce(sum(fee) filter(where (status='completed' or (status='cancelled' and cancelled_by_provider)) and day>=previous_month and day<month_start),0) as previous_fee,
      coalesce(sum(fee) filter(where (status='completed' or (status='cancelled' and cancelled_by_provider)) and day between month_start and today),0) as monthly_fee,
      count(*) filter(where status='completed' and day=today) as daily_count
    from scoped
  )
  select jsonb_build_object(
    'date',today,'weekStart',week_start,'monthStart',month_start,
    'receiptMonth',previous_month,'dueDate',month_start+4,'daily',daily,'weekly',weekly,
    'monthly',monthly,'dailyCount',daily_count,'receiptIncome',previous,
    'commission',previous_fee,'monthCommission',monthly_fee
  ) into result from totals;

  result := result || jsonb_build_object('cancelledAppointments',(
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',a.id,'client',client.display_name,'service',service.name,
      'scheduledAt',a.starts_at,'cancelledAt',a.cancelled_at,
      'amount',economy.gross_amount,
      'providerCancelled',a.cancelled_by_provider,
      'provider_cancelled',a.cancelled_by_provider,
      'commissionAmount',case when a.cancelled_by_provider then coalesce(commission.amount,economy.platform_fee_amount,0) else 0 end,
      'commission_amount',case when a.cancelled_by_provider then coalesce(commission.amount,economy.platform_fee_amount,0) else 0 end
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

revoke all on function public.studio_flow_get_accounting_summary(uuid) from public;
grant execute on function public.studio_flow_get_accounting_summary(uuid) to authenticated;

do $$
declare
  definition text;
  signature text;
begin
  foreach signature in array array[
    'public.studio_flow_admin_get_billing_summary(date,text)',
    'public.studio_flow_admin_get_billing_history(text,integer)',
    'public.studio_flow_admin_mark_commission_paid(text,uuid,date,text,text)'
  ] loop
    select pg_get_functiondef(signature::regprocedure) into definition;
    if position('appt.status = ''completed''' in definition) = 0 then
      raise exception 'Completed billing filter not found in %', signature;
    end if;
    definition := replace(
      definition,
      'appt.status = ''completed''',
      '(appt.status = ''completed'' or (appt.status = ''cancelled'' and appt.cancelled_by_provider))'
    );
    execute definition;
  end loop;

  select pg_get_functiondef('public.studio_flow_artist_unpaid_commission(uuid)'::regprocedure)
  into definition;
  if position('a.status=''completed''' in definition) = 0 then
    raise exception 'Artist completed billing filter not found';
  end if;
  definition := replace(
    definition,
    'a.status=''completed''',
    '(a.status=''completed'' or (a.status=''cancelled'' and a.cancelled_by_provider))'
  );
  execute definition;

  select pg_get_functiondef('public.studio_flow_admin_review_studio(uuid,text,text,text)'::regprocedure)
  into definition;
  if position('a.status=''completed''' in definition) = 0 then
    raise exception 'Studio completed debt filter not found';
  end if;
  definition := replace(
    definition,
    'a.status=''completed''',
    '(a.status=''completed'' or (a.status=''cancelled'' and a.cancelled_by_provider))'
  );
  execute definition;
end;
$$;

do $$
declare
  definition text;
  expected text := 'c.display_name as client,so.name as service,a.status,';
begin
  select pg_get_functiondef('public.studio_flow_owner_export_events(text,uuid,integer,integer)'::regprocedure)
  into definition;
  if position(expected in definition) = 0 then
    raise exception 'Owner event export status fields not found';
  end if;
  definition := replace(
    definition,
    expected,
    'c.display_name as client,so.name as service,a.status,a.cancelled_by_provider as provider_cancelled,'
  );
  execute definition;
end;
$$;

select public.studio_flow_sync_appointment_commission(id)
from public.appointments
where status = 'cancelled' and cancelled_by_provider;

commit;
