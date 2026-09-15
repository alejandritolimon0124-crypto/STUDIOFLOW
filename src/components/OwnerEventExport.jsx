import { useState } from 'react'
import { Download } from 'lucide-react'
import Button from './Button'
import { requireSupabase } from '../lib/supabaseClient'
import { buildEventWorkbook } from '../services/eventWorkbook'

export default function OwnerEventExport({ entityType, entityId }) {
  const [open,setOpen] = useState(false)
  const [month,setMonth] = useState(() => new Date().getMonth()+1)
  const [year,setYear] = useState(() => new Date().getFullYear())
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const [needsReload,setNeedsReload] = useState(false)
  async function download(event) {
    event.preventDefault(); setBusy(true); setError(''); setNeedsReload(false)
    let stage = 'events'
    try {
      const { data,error: failure } = await requireSupabase().rpc('studio_flow_owner_export_events',{ p_type: entityType,p_id: entityId,p_year: Number(year),p_month: Number(month) })
      if(failure) throw failure
      stage = 'excel'
      const buffer = await buildEventWorkbook(data,year,month)
      stage = 'download'
      const url = URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}))
      const link = document.createElement('a')
      link.href=url; link.download=`${String(data.profile.name).replace(/[<>:"/\\|?*]/g,'_')}_${year}-${String(month).padStart(2,'0')}.xlsx`
      document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(()=>URL.revokeObjectURL(url),60000)
    } catch(failure) {
      const message = failure.message || ''
      const networkFailure = /fetch|network|load.*module|import.*module/i.test(message)
      if (stage === 'events' && networkFailure) {
        setError('No se pudo conectar con Supabase para consultar los eventos. Revisa tu conexion y vuelve a presionar Descargar Excel. No se modificaron tus registros.')
      } else if (stage === 'excel' && networkFailure) {
        setNeedsReload(true)
        setError('No se pudo cargar el generador de Excel. Puede haber una actualizacion pendiente de la app o una falla de conexion. Recarga la pagina y vuelve a descargar.')
      } else {
        setError(`No se pudo ${stage === 'events' ? 'consultar los eventos' : stage === 'excel' ? 'generar el Excel' : 'descargar el archivo'}: ${message || 'Intenta nuevamente.'}`)
      }
    } finally { setBusy(false) }
  }
  return <div className="owner-agenda owner-event-export">
    <Button size="sm" onClick={()=>setOpen(!open)} aria-expanded={open}><Download size={16}/>Descargar eventos XLS</Button>
    {open && <form className="owner-agenda-filter" onSubmit={download}>
      <label>Mes<select value={month} onChange={e=>setMonth(e.target.value)}>{Array.from({length:12},(_,i)=><option key={i} value={i+1}>{new Intl.DateTimeFormat('es-MX',{month:'long'}).format(new Date(2000,i,1))}</option>)}</select></label>
      <label>Año<input type="number" required min="1900" max="9998" value={year} onChange={e=>setYear(e.target.value)}/></label>
      <Button type="submit" size="sm" disabled={busy}>{busy?'Preparando...':'Descargar Excel'}</Button>
      {error && <p role="alert">{error}</p>}
      {needsReload && <Button size="sm" onClick={() => window.location.reload()}>Recargar pagina</Button>}
    </form>}
  </div>
}
