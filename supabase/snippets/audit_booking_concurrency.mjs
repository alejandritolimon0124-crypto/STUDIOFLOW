import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'

const database = 'studioflow_concurrency_audit_20260915'
function query(sql) {
  const process = spawn('docker', ['exec', '-i', 'supabase_db_STUDIO_FLOW', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', database, '-At'])
  let output = ''
  process.stdout.on('data', (data) => { output += data })
  process.stderr.on('data', (data) => { output += data })
  process.stdin.end(sql)
  return new Promise((resolve) => process.on('close', (code) => resolve({ code, output })))
}
const setup = await query(`
create table audit_concurrency_fixture as
select a.client_id,a.artist_id,a.studio_id,a.membership_id,a.service_offering_id,
 s.id schedule_id, gen_random_uuid() slot_id,
 '2040-01-16 10:00:00+00'::timestamptz starts_at
from appointments a join schedules s on s.membership_id=a.membership_id limit 1;
update schedules set timezone='UTC',status='active',archived_at=null,min_advance_hours=0,slot_interval_minutes=15
where id in(select schedule_id from audit_concurrency_fixture);
delete from schedule_rules where schedule_id in(select schedule_id from audit_concurrency_fixture);
insert into schedule_rules(schedule_id,weekday,is_active,start_time,end_time)
select schedule_id,extract(dow from starts_at)::integer,true,'08:00','20:00' from audit_concurrency_fixture;
insert into availability_slots(id,schedule_id,artist_id,studio_id,membership_id,starts_at,ends_at)
select slot_id,schedule_id,artist_id,studio_id,membership_id,starts_at,starts_at+interval '1 hour' from audit_concurrency_fixture;
`)
assert.equal(setup.code, 0, setup.output)
const insert = `insert into appointments(client_id,artist_id,studio_id,membership_id,service_offering_id,availability_slot_id,starts_at,ends_at,status,booking_source)
select client_id,artist_id,studio_id,membership_id,service_offering_id,slot_id,starts_at,starts_at+interval '1 hour','scheduled','studio' from audit_concurrency_fixture;`
const first = query(`set application_name='audit_booking_first'; begin; ${insert} select pg_sleep(12); commit;`)
let firstSleeping = false
for (let i = 0; i < 40; i++) {
  const state = await query("select count(*) from pg_stat_activity where application_name='audit_booking_first' and wait_event='PgSleep';")
  if (state.output.trim() === '1') { firstSleeping = true; break }
  await new Promise((resolve) => setTimeout(resolve, 100))
}
assert.ok(firstSleeping, 'First booking did not reach the uncommitted state')
const second = query(`set application_name='audit_booking_second'; begin; ${insert} commit;`)
let waiting = false
for (let i = 0; i < 20; i++) {
  const state = await query("select count(*) from pg_stat_activity where application_name='audit_booking_second' and wait_event_type='Lock';")
  if (state.output.trim() === '1') { waiting = true; break }
  await new Promise((resolve) => setTimeout(resolve, 100))
}
const firstResult = await first
const secondResult = await second
assert.ok(waiting, 'Second connection was not observed waiting on the lock')
assert.equal(firstResult.code, 0, firstResult.output)
assert.notEqual(secondResult.code, 0, 'Second booking unexpectedly succeeded')
assert.match(secondResult.output, /reglas de la agenda/)
const count = await query('select count(*) from appointments where availability_slot_id in(select slot_id from audit_concurrency_fixture);')
assert.equal(count.output.trim(), '1', count.output)
console.log('PASS: two connections overlapped; second waited for the lock; first committed; second was rejected; exactly one appointment persisted.')
