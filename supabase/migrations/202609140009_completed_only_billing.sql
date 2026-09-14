begin;
do $$
declare d text; item record;
begin
 for item in select * from (values
 ('public.studio_flow_admin_get_billing_summary(date,text)', 'join service_offerings so on so.id = appt.service_offering_id', 'join service_offerings so on so.id = appt.service_offering_id and appt.status = ''completed'''),
 ('public.studio_flow_admin_get_billing_history(text,integer)', 'join service_offerings so on so.id = appt.service_offering_id', 'join service_offerings so on so.id = appt.service_offering_id and appt.status = ''completed'''),
 ('public.studio_flow_admin_mark_commission_paid(text,uuid,date,text,text)', 'join service_offerings so on so.id = appt.service_offering_id', 'join service_offerings so on so.id = appt.service_offering_id and appt.status = ''completed'''),
 ('public.studio_flow_artist_unpaid_commission(uuid)', 'a.artist_id=p_artist_id', 'a.status=''completed'' and a.artist_id=p_artist_id')
 ) as changes(signature,old_text,new_text) loop
  select pg_get_functiondef(item.signature::regprocedure) into d;
  if position(item.old_text in d)=0 then raise exception 'Unexpected billing definition: %',item.signature; end if;
  execute replace(d,item.old_text,item.new_text);
 end loop;
end;$$;
commit;
