# FASE 14.0 - ARTIST STATE HYDRATION

## Objetivo

Convertir Artist Profile Settings y Artist Dashboard para que usen Supabase como fuente de verdad cuando exista sesion real de artista.

## Implementado

### 1. Mapper creado

Archivo:

```txt
src/utils/artistProfileMapper.js
```

Funcion:

```js
mapAuthContextToArtistProfile(authContext, currentProfile)
```

El mapper traduce:

- `authContext.profile`
- `authContext.artist`
- `authContext.artistProfile` / `authContext.artist_profile` si el RPC lo agrega despues

hacia la estructura que ya consume la UI:

```js
artistState.profile.personalInfo.artisticName
artistState.profile.personalInfo.fullName
artistState.profile.personalInfo.phone
artistState.profile.personalInfo.email
artistState.profile.professionalProfile
artistState.profile.professionalLocation
```

Fuente prioritaria para nombre artistico:

1. `artistProfile.artistic_name`
2. `artist.artistic_name`
3. `artist.display_name`
4. `profile.display_name`

Con el RPC actual, `artist.display_name` recibe el valor de `p_artistic_name`, por eso un registro con `artistic_name = "Alex Studio"` se mapea como `Alex Studio`.

### 2. Hydration desde Supabase

Archivo:

```txt
src/contexts/AppContext.jsx
```

Durante:

```js
hydrateSupabaseSession()
```

cuando existe:

```js
authContext.artist
```

se actualiza:

```js
setArtistState((currentState) => ({
  ...currentState,
  profile: mapAuthContextToArtistProfile(authContext, currentState.profile),
}))
```

Tambien se aplica en `registerArtist()` despues de `bootstrapArtistProfile()`, para que el registro con sesion inmediata hidrate el perfil sin depender de `localStorage`.

### 3. ArtistProfileSettings

Archivo:

```txt
src/pages/artist/ArtistProfileSettings.jsx
```

Antes:

```js
useState({
  ...artistState.profile,
})
```

Ahora:

```js
const sessionArtistProfile = session.artist
  ? mapAuthContextToArtistProfile({ profile: session.profile, artist: session.artist }, artistState.profile)
  : artistState.profile
```

El formulario inicializa desde `session.artist/session.profile` cuando hay sesion real. La hidratacion principal ocurre antes en `AppContext`, por lo que el componente ya recibe `artistState.profile` alineado con Supabase despues del login.

### 4. ArtistDashboard

Archivo:

```txt
src/pages/artist/ArtistDashboard.jsx
```

Antes, el hero leia primero:

```js
artistState.profile.personalInfo
```

Ahora, cuando hay `session.artist`, usa:

```js
mapAuthContextToArtistProfile({ profile: session.profile, artist: session.artist }, artistState.profile)
```

Orden actual para el nombre visible:

1. `session.artist/session.profile` mapeado
2. `artistState.profile`
3. `adminState.artists`
4. fallback demo final

### 5. Sidebar / DashboardLayout

Archivo:

```txt
src/layouts/DashboardLayout.jsx
```

Se cambio la prioridad para artista:

1. nombre artistico real mapeado desde `session.artist/session.profile`
2. nombre artistico local
3. estudio/adminState
4. `Artista Profesional`

Esto evita que `adminState.studios[].profile.commercialName` cacheado gane sobre el artista real.

## No tocado

Se mantuvieron sin migrar:

- agenda
- marketplace
- loyalty
- citas mock
- client marketplace
- servicios mock

`mockData` sigue disponible para modulos no migrados.

## Resultado esperado

Si un artista registra:

```txt
artistic_name = "Alex Studio"
```

Supabase crea/retorna:

```js
session.artist.display_name = "Alex Studio"
```

El mapper produce:

```js
artistState.profile.personalInfo.artisticName = "Alex Studio"
```

Y la UI muestra automaticamente:

```txt
Alex Studio
```

sin depender de `localStorage['studio-flow-artist-state']` ni de `mockData`.

## Validacion

Comando ejecutado:

```bash
npm run build
```

Resultado:

```txt
vite build completed successfully
```

Advertencia no bloqueante:

```txt
Some chunks are larger than 500 kB after minification.
```

Tambien se ejecuto:

```bash
npm run lint
```

Resultado: falla con 41 problemas por errores preexistentes fuera de esta fase, principalmente en `dev-dist`, `PWAUpdatePrompt.jsx`, `AdminArtists.jsx`, `QASandbox.jsx` y `ClientDashboard.jsx`. No aparece `ArtistProfileSettings.jsx` en el resultado final de lint.

## Nota tecnica

El RPC actual `studio_flow_get_auth_context()` devuelve `artist` desde `artists`, pero no incluye explicitamente el row de `artist_profiles`.

El mapper quedo preparado para consumir `artistProfile` o `artist_profile` si el RPC se amplifica en una fase posterior. Mientras tanto, usa `artist.display_name`, que ya se crea desde `p_artistic_name` en `studio_flow_bootstrap_artist()`.
