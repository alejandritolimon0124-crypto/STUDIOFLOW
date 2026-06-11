# FASE 16.2C - INDEPENDENT ARTIST EXCLUSION AUDIT

## Objetivo

Auditar `studio_flow_admin_get_artists` para determinar si un artista independiente, sin `artist_studio_memberships`, debe aparecer en Admin Artists y en que caso queda excluido.

Este documento no implementa codigo, no crea SQL y no modifica RPCs. Solo auditoria.

## Contexto validado

Caso Dennis:

- Existe en `profiles`.
- Existe en `artists`.
- Existe en `artist_profiles`.
- No existe en `artist_studio_memberships`.
- Es artista independiente y no requiere studio.
- No aparece en Admin Artists.

## RPC auditada

Archivo:

`supabase/migrations/202606110006_admin_artists_wave_a.sql`

Funcion:

`studio_flow_admin_get_artists()`

## JOINs utilizados

### Resolucion de roles admin

| Lineas | JOIN | Uso |
|---|---|---|
| `34-35` | `user_role_assignments ura join roles r` | Detectar `platform_owner`. |
| `44-45` | `user_role_assignments ura join roles r` | Resolver `studio_id` scoped para `studio_owner`/`studio_manager`. |

### Resolucion de artistas visibles

| Lineas | JOIN | Uso |
|---|---|---|
| `62-63` | `artists a left join artist_studio_memberships asm on asm.artist_id = a.id` | Construir `v_artist_ids`. |

Este `left join` permitiria artistas sin membership, pero el `where` posterior cambia el resultado segun rol.

### Payload derivado

| Lineas | JOIN | Uso |
|---|---|---|
| `145-146` | `profiles p join artists a on a.profile_id = p.id` | Traer profile de artistas ya incluidos en `v_artist_ids`. |
| `216-217` | `studios s left join studio_profiles sp` | Traer studios del scope o relacionados por memberships. |

## Filtros WHERE utilizados

### Filtro de ausencia de scope

Lineas `50-58`:

```sql
if not v_is_platform_owner and coalesce(array_length(v_scoped_studio_ids, 1), 0) = 0 then
  return jsonb_build_object(
    'artists', '[]'::jsonb,
    'artist_profiles', '[]'::jsonb,
    'profiles', '[]'::jsonb,
    'memberships', '[]'::jsonb,
    'studios', '[]'::jsonb
  );
end if;
```

Efecto:

- Si el admin no es `platform_owner` y no tiene `studio_id` scoped, la RPC devuelve lista vacia.
- Esto afecta a `studio_owner`/`studio_manager` mal provisionados.
- No afecta a `platform_owner`.

### Filtro principal de artistas

Lineas `60-68`:

```sql
select coalesce(array_agg(distinct a.id), '{}'::uuid[])
into v_artist_ids
from artists a
left join artist_studio_memberships asm on asm.artist_id = a.id
where v_is_platform_owner
  or (
    asm.studio_id = any(v_scoped_studio_ids)
    and asm.status <> 'archived'
  );
```

Este es el filtro decisivo.

Comportamiento:

- Si `v_is_platform_owner = true`, el `where` es true para todas las filas de `artists`, incluyendo artistas sin membership.
- Si `v_is_platform_owner = false`, el artista debe tener una fila en `artist_studio_memberships` cuyo `studio_id` este dentro del scope admin y cuyo `status <> 'archived'`.
- Un artista sin membership no cumple `asm.studio_id = any(v_scoped_studio_ids)` porque `asm.studio_id` queda null.

## Dependencia de `artist_studio_memberships`

La RPC depende de `artist_studio_memberships` para:

1. Determinar visibilidad scoped de artistas para `studio_owner`/`studio_manager`.
2. Obtener memberships devueltas en payload.
3. Derivar studios relacionados por artista.

Para `platform_owner`, `artist_studio_memberships` no es necesaria para incluir artistas en `v_artist_ids`.

Para `studio_owner`/`studio_manager`, `artist_studio_memberships` es obligatoria: sin membership, el artista no existe dentro del scope del admin.

## Dependencia de `studios`

La RPC no depende de `studios` para incluir artistas globales cuando el actor es `platform_owner`.

Si el actor es scoped, el acceso viene de:

`user_role_assignments.studio_id -> artist_studio_memberships.studio_id -> artists`

Luego `studios` se usa para enriquecer payload:

Lineas `216-226`:

```sql
from studios s
left join studio_profiles sp on sp.studio_id = s.id
where v_is_platform_owner
  or s.id = any(v_scoped_studio_ids)
  or exists (
    select 1
    from artist_studio_memberships asm
    where asm.studio_id = s.id
      and asm.artist_id = any(v_artist_ids)
      and asm.status <> 'archived'
  );
```

Un artista independiente puede tener payload `studios = []`, lo cual es valido. El mapper frontend ya tolera `studio = null` y usa ciudad del `artist_profile`.

## Platform owner vs studio owner

| Rol | Fuente de autorizacion | Ve artistas sin membership? | Motivo |
|---|---|---|---|
| `platform_owner` | Assignment `platform_owner` o fallback `profiles.default_role = platform_owner` | Si | Linea `64`: `where v_is_platform_owner` incluye todos los artistas. |
| `studio_owner` | `user_role_assignments.studio_id` | No | Requiere `asm.studio_id = any(v_scoped_studio_ids)`. |
| `studio_manager` | `user_role_assignments.studio_id` | No | Misma dependencia de membership. |

## Respuestas directas

### ¿Un artista sin membership aparece actualmente?

Depende del rol:

- Para `platform_owner`: si deberia aparecer.
- Para `studio_owner` o `studio_manager`: no aparece.

Si Dennis no aparece aun con sesion `platform_owner`, el problema probable no es la dependencia de membership en `studio_flow_admin_get_artists`, sino alguna de estas condiciones:

1. La sesion real no esta resolviendo `v_is_platform_owner = true`.
2. El usuario tiene `default_role` admin en frontend, pero no assignment `platform_owner` y tampoco fallback efectivo en la DB esperada.
3. La migracion/RPC desplegada en Supabase no coincide con el archivo local.
4. El payload llega pero el mapper/frontend lo filtra por otro criterio externo.

### Si no aparece, ¿que linea exacta lo excluye?

Para `studio_owner`/`studio_manager`, la exclusion ocurre en lineas `64-68`, especificamente:

```sql
asm.studio_id = any(v_scoped_studio_ids)
and asm.status <> 'archived'
```

Como Dennis no tiene fila en `artist_studio_memberships`, `asm.studio_id` es null y no cumple el filtro.

Para un `platform_owner`, esa condicion no deberia excluirlo porque `where v_is_platform_owner` deberia incluirlo antes del `or`.

### ¿La RPC quedó modelada Studio-Centric?

Parcialmente si.

- Para `platform_owner`, la RPC es global y puede incluir independientes.
- Para `studio_owner` y `studio_manager`, la RPC es completamente studio-centric: solo ve artistas conectados a `artist_studio_memberships`.

Ademas, el service mapper usa `firstMembershipForArtist()` para derivar `studioId`, `membershipId`, `plan` y `studioStatus`, pero tolera `membership = null`. Por tanto, la UI puede mostrar independientes si la RPC los devuelve.

### ¿Qué cambio mínimo permitiría mostrar artistas independientes?

El cambio minimo depende de quien debe verlos.

## Cambio minimo recomendado

### Opcion A: solo `platform_owner` ve independientes

No deberia requerir cambio en la condicion principal local actual. Si Dennis no aparece para platform owner, auditar primero:

```sql
select v_is_platform_owner;
```

y confirmar que la RPC desplegada contiene:

```sql
where v_is_platform_owner
  or (
    asm.studio_id = any(v_scoped_studio_ids)
    and asm.status <> 'archived'
  );
```

Tambien confirmar que `artists.id` de Dennis existe y no hay otro filtro externo.

### Opcion B: `studio_owner`/`studio_manager` tambien pueden ver independientes

Requiere una regla nueva de ownership para artistas independientes. El cambio minimo conceptual seria ampliar el `where` de `v_artist_ids` para incluir artistas sin membership bajo una condicion segura.

Ejemplo conceptual:

```sql
where v_is_platform_owner
  or (
    asm.studio_id = any(v_scoped_studio_ids)
    and asm.status <> 'archived'
  )
  or (
    asm.id is null
    and <regla_de_acceso_independiente>
  );
```

Pero `<regla_de_acceso_independiente>` no existe hoy. Sin esa regla, mostrar independientes a cualquier admin scoped seria acceso excesivo.

Reglas posibles:

| Regla | Implicacion |
|---|---|
| Solo platform owner ve independientes | Mas seguro y coherente con independencia. |
| Studio owner ve independientes de su ciudad/mercado | Requiere columna/scope territorial real. |
| Studio owner ve independientes que solicitan unirse a su studio | Requiere `artist_claim_reviews` o tabla de solicitudes. |
| Studio owner ve independientes creados por su profile | Requiere `created_by_profile_id` o ownership administrativo. |

## Cambio minimo SQL seguro para platform owner

Si la intencion es garantizar globalmente que platform owner ve artistas independientes incluso cuando el `left join` tenga varias filas o ninguna, puede hacerse mas explicito separando la rama global:

```sql
select coalesce(array_agg(distinct a.id), '{}'::uuid[])
into v_artist_ids
from artists a
where v_is_platform_owner
   or exists (
     select 1
     from artist_studio_memberships asm
     where asm.artist_id = a.id
       and asm.studio_id = any(v_scoped_studio_ids)
       and asm.status <> 'archived'
   );
```

Este cambio:

- Mantiene `platform_owner` global.
- Mantiene `studio_owner`/`studio_manager` scoped por membership.
- Evita que el modelo mental dependa de un `left join`.
- No abre independientes a admins scoped.

## Auditoria adicional sobre Wave 16.2A

La nueva helper `studio_flow_admin_artist_payload(p_artist_id)` en `202606110007_admin_artists_core_write.sql` si devuelve artista independiente porque inicia con:

```sql
v_artist_ids := array[p_artist_id];
```

y luego consulta `artists` por id.

Sin embargo, las mutaciones `activate/deactivate/update profile` llaman primero a `studio_flow_admin_assert_can_manage_artist(p_artist_id)`.

En ese helper:

- `platform_owner` puede administrar artista sin membership.
- `studio_owner`/`studio_manager` no pueden administrar artista sin membership.

Esto es consistente con la lectura esperada: independientes son globales/platform, no scoped a studio.

## Veredicto

Un artista independiente sin `artist_studio_memberships` debe aparecer para `platform_owner` con la RPC local actual, pero no para `studio_owner` ni `studio_manager`.

La linea que excluye al independiente en roles scoped es:

```sql
asm.studio_id = any(v_scoped_studio_ids)
```

en `supabase/migrations/202606110006_admin_artists_wave_a.sql:66`.

La RPC quedo studio-centric para admins scoped. Eso es correcto si un studio admin solo debe ver artistas vinculados a su studio, pero no resuelve un modelo administrativo para artistas independientes salvo desde `platform_owner`.

El cambio minimo seguro es reescribir el filtro principal usando `exists` para hacer explicita la rama global de `platform_owner` y la rama scoped por membership. Si se quiere que studio admins vean independientes, falta primero definir una regla de scope independiente.
