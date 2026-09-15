begin;
do $$
declare d text; marker text; guard text; target regprocedure;
begin
 foreach target in array array[
 'public.studio_flow_client_apply_appointment_reward(uuid,uuid)'::regprocedure,
 'public.studio_flow_client_redeem_flow_points(integer,uuid,uuid)'::regprocedure
 ] loop
 select pg_get_functiondef(target) into d;
 if target='public.studio_flow_client_apply_appointment_reward(uuid,uuid)'::regprocedure then
   marker:='  if v_appointment.id is null then raise exception ''Appointment not available for reward''; end if;';
   guard:='v_appointment.studio_id';
 else
   marker:='  insert into loyalty_accounts (client_id, points_balance, streak_count, status, updated_at)';
   guard:='p_studio_id';
 end if;
 if position(marker in d)=0 then raise exception 'Unexpected redemption function: %',target; end if;
 guard:=format($sql$
  if %1$s is not null then
    perform 1 from public.studios s where s.id=%1$s
      and s.studio_status='approved' and s.archived_at is null for share;
    if not found then
      raise exception 'El estudio esta suspendido o inactivo y no admite canjes de puntos.' using errcode='42501';
    end if;
  end if;
$sql$,guard);
 if target='public.studio_flow_client_apply_appointment_reward(uuid,uuid)'::regprocedure then
   d:=replace(d,marker,marker||guard);
 else
   d:=replace(d,marker,guard||marker);
 end if;
 execute d;
 end loop;
end $$;
commit;
