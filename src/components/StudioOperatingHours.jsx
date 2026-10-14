import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import Button from './Button'
import StatusPill from './StatusPill'
import { fetchStudioHours, saveStudioHours } from '../services/studioHoursService'

const weekdays = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const defaultDays = weekdays.map((_, weekday) => ({ weekday, open: weekday !== 0, start: '10:00', end: '18:00', breaks: [] }))

function StudioOperatingHours({ studioId }) {
  const [days, setDays] = useState(defaultDays)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    if (!studioId) return undefined
    let active = true
    fetchStudioHours(studioId).then((stored) => {
      if (active && stored.length) setDays(stored)
    }).catch((error) => { if (active) setFeedback(error.message || 'No se pudo cargar el horario.') })
    return () => { active = false }
  }, [studioId])

  const updateDay = (weekday, patch) => {
    setDays((current) => current.map((day) => day.weekday === weekday ? { ...day, ...patch } : day))
    setFeedback('')
  }

  const updateBreak = (weekday, index, patch) => {
    const day = days.find((entry) => entry.weekday === weekday)
    updateDay(weekday, { breaks: day.breaks.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) })
  }

  const save = async () => {
    setBusy(true)
    setFeedback('')
    try {
      const saved = await saveStudioHours(studioId, days)
      setDays(saved)
      setFeedback('Horario guardado. Las agendas del equipo respetarán estas horas y descansos.')
    } catch (error) {
      setFeedback(error.message || 'No se pudo guardar el horario.')
    } finally {
      setBusy(false)
    }
  }

  return <section className="profile-foundation-card studio-hours-panel">
    <div className="studio-hours-heading"><span className="eyebrow">EL RITMO DE TU ESPACIO</span><h3>Tu estudio, a tu ritmo</h3><small>Elige cuándo abres y guarda el horario para aplicarlo a las reservas. Cada artista podrá acomodar sus citas dentro de estas horas.</small></div>
    <div className="schedule-list studio-hours-days">
      {days.map((day) => <article className="schedule-day studio-hours-day" key={day.weekday}>
        <div className="schedule-day-header">
          <div><strong>{weekdays[day.weekday]}</strong><small>{day.open ? `${day.start} a ${day.end}` : 'Día cerrado'}</small></div>
          <StatusPill tone={day.open ? 'success' : 'neutral'}>{day.open ? 'Abierto' : 'Cerrado'}</StatusPill>
        </div>
        {day.open && <>
          <div className="schedule-controls studio-hours-times"><label>Abre<input type="time" value={day.start || ''} onChange={(event) => updateDay(day.weekday, { start: event.target.value })} /></label><label>Cierra<input type="time" value={day.end || ''} onChange={(event) => updateDay(day.weekday, { end: event.target.value })} /></label></div>
          <div className="studio-hours-break-explainer"><strong>Descansos opcionales</strong><small>Úsalos para comida o para cerrar temporalmente durante la jornada. Ninguna artista ofrecerá citas en esos bloques.</small></div>
          {day.breaks.length > 0 && <div className="schedule-breaks"><p>Descansos de este día</p><small>Marca cuándo comienza la pausa y cuándo vuelve a abrir el estudio.</small>{day.breaks.map((pause, index) => <div className="schedule-break-row" key={index}><label>Inicio del descanso<input type="time" value={pause.start} onChange={(event) => updateBreak(day.weekday, index, { start: event.target.value })} /></label><label>Regreso al trabajo<input type="time" value={pause.end} onChange={(event) => updateBreak(day.weekday, index, { end: event.target.value })} /></label><button className="schedule-break-remove" type="button" aria-label={`Quitar descanso del ${weekdays[day.weekday]}`} onClick={() => updateDay(day.weekday, { breaks: day.breaks.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 size={17} /></button></div>)}</div>}
        </>}
        <div className="row-actions">
          {day.open ? <><button type="button" onClick={() => updateDay(day.weekday, { open: false })}>Cerrar este día</button><button type="button" onClick={() => updateDay(day.weekday, { breaks: [...day.breaks, { start: '', end: '' }] })}><Plus size={16} /> Agregar descanso</button></> : <button type="button" onClick={() => updateDay(day.weekday, { open: true })}>Abrir este día</button>}
        </div>
      </article>)}
    </div>
    {feedback && <small role="status" className="studio-hours-feedback">{feedback}</small>}
    <Button disabled={!studioId || busy} onClick={save}>{busy ? 'Guardando...' : 'Guardar horario del estudio'}</Button>
  </section>
}

export default StudioOperatingHours
