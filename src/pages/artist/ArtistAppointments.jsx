import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Input from '../../components/Input'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import { useApp } from '../../contexts/appContextCore'
import { fetchArtistClients } from '../../services/artistClientService'
import { fetchManualArtistAvailability } from '../../services/appointmentService'
import { getAppointmentStatusTone } from '../../utils/appointmentStatus'

function getTodayDateValue() {
  const today = new Date()
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset())
  return today.toISOString().slice(0, 10)
}

const emptyDraft = {
  clientId: '',
  firstName: '',
  lastName: '',
  phone: '',
  serviceOfferingId: '',
  date: getTodayDateValue(),
  time: '',
  notes: '',
}

function splitClientName(name = '') {
  const [firstName, ...lastNameParts] = String(name || '').trim().split(/\s+/)
  return {
    firstName: firstName || '',
    lastName: lastNameParts.join(' '),
  }
}

function getAppointmentContextLabel(appointment = {}) {
  if (appointment.contextName || appointment.context_name) return appointment.contextName || appointment.context_name
  return appointment.membershipId || appointment.membership_id || appointment.studioId || appointment.studio_id
    ? appointment.room || 'Estudio'
    : appointment.artist || 'Independiente'
}

function appointmentMatchesWorkContext(appointment = {}, workContext = {}) {
  if (workContext?.contextType === 'membership') {
    return appointment.membershipId === workContext.membershipId
      || appointment.membership_id === workContext.membershipId
  }

  return !(appointment.studioId || appointment.studio_id || appointment.membershipId || appointment.membership_id)
}

function ArtistAppointments() {
  const location = useLocation()
  const selectedClient = location.state?.selectedClient || null
  const {
    artistServices,
    artistAppointments,
    isArtistAppointmentsLoading,
    artistAppointmentsError,
    isManualArtistAppointmentSaving,
    manualArtistAppointmentError,
    manualArtistAppointmentStatus,
    awardAppointmentFlowPoints,
    createManualArtistAppointment,
    loadArtistAppointments,
    requestArtistAppointmentConfirmations,
    artistWorkContext,
  } = useApp()
  const [draft, setDraft] = useState(emptyDraft)
  const [formErrors, setFormErrors] = useState({})
  const [selectedDate, setSelectedDate] = useState(getTodayDateValue)
  const [showForm, setShowForm] = useState(false)
  const [appointmentClientQuery, setAppointmentClientQuery] = useState('')
  const [availabilitySlots, setAvailabilitySlots] = useState([])
  const [availabilityMeta, setAvailabilityMeta] = useState({ durationMinutes: 0 })
  const [isAvailabilityLoading, setIsAvailabilityLoading] = useState(false)
  const [availabilityError, setAvailabilityError] = useState('')
  const [clientSearch, setClientSearch] = useState('')
  const [clientResults, setClientResults] = useState([])
  const [isClientSearchLoading, setIsClientSearchLoading] = useState(false)
  const [clientSearchError, setClientSearchError] = useState('')
  const [selectedClientRecord, setSelectedClientRecord] = useState(selectedClient)

  const selectedClientFromSearch = selectedClientRecord || clientResults.find((client) => client.id === draft.clientId) || null

  useEffect(() => {
    if (!selectedClient?.id) return

    setShowForm(true)
    setSelectedClientRecord(selectedClient)
    setDraft((currentDraft) => ({
      ...currentDraft,
      clientId: selectedClient.id,
      firstName: '',
      lastName: '',
      phone: '',
    }))
    setFormErrors({})
  }, [selectedClient?.id])

  useEffect(() => {
    const search = clientSearch.trim() || draft.phone.trim()

    if (search.length < 2) {
      setClientResults([])
      setIsClientSearchLoading(false)
      setClientSearchError('')
      return undefined
    }

    let isActive = true
    setIsClientSearchLoading(true)
    setClientSearchError('')

    fetchArtistClients({ search, limit: 5, workContext: artistWorkContext })
      .then((clients) => {
        if (!isActive) return
        setClientResults(clients)

        const typedPhone = draft.phone.replace(/\D/g, '')
        if (typedPhone.length >= 7) {
          const phoneMatch = clients.find((client) => (
            String(client.phone || '').replace(/\D/g, '') === typedPhone
          ))

          if (phoneMatch) {
            const { firstName, lastName } = splitClientName(phoneMatch.name)
            setDraft((currentDraft) => ({
              ...currentDraft,
              clientId: phoneMatch.id,
              firstName: firstName || currentDraft.firstName,
              lastName: lastName || currentDraft.lastName,
              phone: phoneMatch.phone || currentDraft.phone,
            }))
            setSelectedClientRecord(phoneMatch)
            setClientSearch(phoneMatch.name || '')
          }
        }
      })
      .catch((error) => {
        if (!isActive) return
        setClientResults([])
        setClientSearchError(error.message || 'No se pudieron buscar clientas registradas.')
      })
      .finally(() => {
        if (isActive) setIsClientSearchLoading(false)
      })

    return () => {
      isActive = false
    }
  }, [artistWorkContext, clientSearch, draft.phone])

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
        workContext: artistWorkContext,
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
  }, [artistWorkContext, draft.date, draft.serviceOfferingId, showForm])

  useEffect(() => {
    loadManualAvailability()
  }, [loadManualAvailability])

  const isHistoryAppointment = (appointment) => (
    ['Completada', 'Cancelada', 'No show'].includes(appointment.status)
    || ['completed', 'cancelled', 'no_show'].includes(appointment.appointmentStatus)
  )
  const canAwardFlowPoints = (appointment) => (
    !['Cancelada', 'No show'].includes(appointment.status)
    && !['cancelled', 'no_show'].includes(String(appointment.appointmentStatus || '').toLowerCase())
    && appointment.flowPointsAwarded > 0
    && appointment.pointsGranted <= 0
  )
  const sortAppointmentsByTimeAscending = (appointments = []) => [...appointments].sort((firstAppointment, secondAppointment) => (
    String(firstAppointment.time || '').localeCompare(String(secondAppointment.time || ''))
    || String(firstAppointment.id || '').localeCompare(String(secondAppointment.id || ''))
  ))
  const contextAppointments = artistAppointments.filter((appointment) => (
    appointmentMatchesWorkContext(appointment, artistWorkContext)
  ))
  const attendedClientIds = new Set(contextAppointments
    .filter((appointment) => (
      appointment.clientId
      && !['Cancelada', 'No show'].includes(appointment.status)
      && !['cancelled', 'no_show'].includes(String(appointment.appointmentStatus || '').toLowerCase())
      && (
        appointment.status === 'Completada'
        || String(appointment.appointmentStatus || '').toLowerCase() === 'completed'
        || (appointment.startsAt && new Date(appointment.startsAt).getTime() < Date.now())
      )
    ))
    .map((appointment) => appointment.clientId))
  const normalizedAppointmentClientQuery = appointmentClientQuery.trim().toLowerCase()
  const appointmentsMatchingClientQuery = normalizedAppointmentClientQuery
    ? contextAppointments.filter((appointment) => {
      if (appointment.clientId && !attendedClientIds.has(appointment.clientId)) return false

      const searchableText = [
        appointment.client,
        appointment.clientName,
        appointment.clientPhone,
        appointment.phone,
        appointment.clientEmail,
        appointment.email,
      ].filter(Boolean).join(' ').toLowerCase()

      return searchableText.includes(normalizedAppointmentClientQuery)
    })
    : contextAppointments
  const appointmentsForSelectedDate = sortAppointmentsByTimeAscending(
    appointmentsMatchingClientQuery.filter((appointment) => appointment.date === selectedDate),
  )
  const upcomingAppointments = appointmentsForSelectedDate.filter((appointment) => !isHistoryAppointment(appointment))
  const pastAppointments = appointmentsForSelectedDate.filter(isHistoryAppointment)

  const validateDraft = () => {
    const nextErrors = {}
    const selectedClientId = selectedClient?.id || selectedClientFromSearch?.id || draft.clientId

    if (!selectedClientId) {
      if (!draft.firstName.trim()) nextErrors.firstName = 'Nombre obligatorio.'
      if (!draft.lastName.trim()) nextErrors.lastName = 'Apellido obligatorio.'
      if (!draft.phone.trim()) nextErrors.phone = 'Celular obligatorio.'
    }
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
      ...(field === 'phone' ? { clientId: '' } : {}),
      ...(field === 'serviceOfferingId' || field === 'date' ? { time: '' } : {}),
    }))
    if (field === 'phone') setSelectedClientRecord(null)
    setFormErrors((currentErrors) => ({ ...currentErrors, [field]: '' }))
  }

  const saveAppointment = async () => {
    if (!validateDraft()) return
    const selectedClientId = selectedClient?.id || selectedClientFromSearch?.id || draft.clientId

    const appointment = await createManualArtistAppointment({
      ...draft,
      clientId: selectedClientId,
      workContext: artistWorkContext,
    })

    if (appointment) {
      setDraft({
        ...emptyDraft,
        serviceOfferingId: draft.serviceOfferingId,
        date: draft.date,
      })
      setSelectedClientRecord(null)
      setClientSearch('')
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
        </div>

        <div className="form-stack compact-form" style={{ marginBottom: '14px', marginTop: 0 }}>
          <Input
            label="Filtrar por fecha"
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
          />
          <Input
            label="Filtrar por nombre o celular"
            placeholder="Nombre o celular de clienta"
            type="search"
            value={appointmentClientQuery}
            onChange={(event) => setAppointmentClientQuery(event.target.value)}
          />
          {normalizedAppointmentClientQuery && (
            <small style={{ color: 'var(--muted)', fontWeight: 800 }}>
              Solo se muestran clientas que ya acudieron al menos una vez en este entorno.
            </small>
          )}
        </div>

        {artistAppointmentsError && <small style={{ color: 'var(--rose-dark)', fontWeight: 800 }}>{artistAppointmentsError}</small>}
        {manualArtistAppointmentStatus && (
          <small style={{ color: 'var(--success)', fontWeight: 800 }}>{manualArtistAppointmentStatus}</small>
        )}
        {manualArtistAppointmentError && (
          <small style={{ color: 'var(--rose-dark)', fontWeight: 800 }}>{manualArtistAppointmentError}</small>
        )}

        <div className="compact-list">
          <div className="list-row elevated-row">
            <div>
              <strong>{isArtistAppointmentsLoading ? 'Cargando citas...' : `${appointmentsForSelectedDate.length} citas`}</strong>
              <small>{selectedDate === getTodayDateValue() ? 'Agenda de hoy' : `Agenda del ${selectedDate}`}</small>
            </div>
            <StatusPill tone="neutral">Dia</StatusPill>
          </div>
          {upcomingAppointments.length > 0 && (
            <div className="list-row elevated-row">
              <div>
                <strong>Confirmacion de asistencia</strong>
                <small>Enviar aviso a las clientas de este dia.</small>
              </div>
              <Button
                size="sm"
                variant="success"
                onClick={() => requestArtistAppointmentConfirmations({ date: selectedDate })}
              >
                Enviar
              </Button>
            </div>
          )}

          {upcomingAppointments.length > 0 ? upcomingAppointments.map((appointment) => (
            <div className={`list-row elevated-row appointment-status-row appointment-status-${getAppointmentStatusTone(appointment)}`} key={appointment.id}>
              <div>
                <strong>{appointment.client}</strong>
                <small>{appointment.service} / {appointment.time}</small>
              </div>
              <div className="row-actions appointment-result-actions" style={{ justifyContent: 'flex-end', gap: 6 }}>
                <StatusPill tone="neutral">{getAppointmentContextLabel(appointment)}</StatusPill>
                <StatusPill tone={getAppointmentStatusTone(appointment)}>{appointment.status}</StatusPill>
                <Button
                  className="flow-points-award-button"
                  disabled={!canAwardFlowPoints(appointment)}
                  size="sm"
                  variant="success"
                  onClick={() => awardAppointmentFlowPoints({ appointmentId: appointment.id })}
                >
                  {appointment.pointsGranted > 0 ? `+${appointment.pointsGranted} otorgados` : `Otorgar ${appointment.flowPointsAwarded || 0} pts`}
                </Button>
              </div>
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
            {selectedClient?.id ? (
              <div className="list-row elevated-row">
                <div style={{
                  alignItems: 'center',
                  display: 'flex',
                  gap: 12,
                }}>
                  {selectedClient.photoUrl ? (
                    <img
                      alt=""
                      src={selectedClient.photoUrl}
                      style={{
                        borderRadius: '50%',
                        height: 48,
                        objectFit: 'cover',
                        width: 48,
                      }}
                    />
                  ) : (
                    <span style={{
                      alignItems: 'center',
                      background: 'var(--surface-rose)',
                      borderRadius: '50%',
                      color: 'var(--rose-dark)',
                      display: 'inline-flex',
                      fontWeight: 900,
                      height: 48,
                      justifyContent: 'center',
                      width: 48,
                    }}>
                      {selectedClient.name?.slice(0, 1) || 'C'}
                    </span>
                  )}
                  <div>
                    <strong>{selectedClient.name || 'Clienta'}</strong>
                    <small>{selectedClient.phone || 'Sin celular'}</small>
                  </div>
                </div>
                <StatusPill tone="success">Clienta existente</StatusPill>
              </div>
            ) : (
              <>
                <label className="input-field">
                  <span>Buscar clienta</span>
                  <input
                    type="search"
                    placeholder="Nombre, correo o celular"
                    value={clientSearch}
                    onChange={(event) => {
                      setClientSearch(event.target.value)
                      setDraft((currentDraft) => ({ ...currentDraft, clientId: '' }))
                    }}
                  />
                  {(clientSearch || draft.phone) && (
                    <div className="autocomplete-suggestions">
                      {clientResults.map((client) => (
                        <button
                          key={client.id}
                          type="button"
                          className="suggestion-item"
                          onClick={() => {
                            const { firstName, lastName } = splitClientName(client.name)
                            setDraft((currentDraft) => ({
                              ...currentDraft,
                              clientId: client.id,
                              firstName: firstName || '',
                              lastName,
                              phone: client.phone || '',
                            }))
                            setSelectedClientRecord(client)
                            setClientSearch(client.name || '')
                          }}
                        >
                          {client.name}
                          {client.phone && <small>{client.phone}</small>}
                        </button>
                      ))}
                      {!isClientSearchLoading && !clientSearchError && clientSearch.trim().length >= 2 && clientResults.length === 0 && (
                        <div className="suggestion-item muted-suggestion">Sin coincidencias registradas.</div>
                      )}
                      {clientSearchError && (
                        <div className="suggestion-item muted-suggestion">{clientSearchError}</div>
                      )}
                    </div>
                  )}
                  {isClientSearchLoading && <small>Buscando clientas registradas...</small>}
                </label>

                {selectedClientFromSearch && (
                  <div className="list-row elevated-row">
                    <div>
                      <strong>{selectedClientFromSearch.name || 'Clienta'}</strong>
                      <small>{selectedClientFromSearch.phone || 'Sin celular registrado'}</small>
                    </div>
                    <div className="row-actions" style={{ justifyContent: 'flex-end', gap: 6 }}>
                      <StatusPill tone="success">Seleccionada</StatusPill>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setSelectedClientRecord(null)
                          setClientSearch('')
                          setDraft((currentDraft) => ({
                            ...currentDraft,
                            clientId: '',
                            firstName: '',
                            lastName: '',
                            phone: '',
                          }))
                        }}
                      >
                        Cambiar
                      </Button>
                    </div>
                  </div>
                )}

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
              </>
            )}

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
            <div className={`list-row elevated-row appointment-status-row appointment-status-${getAppointmentStatusTone(appointment)}`} key={appointment.id}>
              <div>
                <strong>{appointment.client}</strong>
                <small>{appointment.service} / {appointment.time}</small>
              </div>
              <div className="row-actions appointment-result-actions" style={{ justifyContent: 'flex-end', gap: 6 }}>
                <StatusPill tone="neutral">{getAppointmentContextLabel(appointment)}</StatusPill>
                <StatusPill tone={getAppointmentStatusTone(appointment)}>{appointment.status}</StatusPill>
                <Button
                  className="flow-points-award-button"
                  disabled={!canAwardFlowPoints(appointment)}
                  size="sm"
                  variant="success"
                  onClick={() => awardAppointmentFlowPoints({ appointmentId: appointment.id })}
                >
                  {appointment.pointsGranted > 0 ? `+${appointment.pointsGranted} otorgados` : `Otorgar ${appointment.flowPointsAwarded || 0} pts`}
                </Button>
              </div>
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
