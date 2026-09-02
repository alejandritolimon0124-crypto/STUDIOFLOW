# FASE 17.8 - GOVERNANCE WRITE CORE IMPLEMENTATION

## Objetivo

Implementar el primer write path real de Governance para que Platform Owner pueda:

- Approve Studio.
- Reject Studio.
- Suspend Studio.
- Request Changes.

Alcance aplicado:

- `governance_reviews`
- `studios.studio_status`
- `audit_events`

No implementado:

- Marketplace Publish.
- Booking.
- Availability.
- Cobranza.
- Comisiones.

## Auditoria previa de esquema

### `studios`

Fuente:

`supabase/migrations/202606100002_milestone_02_studios_artists.sql`

Columnas usadas:

| Columna | Tipo/uso |
|---|---|
| `id` | PK studio. |
| `name` | Nombre base. |
| `studio_status` | Enum `pending`, `approved`, `suspended`, `rejected`, `archived`. |
| `risk_score` | Riesgo opcional. |
| `approved_at` | Timestamp disponible. |
| `suspended_at` | Timestamp disponible. |
| `archived_at` | Timestamp disponible. |
| `updated_at` | Timestamp disponible. |

### `governance_reviews`

Fuente:

`supabase/migrations/202606100002_milestone_02_studios_artists.sql`

Columnas usadas:

| Columna | Tipo/uso |
|---|---|
| `id` | PK review. |
| `studio_id` | FK a `studios`. |
| `review_type` | Enum `onboarding`, `status_change`, `risk`, `appeal`. |
| `status` | Enum `open`, `approved`, `changes_requested`, `suspended`, `rejected`, `resolved`. |
| `reason` | Motivo corto. |
| `decision_notes` | Notas internas. |
| `reviewed_by_profile_id` | Platform Owner que decide. |
| `created_at` | Timestamp default. |
| `resolved_at` | Obligatorio para estados finales segun constraint. |

No existe `updated_at`, asi que la RPC actualiza/crea reviews usando `resolved_at`.

### `audit_events`

Fuente:

`supabase/migrations/202606100010_milestone_10_trust.sql`

Columnas usadas:

| Columna | Uso |
|---|---|
| `actor_profile_id` | `auth.uid()` del Platform Owner. |
| `context` | `studio`. |
| `entity_type` | `governance_review`. |
| `entity_id` | `governance_reviews.id`. |
| `studio_id` | Studio revisado. |
| `event_type` | `studio_governance_reviewed`. |
| `before_data` | Studio antes. |
| `after_data` | Studio despues. |
| `metadata` | Decision, motivo y notas. |

La constraint de `audit_events_entity_type_check` ya permite `governance_review`.

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `supabase/migrations/202606110012_governance_write_core.sql` | Nueva migracion SQL con helpers, queue y RPC de decision. |
| `src/services/governanceService.js` | Nuevo service layer de Governance. |
| `src/contexts/AppContext.jsx` | Agrega `governanceState`, loaders/actions y refresh post decision. |
| `src/pages/admin/AdminDashboard.jsx` | Botones de governance ahora llaman write path real. |

## Migracion SQL

Archivo:

`supabase/migrations/202606110012_governance_write_core.sql`

Funciones creadas:

| RPC | Uso |
|---|---|
| `studio_flow_admin_assert_platform_owner()` | Valida `auth.uid()`, perfil activo y rol `platform_owner`. |
| `studio_flow_admin_governance_payload(p_studio_id uuid default null)` | Normaliza payload de governance queue. |
| `studio_flow_admin_get_governance_queue()` | Lectura real de queue para Platform Owner. |
| `studio_flow_admin_review_studio(...)` | Write path real de approve/reject/suspend/request changes. |

RPC principal:

```text
studio_flow_admin_review_studio(
  p_studio_id uuid,
  p_decision text,
  p_reason text default null,
  p_decision_notes text default null
)
```

Decisiones permitidas:

| Decision | `studios.studio_status` | `governance_reviews.status` |
|---|---|---|
| `approve` | `approved` | `approved` |
| `reject` | `rejected` | `rejected` |
| `suspend` | `suspended` | `suspended` |
| `request_changes` | `pending` | `changes_requested` |

La RPC:

- valida `platform_owner`;
- bloquea studio con `for update`;
- actualiza o crea `governance_reviews`;
- actualiza `studios.studio_status`;
- setea `approved_at` o `suspended_at` cuando aplica;
- registra `audit_events`;
- devuelve studio, review y queue parcial actualizada.

## Service Layer

Archivo:

`src/services/governanceService.js`

Funciones:

```text
fetchGovernanceQueue()
reviewStudio({ studioId, decision, reason, decisionNotes })
```

Responsabilidades:

- Llamar RPCs.
- Normalizar payload a camelCase.
- Validar `studioId` y `decision` antes de RPC.
- No escribir tablas directo desde frontend.

## AppContext

Archivo:

`src/contexts/AppContext.jsx`

Agregado:

```text
governanceState = {
  queue: [],
  loaded: false,
  lastDecision: null
}
```

Estados auxiliares:

```text
isGovernanceLoading
governanceError
```

Acciones:

```text
loadGovernanceQueue()
reviewStudioGovernance()
```

Reglas:

- Solo corre en sesiones reales.
- `reviewStudioGovernance()` solo permite `session.role === platform_owner`.
- Tras una decision refresca:
  - `loadAdminDashboard()`
  - `loadAdminArtists()`
  - `loadGovernanceQueue()`

## Frontend

Archivo:

`src/pages/admin/AdminDashboard.jsx`

Antes:

```text
updateReviewStatus()
  -> setReviewStudios()
  -> solo estado local
```

Ahora:

```text
updateReviewStatus()
  -> reviewStudioGovernance()
  -> studio_flow_admin_review_studio()
  -> Supabase
  -> refresh dashboard/artists/queue
```

Botones conectados:

| Boton | Decision |
|---|---|
| Aprobar | `approve` |
| Solicitar cambios | `request_changes` |
| Rechazar | `reject` |
| Suspender | `suspend` |

Se agrego visualizacion de `governanceError` en el panel.

## Validacion

Ejecutado:

```text
npm run build
```

Resultado:

- Build correcto.
- Vite compilo 139 modulos.
- PWA genero assets.
- Se mantiene advertencia existente de chunk mayor a 500 kB.

## Validacion funcional esperada

Caso Dennis:

Antes:

```text
studios.studio_status = pending
ArtistLayout muestra En validacion
Marketplace sigue sin listing publicado
```

Al aprobar desde Platform Owner:

```text
studio_flow_admin_review_studio(... p_decision = 'approve')
  -> studios.studio_status = approved
  -> studios.approved_at = now()
  -> governance_reviews.status = approved
  -> audit_events.event_type = studio_governance_reviewed
```

Resultado esperado:

```text
Dennis ya no debe ver En validacion
Marketplace puede seguir mostrando No hay perfiles publicados
```

porque Marketplace Publish no fue implementado en esta fase.

## Riesgos encontrados

| Riesgo | Estado |
|---|---|
| `governance_reviews` no tiene `updated_at` | Adaptado usando `resolved_at`. |
| Platform Owner UI todavia vive dentro de AdminDashboard | Conectado, pero governance merece modulo propio futuro. |
| No hay modal de motivo/notas | Se envia motivo automatico desde boton; modal queda para UX futura. |
| No se valida readiness de servicios/profile para approve | Fuera de alcance; solo Governance Write Core. |
| SQL no publica Marketplace | Intencional por alcance. |

## No implementado

- No se crean `marketplace_profiles`.
- No se crean `marketplace_listings`.
- No se cambia visibility de Marketplace.
- No se toca `bookSlot`.
- No se toca availability.
- No se toca economy/commission.

## Veredicto

Governance Write Core quedo conectado.

Platform Owner ya no depende de una mutacion local para aprobar, rechazar, suspender o solicitar cambios sobre studios. Las decisiones ahora pasan por RPC real, actualizan `studios.studio_status`, registran `governance_reviews` y escriben `audit_events`.
