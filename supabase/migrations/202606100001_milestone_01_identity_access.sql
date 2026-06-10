create extension if not exists pgcrypto;

create type profile_default_role as enum (
  'platform_owner',
  'studio_owner',
  'studio_manager',
  'artist',
  'client'
);

create type profile_status as enum (
  'active',
  'suspended',
  'archived'
);

create type role_code as enum (
  'platform_owner',
  'studio_owner',
  'studio_manager',
  'artist',
  'client'
);

create type permission_context as enum (
  'identity',
  'studio',
  'professional_network',
  'services',
  'booking',
  'customer',
  'marketplace',
  'economy',
  'loyalty',
  'marketing',
  'trust',
  'analytics'
);

create type role_assignment_status as enum (
  'active',
  'revoked',
  'archived'
);

create table profiles (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  email text not null,
  phone text,
  default_role profile_default_role not null,
  status profile_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint profiles_email_unique unique (email)
);

create index profiles_status_idx on profiles (status);

create table roles (
  id uuid primary key default gen_random_uuid(),
  code role_code not null,
  label text not null,
  description text,
  is_system boolean not null default true,
  created_at timestamptz not null default now(),
  constraint roles_code_unique unique (code)
);

create table permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  context permission_context not null,
  label text not null,
  description text,
  created_at timestamptz not null default now(),
  constraint permissions_code_unique unique (code)
);

create index permissions_context_idx on permissions (context);

create table role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references roles(id),
  permission_id uuid not null references permissions(id),
  created_at timestamptz not null default now(),
  constraint role_permissions_role_permission_unique unique (role_id, permission_id)
);

create index role_permissions_role_id_idx on role_permissions (role_id);
create index role_permissions_permission_id_idx on role_permissions (permission_id);

