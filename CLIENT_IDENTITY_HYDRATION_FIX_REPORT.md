# FASE 14.5B - CLIENT IDENTITY HYDRATION BUGFIX

## Causa raiz

La hidratacion de Fase 14.5 existia, pero la UI cliente todavia podia conservar identidad demo por dos rutas:

1. `mapAuthContextToClientProfile()` mezclaba identidad real con `currentProfile`, permitiendo que `client-mf`, `Maria Fernanda`, email y telefono demo siguieran como fallback dentro de una sesion Supabase real.
2. `ClientDashboard.jsx` siempre calculaba:

```js
const clientLookupId = clientState.profile?.id || 'client-mf'
```

y despues mezclaba:

```js
...artistClientProfile
```

Ese perfil viene de `artistState.clients` mock. En sesion real, el dashboard no debe usar `client-mf` como lookup principal ni debe permitir que `artistClientProfile` pise la identidad visual.

## Archivos modificados

### `src/utils/clientProfileMapper.js`

Se cambio el mapper para que, cuando exista identidad Supabase (`profile.id` o `client.id`), `id`, `profileId`, `name`, `email` y `phone` salgan solo de Supabase.

Se preservan campos no migrados como:

- `photoUrl`
- `notes`
- `flowPoints`
- `vipTier`
- `streak`
- `pointsExpirationDate`

pero la identidad ya no cae a valores demo si hay sesion real.

### `src/contexts/AppContext.jsx`

En `hydrateSupabaseSession()` y `registerClient()` se agregaron logs temporales:

```js
console.log('CLIENT HYDRATION INPUT', ...)
console.log('CLIENT HYDRATION MAPPED PROFILE', ...)
```

Tambien se cambio la hidratacion para construir primero el perfil mapeado desde Supabase y luego aplicarlo sobre `clientState.profile`, de modo que identidad real reemplace localStorage/demo.

### `src/pages/client/ClientDashboard.jsx`

Se agrego:

```js
const hasRealClientSession = Boolean(session.client || session.profile)
```

Con sesion real:

- `clientLookupId` usa `session.client.id`, `clientState.profile.id` o `session.profile.id`.
- Ya no cae a `client-mf` como fallback principal.
- `artistClientProfile` no se mezcla sobre `currentClient`.
- `name`, `email` y `phone` priorizan `session.client/session.profile`.
- `profileDraft` se sincroniza con la identidad real para que la pantalla Perfil tampoco muestre datos viejos.

Logs temporales agregados:

```js
console.log('CLIENT DASHBOARD SESSION CLIENT', ...)
console.log('CLIENT DASHBOARD CURRENT CLIENT', ...)
```

### `src/layouts/DashboardLayout.jsx`

Ya estaba correcto desde Fase 14.5:

```js
session.client?.display_name
session.client?.displayName
session.profile?.display_name
session.profile?.displayName
session.user?.name
clientState.profile?.name
```

No requirio cambio adicional.

## Validacion esperada

Al entrar con Mirna, los logs deben mostrar:

```txt
CLIENT HYDRATION INPUT
CLIENT HYDRATION MAPPED PROFILE
CLIENT DASHBOARD SESSION CLIENT
CLIENT DASHBOARD CURRENT CLIENT
```

Y `CLIENT DASHBOARD CURRENT CLIENT` debe contener:

- `name`: nombre real de Mirna desde `session.client.display_name` o `session.profile.display_name`.
- `email`: email real desde `session.client.email` o `session.profile.email`.
- `phone`: telefono real si existe en Supabase.

## No migrado en esta fase

Se mantuvieron como estaban:

- rewards
- streak
- loyalty
- appointments
- history

## Prueba realizada

Comando:

```bash
npm run build
```

Resultado:

```txt
vite build completed successfully
```

Advertencia no bloqueante:

```txt
Some chunks are larger than 500 kB after minification.
```

## Veredicto

La identidad cliente ahora queda gobernada por Supabase cuando existe sesion real. `localStorage['studio-flow-client-state']` puede seguir conservando campos no migrados, pero ya no debe ganar sobre `session.client/session.profile` para nombre, correo, telefono ni id.
