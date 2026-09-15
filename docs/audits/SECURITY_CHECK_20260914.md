# Studio Flow: primera barrera de acceso directo

## Hallazgo confirmado

La copia restaurada tenia 45 tablas publicas sin RLS. En produccion se
comprobo acceso anonimo a profiles, appointments y flow_point_ledger con
consultas limit=0, sin descargar registros personales. Respuesta anterior: 200.

## Correccion aplicada

Migracion 202609140012:
- Revoca acceso directo de anon/PUBLIC a tablas existentes del esquema public.
- Revoca escrituras directas de authenticated excepto studio_profiles, cuyo
  editor actual depende de upsert y requiere una politica de propiedad separada.
- Revoca lecturas authenticated excepto las cinco tablas usadas directamente:
  appointments, clients, artists, service_offerings y studio_profiles.
- Conserva las funciones con validaciones propias y acceso SECURITY DEFINER.

Produccion, despues del cambio: las tres consultas anonimas devuelven 401.
No se modificaron citas, cobros, puntos ni usuarios de produccion.
Lookadoc no fue modificado.

## Pruebas ejecutadas

Base exclusiva: studioflow_audit_verified_20260913, contenedor supabase_db_STUDIO_FLOW.
Pruebas con datos restaurados existentes y ROLLBACK:
- verify_direct_table_security: restricciones de privilegios, lectura privada
  anonima rechazada, escritura directa de cita rechazada, ledger privado
  rechazado, perfil propio/marketplace accesibles por RPC y cobranza rechazada
  para una clienta usando SET ROLE authenticated.
- verify_multiple_breaks: disponibilidad, descansos, reserva manual/clienta,
  canje fallido revierte reserva, confirmacion, cancelacion y nueva reserva,
  tanto artista independiente como membership.
- verify_appointment_rewards: cancelacion pasada, snapshot, idempotencia y
  bloqueo de puntos para canceladas.
Los ultimos dos scripts ejercitan RPCs con identidad JWT desde el rol de
auditoria, no constituyen una prueba integral de permisos de cada pantalla.

## Pendiente importante antes de lanzamiento amplio

Esto NO completa la auditoria ni implementa aislamiento integral por usuario.
Falta limitar lecturas de las cinco tablas conservadas y escritura de
studio_profiles por propiedad/rol sin romper las consultas del editor.
Falta auditar autorizacion y grants de todas las RPC SECURITY DEFINER.
Falta prueba de reservas simultaneas en conexiones separadas (la nueva reserva
tras cancelar es secuencial y no demuestra concurrencia).
Faltan verificacion completa de registro/correos, cierres contables,
restauracion de respaldo y dispositivos fisicos.
