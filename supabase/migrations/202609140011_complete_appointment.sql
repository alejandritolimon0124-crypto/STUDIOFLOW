begin;
create function public.studio_flow_guard_appointment_completion() returns trigger
language plpgsql set search_path=public as $$
begin
 if new.status='completed' and (tg_op='INSERT' or old.status is distinct from new.status or old.ends_at is distinct from new.ends_at) then
  if new.ends_at>now() then raise exception 'La cita solo puede completarse cuando termine su horario.'; end if;
  if tg_op='UPDATE' and old.status in ('cancelled','no_show') then raise exception 'No se puede completar una cita cancelada o sin asistencia.'; end if;
 end if;
 return new;
end;$$;
create trigger guard_appointment_completion before insert or update on public.appointments
for each row execute function public.studio_flow_guard_appointment_completion();
revoke all on function public.studio_flow_guard_appointment_completion() from public;

create or replace function public.studio_flow_complete_appointment(p_appointment_id uuid) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare a appointments%rowtype;
begin
 if not exists(select 1 from profiles where id=auth.uid() and status='active') then raise exception 'Sesion activa requerida.'; end if;
 select * into a from appointments where id=p_appointment_id for update;
 if a.id is null then raise exception 'Cita no encontrada.'; end if;
 if not (
 exists(select 1 from artists ar where ar.id=a.artist_id and ar.profile_id=auth.uid() and ar.status='active' and ar.archived_at is null)
 or exists(select 1 from studios s where s.id=a.studio_id and s.owner_profile_id=auth.uid() and s.studio_status='approved' and s.archived_at is null)
 or exists(select 1 from user_role_assignments u join roles r on r.id=u.role_id where u.profile_id=auth.uid() and u.status='active' and u.studio_id=a.studio_id and r.code in ('studio_owner','studio_manager'))
 ) then raise exception 'No tienes permiso para completar esta cita.'; end if;
 if a.status='completed' then return jsonb_build_object('id',a.id,'status','completed'); end if;
 if a.status<>'scheduled' then raise exception 'Solo se pueden completar citas agendadas.'; end if;
 if a.ends_at>now() then raise exception 'La cita solo puede completarse cuando termine su horario.'; end if;
 update appointments set status='completed',completed_at=now(),updated_at=now() where id=a.id;
 insert into appointment_status_events(appointment_id,from_status,to_status,reason,changed_by_profile_id)
 values(a.id,a.status,'completed','service_completed',auth.uid());
 return jsonb_build_object('id',a.id,'status','completed');
end;$$;
revoke all on function public.studio_flow_complete_appointment(uuid) from public;
grant execute on function public.studio_flow_complete_appointment(uuid) to authenticated;
commit;
