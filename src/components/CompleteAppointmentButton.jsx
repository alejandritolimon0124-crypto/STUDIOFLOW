import { useEffect, useState } from 'react'
import Button from './Button'
import { requireSupabase } from '../lib/supabaseClient'

export default function CompleteAppointmentButton({ appointment }) {
  const [now, setNow] = useState(() => Date.now())
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer) }, [])
  const status = appointment.appointmentStatus || appointment.appointment_status
  if (done || status === 'completed') return <span role="status">Cita completada</span>
  if (status !== 'scheduled') return null
  const end = Date.parse(appointment.endsAt || appointment.ends_at || '')
  const eligible = Number.isFinite(end) && now >= end
  const complete = async () => {
    setSaving(true); setError('')
    try {
      const { error: failure } = await requireSupabase().rpc('studio_flow_complete_appointment', { p_appointment_id: appointment.id })
      if (failure) throw failure
      setDone(true)
      window.dispatchEvent(new Event('studio-flow-appointment-completed'))
    } catch (failure) { setError(failure.message) }
    finally { setSaving(false) }
  }
  return <div><Button size="sm" variant="success" disabled={!eligible || saving} onClick={complete} title={!eligible ? 'Disponible al terminar el horario de la cita' : 'Registrar servicio realizado'}>{saving ? 'Guardando...' : 'Completar cita'}</Button>{error && <small role="alert">{error}</small>}</div>
}
