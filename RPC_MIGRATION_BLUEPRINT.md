# FASE 15.4 - RPC MIGRATION BLUEPRINT

## Objetivo

Disenar las RPC `SECURITY DEFINER` que reemplazaran los CRUD directos identificados en `CRUD_DEPENDENCY_AUDIT.md`.

Este documento no implementa SQL, no crea funciones, no crea politicas y no modifica codigo. Define contratos tecnicos para migracion futura.

## Principios de diseno

1. Las RPC deben ser la unica puerta de escritura para `profiles`, `artist_profiles` y `service_offerings`.
2. Las RPC deben validar `auth.uid()`, profile activo, artist ownership y estado del recurso antes de tocar datos.
3. Los payloads de salida deben ser compatibles con el shape actual que consume `AppContext` para reducir cambios frontend.
4. Ninguna RPC debe devolver `select *` sin filtrar; solo campos requeridos por UI.
5. Las mutaciones deben devolver el registro normalizado necesario para actualizar estado local.
6. Las operaciones sensibles deben registrar auditoria en fase de implementacion.

## Helpers conceptuales requeridos

| Helper | Uso |
|---|---|
| `studio_flow_current_profile()` | Resolver `profiles.id = auth.uid()` y validar `status = active`. |
| `studio_flow_current_artist()` | Resolver artista vinculado al profile actual. |
| `studio_flow_assert_artist_owner(p_artist_id)` | Validar que `artists.profile_id = auth.uid()` y que el artista no este archivado. |
| `studio_flow_assert_artist_profile_owner(p_artist_profile_id)` | Validar ownership a traves de `artist_profiles.artist_id`. |
| `studio_flow_assert_service_owner(p_service_offering_id)` | Validar que el servicio pertenece al artista autenticado. |
| `studio_flow_get_or_validate_service_category(p_category)` | Resolver categoria permitida sin abrir `upsert` directo al frontend. |
| `studio_flow_get_or_validate_service_tier(p_tier_code)` | Resolver tier permitido sin abrir `upsert` directo al frontend. |
| `studio_flow_write_audit_event(...)` | Registrar mutaciones de perfil y servicios. |

## Contratos RPC por flujo critico

### 1. Guardar perfil artista

| Campo | Definicion |
|---|---|
| RPC | `studio_flow_artist_save_own_profile` |
| Reemplaza | `artist_profiles.upsert`, y opcionalmente update de telefono si se decide incluirlo |
| Funcion actual | `saveArtistProfile` en `src/services/artistProfileService.js` |
| Pantalla | `ArtistProfileSettings` |
| Rol | `artist` |
| Tablas involucradas | `artists`, `artist_profiles`, opcionalmente `profiles`, `audit_events` |
| Permisos requeridos | Usuario autenticado, profile activo, rol/equivalencia artist, ownership de `artist_id` |
| Riesgo de migracion | CRITICO |

Parametros:

| Parametro | Tipo conceptual | Requerido | Descripcion |
|---|---|---|---|
| `p_artist_id` | uuid | Si | Artist target. Debe pertenecer al usuario autenticado. |
| `p_profile` | jsonb | Si | Payload normalizado del perfil profesional. |
| `p_update_phone` | boolean | No | Indica si la RPC tambien debe actualizar `profiles.phone`. Default false o true segun decision final. |

Payload entrada esperado:

```json
{
  "artistic_name": "string",
  "bio": "string|null",
  "specialties": ["string"],
  "primary_specialty": "string|null",
  "photo_path": "string|null",
  "portfolio_paths": ["string"],
  "city": "string|null",
  "whatsapp": "string|null",
  "payment_methods": ["string"],
  "use_studio_location": true,
  "address_line": "string|null",
  "state": "string|null",
  "postal_code": "string|null",
  "latitude": 0,
  "longitude": 0,
  "address_references": "string|null",
  "google_maps_url": "string|null",
  "phone": "string|null"
}
```

Payload salida:

```json
{
  "artist_profile": {
    "id": "uuid",
    "artist_id": "uuid",
    "artistic_name": "string",
    "bio": "string|null",
    "specialties": ["string"],
    "photo_path": "string|null",
    "portfolio_paths": ["string"],
    "city": "string|null",
    "professional_location": {},
    "updated_at": "timestamp"
  },
  "profile": {
    "id": "uuid",
    "phone": "string|null"
  }
}
```

Validaciones ownership:

- `auth.uid()` no nulo.
- `profiles.id = auth.uid()` y `profiles.status = active`.
- `artists.id = p_artist_id`.
- `artists.profile_id = auth.uid()`.
- `artists.status != archived`.
- Si actualiza telefono, solo permitir `profiles.id = auth.uid()`.

Notas de migracion:

- Puede absorber el flujo 3, "Actualizar telefono", para evitar dos llamadas.
- Debe devolver un shape que `mapArtistProfileRow` o su reemplazo pueda consumir sin `select *`.

### 2. Obtener perfil artista

| Campo | Definicion |
|---|---|
| RPC | `studio_flow_artist_get_own_profile` |
| Reemplaza | `artist_profiles.select('*').eq('artist_id', artistId).maybeSingle()` |
| Funcion actual | `fetchArtistProfile` |
| Pantallas/flujo | Login refresh, registro artista, hidratacion de `AppContext`, `ArtistProfileSettings` |
| Rol | `artist` |
| Tablas involucradas | `artists`, `artist_profiles`, `profiles` |
| Permisos requeridos | Usuario autenticado, profile activo, ownership de artist |
| Riesgo de migracion | ALTO |

Parametros:

| Parametro | Tipo conceptual | Requerido | Descripcion |
|---|---|---|---|
| `p_artist_id` | uuid | No | Si se omite, resolver artista desde `auth.uid()`. |

Payload entrada esperado:

```json
{
  "artist_id": "uuid|null"
}
```

Payload salida:

```json
{
  "artist_profile": {
    "id": "uuid|null",
    "artist_id": "uuid",
    "artistic_name": "string",
    "bio": "string|null",
    "specialties": ["string"],
    "primary_specialty": "string|null",
    "photo_path": "string|null",
    "portfolio_paths": ["string"],
    "city": "string|null",
    "whatsapp": "string|null",
    "payment_methods": ["string"],
    "professional_location": {},
    "created_at": "timestamp|null",
    "updated_at": "timestamp|null"
  }
}
```

Validaciones ownership:

- Si `p_artist_id` existe, debe pertenecer a `auth.uid()`.
- Si `p_artist_id` no existe, resolver por `artists.profile_id = auth.uid()`.
- No devolver perfiles de otros artistas.

Notas de migracion:

- Debe tolerar que aun no exista row en `artist_profiles` y devolver `artist_profile: null` o un default controlado.
- Es P0 porque corre durante hidratacion de sesion.

### 3. Actualizar telefono

| Campo | Definicion |
|---|---|
| RPC | `studio_flow_update_own_profile_contact` |
| Reemplaza | `profiles.update({ phone })` |
| Funcion actual | Parte de `saveArtistProfile` |
| Pantalla | `ArtistProfileSettings` |
| Rol | `artist`; extensible a `client` |
| Tablas involucradas | `profiles`, `audit_events` |
| Permisos requeridos | Usuario autenticado y profile propio activo |
| Riesgo de migracion | CRITICO |

Parametros:

| Parametro | Tipo conceptual | Requerido | Descripcion |
|---|---|---|---|
| `p_phone` | text | No | Telefono normalizado o null. |

Payload entrada esperado:

```json
{
  "phone": "string|null"
}
```

Payload salida:

```json
{
  "profile": {
    "id": "uuid",
    "phone": "string|null",
    "updated_at": "timestamp"
  }
}
```

Validaciones ownership:

- `profiles.id = auth.uid()`.
- `profiles.status = active`.
- Solo permitir columnas de contacto autorizadas.

Notas de migracion:

- Opcion A: mantener RPC separada para contacto.
- Opcion B: integrarla dentro de `studio_flow_artist_save_own_profile`.
- Recomendacion: Opcion B para la primera migracion, y separar luego si cliente tambien edita telefono.

### 4. Obtener servicios artista

| Campo | Definicion |
|---|---|
| RPC | `studio_flow_artist_get_service_offerings` |
| Reemplaza | `service_offerings.select('*')` + selects de catalogos |
| Funcion actual | `fetchArtistServices` |
| Pantallas/flujo | `ArtistServices`, `ArtistDashboard`, `ArtistAppointments`, dashboards derivados |
| Rol | `artist` |
| Tablas involucradas | `artists`, `service_offerings`, `service_categories`, `service_tiers` |
| Permisos requeridos | Artist autenticado propietario |
| Riesgo de migracion | ALTO |

Parametros:

| Parametro | Tipo conceptual | Requerido | Descripcion |
|---|---|---|---|
| `p_artist_id` | uuid | No | Si se omite, resolver artist desde `auth.uid()`. |
| `p_include_archived` | boolean | No | Default false. |

Payload entrada esperado:

```json
{
  "artist_id": "uuid|null",
  "include_archived": false
}
```

Payload salida:

```json
{
  "services": [
    {
      "id": "uuid",
      "owner_type": "artist",
      "artist_id": "uuid",
      "category": "string",
      "category_id": "uuid",
      "name": "string",
      "description": "string|null",
      "price": 0,
      "price_amount": 0,
      "duration": "60 min",
      "duration_minutes": 60,
      "status": "Activo|Suspendido|Borrador|Archivado",
      "db_status": "active|suspended|draft|archived",
      "serviceTier": "basic|medium|premium|vip",
      "tier_id": "uuid|null",
      "bookings": 0,
      "demand": "string",
      "created_at": "timestamp",
      "updated_at": "timestamp"
    }
  ]
}
```

Validaciones ownership:

- Resolver artista autenticado.
- Si `p_artist_id` se envia, validar que coincide con el artista autenticado.
- Devolver solo `owner_type = artist` y `artist_id` propio.
- Excluir `archived` por defecto.

Notas de migracion:

- Esta RPC debe reemplazar tambien `fetchCatalogMaps`, devolviendo labels de categoria/tier ya resueltos.
- Mantener `status` en formato UI puede reducir cambios en `ArtistServices`.

### 5. Crear servicio

| Campo | Definicion |
|---|---|
| RPC | `studio_flow_artist_create_service_offering` |
| Reemplaza | `service_categories.upsert`, `service_tiers.upsert`, `service_offerings.insert` |
| Funcion actual | Rama insert de `saveArtistServiceOffering` |
| Pantalla | `ArtistServices` |
| Rol | `artist` |
| Tablas involucradas | `artists`, `service_categories`, `service_tiers`, `service_offerings`, `audit_events` |
| Permisos requeridos | Artist autenticado propietario |
| Riesgo de migracion | CRITICO |

Parametros:

| Parametro | Tipo conceptual | Requerido | Descripcion |
|---|---|---|---|
| `p_artist_id` | uuid | No | Si se omite, resolver artist desde auth. |
| `p_service` | jsonb | Si | Datos del servicio. |

Payload entrada esperado:

```json
{
  "artist_id": "uuid|null",
  "service": {
    "category": "string",
    "category_slug": "string|null",
    "tier_code": "basic|medium|premium|vip",
    "name": "string",
    "description": "string|null",
    "price_amount": 0,
    "duration_minutes": 60,
    "status": "active|draft|suspended"
  }
}
```

Payload salida:

```json
{
  "service": {
    "id": "uuid",
    "category": "string",
    "name": "string",
    "price": 0,
    "duration": "60 min",
    "status": "Activo",
    "serviceTier": "basic",
    "created_at": "timestamp",
    "updated_at": "timestamp"
  }
}
```

Validaciones ownership:

- Artist propio por `auth.uid()`.
- `name` requerido.
- `price_amount >= 0`.
- `duration_minutes > 0`.
- `status` dentro de valores permitidos para artista.
- Categoria/tier deben existir o ser creados por regla controlada dentro de RPC.

Notas de migracion:

- Recomendacion: no permitir upsert libre de catalogos desde cliente. La RPC puede resolver solo categorias conocidas o crear categoria pendiente de revision.

### 6. Editar servicio

| Campo | Definicion |
|---|---|
| RPC | `studio_flow_artist_update_service_offering` |
| Reemplaza | Rama update de `saveArtistServiceOffering` |
| Pantalla | `ArtistServices` |
| Rol | `artist` |
| Tablas involucradas | `service_offerings`, `service_categories`, `service_tiers`, `audit_events` |
| Permisos requeridos | Artist propietario del servicio |
| Riesgo de migracion | CRITICO |

Parametros:

| Parametro | Tipo conceptual | Requerido | Descripcion |
|---|---|---|---|
| `p_service_offering_id` | uuid | Si | Servicio a editar. |
| `p_patch` | jsonb | Si | Campos editables. |

Payload entrada esperado:

```json
{
  "service_offering_id": "uuid",
  "patch": {
    "category": "string",
    "tier_code": "basic|medium|premium|vip",
    "name": "string",
    "description": "string|null",
    "price_amount": 0,
    "duration_minutes": 60,
    "status": "active|draft|suspended"
  }
}
```

Payload salida:

```json
{
  "service": {
    "id": "uuid",
    "category": "string",
    "name": "string",
    "price": 0,
    "duration": "60 min",
    "status": "Activo|Suspendido|Borrador",
    "serviceTier": "basic",
    "updated_at": "timestamp"
  }
}
```

Validaciones ownership:

- Servicio existe.
- `service_offerings.owner_type = artist`.
- `service_offerings.artist_id` pertenece al usuario autenticado.
- Servicio no esta archivado, salvo que se permita restore explicito en otra RPC.

Notas de migracion:

- No aceptar `artist_id`, `studio_id`, `membership_id` desde patch.
- No permitir cambiar ownership desde esta RPC.

### 7. Activar servicio

| Campo | Definicion |
|---|---|
| RPC | `studio_flow_artist_activate_service_offering` |
| Reemplaza | `updateArtistServiceOfferingStatus({ status: 'Activo' })` |
| Pantalla | `ArtistServices` |
| Rol | `artist` |
| Tablas involucradas | `service_offerings`, `audit_events` |
| Permisos requeridos | Artist propietario del servicio |
| Riesgo de migracion | CRITICO |

Parametros:

| Parametro | Tipo conceptual | Requerido | Descripcion |
|---|---|---|---|
| `p_service_offering_id` | uuid | Si | Servicio a activar. |

Payload entrada esperado:

```json
{
  "service_offering_id": "uuid"
}
```

Payload salida:

```json
{
  "service": {
    "id": "uuid",
    "status": "Activo",
    "db_status": "active",
    "archived_at": null,
    "updated_at": "timestamp"
  }
}
```

Validaciones ownership:

- Servicio propio.
- Servicio no archivado fisicamente.
- Si estaba `archived`, decidir si activacion lo restaura o si debe rechazarse. Recomendacion: rechazar y usar RPC separada de restore si alguna vez se necesita.

Notas de migracion:

- Puede consolidarse con una RPC generica de status, pero mantener RPC especifica reduce estados inesperados desde UI.

### 8. Suspender servicio

| Campo | Definicion |
|---|---|
| RPC | `studio_flow_artist_suspend_service_offering` |
| Reemplaza | `updateArtistServiceOfferingStatus({ status: 'Suspendido' })` |
| Pantalla | `ArtistServices` |
| Rol | `artist` |
| Tablas involucradas | `service_offerings`, `audit_events` |
| Permisos requeridos | Artist propietario del servicio |
| Riesgo de migracion | CRITICO |

Parametros:

| Parametro | Tipo conceptual | Requerido | Descripcion |
|---|---|---|---|
| `p_service_offering_id` | uuid | Si | Servicio a suspender. |
| `p_reason` | text | No | Motivo opcional para auditoria futura. |

Payload entrada esperado:

```json
{
  "service_offering_id": "uuid",
  "reason": "string|null"
}
```

Payload salida:

```json
{
  "service": {
    "id": "uuid",
    "status": "Suspendido",
    "db_status": "suspended",
    "archived_at": null,
    "updated_at": "timestamp"
  }
}
```

Validaciones ownership:

- Servicio propio.
- Servicio no archivado.
- Transicion permitida desde `active` o `draft`.

Notas de migracion:

- Debe mantener el servicio visible en listados internos del artista.

### 9. Archivar servicio

| Campo | Definicion |
|---|---|
| RPC | `studio_flow_artist_archive_service_offering` |
| Reemplaza | `archiveArtistServiceOffering` |
| Pantalla | `ArtistServices` |
| Rol | `artist` |
| Tablas involucradas | `service_offerings`, `audit_events` |
| Permisos requeridos | Artist propietario del servicio |
| Riesgo de migracion | CRITICO |

Parametros:

| Parametro | Tipo conceptual | Requerido | Descripcion |
|---|---|---|---|
| `p_service_offering_id` | uuid | Si | Servicio a archivar. |
| `p_reason` | text | No | Motivo opcional. |

Payload entrada esperado:

```json
{
  "service_offering_id": "uuid",
  "reason": "string|null"
}
```

Payload salida:

```json
{
  "service": {
    "id": "uuid",
    "status": "Archivado",
    "db_status": "archived",
    "archived_at": "timestamp",
    "updated_at": "timestamp"
  }
}
```

Validaciones ownership:

- Servicio propio.
- Servicio no archivado previamente o idempotencia controlada.
- No borrar fisicamente.

Notas de migracion:

- El frontend actual elimina el item del estado local despues de archivar. La RPC puede devolver solo id/status para minimizar payload.

## Variante de consolidacion

Para reducir numero de RPCs, las operaciones 7 y 8 pueden consolidarse:

| RPC alternativa | Uso |
|---|---|
| `studio_flow_artist_set_service_offering_status` | Recibe `p_service_offering_id` y `p_status` limitado a `active` o `suspended`. |

Recomendacion: implementar primero RPCs explicitas (`activate`, `suspend`, `archive`) para evitar transiciones no deseadas. Consolidar despues si el service layer queda demasiado repetitivo.

## Tabla actual -> RPC futura -> Pantallas afectadas -> Orden recomendado

| Tabla actual | CRUD directo actual | RPC futura | Pantallas/flujo afectado | Orden |
|---|---|---|---|---|
| `artist_profiles` | SELECT | `studio_flow_artist_get_own_profile` | Login refresh, registro artista, hidratacion `AppContext`, `ArtistProfileSettings` | 1 |
| `profiles` | UPDATE phone | `studio_flow_update_own_profile_contact` o integrado en `studio_flow_artist_save_own_profile` | `ArtistProfileSettings` | 2 |
| `artist_profiles` | UPSERT + SELECT returning | `studio_flow_artist_save_own_profile` | `ArtistProfileSettings` | 3 |
| `service_offerings` | SELECT | `studio_flow_artist_get_service_offerings` | `ArtistServices`, `ArtistDashboard`, `ArtistAppointments`, `ClientDashboard`, `AdminDashboard` | 4 |
| `service_categories` | SELECT | `studio_flow_get_service_catalog` o retorno embebido en service RPC | `ArtistServices`, dashboards derivados | 5 |
| `service_tiers` | SELECT | `studio_flow_get_service_catalog` o retorno embebido en service RPC | `ArtistServices`, dashboards derivados | 5 |
| `service_categories` | UPSERT | `studio_flow_artist_create_service_offering` con resolucion interna de categoria | `ArtistServices` crear/editar | 6 |
| `service_tiers` | UPSERT | `studio_flow_artist_create_service_offering` con resolucion interna de tier | `ArtistServices` crear/editar | 6 |
| `service_offerings` | INSERT | `studio_flow_artist_create_service_offering` | `ArtistServices` crear servicio | 7 |
| `service_offerings` | UPDATE data | `studio_flow_artist_update_service_offering` | `ArtistServices` editar servicio | 8 |
| `service_offerings` | UPDATE status active | `studio_flow_artist_activate_service_offering` | `ArtistServices` activar servicio | 9 |
| `service_offerings` | UPDATE status suspended | `studio_flow_artist_suspend_service_offering` | `ArtistServices` suspender servicio | 10 |
| `service_offerings` | UPDATE status archived | `studio_flow_artist_archive_service_offering` | `ArtistServices` archivar servicio | 11 |

## Orden recomendado de migracion

### Paso 1: RPC de lectura de perfil artista

Migrar `fetchArtistProfile` a `studio_flow_artist_get_own_profile`.

Motivo:

- Es llamada durante login/refresh y registro.
- Si falla, el estado inicial de artista queda incompleto.

### Paso 2: RPC de guardado de perfil artista

Migrar `saveArtistProfile` a `studio_flow_artist_save_own_profile`, incluyendo telefono o llamando `studio_flow_update_own_profile_contact`.

Motivo:

- Es escritura sobre dos tablas privadas.
- Es el flujo mas sensible de datos personales/profesionales.

### Paso 3: RPC de lectura de servicios

Migrar `fetchArtistServices` a `studio_flow_artist_get_service_offerings`.

Motivo:

- Alimenta muchas pantallas.
- Permite retirar `select *` sobre `service_offerings`.
- Puede embeder labels de catalogo y eliminar lecturas auxiliares.

### Paso 4: RPCs de mutacion de servicios

Migrar crear, editar, activar, suspender y archivar servicios.

Motivo:

- Son el CRUD privado mas expuesto a ruptura con RLS.
- Permiten cerrar `INSERT/UPDATE` directos sobre `service_offerings`.

### Paso 5: Cierre de catalogos

Eliminar `upsert` directo sobre `service_categories` y `service_tiers`.

Motivo:

- Los catalogos son sistema, no ownership del artista.
- La RPC de servicios debe resolverlos internamente.

## Riesgos de migracion por contrato

| RPC | Riesgo | Motivo | Mitigacion |
|---|---|---|---|
| `studio_flow_artist_get_own_profile` | ALTO | Corre en login/refresh. | Mantener payload tolerante a perfil faltante. |
| `studio_flow_artist_save_own_profile` | CRITICO | Escribe datos privados y publicables. | Validacion estricta de ownership y allowlist de campos. |
| `studio_flow_update_own_profile_contact` | CRITICO | Toca identidad privada. | Permitir solo profile propio y campos minimos. |
| `studio_flow_artist_get_service_offerings` | ALTO | Alimenta multiples pantallas. | Mantener shape compatible con `artistServices`. |
| `studio_flow_artist_create_service_offering` | CRITICO | Inserta tabla privada y resuelve catalogos. | Validar artista propio y catalogos permitidos. |
| `studio_flow_artist_update_service_offering` | CRITICO | Puede modificar servicios ajenos si falla ownership. | Validar por `service_offerings.artist_id -> artists.profile_id`. |
| `studio_flow_artist_activate_service_offering` | CRITICO | Cambia visibilidad operacional. | Validar transicion y ownership. |
| `studio_flow_artist_suspend_service_offering` | CRITICO | Cambia disponibilidad. | Validar transicion y ownership. |
| `studio_flow_artist_archive_service_offering` | CRITICO | Retira servicio del flujo. | Soft archive idempotente, sin delete fisico. |

## Checklist antes de implementar

- Confirmar columnas reales de `artist_profiles` luego de `artist_profile_schema_completion`.
- Definir si telefono se guarda junto al perfil artista o en RPC separada.
- Definir si categorias/tier seran catalogo cerrado o creacion controlada.
- Definir shape final de `artistServices` para no romper dashboards.
- Crear tests manuales con artista autenticado, artista sin perfil extendido y artista con servicios archivados.
- Confirmar que ninguna pantalla dependa de campos ocultos por el nuevo payload.

## Veredicto

La migracion debe empezar por lectura/guardado de perfil artista y continuar con servicios. Con esas RPCs en lugar, RLS restrictivo puede activarse sobre `profiles`, `artist_profiles` y `service_offerings` sin romper los flujos P0 del artista.

El punto mas delicado no es el nombre de las RPC, sino conservar contratos de salida compatibles mientras se elimina el acceso directo a tablas privadas.
