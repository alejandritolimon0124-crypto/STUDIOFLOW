import { useCallback, useEffect, useState } from 'react'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Input from '../../components/Input'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import { useApp } from '../../contexts/appContextCore'
import { fetchManualArtistAvailability } from '../../services/appointmentService'

function getTodayDateValue() {
  const today = new Date()
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset())
  return today.toISOString().slice(0, 10)
}

const emptyDraft = {
  firstName: '',
  lastName: '',
  phone: '',
  serviceOfferingId: '',
  date: getTodayDateValue(),
  time: '',
  notes: '',
}

function ArtistAppointments() {
  const {
    artistServices,
    artistAppointments,
    isArtistAppointmentsLoading,
    artistAppointmentsError,
    isManualArtistAppointmentSaving,
    manualArtistAppointmentError,
    manualArtistAppointmentStatus,
    createManualArtistAppointment,
    loadArtistAppointments,
  } = useApp()
  const [draft, setDraft] = useState(emptyDraft)
  const [formErrors, setFormErrors] = useState({})
  const [selectedDate, setSelectedDate] = useState(getTodayDateValue)
  const [showForm, setShowForm] = useState(false)
  const [showFilter, setShowFilter] = useState(false)
  const [availabilitySlots, setAvailabilitySlots] = useState([])
  const [availabilityMeta, setAvailabilityMeta] = useState({ durationMinutes: 0 })
  const [isAvailabilityLoading, setIsAvailabilityLoading] = useState(false)
  const [availabilityError, setAvailabilityError] = useState('')

  useEffect(() => {
    if (!draft.serviceOfferingId && artistServices[0]?.id) {
      setDraft((currentDraft) => ({ ...currentDraft, serviceOfferingId: artistServices[0].id }))
    }
  }, [artistServices, draft.serviceOfferingId])

  const loadManualAvailability = useCallback(async ({
    serviceOfferingId = draft.serviceOfferingId,
    date = draft.date,
  } = {}) => {
    if (!showForm || !serviceOfferingId || !date) {
      setAvailabilitySlots([])
      setAvailabilityMeta({ durationMinutes: 0 })
      return null
    }

    setIsAvailabilityLoading(true)
    setAvailabilityError('')

    try {
      const availability = await fetchManualArtistAvailability({
        serviceOfferingId,
        date,
      })
      setAvailabilitySlots(availability.slots)
      setAvailabilityMeta({ durationMinutes: availability.durationMinutes })
      return availability
    } catch (error) {
      setAvailabilitySlots([])
      setAvailabilityMeta({ durationMinutes: 0 })
      setAvailabilityError(error.message || 'No se pudieron cargar horarios disponibles.')
      return null
    } finally {
      setIsAvailabilityLoading(false)
    }
  }, [draft.date, draft.serviceOfferingId, showForm])

  useEffect(() => {
    loadManualAvailability()
  }, [loadManualAvailability])

  const isHistoryAppointment = (appointment) => (
    ['Completada', 'Cancelada', 'No show'].includes(appointment.status)
    || ['completed', 'cancelled', 'no_show'].includes(appointment.appointmentStatus)
  )
  const appointmentsForSelectedDate = artistAppointments.filter((appointment) => appointment.date === selectedDate)
  const upcomingAppointments = appointmentsForSelectedDate.filter((appointment) => !isHistoryAppointment(appointment))
  const pastAppointments = appointmentsForSelectedDate.filter(isHistoryAppointment)

  const validateDraft = () => {
    const nextErrors = {}

    if (!draft.firstName.trim()) nextErrors.firstName = 'Nombre obligatorio.'
    if (!draft.lastName.trim()) nextErrors.lastName = 'Apellido obligatorio.'
    if (!draft.phone.trim()) nextErrors.phone = 'Celular obligatorio.'
    if (!draft.serviceOfferingId) nextErrors.serviceOfferingId = 'Servicio obligatorio.'
    if (!draft.date) nextErrors.date = 'Fecha obligatoria.'
    if (!draft.time) nextErrors.time = 'Horario obligatorio.'

    setFormErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const updateDraft = (field, value) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      [field]: value,
      ...(field === 'serviceOfferingId' || field === 'date' ? { time: '' } : {}),
    }))
    setFormErrors((currentErrors) => ({ ...currentErrors, [field]: '' }))
  }

  const saveAppointment = async () => {
    if (!validateDraft()) return

    const appointment = await createManualArtistAppointment(draft)

    if (appointment) {
      setDraft({
        ...emptyDraft,
        serviceOfferingId: draft.serviceOfferingId,
        date: draft.date,
      })
      setSelectedDate(draft.date)
      await loadArtistAppointments()
      await loadManualAvailability({
        serviceOfferingId: draft.serviceOfferingId,
        date: draft.date,
      })
    }
  }

  return (
    <main className="dashboard-grid artist-grid">
      <Card className="wide-card mobile-screen primary-panel">
        <PanelHeader title="Citas del dia" eyebrow={selectedDate === getTodayDateValue() ? 'Hoy' : selectedDate} />
        <div className="row-actions" style={{ justifyContent: 'flex-start', marginBottom: '14px' }}>
          <Button size="sm" onClick={() => setShowForm((currentValue) => !currentValue)}>
            {showForm ? 'Ocultar formulario' : 'Generar cita'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowFilter((currentValue) => !currentValue)}>
            Filtrar
          </Button>
        </div>

        {showFilter && (
          <div className="form-stack compact-form" style={{ marginBottom: '14px', marginTop: 0 }}>
            <Input
              label="Fecha"
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
            />
          </div>
        )}

        {artistAppointmentsError && <small style={{ color: 'var(--rose-dark)', fontWeight: 800 }}>{artistAppointmentsError}</small>}

        <div className="compact-list">
          <div className="list-row elevated-row">
            <div>
              <strong>{isArtistAppointmentsLoading ? 'Cargando citas...' : `${appointmentsForSelectedDate.length} citas`}</strong>
              <small>{selectedDate === getTodayDateValue() ? 'Agenda de hoy' : `Agenda del ${selectedDate}`}</small>
            </div>
            <StatusPill tone="neutral">Dia</StatusPill>
          </div>

          {upcomingAppointments.length > 0 ? upcomingAppointments.map((appointment) => (
            <div className="list-row elevated-row" key={appointment.id}>
              <div>
                <strong>{appointment.client}</strong>
                <small>{appointment.service} / {appointment.time}</small>
              </div>
              <StatusPill tone="success">{appointment.status}</StatusPill>
            </div>
          )) : (
            <div className="list-row elevated-row">
              <div>
                <strong>{isArtistAppointmentsLoading ? 'Consultando agenda...' : 'Sin proximas citas del dia'}</strong>
                <small>{isArtistAppointmentsLoading ? 'Consultando citas reales.' : 'No hay citas activas para esta fecha.'}</small>
              </div>
              <StatusPill tone="neutral">Agenda</StatusPill>
            </div>
          )}
        </div>
      </Card>

      {showForm && (
        <Card className="mobile-screen primary-panel">
          <PanelHeader title="Generar cita" eyebrow="Agenda real" />
          <div className="form-stack compact-form">
            <Input
              label="Nombre"
              value={draft.firstName}
              onChange={(event) => updateDraft('firstName', event.target.value)}
            />
            {formErrors.firstName && <small style={{ color: 'var(--rose-dark)', fontWeight: 800 }}>{formErrors.firstName}</small>}

            <Input
              label="Apellido"
              value={draft.lastName}
              onChange={(event) => updateDraft('lastName', event.target.value)}
            />
            {formErrors.lastName && <small style={{ color: 'var(--rose-dark)', fontWeight: 800 }}>{formErrors.lastName}</small>}

            <Input
              label="Celular"
              type="tel"
              value={draft.phone}
              onChange={(event) => updateDraft('phone', event.target.value)}
            />
            {formErrors.phone && <small style={{ color: 'var(--rose-dark)', fontWeight: 800 }}>{formErrors.phone}</small>}

            <label className="input-field">
              <span>Servicio</span>
              <select
                value={draft.serviceOfferingId}
                onChange={(event) => updateDraft('serviceOfferingId', event.target.value)}
              >
                {artistServices.length === 0 && <option value="">Sin servicios activos</option>}
                {artistServices.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </select>
            </label>
            {formErrors.serviceOfferingId && <small style={{ color: 'var(--rose-dark)', fontWeight: 800 }}>{formErrors.serviceOfferingId}</small>}

            <Input
              label="Fecha"
              type="date"
              value={draft.date}
              onChange={(event) => updateDraft('date', event.target.value)}
            />
            {formErrors.date && <small style={{ color: 'var(--rose-dark)', fontWeight: 800 }}>{formErrors.date}</small>}

            <div className="input-field">
              <span>Horarios disponibles</span>
              {isAvailabilityLoading && <small>Cargando horarios...</small>}
              {!isAvailabilityLoading && availabilityError && (
                <small style={{ color: 'var(--rose-dark)', fontWeight: 800 }}>{availabilityError}</small>
              )}
              {!isAvailabilityLoading && !availabilityError && availabilitySlots.length === 0 && (
                <small>Sin horarios disponibles</small>
              )}
              {!isAvailabilityLoading && availabilitySlots.length > 0 && (
                <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
                  {availabilitySlots.map((slot) => {
                    const isSelected = draft.time === slot.time

                    return (
                      <Button
                        key={slot.id}
                        size="sm"
                        variant={isSelected ? 'primary' : 'ghost'}
                        onClick={() => updateDraft('time', slot.time)}
                        style={isSelected ? {
                          position: 'relative',
                          minWidth: 82,
                          padding: '0 28px 0 18px',
                          background: '#5e3d43',
                          border: '2px solid #5e3d43',
                          borderRadius: 12,
                          boxShadow: '0 12px 24px rgba(94, 61, 67, 0.24)',
                          color: '#fff',
                          fontWeight: 800,
                          transform: 'scale(1.05)',
                          transition: 'transform 180ms ease, box-shadow 180ms ease, background 180ms ease, border-color 180ms ease',
                        } : undefined}
                      >
                        {slot.time}
                        {isSelected && (
                          <span
                            aria-hidden="true"
                            style={{
                              alignItems: 'center',
                              background: '#fff',
                              borderRadius: '999px',
                              color: '#5e3d43',
                              display: 'inline-flex',
                              fontSize: 13,
                              fontWeight: 900,
                              height: 22,
                              justifyContent: 'center',
                              lineHeight: 1,
                              position: 'absolute',
                              right: 5,
                              top: 4,
                              width: 22,
                            }}
                          >
                            ✓
                          </span>
                        )}
                      </Button>
                    )
                  })}
                </div>
              )}
              {availabilityMeta.durationMinutes > 0 && (
                <small>Duracion del servicio: {availabilityMeta.durationMinutes} min</small>
              )}
            </div>
            {formErrors.time && <small style={{ color: 'var(--rose-dark)', fontWeight: 800 }}>{formErrors.time}</small>}

            <label className="input-field">
              <span>Notas</span>
              <textarea
                rows="3"
                value={draft.notes}
                onChange={(event) => updateDraft('notes', event.target.value)}
              />
            </label>

            {manualArtistAppointmentError && (
              <small style={{ color: 'var(--rose-dark)', fontWeight: 800 }}>{manualArtistAppointmentError}</small>
            )}
            {manualArtistAppointmentStatus && (
              <small style={{ color: 'var(--success)', fontWeight: 800 }}>{manualArtistAppointmentStatus}</small>
            )}

            <Button className="full-width" disabled={isManualArtistAppointmentSaving} onClick={saveAppointment}>
              {isManualArtistAppointmentSaving ? 'Guardando cita...' : 'Guardar cita'}
            </Button>
          </div>
        </Card>
      )}

      <Card className="mobile-screen">
        <PanelHeader title="Historial" eyebrow={selectedDate} />
        <div className="compact-list">
          {pastAppointments.length > 0 ? pastAppointments.map((appointment) => (
            <div className="list-row elevated-row" key={appointment.id}>
              <div>
                <strong>{appointment.client}</strong>
                <small>{appointment.service} / {appointment.time}</small>
              </div>
              <StatusPill tone="neutral">{appointment.status}</StatusPill>
            </div>
          )) : (
            <div className="list-row elevated-row">
              <div>
                <strong>Sin historial para esta fecha</strong>
                <small>No hay citas cerradas o canceladas en el dia seleccionado.</small>
              </div>
              <StatusPill tone="neutral">Historial</StatusPill>
            </div>
          )}
        </div>
      </Card>
    </main>
  )
}

export default ArtistAppointments
