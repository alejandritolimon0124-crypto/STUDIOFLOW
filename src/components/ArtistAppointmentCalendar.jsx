import { useEffect, useMemo, useState } from 'react'
import Button from './Button'
import { fetchArtistWeekSlots, setArtistSlotBlocked } from '../services/scheduleService'

const DAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const SHORT_DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const SLOT_MINUTES = 15
const DEFAULT_START_MINUTES = 8 * 60
const DEFAULT_END_MINUTES = 21 * 60

function toLocalDateValue(date) {
  const value = new Date(date)
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset())
  return value.toISOString().slice(0, 10)
}

function fromDateValue(value) {
  const [year, month, day] = String(value || '').split('-').map(Number)
  return new Date(year, (month || 1) - 1, day || 1)
}

function startOfWeek(value) {
  const date = fromDateValue(value)
  const mondayOffset = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - mondayOffset)
  return date
}

function getWeekDays(value) {
  const start = startOfWeek(value)
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return {
      date,
      value: toLocalDateValue(date),
      label: DAY_LABELS[date.getDay()],
      shortLabel: SHORT_DAY_LABELS[date.getDay()],
    }
  })
}

function parseTime(value) {
  const match = String(value || '').match(/(\d{1,2}):(\d{2})/)
  return match ? (Number(match[1]) * 60) + Number(match[2]) : null
}

function getAppointmentStartMinutes(appointment) {
  return parseTime(appointment.time)
    ?? parseTime(appointment.startsAt)
    ?? parseTime(appointment.starts_at)
    ?? DEFAULT_START_MINUTES
}

function getAppointmentEndMinutes(appointment) {
  const start = getAppointmentStartMinutes(appointment)
  const explicitEnd = parseTime(appointment.end)
    ?? parseTime(appointment.endsAt)
    ?? parseTime(appointment.ends_at)
  return Math.max(start + SLOT_MINUTES, explicitEnd ?? start + (Number(appointment.durationMinutes || appointment.duration_minutes) || 60))
}

function formatTime(minutes) {
  const safeMinutes = Math.max(0, minutes)
  return `${String(Math.floor(safeMinutes / 60) % 24).padStart(2, '0')}:${String(safeMinutes % 60).padStart(2, '0')}`
}

function formatWeekRange(days) {
  const formatter = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' })
  return `${formatter.format(days[0].date)} - ${formatter.format(days[6].date)}`
}

function getAppointmentTone(appointment) {
  const status = String(appointment.appointmentStatus || appointment.status || '').toLowerCase()
  if (status.includes('cancel')) return 'cancelled'
  if (status.includes('complet')) return 'completed'
  return 'scheduled'
}

function getDayTimeline(slots, appointments) {
  const sortedAppointments = [...appointments].sort((first, second) => getAppointmentStartMinutes(first) - getAppointmentStartMinutes(second))
  const appointmentEntries = sortedAppointments.map((appointment) => ({
    type: 'appointment',
    start: getAppointmentStartMinutes(appointment),
    end: getAppointmentEndMinutes(appointment),
    appointment,
  }))
  const slotEntries = slots
    .filter((slot) => {
      const slotStart = parseTime(slot.time)
      return !sortedAppointments.some((appointment) => slotStart >= getAppointmentStartMinutes(appointment) && slotStart < getAppointmentEndMinutes(appointment))
    })
    .map((slot) => ({ type: 'slot', start: parseTime(slot.time) || 0, end: parseTime(slot.end) || 0, slot }))

  return [...appointmentEntries, ...slotEntries].sort((first, second) => first.start - second.start)
}

export default function ArtistAppointmentCalendar({ appointments = [], selectedDate, onSelectDate, workContext, onCreateAppointment }) {
  const [view, setView] = useState('day')
  const [weekSlots, setWeekSlots] = useState([])
  const [slotsLoading, setSlotsLoading] = useState(true)
  const [slotsError, setSlotsError] = useState('')
  const [updatingSlotId, setUpdatingSlotId] = useState('')
  const weekDays = useMemo(() => getWeekDays(selectedDate), [selectedDate])
  const weekStart = weekDays[0].value
  const weekEnd = weekDays[6].value
  const weekAppointments = useMemo(() => appointments
    .filter((appointment) => appointment.date >= weekStart && appointment.date <= weekEnd)
    .sort((first, second) => `${first.date}${first.time}`.localeCompare(`${second.date}${second.time}`)), [appointments, weekEnd, weekStart])
  const appointmentsByDate = useMemo(() => weekDays.reduce((result, day) => ({
    ...result,
    [day.value]: weekAppointments.filter((appointment) => appointment.date === day.value),
  }), {}), [weekAppointments, weekDays])
  const slotsByDate = useMemo(() => weekDays.reduce((result, day) => ({
    ...result,
    [day.value]: weekSlots.filter((slot) => slot.date === day.value),
  }), {}), [weekDays, weekSlots])
  const appointmentStarts = weekAppointments.map(getAppointmentStartMinutes)
  const appointmentEnds = weekAppointments.map(getAppointmentEndMinutes)
  const gridStart = Math.floor(Math.min(DEFAULT_START_MINUTES, ...appointmentStarts) / 60) * 60
  const gridEnd = Math.ceil(Math.max(DEFAULT_END_MINUTES, ...appointmentEnds) / 60) * 60
  const slotCount = Math.max(1, Math.ceil((gridEnd - gridStart) / SLOT_MINUTES))
  const timeLabels = Array.from({ length: Math.ceil((gridEnd - gridStart) / 60) + 1 }, (_, index) => gridStart + (index * 60))

  useEffect(() => {
    let active = true
    Promise.resolve()
      .then(() => {
        if (!active) return null
        setSlotsLoading(true)
        setSlotsError('')
        return fetchArtistWeekSlots(weekStart, workContext)
      })
      .then((payload) => {
        if (active && payload) setWeekSlots(payload.slots)
      })
      .catch((error) => {
        if (!active) return
        setWeekSlots([])
        setSlotsError(error.message || 'No se pudieron cargar los horarios de la semana.')
      })
      .finally(() => {
        if (active) setSlotsLoading(false)
      })
    return () => { active = false }
  }, [weekStart, workContext])

  const toggleSlotBlock = async (slot) => {
    setUpdatingSlotId(slot.id)
    setSlotsError('')
    try {
      const updated = await setArtistSlotBlocked(slot.id, !slot.blocked, workContext)
      setWeekSlots((current) => current.map((item) => item.id === slot.id
        ? { ...item, ...updated, blocked: Boolean(updated?.blocked), status: updated?.status || item.status }
        : item))
    } catch (error) {
      setSlotsError(error.message || 'No se pudo actualizar este horario.')
    } finally {
      setUpdatingSlotId('')
    }
  }

  const moveWeek = (offset) => {
    const nextDate = fromDateValue(selectedDate)
    nextDate.setDate(nextDate.getDate() + offset * 7)
    const nextValue = toLocalDateValue(nextDate)
    onSelectDate?.(nextValue)
  }

  return (
    <section className="artist-calendar-overview" aria-label="Vista de agenda">
      <div className="artist-calendar-toolbar">
        <div className="artist-calendar-view-toggle" aria-label="Cambiar vista de agenda">
          <Button size="sm" variant={view === 'day' ? 'primary' : 'ghost'} onClick={() => setView('day')}>Ver por día</Button>
          <Button size="sm" variant={view === 'week' ? 'primary' : 'ghost'} onClick={() => setView('week')}>Ver semana</Button>
        </div>
        <div className="artist-calendar-navigation">
          <button type="button" aria-label="Semana anterior" onClick={() => moveWeek(-1)}>‹</button>
          <strong>{formatWeekRange(weekDays)}</strong>
          <button type="button" aria-label="Semana siguiente" onClick={() => moveWeek(1)}>›</button>
        </div>
      </div>

      {view === 'day' ? (
        <div className="artist-day-calendar">
          {weekDays.map((day) => {
            const dayAppointments = appointmentsByDate[day.value] || []
            const daySlots = slotsByDate[day.value] || []
            const timeline = getDayTimeline(daySlots, dayAppointments)
            return (
              <article className={`artist-day-section${selectedDate === day.value ? ' is-selected' : ''}`} key={day.value}>
                <button type="button" className="artist-day-heading" onClick={() => onSelectDate?.(day.value)}>
                  <span>{day.date.getDate()}</span>
                  <strong>{day.label}</strong>
                  <small>{dayAppointments.length} {dayAppointments.length === 1 ? 'cita' : 'citas'}</small>
                </button>
                <div className="artist-day-events">
                  {timeline.map((entry) => entry.type === 'appointment' ? (
                    <div className={`artist-calendar-event is-${getAppointmentTone(entry.appointment)}`} key={`appointment-${entry.appointment.id}`}>
                      <time>{formatTime(entry.start)}<small>{formatTime(entry.end)}</small></time>
                      <div><strong>{entry.appointment.client || 'Clienta'}</strong><span>{entry.appointment.service || 'Servicio'}</span></div>
                    </div>
                  ) : entry.slot.blocked ? (
                    <div className="artist-calendar-slot is-blocked" key={entry.slot.id}>
                      <time>{entry.slot.time}</time>
                      <div><strong>Bloqueo</strong><small>{entry.slot.time} - {entry.slot.end}</small></div>
                      <button type="button" className="artist-slot-restore" disabled={updatingSlotId === entry.slot.id} aria-label={`Reactivar horario de ${entry.slot.time}`} onClick={() => toggleSlotBlock(entry.slot)}>↻</button>
                    </div>
                  ) : entry.slot.status === 'available' ? (
                    <div className="artist-calendar-slot is-available" key={entry.slot.id}>
                      <time>{entry.slot.time}</time>
                      <button type="button" className="artist-slot-create" onClick={() => onCreateAppointment?.(entry.slot)}><span>+</span> Crear cita</button>
                      <button type="button" className="artist-slot-block" disabled={updatingSlotId === entry.slot.id} aria-label={`Bloquear horario de ${entry.slot.time}`} onClick={() => toggleSlotBlock(entry.slot)}>×</button>
                    </div>
                  ) : (
                    <div className="artist-calendar-slot is-occupied" key={entry.slot.id}><time>{entry.slot.time}</time><strong>Horario ocupado</strong></div>
                  ))}
                  {!slotsLoading && timeline.length === 0 && <p>Día no disponible.</p>}
                  {slotsLoading && <p>Cargando horarios...</p>}
                </div>
              </article>
            )
          })}
          {slotsError && <small className="artist-calendar-error" role="alert">{slotsError}</small>}
        </div>
      ) : (
        <div className="artist-week-calendar-scroll">
          <div className="artist-week-calendar" style={{ '--calendar-slots': slotCount }}>
            <div className="artist-week-corner" />
            {weekDays.map((day) => (
              <button type="button" className={`artist-week-day${selectedDate === day.value ? ' is-selected' : ''}`} key={day.value} onClick={() => onSelectDate?.(day.value)}>
                <span>{day.shortLabel}</span><strong>{day.date.getDate()}</strong>
              </button>
            ))}
            <div className="artist-week-times" style={{ gridRow: `2 / span ${slotCount}` }}>
              {timeLabels.map((minutes) => <time key={minutes} style={{ top: `${((minutes - gridStart) / SLOT_MINUTES) * 24}px` }}>{formatTime(minutes)}</time>)}
            </div>
            {weekDays.map((day, dayIndex) => (
              <div className="artist-week-column" key={day.value} style={{ gridColumn: dayIndex + 2, gridRow: `2 / span ${slotCount}` }}>
                {(slotsByDate[day.value] || []).filter((slot) => slot.blocked).map((slot) => {
                  const start = parseTime(slot.time) || gridStart
                  const end = parseTime(slot.end) || start + SLOT_MINUTES
                  return <div className="artist-week-blocked" key={slot.id} style={{ top: `${((start - gridStart) / SLOT_MINUTES) * 24}px`, height: `${Math.max(24, ((end - start) / SLOT_MINUTES) * 24 - 3)}px` }}>Bloqueo</div>
                })}
                {(appointmentsByDate[day.value] || []).map((appointment) => {
                  const start = getAppointmentStartMinutes(appointment)
                  const end = getAppointmentEndMinutes(appointment)
                  return (
                    <button
                      type="button"
                      className={`artist-week-event is-${getAppointmentTone(appointment)}`}
                      key={appointment.id}
                      onClick={() => onSelectDate?.(day.value)}
                      style={{
                        top: `${((start - gridStart) / SLOT_MINUTES) * 24}px`,
                        height: `${Math.max(24, ((end - start) / SLOT_MINUTES) * 24 - 3)}px`,
                      }}
                      title={`${appointment.client} · ${appointment.service} · ${formatTime(start)} a ${formatTime(end)}`}
                    >
                      <strong>{appointment.client || 'Clienta'}</strong>
                      <span>{appointment.service || 'Servicio'}</span>
                      <small>{formatTime(start)} - {formatTime(end)}</small>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
