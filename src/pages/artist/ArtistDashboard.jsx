import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AgendaCard from '../../components/AgendaCard'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Input from '../../components/Input'
import MetricCard from '../../components/MetricCard'
import Modal from '../../components/Modal'
import PanelHeader from '../../components/PanelHeader'
import StatsCard from '../../components/StatsCard'
import StatusPill from '../../components/StatusPill'
import { useApp } from '../../contexts/appContextCore'
import { paths } from '../../routes/paths'
import { fetchManualArtistAvailability } from '../../services/appointmentService'
import { fetchArtistClients } from '../../services/artistClientService'
import { getClientById } from '../../utils/clientHelpers'
import { formatCurrency } from '../../utils/formatters'
import { calculateFlowPoints, addPointsToClient, vipTierThresholds } from '../../modules/loyalty/flowPointsEngine'
import { calculateAppointmentEconomy } from '../../modules/business/appointmentEconomyEngine'
import { canUseOperationalFeature } from '../../modules/governance/studioGovernance'
import {
  deriveMembershipsFromLegacyData,
  getCurrentArtist,
  getMembershipForArtist,
  getStudioForArtist,
} from '../../modules/entities/entitySelectors'

const artistMetricsPrivacyKey = 'studio-flow-artist-hide-metrics'

function parseDateValue(dateValue) {
  const [year, month, day] = String(dateValue || '').split('-').map(Number)
  if (!year || !month || !day) return new Date()

  return new Date(year, month - 1, day)
}

function getTodayDateValue() {
  const today = new Date()
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset())
  return today.toISOString().slice(0, 10)
}

function getSafeDateValue(dateValue) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(dateValue || '')) ? dateValue : getTodayDateValue()
}

function getSafeDayLabel(dateValue) {
  try {
    const date = parseDateValue(dateValue)
    return date.toLocaleDateString('es-MX', { weekday: 'short', month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

function formatDateValue(date) {
  const normalizedDate = new Date(date)
  normalizedDate.setMinutes(normalizedDate.getMinutes() - normalizedDate.getTimezoneOffset())
  return normalizedDate.toISOString().slice(0, 10)
}

function buildVisibleDays(selectedDate) {
  const startDate = parseDateValue(selectedDate)

  return Array.from({ length: 31 }, (_, index) => {
    const date = new Date(startDate)
    date.setDate(startDate.getDate() + index - 15)
    return formatDateValue(date)
  })
}

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

function hasProfessionalLocationContent(location = {}) {
  return Boolean([
    location.address,
    location.city,
    location.state,
    location.postalCode,
    location.latitude,
    location.longitude,
  ].some((value) => String(value || '').trim()))
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

function appointmentMatchesWorkContext(appointment = {}, workContext = {}) {
  if (workContext?.contextType === 'membership') {
    return appointment.membershipId === workContext.membershipId
      || appointment.membership_id === workContext.membershipId
  }

  return !(appointment.studioId || appointment.studio_id || appointment.membershipId || appointment.membership_id)
}

function ArtistDashboard({ view = 'agenda' }) {
  const navigate = useNavigate()
  const {
    adminState,
    artistServices,
    artistState,
    artistAppointments: realArtistAppointments,
    appointmentState,
    session,
    addArtistClient,
    updateArtistClient,
    createManualArtistAppointment,
    loadArtistAppointments,
    manualArtistAppointmentError,
    manualArtistAppointmentStatus,
    isManualArtistAppointmentSaving,
    requestArtistAppointmentConfirmations,
    awardAppointmentFlowPoints,
    selectedDate,
    setSelectedDate,
    artistWorkContext,
  } = useApp()
  const [showAppointmentForm, setShowAppointmentForm] = useState(false)
  const appointmentFormRef = useRef(null)
  const dayStripRef = useRef(null)
  const [pointsFeedback, setPointsFeedback] = useState(null)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [appointmentDraft, setAppointmentDraft] = useState({
    clientId: artistState.clients[0]?.id || '',
    client: artistState.clients[0]?.name || '',
    phone: artistState.clients[0]?.phone || '',
    serviceOfferingId: artistServices.find(s => s.status === 'Activo')?.id || '',
    date: getSafeDateValue(selectedDate),
    time: '10:00',
    notes: '',
  })
  const [clientSearch, setClientSearch] = useState('')
  const [remoteClientResults, setRemoteClientResults] = useState([])
  const [isClientSearchLoading, setIsClientSearchLoading] = useState(false)
  const [clientSearchError, setClientSearchError] = useState('')
  const [availabilitySlots, setAvailabilitySlots] = useState([])
  const [availabilityMeta, setAvailabilityMeta] = useState({ durationMinutes: 0 })
  const [isAvailabilityLoading, setIsAvailabilityLoading] = useState(false)
  const [availabilityError, setAvailabilityError] = useState('')
  const [isCreatingNewClient, setIsCreatingNewClient] = useState(false)
  const [newClient, setNewClient] = useState({ name: '', phone: '', notes: '' })
  const [hideMetrics, setHideMetrics] = useState(getStoredMetricsPrivacy)
  const safeSelectedDate = getSafeDateValue(selectedDate)

  useEffect(() => {
    if (!appointmentDraft.serviceOfferingId) {
      const firstActiveService = artistServices.find((service) => service.status === 'Activo')
      if (firstActiveService?.id) {
        setAppointmentDraft((currentDraft) => ({ ...currentDraft, serviceOfferingId: firstActiveService.id }))
      }
    }
  }, [artistServices, appointmentDraft.serviceOfferingId])

  useEffect(() => {
    setAppointmentDraft((currentDraft) => ({
      ...currentDraft,
      date: safeSelectedDate,
      time: currentDraft.date === safeSelectedDate ? currentDraft.time : '',
    }))
  }, [safeSelectedDate])

  useEffect(() => {
    if (!showAppointmentForm || !appointmentDraft.serviceOfferingId || !appointmentDraft.date) {
      setAvailabilitySlots([])
      setAvailabilityMeta({ durationMinutes: 0 })
      setAvailabilityError('')
      return undefined
    }

    let isActive = true
    setIsAvailabilityLoading(true)
    setAvailabilityError('')

    fetchManualArtistAvailability({
      serviceOfferingId: appointmentDraft.serviceOfferingId,
      date: appointmentDraft.date,
      workContext: artistWorkContext,
    })
      .then((availability) => {
        if (!isActive) return
        setAvailabilitySlots(availability.slots)
        setAvailabilityMeta({ durationMinutes: availability.durationMinutes })
        setAppointmentDraft((currentDraft) => (
          availability.slots.some((slot) => slot.time === currentDraft.time)
            ? currentDraft
            : { ...currentDraft, time: '' }
        ))
      })
      .catch((error) => {
        if (!isActive) return
        setAvailabilitySlots([])
        setAvailabilityMeta({ durationMinutes: 0 })
        setAvailabilityError(error.message || 'No se pudieron cargar horarios disponibles.')
      })
      .finally(() => {
        if (isActive) setIsAvailabilityLoading(false)
      })

    return () => {
      isActive = false
    }
  }, [appointmentDraft.date, appointmentDraft.serviceOfferingId, artistWorkContext, showAppointmentForm])

  useEffect(() => {
    const search = clientSearch.trim()

    if (search.length < 2) {
      setRemoteClientResults([])
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
        setRemoteClientResults(clients)
      })
      .catch((error) => {
        if (!isActive) return
        setRemoteClientResults([])
        setClientSearchError(error.message || 'No se pudieron buscar clientas registradas.')
      })
      .finally(() => {
        if (isActive) setIsClientSearchLoading(false)
      })

    return () => {
      isActive = false
    }
  }, [artistWorkContext, clientSearch])

  useEffect(() => {
    if (!showAppointmentForm) return

    window.requestAnimationFrame(() => {
      appointmentFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [showAppointmentForm])

  useEffect(() => {
    try {
      const activeDay = dayStripRef.current?.querySelector('.active')
      activeDay?.scrollIntoView({ block: 'nearest', inline: 'center' })
    } catch {
      // La tira sigue funcionando aunque el navegador no soporte scrollIntoView con opciones.
    }
  }, [safeSelectedDate])
  const localProfiles = session.user ? [{ ...session.user, id: session.user.id }] : []
  const artistStudioMemberships = deriveMembershipsFromLegacyData({ artists: adminState.artists })
  const selectorArtists = adminState.artists.map((artist) => (
    getMembershipForArtist({
      artistId: artist.id,
      studioId: session.user?.studioId,
      artistStudioMemberships,
    })
      ? { ...artist, profileId: session.user?.id }
      : artist
  ))
  const sessionArtist = session.artist
    ? {
        ...session.artist,
        name: session.artist.display_name || session.artist.displayName || session.profile?.display_name,
        owner: session.artist.display_name || session.artist.displayName || session.profile?.display_name,
        profileId: session.profile?.id || session.user?.profileId,
      }
    : null
  const primaryArtist = sessionArtist || getCurrentArtist({ session, profiles: localProfiles, artists: selectorArtists }) || selectorArtists[0]
  const primaryMembership = getMembershipForArtist({
    artistId: primaryArtist?.id,
    artistStudioMemberships,
  })
  const activeWorkContextStudioId = artistWorkContext?.contextType === 'membership'
    ? artistWorkContext.studioId
    : null
  const currentStudio = activeWorkContextStudioId
    ? adminState.studios.find((studio) => studio.id === activeWorkContextStudioId)
    : getStudioForArtist({
    artistId: primaryArtist?.id,
    studios: adminState.studios,
    artistStudioMemberships,
    preferredStudioId: primaryMembership?.studioId,
  }) || adminState.studios[0]
  const authenticatedArtistProfile = artistState.profile || {}
  const artistPersonalInfo = authenticatedArtistProfile.personalInfo || {}
  const authenticatedArtistName = session.artist?.display_name
    || session.artist?.displayName
    || session.profile?.display_name
    || session.profile?.displayName
    || ''
  const profileName = artistPersonalInfo.artisticName || authenticatedArtistName
  const studioProfile = currentStudio?.profile || {}
  const activeContextIsMembership = artistWorkContext?.contextType === 'membership'
  const artistDisplayName = activeContextIsMembership
    ? artistWorkContext?.studioName || studioProfile.commercialName || currentStudio?.name || 'Estudio'
    : profileName || 'Artista profesional'
  const profilePhoto = activeContextIsMembership
    ? studioProfile.logoUrl || studioProfile.logo_path || currentStudio?.logoUrl || currentStudio?.logo_path || ''
    : authenticatedArtistProfile.photoUrl || ''
  const customProfileLocation = authenticatedArtistProfile.professionalLocation?.customLocation || {}
  const heroLocation = hasProfessionalLocationContent(customProfileLocation)
    ? formatProfessionalLocation(customProfileLocation)
    : ''
  const studioNameLabel = ''
  const canUseEconomy = canUseOperationalFeature(currentStudio, 'economy')
  const canUsePublicAgenda = canUseOperationalFeature(currentStudio, 'publicAgenda')
  const artistOperationalStatus = String(session.artist?.status || primaryArtist?.status || 'Activo').toLowerCase()
  const canManageOwnAppointments = ![
    'pending',
    'pendiente',
    'rejected',
    'rechazado',
    'suspended',
    'suspendido',
    'inactive',
    'inactivo',
  ].includes(artistOperationalStatus)

  // Lógica de agenda dinámica
  const realArtistAppointmentSourceReady = !session.isMockSession && appointmentState.artistLoaded
  const artistAppointmentSource = realArtistAppointmentSourceReady
    ? realArtistAppointments
    : artistState.appointments
  const activeContextAppointments = artistAppointmentSource.filter((appointment) => (
    appointmentMatchesWorkContext(appointment, artistWorkContext)
  ))
  const appointmentsForSelectedDate = activeContextAppointments
    .filter(apt => apt?.date === safeSelectedDate && apt?.type === 'appointment')
    .sort((firstAppointment, secondAppointment) => (
      String(secondAppointment.time || '').localeCompare(String(firstAppointment.time || ''))
      || String(secondAppointment.id || '').localeCompare(String(firstAppointment.id || ''))
    ))
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
  const dayOfWeek = getSafeDayLabel(safeSelectedDate)
  const visibleDays = useMemo(() => buildVisibleDays(safeSelectedDate), [safeSelectedDate])
  const selectAgendaDate = (dateValue) => {
    const nextDate = getSafeDateValue(dateValue)
    setSelectedDate(nextDate)
    setShowDatePicker(false)
  }
  const canAwardFlowPoints = (appointment) => (
    !['Cancelada', 'No show'].includes(appointment.status)
    && !['cancelled', 'no_show'].includes(String(appointment.appointmentStatus || '').toLowerCase())
    && appointment.flowPointsAwarded > 0
    && appointment.pointsGranted <= 0
  )

  const filteredClients = [
    ...remoteClientResults,
    ...artistState.clients,
  ].filter((client, index, clients) => (
    `${client.name} ${client.email || ''} ${client.phone || ''}`.toLowerCase().includes(clientSearch.toLowerCase())
    && clients.findIndex((item) => item.id === client.id) === index
  )).slice(0, 5)
  const hasMatches = filteredClients.length > 0
  const showCreateOption = clientSearch.trim() && !hasMatches && !isClientSearchLoading
  const selectedService = artistServices.find((item) => item.id === appointmentDraft.serviceOfferingId)
    || artistServices.find((item) => item.status === 'Activo')

  const saveAppointment = async () => {
    if (!canManageOwnAppointments) return
    if (!selectedService?.id || !appointmentDraft.date || !appointmentDraft.time) return

    let nextClientId = appointmentDraft.clientId

    let createdClient = null

    if (isCreatingNewClient) {
      nextClientId = `artist-client-${Date.now()}`
      createdClient = {
        ...newClient,
        studioId: currentStudio?.id || null,
        id: nextClientId,
        vipTier: 'Glow',
        flowPoints: 0,
        streak: 1,
        totalVisits: 1,
        pointsExpirationDate: '2026-12-31',
        preferredServices: [selectedService.name],
        favoriteArtist: artistDisplayName,
        lastVisit: appointmentDraft.date,
        nextRecommendedVisit: appointmentDraft.date,
        rewardsHistory: [],
      }
      addArtistClient(createdClient)
    }

    const clientName = isCreatingNewClient
      ? newClient.name
      : artistState.clients.find((client) => client.id === nextClientId)?.name || appointmentDraft.client

    const [firstName, ...lastNameParts] = String(isCreatingNewClient ? newClient.name : appointmentDraft.client || clientName || '')
      .trim()
      .split(/\s+/)
    const savedAppointment = await createManualArtistAppointment({
      clientId: nextClientId || null,
      firstName: firstName || 'Clienta',
      lastName: lastNameParts.join(' ') || 'Studio Flow',
      phone: isCreatingNewClient ? newClient.phone : appointmentDraft.phone,
      serviceOfferingId: selectedService.id,
      date: appointmentDraft.date,
      time: appointmentDraft.time,
      notes: appointmentDraft.notes,
      workContext: artistWorkContext,
    })

    if (!savedAppointment) return

    // Calculate and add Flow Points
    const pointsEarned = calculateFlowPoints(selectedService.serviceTier)
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
    await loadArtistAppointments()
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
                <h2>{artistDisplayName}</h2>
                {studioNameLabel && <small>{studioNameLabel}</small>}
              </div>
              <div className="artist-hero-photo">
                {profilePhoto ? (
                  <img src={profilePhoto} alt={`Foto de ${artistDisplayName}`} />
                ) : (
                  <span>{getInitials(artistDisplayName)}</span>
                )}
              </div>
              <div className="hero-actions artist-hero-actions">
                <Button
                  disabled={!canManageOwnAppointments}
                  onClick={() => {
                    setAppointmentDraft((currentDraft) => ({ ...currentDraft, date: safeSelectedDate }))
                    setShowAppointmentForm(true)
                  }}
                >
                  Agregar cita
                </Button>
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
                <MetricCard label="Ingresos estimados" value={canUseEconomy ? formatCurrency(estimatedRevenue) : 'Preparacion'} trend={canUseEconomy ? (estimatedRevenue === 0 ? 'Sin reservas' : 'Con reservas') : 'Modo validacion'} tone="nude" className="mobile-compact" />
              </>
            )}

            {showAppointmentForm && (
              <div ref={appointmentFormRef}>
                <Card className="mobile-screen primary-panel">
                <PanelHeader title="Nueva cita" eyebrow="Agenda" />
                <div className="form-stack compact-form">
                  <label className="input-field">
                    <span>Cliente</span>
                    {!isCreatingNewClient ? (
                      <>
                        <input
                          type="text"
                          placeholder="Buscar clienta..."
                          value={clientSearch}
                          onChange={(event) => {
                            setClientSearch(event.target.value)
                            setAppointmentDraft((currentDraft) => ({
                              ...currentDraft,
                              clientId: '',
                              client: event.target.value,
                            }))
                          }}
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
                            {!isClientSearchLoading && !clientSearchError && clientSearch.trim().length >= 2 && !hasMatches && (
                              <div className="suggestion-item muted-suggestion">Sin coincidencias registradas.</div>
                            )}
                            {clientSearchError && (
                              <div className="suggestion-item muted-suggestion">{clientSearchError}</div>
                            )}
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
                        {appointmentDraft.clientId && appointmentDraft.client && (
                          <div className="list-row elevated-row" style={{ marginTop: 10 }}>
                            <div>
                              <strong>{appointmentDraft.client}</strong>
                              <small>{appointmentDraft.phone || 'Sin celular registrado'}</small>
                            </div>
                            <StatusPill tone="success">Clienta seleccionada</StatusPill>
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
                    <select
                      value={appointmentDraft.serviceOfferingId}
                      onChange={(event) => setAppointmentDraft({ ...appointmentDraft, serviceOfferingId: event.target.value })}
                    >
                      {artistServices.filter(s => s.status === 'Activo').length === 0 && <option value="">Sin servicios activos</option>}
                      {artistServices.filter(s => s.status === 'Activo').map((service) => (
                        <option key={service.id} value={service.id}>{service.name} · {service.duration}</option>
                      ))}
                    </select>
                  </label>
                  <Input label="Fecha" type="date" value={appointmentDraft.date} onChange={(event) => setAppointmentDraft({ ...appointmentDraft, date: event.target.value })} />
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
                          const isSelected = appointmentDraft.time === slot.time

                          return (
                            <Button
                              key={slot.id}
                              size="sm"
                              variant={isSelected ? 'primary' : 'ghost'}
                              onClick={() => setAppointmentDraft({ ...appointmentDraft, time: slot.time })}
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
                  <label className="input-field">
                    <span>Notas</span>
                    <textarea
                      rows="3"
                      value={appointmentDraft.notes}
                      onChange={(event) => setAppointmentDraft({ ...appointmentDraft, notes: event.target.value })}
                    />
                  </label>
                  {isClientSearchLoading && <small>Buscando clientas registradas...</small>}
                  {manualArtistAppointmentError && (
                    <small style={{ color: 'var(--rose-dark)', fontWeight: 800 }}>{manualArtistAppointmentError}</small>
                  )}
                  {manualArtistAppointmentStatus && (
                    <small style={{ color: 'var(--success)', fontWeight: 800 }}>{manualArtistAppointmentStatus}</small>
                  )}
                  <Button
                    className="full-width"
                    disabled={!canManageOwnAppointments || isManualArtistAppointmentSaving}
                    onClick={saveAppointment}
                  >
                    {isManualArtistAppointmentSaving ? 'Guardando cita...' : 'Confirmar cita'}
                  </Button>
                </div>
                </Card>
              </div>
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
                          value={safeSelectedDate}
                          onChange={(e) => selectAgendaDate(e.target.value)}
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
              <div className="day-strip" ref={dayStripRef}>
                {visibleDays.map((dateValue) => {
                  const d = parseDateValue(dateValue)
                  const dayLabel = d.toLocaleDateString('es-MX', { weekday: 'short' }).substring(0, 3)
                  const dayNum = d.getDate()
                  return (
                    <button 
                      className={safeSelectedDate === dateValue ? 'active' : ''}
                      type="button" 
                      key={dateValue}
                      onClick={() => selectAgendaDate(dateValue)}
                    >
                      <span>{dayLabel}</span>
                      <strong>{dayNum}</strong>
                    </button>
                  )
                })}
              </div>
              {hasAppointments && (
                <div className="row-actions" style={{ justifyContent: 'flex-start', marginBottom: 14 }}>
                  <Button
                    size="sm"
                    variant="success"
                    onClick={() => requestArtistAppointmentConfirmations({ date: safeSelectedDate })}
                  >
                    Enviar confirmacion
                  </Button>
                </div>
              )}
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
                        subtitle={`${item.service} / ${item.duration} / ${item.contextName || item.room}`}
                        status={item.status}
                        type={item.type}
                        showEconomy={canUseEconomy}
                        economyData={economyData}
                        action={(
                          <Button
                            className="flow-points-award-button"
                            disabled={!canAwardFlowPoints(item)}
                            size="sm"
                            variant="success"
                            onClick={() => awardAppointmentFlowPoints({ appointmentId: item.id })}
                          >
                            {item.pointsGranted > 0 ? `+${item.pointsGranted} otorgados` : `Otorgar ${item.flowPointsAwarded || 0} pts`}
                          </Button>
                        )}
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
                  }}>No hay citas registradas para esta fecha.</p>

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
                {activeContextAppointments.length > 0 ? activeContextAppointments.map((item) => (
                  <div className="list-row elevated-row" key={`${item.id}-${item.client}-${item.time}`}>
                    <div>
                      <strong>{item.client}</strong>
                      <small>{item.service} / {item.contextName || item.room}</small>
                    </div>
                    <div className="row-actions billing-row-actions">
                      <span>{item.time}</span>
                      <Button
                        className="flow-points-award-button"
                        disabled={!canAwardFlowPoints(item)}
                        size="sm"
                        variant="success"
                        onClick={() => awardAppointmentFlowPoints({ appointmentId: item.id })}
                      >
                        {item.pointsGranted > 0 ? `+${item.pointsGranted} otorgados` : `Otorgar ${item.flowPointsAwarded || 0} pts`}
                      </Button>
                    </div>
                  </div>
                )) : (
                  <div className="list-row elevated-row">
                    <div>
                      <strong>No hay citas registradas.</strong>
                      <small>Las citas reales apareceran aqui.</small>
                    </div>
                  </div>
                )}
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
              <StatsCard title="Historial" value={formatCurrency(estimatedRevenue)} caption="Ingresos estimados de las citas cargadas">
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
              {artistState.clients.length > 0 ? artistState.clients.map((client) => (
                <div className="list-row elevated-row" key={client.name}>
                  <div>
                    <strong>{client.name}</strong>
                    <small>{client.phone || 'Sin telefono registrado'}</small>
                  </div>
                  <span>{client.history?.length || 0}</span>
                </div>
              )) : (
                <div className="list-row elevated-row">
                  <div>
                    <strong>No hay clientas registradas.</strong>
                    <small>Las clientas reales apareceran aqui.</small>
                  </div>
                </div>
              )}
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
