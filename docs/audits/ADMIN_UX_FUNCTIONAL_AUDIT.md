# FASE 16.6 - ADMIN UX & FUNCTIONAL AUDIT

## Objetivo

Auditar los modulos visibles o conceptuales para `platform_owner` y determinar su proposito real, fuente de datos, valor operativo y destino recomendado dentro de una arquitectura administrativa real de Studio Flow.

Este documento no implementa codigo, no crea SQL, no modifica rutas y no cambia UI. Solo auditoria funcional y propuesta de arquitectura.

## Rutas admin actuales

| Ruta | Componente | Estado |
|---|---|---|
| `/admin` | `src/pages/admin/AdminDashboard.jsx` | Real parcial tras Wave 16.5 |
| `/admin/artists` | `src/pages/admin/AdminArtists.jsx` | Mixto |
| `/admin/clients` | `src/pages/admin/AdminClients.jsx` | Demo |
| `/admin/studio` | `src/pages/admin/AdminStudioProfile.jsx` | Mixto/Demo |
| `/admin/system` | `src/pages/admin/QASandbox.jsx` | Demo/QA |

No existen rutas dedicadas para:

- Marketplace.
- Governance.
- Riesgo Operativo.
- Settings.

Actualmente Governance, Riesgo y Marketplace aparecen como cards, textos o bloques dentro de Dashboard/Studio/QA.

## Veredicto ejecutivo

La navegacion admin mezcla tres tipos de experiencia:

1. Operacion real: Dashboard real parcial y Admin Artists core.
2. Operacion simulada: Clients, Studio profile write, QA actions.
3. Conceptos futuros: Marketplace, Governance avanzada, System health.

Para `platform_owner`, la arquitectura deberia reorganizarse por responsabilidades reales:

- Operacion.
- Directorio.
- Marketplace.
- Riesgo y Governance.
- Sistema.
- Configuracion/Provisioning.

La ruta `Sistema` no deberia apuntar a QA Sandbox en una sesion real. `Mi Estudio` tampoco es un buen nombre para `platform_owner`; debe convertirse en `Studios` o fusionarse con un modulo real de estudios.

## Matriz funcional

| Seccion | Proposito operativo | Usuario objetivo | Fuente de datos actual | Estado | Valor negocio | Recomendacion |
|---|---|---|---|---|---|---|
| Dashboard | Vista ejecutiva de KPIs, revenue, ocupacion, riesgo, roles y portfolio | `platform_owner`, `studio_owner`, `studio_manager` | RPC `studio_flow_admin_get_dashboard_summary` para sesiones reales; calculos frontend sobre payload | Mixto/Real parcial | Alto | Mantener |
| Artistas | Directorio y gestion core de artistas, status y perfil profesional | `platform_owner`, `studio_owner` | RPC `studio_flow_admin_get_artists`; RPCs activate/deactivate/update profile; piezas locales residuales | Mixto | Alto | Mantener |
| Clientes | Directorio de clientas, status, perfil e historial | `platform_owner`, `studio_owner`, `studio_manager` | `adminState.clients` desde mock/localStorage | Demo | Alto | Mantener, migrar |
| Estudios | Gestion de estudios, perfiles, estado, owners y operacion por studio | `platform_owner`, `studio_owner` | Parcial desde Admin Artists/Dashboard; escritura local en `AdminStudioProfile` | Mixto/Demo | Alto | Renombrar y fusionar |
| Sistema | Salud operativa, auditoria, roles, readiness y configuracion tecnica | `platform_owner` | `/admin/system` renderiza `QASandbox`; Dashboard tiene system cards reales basicas | Demo | Medio/Alto | Reemplazar |
| Mi Estudio | Edicion del perfil publico/profesional de un studio | `studio_owner`; secundario para `platform_owner` scoped | `adminState.studios`; guardado local | Mixto/Demo | Medio | Fusionar |
| Riesgo Operativo | Alertas, flags, sanctions, no-shows, disputas y eventos operativos | `platform_owner`, trust/admin ops | Cards en Dashboard con `risk_flags`; no hay modulo dedicado | Mixto conceptual | Alto | Separar como modulo |
| Governance | Aprobacion, suspension, validacion de studios/artistas y auditoria de decisiones | `platform_owner`, governance ops | Cards locales en Dashboard; botones locales de review status | Demo/Mixto | Alto | Separar como modulo |
| QA / Sandbox | Validacion interna de agenda, reservas mock y navegacion rapida | Dev/QA interno | `QASandbox.jsx`, estado local/mock | Demo | Bajo en produccion | Ocultar |
| Marketplace | Publicacion, visibilidad, listings, perfiles publicos y discovery | `platform_owner`, growth/ops, `studio_owner` limitado | No existe ruta; textos futuros en Studio/Dashboard/QA | Sin implementar/Demo | Alto | Crear modulo |

## Auditoria por seccion

### 1. Dashboard

| Campo | Resultado |
|---|---|
| Archivo | `src/pages/admin/AdminDashboard.jsx` |
| Proposito real | Resumen ejecutivo de salud del negocio: ingresos, ocupacion, riesgo, portfolio, clientes, artistas y sistema. |
| Usuario objetivo | `platform_owner` como usuario principal; `studio_owner` y `studio_manager` con scope reducido. |
| Fuente actual | `adminState.dashboard`, cargado por `studio_flow_admin_get_dashboard_summary` en sesiones reales. |
| Estado | Mixto/Real parcial |
| Valor negocio | Alto. Es la primera pantalla de decision operativa. |
| Recomendacion | Mantener. |

Observaciones:

- Ya no depende directamente de `mockData` tras Fase 16.5.
- Sigue calculando varias metricas en frontend usando helpers legacy.
- Governance actions dentro del Dashboard siguen siendo locales (`updateReviewStatus` sobre `reviewStudios`).
- Conviene que Dashboard sea read-only ejecutivo y que las acciones se muevan a modulos especializados.

Destino recomendado:

- Mantener como `Inicio` o `Resumen`.
- No convertirlo en centro de mutaciones.
- Dejar solo accesos rapidos hacia Artistas, Clientes, Studios, Riesgo, Governance y Marketplace.

### 2. Artistas

| Campo | Resultado |
|---|---|
| Archivo | `src/pages/admin/AdminArtists.jsx` |
| Proposito real | Gestionar artistas, status operativo y perfil profesional. |
| Usuario objetivo | `platform_owner`, `studio_owner`; `studio_manager` solo si se decide dar permiso real. |
| Fuente actual | `adminState.artists`/`adminState.studios`; lectura y core writes via RPC para sesiones reales. |
| Estado | Mixto |
| Valor negocio | Alto. Es entidad central del marketplace y booking. |
| Recomendacion | Mantener. |

Real:

- Lectura real por `studio_flow_admin_get_artists`.
- Activar/desactivar real.
- Actualizar perfil artista real.

Residual demo/local:

- `Nueva artista` no tiene flujo real.
- Dashboard artista es local al item.
- Ubicacion de studio dentro del modal llama `updateManagedStudioProfile`, todavia local.
- Aprobacion, rechazo, suspension y marketplace visibility no estan conectados.

Destino recomendado:

- Mantener como `Artistas`.
- Separar acciones:
  - status operativo en Artistas
  - aprobacion/rechazo en Governance
  - visibilidad/publicacion en Marketplace
  - ubicacion de studio en Studios

### 3. Clientes

| Campo | Resultado |
|---|---|
| Archivo | `src/pages/admin/AdminClients.jsx` |
| Proposito real | Gestionar clientas, estado, historial, gasto, loyalty y relacion con studios/artistas. |
| Usuario objetivo | `platform_owner`, `studio_owner`, `studio_manager`. |
| Fuente actual | `adminState.clients` desde `managedClients` mock/localStorage. |
| Estado | Demo |
| Valor negocio | Alto. Impacta CRM, recurrencia y soporte. |
| Recomendacion | Mantener, migrar. |

Problemas actuales:

- `toggleManagedClientStatus` es local.
- `updateManagedClientProfile` es local.
- Modal dice `Edicion mock`.
- Historial y spend son mock.

Destino recomendado:

- Mantener como `Clientes`.
- Migrar con `studio_flow_admin_get_clients`.
- Integrar `loyalty_accounts`, `flow_point_ledger`, `appointments` y `customer_private_notes`.

### 4. Estudios

| Campo | Resultado |
|---|---|
| Archivo principal | `src/pages/admin/AdminStudioProfile.jsx` |
| Proposito real | Administrar studios, perfiles publicos, owners, estado operacional y datos de ubicacion. |
| Usuario objetivo | `platform_owner` para todos los studios; `studio_owner` para su studio. |
| Fuente actual | `adminState.studios`; parcial desde RPCs de artistas/dashboard; guardado local. |
| Estado | Mixto/Demo |
| Valor negocio | Alto. Studio es scope de roles, marketplace y operacion. |
| Recomendacion | Fusionar/Renombrar. |

Problema de UX:

- Para `platform_owner`, la ruta se llama `Mi Estudio`, pero el rol no administra necesariamente un solo estudio propio.
- La pantalla edita un studio, pero no hay listado real de studios ni detalle multi-studio.

Destino recomendado:

- Reemplazar `Mi Estudio` por `Studios` para `platform_owner`.
- Mantener `Mi Estudio` solo para `studio_owner`.
- Crear estructura:
  - `Studios` listado
  - `Studio Detail`
  - `Studio Profile`
  - `Studio Team`
  - `Studio Marketplace`

### 5. Sistema

| Campo | Resultado |
|---|---|
| Ruta | `/admin/system` |
| Archivo actual | `src/pages/admin/QASandbox.jsx` |
| Proposito real esperado | Salud del sistema, auditoria, roles, integridad y operaciones tecnicas. |
| Usuario objetivo | `platform_owner`; posiblemente soporte interno. |
| Fuente actual | QA/local/mock. |
| Estado | Demo |
| Valor negocio | Medio/Alto si se vuelve audit/system real; bajo como QA en produccion. |
| Recomendacion | Reemplazar. |

Problema:

- El nav dice `Sistema`, pero renderiza QA Sandbox.
- Para un `platform_owner` real, esto mezcla tooling de desarrollo con operacion administrativa.

Destino recomendado:

- `Sistema` debe mostrar:
  - health real
  - ultimos `audit_events`
  - roles sin scope
  - errores de integridad
  - estado de RPC/RLS
- QA Sandbox debe moverse a ruta dev-only o eliminarse del nav real.

### 6. Mi Estudio

| Campo | Resultado |
|---|---|
| Ruta | `/admin/studio` |
| Archivo | `src/pages/admin/AdminStudioProfile.jsx` |
| Proposito real | Editar perfil profesional/publico de un studio. |
| Usuario objetivo | `studio_owner`. Para `platform_owner`, solo si entra al detalle de un studio. |
| Fuente actual | `adminState.studios` y guardado local. |
| Estado | Mixto/Demo |
| Valor negocio | Medio para platform owner; alto para studio owner. |
| Recomendacion | Fusionar. |

Recomendacion:

- Para `platform_owner`: fusionar dentro de `Studios`.
- Para `studio_owner`: mantener como `Mi Estudio`.
- Para `studio_manager`: ocultar salvo permisos especificos.

### 7. Riesgo Operativo

| Campo | Resultado |
|---|---|
| Ruta actual | No existe ruta dedicada |
| Ubicacion actual | Cards de Dashboard: `Alertas de negocio`, `Riesgo ecosistema`, `Studio risk` |
| Proposito real | Gestionar flags, no-shows, sanciones, disputas, eventos criticos y revisiones. |
| Usuario objetivo | `platform_owner`, trust/risk ops; vista scoped para studio owner si aplica. |
| Fuente actual | Parcial desde `risk_flags` en Dashboard summary; no hay workflow. |
| Estado | Mixto conceptual |
| Valor negocio | Alto. Reduce fraude, riesgo reputacional y operaciones rotas. |
| Recomendacion | Mantener como modulo separado. |

Destino recomendado:

- Crear nav `Riesgo`.
- Fuente:
  - `risk_flags`
  - `sanctions`
  - `no_show_cases`
  - `audit_events`
  - appointments disputadas
- Acciones:
  - resolver flag
  - aplicar/lift sanction
  - ver historial
  - escalar caso

### 8. Governance

| Campo | Resultado |
|---|---|
| Ruta actual | No existe ruta dedicada |
| Ubicacion actual | Dashboard: `Estudios pendientes de validacion`, KPIs governance |
| Proposito real | Aprobaciones, rechazos, suspension, validacion de studios/artistas y control de calidad del ecosistema. |
| Usuario objetivo | `platform_owner`, governance ops. |
| Fuente actual | Mixta: conteos reales basicos en dashboard; acciones locales. |
| Estado | Demo/Mixto |
| Valor negocio | Alto. Controla entrada y calidad del marketplace. |
| Recomendacion | Mantener como modulo separado. |

Problema actual:

- Botones `Aprobar`, `Suspender`, `Solicitar cambios` en Dashboard solo actualizan estado local.
- Governance no deberia vivir como acciones sueltas en un dashboard ejecutivo.

Destino recomendado:

- Crear nav `Governance`.
- Mover ahi:
  - studio approvals
  - artist approvals
  - claim reviews
  - audit trail de decisiones
  - motivos y evidencias

### 9. QA / Sandbox

| Campo | Resultado |
|---|---|
| Ruta actual | `/admin/system` |
| Archivo | `src/pages/admin/QASandbox.jsx` |
| Proposito real | Validacion interna de agenda, reservas y navegacion. |
| Usuario objetivo | Dev/QA, no platform owner de negocio. |
| Fuente actual | Mock/local. |
| Estado | Demo |
| Valor negocio | Bajo en produccion; util para desarrollo. |
| Recomendacion | Ocultar. |

Destino recomendado:

- Ocultar para sesiones reales no-dev.
- Mover a `/admin/qa` solo en entorno development si se conserva.
- No debe ocupar el lugar de `Sistema`.

### 10. Marketplace

| Campo | Resultado |
|---|---|
| Ruta actual | No existe |
| Ubicacion actual | Textos futuros en `AdminStudioProfile`, Dashboard y QA |
| Proposito real | Gestionar perfiles publicos, listings, visibilidad, publicacion, suspensiones y discovery. |
| Usuario objetivo | `platform_owner`, growth/ops; `studio_owner` scoped para su perfil. |
| Fuente actual | Ninguna real en UI admin. |
| Estado | Sin implementar/Demo |
| Valor negocio | Alto. Es la superficie publica y comercial. |
| Recomendacion | Crear. |

Destino recomendado:

- Crear nav `Marketplace`.
- Incluir:
  - perfiles publicados/ocultos/suspendidos
  - listings activos
  - artistas independientes
  - studios publicados
  - calidad de perfil
  - acciones publish/hide/suspend

## Recomendacion por modulo

| Modulo actual/conceptual | Recomendacion | Razon |
|---|---|---|
| Dashboard | Mantener | Debe ser resumen ejecutivo real, no workflow de aprobacion. |
| Artistas | Mantener | Entidad operacional central. |
| Clientes | Mantener | CRM y loyalty son core de negocio. |
| Estudios | Fusionar/Renombrar | `Mi Estudio` no representa bien a `platform_owner`. |
| Sistema | Reemplazar | Hoy es QA; debe ser health/audit real. |
| Mi Estudio | Fusionar | Mantener solo para `studio_owner`; integrar en Studios para platform. |
| Riesgo Operativo | Mantener como modulo nuevo | Tiene datos/tablas propias y workflow propio. |
| Governance | Mantener como modulo nuevo | Aprobaciones y sanciones no deben estar en dashboard. |
| QA / Sandbox | Ocultar | No debe aparecer a platform owner real. |
| Marketplace | Mantener como modulo nuevo | Es superficie comercial critica y hoy no existe. |

## Nueva arquitectura admin propuesta

### Navegacion Platform Owner

Orden recomendado:

1. `Inicio`
2. `Operaciones`
3. `Artistas`
4. `Clientes`
5. `Studios`
6. `Marketplace`
7. `Riesgo`
8. `Governance`
9. `Sistema`
10. `Configuracion`

### Descripcion de cada item

| Nav propuesto | Reemplaza/Fusiona | Proposito |
|---|---|---|
| Inicio | Dashboard actual | KPIs, tendencias, salud ejecutiva y accesos rapidos. |
| Operaciones | Partes de Dashboard + agenda futura | Citas, ocupacion, agenda global y actividad diaria. |
| Artistas | Admin Artists | Directorio, status, perfil, servicios y relacion con studios. |
| Clientes | Admin Clients | CRM, historial, loyalty, estado y soporte. |
| Studios | Mi Estudio + governance studio list | Listado, detalle, profile, owners, team y estado. |
| Marketplace | Nuevo | Publicacion, visibilidad, listings y perfiles publicos. |
| Riesgo | Cards de riesgo + trust tables | Flags, sanctions, no-shows, disputes y acciones trust. |
| Governance | Cards governance + approvals futuras | Aprobaciones, rechazos, revisiones y calidad del ecosistema. |
| Sistema | Reemplaza QASandbox | Health, audit logs, role health, RLS/RPC readiness. |
| Configuracion | Nuevo/provisioning | Roles, permisos, provisioning admin, feature flags. |

### Navegacion Studio Owner

Orden recomendado:

1. `Inicio`
2. `Operacion`
3. `Artistas`
4. `Clientes`
5. `Mi Estudio`
6. `Marketplace`
7. `Equipo`

Studio owner no deberia ver:

- Governance global.
- Riesgo ecosistema global.
- Sistema platform.
- Configuracion platform.

### Navegacion Studio Manager

Orden recomendado:

1. `Operacion`
2. `Agenda`
3. `Clientes`
4. `Campanas`

Studio manager no deberia ver por default:

- Artistas si no tiene permiso de staffing.
- Finanzas profundas.
- Governance.
- Sistema.
- Marketplace publish/hide.

## Arquitectura de informacion recomendada

### Grupo 1: Operacion diaria

- Inicio
- Operaciones
- Citas/Agenda
- Clientes

### Grupo 2: Supply y catalogo

- Artistas
- Servicios
- Studios

### Grupo 3: Superficie publica

- Marketplace
- Perfiles publicos
- Listings

### Grupo 4: Control y confianza

- Riesgo
- Governance
- Auditoria

### Grupo 5: Administracion platform

- Sistema
- Configuracion
- Roles y permisos
- Provisioning

## Cambios prioritarios recomendados

### P0: Quitar QA de sesiones reales

- `/admin/system` no debe renderizar `QASandbox` para `platform_owner` real.
- Crear System real o ocultar temporalmente.

### P1: Renombrar `Mi Estudio` para platform owner

- En platform owner, mostrar `Studios`.
- En studio owner, mantener `Mi Estudio`.

### P2: Separar Governance del Dashboard

- Dashboard debe mostrar conteos y deep links.
- Acciones de aprobar/suspender/rechazar deben ir a Governance.

### P3: Crear Riesgo Operativo

- Centralizar `risk_flags`, `sanctions`, `no_show_cases` y appointment disputes.

### P4: Crear Marketplace

- No dejar marketplace como texto futuro dentro de perfiles.
- Crear modulo operacional de visibilidad y listings.

### P5: Migrar Clients antes de ampliar UX

- Admin Clients sigue demo; no conviene invertir en UX nueva antes de fuente real.

## Decisiones de producto pendientes

1. Si `platform_owner` debe gestionar studios desde `Studios` o desde `Governance`.
2. Si `studio_manager` puede ver Artistas o solo Agenda/Clientes.
3. Si Marketplace es responsabilidad de platform ops, studio owner o ambos.
4. Si Riesgo y Governance son tabs separados o un mismo modulo `Trust`.
5. Si QA Sandbox se elimina o se conserva solo en development.
6. Si Configuracion incluye provisioning admin o queda en `Sistema`.

## Veredicto

La arquitectura admin actual fue util para construir pantallas rapido, pero ya no corresponde a una operacion real de `platform_owner`.

El mayor problema no es visual, sino semantico: `Sistema` es QA, `Mi Estudio` no aplica bien a platform owner, Governance vive dentro del Dashboard y Marketplace no existe como modulo.

La estructura recomendada separa decisiones ejecutivas, operacion diaria, directorios, marketplace, trust/governance y sistema. Eso permite que cada modulo tenga sus propias RPCs, permisos, auditoria y empty states reales sin seguir mezclando demo, QA y operacion en la misma pantalla.
