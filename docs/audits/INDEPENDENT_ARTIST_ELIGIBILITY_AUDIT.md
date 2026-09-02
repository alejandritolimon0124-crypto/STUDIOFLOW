# FASE 17.8A - INDEPENDENT ARTIST ELIGIBILITY AUDIT

## Objetivo

Determinar si Marketplace, Governance y Publication obligan actualmente a que un artista tenga studio, considerando la regla oficial:

```text
Un artista NO requiere studio para existir.
```

Este documento no implementa codigo y no modifica archivos productivos. Solo auditoria.

## Veredicto ejecutivo

Marketplace, por schema y por RPC de lectura, no obliga a que un artista tenga studio.

La infraestructura soporta tres tipos de publicacion:

```text
artist
studio
membership
```

Un artista independiente puede aparecer en Marketplace si tiene:

```text
marketplace_profile profile_type = artist visible
marketplace_listing visible
artists.status = active
service_offerings owner_type = artist active
```

No necesita:

```text
studio_id
studio_status = approved
membership_id
```

La confusion viene de dos capas:

1. `ArtistLayout` muestra `En validacion` desde `studioStatus`, incluso si no hay studio, porque el fallback de governance trata `undefined` como `pending`.
2. Governance Write Core implementado en Fase 17.8 es studio-based (`studio_flow_admin_review_studio`), por lo que no resuelve publicacion de artistas independientes.

Conclusion para Dennis Beauty Studio:

```text
Dennis NO esta bloqueada por no tener studio aprobado.
Dennis esta bloqueada porque no tiene marketplace publication visible.
```

## 1. Marketplace schema

Archivo:

`supabase/migrations/202606100008_milestone_08_marketplace.sql`

### `marketplace_profiles`

| Linea | Hallazgo |
|---:|---|
| `1-5` | `marketplace_profile_type` permite `artist`, `studio`, `membership`. |
| `20-31` | `marketplace_profiles` tiene `artist_id`, `studio_id`, `membership_id`, `visibility_status`. |
| `33-37` | Constraint exige exactamente una entidad segun `profile_type`. |
| `34` | Para `profile_type = artist`: `artist_id is not null`, `studio_id is null`, `membership_id is null`. |
| `40-42` | Unique parcial para profile por artista. |

Condicion exacta para artista independiente:

```sql
profile_type = 'artist'
and artist_id is not null
and studio_id is null
and membership_id is null
```

Esto confirma que `marketplace_profiles` representa una entidad mixta:

| Tipo | Representa |
|---|---|
| `artist` | Artista independiente o artista publicado como individuo. |
| `studio` | Studio publicado como marca/lugar. |
| `membership` | Artista dentro de un studio. |

### `marketplace_listings`

| Linea | Hallazgo |
|---:|---|
| `57-68` | `marketplace_listings` tiene `marketplace_profile_id`, `artist_id`, `studio_id`, `membership_id`, `visibility_status`. |
| `59` | Todo listing apunta a un `marketplace_profile`. |
| `60-62` | `artist_id`, `studio_id`, `membership_id` son nullable. |
| `64` | `visibility_status` default `visible`. |

`marketplace_listings` tambien es mixto. Puede representar:

- listing de artista
- listing de studio
- listing de membership

No hay constraint que obligue `studio_id` para listings de artista.

## 2. Marketplace Read RPC

Archivo:

`supabase/migrations/202606110011_marketplace_read.sql`

### Target resolution

| Linea | Hallazgo |
|---:|---|
| `18` | Lee `mp.profile_type`. |
| `21` | `artist_id = coalesce(ml.artist_id, mp.artist_id, asm.artist_id)`. |
| `22` | `studio_id = coalesce(ml.studio_id, mp.studio_id, asm.studio_id)`. |
| `23` | `membership_id = coalesce(ml.membership_id, mp.membership_id)`. |
| `30` | `artist_studio_memberships` se usa solo via `left join`. |

Para `profile_type = artist`, `mp.artist_id` basta. No se requiere membership ni studio.

### Joins operativos

| Linea | Hallazgo |
|---:|---|
| `70` | `join artists a on a.id = lt.artist_id`. Requiere artista. |
| `71` | `left join artist_profiles`. Perfil opcional para enriquecer. |
| `72` | `left join studios`. Studio opcional. |
| `73` | `left join studio_profiles`. Studio profile opcional. |

El studio no es obligatorio porque el join es `left join`.

### Servicios

| Linea | Hallazgo |
|---:|---|
| `100` | Permite servicios `owner_type = artist` con `so.artist_id = lt.artist_id`. |
| `101` | Permite servicios `owner_type = studio`. |
| `102` | Permite servicios `owner_type = membership`. |
| `108` | Exige `services.service_count > 0`. |

Para artista independiente, basta:

```sql
service_offerings.owner_type = 'artist'
and service_offerings.artist_id = lt.artist_id
and service_offerings.status = 'active'
```

### Studio status

| Linea | Hallazgo |
|---:|---|
| `107` | Condicion: `(s.id is null or s.studio_status <> 'suspended')`. |

Esto significa:

```text
si no hay studio -> pasa
si hay studio suspendido -> no pasa
si hay studio pending -> pasa
si hay studio approved -> pasa
```

La RPC de Marketplace Read no exige:

```text
studio_status = approved
```

## 3. Puede publicarse un artista activo sin studio?

Si, desde el punto de vista de schema y lectura.

Condicion minima:

```text
artists.status = active
marketplace_profiles.profile_type = artist
marketplace_profiles.artist_id = artist.id
marketplace_profiles.visibility_status = visible
marketplace_listings.marketplace_profile_id = marketplace_profiles.id
marketplace_listings.visibility_status = visible
marketplace_listings.expires_at is null or expires_at > now()
service_offerings.owner_type = artist
service_offerings.artist_id = artist.id
service_offerings.status = active
```

No requiere:

```text
studios
studio_profiles
artist_studio_memberships
studios.studio_status
```

## 4. Alguna RPC exige `studio_status` para publicar?

No se encontro una RPC de publicacion.

No existen actualmente:

- `studio_flow_admin_publish_marketplace_profile`
- `studio_flow_marketplace_publish_profile`
- `studio_flow_admin_create_marketplace_listing`
- `publishArtist`
- `publishMarketplace`

La unica RPC Marketplace actual es read-only:

```text
studio_flow_marketplace_get_listings()
```

Y esa RPC no exige `studio_status = approved`; solo excluye studio suspendido cuando existe.

## 5. Governance actual y artistas independientes

### Governance Write Core actual

Archivo:

`supabase/migrations/202606110012_governance_write_core.sql`

| Linea | Hallazgo |
|---:|---|
| `215` | `studio_flow_admin_review_studio(p_studio_id, ...)`. |
| `247` | Busca studio por `p_studio_id`. |
| `324` | Actualiza `studios.studio_status`. |

La implementacion Governance Write Core es studio-based.

Eso sirve para:

- studios con artistas
- memberships dentro de studios

No sirve para:

- publicar artista independiente sin studio
- aprobar una entidad `artist` editorialmente
- crear `marketplace_profile profile_type = artist`

### Governance queue actual

`studio_flow_admin_governance_payload()` tambien parte de `studios s`.

Esto significa:

```text
un artista independiente sin studio no aparece naturalmente en la governance queue actual
```

## 6. Banner `En validacion`

Archivo:

`src/layouts/ArtistLayout.jsx`

| Linea | Hallazgo |
|---:|---|
| `46-52` | Calcula `currentStudio` desde `adminState.studios`, artistas y memberships. |
| `53` | `studioAccess = getStudioAccess(currentStudio)`. |
| `54` | `isPendingExperience = !studioAccess.publicAgenda`. |
| `61-70` | Renderiza banner y `getStudioStatusLabel(currentStudio?.studioStatus)`. |

Archivo:

`src/modules/governance/studioGovernance.js`

| Linea | Hallazgo |
|---:|---|
| `8-13` | `pending -> En validacion`. |
| `31-33` | `isStudioApproved(studio)` solo true si `studio?.studioStatus === approved`. |
| `56-58` | Si status es undefined, `getStudioStatusLabel` devuelve pending. |

Condicion exacta:

```js
const isPendingExperience = !studioAccess.publicAgenda
```

Si `currentStudio` es `undefined`, entonces:

```text
getStudioAccess(undefined)
  -> isStudioApproved(undefined) = false
  -> publicAgenda = false
  -> isPendingExperience = true
  -> getStudioStatusLabel(undefined) = En validacion
```

Por tanto, para artistas independientes, el banner puede aparecer por fallback aunque no exista un studio pendiente.

## 7. Dennis Beauty Studio

Contexto validado por el usuario:

```text
Dennis Beauty Studio es artista independiente.
artists.status = active.
```

### Esta bloqueada por no tener studio aprobado?

No, no para Marketplace Read.

La RPC permite `s.id is null`.

Condicion relevante:

```sql
and (s.id is null or s.studio_status <> 'suspended')
```

Un artista sin studio pasa esa condicion.

### Esta bloqueada por no tener marketplace publication?

Si.

Para aparecer necesita:

```text
marketplace_profile type artist visible
marketplace_listing visible
service_offerings active owner_type artist
```

Si no existe `marketplace_profile` / `marketplace_listing`, Marketplace devuelve:

```text
No hay perfiles publicados
```

### Por que ve `En validacion`?

Porque Artist UI usa un banner de studio governance incluso para experiencia de artista.

Si Dennis no tiene `currentStudio`, el fallback de `getStudioStatusLabel(undefined)` termina mostrando:

```text
En validacion
```

Eso no prueba que Dennis tenga un studio `pending`; puede ser una fuga semantica del layout para artistas independientes.

## 8. Tabla resumen

| Capa | Obliga studio? | Evidencia |
|---|---|---|
| `marketplace_profiles` | No | `profile_type = artist` exige `artist_id` y `studio_id null`. |
| `marketplace_listings` | No | `artist_id`, `studio_id`, `membership_id` son nullable. |
| Marketplace Read RPC | No | `studios` es `left join`; permite `s.id is null`. |
| Service offerings | No | `owner_type = artist` soporta artista independiente. |
| Governance Write Core | Si, para su flujo actual | RPC es `review_studio(p_studio_id)`. |
| Artist banner | Si semanticamente | Usa `currentStudio`/`studioStatus`, con fallback pending. |
| Publication | No existe | No hay RPC publish; no puede exigir studio actualmente. |

## 9. Respuesta directa

### Que entidad representan `marketplace_profiles` y `marketplace_listings`?

Representan entidades mixtas:

```text
artist
studio
membership
```

No son exclusivamente de studio.

### Un artist activo sin studio puede ser publicado?

Si, por schema y por Marketplace Read.

Debe publicarse como:

```text
marketplace_profiles.profile_type = artist
```

con listing visible y servicios activos `owner_type = artist`.

### Alguna RPC exige studio_status para publicar?

No.

No existe RPC de publish. La RPC read no exige `approved`; solo excluye `suspended` si hay studio.

### El banner `En validacion` depende de `studio_status`?

Si.

Depende de `currentStudio?.studioStatus` y fallback a `pending`.

### Dennis esta bloqueada por no tener studio aprobado?

No.

### Dennis esta bloqueada por no tener marketplace publication?

Si.

Falta:

```text
marketplace_profile visible de tipo artist
marketplace_listing visible
```

## Veredicto

La arquitectura Marketplace ya permite artistas independientes.

El bloqueo real de Dennis no es:

```text
studio_status pending
```

El bloqueo real es:

```text
no existe publicacion marketplace para artist independiente
```

La deuda tecnica detectada es que Artist UI/Governance todavia asume un studio para mostrar el estado de validacion. Para artistas independientes, esa experiencia debe separarse de `studio_status` y usar una publicacion/eligibilidad propia de `artist` o `marketplace_profile`.
