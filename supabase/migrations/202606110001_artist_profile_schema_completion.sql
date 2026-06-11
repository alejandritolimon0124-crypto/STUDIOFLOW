alter table artist_profiles
  add column if not exists primary_specialty text,
  add column if not exists years_experience integer,
  add column if not exists payment_methods jsonb not null default '{}'::jsonb,
  add column if not exists whatsapp text,
  add column if not exists instagram text,
  add column if not exists facebook text,
  add column if not exists tiktok text,
  add column if not exists website text,
  add column if not exists use_studio_location boolean not null default true,
  add column if not exists address_line text,
  add column if not exists state text,
  add column if not exists postal_code text,
  add column if not exists latitude numeric(10, 7),
  add column if not exists longitude numeric(10, 7),
  add column if not exists address_references text,
  add column if not exists google_maps_url text;

create index if not exists artist_profiles_primary_specialty_idx
  on artist_profiles (primary_specialty);

create index if not exists artist_profiles_use_studio_location_idx
  on artist_profiles (use_studio_location);
