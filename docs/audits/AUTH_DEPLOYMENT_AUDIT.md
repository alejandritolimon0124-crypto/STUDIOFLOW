# FASE 11.1 - AUTH DEPLOYMENT AUDIT

## Alcance

Auditoria de la implementacion real de Auth Foundation creada en Fase 11.0.

No se implemento codigo, no se modificaron migraciones y no se tocaron modulos operativos.

Archivos revisados:

- `src/lib/supabaseClient.js`
- `src/services/authService.js`
- `src/services/profileBootstrapService.js`
- `src/contexts/AppContext.jsx`
- `src/pages/auth/Login.jsx`
- `src/pages/auth/Register.jsx`
- `src/pages/auth/ForgotPassword.jsx`
- `src/pages/auth/ResetPassword.jsx`
- `src/pages/auth/Onboarding.jsx`
- `src/App.jsx`
- `src/routes/ProtectedRoute.jsx`
- `src/routes/paths.js`
- `src/layouts/DashboardLayout.jsx`
- `supabase/migrations/202606100012_auth_foundation.sql`

## Veredicto

**REQUIERE CORRECCIONES CRITICAS**

La implementacion compila y la direccion arquitectonica es correcta, pero no esta lista para Supabase Cloud hasta corregir dos riesgos funcionales:

1. Registro con confirmacion de email puede dejar usuarios con `profiles` pero sin `clients`/`artists`, sin `client_profiles`/`artist_profiles` y sin role assignment.
2. Modo demo puede romperse cuando Supabase esta configurado y existe una sesion real, porque `login(role)` dispara `signOut()` async y el evento `SIGNED_OUT` puede limpiar la sesion demo recien creada.

Estos problemas afectan directamente criterios obligatorios: no romper demo, no romper dashboards y dejar auth real operable en Cloud.

## Hallazgos Criticos

### 1. Registro con email confirmation queda incompleto

Archivos:

- `src/contexts/AppContext.jsx`
- `src/pages/auth/Register.jsx`
- `supabase/migrations/202606100012_auth_foundation.sql`

Riesgo:

- `signUpWithPassword()` puede devolver `data.session = null` si Supabase tiene confirmacion de email activa.
- En ese caso `registerClient()` y `registerArtist()` retornan `needsEmailConfirmation` sin llamar a:
  - `studio_flow_bootstrap_client`
  - `studio_flow_bootstrap_artist`
- El trigger `handle_new_auth_user()` puede crear solo `profiles`.
- Al iniciar sesion despues de confirmar email, `loginWithPassword()` solo llama `fetchAuthContext()`, pero no repara bootstrap faltante.

Impacto:

- Cliente real puede entrar sin fila `clients`.
- Artista real puede entrar sin fila `artists`.
- No se crean `client_profiles` ni `artist_profiles`.
- No se crea `user_role_assignments`.
- Dashboards pueden usar datos mock/locales, pero la identidad Supabase queda incompleta.

Correccion requerida:

- Persistir metadata de onboarding pendiente y reparar en primer login.
- O ejecutar bootstrap posterior al login si `authContext.client`/`authContext.artist` faltan segun `profile.default_role`.
- Onboarding debe llamar bootstrap real, no solo redirigir.

### 2. Modo demo puede ser limpiado por evento async de Supabase

Archivo:

- `src/contexts/AppContext.jsx`

Riesgo:

- `login(role)` llama `signOut().catch(() => {})` si Supabase esta configurado.
- No espera ese `signOut`.
- Luego guarda sesion demo en `localStorage` y estado React.
- El listener `onAuthStateChange()` puede recibir `SIGNED_OUT` despues y ejecutar `setSession(initialSession)` si su closure aun ve `session.isMockSession = false`.

Impacto:

- Entrar como demo despues de una sesion real puede llevar al usuario de vuelta a estado no autenticado.
- Rompe el requisito "mantener modo demo funcional".

Correccion requerida:

- Separar `loginDemo()` async y esperar `signOut()` antes de `setSession`.
- O usar un flag/ref `isSwitchingToDemo`.
- O ignorar `SIGNED_OUT` si existe sesion mock actual en un ref actualizado.

## Hallazgos Altos

### 3. Artist Claim respeta el principio principal, pero falta consistencia fuerte

Archivo:

- `supabase/migrations/202606100012_auth_foundation.sql`

Validado:

- `studio_flow_bootstrap_artist()` con `p_claim_token` busca invitacion pendiente.
- Valida email normalizado.
- Verifica que `artists.profile_id` no pertenezca a otro profile.
- Asigna `artists.profile_id = profiles.id`.
- No crea nuevo `artists` cuando el token es valido.
- No modifica memberships.

Riesgos:

- `artist_claim_invitations` no valida que `membership_id` pertenezca al mismo `artist_id` y `studio_id`.
- No hay constraint/check de consistencia para `artist_id`, `studio_id`, `membership_id`.
- No se registra `audit_events` aunque el freeze lo exige.
- No hay flujo de fallback de aprobacion de estudio/admin, solo soporte de token.

Impacto:

- Claim no rompe memberships, pero una invitacion mal creada podria aceptar un claim con datos inconsistentes.

Correccion requerida:

- Validar dentro de `studio_flow_bootstrap_artist()` que la membership, si existe, coincide con `artist_id` y `studio_id`.
- Registrar audit event de claim o documentar que queda pendiente de Trust/Audit.
- Modelar estado de revision para fallback manual.

### 4. Multirol existe en datos, pero no hay selector de contexto

Archivos:

- `src/contexts/AppContext.jsx`
- `supabase/migrations/202606100012_auth_foundation.sql`

Validado:

- `studio_flow_get_auth_context()` devuelve arreglo `roles`.
- `createSessionFromAuthContext()` conserva `roles`.
- `activeSessionContext` existe.

Riesgo:

- `getActiveRole()` elige `profiles.default_role` si existe como assignment, o el primer role assignment.
- No hay UI ni API para cambiar contexto activo.
- Si un usuario tiene `client` + `artist`, puede entrar al contexto incorrecto.
- Si un usuario tiene varios `studio_owner`/`studio_manager` scoped, solo se elige un `studioId`.

Impacto:

- No rompe el modelo, pero multirol/multiestudio queda parcialmente implementado.

Correccion requerida:

- Agregar selector de contexto activo en fase posterior.
- Persistir contexto elegido por usuario.
- Exponer todos los contexts posibles, no solo `roles`.

### 5. Multiestudio se conserva, pero solo se activa una membership

Archivo:

- `src/contexts/AppContext.jsx`

Validado:

- `memberships` se conserva como arreglo.
- `activeSessionContext.membershipId` usa la primera membership activa.

Riesgo:

- Artista multiestudio no puede elegir membership desde auth foundation.
- El primer membership por orden de creacion puede no ser el deseado.

Impacto:

- No rompe multiestudio a nivel de datos.
- Limita operacion real en UI cuando se conecten modulos a Supabase.

Correccion requerida:

- Selector de membership/contexto antes de migrar agenda/servicios/citas.

## Hallazgos Medios

### 6. `profiles.id -> auth.users.id` esta bien orientado, pero requiere validacion operacional

Archivo:

- `supabase/migrations/202606100012_auth_foundation.sql`

Validado:

- Se agrega FK `profiles.id -> auth.users.id`.
- Usa `on delete restrict`, mejor que cascade para auditoria.
- Usa `not valid`, evitando bloquear datos historicos existentes.

Riesgo:

- La constraint `not valid` no valida perfiles historicos.
- New inserts en `profiles` que no correspondan a `auth.users` fallaran.
- Esto es correcto para Auth Foundation, pero puede romper cualquier seed/manual insert antiguo que aun cree profiles sin auth user.

Veredicto parcial:

- Compatible con Studio Flow.
- Requiere que futuros seeds creen `auth.users` o eviten `profiles` pre-auth.

### 7. `artist_claim_invitations` es suficiente para MVP, incompleta para freeze total

Archivo:

- `supabase/migrations/202606100012_auth_foundation.sql`

Validado:

- Tiene `token`, `artist_id`, `studio_id`, `membership_id`, `invited_email`, estados y expiracion.

Riesgo:

- `status` es `text`, no enum.
- No hay unique parcial para una sola invitacion pendiente por artista/email.
- No hay normalizacion persistida de email.
- No hay columna `rejected_at` aunque status permite `rejected`.

Correccion recomendada:

- Agregar checks/indices de unicidad en una migracion posterior.
- Normalizar email en insert/update o usar columna generada.

### 8. Password reset es funcional, pero depende de configuracion externa

Archivos:

- `src/services/authService.js`
- `src/pages/auth/ForgotPassword.jsx`
- `src/pages/auth/ResetPassword.jsx`

Validado:

- Usa `resetPasswordForEmail`.
- Usa `redirectTo = window.location.origin + '/reset-password'`.
- Usa `updateUser({ password })`.

Riesgo:

- Supabase Cloud debe tener redirect URL autorizada.
- `ResetPassword.jsx` no distingue token expirado/no recovery session.

Correccion recomendada:

- Mostrar estado especifico para token invalido.
- Documentar redirect URLs exactas por entorno.

## Validaciones por Requisito

### No rompe modo demo

**No validado para Cloud. Requiere correccion critica.**

Demo funciona cuando no hay Supabase configurado o no hay evento async posterior. Puede romperse al cambiar desde sesion real a demo.

### No rompe dashboards existentes

**Parcialmente validado.**

El shape mantiene:

- `session.user`
- `session.role`
- `session.user.role`
- `session.user.studioId`

Riesgo pendiente: registros con email confirmation pueden entrar sin entidades reales `clients`/`artists`, aunque dashboards aun usan estado local/mock.

### No rompe roles

**Parcialmente validado.**

Roles base se seedearon y el adapter los conserva. Falta bootstrap posterior cuando `signUp` no trae session.

### No rompe artist claim

**Parcialmente validado.**

Claim token preserva `artist_id` y memberships, pero falta consistencia membership/artist/studio y audit trail.

### No rompe multirol

**Parcialmente validado.**

Datos multirol se conservan, pero no hay selector de contexto.

### No rompe multiestudio

**Parcialmente validado.**

Memberships se conservan como arreglo, pero solo se activa la primera.

## Validacion de RPCs

### `studio_flow_get_auth_context`

Fortalezas:

- Devuelve `profile`, `roles`, `client`, `artist`, `memberships`.
- Usa `auth.uid()`.
- No expone datos si no hay sesion.

Riesgos:

- Con usuarios sin bootstrap completo devuelve profile sin client/artist.
- No devuelve contexts compuestos listos para multirol/multiestudio.

### `studio_flow_bootstrap_client`

Fortalezas:

- Crea/actualiza `profiles`.
- Reutiliza `clients` sin `profile_id` por email.
- Crea `client_profiles`.
- Asigna role `client`.

Riesgos:

- No se ejecuta si `signUp` requiere confirmacion.
- No normaliza telefono.
- Reutilizacion por email puede fallar si hay duplicados multiples.

### `studio_flow_bootstrap_artist`

Fortalezas:

- Crea/actualiza `profiles`.
- Crea artista independiente cuando no hay claim token.
- Reclama artista existente con token valido.
- No crea memberships.
- Crea/actualiza `artist_profiles`.

Riesgos:

- No se ejecuta si `signUp` requiere confirmacion.
- No bloquea registro independiente cuando hay invitacion activa para el email pero no se pasa token.
- No valida consistencia interna de `membership_id`.
- No registra audit event.

## Estado de Verificacion

Referencia de Fase 11.0:

- `npm run build`: OK.
- `npm run lint`: falla por errores preexistentes fuera de Auth, no por los cambios auditados.

Esta auditoria no ejecuto nuevas correcciones.

## Correcciones Requeridas Antes de Supabase Cloud

1. Reparar flujo post-confirmacion de email:
   - al primer login, si falta `client`/`artist`, ejecutar bootstrap segun `profile.default_role` o metadata segura.
   - o hacer que `/onboarding` ejecute bootstrap real.
2. Hacer `login(role)` demo seguro con Supabase configurado:
   - esperar `signOut`;
   - ignorar evento `SIGNED_OUT` durante cambio a demo;
   - o separar `loginDemo`.
3. Validar consistencia de `artist_claim_invitations.membership_id` contra `artist_id` y `studio_id`.
4. Agregar audit event para claim aceptado o declarar explicitamente que queda pendiente antes de Trust.
5. Definir fallback manual de claim como estado/revision, aunque no tenga UI completa.

## Decision Final

**REQUIERE CORRECCIONES CRITICAS**

La implementacion es una buena base tecnica y respeta gran parte del freeze, pero no debe desplegarse a Supabase Cloud como foundation definitiva hasta corregir el flujo con email confirmation y la carrera entre demo login y `SIGNED_OUT`.
