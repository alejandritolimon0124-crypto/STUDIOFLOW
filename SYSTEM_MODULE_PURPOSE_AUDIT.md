# FASE 16.8D - SYSTEM MODULE PURPOSE AUDIT

## Objetivo

Auditar el modulo `Sistema` para determinar que partes siguen siendo QA Sandbox, mock/locales, reales o hardcodeadas, y definir si deben permanecer, eliminarse u operar como un modulo real.

Este documento no implementa codigo, no crea SQL y no modifica rutas. Solo auditoria funcional.

## Resumen ejecutivo

El modulo `Sistema` actual no es un sistema operativo real de plataforma. En la ruta principal usada por `App.jsx`, `/admin/system` renderiza `QASandbox`.

No existen archivos:

- `src/pages/admin/System.jsx`
- `src/pages/admin/SystemDashboard.jsx`

El contenido visible bajo `Sistema` es mayormente:

- QA Sandbox
- estado local de agenda
- datos mock derivados de `mockData`
- botones que mutan `AppContext` local
- navegacion rapida que ejecuta login demo

No hay lectura real de Supabase para health, audit logs, roles, scopes, RLS, RPC readiness o sistema.

## Rutas y componentes

| Punto | Archivo | Resultado |
|---|---|---|
| Ruta real principal | `src/App.jsx:64` | `/admin/system` renderiza `<QASandbox />`. |
| Nav admin | `src/layouts/AdminLayout.jsx:33` | Muestra `Sistema` si `canSeeSystem`. |
| Header admin | `src/layouts/AdminLayout.jsx:12` | Describe Sistema como `Estado operativo y modulos listos para conectar.` |
| Nav dashboard | `src/layouts/DashboardLayout.jsx:53`, `:92` | Incluye item `Sistema`. |
| Permiso nav dashboard | `src/layouts/DashboardLayout.jsx:107` | Sistema requiere `permissions.GOVERNANCE`. |
| Router alternativo | `src/routes/AppRouter.jsx:32` | Mapea `paths.adminSystem` a `AdminDashboard`, no a QASandbox. |

Riesgo de routing:

`App.jsx` y `AppRouter.jsx` no coinciden. Si `AppRouter.jsx` se usa en algun entry alternativo, `/admin/system` no abriria QA Sandbox sino `AdminDashboard`. En la app principal auditada, `App.jsx` importa y usa `QASandbox`.

## Clasificacion general

| Seccion | Estado | Fuente principal | Recomendacion |
|---|---|---|---|
| System.jsx | No existe | N/A | Crear modulo real o mantener inexistente hasta fase futura. |
| SystemDashboard.jsx | No existe | N/A | Crear modulo real si se separa de Dashboard. |
| QA Sandbox | Demo/QA | `QASandbox.jsx` + AppContext local | Ocultar para sesiones reales. |
| Agenda Observable | Mock/local | `agendaSettings.schedule` desde `weeklySchedule` mock | Migrar a Operacion/Agenda real o eliminar de Sistema. |
| Visual Debug Slots | QA/local | `buildDebugSlots()` local + `getAvailableSlots()` local | Mover a dev-only. |
| Reservas Activas | Mock/local | `agendaSettings.bookedSlots` | Eliminar de Sistema real. |
| Navegacion QA | Demo auth | `login(role)` demo | Eliminar/Ocultar en produccion. |
| Acciones rapidas QA | Mock/local | Mutadores locales de AppContext | Eliminar/Ocultar en produccion. |

## Fuente de datos real vs mock

### Datos usados por QASandbox

Archivo:

`src/pages/admin/QASandbox.jsx`

| Linea | Dato | Fuente | Real/Supabase |
|---:|---|---|---|
| `91` | `agendaSettings` | AppContext local | No |
| `92` | `adminState` | AppContext; mock o real segun sesion | Mixto |
| `93` | `getAvailableSlots` | Funcion local AppContext | No |
| `94-99` | Acciones QA | Mutadores locales AppContext | No |
| `101` | `debugDate = '2026-05-18'` | Hardcode local | No |
| `103-105` | Memberships derivadas | `deriveMembershipsFromLegacyData(adminState.artists)` | No directo |
| `107` | `primaryArtist` | Primer artista activo en `adminState.artists` | Mixto |
| `108-112` | `primaryStudio` | Derivado desde `adminState.studios` | Mixto |
| `113-118` | `availableSlots` | Calculo local sobre agenda/adminState | No |
| `119-121` | `debugSlots` | `buildDebugSlots()` local | No |

### Datos mock heredados desde AppContext

Archivo:

`src/contexts/AppContext.jsx`

| Linea | Hallazgo |
|---:|---|
| `3` | Importa `weeklySchedule` desde `mockData`. |
| `233` | Define `initialBlockedDates` local. |
| `291-302` | `createInitialAgendaSettings()` crea agenda local desde `weeklySchedule`. |
| `644` | `agendaSettings` vive en React state local. |
| `658` | `selectedDate` hardcodeado a `2026-05-18`. |

Conclusion:

La agenda que Sistema muestra no viene de Supabase. Es un laboratorio local de disponibilidad.

## Auditoria por seccion

### 1. `System.jsx`

| Campo | Resultado |
|---|---|
| Archivo | No existe. |
| Proposito original | No implementado. |
| Fuente de datos | N/A |
| Usa mock | N/A |
| Usa Supabase | No |
| Necesaria | Si, como modulo futuro real de health/audit/roles. |
| Recomendacion | Crear en fase futura; no confundir con QA Sandbox. |

### 2. `SystemDashboard.jsx`

| Campo | Resultado |
|---|---|
| Archivo | No existe. |
| Proposito original | No implementado. |
| Fuente de datos | N/A |
| Usa mock | N/A |
| Usa Supabase | No |
| Necesaria | Opcional; podria ser `System.jsx` directamente. |
| Recomendacion | Crear solo si Sistema necesita subpaneles. |

### 3. QA Sandbox

| Campo | Resultado |
|---|---|
| Archivo | `src/pages/admin/QASandbox.jsx` |
| Lineas | `86-290` |
| Proposito original | Validar rapido agenda, slots, roles demo y estados locales. |
| Fuente de datos | AppContext local: `agendaSettings`, `adminState`, funciones QA. |
| Usa mock | Si |
| Usa Supabase | No para acciones; puede leer `adminState` real si ya fue cargado, pero la logica sigue local. |
| Necesaria | Solo para desarrollo/QA. |
| Debe eliminarse | No necesariamente del repo; si del nav real. |
| Debe migrarse | No como tal; debe reemplazarse por Sistema real. |

Evidencia:

- `PanelHeader title="QA Sandbox" eyebrow="Demo interno"` en `QASandbox.jsx:132`.
- `StatusPill tone="rose">Mock</StatusPill>` en `QASandbox.jsx:148`.

### 4. Tarjeta principal QA Sandbox

| Campo | Resultado |
|---|---|
| Lineas | `131-151` |
| Proposito original | Mostrar artista primario, estado y "cliente seleccionado" para pruebas. |
| Fuente de datos | `primaryArtist` desde `adminState.artists`; `session.user` y `session.role`. |
| Usa mock | Si, especialmente en sesion demo o si `adminState` viene de mock. |
| Usa Supabase | Solo indirectamente si `adminState.artists` fue cargado por RPC real. |
| Sigue necesaria | No para Platform Owner real. |
| Recomendacion | Ocultar/eliminar de Sistema real. |

Por que Platform Owner aparece como cliente seleccionado:

La tarjeta no selecciona un cliente real. Muestra:

```jsx
<strong>Cliente seleccionado</strong>
<small>{session.user?.name || 'Sin sesion activa'} / {session.role || 'sin rol'}</small>
```

en `QASandbox.jsx:145-146`.

Entonces, si la sesion activa es `platform_owner`, la tarjeta imprime el nombre del Platform Owner bajo el label `Cliente seleccionado`. Es un error semantico de QA: usa `session.user` como actor actual, pero lo etiqueta como cliente.

### 5. Acciones rapidas QA

| Campo | Resultado |
|---|---|
| Lineas | `153-164` |
| Proposito original | Forzar estados de agenda/artista para validar UI. |
| Fuente de datos | Mutadores locales de AppContext. |
| Usa mock | Si |
| Usa Supabase | No |
| Sigue necesaria | Solo en desarrollo. |
| Recomendacion | Ocultar en sesiones reales; mover a dev-only. |

Botones auditados:

| Boton | Linea | Funcion | Efecto real |
|---|---:|---|---|
| Resetear reservas | `156` | `resetBookedSlots` | Limpia `agendaSettings.bookedSlots` local. |
| Liberar agenda | `157` | `releaseAgenda` | Activa dias, limpia bloques, fechas y reservas locales. |
| Bloquear todos los martes | `158` | `blockTuesdays` | Cambia martes a inactivo en state local. |
| Simular artista inactivo | `159` | `setPrimaryArtistStatus('Inactivo')` | Cambia `adminState.artists` local. |
| Activar artista | `160` | `setPrimaryArtistStatus('Activo')` | Cambia `adminState.artists` local. |
| Agregar reserva mock | `161` | `addMockBooking` | Inserta reserva local hardcodeada. |
| Limpiar fechas bloqueadas | `162` | `clearBlockedDates` | Limpia fechas bloqueadas locales. |

Funciones en AppContext:

| Funcion | Lineas | Persistencia |
|---|---:|---|
| `resetBookedSlots` | `1462-1467` | Local |
| `clearBlockedDates` | `1469-1474` | Local |
| `releaseAgenda` | `1476-1489` | Local |
| `blockTuesdays` | `1491-1500` | Local |
| `setPrimaryArtistStatus` | `1502-1512` | Local adminState |
| `addMockBooking` | `1514-1537` | Local hardcode |

### 6. Navegacion QA

| Campo | Resultado |
|---|---|
| Lineas | `166-173` |
| Proposito original | Saltar entre roles demo rapidamente. |
| Fuente de datos | `login(role)` desde AppContext. |
| Usa mock | Si |
| Usa Supabase | No |
| Sigue necesaria | No para Platform Owner real. |
| Recomendacion | Eliminar del modulo Sistema real; conservar solo dev-only. |

Evidencia:

```jsx
const quickNavigate = async (role, path) => {
  await login(role)
  navigate(path)
}
```

`login` en AppContext es alias de `loginDemo`, por lo que estos botones cambian la sesion a demo.

Impacto:

Un Platform Owner real puede perder la sesion real de trabajo al usar estos botones, porque ejecutan login demo.

### 7. Agenda Observable

| Campo | Resultado |
|---|---|
| Lineas | `175-190` |
| Proposito original | Ver horario semanal activo/bloqueado. |
| Fuente de datos | `agendaSettings.schedule`. |
| Usa mock | Si, parte desde `weeklySchedule` en `mockData`. |
| Usa Supabase | No |
| Sigue necesaria | No en Sistema. Si se migra, pertenece a Operacion/Agenda. |
| Recomendacion | Migrar a modulo real de Operacion o eliminar de Sistema. |

Fuente:

- `weeklySchedule` viene de `src/services/mockData.js:268`.
- `createInitialAgendaSettings()` lo usa en `AppContext.jsx:291-302`.

### 8. Bloqueos y descansos

| Campo | Resultado |
|---|---|
| Lineas | `192-226` |
| Proposito original | Ver fechas bloqueadas y descansos de agenda local. |
| Fuente de datos | `agendaSettings.blockedDates` y `agendaSettings.schedule[].blocks`. |
| Usa mock | Si/local |
| Usa Supabase | No |
| Sigue necesaria | No en Sistema real. |
| Recomendacion | Migrar a Agenda real si existe tabla de disponibilidad; ocultar por ahora. |

No consulta:

- `availability_slots`
- `schedules`
- `appointments`
- RPCs de agenda

### 9. Visual Debug Slots

| Campo | Resultado |
|---|---|
| Lineas | `228-260` |
| Proposito original | Depurar disponibilidad calculada y comparar slots visibles. |
| Fuente de datos | `debugDate`, `buildDebugSlots()`, `getAvailableSlots()`. |
| Usa mock | Si/local |
| Usa Supabase | No |
| Sigue necesaria | Solo para QA tecnico. |
| Recomendacion | Mover a dev-only; no debe estar en Sistema real. |

Detalle:

- `debugDate` esta hardcodeado a `2026-05-18` en `QASandbox.jsx:101`.
- `buildDebugSlots()` es una funcion local en `QASandbox.jsx:46-84`.
- `getAvailableSlots()` en `AppContext.jsx:1356-1419` calcula slots con `agendaSettings`, `adminState.artists` y `adminState.studios`.

Aunque el copy dice:

```text
Resultado real de disponibilidad para booking.
```

en `QASandbox.jsx:242`, no es disponibilidad real de Supabase; es calculo local.

### 10. Reservas Activas

| Campo | Resultado |
|---|---|
| Lineas | `262-285` |
| Proposito original | Ver reservas locales agregadas para bloquear slots. |
| Fuente de datos | `agendaSettings.bookedSlots`. |
| Usa mock | Si |
| Usa Supabase | No |
| Sigue necesaria | No en Sistema real. |
| Recomendacion | Eliminar del Sistema real; las reservas reales deben vivir en Operacion/Agenda. |

Evidencia:

- Header: `PanelHeader title="Reservas activas" eyebrow="Mock local"` en `QASandbox.jsx:263`.
- Fallback: `Servicio mock` / `Artista mock` en `QASandbox.jsx:270`.
- Empty copy: `Usa Agregar reserva mock...` en `QASandbox.jsx:279`.

## Elementos hardcodeados

| Elemento | Archivo/linea | Tipo |
|---|---:|---|
| `debugDate = '2026-05-18'` | `QASandbox.jsx:101` | Fecha QA fija. |
| `selectedDate = '2026-05-18'` | `AppContext.jsx:658` | Fecha global inicial fija. |
| `mockSlot.date = '2026-05-18'` | `AppContext.jsx:1516` | Reserva mock fija. |
| `mockSlot.time = '10:00'` | `AppContext.jsx:1518` | Reserva mock fija. |
| `mockSlot.artist = 'Artista Demo'` | `AppContext.jsx:1520` | Artista hardcodeado. |
| `mockSlot.service = 'Lash lifting'` | `AppContext.jsx:1521` | Servicio hardcodeado. |
| `Cliente seleccionado` | `QASandbox.jsx:145` | Label incorrecto para `session.user`. |

## Dennis Beauty Studio

No hay `Dennis` ni `Dennis Beauty Studio` hardcodeado en:

- `src/pages/admin/QASandbox.jsx`
- `src/contexts/AppContext.jsx`
- `src/services/mockData.js`

La busqueda local solo encuentra `Dennis` en documentos de auditoria previos.

Conclusion:

Si `Sistema` muestra `Dennis Beauty Studio`, la fuente mas probable no es codigo fuente hardcodeado sino estado persistido:

- `localStorage` de `artistState`
- `localStorage` de `adminState`
- perfil real Supabase cargado en `adminState`
- datos persistidos de fases anteriores antes de separar storage real/demo

Tras Fase 16.8C, admin real ya no deberia leer `studio-flow-admin-state` legacy, pero `QASandbox` aun puede mostrar `adminState` real si la RPC devuelve un artista/studio llamado Dennis.

## Tarjetas y proposito funcional

| Tarjeta | Proposito original | Valor actual para Platform Owner | Recomendacion |
|---|---|---|---|
| QA Sandbox | Resumen de estado QA de artista/sesion | Bajo; confunde actor con cliente | Ocultar |
| Acciones rapidas QA | Simular agenda/status/reserva | Riesgoso; muta estado local y demo | Ocultar dev-only |
| Navegacion QA | Cambiar roles demo rapido | Riesgoso; ejecuta login demo | Eliminar de sesiones reales |
| Agenda observable | Ver agenda semanal local | Bajo en Sistema; seria util en Operacion real | Migrar |
| Bloqueos y descansos | Ver bloqueos locales | Bajo; no persiste en Supabase | Migrar a Agenda real |
| Visual Debug Slots | Depurar disponibilidad | Util para QA tecnico | Dev-only |
| Reservas activas | Ver reservas mock locales | Bajo; no son citas reales | Eliminar/Migrar a Operacion |

## Matriz final

| Seccion | Archivo | Fuente de datos | Mock/Supabase | Necesaria | Recomendacion |
|---|---|---|---|---|---|
| System.jsx | No existe | N/A | N/A | Si, futuro | Crear modulo real |
| SystemDashboard.jsx | No existe | N/A | N/A | Opcional | Crear solo si hace falta |
| QA Sandbox | `QASandbox.jsx` | AppContext local | Mock/local | Solo QA | Ocultar |
| Agenda Observable | `QASandbox.jsx` | `agendaSettings.schedule` | Mock/local | No en Sistema | Migrar a Operacion |
| Visual Debug Slots | `QASandbox.jsx` | `buildDebugSlots`, `getAvailableSlots` | Mock/local | Solo QA | Dev-only |
| Reservas Activas | `QASandbox.jsx` | `agendaSettings.bookedSlots` | Mock/local | No | Eliminar/Migrar |
| Navegacion QA | `QASandbox.jsx` | `loginDemo` | Mock | No | Eliminar sesiones reales |
| Acciones rapidas QA | `QASandbox.jsx` | Mutadores locales | Mock/local | No | Ocultar |

## Que deberia ser Sistema real

Un modulo `Sistema` real para `platform_owner` deberia mostrar:

- `audit_events` recientes
- role assignments activos
- admins scoped sin `studio_id`
- ultimo `platform_owner` activo
- estado de RPCs criticas
- estado de constraints/audit_events
- health de tablas operativas
- errores de integridad de datos

Tablas/RPCs esperadas:

| Dominio | Fuente real |
|---|---|
| Auditoria | `audit_events` |
| Roles | `profiles`, `roles`, `user_role_assignments` |
| Permisos | `permissions`, `role_permissions` |
| Riesgo | `risk_flags`, `sanctions` |
| Health | RPC `studio_flow_admin_get_system_status` |
| Role health | RPC `studio_flow_admin_get_role_health` |
| Audit summary | RPC `studio_flow_admin_get_audit_summary` |

## Veredicto

El modulo `Sistema` actual es QA Sandbox, no Sistema.

Para Platform Owner real, debe ocultarse o reemplazarse. Sus tarjetas actuales sirven para validar agenda local, simular roles demo y depurar slots, pero no aportan health operativo real ni datos persistidos de Supabase.

La recomendacion es:

1. Ocultar `QASandbox` en sesiones reales.
2. Crear un modulo `System` real con audit, roles, scopes y health.
3. Mover Agenda Observable y Visual Debug Slots a un entorno dev-only o a un modulo Operacion real cuando existan RPCs de agenda.
4. Eliminar Navegacion QA y Acciones rapidas QA del flujo de Platform Owner real.
