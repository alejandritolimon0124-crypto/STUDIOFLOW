# Auxiliares administrativos

Se revisaron las definiciones y dependencias de admin_artist_payload,
admin_governance_payload y record_claim_audit. Carecian de controles de
identidad propios y tenian acceso directo por roles de API. Las dos primeras
devuelven informacion administrativa; la tercera acepta actor y datos para
insertar eventos de auditoria. No se fabricaron eventos para demostrarlo.

Migracion 202609150001 revoca EXECUTE de PUBLIC, anon y authenticated.
No hay consumidores directos en src. Los consumidores SQL encontrados son
SECURITY DEFINER y mantienen llamadas internas.

Prueba verify_private_admin_helpers en studioflow_audit_verified_20260913:
- Permisos de los tres auxiliares rechazados para anon/authenticated.
- Llamada anonima a governance_payload rechazada.
- Owner autenticado conserva governance queue, listado de artistas y update
  de un perfil existente con parche vacio (revertido al terminar).

Sin datos ficticios ni alteraciones persistentes de cuentas. Correccion
publicada en Supabase Studio Flow; Lookadoc no fue modificado.
No se probaron flujos completos de invitacion/cancelacion de invitaciones:
solo se revisaron sus dependencias con el escritor de auditoria.
La auditoria global, concurrencia y almacenamiento remoto siguen pendientes.
