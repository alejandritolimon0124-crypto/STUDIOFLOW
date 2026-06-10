# FASE 12.0 - SUPABASE CLOUD DEV SETUP

## Objetivo

Preparar Studio Flow para conectarse a un proyecto Supabase Cloud DEV sin activar RLS, sin migrar mocks y sin tocar agenda, marketplace, loyalty ni dashboards.

## Estado de Migraciones

Verificado en `supabase/migrations/`: existen las 12 migraciones requeridas.

1. `202606100001_milestone_01_identity_access.sql`
2. `202606100002_milestone_02_studios_artists.sql`
3. `202606100003_milestone_03_services.sql`
4. `202606100004_milestone_04_scheduling.sql`
5. `202606100005_milestone_05_appointments.sql`
6. `202606100006_milestone_06_economy.sql`
7. `202606100007_milestone_07_customer_360.sql`
8. `202606100008_milestone_08_marketplace.sql`
9. `202606100009_milestone_09_loyalty.sql`
10. `202606100010_milestone_10_trust.sql`
11. `202606100011_migration_audit_minor_fixes.sql`
12. `202606100012_auth_foundation.sql`

Tambien se verifico que no hay `enable row level security` ni `create policy` en las migraciones actuales.

## Crear Proyecto Supabase Cloud DEV

1. Entrar a Supabase Cloud.
2. Crear un proyecto nuevo.
3. Nombre recomendado: `studio-flow-dev`.
4. Elegir organizacion y region de desarrollo.
5. Guardar la database password en un lugar seguro.
6. Esperar a que el proyecto termine de aprovisionarse.

Este proyecto debe ser DEV. No usarlo como produccion.

## Obtener Project URL y Anon Key

En el dashboard del proyecto:

1. Ir a `Project Settings`.
2. Abrir `API`.
3. Copiar `Project URL`.
4. Copiar `anon public` key.

No usar la `service_role` key en el frontend.

## Crear `.env.local`

En la raiz del proyecto, crear `.env.local`:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

Usar `.env.example` como referencia.

Despues de modificar `.env.local`, reiniciar Vite.

## Configurar Redirect URLs

En Supabase Cloud:

1. Ir a `Authentication`.
2. Abrir `URL Configuration`.
3. Configurar `Site URL` para desarrollo local:

```text
http://localhost:5173
```

4. Agregar redirect URLs:

```text
http://localhost:5173/reset-password
http://localhost:5173/login
http://localhost:5173/register
```

Si se usa otro puerto local, agregar tambien ese puerto.

Para un deploy preview/dev remoto, agregar:

```text
https://your-dev-domain/reset-password
https://your-dev-domain/login
https://your-dev-domain/register
```

## Configurar Email Auth

En `Authentication > Providers > Email`:

- Email/password debe estar habilitado.
- Confirm email puede estar habilitado o deshabilitado.

La implementacion soporta ambos modos:

- Si `signUp` devuelve sesion inmediata, bootstrap ocurre al registrar.
- Si requiere confirmacion de email, bootstrap se repara en el primer login.

## Ejecutar Migraciones en Supabase Cloud

### Opcion A: Supabase CLI con link

Instalar e iniciar sesion si hace falta:

```bash
supabase login
```

Vincular el proyecto:

```bash
supabase link --project-ref your-project-ref
```

Ejecutar migraciones:

```bash
supabase db push
```

### Opcion B: SQL Editor

Si no se usa CLI:

1. Abrir `SQL Editor` en Supabase Cloud.
2. Ejecutar las migraciones en orden del `202606100001` al `202606100012`.
3. No saltar migraciones.
4. No activar RLS manualmente.

Recomendacion: usar CLI para conservar historial de migraciones.

## No Activar RLS Todavia

En esta fase:

- No ejecutar `alter table ... enable row level security`.
- No crear policies.
- No cambiar grants salvo que sea necesario para diagnostico DEV.

Auth Foundation usa RPCs `security definer` para bootstrap inicial.

## No Migrar Mocks Todavia

En esta fase:

- No insertar mocks operativos.
- No migrar agenda.
- No migrar marketplace.
- No migrar loyalty.
- No conectar dashboards a tablas reales.

Los accesos demo deben seguir funcionando desde la app.

## Ejecutar App Local

Instalar dependencias:

```bash
npm install
```

Iniciar Vite:

```bash
npm run dev
```

Abrir:

```text
http://localhost:5173
```

## Probar Login Real

1. Ir a `/register`.
2. Crear una cuenta cliente o artista.
3. Si Supabase pide confirmacion, confirmar desde el email.
4. Ir a `/login`.
5. Iniciar sesion con email/password.
6. Validar redireccion:
   - client -> `/client`
   - artist -> `/artist/settings` despues de registro o `/artist` desde login
   - roles admin/studio se validaran cuando existan assignments reales.

## Probar Registro Cliente

1. Ir a `/register`.
2. Elegir `Crear cuenta cliente`.
3. Completar:
   - nombre
   - email
   - telefono opcional
   - contrasena
4. Crear cuenta.
5. Confirmar email si aplica.
6. Iniciar sesion.
7. En Supabase SQL, validar:

```sql
select * from profiles order by created_at desc limit 5;
select * from clients order by created_at desc limit 5;
select * from client_profiles order by created_at desc limit 5;
select ura.*, r.code
from user_role_assignments ura
join roles r on r.id = ura.role_id
order by ura.created_at desc
limit 5;
```

Debe existir:

- `profiles.id = auth.users.id`
- `clients.profile_id = profiles.id`
- `client_profiles.client_id = clients.id`
- role assignment `client`

## Probar Registro Artista

1. Ir a `/register`.
2. Elegir `Crear cuenta artista`.
3. Completar:
   - nombre artistico
   - nombre completo opcional
   - email
   - telefono opcional
   - ciudad opcional
   - contrasena
4. Dejar token de invitacion vacio para artista independiente.
5. Crear cuenta.
6. Confirmar email si aplica.
7. Iniciar sesion.
8. En Supabase SQL, validar:

```sql
select * from profiles order by created_at desc limit 5;
select * from artists order by created_at desc limit 5;
select * from artist_profiles order by created_at desc limit 5;
select ura.*, r.code
from user_role_assignments ura
join roles r on r.id = ura.role_id
order by ura.created_at desc
limit 5;
```

Debe existir:

- `profiles.id = auth.users.id`
- `artists.profile_id = profiles.id`
- `artist_profiles.artist_id = artists.id`
- role assignment `artist`

## Probar Artist Claim

Este flujo no tiene UI de invitacion todavia. Para prueba DEV puede crearse una invitacion manual en SQL despues de tener:

- una fila `artists` con `profile_id is null`
- una fila `studios`
- opcionalmente una fila `artist_studio_memberships`

Ejemplo conceptual:

```sql
insert into artist_claim_invitations (
  artist_id,
  studio_id,
  membership_id,
  invited_email,
  status
)
values (
  'artist-uuid',
  'studio-uuid',
  'membership-uuid',
  'artist@email.com',
  'pending'
)
returning token;
```

Luego:

1. Ir a `/register`.
2. Elegir artista.
3. Usar el mismo email de `invited_email`.
4. Pegar el token en `Token de invitacion`.
5. Crear cuenta.
6. Validar:

```sql
select id, profile_id from artists where id = 'artist-uuid';
select * from artist_claim_invitations where artist_id = 'artist-uuid';
select * from artist_claim_reviews order by created_at desc limit 5;
select * from audit_events where entity_type = 'artist_claim_invitation' order by occurred_at desc limit 5;
```

Debe ocurrir:

- `artists.profile_id` queda vinculado al nuevo `profiles.id`.
- La invitacion pasa a `accepted`.
- No se crea un nuevo `artists`.
- No se modifica `artist_studio_memberships`.
- Si `audit_events` existe, se registra `artist_claim_accepted`.

## Probar Recuperacion de Contrasena

1. Ir a `/forgot-password`.
2. Capturar email.
3. Enviar enlace.
4. Abrir correo de recuperacion.
5. Confirmar que redirige a:

```text
http://localhost:5173/reset-password
```

6. Capturar nueva contrasena.
7. Iniciar sesion con la nueva contrasena.

Si el enlace no redirige correctamente, revisar `Authentication > URL Configuration`.

## Probar Modo Demo

Con Supabase configurado:

1. Ir a `/login`.
2. Entrar como artista demo.
3. Cerrar sesion.
4. Entrar como cliente demo.
5. Entrar como admin demo.
6. Si habia una sesion real previa, confirmar que el modo demo no vuelve a `/login` automaticamente.

## Comandos de Verificacion Local

Build:

```bash
npm run build
```

Lint:

```bash
npm run lint
```

Nota: lint puede fallar por errores preexistentes documentados en `AUTH_CRITICAL_FIXES_REPORT.md`. No bloquear Cloud DEV por esos errores si el build compila y los errores no pertenecen a Auth Foundation.

## Criterios de Listo para DEV

- Las 12 migraciones corren en Supabase Cloud.
- `.env.local` conecta con Project URL y anon key.
- Login real funciona.
- Registro cliente crea `profiles`, `clients`, `client_profiles` y role `client`.
- Registro artista crea `profiles`, `artists`, `artist_profiles` y role `artist`.
- Recuperacion de contrasena redirige a `/reset-password`.
- Modo demo sigue funcionando.
- No se activo RLS.
- No se migraron mocks.
- No se conectaron modulos operativos a Supabase.
