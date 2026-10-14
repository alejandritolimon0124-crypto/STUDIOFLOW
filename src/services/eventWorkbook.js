import { loadExcelRuntime } from './excelRuntime.js'
import { isCommissionWaived } from '../utils/commissionWaiver.js'

export async function buildEventWorkbook(payload, year, month) {
  const ExcelJS = await loadExcelRuntime()
  const book = new ExcelJS.Workbook()
  const sheet = book.addWorksheet('Eventos')
  const waived = isCommissionWaived(`${year}-${String(month).padStart(2, '0')}-01`)
  const profile = payload.profile
  sheet.addRow(['Studio Flow - Recibo mensual de comisiones', profile.name])
  sheet.addRow(['Nombre completo / responsable', profile.fullName || ''])
  sheet.addRow(['Celular', String(profile.phone || ''), 'Direccion', profile.address || ''])
  sheet.addRow(['Periodo', `${year}-${String(month).padStart(2, '0')}`])
  sheet.addRow(['Importes en MXN. Solo las citas completadas generan comision. No sumar reportes de artista y estudio: pueden incluir las mismas citas.'])
  sheet.addRow(['Fecha', 'Clienta', 'Servicio', 'Estudio', 'Estado', 'Costo normal', 'Happy Hour', 'Puntos otorgados', 'Puntos dobles', 'FlowPoints usados', 'Descuento %', 'Descuento $', 'Monto final pagado'])
  const statuses = { completed: 'Completada', cancelled: 'Cancelada', scheduled: 'Agendada', no_show: 'No asistio', disputed: 'En revision' }
  for (const event of payload.events) {
    const p = payload.payments[event.id]
    const statusLabel = event.status === 'cancelled' && event.provider_cancelled
      ? 'Cancelada por artista/estudio'
      : statuses[event.status] || event.status
    sheet.addRow([event.date, event.client || '', event.service || '', event.studio || 'Independiente', statusLabel,
      p?.original ?? null, event.happy_hour ? 'Si' : 'No', Number(event.awarded), Number(event.multiplier) > 1 ? 'Si' : 'No',
      p?.points ?? null, p?.discountPercent ?? null, p?.original != null && p?.total != null ? Math.round((p.original-p.total)*100)/100 : null, p?.total ?? null])
  }
  const end = sheet.rowCount
  const totalPoints = payload.events.reduce((sum, event) => sum + Number(event.awarded || 0), 0)
  const happyHourCount = payload.events.filter((event) => event.happy_hour).length
  const doublePointsCount = payload.events.filter((event) => Number(event.multiplier) > 1).length
  const completed = payload.events.filter((event) => event.status === 'completed')
  const commissionable = completed
  const missing = commissionable.some((event) => payload.payments[event.id]?.total == null)
  const total = completed.reduce((sum, event) => sum + Number(payload.payments[event.id]?.total || 0), 0)
  const income = sheet.addRow(['Ingresos de citas completadas'])
  income.getCell(13).value = missing ? 'INCOMPLETO: faltan importes' : end > 6 ? { formula: `SUMIF(E7:E${end},"Completada",M7:M${end})`, result: total } : 0
  const fee = sheet.addRow([waived ? 'Comision Studio Flow exenta' : 'Comision Studio Flow 10%'])
  const commission = waived ? 0 : commissionable.reduce((sum, event) => sum + Number(event.commission_amount ?? Math.round(Number(payload.payments[event.id]?.total || 0) * 10) / 100), 0)
  fee.getCell(13).value = !waived && missing ? 'INCOMPLETO' : Math.round(commission * 100) / 100
  const pointsSummary = sheet.addRow(['FlowPoints otorgados en el periodo'])
  pointsSummary.getCell(13).value = totalPoints
  const promoSummary = sheet.addRow(['Citas con promociones'])
  promoSummary.getCell(13).value = `Happy Hour: ${happyHourCount} / Puntos dobles: ${doublePointsCount}`
  for (const range of ['B1:M1', 'B2:M2', 'D3:M3', 'B4:M4', 'A5:M5', `A${income.number}:L${income.number}`, `A${fee.number}:L${fee.number}`, `A${pointsSummary.number}:L${pointsSummary.number}`, `A${promoSummary.number}:L${promoSummary.number}`]) sheet.mergeCells(range)
  sheet.columns.forEach((column, i) => { column.width = [23,30,30,25,18,18,16,19,18,19,18,18,18][i] || 20 })
  for (const n of [6,12,13]) sheet.getColumn(n).numFmt = '"$"#,##0.00'
  sheet.getRow(6).height = 32
  sheet.getRow(6).alignment = { vertical: 'middle', wrapText: true }
  sheet.eachRow((row) => { if (row.number > 6 && row.number <= end) row.alignment = { vertical: 'top', wrapText: true } })
  for (const n of [1,6,income.number,fee.number,pointsSummary.number,promoSummary.number]) {
    sheet.getRow(n).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    sheet.getRow(n).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF684653' } }
  }
  sheet.views = [{ state: 'frozen', ySplit: 6 }]
  sheet.autoFilter = { from: 'A6', to: `M${Math.max(6,end)}` }

  const invitationSheet = book.addWorksheet('Tarjetas digitales')
  const types = { none: 'Solo invitar', discount: 'Descuento', free_service: 'Servicio de regalo', referral: 'Ven con una amiga', pong: 'Juega y gana' }
  const invitationRows = payload.events.map((event) => ({ event, invitation: payload.invitations?.[event.id] })).filter((item) => item.invitation)
  const completedInvitations = invitationRows.filter(({ event }) => event.status === 'completed')
  const sum = (key) => completedInvitations.reduce((value, { invitation }) => value + Number(invitation[key] || 0), 0)
  invitationSheet.addRow(['Studio Flow · impacto de tarjetas digitales'])
  invitationSheet.addRow(['Periodo', `${year}-${String(month).padStart(2, '0')}`])
  invitationSheet.addRow(['Citas completadas', completedInvitations.length])
  invitationSheet.addRow(['Descuentos otorgados', sum('discountAmount')])
  invitationSheet.addRow(['Ingresos finales de esas citas', sum('netAmount')])
  invitationSheet.addRow(['FlowPoints otorgados por esas citas', sum('points')])
  invitationSheet.addRow([])
  invitationSheet.addRow(['Fecha', 'Clienta', 'Servicio reservado', 'Tarjeta', 'Beneficio aplicado', 'Servicio de la oferta', 'Descuento %', 'Descuento MXN', 'Importe final MXN', 'FlowPoints otorgados', 'Estado', 'Código'])
  for (const { event, invitation } of invitationRows) {
    invitationSheet.addRow([event.date, event.client || '', event.service || '', types[invitation.type] || invitation.type,
      invitation.benefit || '', invitation.serviceName || '', Number(invitation.discountPercent) || 0,
      Number(invitation.discountAmount) || 0, Number(invitation.netAmount) || 0,
      Number(invitation.points) || 0, statuses[event.status] || event.status, invitation.code || ''])
  }
  invitationSheet.mergeCells('A1:L1')
  invitationSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 15 }
  invitationSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF38262E' } }
  invitationSheet.getRow(8).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  invitationSheet.getRow(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF87566A' } }
  invitationSheet.columns.forEach((column, index) => { column.width = [22,28,29,21,23,29,16,19,20,22,18,29][index] })
  for (const column of [8,9]) invitationSheet.getColumn(column).numFmt = '"$"#,##0.00'
  invitationSheet.views = [{ state: 'frozen', ySplit: 8 }]
  invitationSheet.autoFilter = { from: 'A8', to: `L${Math.max(8,invitationSheet.rowCount)}` }
  const redemptionSheet = book.addWorksheet('Canjes de articulos')
  redemptionSheet.addRow(['Studio Flow - Canjes de articulos'])
  redemptionSheet.addRow(['Periodo', `${year}-${String(month).padStart(2, '0')}`])
  redemptionSheet.addRow(['Canjes registrados', payload.redemptions?.total || 0])
  redemptionSheet.addRow(['FlowPoints usados', payload.redemptions?.pointsTotal || 0])
  redemptionSheet.addRow(['Los puntos de articulos no tienen una equivalencia fija en pesos. El articulo y el efectivo se acuerdan en el local.'])
  redemptionSheet.addRow([])
  redemptionSheet.addRow(['Fecha', 'Clienta', 'FlowPoints usados', 'Folio'])
  for (const redemption of payload.redemptions?.items || []) {
    redemptionSheet.addRow([
      new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Mexico_City' }).format(new Date(redemption.redeemedAt)),
      redemption.clientName || '', Number(redemption.points) || 0, redemption.id.slice(0, 8).toUpperCase(),
    ])
  }
  redemptionSheet.mergeCells('A1:D1')
  redemptionSheet.mergeCells('A5:D5')
  for (const row of [1, 7]) {
    redemptionSheet.getRow(row).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    redemptionSheet.getRow(row).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF684653' } }
  }
  redemptionSheet.columns.forEach((column, index) => { column.width = [24, 34, 22, 20][index] })
  redemptionSheet.views = [{ state: 'frozen', ySplit: 7 }]
  redemptionSheet.autoFilter = { from: 'A7', to: `D${Math.max(7,redemptionSheet.rowCount)}` }
  return book.xlsx.writeBuffer()
}
