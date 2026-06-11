# FASE 15.6C - WAVE 2 AUDIT_EVENTS FIX REPORT

## Objetivo

Implementar la correccion confirmada para el fallo:

```txt
new row for relation audit_events violates check constraint
```

Constraint afectado:

```txt
audit_events_entity_type_check
```

## Estado

Implementado mediante migracion incremental.

## Archivo creado

| Archivo | Proposito |
|---|---|
| `supabase/migrations/202606110004_fix_wave_2_audit_entity_type.sql` | Re-declara solo las 5 RPC Wave 2 que insertan en `audit_events`, reemplazando `service_offerings` por `service_offering`. |

## Correccion aplicada

Valor anterior:

```txt
service_offerings
```

Valor corregido:

```txt
service_offering
```

Motivo:

`audit_events_entity_type_check` permite `service_offering` en singular.

## RPC corregidas

| RPC | Cambio |
|---|---|
| `studio_flow_artist_create_service_offering` | `entity_type = 'service_offering'` |
| `studio_flow_artist_update_service_offering` | `entity_type = 'service_offering'` |
| `studio_flow_artist_activate_service_offering` | `entity_type = 'service_offering'` |
| `studio_flow_artist_suspend_service_offering` | `entity_type = 'service_offering'` |
| `studio_flow_artist_archive_service_offering` | `entity_type = 'service_offering'` |

## No modificado

No se modifico:

- constraints
- tablas
- RLS
- grants
- `AppContext`
- UI
- service layer

## Auditoria Wave 1

Se encontro un caso equivalente en Wave 1:

| Archivo | RPC | Valor actual | Valor permitido por constraint | Estado |
|---|---|---|---|---|
| `supabase/migrations/202606110002_rpc_wave_1_artist_profile.sql` | `studio_flow_artist_save_own_profile` | `artist_profiles` | `artist_profile` | No corregido en esta fase |

Detalle:

```txt
audit_events_entity_type_check permite artist_profile, pero Wave 1 inserta artist_profiles.
```

Recomendacion:

Crear una migracion incremental separada para Wave 1 si el guardado de perfil artista falla con el mismo constraint.

## Validaciones

Busqueda en la migracion incremental:

```txt
service_offering aparece en los 5 INSERT INTO audit_events corregidos.
service_offerings no aparece como entity_type enviado en la migracion incremental.
```

Busqueda de cambios prohibidos:

```txt
No hay alter table.
No hay create table.
No hay create policy.
No hay enable row level security.
No hay grant execute.
No hay revoke.
```

## Build

Comando ejecutado:

```txt
npm run build
```

Resultado:

```txt
OK - vite build completed successfully.
```

Nota:

Vite emitio solo el warning existente de chunk mayor a 500 kB.

## Diff conceptual

```diff
- 'service_offerings'
+ 'service_offering'
```

Aplicado en los `INSERT INTO audit_events` de:

- create service
- update service
- activate service
- suspend service
- archive service

## Riesgo residual

| Riesgo | Estado |
|---|---|
| Wave 1 aun usa `artist_profiles` como `entity_type` en audit. | Detectado, no corregido por alcance. |
| La migracion SQL no fue ejecutada contra una DB local en esta sesion. | Pendiente deployment/validacion DB. |

## Veredicto

La causa raiz de Wave 2 queda corregida por migracion incremental sin tocar constraints ni frontend. La siguiente falla probable del mismo tipo esta en Wave 1 (`artist_profiles` vs `artist_profile`).
