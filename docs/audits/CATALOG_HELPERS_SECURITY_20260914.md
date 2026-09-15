# Auxiliares de catalogo y puntos

Migracion 202609140016: revoca EXECUTE de PUBLIC, anon y authenticated para
get_or_create_service_category, get_or_create_service_tier, service_to_json y
client_points_balance_for_reward (nombres completos en la migracion).

Las definiciones revisadas no validaban identidad/propiedad: dos mutan catalogos,
una serializa servicios sin filtrar estado y otra consulta puntos por client_id.
No tienen consumidores directos en src. Los consumidores internos encontrados
son SECURITY DEFINER y conservan acceso.

Pruebas en studioflow_audit_verified_20260913, contenedor STUDIO_FLOW:
- verify_private_catalog_helpers: permisos rechazados anon/authenticated,
  listado y actualizacion autorizados de un servicio existente con rol authenticated.
- verify_multiple_breaks: reservas, rollback de canje fallido, confirmacion,
  cancelacion y nueva reserva en artista independiente/membership.
Todas las mutaciones de prueba se revirtieron. Sin registros ficticios.

Cambios publicados en Supabase Studio Flow. Lookadoc no fue modificado.
Revision de archivos incompleta: src no usa storage.upload/getPublicUrl;
el almacenamiento local STUDIO_FLOW consultado no tiene buckets. Esto no
demuestra el estado del almacenamiento remoto ni certifica seguridad de fotos.
Pendientes: resto de RPC, storage remoto, concurrencia y roles reales actuales.
