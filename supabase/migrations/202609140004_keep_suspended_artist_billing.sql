begin;
create function public.studio_flow_artist_unpaid_commission(p_artist_id uuid)
returns numeric language sql security definer set search_path=public as $$
 with monthly as (
 select date_trunc('month',a.starts_at)::date as month,
 sum(coalesce(c.amount,e.platform_fee_amount,round(s.price_amount*0.10,2),0)) as amount
 from appointments a join service_offerings s on s.id=a.service_offering_id
 left join appointment_economies e on e.appointment_id=a.id
 left join commissions c on c.appointment_id=a.id
 where a.artist_id=p_artist_id and date_trunc('month',a.starts_at)<=date_trunc('month',current_date)
 group by 1
 ) select coalesce(sum(greatest(m.amount-coalesce(p.paid_amount,0),0)),0)
 from monthly m left join studio_flow_commission_payments p
 on p.entity_type='artist' and p.entity_id=p_artist_id and p.billing_month=m.month;
$$;
revoke all on function public.studio_flow_artist_unpaid_commission(uuid) from public;
grant execute on function public.studio_flow_artist_unpaid_commission(uuid) to postgres;

do $$
declare d text; f regprocedure; old text;
begin
 foreach f in array array['public.studio_flow_admin_get_billing_summary(date,text)'::regprocedure,'public.studio_flow_admin_get_billing_history(text,integer)'::regprocedure] loop
  select pg_get_functiondef(f) into d;
  old := 'where a.status = ''active''';
  if position(old in d)=0 then raise exception 'Unexpected billing artist filter'; end if;
  d:=replace(d,old,'where a.status in (''active'', ''inactive'')');
  if f='public.studio_flow_admin_get_billing_summary(date,text)'::regprocedure then
   d:=replace(d,'''status'', case when overdue_commission > 0', '''artistStatus'', (select a.status from artists a where a.id = filtered_entities.id and filtered_entities.type = ''artist''), ''status'', case when unpaid_commission > 0');
  end if;
  execute d;
 end loop;
 select pg_get_functiondef('public.studio_flow_admin_activate_artist(uuid)'::regprocedure) into d;
 old:='update artists';
 if position(old in d)=0 then raise exception 'Unexpected artist activation'; end if;
 d:=replace(d,old,$guard$
 if public.studio_flow_artist_unpaid_commission(p_artist_id)>0 then
  raise exception 'No se puede reactivar: la artista debe liquidar su adeudo pendiente.';
 end if;
 update artists
 $guard$);
 execute d;
end;$$;
commit;
