# ARCHITECTURE FREEZE

## 0. Alcance

Este documento congela las decisiones finales derivadas de `PRE_SQL_ARCHITECTURE_AUDIT.md` para preparar el paso posterior a diseno SQL.

No implementa cambios. No crea SQL. No crea migraciones. No modifica codigo.

Su funcion es fijar que debe corregirse en la arquitectura antes de convertirla en tablas reales, constraints, indices, triggers o politicas RLS.

## 1. Decisiones Aceptadas

### 1.1 Appointments

Decision congelada:

- Estados MVP de `appointments`:
  - `scheduled`
  - `completed`
  - `cancelled`
  - `no_show`
  - `disputed`

Decisiones especificas:

- `confirmed` queda eliminado.
- `reserved` queda eliminado de `appointments`.
- Una cita `scheduled` ya es una cita valida.
- Si se usa reserva temporal o hold, debe vivir en `availability_slots`, no en `appointments`.
- `availability_slots.status = held` podra representar un bloqueo temporal antes de crear cita.

Razon:

En Studio Flow, la cita agendada ya tiene validez operacional. Mantener `scheduled` y `confirmed` introduce una transicion que no aporta valor al MVP y puede romper economia, comisiones, loyalty y agenda.

### 1.2 Appointment Economy

Decision congelada:

- `appointment_economies` se crea al agendar la cita.

Estados finales:

- `quoted`
- `earned`
- `void`
- `disputed`
- `adjusted`

Semantica:

- `quoted`: snapshot economico creado al agendar.
- `earned`: economia devengada cuando la cita pasa a `completed`.
- `void`: economia anulada por cancelacion/no-show sin cobro aplicable.
- `disputed`: economia bajo disputa.
- `adjusted`: economia corregida por ajuste autorizado.

Razon:

El precio, la regla economica y la base de comision deben conservarse desde el momento de agendar. No deben depender de recalculos futuros ni de cambios posteriores de tarifas.

### 1.3 Commissions

Decision congelada:

- `commissions` se crea al agendar la cita.

Estados finales:

- `potential`
- `chargeable`
- `void`
- `disputed`
- `adjusted`

Semantica:

- `potential`: comision potencial creada al agendar.
- `chargeable`: comision cobrable/devengada al completar la cita.
- `void`: comision anulada por cancelacion o regla aplicable.
- `disputed`: comision bajo disputa.
- `adjusted`: comision corregida por ajuste autorizado.

Regla MVP:

- Comision base MVP: 10%.
- `rate` debe conservar el valor historico aplicado.
- `amount` debe conservar el monto historico calculado.
- `rate` y `amount` no deben depender de recalculos futuros.

Mapeo base:

- `appointment.scheduled` -> `commission.potential`
- `appointment.completed` -> `commission.chargeable`
- `appointment.cancelled` -> `commission.void`, salvo regla futura de cancelacion con cargo.
- `appointment.no_show` -> `commission.void` o `commission.disputed`, segun reglas de trust/no-show.
- `appointment.disputed` -> `commission.disputed`

Razon:

La comision nace como expectativa al agendar y se vuelve cobrable al completar. Esto permite medir revenue potencial, revenue devengado y disputas sin perder trazabilidad.

### 1.4 Service Offerings

Decision congelada:

- Un `service_offering` debe tener exactamente un owner operacional.

Owners permitidos:

- `artist`
- `studio`
- `membership`

Reglas:

- Servicio independiente: owner = `artist`.
- Servicio de estudio: owner = `studio`.
- Servicio de artista dentro de estudio: owner = `membership`.

Consecuencia sobre la arquitectura:

- El modelo con `artist_id` nullable y `studio_id` nullable no es suficiente para SQL final.
- Debe resolverse antes de SQL para impedir servicios sin owner o con owners contradictorios.
- El caso `membership` es obligatorio para representar correctamente artista dentro de estudio.

Razon:

El Modelo Hibrido necesita distinguir artista independiente, estudio y artista dentro de estudio. Sin owner unico, marketplace, agenda, comisiones y RLS quedan ambiguos.

### 1.5 Trust

Decision congelada para MVP:

- Trust MVP usa:
  - `risk_flags`
  - `sanctions`
  - `no_show_cases`
  - `audit_events`

Decision de fase posterior:

- `trust_events` queda preparado para fase posterior.
- `trust_scores` no entra hasta que existan reglas estables y versionadas.
- `trust_rules` no entra en MVP.

Semantica MVP:

- `risk_flags` registra senales de riesgo revisables.
- `sanctions` registra consecuencias operativas o restricciones.
- `no_show_cases` registra eventos de no-show y disputas.
- `audit_events` conserva trazabilidad transversal.

Impacto sobre marketplace:

- En MVP, marketplace visibility puede consultar flags/sanciones activas.
- No se debe calcular un trust score numerico sin reglas congeladas.
- Cualquier ocultamiento o restriccion debe ser trazable.

Razon:

Trust necesita datos historicos y reglas estables. Introducir `trust_scores` temprano crearia una falsa precision y riesgo de decisiones opacas.

### 1.6 Autoridad RLS por Contexto

Decision congelada:

- Cliente accede por `client_id`.
- Artista independiente accede por `artist_id`.
- Artista dentro de estudio accede por `membership_id`.
- Studio owner accede por `studio_id` y memberships del estudio.
- Studio manager accede por `studio_id` y memberships del estudio, limitado a permisos operativos.
- Platform owner accede globalmente.

Reglas conceptuales:

- `membership_id` es la autoridad para operaciones de artista dentro de estudio.
- `artist_id` es la autoridad para operaciones independientes de artista.
- `studio_id` es la autoridad para operaciones de estudio.
- `client_id` es la autoridad para datos propios de cliente.
- Platform owner opera como autoridad global auditada.

Razon:

Esta separacion reduce riesgo de filtraciones multi-studio y evita que una artista con varios estudios arrastre permisos entre contextos.

## 2. Decisiones Rechazadas

### 2.1 Mantener `confirmed` en appointments

Decision: rechazada.

Razon:

`confirmed` duplica a `scheduled` si la cita agendada ya es valida. Agrega complejidad sin beneficio claro para MVP.

### 2.2 Mantener `reserved` en appointments

Decision: rechazada.

Razon:

`reserved` representa hold temporal, no cita. Debe vivir en disponibilidad (`availability_slots`) si se implementa.

### 2.3 Crear `appointment_economies` solo al completar

Decision: rechazada.

Razon:

Se perderia el snapshot economico aceptado al agendar. Eso afectaria comisiones, disputas, reportes y cambios de precio.

### 2.4 Crear `commissions` solo al completar

Decision: rechazada.

Razon:

La comision nace como expectativa al agendar. Si se crea solo al completar, no existe revenue potencial ni trazabilidad de regla historica.

### 2.5 Usar `artist_id` y `studio_id` opcionales como unico ownership de service offerings

Decision: rechazada.

Razon:

Permite combinaciones invalidas: sin owner, doble owner ambiguo o servicio de artista dentro de estudio sin membership.

### 2.6 Incluir `trust_scores` en MVP

Decision: rechazada.

Razon:

No hay reglas estables ni versionadas para scoring. El MVP debe guardar eventos, flags y sanciones; el score puede venir despues.

### 2.7 Usar Fairness como unica fuente de Trust

Decision: rechazada.

Razon:

Trust se alimenta tambien de no-shows, cancelaciones, governance, sanctions y audit events. Fairness es una fuente, no la autoridad completa.

## 3. Arquitectura Final Congelada

### 3.1 Cambios respecto a `SUPABASE_ARCHITECTURE_MASTER.md`

Appointments:

- Remover `confirmed` de estados.
- Remover `reserved` de estados.
- Mantener `scheduled`, `completed`, `cancelled`, `no_show`, `disputed`.
- `reserved/held` se mueve conceptualmente a `availability_slots.status`.

Appointment Economy:

- Cambiar lifecycle para que nazca al agendar.
- Reemplazar estados `estimated`, `finalized`, `adjusted`, `void` por:
  - `quoted`
  - `earned`
  - `void`
  - `disputed`
  - `adjusted`

Commissions:

- Cambiar lifecycle para que nazca al agendar.
- Reemplazar estados `pending`, `earned`, `adjusted`, `refunded`, `void` por:
  - `potential`
  - `chargeable`
  - `void`
  - `disputed`
  - `adjusted`
- Congelar comision MVP en 10%.
- `amount` y `rate` deben tratarse como snapshot historico.

Service Offerings:

- Reemplazar ownership ambiguo por owner operacional unico.
- Incluir los owners conceptuales:
  - `artist`
  - `studio`
  - `membership`
- Resolver servicio de artista dentro de estudio mediante `membership`.

Trust:

- MVP queda basado en `risk_flags`, `sanctions`, `no_show_cases`, `audit_events`.
- `trust_events` se reconoce como fase posterior preparada.
- `trust_scores` queda fuera del MVP.

RLS:

- Congelar autoridad de acceso:
  - `client_id` para cliente.
  - `artist_id` para artista independiente.
  - `membership_id` para artista dentro de estudio.
  - `studio_id` + memberships para owner/manager.
  - acceso global para platform owner.

### 3.2 Que debe corregirse antes de SQL

Bloqueantes:

- Actualizar estados conceptuales de `appointments`.
- Actualizar estados conceptuales de `appointment_economies`.
- Actualizar estados conceptuales de `commissions`.
- Definir fisicamente como se expresara owner unico de `service_offerings`.
- Incorporar `membership` como owner posible de service offerings.
- Definir si `availability_slots` debe entrar en MVP si se requiere hold/reserved.
- Revisar referencias MVP hacia tablas fase posterior.
- Separar datos globales de cliente de notas internas por estudio/artista.
- Elegir autoridad entre `user_role_assignments` y `studio_team_members` para rol operativo por estudio.

No bloqueantes pero recomendados:

- Preparar `trust_events` para fase posterior.
- Mantener `trust_scores` fuera hasta tener reglas estables.
- Reducir polimorfismo donde RLS sea sensible.
- Documentar helpers conceptuales de RLS antes de politicas reales.
- Definir si loyalty es global, por estudio o mixto antes de reglas avanzadas.

## 4. Arquitectura Congelada por Contexto

### 4.1 Scheduling & Booking

Autoridad:

- `appointments`
- `appointment_status_events`
- `schedules`
- `calendar_blocks`
- `availability_slots` si se usa hold/reserved

Decision clave:

- Appointment solo representa cita real, no hold temporal.

### 4.2 Appointment Economy

Autoridad:

- `appointment_economies`
- `commissions`

Decision clave:

- Economia y comision nacen al agendar.
- Devengo ocurre al completar.

### 4.3 Service Catalog

Autoridad:

- `service_offerings`
- `service_categories`
- `service_tiers`

Decision clave:

- Todo servicio tiene exactamente un owner operacional.

### 4.4 Trust & Governance

Autoridad MVP:

- `risk_flags`
- `sanctions`
- `no_show_cases`
- `audit_events`

Decision clave:

- Trust MVP es evento/flag/sancion, no score.

### 4.5 RLS

Autoridades:

- Cliente: `client_id`
- Artista independiente: `artist_id`
- Artista en estudio: `membership_id`
- Studio owner/manager: `studio_id` + memberships
- Platform owner: global

Decision clave:

- `membership_id` es obligatorio como frontera de acceso para operaciones de artista dentro de estudio.

## 5. Riesgos Remanentes

### 5.1 Service Offerings

Aunque la decision de owner unico queda congelada, todavia falta expresar la forma fisica exacta antes de SQL.

Riesgo:

- Si se baja tal como esta el master actual, se mantendra ambiguedad.

### 5.2 Roles por estudio

`user_role_assignments` y `studio_team_members` siguen compitiendo conceptualmente.

Riesgo:

- RLS podria depender de dos fuentes de verdad.

### 5.3 Customer 360

`client_profiles.notes` sigue siendo riesgoso si mezcla notas internas y datos globales.

Riesgo:

- Clientes o estudios podrian acceder a datos internos que no les corresponden.

### 5.4 Availability Slots

`reserved/held` depende de `availability_slots`, pero esa tabla estaba en fase posterior.

Riesgo:

- Si MVP necesita hold temporal, `availability_slots` debe moverse a MVP.

### 5.5 Trust

Trust queda viable para MVP, pero no tiene scoring.

Riesgo:

- Marketplace visibility debe basarse solo en flags/sanciones explicitas, no en score implicito.

## 6. Veredicto Final

Estado: REQUIERE AJUSTES MENORES.

La auditoria previa marcaba `REQUIERE REDISENO PARCIAL`. Con las decisiones de este freeze, los puntos criticos quedan resueltos a nivel arquitectonico.

No obstante, todavia no esta listo para SQL hasta aplicar los ajustes documentales en `SUPABASE_ARCHITECTURE_MASTER.md` o en un documento de arquitectura fisica final.

Condicion para pasar a SQL:

- reflejar este freeze en el diseno fisico conceptual final
- eliminar estados rechazados
- corregir ownership de `service_offerings`
- cerrar autoridad de roles por estudio
- proteger Customer 360 separando notas internas
- decidir si `availability_slots` entra en MVP

Una vez aplicados esos ajustes, el proyecto podria pasar a diseno SQL con riesgo controlado.

