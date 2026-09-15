begin;
do $$
declare a public.appointments%rowtype; actor uuid; rejected boolean; command text; payload jsonb; history_count bigint;
begin
 if current_database()<>'studioflow_audit_verified_20260913' then raise exception 'Isolated database required'; end if;
 select id into actor from public.profiles where default_role='platform_owner' and status='active' limit 1;
 select ap.* into a from public.appointments ap join public.studios s on s.id=ap.studio_id
 where ap.status='scheduled' and ap.ends_at<now() and s.studio_status='approved' and s.archived_at is null limit 1;
 if actor is null or a.id is null then raise exception 'Existing owner and studio appointment required'; end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 update public.appointments set status='completed',completed_at=now() where id=a.id;
 update public.studio_flow_commission_payments set paid_amount=0 where entity_type='studio' and entity_id=a.studio_id;
 select count(*) into history_count from public.appointments where studio_id=a.studio_id;
 perform public.studio_flow_owner_review_studio(a.studio_id,'suspend',null);
 payload:=public.studio_flow_admin_get_billing_summary(null::date,''::text);
 if not exists(select 1 from jsonb_array_elements(payload->'entities') e where e->>'id'=a.studio_id::text and e->>'type'='studio') then raise exception 'Suspended studio missing from billing'; end if;
 payload:=public.studio_flow_admin_get_billing_history('%',extract(year from a.starts_at)::integer);
 if not exists(select 1 from jsonb_array_elements(payload->'entities') e where e->>'id'=a.studio_id::text and jsonb_array_length(e->'months')>0) then raise exception 'Suspended studio missing billing history'; end if;
 foreach command in array array[
   'select public.studio_flow_admin_review_studio($1,''approve'',null,null)',
   'select public.studio_flow_owner_review_studio($1,''reactivate'',null)'
 ] loop
   rejected:=false;
   begin execute command using a.studio_id;
   exception when raise_exception then
     if sqlerrm<>'No se puede reactivar: el estudio debe liquidar su adeudo pendiente.' then raise; end if;
     rejected:=true;
   end;
   if not rejected then raise exception 'Studio debt bypass'; end if;
 end loop;
 perform public.studio_flow_admin_mark_commission_paid('studio',a.studio_id,current_date,'manual',null);
 perform public.studio_flow_owner_review_studio(a.studio_id,'reactivate',null);
 if not exists(select 1 from public.studios where id=a.studio_id and studio_status='approved') then raise exception 'Paid studio not reactivated'; end if;
 if (select count(*) from public.appointments where studio_id=a.studio_id)<>history_count then raise exception 'Studio appointment history changed'; end if;
 raise notice 'PASS: studio debt blocks approval and reactivation; billing preserved; payment permits reactivation';
end $$;
rollback;
