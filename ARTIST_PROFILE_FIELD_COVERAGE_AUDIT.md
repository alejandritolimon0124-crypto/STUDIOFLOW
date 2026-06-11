# FASE 14.8B - ARTIST PROFILE FIELD COVERAGE AUDIT

## Resumen ejecutivo

`ArtistProfileSettings.jsx` ya persiste el nucleo del perfil profesional en Supabase:

- `artist_profiles.artistic_name`
- `artist_profiles.bio`
- `artist_profiles.specialties`
- `artist_profiles.city`
- `artist_profiles.photo_path`
- `artist_profiles.portfolio_paths`
- `profiles.phone`

Pero varias secciones visibles del formulario siguen siendo locales:

- contacto y redes
- experiencia
- metodo de pago
- direccion completa
- referencias
- coordenadas
- modo de ubicacion
- email/nombre completo desde la pantalla de perfil
- seguridad/password

No hay migracion ni columnas para esas secciones en el schema actual.

## Archivos auditados

```txt
src/pages/artist/ArtistProfileSettings.jsx
src/contexts/AppContext.jsx
src/services/artistProfileService.js
src/utils/artistProfileMapper.js
src/pages/client/ClientDashboard.jsx
supabase/migrations/202606100001_milestone_01_identity_access.sql
supabase/migrations/202606100002_milestone_02_studios_artists.sql
supabase/migrations/202606100008_milestone_08_marketplace.sql
```

## Estructura Supabase actual

### `profiles`

Archivo:

```txt
supabase/migrations/202606100001_milestone_01_identity_access.sql
```

Lineas aproximadas:

```txt
46-57
```

Columnas relevantes:

```txt
id uuid
display_name text
email text
phone text
default_role profile_default_role
status profile_status
created_at timestamptz
updated_at timestamptz
archived_at timestamptz
```

Puede almacenar:

- nombre legal/display name
- email
- phone

No puede almacenar:

- whatsapp
- instagram
- facebook
- tiktok
- website
- address
- references
- payment_methods
- business_hours
- google_maps_url
- years_experience
- specialties_extended
- marketplace_description

### `artists`

Archivo:

```txt
supabase/migrations/202606100002_milestone_02_studios_artists.sql
```

Lineas aproximadas:

```txt
73-82
```

Columnas relevantes:

```txt
id uuid
profile_id uuid
display_name text
status artist_status
created_at timestamptz
updated_at timestamptz
archived_at timestamptz
```

Puede almacenar:

- display name operativo del artista
- status del artista

No puede almacenar:

- bio
- redes
- ubicacion profesional
- formas de pago
- portafolio
- experiencia
- marketplace description

### `artist_profiles`

Archivo:

```txt
supabase/migrations/202606100002_milestone_02_studios_artists.sql
```

Lineas aproximadas:

```txt
145-157
```

Columnas relevantes:

```txt
id uuid
artist_id uuid
artistic_name text
bio text
specialties text[]
photo_path text
portfolio_paths text[]
city text
created_at timestamptz
updated_at timestamptz
```

Puede almacenar:

- `artistic_name`
- `bio`
- `specialties`
- `city`
- `photo_path`
- `portfolio_paths`

No puede almacenar actualmente:

- whatsapp
- instagram
- facebook
- tiktok
- website
- address
- references
- payment_methods
- business_hours
- google_maps_url
- years_experience
- specialties_extended separado de `specialties`
- marketplace_description
- latitude/longitude
- state/postal_code
- use_studio_location

### `marketplace_profiles`

Archivo:

```txt
supabase/migrations/202606100008_milestone_08_marketplace.sql
```

Lineas aproximadas:

```txt
20-38
```

Columnas relevantes:

```txt
id uuid
profile_type marketplace_profile_type
artist_id uuid
studio_id uuid
membership_id uuid
title text
summary text
visibility_status marketplace_visibility_status
published_at timestamptz
hidden_at timestamptz
created_at timestamptz
updated_at timestamptz
```

Puede almacenar:

- titulo publico
- resumen/descripcion publica
- visibilidad marketplace

No se usa actualmente desde `ArtistProfileSettings.jsx`.

## Flujo actual de guardado

### UI

Archivo:

```txt
src/pages/artist/ArtistProfileSettings.jsx
```

Lineas aproximadas:

```txt
50   profileDraft
192  saveProfile()
209  await saveArtistProfile(nextProfile)
530  Guardar perfil profesional
```

### AppContext

Archivo:

```txt
src/contexts/AppContext.jsx
```

Lineas aproximadas:

```txt
1395 saveArtistProfile(profile)
1408 saveArtistProfileRecord({ artistId, profileId, profile })
1421 mapAuthContextToArtistProfile(...)
1427 setArtistState(...)
1434 setSession(...)
```

Si no hay artista real o es sesion mock:

```txt
1400 updateArtistProfile(profile)
```

Eso actualiza `artistState` y termina persistiendo en `localStorage`.

### Service layer

Archivo:

```txt
src/services/artistProfileService.js
```

Lineas aproximadas:

```txt
35  profileToPayload()
52  fetchArtistProfile()
66  saveArtistProfile()
77  update profiles.phone
89  upsert artist_profiles
```

Payload real a Supabase:

```js
{
  artist_id,
  artistic_name,
  bio,
  specialties,
  photo_path,
  portfolio_paths,
  city,
  updated_at,
}
```

Ademas actualiza:

```js
profiles.phone
```

## Flujo actual de hidratacion

Archivo:

```txt
src/contexts/AppContext.jsx
```

Lineas aproximadas:

```txt
593 fetchArtistProfile({ artistId })
596 mapAuthContextToArtistProfile({ profile, artist, artistProfile })
```

Mapper:

```txt
src/utils/artistProfileMapper.js
```

Lineas aproximadas:

```txt
20  mapAuthContextToArtistProfile()
53  personalInfo.artisticName
55  personalInfo.phone
56  personalInfo.email
60  professionalProfile.primarySpecialty
61  professionalProfile.specialties
62  professionalProfile.shortBio
71  photoUrl
72  portfolio
89  professionalLocation.customLocation.city
```

Campos que el mapper conserva desde `currentProfile`/localStorage:

- `experienceYears`
- `paymentMethods`
- `contactLinks`
- ubicacion custom excepto `city`
- `security.password`
- `security.confirmPassword`

## Matriz de cobertura

| Campo UI | Estado React | Tabla | Columna | Guarda | Lee | Estado |
|---|---|---|---|---|---|---|
| Estado de validacion / `studioStatus` | `profileDraft.registration.studioStatus` | `artists` posible | `status` posible, no conectado | No | Local/cache | LOCAL_ONLY |
| Nombre artistico o estudio | `profileDraft.personalInfo.artisticName` | `artist_profiles` | `artistic_name` | Si | Si | FULLY_MIGRATED |
| Nombre completo | `profileDraft.personalInfo.fullName` | `profiles` | `display_name` | No desde este formulario | Si | DISCONNECTED |
| Numero celular | `profileDraft.personalInfo.phone` | `profiles` | `phone` | Si | Si | FULLY_MIGRATED |
| Correo electronico personal | `profileDraft.personalInfo.email` | `profiles` | `email` | No | Si | DISCONNECTED |
| Foto profesional | `profileDraft.photoUrl` | `artist_profiles` | `photo_path` | Si | Si | FULLY_MIGRATED |
| Especialidad principal | `profileDraft.professionalProfile.primarySpecialty` | `artist_profiles` recomendada | `primary_specialty` faltante | No | Deriva de `specialties` o local | SUPABASE_COLUMN_MISSING |
| Especialidades | `profileDraft.professionalProfile.specialties` | `artist_profiles` | `specialties` | Si | Si | FULLY_MIGRATED |
| Descripcion profesional | `profileDraft.professionalProfile.shortBio` | `artist_profiles` | `bio` | Si | Si | FULLY_MIGRATED |
| Anos de experiencia | `profileDraft.professionalProfile.experienceYears` | `artist_profiles` recomendada | `years_experience` faltante | No | Local/cache | SUPABASE_COLUMN_MISSING |
| Metodo de pago: Efectivo | `profileDraft.professionalProfile.paymentMethods.cash` | `artist_profiles` recomendada | `payment_methods` faltante | No | Local/cache | SUPABASE_COLUMN_MISSING |
| Metodo de pago: Transferencia | `profileDraft.professionalProfile.paymentMethods.transfer` | `artist_profiles` recomendada | `payment_methods` faltante | No | Local/cache | SUPABASE_COLUMN_MISSING |
| Metodo de pago: Tarjeta | `profileDraft.professionalProfile.paymentMethods.card` | `artist_profiles` recomendada | `payment_methods` faltante | No | Local/cache | SUPABASE_COLUMN_MISSING |
| Mi Portafolio | `profileDraft.portfolio[]` | `artist_profiles` | `portfolio_paths` | Si | Si | FULLY_MIGRATED |
| Usar ubicacion del estudio | `profileDraft.professionalLocation.useStudioLocation` | `artist_profiles` recomendada | `use_studio_location` faltante | No | Local/cache | SUPABASE_COLUMN_MISSING |
| Usar ubicacion personalizada | `!profileDraft.professionalLocation.useStudioLocation` | `artist_profiles` recomendada | `use_studio_location` faltante | No | Local/cache | SUPABASE_COLUMN_MISSING |
| Direccion del estudio | `profileDraft.professionalLocation.customLocation.address` | `artist_profiles` recomendada | `address_line` faltante | No | Local/cache | SUPABASE_COLUMN_MISSING |
| Ciudad | `profileDraft.professionalLocation.customLocation.city` | `artist_profiles` | `city` | Si | Si | FULLY_MIGRATED |
| Estado | `profileDraft.professionalLocation.customLocation.state` | `artist_profiles` recomendada | `state` faltante | No | Local/cache | SUPABASE_COLUMN_MISSING |
| Codigo Postal | `profileDraft.professionalLocation.customLocation.postalCode` | `artist_profiles` recomendada | `postal_code` faltante | No | Local/cache | SUPABASE_COLUMN_MISSING |
| Latitud | `profileDraft.professionalLocation.customLocation.latitude` | `artist_profiles` recomendada | `latitude` faltante | No | Local/cache | SUPABASE_COLUMN_MISSING |
| Longitud | `profileDraft.professionalLocation.customLocation.longitude` | `artist_profiles` recomendada | `longitude` faltante | No | Local/cache | SUPABASE_COLUMN_MISSING |
| Referencias | `profileDraft.professionalLocation.customLocation.references` | `artist_profiles` recomendada | `references` faltante | No | Local/cache | SUPABASE_COLUMN_MISSING |
| WhatsApp | `profileDraft.contactLinks.whatsapp` | `artist_profiles` recomendada | `whatsapp` faltante | No | Local/cache | SUPABASE_COLUMN_MISSING |
| Instagram | `profileDraft.contactLinks.instagram` | `artist_profiles` recomendada | `instagram` faltante | No | Local/cache | SUPABASE_COLUMN_MISSING |
| Facebook | `profileDraft.contactLinks.facebook` | `artist_profiles` recomendada | `facebook` faltante | No | Local/cache | SUPABASE_COLUMN_MISSING |
| Seguridad: Correo electronico | `profileDraft.security.email` | `profiles` / Supabase Auth | `email` | No | Si | DISCONNECTED |
| Seguridad: Contrasena | `profileDraft.security.password` | Supabase Auth | no tabla publica | No | No | DISCONNECTED |
| Seguridad: Confirmar contrasena | `profileDraft.security.confirmPassword` | Supabase Auth | no tabla publica | No | No | DISCONNECTED |

## Campos solicitados: cobertura actual

| Campo | Tabla actual | Columna actual | Cobertura |
|---|---|---|---|
| `whatsapp` | Ninguna | Ninguna | SUPABASE_COLUMN_MISSING |
| `instagram` | Ninguna | Ninguna | SUPABASE_COLUMN_MISSING |
| `facebook` | Ninguna | Ninguna | SUPABASE_COLUMN_MISSING |
| `tiktok` | Ninguna | Ninguna | SUPABASE_COLUMN_MISSING |
| `website` | Ninguna | Ninguna | SUPABASE_COLUMN_MISSING |
| `address` | `studio_profiles` tiene `address_line`, pero no artist custom address | Ninguna para artista | SUPABASE_COLUMN_MISSING |
| `references` | Ninguna | Ninguna | SUPABASE_COLUMN_MISSING |
| `payment_methods` | Ninguna | Ninguna | SUPABASE_COLUMN_MISSING |
| `business_hours` | `studio_profiles` no tiene; UI artista tampoco muestra campo directo | Ninguna | SUPABASE_COLUMN_MISSING |
| `google_maps_url` | Ninguna | Ninguna | SUPABASE_COLUMN_MISSING |
| `years_experience` | Ninguna | Ninguna | SUPABASE_COLUMN_MISSING |
| `specialties_extended` | `artist_profiles` tiene `specialties text[]` | No separada | SUPABASE_COLUMN_MISSING si se requiere extendida |
| `marketplace_description` | `marketplace_profiles.summary` existe | No conectado a UI perfil artista | DISCONNECTED |

## Perfil publico / Marketplace

Archivo:

```txt
src/pages/client/ClientDashboard.jsx
```

Funcion:

```txt
getArtistPublicProfile()
```

Lineas aproximadas:

```txt
252-264
```

Lee desde:

```js
artistState.profile
```

Campos usados por perfil publico:

- `photoUrl`
- `personalInfo.artisticName`
- `personalInfo.fullName`
- `professionalProfile.primarySpecialty`
- `professionalProfile.specialties`
- `professionalProfile.shortBio`
- `contactLinks`
- `professionalLocation`
- `portfolio`

Cobertura real:

- Foto, nombre artistico, bio, especialidades, ciudad y portafolio pueden venir de Supabase.
- Contacto/redes y ubicacion completa siguen locales.
- `marketplace_profiles` existe, pero el perfil publico actual no lo consulta.

## LocalStorage

Archivo:

```txt
src/contexts/AppContext.jsx
```

Lineas aproximadas:

```txt
449  getStoredArtistState()
463  merge de professionalProfile
470  merge de contactLinks
481  professionalLocation desde localStorage
```

Quedan solamente en `artistState/localStorage`:

- `registration.studioStatus`
- `professionalProfile.primarySpecialty`
- `professionalProfile.experienceYears`
- `professionalProfile.paymentMethods`
- `contactLinks.whatsapp`
- `contactLinks.instagram`
- `contactLinks.facebook`
- `professionalLocation.useStudioLocation`
- `professionalLocation.customLocation.address`
- `professionalLocation.customLocation.state`
- `professionalLocation.customLocation.postalCode`
- `professionalLocation.customLocation.latitude`
- `professionalLocation.customLocation.longitude`
- `professionalLocation.customLocation.references`
- `security.password`
- `security.confirmPassword`

## Recomendaciones de columnas

### `artist_profiles`

Recomendado para campos propios del artista:

```sql
alter table artist_profiles
  add column primary_specialty text,
  add column years_experience integer,
  add column payment_methods jsonb not null default '{}'::jsonb,
  add column whatsapp text,
  add column instagram text,
  add column facebook text,
  add column tiktok text,
  add column website text,
  add column use_studio_location boolean not null default true,
  add column address_line text,
  add column state text,
  add column postal_code text,
  add column latitude numeric(10, 7),
  add column longitude numeric(10, 7),
  add column references text,
  add column google_maps_url text,
  add column business_hours jsonb not null default '{}'::jsonb,
  add column specialties_extended jsonb not null default '[]'::jsonb;
```

Notas:

- `payment_methods` como `jsonb` permite `{ cash, transfer, card }`.
- `business_hours` como `jsonb` permite horarios flexibles sin bloquear agenda.
- `specialties_extended` como `jsonb` permite labels, categorias y orden, sin reemplazar `specialties text[]`.
- `latitude`/`longitude` numericas son suficientes para maps.

### `marketplace_profiles`

Recomendado para campos publicables/marketing:

```sql
alter table marketplace_profiles
  add column marketplace_description text,
  add column contact_links jsonb not null default '{}'::jsonb,
  add column public_photo_path text,
  add column public_portfolio_paths text[] not null default '{}';
```

Alternativa:

- Usar `marketplace_profiles.summary` como `marketplace_description`.
- Mantener contacto/redes en `artist_profiles` y que marketplace solo publique una vista filtrada.

### `profiles`

Recomendado para identidad base:

```sql
-- Ya existe:
-- display_name text
-- email text
-- phone text
```

Falta conectar desde UI si se quiere editar:

- `profiles.display_name`
- `profiles.email` o flujo Supabase Auth de cambio de email

## Veredicto final

Estado general:

```txt
PARCIALMENTE MIGRADO
```

Campos completamente migrados:

- nombre artistico
- telefono
- bio
- especialidades
- ciudad
- foto profesional como path/string
- portafolio como paths/strings

Campos con columna existente pero flujo desconectado:

- nombre completo -> `profiles.display_name`
- correo -> `profiles.email` / Supabase Auth
- marketplace description -> `marketplace_profiles.summary`

Campos visibles sin columna Supabase:

- primary specialty separada
- years experience
- payment methods
- redes sociales
- ubicacion profesional completa
- references
- business hours
- google maps url
- tiktok
- website
- specialties extended

La siguiente migracion necesaria no es UI, sino schema: ampliar `artist_profiles` o crear una tabla `artist_profile_details`/`artist_public_profiles` para cubrir redes, ubicacion, pagos y experiencia antes de que esos campos puedan sobrevivir logout, reload y cambio de dispositivo.
