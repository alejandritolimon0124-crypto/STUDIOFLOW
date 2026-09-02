# FASE 16.4 - ADMIN REAL DATA MIGRATION PLAN

## Objetivo

Definir el roadmap para eliminar completamente la dependencia de `mockData` en sesiones reales admin, priorizando:

1. Admin Dashboard.
2. Admin Clients.
3. Admin Studios.
4. Admin System.

Este documento no implementa codigo, no crea SQL y no modifica UI. Solo plan de migracion.

## Principio de migracion

Para sesiones reales:

- Las pantallas admin no deben importar `mockData`.
- `AppContext` no debe usar fallback demo como fuente visible.
- Las pantallas deben consumir service layer.
- El service layer debe consumir RPC `SECURITY DEFINER`.
- Las RPC deben validar `auth.uid()`, profile activo, role assignment admin y scope por studio.

Para sesiones mock:

- El modo demo puede conservar `mockData`, pero debe quedar aislado por `session.isMockSession`.

## Matriz ejecutiva

| Modulo | % Demo | Tablas requeridas | RPC requerida | Prioridad |
|---|---:|---|---|---|
| Admin Dashboard | 100% | `studios`, `studio_profiles`, `artists`, `artist_profiles`, `artist_studio_memberships`, `clients`, `client_profiles`, `appointments`, `appointment_economies`, `commissions`, `risk_flags`, `sanctions`, `loyalty_accounts`, `flow_point_ledger`, `audit_events`, `marketplace_profiles`, `marketplace_listings` | `studio_flow_admin_get_dashboard_summary` | P0 |
| Admin Clients | 100% | `clients`, `client_profiles`, `profiles`, `appointments`, `customer_relationships`, `customer_private_notes`, `loyalty_accounts`, `flow_point_ledger`, `reward_redemptions`, `artists`, `artist_studio_memberships` | `studio_flow_admin_get_clients`, `studio_flow_admin_update_client_status`, `studio_flow_admin_update_client_profile`, `studio_flow_admin_get_client_history` | P1 |
| Admin Studios | 70% | `studios`, `studio_profiles`, `artist_studio_memberships`, `artists`, `marketplace_profiles`, `marketplace_listings`, `audit_events` | `studio_flow_admin_get_studio_profile`, `studio_flow_admin_save_studio_profile`, `studio_flow_admin_upload_studio_asset_metadata` | P2 |
| Admin System | 100% | `audit_events`, `profiles`, `user_role_assignments`, `roles`, `permissions`, `role_permissions`, `risk_flags`, `sanctions`, optionally system health views | `studio_flow_admin_get_system_status`, `studio_flow_admin_get_audit_summary`, `studio_flow_admin_get_role_health` | P3 |

Orden por impacto operativo:

1. Admin Dashboard.
2. Admin Clients.
3. Admin Studios.
4. Admin System.

## Oleada 1: Admin Dashboard

### Estado actual

Archivo:

`src/pages/admin/AdminDashboard.jsx`

Fuente mock actual:

- `artistAppointments`
- `artistClients`
- `managedArtists`
- `studios`
- `systemStatus`
- `users`
- `executiveClients` local
- `executiveRiskEvents` local

### Metricas actuales

| Metrica actual | Fuente mock actual | Tabla Supabase equivalente | RPC/campo requerido |
|---|---|---|---|
| Ingresos totales | `artistAppointments` + `calculateTotalRevenue` | `appointments`, `appointment_economies` | `financial.total_revenue` |
| Comision Studio Flow | `calculatePlatformRevenue` | `commissions`, `appointment_economies` | `financial.platform_revenue` |
| Eventos con riesgo | `calculateFlaggedAppointments`, `executiveRiskEvents` | `risk_flags`, `appointments`, `appointment_economies` | `risk.flagged_count`, `risk.alerts[]` |
| Revenue estudio | `portfolioSummary.totalRevenue` | `studios`, `appointments`, `appointment_economies` | `studios[].revenue` |
| Ocupacion global/estudio | `calculateOccupancyMetrics` | `appointments`, `availability_slots`, `schedules` | `occupancy.rate`, `occupancy.booked_slots`, `occupancy.total_slots` |
| Clientas activas | `artistClients`, `executiveClients` | `clients`, `client_profiles`, `customer_relationships` | `clients.active_count` |
| Flow Points activos | `flowPoints` en clients mock | `loyalty_accounts`, `flow_point_ledger` | `loyalty.total_active_points` |
| Clientas cerca de recompensa | `flowPointRewards`, `flowPoints` mock | `loyalty_accounts`, `rewards` | `loyalty.clients_near_reward` |
| Estudios pendientes | `reviewStudios` mock | `studios`, `governance_reviews` | `governance.pending_studios` |
| Estudios aprobados | `reviewStudios` mock | `studios` | `governance.approved_studios` |
| Estudios suspendidos | `reviewStudios` mock | `studios`, `sanctions` | `governance.suspended_studios` |
| Riesgo ecosistema | `calculateEcosystemGovernanceMetrics` | `risk_flags`, `sanctions`, `governance_reviews` | `risk.ecosystem_score` |
| Active artists | `managedArtists` | `artists`, `artist_studio_memberships` | `artists.active_count` |
| Active clients | `artistClients` | `clients`, `customer_relationships` | `clients.active_count` |
| Studio risk | `portfolioSummary.studioRisk` | `risk_flags`, `sanctions`, `studios` | `studios[].risk_score` |
| Role distribution | `users` mock | `profiles`, `user_role_assignments`, `roles` | `roles.distribution` |
| Studios por owner | `users`, `managedArtists`, `studios` | `studios.owner_profile_id`, `user_role_assignments` | `studios_by_owner[]` |
| Top artistas | `managedArtists`, appointments mock | `artists`, `artist_profiles`, `appointments`, `appointment_economies` | `top_artists[]` |
| System status | `systemStatus` mock | `audit_events`, health views, maybe config table | separar a Admin System |

### RPC requerida

`studio_flow_admin_get_dashboard_summary(p_scope_studio_id uuid default null, p_date_from date default null, p_date_to date default null)`

Payload esperado:

```json
{
  "kpis": {},
  "financial": {},
  "occupancy": {},
  "governance": {},
  "risk": {},
  "loyalty": {},
  "studios": [],
  "clients": [],
  "top_artists": [],
  "appointments": [],
  "insights": [],
  "roles": {}
}
```

Validaciones:

- `platform_owner` puede consultar global.
- `studio_owner`/`studio_manager` solo studios asignados.
- Filtros de fecha obligatorios por default razonable para no cargar todo historico.

Prioridad:

P0.

Motivo: es la primera pantalla admin y actualmente es casi completamente ficticia.

## Oleada 2: Admin Clients

### Estado actual

Archivo:

`src/pages/admin/AdminClients.jsx`

Fuente mock actual:

- `adminState.clients` inicializado desde `managedClients`.
- `clientHistory`.
- Mutaciones locales:
  - `toggleManagedClientStatus`
  - `updateManagedClientProfile`

### Metricas y datos actuales

| Dato actual | Fuente mock actual | Tabla Supabase equivalente | RPC requerida |
|---|---|---|---|
| Lista clientes | `managedClients` -> `adminState.clients` | `clients`, `client_profiles`, `profiles` | `studio_flow_admin_get_clients` |
| Segmento | `managedClients.segment` | `client_profiles`, `loyalty_accounts`, customer metrics calculados | `studio_flow_admin_get_clients` |
| Status | `managedClients.status` | `clients.status`, `sanctions` opcional | `studio_flow_admin_update_client_status` |
| Spend | `managedClients.spend` | `appointments`, `appointment_economies` | `studio_flow_admin_get_clients` |
| Citas | `managedClients.appointments`, `clientHistory` | `appointments`, `appointment_status_events` | `studio_flow_admin_get_client_history` |
| Email/tel | mock fallback | `clients`, `profiles`, `client_profiles` | `studio_flow_admin_update_client_profile` |
| Notas | mock local | `customer_private_notes` | `studio_flow_admin_save_customer_note` |
| Loyalty/Flow Points | mock fields | `loyalty_accounts`, `flow_point_ledger`, `reward_redemptions` | `studio_flow_admin_get_client_loyalty` |

### RPCs requeridas

| RPC | Uso |
|---|---|
| `studio_flow_admin_get_clients` | Lista filtrada por platform/studio scope. |
| `studio_flow_admin_get_client_history` | Historial de citas, gasto y relaciones. |
| `studio_flow_admin_update_client_status` | Activar/inactivar cliente con auditoria. |
| `studio_flow_admin_update_client_profile` | Actualizar allowlist de datos administrativos. |
| `studio_flow_admin_save_customer_note` | Guardar notas privadas scoped. |

Prioridad:

P1.

Motivo: hoy es 100% demo y sus botones aparentan mutar datos reales.

## Oleada 3: Admin Studios

### Estado actual

Archivo:

`src/pages/admin/AdminStudioProfile.jsx`

Fuente actual:

- `adminState.studios`.
- Lectura parcial posible desde `studio_flow_admin_get_artists` si devuelve studios.
- Fallback a `adminState.studios[0]`.
- Guardado local con `updateManagedStudioProfile`.
- Logo/galeria con data URLs locales.

### Datos actuales

| Dato actual | Fuente mock/local | Tabla Supabase equivalente | RPC requerida |
|---|---|---|---|
| Nombre comercial | `studio.profile.commercialName` | `studio_profiles.commercial_name`, `studios.name` | `studio_flow_admin_get_studio_profile`, `studio_flow_admin_save_studio_profile` |
| Descripcion | `studio.profile.description` | `studio_profiles.description` | `studio_flow_admin_save_studio_profile` |
| Email/tel | `studio.profile.email/phone` | `studio_profiles.email`, `studio_profiles.phone` | `studio_flow_admin_save_studio_profile` |
| Ubicacion | `professionalLocation` local | `studio_profiles.address_line`, `city`, `geo_lat`, `geo_lng` | `studio_flow_admin_save_studio_profile` |
| Logo | data URL local | storage + `studio_profiles.logo_path` | `studio_flow_admin_update_studio_asset` |
| Galeria | data URLs locales | storage + `studio_profiles.gallery_paths` | `studio_flow_admin_update_studio_asset` |
| Marketplace/public profile | texto futuro | `marketplace_profiles`, `marketplace_listings` | futura `studio_flow_admin_set_studio_marketplace_visibility` |

### RPCs requeridas

| RPC | Uso |
|---|---|
| `studio_flow_admin_get_studio_profile` | Lectura del studio actual/global scoped. |
| `studio_flow_admin_save_studio_profile` | Guardado de perfil, contacto y ubicacion. |
| `studio_flow_admin_update_studio_asset_metadata` | Guardar rutas de logo/galeria tras upload. |
| `studio_flow_admin_get_studio_team_summary` | Artistas vinculados y estado del studio. |

Prioridad:

P2.

Motivo: es visible y editable, pero el impacto operativo es menor que dashboard/clientes. Aun asi, el boton `Guardar estudio` debe dejar de ser local.

## Oleada 4: Admin System

### Estado actual

Ruta:

`/admin/system`

Archivo:

`src/pages/admin/QASandbox.jsx`

Fuente actual:

- `adminState`
- `agendaSettings`
- acciones mock/locales
- login demo
- bookings mock

### Datos actuales

| Dato actual | Fuente mock/local | Tabla Supabase equivalente | RPC requerida |
|---|---|---|---|
| Estado modulo | `systemStatus` mock en Dashboard, QA copy | health views/config futura | `studio_flow_admin_get_system_status` |
| Auditoria | no real en UI | `audit_events` | `studio_flow_admin_get_audit_summary` |
| Roles | `users` mock en Dashboard | `profiles`, `user_role_assignments`, `roles` | `studio_flow_admin_get_role_health` |
| Riesgo/sanciones | mock risk events | `risk_flags`, `sanctions` | `studio_flow_admin_get_trust_summary` |
| Agenda debug | `agendaSettings` local | `schedules`, `availability_slots`, `appointments` | fuera de Admin System o QA-only |
| Feature readiness | copy local | config table futura o build constants | `studio_flow_admin_get_feature_flags` |

### RPCs requeridas

| RPC | Uso |
|---|---|
| `studio_flow_admin_get_system_status` | Estado operativo real de modulos y tablas criticas. |
| `studio_flow_admin_get_audit_summary` | Ultimos eventos y conteos por contexto. |
| `studio_flow_admin_get_role_health` | Usuarios admin, assignments sin scope, ultimo platform owner. |
| `studio_flow_admin_get_trust_summary` | Riesgos y sanciones activas. |

Prioridad:

P3.

Motivo: hoy funciona como QA Sandbox. Debe ocultarse para produccion o reemplazarse por System real despues de migrar datos operativos.

## Cambios de arquitectura requeridos

### Service layer

Crear o extender:

| Service | Responsabilidad |
|---|---|
| `src/services/adminDashboardService.js` | Dashboard summary. |
| `src/services/adminClientService.js` | Clients list/status/profile/history. |
| `src/services/adminStudioService.js` | Studio profile read/write. |
| `src/services/adminSystemService.js` | System/audit/role health. |

### AppContext

Separar estado real de fallback demo:

| Estado actual | Cambio recomendado |
|---|---|
| `adminState` mezclado con mocks/localStorage | Mantener mocks solo si `session.isMockSession`. |
| `clients` siempre mock | Cargar `adminClients` por service real en sesiones reales. |
| `studios` fallback automatico | No mostrar demo si la carga real vuelve vacia; mostrar estado vacio real. |
| `users` mock | Reemplazar por role assignments reales. |

### UI

Sin cambiar layout visual, cambiar fuentes:

- Dashboard consume `dashboardSummary`.
- Clients consume `adminClients`.
- Studio consume `adminStudioProfile`.
- System consume `systemStatus`.

## Roadmap por impacto operativo

### P0: Admin Dashboard real

1. Crear `studio_flow_admin_get_dashboard_summary`.
2. Crear `adminDashboardService.js`.
3. Sustituir imports directos de `mockData`.
4. Mantener cards actuales pero con payload real.
5. Si no hay datos, mostrar ceros/empty states reales, no mocks.

### P1: Admin Clients real

1. Crear `studio_flow_admin_get_clients`.
2. Crear `studio_flow_admin_get_client_history`.
3. Crear RPCs de status/profile.
4. Crear `adminClientService.js`.
5. Migrar `toggleManagedClientStatus` y `updateManagedClientProfile`.
6. Eliminar `managedClients` para sesiones reales.

### P2: Admin Studios real

1. Crear `studio_flow_admin_get_studio_profile`.
2. Crear `studio_flow_admin_save_studio_profile`.
3. Separar upload/storage de metadata.
4. Migrar `updateManagedStudioProfile`.
5. Evitar fallback a `adminState.studios[0]` en sesiones reales.

### P3: Admin System real

1. Decidir si `QASandbox` queda solo para dev.
2. Crear pantalla System real o reemplazar contenido.
3. Crear RPCs de audit/system/role health.
4. Quitar acciones mock de produccion.

## Dependencias previas

| Dependencia | Motivo |
|---|---|
| Admin provisioning real | Dashboard/system necesitan roles y scopes confiables. |
| RLS/RPC helpers admin | Todas las RPC requieren scope consistente. |
| Audit events estable | Mutaciones clients/studios/system deben auditar. |
| Empty states reales | Eliminar mocks implica mostrar cero datos cuando Supabase este vacio. |
| Distincion mock vs real | `session.isMockSession` debe ser frontera estricta. |

## Criterios de listo

Una pantalla admin deja de considerarse demo cuando:

- No importa `mockData`.
- No lee fallback local en sesion real.
- Sus acciones de escritura pasan por RPC.
- Sus metricas salen de Supabase o de calculos backend sobre tablas reales.
- Tiene empty state real.
- Registra `audit_events` en mutaciones sensibles.

## Veredicto

La migracion debe empezar por Admin Dashboard porque es la mayor fuente de informacion ficticia para `platform_owner`. Despues debe seguir Admin Clients, porque sus acciones parecen operativas pero son locales.

Admin Studios puede migrarse despues de clientes, salvo que se priorice marketplace/public profile. Admin System debe esperar a que existan datos reales suficientes o convertirse en una pantalla de health/audit real.
