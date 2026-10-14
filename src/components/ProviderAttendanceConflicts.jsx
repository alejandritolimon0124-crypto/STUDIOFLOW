import { useState } from 'react'
import { AlertCircle, Check } from 'lucide-react'
import { requireSupabase } from '../lib/supabaseClient'
import useProviderAttendanceCases from '../hooks/useProviderAttendanceCases'
import './provider-attendance-conflicts.css'

export default function ProviderAttendanceConflicts({ studioId = null, enabled = true }) {
  const { cases, error, refresh } = useProviderAttendanceCases(studioId, enabled)
  const [savingId, setSavingId] = useState('')
  const [actionError, setActionError] = useState('')
  const conflicts = cases.filter((item) => item.conflict)
  if (!enabled || (!conflicts.length && !error)) return null

  const correct = async (item) => {
    setSavingId(item.id)
    setActionError('')
    try {
      const { error: failure } = await requireSupabase().rpc('studio_flow_provider_correct_attendance', { p_appointment_id: item.id })
      if (failure) throw failure
      await refresh()
      window.dispatchEvent(new Event('studio-flow-appointment-completed'))
    } catch (failure) { setActionError(failure.message || 'No se pudo corregir la cita.') }
    finally { setSavingId('') }
  }

  return <section className="provider-conflicts" aria-label="Citas con respuestas diferentes">
    <div className="provider-conflicts-heading"><AlertCircle size={24} /><div><strong>Respuestas que no coinciden</strong><p>Revisa estas citas con tus clientas antes de dar el caso por cerrado.</p></div></div>
    {(error || actionError) && <p role="alert">{error || actionError}</p>}
    {conflicts.map((item) => <article key={item.id}>
      <strong>{item.client}</strong><span>{item.service}</span>
      <p>{item.claim ? 'La clienta dice que asistió; la cita aparece cancelada.' : 'La clienta dice que no asistió; la cita aparece completada.'}</p>
      {item.claim && <button type="button" disabled={savingId === item.id} onClick={() => correct(item)}><Check size={16} /> Corregir a completada</button>}
      {item.clientPhone && <a href={`https://wa.me/${String(item.clientPhone).replace(/\D/g, '').replace(/^(\d{10})$/, '52$1')}`} target="_blank" rel="noreferrer">Hablar con {item.client} por WhatsApp</a>}
      <small>Si la respuesta de la clienta no es correcta, comunícate con ella para que la cambie en su perfil.</small>
    </article>)}
  </section>
}
