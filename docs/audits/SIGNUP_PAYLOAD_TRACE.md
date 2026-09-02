# FASE 13.4 - SIGNUP PAYLOAD TRACE

## Archivos revisados

- `src/services/authService.js`
- `src/contexts/AppContext.jsx`
- `src/pages/auth/Register.jsx`

## Punto exacto de envio

El registro termina en `signUpWithPassword()` dentro de `src/services/authService.js`.

Payload actual enviado a:

```js
client.auth.signUp(payload)
```

Forma exacta:

```js
{
  email: String(email || '').trim().toLowerCase(),
  password,
  options: {
    data: {
      display_name: displayName,
      phone,
      default_role: defaultRole,
      ...metadata,
    },
  },
}
```

## Logs temporales agregados

Antes de `signUp()`:

```js
console.log('SIGNUP PAYLOAD', payload)
```

Despues de `signUp()`:

```js
console.log('SIGNUP RESPONSE', { data, error })
```

Estos logs quedaron agregados en `src/services/authService.js`.

## registerClient()

Origen: `src/contexts/AppContext.jsx`

Campos recibidos desde `Register.jsx`:

- `displayName`: requerido en el formulario.
- `email`: requerido en el formulario.
- `phone`: opcional.
- `password`: requerido en el formulario, `minLength={6}`.

Payload resultante:

```js
{
  email: "<email normalizado>",
  password: "<password enviado por formulario>",
  options: {
    data: {
      display_name: "<displayName>",
      phone: "<phone o string vacio>",
      default_role: "client"
    }
  }
}
```

Metadata enviada:

```js
{}
```

`emailRedirectTo` enviado:

```js
undefined
```

No se envia `emailRedirectTo` ni `options.emailRedirectTo`.

## registerArtist()

Origen: `src/contexts/AppContext.jsx`

Campos recibidos desde `Register.jsx`:

- `artisticName`: requerido en el formulario.
- `displayName`: opcional, pero `Register.jsx` usa fallback a `artisticName`.
- `email`: requerido en el formulario.
- `phone`: opcional.
- `password`: requerido en el formulario, `minLength={6}`.
- `city`: opcional.
- `claimToken`: opcional.

Payload resultante:

```js
{
  email: "<email normalizado>",
  password: "<password enviado por formulario>",
  options: {
    data: {
      display_name: "<displayName o artisticName>",
      phone: "<phone o string vacio>",
      default_role: "artist",
      artistic_name: "<artisticName>",
      city: "<city o string vacio>",
      claim_token: "<claimToken>" || null
    }
  }
}
```

Metadata enviada:

```js
{
  artistic_name: artisticName,
  city,
  claim_token: claimToken || null,
}
```

`emailRedirectTo` enviado:

```js
undefined
```

No se envia `emailRedirectTo` ni `options.emailRedirectTo`.

## Validacion de campos requeridos

### Supabase Auth

Campos requeridos por `signUp()` con email/password:

- `email`: se envia normalizado con `trim().toLowerCase()`.
- `password`: se envia tal como viene del formulario.

### Frontend

Cliente:

- `displayName`: requerido.
- `email`: requerido.
- `password`: requerido con minimo 6 caracteres.
- `confirmPassword`: requerido con minimo 6 caracteres.
- `phone`: opcional.

Artista:

- `artisticName`: requerido.
- `email`: requerido.
- `password`: requerido con minimo 6 caracteres.
- `confirmPassword`: requerido con minimo 6 caracteres.
- `displayName`, `phone`, `address`, `city`, `claimToken`: opcionales.

## Formato del payload

El formato usado es compatible con Supabase:

```js
{
  email,
  password,
  options: {
    data: {}
  }
}
```

`options.data` es el lugar correcto para metadata de usuario en `signUp()`.

## Posibles valores null o vacios

Cliente:

- `phone` puede llegar como `''`.

Artista:

- `phone` puede llegar como `''`.
- `city` puede llegar como `''`.
- `claim_token` llega como `null` si no se captura token.

Estos valores son JSON validos dentro de `options.data`. No son campos reservados de Supabase porque viven en `user_metadata`.

## Posibles campos no soportados por Supabase

No se detectan campos no soportados en el nivel raiz del payload.

Campos enviados en raiz:

- `email`
- `password`
- `options`

Campos enviados dentro de metadata:

- `display_name`
- `phone`
- `default_role`
- `artistic_name`
- `city`
- `claim_token`

Al estar dentro de `options.data`, Supabase los trata como metadata arbitraria. No deberian causar 400 por nombre de campo.

## Observaciones importantes

1. `emailRedirectTo` no se esta enviando.
2. La metadata no se envia como una propiedad separada llamada `metadata`; se fusiona dentro de `options.data`.
3. Si Supabase devuelve `400 Bad Request`, el motivo exacto debe aparecer ahora en:

```js
console.log('SIGNUP RESPONSE', { data, error })
```

4. Si `signUp()` falla con error, `registerClient()` y `registerArtist()` entran al `catch`, por eso nunca se alcanza:

```js
return { needsEmailConfirmation: true }
```

Y por eso no aparece:

```txt
Revisa tu correo para confirmar la cuenta antes de entrar.
```

## Veredicto final

**Otro.**

Con el codigo actual, el payload de `signUp()` tiene formato valido y no muestra metadata invalida ni redirect invalido. El redirect no puede ser la causa directa porque no se envia.

La causa mas probable del `400 Bad Request` esta en la respuesta exacta de Supabase, por ejemplo:

- email invalido tras normalizacion.
- password rechazado por politica del proyecto.
- usuario ya existente.
- signup por email deshabilitado en Auth providers.
- restriccion/configuracion del proyecto Supabase.

El siguiente paso es reproducir el registro y leer el objeto `error` completo impreso por `SIGNUP RESPONSE`.
