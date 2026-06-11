# FASE 15.1A - ADMIN RLS AUDIT

## Objetivo

Auditar RLS, permisos de lectura/escritura y posibles bloqueos para un service layer Admin sobre:

```txt
artists
artist_profiles
clients
client_profiles
artist_studio_memberships
customer_private_notes
profiles
```

No se modifico codigo.
No se crearon politicas.
No se hicieron escrituras.

## Resumen ejecutivo

Las migraciones locales no definen RLS ni politicas para las tablas auditadas.

No se encontro en `supabase/migrations`:

```txt
alter table ... enable row level security
create policy ...
```

para:

```txt
artists
artist_profiles
clients
client_profiles
artist_studio_memberships
customer_private_notes
profiles
```

Verificacion Cloud con anon key:

```txt
select limit 1 funciona en todas las tablas auditadas.
```

Esto indica que, en el proyecto Cloud actual, la lectura publica via anon esta permitida para esas tablas, probablemente porque RLS esta desactivado o porque no hay restricciones efectivas expuestas por PostgREST.

Veredicto:

```txt
No hay bloqueo RLS para lectura Admin ahora mismo.
Pero hay riesgo critico de exposicion de datos si anon puede leer profiles, clients y customer data.
```

## Evidencia local

Busqueda ejecutada sobre migraciones:

```txt
row level security
enable row
create policy
grant
revoke
```

Resultado relevante:

- No hay `enable row level security` para las tablas auditadas.
- No hay `create policy` para las tablas auditadas.
- Solo hay grants de ejecucion para RPCs de auth/bootstrap.

Archivo:

```txt
supabase/migrations/202606100012_auth_foundation.sql
```

Grants encontrados:

```sql
grant execute on function public.studio_flow_get_auth_context() to anon, authenticated;
grant execute on function public.studio_flow_bootstrap_client(text, text) to authenticated;
grant execute on function public.studio_flow_bootstrap_artist(text, text, text, text, uuid) to authenticated;
```

RPCs relevantes usan:

```txt
SECURITY DEFINER
```

pero son de auth/bootstrap, no de Admin.

## Evidencia Cloud

Consulta de solo lectura realizada con `VITE_SUPABASE_ANON_KEY`.

Tablas auditadas:

```txt
artists
artist_profiles
clients
client_profiles
artist_studio_memberships
customer_private_notes
profiles
```

Resultado:

| Tabla | Select con anon | Resultado |
|---|---:|---|
| `artists` | OK | 1 row |
| `artist_profiles` | OK | 1 row |
| `clients` | OK | 1 row |
| `client_profiles` | OK | 1 row |
| `artist_studio_memberships` | OK | 0 rows |
| `customer_private_notes` | OK | 0 rows |
| `profiles` | OK | 1 row |

Intento de consultar `pg_policies` via PostgREST:

```txt
PGRST205: Could not find the table 'public.pg_policies' in the schema cache
```

Interpretacion:

- `pg_policies` no esta expuesto como tabla REST en el schema `public`.
- No se pudo listar politicas reales desde anon.
- La evidencia local y el comportamiento de lectura indican ausencia de bloqueo RLS efectivo.

## Tabla por tabla

## `profiles`

Columnas sensibles:

```txt
display_name
email
phone
default_role
status
```

RLS local:

```txt
No definido.
```

Lectura Cloud con anon:

```txt
Permitida.
```

Escritura esperada para Admin:

```txt
profiles.display_name
profiles.phone
profiles.status
```

Riesgo:

```txt
CRITICO
```

Si anon puede leer `profiles`, emails y telefonos quedan expuestos.

Bloqueo para service layer Admin:

```txt
No para lectura actual.
Potencialmente no para escritura si RLS esta desactivado y grants lo permiten.
```

Recomendacion futura:

- Habilitar RLS.
- Permitir self-read por `auth.uid() = id`.
- Permitir Admin read/write via role assignments o RPC SECURITY DEFINER.
- No exponer email/phone a anon.

## `artists`

Columnas:

```txt
profile_id
display_name
status
archived_at
```

RLS local:

```txt
No definido.
```

Lectura Cloud con anon:

```txt
Permitida.
```

Escritura Admin esperada:

```txt
artists.status
artists.display_name
```

Riesgo:

```txt
ALTO
```

Datos operativos y status de artistas quedan visibles.

Bloqueo para service layer Admin:

```txt
No para lectura actual.
Riesgo de escritura demasiado abierta si no hay RLS/grants restrictivos.
```

Recomendacion futura:

- RLS para lectura publica solo si artista esta activo/publicado.
- Admin write solo para `platform_owner`, `studio_owner`, `studio_manager` scoped.

## `artist_profiles`

Columnas sensibles:

```txt
artistic_name
bio
specialties
photo_path
portfolio_paths
city
whatsapp
instagram
facebook
website
address_line
latitude
longitude
address_references
```

RLS local:

```txt
No definido.
```

Lectura Cloud con anon:

```txt
Permitida.
```

Escritura Admin esperada:

```txt
artist_profiles.bio
artist_profiles.city
artist_profiles.address_line
artist_profiles.state
artist_profiles.postal_code
artist_profiles.latitude
artist_profiles.longitude
artist_profiles.address_references
```

Riesgo:

```txt
ALTO
```

La informacion publica del artista puede ser aceptable, pero direccion/coordenadas/contacto no deberian ser anon-readable sin control de publicacion.

Bloqueo para service layer Admin:

```txt
No para lectura actual.
Escritura directa puede ser insegura si se usa desde cliente sin RLS.
```

Recomendacion futura:

- Separar perfil privado vs marketplace/publico.
- RLS Admin scoped.
- Public read solo sobre artistas publicados.

## `clients`

Columnas sensibles:

```txt
display_name
email
phone
status
```

RLS local:

```txt
No definido.
```

Lectura Cloud con anon:

```txt
Permitida.
```

Escritura Admin esperada:

```txt
clients.display_name
clients.email
clients.phone
clients.status
```

Riesgo:

```txt
CRITICO
```

Clientes, emails y telefonos no deben estar disponibles anonimamente.

Bloqueo para service layer Admin:

```txt
No para lectura actual.
Pero el modelo actual es inseguro para produccion.
```

Recomendacion futura:

- RLS obligatorio.
- Cliente solo puede leer su propio row.
- Admin scoped puede leer clientes por permisos.
- Updates via RPC o policies con roles.

## `client_profiles`

Columnas:

```txt
birthday
preferred_services
last_visit_at
next_recommended_visit_at
```

RLS local:

```txt
No definido.
```

Lectura Cloud con anon:

```txt
Permitida.
```

Escritura Admin esperada:

```txt
client_profiles.preferred_services
client_profiles.next_recommended_visit_at
```

Riesgo:

```txt
ALTO
```

Preferencias, fechas y datos personales de clientes no deben ser anon-readable.

Bloqueo para service layer Admin:

```txt
No para lectura actual.
```

Recomendacion futura:

- RLS por propietario y Admin scoped.
- Evitar acceso anon.

## `artist_studio_memberships`

Columnas:

```txt
artist_id
studio_id
role
status
started_at
ended_at
```

RLS local:

```txt
No definido.
```

Lectura Cloud con anon:

```txt
Permitida, 0 rows devueltas en la consulta.
```

Interpretacion:

- La consulta no fallo.
- La tabla puede estar vacia en Cloud o no tener rows visibles por ausencia de datos.
- No confirma politicas, pero no hay bloqueo de API.

Escritura Admin esperada:

```txt
artist_studio_memberships.status
artist_studio_memberships.role
artist_studio_memberships.ended_at
```

Riesgo:

```txt
MEDIO/ALTO
```

Memberships exponen estructura operativa de estudios.

Bloqueo para service layer Admin:

```txt
No para lectura actual.
```

Recomendacion futura:

- Platform owner puede leer todo.
- Studio owner/manager solo memberships de su studio.
- Artists solo sus memberships.

## `customer_private_notes`

Columnas sensibles:

```txt
note
created_by_profile_id
client_id
scope_type
artist_id
studio_id
membership_id
```

RLS local:

```txt
No definido.
```

Lectura Cloud con anon:

```txt
Permitida, 0 rows devueltas.
```

Interpretacion:

- No fallo la consulta.
- Si existen notas futuras, podrian quedar expuestas si RLS sigue desactivado.

Escritura Admin esperada:

```txt
insert/update/archive customer_private_notes
```

Riesgo:

```txt
CRITICO
```

Notas privadas de clientes requieren RLS estricta.

Bloqueo para service layer Admin:

```txt
No para lectura actual.
Pero no debe implementarse escritura directa desde cliente sin RLS/policies.
```

Recomendacion futura:

- RLS obligatorio antes de usar en produccion.
- Insert solo para staff con scope valido.
- Select solo para staff dentro del scope.
- Update/archive solo creador o admin scoped.

## Permisos de lectura

Estado actual observado:

```txt
Anon puede leer las tablas auditadas via PostgREST.
```

Esto desbloquea un service layer Admin desde frontend, pero de forma insegura.

Para Fase 15.1, si se implementa CRUD directo con `supabase.from(...)`, probablemente las lecturas funcionen.

Pero:

```txt
Que funcione no significa que sea seguro.
```

## Permisos de escritura

No se probaron escrituras porque la auditoria no debe modificar datos.

Desde migraciones locales:

- No hay RLS que limite escrituras.
- No hay policies Admin.
- No hay RPCs Admin.

Riesgo:

Si Supabase tiene grants de tabla para `anon`/`authenticated` y RLS desactivado, un cliente podria escribir mas de lo debido.

Si en Cloud hay alguna configuracion no reflejada en migraciones, podria bloquear updates/inserts.

Conclusion:

```txt
La escritura Admin directa no debe asumirse segura.
```

## Permisos Admin

Actualmente los roles existen en:

```txt
roles
user_role_assignments
```

Y `studio_flow_get_auth_context()` devuelve roles/memberships del usuario autenticado.

Pero no hay politicas SQL que usen:

```txt
auth.uid()
user_role_assignments
roles
artist_studio_memberships
```

para proteger las tablas auditadas.

Por tanto:

```txt
Los permisos Admin existen a nivel app/contexto, no a nivel RLS.
```

## Posibles bloqueos para Admin Core Service

### Bloqueos actuales

| Area | Bloqueo |
|---|---|
| Lectura `artists` | No observado |
| Lectura `artist_profiles` | No observado |
| Lectura `clients` | No observado |
| Lectura `client_profiles` | No observado |
| Lectura `profiles` | No observado |
| Lectura `memberships/notes` | No observado, aunque no habia rows |
| Escritura directa | No verificada |
| Admin scoped permissions SQL | No existe |

### Bloqueo futuro probable

Cuando se habilite RLS correctamente, cualquier service layer Admin directo con:

```js
supabase.from('clients').select(...)
supabase.from('artists').update(...)
```

fallara si no existen policies o RPCs Admin.

## Recomendacion para Fase 15.1

Hay dos caminos:

## Camino A: CRUD directo temporal

Ventaja:

```txt
Implementacion rapida.
Probablemente funciona ahora porque RLS no bloquea.
```

Desventaja:

```txt
Inseguro para produccion.
Riesgo alto de exposicion/escritura indebida.
Se rompera cuando se active RLS.
```

Estado recomendado:

```txt
Solo aceptable como fase temporal en entorno controlado.
```

## Camino B: RPC Admin SECURITY DEFINER

Crear en fase posterior:

```txt
studio_flow_admin_get_artists()
studio_flow_admin_get_clients()
studio_flow_admin_update_artist_status(...)
studio_flow_admin_update_client_status(...)
studio_flow_admin_save_artist_profile(...)
studio_flow_admin_save_client_profile(...)
```

Cada RPC debe validar:

```txt
auth.uid()
role platform_owner / studio_owner / studio_manager
studio scope
status active
```

Ventaja:

```txt
Seguro y estable bajo RLS.
```

Desventaja:

```txt
Mas trabajo SQL antes de implementar UI.
```

Estado recomendado:

```txt
Recomendado para produccion.
```

## Politicas necesarias si se elige RLS directo

No crear ahora, solo referencia.

### `profiles`

- Self select/update limitado.
- Admin select scoped.
- Admin update solo campos permitidos.

### `artists`

- Public select solo artistas publicados/activos si aplica.
- Artist self select.
- Admin select/update scoped.

### `artist_profiles`

- Public select solo campos publicables.
- Artist self update.
- Admin scoped update.

### `clients`

- Client self select/update.
- Admin scoped select/update.
- No anon.

### `client_profiles`

- Client self select.
- Admin scoped select/update.
- No anon.

### `artist_studio_memberships`

- Artist self select.
- Studio owner/manager scoped select.
- Platform owner all.

### `customer_private_notes`

- No anon.
- Staff scoped select.
- Staff scoped insert.
- Archive/update solo scoped.

## Veredicto final

Estado actual:

```txt
RLS NO IMPLEMENTADO / NO EFECTIVO para tablas Admin Core.
```

Impacto para Fase 15.1:

```txt
Admin Core puede avanzar tecnicamente con CRUD directo,
pero no esta protegido para produccion.
```

Riesgo principal:

```txt
Anon puede leer datos sensibles como profiles, clients y client_profiles.
```

Recomendacion:

Antes de considerar Admin Core listo para produccion, crear una capa de seguridad:

```txt
RPCs SECURITY DEFINER con validacion de roles
o
RLS policies completas por rol y scope.
```

Para evitar retrabajo, el service layer Admin deberia aislar todas las lecturas/escrituras desde el primer dia, de modo que despues pueda cambiar internamente de CRUD directo a RPC sin tocar las pantallas.
