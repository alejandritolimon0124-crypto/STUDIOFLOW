create type risk_entity_type as enum (
  'appointment',
  'studio',
  'artist',
  'client',
  'commission',
  'listing'
);

create type risk_flag_type as enum (
  'economy',
  'governance',
  'no_show',
  'fairness',
  'abuse',
  'data_quality'
);

create type risk_flag_status as enum (
  'open',
  'under_review',
  'resolved',
  'dismissed'
);

create type sanction_subject_type as enum (
  'client',
  'artist',
  'studio',
  'profile'
);

create type sanction_type as enum (
  'warning',
  'booking_limit',
  'visibility_limit',
  'suspension',
  'manual_review'
);

create type sanction_status as enum (
  'active',
  'lifted',
  'expired',
  'appealed'
);

create type no_show_case_status as enum (
  'open',
  'accepted',
  'disputed',
  'resolved',
  'dismissed'
);

create type audit_context as enum (
  'identity',
  'studio',
  'booking',
  'economy',
  'loyalty',
  'marketplace',
  'trust',
  'marketing'
);

create table risk_flags (
  id uuid primary key default gen_random_uuid(),
  entity_type risk_entity_type not null,
  entity_id uuid not null,
  appointment_id uuid references appointments(id),
  studio_id uuid references studios(id),
  artist_id uuid references artists(id),
  client_id uuid references clients(id),
  flag_type risk_flag_type not null,
  severity risk_score not null,
  status risk_flag_status not null default 'open',
  metadata jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint risk_flags_resolved_at_check check (
    status not in ('resolved', 'dismissed') or resolved_at is not null
  )
);

create index risk_flags_entity_idx on risk_flags (entity_type, entity_id);
create index risk_flags_appointment_id_idx on risk_flags (appointment_id);
create index risk_flags_studio_id_idx on risk_flags (studio_id);
create index risk_flags_artist_id_idx on risk_flags (artist_id);
create index risk_flags_client_id_idx on risk_flags (client_id);
create index risk_flags_status_severity_idx on risk_flags (status, severity);

create table sanctions (
  id uuid primary key default gen_random_uuid(),
  subject_type sanction_subject_type not null,
  subject_id uuid not null,
  sanction_type sanction_type not null,
  reason text not null,
  status sanction_status not null default 'active',
  created_by_profile_id uuid references profiles(id),
  starts_at timestamptz not null,
  ends_at timestamptz,
  lifted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sanctions_time_check check (ends_at is null or ends_at > starts_at),
  constraint sanctions_lifted_at_check check (
    status <> 'lifted' or lifted_at is not null
  )
);

create index sanctions_subject_idx on sanctions (subject_type, subject_id);
create index sanctions_status_idx on sanctions (status);
create index sanctions_time_idx on sanctions (starts_at, ends_at);

create table no_show_cases (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments(id),
  reported_by_profile_id uuid references profiles(id),
  status no_show_case_status not null default 'open',
  reason text,
  reported_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint no_show_cases_resolved_at_check check (
    status not in ('resolved', 'dismissed') or resolved_at is not null
  )
);

create unique index no_show_cases_active_appointment_unique
  on no_show_cases (appointment_id)
  where status in ('open', 'accepted', 'disputed');

create index no_show_cases_appointment_id_idx on no_show_cases (appointment_id);
create index no_show_cases_status_idx on no_show_cases (status);
create index no_show_cases_reported_at_idx on no_show_cases (reported_at);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references profiles(id),
  context audit_context not null,
  entity_type text not null,
  entity_id uuid not null,
  studio_id uuid references studios(id),
  artist_id uuid references artists(id),
  membership_id uuid references artist_studio_memberships(id),
  client_id uuid references clients(id),
  appointment_id uuid references appointments(id),
  event_type text not null,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index audit_events_context_occurred_at_idx on audit_events (context, occurred_at);
create index audit_events_entity_idx on audit_events (entity_type, entity_id);
create index audit_events_actor_profile_id_idx on audit_events (actor_profile_id);
create index audit_events_studio_id_idx on audit_events (studio_id);
create index audit_events_artist_id_idx on audit_events (artist_id);
create index audit_events_membership_id_idx on audit_events (membership_id);
create index audit_events_client_id_idx on audit_events (client_id);
create index audit_events_appointment_id_idx on audit_events (appointment_id);

