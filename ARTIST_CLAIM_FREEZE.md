# FASE 10.2 - ARTIST CLAIM FREEZE

## Alcance

Este documento congela el flujo oficial de Artist Claim para Studio Flow.

No se implemento codigo, no se modificaron archivos operativos y no se crearon migraciones.

Fuentes:

- `AUTH_FOUNDATION_AUDIT.md`
- `ARCHITECTURE_FREEZE.md`
- `SQL_MASTER_DESIGN.md`

## Veredicto

**CLAIM CONGELADO**

El flujo oficial queda definido como **claim por invitacion tokenizada + email preautorizado + aprobacion de estudio como fallback**.

La regla central es:

> Artist Claim vincula una cuenta autenticada a un `artists` existente. No crea un artista nuevo, no recrea memberships y no mueve historial operacional.

## Principios Congelados

1. `artists.id` es la identidad profesional estable de una artista.
2. `profiles.id` es la identidad autenticable cuando la artista ya tiene cuenta.
3. `artists.profile_id` puede ser `null` antes del claim.
4. `artist_studio_memberships.id` es la frontera operacional dentro de un estudio.
5. `artist_id` es la frontera operacional independiente.
6. Claim nunca debe duplicar `artists`.
7. Claim nunca debe borrar ni recrear memberships.
8. Claim nunca debe recalcular historiales, reputacion, loyalty, trust o fairness.
9. Claim solo agrega control autenticado sobre entidades que ya pertenecen semanticamente a la artista.
10. No usar hard delete en entidades con citas, economia, loyalty, trust o auditoria.

## Escenarios

### Escenario A: Studio crea artista

Estado oficial:

- El estudio crea una fila en `artists`.
- `artists.profile_id = null`.
- Se crea o conserva `artist_profiles`.
- Si la artista trabaja dentro del estudio, se crea `artist_studio_memberships`.
- Cualquier servicio, agenda, cita o marketplace del contexto estudio debe usar `membership_id` cuando represente a la artista dentro del estudio.

Regla:

- La artista existe profesionalmente aunque no tenga usuario auth.
- El estudio puede operar esa artista dentro del scope del estudio.
- El estudio no posee la identidad global de la artista; solo administra su relacion scoped mediante membership.

### Escenario B: La artista se registra despues

Debe ocurrir:

1. Supabase Auth crea `auth.users`.
2. Studio Flow crea `profiles.id = auth.users.id`.
3. El flujo busca claims pendientes para el email normalizado de la artista.
4. Si hay claim valido, se vincula `artists.profile_id = profiles.id`.
5. No se crea un nuevo `artists`.
6. No se duplican `artist_profiles`.
7. Se crea o valida role assignment `artist` para el profile.
8. La sesion activa queda en contexto `artist`.

Si no hay claim valido:

- El registro artista crea un `artists` independiente nuevo.
- No se crean memberships de estudio.
- Onboarding continua como artista independiente.

### Escenario C: La artista ya pertenece a uno o varios estudios

Debe conservar:

- Todos los `artist_studio_memberships`.
- El mismo `artist_id`.
- El estado de cada membership.
- Servicios owner `membership`.
- Agendas owner `membership`.
- Citas con `membership_id`.
- Promociones scope `membership`.
- Customer notes/relationships scope `membership`.
- Marketplace profiles/listings tipo `membership`.
- Auditoria existente.

Regla multi-studio:

- Cada estudio mantiene su membership independiente.
- Claim no fusiona estudios.
- Claim no cambia permisos de studio owner/manager.
- La artista reclamada puede operar sus memberships activas, pero no obtiene permisos de owner/manager del estudio.
- Una artista con varios estudios debe seleccionar contexto operativo por `membership_id`.

### Escenario D: La artista desea operar independiente ademas de pertenecer a estudios

Debe crearse solo si no existe:

- Agenda independiente con owner `artist`.
- Servicios independientes con owner `artist`.
- Marketplace profile tipo `artist`, si decide publicarse independiente.

No debe crearse:

- Nueva fila `artists`.
- Nueva membership para representar independencia.
- Duplicado de servicios membership como servicios independientes.
- Duplicado de marketplace membership como marketplace artist.

Regla:

- Operacion independiente usa `artist_id`.
- Operacion dentro de estudio usa `membership_id`.
- Ambas pueden coexistir sin mezclar agenda, servicios, comisiones, promociones ni marketplace.

### Escenario E: La artista ya tiene historial

Debe conservarse sin cambios:

- Citas existentes.
- Servicios existentes.
- Memberships existentes.
- Marketplace visibility.
- Loyalty ledger relacionado a clientes/citas.
- Reputacion derivada de historial.
- Flags de fairness/trust.
- No-show cases.
- Sanciones.
- Audit events.
- Appointment economies y commissions.

Regla:

- El claim no es una migracion historica.
- El claim es una asignacion de identidad autenticable sobre el `artist_id` existente.
- Cualquier reputacion o ranking futuro debe seguir derivando de datos existentes por `artist_id`, `membership_id` o listing, no del momento de claim.

## Metodo Oficial de Claim

### Metodo primario: token de invitacion

El estudio genera una invitacion para una artista existente.

La invitacion debe estar asociada a:

- `artist_id`
- `studio_id`
- `membership_id`, si aplica
- email normalizado de invitacion
- estado pendiente/aceptada/expirada/revocada
- expiracion
- profile que invito

La artista abre el link, se registra o inicia sesion y acepta el claim.

### Validacion secundaria: email preautorizado

El email usado en Auth debe coincidir con el email preautorizado de la invitacion o del registro profesional de la artista.

Regla:

- Coincidencia por email normalizado no basta para claim automatico si existe mas de una candidata.
- Email preautorizado permite claim automatico solo cuando hay exactamente una invitacion activa no expirada para ese email.

### Fallback: aprobacion de estudio

Si no hay token valido o hay ambiguedad:

- La artista puede solicitar claim.
- El studio owner o studio manager autorizado aprueba o rechaza.
- Platform owner puede resolver disputas o casos de datos conflictivos.

### Decision congelada

Se usara **combinacion**:

1. Token de invitacion como metodo principal.
2. Email preautorizado como validacion obligatoria.
3. Aprobacion de estudio/admin como fallback para ambiguedades, expiraciones o reclamos manuales.

## Flujo Oficial de Claim

1. Studio crea o identifica `artists` existente.
2. Studio crea o confirma `artist_studio_memberships` si la artista pertenece al estudio.
3. Studio envia invitacion de claim a email normalizado.
4. Artista abre invitacion.
5. Si no tiene cuenta, se registra.
6. Se crea `profiles.id = auth.users.id`.
7. Se valida token, email y estado de invitacion.
8. Se verifica que `artists.profile_id` sigue `null`.
9. Se asigna `artists.profile_id = profiles.id`.
10. Se crea o valida role assignment `artist`.
11. Se marca invitacion como aceptada.
12. Se registra audit event de claim.
13. La artista entra a contexto activo:
    - `artist_id` para independiente;
    - `membership_id` para estudio.

## Reglas Anti-Duplicados

### Antes de crear `artists`

Buscar coincidencias por:

- email normalizado en invitaciones pendientes;
- email normalizado en datos profesionales disponibles;
- telefono normalizado, si existe;
- nombre + estudio + membership activa;
- `artists.profile_id`, si el usuario ya tiene cuenta.

### Antes de reclamar

Bloquear claim automatico si:

- hay mas de un `artists` candidato para el mismo email;
- `artists.profile_id` ya tiene otro profile;
- la invitacion esta expirada;
- la invitacion fue revocada;
- el studio/membership esta archivado o suspendido sin override administrativo;
- existe sancion activa que bloquee claim.

### Antes de registro independiente

Si existe invitacion activa para ese email, el registro artista debe ofrecer claim primero.

Regla:

- El sistema no debe crear artista independiente si hay una invitacion clara pendiente para esa misma persona sin confirmar decision de la usuaria.

## Reglas de Merge

### Merge automatico

No permitido para `artists`.

### Merge permitido con revision

Solo platform owner o flujo administrativo futuro puede fusionar dos artistas, y debe:

- elegir `artist_id` canonico;
- preservar memberships;
- reubicar referencias con auditoria;
- no perder citas, economia, trust, fairness, marketplace ni notas;
- dejar registro de merge.

### Claim no es merge

Claim solo actualiza `artists.profile_id` cuando el artista existente no tiene profile.

Si la artista ya creo un `artists` independiente y luego reclama una artista de estudio, existen dos opciones:

1. Mantener ambos temporalmente y requerir revision administrativa.
2. Convertir el claim en solicitud de merge revisada.

Decision congelada:

- No merge automatico.
- Casos con dos `artist_id` requieren revision administrativa antes de unificar.

## Reglas de Ownership

### Identidad

- `profiles` pertenece al usuario autenticado.
- `artists.profile_id` vincula identidad auth con identidad profesional.

### Profesional independiente

- Owner operacional: `artist_id`.
- Servicios independientes: `owner_type = artist`.
- Agenda independiente: `owner_type = artist`.
- Marketplace independiente: `profile_type = artist`.

### Dentro de estudio

- Owner operacional: `membership_id`.
- Servicios en estudio: `owner_type = membership`.
- Agenda en estudio: `owner_type = membership`.
- Marketplace dentro de estudio: `profile_type = membership`.

### Estudio

- Studio owner/manager opera por `studio_id` y memberships del estudio.
- Claim no reduce derechos operativos del estudio sobre la membership.
- Claim no convierte a la artista en studio owner o manager.

## Reglas Multi-Studio

1. Una artista puede tener multiples memberships activas.
2. Cada membership tiene estado y reglas propias.
3. Claim vincula todas las memberships del mismo `artist_id`.
4. La artista debe elegir contexto antes de operar en un estudio especifico.
5. Acceso operacional dentro de estudio siempre se resuelve por `membership_id`.
6. Datos de un estudio no se arrastran a otro estudio.
7. Servicios, agendas, promociones y notas scoped por membership no se copian entre estudios.
8. Marketplace tipo membership se mantiene separado por membership.

## Reglas para Artista Independiente

1. Claim no crea automaticamente oferta independiente.
2. La artista reclamada puede activar modo independiente mediante onboarding artist.
3. Al activar independencia, se pueden crear recursos owner `artist`.
4. La independencia no modifica memberships existentes.
5. La artista puede estar activa como independiente y como miembro de estudios al mismo tiempo.

## Reglas para Marketplace

Marketplace debe respetar tres identidades publicables:

- `profile_type = artist`: artista independiente.
- `profile_type = membership`: artista dentro de estudio.
- `profile_type = studio`: estudio.

Claim conserva:

- marketplace profiles existentes;
- marketplace listings existentes;
- visibility status;
- historial asociado a listings;
- ranking inputs existentes.

Claim no debe:

- publicar automaticamente a la artista independiente;
- ocultar automaticamente listings membership;
- fusionar listing membership con listing artist;
- recalcular ranking por el hecho de reclamar cuenta.

Despues del claim:

- La artista puede editar datos permitidos de su artist profile.
- La artista puede operar marketplace independiente si crea/publica profile tipo artist.
- La edicion de marketplace membership debe respetar reglas del estudio y membership.

## Reglas para Fairness

Fairness en esta fase no debe usar claim como senal negativa ni positiva.

Se conserva:

- flags existentes por `artist_id`;
- flags existentes por `membership_id` o listing;
- audit events;
- datos historicos que alimenten revisiones futuras.

Reglas:

- Claim no limpia flags.
- Claim no crea score.
- Claim no recalcula fairness.
- Claim puede generar audit event de identidad, no fairness event punitivo.
- Si claim resuelve un problema de data quality, se registra correccion auditable, no borrado silencioso.

## Reglas para Trust

Trust score numerico queda fuera del MVP segun freeze.

Se conserva:

- sanciones activas;
- no-show cases;
- governance/trust flags;
- audit events;
- evidencia vinculada a citas o perfiles.

Reglas:

- Claim no borra sanciones.
- Claim no resetea reputacion.
- Claim no oculta no-show cases.
- Claim no desbloquea marketplace si hay sancion activa que lo impida.
- Claim puede mejorar trazabilidad de responsabilidad desde el momento de vinculacion auth, pero no reescribe responsabilidad historica.

## Reglas para Loyalty y Reputacion

Loyalty MVP es global de cliente y se conserva por `client_id`/ledger.

Claim de artista no debe:

- modificar loyalty accounts;
- modificar flow point ledger;
- recalcular rewards;
- transferir puntos.

Reputacion artistica debe seguir derivando de:

- appointments por `artist_id`;
- appointments por `membership_id`;
- no-show/trust/fairness flags;
- marketplace/listing history cuando aplique.

Claim solo permite atribuir operaciones futuras a `profile_id`.

## Estados Permitidos

### Artist sin claim

```js
{
  artistId,
  profileId: null,
  memberships: ["active" | "pending" | "suspended" | "archived"]
}
```

### Artist con claim

```js
{
  artistId,
  profileId,
  authUserId: profileId,
  memberships,
  activeContexts: ["artist", "membership"]
}
```

### Claim pendiente

```js
{
  artistId,
  studioId,
  membershipId,
  invitedEmail,
  status: "pending",
  expiresAt
}
```

## Casos Bloqueados

No ejecutar claim automatico si:

- email coincide con multiples artistas candidatas;
- token no existe;
- token expiro;
- token fue revocado;
- `artists.profile_id` ya no es null;
- profile autenticado ya esta vinculado a otro `artists`;
- existe disputa abierta sobre identidad;
- hay sancion/trust lock que impida takeover;
- el estudio que invita no tiene autoridad sobre la membership.

Resultado:

- crear solicitud de revision;
- no crear artista duplicada;
- no modificar memberships.

## Auditoria Requerida

Todo claim aceptado debe dejar audit trail con:

- actor profile id;
- artist id;
- studio id, si aplica;
- membership id, si aplica;
- metodo de claim;
- email normalizado usado;
- timestamp;
- resultado;
- razon si fue rechazado;
- estado previo de `artists.profile_id`.

## Decision Final

**CLAIM CONGELADO**

Artist Claim queda congelado como flujo de vinculacion controlada:

- token de invitacion como metodo principal;
- email preautorizado como validacion obligatoria;
- aprobacion de estudio/admin como fallback;
- `artists.profile_id` se asigna sin crear un nuevo `artists`;
- memberships, citas, servicios, marketplace, loyalty, fairness, trust y reputacion se conservan;
- independencia se habilita por recursos owner `artist`, separados de recursos owner `membership`.

Este freeze desbloquea la implementacion de Auth Foundation sin redisenar el modelo central.
