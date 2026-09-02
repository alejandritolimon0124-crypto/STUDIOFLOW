# FASE 16.8E - SYSTEM ISOLATION AUDIT

## Objetivo

Auditar tecnicamente como aislar QA, Demo, Mock y Sandbox de sesiones reales en Studio Flow, sin implementar cambios, sin crear tablas, sin crear RPCs y sin modificar permisos.

Prioridades:

1. Consistencia de negocio.
2. Eliminacion de deuda tecnica.
3. Migracion completa a Supabase.
4. No introducir nuevas dependencias.

## Resumen ejecutivo

`/admin/system` no tiene una fuente unica de verdad consistente:

- En `src/App.jsx`, `/admin/system` renderiza `QASandbox`.
- En `src/routes/AppRouter.jsx`, `paths.adminSystem` renderiza `AdminDashboard`.
- El componente real `System` no existe.
- `QASandbox` consume estado local, demo login y mutadores mock/locales.

La contaminacion principal no viene de Supabase, sino de capas heredadas:

```text
QASandbox.jsx
  -> useApp()
  -> agendaSettings local
  -> adminState mixto
  -> loginDemo
  -> mutadores QA de AppContext
  -> mockData.weeklySchedule
```

La recomendacion de aislamiento es:

- `QASandbox`: DEV ONLY.
- `loginDemo` y accesos demo: DEV ONLY o modo demo explicito.
- `/admin/system` real: PROD ONLY, pero aun no existe.
- `Agenda Observable`, `Visual Debug Slots`, `Reservas Activas`: eliminar de Sistema real; migrar solo si existe modulo Operacion/Agenda.
- `App.jsx` debe ser la unica fuente de verdad de routing o debe eliminarse/retirarse `AppRouter.jsx` si no esta activo.

## 1. Routing Audit

### Hallazgos

| Archivo | Linea | Comportamiento | Riesgo | Recomendacion |
|---|---:|---|---|---|
| `src/App.jsx` | `1` | Importa `BrowserRouter`, `Routes`, `Route`. | Este archivo controla routing completo si es el entry activo. | Tratar como fuente de verdad actual. |
| `src/App.jsx` | `7` | Importa `QASandbox`. | Acopla Sistema a QA Sandbox. | Aislar QA de ruta real. |
| `src/App.jsx` | `59-64` | Define `/admin` y `path="system"` como `<QASandbox />`. | Platform Owner real entra a QA. | `/admin/system` no debe renderizar QA en produccion. |
| `src/routes/AppRouter.jsx` | `1` | Define otro router con `Routes`. | Routing duplicado. | Confirmar si esta muerto o migrar a unica fuente. |
| `src/routes/AppRouter.jsx` | `27-32` | `paths.adminSystem` renderiza `<AdminDashboard />`. | Inconsistencia: la misma ruta puede resolver distinto segun router activo. | No mantener dos definiciones divergentes. |
| `src/routes/paths.js` | `13` | `adminSystem: '/admin/system'`. | Path compartido por routers con componentes distintos. | Mantener path, unificar componente real. |

### Quien controla realmente `/admin/system`

En el arbol principal auditado, `src/App.jsx` controla `/admin/system` porque:

- importa `BrowserRouter`
- declara las rutas completas
- importa `QASandbox`
- mapea `path="system"` a `<QASandbox />`

`src/routes/AppRouter.jsx` existe, pero no coincide con `App.jsx`. Si esta en desuso, es deuda tecnica. Si esta activo en algun entry alternativo, es un bug de routing.

### Fuente unica de verdad recomendada

No implementar aun, pero la decision debe ser una:

| Opcion | Recomendacion |
|---|---|
| `App.jsx` como router unico | Preferible si es el entry actual. Eliminar divergencia con `AppRouter.jsx`. |
| `AppRouter.jsx` como router unico | Requiere migrar `App.jsx` a usarlo y alinear layouts/protected routes. |

Para consistencia inmediata de negocio, la fuente actual debe considerarse `App.jsx`.

## 2. QASandbox Dependency Audit

Archivo:

`src/pages/admin/QASandbox.jsx`

### Imports

| Linea | Import | Clasificacion | Motivo |
|---:|---|---|---|
| `1` | `useMemo`, `useState` | DEV | Hooks para estado/calculos de debug. |
| `2` | `useNavigate` | DEV/MOCK | Usado por navegacion QA que ejecuta login demo. |
| `3-7` | `Button`, `Card`, `Input`, `PanelHeader`, `StatusPill` | LEGACY | UI reusable, no contaminante por si misma. |
| `8` | `useApp` | LEGACY | Expone funciones reales, mock y QA mezcladas. |
| `9` | `paths` | DEV/MOCK | Usado para navegacion QA entre roles demo. |
| `10-13` | `deriveMembershipsFromLegacyData`, `getStudioForArtist` | LEGACY | Selectores legacy basados en `adminState`, no Supabase directo. |

No hay imports directos de Supabase.

### Hooks y estado

| Linea | Hook/estado | Clasificacion | Riesgo |
|---:|---|---|---|
| `101` | `debugDate = '2026-05-18'` | MOCK | Fecha hardcodeada de QA. |
| `103-105` | `artistStudioMemberships` con `deriveMembershipsFromLegacyData` | LEGACY | Deriva memberships desde shape frontend, no tabla real. |
| `119-121` | `debugSlots` con `buildDebugSlots` | DEV | Calculo local de debug, no disponibilidad real. |

### AppContext consumido

| Linea | Dependencia | Clasificacion | Comentario |
|---:|---|---|---|
| `89` | `session` | REAL | Actor actual real o mock. Usado de forma confusa como "cliente seleccionado". |
| `90` | `login` | MOCK | En AppContext es alias de `loginDemo`. |
| `91` | `agendaSettings` | MOCK/LEGACY | Estado local creado desde `weeklySchedule`. |
| `92` | `adminState` | REAL/LEGACY | Puede contener datos Supabase reales, pero la pantalla los usa en flujo QA. |
| `93` | `getAvailableSlots` | LEGACY | Calculo local, no RPC Supabase. |
| `94` | `resetBookedSlots` | DEV | Mutador local QA. |
| `95` | `clearBlockedDates` | DEV | Mutador local QA. |
| `96` | `releaseAgenda` | DEV | Mutador local QA. |
| `97` | `blockTuesdays` | DEV | Mutador local QA. |
| `98` | `setPrimaryArtistStatus` | MOCK | Cambia `adminState.artists` local. |
| `99` | `addMockBooking` | MOCK | Inserta reserva hardcodeada local. |

### Funciones QA internas

| Linea | Funcion | Clasificacion | Motivo |
|---:|---|---|---|
| `15-20` | `timeToMinutes` | DEV | Utilidad local de calculo. |
| `22-26` | `minutesToTime` | DEV | Utilidad local de calculo. |
| `28-33` | `getScheduleIndex` | DEV | Utilidad local de calendario. |
| `35-44` | `overlapsBlock` | DEV | Calcula solapamiento local. |
| `46-84` | `buildDebugSlots` | DEV | Genera slots de debug desde estado local. |
| `124-127` | `quickNavigate` | MOCK | Ejecuta `login(role)` y navega; cambia sesion real a demo. |

### Dependencias Supabase reales

No hay dependencia Supabase directa.

Dependencia real indirecta:

- `adminState.artists`
- `adminState.studios`

pueden venir de Supabase despues de fases 16.1/16.2, pero `QASandbox` las usa para QA local, no como modulo real.

## 3. AppContext QA Audit

Archivo:

`src/contexts/AppContext.jsx`

### Funciones auditadas

| Funcion | Lineas | Vive en | Consumidor | Afecta sesiones reales | Debe permanecer |
|---|---:|---|---|---|---|
| `loginDemo` | `721-754` | AppContext | `Login.jsx`, `QASandbox.jsx` via `login` | Si, si se ejecuta en sesion real desde QA; cambia a demo. | Solo DEV/demo explicito. |
| `quickNavigate` | `QASandbox.jsx:124-127` | QASandbox | Botones Navegacion QA | Si; llama `loginDemo`. | No en produccion. |
| `buildDebugSlots` | `QASandbox.jsx:46-84` | QASandbox | Visual Debug Slots | No persiste, pero confunde con real. | DEV ONLY. |
| `addMockBooking` | `1514-1537` | AppContext | QASandbox | Si; muta `agendaSettings.bookedSlots` local. | DEV ONLY. |
| `releaseAgenda` | `1476-1489` | AppContext | QASandbox | Si; muta agenda local compartida. | DEV ONLY o migrar a agenda real. |
| `blockTuesdays` | `1491-1500` | AppContext | QASandbox | Si; muta agenda local compartida. | DEV ONLY. |
| `resetBookedSlots` | `1462-1467` | AppContext | QASandbox | Si; borra reservas locales visibles. | DEV ONLY. |
| `clearBlockedDates` | `1469-1474` | AppContext | QASandbox | Si; borra bloqueos locales. | DEV ONLY. |

### Impacto sobre sesiones reales

Estas funciones no escriben Supabase, pero si afectan runtime real porque AppContext es compartido por toda la app.

Riesgos:

- `quickNavigate` ejecuta login demo y reemplaza la sesion real.
- `setPrimaryArtistStatus` cambia `adminState.artists` local sin RPC ni audit.
- `addMockBooking` inserta una reserva local que puede alterar disponibilidad local y ClientDashboard.
- `releaseAgenda` / `blockTuesdays` cambian agenda local compartida.

## 4. Production Contamination Audit

Inventario de referencias encontradas en `src`.

### Routing y Sistema

| Archivo | Linea | Proposito | Riesgo | Accion recomendada |
|---|---:|---|---|---|
| `src/App.jsx` | `7` | Importa `QASandbox`. | QA entra al bundle/ruta admin real. | DEV ONLY o reemplazar ruta. |
| `src/App.jsx` | `64` | `/admin/system` renderiza `QASandbox`. | Contaminacion directa de produccion. | PROD debe usar System real u ocultar. |
| `src/routes/AppRouter.jsx` | `32` | `adminSystem` renderiza `AdminDashboard`. | Ruta duplicada divergente. | Unificar routing. |

### QASandbox

| Archivo | Linea | Proposito | Riesgo | Accion recomendada |
|---|---:|---|---|---|
| `QASandbox.jsx` | `79` | Texto `Reserva mock`. | Muestra mock en ruta real. | DEV ONLY. |
| `QASandbox.jsx` | `86` | Define componente `QASandbox`. | QA disponible como pagina admin. | DEV ONLY. |
| `QASandbox.jsx` | `119-120` | `debugSlots`. | Debug local presentado como operativo. | DEV ONLY. |
| `QASandbox.jsx` | `124-127` | `quickNavigate`. | Ejecuta login demo desde sistema. | ELIMINAR de produccion. |
| `QASandbox.jsx` | `132` | Header `QA Sandbox` / `Demo interno`. | Inconsistencia de negocio. | Ocultar en sesiones reales. |
| `QASandbox.jsx` | `148` | Pill `Mock`. | Evidencia de modulo no real. | Ocultar. |
| `QASandbox.jsx` | `154` | `Acciones rapidas QA`. | Botones mutan estado local. | DEV ONLY. |
| `QASandbox.jsx` | `161` | `Agregar reserva mock`. | Inserta reserva local. | DEV ONLY. |
| `QASandbox.jsx` | `167` | `Navegacion QA`. | Cambia roles demo. | ELIMINAR en prod. |
| `QASandbox.jsx` | `263` | `Reservas activas` / `Mock local`. | No son reservas Supabase. | MIGRAR a Operacion real o eliminar. |
| `QASandbox.jsx` | `270` | `Servicio mock` / `Artista mock`. | Datos falsos visibles. | ELIMINAR de prod. |
| `QASandbox.jsx` | `279` | Copy `Agregar reserva mock`. | Instruccion QA visible. | DEV ONLY. |

### AppContext

| Archivo | Linea | Proposito | Riesgo | Accion recomendada |
|---|---:|---|---|---|
| `AppContext.jsx` | `3` | Importa `mockData`, incluido `weeklySchedule`. | Mock sigue en contexto global. | Aislar mocks a modo demo. |
| `AppContext.jsx` | `63` | `studio-flow-admin-state-mock`. | Correcto para aislamiento. | Mantener DEV/demo. |
| `AppContext.jsx` | `87-92` | `mockUsers`. | Necesario para demo, riesgoso si accesible en prod. | DEV ONLY o demo flag. |
| `AppContext.jsx` | `293` | Agenda desde `weeklySchedule`. | Agenda real no Supabase. | MIGRAR a agenda real. |
| `AppContext.jsx` | `302` | `bookedSlots: []`. | Reservas locales en contexto global. | MIGRAR/aislar. |
| `AppContext.jsx` | `349`, `383` | Emails `.demo`. | Datos demo en estado cliente/mock. | Aislar a demo. |
| `AppContext.jsx` | `351`, `363` | `mock` source/notes. | Correcto solo en mock. | Mantener aislado por session. |
| `AppContext.jsx` | `721-754` | `loginDemo`. | Puede cambiar sesion real a demo. | DEV ONLY o boton demo explicito fuera de admin real. |
| `AppContext.jsx` | `1394`, `1435`, `1445`, `1457` | `bookedSlots` en booking local. | Disponibilidad local puede contaminar cliente real. | MIGRAR a Supabase. |
| `AppContext.jsx` | `1462-1537` | QA mutators + `addMockBooking`. | Acciones locales expuestas por context. | DEV ONLY. |
| `AppContext.jsx` | `1788-1789` | Expone `login` y `loginDemo`. | `login` alias demo facilita uso accidental. | Separar naming en fase futura. |
| `AppContext.jsx` | `1830-1835` | Expone funciones QA. | Cualquier pantalla puede consumirlas. | DEV ONLY export boundary. |

### Login demo

| Archivo | Linea | Proposito | Riesgo | Accion recomendada |
|---|---:|---|---|---|
| `src/pages/auth/Login.jsx` | `21` | Consume `loginDemo`. | Demo disponible en login. | Mantener solo si demo mode es intencional. |
| `src/pages/auth/Login.jsx` | `96-110` | Botones accesos demo. | Usuarios reales pueden entrar demo. | DEV ONLY o feature flag. |

### Otros modulos contaminados por mock/local

| Archivo | Linea | Proposito | Riesgo | Accion recomendada |
|---|---:|---|---|---|
| `src/pages/client/ClientDashboard.jsx` | `644` | Usa `agendaSettings.bookedSlots`. | Cliente real puede ver citas locales/mock. | MIGRAR a appointments Supabase. |
| `src/pages/client/ClientDashboard.jsx` | `1544` | Copy `reservas mock`. | Mock visible al cliente. | ELIMINAR/MIGRAR. |
| `src/pages/artist/ArtistAppointments.jsx` | `87` | Header `Nueva cita` eyebrow `Mock`. | Artist real ve flujo mock. | MIGRAR a appointments Supabase. |
| `src/pages/artist/ArtistDashboard.jsx` | `342` | Header `Nueva cita` eyebrow `Mock`. | Artist real ve flujo mock. | MIGRAR. |
| `src/modules/business/businessMetricsEngine.js` | `129` | Comentario mock para artista unico. | Logica asumida/no real. | Revisar antes de usar en prod. |
| `src/modules/marketing/reactivationEngine.js` | `1` | `mockClients`. | Motor con default demo. | Exigir input real o aislar demo. |
| `src/layouts/DashboardLayout.jsx` | `29-40` | Lista de nombres mock para filtrar business names. | Legacy de limpieza de mocks. | Revisar tras migracion. |
| `src/services/mockData.js` | `268` | `weeklySchedule`. | Fuente demo de agenda. | DEV/demo only. |
| `src/services/mockData.js` | `410` | `user-client-demo`. | Usuario demo. | DEV/demo only. |

## 5. Isolation Plan

No implementado. Plan de aislamiento propuesto.

### DEV ONLY

Elementos que pueden permanecer solo si estan protegidos por entorno/mode:

| Elemento | Motivo |
|---|---|
| `QASandbox.jsx` | Herramienta QA util, no modulo de negocio. |
| `quickNavigate` | Solo para saltar entre roles demo durante QA. |
| `buildDebugSlots` | Util para depurar disponibilidad local. |
| `addMockBooking` | Simula reserva local. |
| `releaseAgenda`, `blockTuesdays`, `resetBookedSlots`, `clearBlockedDates` | Mutadores QA de agenda local. |
| Botones demo en Login | Utiles para demo/dev; no para operacion real. |
| `mockData.js` | Seeds/mock visuales, no fuente de sesiones reales. |

### PROD ONLY

Elementos esperados para produccion, sin crear ahora:

| Elemento | Fuente real esperada |
|---|---|
| `/admin/system` | Modulo Sistema real, no QA. |
| Health operativo | RPC futura o servicio existente real. |
| Audit summary | `audit_events`. |
| Role health | `profiles`, `roles`, `user_role_assignments`. |
| Agenda/reservas | `appointments`, disponibilidad real o RPC existente futura. |

### ELIMINAR

Elementos que no deberian existir en sesiones reales:

| Elemento | Motivo |
|---|---|
| Navegacion QA dentro de `/admin/system` | Cambia sesion real a demo. |
| Label `Cliente seleccionado` usando `session.user` | Semantica incorrecta. |
| Texto `Mock local` en Sistema | Incompatible con modulo real. |
| `Servicio mock` / `Artista mock` en reservas visibles | Datos falsos. |
| Acciones que simulan artista activo/inactivo sin RPC | Evitan audit_events y scope real. |

### MIGRAR

Elementos con valor funcional si se conectan a Supabase:

| Elemento | Modulo destino | Fuente real |
|---|---|---|
| Agenda Observable | Operacion/Agenda | disponibilidad real, `appointments`, futura RPC de agenda. |
| Visual Debug Slots | Dev tool o Operacion debug interno | motor real de disponibilidad. |
| Reservas Activas | Operacion/Agenda | `appointments`. |
| `bookedSlots` local | Appointments reales | `appointments` + estado de reserva. |
| `weeklySchedule` | Configuracion agenda | schedules/availability reales cuando existan. |

## Plan por fases futuras

### Fase A: Aislar rutas

- Decidir router unico: `App.jsx` o `AppRouter.jsx`.
- Quitar divergencia de `/admin/system`.
- Mantener `QASandbox` fuera de nav real.

### Fase B: Aislar exports QA

- Separar `loginDemo` de `login` en AppContext.
- No exponer mutadores QA a pantallas productivas.
- Crear frontera conceptual `demoTools` o mover QA a contexto dev-only.

### Fase C: Sistema real

- Crear modulo real solo cuando existan fuentes reales.
- Empezar con lectura:
  - audit events
  - role health
  - scopes incompletos
  - system summary

### Fase D: Migrar agenda local

- Reemplazar `agendaSettings.bookedSlots` en cliente/artista por citas reales.
- Mantener calculos locales solo como fallback dev.

## Veredicto

La deuda critica no es visual; es de aislamiento.

`QASandbox` mezcla una ruta con nombre de negocio (`Sistema`) con herramientas de QA que pueden mutar estado local, ejecutar login demo y mostrar mock en sesiones reales.

Antes de implementar un Sistema real, Studio Flow debe decidir una fuente unica de routing y aislar todo lo QA/demo fuera de sesiones reales. La migracion a Supabase no debe continuar sobre `/admin/system` mientras esa ruta siga apuntando a QASandbox.
