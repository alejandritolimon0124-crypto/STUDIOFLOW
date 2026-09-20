import { useRef, useState } from 'react'
import { CalendarDays, Filter } from 'lucide-react'
import { requireSupabase } from '../lib/supabaseClient'
import { withAppointmentReporting } from '../services/appointmentPaymentService'
import OwnerAppointmentCard from './OwnerAppointmentCard'
import Button from './Button'
import OwnerEventExport from './OwnerEventExport'
import './ownerAgenda.css'


export default function OwnerAgenda({ entityType, entityId }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState([])
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [more, setMore] = useState(false)
  const [error, setError] = useState('')
  const [showFilter, setShowFilter] = useState(false)
  const [draftDate, setDraftDate] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const requestId = useRef(0)
  async function load(nextOffset = 0, day = selectedDate) {
    const request = ++requestId.current
    setLoading(true)
    setError('')
    try {
      const { data, error: failure } = await requireSupabase().rpc('studio_flow_owner_get_agenda', { p_entity_type: entityType, p_entity_id: entityId, p_offset: nextOffset, p_date: day || null })
      if (failure) throw failure
      const appointments = await withAppointmentReporting(data || [])
      if (request !== requestId.current) return
      setRows(appointments)
      setOffset(nextOffset)
      setMore(appointments.length === 10)
    } catch (failure) {
      if (request !== requestId.current) return
      setError(failure.message || 'No se pudo cargar la agenda.')
    } finally { if (request === requestId.current) setLoading(false) }
  }
  return <div className="owner-agenda">
    <div className="row-actions">
      <Button size="sm" onClick={() => { setOpen(!open); if (!open) load() }}><CalendarDays size={16} />{open ? 'Cerrar agenda' : 'Ver agenda'}</Button>
      <Button size="sm" aria-expanded={showFilter} onClick={() => setShowFilter(!showFilter)}><Filter size={16} />Filtrar</Button>
    </div>
    <OwnerEventExport entityType={entityType} entityId={entityId} />
    {showFilter && <form className="owner-agenda-filter" onSubmit={(event) => { event.preventDefault(); setSelectedDate(draftDate); setOpen(true); load(0, draftDate) }}>
      <label>Dia de la cita<input type="date" required value={draftDate} onChange={(event) => setDraftDate(event.target.value)} /></label>
      <Button size="sm" type="submit" disabled={loading || !draftDate}>Aplicar</Button>
      <Button size="sm" disabled={loading} onClick={() => { setSelectedDate(''); setDraftDate(''); setOpen(true); load(0, '') }}>Todas las fechas</Button>
    </form>}
    {open && <section aria-label="Agenda completa" className="owner-agenda-content">
      {loading && <p role="status">Cargando agenda...</p>}
      {error && <p role="alert">{error} <button onClick={() => load(offset)} type="button">Reintentar</button></p>}
      {!loading && !error && rows.length === 0 && <p>Sin eventos en esta pagina.</p>}
      {!loading && !error && rows.map((item) => <OwnerAppointmentCard key={item.id} appointment={item} />)}
      {!loading && !error && rows.length > 0 && (
        <p className="owner-agenda-points-summary">
          FlowPoints otorgados en esta pagina: <strong>{rows.reduce((total, item) => total + Number(item.pointsGranted || 0), 0)} FP</strong>
        </p>
      )}
      <div className="row-actions">
        <Button size="sm" disabled={loading || offset === 0} onClick={() => load(Math.max(0, offset - 10))}>Anterior</Button>
        <Button size="sm" disabled={loading || !more} onClick={() => load(offset + 10)}>Siguiente</Button>
      </div>
    </section>}
  </div>
}
