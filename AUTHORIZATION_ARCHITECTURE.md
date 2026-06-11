# FASE 15.1B - AUTHORIZATION ARCHITECTURE AUDIT

## Objetivo

Disenar la arquitectura definitiva de autorizacion para Studio Flow.

Tablas auditadas:

```txt
roles
user_role_assignments
artist_studio_memberships
studios
profiles
```

No se crearon politicas.
No se modifico codigo.
No se implemento nada.

## Principios definitivos

1. `profiles` es identidad privada.
2. `roles` y `permissions` son catalogos de sistema.
3. `user_role_assignments` define autoridad global o scoped por estudio.
4. `artist_studio_memberships` define relacion operativa entre artista y estudio.
5. `studios` contiene entidad operativa y estado de governance.
6. Lo publico debe salir de vistas/RPCs publicas o tablas marketplace, no de tablas privadas completas.
7. Escrituras administrativas deben pasar por RPC `SECURITY DEFINER`.
8. RLS debe bloquear acceso directo por defecto.

## Roles

Roles actuales:

```txt
platform_owner
studio_owner
studio_manager
artist
client
```

Roles UI equivalentes:

| Rol | Alcance |
|---|---|
| Public | Usuario anonimo, sin sesion |
| Client | Cliente autenticada |
| Artist | Artista autenticada |
| Studio Owner | Owner de uno o mas studios |
| Studio Manager | Manager scoped por studio |
| Platform Owner | Operacion global Studio Flow |

## Fuente de autorizacion

### Global / scoped business roles

Tabla:

```txt
user_role_assignments
```

Regla:

```txt
profile_id = auth.uid()
status = 'active'
role_id -> roles.code
studio_id null = global
studio_id not null = scoped
```

### Relacion artista-estudio

Tabla:

```txt
artist_studio_memberships
```

Regla:

```txt
artist_id -> artists.id
studio_id -> studios.id
status = 'active'
```

### Propiedad de studio

Tabla:

```txt
studios
```

Regla:

```txt
owner_profile_id = auth.uid()
```

## Que debe ser publico

Publico significa legible por anon o usuario autenticado sin relacion privada.

Debe ser publico solo:

```txt
Catalogo marketplace publicado
Perfiles publicos publicados
Servicios activos publicados
Slots disponibles publicos si el artista/studio esta publicado
```

No deben ser publicos directamente:

```txt
profiles
user_role_assignments
artist_studio_memberships
studios completos
artist_profiles completos
clients
client_profiles
customer_private_notes
appointments privados
economy/revenue
```

Para lo publico, recomendacion:

```txt
public_marketplace_profiles view/RPC
public_artist_cards RPC
public_service_offerings RPC
```

No exponer tablas privadas completas.

## Que debe manejarse con RLS

RLS directo recomendado para:

```txt
profiles self-read/self-update limitada
artists self-read
artist_profiles self-read/self-update
studios read scoped
artist_studio_memberships read scoped
roles read catalog
permissions read catalog
```

RLS debe negar por defecto:

```txt
anon en tablas privadas
cross-studio reads
updates sin scope
deletes fisicos
```

## Que debe manejarse con RPC SECURITY DEFINER

Usar RPC `SECURITY DEFINER` cuando la operacion:

- cruza varias tablas.
- requiere validar rol + scope.
- crea audit trail.
- cambia estados sensibles.
- toca identidad/roles/membresias.

RPCs definitivas recomendadas:

```txt
studio_flow_get_auth_context()
studio_flow_admin_get_artists()
studio_flow_admin_get_clients()
studio_flow_admin_update_artist_status()
studio_flow_admin_update_client_status()
studio_flow_admin_save_artist_profile()
studio_flow_admin_save_client_profile()
studio_flow_admin_assign_role()
studio_flow_admin_revoke_role()
studio_flow_admin_update_studio_status()
studio_flow_admin_manage_artist_membership()
```

## Matriz por tabla

Leyenda:

```txt
R = READ
W = WRITE/INSERT
U = UPDATE
D = DELETE/ARCHIVE
No = no permitido
Own = solo registro propio
Scoped = solo dentro de studio asignado
All = global
Public = anon/published-only
RPC = solo via RPC SECURITY DEFINER
```

## `roles`

Naturaleza:

```txt
Catalogo de roles de sistema.
```

| Rol | READ | WRITE | UPDATE | DELETE |
|---|---|---|---|---|
| Public | No | No | No | No |
| Client | No | No | No | No |
| Artist | No | No | No | No |
| Studio Owner | Read labels via auth context only | No | No | No |
| Studio Manager | Read labels via auth context only | No | No | No |
| Platform Owner | All | RPC only | RPC only | No |

RLS/RPC:

```txt
RLS: bloquear anon; permitir authenticated read minimo si se necesita UI.
RPC: cambios de catalogo solo platform_owner.
```

Recomendacion:

`roles` debe ser practicamente inmutable. No deletes fisicos.

## `permissions`

Aunque no fue tabla solicitada principal, es pareja de `roles`.

| Rol | READ | WRITE | UPDATE | DELETE |
|---|---|---|---|---|
| Public | No | No | No | No |
| Client | No | No | No | No |
| Artist | No | No | No | No |
| Studio Owner | Read own effective permissions via auth context | No | No | No |
| Studio Manager | Read own effective permissions via auth context | No | No | No |
| Platform Owner | All | RPC only | RPC only | No |

RLS/RPC:

```txt
RLS para lectura restringida.
RPC para resolver permisos efectivos.
```

## `role_permissions`

| Rol | READ | WRITE | UPDATE | DELETE |
|---|---|---|---|---|
| Public | No | No | No | No |
| Client | No | No | No | No |
| Artist | No | No | No | No |
| Studio Owner | No directo | No | No | No |
| Studio Manager | No directo | No | No | No |
| Platform Owner | All | RPC only | RPC only | RPC/archive only |

RLS/RPC:

```txt
RPC SECURITY DEFINER para administrar.
No acceso directo desde frontend.
```

## `profiles`

Naturaleza:

```txt
Identidad privada del usuario.
```

Columnas sensibles:

```txt
email
phone
default_role
status
```

| Rol | READ | WRITE | UPDATE | DELETE |
|---|---|---|---|---|
| Public | No | No | No | No |
| Client | Own | No directo | Own limited: display_name/phone via RPC | No |
| Artist | Own | No directo | Own limited: display_name/phone via RPC | No |
| Studio Owner | Scoped staff/client profile summaries via RPC | No directo | Scoped limited via RPC | No |
| Studio Manager | Scoped client/profile summaries via RPC | No directo | Scoped limited via RPC | No |
| Platform Owner | All via RPC/admin | RPC only | RPC only | Archive only via RPC |

RLS:

```txt
Self read: profiles.id = auth.uid()
Self update: campos limitados, preferible RPC.
No anon.
```

RPC SECURITY DEFINER:

```txt
admin profile lookup
profile status changes
role-aware profile updates
```

Privado:

```txt
email, phone, default_role, status
```

Publico:

```txt
Ninguna columna directa.
display_name publico solo por vista/RPC publica si aplica.
```

## `user_role_assignments`

Naturaleza:

```txt
Fuente de autoridad de roles y scopes.
```

| Rol | READ | WRITE | UPDATE | DELETE |
|---|---|---|---|---|
| Public | No | No | No | No |
| Client | Own effective roles only via auth context | No | No | No |
| Artist | Own effective roles only via auth context | No | No | No |
| Studio Owner | Scoped team assignments via RPC | Invite/request via RPC if allowed | Scoped revoke via RPC if allowed | No physical delete |
| Studio Manager | Own/effective only | No | No | No |
| Platform Owner | All via RPC/admin | RPC only | RPC only | Revoke/archive via RPC |

RLS:

```txt
Self read puede permitirse.
Scoped read para studio_owner con studio_id asignado.
No direct insert/update/delete.
```

RPC SECURITY DEFINER:

```txt
assign role
revoke role
list effective roles
transfer studio ownership
```

Privado:

```txt
Todo.
```

Publico:

```txt
Nada.
```

## `studios`

Naturaleza:

```txt
Entidad operativa de estudio y governance.
```

Columnas sensibles:

```txt
owner_profile_id
studio_status
risk_score
approved_at
suspended_at
archived_at
```

| Rol | READ | WRITE | UPDATE | DELETE |
|---|---|---|---|---|
| Public | Published/marketplace summary only, not table direct | No | No | No |
| Client | Published/marketplace summary only | No | No | No |
| Artist | Studios where membership active | No | No, except requests via RPC | No |
| Studio Owner | Own studios | Create studio via RPC/onboarding | Own non-governance fields via RPC | Archive request via RPC |
| Studio Manager | Assigned studios read | No | Operational fields via RPC if granted | No |
| Platform Owner | All | RPC only | All governance/status via RPC | Archive via RPC |

RLS:

```txt
Read scoped by owner_profile_id or active user_role_assignments.studio_id.
No anon direct table read.
```

RPC SECURITY DEFINER:

```txt
create studio
approve/suspend/reject studio
change owner
archive studio
```

Publico:

```txt
Solo studio publicado mediante marketplace_profiles/listings o public RPC.
```

Privado:

```txt
owner_profile_id, risk_score, status interno, audit/governance timestamps.
```

## `studio_profiles`

Aunque no fue tabla principal solicitada, es extension necesaria de `studios`.

| Rol | READ | WRITE | UPDATE | DELETE |
|---|---|---|---|---|
| Public | Published summary only via public RPC/view | No | No | No |
| Client | Published summary only | No | No | No |
| Artist | Studio profile for active memberships | No | No | No |
| Studio Owner | Own studio profiles | RPC only | Own via RPC | No |
| Studio Manager | Assigned studio profiles | No | Limited via RPC | No |
| Platform Owner | All | RPC only | All via RPC | Archive via RPC |

RLS:

```txt
Scoped read direct puede ser aceptable para authenticated.
Writes via RPC.
```

## `artists`

Naturaleza:

```txt
Entidad profesional asociada opcionalmente a un profile.
```

| Rol | READ | WRITE | UPDATE | DELETE |
|---|---|---|---|---|
| Public | Published active artists only via public RPC/view | No | No | No |
| Client | Published active artists only | No | No | No |
| Artist | Own artist row | No directo | Own limited display/status requests via RPC | No |
| Studio Owner | Artists in owned/assigned studios | Invite/link via RPC | Scoped status/profile via RPC | Unlink/archive membership via RPC |
| Studio Manager | Artists in assigned studios | No | Limited scoped operational update via RPC | No |
| Platform Owner | All | RPC only | All via RPC | Archive via RPC |

RLS:

```txt
Self read where artists.profile_id = auth.uid()
Scoped read through artist_studio_memberships + user_role_assignments.
No direct anon table read.
```

RPC SECURITY DEFINER:

```txt
claim artist
invite artist
link artist to studio
update artist status
archive artist
```

Publico:

```txt
Solo published/active display data.
```

Privado:

```txt
profile_id, status interno, archived_at.
```

## `artist_profiles`

Naturaleza:

```txt
Perfil profesional extendido del artista.
```

Campos mixtos:

Publicables:

```txt
artistic_name
bio
specialties
primary_specialty
photo_path
portfolio_paths
city
```

Privados o controlados:

```txt
whatsapp
address_line
latitude
longitude
address_references
payment_methods
use_studio_location
```

| Rol | READ | WRITE | UPDATE | DELETE |
|---|---|---|---|---|
| Public | Published subset only via public RPC/view | No | No | No |
| Client | Published subset only | No | No | No |
| Artist | Own full profile | Create own via RPC/bootstrap | Own via RPC or RLS | No |
| Studio Owner | Artists in scoped studios | No direct | Scoped update via RPC if permitted | No |
| Studio Manager | Artists in assigned studios, limited fields | No | Limited via RPC | No |
| Platform Owner | All | RPC only | All via RPC | Archive via RPC if needed |

RLS:

```txt
Self read/update possible.
Scoped read for studio roles.
No public direct table select.
```

RPC SECURITY DEFINER:

```txt
admin save artist profile
publish/unpublish profile
moderate contact/location fields
```

Recomendacion:

Crear vista/RPC publica que omita direccion exacta/contacto privado salvo que marketplace lo permita explicitamente.

## `artist_studio_memberships`

Naturaleza:

```txt
Relacion operativa entre artista y estudio.
```

| Rol | READ | WRITE | UPDATE | DELETE |
|---|---|---|---|---|
| Public | No | No | No | No |
| Client | No direct | No | No | No |
| Artist | Own memberships | No direct | Accept/leave via RPC | No physical delete |
| Studio Owner | Memberships in own/assigned studios | Invite/link via RPC | Scoped role/status via RPC | Archive/unlink via RPC |
| Studio Manager | Memberships in assigned studios | No | Limited operational status via RPC if granted | No |
| Platform Owner | All | RPC only | All via RPC | Archive via RPC |

RLS:

```txt
Self artist read.
Studio scoped staff read.
No anon.
```

RPC SECURITY DEFINER:

```txt
create membership
accept invitation
change membership role
suspend/unlink membership
archive membership
```

Privado:

```txt
Todo.
```

Publico:

```txt
Nada directo. Marketplace puede expose "works at studio" como derived public info.
```

## `clients`

Aunque no estuvo en la lista del objetivo principal de arquitectura, es necesario para Admin/Core.

| Rol | READ | WRITE | UPDATE | DELETE |
|---|---|---|---|---|
| Public | No | No | No | No |
| Client | Own | Create via bootstrap RPC | Own limited via RPC | Archive request via RPC |
| Artist | Clients with relationship/appointments to artist | No direct | Notes/relationship fields via RPC only | No |
| Studio Owner | Clients scoped to studio | No direct | Scoped via RPC | No |
| Studio Manager | Clients scoped to studio | No direct | Scoped limited via RPC | No |
| Platform Owner | All | RPC only | All via RPC | Archive via RPC |

RLS:

```txt
Self read.
No anon.
Scoped staff read requires relationship table or appointment-derived RPC.
```

RPC SECURITY DEFINER:

```txt
admin get clients
admin update client status
admin save client profile
```

## `client_profiles`

| Rol | READ | WRITE | UPDATE | DELETE |
|---|---|---|---|---|
| Public | No | No | No | No |
| Client | Own | Created by bootstrap RPC | Own limited via RPC | No |
| Artist | Scoped relationship subset | No | No direct | No |
| Studio Owner | Scoped clients | No | Scoped via RPC | No |
| Studio Manager | Scoped clients | No | Scoped limited via RPC | No |
| Platform Owner | All | RPC only | All via RPC | Archive via RPC |

RLS:

```txt
Self read.
Staff scoped read should be RPC unless direct relationship table exists.
```

## `customer_private_notes`

| Rol | READ | WRITE | UPDATE | DELETE |
|---|---|---|---|---|
| Public | No | No | No | No |
| Client | No | No | No | No |
| Artist | Own scope notes for clients they served | RPC only | Own/scoped notes via RPC | Archive own via RPC |
| Studio Owner | Studio scoped notes | RPC only | Scoped via RPC | Archive scoped via RPC |
| Studio Manager | Studio scoped notes | RPC only | Scoped via RPC | Archive own/scoped via RPC |
| Platform Owner | All | RPC only | All via RPC | Archive via RPC |

RLS:

```txt
No anon.
Prefer RPC over direct RLS because scopes are complex.
```

Privado:

```txt
Todo.
```

## Operaciones por rol

## Public

Puede leer:

```txt
Solo datos publicados mediante vistas/RPC publicas:
- artistas publicados
- estudios publicados
- servicios publicados
- disponibilidad publica
```

No puede escribir:

```txt
Nada en tablas privadas.
```

Manejo:

```txt
Public RPC/views, no tablas privadas directas.
```

## Client

Puede leer:

```txt
Su propio profiles row.
Su propio clients/client_profiles row.
Marketplace publico.
Sus appointments y loyalty cuando se migren.
```

Puede escribir/actualizar:

```txt
Su perfil limitado.
Favoritos.
Reservas propias via RPC.
```

No puede:

```txt
Leer otros clientes.
Leer profiles de staff completos.
Leer roles internos.
```

Manejo:

```txt
RLS self-read + RPC para booking/mutaciones.
```

## Artist

Puede leer:

```txt
Su profile.
Su artist row.
Su artist_profile.
Sus memberships.
Clientes/citas asociados a su trabajo.
```

Puede escribir/actualizar:

```txt
Su artist_profile.
Sus servicios.
Su agenda.
Notas propias/scoped si aplica.
```

No puede:

```txt
Editar status global de artista.
Editar memberships arbitrarios.
Leer clientes de otros artistas.
```

Manejo:

```txt
RLS self/scoped + RPC para operaciones multi-tabla.
```

## Studio Owner

Puede leer:

```txt
Studios propios/asignados.
Studio profiles propios/asignados.
Artists vinculados a sus studios.
Clients vinculados a sus studios.
Appointments/economy de sus studios.
Memberships de sus studios.
```

Puede escribir/actualizar:

```txt
Studio profile.
Invitar/vincular artistas via RPC.
Actualizar datos operativos scoped.
Notas de clientes scoped.
```

No puede:

```txt
Acceder a otros studios.
Cambiar roles globales.
Ver revenue global.
Modificar platform settings.
```

Manejo:

```txt
RLS scoped + RPC SECURITY DEFINER para membership/roles/status.
```

## Studio Manager

Puede leer:

```txt
Studio asignado.
Artistas asignados.
Clientes/citas scoped.
Servicios/agenda scoped.
```

Puede escribir/actualizar:

```txt
Operaciones diarias permitidas:
- agenda
- citas
- notas scoped
- algunos datos de clientes
```

No puede:

```txt
Gestionar ownership.
Cambiar roles.
Suspender studios/artistas globalmente.
Ver datos financieros globales.
```

Manejo:

```txt
RLS scoped + RPC para acciones operativas.
```

## Platform Owner

Puede leer:

```txt
Todo el ecosistema.
```

Puede escribir/actualizar:

```txt
Governance global.
Estados.
Roles.
Studios.
Artists.
Clients.
Marketplace moderation.
```

Puede eliminar:

```txt
No delete fisico desde app.
Solo archive/revoke/suspend via RPC.
```

Manejo:

```txt
RPC SECURITY DEFINER para escrituras sensibles.
RLS all-read para platform_owner si se implementa directo.
```

## READ/WRITE/UPDATE/DELETE consolidado

| Tabla | Public | Client | Artist | Studio Owner | Studio Manager | Platform Owner |
|---|---|---|---|---|---|---|
| `roles` | No | No | No | Read effective only | Read effective only | Read all, write/update via RPC |
| `permissions` | No | No | No | Read effective only | Read effective only | Read all, write/update via RPC |
| `role_permissions` | No | No | No | No direct | No direct | RPC only |
| `profiles` | No | Own R/U limited | Own R/U limited | Scoped R/U via RPC | Scoped R/U via RPC | All via RPC |
| `user_role_assignments` | No | Own effective via RPC | Own effective via RPC | Scoped read/manage via RPC | Own/effective read | All via RPC |
| `studios` | Published only via public RPC | Published only | Membership studios read | Own/scoped R/U via RPC | Assigned R/limited U via RPC | All via RPC |
| `studio_profiles` | Published only via public RPC | Published only | Membership studio read | Own/scoped R/U via RPC | Assigned R/limited U via RPC | All via RPC |
| `artists` | Published active only via public RPC | Published active | Own read/update limited | Scoped R/U via RPC | Scoped read/limited U via RPC | All via RPC |
| `artist_profiles` | Published subset only | Published subset | Own R/U | Scoped R/U via RPC | Scoped read/limited U via RPC | All via RPC |
| `artist_studio_memberships` | No | No | Own read/accept/leave via RPC | Scoped R/W/U/archive via RPC | Scoped read/limited U via RPC | All via RPC |
| `clients` | No | Own R/U limited | Scoped relationship read | Scoped R/U via RPC | Scoped R/limited U via RPC | All via RPC |
| `client_profiles` | No | Own R/U limited | Scoped relationship subset | Scoped R/U via RPC | Scoped R/limited U via RPC | All via RPC |
| `customer_private_notes` | No | No | Scoped R/W/U/archive via RPC | Scoped R/W/U/archive via RPC | Scoped R/W/U/archive via RPC | All via RPC |

## DELETE policy

Regla definitiva:

```txt
No DELETE fisico desde frontend.
```

Usar:

```txt
archived_at
revoked_at
status = 'archived'
status = 'revoked'
status = 'suspended'
```

DELETE fisico solo:

```txt
service role / mantenimiento / migrations controladas
```

## RLS vs RPC por operacion

## RLS directo recomendado

```txt
profiles own read
profiles own limited update
artists own read
artist_profiles own read/update
studios scoped read
studio_profiles scoped read
artist_studio_memberships own/scoped read
```

## RPC SECURITY DEFINER obligatorio

```txt
assign/revoke roles
create/update user_role_assignments
create/suspend/archive studios
approve/reject studios
link/unlink artists to studios
update artist status by admin
update client status by admin
manage customer_private_notes
any cross-studio admin read model
any operation that writes audit_events
```

## Public data architecture

No usar:

```txt
select * from artists
select * from artist_profiles
select * from studios
select * from studio_profiles
```

para publico.

Usar:

```txt
public marketplace RPC/view
```

Ejemplos:

```txt
studio_flow_public_search_artists()
studio_flow_public_get_artist_profile()
studio_flow_public_get_studio_profile()
studio_flow_public_get_service_offerings()
```

Estas funciones deben devolver solo:

```txt
display public name
public bio/summary
city/zone, not exact address unless explicit
published services
rating/review aggregate if available
public portfolio paths
public availability windows
```

Nunca devolver publico:

```txt
profile email
profile phone
private phone/whatsapp unless explicitly published
owner_profile_id
role assignments
membership internals
client data
private notes
revenue/economy
```

## Validaciones internas recomendadas para RPC

Cada RPC sensible debe validar:

```sql
auth.uid() is not null
profile exists and status = 'active'
role assignment exists and status = 'active'
studio scope matches target row, unless platform_owner
target row not archived
operation is permitted for role
```

Patron recomendado:

```txt
private helper:
studio_flow_has_role(p_role, p_studio_id default null)

private helper:
studio_flow_assert_admin_scope(p_studio_id)

private helper:
studio_flow_current_profile()
```

## Arquitectura definitiva recomendada

Capas:

```txt
Frontend
-> service layer
-> RPC SECURITY DEFINER para operaciones admin/multi-tabla
-> RLS para self/scoped direct reads simples
-> audit_events para acciones sensibles
```

No recomendado:

```txt
Frontend -> CRUD directo sobre tablas privadas
```

excepto para operaciones self muy simples protegidas con RLS.

## Prioridad de implementacion futura

1. Revocar acceso anon directo a tablas privadas.
2. Enable RLS en:
   - `profiles`
   - `user_role_assignments`
   - `studios`
   - `studio_profiles`
   - `artists`
   - `artist_profiles`
   - `artist_studio_memberships`
   - `clients`
   - `client_profiles`
   - `customer_private_notes`
3. Crear helper SQL de roles/scopes.
4. Crear RPCs Admin Core.
5. Crear RPCs public marketplace.
6. Mover service layers frontend a RPCs.
7. Agregar audit trail a operaciones sensibles.

## Veredicto final

Diseno definitivo:

```txt
RLS para privacidad base y self/scoped reads.
RPC SECURITY DEFINER para administracion, cambios de estado, roles, memberships y writes multi-tabla.
Vistas/RPC publicas para marketplace.
No acceso anon directo a tablas privadas.
No deletes fisicos desde frontend.
```

Esta arquitectura permite:

- proteger datos sensibles.
- mantener multi-tenant por estudio.
- soportar platform owner global.
- evitar que el frontend sea la fuente real de permisos.
- migrar Admin Core sin exponer tablas completas.
