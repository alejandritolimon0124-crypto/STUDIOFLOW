create type appointment_status as enum (
  'scheduled',
  'completed',
  'cancelled',
  'no_show',
  'disputed'
);

create type booking_source as enum (
  'artist',
  'studio',
  'client_portal',
  'marketplace',
  'admin'
);

create type promotion_scope_type as enum (
  'artist',
  'studio',
  'membership'
);

create type promotion_type as enum (
  'happy_hour',
  'double_points',
  'low_occupancy',
  'private_promo',
  'early_booking'
);

create type promotion_status as enum (
  'draft',
  'scheduled',
  'active',
  'paused',
  'completed',
  'expired'
);

create table promotions (
  id uuid primary key default gen_random_uuid(),
  scope_type promotion_scope_type not null,
  artist_id uuid references artists(id),
  studio_id uuid references studios(id),
  membership_id uuid references artist_studio_memberships(id),
  created_by_profile_id uuid references profiles(id),
  promotion_type promotion_type not null,
  name text not null,
  status promotion_status not null default 'draft',
  starts_at timestamptz,
  ends_at timestamptz,
  rules jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promotions_scope_check check (
    (scope_type = 'artist' and artist_id is not null and studio_id is null and membership_id is null)
    or (scope_type = 'studio' and studio_id is not null and artist_id is null and membership_id is null)
    or (scope_type = 'membership' and membership_id is not null and artist_id is null and studio_id is null)
  ),
  constraint promotions_time_check check (
    ends_at is null or starts_at is null or ends_at > starts_at
  )
);

create index promotions_scope_artist_idx on promotions (scope_type, artist_id);
create index promotions_scope_studio_idx on promotions (scope_type, studio_id);
create index promotions_scope_membership_idx on promotions (scope_type, membership_id);
create index promotions_status_idx on promotions (status);
create index promotions_time_idx on promotions (starts_at, ends_at);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  artist_id uuid not null references artists(id),
  studio_id uuid references studios(id),
  membership_id uuid references artist_studio_memberships(id),
  service_offering_id uuid not null references service_offerings(id),
  availability_slot_id uuid references availability_slots(id),
  marketplace_listing_id uuid,
  promotion_id uuid references promotions(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status appointment_status not null default 'scheduled',
  booking_source booking_source not null,
  client_notes text,
  created_by_profile_id uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  constraint appointments_availability_slot_unique unique (availability_slot_id),
  constraint appointments_time_check check (ends_at > starts_at),
  constraint appointments_membership_studio_check check (
    membership_id is null or studio_id is not null
  ),
  constraint appointments_completed_at_check check (
    status <> 'completed' or completed_at is not null
  ),
  constraint appointments_cancelled_at_check check (
    status <> 'cancelled' or cancelled_at is not null
  )
);

create index appointments_artist_starts_at_idx on appointments (artist_id, starts_at);
create index appointments_membership_starts_at_idx on appointments (membership_id, starts_at);
create index appointments_studio_starts_at_idx on appointments (studio_id, starts_at);
create index appointments_client_starts_at_idx on appointments (client_id, starts_at);
create index appointments_status_starts_at_idx on appointments (status, starts_at);
create index appointments_service_offering_id_idx on appointments (service_offering_id);

create table appointment_status_events (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments(id),
  from_status appointment_status,
  to_status appointment_status not null,
  reason text,
  changed_by_profile_id uuid references profiles(id),
  changed_at timestamptz not null default now()
);

create index appointment_status_events_appointment_id_idx on appointment_status_events (appointment_id);
create index appointment_status_events_to_status_changed_at_idx on appointment_status_events (to_status, changed_at);

