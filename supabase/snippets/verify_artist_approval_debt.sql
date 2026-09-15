begin;
do $$
declare a public.appointments%rowtype; actor uuid; command text; rejected boolean;
begin
 if current_database()<>'studioflow_audit_verified_20260913' then raise exception 'Isolated database required'; end if;
 select id into actor from public.profiles where default_role='platform_owner' and status='active' limit 1;
 select ap.* into a from public.appointments ap join public.artists ar on ar.id=ap.artist_id
 where ap.studio_id is null and ap.status='scheduled' and ap.ends_at<now() and ar.status='active' and ar.archived_at is null limit 1;
 if actor is null or a.id is null then raise exception 'Existing records required'; end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 update public.appointments set status='completed',completed_at=now() where id=a.id;
 update public.studio_flow_commission_payments set paid_amount=0 where entity_type='artist' and entity_id=a.artist_id;
 if public.studio_flow_artist_unpaid_commission(a.artist_id)<=0 then raise exception 'Debt scenario not exercised'; end if;
 perform public.studio_flow_admin_deactivate_artist(a.artist_id);
 foreach command in array array['studio_flow_admin_activate_artist','studio_flow_admin_approve_artist'] loop
   rejected:=false;
   begin
     execute format('select public.%I($1)',command) using a.artist_id;
   exception when raise_exception then
     if sqlerrm<>'No se puede reactivar: la artista debe liquidar su adeudo pendiente.' then raise; end if;
     rejected:=true;
   end;
   if not rejected then raise exception 'Debt bypass through %',command; end if;
 end loop;
 perform public.studio_flow_admin_mark_commission_paid('artist',a.artist_id,current_date,'manual',null);
 if public.studio_flow_artist_unpaid_commission(a.artist_id)<>0 then raise exception 'Payment did not clear debt'; end if;
 perform public.studio_flow_admin_approve_artist(a.artist_id);
 if not exists(select 1 from public.artists where id=a.artist_id and status='active') then raise exception 'Paid artist not approved'; end if;
 raise notice 'PASS: activate and approve reject debt; payment allows approval';
end $$;
rollback;
