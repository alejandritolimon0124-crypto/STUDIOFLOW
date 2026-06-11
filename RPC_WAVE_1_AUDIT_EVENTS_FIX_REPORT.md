# FASE 15.6D - WAVE 1 AUDIT_EVENTS FIX REPORT

## Objetivo

Corregir `entity_type` en `studio_flow_artist_save_own_profile` para cumplir con:

```txt
audit_events_entity_type_check
```

## Estado

Implementado mediante migracion incremental.

## Archivo creado

| Archivo | Proposito |
|---|---|
| `supabase/migrations/202606110005_fix_wave_1_audit_entity_type.sql` | Re-declara solo `studio_flow_artist_save_own_profile` con `entity_type = 'artist_profile'`. |

## Correccion aplicada

Valor anterior:

```txt
artist_profiles
```

Valor corregido:

```txt
artist_profile
```

Motivo:

`audit_events_entity_type_check` permite `artist_profile` en singular.

## Alcance

Se re-declaro únicamente:

```txt
studio_flow_artist_save_own_profile
```

No se modifico:

- constraints
- tablas
- RLS
- grants
- `AppContext`
- UI
- service layer

## Validaciones

Busqueda en la migracion incremental:

```txt
create or replace function public.studio_flow_artist_save_own_profile
insert into audit_events
entity_type = 'artist_profile'
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
- 'artist_profiles'
+ 'artist_profile'
```

Aplicado en el `INSERT INTO audit_events` de:

```txt
studio_flow_artist_save_own_profile
```

## Veredicto

Wave 1 queda alineada con `audit_events_entity_type_check` sin cambiar schema, permisos ni frontend.
