# FASE 16.7 - PLATFORM OWNER OPERATING SYSTEM

## Objetivo

Disenar la experiencia completa de `platform_owner` para que Studio Flow deje de sentirse como un conjunto de pantallas admin sueltas y opere como un sistema real de control de negocio.

Este documento no implementa codigo, no crea SQL y no modifica rutas. Solo define producto, experiencia administrativa y wireframes funcionales.

## Principio de producto

El `platform_owner` no administra una sola agenda ni un solo estudio. Administra un ecosistema:

- oferta: artistas, studios, servicios y disponibilidad
- demanda: clientas, reservas, recurrencia y loyalty
- confianza: riesgo, sanciones, no-shows y auditoria
- marketplace: perfiles publicos, listings y visibilidad
- operacion: citas, ocupacion, ingresos y calidad de servicio

La experiencia debe priorizar:

1. Detectar problemas.
2. Tomar decisiones.
3. Ejecutar acciones auditables.
4. Confirmar impacto.

## Navegacion propuesta

| Orden | Modulo | Proposito |
|---:|---|---|
| 1 | Dashboard | Resumen ejecutivo y cola de atencion. |
| 2 | Operacion | Citas, ocupacion, agenda y actividad diaria. |
| 3 | Artistas | Supply individual, perfiles, status, servicios y disponibilidad. |
| 4 | Clientes | CRM, historial, loyalty y soporte. |
| 5 | Studios | Gestion de studios, owners, equipo, perfil y estado. |
| 6 | Marketplace | Publicacion, visibilidad, listings y calidad del perfil publico. |
| 7 | Governance | Aprobaciones, rechazos, cambios solicitados y calidad del ecosistema. |
| 8 | Riesgo | Flags, sanctions, no-shows, disputas y casos criticos. |
| 9 | Sistema | Health, auditoria, roles, scopes, RPC/RLS readiness. |

Nota: `Configuracion/Provisioning` puede ser submodulo de Sistema hasta que exista suficiente superficie para separarlo.

## Modelo de inicio diario

El Platform Owner deberia poder abrir `/admin` y responder en menos de 2 minutos:

1. Hay algo roto hoy?
2. Hay ingresos o citas en riesgo?
3. Hay artistas/studios/clientas esperando accion?
4. Que necesita aprobacion?
5. Que debe publicarse u ocultarse?
6. Que cambio sensible ocurrio recientemente?

La pantalla inicial debe ser un centro de mando, no un repositorio de tablas.

## Dashboard

### Proposito

Resumen ejecutivo del ecosistema y cola priorizada de decisiones.

### KPIs visibles

| KPI | Descripcion |
|---|---|
| Revenue bruto | Suma de `appointment_economies.gross_amount` en rango. |
| Comision plataforma | Suma de `platform_fee_amount` o `commissions.amount`. |
| Citas hoy / semana | Conteo de `appointments` por estado. |
| Ocupacion | Booked slots vs disponibilidad real. |
| Artistas activos | `artists.status = active`, segmentado independientes/studio. |
| Studios activos | `studios.studio_status = approved`. |
| Clientas activas | Clientas con actividad reciente. |
| Riesgo abierto | `risk_flags.status = open`, severidad alta/critica. |
| Aprobaciones pendientes | Studios/artistas/claims pendientes. |
| Marketplace visible | Perfiles/listings publicados vs ocultos/suspendidos. |

### Acciones disponibles

- Ir a Riesgo.
- Ir a Governance.
- Ir a Marketplace.
- Ir a artista/studio/cliente especifico.
- Reintentar carga de datos.

No deberia permitir:

- Aprobar/rechazar directamente desde cards.
- Suspender sin motivo.
- Cambiar visibilidad marketplace sin contexto.

### Flujo operativo diario

1. Revisar KPIs.
2. Abrir `Cola de atencion`.
3. Resolver primero riesgo critico.
4. Revisar approvals pendientes.
5. Confirmar marketplace visibility.
6. Revisar revenue/ocupacion.

### Alertas

| Alerta | Condicion |
|---|---|
| Riesgo critico | `risk_flags.severity = critical` abierto. |
| Cita disputada | `appointments.status = disputed`. |
| No-show recurrente | Cliente/artista con casos abiertos. |
| Perfil incompleto publicado | Marketplace listing visible sin datos minimos. |
| Studio sin owner scoped | Studio aprobado sin `studio_owner` activo. |
| Admin sin scope | `user_role_assignments` admin scoped con `studio_id null`. |

### Permisos

- `platform_owner`: global.
- `studio_owner`: version scoped de dashboard, sin governance global ni sistema platform.
- `studio_manager`: solo operacion y agenda.

### Informacion minima requerida

- `appointments`
- `appointment_economies`
- `commissions`
- `artists`
- `studios`
- `clients`
- `risk_flags`
- `sanctions`
- `audit_events`
- `marketplace_profiles`
- `marketplace_listings`
- `user_role_assignments`

### Wireframe funcional

```text
┌──────────────────────────────────────────────────────────────┐
│ Dashboard                                                     │
│ [Rango fecha] [Scope: Global] [Actualizar]                    │
├──────────────────────────────────────────────────────────────┤
│ Revenue | Comision | Citas | Ocupacion | Riesgo | Pendientes  │
├───────────────────────────────┬──────────────────────────────┤
│ Cola de atencion              │ Salud del ecosistema          │
│ 1. Riesgo critico             │ Studios activos               │
│ 2. Approval pendiente         │ Artistas activos              │
│ 3. Perfil incompleto          │ Marketplace visible           │
│ 4. Admin sin scope            │ Roles/scopes                  │
├───────────────────────────────┴──────────────────────────────┤
│ Tendencias: revenue, citas, ocupacion, recurrencia            │
├──────────────────────────────────────────────────────────────┤
│ Top artistas | Top studios | Alertas recientes                │
└──────────────────────────────────────────────────────────────┘
```

## Artistas

### Proposito

Gestionar la oferta individual: identidad profesional, status, servicios, studio memberships y readiness para marketplace/booking.

### KPIs visibles

| KPI | Descripcion |
|---|---|
| Artistas activos | `artists.status = active`. |
| Independientes | Artistas sin `artist_studio_memberships`. |
| Vinculados a studio | Artistas con membership activo. |
| Perfiles completos | Artist profile con campos minimos. |
| Servicios activos | `service_offerings.status = active`. |
| Artistas ocultos/suspendidos | Status/marketplace/sanctions. |

### Acciones disponibles

- Activar/desactivar artista.
- Editar perfil profesional allowlist.
- Ver detalle artista.
- Ver servicios.
- Ver bookings.
- Vincular/desvincular a studio, cuando exista workflow.
- Enviar a Governance para aprobacion/rechazo.
- Enviar a Marketplace para publicar/ocultar.
- Aplicar accion de riesgo solo desde Riesgo/Governance.

### Flujo operativo diario

1. Filtrar por `Pendiente`, `Inactivo`, `Perfil incompleto`, `Sin servicios`.
2. Corregir datos basicos.
3. Validar servicios.
4. Publicar o enviar a Governance/Marketplace segun estado.

### Alertas

- Artista activo sin servicios.
- Perfil publicado sin ciudad/foto/especialidad.
- Artista con citas futuras pero status inactivo.
- Artista con sanction activa.
- Artista independiente sin marketplace profile.

### Permisos

| Accion | Permiso |
|---|---|
| Ver todos | `platform_owner` |
| Ver scoped | `studio_owner` con membership |
| Activar/desactivar | `platform_owner`; `studio_owner` scoped si se permite |
| Editar perfil | `platform_owner`; `studio_owner` scoped |
| Aprobar/rechazar | Governance permission |
| Suspender | Risk/Governance permission |

### Informacion minima requerida

- `artists`
- `artist_profiles`
- `profiles`
- `artist_studio_memberships`
- `service_offerings`
- `marketplace_profiles`
- `risk_flags`
- `sanctions`
- `appointments`

### Wireframe funcional

```text
┌──────────────────────────────────────────────────────────────┐
│ Artistas                                                     │
│ [Buscar] [Status] [Studio] [Marketplace] [Riesgo] [Nuevo*]   │
├──────────────────────────────────────────────────────────────┤
│ KPIs: Activos | Independientes | Sin servicios | Incompletos │
├──────────────────────────────────────────────────────────────┤
│ Lista                                                        │
│ Nombre | Studio | Status | Servicios | Marketplace | Riesgo  │
│ Acción rápida: Ver / Editar / Activar / Desactivar           │
├──────────────────────────────────────────────────────────────┤
│ Panel detalle                                                │
│ Perfil | Servicios | Memberships | Citas | Audit             │
└──────────────────────────────────────────────────────────────┘
```

`Nuevo*` debe existir solo cuando haya provisioning/registro admin real.

## Clientes

### Proposito

CRM operativo: clientas, historial, loyalty, soporte, estado y riesgo.

### KPIs visibles

| KPI | Descripcion |
|---|---|
| Clientas activas | Actividad reciente. |
| Nuevas clientas | Alta o primera cita en rango. |
| Recurrentes | Mas de N citas en periodo. |
| Gasto total | `appointment_economies.gross_amount` por clienta. |
| Flow Points activos | `loyalty_accounts.points_balance`. |
| Clientas en riesgo | no-shows, disputas, sanctions o churn. |

### Acciones disponibles

- Ver perfil cliente.
- Ver historial.
- Activar/inactivar cliente.
- Editar datos allowlist.
- Agregar nota privada.
- Revisar loyalty.
- Abrir caso de riesgo si aplica.

### Flujo operativo diario

1. Revisar clientas con citas hoy.
2. Revisar clientas con disputas/no-show.
3. Revisar loyalty cercano a recompensa.
4. Revisar clientas inactivas con alto valor.

### Alertas

- Cliente con no-show recurrente.
- Cliente con pago/disputa.
- Cliente VIP inactiva.
- Cliente con puntos por vencer.
- Perfil sin telefono/email.

### Permisos

- `platform_owner`: global.
- `studio_owner`: clientas relacionadas con su studio.
- `studio_manager`: clientas del studio sin finanzas profundas si se decide.

### Informacion minima requerida

- `clients`
- `client_profiles`
- `profiles`
- `appointments`
- `appointment_economies`
- `customer_private_notes`
- `loyalty_accounts`
- `flow_point_ledger`
- `risk_flags`
- `sanctions`

### Wireframe funcional

```text
┌──────────────────────────────────────────────────────────────┐
│ Clientes                                                     │
│ [Buscar] [Studio] [Segmento] [Status] [Riesgo]               │
├──────────────────────────────────────────────────────────────┤
│ KPIs: Activas | Recurrentes | VIP | En riesgo | Puntos       │
├──────────────────────────────────────────────────────────────┤
│ Lista: Nombre | Studio | Ultima cita | Spend | Points | Risk │
├──────────────────────────────────────────────────────────────┤
│ Detalle: Perfil | Historial | Loyalty | Notas | Audit        │
└──────────────────────────────────────────────────────────────┘
```

## Studios

### Proposito

Administrar unidades de operacion: perfil, owner, equipo, artistas, estado, marketplace y salud.

### KPIs visibles

| KPI | Descripcion |
|---|---|
| Studios aprobados | `studio_status = approved`. |
| Pendientes | `studio_status = pending`. |
| Suspendidos | `studio_status = suspended`. |
| Sin owner | Sin `owner_profile_id` o assignment owner scoped. |
| Sin perfil completo | `studio_profiles` incompleto. |
| Revenue por studio | Economy agregada. |
| Riesgo por studio | `risk_score`, flags y sanctions. |

### Acciones disponibles

- Ver detalle studio.
- Editar perfil.
- Asignar owner/manager.
- Activar/aprobar/suspender via Governance.
- Ver artistas vinculados.
- Ver marketplace profile.
- Ver audit trail.

### Flujo operativo diario

1. Revisar studios pendientes o suspendidos.
2. Revisar studios sin owner/scope.
3. Revisar perfiles incompletos.
4. Revisar performance y riesgo.

### Alertas

- Studio aprobado sin owner activo.
- Studio visible en marketplace con perfil incompleto.
- Studio con riesgo alto.
- Studio sin artistas activos.
- Studio sin citas recientes.

### Permisos

- `platform_owner`: global.
- `studio_owner`: solo su studio.
- `studio_manager`: lectura limitada si aplica.

### Informacion minima requerida

- `studios`
- `studio_profiles`
- `user_role_assignments`
- `roles`
- `artist_studio_memberships`
- `artists`
- `appointments`
- `appointment_economies`
- `marketplace_profiles`
- `marketplace_listings`
- `risk_flags`
- `audit_events`

### Wireframe funcional

```text
┌──────────────────────────────────────────────────────────────┐
│ Studios                                                      │
│ [Buscar] [Estado] [Owner] [Marketplace] [Riesgo]             │
├──────────────────────────────────────────────────────────────┤
│ KPIs: Aprobados | Pendientes | Suspendidos | Sin owner       │
├──────────────────────────────────────────────────────────────┤
│ Tabla: Studio | Owner | Artistas | Revenue | Marketplace     │
├──────────────────────────────────────────────────────────────┤
│ Detalle: Perfil | Equipo | Artistas | Marketplace | Audit    │
└──────────────────────────────────────────────────────────────┘
```

## Marketplace

### Proposito

Controlar la superficie publica: perfiles, listings, visibilidad y calidad del marketplace.

### KPIs visibles

| KPI | Descripcion |
|---|---|
| Perfiles visibles | `marketplace_profiles.visibility_status = visible`. |
| Ocultos | Profiles/listings ocultos. |
| Suspendidos | Profiles/listings suspendidos. |
| Listings activos | `marketplace_listings` activos/no expirados. |
| Perfiles incompletos | Falta foto, ciudad, servicios, bio, disponibilidad. |
| Conversion | Vista a reserva, si existe tracking futuro. |

### Acciones disponibles

- Publicar perfil.
- Ocultar perfil.
- Suspender perfil.
- Refrescar listing.
- Ver preview publico.
- Resolver incompletos.

### Flujo operativo diario

1. Revisar perfiles incompletos.
2. Revisar perfiles suspendidos.
3. Publicar perfiles aprobados.
4. Ocultar perfiles con riesgo o datos insuficientes.
5. Confirmar listings activos.

### Alertas

- Perfil visible con artista/studio inactivo.
- Listing visible sin servicios activos.
- Perfil suspendido con citas futuras.
- Perfil sin disponibilidad.
- Perfil independiente sin validacion.

### Permisos

- `platform_owner`: global publish/hide/suspend.
- `studio_owner`: editar/request publish de su studio si se permite.
- `studio_manager`: no publish/hide por default.

### Informacion minima requerida

- `marketplace_profiles`
- `marketplace_listings`
- `artists`
- `artist_profiles`
- `studios`
- `studio_profiles`
- `service_offerings`
- `availability_slots`
- `risk_flags`
- `sanctions`

### Wireframe funcional

```text
┌──────────────────────────────────────────────────────────────┐
│ Marketplace                                                  │
│ [Buscar] [Tipo: Artista/Studio] [Visible] [Calidad] [Riesgo] │
├──────────────────────────────────────────────────────────────┤
│ KPIs: Visibles | Ocultos | Suspendidos | Incompletos         │
├──────────────────────────────────────────────────────────────┤
│ Lista: Perfil | Tipo | Estado | Calidad | Servicios | Risk   │
├──────────────────────────────────────────────────────────────┤
│ Detalle: Preview | Checklist | Listings | Acciones | Audit   │
└──────────────────────────────────────────────────────────────┘
```

## Governance

### Proposito

Administrar decisiones de calidad y acceso: aprobaciones, rechazos, solicitudes de cambio y revisiones.

### KPIs visibles

| KPI | Descripcion |
|---|---|
| Reviews pendientes | Governance/claim reviews abiertas. |
| Studios pendientes | `studio_status = pending`. |
| Artistas pendientes | Artists/memberships pendientes. |
| Rechazos recientes | Rechazos en periodo. |
| Cambios solicitados | Reviews que requieren accion externa. |
| Tiempo promedio de resolucion | SLA governance. |

### Acciones disponibles

- Aprobar studio.
- Rechazar studio.
- Solicitar cambios.
- Aprobar artista/membership.
- Rechazar artista/membership.
- Ver evidencia.
- Escribir motivo obligatorio.

### Flujo operativo diario

1. Resolver items vencidos por SLA.
2. Revisar nuevos applications/claims.
3. Aprobar completos.
4. Rechazar o solicitar cambios con motivo.
5. Auditar decisiones sensibles.

### Alertas

- Review vencida.
- Application sin documentos/datos.
- Re-aplicacion de entidad rechazada.
- Cambio manual sin auditoria.

### Permisos

- `platform_owner`: global.
- `governance_operator` futuro: scoped por permisos.
- `studio_owner`: no deberia aprobar su propio studio en governance global.

### Informacion minima requerida

- `governance_reviews`
- `artist_claim_reviews`
- `artist_claim_invitations`
- `artists`
- `artist_profiles`
- `studios`
- `studio_profiles`
- `artist_studio_memberships`
- `audit_events`

### Wireframe funcional

```text
┌──────────────────────────────────────────────────────────────┐
│ Governance                                                   │
│ [Tipo] [Estado] [SLA] [Owner]                                │
├──────────────────────────────────────────────────────────────┤
│ KPIs: Pendientes | Vencidas | Aprobadas | Rechazadas         │
├──────────────────────────────────────────────────────────────┤
│ Cola: Entidad | Tipo | Estado | Edad | Riesgo | Acción       │
├──────────────────────────────────────────────────────────────┤
│ Revisión: Datos | Evidencia | Historial | Motivo | Decisión  │
└──────────────────────────────────────────────────────────────┘
```

## Riesgo

### Proposito

Gestionar confianza y seguridad operativa: flags, sanciones, no-shows, disputas y entidades riesgosas.

### KPIs visibles

| KPI | Descripcion |
|---|---|
| Flags abiertos | `risk_flags.status = open`. |
| Criticos | `severity = critical`. |
| Sanctions activas | `sanctions.status = active`. |
| No-shows abiertos | `no_show_cases.status = open`. |
| Disputas | `appointments.status = disputed`. |
| Tiempo promedio de resolucion | SLA risk. |

### Acciones disponibles

- Resolver/dismiss flag.
- Aplicar sanction.
- Levantar sanction.
- Escalar caso.
- Vincular appointment/artist/client/studio.
- Ver audit trail.

### Flujo operativo diario

1. Resolver critical/high.
2. Revisar no-shows y disputas.
3. Aplicar sanctions cuando corresponda.
4. Levantar sanctions vencidas.
5. Confirmar que marketplace se oculta si hay sanction critica.

### Alertas

- Flag critico abierto.
- Sanction vencida aun activa.
- Marketplace visible con sanction activa.
- Cliente/artista con no-show recurrente.
- Appointment disputed sin owner asignado.

### Permisos

- `platform_owner`: global.
- `risk_operator` futuro: acciones trust.
- `studio_owner`: lectura scoped limitada, sin sanctions globales.

### Informacion minima requerida

- `risk_flags`
- `sanctions`
- `no_show_cases`
- `appointments`
- `clients`
- `artists`
- `studios`
- `marketplace_profiles`
- `audit_events`

### Wireframe funcional

```text
┌──────────────────────────────────────────────────────────────┐
│ Riesgo                                                       │
│ [Severidad] [Entidad] [Estado] [Studio] [SLA]                │
├──────────────────────────────────────────────────────────────┤
│ KPIs: Abiertos | Criticos | Sanctions | No-shows | Disputas  │
├──────────────────────────────────────────────────────────────┤
│ Casos: Severidad | Entidad | Motivo | Edad | Owner | Acción  │
├──────────────────────────────────────────────────────────────┤
│ Detalle: Timeline | Datos | Acciones | Marketplace | Audit   │
└──────────────────────────────────────────────────────────────┘
```

## Sistema

### Proposito

Control tecnico-operativo: salud, auditoria, roles, scopes, permisos y readiness de seguridad.

### KPIs visibles

| KPI | Descripcion |
|---|---|
| Eventos audit recientes | `audit_events` por contexto. |
| Admins activos | `user_role_assignments` admin activos. |
| Admins sin scope | Studio roles sin `studio_id`. |
| Ultimo platform owner | Seguridad de provisioning. |
| RLS readiness | Tablas con policy/RPC requerida. |
| Errores operativos | RPC failures/logs si existe fuente futura. |

### Acciones disponibles

- Ver audit log.
- Ver role assignments.
- Detectar scopes incompletos.
- Ir a provisioning.
- Revisar health checks.
- Exportar auditoria, futuro.

No deberia incluir:

- QA Sandbox.
- Acciones mock.
- Reservas simuladas.

### Flujo operativo diario

1. Revisar alertas de seguridad.
2. Revisar assignments incompletos.
3. Revisar eventos sensibles recientes.
4. Confirmar que no hay fallas de integridad.

### Alertas

- Studio owner sin `studio_id`.
- Ultimo platform owner en riesgo.
- Audit event fallando por constraint.
- RPC critica sin grant correcto.
- Perfil admin suspendido con assignment activo.

### Permisos

- `platform_owner` solamente.
- Roles tecnicos futuros con scope muy limitado.

### Informacion minima requerida

- `audit_events`
- `profiles`
- `roles`
- `permissions`
- `role_permissions`
- `user_role_assignments`
- health views futuras

### Wireframe funcional

```text
┌──────────────────────────────────────────────────────────────┐
│ Sistema                                                      │
│ [Audit] [Roles] [Security] [Health]                          │
├──────────────────────────────────────────────────────────────┤
│ KPIs: Audit 24h | Admins | Sin scope | Riesgos seguridad     │
├──────────────────────────────────────────────────────────────┤
│ Health: Auth | RPC | RLS | Audit events | Marketplace        │
├──────────────────────────────────────────────────────────────┤
│ Audit log: Fecha | Actor | Entidad | Evento | Scope          │
├──────────────────────────────────────────────────────────────┤
│ Role health: Usuario | Rol | Studio | Estado | Acción        │
└──────────────────────────────────────────────────────────────┘
```

## Flujo operativo completo

### Rutina diaria recomendada

```text
Inicio
  -> revisar cola de atencion
  -> abrir Riesgo si hay critical/high
  -> abrir Governance si hay approvals vencidos
  -> revisar Marketplace si hay perfiles incompletos o suspendidos
  -> revisar Operacion si ocupacion/citas caen
  -> revisar Sistema si hay alertas de roles/audit
```

### Rutina semanal recomendada

```text
Dashboard
  -> analizar revenue y ocupacion
  -> revisar top/bottom studios
  -> revisar artistas sin servicios o sin bookings
  -> revisar clientas VIP inactivas
  -> revisar marketplace quality
  -> revisar audit/security health
```

## Permisos globales propuestos

| Permiso | Modulos |
|---|---|
| `platform_dashboard_read` | Dashboard |
| `platform_operations_read` | Operacion |
| `platform_artists_manage` | Artistas |
| `platform_clients_manage` | Clientes |
| `platform_studios_manage` | Studios |
| `platform_marketplace_manage` | Marketplace |
| `platform_governance_manage` | Governance |
| `platform_risk_manage` | Riesgo |
| `platform_system_read` | Sistema |
| `platform_roles_manage` | Sistema/Configuracion |

Mientras no exista permisos DB efectivos, estos pueden mapearse temporalmente a `platform_owner`.

## Informacion minima transversal

Para que el Platform Owner OS funcione sin demo, estas fuentes deben existir:

| Dominio | Tablas |
|---|---|
| Identidad | `profiles`, `roles`, `user_role_assignments` |
| Supply | `artists`, `artist_profiles`, `artist_studio_memberships`, `service_offerings` |
| Studios | `studios`, `studio_profiles` |
| Demand | `clients`, `client_profiles`, `appointments` |
| Economia | `appointment_economies`, `commissions` |
| Loyalty | `loyalty_accounts`, `flow_point_ledger`, `reward_redemptions` |
| Marketplace | `marketplace_profiles`, `marketplace_listings` |
| Trust | `risk_flags`, `sanctions`, `no_show_cases` |
| Governance | `governance_reviews`, `artist_claim_reviews`, `artist_claim_invitations` |
| Auditoria | `audit_events` |

## Wireframe global

```text
┌──────────────────────────────────────────────────────────────┐
│ Studio Flow Platform Owner                                   │
│ [Global Search] [Date Range] [Scope] [Alerts] [Profile]      │
├───────────────┬──────────────────────────────────────────────┤
│ Inicio        │                                              │
│ Operacion     │  Module Header                               │
│ Artistas      │  KPIs                                        │
│ Clientes      │  Primary Work Queue                          │
│ Studios       │  Main Table / Board                          │
│ Marketplace   │  Detail Drawer                               │
│ Governance    │  Audit / Timeline                            │
│ Riesgo        │                                              │
│ Sistema       │                                              │
└───────────────┴──────────────────────────────────────────────┘
```

## Estados vacios reales

Cada modulo debe tener empty states reales:

| Modulo | Empty state |
|---|---|
| Dashboard | `Sin actividad en el rango seleccionado.` |
| Artistas | `No hay artistas en este scope.` |
| Clientes | `No hay clientas con actividad registrada.` |
| Studios | `No hay studios registrados.` |
| Marketplace | `No hay perfiles publicados.` |
| Governance | `No hay revisiones pendientes.` |
| Riesgo | `No hay casos abiertos.` |
| Sistema | `No hay eventos recientes.` |

No debe usarse data demo para rellenar vacios en sesiones reales.

## Decisiones pendientes

1. Si `Operacion` sera modulo separado o parte del Dashboard en primera version.
2. Si `Governance` y `Riesgo` deben fusionarse como `Trust`.
3. Si `Marketplace` debe permitir acciones directas a studio owners.
4. Si `Sistema` incluye provisioning o si se crea `Configuracion`.
5. Si `studio_manager` vera Artistas o solo agenda/clientes.
6. Si el buscador global debe buscar perfiles publicos o entidades internas.

## Veredicto

El Platform Owner OS debe organizar Studio Flow alrededor de trabajo real, no alrededor de pantallas heredadas.

La experiencia recomendada separa:

- decision ejecutiva en Dashboard
- operacion diaria en Operacion
- entidades core en Artistas, Clientes y Studios
- superficie publica en Marketplace
- control de calidad en Governance
- confianza y seguridad en Riesgo
- salud tecnica y roles en Sistema

Con esta estructura, cada modulo puede tener RPCs, permisos, auditoria y empty states propios sin mezclar QA, demo y operacion real.
