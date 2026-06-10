# PRE-SQL ARCHITECTURE AUDIT

## 0. Alcance

Auditoria critica de `SUPABASE_ARCHITECTURE_MASTER.md` antes de convertir la arquitectura conceptual en SQL.

No implementa cambios. No crea SQL. No crea migraciones. No modifica codigo.

El objetivo es identificar decisiones que deben congelarse antes de disenar tablas reales, constraints, indices, triggers o politicas RLS.

## 1. Hallazgos Criticos

### 1.1 Estados de `appointments` todavia no estan listos para SQL

El estado actual propone:

- `reserved`
- `scheduled`
- `confirmed`
- `completed`
- `cancelled`
- `no_show`
- `disputed`

Problema: `scheduled` y `confirmed` se pisan si en Studio Flow una cita agendada ya es valida. Mantener ambos puede generar ambiguedad operacional:

- Una cita `scheduled` puede ser tratada como no confirmada por algunos procesos.
- Marketplace podria mostrar slots como disponibles si espera `confirmed`.
- Appointment Economy podria no saber si debe calcular comision en `scheduled` o `confirmed`.
- Loyalty podria depender de una transicion innecesaria.

Conclusion critica: `confirmed` no parece necesario para el modelo base si agendar ya valida la cita.

Estados finales minimos sugeridos:

- `draft`: cita aun incompleta, opcional solo si existe flujo de formulario guardado.
- `scheduled`: cita valida/agendada.
- `completed`: servicio realizado.
- `cancelled`: cita cancelada antes de completion.
- `no_show`: una parte no se presento.
- `disputed`: cita bajo disputa operativa/economica.

Decision sugerida MVP:

- Usar `scheduled`, `completed`, `cancelled`, `no_show`, `disputed`.
- Evitar `confirmed` en MVP.
- Evitar `reserved` salvo que exista hold temporal de slot.
- Si hay reserva temporal, que viva en `availability_slots.status = held`, no en `appointments`.

Riesgo si se ignora:

- Estados duplicados.
- Reglas RLS mas complejas.
- Comisiones inconsistentes.
- Loyalty otorgado o bloqueado por transiciones ambiguas.
- Bugs de agenda al distinguir scheduled vs confirmed sin valor real.

## 2. Ciclo de Vida de `appointment_economies`

### 2.1 El documento no congela cuando nace la economia

Actualmente `appointment_economies` permite:

- `estimated`
- `finalized`
- `adjusted`
- `void`

Problema: si la comision nace al agendar, entonces la economia tambien debe nacer al agendar, al menos como snapshot economico inicial. Si se crea solo al completar, se pierde trazabilidad de:

- precio visto al reservar
- regla de comision vigente al agendar
- promocion aplicada
- expectativa de revenue
- posible disputa por cambio posterior de precio

Decision sugerida:

`appointment_economies` debe crearse al agendar la cita.

Estados economicos finales sugeridos:

- `quoted`: economia creada al agendar; snapshot inicial.
- `earned`: economia devengada al completar la cita.
- `void`: anulada por cancelacion/no-show sin cobro aplicable.
- `disputed`: bajo disputa.
- `adjusted`: corregida por ajuste posterior.

Alternativa si se quiere menos vocabulario:

- `estimated`
- `finalized`
- `void`
- `disputed`
- `adjusted`

Pero conceptualmente `quoted` es mas claro que `estimated`, porque representa el precio/regla aceptada al agendar.

Riesgo si se ignora:

- No habra prueba historica del precio original.
- Los cambios de tarifa podrian alterar interpretaciones futuras.
- La comision del 10% podria recalcularse con datos no vigentes.
- Reportes de revenue potencial vs revenue ganado quedaran mezclados.

## 3. Ciclo de Vida de `commissions`

### 3.1 La comision debe nacer al agendar

La arquitectura dice que la comision nace de una cita, pero no congela cuando aparece el registro.

Si Studio Flow considera que la comision nace al agendar, entonces `commissions` debe crearse junto con `appointment_economies`, en estado potencial.

Estados finales sugeridos:

- `potential`: comision creada al agendar; aun no cobrable.
- `chargeable`: comision cobrable/devengada cuando la cita pasa a `completed`.
- `void`: anulada por cancelacion o regla aplicable.
- `disputed`: bajo disputa.
- `adjusted`: modificada por ajuste autorizado.

Mapeo con appointment:

- `appointment.scheduled` -> `commission.potential`
- `appointment.completed` -> `commission.chargeable`
- `appointment.cancelled` -> `commission.void`, salvo regla de cancelacion con cargo.
- `appointment.no_show` -> `commission.void` o `disputed`, segun reglas de penalizacion.
- `appointment.disputed` -> `commission.disputed`

### 3.2 Comision del 10%

La regla base del proyecto indica comision de plataforma del 10%.

Decision sugerida:

- `commissions.rate` debe congelar `0.10` para MVP.
- `commissions.amount` debe ser snapshot calculado desde `appointment_economies.gross_amount`.
- La regla de 10% debe versionarse conceptualmente, aunque no se cree tabla de reglas en MVP.

Riesgo si se ignora:

- Comisiones recalculadas con tasas futuras.
- Disputas imposibles de explicar.
- Diferencias entre `appointment_economies.platform_fee_amount` y `commissions.amount`.
- Doble fuente de verdad economica.

## 4. Ownership de `service_offerings`

### 4.1 El ownership actual es ambiguo

`service_offerings` tiene:

- `artist_id` nullable
- `studio_id` nullable

Esto permite cuatro casos:

- servicio sin artista y sin estudio
- servicio solo de artista
- servicio solo de estudio
- servicio de artista y estudio

El cuarto caso puede ser valido, pero no queda claro si representa:

- servicio del estudio realizado por cualquier artista
- servicio propio de artista dentro de un estudio
- servicio duplicado entre estudio y artista
- servicio vendido por una membership concreta

### 4.2 Decision final sugerida

El servicio vendible debe pertenecer a un scope operacional unico.

Scopes sugeridos:

- `artist`: servicio de artista independiente.
- `studio`: servicio del estudio, no necesariamente de una artista especifica.
- `membership`: servicio de una artista dentro de un estudio.

Decision recomendada para Studio Flow:

- Para artista independiente: servicio pertenece a `artist`.
- Para artista dentro de estudio: servicio pertenece a `artist_studio_membership`.
- Para servicio general de estudio: servicio pertenece a `studio`.

La arquitectura actual no tiene `membership_id` en `service_offerings`. Ese es el hueco mas importante.

Ajuste recomendado antes de SQL:

- Definir un ownership exclusivo para `service_offerings`.
- Evitar que `artist_id` y `studio_id` opcionales sean la unica forma de expresar ownership.
- Considerar `owner_type` + `owner_id` solo si se acepta polimorfismo, pero para RLS seria mas seguro usar columnas explicitas con reglas de exclusividad.
- Agregar conceptualmente `membership_id` como opcion de ownership, o crear una tabla de servicios por membership.

Riesgo si se ignora:

- Servicios visibles en el estudio equivocado.
- Artistas independientes mezcladas con servicios de estudio.
- RLS ambigua.
- Comisiones asignadas al scope incorrecto.
- Marketplace mostrando servicios que una artista no ofrece en esa ubicacion.

## 5. Modelo de Trust

### 5.1 Trust esta incompleto como contexto fisico

La arquitectura incluye:

- `risk_flags`
- `sanctions`
- `no_show_cases`
- `audit_events`
- `fairness_signals`

Pero no incluye un modelo explicito para trust score, trust events o trust rules.

Esto deja una pregunta critica sin resolver:

Como se convierte un no-show, cancelacion, sancion, governance issue o fairness signal en impacto operativo?

### 5.2 Tablas faltantes conceptuales

Antes de SQL conviene decidir si se necesitan:

- `trust_events`: eventos normalizados que alimentan confianza.
- `trust_scores`: score actual por client, artist, studio o profile.
- `trust_rules`: reglas/versiones que convierten eventos en score.

No necesariamente todas deben entrar en MVP, pero la arquitectura debe declarar si Trust sera:

- derivado bajo demanda desde eventos existentes
- snapshot persistido
- score operacional que impacta marketplace y reservas

### 5.3 Flujo trust sugerido

Fuentes de trust:

- no-shows
- cancelaciones tardias
- disputes
- sanctions
- governance reviews
- risk flags
- fairness signals
- marketplace abuse
- reward abuse

Salidas de trust:

- marketplace visibility
- ranking/boost/reduccion
- capacidad de reservar
- requerir revision manual
- restricciones temporales
- alertas a platform owner

Decision sugerida:

- MVP: usar `risk_flags` + `sanctions` + `audit_events`.
- Prever `trust_events` como tabla futura mas importante que `trust_scores`.
- Crear `trust_scores` solo cuando exista una regla clara y estable de scoring.
- No hacer que `fairness_signals` sea la unica fuente de trust.

Riesgo si se ignora:

- Marketplace visibility se ajustara sin trazabilidad.
- Sanciones pareceran decisiones manuales sin base.
- No-shows no tendran impacto consistente.
- Fairness y Trust se mezclaran sin ownership claro.

## 6. Riesgos RLS por Rol y Escenario

### 6.1 Cliente global

Riesgo:

- `clients` puede tener datos globales, pero `client_profiles.notes` puede contener notas internas de artista/estudio.
- Si la clienta ve su perfil completo, podria ver notas internas.
- Si un estudio ve `client_profiles`, podria ver datos capturados por otro estudio.

Ajuste recomendado:

- Separar datos globales de cliente de notas/relacion por estudio o artista.
- Usar `customer_relationships` para datos scoped por artista/estudio.
- No guardar notas internas globales en `client_profiles`.

### 6.2 Artista independiente

Riesgo:

- Muchas reglas asumen `studio_id` opcional, pero no definen scope alternativo limpio.
- Promociones, servicios, rewards y marketplace pueden quedar sin owner claro.

Ajuste recomendado:

- Definir que artista independiente opera por `artist_id`.
- Servicios, agenda, promotions y marketplace deben poder resolverse solo con `artist_id`.
- No requerir membership para independientes.

### 6.3 Artista dentro de estudio

Riesgo:

- La arquitectura duplica `artist_id`, `studio_id`, `membership_id`.
- RLS puede permitir acceso por `artist_id` aunque la cita pertenezca a otro estudio donde esa artista tambien trabaja.

Ajuste recomendado:

- Para operaciones dentro de estudio, `membership_id` debe ser la autoridad del scope.
- `artist_id` y `studio_id` en appointment pueden existir como snapshot/denormalizacion, pero deben derivar de membership.

### 6.4 Studio owner

Riesgo:

- Puede necesitar ver todas las citas de su estudio, pero no citas independientes de una artista que tambien trabaja ahi.
- Si RLS usa solo `artist_id`, el owner podria ver datos fuera de su estudio.

Ajuste recomendado:

- Studio owner debe acceder por `studio_id` o memberships del estudio, no por artist global.

### 6.5 Studio manager operativo

Riesgo:

- `studio_team_members` y `user_role_assignments` se pisan.
- No queda claro si manager tiene permisos por role assignment o team membership.

Ajuste recomendado:

- Elegir una tabla autoridad para rol operativo por estudio.
- La otra debe ser eliminada o declarada proyeccion.

### 6.6 Platform owner

Riesgo:

- Tiene acceso transversal, pero tablas polimorficas como `audit_events`, `fairness_signals`, `metric_snapshots` no tendran integridad fuerte.

Ajuste recomendado:

- Platform owner puede acceder globalmente, pero los eventos criticos deben conservar contexto suficiente: `studio_id`, `artist_id`, `client_id`, `appointment_id` cuando aplique, no solo `entity_type/entity_id`.

## 7. Ajustes Recomendados Antes de SQL

### Criticos

- Eliminar `confirmed` como estado base de appointment.
- Decidir si `reserved` vive en `availability_slots`, no en `appointments`.
- Crear `appointment_economies` al agendar, no solo al completar.
- Crear `commissions` al agendar en estado `potential`.
- Congelar comision MVP en 10% como snapshot versionado.
- Resolver ownership exclusivo de `service_offerings`.
- Definir si servicios dentro de estudio pertenecen a `membership`.
- Separar datos globales de cliente de notas internas por relacion.
- Elegir entre `user_role_assignments` y `studio_team_members` como autoridad de rol por estudio.

### Importantes

- Definir si `loyalty_accounts` es global o por estudio.
- Eliminar referencias MVP hacia tablas fase posterior, especialmente `vip_tier_id` y `availability_slot_id`, o mover esas tablas a MVP.
- Decidir estrategia unica de eventos de estado: especifica por tabla o `status_change_events`.
- Declarar Trust como contexto real o como proyeccion de risk/sanctions.
- Reducir polimorfismo donde RLS sera sensible.

### Posteriores

- Formalizar `trust_events`, `trust_scores` y `trust_rules`.
- Separar marketplace listing materializado de perfil marketplace si el volumen crece.
- Introducir `revenue_splits` antes de pagos reales multi-party.
- Introducir `marketplace_events` antes de fairness de exposicion.

## 8. Decisiones Finales Sugeridas

### Appointments

Estados finales MVP:

- `scheduled`
- `completed`
- `cancelled`
- `no_show`
- `disputed`

Opcional:

- `draft`, solo si existe guardado parcial.

No recomendado:

- `confirmed`, porque agendada ya es valida.
- `reserved`, salvo como hold de slot fuera de appointment.

### Appointment Economy

Crear al agendar.

Estados finales:

- `quoted`
- `earned`
- `void`
- `disputed`
- `adjusted`

### Commissions

Crear al agendar.

Estados finales:

- `potential`
- `chargeable`
- `void`
- `disputed`
- `adjusted`

Regla MVP:

- comision base 10%
- amount y rate como snapshot
- ajustes por eventos compensatorios/auditables

### Service Offerings

Decision sugerida:

- Servicio independiente: owned by artist.
- Servicio de estudio general: owned by studio.
- Servicio de artista dentro de estudio: owned by membership.

Regla:

- un servicio debe tener exactamente un owner operacional.

### Trust

Decision sugerida:

- MVP: `risk_flags`, `sanctions`, `no_show_cases`, `audit_events`.
- Futuro: `trust_events` antes que `trust_scores`.
- `trust_scores` solo cuando haya reglas estables y versionadas.

### RLS

Decision sugerida:

- Cliente accede por `client_id`.
- Artista independiente accede por `artist_id`.
- Artista en estudio accede por `membership_id`.
- Studio owner/manager accede por `studio_id` y memberships del estudio.
- Platform owner accede globalmente.

## 9. Riesgos si se Ignoran los Ajustes

- SQL con constraints imposibles de expresar limpiamente.
- RLS fragil y dificil de auditar.
- Leaks de datos entre estudios.
- Artistas multi-studio viendo o exponiendo datos del scope incorrecto.
- Comisiones inconsistentes entre agendado y completado.
- Marketplace mostrando servicios equivocados.
- Loyalty o trust afectados por eventos ambiguos.
- Customer 360 mezclando datos globales y notas privadas.
- Redisenos costosos despues de migrar datos reales.

## 10. Veredicto Final

Estado: REQUIERE REDISENO PARCIAL.

La arquitectura esta suficientemente madura como mapa conceptual, pero no debe pasar todavia a SQL.

Los puntos que bloquean el paso a SQL son:

- estados de appointment no congelados
- ciclo economico/comision no cerrado
- ownership ambiguo de service offerings
- trust incompleto
- RLS multi-studio todavia riesgoso
- datos de cliente globales mezclados con datos internos

Cuando esas decisiones se congelen, el diseno podria bajar a SQL con mucha mas seguridad y menos deuda estructural.

