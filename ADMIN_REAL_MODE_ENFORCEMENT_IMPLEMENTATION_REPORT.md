# FASE 16.8C - ADMIN REAL MODE ENFORCEMENT IMPLEMENTATION

## Objetivo

Eliminar definitivamente la aparicion de datos demo en sesiones reales admin, especialmente para `platform_owner`.

## Implementado

| Pieza | Resultado |
|---|---|
| Estado admin real | Sesiones reales arrancan con `artists: []`, `studios: []`, `clients: []` y dashboard vacio `source: 'supabase'`. |
| Estado admin mock | Sesiones demo siguen usando `mockData`. |
| Storage mock | Nuevo key `studio-flow-admin-state-mock`. |
| Storage real | Nuevo key por perfil `studio-flow-admin-state-real-{profile_id}`. |
| Storage legacy | Ya no se lee `studio-flow-admin-state` para adminState. |
| `loadAdminArtists()` | En exito reemplaza `artists` y `studios` directamente desde Supabase. |
| `loadAdminArtists()` error | Limpia `artists: []` y `studios: []`. |
| `loadAdminClients()` | Mantiene limpieza existente a `clients: []` en error. |
| Dashboard | Mantiene proteccion por `source = 'supabase'`. |
| Admin Artists | Agrega empty state real cuando no hay artistas. |
| Admin Clients | Agrega empty state real cuando no hay clientas. |

## Cambios principales

### `AppContext`

Archivo:

`src/contexts/AppContext.jsx`

Se agrego `createEmptyAdminState()`:

- `dashboard.source = 'supabase'`
- `dashboard.studios = []`
- `dashboard.artists = []`
- `dashboard.clients = []`
- `dashboard.appointments = []`
- `dashboard.users = []`
- `dashboard.systemStatus = []`
- `studios = []`
- `artists = []`
- `clients = []`

`createInitialAdminState({ isMockSession })` ahora:

- devuelve mock solo para sesiones mock
- devuelve estado vacio real para sesiones no mock

### Storage separado

Se reemplazo el storage admin compartido por:

```js
studio-flow-admin-state-mock
studio-flow-admin-state-real-{profile_id}
```

La sesion real usa:

```js
session.profile.id || session.user.id || session.authUser.id
```

para construir la clave real.

Esto evita que una sesion real lea datos guardados por demo o por otra cuenta.

### Recarga por cambio de sesion

`AppProvider` ahora recalcula `adminState` cuando cambia la clave de storage:

- login demo carga storage mock
- login real carga storage real del profile
- sin profile real, usa estado vacio

### `loadAdminArtists`

Antes:

```js
studios: payload.studios.length > 0 ? payload.studios : currentState.studios
```

Ahora:

```js
studios: payload.studios
```

En error ahora limpia:

```js
artists: []
studios: []
```

Esto elimina la fuga donde studios/artists demo quedaban vivos si la RPC fallaba o devolvia studios vacios.

### `loadAdminClients`

Se mantiene el comportamiento correcto existente:

```js
clients: []
```

cuando falla la RPC.

### Dashboard

Se mantiene la proteccion existente:

```js
session.isMockSession || dashboardSnapshot.source === 'supabase'
```

Como el estado real vacio ya trae `source = 'supabase'`, Dashboard muestra empty states reales y no mock.

## Empty states reales

### Admin Artists

Archivo:

`src/pages/admin/AdminArtists.jsx`

Cuando `filteredArtists.length === 0`, muestra:

```text
No hay artistas en este scope.
Cuando Supabase devuelva artistas reales, apareceran aqui.
```

### Admin Clients

Archivo:

`src/pages/admin/AdminClients.jsx`

Cuando `filteredClients.length === 0`, muestra:

```text
No hay clientas en este scope.
Cuando Supabase devuelva clientas reales, apareceran aqui.
```

## Garantia para Platform Owner real

Con `session.isMockSession = false`, el flujo queda:

```text
session real
  -> storage studio-flow-admin-state-real-{profile_id}
  -> createInitialAdminState({ isMockSession: false })
  -> estado admin vacio real
  -> RPC dashboard/artists/clients
  -> payload Supabase o empty state real
```

Por diseno, una sesion real ya no debe leer:

- `studio-flow-admin-state-mock`
- `studio-flow-admin-state`
- `managedArtists`
- `managedClients`
- `studios` mock
- dashboard mock

## Validacion

`npm run build` ejecutado correctamente.

Resultado:

- Vite compilo 136 modulos.
- PWA genero assets.
- Se mantiene advertencia existente de chunk mayor a 500 kB.

## No implementado

- No se modifico visualmente el layout.
- No se redisenaron Admin Artists ni Admin Clients.
- No se cambiaron RPCs.
- No se eliminaron mocks del modo demo.
- No se borra automaticamente el viejo `localStorage` `studio-flow-admin-state`; simplemente dejo de usarse para admin real/mock nuevo.

## Veredicto

La frontera real/demo quedo enforced en AppContext.

Una sesion real `platform_owner` ya no arranca desde `mockData`, no reutiliza storage demo y no conserva artistas/studios demo ante errores de RPC. Cuando Supabase no devuelve datos, las pantallas muestran empty states reales.
