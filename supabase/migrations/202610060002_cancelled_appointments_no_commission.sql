do $$
declare definition text;
begin
  select pg_get_functiondef('public.studio_flow_sync_appointment_commission(uuid)'::regprocedure) into definition;
  if position('if v_appointment.status = ''completed'' or (v_appointment.status = ''cancelled'' and v_appointment.cancelled_by_provider) then' in definition) = 0 then
    raise exception 'Review commission calculation before changing cancellation policy';
  end if;
  definition := replace(definition,
    'if v_appointment.status = ''completed'' or (v_appointment.status = ''cancelled'' and v_appointment.cancelled_by_provider) then',
    'if v_appointment.status = ''completed'' then');
  definition := replace(definition,
    'v_chargeable_at := v_earned_at;
  end if;',
    'v_chargeable_at := v_earned_at;
  elsif v_appointment.status in (''cancelled'', ''no_show'') then
    v_economy_status := ''void'';
    v_commission_status := ''void'';
  end if;');
  execute definition;
end $$;

do $$
declare definition text; signature text;
begin
  foreach signature in array array[
    'public.studio_flow_admin_get_billing_summary(date,text)',
    'public.studio_flow_admin_get_billing_history(text,integer)',
    'public.studio_flow_admin_mark_commission_paid(text,uuid,date,text,text)'
  ] loop
    select pg_get_functiondef(signature::regprocedure) into definition;
    definition := replace(definition,
      '(appt.status = ''completed'' or (appt.status = ''cancelled'' and appt.cancelled_by_provider))',
      'appt.status = ''completed''');
    execute definition;
  end loop;
  foreach signature in array array[
    'public.studio_flow_artist_unpaid_commission(uuid)',
    'public.studio_flow_admin_review_studio(uuid,text,text,text)'
  ] loop
    select pg_get_functiondef(signature::regprocedure) into definition;
    definition := replace(definition,
      '(a.status=''completed'' or (a.status=''cancelled'' and a.cancelled_by_provider))',
      'a.status=''completed''');
    execute definition;
  end loop;
  select pg_get_functiondef('public.studio_flow_get_accounting_summary(uuid)'::regprocedure) into definition;
  definition := replace(definition,
    '(status=''completed'' or (status=''cancelled'' and cancelled_by_provider))',
    'status=''completed''');
  definition := replace(definition,
    'case when a.cancelled_by_provider then coalesce(commission.amount,economy.platform_fee_amount,0) else 0 end',
    '0');
  execute definition;

  select pg_get_functiondef('public.studio_flow_growth_metrics_internal(uuid,uuid,integer)'::regprocedure) into definition;
  definition := replace(definition,
    'status = ''completed'' or (status = ''cancelled'' and cancelled_by_provider)',
    'status = ''completed''');
  execute definition;

  select pg_get_functiondef('public.studio_flow_provider_export_events(uuid,integer,integer)'::regprocedure) into definition;
  definition := replace(definition,
    'coalesce(comm.amount,e.platform_fee_amount,round(e.gross_amount*0.10,2),0) as commission_amount',
    'case when a.status=''completed'' then coalesce(comm.amount,e.platform_fee_amount,round(e.gross_amount*0.10,2),0) else 0 end as commission_amount');
  execute definition;
end $$;

select public.studio_flow_sync_appointment_commission(id)
from public.appointments where status in ('cancelled','no_show');
