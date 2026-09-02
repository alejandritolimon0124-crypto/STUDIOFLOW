# FASE 16.5 - ADMIN DASHBOARD REAL IMPLEMENTATION REPORT

## Objetivo

Implementar `studio_flow_admin_get_dashboard_summary` y eliminar la dependencia directa de `mockData` en `AdminDashboard.jsx` para sesiones reales, manteniendo las tarjetas y estructura visual existentes.

## Implementado

| Pieza | Resultado |
|---|---|
| Migracion SQL | `supabase/migrations/202606110008_admin_dashboard_real_summary.sql` |
| RPC | `studio_flow_admin_get_dashboard_summary` |
| Service layer | `src/services/adminDashboardService.js` |
| AppContext | `loadAdminDashboard()` carga `adminState.dashboard` para sesiones admin reales |
| AdminDashboard | Deja de importar `mockData` y consume `adminState.dashboard` |
| Empty state real | En sesion real sin payload Supabase, usa arrays vacios y metricas 0 |
| UI visual | Sin rediseño; se mantienen cards, tablas y secciones existentes |

## RPC

`studio_flow_admin_get_dashboard_summary(p_scope_studio_id uuid default null, p_date_from date default null, p_date_to date default null)`

Valida:

- `auth.uid()` presente.
- `profiles.status = active`.
- `platform_owner` por assignment activo o `profiles.default_role`.
- `studio_owner`/`studio_manager` por `user_role_assignments.studio_id`.
- Scope de studio cuando se envia `p_scope_studio_id`.

Devuelve colecciones normalizadas:

- `studios`
- `artists`
- `clients`
- `appointments`
- `users`
- `system_status`

La ventana default es de 30 dias hacia atras y 30 dias hacia adelante, para evitar cargar todo el historico.

## Fuentes reales

| Seccion Dashboard | Fuente real |
|---|---|
| Ingresos / comision | `appointments`, `appointment_economies`, `service_offerings` |
| Ocupacion | `appointments` |
| Riesgo | `risk_flags`, `sanctions`, `studios.risk_score` |
| Studios | `studios`, `studio_profiles`, `artist_studio_memberships` |
| Artistas | `artists`, `artist_profiles`, `artist_studio_memberships` |
| Clientes | `clients`, `profiles`, `loyalty_accounts`, `appointments` |
| Roles | `profiles`, `user_role_assignments`, `roles` |
| Sistema | `audit_events`, `risk_flags`, estado de sesion real |

## Service layer

`src/services/adminDashboardService.js` agrega:

- `fetchAdminDashboardSummary(params)`
- `mapAdminDashboardPayload(data)`

El mapper conserva shapes compatibles con los calculos existentes del dashboard:

- `studioStatus`
- `studioId`
- `grossAmount`
- `platformFee`
- `artistRevenue`
- `flowPoints`
- `systemStatus`

## AppContext

Se agrego `adminState.dashboard`.

Para sesiones mock:

- `adminState.dashboard.source = 'mock'`.
- El modo demo conserva sus datos desde `mockData`, aislado en AppContext.

Para sesiones reales:

- `loadAdminDashboard()` llama `fetchAdminDashboardSummary()`.
- Si la carga falla, `adminState.dashboard` se reemplaza por payload vacio con `source = 'supabase'`.
- Esto evita que una sesion real vea fallback demo.

Tambien se exponen:

- `isAdminDashboardLoading`
- `adminDashboardError`
- `loadAdminDashboard`

## AdminDashboard.jsx

Cambios funcionales:

- Se elimino el import directo de `../../services/mockData`.
- Se eliminaron datos ejecutivos hardcodeados locales.
- La pantalla consume `adminState.dashboard`.
- Si la sesion es real y el dashboard aun no tiene `source = 'supabase'`, usa un empty state real.
- Se actualizaron textos que decian `mock` para no mostrarlos en sesiones reales.

No se modifico el layout visual.

## No implementado

- Mutaciones de Dashboard governance.
- Admin Clients real.
- Admin Studios write real.
- Admin System dedicado.
- Nuevas tarjetas o redisenos.

## Validacion

`npm run build` ejecutado correctamente.

Resultado:

- Vite compilo 135 modulos.
- PWA generada.
- Se mantiene la advertencia existente de chunk mayor a 500 kB.

## Veredicto

Admin Dashboard ya no depende directamente de `mockData` para sesiones reales. La pantalla conserva sus tarjetas actuales, pero las alimenta desde `adminState.dashboard`, que en sesiones Supabase reales proviene de `studio_flow_admin_get_dashboard_summary`.

El modo demo sigue disponible, pero queda aislado por `session.isMockSession`.
