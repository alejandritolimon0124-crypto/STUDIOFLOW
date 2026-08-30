delete from calendar_blocks
where reason = 'blocked_date'
  and status = 'active'
  and (starts_at at time zone 'America/Mexico_City')::date in (
    date '2026-05-20',
    date '2026-05-25',
    date '2026-06-02'
  );
