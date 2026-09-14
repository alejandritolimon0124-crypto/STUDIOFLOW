begin;
alter table public.appointments add column reward_points_snapshot integer check(reward_points_snapshot>=0);
alter table public.appointments add column reward_multiplier_snapshot integer check(reward_multiplier_snapshot>=1);
create function public.studio_flow_capture_appointment_reward() returns trigger
language plpgsql security definer set search_path=public,auth as $$
begin
 select coalesce(flow_points_awarded,0) into new.reward_points_snapshot from service_offerings where id=new.service_offering_id;
 new.reward_multiplier_snapshot:=public.studio_flow_artist_active_double_points_multiplier(
 case when new.studio_id is null and new.membership_id is null then new.artist_id else null end,new.studio_id,now());
 new.reward_points_snapshot:=coalesce(new.reward_points_snapshot,0)*new.reward_multiplier_snapshot;
 return new;
end;$$;
create trigger capture_appointment_reward before insert on public.appointments
for each row execute function public.studio_flow_capture_appointment_reward();
revoke all on function public.studio_flow_capture_appointment_reward() from public;

do $$
declare d text; old text;
begin
 select pg_get_functiondef('public.studio_flow_client_update_appointment_response(uuid,text)'::regprocedure) into d;
 old:='v_from_status := v_appointment.status;';
 if position(old in d)=0 then raise exception 'Unexpected response function'; end if;
 execute replace(d,old,$r$if lower(coalesce(p_action,'')) = 'cancel' and v_appointment.starts_at <= now() then
 raise exception 'Esta cita ya comenzo o su horario ya paso. Contacta a tu artista para aclarar su estado.';
 end if;
 $r$||old);
 select pg_get_functiondef('public.studio_flow_artist_award_appointment_points(uuid)'::regprocedure) into d;
 old:='where id = p_appointment_id;';
 if position(old in d)=0 then raise exception 'Unexpected reward selection'; end if;
 d:=replace(d,old,'where id = p_appointment_id for update;');
 old:='if v_points <= 0 then';
 if position(old in d)=0 then raise exception 'Unexpected reward calculation'; end if;
 d:=replace(d,old,$r$if v_appointment.reward_points_snapshot is not null then
 v_points := v_appointment.reward_points_snapshot;
 end if;
 select coalesce((select points from flow_point_ledger where idempotency_key=concat('appointment-points:',v_appointment.id)),v_points) into v_points;
 $r$||old);
 old:='''doublePointsMultiplier'', case';
 if position(old in d)=0 then raise exception 'Unexpected multiplier metadata'; end if;
 d:=replace(d,old,'''doublePointsMultiplier'', case when v_appointment.reward_multiplier_snapshot is not null then v_appointment.reward_multiplier_snapshot else case');
 d:=replace(d,E'      end\n    )',E'      end end\n    )');
 execute d;
end;$$;
commit;
