# FASE 17.8 - GOVERNANCE WRITE PATH DESIGN

## Objetivo

Disenar el flujo completo de Governance para que Platform Owner pueda convertir un studio/artista en una entidad publicable del Marketplace.

Este documento no implementa codigo, no crea SQL/RPC y no modifica UI. Solo diseno tecnico.

## Veredicto ejecutivo

El camino correcto no es aprobar directamente un artista. El modelo actual separa:

```text
artists.status
studios.studio_status
marketplace_profiles.visibility_status
marketplace_listings.visibility_status
```

Por tanto, el flujo real debe ser:

```text
Studio Pending
  -> Owner Review
  -> Approve / Reject / Suspend
  -> governance_reviews
  -> studios.studio_status
  -> marketplace_profile/profile visibility
  -> marketplace_listing/listing visibility
  -> Marketplace Read
```

Para Dennis Beauty Studio, la salida de este flujo deberia ser:

```text
studios.studio_status = approved
marketplace_profiles.visibility_status = visible
marketplace_listings.visibility_status = visible
```

siempre que existan servicios activos y datos publicos suficientes.

## 1. Estados oficiales

### Studio

Fuente existente:

```text
studios.studio_status
```

Estados oficiales:

| Estado | Significado | Acceso operativo | Marketplace |
|---|---|---|---|
| `pending` | Studio en revision inicial o cambios pendientes. | Puede preparar perfil, servicios y agenda. | No publicable. |
| `approved` | Studio validado por Platform Owner. | Acceso completo a funciones protegidas. | Elegible para publicacion. |
| `suspended` | Studio pausado por riesgo, incumplimiento o decision operativa. | Bloquea funciones publicas/economy. | No visible. |
| `rejected` | Studio no aprobado para operar en la plataforma. | Bloqueado salvo edicion/correccion si producto lo permite. | No visible. |
| `archived` | Studio retirado historicamente. | No operativo. | No visible. |

### Governance review

Fuente existente:

```text
governance_reviews.status
```

Estados:

| Estado | Uso |
|---|---|
| `open` | Revision pendiente. |
| `approved` | Decision positiva. |
| `changes_requested` | Requiere cambios antes de aprobar. |
| `suspended` | Decision de suspension. |
| `rejected` | Decision negativa. |
| `resolved` | Cierre administrativo de una revision. |

### Marketplace profile

Fuente existente:

```text
marketplace_profiles.visibility_status
```

Estados:

| Estado | Uso |
|---|---|
| `draft` | Perfil creado pero no visible. |
| `visible` | Perfil publico disponible para listings. |
| `hidden` | Perfil oculto sin suspension. |
| `suspended` | Perfil bloqueado por governance/riesgo. |

### Marketplace listing

Fuente existente:

```text
marketplace_listings.visibility_status
```

Estados:

| Estado | Uso |
|---|---|
| `visible` | Listing aparece en Marketplace si cumple filtros. |
| `hidden` | Listing despublicado manualmente. |
| `expired` | Listing vencido o retirado por tiempo. |

## 2. Flujo objetivo

### Flujo principal

```text
Studio Pending
  -> Platform Owner abre Governance Review
  -> Revisa datos:
       studio profile
       artist profile
       services active
       location/contact
       risk flags
  -> Toma decision:
       approve
       reject
       suspend
       request changes
  -> RPC transaccional
  -> governance_reviews
  -> studios.studio_status
  -> audit_events
  -> marketplace publication policy
  -> refresh admin + marketplace
```

### Approve

```text
approve studio
  -> governance_reviews.status = approved
  -> studios.studio_status = approved
  -> studios.approved_at = now()
  -> marketplace_profile visible or draft
  -> marketplace_listing visible if auto-publish enabled
```

### Reject

```text
reject studio
  -> governance_reviews.status = rejected
  -> studios.studio_status = rejected
  -> marketplace_profile hidden/suspended
  -> marketplace_listing hidden/expired
```

### Suspend

```text
suspend studio
  -> governance_reviews.status = suspended
  -> studios.studio_status = suspended
  -> studios.suspended_at = now()
  -> marketplace_profile suspended
  -> marketplace_listing hidden or expired
```

### Request changes

```text
request changes
  -> governance_reviews.status = changes_requested
  -> studios.studio_status = pending
  -> marketplace_profile draft/hidden
  -> marketplace_listing hidden
```

## 3. RPC

### RPC principal recomendada

```text
studio_flow_admin_review_studio(
  p_studio_id uuid,
  p_decision text,
  p_reason text default null,
  p_decision_notes text default null,
  p_publish_marketplace boolean default false
)
returns jsonb
```

Valores permitidos para `p_decision`:

```text
approve
reject
suspend
request_changes
```

Responsabilidades:

1. Validar `auth.uid()`.
2. Validar que el actor sea `platform_owner`.
3. Bloquear el studio `for update`.
4. Crear o cerrar `governance_reviews`.
5. Actualizar `studios.studio_status`.
6. Setear timestamps:
   - `approved_at`
   - `suspended_at`
   - `archived_at` si aplica en otra fase
7. Registrar `audit_events`.
8. Aplicar politica de Marketplace.
9. Devolver payload actualizado para Admin Dashboard.

### RPC secundaria opcional: publicacion manual

```text
studio_flow_admin_publish_marketplace_profile(
  p_target_type text,
  p_artist_id uuid default null,
  p_studio_id uuid default null,
  p_membership_id uuid default null,
  p_title text default null,
  p_summary text default null
)
returns jsonb
```

Uso:

- Publicar manualmente despues de aprobar.
- Crear o actualizar `marketplace_profiles`.
- Crear o actualizar `marketplace_listings`.

### RPC secundaria opcional: despublicacion

```text
studio_flow_admin_unpublish_marketplace_profile(
  p_marketplace_profile_id uuid,
  p_reason text default null
)
returns jsonb
```

Uso:

- Ocultar profile/listings sin suspender todo el studio.

### RPC de lectura governance

```text
studio_flow_admin_get_governance_queue()
returns jsonb
```

Debe devolver:

- studios pending/suspended/rejected
- latest governance review
- artist/profile resumen
- service readiness
- marketplace publication status
- risk flags si existen

## 4. Supabase

### Tablas existentes usadas

| Necesidad | Tabla |
|---|---|
| Estado operativo del studio | `studios` |
| Historial de revision | `governance_reviews` |
| Entidad artista | `artists` |
| Perfil artista | `artist_profiles` |
| Relacion artista-studio | `artist_studio_memberships` |
| Perfil studio | `studio_profiles` |
| Servicios reales | `service_offerings` |
| Perfil publico marketplace | `marketplace_profiles` |
| Listing marketplace | `marketplace_listings` |
| Auditoria | `audit_events` |

### Escrituras por decision

| Decision | `studios` | `governance_reviews` | Marketplace |
|---|---|---|---|
| approve | `studio_status = approved`, `approved_at = now()` | `status = approved`, `resolved_at = now()` | Auto/manual publish. |
| reject | `studio_status = rejected` | `status = rejected`, `resolved_at = now()` | Hide/suspend profile/listings. |
| suspend | `studio_status = suspended`, `suspended_at = now()` | `status = suspended`, `resolved_at = now()` | Suspend/hide profile/listings. |
| request changes | `studio_status = pending` | `status = changes_requested`, `resolved_at = now()` | Keep draft/hidden. |

### Marketplace publication eligibility

Para publicar automaticamente:

```text
studio_status = approved
artist.status = active
artist profile exists
studio profile exists if studio listing
service_offerings active count > 0
target has title/name
```

Si falta algo, la RPC debe aprobar el studio pero devolver:

```text
marketplacePublication.status = blocked
marketplacePublication.missing = [...]
```

## 5. Publicacion Marketplace

### Opcion A: publicacion automatica

Cuando Platform Owner aprueba con `p_publish_marketplace = true`:

```text
approve studio
  -> create/update marketplace_profile
  -> visibility_status = visible
  -> published_at = now()
  -> create/update marketplace_listing
  -> visibility_status = visible
```

Ventajas:

- Menos pasos operativos.
- Dennis aparece inmediatamente si cumple requisitos.

Riesgos:

- Puede publicar perfiles incompletos.
- Requiere validaciones estrictas en backend.

### Opcion B: publicacion manual

Cuando Platform Owner aprueba:

```text
approve studio
  -> studio approved
  -> marketplace profile queda draft
  -> Platform Owner pulsa Publicar
```

Ventajas:

- Mejor control editorial.
- Permite revisar copy/fotos/servicios antes de publicar.

Riesgos:

- Mas friccion.
- Dennis puede quedar approved pero no visible si no se publica.

### Recomendacion

Implementar ambos caminos:

| Modo | Uso |
|---|---|
| Manual por defecto | Seguro para calidad editorial. |
| Auto-publicar con toggle | Rapido para studios completos y validados. |

UI:

```text
[Aprobar]
[Aprobar y publicar]
[Solicitar cambios]
[Rechazar]
[Suspender]
```

## 6. Service Layer

Crear:

```text
src/services/governanceService.js
```

Funciones:

```text
fetchGovernanceQueue()
reviewStudio({ studioId, decision, reason, decisionNotes, publishMarketplace })
publishMarketplaceProfile({ targetType, artistId, studioId, membershipId, title, summary })
unpublishMarketplaceProfile({ marketplaceProfileId, reason })
```

Responsabilidades:

- Llamar RPCs.
- Normalizar payload a camelCase.
- No mutar estado local directamente.
- Exponer errores legibles para Platform Owner.

No debe:

- calcular permisos en frontend.
- insertar directo en tablas.
- decidir eligibility sin backend.

## 7. AppContext

Agregar dominio separado:

```text
governanceState = {
  queue: [],
  loaded: false,
  lastDecision: null
}
```

Loaders/actions:

```text
loadGovernanceQueue()
reviewStudioGovernance()
publishMarketplaceProfile()
unpublishMarketplaceProfile()
```

Reglas:

- Solo ejecutar en sesiones reales.
- Solo `platform_owner` para decisiones globales.
- No mezclar con `adminState` como fuente unica.
- Tras una decision, refrescar:
  - `governanceState`
  - `adminState.dashboard`
  - `adminState.artists`
  - `marketplaceState` si el usuario actual es client o se quiere invalidar cache global

### Relacion con AppContext actual

Hoy `AdminDashboard.updateReviewStatus()` muta estado local:

```text
setReviewStudios(...)
```

Debe reemplazarse por:

```text
reviewStudioGovernance(...)
```

## 8. Frontend Platform Owner

### Governance Queue

Reemplazar panel local:

```text
Estudios pendientes de validacion
```

por una cola real:

```text
Governance Queue
  -> Pendientes
  -> Cambios solicitados
  -> Suspendidos
  -> Rechazados
  -> Publicacion marketplace
```

Cada item debe mostrar:

- studio name
- studio status
- artist name
- owner/profile
- service active count
- marketplace profile status
- listing status
- latest review
- created_at
- risk flags si existen

### Acciones por item

| Boton | RPC |
|---|---|
| Aprobar | `reviewStudio(decision='approve')` |
| Aprobar y publicar | `reviewStudio(decision='approve', publishMarketplace=true)` |
| Solicitar cambios | `reviewStudio(decision='request_changes')` |
| Rechazar | `reviewStudio(decision='reject')` |
| Suspender | `reviewStudio(decision='suspend')` |
| Publicar Marketplace | `publishMarketplaceProfile()` |
| Ocultar Marketplace | `unpublishMarketplaceProfile()` |

### Modal de decision

Antes de ejecutar decision, pedir:

- motivo
- notas internas
- toggle publicar Marketplace
- confirmacion de impacto

No debe ser un click silencioso.

## 9. Auditoria

### `governance_reviews`

Cada decision debe guardar:

| Campo | Valor |
|---|---|
| `studio_id` | Studio revisado. |
| `review_type` | `onboarding`, `status_change`, `risk`, `appeal`. |
| `status` | Decision final. |
| `reason` | Motivo corto. |
| `decision_notes` | Detalle interno. |
| `reviewed_by_profile_id` | `auth.uid()`. |
| `resolved_at` | `now()` para decisiones finales. |

### `audit_events`

Evento recomendado:

```text
studio_governance_reviewed
```

Metadata:

```json
{
  "decision": "approve",
  "reason": "profile_complete",
  "publishMarketplace": true,
  "marketplaceProfileId": "uuid",
  "marketplaceListingId": "uuid"
}
```

Eventos adicionales:

```text
marketplace_profile_published
marketplace_profile_hidden
studio_suspended
studio_rejected
studio_changes_requested
```

## 10. Payloads sugeridos

### Review studio

```json
{
  "studioId": "uuid",
  "decision": "approve",
  "reason": "profile_complete",
  "decisionNotes": "Perfil, ubicacion y servicios verificados.",
  "publishMarketplace": true
}
```

### Response

```json
{
  "studio": {
    "id": "uuid",
    "studioStatus": "approved",
    "approvedAt": "timestamptz"
  },
  "governanceReview": {
    "id": "uuid",
    "status": "approved",
    "reviewedByProfileId": "uuid",
    "resolvedAt": "timestamptz"
  },
  "marketplacePublication": {
    "status": "published",
    "profileId": "uuid",
    "listingId": "uuid",
    "missing": []
  }
}
```

## 11. Plan por fases

### Fase A: Governance Write Core

Crear RPC:

```text
studio_flow_admin_review_studio
```

Conectar:

- `governanceService.reviewStudio`
- `AppContext.reviewStudioGovernance`
- botones Platform Owner

Resultado:

```text
studios.studio_status deja de ser local
governance_reviews registra decisiones
```

### Fase B: Marketplace Publish Core

Crear RPC:

```text
studio_flow_admin_publish_marketplace_profile
```

Conectar:

- publish manual
- visibility status
- create/update profile/listing

Resultado:

```text
Marketplace Read puede encontrar listings reales
```

### Fase C: Approve and Publish

Extender:

```text
studio_flow_admin_review_studio(... publishMarketplace=true)
```

Resultado:

```text
Platform Owner puede aprobar y publicar en una sola decision
```

### Fase D: Queue & History

Crear lectura:

```text
studio_flow_admin_get_governance_queue
```

UI:

- historial de decisiones
- filtros por estado
- ultima decision
- publication readiness

## 12. Reglas de seguridad

1. Solo `platform_owner` puede aprobar/rechazar/suspender globalmente.
2. Studio Owner no puede aprobar su propio studio.
3. Ninguna decision debe escribirse directo desde frontend.
4. Toda decision debe registrar `governance_reviews`.
5. Toda decision debe registrar `audit_events`.
6. Marketplace no debe publicar profiles de studios `pending`, `rejected` o `suspended`.
7. Publicar Marketplace debe exigir servicios activos.
8. Suspender studio debe ocultar/suspender listings relacionados.
9. Rechazar studio debe ocultar listings relacionados.
10. Request changes debe mantener marketplace oculto.

## 13. Estado Dennis esperado

### Antes

```text
studios.studio_status = pending
marketplace_listings = 0
Marketplace = No hay perfiles publicados
Artist = En validacion
```

### Despues de Approve

```text
studios.studio_status = approved
governance_reviews.status = approved
Artist ya no ve banner de validacion
```

### Despues de Publish

```text
marketplace_profiles.visibility_status = visible
marketplace_listings.visibility_status = visible
Marketplace muestra Dennis
```

## Veredicto

El flujo correcto para desbloquear Dennis no es cambiar `artists.status`, porque ya esta activo.

El bloqueo real es:

```text
studio governance pending
marketplace publication missing
```

La arquitectura recomendada es separar:

```text
Governance decision
Marketplace publication
Marketplace read
```

con una integracion opcional:

```text
Aprobar y publicar
```

Esto convierte Platform Owner en la fuente real de decision, deja historial auditable y permite que Marketplace solo lea perfiles/listings verdaderamente publicados.
