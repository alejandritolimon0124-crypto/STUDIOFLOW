import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Input from '../../components/Input'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import { useApp } from '../../contexts/appContextCore'
import { paths } from '../../routes/paths'
import { fetchArtistClients } from '../../services/artistClientService'

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
  const navigate = useNavigate()
  const { artistWorkContext } = useApp()
  const [clients, setClients] = useState([])
  const [search, setSearch] = useState('')
  const [selectedPanel, setSelectedPanel] = useState({ client: null, mode: '' })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

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
  }

  const closePanel = () => setSelectedPanel({ client: null, mode: '' })

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
                  {selectedPanel.mode === 'appointment' && (
                    <div className="compact-list">
                      <div className="list-row elevated-row">
                        <div>
                          <strong>Crear cita para {client.name}</strong>
                          <small>Abre el formulario con la clienta ya seleccionada.</small>
                        </div>
                        <Button size="sm" onClick={() => navigate(paths.artistAppointments, { state: { selectedClient: client } })}>Continuar</Button>
                      </div>
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
                      <div className="list-row elevated-row">
                        <div>
                          <strong>{client.phone || 'Sin celular'}</strong>
                          <small>{client.email || 'Sin email'}</small>
                          <small>Ultima visita: {client.lastVisit || 'sin fecha'}</small>
                        </div>
                        <StatusPill tone="success">{client.totalVisits} visitas</StatusPill>
                      </div>
                      {renderAppointmentRows(client.history, 'Sin citas registradas.')}
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
