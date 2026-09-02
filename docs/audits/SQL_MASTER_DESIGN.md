# SQL MASTER DESIGN

## 0. Alcance

Este documento convierte la arquitectura congelada en un diseno fisico completo para SQL/Supabase.

No contiene `CREATE TABLE`, no contiene SQL ejecutable, no crea migraciones y no modifica codigo. Es la referencia final previa a escribir migraciones reales.

Fuentes de verdad:

- `ARCHITECTURE_FREEZE.md`
- `SUPABASE_ARCHITECTURE_MASTER.md`
- `LOGICAL_DATA_MODEL_MASTER.md`
- `DOMAIN_MODEL_MASTER.md`
- `CUSTOMER_360_MASTER_MODEL.md`

Nota local: en este workspace estan disponibles `ARCHITECTURE_FREEZE.md`, `SUPABASE_ARCHITECTURE_MASTER.md` y `LOGICAL_DATA_MODEL_MASTER.md`. Las decisiones de los documentos no disponibles se consideran absorbidas en los masters presentes.

## 1. Convenciones Fisicas

Tipos logicos:

- `uuid`: primary keys y foreign keys.
- `text`: cadenas.
- `enum`: valores cerrados que deberan mapearse a tipos/checks en SQL real.
- `boolean`: flags.
- `integer`: cantidades enteras.
- `numeric`: dinero, porcentajes y scores.
- `date`: fecha.
- `time`: hora.
- `timestamptz`: timestamp con zona.
- `jsonb`: metadata controlada.
- `text[]`: lista simple de textos cuando no amerita tabla hija en MVP.

Columnas obligatorias por defecto:

- `id`: required, primary key.
- `created_at`: required.
- `updated_at`: required en tablas editables; nullable solo en ledgers/eventos append-only.

Soft delete:

- Usar `archived_at` para entidades principales que no deben borrarse si tienen historia.
- Usar `status` para ciclo operacional.
- No usar hard delete en entidades con citas, economia, loyalty, trust o auditoria.

## 2. Tablas Definitivas MVP

### Identity & Access

- `profiles`
- `roles`
- `permissions`
- `role_permissions`
- `user_role_assignments`

### Studio Governance

- `studios`
- `studio_profiles`
- `governance_reviews`

### Professional Network

- `artists`
- `artist_profiles`
- `artist_studio_memberships`

Nota freeze: `studio_team_members` queda fuera del MVP como fuente de verdad para evitar duplicidad con `user_role_assignments`.

### Service Catalog

- `service_categories`
- `service_tiers`
- `service_offerings`

### Scheduling & Booking

- `schedules`
- `schedule_rules`
- `calendar_blocks`
- `availability_slots`
- `appointments`
- `appointment_status_events`

Nota freeze: `availability_slots` entra al MVP porque `reserved/held` no vive en `appointments`.

### Customer 360

- `clients`
- `client_profiles`
- `customer_relationships`
- `customer_private_notes`
- `favorite_artists`

Nota freeze: `customer_private_notes` entra al MVP para separar notas internas de datos globales del cliente.

### Marketplace

- `marketplace_profiles`
- `marketplace_listings`

### Appointment Economy

- `appointment_economies`
- `commissions`

### Loyalty & Flow Points

- `loyalty_accounts`
- `flow_point_ledger`
- `rewards`
- `reward_redemptions`

### Impulsa Tu Negocio

- `promotions`

### Trust & Governance

- `risk_flags`
- `sanctions`
- `no_show_cases`
- `audit_events`

## 3. Diseno de Tablas MVP

### 3.1 `profiles`

Proposito: perfil de aplicacion vinculado a identidad autenticable.

Columnas:

| Columna | Tipo | Required | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | PK. Debe mapear con auth user cuando aplique. |
| `display_name` | text | si | Nombre visible. |
| `email` | text | si | Email principal. |
| `phone` | text | no | Telefono. |
| `default_role` | enum | si | platform_owner, studio_owner, studio_manager, artist, client. |
| `status` | enum | si | active, suspended, archived. |
| `created_at` | timestamptz | si | Creacion. |
| `updated_at` | timestamptz | si | Actualizacion. |
| `archived_at` | timestamptz | no | Soft delete. |

PK: `id`.

FK: ninguna interna obligatoria.

Unique constraints:

- `email`.

Check constraints:

- `status` en valores permitidos.
- `default_role` en valores permitidos.

Cardinalidades:

- `profiles` 1:N `user_role_assignments`.
- `profiles` 1:0..1 `artists`.
- `profiles` 1:0..1 `clients`.

Ownership: Identity & Access.

Indices recomendados:

- `email`.
- `status`.

### 3.2 `roles`

Proposito: catalogo de roles.

Columnas:

| Columna | Tipo | Required | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | PK. |
| `code` | enum | si | platform_owner, studio_owner, studio_manager, artist, client. |
| `label` | text | si | Nombre visible. |
| `description` | text | no | Descripcion. |
| `is_system` | boolean | si | Rol del sistema. |
| `created_at` | timestamptz | si | Creacion. |

PK: `id`.

Unique constraints:

- `code`.

Check constraints:

- `code` en valores permitidos.

Ownership: Identity & Access.

Indices recomendados:

- `code`.

### 3.3 `permissions`

Proposito: catalogo de permisos atomicos.

Columnas:

| Columna | Tipo | Required | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | PK. |
| `code` | text | si | Permiso atomico. |
| `context` | enum | si | identity, studio, professional_network, services, booking, customer, marketplace, economy, loyalty, marketing, trust, analytics. |
| `label` | text | si | Nombre visible. |
| `description` | text | no | Alcance. |
| `created_at` | timestamptz | si | Creacion. |

PK: `id`.

Unique constraints:

- `code`.

Ownership: Identity & Access.

Indices recomendados:

- `context`.
- `code`.

### 3.4 `role_permissions`

Proposito: puente roles-permisos.

Columnas:

| Columna | Tipo | Required | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | PK. |
| `role_id` | uuid | si | FK a `roles`. |
| `permission_id` | uuid | si | FK a `permissions`. |
| `created_at` | timestamptz | si | Creacion. |

PK: `id`.

FK:

- `role_id` -> `roles.id`.
- `permission_id` -> `permissions.id`.

Unique constraints:

- (`role_id`, `permission_id`).

Cardinalidad:

- `roles` N:N `permissions`.

Ownership: Identity & Access.

Indices recomendados:

- `role_id`.
- `permission_id`.

### 3.5 `user_role_assignments`

Proposito: autoridad unica para roles globales y roles scoped por estudio.

Columnas:

| Columna | Tipo | Required | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | PK. |
| `profile_id` | uuid | si | FK a `profiles`. |
| `role_id` | uuid | si | FK a `roles`. |
| `studio_id` | uuid | no | FK a `studios` cuando el rol es scoped. |
| `status` | enum | si | active, revoked, archived. |
| `assigned_by_profile_id` | uuid | no | FK a `profiles`. |
| `created_at` | timestamptz | si | Creacion. |
| `updated_at` | timestamptz | si | Actualizacion. |
| `revoked_at` | timestamptz | no | Revocacion. |

PK: `id`.

FK:

- `profile_id` -> `profiles.id`.
- `role_id` -> `roles.id`.
- `studio_id` -> `studios.id`.
- `assigned_by_profile_id` -> `profiles.id`.

Unique constraints:

- (`profile_id`, `role_id`, `studio_id`) para asignaciones activas.

Check constraints:

- `status` en valores permitidos.
- Roles globales no deben requerir `studio_id`.
- Roles studio-scoped deben requerir `studio_id`.

Cardinalidad:

- `profiles` N:N `roles`.
- `profiles` N:N `studios` mediante roles scoped.

Ownership: Identity & Access.

Indices recomendados:

- `profile_id`.
- `studio_id`.
- (`profile_id`, `studio_id`, `status`).

### 3.6 `studios`

Proposito: estudio y estado governance.

Columnas:

| Columna | Tipo | Required | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | PK. |
| `owner_profile_id` | uuid | si | FK a `profiles`. |
| `name` | text | si | Nombre base. |
| `studio_status` | enum | si | pending, approved, suspended, rejected, archived. |
| `risk_score` | enum | no | low, medium, high, critical. |
| `created_at` | timestamptz | si | Creacion. |
| `updated_at` | timestamptz | si | Actualizacion. |
| `approved_at` | timestamptz | no | Aprobacion. |
| `suspended_at` | timestamptz | no | Suspension. |
| `archived_at` | timestamptz | no | Soft delete. |

PK: `id`.

FK:

- `owner_profile_id` -> `profiles.id`.

Check constraints:

- `studio_status` en valores permitidos.
- `risk_score` en valores permitidos.

Cardinalidad:

- `studios` 1:1 `studio_profiles`.
- `studios` 1:N `artist_studio_memberships`.
- `studios` 1:N appointments scoped.
- `studios` 1:N governance reviews.

Ownership: Studio Governance.

Indices recomendados:

- `owner_profile_id`.
- `studio_status`.
- (`studio_status`, `created_at`).

### 3.7 `studio_profiles`

Proposito: datos publicos/editables del estudio.

Columnas:

| Columna | Tipo | Required | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | PK. |
| `studio_id` | uuid | si | FK a `studios`. |
| `commercial_name` | text | si | Nombre publico. |
| `description` | text | no | Bio. |
| `email` | text | no | Contacto publico. |
| `phone` | text | no | Contacto publico. |
| `address_line` | text | no | Direccion. |
| `city` | text | no | Ciudad. |
| `geo_lat` | numeric | no | Latitud. |
| `geo_lng` | numeric | no | Longitud. |
| `logo_path` | text | no | Storage. |
| `gallery_paths` | text[] | no | Storage. |
| `created_at` | timestamptz | si | Creacion. |
| `updated_at` | timestamptz | si | Actualizacion. |

PK: `id`.

FK:

- `studio_id` -> `studios.id`.

Unique constraints:

- `studio_id`.

Ownership: Studio Governance.

Indices recomendados:

- `studio_id`.
- `city`.

### 3.8 `governance_reviews`

Proposito: revisiones de aprobacion, suspension y riesgo.

Columnas:

| Columna | Tipo | Required | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | PK. |
| `studio_id` | uuid | si | FK a `studios`. |
| `review_type` | enum | si | onboarding, status_change, risk, appeal. |
| `status` | enum | si | open, approved, changes_requested, suspended, rejected, resolved. |
| `reason` | text | no | Motivo. |
| `decision_notes` | text | no | Resolucion. |
| `reviewed_by_profile_id` | uuid | no | FK a `profiles`. |
| `created_at` | timestamptz | si | Creacion. |
| `resolved_at` | timestamptz | no | Resolucion. |

PK: `id`.

FK:

- `studio_id` -> `studios.id`.
- `reviewed_by_profile_id` -> `profiles.id`.

Check constraints:

- `resolved_at` required cuando `status` es final.

Ownership: Studio Governance.

Auditable: si.

Indices recomendados:

- `studio_id`.
- (`status`, `created_at`).

### 3.9 `artists`

Proposito: artista profesional independiente de estudio.

Columnas:

| Columna | Tipo | Required | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | PK. |
| `profile_id` | uuid | no | FK a `profiles`. |
| `display_name` | text | si | Nombre base. |
| `status` | enum | si | active, inactive, archived. |
| `created_at` | timestamptz | si | Creacion. |
| `updated_at` | timestamptz | si | Actualizacion. |
| `archived_at` | timestamptz | no | Soft delete. |

PK: `id`.

FK:

- `profile_id` -> `profiles.id`.

Unique constraints:

- `profile_id` nullable unico cuando existe.

Ownership: Professional Network.

Indices recomendados:

- `profile_id`.
- `status`.

### 3.10 `artist_profiles`

Proposito: perfil profesional publico/operativo.

Columnas:

| Columna | Tipo | Required | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | PK. |
| `artist_id` | uuid | si | FK a `artists`. |
| `artistic_name` | text | si | Nombre publico. |
| `bio` | text | no | Presentacion. |
| `specialties` | text[] | no | Especialidades. |
| `photo_path` | text | no | Storage. |
| `portfolio_paths` | text[] | no | Storage. |
| `city` | text | no | Ciudad principal. |
| `created_at` | timestamptz | si | Creacion. |
| `updated_at` | timestamptz | si | Actualizacion. |

PK: `id`.

FK:

- `artist_id` -> `artists.id`.

Unique constraints:

- `artist_id`.

No persistir:

- `rating_average` en MVP como fuente primaria; debe ser snapshot/metric posterior.

Ownership: Professional Network.

Indices recomendados:

- `artist_id`.
- `city`.

### 3.11 `artist_studio_memberships`

Proposito: vinculo hibrido artista-estudio.

Columnas:

| Columna | Tipo | Required | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | PK. |
| `artist_id` | uuid | si | FK a `artists`. |
| `studio_id` | uuid | si | FK a `studios`. |
| `role` | enum | si | artist, lead_artist, guest_artist. |
| `status` | enum | si | active, inactive, archived. |
| `started_at` | date | no | Inicio. |
| `ended_at` | date | no | Fin. |
| `created_at` | timestamptz | si | Creacion. |
| `updated_at` | timestamptz | si | Actualizacion. |
| `archived_at` | timestamptz | no | Soft delete. |

PK: `id`.

FK:

- `artist_id` -> `artists.id`.
- `studio_id` -> `studios.id`.

Unique constraints:

- (`artist_id`, `studio_id`) para memberships activas.

Check constraints:

- `ended_at` >= `started_at` cuando ambos existan.
- `ended_at` required si `status = archived`.

Cardinalidad:

- `artists` N:N `studios`.
- `artist_studio_memberships` 1:N `appointments`.
- `artist_studio_memberships` 1:N `service_offerings` cuando owner = membership.

Ownership: Professional Network.

Auditable: si.

Indices recomendados:

- `artist_id`.
- `studio_id`.
- (`studio_id`, `status`).
- (`artist_id`, `status`).

### 3.12 `service_categories`

Proposito: catalogo de categorias.

Columnas:

| Columna | Tipo | Required | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | PK. |
| `name` | text | si | Nombre. |
| `slug` | text | si | Slug. |
| `status` | enum | si | active, retired. |
| `sort_order` | integer | no | Orden. |
| `created_at` | timestamptz | si | Creacion. |

PK: `id`.

Unique constraints:

- `slug`.
- `name`.

Ownership: Service Catalog.

Indices recomendados:

- `status`.
- `sort_order`.

### 3.13 `service_tiers`

Proposito: tiers para economia/loyalty.

Columnas:

| Columna | Tipo | Required | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | PK. |
| `code` | enum | si | basic, medium, premium, vip. |
| `label` | text | si | Nombre. |
| `default_points` | integer | no | Puntos base. |
| `status` | enum | si | active, retired. |
| `created_at` | timestamptz | si | Creacion. |

PK: `id`.

Unique constraints:

- `code`.

Check constraints:

- `default_points` >= 0.

Ownership: Service Catalog.

Indices recomendados:

- `code`.
- `status`.

### 3.14 `service_offerings`

Proposito: servicio vendible con owner operacional unico.

Columnas:

| Columna | Tipo | Required | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | PK. |
| `owner_type` | enum | si | artist, studio, membership. |
| `artist_id` | uuid | no | FK si owner_type = artist. |
| `studio_id` | uuid | no | FK si owner_type = studio. |
| `membership_id` | uuid | no | FK si owner_type = membership. |
| `category_id` | uuid | si | FK a `service_categories`. |
| `tier_id` | uuid | no | FK a `service_tiers`. |
| `name` | text | si | Nombre. |
| `description` | text | no | Detalle. |
| `price_amount` | numeric | si | Precio. |
| `duration_minutes` | integer | si | Duracion. |
| `status` | enum | si | draft, active, suspended, archived. |
| `created_at` | timestamptz | si | Creacion. |
| `updated_at` | timestamptz | si | Actualizacion. |
| `archived_at` | timestamptz | no | Soft delete. |

PK: `id`.

FK:

- `artist_id` -> `artists.id`.
- `studio_id` -> `studios.id`.
- `membership_id` -> `artist_studio_memberships.id`.
- `category_id` -> `service_categories.id`.
- `tier_id` -> `service_tiers.id`.

Unique constraints:

- (`owner_type`, owner id efectivo, `name`) para servicios activos.

Check constraints:

- Exactamente un owner debe estar presente.
- Si `owner_type = artist`, solo `artist_id` es required.
- Si `owner_type = studio`, solo `studio_id` es required.
- Si `owner_type = membership`, solo `membership_id` es required.
- `price_amount` >= 0.
- `duration_minutes` > 0.

Cardinalidad:

- Owner 1:N `service_offerings`.
- `service_offerings` 1:N `appointments`.

Ownership: Service Catalog.

Indices recomendados:

- (`owner_type`, `artist_id`).
- (`owner_type`, `studio_id`).
- (`owner_type`, `membership_id`).
- `category_id`.
- `status`.

### 3.15 `schedules`

Proposito: configuracion de agenda.

Columnas:

| Columna | Tipo | Required | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | PK. |
| `owner_type` | enum | si | artist, membership. |
| `artist_id` | uuid | no | FK si agenda independiente. |
| `membership_id` | uuid | no | FK si agenda en estudio. |
| `timezone` | text | si | Zona horaria. |
| `slot_interval_minutes` | integer | si | Intervalo. |
| `status` | enum | si | active, inactive, archived. |
| `created_at` | timestamptz | si | Creacion. |
| `updated_at` | timestamptz | si | Actualizacion. |
| `archived_at` | timestamptz | no | Soft delete. |

PK: `id`.

FK:

- `artist_id` -> `artists.id`.
- `membership_id` -> `artist_studio_memberships.id`.

Check constraints:

- Exactamente un owner: artist o membership.
- `slot_interval_minutes` > 0.

Ownership: Scheduling & Booking.

Indices recomendados:

- (`owner_type`, `artist_id`, `status`).
- (`owner_type`, `membership_id`, `status`).

### 3.16 `schedule_rules`

Proposito: reglas semanales.

Columnas:

| Columna | Tipo | Required | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | PK. |
| `schedule_id` | uuid | si | FK a `schedules`. |
| `weekday` | integer | si | 0-6. |
| `is_active` | boolean | si | Dia activo. |
| `start_time` | time | no | Inicio. |
| `end_time` | time | no | Fin. |
| `break_start_time` | time | no | Inicio break. |
| `break_end_time` | time | no | Fin break. |
| `created_at` | timestamptz | si | Creacion. |
| `updated_at` | timestamptz | si | Actualizacion. |

PK: `id`.

FK:

- `schedule_id` -> `schedules.id`.

Unique constraints:

- (`schedule_id`, `weekday`).

Check constraints:

- `weekday` entre 0 y 6.
- `end_time` > `start_time` si activo.
- break dentro del rango laboral si existe.

Ownership: Scheduling & Booking.

Indices recomendados:

- `schedule_id`.

### 3.17 `calendar_blocks`

Proposito: indisponibilidad.

Columnas:

| Columna | Tipo | Required | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | PK. |
| `schedule_id` | uuid | si | FK a `schedules`. |
| `block_type` | enum | si | break, training, personal, maintenance, other. |
| `starts_at` | timestamptz | si | Inicio. |
| `ends_at` | timestamptz | si | Fin. |
| `reason` | text | no | Motivo. |
| `status` | enum | si | active, cancelled, expired. |
| `created_at` | timestamptz | si | Creacion. |
| `updated_at` | timestamptz | si | Actualizacion. |

PK: `id`.

FK:

- `schedule_id` -> `schedules.id`.

Check constraints:

- `ends_at` > `starts_at`.

Ownership: Scheduling & Booking.

Indices recomendados:

- (`schedule_id`, `starts_at`, `ends_at`).
- `status`.

### 3.18 `availability_slots`

Proposito: hold/reserved y disponibilidad materializada.

Columnas:

| Columna | Tipo | Required | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | PK. |
| `schedule_id` | uuid | si | FK a `schedules`. |
| `artist_id` | uuid | no | Snapshot para lectura. |
| `studio_id` | uuid | no | Snapshot para membership. |
| `membership_id` | uuid | no | Scope en estudio. |
| `starts_at` | timestamptz | si | Inicio. |
| `ends_at` | timestamptz | si | Fin. |
| `status` | enum | si | available, held, booked, expired, hidden. |
| `held_by_profile_id` | uuid | no | FK a `profiles`. |
| `held_until` | timestamptz | no | Expiracion hold. |
| `generated_at` | timestamptz | si | Generacion. |
| `created_at` | timestamptz | si | Creacion. |
| `updated_at` | timestamptz | si | Actualizacion. |

PK: `id`.

FK:

- `schedule_id` -> `schedules.id`.
- `artist_id` -> `artists.id`.
- `studio_id` -> `studios.id`.
- `membership_id` -> `artist_studio_memberships.id`.
- `held_by_profile_id` -> `profiles.id`.

Check constraints:

- `ends_at` > `starts_at`.
- `held_until` required si `status = held`.

Ownership: Scheduling & Booking.

Indices recomendados:

- (`schedule_id`, `starts_at`, `status`).
- (`artist_id`, `starts_at`, `status`).
- (`membership_id`, `starts_at`, `status`).
- `held_until`.

### 3.19 `appointments`

Proposito: cita real valida.

Columnas:

| Columna | Tipo | Required | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | PK. |
| `client_id` | uuid | si | FK a `clients`. |
| `artist_id` | uuid | si | FK a `artists`. |
| `studio_id` | uuid | no | FK cuando aplica. |
| `membership_id` | uuid | no | FK cuando cita ocurre en estudio. |
| `service_offering_id` | uuid | si | FK a `service_offerings`. |
| `availability_slot_id` | uuid | no | FK si nacio de slot. |
| `marketplace_listing_id` | uuid | no | FK si nacio de marketplace. |
| `promotion_id` | uuid | no | FK si aplica. |
| `starts_at` | timestamptz | si | Inicio. |
| `ends_at` | timestamptz | si | Fin. |
| `status` | enum | si | scheduled, completed, cancelled, no_show, disputed. |
| `booking_source` | enum | si | artist, studio, client_portal, marketplace, admin. |
| `client_notes` | text | no | Notas de clienta. |
| `created_by_profile_id` | uuid | no | FK a `profiles`. |
| `created_at` | timestamptz | si | Creacion. |
| `updated_at` | timestamptz | si | Actualizacion. |
| `completed_at` | timestamptz | no | Completion. |
| `cancelled_at` | timestamptz | no | Cancelacion. |

PK: `id`.

FK:

- `client_id` -> `clients.id`.
- `artist_id` -> `artists.id`.
- `studio_id` -> `studios.id`.
- `membership_id` -> `artist_studio_memberships.id`.
- `service_offering_id` -> `service_offerings.id`.
- `availability_slot_id` -> `availability_slots.id`.
- `marketplace_listing_id` -> `marketplace_listings.id`.
- `promotion_id` -> `promotions.id`.
- `created_by_profile_id` -> `profiles.id`.

Unique constraints:

- `availability_slot_id` unique cuando existe.

Check constraints:

- `ends_at` > `starts_at`.
- `status` en estados congelados.
- Si `membership_id` existe, `studio_id` debe existir.
- Si `status = completed`, `completed_at` required.
- Si `status = cancelled`, `cancelled_at` required.
- No usar `confirmed`.
- No usar `reserved`.

Cardinalidad:

- `clients` 1:N `appointments`.
- `artists` 1:N `appointments`.
- `artist_studio_memberships` 1:N `appointments`.
- `appointments` 1:1 `appointment_economies`.
- `appointments` 1:1 `commissions`.

Ownership: Scheduling & Booking.

Auditable: si.

Indices recomendados:

- (`artist_id`, `starts_at`).
- (`membership_id`, `starts_at`).
- (`studio_id`, `starts_at`).
- (`client_id`, `starts_at`).
- (`status`, `starts_at`).
- `service_offering_id`.

### 3.20 `appointment_status_events`

Proposito: historial append-only de estados de cita.

Columnas:

| Columna | Tipo | Required | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | PK. |
| `appointment_id` | uuid | si | FK a `appointments`. |
| `from_status` | enum | no | Estado anterior. |
| `to_status` | enum | si | Estado nuevo. |
| `reason` | text | no | Motivo. |
| `changed_by_profile_id` | uuid | no | FK a `profiles`. |
| `changed_at` | timestamptz | si | Momento. |

PK: `id`.

FK:

- `appointment_id` -> `appointments.id`.
- `changed_by_profile_id` -> `profiles.id`.

Check constraints:

- `to_status` en estados congelados.
- `from_status` nullable solo para evento inicial.

Ownership: Scheduling & Booking.

Auditable/Ledger: append-only.

Indices recomendados:

- `appointment_id`.
- (`to_status`, `changed_at`).

### 3.21 `clients`

Proposito: cliente global.

Columnas:

| Columna | Tipo | Required | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | PK. |
| `profile_id` | uuid | no | FK a `profiles`. |
| `display_name` | text | si | Nombre. |
| `email` | text | no | Contacto. |
| `phone` | text | no | Contacto. |
| `status` | enum | si | active, inactive, archived. |
| `created_at` | timestamptz | si | Creacion. |
| `updated_at` | timestamptz | si | Actualizacion. |
| `archived_at` | timestamptz | no | Soft delete. |

PK: `id`.

FK:

- `profile_id` -> `profiles.id`.

Unique constraints:

- `profile_id` nullable unico.

Ownership: Customer 360.

Indices recomendados:

- `profile_id`.
- `email`.
- `phone`.
- `status`.

### 3.22 `client_profiles`

Proposito: datos globales no internos del cliente.

Columnas:

| Columna | Tipo | Required | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | PK. |
| `client_id` | uuid | si | FK a `clients`. |
| `birthday` | date | no | Cumpleanos. |
| `preferred_services` | text[] | no | Preferencias simples. |
| `last_visit_at` | timestamptz | no | Proyeccion opcional. |
| `next_recommended_visit_at` | timestamptz | no | Proyeccion opcional. |
| `created_at` | timestamptz | si | Creacion. |
| `updated_at` | timestamptz | si | Actualizacion. |

PK: `id`.

FK:

- `client_id` -> `clients.id`.

Unique constraints:

- `client_id`.

No persistir aqui:

- notas internas.
- favorito principal como campo unico.
- spend total como fuente primaria.
- total visits como fuente primaria.

Ownership: Customer 360.

Indices recomendados:

- `client_id`.
- `birthday`.

### 3.23 `customer_private_notes`

Proposito: notas internas scoped por artista, estudio o membership.

Columnas:

| Columna | Tipo | Required | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | PK. |
| `client_id` | uuid | si | FK a `clients`. |
| `scope_type` | enum | si | artist, studio, membership. |
| `artist_id` | uuid | no | FK si scope artist. |
| `studio_id` | uuid | no | FK si scope studio. |
| `membership_id` | uuid | no | FK si scope membership. |
| `note` | text | si | Nota interna. |
| `created_by_profile_id` | uuid | no | FK a `profiles`. |
| `created_at` | timestamptz | si | Creacion. |
| `updated_at` | timestamptz | si | Actualizacion. |
| `archived_at` | timestamptz | no | Soft delete. |

PK: `id`.

FK:

- `client_id` -> `clients.id`.
- `artist_id` -> `artists.id`.
- `studio_id` -> `studios.id`.
- `membership_id` -> `artist_studio_memberships.id`.
- `created_by_profile_id` -> `profiles.id`.

Check constraints:

- Exactamente un scope debe existir.

Ownership: Customer 360, con acceso scoped por RLS.

Indices recomendados:

- `client_id`.
- (`scope_type`, `artist_id`).
- (`scope_type`, `studio_id`).
- (`scope_type`, `membership_id`).

### 3.24 `customer_relationships`

Proposito: relacion cliente-artista/estudio/membership.

Columnas:

| Columna | Tipo | Required | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | PK. |
| `client_id` | uuid | si | FK a `clients`. |
| `scope_type` | enum | si | artist, studio, membership. |
| `artist_id` | uuid | no | Scope artist. |
| `studio_id` | uuid | no | Scope studio. |
| `membership_id` | uuid | no | Scope membership. |
| `relationship_type` | enum | si | appointment, favorite, recurring, imported. |
| `status` | enum | si | active, inactive, archived. |
| `last_interaction_at` | timestamptz | no | Ultima interaccion. |
| `created_at` | timestamptz | si | Creacion. |
| `updated_at` | timestamptz | si | Actualizacion. |

PK: `id`.

FK:

- `client_id` -> `clients.id`.
- `artist_id` -> `artists.id`.
- `studio_id` -> `studios.id`.
- `membership_id` -> `artist_studio_memberships.id`.

Unique constraints:

- (`client_id`, `scope_type`, owner id efectivo, `relationship_type`) para activas.

Check constraints:

- Exactamente un scope debe existir.

No persistir:

- `total_visits`.
- `total_spend_amount`.

Ownership: Customer 360.

Indices recomendados:

- `client_id`.
- (`scope_type`, `artist_id`).
- (`scope_type`, `studio_id`).
- (`scope_type`, `membership_id`).
- `last_interaction_at`.

### 3.25 `favorite_artists`

Proposito: favorito explicito cliente-artista.

Columnas:

| Columna | Tipo | Required | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | PK. |
| `client_id` | uuid | si | FK a `clients`. |
| `artist_id` | uuid | si | FK a `artists`. |
| `created_at` | timestamptz | si | Alta. |
| `removed_at` | timestamptz | no | Baja logica. |

PK: `id`.

FK:

- `client_id` -> `clients.id`.
- `artist_id` -> `artists.id`.

Unique constraints:

- (`client_id`, `artist_id`) para favoritos activos.

Ownership: Customer 360.

Indices recomendados:

- `client_id`.
- `artist_id`.

### 3.26 `marketplace_profiles`

Proposito: perfil publicable.

Columnas:

| Columna | Tipo | Required | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | PK. |
| `profile_type` | enum | si | artist, studio, membership. |
| `artist_id` | uuid | no | FK si profile artist. |
| `studio_id` | uuid | no | FK si profile studio. |
| `membership_id` | uuid | no | FK si profile membership. |
| `title` | text | si | Titulo. |
| `summary` | text | no | Resumen. |
| `visibility_status` | enum | si | draft, visible, hidden, suspended. |
| `published_at` | timestamptz | no | Publicacion. |
| `hidden_at` | timestamptz | no | Ocultamiento. |
| `created_at` | timestamptz | si | Creacion. |
| `updated_at` | timestamptz | si | Actualizacion. |

PK: `id`.

FK:

- `artist_id` -> `artists.id`.
- `studio_id` -> `studios.id`.
- `membership_id` -> `artist_studio_memberships.id`.

Unique constraints:

- (`profile_type`, owner id efectivo).

Check constraints:

- Exactamente un target segun `profile_type`.

Ownership: Marketplace.

Indices recomendados:

- `visibility_status`.
- (`profile_type`, `artist_id`).
- (`profile_type`, `studio_id`).
- (`profile_type`, `membership_id`).

### 3.27 `marketplace_listings`

Proposito: aparicion marketplace materializada basica.

Columnas:

| Columna | Tipo | Required | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | PK. |
| `marketplace_profile_id` | uuid | si | FK a `marketplace_profiles`. |
| `artist_id` | uuid | no | Denormalizacion para filtros. |
| `studio_id` | uuid | no | Denormalizacion para filtros. |
| `membership_id` | uuid | no | Denormalizacion para filtros. |
| `city` | text | no | Filtro. |
| `visibility_status` | enum | si | visible, hidden, expired. |
| `generated_at` | timestamptz | si | Generacion. |
| `expires_at` | timestamptz | no | Expiracion. |
| `created_at` | timestamptz | si | Creacion. |
| `updated_at` | timestamptz | si | Actualizacion. |

PK: `id`.

FK:

- `marketplace_profile_id` -> `marketplace_profiles.id`.
- `artist_id` -> `artists.id`.
- `studio_id` -> `studios.id`.
- `membership_id` -> `artist_studio_memberships.id`.

No persistir MVP:

- `ranking_score`.
- `availability_score`.
- `occupancy_score`.

Ownership: Marketplace.

Indices recomendados:

- (`visibility_status`, `city`).
- `marketplace_profile_id`.
- `artist_id`.
- `studio_id`.
- `membership_id`.

### 3.28 `appointment_economies`

Proposito: snapshot economico de cita creado al agendar.

Columnas:

| Columna | Tipo | Required | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | PK. |
| `appointment_id` | uuid | si | FK a `appointments`. |
| `gross_amount` | numeric | si | Importe bruto. |
| `platform_fee_amount` | numeric | si | 10% base MVP. |
| `artist_revenue_amount` | numeric | si | Neto artista base. |
| `studio_revenue_amount` | numeric | no | Si aplica. |
| `currency` | text | si | Moneda. |
| `calculation_status` | enum | si | quoted, earned, void, disputed, adjusted. |
| `calculation_version` | text | si | Version/regla aplicada. |
| `created_at` | timestamptz | si | Creado al agendar. |
| `updated_at` | timestamptz | si | Actualizacion. |
| `earned_at` | timestamptz | no | Devengo. |
| `adjusted_at` | timestamptz | no | Ajuste. |

PK: `id`.

FK:

- `appointment_id` -> `appointments.id`.

Unique constraints:

- `appointment_id`.

Check constraints:

- importes >= 0.
- `calculation_status` en estados congelados.
- `earned_at` required si `calculation_status = earned`.

Ownership: Appointment Economy.

Auditable: si.

Indices recomendados:

- `appointment_id`.
- (`calculation_status`, `created_at`).

### 3.29 `commissions`

Proposito: comision plataforma creada al agendar.

Columnas:

| Columna | Tipo | Required | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | PK. |
| `appointment_id` | uuid | si | FK a `appointments`. |
| `appointment_economy_id` | uuid | si | FK a `appointment_economies`. |
| `amount` | numeric | si | Snapshot. |
| `rate` | numeric | si | Snapshot MVP 0.10. |
| `currency` | text | si | Moneda. |
| `status` | enum | si | potential, chargeable, void, disputed, adjusted. |
| `created_at` | timestamptz | si | Creada al agendar. |
| `updated_at` | timestamptz | si | Actualizacion. |
| `chargeable_at` | timestamptz | no | Devengo. |
| `adjusted_at` | timestamptz | no | Ajuste. |

PK: `id`.

FK:

- `appointment_id` -> `appointments.id`.
- `appointment_economy_id` -> `appointment_economies.id`.

Unique constraints:

- `appointment_id`.
- `appointment_economy_id`.

Check constraints:

- `rate = 0.10` en MVP.
- `amount` >= 0.
- `status` en estados congelados.
- `chargeable_at` required si `status = chargeable`.

Ownership: Appointment Economy.

Auditable: si.

Indices recomendados:

- `appointment_id`.
- (`status`, `created_at`).

### 3.30 `loyalty_accounts`

Proposito: estado loyalty global MVP.

Columnas:

| Columna | Tipo | Required | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | PK. |
| `client_id` | uuid | si | FK a `clients`. |
| `points_balance` | integer | si | Saldo proyectado. |
| `streak_count` | integer | si | Racha actual. |
| `status` | enum | si | active, paused, closed. |
| `created_at` | timestamptz | si | Creacion. |
| `updated_at` | timestamptz | si | Actualizacion. |

PK: `id`.

FK:

- `client_id` -> `clients.id`.

Unique constraints:

- `client_id`.

Check constraints:

- `points_balance` >= 0.
- `streak_count` >= 0.

No persistir MVP:

- `vip_tier_id` hasta congelar tiers.

Ownership: Loyalty & Flow Points.

Indices recomendados:

- `client_id`.
- `status`.

### 3.31 `flow_point_ledger`

Proposito: ledger append-only de puntos.

Columnas:

| Columna | Tipo | Required | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | PK. |
| `loyalty_account_id` | uuid | si | FK a `loyalty_accounts`. |
| `appointment_id` | uuid | no | FK cuando nace de cita. |
| `reward_redemption_id` | uuid | no | FK cuando nace de canje. |
| `movement_type` | enum | si | earn, spend, expire, adjust. |
| `points` | integer | si | Movimiento. |
| `reason` | enum | si | appointment_completed, reward_redeemed, expiration, manual_adjustment, promotion. |
| `idempotency_key` | text | no | Evita duplicados. |
| `expires_at` | timestamptz | no | Expiracion. |
| `occurred_at` | timestamptz | si | Momento. |
| `metadata` | jsonb | no | Regla/version. |
| `created_at` | timestamptz | si | Insercion. |

PK: `id`.

FK:

- `loyalty_account_id` -> `loyalty_accounts.id`.
- `appointment_id` -> `appointments.id`.
- `reward_redemption_id` -> `reward_redemptions.id`.

Unique constraints:

- `idempotency_key` cuando existe.

Check constraints:

- `points != 0`.
- `earn` debe ser positivo.
- `spend` y `expire` deben ser negativos.

Ownership: Loyalty & Flow Points.

Ledger: si, append-only.

Indices recomendados:

- `loyalty_account_id`.
- `appointment_id`.
- `reward_redemption_id`.
- `occurred_at`.
- `expires_at`.

### 3.32 `rewards`

Proposito: rewards canjeables.

Columnas:

| Columna | Tipo | Required | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | PK. |
| `scope_type` | enum | si | platform, studio, artist. |
| `studio_id` | uuid | no | FK si scope studio. |
| `artist_id` | uuid | no | FK si scope artist. |
| `name` | text | si | Nombre. |
| `reward_type` | enum | si | discount, service_upgrade, birthday_gift, private_offer. |
| `points_cost` | integer | si | Costo. |
| `status` | enum | si | draft, active, paused, retired. |
| `validity_days` | integer | no | Vigencia. |
| `created_at` | timestamptz | si | Creacion. |
| `updated_at` | timestamptz | si | Actualizacion. |
| `archived_at` | timestamptz | no | Soft delete. |

PK: `id`.

FK:

- `studio_id` -> `studios.id`.
- `artist_id` -> `artists.id`.

Check constraints:

- Scope exclusivo.
- `points_cost` > 0.

Ownership: Loyalty & Flow Points.

Indices recomendados:

- (`scope_type`, `studio_id`).
- (`scope_type`, `artist_id`).
- `status`.

### 3.33 `reward_redemptions`

Proposito: canje de reward.

Columnas:

| Columna | Tipo | Required | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | PK. |
| `loyalty_account_id` | uuid | si | FK. |
| `reward_id` | uuid | si | FK. |
| `appointment_id` | uuid | no | FK si aplica. |
| `points_spent` | integer | si | Puntos. |
| `status` | enum | si | requested, confirmed, applied, cancelled, expired. |
| `redeemed_at` | timestamptz | si | Canje. |
| `applied_at` | timestamptz | no | Aplicacion. |
| `created_at` | timestamptz | si | Creacion. |
| `updated_at` | timestamptz | si | Actualizacion. |

PK: `id`.

FK:

- `loyalty_account_id` -> `loyalty_accounts.id`.
- `reward_id` -> `rewards.id`.
- `appointment_id` -> `appointments.id`.

Check constraints:

- `points_spent` > 0.
- `applied_at` required si `status = applied`.

Ownership: Loyalty & Flow Points.

Auditable: si.

Indices recomendados:

- `loyalty_account_id`.
- `reward_id`.
- `appointment_id`.
- `status`.

### 3.34 `promotions`

Proposito: promocion MVP.

Columnas:

| Columna | Tipo | Required | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | PK. |
| `scope_type` | enum | si | artist, studio, membership. |
| `artist_id` | uuid | no | FK si scope artist. |
| `studio_id` | uuid | no | FK si scope studio. |
| `membership_id` | uuid | no | FK si scope membership. |
| `created_by_profile_id` | uuid | no | FK a `profiles`. |
| `promotion_type` | enum | si | happy_hour, double_points, low_occupancy, private_promo, early_booking. |
| `name` | text | si | Nombre. |
| `status` | enum | si | draft, scheduled, active, paused, completed, expired. |
| `starts_at` | timestamptz | no | Inicio. |
| `ends_at` | timestamptz | no | Fin. |
| `rules` | jsonb | no | Reglas. |
| `created_at` | timestamptz | si | Creacion. |
| `updated_at` | timestamptz | si | Actualizacion. |

PK: `id`.

FK:

- `artist_id` -> `artists.id`.
- `studio_id` -> `studios.id`.
- `membership_id` -> `artist_studio_memberships.id`.
- `created_by_profile_id` -> `profiles.id`.

Check constraints:

- Scope exclusivo.
- `ends_at` > `starts_at` si ambos existen.

Ownership: Impulsa Tu Negocio.

Indices recomendados:

- (`scope_type`, `artist_id`).
- (`scope_type`, `studio_id`).
- (`scope_type`, `membership_id`).
- `status`.
- (`starts_at`, `ends_at`).

### 3.35 `risk_flags`

Proposito: flags revisables de riesgo/trust/fairness basico.

Columnas:

| Columna | Tipo | Required | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | PK. |
| `entity_type` | enum | si | appointment, studio, artist, client, commission, listing. |
| `entity_id` | uuid | si | Referencia conceptual. |
| `appointment_id` | uuid | no | FK directa si aplica. |
| `studio_id` | uuid | no | FK directa si aplica. |
| `artist_id` | uuid | no | FK directa si aplica. |
| `client_id` | uuid | no | FK directa si aplica. |
| `flag_type` | enum | si | economy, governance, no_show, fairness, abuse, data_quality. |
| `severity` | enum | si | low, medium, high, critical. |
| `status` | enum | si | open, under_review, resolved, dismissed. |
| `metadata` | jsonb | no | Evidencia. |
| `created_at` | timestamptz | si | Apertura. |
| `resolved_at` | timestamptz | no | Resolucion. |

PK: `id`.

FK:

- `appointment_id` -> `appointments.id`.
- `studio_id` -> `studios.id`.
- `artist_id` -> `artists.id`.
- `client_id` -> `clients.id`.

Check constraints:

- `resolved_at` required si status final.

Ownership: Trust & Governance.

Auditable: si.

Indices recomendados:

- (`entity_type`, `entity_id`).
- `appointment_id`.
- `studio_id`.
- `artist_id`.
- `client_id`.
- (`status`, `severity`).

### 3.36 `sanctions`

Proposito: consecuencias operativas o restricciones.

Columnas:

| Columna | Tipo | Required | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | PK. |
| `subject_type` | enum | si | client, artist, studio, profile. |
| `subject_id` | uuid | si | Entidad. |
| `sanction_type` | enum | si | warning, booking_limit, visibility_limit, suspension, manual_review. |
| `reason` | text | si | Motivo. |
| `status` | enum | si | active, lifted, expired, appealed. |
| `created_by_profile_id` | uuid | no | FK a `profiles`. |
| `starts_at` | timestamptz | si | Inicio. |
| `ends_at` | timestamptz | no | Fin. |
| `lifted_at` | timestamptz | no | Levantamiento. |
| `created_at` | timestamptz | si | Creacion. |
| `updated_at` | timestamptz | si | Actualizacion. |

PK: `id`.

FK:

- `created_by_profile_id` -> `profiles.id`.

Check constraints:

- `ends_at` > `starts_at` si existe.
- `lifted_at` required si `status = lifted`.

Ownership: Trust & Governance.

Auditable: si.

Indices recomendados:

- (`subject_type`, `subject_id`).
- `status`.
- (`starts_at`, `ends_at`).

### 3.37 `no_show_cases`

Proposito: caso no-show y disputa.

Columnas:

| Columna | Tipo | Required | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | PK. |
| `appointment_id` | uuid | si | FK a `appointments`. |
| `reported_by_profile_id` | uuid | no | FK a `profiles`. |
| `status` | enum | si | open, accepted, disputed, resolved, dismissed. |
| `reason` | text | no | Detalle. |
| `reported_at` | timestamptz | si | Reporte. |
| `resolved_at` | timestamptz | no | Resolucion. |
| `created_at` | timestamptz | si | Creacion. |
| `updated_at` | timestamptz | si | Actualizacion. |

PK: `id`.

FK:

- `appointment_id` -> `appointments.id`.
- `reported_by_profile_id` -> `profiles.id`.

Unique constraints:

- `appointment_id` para caso activo.

Check constraints:

- `resolved_at` required si status final.

Ownership: Trust & Governance.

Auditable: si.

Indices recomendados:

- `appointment_id`.
- `status`.
- `reported_at`.

### 3.38 `audit_events`

Proposito: bitacora transversal append-only.

Columnas:

| Columna | Tipo | Required | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | PK. |
| `actor_profile_id` | uuid | no | FK a `profiles`. |
| `context` | enum | si | identity, studio, booking, economy, loyalty, marketplace, trust, marketing. |
| `entity_type` | enum | si | Tipo de entidad. |
| `entity_id` | uuid | si | Id entidad. |
| `studio_id` | uuid | no | Scope directo si aplica. |
| `artist_id` | uuid | no | Scope directo si aplica. |
| `membership_id` | uuid | no | Scope directo si aplica. |
| `client_id` | uuid | no | Scope directo si aplica. |
| `appointment_id` | uuid | no | Scope directo si aplica. |
| `event_type` | text | si | Accion. |
| `before_data` | jsonb | no | Estado anterior resumido. |
| `after_data` | jsonb | no | Estado posterior resumido. |
| `metadata` | jsonb | no | Detalle. |
| `occurred_at` | timestamptz | si | Momento. |
| `created_at` | timestamptz | si | Insercion. |

PK: `id`.

FK:

- `actor_profile_id` -> `profiles.id`.
- `studio_id` -> `studios.id`.
- `artist_id` -> `artists.id`.
- `membership_id` -> `artist_studio_memberships.id`.
- `client_id` -> `clients.id`.
- `appointment_id` -> `appointments.id`.

Ownership: Trust & Governance.

Ledger: append-only.

Indices recomendados:

- (`context`, `occurred_at`).
- (`entity_type`, `entity_id`).
- `actor_profile_id`.
- `studio_id`.
- `artist_id`.
- `membership_id`.
- `client_id`.
- `appointment_id`.

## 4. Cardinalidades Criticas

- `profiles` 1:0..1 `artists`.
- `profiles` 1:0..1 `clients`.
- `profiles` N:N `roles` mediante `user_role_assignments`.
- `studios` 1:1 `studio_profiles`.
- `artists` 1:1 `artist_profiles`.
- `artists` N:N `studios` mediante `artist_studio_memberships`.
- `artist_studio_memberships` 1:N `appointments`.
- `service_offerings` pertenece a exactamente un owner.
- `schedules` pertenece a exactamente un owner: artist o membership.
- `clients` 1:1 `client_profiles`.
- `clients` 1:1 `loyalty_accounts`.
- `appointments` 1:1 `appointment_economies`.
- `appointments` 1:1 `commissions`.
- `loyalty_accounts` 1:N `flow_point_ledger`.
- `rewards` 1:N `reward_redemptions`.
- `appointments` 0:1 `no_show_cases` activo.

## 5. Tablas Auditables

Auditables por cambios o decisiones:

- `studios`
- `governance_reviews`
- `artist_studio_memberships`
- `service_offerings`
- `appointments`
- `appointment_status_events`
- `appointment_economies`
- `commissions`
- `reward_redemptions`
- `promotions`
- `risk_flags`
- `sanctions`
- `no_show_cases`
- `user_role_assignments`

Tabla transversal:

- `audit_events`

## 6. Tablas Ledger / Append-only

- `appointment_status_events`
- `flow_point_ledger`
- `audit_events`

Regla:

- No deben editarse ni borrarse en operaciones normales.
- Correcciones deben registrarse con eventos/movimientos compensatorios.

## 7. Soft Delete Strategy

Usar `archived_at` en:

- `profiles`
- `studios`
- `artists`
- `artist_studio_memberships`
- `service_offerings`
- `schedules`
- `clients`
- `customer_private_notes`
- `rewards`

No usar soft delete normal en ledgers:

- `flow_point_ledger`
- `appointment_status_events`
- `audit_events`

Para operaciones:

- Preferir `status` sobre delete en `appointments`, `commissions`, `appointment_economies`, `promotions`, `risk_flags`, `sanctions`, `no_show_cases`.

## 8. Timestamps Obligatorios

Required:

- `created_at` en todas las tablas.
- `updated_at` en tablas editables.
- `occurred_at` en eventos.
- `changed_at` en status events.
- `reported_at` en no-show.
- `redeemed_at` en reward redemptions.
- `generated_at` en availability/listings.

Condicionales:

- `completed_at` si appointment completed.
- `cancelled_at` si appointment cancelled.
- `earned_at` si economy earned.
- `chargeable_at` si commission chargeable.
- `resolved_at` si review/flag/no-show esta resuelto.
- `archived_at` si archived.

## 9. Campos Derivados que NO Deben Persistirse como Fuente Primaria

No persistir como autoridad:

- `artist_profiles.rating_average`.
- `studios.totalArtists`.
- `studios.totalClients`.
- `studios.occupancy`.
- `studios.revenue`.
- `clients.totalVisits`.
- `clients.spend`.
- `customer_relationships.total_visits`.
- `customer_relationships.total_spend_amount`.
- `marketplace_listings.ranking_score` en MVP.
- `marketplace_listings.availability_score` en MVP.
- `marketplace_listings.occupancy_score` en MVP.
- `client_profiles.favorite_artist_id`.
- `client_profiles.notes`.
- `appointments.pointsGranted`.
- `appointments.platformFee`.
- `appointments.artistRevenue`.

Fuente correcta:

- visitas y spend desde appointments/economy/snapshots.
- loyalty desde `loyalty_accounts` + `flow_point_ledger`.
- comision desde `commissions`.
- economia desde `appointment_economies`.
- favoritos desde `favorite_artists`.
- notas internas desde `customer_private_notes`.

## 10. Indices Recomendados por Consulta Frecuente

Agenda artista:

- `appointments(artist_id, starts_at)`.
- `appointments(membership_id, starts_at)`.
- `appointments(status, starts_at)`.

Agenda estudio:

- `appointments(studio_id, starts_at)`.
- `artist_studio_memberships(studio_id, status)`.

Agenda cliente:

- `appointments(client_id, starts_at)`.

Marketplace:

- `marketplace_profiles(visibility_status)`.
- `marketplace_listings(visibility_status, city)`.
- `marketplace_listings(artist_id)`.
- `marketplace_listings(studio_id)`.
- `marketplace_listings(membership_id)`.

RLS:

- `user_role_assignments(profile_id, studio_id, status)`.
- `artist_studio_memberships(artist_id, status)`.
- `artist_studio_memberships(studio_id, status)`.

Loyalty:

- `loyalty_accounts(client_id)`.
- `flow_point_ledger(loyalty_account_id, occurred_at)`.
- `flow_point_ledger(appointment_id)`.

Economy:

- `appointment_economies(appointment_id)`.
- `commissions(appointment_id)`.
- `commissions(status, created_at)`.

Trust:

- `risk_flags(status, severity)`.
- `risk_flags(entity_type, entity_id)`.
- `sanctions(subject_type, subject_id)`.
- `sanctions(status)`.

Audit:

- `audit_events(context, occurred_at)`.
- `audit_events(entity_type, entity_id)`.
- `audit_events(studio_id)`.
- `audit_events(client_id)`.

## 11. Buckets Definitivos

### Publicos controlados

- `artist-profile-photos`
- `artist-portfolios`
- `studio-logos`
- `studio-gallery`
- `campaign-assets`

Regla:

- Lectura publica solo si el perfil/listing/campana esta visible y aprobado.
- Escritura solo por owner, manager autorizado o service role.

### Privados

- `client-avatars`
- `no-show-evidence`

Regla:

- `client-avatars`: cliente owner, artistas/studios solo con relacion operacional.
- `no-show-evidence`: solo participantes autorizados, trust/governance y platform owner.

## 12. Tablas Fuera del MVP

- `studio_team_members`
- `service_promotion_rules`
- `client_preferences`
- `client_segments`
- `marketplace_badges`
- `marketplace_events`
- `revenue_splits`
- `economy_risk_signals`
- `vip_tiers`
- `streak_events`
- `automation_recommendations`
- `reactivation_opportunities`
- `business_insights`
- `campaigns`
- `campaign_events`
- `fairness_signals`
- `fairness_reviews`
- `fairness_review_signals`
- `metric_snapshots`
- `portfolio_summaries`
- `status_change_events`
- `no_show_evidence_files`
- `trust_events`
- `trust_scores`
- `trust_rules`

## 13. Riesgos de SQL

### Owner polimorfico controlado

`service_offerings`, `schedules`, `promotions`, `marketplace_profiles` y `customer_private_notes` usan scope/owner con columnas multiples. Esto requiere checks estrictos.

Riesgo si falla:

- owners ambiguos.
- RLS insegura.
- servicios o citas visibles en scope incorrecto.

### Consistencia membership

`appointments.artist_id`, `studio_id` y `membership_id` deben coincidir.

Riesgo si falla:

- leakage multi-studio.
- comisiones asignadas al estudio equivocado.

### Appointment economy 1:1

MVP usa 1:1 economy y commission por cita.

Riesgo futuro:

- refunds parciales, pagos reales y splits pueden requerir tablas adicionales.

### Ledgers append-only

SQL debe proteger que ledger no se edite.

Riesgo si falla:

- puntos y auditoria no confiables.

### Customer notes

Separar notas internas es obligatorio.

Riesgo si falla:

- cliente global expone datos privados de estudio/artista.

## 14. Estrategia para RLS Futura

No se escriben politicas aun. Estrategia conceptual:

### Platform owner

Acceso global por role assignment activo con rol `platform_owner`.

### Studio owner / manager

Acceso por:

- `user_role_assignments.profile_id`.
- `user_role_assignments.studio_id`.
- `user_role_assignments.status = active`.
- rol studio_owner o studio_manager.

Scope:

- `studio_id` directo.
- memberships donde `artist_studio_memberships.studio_id` coincide.

### Artist independiente

Acceso por:

- `artists.profile_id = auth profile`.
- tablas con `artist_id`.
- tablas con `owner_type/scope_type = artist`.

### Artist dentro de estudio

Acceso por:

- memberships activas de su `artist_id`.
- `membership_id` en appointments, services, schedules, promotions y notes.

### Client

Acceso por:

- `clients.profile_id = auth profile`.
- `client_id` directo en appointments, loyalty, favorites, relationships.

Restriccion:

- no acceso a `customer_private_notes` salvo que la nota sea propia si alguna fase futura lo permite; MVP no.

### Public / anonymous

Acceso solo a:

- `marketplace_profiles` visibles.
- `marketplace_listings` visibles.
- storage publico asociado a perfiles visibles.

### Service role

Procesos internos:

- crear economy/commission al agendar.
- mover commission a chargeable al completed.
- registrar ledger loyalty.
- generar audit events.
- expirar holds.

Todo evento critico debe entrar en `audit_events`.

## 15. Readiness

Estado: LISTO PARA DISENO SQL.

Condicion:

Este documento ya incorpora el freeze arquitectonico. La siguiente fase puede escribir migraciones siempre que no reintroduzca:

- `confirmed` o `reserved` en appointments.
- service offerings con owner ambiguo.
- `trust_scores` en MVP.
- notas internas dentro de `client_profiles`.
- `vip_tiers` como FK MVP.
- campos derivados como fuente primaria.

