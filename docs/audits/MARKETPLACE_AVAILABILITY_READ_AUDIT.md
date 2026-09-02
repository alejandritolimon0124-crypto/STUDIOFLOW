# FASE 18.2 - MARKETPLACE AVAILABILITY READ AUDIT

## Objetivo

Determinar exactamente donde desaparecen los slots en el flujo:

```text
ClientDashboard
  -> loadMarketplaceAvailability()
  -> availabilityService
  -> studio_flow_marketplace_get_availability()
  -> availability_slots
```

Este documento no implementa codigo, no modifica logica y no crea SQL/RPC. Solo auditoria.

## Veredicto ejecutivo

Los slots no desaparecen en Marketplace Read ni en AppContext despues de llegar. Desaparecen antes: en la consulta de la RPC de availability.

Hay dos condiciones actuales que pueden producir `slots = []` aunque `availability_slots` tenga 284 filas:

1. Fecha enviada desde UI:

```text
bookingDate inicial = 2026-05-18
```

pero la RPC exige:

```sql
slot.starts_at >= now()
and (slot.starts_at at time zone 'America/Mexico_City')::date = p_date
```

Con fecha actual `2026-06-13`, una fecha `2026-05-18` nunca puede cumplir `starts_at >= now()`.

2. Duracion del slot vs duracion del servicio:

```sql
floor(extract(epoch from (slot.ends_at - slot.starts_at)) / 60)::integer >= v_service.duration_minutes
```

Si los slots fueron generados cada 15 minutos y el servicio dura 60, 70 o 90 minutos, la RPC elimina todos los slots.

## 1. Frontend

Archivo:

`src/pages/client/ClientDashboard.jsx`

### Parametros enviados

El estado inicial de fecha es:

```js
const [bookingDate, setBookingDate] = useState('2026-05-18')
```

Cuando hay artista seleccionado:

```js
loadMarketplaceAvailability({
  listingId: selectedArtistProfile.listingId,
  serviceOfferingId: selectedMarketplaceService?.id || null,
  date: bookingDate,
})
```

Por tanto:

| Parametro | Fuente |
|---|---|
| `listingId` | `selectedArtistProfile.listingId` |
| `serviceOfferingId` | `selectedMarketplaceService?.id || null` |
| `date` | `bookingDate` |

### Valores exactos conocidos desde codigo

| Parametro | Valor estatico conocido |
|---|---|
| `date` | `2026-05-18` al cargar la pantalla. |
| `listingId` | Depende del listing real seleccionado en runtime. |
| `serviceOfferingId` | Depende del servicio real seleccionado en runtime. |

Sin inspeccionar la sesion/navegador de Mirna o ejecutar RPC con su JWT, no se puede conocer el UUID exacto runtime de `listingId` y `serviceOfferingId` desde el repo local.

## 2. AppContext

Archivo:

`src/contexts/AppContext.jsx`

`loadMarketplaceAvailability()` recibe:

```js
{
  listingId,
  serviceOfferingId,
  date,
}
```

Construye:

```js
const requestKey = [listingId, serviceOfferingId || '', date].join('|')
```

Llama:

```js
fetchMarketplaceAvailability({
  listingId,
  serviceOfferingId,
  date,
})
```

Si el service devuelve slots, AppContext guarda:

```js
setAvailabilityState({
  slots: payload.slots,
  requestKey,
  loaded: true,
})
```

No hay filtro adicional en AppContext.

Si la RPC devuelve:

```json
{ "slots": [] }
```

entonces AppContext queda:

```text
availabilityState.slots.length = 0
marketplaceAvailabilitySlots.length = 0
```

## 3. Service Layer

Archivo:

`src/services/availabilityService.js`

### RPC llamada

```js
client.rpc('studio_flow_marketplace_get_availability', {
  p_listing_id: listingId,
  p_service_offering_id: serviceOfferingId || null,
  p_date: date,
})
```

### Resultado normalizado

El service normaliza:

```js
slots: asArray(data.slots).map(normalizeSlot)
```

No filtra slots.

Si la RPC devuelve 0 slots, el resultado normalizado tambien tiene:

```text
slots.length = 0
```

## 4. RPC

Archivo:

`supabase/migrations/202606110014_marketplace_availability_read.sql`

### Filtros de listing/profile

La RPC exige:

```sql
marketplace_listings.visibility_status = 'visible'
and (expires_at is null or expires_at > now())
marketplace_profiles.visibility_status = 'visible'
artists.status = 'active'
```

Si esto fallara, la RPC lanzaria error, no devolveria empty state silencioso.

### Filtros de servicio

Si `p_service_offering_id` no es null:

```sql
service_offerings.status = 'active'
and archived_at is null
and service offering pertenece al listing
```

Si esto fallara, la RPC lanzaria error.

### Filtros de slots

La desaparicion silenciosa ocurre aqui:

```sql
from availability_slots slot
where slot.status = 'available'
  and slot.starts_at >= now()
  and (slot.starts_at at time zone 'America/Mexico_City')::date = p_date
  and (
    slot.artist_id = v_artist_id
    or (v_membership_id is not null and slot.membership_id = v_membership_id)
  )
  and (v_studio_id is null or slot.studio_id is null or slot.studio_id = v_studio_id)
  and (
    v_service.id is null
    or floor(extract(epoch from (slot.ends_at - slot.starts_at)) / 60)::integer >= v_service.duration_minutes
  )
```

Estas condiciones devuelven `[]` sin error si no hay filas que cumplan.

## 5. Supabase

Datos validados por contexto:

```text
schedules > 0
schedule_rules > 0
availability_slots = 284
status = available
artist_id correcto
```

Eso prueba que la generacion existe.

Pero para que la RPC devuelva slots, tambien deben cumplirse:

```text
starts_at >= now()
fecha local == p_date
duracion slot >= duracion servicio
studio/membership compatible
```

## 6. Donde desaparecen los slots

### Primer punto de corte: fecha

Frontend envia por default:

```text
p_date = 2026-05-18
```

RPC exige:

```text
slot.starts_at >= now()
```

Con fecha actual `2026-06-13`, no puede existir un slot de `2026-05-18` que tambien sea `>= now()`.

Resultado esperado:

```json
{
  "date": "2026-05-18",
  "slots": []
}
```

### Segundo punto de corte: duracion

Fase 18.1 genero slots con el intervalo de agenda:

```text
slot_interval_minutes = agendaSettings.intervalMinutes
```

El default visual es:

```text
15 minutos
```

Availability Read filtra:

```text
slot duration >= service duration
```

Si el servicio dura, por ejemplo:

```text
70 minutos
```

y los slots duran:

```text
15 minutos
```

entonces:

```text
15 >= 70 => false
```

Resultado:

```text
todos los slots eliminados por RPC
```

## 7. Los slots llegan a AppContext?

Si la RPC devuelve slots, si llegan.

No hay filtro posterior:

```js
setAvailabilityState({
  slots: payload.slots,
  requestKey,
  loaded: true,
})
```

Si Mirna ve `Sin horarios disponibles`, el estado final probable es:

```text
availabilityState.slots.length = 0
```

El motivo mas probable es que la RPC devolvio `slots = []`.

## 8. Los slots llegan a ClientDashboard?

`ClientDashboard` lee:

```js
marketplaceAvailabilitySlots
```

Y define:

```js
const availableSlots = useMemo(() => {
  if (isRealMarketplace) return marketplaceAvailabilitySlots
  ...
})
```

No hay filtro posterior.

Si `marketplaceAvailabilitySlots.length > 0`, la UI renderiza slots.

Si `marketplaceAvailabilitySlots.length === 0`, la UI renderiza empty state.

## 9. Condicion que produce "Sin horarios disponibles"

Archivo:

`src/pages/client/ClientDashboard.jsx`

Condicion:

```js
availableSlots.length > 0 ? slots : emptyState
```

Empty state:

```text
Sin horarios disponibles
```

Por tanto:

```text
availableSlots.length === 0
```

En Marketplace real:

```text
availableSlots = marketplaceAvailabilitySlots
```

Entonces la condicion exacta final es:

```text
marketplaceAvailabilitySlots.length === 0
```

## 10. Payloads esperados

### Parametros RPC

```json
{
  "p_listing_id": "selectedArtistProfile.listingId",
  "p_service_offering_id": "selectedMarketplaceService.id or null",
  "p_date": "bookingDate"
}
```

Con estado inicial:

```json
{
  "p_date": "2026-05-18"
}
```

### Payload RPC vacio esperado por fecha inicial

```json
{
  "listingId": "uuid",
  "artistId": "Dennis artist uuid",
  "studioId": null,
  "membershipId": null,
  "serviceOfferingId": "uuid or null",
  "date": "2026-05-18",
  "slots": []
}
```

### Resultado normalizado

```json
{
  "listingId": "uuid",
  "artistId": "Dennis artist uuid",
  "studioId": null,
  "membershipId": null,
  "serviceOfferingId": "uuid or null",
  "date": "2026-05-18",
  "slots": []
}
```

### Resultado final renderizado

```text
availableSlots.length = 0
-> Sin horarios disponibles
```

## 11. Respuestas directas

### 1. Que `listingId` se envia?

```text
selectedArtistProfile.listingId
```

El UUID exacto depende del listing de Dennis en runtime.

### 2. Que `serviceOfferingId` se envia?

```text
selectedMarketplaceService?.id || null
```

El UUID exacto depende del servicio seleccionado por Mirna.

### 3. Que `date` se envia?

Por default:

```text
2026-05-18
```

Si Mirna cambia el date picker, se envia esa nueva fecha.

### 4. Que devuelve exactamente la RPC?

Sin ejecutar con JWT/runtime no se puede observar el JSON exacto. Por codigo, si los filtros de listing/profile/service pasan pero los filtros de slots no, devuelve:

```json
{ "slots": [] }
```

### 5. La RPC devuelve slots?

Con `p_date = 2026-05-18`, no deberia devolver slots porque exige `starts_at >= now()`.

Con una fecha futura correcta, todavia puede devolver 0 si los slots generados duran menos que el servicio.

### 6. Los slots llegan a AppContext?

Si la RPC devuelve slots, si. AppContext no los filtra.

### 7. Los slots llegan a ClientDashboard?

Si AppContext tiene slots, si. `ClientDashboard` no los filtra.

### 8. Existe algun filtro posterior que elimine slots?

No despues de la RPC. El filtrado fuerte esta en SQL.

### 9. Que condicion produce "Sin horarios disponibles"?

```text
availableSlots.length === 0
```

En real marketplace:

```text
marketplaceAvailabilitySlots.length === 0
```

## Veredicto

Los slots desaparecen en la RPC por filtros de consulta, no en React.

Los dos sospechosos confirmados por codigo son:

```text
1. p_date inicial = 2026-05-18, fecha pasada frente a now()
2. duracion slot generada por intervalo < duracion del servicio
```

La validacion siguiente debe capturar en runtime:

```js
selectedArtistProfile.listingId
selectedMarketplaceService.id
bookingDate
availabilityState.requestKey
availabilityState.slots.length
availabilityError
```

y comparar en Supabase:

```sql
select starts_at, ends_at, status, artist_id
from availability_slots
where artist_id = 'Dennis'
order by starts_at;
```

Si los slots estan en fechas posteriores a `2026-05-18`, el primer fix conceptual es usar una fecha default actual/futura. Si la fecha es correcta y sigue vacio, el siguiente fix conceptual es ajustar availability para devolver inicios posibles de servicio, no exigir que cada slot de intervalo dure lo mismo que el servicio.
