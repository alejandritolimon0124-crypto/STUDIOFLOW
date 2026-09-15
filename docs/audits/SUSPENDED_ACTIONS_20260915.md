# Acciones de cuentas suspendidas

verify_suspended_client_actions usa datos restaurados existentes y SET ROLE
authenticated en studioflow_audit_verified_20260913. Todo se revierte.

Comprobado: clients.status=inactive bloquea reserva marketplace, aplicacion de
reward y canje directo aunque profiles.status permanezca activo. Los errores
esperados son de estado de clienta, no de parametros ni disponibilidad.

Correccion 202609150004: la autorizacion del propietario para otorgar puntos
consultaba studios.status, columna inexistente. Ahora usa studio_status=approved.
Prueba: estudio suspendido con artista inactiva rechaza otorgamiento por scope.
verify_appointment_rewards sigue pasando (snapshot, idempotencia, canceladas).
Publicado en Supabase STUDIO_FLOW. No se modificaron registros reales ni Lookadoc.

Limites: no se probaron todas las combinaciones de artista activa/estudio
suspendido ni la recepcion de puntos por una clienta inactiva. No se probaron
revocacion de tokens ni correos de recuperacion. No equivale a auditoria completa.
