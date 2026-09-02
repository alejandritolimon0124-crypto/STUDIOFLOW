# SUPABASE ARCHITECTURE MASTER

## 0. Alcance

Este documento convierte el `LOGICAL_DATA_MODEL_MASTER.md` en una arquitectura fisica conceptual para Supabase.

No contiene SQL, no contiene migraciones, no define politicas RLS concretas y no modifica codigo. La intencion es dejar una arquitectura lista para que una fase posterior pueda convertirla en SQL y migraciones.

Fuentes de verdad solicitadas:

- `LOGICAL_DATA_MODEL_MASTER.md`
- `DOMAIN_MODEL_MASTER.md`
- `CUSTOMER_360_MASTER_MODEL.md`
- `FAIRNESS_ENGINE_DESIGN.md`
- Decision Freeze
- Auditorias previas aprobadas

Nota de disponibilidad local: en este workspace solo esta disponible `LOGICAL_DATA_MODEL_MASTER.md`. Los documentos faltantes se consideran ya absorbidos por ese master logico y por las decisiones congeladas reflejadas ahi.

## 1. Convenciones Conceptuales

Tipos logicos usados:

- `uuid`: identificador unico.
- `text`: cadena corta o larga.
- `enum`: conjunto cerrado de valores.
- `boolean`: verdadero/falso.
- `integer`: numero entero.
- `numeric`: importe o porcentaje exacto.
- `date`: fecha calendario.
- `time`: hora sin fecha.
- `timestamptz`: fecha/hora con zona.
- `jsonb`: estructura flexible controlada.
- `text[]`: lista de textos.

Columnas transversales recomendadas para tablas principales:

- `id`: `uuid`, required, primary key.
- `created_at`: `timestamptz`, required.
- `updated_at`: `timestamptz`, nullable o required segun tabla.
- `archived_at`: `timestamptz`, nullable cuando se requiera borrado logico.

Regla conceptual: los campos derivados pueden existir como proyecciones, pero no deben competir con la autoridad de su contexto.

## 2. Lista Completa de Tablas Propuestas

### Core MVP

- `profiles`
- `roles`
- `permissions`
- `role_permissions`
- `user_role_assignments`
- `studios`
- `studio_profiles`
- `governance_reviews`
- `artists`
- `artist_profiles`
- `artist_studio_memberships`
- `studio_team_members`
- `service_categories`
- `service_tiers`
- `service_offerings`
- `schedules`
- `schedule_rules`
- `calendar_blocks`
- `appointments`
- `appointment_status_events`
- `clients`
- `client_profiles`
- `customer_relationships`
- `favorite_artists`
- `marketplace_profiles`
- `marketplace_listings`
- `appointment_economies`
- `commissions`
- `loyalty_accounts`
- `flow_point_ledger`
- `rewards`
- `reward_redemptions`
- `promotions`
- `risk_flags`
- `audit_events`

### Fase Posterior

- `availability_slots`
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
- `sanctions`
- `no_show_cases`
- `no_show_evidence_files`

## 3. Tablas por Contexto

### 3.1 Identity & Access

#### `profiles`

Proposito: perfil de aplicacion vinculado a una identidad autenticable.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. Puede corresponder al usuario autenticado. |
| `display_name` | text | si | Nombre visible. |
| `email` | text | si | Contacto principal. |
| `phone` | text | no | Telefono operativo. |
| `default_role` | enum | si | Rol preferido de entrada. |
| `status` | enum | si | active, suspended, archived. |
| `created_at` | timestamptz | si | Creacion. |
| `updated_at` | timestamptz | no | Ultima actualizacion. |

Primary key: `id`.

Foreign keys: ninguna conceptual obligatoria dentro de la app; la identidad auth externa se vincula conceptualmente por `id`.

Relaciones: 1:N con `user_role_assignments`; 1:1 opcional con `artists`; 1:1 opcional con `clients`.

Ownership: Identity & Access.

Fase: core MVP.

#### `roles`

Proposito: catalogo de roles operativos.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `code` | enum | si | platform_owner, studio_owner, studio_manager, artist, client. |
| `label` | text | si | Nombre visible. |
| `description` | text | no | Descripcion. |
| `is_system` | boolean | si | Rol controlado por plataforma. |

Primary key: `id`.

Foreign keys: ninguna.

Relaciones: 1:N con `role_permissions`; 1:N con `user_role_assignments`.

Ownership: Identity & Access.

Fase: core MVP.

#### `permissions`

Proposito: catalogo de permisos atomicos.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `code` | text | si | Permiso atomico. |
| `context` | enum | si | Contexto funcional. |
| `label` | text | si | Nombre visible. |
| `description` | text | no | Alcance conceptual. |

Primary key: `id`.

Foreign keys: ninguna.

Relaciones: 1:N con `role_permissions`.

Ownership: Identity & Access.

Fase: core MVP.

#### `role_permissions`

Proposito: tabla puente entre roles y permisos.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `role_id` | uuid | si | FK a `roles`. |
| `permission_id` | uuid | si | FK a `permissions`. |
| `created_at` | timestamptz | si | Asignacion. |

Primary key: `id`.

Foreign keys: `role_id` -> `roles.id`; `permission_id` -> `permissions.id`.

Relaciones: N:N entre `roles` y `permissions`.

Ownership: Identity & Access.

Fase: core MVP.

#### `user_role_assignments`

Proposito: asignar roles a perfiles, globalmente o dentro de un estudio.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `profile_id` | uuid | si | FK a `profiles`. |
| `role_id` | uuid | si | FK a `roles`. |
| `studio_id` | uuid | no | FK a `studios` si el rol tiene scope de estudio. |
| `status` | enum | si | active, revoked, archived. |
| `assigned_by_profile_id` | uuid | no | FK a `profiles`. |
| `created_at` | timestamptz | si | Asignacion. |
| `revoked_at` | timestamptz | no | Revocacion. |

Primary key: `id`.

Foreign keys: `profile_id` -> `profiles.id`; `role_id` -> `roles.id`; `studio_id` -> `studios.id`; `assigned_by_profile_id` -> `profiles.id`.

Relaciones: `profiles` 1:N `user_role_assignments`; `studios` 1:N `user_role_assignments`.

Ownership: Identity & Access.

Fase: core MVP.

### 3.2 Studio Governance

#### `studios`

Proposito: entidad principal de estudio y estado operativo dentro del ecosistema.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `owner_profile_id` | uuid | si | FK a `profiles`. |
| `name` | text | si | Nombre interno/comercial base. |
| `city` | text | no | Ciudad principal. |
| `specialty` | text | no | Especialidad resumida. |
| `studio_status` | enum | si | pending, approved, suspended, rejected, archived. |
| `risk_score` | enum | no | low, medium, high, critical. |
| `created_at` | timestamptz | si | Alta. |
| `approved_at` | timestamptz | no | Aprobacion. |
| `suspended_at` | timestamptz | no | Suspension. |
| `archived_at` | timestamptz | no | Archivo. |

Primary key: `id`.

Foreign keys: `owner_profile_id` -> `profiles.id`.

Relaciones: 1:1 con `studio_profiles`; 1:N con memberships, appointments, governance reviews, team members, sanctions.

Ownership: Studio Governance.

Fase: core MVP.

#### `studio_profiles`

Proposito: datos editables de presentacion, ubicacion y contacto del estudio.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `studio_id` | uuid | si | FK a `studios`. |
| `commercial_name` | text | si | Nombre publico. |
| `description` | text | no | Presentacion. |
| `email` | text | no | Contacto. |
| `phone` | text | no | Contacto. |
| `address_line` | text | no | Direccion. |
| `city` | text | no | Ciudad. |
| `geo_lat` | numeric | no | Latitud conceptual. |
| `geo_lng` | numeric | no | Longitud conceptual. |
| `logo_path` | text | no | Ruta storage. |
| `gallery_paths` | text[] | no | Rutas storage. |
| `updated_at` | timestamptz | no | Actualizacion. |

Primary key: `id`.

Foreign keys: `studio_id` -> `studios.id`.

Relaciones: `studios` 1:1 `studio_profiles`.

Ownership: Studio Governance.

Fase: core MVP.

#### `governance_reviews`

Proposito: registrar revisiones de aprobacion, suspension o cambios sensibles del estudio.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `studio_id` | uuid | si | FK a `studios`. |
| `review_type` | enum | si | onboarding, status_change, risk, appeal. |
| `status` | enum | si | open, approved, changes_requested, suspended, rejected, resolved. |
| `reason` | text | no | Motivo. |
| `decision_notes` | text | no | Resolucion. |
| `reviewed_by_profile_id` | uuid | no | FK a `profiles`. |
| `created_at` | timestamptz | si | Apertura. |
| `resolved_at` | timestamptz | no | Resolucion. |

Primary key: `id`.

Foreign keys: `studio_id` -> `studios.id`; `reviewed_by_profile_id` -> `profiles.id`.

Relaciones: `studios` 1:N `governance_reviews`.

Ownership: Studio Governance.

Fase: core MVP.

### 3.3 Professional Network

#### `artists`

Proposito: entidad profesional de artista independiente de su estudio actual.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `profile_id` | uuid | no | FK a `profiles`. |
| `display_name` | text | si | Nombre profesional base. |
| `status` | enum | si | active, inactive, archived. |
| `created_at` | timestamptz | si | Alta. |
| `archived_at` | timestamptz | no | Archivo. |

Primary key: `id`.

Foreign keys: `profile_id` -> `profiles.id`.

Relaciones: 1:1 con `artist_profiles`; 1:N con memberships, services, schedules, appointments.

Ownership: Professional Network.

Fase: core MVP.

#### `artist_profiles`

Proposito: perfil profesional publico/operativo de la artista.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `artist_id` | uuid | si | FK a `artists`. |
| `artistic_name` | text | si | Nombre publico. |
| `bio` | text | no | Presentacion. |
| `specialties` | text[] | no | Especialidades. |
| `photo_path` | text | no | Ruta storage. |
| `portfolio_paths` | text[] | no | Rutas storage. |
| `city` | text | no | Ubicacion principal. |
| `rating_average` | numeric | no | Proyeccion calculada. |
| `updated_at` | timestamptz | no | Actualizacion. |

Primary key: `id`.

Foreign keys: `artist_id` -> `artists.id`.

Relaciones: `artists` 1:1 `artist_profiles`.

Ownership: Professional Network.

Fase: core MVP.

#### `artist_studio_memberships`

Proposito: vinculo hibrido entre artista y estudio.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `artist_id` | uuid | si | FK a `artists`. |
| `studio_id` | uuid | si | FK a `studios`. |
| `role` | enum | si | artist, lead_artist, guest_artist. |
| `status` | enum | si | active, inactive, archived. |
| `started_at` | date | no | Inicio de relacion. |
| `ended_at` | date | no | Fin de relacion. |
| `created_at` | timestamptz | si | Creacion. |

Primary key: `id`.

Foreign keys: `artist_id` -> `artists.id`; `studio_id` -> `studios.id`.

Relaciones: `artists` N:N `studios`; `artist_studio_memberships` 1:N `appointments`.

Ownership: Professional Network.

Fase: core MVP.

Auditoria: si, por cambios de status y relacion historica.

#### `studio_team_members`

Proposito: roles operativos de perfiles dentro de un estudio.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `studio_id` | uuid | si | FK a `studios`. |
| `profile_id` | uuid | si | FK a `profiles`. |
| `role` | enum | si | owner, manager, artist, staff. |
| `status` | enum | si | active, invited, revoked, archived. |
| `created_at` | timestamptz | si | Alta. |
| `revoked_at` | timestamptz | no | Baja. |

Primary key: `id`.

Foreign keys: `studio_id` -> `studios.id`; `profile_id` -> `profiles.id`.

Relaciones: `studios` 1:N `studio_team_members`; `profiles` 1:N `studio_team_members`.

Ownership: Professional Network e Identity & Access.

Fase: core MVP.

### 3.4 Service Catalog

#### `service_categories`

Proposito: catalogo curado de familias de servicios.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `name` | text | si | Nombre. |
| `slug` | text | si | Identificador legible. |
| `status` | enum | si | active, retired. |
| `sort_order` | integer | no | Orden. |

Primary key: `id`.

Foreign keys: ninguna.

Relaciones: `service_categories` 1:N `service_offerings`.

Ownership: Service Catalog.

Fase: core MVP.

#### `service_tiers`

Proposito: catalogo versionable de niveles comerciales para economia y loyalty.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `code` | enum | si | basic, medium, premium, vip. |
| `label` | text | si | Nombre. |
| `default_points` | integer | no | Puntos base sugeridos. |
| `status` | enum | si | active, retired. |

Primary key: `id`.

Foreign keys: ninguna.

Relaciones: `service_tiers` 1:N `service_offerings`.

Ownership: Service Catalog.

Fase: core MVP.

#### `service_offerings`

Proposito: servicio ofrecido por artista o estudio.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `artist_id` | uuid | no | FK a `artists`. |
| `studio_id` | uuid | no | FK a `studios`. |
| `category_id` | uuid | si | FK a `service_categories`. |
| `tier_id` | uuid | no | FK a `service_tiers`. |
| `name` | text | si | Nombre del servicio. |
| `description` | text | no | Detalle. |
| `price_amount` | numeric | si | Precio actual. |
| `duration_minutes` | integer | si | Duracion base. |
| `status` | enum | si | draft, active, suspended, archived. |
| `created_at` | timestamptz | si | Creacion. |
| `updated_at` | timestamptz | no | Actualizacion. |

Primary key: `id`.

Foreign keys: `artist_id` -> `artists.id`; `studio_id` -> `studios.id`; `category_id` -> `service_categories.id`; `tier_id` -> `service_tiers.id`.

Relaciones: `service_offerings` 1:N `appointments`; N:N con `promotions` mediante `service_promotion_rules`.

Ownership: Service Catalog.

Fase: core MVP.

### 3.5 Scheduling & Booking

#### `schedules`

Proposito: configuracion de agenda para artista, estudio o membership.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `artist_id` | uuid | si | FK a `artists`. |
| `studio_id` | uuid | no | FK a `studios`. |
| `membership_id` | uuid | no | FK a `artist_studio_memberships`. |
| `timezone` | text | si | Zona horaria. |
| `slot_interval_minutes` | integer | si | Intervalo de reserva. |
| `status` | enum | si | active, inactive, archived. |
| `created_at` | timestamptz | si | Creacion. |
| `updated_at` | timestamptz | no | Actualizacion. |

Primary key: `id`.

Foreign keys: `artist_id` -> `artists.id`; `studio_id` -> `studios.id`; `membership_id` -> `artist_studio_memberships.id`.

Relaciones: `schedules` 1:N `schedule_rules`; `schedules` 1:N `calendar_blocks`; `schedules` 1:N `availability_slots`.

Ownership: Scheduling & Booking.

Fase: core MVP.

#### `schedule_rules`

Proposito: reglas semanales de horario y descansos.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `schedule_id` | uuid | si | FK a `schedules`. |
| `weekday` | integer | si | Dia de semana. |
| `is_active` | boolean | si | Dia laborable. |
| `start_time` | time | no | Inicio. |
| `end_time` | time | no | Fin. |
| `break_start_time` | time | no | Inicio break. |
| `break_end_time` | time | no | Fin break. |

Primary key: `id`.

Foreign keys: `schedule_id` -> `schedules.id`.

Relaciones: `schedules` 1:N `schedule_rules`.

Ownership: Scheduling & Booking.

Fase: core MVP.

#### `calendar_blocks`

Proposito: indisponibilidad manual o sistemica.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `schedule_id` | uuid | si | FK a `schedules`. |
| `artist_id` | uuid | si | FK a `artists`. |
| `studio_id` | uuid | no | FK a `studios`. |
| `block_type` | enum | si | break, training, personal, maintenance, other. |
| `starts_at` | timestamptz | si | Inicio. |
| `ends_at` | timestamptz | si | Fin. |
| `reason` | text | no | Motivo. |
| `status` | enum | si | active, cancelled, expired. |

Primary key: `id`.

Foreign keys: `schedule_id` -> `schedules.id`; `artist_id` -> `artists.id`; `studio_id` -> `studios.id`.

Relaciones: `schedules` 1:N `calendar_blocks`.

Ownership: Scheduling & Booking.

Fase: core MVP.

#### `availability_slots`

Proposito: disponibilidad materializada para marketplace o reserva rapida.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `schedule_id` | uuid | si | FK a `schedules`. |
| `artist_id` | uuid | si | FK a `artists`. |
| `studio_id` | uuid | no | FK a `studios`. |
| `membership_id` | uuid | no | FK a `artist_studio_memberships`. |
| `starts_at` | timestamptz | si | Inicio. |
| `ends_at` | timestamptz | si | Fin. |
| `status` | enum | si | available, held, booked, expired, hidden. |
| `generated_at` | timestamptz | si | Generacion. |

Primary key: `id`.

Foreign keys: `schedule_id` -> `schedules.id`; `artist_id` -> `artists.id`; `studio_id` -> `studios.id`; `membership_id` -> `artist_studio_memberships.id`.

Relaciones: `availability_slots` 1:1 opcional con `appointments`.

Ownership: Scheduling & Booking.

Fase: posterior.

#### `appointments`

Proposito: cita operacional central.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `client_id` | uuid | si | FK a `clients`. |
| `artist_id` | uuid | si | FK a `artists`. |
| `studio_id` | uuid | no | FK a `studios`. |
| `membership_id` | uuid | no | FK a `artist_studio_memberships`. |
| `service_offering_id` | uuid | si | FK a `service_offerings`. |
| `availability_slot_id` | uuid | no | FK a `availability_slots`. |
| `marketplace_listing_id` | uuid | no | FK a `marketplace_listings`. |
| `promotion_id` | uuid | no | FK a `promotions`. |
| `starts_at` | timestamptz | si | Inicio. |
| `ends_at` | timestamptz | si | Fin. |
| `status` | enum | si | reserved, scheduled, confirmed, completed, cancelled, no_show, disputed. |
| `booking_source` | enum | si | artist, studio, client_portal, marketplace, admin. |
| `client_notes` | text | no | Notas de clienta. |
| `internal_notes` | text | no | Notas internas. |
| `created_by_profile_id` | uuid | no | FK a `profiles`. |
| `created_at` | timestamptz | si | Creacion. |
| `updated_at` | timestamptz | no | Actualizacion. |
| `completed_at` | timestamptz | no | Completion. |
| `cancelled_at` | timestamptz | no | Cancelacion. |

Primary key: `id`.

Foreign keys: `client_id` -> `clients.id`; `artist_id` -> `artists.id`; `studio_id` -> `studios.id`; `membership_id` -> `artist_studio_memberships.id`; `service_offering_id` -> `service_offerings.id`; `availability_slot_id` -> `availability_slots.id`; `marketplace_listing_id` -> `marketplace_listings.id`; `promotion_id` -> `promotions.id`; `created_by_profile_id` -> `profiles.id`.

Relaciones: 1:1 con `appointment_economies`; 1:1 con `commissions`; 1:N con status events, no-show cases, risk flags, loyalty ledger entries.

Ownership: Scheduling & Booking.

Fase: core MVP.

Auditoria: si.

#### `appointment_status_events`

Proposito: historial append-only de cambios de estado de cita.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `appointment_id` | uuid | si | FK a `appointments`. |
| `from_status` | enum | no | Estado anterior. |
| `to_status` | enum | si | Estado nuevo. |
| `reason` | text | no | Motivo. |
| `changed_by_profile_id` | uuid | no | FK a `profiles`. |
| `changed_at` | timestamptz | si | Momento. |

Primary key: `id`.

Foreign keys: `appointment_id` -> `appointments.id`; `changed_by_profile_id` -> `profiles.id`.

Relaciones: `appointments` 1:N `appointment_status_events`.

Ownership: Scheduling & Booking.

Fase: core MVP.

Auditoria: si.

### 3.6 Customer 360

#### `clients`

Proposito: raiz de clienta y su identidad 360.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `profile_id` | uuid | no | FK a `profiles`. |
| `display_name` | text | si | Nombre. |
| `email` | text | no | Contacto. |
| `phone` | text | no | Contacto. |
| `status` | enum | si | active, inactive, archived. |
| `created_at` | timestamptz | si | Alta. |
| `archived_at` | timestamptz | no | Archivo. |

Primary key: `id`.

Foreign keys: `profile_id` -> `profiles.id`.

Relaciones: 1:1 con `client_profiles`; 1:1 con `loyalty_accounts`; 1:N con appointments, relationships, favorite artists.

Ownership: Customer 360.

Fase: core MVP.

#### `client_profiles`

Proposito: datos extendidos de clienta: cumpleanos, notas y preferencias base.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `client_id` | uuid | si | FK a `clients`. |
| `birthday` | date | no | Para bonus y automatizaciones. |
| `notes` | text | no | Notas internas controladas. |
| `preferred_services` | text[] | no | Preferencias simples. |
| `favorite_artist_id` | uuid | no | FK a `artists` si hay uno principal. |
| `last_visit_at` | timestamptz | no | Proyeccion. |
| `next_recommended_visit_at` | timestamptz | no | Proyeccion. |
| `updated_at` | timestamptz | no | Actualizacion. |

Primary key: `id`.

Foreign keys: `client_id` -> `clients.id`; `favorite_artist_id` -> `artists.id`.

Relaciones: `clients` 1:1 `client_profiles`.

Ownership: Customer 360.

Fase: core MVP.

#### `customer_relationships`

Proposito: relacion contextual entre clienta y artista/estudio.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `client_id` | uuid | si | FK a `clients`. |
| `artist_id` | uuid | no | FK a `artists`. |
| `studio_id` | uuid | no | FK a `studios`. |
| `relationship_type` | enum | si | appointment, favorite, recurring, imported. |
| `status` | enum | si | active, inactive, archived. |
| `total_visits` | integer | no | Proyeccion. |
| `total_spend_amount` | numeric | no | Proyeccion. |
| `last_interaction_at` | timestamptz | no | Ultima interaccion. |

Primary key: `id`.

Foreign keys: `client_id` -> `clients.id`; `artist_id` -> `artists.id`; `studio_id` -> `studios.id`.

Relaciones: `clients` 1:N `customer_relationships`.

Ownership: Customer 360.

Fase: core MVP.

#### `client_preferences`

Proposito: preferencias normalizadas de clienta.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `client_id` | uuid | si | FK a `clients`. |
| `preference_type` | enum | si | service, time, artist, location, communication. |
| `value` | text | si | Valor. |
| `source` | enum | si | explicit, inferred, imported. |
| `confidence` | numeric | no | Confianza. |
| `created_at` | timestamptz | si | Creacion. |

Primary key: `id`.

Foreign keys: `client_id` -> `clients.id`.

Relaciones: `clients` 1:N `client_preferences`.

Ownership: Customer 360.

Fase: posterior.

#### `client_segments`

Proposito: segmentos derivados de recurrencia, gasto, loyalty o inactividad.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `client_id` | uuid | si | FK a `clients`. |
| `segment_code` | enum | si | new, frequent, vip, inactive, at_risk. |
| `source_context` | enum | si | customer_360, loyalty, analytics. |
| `valid_from` | timestamptz | si | Inicio. |
| `valid_until` | timestamptz | no | Fin. |

Primary key: `id`.

Foreign keys: `client_id` -> `clients.id`.

Relaciones: `clients` 1:N `client_segments`.

Ownership: Customer 360.

Fase: posterior.

#### `favorite_artists`

Proposito: relacion explicita de favorito entre clienta y artista.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `client_id` | uuid | si | FK a `clients`. |
| `artist_id` | uuid | si | FK a `artists`. |
| `created_at` | timestamptz | si | Marcado como favorito. |
| `removed_at` | timestamptz | no | Quitado. |

Primary key: `id`.

Foreign keys: `client_id` -> `clients.id`; `artist_id` -> `artists.id`.

Relaciones: N:N entre `clients` y `artists`.

Ownership: Marketplace, consumida por Customer 360.

Fase: core MVP.

### 3.7 Marketplace

#### `marketplace_profiles`

Proposito: perfil publicable de artista, estudio o membership.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `artist_id` | uuid | no | FK a `artists`. |
| `studio_id` | uuid | no | FK a `studios`. |
| `membership_id` | uuid | no | FK a `artist_studio_memberships`. |
| `profile_type` | enum | si | artist, studio, membership. |
| `title` | text | si | Titulo publico. |
| `summary` | text | no | Resumen. |
| `visibility_status` | enum | si | draft, visible, hidden, suspended. |
| `published_at` | timestamptz | no | Publicacion. |
| `hidden_at` | timestamptz | no | Ocultamiento. |

Primary key: `id`.

Foreign keys: `artist_id` -> `artists.id`; `studio_id` -> `studios.id`; `membership_id` -> `artist_studio_memberships.id`.

Relaciones: 1:N con `marketplace_listings`; 1:N con badges y events.

Ownership: Marketplace.

Fase: core MVP.

#### `marketplace_listings`

Proposito: aparicion concreta en busqueda o descubrimiento.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `marketplace_profile_id` | uuid | si | FK a `marketplace_profiles`. |
| `artist_id` | uuid | no | FK para filtros rapidos. |
| `studio_id` | uuid | no | FK para filtros rapidos. |
| `city` | text | no | Ubicacion. |
| `visibility_status` | enum | si | visible, hidden, expired. |
| `availability_score` | numeric | no | Proyeccion. |
| `occupancy_score` | numeric | no | Proyeccion. |
| `ranking_score` | numeric | no | Proyeccion auditable si impacta fairness. |
| `generated_at` | timestamptz | si | Generacion. |
| `expires_at` | timestamptz | no | Expiracion. |

Primary key: `id`.

Foreign keys: `marketplace_profile_id` -> `marketplace_profiles.id`; `artist_id` -> `artists.id`; `studio_id` -> `studios.id`.

Relaciones: 1:N con `marketplace_events`; N:N con `fairness_signals`.

Ownership: Marketplace.

Fase: core MVP.

#### `marketplace_badges`

Proposito: senales visibles como premium, top, alta disponibilidad o nuevo.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `marketplace_profile_id` | uuid | si | FK a `marketplace_profiles`. |
| `badge_code` | enum | si | premium, top, available, new, low_occupancy. |
| `source_context` | enum | si | marketplace, analytics, fairness. |
| `valid_from` | timestamptz | si | Inicio. |
| `valid_until` | timestamptz | no | Fin. |

Primary key: `id`.

Foreign keys: `marketplace_profile_id` -> `marketplace_profiles.id`.

Relaciones: `marketplace_profiles` 1:N `marketplace_badges`.

Ownership: Marketplace.

Fase: posterior.

#### `marketplace_events`

Proposito: eventos auditables de exposicion, clicks, favoritos y booking intent.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `marketplace_listing_id` | uuid | no | FK a `marketplace_listings`. |
| `client_id` | uuid | no | FK a `clients`. |
| `event_type` | enum | si | viewed, clicked, favorited, booking_started, booking_completed. |
| `metadata` | jsonb | no | Datos no autoritativos. |
| `occurred_at` | timestamptz | si | Momento. |

Primary key: `id`.

Foreign keys: `marketplace_listing_id` -> `marketplace_listings.id`; `client_id` -> `clients.id`.

Relaciones: `marketplace_listings` 1:N `marketplace_events`.

Ownership: Marketplace.

Fase: posterior.

Auditoria: si.

### 3.8 Appointment Economy

#### `appointment_economies`

Proposito: calculo economico de una cita.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `appointment_id` | uuid | si | FK a `appointments`. |
| `gross_amount` | numeric | si | Importe bruto. |
| `platform_fee_amount` | numeric | si | Comision plataforma calculada. |
| `artist_revenue_amount` | numeric | si | Ingreso artista. |
| `studio_revenue_amount` | numeric | no | Si aplica. |
| `currency` | text | si | Moneda. |
| `calculation_status` | enum | si | estimated, finalized, adjusted, void. |
| `calculation_version` | text | no | Version de regla. |
| `risk_score` | enum | no | low, medium, high, critical. |
| `finalized_at` | timestamptz | no | Cierre. |
| `adjusted_at` | timestamptz | no | Ajuste. |

Primary key: `id`.

Foreign keys: `appointment_id` -> `appointments.id`.

Relaciones: `appointments` 1:1 `appointment_economies`; 1:N con `revenue_splits`.

Ownership: Appointment Economy.

Fase: core MVP.

Auditoria: si.

#### `commissions`

Proposito: comision de plataforma nacida de una cita.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `appointment_id` | uuid | si | FK a `appointments`. |
| `appointment_economy_id` | uuid | si | FK a `appointment_economies`. |
| `amount` | numeric | si | Importe de comision. |
| `rate` | numeric | no | Porcentaje aplicado. |
| `currency` | text | si | Moneda. |
| `status` | enum | si | pending, earned, adjusted, refunded, void. |
| `earned_at` | timestamptz | no | Devengo. |
| `adjusted_at` | timestamptz | no | Ajuste. |

Primary key: `id`.

Foreign keys: `appointment_id` -> `appointments.id`; `appointment_economy_id` -> `appointment_economies.id`.

Relaciones: `appointments` 1:1 `commissions`.

Ownership: Appointment Economy.

Fase: core MVP.

Auditoria: si.

#### `revenue_splits`

Proposito: desglose de distribucion economica entre partes.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `appointment_economy_id` | uuid | si | FK a `appointment_economies`. |
| `recipient_type` | enum | si | platform, artist, studio. |
| `artist_id` | uuid | no | FK a `artists`. |
| `studio_id` | uuid | no | FK a `studios`. |
| `amount` | numeric | si | Importe. |
| `rate` | numeric | no | Porcentaje. |
| `status` | enum | si | estimated, finalized, adjusted. |

Primary key: `id`.

Foreign keys: `appointment_economy_id` -> `appointment_economies.id`; `artist_id` -> `artists.id`; `studio_id` -> `studios.id`.

Relaciones: `appointment_economies` 1:N `revenue_splits`.

Ownership: Appointment Economy.

Fase: posterior.

#### `economy_risk_signals`

Proposito: senales de riesgo economico derivadas de cita, duracion, puntos o rewards.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `appointment_id` | uuid | si | FK a `appointments`. |
| `appointment_economy_id` | uuid | no | FK a `appointment_economies`. |
| `signal_type` | enum | si | duration_anomaly, excessive_points, reward_mismatch, amount_anomaly. |
| `severity` | enum | si | low, medium, high, critical. |
| `metadata` | jsonb | no | Evidencia. |
| `created_at` | timestamptz | si | Momento. |

Primary key: `id`.

Foreign keys: `appointment_id` -> `appointments.id`; `appointment_economy_id` -> `appointment_economies.id`.

Relaciones: puede derivar en `risk_flags`.

Ownership: Appointment Economy y Fairness Engine.

Fase: posterior.

### 3.9 Loyalty & Flow Points

#### `loyalty_accounts`

Proposito: estado actual de loyalty de una clienta.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `client_id` | uuid | si | FK a `clients`. |
| `points_balance` | integer | si | Saldo proyectado. |
| `vip_tier_id` | uuid | no | FK a `vip_tiers`. |
| `streak_count` | integer | si | Racha actual. |
| `status` | enum | si | active, paused, closed. |
| `created_at` | timestamptz | si | Creacion. |
| `updated_at` | timestamptz | no | Actualizacion. |

Primary key: `id`.

Foreign keys: `client_id` -> `clients.id`; `vip_tier_id` -> `vip_tiers.id`.

Relaciones: `clients` 1:1 `loyalty_accounts`; 1:N con ledger y redemptions.

Ownership: Loyalty & Flow Points.

Fase: core MVP.

#### `flow_point_ledger`

Proposito: movimientos append-only de puntos.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `loyalty_account_id` | uuid | si | FK a `loyalty_accounts`. |
| `client_id` | uuid | si | FK a `clients` para lectura. |
| `appointment_id` | uuid | no | FK a `appointments` cuando nace de cita. |
| `reward_redemption_id` | uuid | no | FK a `reward_redemptions` cuando es canje. |
| `movement_type` | enum | si | earn, spend, expire, adjust. |
| `points` | integer | si | Positivo o negativo segun movimiento. |
| `reason` | enum | si | appointment_completed, reward_redeemed, expiration, manual_adjustment, promotion. |
| `expires_at` | timestamptz | no | Expiracion de puntos ganados. |
| `occurred_at` | timestamptz | si | Momento. |
| `metadata` | jsonb | no | Regla/version. |

Primary key: `id`.

Foreign keys: `loyalty_account_id` -> `loyalty_accounts.id`; `client_id` -> `clients.id`; `appointment_id` -> `appointments.id`; `reward_redemption_id` -> `reward_redemptions.id`.

Relaciones: `loyalty_accounts` 1:N `flow_point_ledger`; `appointments` 1:N `flow_point_ledger`.

Ownership: Loyalty & Flow Points.

Fase: core MVP.

Auditoria: si.

#### `rewards`

Proposito: beneficios canjeables.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `studio_id` | uuid | no | FK si reward es de estudio. |
| `name` | text | si | Nombre. |
| `reward_type` | enum | si | discount, service_upgrade, birthday_gift, private_offer. |
| `points_cost` | integer | si | Costo. |
| `status` | enum | si | draft, active, paused, retired. |
| `validity_days` | integer | no | Vigencia. |
| `created_at` | timestamptz | si | Creacion. |

Primary key: `id`.

Foreign keys: `studio_id` -> `studios.id`.

Relaciones: `rewards` 1:N `reward_redemptions`.

Ownership: Loyalty & Flow Points.

Fase: core MVP.

#### `reward_redemptions`

Proposito: canje de reward por una clienta.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `loyalty_account_id` | uuid | si | FK a `loyalty_accounts`. |
| `client_id` | uuid | si | FK a `clients`. |
| `reward_id` | uuid | si | FK a `rewards`. |
| `appointment_id` | uuid | no | FK si se aplica a cita. |
| `points_spent` | integer | si | Puntos consumidos. |
| `status` | enum | si | requested, confirmed, applied, cancelled, expired. |
| `redeemed_at` | timestamptz | si | Canje. |
| `applied_at` | timestamptz | no | Aplicacion. |

Primary key: `id`.

Foreign keys: `loyalty_account_id` -> `loyalty_accounts.id`; `client_id` -> `clients.id`; `reward_id` -> `rewards.id`; `appointment_id` -> `appointments.id`.

Relaciones: `loyalty_accounts` 1:N `reward_redemptions`; `rewards` 1:N `reward_redemptions`.

Ownership: Loyalty & Flow Points.

Fase: core MVP.

Auditoria: si.

#### `vip_tiers`

Proposito: catalogo versionable de tiers.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `code` | text | si | Identificador. |
| `name` | text | si | Nombre. |
| `min_points` | integer | si | Umbral. |
| `benefits` | jsonb | no | Beneficios. |
| `status` | enum | si | active, retired. |

Primary key: `id`.

Foreign keys: ninguna.

Relaciones: `vip_tiers` 1:N `loyalty_accounts`.

Ownership: Loyalty & Flow Points.

Fase: posterior.

#### `streak_events`

Proposito: eventos de avance, pausa o ruptura de racha.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `loyalty_account_id` | uuid | si | FK a `loyalty_accounts`. |
| `appointment_id` | uuid | no | FK a `appointments`. |
| `event_type` | enum | si | advanced, broken, restored, adjusted. |
| `previous_streak` | integer | no | Valor previo. |
| `new_streak` | integer | si | Valor nuevo. |
| `occurred_at` | timestamptz | si | Momento. |

Primary key: `id`.

Foreign keys: `loyalty_account_id` -> `loyalty_accounts.id`; `appointment_id` -> `appointments.id`.

Relaciones: `loyalty_accounts` 1:N `streak_events`.

Ownership: Loyalty & Flow Points.

Fase: posterior.

### 3.10 Impulsa Tu Negocio

#### `promotions`

Proposito: accion comercial configurable.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `studio_id` | uuid | no | FK a `studios`. |
| `artist_id` | uuid | no | FK a `artists`. |
| `created_by_profile_id` | uuid | no | FK a `profiles`. |
| `promotion_type` | enum | si | happy_hour, double_points, low_occupancy, private_promo, early_booking. |
| `name` | text | si | Nombre. |
| `status` | enum | si | draft, scheduled, active, paused, completed, expired. |
| `starts_at` | timestamptz | no | Inicio. |
| `ends_at` | timestamptz | no | Fin. |
| `rules` | jsonb | no | Reglas conceptuales. |
| `created_at` | timestamptz | si | Creacion. |

Primary key: `id`.

Foreign keys: `studio_id` -> `studios.id`; `artist_id` -> `artists.id`; `created_by_profile_id` -> `profiles.id`.

Relaciones: 1:N con `appointments`; N:N con `service_offerings`.

Ownership: Impulsa Tu Negocio.

Fase: core MVP.

#### `service_promotion_rules`

Proposito: puente entre promociones y servicios aplicables.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `promotion_id` | uuid | si | FK a `promotions`. |
| `service_offering_id` | uuid | si | FK a `service_offerings`. |
| `rule_metadata` | jsonb | no | Condiciones. |

Primary key: `id`.

Foreign keys: `promotion_id` -> `promotions.id`; `service_offering_id` -> `service_offerings.id`.

Relaciones: N:N entre `promotions` y `service_offerings`.

Ownership: Impulsa Tu Negocio.

Fase: posterior.

#### `automation_recommendations`

Proposito: recomendaciones generadas por senales comerciales.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `studio_id` | uuid | no | FK a `studios`. |
| `artist_id` | uuid | no | FK a `artists`. |
| `client_id` | uuid | no | FK a `clients`. |
| `recommendation_type` | enum | si | expiring_points, streak_risk, low_occupancy, inactive_client, birthday, vip_progress. |
| `priority` | enum | si | low, medium, high, critical. |
| `status` | enum | si | generated, viewed, accepted, dismissed, expired. |
| `message` | text | no | Texto sugerido. |
| `metadata` | jsonb | no | Evidencia. |
| `created_at` | timestamptz | si | Generacion. |
| `expires_at` | timestamptz | no | Expiracion. |

Primary key: `id`.

Foreign keys: `studio_id` -> `studios.id`; `artist_id` -> `artists.id`; `client_id` -> `clients.id`.

Relaciones: puede crear `promotions` o `campaigns`.

Ownership: Impulsa Tu Negocio.

Fase: posterior.

#### `reactivation_opportunities`

Proposito: oportunidades de recuperar clientas inactivas.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `client_id` | uuid | si | FK a `clients`. |
| `artist_id` | uuid | no | FK a `artists`. |
| `studio_id` | uuid | no | FK a `studios`. |
| `days_inactive` | integer | si | Dias sin visita. |
| `status` | enum | si | open, contacted, converted, dismissed, expired. |
| `detected_at` | timestamptz | si | Deteccion. |
| `resolved_at` | timestamptz | no | Resolucion. |

Primary key: `id`.

Foreign keys: `client_id` -> `clients.id`; `artist_id` -> `artists.id`; `studio_id` -> `studios.id`.

Relaciones: puede originar campaigns o promotions.

Ownership: Impulsa Tu Negocio.

Fase: posterior.

#### `business_insights`

Proposito: insights accionables de ocupacion, recurrencia y marketing.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `studio_id` | uuid | no | FK a `studios`. |
| `artist_id` | uuid | no | FK a `artists`. |
| `insight_type` | enum | si | occupancy, reactivation, loyalty, demand, revenue, fairness. |
| `severity` | enum | no | info, low, medium, high. |
| `title` | text | si | Titulo. |
| `message` | text | no | Explicacion. |
| `metadata` | jsonb | no | Evidencia. |
| `generated_at` | timestamptz | si | Generacion. |
| `expires_at` | timestamptz | no | Expiracion. |

Primary key: `id`.

Foreign keys: `studio_id` -> `studios.id`; `artist_id` -> `artists.id`.

Relaciones: consume metric snapshots.

Ownership: Impulsa Tu Negocio o Analytics segun origen.

Fase: posterior.

#### `campaigns`

Proposito: campana ejecutable derivada de promociones o automatizaciones.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `promotion_id` | uuid | no | FK a `promotions`. |
| `studio_id` | uuid | no | FK a `studios`. |
| `artist_id` | uuid | no | FK a `artists`. |
| `name` | text | si | Nombre. |
| `campaign_type` | enum | si | reactivation, loyalty, occupancy, seasonal, private. |
| `status` | enum | si | draft, scheduled, active, paused, completed, cancelled. |
| `asset_paths` | text[] | no | Rutas storage. |
| `starts_at` | timestamptz | no | Inicio. |
| `ends_at` | timestamptz | no | Fin. |

Primary key: `id`.

Foreign keys: `promotion_id` -> `promotions.id`; `studio_id` -> `studios.id`; `artist_id` -> `artists.id`.

Relaciones: 1:N con `campaign_events`.

Ownership: Impulsa Tu Negocio.

Fase: posterior.

#### `campaign_events`

Proposito: eventos auditables de campanas.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `campaign_id` | uuid | si | FK a `campaigns`. |
| `client_id` | uuid | no | FK a `clients`. |
| `event_type` | enum | si | sent, viewed, clicked, booked, dismissed, converted. |
| `metadata` | jsonb | no | Detalle. |
| `occurred_at` | timestamptz | si | Momento. |

Primary key: `id`.

Foreign keys: `campaign_id` -> `campaigns.id`; `client_id` -> `clients.id`.

Relaciones: `campaigns` 1:N `campaign_events`.

Ownership: Impulsa Tu Negocio.

Fase: posterior.

Auditoria: si.

### 3.11 Fairness Engine

#### `fairness_signals`

Proposito: senales de equidad, exposicion, rewards o riesgo.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `signal_type` | enum | si | exposure_imbalance, reward_anomaly, economy_anomaly, marketplace_bias, no_show_pattern. |
| `severity` | enum | si | low, medium, high, critical. |
| `entity_type` | enum | si | artist, studio, client, appointment, listing, reward. |
| `entity_id` | uuid | si | Identificador de entidad evaluada. |
| `rule_version` | text | no | Version de regla. |
| `metadata` | jsonb | no | Evidencia. |
| `status` | enum | si | open, reviewed, resolved, dismissed. |
| `created_at` | timestamptz | si | Generacion. |

Primary key: `id`.

Foreign keys: polimorficas conceptuales por `entity_type` + `entity_id`; no forzar FK unica si complica la implementacion.

Relaciones: N:N con `fairness_reviews`.

Ownership: Fairness Engine.

Fase: posterior.

Auditoria: si.

#### `fairness_reviews`

Proposito: agrupar senales y resoluciones de fairness.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `review_type` | enum | si | exposure, loyalty, economy, trust, marketplace. |
| `status` | enum | si | open, under_review, resolved, dismissed. |
| `opened_by` | enum | si | system, platform_owner. |
| `reviewed_by_profile_id` | uuid | no | FK a `profiles`. |
| `resolution` | text | no | Decision. |
| `created_at` | timestamptz | si | Apertura. |
| `resolved_at` | timestamptz | no | Resolucion. |

Primary key: `id`.

Foreign keys: `reviewed_by_profile_id` -> `profiles.id`.

Relaciones: N:N con `fairness_signals` mediante `fairness_review_signals`.

Ownership: Fairness Engine.

Fase: posterior.

Auditoria: si.

#### `fairness_review_signals`

Proposito: puente entre reviews y senales.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `fairness_review_id` | uuid | si | FK a `fairness_reviews`. |
| `fairness_signal_id` | uuid | si | FK a `fairness_signals`. |
| `created_at` | timestamptz | si | Asociacion. |

Primary key: `id`.

Foreign keys: `fairness_review_id` -> `fairness_reviews.id`; `fairness_signal_id` -> `fairness_signals.id`.

Relaciones: N:N entre `fairness_reviews` y `fairness_signals`.

Ownership: Fairness Engine.

Fase: posterior.

#### `risk_flags`

Proposito: flags operativos, economicos o de confianza para revision.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `entity_type` | enum | si | appointment, studio, artist, client, commission, listing. |
| `entity_id` | uuid | si | Entidad afectada. |
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

Primary key: `id`.

Foreign keys: `appointment_id` -> `appointments.id`; `studio_id` -> `studios.id`; `artist_id` -> `artists.id`; `client_id` -> `clients.id`.

Relaciones: puede asociarse a no-show, fairness review o governance review.

Ownership: Fairness Engine y Trust & Governance segun tipo.

Fase: core MVP para flags basicos; posterior para fairness avanzado.

Auditoria: si.

### 3.12 Analytics & Reporting

#### `metric_snapshots`

Proposito: snapshots historicos de metricas por periodo y entidad.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `entity_type` | enum | si | platform, studio, artist, client, marketplace. |
| `entity_id` | uuid | no | Entidad medida. |
| `metric_type` | enum | si | occupancy, revenue, clients, appointments, risk, loyalty, marketplace. |
| `period_start` | date | si | Inicio periodo. |
| `period_end` | date | si | Fin periodo. |
| `value_numeric` | numeric | no | Valor principal. |
| `value_json` | jsonb | no | Detalle. |
| `generated_at` | timestamptz | si | Generacion. |

Primary key: `id`.

Foreign keys: polimorficas conceptuales por `entity_type` + `entity_id`.

Relaciones: alimenta summaries e insights.

Ownership: Analytics & Reporting.

Fase: posterior.

Auditoria: si para metricas financieras, riesgo y fairness.

#### `portfolio_summaries`

Proposito: resumen por portfolio, estudio, artista o ecosistema.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `summary_type` | enum | si | ecosystem, studio, artist, client. |
| `studio_id` | uuid | no | FK a `studios`. |
| `artist_id` | uuid | no | FK a `artists`. |
| `client_id` | uuid | no | FK a `clients`. |
| `period_start` | date | si | Inicio. |
| `period_end` | date | si | Fin. |
| `summary` | jsonb | si | Datos agregados. |
| `generated_at` | timestamptz | si | Generacion. |

Primary key: `id`.

Foreign keys: `studio_id` -> `studios.id`; `artist_id` -> `artists.id`; `client_id` -> `clients.id`.

Relaciones: puede consumir `metric_snapshots`.

Ownership: Analytics & Reporting.

Fase: posterior.

### 3.13 Trust & Governance

#### `audit_events`

Proposito: bitacora transversal de acciones relevantes.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `actor_profile_id` | uuid | no | FK a `profiles`. |
| `context` | enum | si | identity, studio, booking, economy, loyalty, marketplace, fairness, marketing. |
| `entity_type` | enum | si | Tipo de entidad. |
| `entity_id` | uuid | si | Id de entidad. |
| `event_type` | text | si | Accion. |
| `before_data` | jsonb | no | Estado anterior resumido. |
| `after_data` | jsonb | no | Estado posterior resumido. |
| `metadata` | jsonb | no | Detalle tecnico. |
| `occurred_at` | timestamptz | si | Momento. |

Primary key: `id`.

Foreign keys: `actor_profile_id` -> `profiles.id`.

Relaciones: transversal.

Ownership: Trust & Governance.

Fase: core MVP.

Auditoria: si.

#### `status_change_events`

Proposito: historial normalizado de cambios de estado en entidades criticas.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `entity_type` | enum | si | appointment, studio, membership, commission, reward_redemption, promotion, sanction. |
| `entity_id` | uuid | si | Entidad. |
| `from_status` | text | no | Estado anterior. |
| `to_status` | text | si | Estado nuevo. |
| `reason` | text | no | Motivo. |
| `changed_by_profile_id` | uuid | no | FK a `profiles`. |
| `changed_at` | timestamptz | si | Momento. |

Primary key: `id`.

Foreign keys: `changed_by_profile_id` -> `profiles.id`.

Relaciones: transversal.

Ownership: Trust & Governance.

Fase: posterior si `appointment_status_events` cubre MVP; core si se quiere bitacora uniforme desde el inicio.

Auditoria: si.

#### `sanctions`

Proposito: registrar sanciones, restricciones o penalizaciones por abuso, no-show o governance.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `subject_type` | enum | si | client, artist, studio, profile. |
| `subject_id` | uuid | si | Entidad sancionada. |
| `sanction_type` | enum | si | warning, booking_limit, visibility_limit, suspension, manual_review. |
| `reason` | text | si | Motivo. |
| `status` | enum | si | active, lifted, expired, appealed. |
| `created_by_profile_id` | uuid | no | FK a `profiles`. |
| `starts_at` | timestamptz | si | Inicio. |
| `ends_at` | timestamptz | no | Fin. |
| `lifted_at` | timestamptz | no | Levantamiento. |

Primary key: `id`.

Foreign keys: `created_by_profile_id` -> `profiles.id`.

Relaciones: puede originarse desde `risk_flags` o `no_show_cases`.

Ownership: Trust & Governance.

Fase: posterior.

Auditoria: si.

#### `no_show_cases`

Proposito: registrar casos de no-show y su resolucion.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `appointment_id` | uuid | si | FK a `appointments`. |
| `client_id` | uuid | si | FK a `clients`. |
| `artist_id` | uuid | si | FK a `artists`. |
| `studio_id` | uuid | no | FK a `studios`. |
| `reported_by_profile_id` | uuid | no | FK a `profiles`. |
| `status` | enum | si | open, accepted, disputed, resolved, dismissed. |
| `reason` | text | no | Detalle. |
| `reported_at` | timestamptz | si | Reporte. |
| `resolved_at` | timestamptz | no | Resolucion. |

Primary key: `id`.

Foreign keys: `appointment_id` -> `appointments.id`; `client_id` -> `clients.id`; `artist_id` -> `artists.id`; `studio_id` -> `studios.id`; `reported_by_profile_id` -> `profiles.id`.

Relaciones: `appointments` 1:N `no_show_cases`; 1:N con evidence files.

Ownership: Trust & Governance.

Fase: posterior, salvo que no-show sea critico para MVP.

Auditoria: si.

#### `no_show_evidence_files`

Proposito: asociar evidencia almacenada a casos de no-show.

Columnas propuestas:

| Columna | Tipo logico | Requerido | Notas |
| --- | --- | --- | --- |
| `id` | uuid | si | Primary key. |
| `no_show_case_id` | uuid | si | FK a `no_show_cases`. |
| `uploaded_by_profile_id` | uuid | no | FK a `profiles`. |
| `storage_bucket` | text | si | `no-show-evidence`. |
| `storage_path` | text | si | Ruta del archivo. |
| `file_type` | text | no | MIME o categoria. |
| `created_at` | timestamptz | si | Carga. |

Primary key: `id`.

Foreign keys: `no_show_case_id` -> `no_show_cases.id`; `uploaded_by_profile_id` -> `profiles.id`.

Relaciones: `no_show_cases` 1:N `no_show_evidence_files`.

Ownership: Trust & Governance.

Fase: posterior.

Auditoria: si.

## 4. Relaciones Globales

### 4.1 Relaciones 1:1

- `profiles` 1:1 `artists`, cuando una identidad representa una artista.
- `profiles` 1:1 `clients`, cuando una identidad representa una clienta.
- `studios` 1:1 `studio_profiles`.
- `artists` 1:1 `artist_profiles`.
- `clients` 1:1 `client_profiles`.
- `clients` 1:1 `loyalty_accounts`.
- `appointments` 1:1 `appointment_economies`.
- `appointments` 1:1 `commissions`.
- `availability_slots` 1:1 `appointments`, cuando un slot materializado termina reservado.

### 4.2 Relaciones 1:N

- `profiles` 1:N `user_role_assignments`.
- `studios` 1:N `governance_reviews`.
- `studios` 1:N `artist_studio_memberships`.
- `artists` 1:N `artist_studio_memberships`.
- `studios` 1:N `studio_team_members`.
- `artists` 1:N `service_offerings`.
- `studios` 1:N `service_offerings`.
- `service_categories` 1:N `service_offerings`.
- `service_tiers` 1:N `service_offerings`.
- `artists` 1:N `schedules`.
- `schedules` 1:N `schedule_rules`.
- `schedules` 1:N `calendar_blocks`.
- `schedules` 1:N `availability_slots`.
- `clients` 1:N `appointments`.
- `artists` 1:N `appointments`.
- `studios` 1:N `appointments`.
- `artist_studio_memberships` 1:N `appointments`.
- `service_offerings` 1:N `appointments`.
- `appointments` 1:N `appointment_status_events`.
- `clients` 1:N `customer_relationships`.
- `loyalty_accounts` 1:N `flow_point_ledger`.
- `loyalty_accounts` 1:N `reward_redemptions`.
- `rewards` 1:N `reward_redemptions`.
- `marketplace_profiles` 1:N `marketplace_listings`.
- `marketplace_listings` 1:N `marketplace_events`.
- `promotions` 1:N `appointments`.
- `campaigns` 1:N `campaign_events`.
- `appointments` 1:N `risk_flags`.
- `appointments` 1:N `no_show_cases`.

### 4.3 Relaciones N:N

- `roles` N:N `permissions` mediante `role_permissions`.
- `profiles` N:N `roles` mediante `user_role_assignments`.
- `artists` N:N `studios` mediante `artist_studio_memberships`.
- `profiles` N:N `studios` mediante `studio_team_members`.
- `clients` N:N `artists` mediante `appointments`, `customer_relationships` y `favorite_artists`.
- `clients` N:N `studios` mediante `appointments` y `customer_relationships`.
- `promotions` N:N `service_offerings` mediante `service_promotion_rules`.
- `clients` N:N `rewards` mediante `reward_redemptions`.
- `fairness_reviews` N:N `fairness_signals` mediante `fairness_review_signals`.

## 5. Tablas Auditables

Auditoria obligatoria o altamente recomendada:

- `appointments`: cambios de fecha, hora, cliente, artista, servicio, status, cancelaciones y completion.
- `appointment_status_events`: historial de estados de cita.
- `appointment_economies`: finalizacion y ajustes economicos.
- `commissions`: devengo, ajustes, refunds o void.
- `status_change_events`: cambios de estado transversales.
- `flow_point_ledger`: ledger append-only de loyalty.
- `reward_redemptions`: canjes y aplicacion.
- `no_show_cases`: reporte, disputa y resolucion.
- `no_show_evidence_files`: evidencia asociada.
- `sanctions`: advertencias, suspensiones y restricciones.
- `artist_studio_memberships`: altas, bajas, inactivacion y archivo.
- `marketplace_events`: exposicion, clicks, favoritos y conversion.
- `campaign_events`: envio, vistas, clicks, conversiones.
- `fairness_signals`: senales, version de regla y evidencia.
- `fairness_reviews`: decision y resolucion.
- `governance_reviews`: aprobaciones, suspensiones y cambios solicitados.
- `user_role_assignments`: asignacion y revocacion de roles.
- `audit_events`: bitacora transversal.

## 6. Supabase Storage Buckets

### `artist-profile-photos`

Uso: foto principal de artista.

Acceso conceptual: artista propietaria puede subir/actualizar su foto; studio owner/manager puede asistir si tiene relacion activa; publico puede leer solo fotos de perfiles visibles.

### `artist-portfolios`

Uso: imagenes de trabajos y portafolio.

Acceso conceptual: artista y managers autorizados pueden administrar; publico lee solo assets de perfiles marketplace visibles.

### `studio-logos`

Uso: logos de estudios.

Acceso conceptual: studio owner/manager administra; publico lee logos de estudios approved y visibles.

### `studio-gallery`

Uso: galeria visual de estudio.

Acceso conceptual: studio owner/manager administra; publico lee imagenes visibles si el estudio esta approved.

### `client-avatars`

Uso: avatar de clienta.

Acceso conceptual: clienta administra su avatar; artistas/studios lo ven solo si existe relacion operacional; no publico por defecto.

### `no-show-evidence`

Uso: evidencia de no-show, disputa o sancion.

Acceso conceptual: privado. Solo participantes del caso y roles de governance/trust autorizados.

### `campaign-assets`

Uso: imagenes y assets de campanas.

Acceso conceptual: artista/studio owner/manager administra assets propios; publico o clientas objetivo leen solo assets de campanas activas y permitidas.

## 7. Reglas Conceptuales para RLS

No se escriben politicas. Solo se define intencion de acceso por rol.

### Platform Owner

Debe poder leer y administrar datos de todos los contextos, incluyendo governance, fairness, sanciones, auditoria, economia agregada y configuracion global.

Debe tener acceso especial a:

- `governance_reviews`
- `fairness_signals`
- `fairness_reviews`
- `risk_flags`
- `sanctions`
- `audit_events`
- metricas globales

### Studio Owner

Debe poder leer y administrar datos de su propio estudio:

- perfil de estudio
- team members
- memberships
- artistas vinculadas
- servicios del estudio
- agenda del estudio
- citas del estudio
- clientes con relacion con el estudio
- promociones/campanas del estudio
- revenue y comisiones visibles para su scope

No debe leer datos privados de otros estudios.

### Studio Manager

Debe poder operar datos del estudio asignado, con menor alcance que owner:

- agenda
- citas
- clientes del estudio
- artistas asignadas
- servicios operativos
- marketing operativo

No deberia administrar governance, sanciones globales, roles de owner ni auditoria financiera sensible salvo permiso explicito.

### Artist

Debe poder leer y administrar su propio perfil, servicios, agenda, citas y clientes relacionados.

Debe poder ver:

- sus appointments
- sus memberships activas
- clientes que reservaron con ella
- loyalty visible solo a nivel operativo necesario
- promociones propias
- marketplace profile propio

No debe ver revenue global de estudio ni datos de otras artistas salvo permisos de equipo.

### Client

Debe poder leer y administrar sus propios datos:

- perfil cliente
- citas propias
- favoritos
- loyalty account propio
- reward redemptions propias
- marketplace publico

No debe ver notas internas, risk flags internos, auditoria interna ni datos privados de artistas/estudios.

### Public / Anonymous

Debe poder leer solo datos marketplace publicos:

- perfiles visibles
- listings visibles
- assets publicos de artistas/estudios approved
- disponibilidad publica limitada

No debe acceder a datos de clientes, economia, loyalty, governance, auditoria, no-show ni fairness.

### Service Role / Backend Trusted

Debe ejecutar procesos controlados:

- generar availability slots
- finalizar economia
- registrar ledger loyalty
- generar snapshots
- generar fairness signals
- materializar marketplace listings

Debe quedar trazado en `audit_events` cuando afecte datos criticos.

## 8. Tablas que NO Deben Existir

Para evitar duplicidad:

- `managed_artists`: debe ser read model/proyeccion de `artists`, `artist_profiles`, `artist_studio_memberships`, `studios` y metricas.
- `managed_clients`: debe ser read model/proyeccion de `clients`, `customer_relationships`, appointments y analytics.
- `client_history`: debe derivarse de `appointments` completed, `appointment_economies` y `customer_relationships`.
- `artist_studio_id_history`: debe resolverse con `artist_studio_memberships` y auditoria.
- `client_flow_points`: el saldo vive en `loyalty_accounts`; el movimiento vive en `flow_point_ledger`.
- `appointment_commission_fields`: la comision vive en `commissions`; la cita solo referencia su economia.
- `appointment_points`: los puntos viven en `flow_point_ledger`.
- `marketplace_favorites` si ya existe `favorite_artists`.
- `studio_revenue_summary` como fuente primaria; usar `metric_snapshots` o `portfolio_summaries`.
- `artist_revenue_summary` como fuente primaria; usar `appointment_economies`, `commissions` y snapshots.
- `user_permissions_direct` salvo excepcion futura; usar roles y role_permissions.
- `loyalty_history`: usar `flow_point_ledger`.
- `promotion_appointments` si `appointments.promotion_id` cubre MVP; solo crear puente si una cita puede tener multiples promociones.

## 9. Riesgos de Arquitectura

### 9.1 Demasiadas tablas antes del MVP

El modelo completo es amplio. Implementarlo completo desde el inicio puede frenar el paso a Supabase.

Mitigacion: separar core MVP de fase posterior y crear solo lo imprescindible para identidad, estudios, artistas, memberships, servicios, agenda, citas, economia minima, loyalty ledger basico y auditoria critica.

### 9.2 Polimorfismo excesivo

Tablas como `audit_events`, `fairness_signals` y `metric_snapshots` usan `entity_type` + `entity_id`. Esto da flexibilidad, pero reduce integridad referencial directa.

Mitigacion: usar FKs directas cuando el caso sea frecuente y reservar polimorfismo para eventos transversales.

### 9.3 Duplicacion de campos derivados

Campos como revenue, spend, visits, rating, occupancy y tier pueden divergir.

Mitigacion: declarar autoridad y tratar campos derivados como snapshots/proyecciones.

### 9.4 Appointment demasiado grande

Si `appointments` absorbe economia, loyalty, no-shows, marketplace y promotions, se vuelve fragil.

Mitigacion: mantener `appointments` como estado de reserva y usar tablas dedicadas para economia, comisiones, ledger, no-show y events.

### 9.5 Membership historica

Si una cita solo referencia artist/studio actuales, se pierde la relacion vigente al momento de reservar.

Mitigacion: guardar `membership_id` en appointment cuando aplique y auditar cambios de membership.

### 9.6 RLS compleja por modelo hibrido

Artistas, owners, managers y clientes tienen scopes distintos sobre la misma cita.

Mitigacion: disenar helpers de acceso por membership/studio antes de escribir politicas.

### 9.7 Storage publico accidental

Assets de cliente, no-show y evidencia no deben hacerse publicos.

Mitigacion: separar buckets publicos y privados conceptualmente desde el inicio.

### 9.8 Ledger loyalty editable

Editar movimientos de puntos rompe auditoria.

Mitigacion: `flow_point_ledger` debe ser append-only; ajustes como movimientos compensatorios.

### 9.9 Marketplace y fairness acoplados demasiado pronto

Ranking, exposicion y fairness requieren madurez de datos.

Mitigacion: MVP con marketplace simple; fairness avanzado como fase posterior, pero dejando eventos basicos listos.

### 9.10 Auditoria incompleta

Sin auditoria temprana, sera dificil explicar comisiones, no-shows, sanciones y puntos.

Mitigacion: crear desde MVP `appointment_status_events`, `flow_point_ledger`, `commissions` y `audit_events`.

## 10. Recomendacion Final

### 10.1 Tablas imprescindibles para MVP

Identidad y acceso:

- `profiles`
- `roles`
- `permissions`
- `role_permissions`
- `user_role_assignments`

Operacion hibrida:

- `studios`
- `studio_profiles`
- `governance_reviews`
- `artists`
- `artist_profiles`
- `artist_studio_memberships`
- `studio_team_members`

Servicios y agenda:

- `service_categories`
- `service_tiers`
- `service_offerings`
- `schedules`
- `schedule_rules`
- `calendar_blocks`
- `appointments`
- `appointment_status_events`

Customer 360 minimo:

- `clients`
- `client_profiles`
- `customer_relationships`
- `favorite_artists`

Marketplace minimo:

- `marketplace_profiles`
- `marketplace_listings`

Economia y loyalty:

- `appointment_economies`
- `commissions`
- `loyalty_accounts`
- `flow_point_ledger`
- `rewards`
- `reward_redemptions`

Impulsa y trust minimo:

- `promotions`
- `risk_flags`
- `audit_events`

### 10.2 Tablas que pueden esperar

- `availability_slots`
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
- `sanctions`
- `no_show_cases`
- `no_show_evidence_files`

### 10.3 Que debe auditarse antes de crear SQL

Antes de escribir SQL o migraciones, revisar y congelar:

- Nombres definitivos de estados de `appointments`.
- Reglas exactas de completion y no-show.
- Si `appointment_economies` se crea al agendar o solo al completar.
- Regla de comision inicial y versionado.
- Alcance de `artist_studio_memberships` para artistas multi-estudio.
- Si `service_offerings` pertenece a artista, estudio o ambos en MVP.
- Alcance real de marketplace MVP: artist profile, studio profile o membership profile.
- Modelo minimo de loyalty: puntos por tier, expiracion y redencion.
- Campos privados vs publicos de client profile.
- Buckets publicos vs privados.
- Helpers conceptuales de RLS por rol, estudio, membership y cliente.
- Eventos minimos que deben entrar a `audit_events`.
- Si no-show y sanctions son MVP o fase posterior.
- Si fairness avanzado espera a tener marketplace events suficientes.

## 11. Cierre Arquitectonico

La arquitectura recomendada mantiene tres principios:

1. `appointments` es el centro operacional, pero no absorbe economia, loyalty, trust ni marketplace.
2. `artist_studio_memberships` es la fuente de verdad del Modelo Hibrido.
3. Los datos derivados viven como snapshots, events o projections, no como entidades paralelas que compitan con la fuente de verdad.

Con esto, Supabase puede avanzar despues hacia SQL y migraciones con una base clara, auditable y preparada para crecer sin duplicar el dominio.

