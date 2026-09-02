# FASE 16.3 - ADMIN DEMO DATA ELIMINATION AUDIT

## Objetivo

Identificar el contenido demo que sigue visible cuando existe una sesion real `platform_owner`.

Este documento no implementa codigo, no crea SQL y no modifica UI. Solo auditoria.

## Rutas admin reales

| Ruta | Componente |
|---|---|
| `/admin` | `src/pages/admin/AdminDashboard.jsx` |
| `/admin/artists` | `src/pages/admin/AdminArtists.jsx` |
| `/admin/clients` | `src/pages/admin/AdminClients.jsx` |
| `/admin/studio` | `src/pages/admin/AdminStudioProfile.jsx` |
| `/admin/system` | `src/pages/admin/QASandbox.jsx` |

No existen rutas admin dedicadas para:

- Admin Marketplace.
- Admin Settings.

El contenido relacionado con Marketplace/Settings aparece como texto futuro, tarjetas operativas o QA/System.

## Estado global de datos admin

`AppContext` inicia `adminState` desde `mockData`:

| Archivo | Lineas | Fuente demo |
|---|---:|---|
| `src/contexts/AppContext.jsx` | `298-326` | `studios`, `managedArtists`, `managedClients`, `clientHistory` desde `mockData`. |
| `src/contexts/AppContext.jsx` | `375-383` | `getStoredAdminState()` restaura localStorage si existe. |
| `src/contexts/AppContext.jsx` | `917-921` | Para sesion real admin, reemplaza `adminState.artists` y parcialmente `adminState.studios` desde Supabase. |

Resultado:

- `artists`: real para sesiones admin reales, si `fetchAdminArtists()` carga correctamente.
- `studios`: real solo si `studio_flow_admin_get_artists()` devuelve studios; si no, conserva fallback demo.
- `clients`: demo siempre.
- `users`: demo siempre.
- metricas dashboard: mayormente demo/calculadas desde mocks.
- system/QA: demo siempre.

## Matriz por componente

| Componente | Archivo | Fuente actual | Fuente correcta | Usa mockData | Fallback demo | Usa Supabase real | Estado |
|---|---|---|---|---|---|---|---|
| Admin Dashboard | `src/pages/admin/AdminDashboard.jsx` | Import directo de `mockData`: `artistAppointments`, `artistClients`, `managedArtists`, `studios`, `systemStatus`, `users`; solo `artistServices` viene de AppContext | RPCs agregadas admin: revenue, studios, artists, clients, appointments, risk, marketplace, audit | Si | Si | Parcial minimo | DEMO |
| Admin Artists | `src/pages/admin/AdminArtists.jsx` | `adminState.artists` y `adminState.studios`; desde Wave A/B puede cargar Supabase para artistas/studios | `studio_flow_admin_get_artists` + write RPCs ya creadas; futuras RPCs para approve/reject/suspend/marketplace | Indirecto por `adminState` inicial | Si | Si, parcial | MIXTO |
| Admin Clients | `src/pages/admin/AdminClients.jsx` | `adminState.clients` desde `managedClients` mock/localStorage | `studio_flow_admin_get_clients`, client profile/status/history RPCs | Si, indirecto | Si | No | DEMO |
| Admin Studios | `src/pages/admin/AdminStudioProfile.jsx` | `adminState.studios`; puede venir de Wave A si hay artists/studios, si no fallback mock | `studio_flow_admin_get_studio_profile`, `studio_flow_admin_save_studio_profile` | Si, indirecto | Si | Parcial lectura, no escritura | MIXTO |
| Admin Marketplace | No existe ruta dedicada | No implementado; menciones de marketplace/public profile futuro en Dashboard/Studio/QA | `marketplace_profiles`, `marketplace_listings`, publish/hide/suspend RPCs | N/A | Si, por textos/placeholder | No | DEMO |
| Admin Settings/System | `src/pages/admin/QASandbox.jsx` como `/admin/system` | QA Sandbox con agenda, bookings y estados mock/locales | Panel real de sistema/settings con health checks, feature flags y audit | Si, indirecto | Si | No | DEMO |

## Admin Dashboard

### Fuente de datos actual

Archivo:

`src/pages/admin/AdminDashboard.jsx`

Importa directamente:

```js
import {
  artistAppointments,
  artistClients,
  managedArtists,
  studios,
  systemStatus,
  users,
} from '../../services/mockData'
```

Lineas clave:

| Linea | Hallazgo |
|---:|---|
| `9-16` | Import directo de `mockData`. |
| `147` | Solo extrae `artistServices` y `session` desde AppContext. |
| `149` | `reviewStudios` inicia con `useState(studios)` mock. |
| `155` | `ownerAppointments = [...artistAppointments, ...executiveRiskEvents]`. |
| `165-180` | Usa `managedArtists` mock para memberships y artistas accesibles. |
| `181` | Usa `executiveClients`, derivado de `artistClients` mock. |
| `233-240` | Calcula portfolio, revenue, risk y occupancy desde datos mock. |
| `284-301` | Governance/users/owners desde `users`, `reviewStudios`, `managedArtists`. |
| `334-350` | KPI cards calculadas desde mocks. |
| `428` | Texto explicito: `No hay estudios esperando validacion en este mock.` |
| `576` | Top artistas con eyebrow `Ranking mock ejecutivo`. |

### Contenido demo visible

- Hero ejecutivo con revenue/flagged appointments mock.
- KPI cards: ingresos, comision, riesgo, ocupacion, clientas, Flow Points, governance.
- Estudios pendientes de validacion.
- Portfolio multi-studio.
- Insights globales.
- Flow Points.
- Studios por owner.
- Top artistas.
- Gestion de studios.
- Gestion de clientes.

### Clasificacion

DEMO.

Aunque recibe `artistServices` desde AppContext, la pantalla no usa `adminState.artists` real ni `adminState.studios` real para su base principal.

## Admin Artists

### Fuente de datos actual

Archivo:

`src/pages/admin/AdminArtists.jsx`

Usa:

- `adminState.artists`
- `adminState.studios`
- `toggleManagedArtistStatus`
- `updateManagedArtistProfile`
- `updateManagedStudioProfile`

Lineas clave:

| Linea | Hallazgo |
|---:|---|
| `23-29` | Consume `adminState` y funciones de AppContext. |
| `39-70` | Filtra artistas/studios desde `adminState`. |
| `122-153` | Guarda perfil artista y studio location. |
| `211` | Toggle status conectado a AppContext; desde Wave B usa RPC para sesion real. |
| `215` | Editar perfil conectado a AppContext; desde Wave B artist profile usa RPC para sesion real. |
| `192` | Boton `Nueva artista` no tiene handler real. |
| `222-240` | Dashboard artista local, con `revenue` y datos derivados del item. |

### Fuente Supabase real

Por fases previas:

- `src/services/adminArtistService.js` llama `studio_flow_admin_get_artists`.
- AppContext `loadAdminArtists()` carga `payload.artists` y `payload.studios`.
- Wave B migro activar/desactivar y editar perfil artista a RPC.

### Contenido demo visible

- Boton `Nueva artista` sin accion real.
- Dashboard artista local con `revenue = '$0'` o revenue de mapper/mock, no economia real.
- Edicion de ubicacion de studio desde modal usa `updateManagedStudioProfile`, todavia local.
- Si `loadAdminArtists()` falla, se conserva estado inicial/localStorage demo.
- Studios vinculados pueden ser fallback si RPC no devuelve studios.

### Clasificacion

MIXTO.

Es la pantalla admin mas avanzada hacia Supabase, pero todavia tiene fallback demo, acciones incompletas y componentes derivados locales.

## Admin Clients

### Fuente de datos actual

Archivo:

`src/pages/admin/AdminClients.jsx`

Usa:

- `adminState.clients`
- `adminState.artists`
- `adminState.studios`
- `toggleManagedClientStatus`
- `updateManagedClientProfile`

Lineas clave:

| Linea | Hallazgo |
|---:|---|
| `17-23` | Consume `adminState` y funciones locales de clientes. |
| `70-76` | Filtra `adminState.clients`. |
| `80-85` | Guarda perfil con `updateManagedClientProfile`, local. |
| `90` | Boton `Nueva clienta` sin accion real. |
| `101-113` | Lista clientes desde mock/local state. |
| `122` | Modal dice `Edicion mock`. |
| `164-170` | Historial cliente desde `historyClient.history`, mock. |

### Contenido demo visible

- Clientes demo.
- Segmentos demo.
- Status demo.
- Spend demo.
- Historial demo.
- Boton activar/inactivar local.
- Boton nueva clienta sin backend.
- Perfil editable mock.

### Clasificacion

DEMO.

No hay service layer ni RPC admin clients conectada.

## Admin Studios

### Fuente de datos actual

Archivo:

`src/pages/admin/AdminStudioProfile.jsx`

Usa:

- `adminState.studios`
- `session`
- `updateManagedStudioProfile`

Lineas clave:

| Linea | Hallazgo |
|---:|---|
| `13` | Consume `adminState`, `session`, `updateManagedStudioProfile`. |
| `16-25` | Resuelve current studio desde `adminState.studios`; fallback `adminState.studios[0]`. |
| `26-27` | Draft local desde `currentStudio.profile` y `professionalLocation`. |
| `81-99` | Carga galeria local con `FileReader`/data URLs. |
| `109-130` | Guardar llama `updateManagedStudioProfile`, local. |
| `140` | Texto `Perfil Publico futuro`. |
| `182-183` | Logo preparado para Marketplace/Public profile futuro. |
| `309` | Boton `Guardar estudio` sin RPC real. |

### Fuente Supabase real

Parcial:

- `adminState.studios` puede venir de `studio_flow_admin_get_artists()` si la RPC retorna studios.
- No hay RPC de guardado para `studio_profiles`.

### Contenido demo visible

- Fallback al primer studio demo.
- Logo y galeria locales.
- Guardado local.
- Perfil publico futuro.
- Marketplace futuro.

### Clasificacion

MIXTO.

Puede leer algo real si Wave A trae studios, pero el flujo sigue local y con fallback demo.

## Admin Marketplace

### Ruta/componente actual

No existe ruta admin Marketplace en:

- `src/App.jsx`
- `src/routes/paths.js`
- `src/pages/admin`

Referencias visibles relacionadas:

| Archivo | Hallazgo |
|---|---|
| `AdminStudioProfile.jsx` | Textos de Marketplace/perfil publico futuro. |
| `AdminDashboard.jsx` | Metricas y copy de marketplace premium/governance, pero calculadas desde mocks. |
| `QASandbox.jsx` | Texto `Estado marketplace / Reservas cliente`, sin marketplace real. |

### Clasificacion

DEMO / SIN IMPLEMENTAR.

No hay lectura ni escritura real de:

- `marketplace_profiles`
- `marketplace_listings`

## Admin Settings / System

### Ruta/componente actual

`/admin/system` renderiza:

`src/pages/admin/QASandbox.jsx`

No existe una pantalla Admin Settings dedicada.

Lineas clave:

| Linea | Hallazgo |
|---:|---|
| `132` | `PanelHeader title="QA Sandbox" eyebrow="Demo interno"`. |
| `136` | Fallback `Artista demo`. |
| `148` | `StatusPill` dice `Mock`. |
| `154` | `Acciones rapidas QA` con eyebrow `Estado mock`. |
| `159-161` | Simular artista inactivo, activar artista, agregar reserva mock. |
| `270` | Servicio/artista mock en reservas. |
| `279` | Texto `Agregar reserva mock`. |

### Contenido demo visible

- QA Sandbox entero.
- Navegacion de roles demo.
- Acciones mock sobre agenda.
- Reservas mock.
- Slots debug.
- Estado marketplace mock.

### Clasificacion

DEMO.

No hay settings real ni Supabase system status real.

## Tarjetas y metricas demo visibles

| Area | Ejemplos |
|---|---|
| Dashboard hero | Revenue global, eventos a revisar, ocupacion. |
| KPI cards | Ingresos totales, comision, riesgo, Flow Points, studio revenue, active clients. |
| Governance | Estudios pendientes/aprobados/suspendidos desde `reviewStudios` mock. |
| Portfolio | Studio metrics desde `studios`, `managedArtists`, `artistClients`, appointments mock. |
| Insights | Mensajes calculados desde mock appointments. |
| Flow Points | Totales y recompensas desde clients mock. |
| Top artistas | Ranking mock ejecutivo. |
| Clients | Spend, history, segment, status desde `managedClients` mock. |
| System | QA Sandbox, mock bookings, visual debug slots. |

## Botones conectados a datos ficticios

| Boton | Archivo | Estado |
|---|---|---|
| `Nueva artista` | `AdminArtists.jsx:192` | Sin accion real. |
| `Ver dashboard` artista | `AdminArtists.jsx:214` | Dashboard local del item. |
| `Guardar cambios` artista | `AdminArtists.jsx:429` | Mixto: artist profile real; studio location local. |
| `Nueva clienta` | `AdminClients.jsx:90` | Sin accion real. |
| Activar/Inactivar cliente | `AdminClients.jsx:109` | Local. |
| Guardar cliente | `AdminClients.jsx:153` | Local. |
| Ver historial cliente | `AdminClients.jsx:112` | Historial mock. |
| `Guardar estudio` | `AdminStudioProfile.jsx:309` | Local. |
| Dashboard governance approve/reject | `AdminDashboard.jsx` | Cambia `reviewStudios` local. |
| QA quick actions | `QASandbox.jsx:154-162` | Local/mock. |

## Matriz principal

| Componente | Fuente actual | Fuente correcta | Estado |
|---|---|---|---|
| Admin Dashboard | `mockData` directo + calculos locales | RPC dashboard agregada: economy, appointments, clients, studios, risk, audit | DEMO |
| Admin Artists | Supabase parcial via `adminArtistService`, fallback `adminState` demo/localStorage | RPCs admin artists completas + marketplace/status/approval/suspension | MIXTO |
| Admin Clients | `adminState.clients` desde `managedClients` mock | RPC admin clients + customer 360 + appointments + loyalty | DEMO |
| Admin Studios | `adminState.studios`, parcial desde Wave A, guardado local | RPC studio profile read/write + marketplace profile | MIXTO |
| Admin Marketplace | No existe componente/ruta; placeholders | RPC marketplace admin + listings/profiles | DEMO |
| Admin Settings/System | `QASandbox` demo/local | System settings real, health checks, audit, feature flags | DEMO |

## Porcentaje restante de contenido demo

Estimacion por componente visible para `platform_owner` real:

| Componente | Peso visible | Demo restante estimado |
|---|---:|---:|
| Admin Dashboard | Alto | 100% |
| Admin Artists | Alto | 40% |
| Admin Clients | Medio | 100% |
| Admin Studios | Medio | 70% |
| Admin Marketplace | Bajo/No route | 100% |
| Admin Settings/System | Medio | 100% |

Calculo simple por componente:

```text
(100 + 40 + 100 + 70 + 100 + 100) / 6 = 85%
```

Resultado estimado:

**85% del contenido admin visible o accesible para Platform Owner real sigue siendo demo, mock, local o placeholder.**

Si se pondera por uso real de pantallas actuales, el rango razonable es:

**80% - 90% demo restante.**

## Prioridad de eliminacion

| Prioridad | Alcance | Motivo |
|---|---|---|
| P0 | Admin Dashboard | Es la pantalla principal y esta casi totalmente basada en `mockData`. |
| P1 | Admin Clients | Clientes, historial, status y perfil son 100% mock/local. |
| P1 | Admin Studios write | Guardado de estudio sigue local y puede confundir al platform owner. |
| P2 | Admin Artists residual | Nueva artista, dashboard local, studio location y approvals siguen incompletos. |
| P3 | Admin Marketplace | No hay pantalla dedicada todavia. |
| P3 | Admin System/Settings | Reemplazar QA Sandbox por sistema real o esconderlo en produccion. |

## Veredicto

Studio Flow ya tiene una primera base real para Admin Artists, pero el area admin en conjunto sigue siendo mayormente demo para un `platform_owner` real.

El mayor foco de deuda visible es `AdminDashboard.jsx`, porque importa `mockData` directamente y calcula metricas ejecutivas ficticias. El segundo foco es `AdminClients.jsx`, que todavia no tiene ninguna conexion real a Supabase.

Admin Artists es la excepcion parcial: tiene lectura y escrituras core reales, pero conserva fallback demo y piezas locales. Admin Studios tambien es mixto porque puede leer studios reales desde Wave A, pero guarda localmente.
