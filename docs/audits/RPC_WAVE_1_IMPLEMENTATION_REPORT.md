# FASE 15.5 - RPC WAVE 1 IMPLEMENTATION REPORT

## Objetivo

Implementar la primera oleada del blueprint RPC:

1. `studio_flow_artist_get_own_profile`
2. `studio_flow_artist_save_own_profile`

Basado en:

- `CRUD_DEPENDENCY_AUDIT.md`
- `RPC_MIGRATION_BLUEPRINT.md`

## Estado

Implementado.

## Archivos creados

| Archivo | Proposito |
|---|---|
| `supabase/migrations/202606110002_rpc_wave_1_artist_profile.sql` | Crea las RPC `SECURITY DEFINER` para lectura y guardado de perfil artista, con grants minimos a `authenticated`. |
| `RPC_WAVE_1_IMPLEMENTATION_REPORT.md` | Reporte de implementacion de la oleada. |

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `src/services/artistProfileService.js` | Migra `fetchArtistProfile` y `saveArtistProfile` de CRUD directo a RPC. Mantiene exports y contrato usado por `AppContext`. |

## RPC implementadas

### `studio_flow_artist_get_own_profile`

Tipo:

```txt
SECURITY DEFINER
```

Parametros:

| Parametro | Tipo | Default |
|---|---|---|
| `p_artist_id` | `uuid` | `null` |

Retorna:

```txt
jsonb
```

Payload:

```json
{
  "artist_profile": {},
  "profile": {},
  "artist": {}
}
```

Validaciones:

- Requiere `auth.uid()`.
- Requiere `profiles.id = auth.uid()`.
- Requiere `profiles.status = active`.
- Resuelve artist por `artists.profile_id = auth.uid()`.
- Si llega `p_artist_id`, exige que ese artist pertenezca al usuario actual.
- Bloquea artist archivado.
- Tolera artista sin row en `artist_profiles` devolviendo `artist_profile: null`.

Tablas:

- `profiles`
- `artists`
- `artist_profiles`

Permisos:

- `EXECUTE` revocado de `public`.
- `EXECUTE` concedido solo a `authenticated`.

### `studio_flow_artist_save_own_profile`

Tipo:

```txt
SECURITY DEFINER
```

Parametros:

| Parametro | Tipo | Default |
|---|---|---|
| `p_artist_id` | `uuid` | requerido |
| `p_profile` | `jsonb` | requerido |
| `p_update_phone` | `boolean` | `true` |

Retorna:

```txt
jsonb
```

Payload:

```json
{
  "artist_profile": {},
  "profile": {},
  "artist": {}
}
```

Validaciones:

- Requiere `auth.uid()`.
- Requiere profile activo.
- Requiere que `p_artist_id` pertenezca al usuario autenticado.
- Bloquea artist archivado.
- Requiere `artistic_name`.
- Solo actualiza `profiles.phone` del profile propio.
- Hace upsert por `artist_profiles.artist_id`.
- No permite cambiar ownership desde payload.
- Registra `audit_events` con `event_type = artist_profile_saved`.

Tablas:

- `profiles`
- `artists`
- `artist_profiles`
- `audit_events`

Permisos:

- `EXECUTE` revocado de `public`.
- `EXECUTE` concedido solo a `authenticated`.

## Service layer migration

### Antes

`fetchArtistProfile` hacia:

```txt
artist_profiles.select('*').eq('artist_id', artistId).maybeSingle()
```

`saveArtistProfile` hacia:

```txt
profiles.update({ phone })
artist_profiles.upsert(payload).select('*').single()
```

### Ahora

`fetchArtistProfile` usa:

```txt
client.rpc('studio_flow_artist_get_own_profile', { p_artist_id: artistId })
```

`saveArtistProfile` usa:

```txt
client.rpc('studio_flow_artist_save_own_profile', {
  p_artist_id: artistId,
  p_profile: { ...payload, phone },
  p_update_phone: Boolean(profileId)
})
```

Compatibilidad:

- `fetchArtistProfile` sigue retornando `null` si no existe `artist_profile`.
- `saveArtistProfile` sigue retornando el resultado de `mapArtistProfileRow(...)`.
- `AppContext` no fue modificado.
- UI no fue modificada.

## CRUD directo eliminado en Wave 1

| Archivo | Tabla | Operacion eliminada |
|---|---|---|
| `src/services/artistProfileService.js` | `artist_profiles` | SELECT |
| `src/services/artistProfileService.js` | `profiles` | UPDATE |
| `src/services/artistProfileService.js` | `artist_profiles` | UPSERT |
| `src/services/artistProfileService.js` | `artist_profiles` | SELECT returning |

## CRUD directo restante

Pertenece a Wave 2:

| Archivo | Tabla | Operacion |
|---|---|---|
| `src/services/artistServiceService.js` | `service_offerings` | SELECT/INSERT/UPDATE |
| `src/services/artistServiceService.js` | `service_categories` | UPSERT |
| `src/services/artistServiceService.js` | `service_tiers` | UPSERT |

## Validacion solicitada

| Caso | Estado | Detalle |
|---|---|---|
| Login artista | Cubierto por migracion de `fetchArtistProfile` | El flujo sigue llamando la misma funcion exportada desde `AppContext`. |
| Refresh | Cubierto por migracion de `hydrateSupabaseSession` indirectamente | No se modifico `AppContext`; la llamada ahora pasa por RPC. |
| Logout/login | Cubierto por mismo contrato de login/refresh | Requiere prueba manual con Supabase conectado. |
| Guardar perfil | Cubierto por `studio_flow_artist_save_own_profile` | `ArtistProfileSettings` sigue usando `saveArtistProfile`. |
| Guardar telefono | Cubierto dentro de `studio_flow_artist_save_own_profile` | La RPC actualiza `profiles.phone` propio si `p_update_phone = true`. |
| Perfil nuevo sin `artist_profile` | Cubierto por `studio_flow_artist_get_own_profile` | Devuelve `artist_profile: null`, igual que el comportamiento anterior del service. |

## Build

Comando ejecutado:

```txt
npm run build
```

Resultado:

```txt
OK - vite build completed successfully.
```

Nota:

Vite emitio solo el warning existente de chunk mayor a 500 kB.

## Verificaciones realizadas

Busqueda de dependencias Wave 1:

```txt
src/services/artistProfileService.js usa:
- studio_flow_artist_get_own_profile
- studio_flow_artist_save_own_profile
```

No quedan en `artistProfileService.js`:

```txt
from('artist_profiles')
from('profiles')
upsert directo de artist_profiles
update directo de profiles
```

## Diff completo de la oleada

### `supabase/migrations/202606110002_rpc_wave_1_artist_profile.sql`

Creado con:

- `create or replace function public.studio_flow_artist_get_own_profile(p_artist_id uuid default null)`
- `create or replace function public.studio_flow_artist_save_own_profile(p_artist_id uuid, p_profile jsonb, p_update_phone boolean default true)`
- `revoke all ... from public`
- `grant execute ... to authenticated`

### `src/services/artistProfileService.js`

Cambios efectivos:

```diff
-  const { data, error } = await client
-    .from('artist_profiles')
-    .select('*')
-    .eq('artist_id', artistId)
-    .maybeSingle()
+  const { data, error } = await client.rpc('studio_flow_artist_get_own_profile', {
+    p_artist_id: artistId,
+  })
 
   if (error) throw error
-  return data ? mapArtistProfileRow(data) : null
+  return data?.artist_profile ? mapArtistProfileRow(data.artist_profile) : null
```

```diff
-  if (profileId) {
-    const phone = String(profile.personalInfo?.phone || '').trim()
-    const { error: profileError } = await client
-      .from('profiles')
-      .update({
-        phone: phone || null,
-        updated_at: new Date().toISOString(),
-      })
-      .eq('id', profileId)
-
-    if (profileError) throw profileError
-  }
-
-  const { data, error } = await client
-    .from('artist_profiles')
-    .upsert(payload, { onConflict: 'artist_id' })
-    .select('*')
-    .single()
+  const { data, error } = await client.rpc('studio_flow_artist_save_own_profile', {
+    p_artist_id: artistId,
+    p_profile: {
+      ...payload,
+      phone: phone || null,
+    },
+    p_update_phone: Boolean(profileId),
+  })
 
   if (error) throw error
 
-  return mapArtistProfileRow(data)
+  return mapArtistProfileRow(data?.artist_profile)
```

## Riesgos residuales

| Riesgo | Estado |
|---|---|
| Las RPC deben aplicarse en Supabase antes de desplegar el frontend migrado. | Pendiente de deployment. |
| No se ejecuto prueba manual real de login/logout contra Supabase desde navegador. | Pendiente manual. |
| SQL no fue ejecutado contra una base local en esta sesion. | Pendiente si se requiere validacion DB-level. |
| CRUD directo de servicios sigue presente. | Esperado para Wave 2. |

## Veredicto

Wave 1 quedo implementada en backend SQL y service layer. `AppContext` y UI permanecen compatibles. El build pasa.
