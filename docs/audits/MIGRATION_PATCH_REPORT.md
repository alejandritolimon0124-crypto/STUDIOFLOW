# MIGRATION PATCH REPORT

## Alcance

Correcciones menores aplicadas a partir de `MIGRATION_AUDIT.md`.

No se redisenó el modelo. No se crearon tablas nuevas. No se cambio el dominio.

## Migracion Agregada

- `supabase/migrations/202606100011_migration_audit_minor_fixes.sql`

## Cambios Implementados

### 1. Indice para origen Marketplace

Se agrego:

- `appointments(marketplace_listing_id)`

Motivo:

- La FK se agrega en Milestone 8, pero faltaba indice para consultas por origen marketplace.

### 2. Indice para promociones

Se agrego:

- `appointments(promotion_id)`

Motivo:

- Mejora reportes y filtros de citas vinculadas a promociones.

### 3. Catalogo oficial para `audit_events.entity_type`

Se agrego un check constraint para congelar los valores permitidos de `audit_events.entity_type`.

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

## Plan Maestro Actualizado

`MIGRATION_MASTER_PLAN.md` fue actualizado para incluir:

- la migracion adicional
- los dos indices agregados
- el catalogo oficial de `audit_events.entity_type`

## Fuera de Alcance

No se implemento:

- RLS
- triggers
- Edge Functions
- seeds
- migracion de mocks
- nuevas tablas
- rediseño de memberships
- validaciones profundas appointment/service/membership

## Estado

Las correcciones menores detectadas en auditoria quedaron aplicadas.

