import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { buildEventWorkbook } from '../../src/services/eventWorkbook.js'

globalThis.ExcelJS = ExcelJS
const payload = {
  profile: { name: 'Prueba aislada', fullName: 'Perfil de prueba', phone: '0000000000', email: 'test@example.invalid' },
  events: [
    { id: 'a', date: '2026-09-16 10:00', status: 'completed', awarded: 40, multiplier: 2 },
    { id: 'b', date: '2026-09-16 12:00', status: 'cancelled', awarded: 0 },
    { id: 'c', date: '2026-09-16 13:00', status: 'scheduled', awarded: 0 },
  ],
  payments: {
    a: { original: 1000, total: 800, points: 10, discountPercent: 20 },
    b: { original: 900, total: 900, points: 0, discountPercent: 0 },
    c: { original: 500, total: 500, points: 0, discountPercent: 0 },
  },
}
async function sheet(data) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await buildEventWorkbook(data, 2026, 9))
  return workbook.getWorksheet('Eventos')
}
const result = await sheet(payload)
assert.equal(result.getCell('F7').value, 1000)
assert.equal(result.getCell('J7').value, 10)
assert.equal(result.getCell('L7').value, 200)
assert.equal(result.getCell('M7').value, 800)
assert.equal(result.getCell('M10').value.result, 800)
assert.equal(result.getCell('M11').value.result, 80)
assert.match(result.getCell('M10').value.formula, /SUMIF.*Completada/)
assert.match(result.getCell('M11').value.formula, /SUMPRODUCT.*Completada.*ROUND/)
assert.equal(result.getCell('B3').value, '0000000000')
const incomplete = await sheet({ ...payload, payments: {} })
assert.equal(incomplete.getCell('M10').value, 'INCOMPLETO: faltan importes')
const empty = await sheet({ ...payload, events: [] })
assert.equal(empty.getCell('M7').value, 0)
assert.equal(empty.getCell('M8').value, 0)
console.log('PASS: XLSX round trip; discounts and points; completed-only income and commission; missing amounts; empty export; phone preserves leading zeros.')
