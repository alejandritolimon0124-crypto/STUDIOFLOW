# FASE 14.4 - CLIENT STATE HYDRATION AUDIT

## Resumen ejecutivo

Despues de `CLIENT REPAIR SUCCESS`, la identidad real del cliente queda en:

```js
session.profile
session.client
```

pero el dashboard cliente sigue leyendo principalmente:

```js
clientState.profile
artistState.clients
mockData.js
localStorage['studio-flow-client-state']
```

No existe una hidratacion equivalente a la de artista que sincronice `authContext.client` hacia `clientState.profile`.

## Causa principal

Archivo:

```txt
src/contexts/AppContext.jsx
```

Funcion:

```js
hydrateSupabaseSession()
```

Linea aproximada:

```txt
558
```

Fuente de datos actual:

```js
const [clientState, setClientState] = useState(getStoredClientState)
```

Fuente de datos correcta:

```js
authContext.profile
authContext.client
authContext.clientProfile / authContext.client_profile
```

Diagnostico:

`hydrateSupabaseSession()` actualiza `artistState` cuando existe `authContext.artist`, pero no hace ningun `setClientState()` cuando existe `authContext.client`.

Codigo actual relevante:

```js
if (authContext.artist) {
  setArtistState(...)
}
```

Falta equivalente:

```js
if (authContext.client) {
  setClientState(...)
}
```

## 1. De donde sale exactamente el nombre mostrado

### ClientDashboard

Archivo:

```txt
src/pages/client/ClientDashboard.jsx
```

Funcion:

```js
ClientDashboard()
```

Linea aproximada:

```txt
488
```

Fuente de datos actual:

```js
const currentClient = {
  ...clientState.profile,
  ...artistClientProfile,
  name: clientState.profile?.name || artistClientProfile?.name,
}
```

El hero muestra:

```js
<strong className="client-hero-name">{currentClient.name}</strong>
```

Linea aproximada:

```txt
653
```

Por eso aparece:

```txt
María Fernanda
```

El valor nace en:

```txt
src/contexts/AppContext.jsx
```

Funcion:

```js
createInitialClientState()
```

Linea aproximada:

```txt
320
```

Dato hardcoded:

```js
profile: {
  id: 'client-mf',
  name: 'María Fernanda',
  email: 'mariana.lopez@studioflow.demo',
}
```

Fuente de datos correcta:

```js
session.profile.display_name
session.profile.email
session.profile.phone
session.client.id
session.client.display_name
session.client.email
session.client.phone
```

### DashboardLayout / sidebar

Archivo:

```txt
src/layouts/DashboardLayout.jsx
```

Funcion:

```js
DashboardLayout()
```

Linea aproximada:

```txt
168
```

Fuente de datos actual:

```js
const sidebarDisplayName = role === 'client'
  ? clientState.profile?.name || session.user?.name || 'Clienta'
  : ...
```

Fuente de datos correcta:

```js
session.client?.display_name
session.profile?.display_name
session.user?.name
```

Diagnostico:

El sidebar prioriza `clientState.profile.name`, asi que un cache/local demo gana sobre la sesion real.

## 2. De donde salen las tarjetas demo

### Flow Points

Archivo:

```txt
src/pages/client/ClientDashboard.jsx
```

Funcion:

```js
ClientDashboard()
```

Lineas aproximadas:

```txt
496-505, 670-688
```

Fuente de datos actual:

```js
flowPoints: clientState.profile?.flowPoints || 0
vipTier: clientState.profile?.vipTier || 'Glow'
```

Valores demo de origen:

```js
flowPoints: 98
vipTier: 'Glow'
```

Origen:

```txt
src/contexts/AppContext.jsx
createInitialClientState()
```

Fuente de datos correcta:

Actualmente Supabase `clients` y `client_profiles` no parecen exponer flow points/tier en `studio_flow_get_auth_context()`. La fuente correcta futura deberia ser una tabla/read model real de loyalty, o columnas reales devueltas por RPC:

```js
authContext.clientProfile.flow_points
authContext.clientProfile.vip_tier
```

o equivalente.

### Streak

Archivo:

```txt
src/pages/client/ClientDashboard.jsx
```

Lineas aproximadas:

```txt
497-498, 691-700
```

Fuente de datos actual:

```js
streak: clientState.profile?.streak || 0
```

Origen demo:

```js
streak: 4
```

en:

```txt
src/contexts/AppContext.jsx
createInitialClientState()
```

Fuente secundaria demo:

```js
artistClientProfile = getClientById(artistState.clients, clientLookupId)
```

`artistState.clients` viene de:

```txt
src/services/mockData.js
artistClients
```

Fuente de datos correcta:

```js
authContext.clientProfile.streak
```

o una tabla real de loyalty/activity si `client_profiles` no debe guardar streak.

### Rewards / beneficios / puntos por vencer

Archivo:

```txt
src/pages/client/ClientDashboard.jsx
```

Lineas aproximadas:

```txt
499, 501-520, 705-724
```

Fuente de datos actual:

```js
rewardsHistory: artistClientProfile?.rewardsHistory || []
const currentClientActivePoints = getActivePoints(currentClient)
const expiringSoon = getExpiringPoints(currentClient, 30)
const clientBenefits = vipBenefits[currentClient.vipTier] || vipBenefits.Glow
```

Origen demo:

```txt
src/services/mockData.js
artistClients[].rewardsHistory
```

Mas defaults hardcoded:

```js
const vipBenefits = {
  Glow: [...],
  Muse: [...],
  Icon: [...],
  Elite: [...],
}
```

Linea aproximada:

```txt
554
```

Fuente de datos correcta:

```js
authContext.clientProfile.rewards_history
authContext.clientProfile.flow_points
authContext.clientProfile.vip_tier
```

o tablas reales de loyalty/rewards agregadas por RPC.

### Recomendaciones inteligentes

Archivo:

```txt
src/pages/client/ClientDashboard.jsx
```

Linea aproximada:

```txt
564
```

Fuente de datos actual:

```js
const clientAutomations = generateClientAutomations(currentClient, artistServices)
```

`currentClient` viene de `clientState.profile` + `artistState.clients`.

`artistServices` viene de:

```txt
src/services/mockData.js
```

Motor:

```txt
src/modules/automation/smartAutomationEngine.js
```

Funcion:

```js
generateClientAutomations()
```

Linea aproximada:

```txt
295
```

Fuente de datos correcta:

```js
authContext.clientProfile
servicios reales disponibles
historial real de citas/loyalty
```

## 3. Componentes que siguen consumiendo `mockData`

### ClientDashboard

Archivo:

```txt
src/pages/client/ClientDashboard.jsx
```

Linea aproximada:

```txt
10
```

Import actual:

```js
import { clientAppointments, clientHistory, artistServices } from '../../services/mockData'
```

Usos:

- `artistServices`: disponibilidad, economia de puntos, recomendaciones.
- `clientAppointments`: citas demo.
- `clientHistory`: historial demo.

Lineas aproximadas:

```txt
543, 564, 610, 802, 1423
```

### AppContext

Archivo:

```txt
src/contexts/AppContext.jsx
```

Linea aproximada:

```txt
3
```

Import actual:

```js
import { artistAppointments, artistClients, clientHistory, managedArtists, managedClients, studios, users, weeklySchedule } from '../services/mockData'
```

Usos de cliente:

- `createInitialClientState()`: hardcoded demo local.
- `createInitialAdminState()`: `managedClients` + `clientHistory`.
- `createInitialArtistState()`: `artistClients`.

### DashboardLayout

Archivo:

```txt
src/layouts/DashboardLayout.jsx
```

No importa `mockData` directamente, pero consume:

```js
clientState.profile
```

que nace de defaults demo y `localStorage`.

## 4. Componentes que ya consumen Supabase

### Auth/session

Archivo:

```txt
src/contexts/AppContext.jsx
```

Funciones:

```js
hydrateSupabaseSession()
repairIncompleteAuthContext()
createSessionFromAuthContext()
```

Fuente Supabase:

```js
fetchAuthContext()
bootstrapClientProfile()
```

Resultado:

```js
session.profile
session.client
session.roles
```

Diagnostico:

Supabase llega hasta `session`, pero no baja a `clientState.profile`.

### profileBootstrapService

Archivo:

```txt
src/services/profileBootstrapService.js
```

Funciones:

```js
fetchAuthContext()
bootstrapClientProfile()
```

Fuente Supabase:

```js
client.rpc('studio_flow_get_auth_context')
client.rpc('studio_flow_bootstrap_client')
```

Diagnostico:

El servicio ya trae o repara contexto real, pero la UI cliente no lo usa como fuente primaria.

## 5. Que falta hidratar desde `authContext.client` y `client_profiles`

### Mapper faltante

No existe equivalente a:

```js
mapAuthContextToArtistProfile()
```

para cliente.

Falta crear:

```js
mapAuthContextToClientProfile(authContext, currentProfile)
```

Debe mapear minimo:

```js
profile.id -> profileId
client.id -> id
profile.display_name / client.display_name -> name
profile.email / client.email -> email
profile.phone / client.phone -> phone
clientProfile.photo_url -> photoUrl
```

Campos de loyalty/streak/rewards no estan garantizados por el RPC actual. Deben venir de `client_profiles` ampliado o de tablas reales de loyalty.

### Hydration faltante

Archivo:

```txt
src/contexts/AppContext.jsx
```

Funcion:

```js
hydrateSupabaseSession()
```

Falta:

```js
if (authContext.client) {
  setClientState((currentState) => ({
    ...currentState,
    profile: mapAuthContextToClientProfile(authContext, currentState.profile),
  }))
}
```

Tambien falta en:

```js
registerClient()
```

despues de:

```js
const authContext = await bootstrapClientProfile({ displayName, phone })
```

### RPC incompleta para client_profiles

Archivo:

```txt
supabase/migrations/202606100012_auth_foundation.sql
```

Funcion:

```sql
studio_flow_get_auth_context()
```

Fuente de datos actual:

```sql
'client', case when v_client.id is null then null else to_jsonb(v_client) end
```

Linea aproximada:

```txt
178
```

Fuente de datos correcta:

Agregar row de `client_profiles`, por ejemplo:

```sql
'clientProfile', case when v_client_profile.id is null then null else to_jsonb(v_client_profile) end
```

Diagnostico:

Aunque `client_profiles` exista en base de datos, el RPC actual no lo devuelve. Por eso la app no puede hidratar preferencias, birthday, preferred_services, last_visit o campos futuros de loyalty desde Supabase.

## Tabla de hallazgos

| Area | Archivo | Funcion | Linea aprox | Fuente actual | Fuente correcta |
|---|---|---:|---:|---|---|
| Nombre hero | `src/pages/client/ClientDashboard.jsx` | `ClientDashboard` | 488, 653 | `clientState.profile.name` | `session.client.display_name` / `session.profile.display_name` |
| Nombre sidebar | `src/layouts/DashboardLayout.jsx` | `DashboardLayout` | 168 | `clientState.profile.name` | `session.client.display_name` / `session.profile.display_name` |
| Estado cliente inicial | `src/contexts/AppContext.jsx` | `createInitialClientState` | 320 | hardcoded demo | mapper desde `authContext.client` |
| Persistencia cliente | `src/contexts/AppContext.jsx` | `getStoredClientState` | 338 | `localStorage['studio-flow-client-state']` | Supabase primero, local solo campos UI no migrados |
| Hydration cliente | `src/contexts/AppContext.jsx` | `hydrateSupabaseSession` | 558 | solo hidrata artista | hidratar `clientState` desde `authContext.client` |
| Register client | `src/contexts/AppContext.jsx` | `registerClient` | 654 | setea `session`, no `clientState` | tambien setear `clientState` real |
| Flow Points | `src/pages/client/ClientDashboard.jsx` | `ClientDashboard` | 496, 670 | `clientState.profile.flowPoints` demo | loyalty real / `clientProfile.flow_points` |
| Streak | `src/pages/client/ClientDashboard.jsx` | `ClientDashboard` | 498, 691 | `clientState.profile.streak` demo | activity/loyalty real |
| Rewards | `src/pages/client/ClientDashboard.jsx` | `ClientDashboard` | 499, 705 | `artistState.clients[].rewardsHistory` mock | rewards real / loyalty RPC |
| Citas proximas | `src/pages/client/ClientDashboard.jsx` | `ClientDashboard` | 610, 784 | `agendaSettings.bookedSlots + clientAppointments` mock | appointments reales |
| Historial | `src/pages/client/ClientDashboard.jsx` | `ClientDashboard` | 802, 1423 | `clientHistory` mock | appointments/history reales |
| Recomendaciones | `src/pages/client/ClientDashboard.jsx` | `ClientDashboard` | 564, 728 | `currentClient` demo + `artistServices` mock | client profile real + services reales |
| RPC context | `supabase/migrations/202606100012_auth_foundation.sql` | `studio_flow_get_auth_context` | 175 | devuelve `client`, no `client_profiles` | devolver `clientProfile` |

## Veredicto final

La UI cliente sigue en modo mixto/demo porque:

1. `clientState.profile` nace de `createInitialClientState()` con `María Fernanda`, `flowPoints: 98`, `vipTier: 'Glow'`, `streak: 4`.
2. `getStoredClientState()` permite que `localStorage['studio-flow-client-state']` conserve esos datos.
3. `hydrateSupabaseSession()` no sincroniza `authContext.client` hacia `clientState.profile`.
4. `ClientDashboard` y `DashboardLayout` priorizan `clientState.profile` antes que `session.client/session.profile`.
5. `studio_flow_get_auth_context()` no devuelve `client_profiles`, asi que aunque exista la fila, la app no tiene datos extendidos reales para reemplazar streak/rewards/preferencias.
6. Citas, historial, recomendaciones, marketplace y loyalty siguen usando mocks o motores locales alimentados por mocks.

## Correccion propuesta

No aplicada en esta fase.

Propuesta:

1. Crear `mapAuthContextToClientProfile()`.
2. Hidratar `clientState.profile` en `hydrateSupabaseSession()` cuando exista `authContext.client`.
3. Hidratar `clientState.profile` en `registerClient()` cuando `bootstrapClientProfile()` devuelva contexto.
4. Cambiar `DashboardLayout` y `ClientDashboard` para priorizar `session.client/session.profile`.
5. Ampliar `studio_flow_get_auth_context()` para devolver `clientProfile`.
6. Separar campos aun no migrados: loyalty, rewards, citas e historial pueden quedar con fallback local, pero no deben sobrescribir nombre/email/phone reales.
