# FASE 13.5 - REMOVE DEMO PROFILE SOURCE

## Resumen ejecutivo

El perfil de artista que ve la UI no sale directamente de `artist_profiles`.

La UI de Artist Dashboard, Artist Settings y sidebar usa principalmente:

- `artistState.profile`
- `adminState.artists`
- `adminState.studios`
- `localStorage`
- `src/services/mockData.js`

Supabase si se consulta durante login/registro mediante RPCs, pero el resultado se guarda en `session`, no se sincroniza hacia `artistState.profile`.

## Veredicto

**Mixto.**

Hay mezcla de:

- **Mock data**: `mockData.js` alimenta `adminState`, citas, clientas, estudios y artistas administrados.
- **Hardcoded data**: `AppContext.jsx` define defaults de perfil profesional con correo, telefono y especialidades demo.
- **LocalStorage cache**: `artistState` y `adminState` se leen y escriben en `localStorage`, por eso nombres como `Dennis Beauty Studio` o `dennis name` pueden persistir aunque no existan en el repo.
- **Supabase data parcial**: `fetchAuthContext()` trae contexto real, pero la UI investigada no lo usa como fuente primaria del perfil editable.

## Busqueda de textos solicitados

### `Dennis Beauty Studio`

No aparece hardcoded en archivos fuente.

Resultado: si la UI muestra `Dennis Beauty Studio`, la fuente mas probable es:

```js
localStorage['studio-flow-artist-state'].profile.personalInfo.artisticName
```

o:

```js
localStorage['studio-flow-admin-state'].studios[].profile.commercialName
```

### `dennis name`

No aparece hardcoded en archivos fuente.

Resultado: si la UI muestra `dennis name`, la fuente mas probable es:

```js
localStorage['studio-flow-artist-state'].profile.personalInfo.fullName
```

### `Valeria Moon`

Aparece como demo/hardcoded en:

- `src/services/mockData.js`
- `src/pages/client/ClientDashboard.jsx`
- `src/pages/auth/Register.jsx` como placeholder
- `src/layouts/DashboardLayout.jsx` como nombre mock filtrable

### `CDMX`

Aparece como demo/hardcoded en:

- `src/services/mockData.js`

## 1. Archivo exacto donde se generan esos datos

### Fuente demo principal

Archivo:

```txt
src/services/mockData.js
```

Datos encontrados:

```js
export const artistProfile = {
  studioId: 'studio-glow',
  name: 'Valeria Moon Studio',
  location: 'Polanco, CDMX',
}
```

Tambien:

```js
managedArtists: [
  {
    name: 'Valeria Moon Studio',
    city: 'CDMX',
    owner: 'Valeria Moon',
  }
]
```

Esta data entra al estado global desde `AppContext.jsx`:

```js
import { artistAppointments, artistClients, clientHistory, managedArtists, managedClients, studios, users, weeklySchedule } from '../services/mockData'
```

### Defaults hardcoded del perfil profesional

Archivo:

```txt
src/contexts/AppContext.jsx
```

Funcion:

```js
function createArtistProfessionalProfile(overrides = {}) {
```

Defaults detectados:

```js
personalInfo: {
  artisticName: '',
  fullName: '',
  phone: '55 0000 0000',
  email: 'valeria@studioflow.mx',
}
```

```js
professionalProfile: {
  primarySpecialty: 'Lash lifting y brow design',
  specialties: 'Lash lifting, Brow design',
}
```

```js
security: {
  email: overrides.security?.email || overrides.personalInfo?.email || 'valeria@studioflow.mx',
}
```

### Datos `Dennis`

No hay archivo fuente que genere literalmente:

- `Dennis Beauty Studio`
- `dennis name`

Por descarte del repo, esos valores vienen de estado persistido, no de hardcode fuente.

## 2. Fuente exacta que alimenta la UI

### ArtistSettings / Profile Settings

Archivo:

```txt
src/pages/artist/ArtistProfileSettings.jsx
```

Fuente:

```js
const { adminState, artistState, session, updateArtistProfile } = useApp()
```

El formulario editable se inicializa desde:

```js
const [profileDraft, setProfileDraft] = useState({
  ...artistState.profile,
  professionalLocation: createArtistLocationSettings(artistState.profile?.professionalLocation),
})
```

Campos visibles:

```js
value={profileDraft.personalInfo.artisticName || ''}
value={profileDraft.personalInfo.fullName}
value={profileDraft.personalInfo.phone}
value={profileDraft.personalInfo.email}
```

Conclusion: Artist Settings/Profile no lee `session.profile` ni `session.artist` como fuente principal. Lee `artistState.profile`.

### ArtistDashboard

Archivo:

```txt
src/pages/artist/ArtistDashboard.jsx
```

Fuente:

```js
const artistPersonalInfo = artistState.profile?.personalInfo || {}
const profileName = artistPersonalInfo.artisticName || artistPersonalInfo.fullName || ''
const artistDisplayName = profileName || primaryArtist?.owner || primaryArtist?.name || 'Artista profesional'
```

El nombre visible sale en este orden:

1. `artistState.profile.personalInfo.artisticName`
2. `artistState.profile.personalInfo.fullName`
3. `adminState.artists[].owner`
4. `adminState.artists[].name`
5. `'Artista profesional'`

El estudio visible sale de:

```js
const currentStudio = getStudioForArtist(...) || adminState.studios[0]
const studioProfile = currentStudio?.profile || {}
const studioDisplayName = getConfiguredStudioName(studioProfile.commercialName)
```

Por eso puede aparecer un estudio cacheado desde `adminState` aunque Supabase tenga otro dato.

### Sidebar / layout

Archivo:

```txt
src/layouts/DashboardLayout.jsx
```

Fuente:

```js
const artistStudioName = getCleanArtistBusinessName(artistStudio?.profile?.commercialName)
const artistName = role === 'artist'
  ? getCleanArtistBusinessName(artistState.profile?.personalInfo?.artisticName)
  : ''
const sidebarDisplayName = role === 'artist'
  ? artistStudioName || artistName || 'Artista Profesional'
  : ...
```

El sidebar prioriza:

1. `adminState.studios[].profile.commercialName`
2. `artistState.profile.personalInfo.artisticName`
3. `'Artista Profesional'`

## 3. Si existe fallback demo

Si, existe fallback demo.

### `artistState`

Archivo:

```txt
src/contexts/AppContext.jsx
```

Funcion:

```js
function createInitialArtistState() {
```

Inicializa:

```js
profile: {
  ...createArtistProfessionalProfile(),
  photoUrl: '',
  professionalLocation: createArtistLocationSettings(),
}
```

y tambien mete:

```js
appointments: artistAppointments.map(...)
clients: artistClients.map(...)
```

`artistAppointments` y `artistClients` vienen de `mockData.js`.

### `adminState`

Archivo:

```txt
src/contexts/AppContext.jsx
```

Funcion:

```js
function createInitialAdminState() {
```

Inicializa:

```js
studios: studios.map(...)
artists: managedArtists.map(...)
clients: managedClients.map(...)
```

Todo viene de `mockData.js`.

## 4. Si existe hardcoded object

Si.

Hardcoded principal:

```txt
src/services/mockData.js
```

Ejemplos:

```js
name: 'Valeria Moon Studio'
location: 'Polanco, CDMX'
name: 'Valeria Moon'
city: 'CDMX'
owner: 'Valeria Moon'
```

Hardcoded secundario:

```txt
src/contexts/AppContext.jsx
```

Ejemplos:

```js
phone: '55 0000 0000'
email: 'valeria@studioflow.mx'
primarySpecialty: 'Lash lifting y brow design'
specialties: 'Lash lifting, Brow design'
```

Hardcoded en cliente/marketplace:

```txt
src/pages/client/ClientDashboard.jsx
```

Ejemplos:

```js
artist: 'Valeria Moon'
artist: slot.artist || 'Valeria Moon'
artist: selectedArtistProfile?.owner || selectedArtistProfile?.name || 'Valeria Moon'
```

## 5. Si existe lectura desde localStorage

Si.

Archivo:

```txt
src/contexts/AppContext.jsx
```

Keys:

```js
const storageKey = 'studio-flow-session'
const adminStateStorageKey = 'studio-flow-admin-state'
const clientStateStorageKey = 'studio-flow-client-state'
const artistStateStorageKey = 'studio-flow-artist-state'
```

Lectura de perfil artista:

```js
function getStoredArtistState() {
  const storedArtistState = localStorage.getItem(artistStateStorageKey)
  const parsedArtistState = storedArtistState ? JSON.parse(storedArtistState) : null
  return parsedArtistState ? { ...initialArtistState, ...parsedArtistState, profile: ... } : initialArtistState
}
```

Escritura de perfil artista:

```js
useEffect(() => {
  localStorage.setItem(artistStateStorageKey, JSON.stringify(artistState))
}, [artistState])
```

Lectura de admin/studio:

```js
function getStoredAdminState() {
  const storedAdminState = localStorage.getItem(adminStateStorageKey)
}
```

Escritura de admin/studio:

```js
useEffect(() => {
  localStorage.setItem(adminStateStorageKey, JSON.stringify(adminState))
}, [adminState])
```

## Supabase y `artist_profiles`

Archivo:

```txt
src/services/profileBootstrapService.js
```

Supabase se consulta con:

```js
client.rpc('studio_flow_get_auth_context')
client.rpc('studio_flow_bootstrap_artist', ...)
```

Archivo:

```txt
src/contexts/AppContext.jsx
```

Login hidrata:

```js
const authContext = await repairIncompleteAuthContext(authSession, await fetchAuthContext())
const nextSession = createSessionFromAuthContext(authSession, authContext)
setSession(nextSession)
```

Pero `hydrateSupabaseSession()` no hace:

```js
setArtistState(...)
```

Por eso la data real de Supabase queda en:

```js
session.profile
session.artist
session.memberships
```

pero no reemplaza:

```js
artistState.profile
adminState.artists
adminState.studios
```

## Causa probable de `Dennis Beauty Studio` / `dennis name`

Como esos textos no existen en el repo, la causa mas probable es cache de navegador:

```js
localStorage['studio-flow-artist-state']
```

con:

```js
profile.personalInfo.artisticName = 'Dennis Beauty Studio'
profile.personalInfo.fullName = 'dennis name'
```

o cache de admin/studio:

```js
localStorage['studio-flow-admin-state']
```

con:

```js
studios[].profile.commercialName = 'Dennis Beauty Studio'
```

## Conclusion

El dashboard y settings de artista no estan conectados de forma completa a Supabase como fuente de verdad.

Aunque Auth, registro, login y `artist_profiles` funcionen, la UI investigada sigue alimentandose de estado local inicializado con mock data y persistido en `localStorage`.

Para remover la fuente demo hay que cambiar la hidratacion para que, al recibir `authContext` real, se derive `artistState.profile` desde `session.profile/session.artist` o desde una consulta real de perfil artista, y evitar que `localStorage['studio-flow-artist-state']` sobrescriba datos reales de Supabase.
