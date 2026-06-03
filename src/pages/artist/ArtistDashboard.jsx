import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AgendaCard from '../../components/AgendaCard'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Input from '../../components/Input'
import MetricCard from '../../components/MetricCard'
import Modal from '../../components/Modal'
import PanelHeader from '../../components/PanelHeader'
import StatsCard from '../../components/StatsCard'
import { useApp } from '../../contexts/appContextCore'
import { paths } from '../../routes/paths'
import { artistAppointments, artistServices, recurringClients } from '../../services/mockData'
import { getClientById } from '../../utils/clientHelpers'
import { formatCurrency } from '../../utils/formatters'
import { calculateFlowPoints, addPointsToClient, vipTierThresholds } from '../../modules/loyalty/flowPointsEngine'
import { calculateAppointmentEconomy } from '../../modules/business/appointmentEconomyEngine'
import { canUseOperationalFeature } from '../../modules/governance/studioGovernance'

const artistMetricsPrivacyKey = 'studio-flow-artist-hide-metrics'
const mockStudioNames = ['Studio Glow Beauty', 'Valeria Moon', 'Valeria Moon Studio']

function getStoredMetricsPrivacy() {
  try {
    return localStorage.getItem(artistMetricsPrivacyKey) === 'true'
  } catch {
    return false
  }
}

function formatProfessionalLocation(location = {}, fallbackCity = '') {
  return [
    location.address,
    location.city || fallbackCity,
    location.state,
    location.postalCode,
  ].filter(Boolean).join(' / ')
}

function getInitials(name = '') {
  return String(name || '')
    .split(' ')
    .filter(Boolean)
    .map((item) => item[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function getConfiguredStudioName(...names) {
  return names.find((name) => {
    const normalizedName = String(name || '').trim()

    return normalizedName && !mockStudioNames.includes(normalizedName)
  }) || ''
}

function ArtistDashboard({ view = 'agenda' }) {
  const navigate = useNavigate()
  const { adminState, artistState, session, addArtistAppointment, addArtistClient, updateArtistClient, bookSlot, selectedDate, setSelectedDate } = useApp()
  const [showAppointmentForm, setShowAppointmentForm] = useState(false)
  const [pointsFeedback, setPointsFeedback] = useState(null)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [appointmentDraft, setAppointmentDraft] = useState({
    clientId: artistState.clients[0]?.id || '',
    client: artistState.clients[0]?.name || 'Mariana L.',
    phone: artistState.clients[0]?.phone || '',
    service: artistServices.find(s => s.status === 'Activo')?.name || '',
    date: '2026-05-18',
    time: '10:00',
  })
  const [clientSearch, setClientSearch] = useState('')
  const [isCreatingNewClient, setIsCreatingNewClient] = useState(false)
  const [newClient, setNewClient] = useState({ name: '', phone: '', notes: '' })
  const [hideMetrics, setHideMetrics] = useState(getStoredMetricsPrivacy)
  const primaryArtist = adminState.artists.find((artist) => artist.studioId === session.user?.studioId) || adminState.artists[0]
  const currentStudio = adminState.studios.find((studio) => studio.id === primaryArtist?.studioId) || adminState.studios[0]
  const studioProfile = currentStudio?.profile || {}
  const artistPersonalInfo = artistState.profile?.personalInfo || {}
  const artistDisplayName = artistPersonalInfo.fullName || primaryArtist?.owner || primaryArtist?.name || 'Artista profesional'
  const studioDisplayName = getConfiguredStudioName(
    studioProfile.commercialName,
    currentStudio?.businessName,
    currentStudio?.professionalLocation?.businessName,
  )
  const artistLocationSettings = artistState.profile?.professionalLocation || {}
  const effectiveLocation = artistLocationSettings.useStudioLocation === false
    ? artistLocationSettings.customLocation || {}
    : currentStudio?.professionalLocation || {}
  const heroLocation = formatProfessionalLocation(effectiveLocation, currentStudio?.city)
  const canUseEconomy = canUseOperationalFeature(currentStudio, 'economy')
  const canUsePublicAgenda = canUseOperationalFeature(currentStudio, 'publicAgenda')

  // Lógica de agenda dinámica
  const appointmentsForSelectedDate = artistState.appointments.filter(apt => apt.date === selectedDate && apt.type === 'appointment')
  const hasAppointments = appointmentsForSelectedDate.length > 0
  
  const appointmentCount = appointmentsForSelectedDate.length
  const totalDuration = appointmentsForSelectedDate.reduce((sum, apt) => {
    const minutes = parseInt(apt.duration) || 60
    return sum + minutes
  }, 0)
  const occupancy = Math.round((totalDuration / 480) * 100) // 480 min = 8 horas
  const estimatedRevenue = appointmentsForSelectedDate.reduce((sum, apt) => {
    const service = artistServices.find(s => s.name === apt.service)
    return sum + (service?.price || 0)
  }, 0)

  // Determinar el día de la semana
  const [year, month, day] = selectedDate.split('-').map(Number)
  const dateObj = new Date(year, month - 1, day)
  const dayOfWeek = dateObj.toLocaleDateString('es-MX', { weekday: 'short', month: 'short', day: 'numeric' })

  // Recomendaciones para días vacíos
  const emptyDayRecommendations = [
    { icon: '⏰', text: 'Happy Hour recomendado para Lash lifting' },
    { icon: '🔄', text: 'Reactivar clientas con oferta especial' },
    { icon: '✨', text: 'Promoción silenciosa a seguidoras' },
  ]

  const filteredClients = artistState.clients.filter(client =>
    client.name.toLowerCase().includes(clientSearch.toLowerCase())
  )
  const hasMatches = filteredClients.length > 0
  const showCreateOption = clientSearch.trim() && !hasMatches

  const saveAppointment = () => {
    if (!canUsePublicAgenda) return

    let nextClientId = appointmentDraft.clientId

    let createdClient = null

    if (isCreatingNewClient) {
      nextClientId = `artist-client-${Date.now()}`
      createdClient = {
        ...newClient,
        studioId: currentStudio?.id || 'studio-glow',
        id: nextClientId,
        vipTier: 'Glow',
        flowPoints: 0,
        streak: 1,
        totalVisits: 1,
        pointsExpirationDate: '2026-12-31',
        preferredServices: [appointmentDraft.service],
        favoriteArtist: artistDisplayName,
        lastVisit: appointmentDraft.date,
        nextRecommendedVisit: appointmentDraft.date,
        rewardsHistory: [],
      }
      addArtistClient(createdClient)
    }

    const service = artistServices.find((item) => item.name === appointmentDraft.service) || artistServices.find(s => s.status === 'Activo')
    const clientName = isCreatingNewClient
      ? newClient.name
      : artistState.clients.find((client) => client.id === nextClientId)?.name || appointmentDraft.client

    const appointmentPayload = {
      ...appointmentDraft,
      studioId: currentStudio?.id || 'studio-glow',
      clientId: nextClientId,
      client: clientName,
      end: appointmentDraft.time,
      duration: service.duration,
      room: 'Agenda',
      status: 'Confirmada',
      serviceTier: service.serviceTier,
      rewardApplied: null,
      pointsGranted: calculateFlowPoints(service.serviceTier),
      appointmentStatus: 'scheduled',
    }

    const economy = calculateAppointmentEconomy(appointmentPayload, service)

    addArtistAppointment({
      ...appointmentPayload,
      grossAmount: economy.grossAmount,
      platformFee: economy.platformFee,
      artistRevenue: economy.artistRevenue,
      riskScore: economy.riskScore,
    })

    bookSlot({
      date: appointmentDraft.date,
      studioId: currentStudio?.id || 'studio-glow',
      time: appointmentDraft.time,
      end: appointmentDraft.time,
      artist: artistDisplayName,
      service: appointmentDraft.service,
      durationMinutes: Number.parseInt(service.duration, 10) || 60,
    })

    // Calculate and add Flow Points
    const pointsEarned = calculateFlowPoints(service.serviceTier)
    const client = artistState.clients.find(c => c.id === nextClientId) || createdClient
    if (client) {
      const updatedClient = addPointsToClient(client, pointsEarned)
      updateArtistClient(client.id, updatedClient)
      const nextTier = vipTierThresholds.find((tier) => tier.minPoints > updatedClient.flowPoints)
      const pointsToNext = nextTier ? nextTier.minPoints - updatedClient.flowPoints : 0
      setPointsFeedback({
        clientName: clientName,
        points: pointsEarned,
        pointsToNext,
      })
      setTimeout(() => setPointsFeedback(null), 3000)
    }

    setShowAppointmentForm(false)
    setClientSearch('')
    setIsCreatingNewClient(false)
    setNewClient({ name: '', phone: '', notes: '' })
  }

  const toggleMetricsPrivacy = () => {
    setHideMetrics((currentValue) => {
      const nextValue = !currentValue

      try {
        localStorage.setItem(artistMetricsPrivacyKey, String(nextValue))
      } catch {
        // La preferencia visual sigue activa en la sesion aunque localStorage falle.
      }

      return nextValue
    })
  }

  return (
    <main className={`dashboard-grid artist-grid view-${view}`}>
        {view === 'agenda' && (
          <>
            <section className="hero-panel studio-hero artist-profile-hero mobile-screen">
              <div className="artist-hero-copy">
                <span className="eyebrow">{heroLocation || 'Ubicacion profesional por confirmar'}</span>
                <h2>{studioDisplayName}</h2>
              </div>
              <div className="artist-hero-photo">
                {studioProfile.logoUrl ? (
                  <img src={studioProfile.logoUrl} alt={`Logo de ${studioDisplayName}`} />
                ) : (
                  <span>{getInitials(studioDisplayName)}</span>
                )}
              </div>
              <div className="hero-actions artist-hero-actions">
                <Button disabled={!canUsePublicAgenda} onClick={() => setShowAppointmentForm((current) => !current)}>Agregar cita</Button>
                <Button variant="ghost" onClick={() => navigate(paths.artistSchedule)}>Editar horario</Button>
                <Button variant="ghost" onClick={toggleMetricsPrivacy}>
                  {hideMetrics ? '👁 Mostrar métricas' : '👁 Ocultar métricas'}
                </Button>
              </div>
              {!hideMetrics && (
                <div className="hero-summary">
                  <span>{primaryArtist?.plan || 'Perfil profesional'}</span>
                  <strong>{`${occupancy}%`}</strong>
                  <small>ocupacion de hoy</small>
                </div>
              )}
            </section>

            {pointsFeedback && (
              <div className="points-feedback">
                <strong>✨ +{pointsFeedback.points} Flow Points</strong>
                <p>{pointsFeedback.pointsToNext > 0 ? `Estás a ${pointsFeedback.pointsToNext} puntos de tu próxima recompensa.` : 'Ya estás listo para tu próxima recompensa.'}</p>
              </div>
            )}

            {!hideMetrics && (
              <>
                <MetricCard label="Citas" value={appointmentCount} trend={appointmentCount === 0 ? 'Agenda libre' : `+${appointmentCount} vs promedio`} className="mobile-compact" />
                <MetricCard label="Ocupación" value={`${occupancy}%`} trend={occupancy > 80 ? 'Día full' : 'Oportunidad'} tone={occupancy > 80 ? 'sage' : 'rose'} className="mobile-compact" />
                <MetricCard label="Ingresos estimados" value={canUseEconomy ? formatCurrency(estimatedRevenue) : 'Preparacion'} trend={canUseEconomy ? (estimatedRevenue === 0 ? 'Sin reservas' : '+18%') : 'Modo validacion'} tone="nude" className="mobile-compact" />
              </>
            )}

            {showAppointmentForm && (
              <Card className="mobile-screen primary-panel">
                <PanelHeader title="Nueva cita" eyebrow="Mock" />
                <div className="form-stack compact-form">
                  <label className="input-field">
                    <span>Cliente</span>
                    {!isCreatingNewClient ? (
                      <>
                        <input
                          type="text"
                          placeholder="Buscar clienta..."
                          value={clientSearch}
                          onChange={(e) => setClientSearch(e.target.value)}
                          onFocus={() => setClientSearch(appointmentDraft.client)}
                        />
                        {clientSearch && (
                          <div className="autocomplete-suggestions">
                            {filteredClients.map((client) => (
                              <button
                                key={client.id}
                                type="button"
                                className="suggestion-item"
                                onClick={() => {
                                  setAppointmentDraft({ ...appointmentDraft, clientId: client.id, client: client.name, phone: client.phone })
                                  setClientSearch('')
                                }}
                              >
                                {client.name}
                              </button>
                            ))}
                            {showCreateOption && (
                              <button
                                type="button"
                                className="suggestion-item create-new"
                                onClick={() => {
                                  setIsCreatingNewClient(true)
                                  setAppointmentDraft((prev) => ({
                                    ...prev,
                                    clientId: '',
                                    client: clientSearch,
                                    phone: '',
                                  }))
                                  setNewClient({ name: clientSearch, phone: '', notes: '' })
                                }}
                              >
                                + Crear nueva clienta
                              </button>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="new-client-form">
                        <input
                          type="text"
                          placeholder="Nombre"
                          value={newClient.name}
                          onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                        />
                        <input
                          type="tel"
                          placeholder="Número celular"
                          value={newClient.phone}
                          onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                        />
                        <textarea
                          placeholder="Notas (opcional)"
                          value={newClient.notes}
                          onChange={(e) => setNewClient({ ...newClient, notes: e.target.value })}
                          rows="2"
                        />
                        <div className="form-actions">
                          <Button variant="ghost" size="sm" onClick={() => setIsCreatingNewClient(false)}>Cancelar</Button>
                        </div>
                      </div>
                    )}
                  </label>                  {!isCreatingNewClient && (
                    <Input
                      label="Número celular"
                      type="tel"
                      placeholder="55 0000 0000"
                      value={appointmentDraft.phone}
                      onChange={(event) => setAppointmentDraft({ ...appointmentDraft, phone: event.target.value })}
                    />
                  )}                  <label className="input-field">
                    <span>Servicio</span>
                    <select value={appointmentDraft.service} onChange={(event) => setAppointmentDraft({ ...appointmentDraft, service: event.target.value })}>
                      {artistServices.filter(s => s.status === 'Activo').map((service) => <option key={service.name} value={service.name}>{service.name} · {service.duration}</option>)}
                    </select>
                  </label>
                  <Input label="Fecha" type="date" value={appointmentDraft.date} onChange={(event) => setAppointmentDraft({ ...appointmentDraft, date: event.target.value })} />
                  <Input label="Hora" type="time" value={appointmentDraft.time} onChange={(event) => setAppointmentDraft({ ...appointmentDraft, time: event.target.value })} />
                  <Button className="full-width" disabled={!canUsePublicAgenda} onClick={saveAppointment}>Confirmar cita</Button>
                </div>
              </Card>
            )}

            <Card className="calendar-card mobile-screen primary-panel">
              <PanelHeader 
                title="Agenda visual" 
                eyebrow={dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1)} 
                action={
                  <div style={{ position: 'relative' }}>
                    <Button variant="ghost" size="sm" onClick={() => setShowDatePicker(!showDatePicker)}>Filtrar</Button>
                    {showDatePicker && (
                      <div style={{ 
                        position: 'absolute', 
                        top: '100%', 
                        right: 0, 
                        zIndex: 20, 
                        background: 'var(--surface)', 
                        border: '1px solid var(--line)', 
                        borderRadius: 'var(--radius)',
                        boxShadow: 'var(--shadow-soft)',
                        padding: '12px',
                        marginTop: '4px',
                        minWidth: '200px'
                      }}>
                        <input 
                          type="date" 
                          value={selectedDate} 
                          onChange={(e) => {
                            setSelectedDate(e.target.value)
                            setShowDatePicker(false)
                          }}
                          style={{
                            background: '#fff',
                            border: '1px solid var(--line)',
                            borderRadius: 'var(--radius)',
                            padding: '8px 12px',
                            width: '100%',
                            fontSize: '14px',
                            cursor: 'pointer',
                          }}
                        />
                      </div>
                    )}
                  </div>
                } 
              />
              <div className="agenda-rules-strip">
                <span>Intervalo 15 min</span>
                <span>Anticipacion minima 2 h</span>
                <span>Descanso 14:00 - 15:00</span>
              </div>
              <div className="day-strip">
                {['2026-05-13', '2026-05-14', '2026-05-15', '2026-05-16', '2026-05-17'].map((dateValue) => {
                  const d = new Date(dateValue.split('-')[0], parseInt(dateValue.split('-')[1]) - 1, parseInt(dateValue.split('-')[2]))
                  const dayLabel = d.toLocaleDateString('es-MX', { weekday: 'short' }).substring(0, 3)
                  const dayNum = d.getDate()
                  return (
                    <button 
                      className={selectedDate === dateValue ? 'active' : ''} 
                      type="button" 
                      key={dateValue}
                      onClick={() => setSelectedDate(dateValue)}
                    >
                      <span>{dayLabel}</span>
                      <strong>{dayNum}</strong>
                    </button>
                  )
                })}
              </div>
              {hasAppointments ? (
                <div className="timeline">
                  {appointmentsForSelectedDate.map((item, index) => {
                    const client = getClientById(artistState.clients, item.clientId)
                    const serviceData = artistServices.find(s => s.name === item.service)
                    const economyData = calculateAppointmentEconomy(item, serviceData)
                    return (
                      <AgendaCard
                        accent={index % 2 === 0 ? 'rose' : 'nude'}
                        key={`${item.id}-${item.time}`}
                        time={`${item.time} - ${item.end}`}
                        title={client?.name || item.client}
                        subtitle={`${item.service} / ${item.duration} / ${item.room}`}
                        status={item.status}
                        type={item.type}
                        showEconomy={canUseEconomy}
                        economyData={economyData}
                      />
                    )
                  })}
                </div>
              ) : (
                <div style={{
                  background: 'linear-gradient(135deg, rgba(245, 221, 223, 0.3), rgba(234, 219, 210, 0.2))',
                  borderRadius: 'var(--radius)',
                  padding: '28px 20px',
                  textAlign: 'center',
                  marginTop: '16px',
                }}>
                  <p style={{
                    fontSize: '16px',
                    fontWeight: '600',
                    color: 'var(--text)',
                    margin: '0 0 8px 0',
                  }}>Tu agenda está libre este día ✨</p>
                  <p style={{
                    fontSize: '13px',
                    color: 'var(--muted)',
                    margin: '0 0 16px 0',
                  }}>Es un excelente momento para activar promociones inteligentes y atraer más clientas.</p>
                  
                  <div style={{ marginTop: '16px' }}>
                    <p style={{
                      fontSize: '12px',
                      fontWeight: '700',
                      color: 'var(--text)',
                      margin: '12px 0 8px 0',
                      textAlign: 'left',
                    }}>Recomendaciones:</p>
                    {emptyDayRecommendations.map((rec, idx) => (
                      <div key={idx} style={{
                        display: 'flex',
                        gap: '8px',
                        padding: '8px 0',
                        fontSize: '13px',
                        color: 'var(--text)',
                        textAlign: 'left',
                      }}>
                        <span>{rec.icon}</span>
                        <span>{rec.text}</span>
                      </div>
                    ))}
                  </div>

                  <Button 
                    className="full-width" 
                    onClick={() => navigate(paths.artistMarketing)}
                    style={{ marginTop: '16px' }}
                  >
                    Impulsar este día
                  </Button>
                </div>
              )}
            </Card>
          </>
        )}

        {view === 'citas' && (
          <>
            <Card className="mobile-screen primary-panel">
              <PanelHeader title="Proximas citas" eyebrow="Hoy" action={<Button size="sm">Nueva</Button>} />
              <div className="compact-list">
                {artistAppointments.map((item) => (
                  <div className="list-row elevated-row" key={item.client}>
                    <div>
                      <strong>{item.client}</strong>
                      <small>{item.service} / {item.room}</small>
                    </div>
                    <span>{item.time}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="modal-preview-card">
              <PanelHeader title="Crear cita" eyebrow="Flujo preparado" />
              <Modal
                title="Nueva cita"
                description="Estructura visual lista para conectar agenda real, servicios y clientas."
                primaryAction="Crear cita"
              />
            </Card>
          </>
        )}

        {view === 'servicios' && (
          <>
            <Card className="mobile-screen primary-panel">
              <PanelHeader title="Servicios" eyebrow="Menu activo" />
              <div className="service-list">
                {artistServices.map((service) => (
                  <div className="service-row" key={service.name}>
                    <div>
                      <strong>{service.name}</strong>
                      <small>{service.duration} / {service.bookings} reservas</small>
                    </div>
                    <div className="service-price">
                      <span>{formatCurrency(service.price)}</span>
                      <small>{service.demand}</small>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            {!hideMetrics && (
              <StatsCard title="Historial" value="$42.6K" caption="Ingresos estimados de los ultimos 30 dias">
                <div className="history-chart">
                  <span style={{ height: '45%' }}></span>
                  <span style={{ height: '70%' }}></span>
                  <span style={{ height: '58%' }}></span>
                  <span style={{ height: '88%' }}></span>
                  <span style={{ height: '76%' }}></span>
                  <span style={{ height: '92%' }}></span>
                </div>
              </StatsCard>
            )}
          </>
        )}

        {view === 'clientes' && (
          <Card className="mobile-screen primary-panel">
            <PanelHeader title="Clientes recurrentes" eyebrow="Lealtad" />
            <div className="compact-list">
              {recurringClients.map((client) => (
                <div className="list-row elevated-row" key={client.name}>
                  <div>
                    <strong>{client.name}</strong>
                    <small>{client.visits} visitas / {client.value}</small>
                  </div>
                  <span>{client.next}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {view === 'ajustes' && (
          <Card className="settings-card mobile-screen primary-panel">
            <PanelHeader title="Configuraciones rapidas" eyebrow="Workspace" />
            <label className="toggle-row">
              Confirmacion automatica
              <input type="checkbox" defaultChecked />
            </label>
            <label className="toggle-row">
              Recordatorios a clientas
              <input type="checkbox" defaultChecked />
            </label>
            <label className="toggle-row">
              Pausa de reservas
              <input type="checkbox" />
            </label>
          </Card>
        )}
    </main>
  )
}

export default ArtistDashboard
