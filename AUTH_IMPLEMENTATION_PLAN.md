# FASE 10.0 - AUTH FOUNDATION

## Objetivo

Conectar Studio Flow con Supabase Auth sin activar RLS, sin migrar modulos completos y manteniendo compatibilidad temporal con los mocks actuales.

La fase debe entregar auth real para:

- Login con email/password.
- Registro con email/password.
- Logout real.
- Recuperacion de contrasena.
- Vinculo entre `auth.users` y `profiles`.
- Onboarding inicial por tipo de cuenta.
- Modo demo/mock disponible durante la transicion.

## Estado Actual Detectado

- La app usa React/Vite y no tiene `@supabase/supabase-js` instalado.
- No existen variables `VITE_SUPABASE_URL` ni `VITE_SUPABASE_ANON_KEY`.
- `src/contexts/AppContext.jsx` guarda la sesion mock en `localStorage` con la key `studio-flow-session`.
- `login(role)` selecciona usuarios de `src/services/mockData.js`; varias pantallas dependen de `session.user`, `session.role` y permisos locales.
- `src/App.jsx` es el router activo y ya protege `/client`, `/artist` y `/admin` con `ProtectedRoute`.
- `src/routes/AppRouter.jsx` parece router alterno/legado y no esta importado por `src/App.jsx`.
- Las migraciones SQL ya definen `profiles`, `roles`, `artists`, `clients`, `studios`, `artist_profiles`, `client_profiles` y `user_role_assignments`, pero `profiles.id` todavia no tiene FK explicita a `auth.users(id)`.
- `MIGRATION_EXECUTION_REPORT.md` indica que las migraciones no fueron validadas en runtime porque Docker/Supabase local no pudo iniciar.

## Principios de Implementacion

1. No activar RLS en esta fase.
2. No migrar agenda, clientes, artistas, servicios ni dashboards a Supabase.
3. Mantener `session.user`, `session.role`, `login(role)` y `logout()` como contrato temporal para no romper UI existente.
4. Introducir auth real en una capa separada: Supabase Auth + bootstrap de perfil + session adapter.
5. Usar mocks solo como fallback/demo explicito, no como fuente primaria cuando exista sesion Supabase.
6. Evitar dependencias circulares: `auth` no debe importar paginas; paginas consumen contexto/servicios.

## Modelo de Identidad Propuesto

### Supabase Auth

`auth.users.id` sera la identidad tecnica de autenticacion.

### Tabla `profiles`

`profiles.id` debe usar el mismo UUID que `auth.users.id`.

Campos existentes relevantes:

- `id`
- `display_name`
- `email`
- `phone`
- `default_role`
- `status`

Cambio requerido:

- Agregar una migracion nueva que documente y fuerce el vinculo:
  - `profiles.id uuid primary key references auth.users(id) on delete cascade`
  - Si no se puede alterar en caliente por datos existentes, crear migracion defensiva que valide primero ausencia de datos incompatibles.

### Roles

La UI debe seguir usando codigos existentes:

- `platform_owner`
- `studio_owner`
- `studio_manager`
- `artist`
- `client`

La sesion adaptada debe exponer:

```js
{
  user: {
    id,
    name,
    email,
    phone,
    role,
    studioId
  },
  role,
  authUser,
  profile,
  isMockSession
}
```

## Flujo de Login Real

1. Usuario captura email/password en `src/pages/auth/Login.jsx`.
2. `loginWithPassword({ email, password })` llama `supabase.auth.signInWithPassword`.
3. `AppProvider` escucha `supabase.auth.onAuthStateChange`.
4. Al recibir sesion:
   - cargar `profiles` por `id = auth.user.id`;
   - cargar rol activo desde `user_role_assignments` si existe;
   - si no hay asignacion, usar `profiles.default_role`;
   - construir `session` compatible.
5. Redirigir segun rol:
   - `client` -> `/client`
   - `artist` -> `/artist`
   - `studio_owner`, `studio_manager`, `platform_owner` -> `/admin`

## Flujo de Registro Real

### Registro Cliente

1. `Register.jsx` captura nombre, email, telefono y password.
2. `registerClient(input)` llama `supabase.auth.signUp` con metadata minima:
   - `display_name`
   - `phone`
   - `default_role: client`
3. Despues de crear el usuario, ejecutar bootstrap de perfil:
   - upsert en `profiles` con `id = auth.user.id`;
   - crear o vincular `clients.profile_id`;
   - crear `client_profiles` minimo.
4. Redirigir a onboarding cliente o `/client` si el perfil minimo queda completo.

### Registro Artista

1. `Register.jsx` captura datos personales y profesionales minimos.
2. `registerArtist(input)` llama `supabase.auth.signUp` con metadata:
   - `display_name`
   - `phone`
   - `default_role: artist`
3. Bootstrap:
   - upsert en `profiles`;
   - crear `artists.profile_id`;
   - crear `artist_profiles` inicial;
   - conservar `studio_status` usando `getDefaultStudioStatus()`;
   - no crear servicios, agenda ni marketplace en esta fase.
4. Redirigir a onboarding artista o `/artist/settings`.

## Recuperacion de Contrasena

1. Crear pantalla o modo dedicado para recuperar password.
2. Usar `supabase.auth.resetPasswordForEmail(email, { redirectTo })`.
3. Crear ruta para actualizar password despues del callback:
   - leer sesion/codigo de Supabase;
   - pedir nueva password;
   - llamar `supabase.auth.updateUser({ password })`.

Rutas propuestas:

- `/forgot-password`
- `/reset-password`

## Logout Real

1. `logout()` debe llamar `supabase.auth.signOut()` cuando la sesion no sea mock.
2. Limpiar estado auth local y mantener los estados mock/admin/client/artist intactos.
3. Redirigir a `/login`.

## Onboarding Inicial

Crear una ruta comun:

- `/onboarding`

La pantalla decide por rol:

- `client`: completar nombre, telefono y preferencias basicas.
- `artist`: completar perfil profesional minimo ya existente en `ArtistProfileSettings`, pero sin migrar toda la pantalla a Supabase.
- `studio_owner`: reservar para fase posterior; en esta fase puede mostrar pendiente/configuracion minima.

Estado sugerido:

- Derivar `needsOnboarding` en cliente con campos minimos faltantes.
- Persistir un marcador simple en `profiles` solo si se agrega columna nueva.
- Alternativa sin columna nueva: inferir por existencia/contenido minimo de `clients`, `artists`, `client_profiles` o `artist_profiles`.

Recomendacion para esta fase: inferencia por tablas existentes, sin agregar `onboarding_completed_at` hasta definir RLS y ownership.

## Compatibilidad Temporal con Mocks

Mantener:

- Botones demo en `Login.jsx`.
- `login(role)` como API mock para `QASandbox.jsx`.
- `session.role` y `session.user.role`.
- Estados locales `adminState`, `clientState`, `artistState`.

Agregar:

- `loginDemo(role)` o mantener `login(role)` como alias mock.
- `loginWithPassword(credentials)` para auth real.
- `registerClient(input)` y `registerArtist(input)`.
- `resetPassword(email)` y `updatePassword(password)`.
- `isAuthLoading`.
- `authError`.
- `isMockSession`.

## Cambios SQL Requeridos

Crear nueva migracion:

`supabase/migrations/202606100012_auth_foundation.sql`

Contenido esperado:

- Vincular `profiles.id` con `auth.users(id)`.
- Crear funcion `public.handle_new_auth_user()` solo para perfil minimo si se decide bootstrap automatico por trigger.
- Crear trigger `on_auth_user_created` en `auth.users` si se usa bootstrap automatico.
- Seed/idempotencia de roles base si las migraciones actuales no insertan roles.
- No crear policies.
- No ejecutar `alter table ... enable row level security`.

Decision recomendada:

- Usar bootstrap desde aplicacion para esta fase y dejar trigger como opcional, porque el registro necesita rutas distintas para cliente/artista.
- Si se agrega trigger, que solo cree `profiles`; las tablas `clients`, `artists`, `client_profiles` y `artist_profiles` deben seguir en servicios explicitos.

## Archivos Exactos a Modificar

### Dependencias y configuracion

- `package.json`
  - Agregar `@supabase/supabase-js`.
- `package-lock.json`
  - Actualizar lockfile despues de instalar dependencia.
- `.env.example`
  - Crear si no existe, con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.

### Supabase

- `supabase/migrations/202606100012_auth_foundation.sql`
  - Nueva migracion de vinculo `auth.users` -> `profiles` y bootstrap minimo.

### Cliente Auth

- `src/lib/supabaseClient.js`
  - Nuevo cliente Supabase.
- `src/services/authService.js`
  - Nuevo servicio para login, registro, logout, reset/update password y lectura de perfil.
- `src/services/profileBootstrapService.js`
  - Nuevo servicio para crear perfil/cliente/artista inicial sin migrar modulos completos.
- `src/services/mockAuthService.js`
  - Nuevo wrapper de usuarios demo, o extraccion desde `AppContext.jsx`.

### Contexto

- `src/contexts/AppContext.jsx`
  - Integrar listener de Supabase Auth.
  - Mantener `login(role)` para demo.
  - Agregar `loginWithPassword`, `registerClient`, `registerArtist`, `resetPassword`, `updatePassword`.
  - Agregar `isAuthLoading`, `authError`, `isMockSession`.
  - Adaptar la sesion real al shape mock actual.
- `src/contexts/appContextCore.js`
  - Sin cambio funcional esperado, salvo si se documenta/valida shape del contexto.

### Rutas

- `src/App.jsx`
  - Agregar rutas `/forgot-password`, `/reset-password` y `/onboarding`.
  - Mantener `ProtectedRoute` en rutas privadas.
- `src/routes/paths.js`
  - Agregar `forgotPassword`, `resetPassword`, `onboarding`.
- `src/routes/ProtectedRoute.jsx`
  - Soportar `isAuthLoading`.
  - Redirigir segun auth real/mock.
  - Evitar rechazo prematuro mientras carga perfil.
- `src/routes/AppRouter.jsx`
  - No modificar en esta fase salvo que se confirme que reemplazara a `src/App.jsx`.

### Pantallas Auth

- `src/pages/auth/Login.jsx`
  - Convertir formulario a estado controlado.
  - Usar `loginWithPassword`.
  - Mantener accesos demo.
  - Enlazar recuperacion de password.
- `src/pages/auth/Register.jsx`
  - Convertir formularios a estado controlado.
  - Usar `registerClient` y `registerArtist`.
  - Validar password/confirmacion.
  - Redirigir a onboarding o dashboard segun resultado.
- `src/pages/auth/ForgotPassword.jsx`
  - Nueva pantalla.
- `src/pages/auth/ResetPassword.jsx`
  - Nueva pantalla.
- `src/pages/auth/Onboarding.jsx`
  - Nueva pantalla inicial.

### Layouts

- `src/layouts/DashboardLayout.jsx`
  - Asegurar que `logout()` async no rompa navegacion.
- `src/layouts/AuthLayout.jsx`
  - Sin cambio obligatorio; solo ajustar si las nuevas pantallas requieren composicion.

### Permisos y adaptadores

- `src/modules/permissions/rolePermissions.js`
  - No cambiar roles base; solo agregar helper si hace falta normalizar rol real.
- `src/modules/entities/entitySelectors.js`
  - Revisar solo si el adapter de sesion real no cubre `profileId`/`studioId`.

### Estilos

- `src/styles/global.css`
  - Agregar estilos minimos para estados de error/loading en auth y onboarding si los componentes existentes no alcanzan.

## Archivos que No Deben Modificarse en Fase 10.0

- `src/services/mockData.js`, salvo extraccion no disruptiva de usuarios demo.
- Paginas operativas de admin/artista/cliente, excepto si hay un bug directo por shape de sesion.
- Migraciones de agenda, servicios, marketplace, economia, loyalty o trust.
- Politicas RLS.
- Seeds o migracion completa de mocks.

## Orden de Ejecucion

1. Instalar `@supabase/supabase-js` y crear `.env.example`.
2. Crear `supabaseClient`.
3. Crear `authService` y `profileBootstrapService`.
4. Adaptar `AppContext` manteniendo API mock.
5. Actualizar `Login` y `Register`.
6. Crear pantallas `ForgotPassword`, `ResetPassword`, `Onboarding`.
7. Agregar rutas y paths.
8. Crear migracion SQL `202606100012_auth_foundation.sql`.
9. Probar modo demo.
10. Probar login/registro real contra Supabase remoto o local.
11. Documentar variables necesarias y limitaciones de RLS pendiente.

## Criterios de Aceptacion

- El usuario puede registrarse como cliente con Supabase Auth.
- El usuario puede registrarse como artista con Supabase Auth.
- Cada usuario real tiene `profiles.id = auth.users.id`.
- Registro cliente crea estructura minima de cliente sin migrar dashboards.
- Registro artista crea estructura minima de artista sin migrar servicios/agenda.
- Login real restaura sesion al refrescar la pagina.
- Logout real invalida sesion Supabase.
- Recuperacion de contrasena envia email y permite actualizar password desde callback.
- Los botones demo siguen funcionando.
- `QASandbox.jsx` sigue pudiendo cambiar roles mock.
- No hay RLS habilitado ni policies nuevas.
- La app compila.

## Riesgos y Bloqueos

- Las migraciones no fueron ejecutadas localmente por falta de Docker; cualquier cambio SQL debe validarse en Supabase remoto o en un entorno con Docker disponible.
- Sin RLS, cualquier acceso directo con anon key dependera de permisos de tabla; para pruebas puede requerir SQL grants temporales o RPC controladas.
- Si `profiles.id` ya contiene UUIDs no pertenecientes a `auth.users`, la FK directa fallara y se necesitara una migracion de reconciliacion.
- El email unico de `profiles.email` puede bloquear casos donde una persona quiera operar con multiples perfiles separados usando el mismo correo.
- Confirmacion de email en Supabase puede hacer que `signUp` no devuelva sesion inmediata; el flujo debe soportar estado "revisa tu correo".

## Fuera de Alcance

- RLS.
- Migracion completa de datos mock.
- Refactor de permisos completo hacia base de datos.
- OAuth Google funcional.
- Storage para fotos.
- Marketplace/publicacion.
- Agenda, servicios, citas y pagos reales.
