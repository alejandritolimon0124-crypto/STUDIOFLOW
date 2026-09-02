# MIGRATION MASTER PLAN

## Alcance

Plan maestro de migraciones SQL reales para Supabase.

Fuente de verdad:

- `SQL_MASTER_DESIGN.md`
- `SUPABASE_MIGRATION_PLAN.md`

## Reglas Aplicadas

- Migraciones separadas por milestone.
- Se crean enums, tablas, PK, FK, unique constraints, check constraints e indices minimos.
- No se implementa RLS.
- No se implementan Edge Functions.
- No se implementan triggers.
- No se migran mocks.
- No se insertan seeds en estas migraciones.

## Archivos Generados

1. `supabase/migrations/202606100001_milestone_01_identity_access.sql`
2. `supabase/migrations/202606100002_milestone_02_studios_artists.sql`
3. `supabase/migrations/202606100003_milestone_03_services.sql`
4. `supabase/migrations/202606100004_milestone_04_scheduling.sql`
5. `supabase/migrations/202606100005_milestone_05_appointments.sql`
6. `supabase/migrations/202606100006_milestone_06_economy.sql`
7. `supabase/migrations/202606100007_milestone_07_customer_360.sql`
8. `supabase/migrations/202606100008_milestone_08_marketplace.sql`
9. `supabase/migrations/202606100009_milestone_09_loyalty.sql`
10. `supabase/migrations/202606100010_milestone_10_trust.sql`
11. `supabase/migrations/202606100011_migration_audit_minor_fixes.sql`

## Notas de Orden

- `user_role_assignments` se crea en Milestone 2 porque depende opcionalmente de `studios`.
- `clients` se crea en Milestone 2 como entidad base porque `appointments` depende de ella antes del Milestone 7.
- `promotions` se crea en Milestone 5 antes de `appointments` porque `appointments.promotion_id` requiere FK.
- `appointments.marketplace_listing_id` se crea en Milestone 5 sin FK y la FK se agrega en Milestone 8, cuando existe `marketplace_listings`.
- `availability_slots` entra en Milestone 4 porque `reserved/held` vive ahi, no en `appointments`.
- `202606100011_migration_audit_minor_fixes.sql` aplica correcciones menores detectadas por `MIGRATION_AUDIT.md`: indices para `appointments.marketplace_listing_id`, `appointments.promotion_id` y catalogo cerrado para `audit_events.entity_type`.

## Correcciones Menores Aplicadas

### Indices agregados

- `appointments(marketplace_listing_id)`
- `appointments(promotion_id)`

### Catalogo oficial de `audit_events.entity_type`

Valores permitidos:

- `profile`
- `role`
- `permission`
- `role_permission`
- `user_role_assignment`
- `studio`
- `studio_profile`
- `governance_review`
- `artist`
- `artist_profile`
- `artist_studio_membership`
- `service_category`
- `service_tier`
- `service_offering`
- `schedule`
- `schedule_rule`
- `calendar_block`
- `availability_slot`
- `appointment`
- `appointment_status_event`
- `client`
- `client_profile`
- `customer_relationship`
- `customer_private_note`
- `favorite_artist`
- `marketplace_profile`
- `marketplace_listing`
- `appointment_economy`
- `commission`
- `loyalty_account`
- `flow_point_ledger_entry`
- `reward`
- `reward_redemption`
- `promotion`
- `risk_flag`
- `sanction`
- `no_show_case`
- `audit_event`

## Readiness

Estas migraciones dejan la base estructural lista para una fase posterior de:

- seeds controlados
- migracion de mocks
- validacion de datos
- RLS
- funciones internas
- triggers operativos si se deciden despues
