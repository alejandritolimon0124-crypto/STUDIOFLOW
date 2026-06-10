# FASE 14.3 - CLIENT REPAIR TRACE

## Archivos auditados

- `src/contexts/AppContext.jsx`
- `src/services/profileBootstrapService.js`
- `supabase/migrations/202606100012_auth_foundation.sql`

## Logs temporales agregados

Archivo:

```txt
src/contexts/AppContext.jsx
```

Funciones:

```js
hydrateSupabaseSession()
repairIncompleteAuthContext()
```

Logs agregados:

```js
console.log('CLIENT REPAIR START', ...)
console.log('CLIENT REPAIR PROFILE', ...)
console.log('CLIENT REPAIR MISSING CLIENT', ...)
console.log('CLIENT REPAIR BOOTSTRAP CALLED', ...)
console.log('CLIENT REPAIR SUCCESS', ...)
console.error('CLIENT REPAIR ERROR', ...)
```

## 1. Si `repairIncompleteAuthContext()` realmente se ejecuta despues de login

Si, por codigo debe ejecutarse despues de login real.

Ruta:

```js
loginWithPassword()
  -> hydrateSupabaseSession(data.session)
  -> repairIncompleteAuthContext(authSession, await fetchAuthContext())
```

Archivo:

```txt
src/contexts/AppContext.jsx
```

Lineas aproximadas:

- `loginWithPassword()`: 577
- `hydrateSupabaseSession()`: 519
- llamada a `repairIncompleteAuthContext()`: 531

Log esperado:

```txt
CLIENT REPAIR START { source: 'hydrateSupabaseSession', ... }
CLIENT REPAIR START { hasAuthUser: true, hasProfile: true, ... }
```

Si estos logs no aparecen despues de login, entonces el login no esta pasando por `hydrateSupabaseSession()` o la app esta usando una sesion local/mock anterior.

## 2. Si detecta correctamente `profile.default_role = 'client'`

La deteccion ocurre aqui:

```js
function getBootstrapRole(authSession, authContext = {}) {
  const metadata = getAuthMetadata(authSession)

  return normalizeRoleCode(authContext.profile?.default_role || metadata.default_role)
}
```

Archivo:

```txt
src/contexts/AppContext.jsx
```

Linea aproximada:

```txt
136
```

Diagnostico:

Si `authContext.profile.default_role` llega como:

```txt
client
```

entonces `role === ROLES.CLIENT` debe ser verdadero.

Log agregado para confirmarlo:

```txt
CLIENT REPAIR PROFILE
```

Debe mostrar:

```js
{
  default_role: 'client',
  metadata_default_role: 'client'
}
```

## 3. Si detecta correctamente ausencia de `authContext.client`

La condicion es:

```js
if (role === ROLES.CLIENT && (!authContext.client || !hasRoleAssignment(authContext, ROLES.CLIENT))) {
```

Archivo:

```txt
src/contexts/AppContext.jsx
```

Linea aproximada:

```txt
152
```

Diagnostico:

La condicion no solo repara cuando falta `authContext.client`; tambien repara si falta el role assignment `client`.

Log agregado:

```txt
CLIENT REPAIR MISSING CLIENT
```

Debe mostrar:

```js
{
  missingClient: true,
  missingClientRole: true
}
```

o al menos uno de los dos en `true`.

## 4. Si llama realmente `bootstrapClientProfile()`

La llamada esta dentro de la rama anterior:

```js
const repairedAuthContext = await bootstrapClientProfile({ displayName, phone })
```

Archivo:

```txt
src/contexts/AppContext.jsx
```

Linea aproximada:

```txt
170
```

Log agregado antes de la llamada:

```txt
CLIENT REPAIR BOOTSTRAP CALLED
```

Si este log no aparece, la reparacion no entro en la rama cliente. Las causas posibles son:

- `role` no resolvio como `client`.
- `authContext.client` ya existe.
- `hasRoleAssignment(authContext, ROLES.CLIENT)` ya es `true`.
- `repairIncompleteAuthContext()` no se ejecuto.

## 5. Si `bootstrapClientProfile()` recibe `display_name`, `phone`, `default_role`

### Lo que recibe realmente

Archivo:

```txt
src/services/profileBootstrapService.js
```

Funcion:

```js
bootstrapClientProfile({ displayName, phone })
```

Linea aproximada:

```txt
24
```

Payload real hacia la RPC:

```js
{
  p_display_name: displayName,
  p_phone: phone || null,
}
```

### `default_role`

`bootstrapClientProfile()` no recibe ni envia `default_role` como parametro.

Esto no deberia romper la RPC porque `studio_flow_bootstrap_client()` hardcodea el role internamente:

```sql
v_profile := studio_flow_bootstrap_profile(p_display_name, p_phone, 'client');
```

Archivo:

```txt
supabase/migrations/202606100012_auth_foundation.sql
```

Linea aproximada:

```txt
284
```

Conclusion:

- `display_name`: si se envia.
- `phone`: si se envia.
- `default_role`: no se envia desde JS, pero la RPC lo fija como `'client'`.

Log agregado:

```txt
CLIENT REPAIR BOOTSTRAP CALLED
```

Muestra:

```js
{
  display_name,
  phone,
  default_role: role
}
```

Ese `default_role` es diagnostico del frontend, no parametro enviado a Supabase.

## 6. Exito o error de bootstrap

Si la RPC termina bien, debe aparecer:

```txt
CLIENT REPAIR SUCCESS
```

con:

```js
{
  hasProfile: true,
  hasClient: true,
  roles: [...]
}
```

Si la RPC falla, debe aparecer:

```txt
CLIENT REPAIR ERROR
```

con:

```js
{
  message,
  code,
  details,
  hint
}
```

Ese error antes podia quedar oculto visualmente por catches genericos en la UI.

## Por que un usuario autenticado `default_role='client'` no termina generando filas

Por codigo, un usuario autenticado con:

```txt
profile.default_role = 'client'
authContext.client = null
```

debe entrar a la rama de reparacion y llamar:

```js
bootstrapClientProfile()
```

Si despues de login siguen faltando:

- `clients`
- `client_profiles`
- `user_role_assignments`

entonces exactamente uno de estos puntos esta ocurriendo en runtime:

### Caso A: `repairIncompleteAuthContext()` no esta corriendo

Senal:

```txt
No aparece CLIENT REPAIR START despues de login.
```

Causa probable:

- No se ejecuto `loginWithPassword()`.
- La app quedo en una sesion mock/local.
- El login no llego a `hydrateSupabaseSession()`.

### Caso B: el role no resuelve como `client`

Senal:

```txt
CLIENT REPAIR START muestra role distinto de client.
CLIENT REPAIR PROFILE no muestra default_role: 'client'.
```

Causa probable:

- `profiles.default_role` no es `client`.
- La metadata de Auth no trae `default_role`.
- `fetchAuthContext()` devuelve un `profile` inesperado.

### Caso C: la rama de reparacion no considera que falte nada

Senal:

```txt
Aparece CLIENT REPAIR START / PROFILE,
pero no aparece CLIENT REPAIR MISSING CLIENT.
```

Causa probable:

- `authContext.client` no es `null` en la respuesta RPC.
- `roles` ya contiene assignment `client`.

Este caso no coincide con el diagnostico de base de datos si realmente no existen rows en `clients`.

### Caso D: la RPC se llama pero falla

Senal:

```txt
Aparece CLIENT REPAIR BOOTSTRAP CALLED
Aparece CLIENT REPAIR ERROR
```

Causa probable:

- Error interno de `studio_flow_bootstrap_client()`.
- Error de permisos/RLS inesperado.
- Tabla o funcion faltante en Cloud.
- `auth.uid()` no disponible durante la llamada.

Nota: en Fase 14.2 se verifico que la RPC existe en Supabase Cloud. Sin sesion devuelve:

```txt
Auth session required
```

Eso confirma existencia, pero no confirma exito con una sesion real.

### Caso E: la RPC se llama y tiene exito, pero las filas no aparecen

Senal:

```txt
Aparece CLIENT REPAIR SUCCESS { hasClient: true }
```

Si aun asi no aparecen filas en Supabase, el problema ya no estaria en frontend sino en:

- inspeccionando otro proyecto/schema.
- retraso/cache de dashboard.
- consulta manual filtrando mal.

## Diagnostico estatico final

El flujo de reparacion existe y esta conectado al login:

```txt
loginWithPassword -> hydrateSupabaseSession -> repairIncompleteAuthContext -> bootstrapClientProfile
```

La razon original por la que `profiles` queda sin `clients/client_profiles` durante signup sigue siendo:

```txt
registerClient() sale temprano cuando signUp() devuelve data.session = null.
```

Pero si el usuario ya inicio sesion despues, el codigo actual deberia repararlo. Si no lo repara, los logs temporales agregados identificaran el punto exacto:

- no entra a hydration.
- role no es `client`.
- no detecta missing client.
- RPC no se llama.
- RPC falla.
- RPC dice exito pero se inspecciona otro lugar.

## Correccion propuesta

No aplicada en esta fase.

Propuesta:

1. Mantener la reparacion en `hydrateSupabaseSession()`.
2. Despues de reproducir login, leer los logs `CLIENT REPAIR ...`.
3. Si aparece `CLIENT REPAIR ERROR`, corregir segun `message/code/details`.
4. Si no aparece `CLIENT REPAIR BOOTSTRAP CALLED`, corregir la deteccion de role/contexto.
5. Si aparece `CLIENT REPAIR SUCCESS`, verificar proyecto Supabase, schema y filtros usados para revisar tablas.
