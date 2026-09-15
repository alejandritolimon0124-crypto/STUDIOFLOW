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
  async function download(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const { data,error: failure } = await requireSupabase().rpc('studio_flow_owner_export_events',{ p_type: entityType,p_id: entityId,p_year: Number(year),p_month: Number(month) })
      if(failure) throw failure
      const buffer = await buildEventWorkbook(data,year,month)
      const url = URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}))
      const link = document.createElement('a')
      link.href=url; link.download=`${String(data.profile.name).replace(/[<>:"/\\|?*]/g,'_')}_${year}-${String(month).padStart(2,'0')}.xlsx`
      document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(()=>URL.revokeObjectURL(url),60000)
    } catch(failure) { setError(failure.message || 'No se pudo descargar.') } finally { setBusy(false) }
  }
  return <div className="owner-agenda">
    <Button size="sm" onClick={()=>setOpen(!open)} aria-expanded={open}><Download size={16}/>Descargar eventos XLS</Button>
    {open && <form className="owner-agenda-filter" onSubmit={download}>
      <label>Mes<select value={month} onChange={e=>setMonth(e.target.value)}>{Array.from({length:12},(_,i)=><option key={i} value={i+1}>{new Intl.DateTimeFormat('es-MX',{month:'long'}).format(new Date(2000,i,1))}</option>)}</select></label>
      <label>Año<input type="number" required min="1900" max="9998" value={year} onChange={e=>setYear(e.target.value)}/></label>
      <Button type="submit" size="sm" disabled={busy}>{busy?'Preparando...':'Descargar Excel'}</Button>
      {error && <p role="alert">{error}</p>}
    </form>}
  </div>
}
