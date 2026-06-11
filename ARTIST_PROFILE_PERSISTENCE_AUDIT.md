# FASE 14.7B - ARTIST PROFILE PERSISTENCE AUDIT

## Resumen ejecutivo

La edicion de Artist Profile no persiste en Supabase.

El flujo actual es:

```txt
ArtistProfileSettings.jsx
-> profileDraft
-> updateArtistProfile(nextProfile)
-> setArtistState(...)
-> localStorage['studio-flow-artist-state']
-> FIN
```

No existe service layer para artist profile y no hay llamadas a:

```js
.from('artist_profiles')
.from('artists')
.from('profiles')
.update(...)
.upsert(...)
```

La unica escritura Supabase relacionada con artist profile ocurre durante bootstrap/registro con:

```txt
studio_flow_bootstrap_artist()
```

Esa RPC crea o actualiza solamente:

- `artists.profile_id`
- `artists.display_name` al crear artista nuevo
- `artist_profiles.artistic_name`
- `artist_profiles.city`

Despues del registro, el boton **Guardar perfil profesional** no vuelve a escribir en Supabase.

## Componentes auditados

### ArtistProfile / ArtistSettings / ArtistProfessionalProfile

Implementacion real:

```txt
src/pages/artist/ArtistProfileSettings.jsx
```

Ruta principal:

```js
const { adminState, artistState, session, updateArtistProfile } = useApp()
```

Inicializacion:

```js
const sessionArtistProfile = session.artist
  ? mapAuthContextToArtistProfile({ profile: session.profile, artist: session.artist }, artistState.profile)
  : artistState.profile

const [profileDraft, setProfileDraft] = useState({
  ...sessionArtistProfile,
  professionalLocation: createArtistLocationSettings(sessionArtistProfile?.professionalLocation),
})
```

Boton de guardado:

```js
<Button className="full-width" onClick={saveProfile}>
  Guardar perfil profesional
</Button>
```

Funcion:

```js
const saveProfile = () => {
  const nextProfile = { ...profileDraft }
  updateArtistProfile(nextProfile)
}
```

### ArtistPublicProfile

No existe como componente independiente. El perfil publico se arma dentro de:

```txt
src/pages/client/ClientDashboard.jsx
```

Funcion:

```js
getArtistPublicProfile(artistState, artist)
```

Fuente:

```js
artistState.profile
adminState.artists
```

No lee Supabase directamente.

## AppContext

Archivo:

```txt
src/contexts/AppContext.jsx
```

Funcion:

```js
updateArtistProfile()
```

Linea aproximada:

```txt
1341
```

Hace:

```js
setArtistState((currentState) => ({
  ...currentState,
  profile: {
    ...currentState.profile,
    ...updates,
    personalInfo: {...},
    professionalProfile: {...},
    contactLinks: {...},
    portfolio: ...,
    professionalLocation: ...
  }
}))
```

Persistencia local:

```js
localStorage.setItem(artistStateStorageKey, JSON.stringify(artistState))
```

Linea aproximada:

```txt
837
```

Resultado:

```txt
AppContext recibe updates: SI
localStorage actualizado: SI
Supabase actualizado: NO
```

## Supabase disponible

Tabla:

```txt
artist_profiles
```

Columnas existentes:

```txt
artist_id
artistic_name
bio
specialties
photo_path
portfolio_paths
city
```

Tabla:

```txt
artists
```

Columnas relevantes:

```txt
display_name
status
```

Tabla:

```txt
profiles
```

Columnas relevantes:

```txt
display_name
email
phone
```

No existen columnas para:

```txt
whatsapp
instagram
facebook
references
years_experience
```

Esos campos requieren ampliacion de schema o tabla complementaria.

## Matriz campo por campo

| UI Field | Origen actual | AppContext | Service Layer | Supabase Table esperada | Status |
|---|---|---|---|---|---|
| `artistic_name` | `session.artist/session.profile` via mapper, luego `artistState.profile.personalInfo.artisticName` | `updateArtistProfile()` recibe `personalInfo.artisticName` | No existe | `artist_profiles.artistic_name` y posiblemente `artists.display_name` | LOCAL ONLY |
| `bio` | `artistState.profile.professionalProfile.shortBio` / mapper desde `artistProfile.bio` si existiera en authContext | `updateArtistProfile()` recibe `professionalProfile.shortBio` | No existe | `artist_profiles.bio` | LOCAL ONLY |
| `specialties` | Default hardcoded `Lash lifting, Brow design`, mapper desde `artistProfile.specialties` si existiera | `updateArtistProfile()` recibe `professionalProfile.specialties` | No existe | `artist_profiles.specialties` text[] | LOCAL ONLY |
| `city` | `professionalLocation.customLocation.city`; mapper tambien puede traer `artistProfile.city` | `updateArtistProfile()` recibe `professionalLocation` | No existe | `artist_profiles.city` | LOCAL ONLY |
| `photo_path` | `profileDraft.photoUrl`, generado como Data URL por FileReader | `updateArtistProfile()` recibe `photoUrl` | No existe upload/storage | `artist_profiles.photo_path` + Supabase Storage | LOCAL ONLY |
| `portfolio_paths` | `profileDraft.portfolio[]`, Data URLs por FileReader | `updateArtistProfile()` recibe `portfolio` | No existe upload/storage | `artist_profiles.portfolio_paths` + Supabase Storage | LOCAL ONLY |
| `whatsapp` | `profileDraft.contactLinks.whatsapp` | `updateArtistProfile()` recibe `contactLinks.whatsapp` | No existe | No hay columna actual | LOCAL ONLY |
| `instagram` | `profileDraft.contactLinks.instagram` | `updateArtistProfile()` recibe `contactLinks.instagram` | No existe | No hay columna actual | LOCAL ONLY |
| `facebook` | `profileDraft.contactLinks.facebook` | `updateArtistProfile()` recibe `contactLinks.facebook` | No existe | No hay columna actual | LOCAL ONLY |
| `references` | `profileDraft.professionalLocation.customLocation.references` | `updateArtistProfile()` recibe `professionalLocation.customLocation.references` | No existe | No hay columna actual en `artist_profiles` | LOCAL ONLY |
| `years_experience` | `profileDraft.professionalProfile.experienceYears` | `updateArtistProfile()` recibe `professionalProfile.experienceYears` | No existe | No hay columna actual | LOCAL ONLY |

## Trazas por campo

### `artistic_name`

UI:

```txt
ArtistProfileSettings.jsx
Input "Nombre artistico o estudio"
profileDraft.personalInfo.artisticName
```

Flujo:

```txt
UI Field
-> updateDraftSection('personalInfo', 'artisticName', value)
-> saveProfile()
-> updateArtistProfile(nextProfile)
-> artistState.profile.personalInfo.artisticName
-> localStorage['studio-flow-artist-state']
-> STOP
```

Supabase esperado:

```txt
artist_profiles.artistic_name
artists.display_name
```

Status:

```txt
LOCAL ONLY
```

### `bio`

UI:

```txt
Textarea "Descripcion profesional"
profileDraft.professionalProfile.shortBio
```

Flujo:

```txt
UI Field
-> updateDraftSection('professionalProfile', 'shortBio', value)
-> saveProfile()
-> updateArtistProfile(nextProfile)
-> localStorage
-> STOP
```

Supabase esperado:

```txt
artist_profiles.bio
```

Status:

```txt
LOCAL ONLY
```

### `specialties`

UI:

```txt
Input "Especialidades"
profileDraft.professionalProfile.specialties
```

Supabase esperado:

```txt
artist_profiles.specialties
```

Nota:

La UI maneja `specialties` como string separado por comas. Supabase espera `text[]`. Falta mapper de string -> array.

Status:

```txt
LOCAL ONLY
```

### `city`

UI:

```txt
Input "Ciudad"
profileDraft.professionalLocation.customLocation.city
```

Supabase esperado:

```txt
artist_profiles.city
```

Nota:

Durante bootstrap, `studio_flow_bootstrap_artist()` si escribe `p_city` en `artist_profiles.city`. Pero la edicion posterior no lo actualiza.

Status:

```txt
LOCAL ONLY
```

### `photo_path`

UI:

```txt
input#professional-photo-input
handlePhotoChange()
profileDraft.photoUrl
```

Origen:

```txt
FileReader -> Data URL
```

Supabase esperado:

```txt
Supabase Storage upload
artist_profiles.photo_path
```

Estado actual:

```txt
Data URL guardada en artistState/localStorage
```

Status:

```txt
LOCAL ONLY
```

### `portfolio_paths`

UI:

```txt
input#artist-portfolio-input
handlePortfolioChange()
profileDraft.portfolio[]
```

Origen:

```txt
FileReader -> Data URLs comprimidas/reescaladas
```

Supabase esperado:

```txt
Supabase Storage uploads
artist_profiles.portfolio_paths
```

Estado actual:

```txt
Array de objetos { id, label, url } en artistState/localStorage
```

Status:

```txt
LOCAL ONLY
```

### `whatsapp`, `instagram`, `facebook`

UI:

```txt
profileDraft.contactLinks.whatsapp
profileDraft.contactLinks.instagram
profileDraft.contactLinks.facebook
```

Flujo:

```txt
UI Field
-> updateDraftSection('contactLinks', field, value)
-> saveProfile()
-> updateArtistProfile()
-> localStorage
-> STOP
```

Supabase esperado:

```txt
No hay columnas actuales.
```

Opciones de schema:

```txt
artist_profiles.whatsapp
artist_profiles.instagram
artist_profiles.facebook
```

o:

```txt
artist_contact_links
```

Status:

```txt
LOCAL ONLY
```

### `references`

UI:

```txt
profileDraft.professionalLocation.customLocation.references
```

Supabase esperado:

```txt
No hay columna actual en artist_profiles.
```

Opciones:

```txt
artist_profiles.location_references
```

o tabla/location model separado.

Status:

```txt
LOCAL ONLY
```

### `years_experience`

UI:

```txt
profileDraft.professionalProfile.experienceYears
```

Supabase esperado:

```txt
No hay columna actual.
```

Opcion:

```txt
artist_profiles.years_experience integer
```

Status:

```txt
LOCAL ONLY
```

## Datos que si llegan desde Supabase

Por `studio_flow_get_auth_context()` y `studio_flow_bootstrap_artist()`:

```txt
session.profile
session.artist
```

El mapper puede consumir:

```txt
authContext.artistProfile
authContext.artist_profile
```

pero el RPC actual no devuelve explicitamente `artist_profiles` como objeto separado. Por eso el mapper esta preparado para datos que aun no llegan del RPC.

## Datos que se muestran en UI pero no existen en schema

```txt
whatsapp
instagram
facebook
references
years_experience
paymentMethods
primarySpecialty
professionalLocation.address
professionalLocation.state
professionalLocation.postalCode
professionalLocation.latitude
professionalLocation.longitude
```

## Veredicto final

Artist Profile editing esta en estado:

```txt
LOCAL ONLY
```

No hay campos `WORKING` para edicion posterior al registro.

La razon:

```txt
Guardar perfil profesional
-> updateArtistProfile()
-> setArtistState()
-> localStorage
```

No existe:

```txt
artistProfileService
updateArtistProfile RPC
Supabase Storage upload
update/upsert en artist_profiles
```

## Correccion futura recomendada

1. Ampliar `studio_flow_get_auth_context()` para devolver `artistProfile`.
2. Crear service layer:

```txt
src/services/artistProfileService.js
```

3. Persistir columnas existentes:

```txt
artists.display_name
profiles.display_name
profiles.phone
artist_profiles.artistic_name
artist_profiles.bio
artist_profiles.specialties
artist_profiles.city
artist_profiles.photo_path
artist_profiles.portfolio_paths
```

4. Agregar schema para campos faltantes:

```txt
whatsapp
instagram
facebook
references
years_experience
```

5. Subir imagenes a Supabase Storage y guardar paths, no Data URLs.
