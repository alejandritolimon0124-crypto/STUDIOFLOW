# LOGICAL DATA MODEL MASTER

## 0. Alcance

Este documento transforma las decisiones congeladas del proyecto en un modelo logico completo para Studio Flow.

No define negocio nuevo, no define producto nuevo, no audita implementacion y no disena tablas. Su funcion es servir como puente conceptual hacia una futura implementacion persistente.

Documentos base aprobados:

- Modelo Hibrido
- Customer 360
- Marketplace
- Fairness Engine
- Impulsa Tu Negocio
- Domain Model Master
- Decision Freeze

## 1. Bounded Contexts Definitivos

### 1.1 Identity & Access

Controla identidad, perfil de acceso, roles y permisos operativos.

Autoridad sobre:

- User
- Role
- Permission
- Session Profile

No es autoridad sobre datos profesionales de artistas, estudios o clientes. Solo resuelve quien puede actuar y bajo que rol.

### 1.2 Studio Governance

Controla el alta, revision, aprobacion, suspension y riesgo operativo de estudios dentro del ecosistema.

Autoridad sobre:

- Studio
- Studio Status
- Studio Governance Review
- Studio Operational Access

Este contexto decide si un estudio puede operar funciones protegidas como agenda publica, marketplace, marketing y visibilidad.

### 1.3 Professional Network

Controla la estructura hibrida artista-estudio. El vinculo entre artista y estudio no vive como propiedad rigida del artista, sino como una membership.

Autoridad sobre:

- Artist
- Artist Studio Membership
- Studio Team Role
- Professional Profile

Este contexto es central para el Modelo Hibrido.

### 1.4 Service Catalog

Controla categorias, servicios ofrecidos, precios, duracion, estado y nivel comercial del servicio.

Autoridad sobre:

- Service Category
- Service Offering
- Service Tier

No calcula comisiones ni puntos; solo provee datos base para agenda, economia y loyalty.

### 1.5 Scheduling & Booking

Controla disponibilidad, slots, bloqueos y citas.

Autoridad sobre:

- Appointment
- Availability Slot
- Schedule Settings
- Calendar Block

Es el contexto transaccional principal. La cita conecta cliente, artista, estudio, membership y servicio.

### 1.6 Customer 360

Controla la vista consolidada de cliente, historial, preferencias, recurrencia, segmentos y relacion con artistas/estudios.

Autoridad sobre:

- Client
- Client Profile
- Client Preference
- Client Segment
- Client History Projection
- Favorite Artist

No es autoridad sobre citas completadas ni puntos. Consume eventos para construir la vision 360.

### 1.7 Marketplace

Controla descubrimiento, visibilidad publica, perfiles marketplace, disponibilidad visible, badges, favoritos y senales de posicionamiento.

Autoridad sobre:

- Marketplace Profile
- Marketplace Listing
- Marketplace Badge
- Marketplace Visibility State
- Favorite Relation

No es autoridad sobre agenda real ni governance. Consume ambos.

### 1.8 Appointment Economy

Controla la economia derivada de la cita: importe bruto, comision de plataforma, ingreso artista, riesgo economico y estado economico.

Autoridad sobre:

- Appointment Economy
- Commission
- Revenue Split
- Economy Risk Signal

Toda comision nace de una cita.

### 1.9 Loyalty & Flow Points

Controla puntos, recompensas, tiers, expiraciones, redenciones, streaks y beneficios de fidelidad.

Autoridad sobre:

- Loyalty Account
- Flow Point Ledger Entry
- Reward
- Reward Redemption
- VIP Tier
- Streak

Loyalty nunca genera puntos por una cita que no este completed.

### 1.10 Impulsa Tu Negocio

Controla promociones, automatizaciones, recomendaciones comerciales, reactivacion, happy hour, baja ocupacion e insights accionables.

Autoridad sobre:

- Promotion
- Automation Recommendation
- Reactivation Opportunity
- Business Insight
- Marketing Configuration

Consume Customer 360, Scheduling, Loyalty y Marketplace. No debe convertirse en autoridad de esos datos.

### 1.11 Fairness Engine

Controla senales de equidad, riesgo de abuso, consistencia de rewards, exposicion marketplace, calidad de datos y posibles flags.

Autoridad sobre:

- Fairness Signal
- Risk Flag
- Fairness Review
- Exposure Balance Snapshot

No cambia directamente citas, comisiones, puntos o visibilidad; emite senales para revision o ajustes controlados.

### 1.12 Analytics & Reporting

Controla metricas agregadas, snapshots, dashboards y lecturas historicas.

Autoridad sobre:

- Metric Snapshot
- Portfolio Summary
- Occupancy Metric
- Revenue Metric
- Ecosystem Insight

No es autoridad transaccional. Siempre debe poder reconstruirse desde eventos o snapshots auditados.

## 2. Aggregate Roots Definitivos

### Identity & Access

- User
- Access Role Assignment

### Studio Governance

- Studio
- Governance Review

### Professional Network

- Artist
- Artist Studio Membership

### Service Catalog

- Service Offering
- Service Category

### Scheduling & Booking

- Appointment
- Schedule

### Customer 360

- Client
- Customer Relationship

### Marketplace

- Marketplace Listing
- Marketplace Profile

### Appointment Economy

- Appointment Economy
- Commission

### Loyalty & Flow Points

- Loyalty Account
- Reward Redemption

### Impulsa Tu Negocio

- Promotion
- Automation Recommendation
- Business Insight

### Fairness Engine

- Fairness Review
- Risk Flag

### Analytics & Reporting

- Metric Snapshot
- Portfolio Summary

## 3. Entidades Logicas

### 3.1 User

Proposito: representar una identidad autenticable dentro de Studio Flow.

Ownership: Identity & Access.

Ciclo de vida: creado en registro o invitacion; activo mientras tenga acceso; puede suspenderse, archivarse o desvincularse sin borrar la historia operacional.

### 3.2 Role

Proposito: clasificar capacidades de acceso: platform owner, studio owner, studio manager, artist, client.

Ownership: Identity & Access.

Ciclo de vida: catalogo controlado; cambia solo por decisiones de plataforma o administracion autorizada.

### 3.3 Permission

Proposito: expresar capacidades atomicas sobre governance, studios, revenue, agenda, clientes, marketing, flow points y portal cliente.

Ownership: Identity & Access.

Ciclo de vida: catalogo estable; puede ampliarse por evolucion del producto.

### 3.4 Studio

Proposito: representar una unidad profesional aprobable dentro del ecosistema.

Ownership: Studio Governance.

Ciclo de vida: pending al crearse; approved cuando cumple reglas; suspended si pierde acceso operativo; archived si deja el ecosistema.

### 3.5 Studio Professional Profile

Proposito: describir nombre comercial, ubicacion, contacto, especialidad y presentacion publica/operativa del estudio.

Ownership: Studio Governance, con consumo por Marketplace.

Ciclo de vida: nace con Studio; se actualiza por owner/manager autorizado; puede ocultarse si el estudio esta suspended.

### 3.6 Governance Review

Proposito: registrar decisiones de aprobacion, suspension, cambios solicitados y riesgo del estudio.

Ownership: Studio Governance.

Ciclo de vida: se abre por registro, cambio sensible o senal de riesgo; se resuelve como approved, pending changes, suspended o rejected.

### 3.7 Artist

Proposito: representar a una profesional que ofrece servicios.

Ownership: Professional Network.

Ciclo de vida: creado por registro, invitacion o onboarding; activo, inactivo o archivado; conserva historial de citas aunque cambie de estudio.

### 3.8 Artist Professional Profile

Proposito: representar identidad profesional, bio, especialidades, foto, ubicacion profesional y datos de presentacion.

Ownership: Professional Network.

Ciclo de vida: nace con Artist; se actualiza por artista o administracion autorizada; alimenta marketplace y agenda publica.

### 3.9 Artist Studio Membership

Proposito: conectar artista y estudio en el modelo hibrido.

Ownership: Professional Network.

Ciclo de vida: creada cuando una artista se vincula a un estudio; active mientras opera; inactive si se pausa; archived si la relacion termina historicamente.

### 3.10 Studio Team Role

Proposito: definir el rol operativo de una persona dentro de un estudio: owner, manager, artist u otro rol futuro.

Ownership: Professional Network e Identity & Access.

Ciclo de vida: creado por invitacion/asignacion; activo mientras la relacion laboral/operativa exista; revocado o archivado al terminar.

### 3.11 Service Category

Proposito: agrupar servicios por familia: unas, pestanas, maquillaje, manicure, pedicure, microblading, faciales, depilado.

Ownership: Service Catalog.

Ciclo de vida: catalogo curado; puede activarse, renombrarse o retirarse sin romper servicios historicos.

### 3.12 Service Offering

Proposito: representar un servicio ofrecido por artista/estudio, con precio, duracion, categoria, demanda, estado y tier.

Ownership: Service Catalog.

Ciclo de vida: draft o active al configurarse; suspended si no esta disponible; archived si deja de venderse.

### 3.13 Service Tier

Proposito: clasificar servicios para economia, loyalty y fairness: basic, medium, premium, vip u otra escala aprobada.

Ownership: Service Catalog.

Ciclo de vida: catalogo estable; los cambios deben versionarse para no alterar calculos historicos.

### 3.14 Schedule

Proposito: representar reglas de horario laboral, breaks, intervalo entre citas y configuracion de agenda.

Ownership: Scheduling & Booking.

Ciclo de vida: creado con artista/membership; versionado cuando cambia disponibilidad; puede desactivarse.

### 3.15 Availability Slot

Proposito: representar una oportunidad reservable calculada desde agenda, estudio, artista, membership y bloqueos.

Ownership: Scheduling & Booking.

Ciclo de vida: generado como disponibilidad; reservado temporalmente; confirmado al crear cita; expira si no se usa.

### 3.16 Calendar Block

Proposito: representar indisponibilidad: descanso, bloqueo manual, capacitacion, mantenimiento o pausa.

Ownership: Scheduling & Booking.

Ciclo de vida: creado por artista/estudio; activo durante su intervalo; cancelado o expirado despues del periodo.

### 3.17 Appointment

Proposito: representar una cita entre cliente y artista para un servicio en una fecha/hora, opcionalmente dentro de un estudio mediante membership.

Ownership: Scheduling & Booking.

Ciclo de vida: draft/reserved, scheduled, confirmed, completed, cancelled, no-show o disputed. Solo completed dispara economia definitiva y loyalty.

### 3.18 Client

Proposito: representar a la clienta/persona que reserva, consume servicios y acumula historial.

Ownership: Customer 360.

Ciclo de vida: creado por registro, primera cita o importacion; activo, inactivo o archivado; no debe borrarse si hay citas historicas.

### 3.19 Client Profile

Proposito: contener datos de contacto, cumpleanos, notas, preferencias, servicios favoritos y recomendaciones.

Ownership: Customer 360.

Ciclo de vida: nace con Client; se enriquece con citas, preferencias y acciones de usuario; puede anonimizarse si aplica.

### 3.20 Customer Relationship

Proposito: representar la relacion contextual de una clienta con artista y/o estudio.

Ownership: Customer 360.

Ciclo de vida: nace con primera interaccion significativa; se activa con recurrencia; se marca inactive con inactividad prolongada.

### 3.21 Client Segment

Proposito: clasificar clientas como nueva, frecuente, VIP, inactiva u otros segmentos derivados.

Ownership: Customer 360.

Ciclo de vida: derivado y recalculable desde historial, loyalty y frecuencia.

### 3.22 Favorite Artist

Proposito: registrar una preferencia explicita de clienta hacia artista.

Ownership: Marketplace para descubrimiento; Customer 360 como consumidor.

Ciclo de vida: creado por accion de favorito; eliminado por accion de quitar favorito; conserva metricas agregadas si fueron generadas.

### 3.23 Marketplace Profile

Proposito: proyectar artista/estudio hacia descubrimiento publico con senales de reputacion, especialidad, ubicacion y disponibilidad.

Ownership: Marketplace.

Ciclo de vida: draft mientras faltan datos; visible si studio approved y perfil cumple reglas; hidden por suspension, baja calidad o decision manual.

### 3.24 Marketplace Listing

Proposito: representar una aparicion concreta en resultados marketplace.

Ownership: Marketplace.

Ciclo de vida: generado desde perfiles elegibles y disponibilidad; cambia con agenda, governance, fairness y demanda.

### 3.25 Marketplace Badge

Proposito: comunicar senales resumidas: alta disponibilidad, top, premium, nuevo, baja ocupacion u otras.

Ownership: Marketplace con senales de Analytics/Fairness.

Ciclo de vida: derivado; expira o se recalcula cuando cambian datos base.

### 3.26 Appointment Economy

Proposito: encapsular calculos economicos derivados de una cita.

Ownership: Appointment Economy.

Ciclo de vida: estimado al agendar; definitivo al completed; ajustado solo por correccion/auditoria.

### 3.27 Commission

Proposito: representar la comision de plataforma nacida de una cita.

Ownership: Appointment Economy.

Ciclo de vida: pending antes de cierre; earned al completarse; adjusted/refunded si hay disputa o cancelacion con reglas aplicables.

### 3.28 Revenue Split

Proposito: representar distribucion entre plataforma, artista y potencialmente estudio.

Ownership: Appointment Economy.

Ciclo de vida: calculado con la cita; versionado si cambia la regla comercial.

### 3.29 Economy Risk Signal

Proposito: senalar inconsistencias economicas: duraciones atipicas, puntos excesivos, rewards sospechosos, montos anormales.

Ownership: Appointment Economy y Fairness Engine.

Ciclo de vida: generado al calcular economia; resuelto por revision o recalculo.

### 3.30 Loyalty Account

Proposito: representar saldo de Flow Points, tier, streak y estado de beneficios de una clienta.

Ownership: Loyalty & Flow Points.

Ciclo de vida: nace con Client o primera acumulacion; activo mientras la clienta participa; puede cerrarse o anonimizarse.

### 3.31 Flow Point Ledger Entry

Proposito: registrar movimientos atomicos de puntos: earn, spend, expire, adjust.

Ownership: Loyalty & Flow Points.

Ciclo de vida: append-only; no se edita destructivamente; correcciones se hacen con entries compensatorias.

### 3.32 Reward

Proposito: definir beneficios canjeables, costo en puntos, tipo, vigencia y reglas.

Ownership: Loyalty & Flow Points.

Ciclo de vida: draft, active, paused, retired.

### 3.33 Reward Redemption

Proposito: representar un canje de reward por una clienta.

Ownership: Loyalty & Flow Points.

Ciclo de vida: requested, confirmed, applied, expired, cancelled.

### 3.34 VIP Tier

Proposito: clasificar nivel de lealtad segun puntos o reglas de recurrencia.

Ownership: Loyalty & Flow Points.

Ciclo de vida: derivado; cambia por movimientos de puntos o reglas versionadas.

### 3.35 Streak

Proposito: medir continuidad de visitas de una clienta.

Ownership: Loyalty & Flow Points.

Ciclo de vida: aumenta con citas completed dentro de ventana valida; se congela o rompe con inactividad.

### 3.36 Promotion

Proposito: representar una accion comercial: happy hour, double points, low occupancy offer, private promo, early booking.

Ownership: Impulsa Tu Negocio.

Ciclo de vida: draft, scheduled, active, paused, completed, expired.

### 3.37 Automation Recommendation

Proposito: recomendar acciones basadas en puntos por vencer, streak risk, cumpleanos, baja ocupacion, clientes inactivos o progreso VIP.

Ownership: Impulsa Tu Negocio.

Ciclo de vida: generated, viewed, accepted, dismissed, expired.

### 3.38 Reactivation Opportunity

Proposito: identificar clientas con riesgo de abandono o inactividad.

Ownership: Impulsa Tu Negocio.

Ciclo de vida: detectada por inactividad; activa hasta que hay cita, respuesta, descarte o expiracion.

### 3.39 Business Insight

Proposito: explicar senales accionables de ocupacion, recurrencia, demanda, promociones y crecimiento.

Ownership: Impulsa Tu Negocio o Analytics segun origen.

Ciclo de vida: generado desde snapshots; visible mientras sea vigente; archivado al expirar.

### 3.40 Fairness Signal

Proposito: senalar posible sesgo o desequilibrio en exposicion, rewards, ocupacion, riesgo o distribucion de oportunidades.

Ownership: Fairness Engine.

Ciclo de vida: generado por evaluacion; agrupado en review si supera umbral; resuelto, ignorado o escalado.

### 3.41 Risk Flag

Proposito: marcar una entidad o transaccion para revision por riesgo operativo, economico o de fairness.

Ownership: Fairness Engine.

Ciclo de vida: open, under_review, resolved, dismissed.

### 3.42 Fairness Review

Proposito: agrupar flags y decisiones de equidad.

Ownership: Fairness Engine.

Ciclo de vida: abierto por senales; resuelto con decision manual o automatica controlada.

### 3.43 Metric Snapshot

Proposito: capturar una lectura historica de ocupacion, revenue, clientes, artistas, riesgo o performance.

Ownership: Analytics & Reporting.

Ciclo de vida: generado periodicamente o por evento; immutable salvo invalidacion controlada.

### 3.44 Portfolio Summary

Proposito: consolidar metricas por estudio, artista, cliente o ecosistema.

Ownership: Analytics & Reporting.

Ciclo de vida: derivado; recalculable; puede persistirse como snapshot para performance.

## 4. Relaciones y Cardinalidades

### 4.1 Relaciones 1:1

- User 1:1 Client Profile, cuando el usuario actua como clienta registrada.
- User 1:1 Artist, cuando el usuario representa una artista individual.
- Studio 1:1 Studio Professional Profile.
- Artist 1:1 Artist Professional Profile.
- Client 1:1 Loyalty Account.
- Appointment 1:1 Appointment Economy, cuando la cita es de tipo appointment.
- Commission 1:1 Appointment, porque una comision especifica nace de una cita especifica.

### 4.2 Relaciones 1:N

- Studio 1:N Governance Review.
- Studio 1:N Artist Studio Membership.
- Artist 1:N Artist Studio Membership.
- Studio 1:N Service Offering, si el servicio pertenece al estudio.
- Artist 1:N Service Offering, si el servicio pertenece a la artista.
- Artist Studio Membership 1:N Appointment.
- Client 1:N Appointment.
- Artist 1:N Appointment.
- Studio 1:N Appointment.
- Service Offering 1:N Appointment.
- Schedule 1:N Availability Slot.
- Schedule 1:N Calendar Block.
- Client 1:N Customer Relationship.
- Loyalty Account 1:N Flow Point Ledger Entry.
- Loyalty Account 1:N Reward Redemption.
- Reward 1:N Reward Redemption.
- Appointment 1:N Flow Point Ledger Entry, solo cuando la cita completed genera puntos o ajustes.
- Appointment 1:N Risk Flag.
- Studio 1:N Metric Snapshot.
- Artist 1:N Metric Snapshot.
- Promotion 1:N Automation Recommendation, cuando una recomendacion deriva en promocion.

### 4.3 Relaciones N:N

- Artist N:N Studio mediante Artist Studio Membership.
- User N:N Studio mediante Studio Team Role o membresias operativas.
- Client N:N Artist mediante Appointment, Customer Relationship y Favorite Artist.
- Client N:N Studio mediante Appointment y Customer Relationship.
- Service Offering N:N Promotion, porque una promocion puede aplicar a multiples servicios y un servicio puede aparecer en multiples promociones.
- Marketplace Listing N:N Fairness Signal, porque una evaluacion puede afectar varias apariciones y una aparicion puede tener varias senales.
- Client N:N Reward mediante Reward Redemption.

### 4.4 Cardinalidades Obligatorias

- Appointment requiere exactamente un Client.
- Appointment requiere exactamente un Artist.
- Appointment requiere exactamente un Service Offering.
- Appointment requiere exactamente un horario de inicio y fecha.
- Appointment debe tener Studio cuando ocurre dentro de estudio.
- Appointment debe tener Artist Studio Membership cuando ocurre bajo relacion artista-estudio.
- Artist Studio Membership requiere exactamente un Artist y exactamente un Studio.
- Commission requiere exactamente una Appointment.
- Appointment Economy requiere exactamente una Appointment.
- Loyalty Account requiere exactamente un Client.
- Flow Point Ledger Entry requiere exactamente un Loyalty Account.
- Flow Point Ledger Entry de tipo earn por cita requiere exactamente una Appointment completed.
- Reward Redemption requiere exactamente un Loyalty Account y exactamente un Reward.
- Marketplace Listing requiere una entidad publicable: Artist, Studio o Artist Studio Membership, segun la estrategia visible.

## 5. Invariantes

### Scheduling & Booking

- Una cita siempre tiene cliente.
- Una cita siempre tiene artista.
- Una cita siempre tiene servicio.
- Una cita de tipo appointment no puede tener importe economico si no tiene servicio.
- Un bloque de agenda no es una cita y no genera economia, comision ni loyalty.
- Una cita no puede solaparse con otra cita confirmada del mismo artista en el mismo intervalo.
- Una cita no puede solaparse con un Calendar Block activo del mismo schedule.
- Una cita marketplace solo puede crearse sobre disponibilidad visible y vigente.
- Una cita dentro de estudio debe referenciar una membership activa al momento de reservar.
- Una cita cancelled o no-show no puede generar puntos de loyalty como visita completada.

### Professional Network

- Una membership siempre conecta artista y estudio.
- Una membership active no puede existir sin Artist activo y Studio existente.
- Una artista puede pertenecer a multiples estudios.
- Un estudio puede tener multiples artistas.
- El historico de citas debe sobrevivir aunque una membership se inactive o archive.
- El `studioId` directo en Artist es redundante como fuente de verdad si existe Artist Studio Membership.

### Studio Governance

- Un estudio nuevo inicia como pending salvo aprobacion explicita.
- Solo un estudio approved puede tener visibilidad marketplace completa.
- Un estudio suspended no puede publicar nueva disponibilidad marketplace.
- La suspension no borra citas historicas ni comisiones.
- Cambios sensibles de estudio pueden requerir nueva governance review.

### Appointment Economy

- Una comision siempre nace de una cita.
- Una cita de tipo break no genera comision.
- La comision de plataforma se calcula desde el importe bruto vigente de la cita.
- El ingreso de artista no puede ser negativo.
- Appointment Economy puede estimarse antes de completion, pero solo se considera definitivo al completed.
- Ajustes economicos deben conservar trazabilidad historica.

### Loyalty & Flow Points

- Loyalty nunca se genera sin completed.
- Flow Points earn por cita requiere Appointment completed.
- Un canje no puede dejar saldo negativo.
- Los puntos expirados no pueden canjearse.
- Las redenciones deben registrarse como movimiento de ledger.
- Cambios de tier deben derivarse de ledger o reglas versionadas.
- Un birthday bonus requiere client birthday valido.
- Streak solo aumenta con visitas completadas dentro de la ventana valida.

### Marketplace

- Marketplace no es autoridad sobre agenda; consume disponibilidad.
- Marketplace no es autoridad sobre aprobacion; consume governance.
- Un perfil no visible no debe generar listings publicos.
- Favoritos no implican reserva ni relacion comercial por si solos.
- Badges derivados deben expirar o recalcularse.

### Customer 360

- Customer 360 no inventa historial; lo proyecta desde citas, loyalty y preferencias.
- Una relacion clienta-artista puede existir por cita, favorito o interaccion, pero su nivel de confianza depende del origen.
- Segmentos son derivados y recalculables.
- Datos de contacto del cliente deben tener un unico contexto autoridad.

### Impulsa Tu Negocio

- Una promocion no debe alterar historicos economicos ya cerrados.
- Una automatizacion es recomendacion hasta que se acepta o ejecuta.
- Reactivacion requiere evidencia de inactividad.
- Double points no puede otorgar puntos si la cita no termina completed.
- Promociones aplicadas a citas deben quedar trazables para economy, loyalty y fairness.

### Fairness Engine

- Fairness emite senales, no muta directamente agregados transaccionales.
- Un risk flag debe referenciar la entidad evaluada.
- Una senal de fairness debe conservar criterio, fecha y version de regla.
- Ajustes derivados de fairness deben ejecutarse en el contexto autoridad correspondiente.

### Analytics & Reporting

- Metric Snapshot no debe ser fuente transaccional.
- Toda metrica critica debe poder rastrearse a eventos o agregados fuente.
- Revenue reportado debe distinguir estimado, completado, ajustado y cancelado.

## 6. Eventos de Dominio por Contexto

### Identity & Access

- UserRegistered
- UserActivated
- UserSuspended
- RoleAssigned
- RoleRevoked
- PermissionEvaluated

### Studio Governance

- StudioRegistered
- StudioSubmittedForReview
- StudioApproved
- StudioChangesRequested
- StudioSuspended
- StudioReactivated
- GovernanceRiskFlagged

### Professional Network

- ArtistCreated
- ArtistProfileUpdated
- ArtistActivated
- ArtistDeactivated
- MembershipCreated
- MembershipActivated
- MembershipInactivated
- MembershipArchived
- StudioTeamRoleAssigned

### Service Catalog

- ServiceCategoryCreated
- ServiceOfferingCreated
- ServiceOfferingUpdated
- ServiceOfferingActivated
- ServiceOfferingSuspended
- ServiceTierChanged

### Scheduling & Booking

- ScheduleConfigured
- AvailabilityGenerated
- CalendarBlockCreated
- AppointmentReserved
- AppointmentScheduled
- AppointmentConfirmed
- AppointmentRescheduled
- AppointmentCompleted
- AppointmentCancelled
- AppointmentNoShowMarked

### Customer 360

- ClientCreated
- ClientProfileUpdated
- ClientPreferenceCaptured
- CustomerRelationshipCreated
- CustomerRelationshipUpdated
- ClientSegmentChanged
- FavoriteArtistAdded
- FavoriteArtistRemoved

### Marketplace

- MarketplaceProfileCreated
- MarketplaceProfilePublished
- MarketplaceProfileHidden
- ListingGenerated
- ListingViewed
- MarketplaceBadgeAssigned
- MarketplaceBadgeExpired
- FavoriteCaptured

### Appointment Economy

- AppointmentEconomyEstimated
- AppointmentEconomyFinalized
- CommissionCalculated
- CommissionEarned
- CommissionAdjusted
- EconomyRiskDetected

### Loyalty & Flow Points

- LoyaltyAccountCreated
- FlowPointsEarned
- FlowPointsSpent
- FlowPointsExpired
- RewardRedeemed
- RewardApplied
- VipTierChanged
- StreakAdvanced
- StreakBroken

### Impulsa Tu Negocio

- PromotionDrafted
- PromotionScheduled
- PromotionActivated
- PromotionPaused
- PromotionExpired
- AutomationRecommendationGenerated
- AutomationRecommendationAccepted
- AutomationRecommendationDismissed
- ReactivationOpportunityDetected
- BusinessInsightGenerated

### Fairness Engine

- FairnessSignalGenerated
- RiskFlagOpened
- RiskFlagReviewed
- RiskFlagResolved
- ExposureImbalanceDetected
- RewardAnomalyDetected
- EconomyAnomalyDetected

### Analytics & Reporting

- MetricSnapshotGenerated
- PortfolioSummaryGenerated
- OccupancyMetricCalculated
- RevenueMetricCalculated
- EcosystemInsightGenerated

## 7. Ownership de Datos

| Dato | Dueno | Contexto autoridad |
| --- | --- | --- |
| Identidad de usuario | Plataforma | Identity & Access |
| Rol y permisos | Plataforma | Identity & Access |
| Estado de estudio | Plataforma | Studio Governance |
| Perfil profesional de estudio | Studio owner, validado por plataforma | Studio Governance |
| Artista | Artista / plataforma | Professional Network |
| Perfil profesional de artista | Artista | Professional Network |
| Membership artista-estudio | Studio owner / artista, validado por reglas | Professional Network |
| Servicios ofrecidos | Artista o estudio | Service Catalog |
| Categorias de servicio | Plataforma | Service Catalog |
| Horarios y bloques | Artista o estudio | Scheduling & Booking |
| Citas | Artista/estudio con participacion de cliente | Scheduling & Booking |
| Cliente | Cliente / plataforma | Customer 360 |
| Preferencias de cliente | Cliente, artista o derivadas | Customer 360 |
| Favoritos | Cliente | Marketplace |
| Listing marketplace | Plataforma | Marketplace |
| Badges marketplace | Plataforma | Marketplace |
| Importe y split de cita | Plataforma segun regla comercial | Appointment Economy |
| Comision | Plataforma | Appointment Economy |
| Saldo Flow Points | Plataforma | Loyalty & Flow Points |
| Ledger de puntos | Plataforma | Loyalty & Flow Points |
| Rewards | Plataforma o estudio segun alcance | Loyalty & Flow Points |
| Promociones | Artista/estudio | Impulsa Tu Negocio |
| Automatizaciones | Plataforma como recomendador | Impulsa Tu Negocio |
| Fairness signals | Plataforma | Fairness Engine |
| Metric snapshots | Plataforma | Analytics & Reporting |

## 8. Dependencias Entre Contextos

### Dependencias fuertes

- Scheduling & Booking depende de Professional Network para validar Artist Studio Membership.
- Scheduling & Booking depende de Service Catalog para validar Service Offering.
- Scheduling & Booking depende de Customer 360 para validar Client.
- Appointment Economy depende de Scheduling & Booking para Appointment.
- Loyalty & Flow Points depende de Scheduling & Booking para AppointmentCompleted.
- Marketplace depende de Studio Governance para visibilidad.
- Marketplace depende de Scheduling & Booking para disponibilidad.
- Marketplace depende de Professional Network para perfiles publicables.

### Dependencias medias

- Customer 360 consume eventos de Scheduling, Loyalty y Marketplace.
- Impulsa Tu Negocio consume Customer 360, Scheduling, Loyalty, Marketplace y Analytics.
- Fairness Engine consume Appointment Economy, Marketplace, Loyalty, Scheduling y Governance.
- Analytics consume eventos de todos los contextos transaccionales.

### Dependencias que deben evitarse

- Marketplace no debe escribir citas directamente sin pasar por Scheduling.
- Loyalty no debe modificar Appointment.
- Appointment Economy no debe cambiar estado de Appointment.
- Analytics no debe ser usado como fuente de verdad operacional.
- Impulsa Tu Negocio no debe modificar saldos loyalty directamente.
- Fairness Engine no debe mutar visibilidad, puntos o comisiones sin evento/decision del contexto autoridad.

## 9. Entidades Posiblemente Redundantes

### Artist.studioId

Redundante si Artist Studio Membership es la fuente de verdad. Puede existir temporalmente como compatibilidad o proyeccion, pero no debe ser autoridad.

Decision logica: usar Artist Studio Membership como autoridad.

### ManagedArtist vs Artist

ManagedArtist parece una vista administrativa/proyeccion de Artist + Studio + revenue + status.

Decision logica: no debe ser entidad transaccional separada; debe ser projection/read model.

### ManagedClient vs Client

ManagedClient parece una vista de admin con segment, spend y appointment count.

Decision logica: no debe competir con Client; debe ser projection de Customer 360 + Analytics.

### ArtistProfile vs Artist Professional Profile

Si hay multiples estructuras de perfil, consolidarlas logicamente como Artist Professional Profile y separar campos privados/publicos por ownership y permisos.

### Client.flowPoints vs Loyalty Account

El saldo directo en Client es redundante si existe Loyalty Account + Ledger.

Decision logica: Client puede exponer saldo como proyeccion; Loyalty Account es autoridad.

### Appointment economy fields dentro de Appointment

Campos como grossAmount, platformFee, artistRevenue, pointsGranted y riskScore pueden vivir como snapshot de cita, pero la autoridad logica debe ser Appointment Economy.

Decision logica: Appointment referencia/expone economia; Appointment Economy conserva calculo y auditoria.

### Client History

ClientHistory es una proyeccion derivada de citas completed y datos economicos.

Decision logica: no tratarlo como fuente primaria.

### Marketplace Badge

Puede ser entidad si requiere auditoria/expiracion; si solo es calculo instantaneo, puede ser value object/proyeccion.

Decision logica: entidad ligera solo si afecta ranking, fairness o comunicacion historica.

## 10. Agregados Posiblemente Demasiado Grandes

### Client

Riesgo: incluir perfil, historial, puntos, rewards, segmentos, favoritos, notas, recomendaciones y automations dentro de un solo agregado.

Correccion logica: Client debe ser raiz de identidad 360; Loyalty Account, Customer Relationship, Favorite Artist y Automation Recommendation deben separarse.

### Appointment

Riesgo: convertir la cita en contenedor de agenda, economia, loyalty, risk, promocion y customer history.

Correccion logica: Appointment debe controlar estado de reserva y completion. Economy, Commission, Loyalty Ledger y Risk Flags deben ser agregados o entidades dependientes en sus contextos.

### Studio

Riesgo: incluir governance, perfil, artistas, servicios, clientes, revenue, metricas, marketing y marketplace.

Correccion logica: Studio es raiz governance/profesional; memberships, services, metrics, listings y promotions viven en contextos separados.

### Artist

Riesgo: mezclar identidad profesional, agenda, servicios, clientes, marketplace, revenue y memberships.

Correccion logica: Artist conserva perfil profesional; schedule, services, appointments, memberships y listings tienen ownership separado.

### Loyalty Account

Riesgo: almacenar saldo, historial completo, rewards, tier, streak, birthday, segmentos y automations como un bloque.

Correccion logica: Loyalty Account mantiene estado loyalty; ledger es append-only; rewards/redemptions son entidades separadas; birthday pertenece a Client Profile.

### Marketplace Listing

Riesgo: duplicar perfil completo, agenda, precios, ratings, badges y fairness dentro del listing.

Correccion logica: Listing debe ser una proyeccion publicable con referencias a fuentes autoridad.

## 11. Riesgos de Escalabilidad

### 11.1 Lecturas marketplace

Marketplace mezcla filtros por ubicacion, disponibilidad, status de estudio, perfil, rating, badges y fairness. Si se calcula todo en tiempo real puede volverse costoso.

Preparacion logica: usar listings/proyecciones recalculables y snapshots de disponibilidad visible.

### 11.2 Agenda y solapamientos

La agenda requiere validacion de conflictos por artista, fecha, hora, blocks y membership.

Preparacion logica: Appointment y Availability Slot deben tener invariantes fuertes y operaciones transaccionales claras.

### 11.3 Customer 360

Historial, segmentos, gasto, visitas, preferencias, loyalty y recomendaciones pueden crecer rapido.

Preparacion logica: separar fuente transaccional de proyecciones 360 y snapshots.

### 11.4 Loyalty ledger

Los movimientos de puntos pueden crecer por cada cita, promocion, expiracion, ajuste y canje.

Preparacion logica: ledger append-only con saldo proyectado y snapshots periodicos.

### 11.5 Analytics

Metricas de revenue, ocupacion, riesgo y portfolio pueden ser pesadas si se recalculan desde citas completas.

Preparacion logica: Metric Snapshots historicos y read models por periodo.

### 11.6 Fairness Engine

Evaluar exposicion, rewards y riesgo requiere datos de multiples contextos.

Preparacion logica: operar sobre eventos/snapshots, no sobre joins operacionales profundos.

### 11.7 Membership historica

Artistas pueden moverse entre estudios. Si la cita depende del estado actual de membership, se rompe el historico.

Preparacion logica: Appointment debe conservar referencia a membership vigente al momento de reserva/completion.

### 11.8 Promociones y double points

Promociones pueden multiplicar reglas de loyalty/economia.

Preparacion logica: registrar la promocion aplicada a la cita y versionar reglas.

### 11.9 Datos redundantes temporales

Campos derivados como spend, appointments count, occupancy, revenue o tier pueden divergir.

Preparacion logica: declarar autoridad y tratar estos campos como proyecciones.

## 12. Preparacion Conceptual para Supabase

Sin disenar tablas, SQL, migraciones ni RLS, se identifican candidatos logicos de persistencia.

### 12.1 Aggregates probablemente principales

- User
- Studio
- Artist
- Artist Studio Membership
- Service Offering
- Schedule
- Appointment
- Client
- Marketplace Profile
- Marketplace Listing
- Appointment Economy
- Commission
- Loyalty Account
- Reward
- Reward Redemption
- Promotion
- Fairness Review
- Risk Flag
- Metric Snapshot

### 12.2 Aggregates probablemente auxiliares

- Role
- Permission
- Studio Team Role
- Studio Professional Profile
- Artist Professional Profile
- Service Category
- Service Tier
- Availability Slot
- Calendar Block
- Client Preference
- Client Segment
- Customer Relationship
- Favorite Artist
- Marketplace Badge
- Revenue Split
- Economy Risk Signal
- Flow Point Ledger Entry
- Streak
- Automation Recommendation
- Reactivation Opportunity
- Business Insight
- Fairness Signal
- Portfolio Summary

### 12.3 Aggregates que requeriran auditoria historica

- Governance Review
- Studio status changes
- Artist Studio Membership status changes
- Appointment status changes
- Appointment reschedules
- Appointment cancellations/no-shows
- Appointment Economy finalization and adjustments
- Commission calculation and adjustments
- Revenue Split rule/version changes
- Flow Point Ledger Entry
- Reward Redemption
- VIP Tier changes
- Promotion activation/application
- Marketplace visibility changes
- Marketplace ranking/exposure decisions si afectan fairness
- Fairness Signal
- Risk Flag
- Fairness Review decisions
- Metric Snapshot
- Role Assignment and revocation

## 13. Modelo Logico Consolidado

El modelo definitivo queda organizado alrededor de Appointment como evento operacional central, pero no como agregado omnipotente.

La cita conecta:

- Client desde Customer 360.
- Artist desde Professional Network.
- Studio mediante Artist Studio Membership cuando aplica.
- Service Offering desde Service Catalog.
- Schedule y Availability desde Scheduling & Booking.
- Appointment Economy y Commission desde Appointment Economy.
- Loyalty Account y Flow Point Ledger desde Loyalty.
- Marketplace Listing si la reserva nacio desde Marketplace.
- Promotion si la reserva fue influida por Impulsa Tu Negocio.
- Fairness Signals si hay evaluacion de riesgo o exposicion.
- Metric Snapshots como lectura derivada.

La decision estructural mas importante es mantener el Modelo Hibrido mediante Artist Studio Membership como entidad logica de primer nivel. Esto evita que Artist pertenezca rigidamente a un solo Studio y permite historico, marketplace, agenda y comisiones por relacion profesional concreta.

La segunda decision estructural es separar datos transaccionales de proyecciones:

- Appointment no reemplaza Customer 360.
- Loyalty Account no reemplaza Client.
- Marketplace Listing no reemplaza Artist Profile.
- Metric Snapshot no reemplaza Appointment Economy.
- Managed views no reemplazan entidades fuente.

La tercera decision estructural es conservar auditoria en todos los puntos donde el negocio puede disputar, recalcular o explicar una decision: governance, memberships, citas, economia, loyalty, promociones, marketplace visibility y fairness.

