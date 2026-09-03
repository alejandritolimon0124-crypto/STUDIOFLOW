import { useEffect, useMemo, useState } from 'react'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Input from '../../components/Input'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import { useApp } from '../../contexts/appContextCore'
import { fetchArtistClients } from '../../services/artistClientService'
import { fetchManualArtistAvailability } from '../../services/appointmentService'

function getAppointmentTimestamp(appointment = {}) {
  const date = appointment.startsAt || appointment.starts_at || appointment.date || ''
  const time = appointment.time || ''
  const value = date.includes('T') ? date : `${date}T${time || '00:00'}`
  const timestamp = new Date(value).getTime()

  return Number.isNaN(timestamp) ? 0 : timestamp
}

function isCancelledAppointment(appointment = {}) {
  const status = String(appointment.status || appointment.appointmentStatus || appointment.appointment_status || '').toLowerCase()
  return ['cancelada', 'cancelado', 'cancelled', 'canceled', 'no show', 'no_show'].some((blockedStatus) => status.includes(blockedStatus))
}

function getInitials(name = 'Clienta') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

function getUpcomingAppointments(client = {}) {
  const now = Date.now()

  return (client.history || [])
    .filter((appointment) => getAppointmentTimestamp(appointment) >= now && !isCancelledAppointment(appointment))
    .sort((firstAppointment, secondAppointment) => getAppointmentTimestamp(firstAppointment) - getAppointmentTimestamp(secondAppointment))
}

function getPastAppointments(client = {}) {
  const now = Date.now()

  return (client.history || [])
    .filter((appointment) => getAppointmentTimestamp(appointment) < now || isCancelledAppointment(appointment))
    .sort((firstAppointment, secondAppointment) => getAppointmentTimestamp(secondAppointment) - getAppointmentTimestamp(firstAppointment))
}

function ArtistClients() {
  const {
    artistServices,
    artistWorkContext,
    createManualArtistAppointment,
    isManualArtistAppointmentSaving,
    loadArtistAppointments,
  } = useApp()
  const [clients, setClients] = useState([])
  const [search, setSearch] = useState('')
  const [selectedPanel, setSelectedPanel] = useState({ client: null, mode: '' })
  const [appointmentDraft, setAppointmentDraft] = useState({
    serviceOfferingId: '',
    date: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10),
    time: '',
    notes: '',
  })
  const [availabilitySlots, setAvailabilitySlots] = useState([])
  const [isAvailabilityLoading, setIsAvailabilityLoading] = useState(false)
  const [appointmentFeedback, setAppointmentFeedback] = useState({ tone: 'neutral', message: '' })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const activeArtistServices = artistServices.filter((service) => ['activo', 'active'].includes(String(service.status || '').toLowerCase()))

  useEffect(() => {
    let isActive = true
    const query = search.trim()

    if (query.length < 2) {
      setClients([])
      setSelectedPanel({ client: null, mode: '' })
      setError('')
      setIsLoading(false)
      return () => {
        isActive = false
      }
    }

    setIsLoading(true)
    setError('')

    fetchArtistClients({ search: query, limit: 5, workContext: artistWorkContext })
      .then((nextClients) => {
        if (!isActive) return
        setClients(nextClients)
        setSelectedPanel((currentPanel) => {
          if (!currentPanel.client) return currentPanel
          const nextClient = nextClients.find((client) => client.id === currentPanel.client.id)
          return nextClient ? { ...currentPanel, client: nextClient } : { client: null, mode: '' }
        })
      })
      .catch((requestError) => {
        if (!isActive) return
        setClients([])
        setError(requestError.message || 'No se pudieron cargar las clientas reales.')
      })
      .finally(() => {
        if (isActive) setIsLoading(false)
      })

    return () => {
      isActive = false
    }
  }, [artistWorkContext, search])

  const resultLabel = useMemo(() => {
    if (isLoading) return 'Cargando'
    if (clients.length === 0) return 'Sin resultados'
    return `${clients.length}/5`
  }, [clients.length, isLoading])

  const openPanel = (client, mode) => {
    setSelectedPanel((currentPanel) => (
      currentPanel.client?.id === client.id && currentPanel.mode === mode
        ? { client: null, mode: '' }
        : { client, mode }
    ))
    setAppointmentFeedback({ tone: 'neutral', message: '' })
  }

  const closePanel = () => setSelectedPanel({ client: null, mode: '' })

  useEffect(() => {
    if (!appointmentDraft.serviceOfferingId && activeArtistServices[0]?.id) {
      setAppointmentDraft((currentDraft) => ({ ...currentDraft, serviceOfferingId: activeArtistServices[0].id }))
    }
  }, [activeArtistServices, appointmentDraft.serviceOfferingId])

  useEffect(() => {
    if (selectedPanel.mode !== 'appointment' || !appointmentDraft.serviceOfferingId || !appointmentDraft.date) {
      setAvailabilitySlots([])
      return undefined
    }

    let isActive = true
    setIsAvailabilityLoading(true)
    setAppointmentFeedback({ tone: 'neutral', message: '' })

    fetchManualArtistAvailability({
      serviceOfferingId: appointmentDraft.serviceOfferingId,
      date: appointmentDraft.date,
      workContext: artistWorkContext,
    })
      .then((availability) => {
        if (isActive) setAvailabilitySlots(availability.slots || [])
      })
      .catch((requestError) => {
        if (!isActive) return
        setAvailabilitySlots([])
        setAppointmentFeedback({ tone: 'warm', message: requestError.message || 'No se pudieron cargar horarios disponibles.' })
      })
      .finally(() => {
        if (isActive) setIsAvailabilityLoading(false)
      })

    return () => {
      isActive = false
    }
  }, [appointmentDraft.date, appointmentDraft.serviceOfferingId, artistWorkContext, selectedPanel.mode])

  const updateAppointmentDraft = (field, value) => {
    setAppointmentDraft((currentDraft) => ({
      ...currentDraft,
      [field]: value,
      ...(field === 'date' || field === 'serviceOfferingId' ? { time: '' } : {}),
    }))
    setAppointmentFeedback({ tone: 'neutral', message: '' })
  }

  const saveInlineAppointment = async (client) => {
    if (!appointmentDraft.serviceOfferingId || !appointmentDraft.date || !appointmentDraft.time) {
      setAppointmentFeedback({ tone: 'warm', message: 'Selecciona servicio, fecha y horario disponible.' })
      return
    }

    const appointment = await createManualArtistAppointment({
      clientId: client.id,
      serviceOfferingId: appointmentDraft.serviceOfferingId,
      date: appointmentDraft.date,
      time: appointmentDraft.time,
      notes: appointmentDraft.notes,
      workContext: artistWorkContext,
    })

    if (!appointment) {
      setAppointmentFeedback({ tone: 'warm', message: 'No se pudo generar la cita.' })
      return
    }

    await loadArtistAppointments()
    const refreshedClients = await fetchArtistClients({ search: search.trim(), limit: 5, workContext: artistWorkContext })
    setClients(refreshedClients)
    const refreshedClient = refreshedClients.find((item) => item.id === client.id) || client
    setSelectedPanel({ client: refreshedClient, mode: 'upcoming' })
    setAppointmentFeedback({ tone: 'success', message: 'Cita generada con exito.' })
    setAppointmentDraft((currentDraft) => ({ ...currentDraft, time: '', notes: '' }))
  }

  const renderAppointmentRows = (appointments = [], emptyMessage = 'Sin citas para mostrar.') => (
    <div className="compact-list">
      {appointments.length > 0 ? appointments.map((item) => (
        <div className="list-row elevated-row" key={item.id || `${item.service}-${item.date}-${item.time || item.startsAt || ''}`}>
          <div>
            <strong>{item.service || 'Servicio'}</strong>
            <small>{item.date || String(item.startsAt || item.starts_at || '').slice(0, 10)} {item.time || String(item.startsAt || item.starts_at || '').slice(11, 16)}</small>
            <small>{item.contextName || item.studioName || item.artistName || 'Studio Flow'}</small>
          </div>
          <StatusPill tone={isCancelledAppointment(item) ? 'rose' : 'neutral'}>{item.status || 'Agendada'}</StatusPill>
        </div>
      )) : (
        <div className="list-row elevated-row">
          <div>
            <strong>{emptyMessage}</strong>
            <small>La informacion se alimenta de citas reales del contexto activo.</small>
          </div>
          <StatusPill tone="neutral">Citas</StatusPill>
        </div>
      )}
    </div>
  )

  return (
    <main className="dashboard-grid artist-grid">
      <Card className="wide-card mobile-screen primary-panel">
        <PanelHeader title="Clientas" eyebrow="Citas reales" />
        <div className="form-stack compact-form">
          <Input
            label="Buscar clienta"
            placeholder="Nombre, apellido o celular"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="compact-list">
          {error && (
            <div className="list-row elevated-row">
              <div>
                <strong>No se pudo cargar</strong>
                <small>{error}</small>
              </div>
              <StatusPill tone="neutral">Clientas</StatusPill>
            </div>
          )}

          {!error && clients.length > 0 && clients.map((client) => (
            <div className="client-result-block" key={client.id}>
              <div className="list-row elevated-row">
                <div>
                  <strong>{client.name}</strong>
                  <small>{client.phone || 'Sin celular'} / {client.email || 'Sin email'}</small>
                  <small>{client.totalVisits} visitas / ultima visita {client.lastVisit || 'sin fecha'}</small>
                </div>
                <div className="row-actions">
                  <StatusPill tone="rose">{client.lastVisit || 'Real'}</StatusPill>
                  <button type="button" onClick={() => openPanel(client, 'appointment')}>Generar cita</button>
                  <button type="button" onClick={() => openPanel(client, 'upcoming')}>Proxima cita</button>
                  <button type="button" onClick={() => openPanel(client, 'history')}>Ver historial</button>
                  <button type="button" onClick={() => openPanel(client, 'profile')}>Ver perfil</button>
                </div>
              </div>
              {selectedPanel.client?.id === client.id && (
                <div className="client-inline-info-panel">
                  <PanelHeader
                    title={selectedPanel.mode === 'appointment' ? 'Generar cita' : selectedPanel.mode === 'upcoming' ? 'Proxima cita' : selectedPanel.mode === 'history' ? 'Historial' : 'Perfil clienta'}
                    eyebrow={client.name}
                    action={<Button size="sm" variant="ghost" onClick={closePanel}>Ocultar info</Button>}
                  />
                  {appointmentFeedback.message && (
                    <div className={`list-row elevated-row ${appointmentFeedback.tone === 'success' ? 'booking-success-row' : 'booking-error-row'}`}>
                      <div>
                        <strong>{appointmentFeedback.tone === 'success' ? 'Cita generada con exito' : 'Aviso'}</strong>
                        <small>{appointmentFeedback.message}</small>
                      </div>
                      <StatusPill tone={appointmentFeedback.tone === 'success' ? 'success' : 'neutral'}>Cita</StatusPill>
                    </div>
                  )}
                  {selectedPanel.mode === 'appointment' && (
                    <div className="form-stack compact-form">
                      <div className="list-row elevated-row">
                        <div>
                          <strong>{client.name}</strong>
                          <small>{client.phone || 'Sin celular'} / clienta seleccionada</small>
                        </div>
                        <StatusPill tone="success">Lista</StatusPill>
                      </div>
                      <label className="input-field">
                        <span>Servicio</span>
                        <select
                          value={appointmentDraft.serviceOfferingId}
                          onChange={(event) => updateAppointmentDraft('serviceOfferingId', event.target.value)}
                        >
                          {activeArtistServices.length === 0 && <option value="">Sin servicios activos</option>}
                          {activeArtistServices.map((service) => (
                            <option key={service.id} value={service.id}>{service.name}</option>
                          ))}
                        </select>
                      </label>
                      <Input
                        label="Fecha"
                        type="date"
                        value={appointmentDraft.date}
                        onChange={(event) => updateAppointmentDraft('date', event.target.value)}
                      />
                      <div className="input-field">
                        <span>Horarios disponibles</span>
                        {isAvailabilityLoading && <small>Cargando horarios...</small>}
                        {!isAvailabilityLoading && availabilitySlots.length === 0 && (
                          <small>Sin horarios disponibles para esta fecha.</small>
                        )}
                        {!isAvailabilityLoading && availabilitySlots.length > 0 && (
                          <div className="inline-slot-grid">
                            {availabilitySlots.map((slot) => (
                              <Button
                                key={slot.id}
                                size="sm"
                                variant={appointmentDraft.time === slot.time ? 'primary' : 'ghost'}
                                onClick={() => updateAppointmentDraft('time', slot.time)}
                              >
                                {slot.time}
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>
                      <label className="input-field">
                        <span>Notas</span>
                        <textarea
                          rows="3"
                          value={appointmentDraft.notes}
                          onChange={(event) => updateAppointmentDraft('notes', event.target.value)}
                        />
                      </label>
                      <Button className="full-width appointment-primary-action" disabled={isManualArtistAppointmentSaving} onClick={() => saveInlineAppointment(client)}>
                        {isManualArtistAppointmentSaving ? 'Guardando cita...' : 'Guardar cita'}
                      </Button>
                    </div>
                  )}
                  {selectedPanel.mode === 'upcoming' && renderAppointmentRows(
                    getUpcomingAppointments(client).slice(0, 1),
                    'No hay proxima cita agendada.',
                  )}
                  {selectedPanel.mode === 'history' && renderAppointmentRows(
                    getPastAppointments(client),
                    'No hay historial para mostrar.',
                  )}
                  {selectedPanel.mode === 'profile' && (
                    <div className="compact-list">
                      <div className="client-profile-summary-card">
                        <div className="client-profile-avatar">
                          {client.photoUrl ? (
                            <img src={client.photoUrl} alt={client.name} />
                          ) : (
                            <span>{getInitials(client.name)}</span>
                          )}
                        </div>
                        <div className="client-profile-details">
                          <span className="eyebrow">Nombre completo</span>
                          <strong>{client.name}</strong>
                          <small className="client-phone-highlight">{client.phone || 'Sin celular'}</small>
                          <small>{client.email || 'Sin correo electronico'}</small>
                          <small>Ultima visita: {client.lastVisit || 'sin fecha'}</small>
                        </div>
                        <StatusPill tone="success">{client.totalVisits} visitas</StatusPill>
                      </div>
                      <div className="client-profile-notes-card">
                        <span className="eyebrow">Nota especial</span>
                        <p>{client.notes || 'Sin nota especial registrada.'}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {!error && search.trim().length >= 2 && clients.length === 0 && (
            <div className="list-row elevated-row">
              <div>
                <strong>{isLoading ? 'Cargando clientas...' : 'Sin clientas reales'}</strong>
                <small>
                  {isLoading
                    ? 'Consultando citas reales.'
                    : 'Apareceran aqui cuando existan citas asociadas a esta artista.'}
                </small>
              </div>
              <StatusPill tone="neutral">{resultLabel}</StatusPill>
            </div>
          )}
        </div>
      </Card>
    </main>
  )
}

export default ArtistClients
