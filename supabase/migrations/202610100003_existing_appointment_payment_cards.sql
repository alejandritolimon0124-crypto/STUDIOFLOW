begin;

create function public.studio_flow_prepare_existing_appointment_payment(p_appointment_id uuid)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  booking public.appointments%rowtype;
  settings public.business_payment_settings%rowtype;
  v_scope_type text;
  v_scope_id uuid;
  v_total numeric(12,2);
  plan public.appointment_deposit_plans%rowtype;
begin
  select * into booking from public.appointments where id = p_appointment_id for update;
  if not found then raise exception 'No se encontró la cita.'; end if;
  if booking.status <> 'scheduled' or booking.starts_at <= now() then
    raise exception 'Solo puedes preparar pagos para citas próximas y activas.';
  end if;

  if booking.studio_id is not null then
    v_scope_type := 'studio';
    v_scope_id := booking.studio_id;
    if not exists (select 1 from public.studios s where s.id = v_scope_id and s.owner_profile_id = auth.uid()) then
      raise exception 'No tienes permiso para preparar el pago de esta cita.';
    end if;
  else
    v_scope_type := 'artist';
    v_scope_id := booking.artist_id;
    if not exists (select 1 from public.artists a where a.id = v_scope_id and a.profile_id = auth.uid()) then
      raise exception 'No tienes permiso para preparar el pago de esta cita.';
    end if;
  end if;

  select * into plan from public.appointment_deposit_plans where appointment_id = p_appointment_id;
  if found then return jsonb_build_object('created', false, 'shareToken', plan.share_token); end if;

  select * into settings from public.business_payment_settings
  where scope_type = v_scope_type and scope_id = v_scope_id and deposit_enabled;
  if not found then raise exception 'Activa y guarda tus datos de anticipo en Mi perfil primero.'; end if;

  select coalesce(e.gross_amount, o.price_amount, 0) into v_total
  from public.appointments a
  left join public.appointment_economies e on e.appointment_id = a.id
  left join public.service_offerings o on o.id = a.service_offering_id
  where a.id = p_appointment_id;
  if v_total <= 0 then raise exception 'Esta cita no tiene un importe para calcular el anticipo.'; end if;

  insert into public.appointment_deposit_plans
    (appointment_id, scope_type, scope_id, deposit_kind, deposit_value, bank_name, account_holder, clabe, payment_terms, total_amount, deposit_amount)
  values
    (p_appointment_id, v_scope_type, v_scope_id, settings.deposit_kind, settings.deposit_value,
     settings.bank_name, settings.account_holder, settings.clabe, settings.payment_terms, v_total,
     least(v_total, case when settings.deposit_kind = 'percent'
       then round(v_total * settings.deposit_value / 100, 2) else settings.deposit_value end))
  returning * into plan;

  return jsonb_build_object('created', true, 'shareToken', plan.share_token);
end;
$$;

revoke all on function public.studio_flow_prepare_existing_appointment_payment(uuid) from public;
grant execute on function public.studio_flow_prepare_existing_appointment_payment(uuid) to authenticated;

commit;
