begin;

create or replace function public.studio_flow_commission_waived(p_starts_at timestamptz)
returns boolean
language sql
stable
set search_path = public
as $$
  select (p_starts_at at time zone 'America/Mexico_City')::date >= date '2026-10-01'
     and (p_starts_at at time zone 'America/Mexico_City')::date < date '2027-01-01';
$$;

revoke all on function public.studio_flow_commission_waived(timestamptz) from public, anon, authenticated;

alter table public.commissions drop constraint if exists commissions_rate_check;
alter table public.commissions add constraint commissions_rate_check check (rate in (0, 0.10));

create or replace function public.studio_flow_apply_commission_waiver()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_starts_at timestamptz;
begin
  select starts_at into v_starts_at from public.appointments where id = new.appointment_id;
  if public.studio_flow_commission_waived(v_starts_at) then
    if tg_table_name = 'commissions' then
      new.amount := 0;
      new.rate := 0;
      new.status := 'void';
      new.chargeable_at := null;
    else
      new.platform_fee_amount := 0;
      new.artist_revenue_amount := new.gross_amount;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.studio_flow_apply_commission_waiver() from public, anon, authenticated;

drop trigger if exists studio_flow_waive_appointment_economy_fee on public.appointment_economies;
create trigger studio_flow_waive_appointment_economy_fee
before insert or update on public.appointment_economies
for each row execute function public.studio_flow_apply_commission_waiver();

drop trigger if exists studio_flow_waive_commission_fee on public.commissions;
create trigger studio_flow_waive_commission_fee
before insert or update on public.commissions
for each row execute function public.studio_flow_apply_commission_waiver();

-- Keep the synchronization RPC's response consistent with the persisted zero-fee rows.
do $$
declare
  v_definition text;
  v_anchor text := '  if v_appointment.status = ''completed'' then';
begin
  select pg_get_functiondef('public.studio_flow_sync_appointment_commission(uuid)'::regprocedure)
  into v_definition;
  if position(v_anchor in v_definition) = 0 then
    raise exception 'Review commission sync before applying the 2026 waiver';
  end if;
  if position('if public.studio_flow_commission_waived(v_appointment.starts_at) then' in v_definition) = 0 then
    v_definition := replace(v_definition, v_anchor,
    '  if public.studio_flow_commission_waived(v_appointment.starts_at) then
    v_platform_fee_amount := 0;
    v_artist_revenue_amount := v_gross_amount;
  end if;

' || v_anchor);
    execute v_definition;
  end if;
end $$;

-- Reconcile existing October-December appointments without altering recorded payments.
update public.appointment_economies economy
set platform_fee_amount = 0,
    artist_revenue_amount = economy.gross_amount,
    updated_at = now()
from public.appointments appointment
where appointment.id = economy.appointment_id
  and public.studio_flow_commission_waived(appointment.starts_at)
  and (economy.platform_fee_amount <> 0 or economy.artist_revenue_amount <> economy.gross_amount);

update public.commissions commission
set amount = 0,
    rate = 0,
    status = 'void',
    chargeable_at = null,
    updated_at = now()
from public.appointments appointment
where appointment.id = commission.appointment_id
  and public.studio_flow_commission_waived(appointment.starts_at)
  and (commission.amount <> 0 or commission.rate <> 0 or commission.status <> 'void');

commit;
