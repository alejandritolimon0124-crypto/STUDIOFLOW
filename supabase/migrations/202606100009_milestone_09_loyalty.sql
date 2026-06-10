create type loyalty_account_status as enum (
  'active',
  'paused',
  'closed'
);

create type flow_point_movement_type as enum (
  'earn',
  'spend',
  'expire',
  'adjust'
);

create type flow_point_reason as enum (
  'appointment_completed',
  'reward_redeemed',
  'expiration',
  'manual_adjustment',
  'promotion'
);

create type reward_scope_type as enum (
  'platform',
  'studio',
  'artist'
);

create type reward_type as enum (
  'discount',
  'service_upgrade',
  'birthday_gift',
  'private_offer'
);

create type reward_status as enum (
  'draft',
  'active',
  'paused',
  'retired'
);

create type reward_redemption_status as enum (
  'requested',
  'confirmed',
  'applied',
  'cancelled',
  'expired'
);

create table loyalty_accounts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  points_balance integer not null default 0,
  streak_count integer not null default 0,
  status loyalty_account_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loyalty_accounts_client_id_unique unique (client_id),
  constraint loyalty_accounts_points_balance_check check (points_balance >= 0),
  constraint loyalty_accounts_streak_count_check check (streak_count >= 0)
);

create index loyalty_accounts_client_id_idx on loyalty_accounts (client_id);
create index loyalty_accounts_status_idx on loyalty_accounts (status);

create table rewards (
  id uuid primary key default gen_random_uuid(),
  scope_type reward_scope_type not null,
  studio_id uuid references studios(id),
  artist_id uuid references artists(id),
  name text not null,
  reward_type reward_type not null,
  points_cost integer not null,
  status reward_status not null default 'draft',
  validity_days integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint rewards_scope_check check (
    (scope_type = 'platform' and studio_id is null and artist_id is null)
    or (scope_type = 'studio' and studio_id is not null and artist_id is null)
    or (scope_type = 'artist' and artist_id is not null and studio_id is null)
  ),
  constraint rewards_points_cost_check check (points_cost > 0)
);

create index rewards_scope_studio_idx on rewards (scope_type, studio_id);
create index rewards_scope_artist_idx on rewards (scope_type, artist_id);
create index rewards_status_idx on rewards (status);

create table reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  loyalty_account_id uuid not null references loyalty_accounts(id),
  reward_id uuid not null references rewards(id),
  appointment_id uuid references appointments(id),
  points_spent integer not null,
  status reward_redemption_status not null default 'requested',
  redeemed_at timestamptz not null default now(),
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reward_redemptions_points_spent_check check (points_spent > 0),
  constraint reward_redemptions_applied_at_check check (
    status <> 'applied' or applied_at is not null
  )
);

create index reward_redemptions_loyalty_account_id_idx on reward_redemptions (loyalty_account_id);
create index reward_redemptions_reward_id_idx on reward_redemptions (reward_id);
create index reward_redemptions_appointment_id_idx on reward_redemptions (appointment_id);
create index reward_redemptions_status_idx on reward_redemptions (status);

create table flow_point_ledger (
  id uuid primary key default gen_random_uuid(),
  loyalty_account_id uuid not null references loyalty_accounts(id),
  appointment_id uuid references appointments(id),
  reward_redemption_id uuid references reward_redemptions(id),
  movement_type flow_point_movement_type not null,
  points integer not null,
  reason flow_point_reason not null,
  idempotency_key text,
  expires_at timestamptz,
  occurred_at timestamptz not null default now(),
  metadata jsonb,
  created_at timestamptz not null default now(),
  constraint flow_point_ledger_idempotency_key_unique unique (idempotency_key),
  constraint flow_point_ledger_points_nonzero_check check (points <> 0),
  constraint flow_point_ledger_points_direction_check check (
    (movement_type = 'earn' and points > 0)
    or (movement_type in ('spend', 'expire') and points < 0)
    or movement_type = 'adjust'
  )
);

create index flow_point_ledger_loyalty_account_id_idx on flow_point_ledger (loyalty_account_id);
create index flow_point_ledger_appointment_id_idx on flow_point_ledger (appointment_id);
create index flow_point_ledger_reward_redemption_id_idx on flow_point_ledger (reward_redemption_id);
create index flow_point_ledger_occurred_at_idx on flow_point_ledger (occurred_at);
create index flow_point_ledger_expires_at_idx on flow_point_ledger (expires_at);

