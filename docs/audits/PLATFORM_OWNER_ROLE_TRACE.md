# FASE 16.2E - PLATFORM OWNER ROLE TRACE

## Objetivo

Auditar la consistencia entre:

- `session.role`
- `session.user.role`

para una sesion real `platform_owner`.

Este documento no implementa codigo, no crea SQL y no modifica UI. Solo auditoria.

## Resumen ejecutivo

Para una sesion real hidratada por Supabase, `session.role` y `session.user.role` deberian ser iguales.

La funcion `createSessionFromAuthContext()` calcula una sola variable local:

```js
const role = getActiveRole(authContext)
```

y luego la asigna en ambos lugares:

```js
user: {
  ...
  role,
},
role,
```

Por tanto, para un `platform_owner` real correctamente hidratado:

| Campo | Valor esperado |
|---|---|
| `session.role` | `platform_owner` |
| `session.user.role` | `platform_owner` |

Conclusion: en el builder real no hay divergencia. Si divergen en runtime, la causa probable es una sesion persistida/stale, una sesion mock/legacy, o una mutacion posterior parcial de `session`.

## 1. `hydrateSupabaseSession()`

Archivo:

`src/contexts/AppContext.jsx`

Lineas relevantes:

| Linea | Efecto |
|---|---|
| `585` | Define `hydrateSupabaseSession(authSession)`. |
| `597` | Obtiene `authContext` desde `fetchAuthContext()` y repair si aplica. |
| `598` | Construye `nextSession = createSessionFromAuthContext(authSession, authContext)`. |
| `628` | Limpia `localStorage.removeItem(storageKey)`. |
| `629` | Ejecuta `setSession(nextSession)`. |

Codigo clave:

```js
const authContext = await repairIncompleteAuthContext(authSession, await fetchAuthContext())
const nextSession = createSessionFromAuthContext(authSession, authContext)

localStorage.removeItem(storageKey)
setSession(nextSession)
```

Diagnostico:

- Una sesion real no reutiliza el objeto viejo de `localStorage` al hidratarse.
- La sesion real queda definida por `createSessionFromAuthContext()`.

## 2. Session builder

Archivo:

`src/contexts/AppContext.jsx`

Funcion:

`createSessionFromAuthContext(authSession, authContext)`

Lineas relevantes:

| Linea | Efecto |
|---|---|
| `104` | Define el builder. |
| `109` | Calcula `const role = getActiveRole(authContext)`. |
| `119-130` | Construye `session.user`. |
| `125` | Asigna `session.user.role = role`. |
| `131` | Asigna `session.role = role`. |
| `138-144` | Asigna `activeSessionContext.role = role`. |

Codigo clave:

```js
const role = getActiveRole(authContext)

return {
  user: {
    id: profile.id,
    profileId: profile.id,
    name: profile.display_name || authSession.user.email,
    email: profile.email || authSession.user.email,
    phone: profile.phone || '',
    role,
    studioId,
    artistId,
    clientId,
    membershipId: activeMembership?.id || null,
  },
  role,
  authUser: authSession.user,
  profile,
  roles,
  artist: authContext.artist || null,
  client: authContext.client || null,
  memberships,
  activeSessionContext: {
    role,
    studioId,
    artistId,
    clientId,
    membershipId: activeMembership?.id || null,
  },
  isMockSession: false,
}
```

Diagnostico:

No hay dos fuentes separadas para `session.role` y `session.user.role`. Ambas salen de la misma variable local.

## 3. Role hydration

### `getActiveRole()`

Archivo:

`src/contexts/AppContext.jsx`

Lineas relevantes:

| Linea | Efecto |
|---|---|
| `96` | Define `getActiveRole(authContext)`. |
| `97` | Normaliza `authContext.profile.default_role`. |
| `98` | Obtiene `authContext.roles`. |
| `99` | Verifica si existe assignment con el default role. |
| `101` | Devuelve default role si tiene assignment, si no el primer assignment o default role. |

Codigo:

```js
function getActiveRole(authContext) {
  const profileRole = normalizeRoleCode(authContext?.profile?.default_role)
  const roles = getRoleAssignments(authContext)
  const hasProfileRole = roles.some((assignment) => assignment.role === profileRole)

  return hasProfileRole ? profileRole : normalizeRoleCode(roles[0]?.role || profileRole)
}
```

Para platform owner:

- Si `profiles.default_role = 'platform_owner'` y `roles` contiene assignment `platform_owner`, devuelve `platform_owner`.
- Si `roles` no contiene assignment pero `default_role = 'platform_owner'`, devuelve `platform_owner` por fallback `profileRole`.

### `studio_flow_get_auth_context()`

Archivo:

`supabase/migrations/202606100012_auth_foundation.sql`

Lineas relevantes:

| Linea | Efecto |
|---|---|
| `123-139` | Construye `roles` desde `user_role_assignments` activos. |
| `175-180` | Devuelve `profile`, `roles`, `client`, `artist`, `memberships`. |

Payload conceptual:

```json
{
  "profile": {
    "id": "uuid",
    "default_role": "platform_owner"
  },
  "roles": [
    {
      "id": "uuid",
      "role": "platform_owner",
      "studioId": null,
      "status": "active"
    }
  ],
  "client": null,
  "artist": null,
  "memberships": []
}
```

## 4. AppContext session object

Para una sesion real `platform_owner`, el objeto esperado es:

```js
{
  user: {
    id: '<profile_id>',
    profileId: '<profile_id>',
    name: '<display_name o email>',
    email: '<email>',
    phone: '<phone o string vacio>',
    role: 'platform_owner',
    studioId: null,
    artistId: null,
    clientId: null,
    membershipId: null,
  },
  role: 'platform_owner',
  authUser: {
    id: '<auth.users.id>',
    email: '<email>',
    // resto del payload Supabase Auth
  },
  profile: {
    id: '<profile_id>',
    default_role: 'platform_owner',
    status: 'active',
    // resto de columnas de profiles
  },
  roles: [
    {
      id: '<assignment_id>',
      role: 'platform_owner',
      studioId: null,
      status: 'active',
    },
  ],
  artist: null,
  client: null,
  memberships: [],
  activeSessionContext: {
    role: 'platform_owner',
    studioId: null,
    artistId: null,
    clientId: null,
    membershipId: null,
  },
  isMockSession: false,
}
```

Valores exactos esperados:

| Campo | Valor |
|---|---|
| `session.role` | `platform_owner` |
| `session.user.role` | `platform_owner` |
| `session.activeSessionContext.role` | `platform_owner` |

## 5. AdminArtists.jsx

Archivo:

`src/pages/admin/AdminArtists.jsx`

Lineas relevantes:

| Linea | Efecto |
|---|---|
| `37` | Calcula `normalizedRole` desde `session.user?.role`. |
| `38` | Calcula `isPlatformOwner`. |
| `62-63` | Si `isPlatformOwner`, usa `adminState.artists` completo. |
| `64-68` | Si no, filtra por studios. |

Codigo:

```js
const normalizedRole = session.user?.role === 'admin' ? ROLES.PLATFORM_OWNER : session.user?.role
const isPlatformOwner = normalizedRole === ROLES.PLATFORM_OWNER
```

Para una sesion real esperada:

```js
session.user.role === 'platform_owner'
normalizedRole === 'platform_owner'
isPlatformOwner === true
```

Diagnostico:

Si la sesion real esta bien construida, `AdminArtists.jsx` debe detectar platform owner correctamente aunque use `session.user.role`.

## ¿Son iguales?

Si la sesion fue creada por `hydrateSupabaseSession()` y `createSessionFromAuthContext()`, si:

| Campo | Valor esperado |
|---|---|
| `session.role` | `platform_owner` |
| `session.user.role` | `platform_owner` |

## ¿Dónde divergen?

En el flujo real auditado, no divergen.

Pueden divergir solo por estados no canónicos:

| Caso | Posible divergencia |
|---|---|
| Sesion vieja en `localStorage` | `getStoredSession()` conserva objetos previos si existen. |
| Sesion mock/legacy | `loginDemo(role)` asigna `session.role = role` y `session.user = mockUsers[role]`; si `role = 'admin'`, puede diferir de `mockUsers.admin.role = platform_owner`. |
| Mutacion parcial posterior | Alguna llamada a `setSession` podria actualizar `session.role` sin actualizar `session.user.role`, o viceversa. |
| AuthContext incompleto | Si `default_role` y assignments no coinciden, el rol elegido puede no ser el que se espera, pero se asigna igual a ambos campos. |

### Mutaciones posteriores encontradas

En `saveArtistProfile`, hay una mutacion parcial de session:

`src/contexts/AppContext.jsx:1525-1543`

Solo actualiza `profile.phone`, `artist.display_name` y `user.phone`. No toca `role`.

No se detecto una mutacion posterior que cambie `session.role` sin cambiar `session.user.role`.

## Implicacion para Dennis

La sospecha de divergencia `session.role` vs `session.user.role` no se confirma para sesiones reales construidas por el builder actual.

Si Dennis no aparece y la sesion es real `platform_owner`, la siguiente prioridad de auditoria debe ser:

1. Confirmar que `studio_flow_get_auth_context()` devuelve `profile.default_role = 'platform_owner'`.
2. Confirmar que `createSessionFromAuthContext()` produce `session.role = 'platform_owner'`.
3. Confirmar que `session.user.role = 'platform_owner'` en runtime.
4. Confirmar que `studio_flow_admin_get_artists()` en Supabase runtime tiene `v_is_platform_owner = true`.
5. Confirmar que la RPC desplegada coincide con `202606110006_admin_artists_wave_a.sql`.

Si `session.role` y `session.user.role` son ambos `platform_owner`, entonces Dennis no se esta perdiendo en `AdminArtists.jsx` por este motivo.

## Veredicto

Para una sesion real `platform_owner`, el codigo actual espera:

```js
session.role === 'platform_owner'
session.user.role === 'platform_owner'
```

Ambos valores salen de la misma variable `role` en `createSessionFromAuthContext()`.

No hay divergencia en el builder real. Si hay divergencia en runtime, seria por sesion legacy/mock o por una mutacion parcial externa, no por `hydrateSupabaseSession()` ni por el session builder actual.
