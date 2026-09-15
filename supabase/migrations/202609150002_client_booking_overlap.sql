begin;
create extension if not exists btree_gist with schema extensions;
set local search_path=public,extensions;
-- Exclusion constraints arbitrate concurrent transactions, not just visible rows.
-- Adjacent appointments are allowed; cancellation releases the time range.
alter table public.appointments add constraint appointments_client_active_no_overlap
  exclude using gist (
    client_id with =,
    tstzrange(starts_at,ends_at,'[)') with &&
  ) where (status in ('scheduled','disputed'));
commit;
