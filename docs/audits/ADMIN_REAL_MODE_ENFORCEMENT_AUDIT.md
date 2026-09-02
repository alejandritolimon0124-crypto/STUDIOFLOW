# FASE 16.8B - ADMIN REAL MODE ENFORCEMENT AUDIT

## Objetivo

Auditar por que el panel admin puede seguir mostrando datos demo en una sesion real `platform_owner` despues de Fase 16.5 y 16.8.

Este documento no implementa codigo, no crea SQL y no modifica UI. Solo identifica las capas donde datos mock/localStorage pueden seguir visibles.

## Veredicto ejecutivo

El problema principal no esta en `AdminDashboard.jsx`, `AdminClients.jsx` o `AdminArtists.jsx` importando `mockData` directamente. El problema esta en la frontera de estado:

```text
AppContext.createInitialAdminState()
  -> getStoredAdminState()
  -> localStorage studio-flow-admin-state
  -> loaders Supabase async
  -> pantallas admin
```

`adminState` se inicializa siempre con datos demo antes de que carguen las RPC reales. Para sesiones reales, algunas ramas limpian el estado si falla la RPC, pero otras conservan el estado anterior.

Resultado:

- Dashboard real: protegido contra `source = 'mock'`, pero puede mostrar payload Supabase viejo desde localStorage hasta que recargue.
- Clients real: puede mostrar clientes demo antes de `loadAdminClients()`; si falla la RPC, se limpia a `[]`.
- Artists real: puede mostrar artistas/studios demo antes de `loadAdminArtists()` y tambien despues de fallo RPC, porque no limpia el estado anterior.
- Studios relacionados: pueden seguir siendo demo si `loadAdminArtists()` devuelve `payload.studios = []`, porque conserva `currentState.studios`.

## Sesion real vs mock

### Sesion real Supabase esperada

Archivo:

`src/contexts/AppContext.jsx`

| Linea | Hallazgo |
|---:|---|
| `59` | `initialSession.isMockSession = false`. |
| `152` | `createSessionFromAuthContext()` construye sesiones Supabase con `isMockSession: false`. |
| `1016-1029` | Los loaders reales corren solo si `session` existe, `!session.isMockSession` y rol admin. |

Para una sesion real `platform_owner`, el valor esperado es:

```js
session.isMockSession === false
```

### Riesgo con sesion restaurada

| Linea | Hallazgo |
|---:|---|
| `74-79` | `getStoredSession()` restaura una sesion de localStorage y usa `parsedSession.isMockSession ?? true`. |

Si una sesion vieja no tenia `isMockSession`, queda marcada como mock hasta que la hidratacion Supabase la reemplace.

Esto puede retrasar o impedir la carga real si el runtime queda trabajando sobre sesion almacenada stale.

## 1. `createInitialAdminState`

Archivo:

`src/contexts/AppContext.jsx`

| Linea | Hallazgo |
|---:|---|
| `305` | `createInitialAdminState()` inicia el estado admin. |
| `306-326` | Construye `initialStudios`, `initialArtists`, `initialClients` desde `mockData`. |
| `340-348` | Crea `dashboard` con `source: 'mock'`, `studios`, `artists`, `clients`, `appointments`, `users` y `systemStatus` demo. |
| `350-353` | Asigna `studios`, `users`, `artists`, `clients` al `adminState` inicial. |

Linea conceptual que permite datos demo:

```js
dashboard: {
  source: 'mock',
  studios: initialStudios,
  artists: initialArtists,
  clients: artistClients,
  appointments: artistAppointments,
  users,
  systemStatus,
}
```

Conclusion:

Si `adminState` se renderiza antes de completar las RPC reales, las pantallas pueden ver datos demo.

## 2. `getStoredAdminState`

Archivo:

`src/contexts/AppContext.jsx`

| Linea | Hallazgo |
|---:|---|
| `395` | `getStoredAdminState()` siempre parte de `createInitialAdminState()`. |
| `399` | Lee `localStorage.getItem('studio-flow-admin-state')`. |
| `402` | Si no hay storage valido, devuelve el estado inicial demo. |
| `404+` | Mezcla `initialAdminState` con `parsedAdminState`. |

Riesgo:

`localStorage` no esta separado por tipo de sesion. El mismo key guarda datos de mock, demo, real y estados intermedios:

```js
const adminStateStorageKey = 'studio-flow-admin-state'
```

Ademas, `getStoredAdminState()` puede restaurar datos viejos y completar faltantes con mocks. Esto permite que una sesion real arranque con datos demo/stale hasta que las RPC terminen.

## 3. `localStorage studio-flow-admin-state`

Archivo:

`src/contexts/AppContext.jsx`

| Linea | Hallazgo |
|---:|---|
| `63` | Define `adminStateStorageKey = 'studio-flow-admin-state'`. |
| `879` | Persiste todo `adminState` con `localStorage.setItem(...)`. |

Problema:

La persistencia no distingue:

- sesion mock
- sesion real
- role
- profile id
- source Supabase

Por eso una sesion real `platform_owner` puede restaurar un `adminState` generado previamente en demo.

## 4. `loadAdminDashboard`

Archivo:

`src/contexts/AppContext.jsx`

| Linea | Hallazgo |
|---:|---|
| `956` | Define `loadAdminDashboard()`. |
| `957` | No carga si `session.isMockSession`. |
| `958-960` | Solo carga para roles admin. |
| `966-970` | En exito reemplaza `adminState.dashboard` por payload real. |
| `972-982` | En error reemplaza dashboard por estado vacio `source: 'supabase'`. |

Conclusion:

Dashboard no conserva `dashboard.source = 'mock'` cuando la RPC falla. En fallo, se limpia a empty state real.

Riesgo restante:

Antes de que `loadAdminDashboard()` termine, `AdminDashboard.jsx` puede recibir dashboard inicial/stale. La pantalla mitiga el caso `source = 'mock'`, pero no distingue un payload Supabase viejo de localStorage.

## 5. `loadAdminArtists`

Archivo:

`src/contexts/AppContext.jsx`

| Linea | Hallazgo |
|---:|---|
| `933` | Define `loadAdminArtists()`. |
| `934` | No carga si `session.isMockSession`. |
| `935-937` | Solo carga para roles admin. |
| `941-946` | En exito reemplaza `artists`, pero solo reemplaza `studios` si `payload.studios.length > 0`. |
| `949-952` | En error solo guarda error y relanza; no limpia `artists` ni `studios`. |

Linea exacta que conserva studios demo:

```js
studios: payload.studios.length > 0 ? payload.studios : currentState.studios
```

Linea conceptual que conserva artists demo ante fallo:

```js
catch (error) {
  setAdminArtistsError(...)
  throw error
}
```

Conclusion:

Admin Artists es la principal fuga actual de demo en sesiones reales:

- antes de cargar, usa `adminState.artists` inicial/stored
- si falla la RPC, conserva artistas demo/stale
- si la RPC devuelve artistas reales pero sin studios, conserva studios demo/stale

## 6. `loadAdminClients`

Archivo:

`src/contexts/AppContext.jsx`

| Linea | Hallazgo |
|---:|---|
| `990` | Define `loadAdminClients()`. |
| `991` | No carga si `session.isMockSession`. |
| `992-994` | Solo carga para roles admin. |
| `1000-1004` | En exito reemplaza `clients` por payload real. |
| `1005-1009` | En error reemplaza `clients` por `[]`. |

Conclusion:

Admin Clients puede mostrar demo antes de que termine la carga real, porque `adminState.clients` arranca desde mock/localStorage.

Pero si la RPC falla, no conserva clientes demo: limpia a lista vacia real.

## 7. `AdminDashboard.jsx`

Archivo:

`src/pages/admin/AdminDashboard.jsx`

| Linea | Hallazgo |
|---:|---|
| `61` | Consume `adminState` y `session` desde AppContext. |
| `63` | Usa `dashboardSnapshot = adminState.dashboard || emptyDashboardData`. |
| `64-66` | Si no es mock y `dashboardSnapshot.source !== 'supabase'`, usa `emptyDashboardData`. |
| `67-72` | Todas las colecciones salen de `dashboardData`. |

Linea protectora:

```js
const dashboardData = session.isMockSession || dashboardSnapshot.source === 'supabase'
  ? dashboardSnapshot
  : emptyDashboardData
```

Conclusion:

`AdminDashboard.jsx` ya no usa `mockData` directamente para sesion real. Si `dashboard.source = 'mock'`, lo sustituye por empty state.

Riesgo:

Si localStorage contiene un dashboard viejo con `source = 'supabase'`, la pantalla lo considera real hasta que `loadAdminDashboard()` lo reemplace.

## 8. `AdminClients.jsx`

Archivo:

`src/pages/admin/AdminClients.jsx`

| Linea | Hallazgo |
|---:|---|
| `17-23` | Consume `adminState` y acciones desde AppContext. |
| `37-68` | Calcula estudios accesibles desde `adminState.studios`. |
| `72-76` | Filtra clientes desde `adminState.clients`. |

Linea que muestra lo que haya en estado:

```js
adminState.clients.filter((client) => {
```

Conclusion:

`AdminClients.jsx` no importa `managedClients` ni `mockData`, pero renderiza cualquier `adminState.clients`.

Por eso puede mostrar clientes demo si:

1. `adminState.clients` viene de `createInitialAdminState()`.
2. `adminState.clients` viene de `localStorage`.
3. `loadAdminClients()` todavia no termino.
4. `loadAdminClients()` no corre porque la sesion fue tratada como mock o rol no admin.

Si la RPC corre y falla, AppContext limpia `clients` a `[]`, asi que no deberia conservar demo despues del fallo.

## 9. `AdminArtists.jsx`

Archivo:

`src/pages/admin/AdminArtists.jsx`

| Linea | Hallazgo |
|---:|---|
| `23-29` | Consume `adminState` y acciones desde AppContext. |
| `50` | Para platform owner, `accessibleStudios = adminState.studios`. |
| `63` | Para platform owner, `accessibleArtists = adminState.artists`. |

Lineas que muestran lo que haya en estado:

```js
? adminState.studios
```

```js
? adminState.artists
```

Conclusion:

`AdminArtists.jsx` no importa `managedArtists`, pero renderiza cualquier `adminState.artists` y `adminState.studios`.

Por eso puede mostrar artistas demo si:

1. `adminState.artists` viene de `createInitialAdminState()`.
2. `adminState.artists` viene de `localStorage`.
3. `loadAdminArtists()` todavia no termino.
4. `loadAdminArtists()` falla y conserva estado anterior.

Tambien puede mostrar studios demo si la RPC de artistas devuelve `payload.studios = []`, por la rama de AppContext que preserva `currentState.studios`.

## Respuestas directas

### ¿`session.isMockSession` es false?

Para una sesion real hidratada desde Supabase, si:

```js
createSessionFromAuthContext() -> isMockSession: false
```

Pero hay riesgo de sesion restaurada vieja:

```js
parsedSession.isMockSession ?? true
```

Si la sesion almacenada no trae el flag, se considera mock.

### ¿`adminState` se inicializa con `mockData` antes de cargar Supabase?

Si.

`createInitialAdminState()` construye dashboard, studios, artists y clients desde `mockData`, y `getStoredAdminState()` parte de ese estado.

### ¿Al fallar una RPC conserva `mockData`?

Depende del loader:

| Loader | Fallo RPC | Conserva demo |
|---|---|---|
| `loadAdminDashboard` | Setea dashboard empty `source: 'supabase'` | No |
| `loadAdminClients` | Setea `clients: []` | No |
| `loadAdminArtists` | Solo setea error y relanza | Si |

### ¿`localStorage` esta restaurando datos demo viejos?

Puede hacerlo.

El key `studio-flow-admin-state` es global y se mezcla con `createInitialAdminState()`. No hay separacion por usuario, rol, tipo de sesion ni `source`.

### ¿`AdminDashboard` todavia usa datos mock en alguna rama?

Para sesion real, no si `dashboard.source = 'mock'`.

Si `session.isMockSession` es false y `dashboard.source !== 'supabase'`, usa empty state.

Riesgo restante: puede mostrar un payload viejo con `source = 'supabase'` restaurado desde localStorage.

### ¿`AdminClients` todavia usa `managedClients` en sesion real?

No directamente.

Pero `adminState.clients` puede venir de `managedClients` porque AppContext lo inicializa/restaura desde mock antes de la carga real.

### ¿`AdminArtists` todavia usa `managedArtists` en sesion real?

No directamente.

Pero `adminState.artists` puede venir de `managedArtists` porque AppContext lo inicializa/restaura desde mock antes de la carga real, y `loadAdminArtists()` no limpia ese estado si falla.

## Lineas exactas que permiten demo visible

| Archivo | Linea | Motivo |
|---|---:|---|
| `src/contexts/AppContext.jsx` | `305` | `createInitialAdminState()` crea estado admin demo. |
| `src/contexts/AppContext.jsx` | `340-348` | Dashboard inicial con `source: 'mock'` y colecciones demo. |
| `src/contexts/AppContext.jsx` | `350-353` | `studios`, `artists`, `clients` iniciales vienen de mock. |
| `src/contexts/AppContext.jsx` | `395-404` | `getStoredAdminState()` parte de mock y mezcla localStorage. |
| `src/contexts/AppContext.jsx` | `399` | Lee `studio-flow-admin-state`. |
| `src/contexts/AppContext.jsx` | `879` | Persiste cualquier `adminState` en el mismo key global. |
| `src/contexts/AppContext.jsx` | `945` | Conserva `currentState.studios` si la RPC de artists no devuelve studios. |
| `src/contexts/AppContext.jsx` | `949-952` | Fallo de `loadAdminArtists()` no limpia artists/studios. |
| `src/pages/admin/AdminClients.jsx` | `72` | Renderiza `adminState.clients`, sea real, demo o stale. |
| `src/pages/admin/AdminArtists.jsx` | `50` | Platform owner usa `adminState.studios`, sea real, demo o stale. |
| `src/pages/admin/AdminArtists.jsx` | `63` | Platform owner usa `adminState.artists`, sea real, demo o stale. |

## Diagnostico por modulo

| Modulo | Puede mostrar demo en sesion real | Causa |
|---|---|---|
| Dashboard | Poco probable | Protege `source = 'mock'`; riesgo de payload Supabase viejo en localStorage. |
| Clients | Si, temporalmente | `adminState.clients` inicia/restaura mock antes de RPC; fallo limpia a `[]`. |
| Artists | Si, temporalmente y ante fallo | `adminState.artists` inicia/restaura mock; fallo no limpia; studios pueden quedar mock. |

## Recomendacion para fase futura

No implementado aqui, pero la solucion de arquitectura deberia ser:

1. Separar estado demo y real por `session.isMockSession`.
2. No inicializar `adminState` real con `mockData`.
3. No restaurar `studio-flow-admin-state` para sesiones reales, o particionarlo por `profile_id` y `source`.
4. En sesiones reales, usar empty states mientras cargan las RPC.
5. En fallo de `loadAdminArtists()`, limpiar `artists` y `studios` a `[]`.
6. No conservar `currentState.studios` cuando `payload.studios` viene vacio en sesion real.

## Veredicto

El panel admin todavia puede mostrar demo en sesiones reales porque el modo real no esta enforced desde el estado base.

Las pantallas ya dependen mayormente de AppContext y service layer, pero AppContext sigue arrancando desde `mockData` y restaurando un localStorage compartido. Mientras eso ocurra, cualquier pantalla que renderice `adminState.*` puede mostrar demo antes de que la RPC complete, o indefinidamente si la RPC no corre o falla sin limpiar estado.

La fuga mas fuerte hoy es Admin Artists; la fuga mas temporal es Admin Clients; Dashboard esta mejor protegido, aunque todavia puede mostrar payload Supabase stale desde localStorage.
