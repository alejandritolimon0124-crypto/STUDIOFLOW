# FASE 16.8F - APPCONTEXT DECONTAMINATION AUDIT

## Objetivo

Mapear todas las dependencias mock, demo, sandbox y legacy que siguen viviendo dentro de `src/contexts/AppContext.jsx`, y sus consumidores.

Este documento no implementa codigo, no crea SQL, no crea RPCs y no modifica archivos productivos. Solo auditoria y mapa de descontaminacion.

## Resumen ejecutivo

`AppContext` sigue siendo el principal punto de mezcla entre:

- sesion real Supabase
- modo demo
- adminState real/mock
- artistState local/mock
- clientState local/mock
- agenda local
- reservas locales
- acciones QA
- login demo

La mayor contaminacion no viene de una sola pantalla, sino del hecho de que AppContext exporta todo junto:

```text
useApp()
  -> session real
  -> loginDemo
  -> agendaSettings local
  -> bookedSlots local
  -> adminState real/mock
  -> artistState local/mock
  -> clientState local/mock
  -> getAvailableSlots local
  -> bookSlot local
  -> QA mutators
```

Fase 16.8C redujo la contaminacion de `adminState` para sesiones reales, pero AppContext todavia conserva agenda/booking/client/artist como estado local.

## 1. State Ownership Audit

Archivo:

`src/contexts/AppContext.jsx`

### Estados base

| Estado exportado | Linea origen | Origen | Supabase/local | Consumidores principales | Riesgo | Clasificacion |
|---|---:|---|---|---|---|---|
| `session` | `637` | `getStoredSession`, Supabase auth, demo login | Mixto | Casi toda la app | Es real o demo segun flujo; fuente critica. | REAL |
| `isAuthLoading` | `639` | `hasSupabaseAuth` | Local runtime | Auth/routes/layouts | Bajo. | LOCAL |
| `authError` | `640` | Auth flows | Local runtime | Login/Register/Reset | Bajo. | LOCAL |
| `agendaSettings` | `644` | `createInitialAgendaSettings()` | Local desde `weeklySchedule` mock | Client, Artist, QA | Alto: agenda/reservas no Supabase. | LEGACY |
| `adminState` | `645` | `getStoredAdminState(session)` | Real para admin tras loaders; mock para demo | Admin, Client, Artist, layouts | Medio: aun es contrato global legacy. | LEGACY |
| `clientState` | `646` | `getStoredClientState()` | Local/mock | Client dashboard/profile | Alto: cliente real puede mezclarse con local. | LEGACY |
| `artistState` | `647` | `getStoredArtistState()` | Local/mock + algunas RPC artist | Artist dashboard/services/profile, client history | Alto: citas/clientes artist siguen locales. | LEGACY |
| `selectedDate` | `658` | Hardcode `2026-05-18` | Local | Artist dashboard, layout, marketing | Medio: fecha fija demo/QA. | MOCK |

### Estados derivados/servicios expuestos

| Export | Linea export | Origen | Supabase/local | Consumidores | Riesgo | Clasificacion |
|---|---:|---|---|---|---|---|
| `isMockSession` | `1799` | `session.isMockSession` | Local flag | Layouts/pantallas | Necesario para frontera real/demo. | REAL |
| `artistServices` | `1804` | `artistState.services` | RPC real en sesiones artist; mock inicial | Artist dashboard/services | Mixto; ya tiene RPC pero fallback local. | LEGACY |
| `isArtistServicesLoading` | `1805` | runtime | Local | Artist Services | Bajo. | LOCAL |
| `artistServicesError` | `1806` | runtime | Local | Artist Services | Bajo. | LOCAL |
| `isAdminArtistsLoading` | `1810` | runtime | Local | Admin screens | Bajo. | LOCAL |
| `adminArtistsError` | `1811` | runtime | Local | Admin screens | Bajo. | LOCAL |
| `isAdminDashboardLoading` | `1812` | runtime | Local | Admin dashboard | Bajo. | LOCAL |
| `adminDashboardError` | `1813` | runtime | Local | Admin dashboard | Bajo. | LOCAL |
| `isAdminClientsLoading` | `1814` | runtime | Local | Admin clients | Bajo. | LOCAL |
| `adminClientsError` | `1815` | runtime | Local | Admin clients | Bajo. | LOCAL |

### Mutadores y acciones exportadas

| Export | Linea export | Origen | Supabase/local | Consumidores | Riesgo | Clasificacion |
|---|---:|---|---|---|---|---|
| `login` | `1788` | Alias de `loginDemo` | Demo/local | QASandbox via `login` | Alto: nombre generico oculta que es demo. | MOCK |
| `loginDemo` | `1789` | Demo auth local | Demo/local | Login.jsx | Medio/alto si visible en prod. | MOCK |
| `loginWithPassword` | `1790` | Supabase Auth | Supabase | Login.jsx | Correcto. | REAL |
| `registerClient` | `1791` | Supabase Auth + bootstrap RPC | Supabase | Register.jsx | Correcto. | REAL |
| `registerArtist` | `1792` | Supabase Auth + bootstrap RPC | Supabase | Register.jsx | Correcto. | REAL |
| `logout` | `1793` | Supabase signOut o local | Mixto | Layouts | Correcto. | REAL |
| `resetPassword` | `1794` | Supabase Auth | Supabase | ForgotPassword | Correcto. | REAL |
| `updatePassword` | `1795` | Supabase Auth | Supabase | ResetPassword | Correcto. | REAL |
| `toggleScheduleDay` | `1816` | Agenda local | Local | ArtistScheduleSettings | Agenda no Supabase. | LEGACY |
| `cancelScheduleDay` | `1817` | Agenda local | Local | ArtistScheduleSettings | Agenda no Supabase. | LEGACY |
| `updateScheduleDayTime` | `1818` | Agenda local | Local | ArtistScheduleSettings | Agenda no Supabase. | LEGACY |
| `addScheduleBlock` | `1819` | Agenda local | Local | ArtistScheduleSettings | Agenda no Supabase. | LEGACY |
| `updateScheduleBlock` | `1820` | Agenda local | Local | ArtistScheduleSettings | Agenda no Supabase. | LEGACY |
| `addBlockedDate` | `1821` | Agenda local | Local | ArtistScheduleSettings | Agenda no Supabase. | LEGACY |
| `removeBlockedDate` | `1822` | Agenda local | Local | ArtistScheduleSettings | Agenda no Supabase. | LEGACY |
| `updateAgendaRule` | `1823` | Agenda local | Local | ArtistScheduleSettings | Agenda no Supabase. | LEGACY |
| `toggleManagedArtistStatus` | `1824` | RPC real when non-mock; local when mock | Mixto | AdminArtists | Good bridge but mixed. | LEGACY |
| `updateManagedArtistProfile` | `1825` | RPC real when non-mock; local when mock | Mixto | AdminArtists | Good bridge but mixed. | LEGACY |
| `updateManagedStudioProfile` | `1826` | Local only | Local | AdminStudioProfile/AdminArtists | High: studio writes not Supabase. | LEGACY |
| `toggleManagedClientStatus` | `1827` | RPC real when non-mock; local when mock | Mixto | AdminClients | Good bridge but mixed. | LEGACY |
| `updateManagedClientProfile` | `1828` | RPC real when non-mock; local when mock | Mixto | AdminClients | Good bridge but mixed. | LEGACY |
| `getAvailableSlots` | `1829` | Local engine over agendaSettings/adminState | Local | Client/QA | High: booking availability not Supabase. | LEGACY |
| `bookSlot` | `1830` | Local bookedSlots | Local | Client/Artist | High: creates local booking, not appointment. | LEGACY |
| `resetBookedSlots` | `1831` | Local QA | Local | QASandbox | QA exposed globally. | MOCK |
| `clearBlockedDates` | `1832` | Local QA | Local | QASandbox | QA exposed globally. | MOCK |
| `releaseAgenda` | `1833` | Local QA | Local | QASandbox | QA exposed globally. | MOCK |
| `blockTuesdays` | `1834` | Local QA | Local | QASandbox | QA exposed globally. | MOCK |
| `setPrimaryArtistStatus` | `1835` | Local adminState mutation | Local | QASandbox | Can mutate real-loaded adminState without RPC/audit. | MOCK |
| `addMockBooking` | `1836` | Hardcoded local booking | Local | QASandbox | Inserts fake booking. | MOCK |
| `toggleFavoriteArtist` | `1837` | Client local state | Local | ClientDashboard | Favorites not Supabase. | LEGACY |
| `updateClientProfile` | `1838` | Client local state | Local | ClientDashboard | Client profile local. | LEGACY |
| `loadAdminDashboard` | `1839` | RPC | Supabase | Admin/AppContext effect | Correct. | REAL |
| `loadAdminArtists` | `1840` | RPC | Supabase | Admin/AppContext effect | Correct post 16.8C. | REAL |
| `loadAdminClients` | `1841` | RPC | Supabase | Admin/AppContext effect | Correct. | REAL |
| `loadArtistServices` | `1842` | RPC | Supabase | Artist services | Correct, but state target local. | REAL |
| `saveArtistService` | `1843` | RPC when real | Supabase | ArtistServices | Correct. | REAL |
| `updateArtistServiceStatus` | `1844` | RPC when real | Supabase | ArtistServices | Correct. | REAL |
| `archiveArtistService` | `1845` | RPC when real | Supabase | ArtistServices | Correct. | REAL |
| `addArtistClient` | `1846` | Local artistState | Local | ArtistDashboard | Artist CRM local. | LEGACY |
| `updateArtistClient` | `1847` | Local artistState | Local | ArtistDashboard | Artist CRM local. | LEGACY |
| `updateArtistProfile` | `1848` | Local artistState draft | Local | ArtistProfileSettings | Draft local. | LEGACY |
| `saveArtistProfile` | `1849` | RPC real | Supabase | ArtistProfileSettings | Correct. | REAL |
| `addArtistAppointment` | `1850` | Local artistState | Local | Artist dashboard/appointments | Appointment local. | LEGACY |
| `setSelectedDate` | `1852` | Local | Local | ArtistDashboard | Local date state. | LOCAL |

## 2. Consumer Audit

### `agendaSettings`

| Archivo | Linea | Proposito | Riesgo |
|---|---:|---|---|
| `src/pages/client/ClientDashboard.jsx` | `416` | Consume agenda para marketplace/booking. | Cliente real depende de agenda local. |
| `src/pages/client/ClientDashboard.jsx` | `644` | Convierte `agendaSettings.bookedSlots` a citas visibles. | Citas locales/mock pueden aparecer como proximas. |
| `src/pages/admin/QASandbox.jsx` | `91` | QA observable/debug. | OK solo dev; contaminante en Sistema real. |
| `src/pages/admin/QASandbox.jsx` | `178`, `195`, `214`, `265` | Render agenda/bloqueos/reservas locales. | QA visible en admin real. |
| `src/pages/artist/ArtistScheduleSettings.jsx` | `11`, `37`, `124`, `131`, `141` | Configuracion de agenda artista. | No persiste Supabase. |
| `src/contexts/AppContext.jsx` | `1356-1418` | Motor local `getAvailableSlots`. | Booking depende de estado local. |

### `bookedSlots`

| Archivo | Linea | Proposito | Riesgo |
|---|---:|---|---|
| `src/contexts/AppContext.jsx` | `302` | Inicializa `bookedSlots: []`. | No tabla real. |
| `src/contexts/AppContext.jsx` | `620-628` | Detecta duplicados localmente. | Solo runtime local. |
| `src/contexts/AppContext.jsx` | `1394` | Bloquea slots ocupados en disponibilidad local. | No consulta `appointments`. |
| `src/contexts/AppContext.jsx` | `1435-1457` | `bookSlot` agrega booking local. | No crea cita real. |
| `src/contexts/AppContext.jsx` | `1462-1467` | `resetBookedSlots`. | QA borra reservas locales. |
| `src/contexts/AppContext.jsx` | `1514-1537` | `addMockBooking`. | Inserta reserva hardcodeada. |
| `src/pages/client/ClientDashboard.jsx` | `644` | Muestra booked slots como citas. | Contaminacion directa cliente real. |
| `src/pages/admin/QASandbox.jsx` | `68`, `265-266` | Debug y reservas activas mock. | QA visible en admin real. |

### `selectedDate`

| Archivo | Linea | Proposito | Riesgo |
|---|---:|---|---|
| `src/contexts/AppContext.jsx` | `658` | Fecha global inicial `2026-05-18`. | Fecha hardcode demo. |
| `src/layouts/DashboardLayout.jsx` | `99`, `180` | Filtra citas artista por fecha. | Layout depende de fecha global local. |
| `src/pages/artist/ArtistDashboard.jsx` | `77`, `153`, `168`, `460`, `492` | Calendario/citas artista. | Citas artist locales filtradas por fecha local. |
| `src/pages/artist/ArtistMarketing.jsx` | `45`, `105` | Automations por fecha. | Insights locales/mock. |
| `src/modules/automation/smartAutomationEngine.js` | `323`, `331`, `338` | Default `2026-05-18`. | Automatizacion con fecha demo default. |

### `adminState`

| Archivo | Linea | Proposito | Riesgo |
|---|---:|---|---|
| `src/pages/admin/AdminDashboard.jsx` | `61-63` | Dashboard summary. | Mejorado; depende de dashboard real. |
| `src/pages/admin/AdminArtists.jsx` | `24`, `40-70`, `84-115` | Artistas/studios admin. | Real parcial; studio profile sigue local. |
| `src/pages/admin/AdminClients.jsx` | `19`, `30-76` | Clientes con scope/studios/artists. | Real parcial, aun usa selectores legacy. |
| `src/pages/admin/AdminStudioProfile.jsx` | `13`, `19-25` | Perfil estudio. | Escritura local, lectura parcial. |
| `src/pages/client/ClientDashboard.jsx` | `415`, `436-478`, `618-637` | Marketplace cliente desde adminState. | Cliente real depende de adminState admin/global. |
| `src/pages/admin/QASandbox.jsx` | `92`, `103-113` | Primary artist/studio QA. | QA mezcla datos reales con sandbox. |
| `src/layouts/ArtistLayout.jsx` | `27-53` | Selector studio/artista. | Layout artista depende de adminState. |
| `src/layouts/DashboardLayout.jsx` | `99`, `134-155` | Selectores nav/contexto. | Layout global depende de adminState. |
| `src/pages/artist/*` | multiples | Studio/artista actual. | Artist area aun depende de adminState legacy. |

### `login`

| Archivo | Linea | Proposito | Riesgo |
|---|---:|---|---|
| `src/contexts/AppContext.jsx` | `1788` | Exporta `login: loginDemo`. | Nombre generico oculta demo. |
| `src/pages/admin/QASandbox.jsx` | `90`, `124-127` | Navegacion QA por roles. | Cambia sesion real a demo. |

### `loginDemo`

| Archivo | Linea | Proposito | Riesgo |
|---|---:|---|---|
| `src/contexts/AppContext.jsx` | `721-754` | Construye sesion mock. | Demo en contexto global. |
| `src/pages/auth/Login.jsx` | `21`, `26`, `96-110` | Botones de acceso demo. | Demo disponible en login. |

### `getAvailableSlots`

| Archivo | Linea | Proposito | Riesgo |
|---|---:|---|---|
| `src/contexts/AppContext.jsx` | `1356-1418` | Calcula disponibilidad local. | No usa Supabase appointments/availability. |
| `src/pages/client/ClientDashboard.jsx` | `422`, `451`, `470`, `637` | Marketplace y booking cliente. | Cliente real reserva contra motor local. |
| `src/pages/admin/QASandbox.jsx` | `93`, `113-118` | Debug slots QA. | No operativo real. |

## 3. Booking Dependency Audit

### Dependencias actuales del motor de reservas

| Pieza | Archivo/linea | Depende de | Supabase |
|---|---:|---|---|
| Agenda base | `AppContext.jsx:291-302` | `weeklySchedule` desde `mockData` | No |
| Bloqueos | `AppContext.jsx:299`, `1373` | `initialBlockedDates`, `agendaSettings.blockedDates` | No |
| Slots visibles | `AppContext.jsx:1356-1418` | `agendaSettings`, `adminState.artists`, `adminState.studios` | No |
| Ocupacion slot | `AppContext.jsx:1394` | `agendaSettings.bookedSlots` | No |
| Crear booking | `AppContext.jsx:1421-1460` | `bookSlot`, `bookedSlots` | No |
| Duplicados | `AppContext.jsx:620-628` | `bookedSlots` | No |
| Citas cliente visibles | `ClientDashboard.jsx:644` | `agendaSettings.bookedSlots` | No |
| Nueva cita artista | `ArtistDashboard.jsx:244`, `ArtistAppointments.jsx:71` | `bookSlot` | No |
| Citas artist dashboard | `ArtistDashboard.jsx:153` | `artistState.appointments` | No |
| Citas artist appointments | `ArtistAppointments.jsx:32-33` | `artistState.appointments` | No |

### Que partes ya dependen de Supabase

| Area | Estado |
|---|---|
| Admin Dashboard appointments | RPC `studio_flow_admin_get_dashboard_summary` devuelve appointments reales para dashboard admin. |
| Admin Clients history/spend | RPC `studio_flow_admin_get_clients` usa appointments/economy reales. |
| Admin Artists read/write core | RPCs reales para artistas. |
| Artist service/profile | RPCs reales para servicios y perfil. |

### Que partes de booking NO dependen de Supabase

| Area | Estado |
|---|---|
| Marketplace client booking | Local `getAvailableSlots` + `bookSlot`. |
| Client upcoming appointments from booked slots | Local `agendaSettings.bookedSlots`. |
| Artist agenda settings | Local `agendaSettings`. |
| Artist appointment creation | Local `addArtistAppointment` + `bookSlot`. |
| Artist appointment list | Local `artistState.appointments`. |
| QA slots/reservas | Local. |

Conclusion:

El motor de reservas operativo sigue siendo local/legacy. Supabase ya alimenta dashboards/admin histories, pero no la creacion real de appointments ni disponibilidad real usada por cliente/artista.

## 4. Authentication Audit

### Quien usa `login()`

| Consumidor | Linea | Efecto |
|---|---:|---|
| `QASandbox.jsx` | `90`, `124-127`, `169-171` | `login(role)` ejecuta alias de `loginDemo`; cambia a sesion demo y navega. |

### Quien usa `loginDemo()`

| Consumidor | Linea | Efecto |
|---|---:|---|
| `Login.jsx` | `21`, `26`, `96-110` | Botones de acceso demo. |
| `AppContext.jsx` | `1788-1789` | Expone `login` y `loginDemo`. |

### Quien puede cambiar sesiones reales a demo

| Ruta | Actor | Riesgo |
|---|---|---|
| `/admin/system` -> Navegacion QA | Platform Owner real | Clic en Admin/Artista/Cliente llama `loginDemo` y reemplaza sesion real. |
| `/login` -> Accesos demo | Cualquier usuario en pantalla login | Entra a modo demo, esperado si demo es intencional. |

El mayor problema es `QASandbox`: una pantalla dentro de admin real puede cambiar la sesion real a demo.

## 5. Decontamination Map

### KEEP

| Elemento | Motivo |
|---|---|
| `session`, `loginWithPassword`, `registerClient`, `registerArtist`, `logout`, `resetPassword`, `updatePassword` | Flujos reales Supabase/auth. |
| `loadAdminDashboard`, `loadAdminArtists`, `loadAdminClients` | Lectura real Supabase admin. |
| Artist service/profile RPC actions | Ya migradas a RPC para sesiones reales. |
| Admin artist/client core actions | Ya migradas a RPC en sesiones reales. |
| Loading/error states | Estado UI local legitimo. |

### MIGRATE

| Elemento | Destino |
|---|---|
| `agendaSettings` | Supabase schedule/availability cuando exista fuente real. |
| `bookedSlots` | `appointments` reales. |
| `getAvailableSlots` | RPC/servicio real de disponibilidad. |
| `bookSlot` | RPC real de creacion de appointment. |
| `artistState.appointments` | `appointments` reales scoped al artista. |
| `artistState.clients` | relaciones/clientes reales. |
| `clientState.profile` | profile/client real Supabase. |
| `updateManagedStudioProfile` | RPC real de studio profile. |
| `toggleFavoriteArtist` | Persistencia real si favoritos son producto. |
| `updateClientProfile` | RPC cliente real para self-service. |
| `selectedDate` hardcode | Estado de UI sin fecha fija demo. |

### ISOLATE

| Elemento | Frontera recomendada |
|---|---|
| `mockData` | Solo modo demo/dev. |
| `loginDemo` | Solo login demo explicito; no export generico `login`. |
| `login: loginDemo` | Renombrar o retirar alias generico en fase futura. |
| `QASandbox` consumers | DEV ONLY. |
| `resetBookedSlots`, `clearBlockedDates`, `releaseAgenda`, `blockTuesdays`, `addMockBooking` | Export dev-only o contexto separado QA. |
| `adminMockStateStorageKey` | Mantener solo para demo. |
| Demo buttons in Login | Feature flag o entorno dev/demo. |

### DELETE

| Elemento | Motivo |
|---|---|
| `quickNavigate` en admin real | Cambia sesion real a demo. |
| `setPrimaryArtistStatus` QA expuesto globalmente | Muta adminState sin RPC/audit. |
| `addMockBooking` en contexto productivo | Inserta datos falsos. |
| Copy `Mock`/`Demo` en rutas reales | Inconsistencia de negocio. |
| Dependencia de `adminState` para marketplace cliente a largo plazo | Cliente debe consumir marketplace/listings reales, no admin state. |

## Riesgos principales

| Riesgo | Impacto |
|---|---|
| AppContext exporta real y mock juntos | Cualquier componente puede consumir capacidades equivocadas. |
| `login` es alias de `loginDemo` | Nombre inseguro; parece auth real. |
| Booking local en cliente/artista | Reservas no persisten ni auditan. |
| `bookedSlots` alimenta UI cliente | Puede mostrar reservas inexistentes. |
| `adminState` alimenta marketplace cliente | Superficie publica depende de estado admin legacy. |
| Artist area depende de adminState | Artist real puede heredar datos admin/demo. |
| QA mutators exportados globalmente | Acciones sandbox disponibles fuera de frontera dev. |

## Veredicto

AppContext debe dividirse conceptualmente en cuatro dominios:

1. Auth real.
2. Admin real.
3. Artist/Client real.
4. Demo/QA tools.

Hoy esos dominios viven en un solo provider y se exportan juntos. Esa mezcla es la raiz de contaminacion que permite que QA, mock, agenda local y login demo aparezcan o afecten sesiones reales.

El siguiente paso no deberia ser agregar mas funcionalidad, sino aislar fronteras: demo/QA fuera del flujo real, booking fuera de `bookedSlots`, y marketplace/artist/client fuera de `adminState` legacy.
