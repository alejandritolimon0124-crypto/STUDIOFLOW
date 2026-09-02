# SUPABASE MIGRATION PLAN

## 0. Alcance

Este documento define el orden exacto recomendado para crear tablas, relaciones, seeds, enums, indices y constraints en Supabase.

No contiene SQL. No crea migraciones. No modifica codigo.

Fuente de verdad:

- `SQL_MASTER_DESIGN.md`

## 1. Principios de Orden

El orden sigue cuatro reglas:

1. Crear primero tablas sin dependencias.
2. Crear despues tablas con FK hacia las anteriores.
3. Crear ledgers/eventos despues de sus entidades base.
4. Crear indices y constraints complejos despues de validar inserciones base y seeds.

Dependencias criticas:

- Identity precede todo lo que use `profiles`, `roles` o permisos.
- `studios` y `artists` preceden memberships.
- Memberships preceden servicios, agenda, marketplace y citas scoped.
- `clients` precede appointments y loyalty.
- `appointments` precede economy, commissions, no-show y ledger de puntos por cita.
- Economy precede commissions.
- Loyalty accounts precede ledger y redemptions.

## 2. Enums Requeridos

Crear enums antes de las tablas que los usen.

### Identity

- `profile_default_role`: platform_owner, studio_owner, studio_manager, artist, client.
- `profile_status`: active, suspended, archived.
- `role_code`: platform_owner, studio_owner, studio_manager, artist, client.
- `permission_context`: identity, studio, professional_network, services, booking, customer, marketplace, economy, loyalty, marketing, trust, analytics.
- `role_assignment_status`: active, revoked, archived.

### Studio Governance

- `studio_status`: pending, approved, suspended, rejected, archived.
- `risk_score`: low, medium, high, critical.
- `governance_review_type`: onboarding, status_change, risk, appeal.
- `governance_review_status`: open, approved, changes_requested, suspended, rejected, resolved.

### Professional Network

- `artist_status`: active, inactive, archived.
- `membership_role`: artist, lead_artist, guest_artist.
- `membership_status`: active, inactive, archived.

### Services

- `catalog_status`: active, retired.
- `service_tier_code`: basic, medium, premium, vip.
- `service_owner_type`: artist, studio, membership.
- `service_status`: draft, active, suspended, archived.

### Scheduling

- `schedule_owner_type`: artist, membership.
- `schedule_status`: active, inactive, archived.
- `calendar_block_type`: break, training, personal, maintenance, other.
- `calendar_block_status`: active, cancelled, expired.
- `availability_slot_status`: available, held, booked, expired, hidden.
- `appointment_status`: scheduled, completed, cancelled, no_show, disputed.
- `booking_source`: artist, studio, client_portal, marketplace, admin.

### Customer 360

- `client_status`: active, inactive, archived.
- `customer_scope_type`: artist, studio, membership.
- `relationship_type`: appointment, favorite, recurring, imported.
- `relationship_status`: active, inactive, archived.

### Marketplace

- `marketplace_profile_type`: artist, studio, membership.
- `marketplace_visibility_status`: draft, visible, hidden, suspended.
- `marketplace_listing_status`: visible, hidden, expired.

### Economy

- `appointment_economy_status`: quoted, earned, void, disputed, adjusted.
- `commission_status`: potential, chargeable, void, disputed, adjusted.

### Loyalty

- `loyalty_account_status`: active, paused, closed.
- `flow_point_movement_type`: earn, spend, expire, adjust.
- `flow_point_reason`: appointment_completed, reward_redeemed, expiration, manual_adjustment, promotion.
- `reward_scope_type`: platform, studio, artist.
- `reward_type`: discount, service_upgrade, birthday_gift, private_offer.
- `reward_status`: draft, active, paused, retired.
- `reward_redemption_status`: requested, confirmed, applied, cancelled, expired.

### Marketing

- `promotion_scope_type`: artist, studio, membership.
- `promotion_type`: happy_hour, double_points, low_occupancy, private_promo, early_booking.
- `promotion_status`: draft, scheduled, active, paused, completed, expired.

### Trust

- `risk_entity_type`: appointment, studio, artist, client, commission, listing.
- `risk_flag_type`: economy, governance, no_show, fairness, abuse, data_quality.
- `risk_flag_status`: open, under_review, resolved, dismissed.
- `sanction_subject_type`: client, artist, studio, profile.
- `sanction_type`: warning, booking_limit, visibility_limit, suspension, manual_review.
- `sanction_status`: active, lifted, expired, appealed.
- `no_show_case_status`: open, accepted, disputed, resolved, dismissed.
- `audit_context`: identity, studio, booking, economy, loyalty, marketplace, trust, marketing.

## 3. Dependencias Entre Tablas

### Sin dependencias internas

- `profiles`
- `roles`
- `permissions`
- `service_categories`
- `service_tiers`

### Dependen de Identity

- `role_permissions` depende de `roles`, `permissions`.
- `studios` depende de `profiles`.
- `artists` depende de `profiles`.
- `clients` depende de `profiles`.

### Dependen de Studios / Artists

- `studio_profiles` depende de `studios`.
- `governance_reviews` depende de `studios`, `profiles`.
- `artist_profiles` depende de `artists`.
- `artist_studio_memberships` depende de `artists`, `studios`.
- `user_role_assignments` depende de `profiles`, `roles`, opcionalmente `studios`.

### Dependen de Service Catalog + Professional Network

- `service_offerings` depende de `service_categories`, `service_tiers`, y uno de `artists`, `studios`, `artist_studio_memberships`.

### Dependen de Scheduling Base

- `schedules` depende de `artists` o `artist_studio_memberships`.
- `schedule_rules` depende de `schedules`.
- `calendar_blocks` depende de `schedules`.
- `availability_slots` depende de `schedules`, opcionalmente `artists`, `studios`, `artist_studio_memberships`, `profiles`.

### Dependen de Customer + Booking

- `client_profiles` depende de `clients`.
- `customer_private_notes` depende de `clients`, y scope artist/studio/membership.
- `customer_relationships` depende de `clients`, y scope artist/studio/membership.
- `favorite_artists` depende de `clients`, `artists`.

### Dependen de Marketplace

- `marketplace_profiles` depende de artist/studio/membership.
- `marketplace_listings` depende de `marketplace_profiles` y opcionalmente artist/studio/membership.

### Dependen de Appointments

- `appointments` depende de `clients`, `artists`, opcionalmente `studios`, `artist_studio_memberships`, `service_offerings`, `availability_slots`, `marketplace_listings`, `promotions`, `profiles`.
- `appointment_status_events` depende de `appointments`, `profiles`.

### Dependen de Economy

- `appointment_economies` depende de `appointments`.
- `commissions` depende de `appointments`, `appointment_economies`.

### Dependen de Loyalty

- `loyalty_accounts` depende de `clients`.
- `rewards` depende opcionalmente de `studios` o `artists`.
- `reward_redemptions` depende de `loyalty_accounts`, `rewards`, opcionalmente `appointments`.
- `flow_point_ledger` depende de `loyalty_accounts`, opcionalmente `appointments`, `reward_redemptions`.

### Dependen de Trust

- `risk_flags` depende opcionalmente de `appointments`, `studios`, `artists`, `clients`.
- `sanctions` depende opcionalmente de `profiles` como actor creador.
- `no_show_cases` depende de `appointments`, opcionalmente `profiles`.
- `audit_events` depende opcionalmente de `profiles`, `studios`, `artists`, `artist_studio_memberships`, `clients`, `appointments`.

## 4. Orden Exacto de Creacion

### Paso 0: Enums

Crear todos los enums MVP antes de tablas.

Orden interno recomendado:

1. Identity enums.
2. Studio enums.
3. Professional Network enums.
4. Service enums.
5. Scheduling enums.
6. Customer enums.
7. Marketplace enums.
8. Economy enums.
9. Loyalty enums.
10. Marketing enums.
11. Trust enums.

### Paso 1: Identity base

1. `profiles`
2. `roles`
3. `permissions`
4. `role_permissions`

Estas tablas pueden crearse primero.

### Paso 2: Studio + Artist base

5. `studios`
6. `artists`
7. `clients`
8. `studio_profiles`
9. `governance_reviews`
10. `artist_profiles`
11. `artist_studio_memberships`
12. `user_role_assignments`

Nota: `user_role_assignments` se crea aqui, no en Paso 1, porque puede referenciar `studios`.

### Paso 3: Service Catalog

13. `service_categories`
14. `service_tiers`
15. `service_offerings`

Nota: `service_categories` y `service_tiers` pueden crearse antes, pero se listan aqui por fase funcional.

### Paso 4: Scheduling

16. `schedules`
17. `schedule_rules`
18. `calendar_blocks`
19. `availability_slots`

### Paso 5: Customer 360

20. `client_profiles`
21. `customer_relationships`
22. `customer_private_notes`
23. `favorite_artists`

### Paso 6: Marketplace

24. `marketplace_profiles`
25. `marketplace_listings`

### Paso 7: Marketing minimo

26. `promotions`

Nota: `promotions` debe existir antes de `appointments` si `appointments.promotion_id` se mantiene como FK.

### Paso 8: Appointments

27. `appointments`
28. `appointment_status_events`

### Paso 9: Economy

29. `appointment_economies`
30. `commissions`

### Paso 10: Loyalty

31. `loyalty_accounts`
32. `rewards`
33. `reward_redemptions`
34. `flow_point_ledger`

### Paso 11: Trust

35. `risk_flags`
36. `sanctions`
37. `no_show_cases`
38. `audit_events`

## 5. Fases de Implementacion

### Fase A: Identity & Access

Crear:

- `profiles`
- `roles`
- `permissions`
- `role_permissions`

Crear despues dentro de Fase B:

- `user_role_assignments`, porque depende opcionalmente de `studios`.

Seeds requeridos:

- roles del sistema.
- permisos del sistema.
- role_permissions.
- profile platform owner inicial, si aplica.

Bloquea:

- governance.
- ownership.
- RLS futura.

### Fase B: Studios + Artists

Crear:

- `studios`
- `artists`
- `clients`
- `studio_profiles`
- `governance_reviews`
- `artist_profiles`
- `artist_studio_memberships`
- `user_role_assignments`

Seeds requeridos:

- estudio demo si se migran mocks.
- profiles demo para platform owner, studio owner, artist, client.
- artista demo.
- cliente demo.
- membership demo.
- role assignments demo.

Bloquea:

- services.
- scheduling.
- marketplace.
- appointments.

### Fase C: Services

Crear:

- `service_categories`
- `service_tiers`
- `service_offerings`

Seeds requeridos:

- categorias de servicio.
- tiers: basic, medium, premium, vip.
- servicios mock por owner correcto.

Bloquea:

- appointments.
- appointment economy.
- loyalty por service tier.

### Fase D: Scheduling

Crear:

- `schedules`
- `schedule_rules`
- `calendar_blocks`
- `availability_slots`

Seeds requeridos:

- schedule base para artista independiente o membership.
- reglas semanales.
- slots mock si se migran reservas marketplace.

Bloquea:

- appointment booking con hold.
- marketplace con disponibilidad.

### Fase E: Appointments

Crear:

- `appointments`
- `appointment_status_events`

Requiere antes:

- clients.
- artists.
- memberships cuando aplique.
- service_offerings.
- availability_slots si se usa.
- marketplace_listings si booking viene marketplace.
- promotions si se usa `promotion_id`.

Seeds/migracion mock:

- citas scheduled/completed/cancelled/no_show/disputed.
- eventos iniciales de status.

Bloquea:

- economy.
- commissions.
- loyalty ledger por completed.
- no-show cases.

### Fase F: Economy

Crear:

- `appointment_economies`
- `commissions`

Requiere antes:

- appointments.

Seeds/migracion mock:

- economy quoted para citas scheduled.
- economy earned para citas completed.
- commission potential para scheduled.
- commission chargeable para completed.
- rate 0.10.

Bloquea:

- revenue reporting.
- commission audit.
- trust economy flags.

### Fase G: Customer 360

Crear:

- `client_profiles`
- `customer_relationships`
- `customer_private_notes`
- `favorite_artists`

Requiere antes:

- clients.
- artists/studios/memberships para scopes.

Seeds/migracion mock:

- perfiles de cliente.
- favoritos.
- relationships derivadas de citas.
- notas internas scoped, nunca en `client_profiles`.

Puede ejecutarse antes de appointments parcialmente, pero relationships reales se completan mejor despues de migrar appointments.

### Fase H: Marketplace

Crear:

- `marketplace_profiles`
- `marketplace_listings`

Requiere antes:

- artists.
- studios.
- memberships.

Seeds/migracion mock:

- perfiles marketplace visibles para artista/studio/membership.
- listings visibles basicos.

Debe existir antes de appointments solo si se migran citas con `marketplace_listing_id`.

### Fase I: Loyalty

Crear:

- `loyalty_accounts`
- `rewards`
- `reward_redemptions`
- `flow_point_ledger`

Requiere antes:

- clients.
- appointments para ledger por cita.
- rewards para redemptions.

Seeds/migracion mock:

- loyalty account por cliente.
- rewards MVP.
- ledger derivado de citas completed.
- redemptions si existen en mocks.

### Fase J: Trust

Crear:

- `risk_flags`
- `sanctions`
- `no_show_cases`
- `audit_events`

Requiere antes:

- appointments.
- profiles.
- artists/studios/clients segun flags.

Seeds/migracion mock:

- no_show_cases desde appointments no_show.
- risk_flags demo si existen.
- audit_events iniciales de migracion.

Debe cerrarse antes de activar RLS estricta.

## 6. Tablas que Pueden Crearse Primero

Sin esperar datos externos:

- `profiles`
- `roles`
- `permissions`
- `service_categories`
- `service_tiers`

Con enums ya creados:

- `role_permissions` despues de roles/permissions.
- `studios` despues de profiles.
- `artists` despues de profiles.
- `clients` despues de profiles.

## 7. Tablas que Dependen de Otras

Dependencia directa obligatoria:

- `role_permissions` -> `roles`, `permissions`.
- `studios` -> `profiles`.
- `studio_profiles` -> `studios`.
- `governance_reviews` -> `studios`.
- `artists` -> `profiles`.
- `artist_profiles` -> `artists`.
- `artist_studio_memberships` -> `artists`, `studios`.
- `user_role_assignments` -> `profiles`, `roles`, opcional `studios`.
- `service_offerings` -> categories/tiers + owner.
- `schedules` -> artist o membership.
- `schedule_rules` -> schedules.
- `calendar_blocks` -> schedules.
- `availability_slots` -> schedules.
- `client_profiles` -> clients.
- `customer_relationships` -> clients + scope.
- `customer_private_notes` -> clients + scope.
- `favorite_artists` -> clients, artists.
- `marketplace_profiles` -> artist/studio/membership.
- `marketplace_listings` -> marketplace_profiles.
- `promotions` -> scope.
- `appointments` -> clients, artists, service_offerings.
- `appointment_status_events` -> appointments.
- `appointment_economies` -> appointments.
- `commissions` -> appointments, appointment_economies.
- `loyalty_accounts` -> clients.
- `reward_redemptions` -> loyalty_accounts, rewards.
- `flow_point_ledger` -> loyalty_accounts.
- `no_show_cases` -> appointments.

## 8. Tablas que Requieren Seed

Seeds obligatorios:

- `roles`
- `permissions`
- `role_permissions`
- `service_categories`
- `service_tiers`
- `rewards` si loyalty MVP se muestra desde el inicio.

Seeds recomendados:

- `profiles` demo.
- `studios` demo.
- `artists` demo.
- `clients` demo.
- `artist_studio_memberships` demo.
- `user_role_assignments` demo.
- `studio_profiles`.
- `artist_profiles`.
- `service_offerings`.
- `schedules`.
- `schedule_rules`.
- `marketplace_profiles`.
- `marketplace_listings`.

Seeds derivados al migrar mocks:

- `appointments`.
- `appointment_status_events`.
- `appointment_economies`.
- `commissions`.
- `loyalty_accounts`.
- `flow_point_ledger`.
- `customer_relationships`.
- `favorite_artists`.

## 9. Indices que Pueden Esperar

Crear en MVP inicial:

- indices de PK/FK.
- `profiles(email)`.
- `user_role_assignments(profile_id, studio_id, status)`.
- `artist_studio_memberships(studio_id, status)`.
- `artist_studio_memberships(artist_id, status)`.
- `appointments(artist_id, starts_at)`.
- `appointments(membership_id, starts_at)`.
- `appointments(studio_id, starts_at)`.
- `appointments(client_id, starts_at)`.
- `loyalty_accounts(client_id)`.
- `flow_point_ledger(loyalty_account_id, occurred_at)`.

Pueden esperar hasta performance real:

- `marketplace_listings(visibility_status, city)`.
- `audit_events(context, occurred_at)`.
- `audit_events(entity_type, entity_id)`.
- `risk_flags(status, severity)`.
- `sanctions(subject_type, subject_id)`.
- `commissions(status, created_at)`.
- `appointment_economies(calculation_status, created_at)`.
- `calendar_blocks(schedule_id, starts_at, ends_at)`.
- `availability_slots(held_until)`.

## 10. Constraints que Pueden Esperar

No deben esperar:

- PK.
- FK basicas.
- unique de catalogos (`roles.code`, `permissions.code`, `service_categories.slug`, `service_tiers.code`).
- checks de estados enum.
- checks de owner exclusivo en `service_offerings`, `schedules`, `promotions`, `marketplace_profiles`, `customer_private_notes`, `customer_relationships`.
- checks de appointment status congelado.
- check `commissions.rate = 0.10` en MVP.
- check `points != 0` en ledger.

Pueden esperar si complican la primera carga mock:

- unique parcial de "activos" en `favorite_artists`.
- unique parcial de memberships activas.
- unique parcial de service offerings activos.
- checks condicionales de `resolved_at`.
- checks condicionales de `completed_at` y `cancelled_at`.
- checks de consistencia profunda membership/artist/studio.
- proteccion append-only a nivel trigger/policy.

Nota: si se posponen constraints condicionales, deben auditarse antes de abrir escritura real a usuarios.

## 11. Tablas que Deben Poblarse Antes de Migrar Mocks

Antes de migrar mocks operativos:

1. `roles`
2. `permissions`
3. `role_permissions`
4. `profiles`
5. `studios`
6. `artists`
7. `clients`
8. `studio_profiles`
9. `artist_profiles`
10. `artist_studio_memberships`
11. `user_role_assignments`
12. `service_categories`
13. `service_tiers`
14. `service_offerings`
15. `schedules`
16. `schedule_rules`

Antes de migrar appointments:

17. `availability_slots`, si hay slots/holds.
18. `marketplace_profiles`, si se conserva origen marketplace.
19. `marketplace_listings`, si se conserva origen marketplace.
20. `promotions`, si alguna cita tiene promotion.

Despues de migrar appointments:

21. `appointment_status_events`
22. `appointment_economies`
23. `commissions`
24. `loyalty_accounts`
25. `flow_point_ledger`
26. `customer_relationships`
27. `favorite_artists`
28. `risk_flags`
29. `no_show_cases`
30. `audit_events`

## 12. Roadmap de Implementacion

### Milestone 1: Base del sistema

Objetivo:

- Identity lista.
- Seeds de roles/permisos.
- Profiles demo.

Incluye:

- Fase A.

Criterio de salida:

- existe platform owner.
- roles y permisos estan poblados.

### Milestone 2: Modelo hibrido

Objetivo:

- Studios, artists y memberships funcionando.

Incluye:

- Fase B.

Criterio de salida:

- existe al menos un estudio.
- existe al menos una artista.
- existe membership activa artista-estudio.
- existen role assignments por estudio.

### Milestone 3: Servicios y agenda

Objetivo:

- Servicios con owner unico.
- Agenda base.
- Slots/holds listos.

Incluye:

- Fase C.
- Fase D.

Criterio de salida:

- service_offerings sin owner ambiguo.
- schedules y rules creados.
- availability_slots disponibles si se usan holds.

### Milestone 4: Reservas

Objetivo:

- Appointments reales con estados congelados.

Incluye:

- Fase E.

Criterio de salida:

- citas migradas.
- status events iniciales creados.
- no existen `confirmed` ni `reserved` en appointments.

### Milestone 5: Economia

Objetivo:

- Economy y commissions nacen desde appointments.

Incluye:

- Fase F.

Criterio de salida:

- cada appointment tiene `appointment_economy`.
- cada appointment tiene `commission`.
- scheduled -> quoted/potential.
- completed -> earned/chargeable.
- rate 0.10.

### Milestone 6: Customer + Loyalty

Objetivo:

- Customer 360 minimo.
- Loyalty ledger inicial.

Incluye:

- Fase G.
- Fase I.

Criterio de salida:

- clients tienen client_profiles.
- notas internas viven en customer_private_notes.
- loyalty_accounts creadas.
- flow_point_ledger refleja citas completed.

### Milestone 7: Marketplace

Objetivo:

- Perfiles/listings visibles basicos.

Incluye:

- Fase H.

Criterio de salida:

- marketplace_profiles visibles para owners aprobados.
- marketplace_listings basicos sin ranking persistido.

### Milestone 8: Trust

Objetivo:

- No-shows, sanctions, risk y audit basicos.

Incluye:

- Fase J.

Criterio de salida:

- no_show_cases creados para citas no_show.
- risk_flags/sanctions si aplican.
- audit_events para acciones criticas.

### Milestone 9: Preparacion RLS

Objetivo:

- Validar scopes antes de escribir policies.

Incluye:

- Revision de indices RLS.
- Validacion de owner_type/scope_type.
- Validacion de memberships.

Criterio de salida:

- cliente resuelve por client_id.
- artista independiente resuelve por artist_id.
- artista en estudio resuelve por membership_id.
- owner/manager resuelve por studio_id + memberships.
- platform owner resuelve global.

## 13. Riesgos del Plan

### Ciclos por referencias opcionales

`appointments` puede referenciar `marketplace_listings` y `promotions`. Por eso marketplace/promotions deben crearse antes de appointments si esas FK se mantienen.

### Datos mock incompletos

Los mocks actuales pueden no tener todos los ids finales. La migracion mock debe mapear legacy strings a UUIDs estables.

### Constraints condicionales

Owner exclusivo y scope exclusivo son esenciales. Si se posponen, la carga inicial puede meter datos ambiguos.

### Economy y commission automaticas

El plan exige que toda cita tenga economy y commission. La migracion de datos debe crear ambas inmediatamente despues de appointments.

### Loyalty derivado

No migrar saldos sin ledger. Si hay saldo mock, debe convertirse en movimientos ledger explicables o marcarse como ajuste inicial.

## 14. Readiness

Estado: LISTO PARA ESCRIBIR MIGRACIONES DESPUES DE ESTE PLAN.

Condiciones:

- no escribir SQL sin respetar el orden de dependencias.
- no migrar appointments antes de services, clients, artists y memberships.
- no migrar economy antes de appointments.
- no migrar loyalty balance sin ledger.
- no activar RLS estricta hasta tener role assignments, memberships y scopes validados.

