begin;
-- A studio appointment has one debtor: the studio, not also its artist.
-- Preserve previously recorded payments for reconciliation.
do $$
declare d text; item record;
begin
 for item in select * from (values
 ('public.studio_flow_admin_get_billing_summary(date,text)', 'where aa.artist_id is not null', 'where aa.artist_id is not null and aa.studio_id is null'),
 ('public.studio_flow_admin_get_billing_history(text,integer)', 'where artist_id is not null', 'where artist_id is not null and studio_id is null'),
 ('public.studio_flow_admin_mark_commission_paid(text,uuid,date,text,text)', 'p_entity_type = ''artist'' and appt.artist_id = p_entity_id', 'p_entity_type = ''artist'' and appt.artist_id = p_entity_id and appt.studio_id is null'),
 ('public.studio_flow_artist_unpaid_commission(uuid)', 'a.artist_id=p_artist_id', 'a.artist_id=p_artist_id and a.studio_id is null')
 ) as patches(signature,old_text,new_text) loop
  select pg_get_functiondef(item.signature::regprocedure) into d;
  if position(item.old_text in d)=0 then raise exception 'Unexpected billing function: %',item.signature; end if;
  execute replace(d,item.old_text,item.new_text);
 end loop;
end;$$;
commit;
