# Revision de concurrencia de reservas

Revision de definiciones y restricciones en la copia aislada
studioflow_audit_verified_20260913, sin modificar datos ni produccion.

## Protecciones presentes

- Marketplace bloquea availability_slots seleccionados con FOR UPDATE.
- Indice unico de availability_slot_id para citas no canceladas.
- Trigger studio_flow_guard_new_booking_rules toma bloqueo transaccional
  por artist_id y vuelve a evaluar horario, descansos, bloqueos y solapamientos.
- slot_obeys_booking_rules compara citas de la artista entre contextos, con
  margen de intervalo y estados scheduled/disputed/completed.

## Riesgo pendiente

La comprobacion de solapamiento por client_id de marketplace ocurre antes del
INSERT y no bloquea la fila de la clienta. El trigger se serializa por artista,
no por clienta. Con artistas y slots distintos, dos transacciones pueden pasar
la consulta de ausencia de cita de la misma clienta antes de insertar.
No existe una restriccion de exclusion temporal por client_id en appointments.
Es un hallazgo por analisis; aun no se reprodujo con dos conexiones simultaneas.

## Siguiente prueba/correccion

Preparar dos reservas con datos existentes en una copia desechable aislada,
coordinar ambas conexiones y comprobar que solo una puede confirmar.
Revisar orden de bloqueos entre reserva manual, marketplace y canjes antes de
introducir serializacion por clienta. Revalidar solapamiento despues de obtener
el bloqueo; bloquear sin repetir la consulta no basta.
No afirmar que las pruebas secuenciales de rebooking demuestran concurrencia.

## Correccion y pruebas posteriores

Migracion 202609150002 agrega exclusion GiST por client_id y rango [inicio,fin)
para scheduled/disputed. Aplicada en copia y produccion sin modificar filas.
verify_client_booking_overlap verifica rechazo de empalme, citas consecutivas
y liberacion por cancelacion, reutilizando citas existentes con ROLLBACK.

Prueba de dos conexiones psql: A mueve temporalmente una cita existente a
2090-01-01 10:00-11:00 UTC y espera 35 segundos sin commit. B intenta mover otra
cita existente a ese rango y client_id con lock_timeout=1s. B recibe timeout
al comprobar la exclusion, demostrando espera por la transaccion concurrente.
A termina en ROLLBACK; B revierte al cerrar la conexion tras el error.
Un primer intento con espera de 12 segundos no coincidio temporalmente y
no se conto como evidencia de concurrencia. No se hicieron commits de prueba.
Esta es una prueba de la restriccion con dos conexiones, no un ensayo de dos
sesiones completas de navegador reservando por RPC.

verify_multiple_breaks sigue pasando para ambos contextos. Marketplace traduce
el error de exclusion a un mensaje de cita ya existente. Lookadoc sin cambios.
