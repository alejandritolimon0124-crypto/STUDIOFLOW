create type schedule_owner_type as enum (
  'artist',
  'membership'
);

create type schedule_status as enum (
  'active',
  'inactive',
  'archived'
);

create type calendar_block_type as enum (
  'break',
  'training',
  'personal',
  'maintenance',
  'other'
);

create type calendar_block_status as enum (
  'active',
  'cancelled',
  'expired'
);

create type availability_slot_status as enum (
  'available',
  'held',
  'booked',
  'expired',
  'hidden'
);

create table schedules (
  id uuid primary key default gen_random_uuid(),
  owner_type schedule_owner_type not null,
  artist_id uuid references artists(id),
  membership_id uuid references artist_studio_memberships(id),
  timezone text not null,
  slot_interval_minutes integer not null,
  status schedule_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint schedules_owner_check check (
    (owner_type = 'artist' and artist_id is not null and membership_id is null)
    or (owner_type = 'membership' and membership_id is not null and artist_id is null)
  ),
  constraint schedules_slot_interval_check check (slot_interval_minutes > 0)
);

create index schedules_owner_artist_status_idx on schedules (owner_type, artist_id, status);
create index schedules_owner_membership_status_idx on schedules (owner_type, membership_id, status);

create table schedule_rules (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references schedules(id),
  weekday integer not null,
  is_active boolean not null default true,
  start_time time,
  end_time time,
  break_start_time time,
  break_end_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_rules_schedule_weekday_unique unique (schedule_id, weekday),
  constraint schedule_rules_weekday_check check (weekday between 0 and 6),
  constraint schedule_rules_work_hours_check check (
    not is_active
    or (start_time is not null and end_time is not null and end_time > start_time)
  ),
  constraint schedule_rules_break_check check (
    break_start_time is null
    or break_end_time is null
    or (
      break_end_time > break_start_time
      and start_time is not null
      and end_time is not null
      and break_start_time >= start_time
      and break_end_time <= end_time
    )
  )
);

create index schedule_rules_schedule_id_idx on schedule_rules (schedule_id);

create table calendar_blocks (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references schedules(id),
  block_type calendar_block_type not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  status calendar_block_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_blocks_time_check check (ends_at > starts_at)
);

create index calendar_blocks_schedule_time_idx on calendar_blocks (schedule_id, starts_at, ends_at);
create index calendar_blocks_status_idx on calendar_blocks (status);

create table availability_slots (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references schedules(id),
  artist_id uuid references artists(id),
  studio_id uuid references studios(id),
  membership_id uuid references artist_studio_memberships(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status availability_slot_status not null default 'available',
  held_by_profile_id uuid references profiles(id),
  held_until timestamptz,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint availability_slots_time_check check (ends_at > starts_at),
  constraint availability_slots_held_until_check check (
    status <> 'held' or held_until is not null
  )
);

create index availability_slots_schedule_start_status_idx on availability_slots (schedule_id, starts_at, status);
create index availability_slots_artist_start_status_idx on availability_slots (artist_id, starts_at, status);
create index availability_slots_membership_start_status_idx on availability_slots (membership_id, starts_at, status);
create index availability_slots_held_until_idx on availability_slots (held_until);

