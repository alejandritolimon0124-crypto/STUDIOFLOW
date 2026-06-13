# FASE 18.1 - SCHEDULE CONFIGURATION WRITE AUDIT

## Objetivo

Determinar exactamente donde se guardan actualmente los horarios configurados por un artista.

Este documento no implementa codigo, no modifica logica y no crea SQL/RPC. Solo auditoria.

## Veredicto ejecutivo

Los horarios visibles de Dennis no viven en Supabase.

El flujo actual es:

```text
ArtistScheduleSettings
  -> agendaSettings
  -> mutadores AppContext
  -> setAgendaSettings()
  -> React state runtime
```

La agenda inicial viene de:

```text
src/services/mockData.js
  -> weeklySchedule
  -> createInitialAgendaSettings()
```

No existe escritura real a:

- `schedules`
- `schedule_rules`
- `calendar_blocks`
- `availability_slots`

Tampoco existe persistencia localStorage para `agendaSettings`. Por tanto, los cambios de horarios viven en React state mientras la app esta abierta.

## 1. Flujo completo actual

```text
Artist
  -> /artist/schedule
  -> ArtistScheduleSettings
  -> agendaSettings.schedule
  -> updateScheduleDayTime / toggleScheduleDay / addScheduleBlock
  -> AppContext.setAgendaSettings()
```

No hay paso:

```text
service layer
  -> RPC
  -> schedules / schedule_rules
```

## 2. Componente que maneja configuracion

Archivo:

`src/pages/artist/ArtistScheduleSettings.jsx`

Consume desde `useApp()`:

```js
agendaSettings
toggleScheduleDay
cancelScheduleDay
updateScheduleDayTime
addScheduleBlock
updateScheduleBlock
addBlockedDate
removeBlockedDate
updateAgendaRule
```

Renderiza:

- Dias laborales.
- Inicio/fin por dia.
- Bloques por dia.
- Reglas de agenda.
- Fechas bloqueadas.

El header muestra:

```jsx
<PanelHeader title="Dias laborales" eyebrow="Semana base" action={<Button size="sm">Guardar horarios</Button>} />
```

Pero ese boton no tiene `onClick`; no ejecuta guardado real.

## 3. Estado actualizado

Archivo:

`src/contexts/AppContext.jsx`

Estado:

```js
const [agendaSettings, setAgendaSettings] = useState(createInitialAgendaSettings)
```

Mutadores:

| Funcion | Actualiza |
|---|---|
| `toggleScheduleDay(dayName)` | `agendaSettings.schedule[].active`, start/end, blocks. |
| `cancelScheduleDay(dayName)` | Marca dia inactive y limpia blocks. |
| `updateScheduleDayTime(dayName, field, value)` | Cambia `start` o `end`. |
| `addScheduleBlock(dayName)` | Agrega bloque local. |
| `updateScheduleBlock(dayName, blockId, field, value)` | Edita bloque local. |
| `addBlockedDate(dateValue)` | Agrega fecha bloqueada local. |
| `removeBlockedDate(dateId)` | Quita fecha bloqueada local. |
| `updateAgendaRule(field, value)` | Cambia `intervalMinutes` o `minAdvanceHours`. |

Todas llaman:

```js
setAgendaSettings(...)
```

No llaman services ni RPCs.

## 4. Fuente inicial de horarios

Archivo:

`src/services/mockData.js`

Fuente:

```js
export const weeklySchedule = [
  { day: 'Lunes', active: true, start: '10:00', end: '19:00', ... },
  ...
]
```

Archivo:

`src/contexts/AppContext.jsx`

Inicializacion:

```js
function createInitialAgendaSettings() {
  return {
    schedule: weeklySchedule.map((day) => ({
      ...day,
      blocks: day.active
        ? [{ id: `${day.day}-break`, start: day.breakStart, end: day.breakEnd }]
        : [],
    })),
    blockedDates: initialBlockedDates,
    intervalMinutes: 15,
    minAdvanceHours: 2,
    bookedSlots: [],
  }
}
```

Esto confirma:

```text
mockData weeklySchedule
  -> agendaSettings inicial
```

## 5. localStorage utilizado

`AppContext` persiste:

| Estado | Key |
|---|---|
| session | `studio-flow-session` |
| adminState | `studio-flow-admin-state-*` |
| clientState | `studio-flow-client-state` |
| artistState | `studio-flow-artist-state` |

Persistencia encontrada:

```js
localStorage.setItem(adminStorageKey, JSON.stringify(adminState))
localStorage.setItem(clientStateStorageKey, JSON.stringify(clientState))
localStorage.setItem(artistStateStorageKey, JSON.stringify(artistState))
```

No existe:

```text
localStorage.setItem(... agendaSettings ...)
```

Conclusion:

```text
agendaSettings no se guarda en localStorage
```

Los horarios editados se pierden al recargar o reiniciar el provider.

## 6. Escritura real a Supabase

No existe escritura real a:

- `schedules`
- `schedule_rules`
- `calendar_blocks`
- `availability_slots`

Busqueda:

| Recurso | Estado |
|---|---|
| `scheduleService.js` | No existe. |
| RPC `studio_flow_*schedule*` write | No existe. |
| RPC `studio_flow_*availability*` write/generate | No existe. |
| `supabase.from('schedules').insert/update` | No existe en app. |
| `supabase.from('schedule_rules').insert/update` | No existe en app. |

La unica RPC nueva relacionada con availability es read-only:

```text
studio_flow_marketplace_get_availability()
```

Esa RPC lee `availability_slots`; no crea schedules ni slots.

## 7. Por que Supabase permanece en cero

Supabase permanece en cero porque ninguna pantalla escribe esas tablas.

Ruta actual:

```text
ArtistScheduleSettings
  -> AppContext mutator
  -> setAgendaSettings()
  -> memoria React
```

Ruta inexistente:

```text
ArtistScheduleSettings
  -> scheduleService
  -> RPC transaccional
  -> schedules
  -> schedule_rules
  -> calendar_blocks
  -> availability_slots
```

Por eso:

```text
schedules = 0
schedule_rules = 0
availability_slots = 0
```

aunque Dennis vea horarios configurados visualmente.

## 8. Funciones llamadas

### Frontend

Archivo:

`src/pages/artist/ArtistScheduleSettings.jsx`

| Accion UI | Funcion |
|---|---|
| Activar dia | `toggleScheduleDay(day.day)` |
| Cancelar dia completo | `cancelScheduleDay(day.day)` |
| Cambiar inicio/fin | `updateScheduleDayTime(day.day, field, value)` |
| Agregar bloque | `addScheduleBlock(day.day)` |
| Editar bloque | `updateScheduleBlock(day.day, block.id, field, value)` |
| Bloquear fecha | `addBlockedDate(selectedDate)` |
| Quitar bloqueada | `removeBlockedDate(date.id)` |
| Cambiar reglas | `updateAgendaRule(field, value)` |

### AppContext

Todas las funciones anteriores viven en:

```text
src/contexts/AppContext.jsx
```

Todas mutan:

```text
agendaSettings
```

### Service Layer

No se utiliza ningun service para guardar horarios.

### RPC

No se llama ningun RPC para guardar horarios.

## 9. Respuesta directa

### Los horarios de Dennis viven en A/B/C/D?

| Opcion | Respuesta |
|---|---|
| A) React state | Si, los cambios actuales viven en `agendaSettings`. |
| B) localStorage | No, `agendaSettings` no se persiste. |
| C) mockData | Si como fuente inicial: `weeklySchedule`. |
| D) otra fuente | No para horarios productivos. |

Respuesta precisa:

```text
Los horarios visuales viven en React state, inicializados desde mockData.
```

No viven en Supabase ni en localStorage.

## 10. Separacion por capa

### Frontend

`ArtistScheduleSettings` muestra y edita `agendaSettings`.

El boton `Guardar horarios` es visual; no guarda.

### AppContext

`agendaSettings` es la fuente real actual de la UI.

`setAgendaSettings()` actualiza estado local runtime.

### Service Layer

No hay service de schedule.

### RPC

No hay RPC de escritura de schedule.

### Supabase

Las tablas existen:

- `schedules`
- `schedule_rules`
- `calendar_blocks`
- `availability_slots`

Pero estan desconectadas del formulario.

## Veredicto

Dennis tiene horarios configurados visualmente porque la app arranca con:

```text
weeklySchedule mock
  -> agendaSettings
```

y permite editar:

```text
agendaSettings
```

pero nunca persiste eso en Supabase.

La siguiente fase correcta no es Booking Write todavia. Primero hace falta:

```text
Schedule Write
  -> schedules
  -> schedule_rules
  -> calendar_blocks
  -> availability_slots generation/readiness
```
