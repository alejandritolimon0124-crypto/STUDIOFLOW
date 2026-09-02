# FASE 14.9 - ARTIST PROFILE SCHEMA COMPLETION

## Objetivo

Completar la migracion de los campos visibles de `Mi Perfil` de artista para que dejen de depender de `localStorage` y puedan persistir en Supabase.

## Archivos modificados

```txt
supabase/migrations/202606110001_artist_profile_schema_completion.sql
src/services/artistProfileService.js
src/utils/artistProfileMapper.js
```

No se modificaron:

```txt
Agenda
Marketplace
Admin
ArtistProfileSettings.jsx
```

`ArtistProfileSettings.jsx` ya enviaba `profileDraft` completo a `saveArtistProfile()`. La perdida ocurria en service/mapper porque esos campos no tenian columnas ni se serializaban hacia Supabase.

## Migracion SQL nueva

Archivo:

```txt
supabase/migrations/202606110001_artist_profile_schema_completion.sql
```

Columnas agregadas a:

```txt
artist_profiles
```

Campos:

```txt
primary_specialty text
years_experience integer
payment_methods jsonb not null default '{}'::jsonb
whatsapp text
instagram text
facebook text
tiktok text
website text
use_studio_location boolean not null default true
address_line text
state text
postal_code text
latitude numeric(10,7)
longitude numeric(10,7)
references text
google_maps_url text
```

Indices agregados:

```txt
artist_profiles_primary_specialty_idx
artist_profiles_use_studio_location_idx
```

La migracion usa:

```sql
add column if not exists
create index if not exists
```

para ser idempotente.

## Service layer

Archivo:

```txt
src/services/artistProfileService.js
```

### `fetchArtistProfile()`

Sigue leyendo:

```js
.from('artist_profiles').select('*')
```

Ahora `mapArtistProfileRow()` devuelve tambien:

```txt
primary_specialty
years_experience
payment_methods
whatsapp
instagram
facebook
tiktok
website
use_studio_location
address_line
state
postal_code
latitude
longitude
address_references
google_maps_url
```

### `saveArtistProfile()`

`profileToPayload()` ahora escribe:

| UI/App field | Supabase column |
|---|---|
| `professionalProfile.primarySpecialty` | `artist_profiles.primary_specialty` |
| `professionalProfile.experienceYears` | `artist_profiles.years_experience` |
| `professionalProfile.paymentMethods` | `artist_profiles.payment_methods` |
| `contactLinks.whatsapp` | `artist_profiles.whatsapp` |
| `contactLinks.instagram` | `artist_profiles.instagram` |
| `contactLinks.facebook` | `artist_profiles.facebook` |
| `contactLinks.tiktok` | `artist_profiles.tiktok` |
| `contactLinks.website` | `artist_profiles.website` |
| `professionalLocation.useStudioLocation` | `artist_profiles.use_studio_location` |
| `professionalLocation.customLocation.address` | `artist_profiles.address_line` |
| `professionalLocation.customLocation.state` | `artist_profiles.state` |
| `professionalLocation.customLocation.postalCode` | `artist_profiles.postal_code` |
| `professionalLocation.customLocation.latitude` | `artist_profiles.latitude` |
| `professionalLocation.customLocation.longitude` | `artist_profiles.longitude` |
| `professionalLocation.customLocation.address_references` | `artist_profiles.address_references` |
| computed/custom maps URL | `artist_profiles.google_maps_url` |

Se mantiene lo ya migrado:

```txt
artistic_name
bio
specialties
photo_path
portfolio_paths
city
profiles.phone
```

## Mapper

Archivo:

```txt
src/utils/artistProfileMapper.js
```

`mapAuthContextToArtistProfile()` ahora hidrata desde Supabase:

```txt
professionalProfile.primarySpecialty
professionalProfile.experienceYears
professionalProfile.paymentMethods
contactLinks.whatsapp
contactLinks.instagram
contactLinks.facebook
contactLinks.tiktok
contactLinks.website
professionalLocation.useStudioLocation
professionalLocation.customLocation.address
professionalLocation.customLocation.state
professionalLocation.customLocation.postalCode
professionalLocation.customLocation.latitude
professionalLocation.customLocation.longitude
professionalLocation.customLocation.address_references
professionalLocation.customLocation.googleMapsUrl
```

Esto evita que esos valores dependan de:

```txt
localStorage['studio-flow-artist-state']
```

cuando existe sesion real y `fetchArtistProfile()` devuelve el row de Supabase.

## AppContext

Archivo:

```txt
src/contexts/AppContext.jsx
```

No requirio cambio estructural.

El flujo existente ya hace:

```txt
hydrateSupabaseSession()
-> fetchArtistProfile({ artistId })
-> mapAuthContextToArtistProfile({ profile, artist, artistProfile })
-> setArtistState(...)
```

Al ampliar `fetchArtistProfile()` y el mapper, `hydrateSupabaseSession()` reconstruye ahora el perfil completo.

El guardado existente ya hace:

```txt
ArtistProfileSettings.jsx
-> saveArtistProfile(profileDraft)
-> AppContext.saveArtistProfile()
-> artistProfileService.saveArtistProfile()
-> Supabase
-> mapAuthContextToArtistProfile()
-> setArtistState(...)
```

## ArtistProfileSettings

Archivo:

```txt
src/pages/artist/ArtistProfileSettings.jsx
```

No requirio cambio.

Motivo:

El formulario ya guarda el objeto completo:

```js
await saveArtistProfile(nextProfile)
```

Los campos visibles ya estaban dentro de:

```txt
profileDraft.professionalProfile
profileDraft.contactLinks
profileDraft.professionalLocation
profileDraft.portfolio
profileDraft.photoUrl
profileDraft.personalInfo
```

La migracion completo la capa de schema, payload y mapper.

## Cobertura final

| Campo UI | Persistencia |
|---|---|
| Nombre artistico o estudio | `artist_profiles.artistic_name` |
| Numero celular | `profiles.phone` |
| Foto profesional | `artist_profiles.photo_path` |
| Especialidad principal | `artist_profiles.primary_specialty` |
| Especialidades | `artist_profiles.specialties` |
| Descripcion profesional | `artist_profiles.bio` |
| Anos de experiencia | `artist_profiles.years_experience` |
| Metodo efectivo | `artist_profiles.payment_methods.cash` |
| Metodo transferencia | `artist_profiles.payment_methods.transfer` |
| Metodo tarjeta | `artist_profiles.payment_methods.card` |
| Portafolio | `artist_profiles.portfolio_paths` |
| Usar ubicacion del estudio | `artist_profiles.use_studio_location` |
| Direccion del estudio | `artist_profiles.address_line` |
| Ciudad | `artist_profiles.city` |
| Estado | `artist_profiles.state` |
| Codigo postal | `artist_profiles.postal_code` |
| Latitud | `artist_profiles.latitude` |
| Longitud | `artist_profiles.longitude` |
| Referencias | `artist_profiles.address_references` |
| Google Maps URL | `artist_profiles.google_maps_url` |
| WhatsApp | `artist_profiles.whatsapp` |
| Instagram | `artist_profiles.instagram` |
| Facebook | `artist_profiles.facebook` |
| TikTok | `artist_profiles.tiktok` |
| Website | `artist_profiles.website` |

Campos visibles que siguen desconectados por decision de dominio:

```txt
profiles.email / auth email
security.password
security.confirmPassword
registration.studioStatus
```

Estos campos no deben guardarse como columnas libres de `artist_profiles`; requieren flujo Auth/status separado.

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

Nota:

El build tuvo que ejecutarse fuera del sandbox porque PowerShell dentro del sandbox fallo dos veces antes de arrancar con:

```txt
windows sandbox: spawn setup refresh
```

## Validacion funcional esperada

Con la migracion aplicada en Supabase Cloud:

1. Guardar Mi Perfil de Artista debe escribir las nuevas columnas en `artist_profiles`.
2. Recargar la app debe ejecutar `hydrateSupabaseSession()` y reconstruir `artistState.profile` desde Supabase.
3. Cerrar sesion e iniciar sesion debe volver a cargar los mismos campos.
4. En otro dispositivo, los campos deben aparecer porque ya no dependen de `localStorage`.

La prueba runtime de logout/login/cambio de dispositivo requiere aplicar la migracion en el proyecto Supabase y probar con una cuenta real.

## Veredicto

La migracion de schema y frontend para los campos visibles de `Mi Perfil` queda completada a nivel de codigo.

Estado:

```txt
BUILD OK
```
