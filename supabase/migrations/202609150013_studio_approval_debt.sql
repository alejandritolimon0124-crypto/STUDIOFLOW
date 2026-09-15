begin;
do $$
declare d text; marker text := '  v_review_status := case v_decision';
begin
 select pg_get_functiondef('public.studio_flow_admin_review_studio(uuid,text,text,text)'::regprocedure) into d;
 if position(marker in d)=0 then raise exception 'Unexpected studio review function'; end if;
 d:=replace(d,marker,$guard$
  if v_decision='approve' and exists (
    select 1 from (
      select date_trunc('month',a.starts_at)::date as billing_month,
        sum(coalesce(c.amount,e.platform_fee_amount,round(so.price_amount*0.10,2),0)) as amount
      from public.appointments a
      join public.service_offerings so on so.id=a.service_offering_id
      left join public.appointment_economies e on e.appointment_id=a.id
      left join public.commissions c on c.appointment_id=a.id
      where a.studio_id=p_studio_id and a.status='completed'
        and date_trunc('month',a.starts_at)::date<=date_trunc('month',current_date)::date
      group by 1
    ) m left join public.studio_flow_commission_payments p
      on p.entity_type='studio' and p.entity_id=p_studio_id and p.billing_month=m.billing_month
    where m.amount>coalesce(p.paid_amount,0)
  ) then
    raise exception 'No se puede reactivar: el estudio debe liquidar su adeudo pendiente.';
  end if;
$guard$||marker);
 execute d;
end $$;
commit;
