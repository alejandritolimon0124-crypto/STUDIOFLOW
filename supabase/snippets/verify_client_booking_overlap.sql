begin;
do $$
declare a appointments%rowtype; b appointments%rowtype;
begin
  if current_database()<>'studioflow_audit_verified_20260913' then raise exception 'Isolated database required'; end if;
  select * into a from appointments where status='scheduled' order by starts_at desc limit 1;
  select * into b from appointments where status='scheduled' and id<>a.id order by starts_at desc limit 1;
  if a.id is null or b.id is null then raise exception 'Two existing appointments required'; end if;
  begin
    update appointments set client_id=a.client_id,starts_at=a.starts_at,ends_at=a.ends_at where id=b.id;
    raise exception 'Overlap was accepted';
  exception when exclusion_violation then
    raise notice 'PASS: overlapping active appointment rejected';
  end;
  -- Isolate this pair from other restored appointments inside the rollback only.
  update appointments set status='cancelled',cancelled_at=now()
    where client_id=a.client_id and status in ('scheduled','disputed') and id not in(a.id,b.id);
  update appointments set client_id=a.client_id,starts_at=a.ends_at,ends_at=a.ends_at+interval '30 minutes' where id=b.id;
  raise notice 'PASS: adjacent appointment accepted';
  update appointments set status='cancelled',cancelled_at=now() where id=a.id;
  update appointments set starts_at=a.starts_at,ends_at=a.ends_at where id=b.id;
  raise notice 'PASS: cancellation frees client time range';
end $$;
rollback;
