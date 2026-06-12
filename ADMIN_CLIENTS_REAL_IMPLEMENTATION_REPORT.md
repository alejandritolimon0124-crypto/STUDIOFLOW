# FASE 16.8 - ADMIN CLIENTS REAL IMPLEMENTATION REPORT

## Objetivo

Eliminar la dependencia de datos demo en Admin Clients para sesiones reales admin y migrar lectura/escritura a Supabase mediante RPC `SECURITY DEFINER`.

## Implementado

| Pieza | Resultado |
|---|---|
| Migracion SQL | `supabase/migrations/202606110009_admin_clients_real.sql` |
| RPC lectura | `studio_flow_admin_get_clients` |
| RPC activar | `studio_flow_admin_activate_client` |
| RPC desactivar | `studio_flow_admin_deactivate_client` |
| RPC editar perfil | `studio_flow_admin_update_client_profile` |
| Helper scope | `studio_flow_admin_client_scope_context` |
| Helper payload | `studio_flow_admin_clients_payload` |
| Service layer | `src/services/adminClientService.js` |
| AppContext | `loadAdminClients()`, `toggleManagedClientStatus()`, `updateManagedClientProfile()` |
| AdminClients UI | Sin rediseño; solo se ajusto guardado async, eyebrow y safe history |

## RPCs

### `studio_flow_admin_get_clients`

Devuelve clientas visibles por scope:

- `platform_owner`: todas las clientas no archivadas.
- `studio_owner`: clientas relacionadas con su `studio_id`.
- `studio_manager`: clientas relacionadas con su `studio_id`.

Relaciones consideradas:

- `appointments.studio_id`
- `customer_relationships.scope_type = studio`
- `customer_relationships.scope_type = membership` via `artist_studio_memberships`

Payload compatible:

- `name`
- `email`
- `phone`
- `status`
- `segment`
- `appointments`
- `spend`
- `spend_amount`
- `flowPoints`
- `studioId`
- `studioName`
- `lastAppointment`
- `history`

### `studio_flow_admin_activate_client`

- Valida `auth.uid()`.
- Valida profile activo.
- Valida role assignment admin y scope.
- Cambia `clients.status = active`.
- Registra `audit_events` con:
  - `entity_type = 'client'`
  - `event_type = 'client_activated'`

### `studio_flow_admin_deactivate_client`

- Valida las mismas reglas.
- Cambia `clients.status = inactive`.
- Registra `audit_events` con:
  - `entity_type = 'client'`
  - `event_type = 'client_deactivated'`

### `studio_flow_admin_update_client_profile`

Allowlist implementada:

- `clients.display_name`
- `clients.email`
- `clients.phone`
- `profiles.display_name` si existe `profile_id`
- `profiles.email` si se envia email
- `profiles.phone`

Registra `audit_events` con:

- `entity_type = 'client'`
- `event_type = 'admin_client_profile_updated'`

No persiste:

- `segment`, porque hoy se deriva de Flow Points.
- `notes`, porque notas privadas quedaron fuera de alcance.

## Service layer

`src/services/adminClientService.js` agrega:

- `fetchAdminClients()`
- `activateAdminClient(clientId)`
- `deactivateAdminClient(clientId)`
- `updateAdminClientProfile(clientId, patch)`
- `mapAdminClientsPayload(data)`

El mapper mantiene el contrato visual actual:

- `spend` se formatea como moneda.
- `appointments` se normaliza a numero.
- `history` siempre es array.
- `segment` usa el valor derivado por backend.

## AppContext

Se agrego:

- `loadAdminClients()`
- `isAdminClientsLoading`
- `adminClientsError`

Para sesiones reales admin:

- `loadAdminClients()` reemplaza `adminState.clients` con Supabase.
- Si falla, `adminState.clients = []` para evitar fallback demo visible.
- `toggleManagedClientStatus()` llama RPC activate/deactivate.
- `updateManagedClientProfile()` llama RPC de perfil.

Para sesiones mock:

- Se conserva el comportamiento local anterior.

## AdminClients.jsx

Se mantuvo la UI actual.

Cambios minimos:

- `saveClientProfile()` ahora espera la actualizacion async.
- El panel ya no dice `Edicion mock`.
- `historyClient.history` tolera array vacio.

## No implementado por alcance

- Loyalty avanzado.
- Campanas.
- Marketplace.
- Notas privadas.
- Crear nueva clienta.
- UI nueva o rediseño.

## Dependencias de seguridad

| Requisito | Implementacion |
|---|---|
| Auth | `auth.uid()` requerido |
| Profile activo | `profiles.status = active` |
| Platform global | assignment `platform_owner` o `profiles.default_role` |
| Studio scoped | `user_role_assignments.studio_id` |
| Scope cliente | appointment o relationship vinculada al studio |
| Auditoria | `audit_events` por cada mutacion |

## Validacion

`npm run build` ejecutado correctamente.

Resultado:

- Vite compilo 136 modulos.
- PWA generada.
- Se mantiene advertencia existente de chunk mayor a 500 kB.

## Veredicto

Admin Clients ya tiene lectura y escrituras core reales para sesiones Supabase admin. El modulo conserva su contrato visual actual, pero `adminState.clients` deja de depender de `managedClients` cuando la sesion no es mock.

Las piezas restantes para una experiencia completa son notas privadas, loyalty avanzado, campanas y creacion de clientas.
