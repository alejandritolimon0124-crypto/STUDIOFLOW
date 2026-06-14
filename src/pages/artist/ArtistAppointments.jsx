import { useEffect, useState } from 'react'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Input from '../../components/Input'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import { useApp } from '../../contexts/appContextCore'

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

  useEffect(() => {
    if (!draft.serviceOfferingId && artistServices[0]?.id) {
      setDraft((currentDraft) => ({ ...currentDraft, serviceOfferingId: artistServices[0].id }))
    }
  }, [artistServices, draft.serviceOfferingId])

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
    if (!draft.time) nextErrors.time = 'Hora obligatoria.'

    setFormErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const updateDraft = (field, value) => {
    setDraft((currentDraft) => ({ ...currentDraft, [field]: value }))
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
      setShowForm(false)
      setSelectedDate(draft.date)
      await loadArtistAppointments()
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

            <Input
              label="Hora"
              type="time"
              value={draft.time}
              onChange={(event) => updateDraft('time', event.target.value)}
            />
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
