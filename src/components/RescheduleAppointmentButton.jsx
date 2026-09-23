import { useEffect, useState } from 'react'
import Button from './Button'
import { fetchAppointmentRescheduleAvailability, rescheduleAppointment } from '../services/appointmentService'

function getTodayDateValue() {
  const today = new Date()
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset())
  return today.toISOString().slice(0, 10)
}

function getSlotIds(slot = {}) {
  const ids = slot.availabilitySlotIds || slot.availability_slot_ids
  return Array.isArray(ids) && ids.length > 0 ? ids : [slot.id].filter(Boolean)
}

function RescheduleAppointmentButton({ appointment, onRescheduled, compact = true }) {
  const [isOpen, setIsOpen] = useState(false)
  const [date, setDate] = useState(getTodayDateValue)
  const [slots, setSlots] = useState([])
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const rescheduleCount = Number(appointment?.rescheduleCount ?? appointment?.reschedule_count ?? 0)
  const limitReached = rescheduleCount >= 2

  useEffect(() => {
    if (!isOpen || !appointment?.id || limitReached) return undefined
    let active = true
    Promise.resolve()
      .then(() => {
        if (!active) return null
        setLoading(true)
        setMessage('')
        setSelectedSlot(null)
        return fetchAppointmentRescheduleAvailability({ appointmentId: appointment.id, date })
      })
      .then((payload) => {
        if (!active || !payload) return
        setSlots(payload.slots)
      })
      .catch((error) => {
        if (!active) return
        setSlots([])
        setMessage(error.message || 'No se pudieron consultar horarios disponibles.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => { active = false }
  }, [appointment?.id, date, isOpen, limitReached])

  const togglePanel = () => {
    if (limitReached) {
      setIsOpen(true)
      setMessage('Se excedieron los 2 eventos de cambio de agenda permitidos. Comunicate con tu artista o estudio.')
      return
    }
    setIsOpen((current) => !current)
    setMessage('')
  }

  const save = async () => {
    if (!selectedSlot) {
      setMessage('Selecciona un horario disponible.')
      return
    }

    setSaving(true)
    setMessage('')
    try {
      await rescheduleAppointment({
        appointmentId: appointment.id,
        availabilitySlotIds: getSlotIds(selectedSlot),
      })
      setMessage('Cita reagendada correctamente.')
      if (onRescheduled) await onRescheduled()
      else window.setTimeout(() => window.location.reload(), 700)
    } catch (error) {
      setMessage(error.message || 'No se pudo reagendar la cita.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`appointment-reschedule ${compact ? 'is-compact' : ''} ${isOpen ? 'is-open' : ''}`}>
      <Button size="sm" variant="ghost" className="appointment-reschedule-toggle" onClick={togglePanel}>
        Reagendar
      </Button>
      {isOpen && (
        <div className="appointment-reschedule-panel">
          {!limitReached && (
            <>
              <label className="input-field">
                <span>Nueva fecha</span>
                <input type="date" min={getTodayDateValue()} value={date} onChange={(event) => setDate(event.target.value)} />
              </label>
              <div className="appointment-reschedule-slots">
                {loading && <small>Consultando horarios...</small>}
                {!loading && slots.length === 0 && !message && <small>Sin horarios disponibles para esta fecha.</small>}
                {slots.map((slot) => (
                  <button
                    type="button"
                    className={selectedSlot?.id === slot.id ? 'is-selected' : ''}
                    key={slot.id}
                    onClick={() => setSelectedSlot(slot)}
                  >
                    {slot.time}
                  </button>
                ))}
              </div>
              <Button size="sm" disabled={saving || !selectedSlot} onClick={save}>
                {saving ? 'Reagendando...' : 'Confirmar nuevo horario'}
              </Button>
            </>
          )}
          {message && <small className="appointment-reschedule-message" role="status">{message}</small>}
        </div>
      )}
    </div>
  )
}

export default RescheduleAppointmentButton
