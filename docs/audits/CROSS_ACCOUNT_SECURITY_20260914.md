# Segunda revision de seguridad: aislamiento y roles

## Alcance

Solo analisis y pruebas en studioflow_audit_verified_20260913 dentro del
contenedor supabase_db_STUDIO_FLOW. Sin cambios en produccion ni Lookadoc.
Script: supabase/snippets/audit_cross_account_security.sql.
Se usaron registros existentes, SET ROLE authenticated/anon y JWT de una
clienta restaurada. Todas las escrituras se revirtieron con ROLLBACK.
No se imprimieron nombres, contactos ni importes privados.

## Hallazgos confirmados en la copia

1. CRITICO: studio_flow_assign_role acepta un rol de platform_owner sin
   comprobar la autoridad del solicitante. Una clienta pudo asignarse ese rol
   y llamar despues a la funcion de cobranza del owner.
2. CRITICO: studio_flow_bootstrap_profile acepta platform_owner como parametro
   y llama al asignador de roles. Se comprobo esta segunda via por separado,
   revirtiendo antes la primera asignacion. Bloquear solo la primera funcion
   como entrada publica no resuelve la segunda via.
3. ALTO: una clienta autenticada pudo leer 7 registros de otras clientas y
   8 citas ajenas mediante tablas directas. Las tablas conservadas no tienen RLS.
4. ALTO: una clienta pudo actualizar 1 registro de studio_profiles. La prueba
   uso description=description, sin introducir contenido y con rollback final.

## Controles que si rechazaron acceso

studio_flow_admin_get_clients rechazo a la clienta sin escalamiento con
Admin scope required, y a anon con Auth session required. Sin embargo, los
controles por rol son insuficientes mientras se permita autoasignarlos.

## Siguiente correccion propuesta

- Quitar ejecucion directa del asignador interno a roles de API.
- Restringir bootstrap a roles de registro permitidos, conservando las altas
  legitimas de clienta, artista y estudio. Auditar sus otras funciones llamantes.
- Revisar todas las funciones SECURITY DEFINER que alteran roles o perfiles.
- Aplicar politicas por propietario/relacion a lecturas y edicion de estudios,
  o sustituir los accesos directos por funciones autorizadas.
- Probar rechazos y flujos legitimos antes de desplegar.
- Revisar asignaciones privilegiadas reales en modo lectura para comprobar
  si hay roles inesperados; no borrar ni revocar cuentas reales sin revision.

La primera barrera de permisos sigue siendo util, pero no cierra estas vias.
No considerar la app lista para lanzamiento amplio con estos hallazgos abiertos.
No se intento explotar ni modificar roles en produccion.
