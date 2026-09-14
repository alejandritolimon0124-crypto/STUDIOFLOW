begin;
do $$
declare d text; old text;
begin
 select pg_get_functiondef('public.studio_flow_client_apply_appointment_reward(uuid,uuid)'::regprocedure) into d;
 old := 'select * into v_client from clients where profile_id = v_profile.id and status = ''active'' and archived_at is null limit 1;';
 if position(old in d)=0 then raise exception 'Unexpected reward client lookup'; end if;
 d:=replace(d,old,replace(old,'limit 1;','limit 1 for update;'));
 old := 'select * into v_appointment from appointments where id = p_appointment_id and client_id = v_client.id and status = ''scheduled'';';
 if position(old in d)=0 then raise exception 'Unexpected reward appointment lookup'; end if;
 d:=replace(d,old,replace(old,';',' for update;'));
 old := 'select * into v_reward';
 if position(old in d)=0 then raise exception 'Unexpected reward lookup'; end if;
 d:=replace(d,old,$patch$
 if exists(select 1 from reward_redemptions where appointment_id=v_appointment.id and status='applied') then
  raise exception 'Esta cita ya tiene un canje de puntos aplicado.';
 end if;
 select * into v_economy from appointment_economies where appointment_id=v_appointment.id;
 if v_economy.id is null then raise exception 'No se encontro el importe guardado de la cita.'; end if;
 if v_economy.calculation_version like '%happy-hour-discount-%' then
  raise exception 'Esta cita ya tiene una promocion aplicada y no admite puntos adicionales.';
 end if;
 select * into v_reward
 $patch$);
 old := 'select coalesce(so.price_amount, 0) into v_original_amount from service_offerings so where so.id = v_appointment.service_offering_id;';
 if position(old in d)=0 then raise exception 'Unexpected reward price lookup'; end if;
 d:=replace(d,old,'v_original_amount := v_economy.gross_amount;');
 execute d;
end;$$;

create function public.studio_flow_marketplace_book_with_reward(
 p_availability_slot_ids uuid[], p_service_offering_id uuid, p_reward_id uuid, p_notes text default null
) returns jsonb language plpgsql security invoker set search_path=public,auth as $$
declare booking jsonb; redeemed jsonb;
begin
 booking:=public.studio_flow_marketplace_book_appointment(p_availability_slot_ids,p_service_offering_id,p_notes);
 if p_reward_id is not null then
  if nullif(booking->'appointment'->>'id','') is null then raise exception 'No se pudo identificar la cita reservada.'; end if;
  redeemed:=public.studio_flow_client_apply_appointment_reward((booking->'appointment'->>'id')::uuid,p_reward_id);
  booking:=booking || jsonb_build_object('reward',redeemed->'reward','economy',redeemed->'economy');
 end if;
 return booking;
end;$$;
revoke all on function public.studio_flow_marketplace_book_with_reward(uuid[],uuid,uuid,text) from public;
grant execute on function public.studio_flow_marketplace_book_with_reward(uuid[],uuid,uuid,text) to authenticated;
commit;
