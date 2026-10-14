import { useState } from 'react'
import { AlertTriangle, Check, RefreshCw, X } from 'lucide-react'
import { requireSupabase } from '../lib/supabaseClient'
import useProviderAttendanceCases from '../hooks/useProviderAttendanceCases'
import './provider-attendance-gate.css'

export default function ProviderAttendanceGate({ studioId = null, enabled = true, forceReview = false, children }) {
  const { cases, loading, error, refresh } = useProviderAttendanceCases(studioId, enabled)
  const [savingId, setSavingId] = useState('')
  const [actionError, setActionError] = useState('')
  const overdue = cases.filter((item) => item.overdue && item.status === 'scheduled')
  const reviewCases = forceReview ? cases.filter((item) => item.status === 'scheduled') : overdue
  const resolve = async (appointment, action) => {
    setSavingId(appointment.id)
    setActionError('')
    try {
      if (action === 'cancel' && !window.confirm(`¿Confirmas que ${appointment.client} no recibió este servicio? La clienta podrá reportar una diferencia.`)) return
      const name = action === 'complete' ? 'studio_flow_complete_appointment'
        : action === 'correct' ? 'studio_flow_provider_correct_attendance' : 'studio_flow_artist_cancel_appointment'
      const { error: failure } = await requireSupabase().rpc(name, { p_appointment_id: appointment.id })
      if (failure) throw failure
      await refresh()
      window.dispatchEvent(new Event('studio-flow-appointment-completed'))
    } catch (failure) {
      setActionError(failure.message || 'No se pudo actualizar la cita.')
    } finally {
      setSavingId('')
    }
  }

  if (!enabled) return children
  if (loading) return <main className="attendance-gate"><p>Revisando el cierre de tus citas...</p></main>
  if (error) return <main className="attendance-gate"><h1>No pudimos revisar tus citas</h1><p>{error}</p><button type="button" onClick={refresh}><RefreshCw size={17} /> Reintentar</button></main>
  if (!reviewCases.length) return children

  return <main className="attendance-gate" aria-label="Citas pendientes de resolver">
    <div className="attendance-gate-head"><AlertTriangle size={27} /><span>ATENCIÓN A TUS CLIENTAS</span><h1>Estas citas necesitan tu respuesta</h1><p>{overdue.length ? 'Pasaron más de 24 horas desde que terminaron. Para continuar usando Studio Flow, marca cada una como completada o cancelada.' : 'Estas citas ya terminaron y aún esperan tu respuesta.'} Cuida a tus clientas: completar las citas que sí realizaste les acredita sus FlowPoints y les da una razón más para volver.</p></div>
    {actionError && <p className="attendance-gate-error" role="alert">{actionError}</p>}
    <div className="attendance-gate-list">{reviewCases.map((item) => <article key={item.id}>
      <strong>{item.client}</strong><span>{item.service}</span>
      <small>{new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City' }).format(new Date(item.startsAt))}</small>
      {item.claim === true && <p>La clienta confirmó que asistió. Esta cita debe completarse o aclararse con ella.</p>}
      {item.claim === false && <p>La clienta indicó que no asistió. Verifica antes de cerrar la cita.</p>}
      <div className="attendance-gate-actions"><button type="button" disabled={savingId === item.id} onClick={() => resolve(item, 'complete')}><Check size={17} /> Completada</button><button type="button" disabled={savingId === item.id || item.claim === true} onClick={() => resolve(item, 'cancel')}><X size={17} /> Cancelada</button></div>
    </article>)}</div>
    <button className="attendance-gate-refresh" type="button" onClick={refresh}><RefreshCw size={16} /> Actualizar citas</button>
  </main>
}
