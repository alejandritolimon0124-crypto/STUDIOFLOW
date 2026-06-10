create type appointment_economy_status as enum (
  'quoted',
  'earned',
  'void',
  'disputed',
  'adjusted'
);

create type commission_status as enum (
  'potential',
  'chargeable',
  'void',
  'disputed',
  'adjusted'
);

create table appointment_economies (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments(id),
  gross_amount numeric not null,
  platform_fee_amount numeric not null,
  artist_revenue_amount numeric not null,
  studio_revenue_amount numeric,
  currency text not null,
  calculation_status appointment_economy_status not null default 'quoted',
  calculation_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  earned_at timestamptz,
  adjusted_at timestamptz,
  constraint appointment_economies_appointment_id_unique unique (appointment_id),
  constraint appointment_economies_amounts_check check (
    gross_amount >= 0
    and platform_fee_amount >= 0
    and artist_revenue_amount >= 0
    and (studio_revenue_amount is null or studio_revenue_amount >= 0)
  ),
  constraint appointment_economies_earned_at_check check (
    calculation_status <> 'earned' or earned_at is not null
  )
);

create index appointment_economies_appointment_id_idx on appointment_economies (appointment_id);
create index appointment_economies_status_created_at_idx on appointment_economies (calculation_status, created_at);

create table commissions (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments(id),
  appointment_economy_id uuid not null references appointment_economies(id),
  amount numeric not null,
  rate numeric not null,
  currency text not null,
  status commission_status not null default 'potential',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  chargeable_at timestamptz,
  adjusted_at timestamptz,
  constraint commissions_appointment_id_unique unique (appointment_id),
  constraint commissions_appointment_economy_id_unique unique (appointment_economy_id),
  constraint commissions_rate_check check (rate = 0.10),
  constraint commissions_amount_check check (amount >= 0),
  constraint commissions_chargeable_at_check check (
    status <> 'chargeable' or chargeable_at is not null
  )
);

create index commissions_appointment_id_idx on commissions (appointment_id);
create index commissions_status_created_at_idx on commissions (status, created_at);

