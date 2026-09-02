# FASE 15.0 - ADMIN SUPABASE AUDIT

## Resumen ejecutivo

El modulo Admin esta mayoritariamente en modo demo/local.

Fuente principal actual:

```txt
src/services/mockData.js
-> AppContext.createInitialAdminState()
-> adminState
-> localStorage['studio-flow-admin-state']
```

Persistencia real Admin:

```txt
No hay service layer Admin.
No hay llamadas Supabase desde pantallas Admin.
No hay inserts/updates/deletes Admin hacia tablas de negocio.
```

Excepcion parcial:

```txt
AdminDashboard consume artistServices desde AppContext.
```

`artistServices` puede venir de Supabase para un artista autenticado real, pero Admin Dashboard no consulta un catalogo global ni servicios multi-artista. Por eso esa integracion es parcial y no convierte al panel Admin en Supabase-driven.

## Rutas Admin existentes

Archivos:

```txt
src/App.jsx
src/routes/AppRouter.jsx
src/routes/paths.js
src/layouts/AdminLayout.jsx
src/layouts/DashboardLayout.jsx
```

Pantallas realmente existentes:

```txt
src/pages/admin/AdminDashboard.jsx
src/pages/admin/AdminArtists.jsx
src/pages/admin/AdminClients.jsx
src/pages/admin/AdminStudioProfile.jsx
src/pages/admin/QASandbox.jsx
```

Rutas visibles:

| Ruta | Pantalla |
|---|---|
| `/admin` | `AdminDashboard` |
| `/admin/artists` | `AdminArtists` |
| `/admin/clients` | `AdminClients` |
| `/admin/studio` | `AdminStudioProfile` |
| `/admin/system` | `QASandbox` en `App.jsx`, pero `AdminDashboard` en `AppRouter.jsx` |

Observacion:

Hay inconsistencia entre routers:

```txt
src/App.jsx -> /admin/system usa QASandbox
src/routes/AppRouter.jsx -> paths.adminSystem usa AdminDashboard
```

Si ambos routers no estan activos simultaneamente, puede no afectar runtime, pero la definicion esta duplicada/inconsistente.

No existen pantallas Admin dedicadas para:

```txt
AdminServices
AdminMarketplace
AdminAppointments
AdminSettings
```

## Contexto Admin actual

Archivo:

```txt
src/contexts/AppContext.jsx
```

### Estado inicial

Funcion:

```txt
createInitialAdminState()
```

Lineas aproximadas:

```txt
292-328
```

Origen:

```txt
studios        -> src/services/mockData.js
managedArtists -> src/services/mockData.js
managedClients -> src/services/mockData.js
clientHistory  -> src/services/mockData.js
users          -> src/services/mockData.js
```

### Persistencia local

Funcion:

```txt
getStoredAdminState()
```

Lineas aproximadas:

```txt
369-412
```

Lee:

```txt
localStorage['studio-flow-admin-state']
```

Efecto de escritura:

```txt
localStorage.setItem(adminStateStorageKey, JSON.stringify(adminState))
```

Lineas aproximadas:

```txt
847-851
```

### Mutaciones Admin

Todas las acciones Admin principales terminan en `setAdminState()`:

```txt
toggleManagedArtistStatus()
updateManagedArtistProfile()
updateManagedStudioProfile()
toggleManagedClientStatus()
updateManagedClientProfile()
setPrimaryArtistStatus()
```

Lineas aproximadas:

```txt
1007-1054
1202-1212
```

No hay:

```txt
Supabase .from(...)
Supabase rpc(...)
service layer Admin
```

## ADMIN DASHBOARD

Archivo:

```txt
src/pages/admin/AdminDashboard.jsx
```

Componentes usados:

```txt
Card
MetricCard
PanelHeader
StatusPill
Button
```

Fuentes de datos actuales:

```txt
artistAppointments from mockData
artistClients from mockData
managedArtists from mockData
studios from mockData
users from mockData
systemStatus from mockData
executiveRiskEvents hardcoded local
executiveClients hardcoded/derived local
reviewStudios useState(studios)
artistServices from AppContext
```

Lineas clave:

```txt
48-125   executiveRiskEvents hardcoded
145      AdminDashboard()
147      useApp() solo extrae artistServices y session
149      reviewStudios = useState(studios)
155      ownerAppointments = [...artistAppointments, ...executiveRiskEvents]
165-181  accesos derivados desde managedArtists/studios/mock
233-240  KPIs calculados localmente
303-314  updateReviewStatus()
418-420  botones Aprobar/Suspender/Solicitar cambios
```

### Metricas / KPIs / estadisticas

UI:

```txt
Metric cards, portfolio metrics, revenue, risk, Flow Points, ocupacion
```

Flujo:

```txt
UI -> funciones calculadoras locales -> datos mock/hardcoded -> render
```

Supabase:

```txt
No
```

Tablas actuales:

```txt
Ninguna
```

Tablas que deberian usarse:

```txt
appointments
appointment_economies
service_offerings
studios
artists
clients
loyalty_accounts
loyalty_transactions
governance_reviews
trust_events / audit_events segun metrica
```

Estado:

```txt
SOLO DEMO
```

### Aprobacion/suspension de estudios desde dashboard

UI:

```txt
Aprobar
Suspender
Solicitar cambios
```

Funcion:

```txt
updateReviewStatus(studio.id, studioStatus)
```

Flujo:

```txt
UI -> updateReviewStatus()
-> setReviewStudios()
-> FIN
```

Persistencia:

```txt
useState local en AdminDashboard
No llega a AppContext.
No llega a localStorage.
No llega a Supabase.
Se pierde al desmontar/recargar.
```

Tablas que deberian usarse:

```txt
studios.studio_status
studios.approved_at
governance_reviews
audit_events
```

Estado:

```txt
SIN IMPLEMENTAR
```

## ADMIN ARTISTS

Archivo:

```txt
src/pages/admin/AdminArtists.jsx
```

Componentes usados:

```txt
Card
PanelHeader
Input
StatusPill
Button
```

Fuentes de datos:

```txt
adminState.artists
adminState.studios
session.user
```

Lineas clave:

```txt
21    AdminArtists()
23-29 useApp(): adminState, toggleManagedArtistStatus, updateManagedArtistProfile, updateManagedStudioProfile
40    deriveMembershipsFromLegacyData({ artists: adminState.artists })
122   saveArtistProfile()
141   updateManagedArtistProfile()
146   updateManagedStudioProfile()
192   Nueva artista button
211   toggleManagedArtistStatus()
215   setEditingArtist()
429   Guardar cambios
```

### Activacion / desactivacion de artista

UI:

```txt
Inactivar / Activar
```

Funcion:

```txt
toggleManagedArtistStatus(artist.id)
```

Contexto:

```txt
AppContext.toggleManagedArtistStatus()
```

Flujo:

```txt
UI -> toggleManagedArtistStatus()
-> setAdminState()
-> localStorage['studio-flow-admin-state']
-> FIN
```

Supabase:

```txt
No
```

Tablas actuales:

```txt
Ninguna
```

Tablas que deberian usarse:

```txt
artists.status
artist_studio_memberships.status
governance_reviews / audit_events para razon y trazabilidad
```

Estado:

```txt
SOLO DEMO
```

### Edicion de artista

Campos visibles:

```txt
Nombre
Ciudad
Plan
Servicios
Descripcion
Ubicacion del estudio
Ubicacion profesional del artista
```

Funcion:

```txt
saveArtistProfile()
```

Contexto:

```txt
updateManagedArtistProfile()
updateManagedStudioProfile()
```

Flujo:

```txt
UI -> saveArtistProfile()
-> updateManagedArtistProfile()
-> setAdminState()
-> updateManagedStudioProfile()
-> setAdminState()
-> localStorage
-> FIN
```

Supabase:

```txt
No
```

Tablas que deberian usarse:

```txt
artists
artist_profiles
artist_studio_memberships
studios
studio_profiles
service_offerings
```

Estado:

```txt
SOLO DEMO
```

### Nueva artista

UI:

```txt
Button "Nueva artista"
```

Funcion:

```txt
Ninguna
```

Flujo:

```txt
UI -> boton sin onClick -> FIN
```

Estado:

```txt
SIN IMPLEMENTAR
```

### Aprobacion / rechazo de artista

UI:

```txt
No existe accion explicita de aprobar/rechazar artista en AdminArtists.
```

Tablas que deberian usarse:

```txt
artist_claim_invitations
artist_claim_reviews
artists
artist_studio_memberships
governance_reviews
audit_events
```

Estado:

```txt
SIN IMPLEMENTAR
```

## ADMIN CLIENTS

Archivo:

```txt
src/pages/admin/AdminClients.jsx
```

Componentes usados:

```txt
Card
PanelHeader
Input
StatusPill
Button
```

Fuentes de datos:

```txt
adminState.clients
adminState.artists
adminState.studios
session.user
```

Lineas clave:

```txt
17   AdminClients()
18-23 useApp(): adminState, toggleManagedClientStatus, updateManagedClientProfile
80   saveClientProfile()
83   updateManagedClientProfile()
90   Nueva clienta button
109  toggleManagedClientStatus()
112  Ver historial
113  Ver perfil
153  Guardar cambios
```

### Activacion / inactivacion de cliente

UI:

```txt
Inactivar / Activar
```

Funcion:

```txt
toggleManagedClientStatus(client.id)
```

Flujo:

```txt
UI -> toggleManagedClientStatus()
-> AppContext.setAdminState()
-> localStorage['studio-flow-admin-state']
-> FIN
```

Supabase:

```txt
No
```

Tablas que deberian usarse:

```txt
clients.status
profiles.status
audit_events
```

Estado:

```txt
SOLO DEMO
```

### Edicion de cliente

Campos:

```txt
Nombre
Correo
Telefono
Segmento
Notas
```

Funcion:

```txt
saveClientProfile()
```

Flujo:

```txt
UI -> saveClientProfile()
-> updateManagedClientProfile()
-> setAdminState()
-> localStorage
-> FIN
```

Supabase:

```txt
No
```

Tablas que deberian usarse:

```txt
clients
profiles
client_profiles
client_notes / customer_notes futura si se quiere historial admin
loyalty_accounts para segmento real si aplica
```

Estado:

```txt
SOLO DEMO
```

### Historial cliente

UI:

```txt
Ver historial
```

Funcion:

```txt
setHistoryClient(client)
```

Fuente:

```txt
client.history creado desde clientHistory mock en createInitialAdminState()
```

Flujo:

```txt
UI -> setHistoryClient()
-> render modal/card
-> FIN
```

Tablas que deberian usarse:

```txt
appointments
service_offerings
artists
studios
appointment_status_events
loyalty_transactions
```

Estado:

```txt
SOLO DEMO
```

### Nueva clienta

UI:

```txt
Button "Nueva clienta"
```

Funcion:

```txt
Ninguna
```

Estado:

```txt
SIN IMPLEMENTAR
```

## ADMIN STUDIOS / MI ESTUDIO

Archivo:

```txt
src/pages/admin/AdminStudioProfile.jsx
```

Componentes usados:

```txt
Card
PanelHeader
Input
Button
```

Fuentes:

```txt
adminState.studios
session.user
local useState profileDraft
local useState locationDraft
```

Lineas clave:

```txt
12   AdminStudioProfile()
13   useApp(): adminState, session, updateManagedStudioProfile
26   profileDraft = useState(currentStudio.profile)
27   locationDraft = useState(currentStudio.professionalLocation)
74   handleLogoChange()
81   handleGalleryChange()
109  saveStudioProfile()
130  updateManagedStudioProfile()
309  Guardar estudio
```

### Guardar estudio

Campos:

```txt
Nombre comercial
Descripcion
Telefono
Correo electronico
Horarios
Logo
Direccion
Ciudad
Estado
Codigo Postal
Latitude
Longitude
Referencias
Fotos del Estudio
```

Funcion:

```txt
saveStudioProfile()
```

Flujo:

```txt
UI -> saveStudioProfile()
-> updateManagedStudioProfile()
-> AppContext.setAdminState()
-> localStorage['studio-flow-admin-state']
-> FIN
```

Supabase:

```txt
No
```

Tablas que deberian usarse:

```txt
studios
studio_profiles
marketplace_profiles
marketplace_listings
storage bucket para logo/gallery
```

Estado:

```txt
SOLO DEMO
```

Nota:

Logo y gallery son data URLs en memoria/localStorage. No hay upload a Supabase Storage.

## ADMIN SERVICES

Pantalla dedicada:

```txt
No existe en rutas Admin.
```

Estado actual:

```txt
SIN IMPLEMENTAR
```

Lo que si existe:

```txt
ArtistServices.jsx
artistServiceService.js
service_categories
service_tiers
service_offerings
```

Pero esto pertenece al rol artista, no al modulo Admin.

Funciones esperadas:

```txt
catalogo global
categorias
tiers
moderacion de servicios
plantillas de servicio
```

Tablas que deberian usarse:

```txt
service_categories
service_tiers
service_offerings
```

Estado:

```txt
SIN IMPLEMENTAR
```

## ADMIN MARKETPLACE

Pantalla dedicada:

```txt
No existe.
```

Funciones esperadas:

```txt
moderacion
visibilidad
aprobacion
suspension
curaduria de listings
```

Tablas existentes:

```txt
marketplace_profiles
marketplace_listings
studios
artists
artist_profiles
studio_profiles
governance_reviews
```

Uso actual en Admin:

```txt
Ninguno
```

Estado:

```txt
SIN IMPLEMENTAR
```

## ADMIN APPOINTMENTS

Pantalla dedicada:

```txt
No existe.
```

Vista parcial:

```txt
AdminDashboard muestra "Agenda global estudio" para algunos roles.
QASandbox muestra slots/reservas mock.
```

Fuente actual:

```txt
artistAppointments mock
executiveRiskEvents hardcoded
agendaSettings local
```

Acciones:

```txt
No hay cancelacion real.
No hay reasignacion real.
No hay edicion real.
```

Tablas que deberian usarse:

```txt
appointments
appointment_status_events
availability_slots
schedules
service_offerings
clients
artists
studios
```

Estado:

```txt
SOLO DEMO / SIN IMPLEMENTAR para acciones
```

## ADMIN SETTINGS / SYSTEM

Pantalla:

```txt
src/pages/admin/QASandbox.jsx
```

o inconsistente en `AppRouter.jsx`, donde `paths.adminSystem` apunta a `AdminDashboard`.

Fuente:

```txt
agendaSettings local
adminState local
session local/demo helpers
```

Acciones visibles:

```txt
Resetear reservas
Liberar agenda
Bloquear todos los martes
Simular artista inactivo
Activar artista
Agregar reserva mock
Limpiar fechas bloqueadas
Quick navigate roles
```

Flujos:

```txt
UI -> resetBookedSlots() -> setAgendaSettings() -> localStorage artist/agenda state -> FIN
UI -> releaseAgenda() -> setAgendaSettings() -> FIN
UI -> blockTuesdays() -> setAgendaSettings() -> FIN
UI -> setPrimaryArtistStatus() -> setAdminState() -> localStorage -> FIN
UI -> addMockBooking() -> setAgendaSettings() -> localStorage -> FIN
UI -> clearBlockedDates() -> setAgendaSettings() -> FIN
UI -> quickNavigate() -> login(role) demo/local -> navigate -> FIN
```

Supabase:

```txt
No
```

Tablas que deberian usarse si esto fuera Settings real:

```txt
platform_settings futura
feature_flags futura
schedules
availability_exceptions
availability_slots
appointments
audit_events
```

Estado:

```txt
SOLO DEMO
```

## Tablas Supabase disponibles pero no usadas por Admin

El schema ya tiene varias tablas relevantes:

```txt
studios
studio_profiles
governance_reviews
artists
artist_profiles
artist_studio_memberships
clients
client_profiles
service_categories
service_tiers
service_offerings
schedules
availability_slots
appointments
appointment_status_events
marketplace_profiles
marketplace_listings
loyalty_accounts
loyalty_transactions
```

Pero el modulo Admin no tiene servicios conectados para leer/escribir esas tablas.

## Matriz final

| Modulo | Funcion | Persistencia | Tabla | Estado |
|---|---|---|---|---|
| Admin Dashboard | KPIs revenue/risk/ocupacion | mock/hardcoded/useState | ninguna | SOLO DEMO |
| Admin Dashboard | Flow Points summary | mock clients + reglas locales | ninguna | SOLO DEMO |
| Admin Dashboard | Aprobar estudio | useState `reviewStudios` | deberia `studios`, `governance_reviews` | SIN IMPLEMENTAR |
| Admin Dashboard | Suspender estudio | useState `reviewStudios` | deberia `studios`, `governance_reviews` | SIN IMPLEMENTAR |
| Admin Dashboard | Solicitar cambios | useState `reviewStudios` | deberia `governance_reviews` | SIN IMPLEMENTAR |
| Admin Artists | Listar artistas | `adminState` mock/localStorage | deberia `artists`, `artist_profiles` | SOLO DEMO |
| Admin Artists | Activar/Inactivar | `setAdminState` + localStorage | deberia `artists.status` | SOLO DEMO |
| Admin Artists | Editar perfil | `setAdminState` + localStorage | deberia `artists`, `artist_profiles`, `studio_profiles` | SOLO DEMO |
| Admin Artists | Nueva artista | sin handler | deberia `artists`, `profiles`, invitaciones | SIN IMPLEMENTAR |
| Admin Artists | Aprobar/Rechazar artista | no existe UI | deberia `artist_claim_reviews`, `artists` | SIN IMPLEMENTAR |
| Admin Clients | Listar clientes | `adminState` mock/localStorage | deberia `clients`, `client_profiles` | SOLO DEMO |
| Admin Clients | Activar/Inactivar | `setAdminState` + localStorage | deberia `clients.status` | SOLO DEMO |
| Admin Clients | Editar perfil | `setAdminState` + localStorage | deberia `clients`, `profiles`, `client_profiles` | SOLO DEMO |
| Admin Clients | Ver historial | mock `client.history` | deberia `appointments`, `services`, `loyalty` | SOLO DEMO |
| Admin Clients | Nueva clienta | sin handler | deberia `auth/users`, `profiles`, `clients` | SIN IMPLEMENTAR |
| Admin Studio | Editar estudio | `setAdminState` + localStorage | deberia `studios`, `studio_profiles` | SOLO DEMO |
| Admin Studio | Logo/gallery | data URL local/localStorage | deberia Supabase Storage + `studio_profiles` | SOLO DEMO |
| Admin Services | Catalogo global | pantalla inexistente | `service_categories`, `service_tiers` | SIN IMPLEMENTAR |
| Admin Services | Categorias | pantalla inexistente | `service_categories` | SIN IMPLEMENTAR |
| Admin Marketplace | Moderacion | pantalla inexistente | `marketplace_profiles`, `marketplace_listings` | SIN IMPLEMENTAR |
| Admin Marketplace | Visibilidad/aprobacion | pantalla inexistente | `marketplace_profiles.visibility_status` | SIN IMPLEMENTAR |
| Admin Appointments | Listado global | parcial mock dashboard | `appointments` | SOLO DEMO |
| Admin Appointments | Cancelaciones | no existe accion | `appointments`, `appointment_status_events` | SIN IMPLEMENTAR |
| Admin Appointments | Reasignaciones | no existe accion | `appointments`, `availability_slots` | SIN IMPLEMENTAR |
| Admin Settings/System | Config global | QA sandbox local | futura `platform_settings` | SOLO DEMO |

## Porcentaje estimado de avance real

### UI / prototipo

```txt
70%
```

Hay pantallas visuales para dashboard, artistas, clientes, estudio y QA/system.

### Persistencia real Supabase Admin

```txt
5%
```

Razon:

- Auth/roles existen fuera del modulo Admin.
- Servicios de artista existen en Supabase, pero no como Admin global.
- Admin CRUD sigue sin service layer ni escritura a Supabase.

### Avance funcional end-to-end Admin

```txt
10%
```

El panel permite simular operaciones y persistirlas en `localStorage`, pero no cumple todavia con:

- supervivencia entre dispositivos.
- persistencia Cloud.
- auditoria de acciones.
- aprobaciones reales.
- gestion real de clientes/artistas/estudios.
- appointments reales.
- marketplace moderation.
- settings globales.

## Veredicto final

Estado general:

```txt
SOLO DEMO con integraciones Supabase parciales fuera de Admin.
```

La prioridad recomendada para migrar Admin sin duplicar trabajo:

1. Crear service layer Admin para `studios`, `studio_profiles`, `artists`, `clients`.
2. Migrar `AdminArtists` y `AdminClients` a lecturas reales.
3. Migrar acciones de status con audit trail.
4. Migrar `AdminStudioProfile`.
5. Crear Admin Services global sobre `service_categories`/`service_tiers`.
6. Crear Admin Marketplace sobre `marketplace_profiles`/`marketplace_listings`.
7. Crear Admin Appointments sobre `appointments`/`appointment_status_events`.
8. Reemplazar KPIs del dashboard por vistas/RPCs/read models.
