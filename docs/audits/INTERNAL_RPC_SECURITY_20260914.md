# Revision de funciones auxiliares y roles

## Alcance

Solo copia studioflow_audit_verified_20260913 en supabase_db_STUDIO_FLOW.
Pruebas con registros restaurados existentes, SET ROLE anon, identidad vacia
y ROLLBACK. No se probaron escrituras ni se consultaron importes en produccion.
No se modifico Lookadoc. No se imprimieron datos personales ni saldos.

## Hallazgos confirmados

- ALTO: studio_flow_artist_schedule_payload(uuid) permite leer configuracion
  y bloqueos de agenda de una artista sin autenticar ni comprobar propiedad.
- ALTO: studio_flow_client_monthly_points_balance(uuid) permite consultar el
  saldo de cualquier clienta cuyo identificador se conozca, sin autenticar.
- CRITICO: studio_flow_sync_appointment_commission(uuid) permite a anon
  recalcular/sincronizar economia y comision, y devuelve importes de la cita.
  El ejemplo ejecutado uso una cita existente y fue revertido por completo.

Son SECURITY DEFINER con permiso EXECUTE anon, por lo que RLS de tablas no
protege estas entradas. El frontend no llama directamente estas tres funciones.
Se deben tratar como auxiliares internos y revocar ejecucion a roles API,
comprobando antes sus dependencias y los flujos legitimos que las invocan.
Hay otras funciones auxiliares expuestas que requieren clasificacion adicional;
no todas las funciones con EXECUTE anon son una vulnerabilidad (algunas validan
sesion internamente o sirven datos publicos de marketplace).

## Roles

La copia contiene 1 perfil activo con autoridad platform_owner y 0 asignaciones
activas platform_owner ligadas a un studio_id. No demuestra que el owner sea
legitimo ni refleja necesariamente las asignaciones actuales de produccion.
No se revocaron ni modificaron roles.

## Propuesta de correccion

Revocar EXECUTE a PUBLIC, anon y authenticated para auxiliares internos sin
consumidores directos en frontend. Mantener llamadas internas desde funciones
autorizadas. Ejecutar regresion de reservas, puntos, contabilidad y agenda.
Inventariar el resto de RPC y restringir cada entrada segun su contrato, sin
bloquear indiscriminadamente registro o marketplace publico.

Script reproducible: supabase/snippets/audit_internal_rpc_security.sql.
## Correccion posterior

Migracion 202609140015 aplicada en copia aislada y posteriormente en Supabase
STUDIO_FLOW: EXECUTE revocado a PUBLIC, anon y authenticated para las tres
funciones auxiliares confirmadas. Sus consumidores internos son SECURITY
DEFINER, por lo que conservan sus llamadas autorizadas.

Verificaciones posteriores:
- audit_internal_rpc_security: los tres accesos anonimos rechazados.
- verify_private_financial_helpers: permisos anon/authenticated rechazados,
  saldo y perfil propios disponibles para clienta, agenda y contabilidad
  disponibles para artista usando SET ROLE authenticated.
- verify_multiple_breaks y verify_appointment_rewards: sin regresiones en
  las pruebas existentes de reserva, cancelacion, rebooking e idempotencia.
- Produccion: solicitudes anonimas con identificadores nulos para no operar
  sobre registros reales, rechazadas por permisos.

Esta correccion no completa el inventario de RPC ni prueba concurrencia real.
No se alteraron roles o registros de negocio reales.
