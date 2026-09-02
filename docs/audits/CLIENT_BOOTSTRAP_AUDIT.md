# FASE 14.2 - CLIENT BOOTSTRAP FAILURE AUDIT

## Causa raiz exacta

`profiles` se crea porque existe un trigger sobre `auth.users`.

`clients` y `client_profiles` no se crean porque dependen de una llamada posterior a:

```js
studio_flow_bootstrap_client
```

Esa llamada esta dentro de `registerClient()`, pero solo se ejecuta si Supabase devuelve una sesion inmediata en `signUp()`.

Cuando `signUp()` devuelve:

```js
data.session === null
```

`registerClient()` retorna antes:

```js
return { needsEmailConfirmation: true }
```

y nunca llama:

```js
bootstrapClientProfile({ displayName, phone })
```

Por eso queda este estado:

- `auth.users`: creado por Supabase Auth.
- `profiles`: creado por trigger `handle_new_auth_user()`.
- `clients`: no creado.
- `client_profiles`: no creado.

## Archivo y funcion

### 1. `registerClient()`

Archivo:

```txt
src/contexts/AppContext.jsx
```

Funcion:

```js
registerClient()
```

Linea aproximada:

```txt
591
```

Ruta critica:

```js
const data = await signUpWithPassword({
  email,
  password,
  displayName,
  phone,
  defaultRole: ROLES.CLIENT,
})

if (!data.session) {
  setIsAuthLoading(false)
  return { needsEmailConfirmation: true }
}

const authContext = await bootstrapClientProfile({ displayName, phone })
```

Diagnostico:

`bootstrapClientProfile()` esta despues del guard clause `if (!data.session)`. Si Supabase requiere confirmacion de email, `data.session` es `null` y la RPC no se ejecuta.

## 2. `bootstrapClientProfile()`

Archivo:

```txt
src/services/profileBootstrapService.js
```

Funcion:

```js
bootstrapClientProfile()
```

Linea aproximada:

```txt
24
```

Codigo auditado:

```js
export async function bootstrapClientProfile({ displayName, phone }) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_bootstrap_client', {
    p_display_name: displayName,
    p_phone: phone || null,
  })

  if (error) throw error

  return unwrapContext(data)
}
```

Diagnostico:

La funcion no ignora errores. Si la RPC falla, hace `throw error`.

El problema principal no esta dentro de este servicio, sino en que `registerClient()` no lo llama cuando `data.session` es `null`.

## 3. RPC `studio_flow_bootstrap_client()`

Archivo:

```txt
supabase/migrations/202606100012_auth_foundation.sql
```

Funcion:

```sql
public.studio_flow_bootstrap_client(p_display_name text, p_phone text)
```

Linea aproximada:

```txt
271
```

La RPC hace:

```sql
v_profile := studio_flow_bootstrap_profile(p_display_name, p_phone, 'client');
```

Luego crea o reutiliza `clients`:

```sql
insert into clients (profile_id, display_name, email, phone)
values (v_profile.id, v_profile.display_name, v_profile.email, v_profile.phone)
```

Linea aproximada:

```txt
303
```

Luego crea `client_profiles`:

```sql
insert into client_profiles (client_id)
values (v_client.id)
on conflict (client_id) do nothing;
```

Linea aproximada:

```txt
320
```

Diagnostico:

La RPC local esta correctamente definida para crear ambas tablas de dominio.

## 4. Verificacion de existencia real en Supabase

Se hizo una llamada controlada al proyecto configurado en `.env.local`, sin imprimir credenciales.

Resultado:

```txt
studio_flow_get_auth_context -> hasData true, error null
studio_flow_bootstrap_client -> error "Auth session required", code "P0001"
```

Interpretacion:

- `studio_flow_get_auth_context` existe.
- `studio_flow_bootstrap_client` existe realmente en Supabase.
- La RPC se ejecuto hasta entrar a su validacion interna.
- No fallo como `function not found`.
- La respuesta `Auth session required` es esperada cuando se invoca sin usuario autenticado.

Veredicto de este punto:

```txt
RPC existe en Supabase Cloud.
```

## 5. Verificacion de si la llamada se ejecuta

En el frontend, la llamada se ejecuta solo en esta rama:

```js
if (data.session) {
  await bootstrapClientProfile({ displayName, phone })
}
```

No se ejecuta en esta rama:

```js
if (!data.session) {
  return { needsEmailConfirmation: true }
}
```

Con email confirmation activa, Supabase Auth puede crear `auth.users` y disparar el trigger de `profiles`, pero devolver `data.session = null`.

Conclusion:

```txt
La llamada a studio_flow_bootstrap_client no se ejecuta durante signup si no hay sesion inmediata.
```

## 6. Errores silenciosos o ignorados

### `Register.jsx`

Archivo:

```txt
src/pages/auth/Register.jsx
```

Funcion:

```js
handleClientSubmit()
```

Linea aproximada:

```txt
74
```

Codigo:

```js
} catch {
  setLocalError('No se pudo crear la cuenta cliente.')
}
```

Diagnostico:

El `catch` no recibe el objeto `error`, no hace `console.error`, y reemplaza el mensaje real por uno generico.

Esto puede ocultar errores reales de:

- `signUpWithPassword()`
- `bootstrapClientProfile()`
- `studio_flow_bootstrap_client()`

### `AppContext.jsx`

Archivo:

```txt
src/contexts/AppContext.jsx
```

Funcion:

```js
registerClient()
```

Linea aproximada:

```txt
616
```

Codigo:

```js
} catch (error) {
  setAuthError(error.message || 'No se pudo crear la cuenta cliente.')
  setIsAuthLoading(false)
  throw error
}
```

Diagnostico:

Aqui no se ignora el error; se guarda en `authError` y se relanza.

El ocultamiento ocurre despues en `Register.jsx`, que descarta el objeto `error`.

## 7. Por que `profiles` si pero `clients/client_profiles` no

### `profiles`

Archivo:

```txt
supabase/migrations/202606100012_auth_foundation.sql
```

Funcion:

```sql
handle_new_auth_user()
```

Linea aproximada:

```txt
617
```

Trigger:

```sql
create trigger on_auth_user_created_studio_flow
after insert on auth.users
for each row
execute function public.handle_new_auth_user();
```

Linea aproximada:

```txt
647
```

Este trigger crea solo:

```sql
insert into profiles (...)
```

No crea:

```txt
clients
client_profiles
```

### `clients/client_profiles`

Se crean solo por:

```sql
studio_flow_bootstrap_client()
```

Pero esa RPC requiere:

```sql
auth.uid() is not null
```

y desde frontend solo se llama despues de signup si existe `data.session`.

## Correccion propuesta

No corregida en esta fase.

Correccion recomendada:

1. Mover la reparacion del bootstrap cliente al primer login/hydration, no depender solo de signup.
2. En `hydrateSupabaseSession()`, cuando `authContext.profile.default_role === 'client'` y no exista `authContext.client`, llamar `bootstrapClientProfile()` con datos de `session.profile` o metadata.
3. Guardar metadata suficiente durante signup para reparar despues de confirmacion:

```js
display_name
phone
default_role
```

4. Hacer que `Register.jsx` no oculte el error real:

```js
} catch (error) {
  console.error('CLIENT REGISTER ERROR', error)
  setLocalError(error.message || 'No se pudo crear la cuenta cliente.')
}
```

5. Opcionalmente, ampliar el trigger `handle_new_auth_user()` para crear tambien `clients/client_profiles` cuando `default_role = 'client'`; esta opcion reduce dependencia del frontend, pero mueve logica de dominio al trigger auth.

## Veredicto final

```txt
Causa raiz: registerClient() no ejecuta bootstrapClientProfile() cuando signUp() devuelve data.session = null.
```

La RPC existe y funciona a nivel de definicion. El trigger de Auth solo crea `profiles`. Los objetos `clients` y `client_profiles` dependen de una segunda fase que no corre en el flujo de signup sin sesion inmediata.
