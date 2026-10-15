import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Button from '../../components/Button'
import AppointmentPayment from '../../components/AppointmentPayment'
import AppointmentDeposit from '../../components/AppointmentDeposit'
import CompleteAppointmentButton from '../../components/CompleteAppointmentButton'
import Card from '../../components/Card'
import Input from '../../components/Input'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import RescheduleAppointmentButton from '../../components/RescheduleAppointmentButton'
import ArtistAppointmentCalendar from '../../components/ArtistAppointmentCalendar'
import { useApp } from '../../contexts/appContextCore'
import { fetchArtistClients } from '../../services/artistClientService'
import { cancelArtistAppointment, fetchManualArtistAvailability } from '../../services/appointmentService'
import { getAppointmentStatusTone } from '../../utils/appointmentStatus'
import { formatAppointmentArrival } from '../../utils/appointmentArrival'

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
  email: '',
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

function normalizeSearchText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function appointmentSearchText(appointment = {}) {
  return [
    appointment.client,
    appointment.clientName,
    appointment.clientPhone,
    appointment.phone,
    appointment.clientEmail,
    appointment.email,
  ].filter(Boolean).map(normalizeSearchText).join(' ')
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
    createManualArtistAppointment,
    loadArtistAppointments,
    requestArtistAppointmentConfirmations,
    artistWorkContext,
  } = useApp()
  const [draft, setDraft] = useState(emptyDraft)
  const [formErrors, setFormErrors] = useState({})
  const [selectedDate, setSelectedDate] = useState(getTodayDateValue)
  const [showForm, setShowForm] = useState(false)
  const [showFilter, setShowFilter] = useState(false)
  const [calendarScrollRequest, setCalendarScrollRequest] = useState(0)
  const [appointmentClientQuery, setAppointmentClientQuery] = useState('')
  const [appointmentFilterClientIds, setAppointmentFilterClientIds] = useState([])
  const [availabilitySlots, setAvailabilitySlots] = useState([])
  const [availabilityMeta, setAvailabilityMeta] = useState({ durationMinutes: 0 })
  const [isAvailabilityLoading, setIsAvailabilityLoading] = useState(false)
  const [availabilityError, setAvailabilityError] = useState('')
  const [clientSearch, setClientSearch] = useState('')
  const [clientResults, setClientResults] = useState([])
  const [isClientSearchLoading, setIsClientSearchLoading] = useState(false)
  const [clientSearchError, setClientSearchError] = useState('')
  const [selectedClientRecord, setSelectedClientRecord] = useState(selectedClient)
  const [cancellingAppointmentId, setCancellingAppointmentId] = useState('')

  const selectedClientFromSearch = selectedClientRecord || clientResults.find((client) => client.id === draft.clientId) || null

  const [previousSelectedClientId, setPreviousSelectedClientId] = useState(null)
  if (selectedClient?.id && previousSelectedClientId !== selectedClient.id) {
    setPreviousSelectedClientId(selectedClient.id)
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
  }

  const searchKey = JSON.stringify([artistWorkContext, clientSearch, draft.phone])
  const [previousSearchKey, setPreviousSearchKey] = useState(searchKey)
  if (previousSearchKey !== searchKey) {
    setPreviousSearchKey(searchKey)
    setClientResults([])
    setIsClientSearchLoading((clientSearch.trim() || draft.phone.trim()).length >= 2)
    setClientSearchError('')
  }

  useEffect(() => {
    const search = clientSearch.trim() || draft.phone.trim()

    if (search.length < 2) {
      return undefined
    }

    let isActive = true

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
    const search = appointmentClientQuery.trim()
    if (search.length < 2) {
      return undefined
    }

    let isActive = true
    fetchArtistClients({ search, limit: 50, workContext: artistWorkContext })
      .then((clients) => {
        if (!isActive) return
        const clientIds = clients.map((client) => client.id).filter(Boolean)
        setAppointmentFilterClientIds(clientIds)
        const matchingAppointment = artistAppointments
          .filter((appointment) => appointmentMatchesWorkContext(appointment, artistWorkContext))
          .filter((appointment) => clientIds.includes(appointment.clientId || appointment.client_id))
          .sort((first, second) => String(second.date || '').localeCompare(String(first.date || '')))[0]
        if (matchingAppointment?.date) {
          setSelectedDate(matchingAppointment.date)
          setCalendarScrollRequest((currentValue) => currentValue + 1)
        }
      })
      .catch(() => {
        if (isActive) setAppointmentFilterClientIds([])
      })

    return () => { isActive = false }
  }, [appointmentClientQuery, artistAppointments, artistWorkContext])

  if (!draft.serviceOfferingId && artistServices[0]?.id) {
    setDraft({ ...draft, serviceOfferingId: artistServices[0].id })
  }

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

  const availabilityKey = JSON.stringify([artistWorkContext, draft.date, draft.serviceOfferingId, showForm])
  const [previousAvailabilityKey, setPreviousAvailabilityKey] = useState('')
  if (previousAvailabilityKey !== availabilityKey) {
    setPreviousAvailabilityKey(availabilityKey)
    setAvailabilitySlots([])
    setAvailabilityMeta({ durationMinutes: 0 })
    setAvailabilityError('')
    setIsAvailabilityLoading(Boolean(showForm && draft.serviceOfferingId && draft.date))
  }
  useEffect(() => {
    if (!showForm || !draft.serviceOfferingId || !draft.date) return undefined
    let active = true
    fetchManualArtistAvailability({ serviceOfferingId: draft.serviceOfferingId, date: draft.date, workContext: artistWorkContext })
      .then((availability) => {
        if (!active) return
        setAvailabilitySlots(availability.slots)
        setAvailabilityMeta({ durationMinutes: availability.durationMinutes })
      })
      .catch((error) => { if (active) setAvailabilityError(error.message || 'No se pudieron cargar horarios disponibles.') })
      .finally(() => { if (active) setIsAvailabilityLoading(false) })
    return () => { active = false }
  }, [artistWorkContext, draft.date, draft.serviceOfferingId, showForm])

  const isHistoryAppointment = (appointment) => (
    ['Completada', 'Cancelada', 'No show'].includes(appointment.status)
    || ['completed', 'cancelled', 'no_show'].includes(appointment.appointmentStatus)
  )
  const sortAppointmentsByTimeAscending = (appointments = []) => [...appointments].sort((firstAppointment, secondAppointment) => (
    String(firstAppointment.time || '').localeCompare(String(secondAppointment.time || ''))
    || String(firstAppointment.id || '').localeCompare(String(secondAppointment.id || ''))
  ))
  const contextAppointments = artistAppointments.filter((appointment) => (
    appointmentMatchesWorkContext(appointment, artistWorkContext)
  ))
  const normalizedAppointmentClientQuery = normalizeSearchText(appointmentClientQuery)
  const appointmentsMatchingClientQuery = normalizedAppointmentClientQuery
    ? contextAppointments.filter((appointment) => {
      const searchableText = appointmentSearchText(appointment)

      return searchableText.includes(normalizedAppointmentClientQuery)
        || appointmentFilterClientIds.includes(appointment.clientId)
    })
    : contextAppointments
  const updateAppointmentClientQuery = (value) => {
    setAppointmentClientQuery(value)
    const normalizedValue = normalizeSearchText(value)
    if (normalizedValue.length < 2) return
    const matchingAppointment = contextAppointments
      .filter((appointment) => appointmentSearchText(appointment).includes(normalizedValue))
      .sort((first, second) => String(second.date || '').localeCompare(String(first.date || '')))[0]
    if (matchingAppointment?.date) {
      setSelectedDate(matchingAppointment.date)
      setCalendarScrollRequest((currentValue) => currentValue + 1)
    }
  }
  const appointmentsForSelectedDate = sortAppointmentsByTimeAscending(
    appointmentsMatchingClientQuery.filter((appointment) => appointment.date === selectedDate),
  )
  const upcomingAppointments = appointmentsForSelectedDate.filter((appointment) => !isHistoryAppointment(appointment))
  const pastAppointments = appointmentsForSelectedDate.filter(isHistoryAppointment)
  const shouldShowHistory = showFilter && (normalizedAppointmentClientQuery || selectedDate !== getTodayDateValue())

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

  const cancelAppointment = async (appointment) => {
    const sourceLabel = ['google', 'instagram', 'facebook'].includes(appointment.bookingSource) ? ` reserva desde enlace de ${appointment.bookingSource}` : ' cita'
    if (!window.confirm(`Confirma que deseas cancelar esta${sourceLabel}. El horario volvera a quedar disponible si aun cumple las reglas de tu agenda.`)) return
    setCancellingAppointmentId(appointment.id)
    try {
      await cancelArtistAppointment({ appointmentId: appointment.id })
      await loadArtistAppointments()
    } catch (error) {
      window.alert(error.message || 'No se pudo cancelar la cita.')
    } finally {
      setCancellingAppointmentId('')
    }
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
      <Card className="wide-card mobile-screen primary-panel artist-appointments-panel">
        <div className="artist-appointments-intro">
          <span>{selectedDate === getTodayDateValue() ? 'HOY' : selectedDate}</span>
          <h1>Tu agenda toma forma</h1>
          <p>Cada cita es parte de lo que estás construyendo.</p>
        </div>
        <div className="row-actions artist-appointments-primary-actions">
          <Button className="appointment-primary-action" size="sm" onClick={() => setShowForm((currentValue) => !currentValue)}>
            {showForm ? 'Ocultar formulario' : 'Generar cita'}
          </Button>
          <Button className="artist-filter-action" size="sm" variant="ghost" onClick={() => setShowFilter((currentValue) => !currentValue)}>
            Filtrar
          </Button>
        </div>

        {showFilter && (
          <div className="form-stack compact-form" style={{ marginBottom: '14px', marginTop: 0 }}>
            <Input
              label="Filtrar por fecha"
              type="date"
              value={selectedDate}
              onChange={(event) => {
                const nextDate = event.target.value
                if (!nextDate) return
                setSelectedDate(nextDate)
                setCalendarScrollRequest((currentValue) => currentValue + 1)
              }}
            />
            <Input
              label="Filtrar por nombre o celular"
              placeholder="Nombre o celular de clienta"
              type="search"
              value={appointmentClientQuery}
              onChange={(event) => updateAppointmentClientQuery(event.target.value)}
            />
            {normalizedAppointmentClientQuery && (
              <small style={{ color: 'var(--muted)', fontWeight: 800 }}>
                La agenda te llevará a la cita más reciente que coincida.
              </small>
            )}
          </div>
        )}

        {showForm && (
          <div className="inline-appointment-form">
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
                                email: client.email || '',
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
                              email: '',
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
                  <Input
                    label="Correo para enviar los detalles de la cita (opcional)"
                    type="email"
                    value={draft.email}
                    onChange={(event) => updateDraft('email', event.target.value)}
                  />
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
                      {service.name} · ${Number(service.priceAmount ?? service.price ?? 0).toLocaleString('es-MX')}
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
                  <div className="manual-booking-slot-grid">
                    {availabilitySlots.map((slot) => {
                      const isSelected = draft.time === slot.time

                      return (
                        <Button
                          key={slot.id}
                          aria-pressed={isSelected}
                          variant={isSelected ? 'primary' : 'ghost'}
                          onClick={() => updateDraft('time', slot.time)}
                        >
                          <strong>{slot.time}</strong>
                          <small>Hasta {slot.end}</small>
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
          </div>
        )}

        {artistAppointmentsError && <small style={{ color: 'var(--rose-dark)', fontWeight: 800 }}>{artistAppointmentsError}</small>}
        {manualArtistAppointmentStatus && (
          <small style={{ color: 'var(--success)', fontWeight: 800 }}>{manualArtistAppointmentStatus}</small>
        )}
        {manualArtistAppointmentError && (
          <small style={{ color: 'var(--rose-dark)', fontWeight: 800 }}>{manualArtistAppointmentError}</small>
        )}

        <ArtistAppointmentCalendar
          appointments={appointmentsMatchingClientQuery}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          scrollToSelectedDateKey={calendarScrollRequest}
          workContext={artistWorkContext}
          onCreateAppointment={(slot) => {
            setSelectedDate(slot.date)
            setDraft((currentDraft) => ({ ...currentDraft, date: slot.date, time: slot.time }))
            setShowForm(true)
            window.requestAnimationFrame(() => document.querySelector('.inline-appointment-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
          }}
        />

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
                <small>El aviso se envia una sola vez por cita.</small>
              </div>
              {upcomingAppointments.some((appointment) => !appointment.confirmationRequestedAt) ? (
                <Button size="sm" variant="success" onClick={() => requestArtistAppointmentConfirmations({ date: selectedDate })}>
                  Enviar
                </Button>
              ) : (
                <StatusPill tone="success">Aviso enviado</StatusPill>
              )}
            </div>
          )}

          {upcomingAppointments.length > 0 ? upcomingAppointments.map((appointment) => (
            <div className={`list-row elevated-row appointment-status-row appointment-status-${getAppointmentStatusTone(appointment)}`} key={appointment.id}>
              <div>
                <strong>{appointment.client}</strong>
                <small>{appointment.service} / {appointment.time}</small>
                {appointment.arrivedAt && <small className="appointment-arrival-time">Llegó a las {formatAppointmentArrival(appointment.arrivedAt)}</small>}
                <AppointmentPayment appointment={appointment} />
                <AppointmentDeposit appointment={appointment} audience="business" onUpdated={loadArtistAppointments} />
                {!appointment.pendingClientConfirmation && <CompleteAppointmentButton appointment={appointment} />}
              </div>
              <div className="row-actions appointment-result-actions" style={{ justifyContent: 'flex-end', gap: 6 }}>
                <StatusPill tone="neutral">{getAppointmentContextLabel(appointment)}</StatusPill>
                {['google', 'instagram', 'facebook'].includes(appointment.bookingSource) && <StatusPill tone="warm">Enlace {appointment.bookingSource}</StatusPill>}
                {appointment.pendingClientConfirmation
                  ? <StatusPill tone="warm">Esperando confirmación de la clienta</StatusPill>
                  : <StatusPill tone={getAppointmentStatusTone(appointment)}>{appointment.status}</StatusPill>}
                {appointment.appointmentStatus === 'scheduled' && (
                  <>
                    <Button size="sm" variant="danger" disabled={cancellingAppointmentId === appointment.id} onClick={() => cancelAppointment(appointment)}>
                      {cancellingAppointmentId === appointment.id ? 'Cancelando...' : 'Cancelar cita'}
                    </Button>
                    <RescheduleAppointmentButton appointment={appointment} onRescheduled={loadArtistAppointments} />
                  </>
                )}
                {appointment.pointsGranted > 0 && <StatusPill tone="success">+{appointment.pointsGranted} FP otorgados</StatusPill>}
                {appointment.happyHourApplied && <StatusPill tone="success">Happy Hour</StatusPill>}
                {appointment.rewardMultiplier > 1 && <StatusPill tone="warm">Puntos dobles</StatusPill>}
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

      {shouldShowHistory && (
      <Card className="mobile-screen">
        <PanelHeader title="Historial" eyebrow={selectedDate} />
        <div className="compact-list">
          {pastAppointments.length > 0 ? pastAppointments.map((appointment) => (
            <div className={`list-row elevated-row appointment-status-row appointment-status-${getAppointmentStatusTone(appointment)}`} key={appointment.id}>
              <div>
                <strong>{appointment.client}</strong>
                <small>{appointment.service} / {appointment.time}</small>
                {appointment.arrivedAt && <small className="appointment-arrival-time">Llegó a las {formatAppointmentArrival(appointment.arrivedAt)}</small>}
                <AppointmentPayment appointment={appointment} />
                {!appointment.pendingClientConfirmation && <CompleteAppointmentButton appointment={appointment} />}
              </div>
              <div className="row-actions appointment-result-actions" style={{ justifyContent: 'flex-end', gap: 6 }}>
                <StatusPill tone="neutral">{getAppointmentContextLabel(appointment)}</StatusPill>
                {appointment.pendingClientConfirmation
                  ? <StatusPill tone="warm">Esperando confirmación de la clienta</StatusPill>
                  : <StatusPill tone={getAppointmentStatusTone(appointment)}>{appointment.status}</StatusPill>}
                {appointment.pointsGranted > 0 && <StatusPill tone="success">+{appointment.pointsGranted} FP otorgados</StatusPill>}
                {appointment.happyHourApplied && <StatusPill tone="success">Happy Hour</StatusPill>}
                {appointment.rewardMultiplier > 1 && <StatusPill tone="warm">Puntos dobles</StatusPill>}
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
      )}
    </main>
  )
}

export default ArtistAppointments
