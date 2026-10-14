do $$
declare definition text; signature text;
begin
  select pg_get_functiondef('public.studio_flow_sync_appointment_commission(uuid)'::regprocedure) into definition;
  if position('if v_appointment.status = ''completed'' or (v_appointment.status = ''cancelled''' in definition) > 0
    or position('v_commission_status := ''void'';' in definition) = 0 then
    raise exception 'Cancelled appointments still appear chargeable in commission sync';
  end if;
  foreach signature in array array[
    'public.studio_flow_admin_get_billing_summary(date,text)',
    'public.studio_flow_admin_get_billing_history(text,integer)',
    'public.studio_flow_admin_mark_commission_paid(text,uuid,date,text,text)',
    'public.studio_flow_artist_unpaid_commission(uuid)',
    'public.studio_flow_admin_review_studio(uuid,text,text,text)',
    'public.studio_flow_get_accounting_summary(uuid)',
    'public.studio_flow_growth_metrics_internal(uuid,uuid,integer)'
  ] loop
    select pg_get_functiondef(signature::regprocedure) into definition;
    if position('(status=''cancelled'' and cancelled_by_provider)' in definition) > 0
      or position('(status = ''cancelled'' and cancelled_by_provider)' in definition) > 0
      or position('(appt.status = ''cancelled'' and appt.cancelled_by_provider)' in definition) > 0
      or position('(a.status=''cancelled'' and a.cancelled_by_provider)' in definition) > 0 then
      raise exception 'Cancelled appointments remain in billing function %', signature;
    end if;
  end loop;
  if exists(select 1 from public.appointments a join public.commissions c on c.appointment_id = a.id
    where a.status in ('cancelled','no_show') and c.status = 'chargeable') then
    raise exception 'Cancelled appointment still has a chargeable commission';
  end if;
end $$;
