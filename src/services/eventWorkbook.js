import { loadExcelRuntime } from './excelRuntime.js'

export async function buildEventWorkbook(payload, year, month) {
  const ExcelJS = await loadExcelRuntime()
  const book = new ExcelJS.Workbook()
  const sheet = book.addWorksheet('Eventos')
  const profile = payload.profile
  sheet.addRow(['Studio Flow - Eventos', profile.name])
  sheet.addRow(['Nombre completo / responsable', profile.fullName || ''])
  sheet.addRow(['Celular', String(profile.phone || ''), 'Correo', profile.email || ''])
  sheet.addRow(['Periodo', `${year}-${String(month).padStart(2, '0')}`])
  sheet.addRow(['Importes en MXN. Solo completadas generan comision. No sumar reportes de artista y estudio: pueden incluir las mismas citas.'])
  sheet.addRow(['Fecha', 'Clienta', 'Servicio', 'Estudio', 'Estado', 'Costo original', 'Happy Hour', 'Puntos otorgados', 'Multiplicador', 'Puntos aplicados', 'Descuento %', 'Descuento $', 'Total final'])
  const statuses = { completed: 'Completada', cancelled: 'Cancelada', scheduled: 'Agendada', no_show: 'No asistio', disputed: 'En revision' }
  for (const event of payload.events) {
    const p = payload.payments[event.id]
    sheet.addRow([event.date, event.client || '', event.service || '', event.studio || 'Independiente', statuses[event.status] || event.status,
      p?.original ?? null, event.happy_hour ? 'Si' : 'No', Number(event.awarded), event.multiplier ?? null,
      p?.points ?? null, p?.discountPercent ?? null, p?.original != null && p?.total != null ? Math.round((p.original-p.total)*100)/100 : null, p?.total ?? null])
  }
  const end = sheet.rowCount
  const completed = payload.events.filter((event) => event.status === 'completed')
  const missing = completed.some((event) => payload.payments[event.id]?.total == null)
  const total = completed.reduce((sum, event) => sum + Number(payload.payments[event.id]?.total || 0), 0)
  const income = sheet.addRow(['Ingresos de citas completadas'])
  income.getCell(13).value = missing ? 'INCOMPLETO: faltan importes' : end > 6 ? { formula: `SUMIF(E7:E${end},"Completada",M7:M${end})`, result: total } : 0
  const fee = sheet.addRow(['Comision Studio Flow 10%'])
  const commission = completed.reduce((sum, event) => sum + Math.round(Number(payload.payments[event.id]?.total || 0) * 10) / 100, 0)
  fee.getCell(13).value = missing ? 'INCOMPLETO' : end > 6 ? { formula: `SUMPRODUCT((E7:E${end}="Completada")*ROUND(M7:M${end}*10%,2))`, result: Math.round(commission*100)/100 } : 0
  for (const range of ['B1:M1', 'B2:M2', 'D3:M3', 'B4:M4', 'A5:M5', `A${income.number}:L${income.number}`, `A${fee.number}:L${fee.number}`]) sheet.mergeCells(range)
  sheet.columns.forEach((column, i) => { column.width = [23,30,30,25,18,18,16,19,18,19,18,18,18][i] || 20 })
  for (const n of [6,12,13]) sheet.getColumn(n).numFmt = '"$"#,##0.00'
  sheet.getRow(6).height = 32
  sheet.getRow(6).alignment = { vertical: 'middle', wrapText: true }
  sheet.eachRow((row) => { if (row.number > 6 && row.number <= end) row.alignment = { vertical: 'top', wrapText: true } })
  for (const n of [1,6,income.number,fee.number]) {
    sheet.getRow(n).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    sheet.getRow(n).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF684653' } }
  }
  sheet.views = [{ state: 'frozen', ySplit: 6 }]
  sheet.autoFilter = { from: 'A6', to: `M${Math.max(6,end)}` }
  return book.xlsx.writeBuffer()
}
