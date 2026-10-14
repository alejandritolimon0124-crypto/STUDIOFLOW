begin;

create table public.business_payment_settings (
  scope_type text not null check (scope_type in ('artist', 'studio')),
  scope_id uuid not null,
  deposit_enabled boolean not null default false,
  deposit_kind text not null default 'percent' check (deposit_kind in ('percent', 'fixed')),
  deposit_value numeric(12,2) not null default 0 check (deposit_value >= 0),
  bank_name text not null default '',
  account_holder text not null default '',
  clabe text not null default '',
  payment_terms text not null default '',
  updated_at timestamptz not null default now(),
  primary key (scope_type, scope_id),
  constraint business_payment_settings_valid check (
    deposit_kind <> 'percent' or deposit_value <= 100
  ),
  constraint business_payment_settings_ready check (
    not deposit_enabled or (deposit_value > 0 and length(clabe) = 18 and clabe ~ '^[0-9]+$'
      and length(trim(bank_name)) > 0 and length(trim(account_holder)) > 0)
  )
);

alter table public.business_payment_settings enable row level security;
revoke all on public.business_payment_settings from anon, authenticated;

create table public.appointment_deposit_plans (
  appointment_id uuid primary key references public.appointments(id) on delete cascade,
  scope_type text not null check (scope_type in ('artist', 'studio')),
  scope_id uuid not null,
  deposit_kind text not null check (deposit_kind in ('percent', 'fixed')),
  deposit_value numeric(12,2) not null,
  bank_name text not null,
  account_holder text not null,
  clabe text not null,
  payment_terms text not null default '',
  total_amount numeric(12,2) not null default 0,
  deposit_amount numeric(12,2) not null default 0,
  deposit_received_at timestamptz,
  deposit_confirmed_by uuid references public.profiles(id),
  balance_received_at timestamptz,
  balance_confirmed_by uuid references public.profiles(id),
  share_token text not null unique default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  created_at timestamptz not null default now(),
  constraint appointment_deposit_amounts_check check (total_amount >= 0 and deposit_amount >= 0 and deposit_amount <= total_amount),
  constraint appointment_deposit_order_check check (balance_received_at is null or deposit_received_at is not null)
);

alter table public.appointment_deposit_plans enable row level security;
revoke all on public.appointment_deposit_plans from anon, authenticated;

create function public.studio_flow_capture_appointment_deposit()
returns trigger language plpgsql security definer set search_path = public as $$
declare settings public.business_payment_settings%rowtype; v_price numeric;
begin
  select price_amount into v_price from public.service_offerings where id = new.service_offering_id;
  if coalesce(v_price, 0) = 0 then
    return new;
  end if;
  if new.studio_id is not null then
    select * into settings from public.business_payment_settings
    where scope_type = 'studio' and scope_id = new.studio_id and deposit_enabled;
  else
    select * into settings from public.business_payment_settings
    where scope_type = 'artist' and scope_id = new.artist_id and deposit_enabled;
  end if;
  if found then
    insert into public.appointment_deposit_plans
      (appointment_id, scope_type, scope_id, deposit_kind, deposit_value, bank_name, account_holder, clabe, payment_terms, total_amount, deposit_amount)
    values (new.id, settings.scope_type, settings.scope_id, settings.deposit_kind, settings.deposit_value,
      settings.bank_name, settings.account_holder, settings.clabe, settings.payment_terms,
      v_price, least(v_price, case when settings.deposit_kind = 'percent'
        then round(v_price * settings.deposit_value / 100, 2) else settings.deposit_value end));
  end if;
  return new;
end;
$$;

create trigger studio_flow_capture_appointment_deposit
after insert on public.appointments for each row execute function public.studio_flow_capture_appointment_deposit();

create function public.studio_flow_sync_appointment_deposit_amount()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.appointment_deposit_plans p
  set total_amount = greatest(new.gross_amount, 0),
      deposit_amount = least(greatest(new.gross_amount, 0),
        case when p.deposit_kind = 'percent'
          then round(greatest(new.gross_amount, 0) * p.deposit_value / 100, 2)
          else p.deposit_value end),
      deposit_received_at = case when new.gross_amount <= 0 then now() else p.deposit_received_at end,
      balance_received_at = case when new.gross_amount <= 0 then now() else p.balance_received_at end
  where p.appointment_id = new.appointment_id and p.deposit_received_at is null;
  return new;
end;
$$;

create trigger studio_flow_sync_appointment_deposit_amount
after insert or update of gross_amount on public.appointment_economies
for each row execute function public.studio_flow_sync_appointment_deposit_amount();

create function public.studio_flow_get_business_payment_settings(p_scope_type text, p_scope_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare settings public.business_payment_settings%rowtype;
begin
  if auth.uid() is null or not (
    (p_scope_type = 'artist' and exists(select 1 from public.artists where id = p_scope_id and profile_id = auth.uid()))
    or (p_scope_type = 'studio' and exists(select 1 from public.studios where id = p_scope_id and owner_profile_id = auth.uid()))
  ) then raise exception 'No tienes acceso a estos datos de cobro.'; end if;
  select * into settings from public.business_payment_settings where scope_type = p_scope_type and scope_id = p_scope_id;
  return coalesce(to_jsonb(settings), '{}'::jsonb);
end;
$$;

create function public.studio_flow_save_business_payment_settings(
  p_scope_type text, p_scope_id uuid, p_enabled boolean, p_kind text, p_value numeric,
  p_bank_name text, p_account_holder text, p_clabe text, p_terms text
) returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare settings public.business_payment_settings%rowtype;
begin
  if auth.uid() is null or not (
    (p_scope_type = 'artist' and exists(select 1 from public.artists where id = p_scope_id and profile_id = auth.uid()))
    or (p_scope_type = 'studio' and exists(select 1 from public.studios where id = p_scope_id and owner_profile_id = auth.uid()))
  ) then raise exception 'No tienes permiso para configurar estos cobros.'; end if;
  if p_kind not in ('percent', 'fixed') or coalesce(p_value, 0) < 0 or (p_kind = 'percent' and p_value > 100) then
    raise exception 'Revisa el importe del anticipo.';
  end if;
  if coalesce(p_enabled, false) and (coalesce(p_value, 0) = 0 or coalesce(p_clabe, '') !~ '^[0-9]{18}$'
    or length(trim(coalesce(p_bank_name, ''))) = 0 or length(trim(coalesce(p_account_holder, ''))) = 0) then
    raise exception 'Para solicitar anticipos, completa banco, titular y CLABE de 18 digitos.';
  end if;
  insert into public.business_payment_settings
    (scope_type, scope_id, deposit_enabled, deposit_kind, deposit_value, bank_name, account_holder, clabe, payment_terms)
  values (p_scope_type, p_scope_id, coalesce(p_enabled, false), p_kind, coalesce(p_value, 0),
    trim(coalesce(p_bank_name, '')), trim(coalesce(p_account_holder, '')), trim(coalesce(p_clabe, '')), left(trim(coalesce(p_terms, '')), 500))
  on conflict (scope_type, scope_id) do update set
    deposit_enabled = excluded.deposit_enabled, deposit_kind = excluded.deposit_kind,
    deposit_value = excluded.deposit_value, bank_name = excluded.bank_name,
    account_holder = excluded.account_holder, clabe = excluded.clabe,
    payment_terms = excluded.payment_terms, updated_at = now()
  returning * into settings;
  return to_jsonb(settings);
end;
$$;

create function public.studio_flow_get_deposit_policy(p_service_offering_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_service public.service_offerings%rowtype; settings public.business_payment_settings%rowtype;
begin
  select * into v_service from public.service_offerings where id = p_service_offering_id and status = 'active';
  if not found then return '{}'::jsonb; end if;
  if v_service.owner_type = 'artist' then
    select * into settings from public.business_payment_settings where scope_type = 'artist' and scope_id = v_service.artist_id and deposit_enabled;
  else
    select * into settings from public.business_payment_settings where scope_type = 'studio'
      and scope_id = coalesce(v_service.studio_id, (select studio_id from public.artist_studio_memberships where id = v_service.membership_id))
      and deposit_enabled;
  end if;
  if not found then return '{}'::jsonb; end if;
  return jsonb_build_object('enabled', true, 'kind', settings.deposit_kind, 'value', settings.deposit_value,
    'businessName', settings.account_holder, 'terms', settings.payment_terms);
end;
$$;

create function public.studio_flow_get_appointment_deposits(p_ids uuid[])
returns jsonb language sql stable security definer set search_path = public, auth as $$
  select coalesce(jsonb_object_agg(p.appointment_id, jsonb_build_object(
    'total', p.total_amount, 'deposit', p.deposit_amount, 'balance', p.total_amount - p.deposit_amount,
    'depositReceivedAt', p.deposit_received_at, 'balanceReceivedAt', p.balance_received_at,
    'bankName', p.bank_name, 'accountHolder', p.account_holder, 'clabe', p.clabe,
    'terms', p.payment_terms, 'shareToken', p.share_token
  )), '{}'::jsonb)
  from public.appointment_deposit_plans p join public.appointments a on a.id = p.appointment_id
  where p.appointment_id = any(p_ids) and auth.uid() is not null
    and (exists(select 1 from public.clients c where c.id = a.client_id and c.profile_id = auth.uid())
      or exists(select 1 from public.artists ar where ar.id = a.artist_id and ar.profile_id = auth.uid())
      or exists(select 1 from public.studios s where s.id = a.studio_id and s.owner_profile_id = auth.uid()));
$$;

create function public.studio_flow_confirm_appointment_payment(p_appointment_id uuid, p_stage text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare plan public.appointment_deposit_plans%rowtype;
begin
  if p_stage not in ('deposit', 'balance') then raise exception 'Etapa de pago no valida.'; end if;
  if not exists (
    select 1 from public.appointments a
    where a.id = p_appointment_id and a.status = 'scheduled' and (
      (a.studio_id is null and exists(select 1 from public.artists ar where ar.id = a.artist_id and ar.profile_id = auth.uid()))
      or (a.studio_id is not null and exists(select 1 from public.studios s where s.id = a.studio_id and s.owner_profile_id = auth.uid()))
    )
  ) then raise exception 'No puedes confirmar este cobro.'; end if;
  select * into plan from public.appointment_deposit_plans where appointment_id = p_appointment_id for update;
  if not found then raise exception 'Esta cita no tiene un plan de anticipo.'; end if;
  if plan.total_amount <= 0 then raise exception 'El importe de esta cita aun no esta disponible.'; end if;
  if p_stage = 'deposit' and plan.deposit_received_at is null then
    update public.appointment_deposit_plans set deposit_received_at = now(), deposit_confirmed_by = auth.uid(),
      balance_received_at = case when deposit_amount >= total_amount then now() else null end,
      balance_confirmed_by = case when deposit_amount >= total_amount then auth.uid() else null end
    where appointment_id = p_appointment_id returning * into plan;
  elsif p_stage = 'balance' then
    if plan.deposit_received_at is null then raise exception 'Confirma primero el anticipo.'; end if;
    if plan.balance_received_at is null then
      update public.appointment_deposit_plans set balance_received_at = now(), balance_confirmed_by = auth.uid()
      where appointment_id = p_appointment_id returning * into plan;
    end if;
  end if;
  return jsonb_build_object('depositReceivedAt', plan.deposit_received_at, 'balanceReceivedAt', plan.balance_received_at);
end;
$$;

create function public.studio_flow_public_payment_card(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('businessName', case when p.scope_type = 'studio' then s.name else ar.display_name end,
    'bankName', p.bank_name, 'accountHolder', p.account_holder, 'clabe', p.clabe,
    'total', p.total_amount, 'deposit', p.deposit_amount, 'balance', p.total_amount - p.deposit_amount,
    'depositReceivedAt', p.deposit_received_at, 'balanceReceivedAt', p.balance_received_at,
    'terms', p.payment_terms, 'cancelled', a.status = 'cancelled')
  from public.appointment_deposit_plans p join public.appointments a on a.id = p.appointment_id
  left join public.studios s on p.scope_type = 'studio' and s.id = p.scope_id
  left join public.artists ar on p.scope_type = 'artist' and ar.id = p.scope_id
  where p.share_token = p_token and length(p_token) = 64;
$$;

revoke all on function public.studio_flow_get_business_payment_settings(text,uuid) from public;
revoke all on function public.studio_flow_save_business_payment_settings(text,uuid,boolean,text,numeric,text,text,text,text) from public;
revoke all on function public.studio_flow_get_deposit_policy(uuid) from public;
revoke all on function public.studio_flow_get_appointment_deposits(uuid[]) from public;
revoke all on function public.studio_flow_confirm_appointment_payment(uuid,text) from public;
revoke all on function public.studio_flow_public_payment_card(text) from public;
grant execute on function public.studio_flow_get_business_payment_settings(text,uuid) to authenticated;
grant execute on function public.studio_flow_save_business_payment_settings(text,uuid,boolean,text,numeric,text,text,text,text) to authenticated;
grant execute on function public.studio_flow_get_deposit_policy(uuid) to anon, authenticated;
grant execute on function public.studio_flow_get_appointment_deposits(uuid[]) to authenticated;
grant execute on function public.studio_flow_confirm_appointment_payment(uuid,text) to authenticated;
grant execute on function public.studio_flow_public_payment_card(text) to anon, authenticated;

commit;
