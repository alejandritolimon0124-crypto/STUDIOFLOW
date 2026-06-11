# FASE 15.6 - RPC WAVE 2 IMPLEMENTATION REPORT

## Objetivo

Migrar completamente `src/services/artistServiceService.js` a RPC `SECURITY DEFINER`.

Basado en:

- `CRUD_DEPENDENCY_AUDIT.md`
- `RPC_MIGRATION_BLUEPRINT.md`

## Estado

Implementado.

## Archivos creados

| Archivo | Proposito |
|---|---|
| `supabase/migrations/202606110003_rpc_wave_2_artist_services.sql` | Crea las RPC `SECURITY DEFINER` para servicios de artista y helpers internos de ownership/catalogo/serializacion. |
| `RPC_WAVE_2_IMPLEMENTATION_REPORT.md` | Reporte de implementacion de Wave 2. |

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `src/services/artistServiceService.js` | Reemplaza CRUD directo sobre `service_offerings`, `service_categories` y `service_tiers` por RPCs. Mantiene exports compatibles con `AppContext`. |

## RPC implementadas

| RPC | Proposito | Grant |
|---|---|---|
| `studio_flow_artist_get_service_offerings(uuid, boolean)` | Lista servicios propios del artista autenticado. | `authenticated` |
| `studio_flow_artist_create_service_offering(jsonb, uuid)` | Crea servicio propio y resuelve categoria/tier internamente. | `authenticated` |
| `studio_flow_artist_update_service_offering(uuid, jsonb)` | Edita servicio propio no archivado. | `authenticated` |
| `studio_flow_artist_activate_service_offering(uuid)` | Cambia servicio propio a `active`. | `authenticated` |
| `studio_flow_artist_suspend_service_offering(uuid, text)` | Cambia servicio propio a `suspended`. | `authenticated` |
| `studio_flow_artist_archive_service_offering(uuid, text)` | Archiva servicio propio con soft archive. | `authenticated` |

## Helpers internos

| Helper | Proposito | Grant externo |
|---|---|---|
| `studio_flow_artist_current_owned_artist(uuid)` | Valida `auth.uid()`, profile activo y artist ownership. | No |
| `studio_flow_artist_service_to_json(uuid)` | Serializa servicio con categoria/tier y shape compatible con UI. | No |
| `studio_flow_artist_get_or_create_service_category(text)` | Resuelve o crea categoria desde RPC, no desde frontend. | No |
| `studio_flow_artist_get_or_create_service_tier(text)` | Resuelve o crea tier desde RPC, no desde frontend. | No |

## Validaciones de ownership

Todas las RPC de servicios validan:

- `auth.uid()` no nulo.
- `profiles.id = auth.uid()`.
- `profiles.status = active`.
- `artists.profile_id = auth.uid()`.
- Artist no archivado.
- `service_offerings.owner_type = artist`.
- `service_offerings.artist_id` pertenece al artist autenticado.
- Servicios archivados no pueden activarse, suspenderse ni editarse.
- Archive es soft archive: `status = archived`, `archived_at`.

## CRUD directo eliminado

| Tabla | Operaciones eliminadas desde frontend service |
|---|---|
| `service_offerings` | SELECT, INSERT, UPDATE, archive update |
| `service_categories` | SELECT auxiliar, UPSERT |
| `service_tiers` | SELECT auxiliar, UPSERT |

## Service layer migration

Exports preservados:

- `fetchArtistServices`
- `saveArtistServiceOffering`
- `updateArtistServiceOfferingStatus`
- `archiveArtistServiceOffering`

Compatibilidad preservada:

- `AppContext` no fue modificado.
- `ArtistServices` no fue modificado.
- El shape UI se mantiene con `id`, `category`, `name`, `price`, `duration`, `bookings`, `demand`, `status`, `serviceTier`.

## Validacion solicitada

| Caso | Estado | Detalle |
|---|---|---|
| Crear servicio | Cubierto por `studio_flow_artist_create_service_offering` | Requiere prueba manual con Supabase aplicado. |
| Editar servicio | Cubierto por `studio_flow_artist_update_service_offering` | Requiere prueba manual con Supabase aplicado. |
| Suspender servicio | Cubierto por `studio_flow_artist_suspend_service_offering` | `updateArtistServiceOfferingStatus` enruta `Suspendido` a esta RPC. |
| Activar servicio | Cubierto por `studio_flow_artist_activate_service_offering` | `updateArtistServiceOfferingStatus` enruta `Activo` a esta RPC. |
| Archivar servicio | Cubierto por `studio_flow_artist_archive_service_offering` | El estado local sigue removiendo el item como antes. |
| Logout/Login | Contrato preservado | `loadArtistServices` sigue llamando el mismo export, ahora via RPC. |
| Cambio de dispositivo | Contrato preservado | Al rehidratar sesion, los servicios se leen por RPC y no dependen de storage local. |

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

Busqueda en `src/services/artistServiceService.js`:

```txt
No quedan:
- .from(
- .select(
- .insert(
- .update(
- .upsert(
- .delete(
```

RPCs detectadas en el service:

```txt
studio_flow_artist_get_service_offerings
studio_flow_artist_create_service_offering
studio_flow_artist_update_service_offering
studio_flow_artist_activate_service_offering
studio_flow_artist_suspend_service_offering
studio_flow_artist_archive_service_offering
```

## Diff conceptual completo

### Antes

`fetchArtistServices`:

```txt
service_offerings.select('*')
service_categories.select(...)
service_tiers.select(...)
```

`saveArtistServiceOffering`:

```txt
service_categories.upsert(...)
service_tiers.upsert(...)
service_offerings.insert/update(...)
```

`updateArtistServiceOfferingStatus`:

```txt
service_offerings.update(...).select('*')
```

`archiveArtistServiceOffering`:

```txt
service_offerings.update({ status: 'archived' })
```

### Ahora

`fetchArtistServices`:

```txt
studio_flow_artist_get_service_offerings
```

`saveArtistServiceOffering`:

```txt
studio_flow_artist_create_service_offering
studio_flow_artist_update_service_offering
```

`updateArtistServiceOfferingStatus`:

```txt
studio_flow_artist_activate_service_offering
studio_flow_artist_suspend_service_offering
```

`archiveArtistServiceOffering`:

```txt
studio_flow_artist_archive_service_offering
```

## Riesgos residuales

| Riesgo | Estado |
|---|---|
| Las migraciones SQL deben aplicarse en Supabase antes de desplegar frontend migrado. | Pendiente deployment. |
| No se ejecuto prueba manual real en navegador contra Supabase. | Pendiente manual. |
| No se ejecuto validacion DB-level de PL/pgSQL en una base local durante esta sesion. | Pendiente si se requiere. |
| Los catalogos aun pueden crearse desde RPC de artista. | Controlado por backend, pero conviene revisar governance futura. |

## Veredicto

Wave 2 queda implementada: `artistServiceService.js` ya no depende de CRUD directo sobre `service_offerings`, `service_categories` ni `service_tiers`. `AppContext`, `ArtistServices` y UI permanecen compatibles, y el build pasa.
