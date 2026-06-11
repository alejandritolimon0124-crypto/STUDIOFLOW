# FASE 15.3 - CRUD DEPENDENCY AUDIT

## Objetivo

Identificar los modulos de Studio Flow que dependen hoy de CRUD directo sobre Supabase y que pueden romperse al activar RLS restrictivo.

Este documento es solo auditoria. No modifica codigo, no crea RPCs y no crea politicas.

## Busqueda ejecutada

Patrones auditados en `src` y `supabase`:

- `supabase.from(`
- `.from(`
- `.select(`
- `.insert(`
- `.update(`
- `.upsert(`
- `.delete(`

Resultado funcional: no hay CRUD directo desde paginas. El CRUD directo esta concentrado en service layer y se consume desde `AppContext`.

## Resumen ejecutivo

| Nivel | Hallazgo |
|---|---|
| CRITICO | Escrituras directas sobre `artist_profiles`, `profiles` y `service_offerings`. |
| RIESGO ALTO | Lecturas directas `select *` sobre `artist_profiles` y `service_offerings`. |
| RIESGO MEDIO | Upsert directo sobre catalogos `service_categories` y `service_tiers` desde flujo de artista. |
| RIESGO BAJO | Select de catalogos por id para enriquecer servicios. |
| SAFE | No se detectaron operaciones directas sobre tablas publicas puras desde pantallas. |

Activar RLS restrictivo sin migracion previa romperia inmediatamente:

- Guardado de perfil profesional de artista.
- Actualizacion de telefono en `profiles`.
- Carga del perfil profesional despues de login/registro.
- Carga del catalogo de servicios del artista.
- Alta, edicion, suspension y archivo de servicios.
- Pantallas que dependen de `artistServices` hidratado desde Supabase.

## Dependencias por service

### `src/services/artistProfileService.js`

| Funcion | Tabla | Operacion | Rol | Service layer | AppContext | Tabla privada | Riesgo |
|---|---|---|---|---|---|---|---|
| `fetchArtistProfile` | `artist_profiles` | SELECT | Artist | Si | Si | Si | ALTO |
| `saveArtistProfile` | `profiles` | UPDATE | Artist | Si | Si | Si | CRITICO |
| `saveArtistProfile` | `artist_profiles` | UPSERT + SELECT returning | Artist | Si | Si | Si | CRITICO |

Impacto:

- `fetchArtistProfile` se ejecuta durante hidratacion de sesion Supabase y despues de registro de artista.
- `saveArtistProfile` se ejecuta desde `ArtistProfileSettings`.
- La tabla `artist_profiles` contiene campos publicables y privados/controlados; no debe quedar abierta con `select *` a roles no scoped.
- La actualizacion directa de `profiles.phone` viola la regla de mutaciones sensibles via RPC.

### `src/services/artistServiceService.js`

| Funcion | Tabla | Operacion | Rol | Service layer | AppContext | Tabla privada | Riesgo |
|---|---|---|---|---|---|---|---|
| `fetchCatalogMaps` | `service_categories` | SELECT | Artist | Si | Si | No/catalogo | BAJO |
| `fetchCatalogMaps` | `service_tiers` | SELECT | Artist | Si | Si | No/catalogo | BAJO |
| `fetchArtistServices` | `service_offerings` | SELECT | Artist | Si | Si | Si | ALTO |
| `ensureServiceCategory` | `service_categories` | UPSERT + SELECT returning | Artist | Si | Si | Catalogo sistema | MEDIO |
| `ensureServiceTier` | `service_tiers` | UPSERT + SELECT returning | Artist | Si | Si | Catalogo sistema | MEDIO |
| `saveArtistServiceOffering` | `service_offerings` | UPDATE + SELECT returning | Artist | Si | Si | Si | CRITICO |
| `saveArtistServiceOffering` | `service_offerings` | INSERT + SELECT returning | Artist | Si | Si | Si | CRITICO |
| `updateArtistServiceOfferingStatus` | `service_offerings` | UPDATE + SELECT returning | Artist | Si | Si | Si | CRITICO |
| `archiveArtistServiceOffering` | `service_offerings` | UPDATE | Artist | Si | Si | Si | CRITICO |

Impacto:

- `fetchArtistServices` se dispara automaticamente en `AppContext` cuando la sesion es `ROLES.ARTIST`.
- `service_offerings` es privada/scoped: servicios de artista, estudio o membership.
- Los catalogos son relativamente seguros para lectura, pero no para `upsert` desde artista autenticado.
- El flujo actual crea categorias y tiers dinamicamente desde el formulario de artista; con RLS estricta eso deberia migrar a RPC o a catalogo cerrado.

## Dependencias por AppContext

| AppContext funcion/efecto | Service llamado | Tabla(s) | Operacion | Pantalla/flujo | Rol | Riesgo |
|---|---|---|---|---|---|---|
| `hydrateSupabaseSession` | `fetchArtistProfile` | `artist_profiles` | SELECT | Inicio de sesion / refresh | Artist | ALTO |
| `registerArtist` | `bootstrapArtistProfile`, luego `fetchArtistProfile` | `artist_profiles` | SELECT | Registro artista | Artist | ALTO |
| `loadArtistServices` | `fetchArtistServices` | `service_offerings`, catalogos | SELECT | Carga inicial artista | Artist | ALTO |
| `saveArtistService` | `saveArtistServiceOffering` | `service_categories`, `service_tiers`, `service_offerings` | UPSERT/INSERT/UPDATE | Artist Services | Artist | CRITICO |
| `updateArtistServiceStatus` | `updateArtistServiceOfferingStatus` | `service_offerings` | UPDATE | Artist Services | Artist | CRITICO |
| `archiveArtistService` | `archiveArtistServiceOffering` | `service_offerings` | UPDATE archive | Artist Services | Artist | CRITICO |
| `saveArtistProfile` | `saveArtistProfileRecord` | `profiles`, `artist_profiles` | UPDATE/UPSERT | Artist Profile Settings | Artist | CRITICO |

## Matriz principal

| Archivo | Pantalla | Tabla | Operacion | Riesgo | Prioridad de migracion |
|---|---|---|---|---|---|
| `src/services/artistProfileService.js` | `ArtistProfileSettings` | `profiles` | UPDATE | CRITICO | P0 |
| `src/services/artistProfileService.js` | `ArtistProfileSettings` | `artist_profiles` | UPSERT | CRITICO | P0 |
| `src/services/artistProfileService.js` | Login/registro/hidratacion artist | `artist_profiles` | SELECT | ALTO | P0 |
| `src/services/artistServiceService.js` | `ArtistServices` | `service_offerings` | INSERT | CRITICO | P0 |
| `src/services/artistServiceService.js` | `ArtistServices` | `service_offerings` | UPDATE | CRITICO | P0 |
| `src/services/artistServiceService.js` | `ArtistServices` | `service_offerings` | UPDATE archive | CRITICO | P0 |
| `src/services/artistServiceService.js` | `ArtistServices` / artist boot | `service_offerings` | SELECT | ALTO | P0 |
| `src/services/artistServiceService.js` | `ArtistServices` | `service_categories` | UPSERT | RIESGO MEDIO | P1 |
| `src/services/artistServiceService.js` | `ArtistServices` | `service_tiers` | UPSERT | RIESGO MEDIO | P1 |
| `src/services/artistServiceService.js` | `ArtistServices` / dashboards | `service_categories` | SELECT | RIESGO BAJO | P2 |
| `src/services/artistServiceService.js` | `ArtistServices` / dashboards | `service_tiers` | SELECT | RIESGO BAJO | P2 |

## Inventario de ocurrencias directas

| Archivo:linea | Funcion | Tabla | Operacion detectada | Pantalla/flujo | Rol que ejecuta | Service layer | AppContext | Privada | Clasificacion |
|---|---|---|---|---|---|---|---|---|---|
| `src/services/artistProfileService.js:120` | `fetchArtistProfile` | `artist_profiles` | `.from` | Login/registro artist | Artist | Si | Si | Si | ALTO |
| `src/services/artistProfileService.js:121` | `fetchArtistProfile` | `artist_profiles` | `.select('*')` | Login/registro artist | Artist | Si | Si | Si | ALTO |
| `src/services/artistProfileService.js:142` | `saveArtistProfile` | `profiles` | `.from` | `ArtistProfileSettings` | Artist | Si | Si | Si | CRITICO |
| `src/services/artistProfileService.js:143` | `saveArtistProfile` | `profiles` | `.update` | `ArtistProfileSettings` | Artist | Si | Si | Si | CRITICO |
| `src/services/artistProfileService.js:153` | `saveArtistProfile` | `artist_profiles` | `.from` | `ArtistProfileSettings` | Artist | Si | Si | Si | CRITICO |
| `src/services/artistProfileService.js:154` | `saveArtistProfile` | `artist_profiles` | `.upsert` | `ArtistProfileSettings` | Artist | Si | Si | Si | CRITICO |
| `src/services/artistProfileService.js:155` | `saveArtistProfile` | `artist_profiles` | `.select('*') returning` | `ArtistProfileSettings` | Artist | Si | Si | Si | CRITICO |
| `src/services/artistServiceService.js:82` | `fetchCatalogMaps` | `service_categories` | `.from` | Services enrichment | Artist | Si | Si | No/catalogo | BAJO |
| `src/services/artistServiceService.js:83` | `fetchCatalogMaps` | `service_categories` | `.select` | Services enrichment | Artist | Si | Si | No/catalogo | BAJO |
| `src/services/artistServiceService.js:92` | `fetchCatalogMaps` | `service_tiers` | `.from` | Services enrichment | Artist | Si | Si | No/catalogo | BAJO |
| `src/services/artistServiceService.js:93` | `fetchCatalogMaps` | `service_tiers` | `.select` | Services enrichment | Artist | Si | Si | No/catalogo | BAJO |
| `src/services/artistServiceService.js:108` | `fetchArtistServices` | `service_offerings` | `.from` | Artist services load | Artist | Si | Si | Si | ALTO |
| `src/services/artistServiceService.js:109` | `fetchArtistServices` | `service_offerings` | `.select('*')` | Artist services load | Artist | Si | Si | Si | ALTO |
| `src/services/artistServiceService.js:126` | `ensureServiceCategory` | `service_categories` | `.from` | Save service | Artist | Si | Si | Catalogo sistema | MEDIO |
| `src/services/artistServiceService.js:127` | `ensureServiceCategory` | `service_categories` | `.upsert` | Save service | Artist | Si | Si | Catalogo sistema | MEDIO |
| `src/services/artistServiceService.js:128` | `ensureServiceCategory` | `service_categories` | `.select` returning | Save service | Artist | Si | Si | Catalogo sistema | MEDIO |
| `src/services/artistServiceService.js:138` | `ensureServiceTier` | `service_tiers` | `.from` | Save service | Artist | Si | Si | Catalogo sistema | MEDIO |
| `src/services/artistServiceService.js:139` | `ensureServiceTier` | `service_tiers` | `.upsert` | Save service | Artist | Si | Si | Catalogo sistema | MEDIO |
| `src/services/artistServiceService.js:145` | `ensureServiceTier` | `service_tiers` | `.select` returning | Save service | Artist | Si | Si | Catalogo sistema | MEDIO |
| `src/services/artistServiceService.js:175` | `saveArtistServiceOffering` | `service_offerings` | `.from().update().select()` | Edit service | Artist | Si | Si | Si | CRITICO |
| `src/services/artistServiceService.js:176` | `saveArtistServiceOffering` | `service_offerings` | `.from().insert().select()` | Create service | Artist | Si | Si | Si | CRITICO |
| `src/services/artistServiceService.js:193` | `updateArtistServiceOfferingStatus` | `service_offerings` | `.from` | Suspend/activate service | Artist | Si | Si | Si | CRITICO |
| `src/services/artistServiceService.js:194` | `updateArtistServiceOfferingStatus` | `service_offerings` | `.update` | Suspend/activate service | Artist | Si | Si | Si | CRITICO |
| `src/services/artistServiceService.js:200` | `updateArtistServiceOfferingStatus` | `service_offerings` | `.select('*') returning` | Suspend/activate service | Artist | Si | Si | Si | CRITICO |
| `src/services/artistServiceService.js:214` | `archiveArtistServiceOffering` | `service_offerings` | `.from` | Archive service | Artist | Si | Si | Si | CRITICO |
| `src/services/artistServiceService.js:215` | `archiveArtistServiceOffering` | `service_offerings` | `.update` | Archive service | Artist | Si | Si | Si | CRITICO |

## Pantallas afectadas

| Pantalla | Dependencia | Tabla(s) | Riesgo | Comentario |
|---|---|---|---|---|
| `src/pages/artist/ArtistProfileSettings.jsx` | `saveArtistProfile` desde `AppContext` | `profiles`, `artist_profiles` | CRITICO | Guardar perfil fallara si no hay RPC/policy self-update. |
| `src/pages/artist/ArtistServices.jsx` | `artistServices`, `saveArtistService`, `updateArtistServiceStatus`, `archiveArtistService` | `service_offerings`, catalogos | CRITICO | CRUD principal de servicios depende de tabla privada. |
| `src/pages/artist/ArtistDashboard.jsx` | `artistServices` | `service_offerings` | ALTO | Citas rapidas y resumen usan servicios cargados. |
| `src/pages/artist/ArtistAppointments.jsx` | `artistServices` | `service_offerings` | ALTO | Alta de citas usa servicios disponibles. |
| `src/pages/client/ClientDashboard.jsx` | `artistServices` | `service_offerings` | MEDIO | Recomendaciones/automatizaciones pueden degradarse si no carga servicios. |
| `src/pages/admin/AdminDashboard.jsx` | `artistServices` | `service_offerings` | MEDIO | Resumen owner usa servicios del contexto, no RPC admin. |
| Login/refresh session | `hydrateSupabaseSession` | `artist_profiles` | ALTO | Perfil artista no se hidrata despues de login si RLS bloquea select. |
| Registro artista | `registerArtist` + `fetchArtistProfile` | `artist_profiles` | ALTO | Onboarding puede crear bootstrap pero no hidratar perfil extendido. |

## TOP 20 flujos criticos ordenados por impacto

1. Guardar perfil profesional de artista: `ArtistProfileSettings` -> `AppContext.saveArtistProfile` -> `profiles.update` + `artist_profiles.upsert`.
2. Crear servicio nuevo: `ArtistServices` -> `saveArtistService` -> `service_offerings.insert`.
3. Editar servicio existente: `ArtistServices` -> `saveArtistService` -> `service_offerings.update`.
4. Archivar/eliminar servicio: `ArtistServices` -> `archiveArtistService` -> `service_offerings.update(status='archived')`.
5. Activar/suspender servicio: `ArtistServices` -> `updateArtistServiceStatus` -> `service_offerings.update`.
6. Cargar servicios al iniciar sesion artista: `AppContext` effect -> `loadArtistServices` -> `service_offerings.select`.
7. Hidratar perfil artista en refresh/login: `hydrateSupabaseSession` -> `fetchArtistProfile` -> `artist_profiles.select`.
8. Registro de artista post-bootstrap: `registerArtist` -> `fetchArtistProfile` -> `artist_profiles.select`.
9. Actualizar telefono de profile desde perfil artista: `saveArtistProfile` -> `profiles.update`.
10. Crear categoria dinamica desde formulario de servicio: `ensureServiceCategory` -> `service_categories.upsert`.
11. Crear/normalizar tier dinamico desde formulario de servicio: `ensureServiceTier` -> `service_tiers.upsert`.
12. Artist dashboard: selector de servicios activos depende de `artistServices` desde `service_offerings`.
13. Artist dashboard: creacion de cita rapida calcula precio/duracion desde `artistServices`.
14. Artist appointments: formulario de citas usa `artistServices` como fuente.
15. Artist services: listado de activos/suspendidos depende de `service_offerings.select`.
16. Client dashboard: recomendaciones usan `artistServices`; puede perder precios/duracion reales.
17. Client dashboard: automatizaciones cliente reciben `artistServices` y pueden degradarse.
18. Admin dashboard: resumen owner usa `artistServices` del contexto.
19. Enriquecimiento de servicios con categorias: `fetchCatalogMaps` -> `service_categories.select`.
20. Enriquecimiento de servicios con tiers: `fetchCatalogMaps` -> `service_tiers.select`.

## Clasificacion por tabla

| Tabla | Tipo | Uso actual | Riesgo con RLS restrictivo | Decision recomendada |
|---|---|---|---|---|
| `profiles` | Privada identidad | UPDATE de telefono desde artista | CRITICO | Migrar a RPC self-update limitada. |
| `artist_profiles` | Privada mixta | SELECT/UPSERT full row | CRITICO | RPC para guardar; RLS self/scoped read o RPC de perfil. |
| `service_offerings` | Privada/scoped | SELECT/INSERT/UPDATE/archive | CRITICO | RPC para save/status/archive; RLS scoped read o RPC list. |
| `service_categories` | Catalogo | SELECT/UPSERT desde artista | MEDIO | SELECT puede ser safe; UPSERT debe ser platform/RPC o catalogo fijo. |
| `service_tiers` | Catalogo | SELECT/UPSERT desde artista | MEDIO | SELECT puede ser safe; UPSERT debe ser platform/RPC o catalogo fijo. |

## SAFE / bajo riesgo

No se detecto CRUD directo sobre tablas publicas puras. Las lecturas de `service_categories` y `service_tiers` son de bajo riesgo si se definen como catalogos legibles por `authenticated` o publico. El problema no es leer catalogos, sino permitir `upsert` de catalogos desde el flujo de artista.

## OLEADA 1

Objetivo: evitar ruptura inmediata de perfil artista.

- Reemplazar dependencia de `artist_profiles.select` en hidratacion/login/registro.
- Reemplazar `profiles.update(phone)` desde `saveArtistProfile`.
- Reemplazar `artist_profiles.upsert` desde `saveArtistProfile`.
- RPC objetivo conceptual:
  - `studio_flow_artist_get_own_profile`
  - `studio_flow_artist_save_own_profile`
  - `studio_flow_update_own_profile`

## OLEADA 2

Objetivo: mantener vivo el CRUD principal de servicios del artista.

- Reemplazar `service_offerings.select` en `fetchArtistServices`.
- Reemplazar `service_offerings.insert/update/archive`.
- Validar ownership por `artist_id` contra `auth.uid()` via `artists.profile_id`.
- RPC objetivo conceptual:
  - `studio_flow_artist_get_service_offerings`
  - `studio_flow_artist_save_service_offering`
  - `studio_flow_artist_update_service_status`
  - `studio_flow_artist_archive_service_offering`

## OLEADA 3

Objetivo: cerrar mutaciones de catalogos.

- Eliminar `upsert` directo sobre `service_categories`.
- Eliminar `upsert` directo sobre `service_tiers`.
- Decidir si categorias/tier son catalogo cerrado, administrado por platform owner, o creados via RPC controlada.
- RPC objetivo conceptual:
  - `studio_flow_get_service_catalog`
  - `studio_flow_admin_manage_service_category`
  - `studio_flow_admin_manage_service_tier`

## OLEADA 4

Objetivo: desacoplar pantallas derivadas de `artistServices` global y preparar RLS por scope.

- Ajustar dashboards y formularios que consumen `artistServices` para tolerar payload RPC filtrado.
- Separar servicios propios de artista, servicios publicos y servicios admin/scoped.
- Crear contratos diferenciados para:
  - artista autenticado
  - cliente/marketplace
  - admin/studio owner
- RPC objetivo conceptual:
  - `studio_flow_public_get_service_offerings`
  - `studio_flow_admin_get_scoped_service_offerings`
  - `studio_flow_get_booking_service_options`

## Veredicto

Studio Flow ya tiene una buena frontera natural: las paginas consumen `AppContext` y `AppContext` consume services. Eso reduce la migracion porque no hay que perseguir CRUD directo en cada pantalla.

El riesgo real esta concentrado en dos services. Antes de activar RLS restrictivo, las operaciones sobre `profiles`, `artist_profiles` y `service_offerings` deben migrarse a RPC `SECURITY DEFINER` o quedar cubiertas por policies self/scoped muy precisas.
