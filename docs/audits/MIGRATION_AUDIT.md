# MIGRATION AUDIT

## 0. Alcance

Auditoria critica de las 10 migraciones SQL generadas en `supabase/migrations/`.

No se modifica codigo. No se crean nuevas tablas. No se crean nuevas migraciones.

Fuentes de validacion:

- `ARCHITECTURE_FREEZE.md`
- `SQL_MASTER_DESIGN.md`
- `SUPABASE_MIGRATION_PLAN.md`
- `MIGRATION_MASTER_PLAN.md`
- `supabase/migrations/*.sql`

## 1. Veredicto

Estado: REQUIERE AJUSTES MENORES.

Las migraciones estan razonablemente alineadas con el freeze y el plan maestro. No se detectan dependencias circulares bloqueantes ni FKs hacia tablas futuras que rompan el orden de ejecucion.

Sin embargo, antes de ejecutarlas en Supabase conviene corregir o aceptar explicitamente algunos riesgos:

- algunas reglas de integridad multi-studio quedan demasiado debiles
- hay constraints condicionales que pueden bloquear cargas mock si no se prepara bien la data
- falta indice para `appointments.marketplace_listing_id`
- `audit_events` usa `entity_type text`, no enum
- no hay proteccion real append-only para ledgers porque no se permiten triggers/RLS todavia
- `appointment_economies` y `commissions` 1:1 estan bien para MVP, pero limitan ajustes historicos complejos

## 2. Orden de Creacion

Resultado: correcto.

Orden observado:

1. Identity & Access
2. Studios + Artists + Clients base
3. Services
4. Scheduling
5. Appointments + Promotions
6. Economy
7. Customer 360
8. Marketplace
9. Loyalty
10. Trust

El orden respeta las dependencias principales:

- `profiles`, `roles`, `permissions` antes de assignments.
- `studios`, `artists`, `clients` antes de citas.
- `artist_studio_memberships` antes de services/schedules scoped por membership.
- `service_offerings` antes de `appointments`.
- `availability_slots` antes de `appointments`.
- `appointments` antes de economy, loyalty ledger y trust.
- `marketplace_listings` se crea despues y luego se agrega FK a `appointments`.

Riesgo menor:

- `clients` vive en Milestone 2 por dependencia de appointments, aunque conceptualmente Customer 360 es Milestone 7. Esto respeta el plan, pero debe quedar claro para el equipo.

## 3. Dependencias Circulares

Resultado: no se detectan ciclos bloqueantes.

Casos revisados:

- `appointments` depende de `promotions`; `promotions` no depende de `appointments`.
- `appointment_economies` depende de `appointments`; `commissions` depende de ambos.
- `reward_redemptions` depende de `loyalty_accounts` y `rewards`; `flow_point_ledger` puede referenciar `reward_redemptions`.
- `marketplace_listings` depende de `marketplace_profiles`; luego se agrega FK desde `appointments`.

Sin ciclo circular.

## 4. FK Invalidas

Resultado: no se detectan FKs a tablas inexistentes en el momento de creacion, con una excepcion manejada correctamente.

Caso especial:

- `appointments.marketplace_listing_id` se crea como columna sin FK en Milestone 5.
- La FK se agrega en Milestone 8 cuando ya existe `marketplace_listings`.

Esto es correcto.

Riesgo menor:

- La columna queda sin indice propio. Si se consulta por origen marketplace, se recomienda agregar indice antes de uso real.

## 5. FKs que Referencian Tablas Futuras

Resultado: no hay FKs activas hacia tablas futuras.

La unica referencia futura intencional es `appointments.marketplace_listing_id`, pero no se declara como FK hasta Milestone 8.

## 6. Enums Duplicados

Resultado: no se detectan enums duplicados con el mismo nombre.

Observacion:

- Aparece el valor `confirmed` en `reward_redemption_status`, no en `appointment_status`.
- Esto no viola el freeze, porque la prohibicion de `confirmed` aplica a `appointments`.

Validacion de freeze:

- `appointment_status` contiene solo `scheduled`, `completed`, `cancelled`, `no_show`, `disputed`.
- No existe `reserved` en `appointment_status`.

## 7. Check Constraints Conflictivos

Resultado: no hay conflicto fatal, pero hay checks que pueden bloquear cargas si los datos mock no se normalizan.

Checks sensibles:

- `governance_reviews_resolved_at_check`: exige `resolved_at` para estados finales.
- `artist_studio_memberships_archived_ended_check`: exige `ended_at` si status archived.
- `schedule_rules_work_hours_check`: exige start/end si `is_active = true`.
- `availability_slots_held_until_check`: exige `held_until` si status held.
- `appointments_completed_at_check`: exige `completed_at` si status completed.
- `appointments_cancelled_at_check`: exige `cancelled_at` si status cancelled.
- `appointment_economies_earned_at_check`: exige `earned_at` si status earned.
- `commissions_chargeable_at_check`: exige `chargeable_at` si status chargeable.
- `risk_flags_resolved_at_check`, `no_show_cases_resolved_at_check`, `sanctions_lifted_at_check`: exigen timestamps para estados finales.

Riesgo:

- Si se migra mock data sin timestamps historicos, fallara.

Recomendacion:

- Antes de migrar mocks, generar timestamps consistentes o cargar estados no finales.

## 8. Unique Constraints Conflictivas

Resultado: no hay conflicto fatal, pero hay riesgos operativos.

Riesgos:

- `profiles.email` unique puede bloquear perfiles duplicados si cliente y artista usan el mismo email en flujos separados.
- `artists.profile_id` unique y `clients.profile_id` unique permiten que un mismo profile sea artista y cliente simultaneamente, porque la unicidad esta por tabla. Esto parece aceptable.
- `artist_studio_memberships_active_unique` permite una sola membership active por artista-estudio, correcto.
- `service_offerings_active_*_name_unique` impide dos servicios activos con mismo nombre para el mismo owner, correcto para MVP.
- `appointments_availability_slot_unique` permite solo una cita por slot, correcto.
- `no_show_cases_active_appointment_unique` permite solo un caso activo por appointment, correcto.

Riesgo menor:

- `flow_point_ledger_idempotency_key_unique` permite multiples `NULL`, correcto en Postgres. Pero si no se genera idempotency key para eventos criticos, no protege de duplicados.

## 9. Indices Faltantes

Faltantes recomendados antes de produccion:

- `appointments(marketplace_listing_id)`: falta despues de agregar FK en Milestone 8.
- `appointments(promotion_id)`: util para reporting de promociones.
- `availability_slots(studio_id, starts_at, status)`: existe artist/membership, falta studio.
- `promotions(created_by_profile_id)`: util para auditoria/ownership.
- `governance_reviews(reviewed_by_profile_id)`: util para auditoria.
- `appointment_status_events(changed_by_profile_id)`: util para auditoria.
- `reward_redemptions(redeemed_at)`: util para reportes de loyalty.
- `sanctions(created_by_profile_id)`: util para auditoria.

No todos son bloqueantes para MVP, pero `appointments(marketplace_listing_id)` y `appointments(promotion_id)` son los mas obvios.

## 10. Indices Innecesarios o Prematuros

Posiblemente prematuros:

- `service_categories_status_idx`: catalogo pequeno.
- `service_categories_sort_order_idx`: catalogo pequeno.
- `service_tiers_status_idx`: catalogo pequeno.
- `artists_status_idx`: util solo si hay muchos artistas.
- `clients_status_idx`: util solo cuando haya volumen.
- `studio_profiles_city_idx`: util para marketplace, pero marketplace usa listings.

No son peligrosos, solo agregan costo minimo de escritura.

## 11. Riesgos para RLS Futura

Riesgo principal: muchas tablas usan scope polimorfico controlado por checks.

Tablas sensibles:

- `service_offerings`
- `schedules`
- `promotions`
- `customer_private_notes`
- `customer_relationships`
- `marketplace_profiles`
- `rewards`

Riesgo:

- RLS debera replicar logica de `owner_type`/`scope_type`.
- Si RLS se basa en `artist_id` sin considerar `membership_id`, una artista multi-studio podria ver datos del estudio incorrecto.

Recomendacion:

- Antes de RLS, crear helpers o views de acceso por:
  - `client_id`
  - `artist_id`
  - `membership_id`
  - `studio_id`
  - platform role

## 12. Riesgos para Artista Independiente

Lo bueno:

- `service_offerings.owner_type = artist` soporta artista independiente.
- `schedules.owner_type = artist` soporta agenda independiente.
- `promotions.scope_type = artist` soporta promos independientes.
- `marketplace_profiles.profile_type = artist` soporta publicacion independiente.

Riesgos:

- `appointments` siempre exige `artist_id`, correcto, pero no valida que `service_offering_id` pertenezca a esa artista cuando el servicio es owner artist.
- `availability_slots` permite `artist_id` nullable. Para slots independientes deberia estar presente.

Impacto:

- Una cita podria referenciar una artista y un servicio de otra artista si la app se equivoca.

## 13. Riesgos para Memberships

Riesgo fuerte:

- `appointments` solo valida que si hay `membership_id`, tambien haya `studio_id`.
- No valida que:
  - `appointments.artist_id` coincida con `artist_studio_memberships.artist_id`.
  - `appointments.studio_id` coincida con `artist_studio_memberships.studio_id`.
  - `service_offering_id` pertenezca a esa membership cuando owner_type = membership.
  - `availability_slot_id` pertenezca a esa membership.

Esto no rompe la ejecucion, pero es el mayor riesgo de integridad multi-studio.

Recomendacion:

- Para MVP se puede controlar desde app/service role.
- Antes de RLS estricta o datos reales multi-studio, conviene reforzar con constraints compuestas, validaciones de aplicacion o funciones internas.

## 14. Riesgos para Cliente Global

Lo bueno:

- `client_profiles` no contiene `notes`.
- `customer_private_notes` separa notas internas por scope.
- `favorite_artists` separa favoritos.

Riesgos:

- `clients.email` y `profiles.email` pueden divergir.
- No hay constraint para impedir que dos `clients` sin profile compartan email/phone.
- `customer_relationships` permite relationships por artist/studio/membership, pero no deriva automaticamente desde appointments.

Impacto:

- Puede haber duplicados de cliente si no se controla desde onboarding/migracion.

## 15. Riesgos para Marketplace

Lo bueno:

- `marketplace_profiles` exige target exclusivo.
- `marketplace_listings` existe antes de agregar FK a appointments.
- No se persistieron `ranking_score`, `availability_score`, `occupancy_score`.

Riesgos:

- `marketplace_listings` no tiene check que obligue a que artist/studio/membership coincidan con `marketplace_profile_id`.
- `appointments.marketplace_listing_id` no tiene indice.
- No hay constraint que impida listing visible para estudio suspended.

Impacto:

- Marketplace visibility dependera de aplicacion hasta que haya RLS/validaciones adicionales.

## 16. Riesgos para Loyalty Ledger

Lo bueno:

- `flow_point_ledger` es tabla separada.
- Tiene `idempotency_key`.
- Tiene check de direccion de puntos.
- No hay `vip_tier_id` MVP.

Riesgos:

- No hay proteccion tecnica append-only sin triggers/RLS.
- No hay constraint que exija `appointment_id` cuando `reason = appointment_completed`.
- No hay constraint que exija `reward_redemption_id` cuando `reason = reward_redeemed`.
- `movement_type = adjust` permite puntos positivos o negativos, correcto, pero requiere auditoria externa.
- `loyalty_accounts.points_balance` puede divergir del ledger si no hay proceso controlado.

Impacto:

- Correcto para estructura, no suficiente para operacion sin funciones/policies posteriores.

## 17. Riesgos para Commissions

Lo bueno:

- `rate = 0.10` esta congelado.
- `amount` y `rate` son snapshot.
- `commissions` nace separada de economy.
- `commission_status` respeta freeze.

Riesgos:

- `amount` no se valida contra `appointment_economies.gross_amount * 0.10`.
- `commission.status = chargeable` exige `chargeable_at`, correcto, pero no valida que appointment este completed.
- 1:1 con appointment limita refunds parciales o multiples ajustes futuros.

Impacto:

- Para MVP esta bien; para pagos reales se necesitara ledger/eventos de comision o revenue splits.

## 18. Riesgos para `audit_events`

Lo bueno:

- Incluye scopes directos: `studio_id`, `artist_id`, `membership_id`, `client_id`, `appointment_id`.
- Tiene indices por contexto, entidad y scopes.

Riesgos:

- `entity_type` es `text`, no enum. Esto diverge parcialmente de `SQL_MASTER_DESIGN.md`, que sugeria enum conceptual.
- No hay check que garantice que `entity_id` corresponde al scope.
- Puede crecer muy rapido y no tiene estrategia de particion/retencion.
- No hay proteccion append-only todavia.

Impacto:

- No bloquea ejecucion, pero requiere disciplina de escritura y convenciones claras.

## 19. Riesgos de Escalabilidad

Tablas que creceran mas:

- `appointments`
- `appointment_status_events`
- `flow_point_ledger`
- `audit_events`
- `availability_slots`

Riesgos:

- `availability_slots` puede explotar si se materializan demasiados slots futuros.
- `audit_events` puede crecer mas rapido que transaccionales si se audita todo.
- `flow_point_ledger` crecera con cada earn/spend/expire/adjust.

Recomendacion:

- Definir ventanas de generacion de slots.
- Definir retencion/archivo de audit events antes de alto volumen.
- Mantener consultas de saldo loyalty sobre `loyalty_accounts`, no sumando ledger en tiempo real.

## 20. Riesgos de Performance

Riesgos inmediatos:

- Falta indice en `appointments.marketplace_listing_id`.
- Falta indice en `appointments.promotion_id`.
- Query de marketplace por city/status esta cubierta, pero filtros por membership + status tambien podrian necesitar composite.
- Consultas RLS sobre memberships dependeran de indices existentes, que estan bien cubiertos.

Riesgos futuros:

- Dashboard studio no debe calcular revenue desde `appointment_economies` en ventanas grandes sin snapshots.
- Customer 360 no debe unir appointments + ledger + notes + relationships sin limites.
- Audit search por metadata JSON no esta indexado; correcto para MVP.

## 21. Validacion contra Architecture Freeze

Resultado: cumple en lo esencial.

Cumple:

- `appointments` no tiene `confirmed`.
- `appointments` no tiene `reserved`.
- `availability_slots` maneja `held`.
- `appointment_economies` usa `quoted`, `earned`, `void`, `disputed`, `adjusted`.
- `commissions` usa `potential`, `chargeable`, `void`, `disputed`, `adjusted`.
- `commissions.rate = 0.10`.
- `service_offerings` tiene owner unico.
- Trust MVP usa `risk_flags`, `sanctions`, `no_show_cases`, `audit_events`.
- No existe `trust_scores`.

Observacion:

- `reward_redemption_status` incluye `confirmed`. Esto no contradice el freeze porque la prohibicion aplica a `appointments`.

## 22. Validacion contra SQL Master Design

Resultado: mayormente cumple.

Divergencias:

- `audit_events.entity_type` es `text`, no enum.
- `user_role_assignments` no implementa check real de roles globales vs roles scoped, porque eso requeriria mirar `roles.code`.
- No hay indice para `appointments.marketplace_listing_id`.
- No hay indice para `appointments.promotion_id`.
- No se implementa consistencia profunda entre appointment, membership, service offering y availability slot.

Estas divergencias son menores para ejecucion, pero relevantes para integridad.

## 23. Validacion contra Migration Plan

Resultado: cumple.

Cumple:

- 10 migraciones separadas por milestone.
- Enums antes de tablas que los usan.
- `marketplace_listing_id` diferido hasta Milestone 8 para FK.
- Sin RLS.
- Sin triggers.
- Sin Edge Functions.
- Sin seeds.
- Sin mocks.

## 24. Hallazgos Prioritarios

### Alta prioridad antes de ejecutar

No se detecta un bloqueo fatal de ejecucion.

### Alta prioridad antes de datos reales

- Reforzar consistencia appointment <-> membership <-> service_offering <-> availability_slot.
- Agregar indice `appointments.marketplace_listing_id`.
- Agregar indice `appointments.promotion_id`.
- Definir convencion cerrada para `audit_events.entity_type`.

### Media prioridad

- Decidir si `profiles.email` unique sera suficiente para todos los roles.
- Definir estrategia de duplicados en `clients.email` y `clients.phone`.
- Definir proceso append-only para ledger/audit/status events.

## 25. Recomendaciones

Antes de ejecutar en Supabase:

- Aceptar explicitamente que la integridad profunda multi-studio se controlara en app/service role por ahora.
- Agregar indices faltantes si se quiere evitar una segunda migracion temprana.
- Confirmar que la data mock tendra timestamps requeridos por checks condicionales.

Antes de activar RLS:

- Crear helpers de scope.
- Validar memberships activas.
- Validar que no existan appointments con membership/artist/studio inconsistentes.
- Validar que no existan service offerings con owner incorrecto.

Antes de migrar mocks:

- Normalizar estados.
- Generar `completed_at`, `cancelled_at`, `earned_at`, `chargeable_at`, `resolved_at` cuando aplique.
- Generar `idempotency_key` para ledger.

## 26. Veredicto Final

REQUIERE AJUSTES MENORES.

No parece requerir correccion critica para ejecutar estructura en una base limpia. El orden y las FKs estan bien resueltos.

Pero no lo marcaria como `LISTO PARA EJECUTAR` todavia porque faltan dos indices obvios y hay riesgos de integridad multi-studio que pueden volverse caros si se ignoran justo antes de meter datos reales.

