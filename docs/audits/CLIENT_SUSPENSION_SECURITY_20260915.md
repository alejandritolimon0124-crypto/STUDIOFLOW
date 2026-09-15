# Permisos de suspension de clientas

Migracion 202609150003:
- activate/deactivate_client requieren platform owner antes de evaluar scope.
- update_own_client_profile requiere clients.status=active, no solo profiles.status.

Prueba verify_client_suspension_permissions en copia aislada, SET ROLE authenticated:
studio owner rechazado para ambas acciones; platform owner suspende y reactiva;
clienta suspendida rechazada al editar con la misma identidad. ROLLBACK final.
Sin modificar estados reales ni Lookadoc. Migracion aplicada en Supabase Studio Flow.

Alcance limitado: no se certifican aun todas las operaciones de artistas/clientas
suspendidas ni la revocacion de tokens, recuperacion de contrasena o almacenamiento.
La funcion artist_current_owned_artist permite artistas inactivas por diseno actual;
requiere revisar sus consumidores distinguiendo operaciones de recuperacion/consulta
de operaciones que deben bloquearse. No se cambio globalmente para evitar impedir
consulta de adeudos o correccion del perfil.
