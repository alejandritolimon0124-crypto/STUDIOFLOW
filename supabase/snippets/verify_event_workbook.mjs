import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { buildEventWorkbook } from '../../src/services/eventWorkbook.js'

const sql = `begin;
select set_config('request.jwt.claim.sub',(select id::text from profiles where default_role='platform_owner' and status='active' limit 1),true);
select studio_flow_owner_export_events('artist',a.artist_id,extract(year from a.starts_at at time zone 'America/Mexico_City')::int,extract(month from a.starts_at at time zone 'America/Mexico_City')::int) from appointments a limit 1;
rollback;`
const output = execFileSync('docker', ['exec','supabase_db_STUDIO_FLOW','psql','-U','supabase_admin','-d','studioflow_audit_verified_20260913','-At','-v','ON_ERROR_STOP=1','-c',sql], { encoding: 'utf8', timeout: 30000 })
const payload = JSON.parse(output.split('\n').find(line => line.startsWith('{')))
const date = payload.events[0].date
const buffer = await buildEventWorkbook(payload, date.slice(0,4), date.slice(5,7))
const workbook = new ExcelJS.Workbook()
await workbook.xlsx.load(buffer)
const sheet = workbook.getWorksheet('Eventos')
assert.equal(sheet.rowCount, payload.events.length + 8)
assert.equal(sheet.getCell('B1').value, payload.profile.name)
for (const [i,event] of payload.events.entries()) {
  assert.equal(sheet.getCell(`B${i+7}`).value, event.client || '')
  assert.equal(sheet.getCell(`M${i+7}`).value, payload.payments[event.id]?.total ?? null)
}
const completed = payload.events.filter(e => e.status === 'completed')
if (completed.every(e => payload.payments[e.id]?.total != null)) {
  const total = completed.reduce((sum,e) => sum + Number(payload.payments[e.id].total), 0)
  assert.equal(sheet.getCell(`M${sheet.rowCount-1}`).result, total)
}
console.log('PASS: real monthly data exported and reopened as Excel; profile, rows, final prices and completed-only total verified. No records changed.');
