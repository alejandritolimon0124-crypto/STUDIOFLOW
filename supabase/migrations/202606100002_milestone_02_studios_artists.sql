create type studio_status as enum (
  'pending',
  'approved',
  'suspended',
  'rejected',
  'archived'
);

create type risk_score as enum (
  'low',
  'medium',
  'high',
  'critical'
);

create type governance_review_type as enum (
  'onboarding',
  'status_change',
  'risk',
  'appeal'
);

create type governance_review_status as enum (
  'open',
  'approved',
  'changes_requested',
  'suspended',
  'rejected',
  'resolved'
);

create type artist_status as enum (
  'active',
  'inactive',
  'archived'
);

create type membership_role as enum (
  'artist',
  'lead_artist',
  'guest_artist'
);

create type membership_status as enum (
  'active',
  'inactive',
  'archived'
);

create type client_status as enum (
  'active',
  'inactive',
  'archived'
);

create table studios (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references profiles(id),
  name text not null,
  studio_status studio_status not null default 'pending',
  risk_score risk_score,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  suspended_at timestamptz,
  archived_at timestamptz
);

create index studios_owner_profile_id_idx on studios (owner_profile_id);
create index studios_status_idx on studios (studio_status);
create index studios_status_created_at_idx on studios (studio_status, created_at);

create table artists (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id),
  display_name text not null,
  status artist_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint artists_profile_id_unique unique (profile_id)
);

create index artists_profile_id_idx on artists (profile_id);
create index artists_status_idx on artists (status);

create table clients (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id),
  display_name text not null,
  email text,
  phone text,
  status client_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint clients_profile_id_unique unique (profile_id)
);

create index clients_profile_id_idx on clients (profile_id);
create index clients_email_idx on clients (email);
create index clients_phone_idx on clients (phone);
create index clients_status_idx on clients (status);

create table studio_profiles (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id),
  commercial_name text not null,
  description text,
  email text,
  phone text,
  address_line text,
  city text,
  geo_lat numeric,
  geo_lng numeric,
  logo_path text,
  gallery_paths text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint studio_profiles_studio_id_unique unique (studio_id)
);

create index studio_profiles_studio_id_idx on studio_profiles (studio_id);
create index studio_profiles_city_idx on studio_profiles (city);

create table governance_reviews (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id),
  review_type governance_review_type not null,
  status governance_review_status not null default 'open',
  reason text,
  decision_notes text,
  reviewed_by_profile_id uuid references profiles(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint governance_reviews_resolved_at_check check (
    status not in ('approved', 'changes_requested', 'suspended', 'rejected', 'resolved')
    or resolved_at is not null
  )
);

create index governance_reviews_studio_id_idx on governance_reviews (studio_id);
create index governance_reviews_status_created_at_idx on governance_reviews (status, created_at);

create table artist_profiles (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references artists(id),
  artistic_name text not null,
  bio text,
  specialties text[],
  photo_path text,
  portfolio_paths text[],
  city text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint artist_profiles_artist_id_unique unique (artist_id)
);

create index artist_profiles_artist_id_idx on artist_profiles (artist_id);
create index artist_profiles_city_idx on artist_profiles (city);

create table artist_studio_memberships (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references artists(id),
  studio_id uuid not null references studios(id),
  role membership_role not null default 'artist',
  status membership_status not null default 'active',
  started_at date,
  ended_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint artist_studio_memberships_dates_check check (
    ended_at is null or started_at is null or ended_at >= started_at
  ),
  constraint artist_studio_memberships_archived_ended_check check (
    status <> 'archived' or ended_at is not null
  )
);

create unique index artist_studio_memberships_active_unique
  on artist_studio_memberships (artist_id, studio_id)
  where status = 'active';

create index artist_studio_memberships_artist_id_idx on artist_studio_memberships (artist_id);
create index artist_studio_memberships_studio_id_idx on artist_studio_memberships (studio_id);
create index artist_studio_memberships_studio_status_idx on artist_studio_memberships (studio_id, status);
create index artist_studio_memberships_artist_status_idx on artist_studio_memberships (artist_id, status);

create table user_role_assignments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id),
  role_id uuid not null references roles(id),
  studio_id uuid references studios(id),
  status role_assignment_status not null default 'active',
  assigned_by_profile_id uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz
);

create unique index user_role_assignments_active_unique
  on user_role_assignments (profile_id, role_id, studio_id)
  where status = 'active';

create index user_role_assignments_profile_id_idx on user_role_assignments (profile_id);
create index user_role_assignments_studio_id_idx on user_role_assignments (studio_id);
create index user_role_assignments_profile_studio_status_idx on user_role_assignments (profile_id, studio_id, status);

