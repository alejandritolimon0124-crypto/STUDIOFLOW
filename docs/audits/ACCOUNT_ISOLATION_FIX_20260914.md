# Correccion de aislamiento y privilegios

## Cambios

Migracion 202609140013:
- Asignador de roles interno sin permisos EXECUTE para PUBLIC, anon o authenticated.
- Bootstrap acepta solo client/artist y rechaza perfiles suspendidos.
- RLS de appointments, clients, artists, service_offerings y studio_profiles.
- Lectura por cuenta propia, relacion con cita/clienta, estudio autorizado o owner.
- Edicion/upsert de studio_profiles solo owner de app o propietario autorizado
  del estudio; el gerente conserva lectura pero no obtiene edicion de perfil.
- Revocados delete/truncate de perfiles de estudio para authenticated.
- Helpers de seguridad evalúan siempre auth.uid() y estado activo.

Migracion 202609140014:
- El trigger de alta no acepta roles administrativos desde metadata de usuario.
- Solo artist se conserva como artista; otros valores se normalizan a client.
- El alta de un estudio sigue usando el flujo de studio_flow_bootstrap_studio
  que liga la propiedad al usuario autenticado y crea el estudio pendiente.

## Verificaciones

Ejecutadas en studioflow_audit_verified_20260913 del contenedor STUDIO_FLOW,
usando cuentas existentes, SET ROLE y ROLLBACK. No se crearon usuarios ficticios.
- verify_account_isolation: rechaza lectura ajena, escritura en estudio ajeno,
  asignacion de owner y bootstrap privilegiado; permite bootstrap client,
  perfil propio, marketplace, lectura de agenda/relaciones del estudio,
  update y upsert de perfil propio, y acceso de owner a cobranza/clientas.
- Perfil temporalmente suspendido: sin lecturas directas de tablas protegidas.
- verify_multiple_breaks: reservas, confirmacion, cancelacion, nueva reserva,
  rollback de canje fallido y disponibilidad en contextos artist/membership.
- verify_appointment_rewards: snapshot, idempotencia y canceladas sin puntos.

Las dos ultimas suites usan identidad JWT desde rol de auditoria. La suite
de aislamiento usa el rol real authenticated. La modificacion del trigger
de registro fue revisada por codigo; no se genero un usuario de prueba.

## Limites

Se cerraron las vias concretas detectadas, no se certifica seguridad completa.
Pendiente auditar las demas RPC, storage, concurrencia real, altas completas
con correo y roles privilegiados historicos (no se revocaron usuarios reales).
Los permisos conservan la posibilidad de leer a una clienta vinculada por citas
o relaciones de trabajo, pero no habilitan busquedas globales de clientas ajenas.
Pruebas visuales de los perfiles en produccion pendientes de sesion del usuario.
No se modifico Lookadoc ni registros de negocio de produccion.
