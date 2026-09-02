# FASE 14.8 - ARTIST PROFILE SUPABASE MIGRATION

## Objetivo

Migrar Artist Profile desde `localStorage` a Supabase para los campos existentes del schema.

## Implementado

### Service layer

Archivo creado:

```txt
src/services/artistProfileService.js
```

Funciones:

```js
fetchArtistProfile({ artistId })
saveArtistProfile({ artistId, profileId, profile })
```

Operaciones Supabase:

```js
from('artist_profiles').select('*').eq('artist_id', artistId).maybeSingle()
from('profiles').update({ phone }).eq('id', profileId)
from('artist_profiles').upsert(payload, { onConflict: 'artist_id' })
```

## Schema mapping

| UI / cache | Supabase |
|---|---|
| `personalInfo.artisticName` | `artist_profiles.artistic_name` |
| `professionalProfile.shortBio` | `artist_profiles.bio` |
| `professionalProfile.specialties` | `artist_profiles.specialties` |
| `professionalLocation.customLocation.city` | `artist_profiles.city` |
| `photoUrl` | `artist_profiles.photo_path` |
| `portfolio[].url` | `artist_profiles.portfolio_paths` |
| `personalInfo.phone` | `profiles.phone` |

`specialties` se convierte de string separado por comas a `text[]`.

`portfolio` se convierte a arreglo de paths/URLs limitado a 12 elementos.

## AppContext integration

Archivo modificado:

```txt
src/contexts/AppContext.jsx
```

### Al iniciar sesion

Flujo:

```txt
hydrateSupabaseSession()
-> fetchAuthContext()
-> repairIncompleteAuthContext()
-> fetchArtistProfile({ artistId })
-> mapAuthContextToArtistProfile({ artistProfile })
-> setArtistState({ profile })
```

La hidratacion usa Supabase como fuente para:

- `artistic_name`
- `bio`
- `specialties`
- `city`
- `photo_path`
- `portfolio_paths`

Los campos no migrados siguen preservados desde cache local para no romper UI.

### Al guardar

Contexto expone:

```js
saveArtistProfile
isArtistProfileSaving
artistProfileError
```

Flujo:

```txt
saveArtistProfile(profile)
-> saveArtistProfileRecord()
-> update profiles.phone
-> upsert artist_profiles
-> mapAuthContextToArtistProfile()
-> setArtistState()
-> setSession()
```

Se actualiza tambien la sesion en memoria para reflejar:

- `session.profile.phone`
- `session.artist.display_name`

## UI integration

Archivo modificado:

```txt
src/pages/artist/ArtistProfileSettings.jsx
```

Antes:

```txt
Guardar perfil profesional
-> updateArtistProfile()
-> artistState
-> localStorage
```

Ahora:

```txt
Guardar perfil profesional
-> saveArtistProfile()
-> Supabase
-> artistState cache
-> session cache
```

Se agrego estado visual:

- `Guardando perfil...`
- `Perfil guardado`
- error de Supabase si falla

## Persistencia resultante

Persisten en Supabase:

```txt
artist_profiles.artistic_name
artist_profiles.bio
artist_profiles.specialties
artist_profiles.city
artist_profiles.photo_path
artist_profiles.portfolio_paths
profiles.phone
```

Por lo tanto sobreviven:

- logout
- reload
- cambio de dispositivo

## No modificado

Por instruccion, no se modifico:

- Agenda
- Marketplace
- Admin

## Nota tecnica

La UI actual genera `photoUrl` y `portfolio[].url` como Data URLs mediante `FileReader`. Esta fase persiste esos valores en `photo_path` y `portfolio_paths` porque aun no existe flujo de Supabase Storage en el proyecto.

El siguiente paso ideal seria subir imagenes a Storage y guardar paths reales, por ejemplo:

```txt
artist-profiles/{artistId}/photo.jpg
artist-profiles/{artistId}/portfolio/{fileName}.jpg
```

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

## Veredicto

Artist Profile ya no depende exclusivamente de `localStorage` para los campos migrados. Supabase es la fuente persistente para el perfil profesional del artista en las columnas existentes.
