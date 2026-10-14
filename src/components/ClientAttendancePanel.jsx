import { useEffect, useMemo, useState } from 'react'
import { HeartHandshake } from 'lucide-react'
import { requireSupabase } from '../lib/supabaseClient'
import useCurrentTime from '../hooks/useCurrentTime'
import './client-attendance-panel.css'

export default function ClientAttendancePanel({ appointments = [], enabled = true }) {
  const now = useCurrentTime()
  const [claims, setClaims] = useState([])
  const [savingId, setSavingId] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!enabled) return undefined
    let active = true
    requireSupabase().rpc('studio_flow_client_attendance_claims').then(({ data, error: failure }) => {
      if (active) {
        if (failure) setError(failure.message)
        else setClaims(Array.isArray(data) ? data : [])
      }
    })
    return () => { active = false }
  }, [enabled])

  const claimById = useMemo(() => new Map(claims.map((item) => [item.appointmentId, item])), [claims])
  const cases = appointments.filter((item) => {
    const end = Date.parse(item.endsAt || item.ends_at || '')
    const status = item.appointmentStatus || item.appointment_status
    const claim = claimById.get(item.id)
    const conflict = claim && ((claim.attended && ['cancelled', 'no_show'].includes(status)) || (!claim.attended && status === 'completed'))
    return Number.isFinite(end) && end <= now && end >= now - 30 * 86400000
      && ['scheduled', 'completed', 'cancelled', 'no_show'].includes(status)
      && (!claim || status === 'scheduled' || conflict)
  }).sort((a, b) => String(b.endsAt || '').localeCompare(String(a.endsAt || ''))).slice(0, 10)

  const answer = async (appointmentId, attended) => {
    setSavingId(appointmentId)
    setError('')
    try {
      const { data, error: failure } = await requireSupabase().rpc('studio_flow_client_claim_attendance', {
        p_appointment_id: appointmentId, p_attended: attended,
      })
      if (failure) throw failure
      setClaims((current) => [{ appointmentId, attended: data.attended }, ...current.filter((item) => item.appointmentId !== appointmentId)])
    } catch (failure) {
      setError(failure.message || 'No se pudo guardar tu respuesta.')
    } finally {
      setSavingId('')
    }
  }

  if (!enabled || (!cases.length && !error)) return null
  return <section className="client-attendance-panel" aria-label="Confirmar citas terminadas">
    <div className="client-attendance-heading"><HeartHandshake size={25} /><div><span>TUS CITAS, TUS BENEFICIOS</span><h2>Que tus puntos no se queden esperando</h2><p>Confirma si asististe. Tu respuesta ayuda a cuidar tus puntos y a aclarar cualquier diferencia con el negocio.</p></div></div>
    {error && <p role="alert" className="client-attendance-error">{error}</p>}
    <div className="client-attendance-list">{cases.map((item) => {
      const claim = claimById.get(item.id)
      const status = item.appointmentStatus || item.appointment_status
      const conflict = claim && ((claim.attended && ['cancelled', 'no_show'].includes(status)) || (!claim.attended && status === 'completed'))
      return <article key={item.id}>
        <strong>{item.service}</strong><small>{item.artist} · {item.date} · {item.time}</small>
        {claim && <p className={conflict ? 'client-attendance-conflict' : ''}>{conflict ? 'Tu respuesta no coincide con el estado del negocio. Contacta a tu artista o estudio para aclararlo.' : claim.attended ? 'Confirmaste que asististe. El negocio aún debe cerrar la cita.' : 'Indicaste que no asististe. El negocio aún debe cerrar la cita.'}</p>}
        {!claim && <p>{status === 'scheduled' ? 'Tu cita terminó, pero el negocio aún no la cerró.' : 'Ayúdanos a confirmar qué pasó con esta cita.'}</p>}
        <div className="client-attendance-actions"><button type="button" disabled={savingId === item.id || claim?.attended === true} onClick={() => answer(item.id, true)}>Sí asistí</button><button type="button" disabled={savingId === item.id || claim?.attended === false} onClick={() => answer(item.id, false)}>No asistí</button></div>
      </article>
    })}</div>
  </section>
}
