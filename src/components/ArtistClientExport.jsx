import { useState } from 'react'
import ExcelJS from 'exceljs'
import { Download } from 'lucide-react'
import Button from './Button'
import { requireSupabase } from '../lib/supabaseClient'

export default function ArtistClientExport() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function download() {
    setBusy(true)
    setError('')
    try {
      const { data, error: failure } = await requireSupabase().rpc('studio_flow_artist_export_clients')
      if (failure) throw failure
      const book = new ExcelJS.Workbook()
      const sheet = book.addWorksheet('Cartera de clientes')
      const p = data.profile
      sheet.addRows([
        ['Estudio / nombre comercial', p.name || ''],
        ['Nombre completo', p.fullName || ''],
        ['Correo', p.email || ''],
        ['Celular', String(p.phone || '')],
        ['Direccion', p.address || ''],
        ['Registro de clienta (hora de Mexico)', 'Nombre completo', 'Correo electronico', 'Celular'],
        ...data.clients.map(c => [c.registered, c.name || '', c.email || '', String(c.phone || '')]),
      ])
      sheet.columns.forEach((column, index) => { column.width = [38, 38, 38, 22][index] })
      for (let i = 1; i <= 5; i++) sheet.mergeCells(`B${i}:D${i}`)
      sheet.getRow(6).font = { bold: true, color: { argb: 'FFFFFFFF' } }
      sheet.getRow(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF684653' } }
      sheet.eachRow(row => { row.alignment = { wrapText: true, vertical: 'top' } })
      sheet.views = [{ state: 'frozen', ySplit: 6 }]
      sheet.autoFilter = `A6:D${Math.max(sheet.rowCount, 6)}`
      const buffer = await book.xlsx.writeBuffer()
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `Cartera_${String(p.name || 'artista').replace(/[<>:"/\\|?*]/g, '_')}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (failure) { setError(failure.message || 'No se pudo descargar la cartera.') }
    finally { setBusy(false) }
  }
  return <div style={{ marginBottom: 20 }}>
    <Button onClick={download} disabled={busy}><Download size={16} />{busy ? 'Preparando...' : 'Descargar cartera de clientes'}</Button>
    {error && <p role="alert">{error}</p>}
  </div>
}
