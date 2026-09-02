# FASE 10.1 - AUTH FOUNDATION AUDIT

## Alcance

Auditoria critica previa a implementar Auth real en Studio Flow.

No se implemento codigo, no se crearon migraciones y no se modificaron archivos operativos.

Nota de fuente: el workspace no contiene `AUTH_FOUNDATION.md`. La fuente de auth disponible es `AUTH_IMPLEMENTATION_PLAN.md`, que se audita como documento equivalente de foundation.

Fuentes revisadas:

- `AUTH_IMPLEMENTATION_PLAN.md`
- `SQL_MASTER_DESIGN.md`
- `ARCHITECTURE_FREEZE.md`
- `SUPABASE_ARCHITECTURE_MASTER.md`

## Veredicto

**REQUIERE AJUSTES MENORES**

La base propuesta es compatible con Studio Flow: `profiles` es la entidad correcta para identidad de aplicacion, `user_role_assignments` soporta multirol y `artists`/`clients` permiten vinculo opcional a un profile. Sin embargo, antes de implementar Auth real deben cerrarse cuatro decisiones para evitar deuda estructural:

1. Definir formalmente el flujo de claim de artista creada por estudio.
2. Resolver la estrategia anti-duplicados por email/telefono entre `profiles`, `clients` y `artists`.
3. Precisar como se elige rol activo cuando un profile tiene multiples roles.
4. Evitar que el bootstrap directo desde cliente quede bloqueado o inseguro antes de RLS.

No requiere rediseno parcial si estos ajustes se incorporan al plan antes de escribir codigo.

## 1. Modelo `auth.users` ↔ `profiles`

### Evaluacion

La estrategia `profiles.id = auth.users.id` es adecuada como direccion principal para Studio Flow.

Compatibilidad con arquitectura:

- `SQL_MASTER_DESIGN.md` define `profiles` como perfil de aplicacion vinculado a identidad autenticable.
- `profiles` tiene relacion 1:N con `user_role_assignments`.
- `profiles` tiene relacion 1:0..1 con `artists` y 1:0..1 con `clients`.
- `SUPABASE_ARCHITECTURE_MASTER.md` tambien modela `profiles` como centro de identidad y roles.

Esto calza con Supabase Auth porque el UUID de `auth.users.id` puede ser la llave estable de identidad. La app evita una tabla puente adicional y simplifica `auth.uid() = profiles.id` para RLS futura.

### Riesgos

- **Migracion retroactiva**: las migraciones actuales crean `profiles.id default gen_random_uuid()`. Si ya existen profiles no vinculados a `auth.users`, una FK directa fallara.
- **Perfil sin auth vs auth sin perfil**: Studio Flow necesita artistas creadas por estudio antes de que la artista reclame cuenta. Esa situacion no debe forzar `profiles.id = auth.users.id` si todavia no hay usuario autenticable.
- **Borrado cascade**: `on delete cascade` desde `auth.users` puede borrar `profiles` y dejar datos historicos sensibles afectados por cascadas indirectas o FKs restrictivas. Para negocio/auditoria, puede convenir bloquear delete fisico y usar `status = archived`.
- **Email unico global**: `profiles.email unique` es util para login, pero puede chocar con `clients.email` y `artists` pre-auth creados por estudios.

### Alternativas

1. **Estrategia directa: `profiles.id = auth.users.id`**
   - Recomendada para usuarios autenticables.
   - Mejor para RLS futura.
   - Debe permitir entidades pre-auth sin profile o con profile placeholder cuidadosamente definido.

2. **Columna separada: `profiles.auth_user_id unique references auth.users(id)`**
   - Mas flexible para migraciones y claim.
   - Permite profiles creados antes del auth user.
   - Aumenta complejidad en RLS y queries.

3. **Tabla puente: `auth_identities(profile_id, auth_user_id)`**
   - Maxima flexibilidad para multiples proveedores/identidades.
   - Sobredimensionada para esta fase.

### Confirmacion

`profiles.id = auth.users.id` es la mejor estrategia para cuentas autenticadas, siempre que el plan distinga:

- entidad profesional/cliente pre-auth;
- profile autenticado;
- proceso de claim que vincula datos existentes sin duplicarlos.

## 2. Bootstrap de Perfiles

### Validacion de entidades

El bootstrap propuesto crea las entidades correctas:

- `profiles`: identidad de aplicacion.
- `clients`: cliente global, con `profile_id` nullable/unico.
- `client_profiles`: datos globales no internos del cliente.
- `artists`: artista profesional independiente de estudio, con `profile_id` nullable/unico.
- `artist_profiles`: perfil profesional publico/operativo.

La propuesta respeta que `client_profiles` y `artist_profiles` no son identidad auth, sino extensiones de dominio.

### Riesgos de duplicados

- **Cliente duplicado por email**: si un cliente ya fue creado por una artista/estudio como contacto operativo y luego se registra con el mismo email, el bootstrap podria crear otro `clients`.
- **Artista duplicada por email/telefono/nombre**: si un studio owner crea una artista y luego la artista se registra, `registerArtist` podria crear un nuevo `artists` en vez de reclamar el existente.
- **`profiles.email` vs `clients.email`**: el email puede existir en `clients` sin profile y luego aparecer en `profiles`.
- **Confirmacion de email**: si Supabase requiere confirmacion, `signUp` puede no devolver sesion activa; el bootstrap desde frontend puede quedar incompleto.
- **Reintentos**: refresh, doble click o errores parciales pueden dejar `profiles` creado sin `clients`/`artists`, o `artist` creado sin `artist_profiles`.

### Ajustes requeridos antes de implementar

- Definir bootstrap idempotente por email normalizado y, cuando exista, telefono.
- Para cliente: buscar `clients.email = normalized_email` sin `profile_id` antes de insertar.
- Para artista: buscar `artists.profile_id is null` mediante email en `artist_profiles`, datos de invitacion o tabla de claim.
- Separar "crear cuenta" de "reclamar entidad existente".
- Registrar estado parcial recuperable: si existe `profiles` pero falta `client_profiles`/`artist_profiles`, el onboarding debe reparar sin duplicar.

## 3. Roles y Multirol

### Validacion de roles base

Los roles auditados son compatibles con el modelo:

- `client`
- `artist`
- `studio_owner`
- `studio_manager`
- `platform_owner`

`SQL_MASTER_DESIGN.md` define `user_role_assignments` como autoridad unica para roles globales y roles scoped por estudio. Esto corrige la tension del `ARCHITECTURE_FREEZE.md`, donde `user_role_assignments` y `studio_team_members` competian conceptualmente. En el SQL master, `studio_team_members` queda fuera del MVP como fuente de verdad.

### Multirol

El modelo soporta multirol porque:

- `profiles` tiene N:N con `roles` mediante `user_role_assignments`.
- `user_role_assignments` permite `studio_id` nullable para rol global o scoped.
- Un mismo `profile` puede tener `client` y `artist`.
- Un mismo `profile` puede tener `studio_owner` en un estudio y `artist` independiente.

### Riesgos

- **`default_role` no basta**: usar solo `profiles.default_role` oculta roles multiples.
- **Rol activo ambiguo**: si el usuario tiene `client` + `artist`, la app necesita seleccionar contexto.
- **Studio scope ambiguo**: `studio_owner`/`studio_manager` requieren `studio_id` activo.
- **Usuarios sin rol**: si falla seed o assignment, el login tendra profile pero no permisos claros.

### Ajuste requerido

El plan debe definir un `activeSessionContext`:

```js
{
  role,
  studioId,
  artistId,
  clientId,
  membershipId
}
```

`session.role` puede mantenerse por compatibilidad, pero debe representar el contexto activo, no la totalidad de roles del usuario.

## 4. Claim de Artista

### Escenario auditado

- Studio crea artista.
- Artista reclama cuenta despues.
- Artista conserva memberships.
- Artista puede operar independiente.

### Compatibilidad con arquitectura

El modelo soporta el escenario si se usa correctamente:

- `artists.profile_id` es nullable y unique cuando existe.
- `artist_studio_memberships` vincula `artists` con `studios`.
- `membership_id` es la autoridad para operaciones de artista dentro de estudio.
- `artist_id` es la autoridad para operaciones independientes.

Esto permite crear una artista sin cuenta auth, asociarla a uno o varios estudios, y despues asignar `artists.profile_id = profiles.id` cuando reclama.

### Riesgo principal

El plan actual de `registerArtist` dice "crear `artists.profile_id`" pero no define claim. Si se implementa literalmente, puede duplicar artistas y romper el historial de memberships, servicios, agenda o citas asociados al `artist_id` original.

### Reglas necesarias

- Studio-created artist debe existir con `artists.profile_id = null`.
- El claim debe vincular el profile nuevo al `artists` existente, no crear otro artist.
- Las memberships existentes deben permanecer en `artist_studio_memberships` sin recrearse.
- La artista reclamada debe poder:
  - operar dentro del estudio via `membership_id`;
  - operar independiente via `artist_id`;
  - tener servicios/agendas independientes sin mezclarlos con membership.

### Recomendacion

Agregar una decision de producto/tecnica antes de implementar:

- claim por invitacion tokenizada;
- claim por email preautorizado;
- claim manual por studio owner/admin;
- o una combinacion.

Sin esa decision, el registro artista no esta listo.

## 5. Compatibilidad con Mocks

### Validacion

La transicion propuesta es viable si se preservan:

- `session.user`
- `session.role`
- `login(role)`
- `logout()`
- dashboards existentes

La forma actual de la UI depende de `session.user.role`, `session.user.studioId`, `session.role`, permisos locales y estados mock. Mantener el contrato es correcto para no migrar modulos completos.

### Riesgos

- **Contrato incompleto**: una sesion Supabase sin `user.role` rompera permisos locales.
- **`login(role)` ambiguo**: si tambien existe `loginWithPassword`, debe quedar claro que `login(role)` es demo.
- **Persistencia doble**: Supabase Auth y `studio-flow-session` pueden contradecirse.
- **Logout mixto**: cerrar sesion real no debe borrar estados mock, pero si debe limpiar el adapter de auth.

### Ajuste requerido

Definir precedencia:

1. Si hay sesion Supabase valida, usar sesion real.
2. Si no hay sesion Supabase y hay sesion mock explicita, usar mock.
3. Si ambas existen, la sesion real gana o se limpia mock al login real.

## 6. Onboarding

### Evaluacion

La estrategia de onboarding inferido por existencia/contenido minimo es correcta para no agregar columnas prematuras ni migrar modulos completos.

### Datos minimos sugeridos

Para `profiles`:

- `display_name`
- `email`
- `default_role`
- `status`

Para `clients`:

- `profile_id`
- `name`/display derivado segun columnas reales
- `email`
- `phone` si existe

Para `client_profiles`:

- fila 1:1 con `client_id`
- datos globales no internos
- no guardar notas internas

Para `artists`:

- `profile_id`
- nombre profesional o legal minimo
- status operativo inicial

Para `artist_profiles`:

- fila 1:1 con `artist_id`
- nombre publico minimo
- bio/especialidad opcional

Para contexto de estudio:

- no crear `artist_studio_memberships` durante registro independiente salvo que el flujo sea claim/invitacion.

### Riesgos

- Inferir onboarding por tablas relacionadas puede ser costoso y ambiguo con multirol.
- Si el usuario es multirol, puede estar completo como client pero incompleto como artist.
- Onboarding no debe exigir servicios, agenda, marketplace, pagos ni storage.

### Ajuste requerido

El onboarding debe ser por contexto activo:

- `client_onboarding_complete`
- `artist_onboarding_complete`
- `studio_onboarding_complete`

En esta fase puede ser inferido, no necesariamente persistido.

## 7. Recuperacion de Contrasena

### Validacion

El flujo propuesto es funcional:

1. `resetPasswordForEmail(email, { redirectTo })`.
2. Ruta `/reset-password`.
3. Nueva password.
4. `supabase.auth.updateUser({ password })`.

### Riesgos

- `redirectTo` debe estar registrado en Supabase Auth URL configuration.
- La ruta `/reset-password` debe manejar sesion de recovery y errores de token expirado.
- Si el usuario no tiene `profiles`, despues de reset debe ir a reparacion/onboarding.
- Debe evitar revelar si un email existe.

### Ajuste requerido

El plan debe incluir estados:

- email enviado;
- token invalido/expirado;
- password actualizada;
- perfil faltante, redirigir a onboarding/reparacion.

## 8. Riesgos Criticos

### Datos huerfanos

Riesgo medio. Puede ocurrir si se crea `auth.users` sin `profiles`, o `profiles` sin entidad `clients`/`artists`. Mitigacion: bootstrap idempotente y reparacion en login.

### Duplicados

Riesgo alto. Principalmente en `clients` por email y en `artists` creadas por estudios. Mitigacion: normalizacion, busqueda previa, claim explicito y constraints/indices revisados.

### Perfiles reclamados

Riesgo alto. Es el hueco mas importante del plan actual. Claim debe vincular `profile_id` a `artists` existente y preservar memberships.

### Emails repetidos

Riesgo medio-alto. `profiles.email unique` simplifica auth, pero `clients.email` y entidades pre-auth pueden duplicar semantica. Mitigacion: email normalizado y reglas de claim/merge.

### Usuarios sin rol

Riesgo medio. Si no existe `user_role_assignments`, el fallback a `default_role` funciona, pero no expresa scope de estudio. Mitigacion: crear assignment base en bootstrap o definir fallback temporal claramente.

### Usuarios con multiples roles

Riesgo medio. El modelo lo soporta, pero la UI actual solo espera `session.role`. Mitigacion: mantener `session.role` como contexto activo y guardar lista completa aparte.

### Sin RLS

Riesgo alto operacional, aunque fuera de alcance. Si el frontend escribe directo a tablas con anon key antes de RLS, puede requerir grants amplios. Mitigacion para implementacion: usar RPC controladas/security definer o validar entorno temporal de pruebas. No activar RLS todavia, pero no ignorar permisos SQL.

## 9. Ajustes Requeridos al Plan Antes de Implementar

1. Renombrar o alinear fuente: crear/renombrar `AUTH_FOUNDATION.md` o declarar que `AUTH_IMPLEMENTATION_PLAN.md` es el foundation oficial.
2. Mantener `profiles.id = auth.users.id` para cuentas autenticadas, pero documentar excepcion pre-auth para `artists`/`clients` sin profile.
3. Evitar `on delete cascade` como decision automatica; preferir archivo/logical delete salvo decision contraria.
4. Definir flujo de claim de artista antes de `registerArtist`.
5. Definir idempotencia del bootstrap y recuperacion de estados parciales.
6. Definir seleccion de contexto activo para multirol.
7. Definir precedencia entre sesion real y sesion mock.
8. Definir estrategia temporal de permisos SQL sin RLS para bootstrap seguro.
9. Definir estados de recuperacion de password y URLs autorizadas.

## Decision Final

**REQUIERE AJUSTES MENORES**

La direccion es correcta y compatible con Studio Flow. No hay contradiccion fatal con los documentos maestros. El punto que mas se debe cerrar antes de implementar es el claim de artista, porque Studio Flow necesita preservar `artist_studio_memberships` y permitir operacion independiente sin duplicar `artists`.

Una vez incorporados los ajustes anteriores, la fase puede pasar a implementacion sin redisenar el modelo central.
