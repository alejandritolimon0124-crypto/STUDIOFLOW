# FASE 16.1 - ADMIN ARTISTS WAVE A REPORT

## Objetivo

Implementar unicamente la capa de lectura real para Admin Artists, reemplazando la dependencia de `managedArtists`/mockData por una RPC Supabase, sin implementar acciones de escritura.

## Implementado

| Pieza | Resultado |
|---|---|
| RPC | `studio_flow_admin_get_artists` en `supabase/migrations/202606110006_admin_artists_wave_a.sql`. |
| Service layer | `src/services/adminArtistService.js`. |
| AppContext | Carga `adminState.artists` desde Supabase para sesiones admin reales. |
| AdminArtists UI | Se mantiene la UI existente y sigue leyendo `adminState.artists`. |

## RPC

`studio_flow_admin_get_artists` es `SECURITY DEFINER`, valida:

- `auth.uid()` presente.
- `profiles.status = 'active'`.
- `platform_owner` global por `default_role` o role assignment activo.
- `studio_owner`/`studio_manager` scoped por `user_role_assignments.studio_id`.

Devuelve:

- `artists`
- `artist_profiles`
- `profiles`
- `memberships`
- `studios`

`studios` se incluye como soporte de compatibilidad para que la pantalla pueda resolver studio/city/location sin depender de mock data cuando la sesion es real.

## Service layer

`src/services/adminArtistService.js` llama:

```js
supabase.rpc('studio_flow_admin_get_artists')
```

Luego mapea el payload real al shape que Admin Artists ya consume:

- `name`
- `owner`
- `city`
- `plan`
- `status`
- `studioStatus`
- `services`
- `description`
- `professionalLocation`
- `studioId`
- `membershipId`

## AppContext

Para sesiones mock no cambia nada.

Para sesiones reales con rol admin (`platform_owner`, `studio_owner`, `studio_manager`) se ejecuta la carga de artistas reales y se actualiza:

- `adminState.artists`
- `adminState.studios` si la RPC devuelve studios

Las funciones de escritura existentes (`toggleManagedArtistStatus`, `updateManagedArtistProfile`, `updateManagedStudioProfile`) no fueron migradas. Siguen siendo locales porque Wave A solo cubre lectura.

## No implementado por diseno

- Aprobar artista.
- Rechazar artista.
- Suspender artista.
- Marketplace visibility.
- Edicion persistente.
- Inserts en `audit_events`.
- RLS policies.

## Riesgos y notas

| Riesgo | Estado |
|---|---|
| Acciones de escritura siguen demo/local | Intencional en Wave A. |
| `studio_manager` puede tener ruta admin pero no permiso UI `STUDIO_ARTISTS` | Ya existia; no se modifica. |
| Si un studio owner no tiene `user_role_assignments.studio_id`, la RPC devuelve lista vacia | Correcto para scope estricto. |
| Campos mock sin equivalente real usan fallback | `revenue = '$0'`, `plan = membership.role`, `services = specialties`. |
| Admin dashboard puede ver `adminState.studios` real en sesiones reales | Aceptado como soporte de lectura real para Admin Artists. |

## Validacion solicitada

- Build ejecutado al cierre de la fase.
- No se implementaron escrituras.
- No se modifico UI visual.

## Veredicto

Wave A introduce la frontera real de lectura para Admin Artists sin abrir superficie de escritura. La pantalla conserva su contrato visual actual, mientras la fuente de datos para sesiones Supabase reales pasa a una RPC `SECURITY DEFINER` scoped por rol y studio.
