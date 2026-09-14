begin;
do $$
declare d text;
begin
 select pg_get_functiondef('public.studio_flow_get_accounting_summary(uuid)'::regprocedure) into d;
 if position('return result;' in d)=0 then raise exception 'Unexpected accounting definition'; end if;
 execute replace(d,'return result;',$patch$
 result:=result || jsonb_build_object('cancelledAppointments',(
 select coalesce(jsonb_agg(jsonb_build_object(
 'id',a.id,'client',c.display_name,'service',s.name,
 'scheduledAt',a.starts_at,'cancelledAt',a.cancelled_at,
 'amount',e.gross_amount
 ) order by a.starts_at desc,a.id),'[]'::jsonb)
 from appointments a
 left join clients c on c.id=a.client_id
 left join service_offerings s on s.id=a.service_offering_id
 left join appointment_economies e on e.appointment_id=a.id
 where a.status='cancelled'
 and (a.starts_at at time zone 'America/Mexico_City')::date>=month_start
 and (a.starts_at at time zone 'America/Mexico_City')::date<(month_start+interval '1 month')::date
 and ((p_studio_id is not null and a.studio_id=p_studio_id)
 or (p_studio_id is null and a.artist_id=artist and a.studio_id is null))
 ));
 return result;
 $patch$);
end;$$;
commit;
