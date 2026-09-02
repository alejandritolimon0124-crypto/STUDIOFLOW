# FASE 15.2 - SECURITY FOUNDATION IMPLEMENTATION PLAN

## Objetivo

Disenar el plan tecnico para implementar la base de seguridad de Studio Flow sobre Supabase, usando como fuente principal `AUTHORIZATION_ARCHITECTURE.md`.

Este documento no crea politicas, no crea SQL y no implementa cambios. Define estrategia, secuencia, riesgos y matriz esperada por tabla.

## Principios base

1. RLS debe negar acceso por defecto a tablas privadas.
2. Las lecturas simples propias o scoped pueden resolverse con RLS.
3. Las escrituras sensibles, operaciones administrativas, cambios de estado y flujos multi-tabla deben pasar por RPC `SECURITY DEFINER`.
4. El frontend no debe ser fuente de autorizacion.
5. Los datos publicos deben salir de RPCs/vistas publicas filtradas, no de tablas privadas completas.
6. No debe existir `DELETE` fisico desde la app; usar estados, `archived_at`, `revoked_at`, `suspended_at` o equivalentes.
7. Todo RPC sensible debe validar usuario autenticado, perfil activo, rol activo, scope y estado del recurso.

## Estrategia RLS completa

La estrategia RLS se divide en cuatro grupos:

| Grupo | Tablas | Estrategia |
|---|---|---|
| Identidad y autoridad | `profiles`, `roles`, `permissions`, `role_permissions`, `user_role_assignments` | Lectura propia/minima. Catalogos solo para contexto autenticado o platform owner. Mutaciones solo RPC. |
| Operacion multi-tenant | `studios`, `studio_profiles`, `artists`, `artist_profiles`, `artist_studio_memberships`, `clients`, `client_profiles` | RLS por ownership, membresia activa, role assignment scoped o relacion cliente-artista/estudio. |
| Dominio operacional | Servicios, agenda, citas, customer 360, loyalty, trust, economy | RLS scoped para lectura directa cuando sea simple. Mutaciones por RPC cuando cambien estado, afecten dinero, agenda, citas, puntos o auditoria. |
| Public marketplace | `marketplace_profiles`, `marketplace_listings`, subset publicado de servicios/slots | Lectura anonima solo de registros publicados/visibles. Datos privados derivados mediante RPC publica filtrada. |

Reglas globales de RLS:

- `anon` no accede a tablas privadas.
- `authenticated` accede solo a filas propias, scoped o publicadas.
- `platform_owner` puede leer globalmente, preferiblemente por RPC admin para mantener auditoria.
- `studio_owner` y `studio_manager` acceden solo a studios asignados o propios.
- `artist` accede a su entidad profesional, perfiles, servicios, agenda, citas y clientes relacionados.
- `client` accede a su identidad, perfil cliente, citas, loyalty y favoritos propios.
- Inserts/updates/deletes directos deben ser excepcion. Si hay duda, RPC.

## Estrategia RPC SECURITY DEFINER

Las RPC `SECURITY DEFINER` deben cubrir:

- Bootstrap de identidad y perfiles.
- Resolucion de contexto de autorizacion.
- Administracion de roles y scopes.
- Administracion de studios, artists, clients y memberships.
- Mutaciones de agenda y servicios cuando impliquen ownership/scopes complejos.
- Booking, cambio de estado de citas y hold de slots.
- Calculo economico, comisiones, loyalty ledger y redemptions.
- Governance, risk, sanctions, no-show y audit trail.
- Endpoints publicos filtrados para marketplace.

Cada RPC sensible debe:

- Fijar `search_path` seguro.
- Validar `auth.uid()`.
- Resolver profile activo.
- Validar rol global o scoped.
- Validar que el recurso target pertenece al scope.
- Bloquear recursos archivados/suspendidos cuando aplique.
- Escribir `audit_events` en operaciones sensibles.
- Devolver payloads estables y minimizados para frontend.

Helpers SQL requeridos por familia:

| Helper conceptual | Uso |
|---|---|
| `current_profile` | Obtener profile activo del usuario actual. |
| `has_role` | Validar rol global o scoped por studio. |
| `has_any_role` | Validar varias capacidades sin duplicar logica. |
| `is_platform_owner` | Bypass administrativo global controlado. |
| `can_access_studio` | Ownership o assignment activo al studio. |
| `can_access_artist` | Artista propio, membresia activa o studio scoped. |
| `can_access_client` | Cliente propio o relacion via cita/customer_relationship. |
| `can_manage_membership` | Owner/platform o manager con permiso explicito. |
| `can_manage_schedule` | Artista propio o studio scoped. |
| `can_read_appointment` | Cliente/artist/studio scoped/platform. |
| `can_mutate_appointment` | Booking/status transitions con reglas de negocio. |
| `can_read_economy` | Owner/platform o actor economico autorizado. |
| `can_manage_marketplace` | Publicacion/moderacion por owner/scoped/platform. |
| `write_audit_event` | Auditoria centralizada desde RPCs. |

## Secuencia de implementacion

1. Inventario y contrato de seguridad:
   - Congelar lista de tablas, relaciones y columnas sensibles.
   - Confirmar flujos frontend que hacen CRUD directo.
   - Definir payloads de RPC antes de activar RLS restrictivo.

2. Helpers de autorizacion:
   - Crear helpers privados para profile, roles, studio scope, artist scope, client scope y audit.
   - Probar helpers con usuarios seed: client, artist, studio_owner, studio_manager, platform_owner.

3. RPCs de compatibilidad:
   - Completar RPCs que reemplazan consultas actuales del frontend.
   - Priorizar `artist_profiles`, `profiles`, `service_offerings`, admin artists/clients y bootstrap.
   - Mantener nombres/payloads estables en service layer.

4. Migracion frontend por capas:
   - Mover servicios frontend de CRUD directo a RPCs.
   - Mantener fallback temporal solo en ambiente dev si se decide habilitar feature flag.
   - No activar RLS fuerte hasta que el servicio correspondiente use RPC o tenga policy probada.

5. Activacion RLS progresiva:
   - Activar primero catalogos y tablas con bajo riesgo.
   - Continuar con identidad y perfiles.
   - Luego servicios/agenda.
   - Despues appointments/customer/economy/loyalty/trust.
   - Marketplace publico al final, con pruebas anonimas explicitas.

6. Observabilidad y auditoria:
   - Agregar eventos de auditoria a RPCs sensibles.
   - Medir errores `permission denied` y payloads vacios inesperados.
   - Crear checklist por pantalla antes de promover a produccion.

7. Limpieza:
   - Retirar permisos directos sobrantes.
   - Eliminar fallbacks de desarrollo.
   - Documentar contratos RPC definitivos.

## Riesgos de migracion

| Riesgo | Impacto | Mitigacion |
|---|---|---|
| Activar RLS antes de migrar frontend | Pantallas vacias o errores de permisos | Primero RPCs, despues policies por tabla. |
| Helpers con recursion sobre tablas protegidas | Policies lentas o fallidas | Helpers `SECURITY DEFINER` privados, consultas minimizadas e indexadas. |
| Diferencia entre `profiles.id` y `auth.uid()` | Usuarios sin bootstrap o acceso roto | Validar FK y bootstrap antes de RLS fuerte. |
| Scopes ambiguos para managers | Acceso excesivo o insuficiente | Definir permisos efectivos por role assignment scoped. |
| Marketplace filtrado incorrectamente | Exposicion de datos privados | Public RPC con allowlist de columnas. |
| Economy/loyalty mutados directo | Inconsistencia financiera | RPC transaccional e idempotency keys. |
| Admin pages dependiendo de tablas completas | Admin deja de funcionar | Reemplazar con RPCs admin antes de bloquear direct select. |
| Falta de audit trail | Cambios sensibles sin trazabilidad | `write_audit_event` obligatorio en RPCs sensibles. |

## Que puede romper Studio Flow actual

Flujos actuales con riesgo alto:

- `artistProfileService.js` consulta y actualiza `artist_profiles` y `profiles` directamente.
- `artistServiceService.js` lee catalogos y hace insert/update sobre `service_offerings` directamente.
- `profileBootstrapService.js` ya usa RPCs, pero depende de que `studio_flow_get_auth_context`, `studio_flow_bootstrap_client` y `studio_flow_bootstrap_artist` sigan devolviendo payload compatible.
- Admin Artists, Admin Clients y Admin Dashboard pueden depender de datasets agregados que no deben resolverse con `select *` directo.
- Cualquier pantalla que espere ver datos mock + Supabase mezclados puede mostrar duplicados o vacios si RLS cambia visibilidad.

Flujos que deben migrarse antes de RLS fuerte:

- Edicion de perfil artista.
- Edicion limitada de `profiles`.
- CRUD de servicios del artista.
- Listados admin de artistas/clientes.
- Gestion de status de artista/cliente.
- Lecturas publicas de marketplace.

## Transicion sin detener desarrollo

1. Trabajar con feature flag de acceso seguro por modulo: `secureProfiles`, `secureServices`, `secureAdmin`, `secureMarketplace`.
2. Mantener service layer como frontera: las paginas no deben saber si consume RPC o tabla directa.
3. Crear RPCs con payload compatible y migrar una pantalla a la vez.
4. Activar RLS por tabla solo cuando:
   - Existe helper probado.
   - Existe RPC o policy correspondiente.
   - La pantalla critica ya usa el nuevo service.
   - Hay prueba manual por cada rol afectado.
5. Mantener datos seed para todos los roles.
6. Hacer despliegues pequenos: auth context, perfiles, servicios, agenda, booking, admin, marketplace.
7. Registrar temporalmente errores Supabase en service layer con contexto de modulo y rol.

## Matriz tecnica por tabla

Leyenda:

- RLS: politica requerida a nivel conceptual.
- Helper: helper SQL conceptual requerido.
- RPC: RPC conceptual requerida. No implica crearla en esta fase.

| Tabla | Politica RLS necesaria | Helper SQL requerido | RPC requerida |
|---|---|---|---|
| `profiles` | No anon. Self read. Self update limitada o bloqueada. Platform/admin via RPC. | `current_profile`, `is_platform_owner`, `can_access_client`, `can_access_artist` | `studio_flow_get_auth_context`, `studio_flow_update_own_profile`, `studio_flow_admin_update_profile_status` |
| `roles` | No anon. Lectura minima authenticated si se requiere contexto. Mutacion bloqueada. | `is_platform_owner` | `studio_flow_admin_list_roles`, `studio_flow_admin_manage_role_catalog` |
| `permissions` | No anon. Lectura de permisos efectivos por RPC, no directa para UI general. | `is_platform_owner`, `has_role` | `studio_flow_get_effective_permissions`, `studio_flow_admin_manage_permission_catalog` |
| `role_permissions` | Sin acceso directo salvo platform owner controlado. Mutacion solo RPC. | `is_platform_owner` | `studio_flow_admin_assign_permission_to_role`, `studio_flow_admin_revoke_permission_from_role` |
| `user_role_assignments` | Self effective read limitada. Studio owner scoped read. No direct write/update/delete. | `current_profile`, `has_role`, `can_access_studio`, `is_platform_owner` | `studio_flow_admin_assign_role`, `studio_flow_admin_revoke_role`, `studio_flow_get_auth_context` |
| `studios` | No anon directo. Read por owner, scoped assignment o platform. Public solo marketplace/RPC. Writes bloqueadas. | `can_access_studio`, `has_role`, `is_platform_owner` | `studio_flow_admin_create_studio`, `studio_flow_admin_update_studio_status`, `studio_flow_admin_update_studio_profile`, `studio_flow_public_get_studio_profile` |
| `studio_profiles` | Read scoped por studio. Public subset solo RPC/view. Writes bloqueadas o RPC. | `can_access_studio`, `can_manage_marketplace` | `studio_flow_admin_save_studio_profile`, `studio_flow_public_get_studio_profile` |
| `governance_reviews` | Platform owner read/write. Studio owner read limitada de su studio si aplica. No anon. | `is_platform_owner`, `can_access_studio` | `studio_flow_admin_review_studio`, `studio_flow_admin_list_governance_reviews` |
| `artists` | Self read por `profile_id`. Scoped read via memberships/studio. Public solo published active RPC. Writes bloqueadas. | `can_access_artist`, `can_access_studio`, `is_platform_owner` | `studio_flow_admin_get_artists`, `studio_flow_admin_update_artist_status`, `studio_flow_claim_artist` |
| `artist_profiles` | Self read/update para artista. Scoped read para studio roles. Public subset solo RPC. | `can_access_artist`, `can_access_studio`, `can_manage_marketplace` | `studio_flow_admin_save_artist_profile`, `studio_flow_artist_save_own_profile`, `studio_flow_public_get_artist_profile` |
| `artist_studio_memberships` | Artist own memberships read. Studio scoped read. No direct write/update/delete. | `can_access_artist`, `can_access_studio`, `can_manage_membership` | `studio_flow_admin_manage_artist_membership`, `studio_flow_artist_accept_membership`, `studio_flow_artist_leave_membership` |
| `artist_claim_invitations` | Invited/creator/scoped admin read only. No anon token table access. Mutations RPC. | `current_profile`, `can_manage_membership`, `is_platform_owner` | `studio_flow_create_artist_claim_invitation`, `studio_flow_accept_artist_claim_invitation`, `studio_flow_revoke_artist_claim_invitation` |
| `artist_claim_reviews` | Requester/scoped admin/platform read. Mutations RPC. | `current_profile`, `can_manage_membership`, `is_platform_owner` | `studio_flow_request_artist_claim_review`, `studio_flow_admin_resolve_artist_claim_review` |
| `clients` | Client self read. Scoped read for artist/studio through appointments or customer relationships. No anon. | `can_access_client`, `can_access_studio`, `can_access_artist` | `studio_flow_admin_get_clients`, `studio_flow_admin_update_client_status`, `studio_flow_bootstrap_client` |
| `client_profiles` | Client self read/update limited. Scoped staff read via RPC preferred. No anon. | `can_access_client`, `can_access_studio` | `studio_flow_admin_save_client_profile`, `studio_flow_client_update_own_profile` |
| `customer_private_notes` | No client access. Scoped artist/studio/platform only. Mutations RPC. | `can_access_client`, `can_access_artist`, `can_access_studio` | `studio_flow_save_customer_private_note`, `studio_flow_archive_customer_private_note` |
| `customer_relationships` | Client self optional read. Artist/studio scoped read. Mutations via appointment/customer RPC. | `can_access_client`, `can_access_artist`, `can_access_studio` | `studio_flow_upsert_customer_relationship`, `studio_flow_admin_get_customer_360` |
| `favorite_artists` | Client self read/write. Artist/studio may see aggregate only, not raw user list unless permitted. | `current_profile`, `can_access_client` | `studio_flow_client_toggle_favorite_artist`, `studio_flow_public_get_artist_favorite_summary` |
| `service_categories` | Public/auth read active catalog. Writes platform RPC only. | `is_platform_owner` | `studio_flow_admin_manage_service_category` |
| `service_tiers` | Public/auth read active catalog. Writes platform RPC only. | `is_platform_owner` | `studio_flow_admin_manage_service_tier` |
| `service_offerings` | Public read only active/published subset. Owner/scoped read full. Direct writes blocked or limited to owner with strict RLS. | `can_access_artist`, `can_access_studio`, `can_manage_marketplace` | `studio_flow_artist_save_service_offering`, `studio_flow_archive_service_offering`, `studio_flow_public_get_service_offerings` |
| `schedules` | Owner/scoped read. No public direct. Writes RPC. | `can_manage_schedule`, `can_access_artist`, `can_access_studio` | `studio_flow_save_schedule`, `studio_flow_archive_schedule` |
| `schedule_rules` | Read through accessible schedule. Writes RPC. | `can_manage_schedule` | `studio_flow_save_schedule_rules` |
| `calendar_blocks` | Read through accessible schedule. Public never. Writes RPC. | `can_manage_schedule` | `studio_flow_save_calendar_block`, `studio_flow_cancel_calendar_block` |
| `availability_slots` | Public read available slots only through public RPC. Client can hold own slot. Artist/studio scoped read full. | `can_manage_schedule`, `can_read_appointment`, `current_profile` | `studio_flow_public_get_availability`, `studio_flow_hold_availability_slot`, `studio_flow_release_availability_slot` |
| `promotions` | Public read active eligible promotions only via RPC. Scoped read/write by owner. | `can_access_artist`, `can_access_studio`, `can_manage_marketplace` | `studio_flow_save_promotion`, `studio_flow_public_get_promotions` |
| `appointments` | Client own read. Artist/studio scoped read. No anon. Mutations RPC. | `can_read_appointment`, `can_mutate_appointment`, `can_access_client` | `studio_flow_book_appointment`, `studio_flow_update_appointment_status`, `studio_flow_admin_get_appointments` |
| `appointment_status_events` | Read if user can read appointment. Insert only through status RPC. | `can_read_appointment`, `can_mutate_appointment` | `studio_flow_update_appointment_status` |
| `appointment_economies` | No client direct. Artist/studio scoped financial read according to role. Platform full. Mutations RPC only. | `can_read_economy`, `is_platform_owner` | `studio_flow_calculate_appointment_economy`, `studio_flow_admin_adjust_appointment_economy` |
| `commissions` | Platform/studio owner scoped read. No client/artist direct unless explicitly allowed. Mutations RPC only. | `can_read_economy`, `is_platform_owner` | `studio_flow_admin_settle_commission`, `studio_flow_admin_adjust_commission` |
| `marketplace_profiles` | Public read only published/visible. Owner/scoped read full. Writes RPC. | `can_manage_marketplace`, `can_access_artist`, `can_access_studio` | `studio_flow_publish_marketplace_profile`, `studio_flow_unpublish_marketplace_profile`, `studio_flow_public_search_marketplace` |
| `marketplace_listings` | Public read visible and non-expired. Owner/scoped read full. Writes/generated by RPC/job. | `can_manage_marketplace` | `studio_flow_refresh_marketplace_listing`, `studio_flow_public_search_marketplace` |
| `loyalty_accounts` | Client self read. Scoped operational read if tied to appointment/customer relation. Mutations RPC only. | `can_access_client`, `can_access_studio` | `studio_flow_get_loyalty_account`, `studio_flow_adjust_loyalty_account` |
| `rewards` | Public/client read active rewards eligible by scope. Scoped owner manage. | `can_access_artist`, `can_access_studio`, `is_platform_owner` | `studio_flow_save_reward`, `studio_flow_public_get_rewards` |
| `reward_redemptions` | Client own read. Scoped staff read if tied to appointment/studio. Mutations RPC. | `can_access_client`, `can_read_appointment` | `studio_flow_redeem_reward`, `studio_flow_apply_reward_redemption`, `studio_flow_cancel_reward_redemption` |
| `flow_point_ledger` | Client own read. No direct insert/update/delete. Scoped/platform audit read. | `can_access_client`, `is_platform_owner` | `studio_flow_write_flow_point_movement`, `studio_flow_get_flow_point_ledger` |
| `risk_flags` | Platform full. Studio scoped read for own entities if needed. No public/client direct. Mutations RPC. | `is_platform_owner`, `can_access_studio`, `can_access_artist`, `can_access_client` | `studio_flow_admin_create_risk_flag`, `studio_flow_admin_resolve_risk_flag` |
| `sanctions` | Platform full. Subject self may read active restriction summary via RPC. No direct broad read. | `is_platform_owner`, `current_profile` | `studio_flow_admin_apply_sanction`, `studio_flow_admin_lift_sanction`, `studio_flow_get_active_restrictions` |
| `no_show_cases` | Read if user can read appointment and is involved. Mutations RPC. | `can_read_appointment`, `can_mutate_appointment` | `studio_flow_report_no_show`, `studio_flow_resolve_no_show_case` |
| `audit_events` | Platform read. Scoped admin read limited. No public/client direct. Insert only from RPC/helper. | `is_platform_owner`, `can_access_studio`, `write_audit_event` | `studio_flow_admin_get_audit_events` |

## Prioridad por oleadas

| Oleada | Alcance | Motivo |
|---|---|---|
| 1 | `profiles`, `roles`, `permissions`, `user_role_assignments`, auth context | Base de identidad y autorizacion. |
| 2 | `artists`, `artist_profiles`, `clients`, `client_profiles` | Pantallas actuales dependen de estos datos. |
| 3 | `studios`, `studio_profiles`, `artist_studio_memberships`, claim flows | Multi-tenant y administracion scoped. |
| 4 | `service_categories`, `service_tiers`, `service_offerings` | Hoy hay CRUD directo desde frontend. |
| 5 | `schedules`, `schedule_rules`, `calendar_blocks`, `availability_slots` | Agenda y disponibilidad publica/privada. |
| 6 | `appointments`, `appointment_status_events`, `promotions` | Booking y cambios de estado. |
| 7 | `appointment_economies`, `commissions`, loyalty tables | Riesgo financiero alto. |
| 8 | marketplace tables | Exposicion publica controlada. |
| 9 | trust/governance/audit | Governance, riesgo y trazabilidad. |

## Criterios de listo antes de crear policies

- Cada tabla tiene owner funcional definido.
- Cada flujo frontend tiene RPC o policy objetivo.
- Cada helper tiene pruebas manuales por rol.
- Cada RPC sensible tiene contrato de input/output.
- Cada pantalla critica fue probada con usuarios reales de cada rol.
- Existe rollback plan por oleada.
- No quedan `select *` publicos sobre tablas privadas.

## Veredicto

La implementacion debe ser incremental y orientada por contratos RPC. RLS debe actuar como cinturon de seguridad permanente, mientras las RPC `SECURITY DEFINER` concentran las operaciones donde Studio Flow necesita validar rol, scope, estado, auditoria y consistencia transaccional.

El mayor riesgo no es escribir policies estrictas: es activarlas antes de que el frontend deje de depender de CRUD directo sobre tablas privadas.
