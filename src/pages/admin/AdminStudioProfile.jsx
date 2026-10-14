import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useCurrentTime from '../../hooks/useCurrentTime'
import usePublicBookingShare from '../../hooks/usePublicBookingShare'
import { shareBusinessLocation } from '../../utils/shareBusinessLocation'
import PendingPointsNotice from '../../components/PendingPointsNotice'
import { pendingAppointmentPoints } from '../../utils/pendingAppointmentPoints'
import Button from '../../components/Button'
import AppointmentPayment from '../../components/AppointmentPayment'
import AppointmentDeposit from '../../components/AppointmentDeposit'
import BusinessPaymentSettings from '../../components/BusinessPaymentSettings'
import CompleteAppointmentButton from '../../components/CompleteAppointmentButton'
import Card from '../../components/Card'
import { MarketingReminderSettings } from '../../components/MarketingReminders'
import FlowPointRedemptionHistory from '../../components/FlowPointRedemptionHistory'
import StudioOperatingHours from '../../components/StudioOperatingHours'
import Input from '../../components/Input'
import StatusPill from '../../components/StatusPill'
import RescheduleAppointmentButton from '../../components/RescheduleAppointmentButton'
import ArtistAppointmentCalendar from '../../components/ArtistAppointmentCalendar'
import { supabase } from '../../lib/supabaseClient'
import { useApp } from '../../contexts/appContextCore'
import { getCurrentBrowserCoordinates } from '../../utils/browserGeolocation'
import { buildGoogleMapsUrl, createProfessionalLocation, hasCoordinates } from '../../utils/locationHelpers'
import { getAppointmentStatusTone } from '../../utils/appointmentStatus'
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { optimizeImageFile } from '../../utils/imageOptimization'
import { getCurrentProfile, getCurrentStudio } from '../../modules/entities/entitySelectors'
import { paths } from '../../routes/paths'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { fetchOwnStudios, hideStudioMarketplace, publishStudioMarketplace } from '../../services/studioService'
import {
  createStudioOwnerAppointment,
  fetchStudioOwnerBookingCalendar,
  findStudioOwnerExistingClient,
  fetchStudioOwnerAppointments,
  requestStudioOwnerAppointmentConfirmations,
  searchStudioOwnerClients,
} from '../../services/studioOwnerAppointmentService'
import { cancelArtistAppointment } from '../../services/appointmentService'
import {
  cancelStudioArtistInvitation,
  fetchStudioMembershipOperations,
  fetchStudioMemberships,
  findStudioArtistByEmail,
  inviteStudioArtist,
  unlinkStudioArtist,
  updateStudioMembershipService,
} from '../../services/studioMembershipService'
import {
  fetchStudioMarketingSettings,
  saveStudioHappyHourPromotion,
  setStudioDoublePointsPromotion,
  setStudioFlowPointsEnabled,
  setStudioFlowPointsRewardPercentage,
  setStudioFlowPointsMaxDiscountPercentage,
} from '../../services/artistMarketingService'
import { calculateServiceFlowPoints } from '../../utils/flowPoints'
import '../../styles/studio-owner-booking.css'

const galleryLimit = 5
const studioSections = ['summary', 'team', 'services', 'schedule', 'marketplace', 'metrics', 'settings']
const emptyOwnerAppointmentDraft = {
  clientSearch: '',
  clientId: '',
  clientName: '',
  clientPhone: '',
  clientEmail: '',
  membershipId: '',
  date: '',
  serviceOfferingId: '',
  availabilitySlotId: '',
  notes: '',
}

const emptyStudioMarketingSettings = {
  rewards: [],
  flowPointsEnabled: false,
  flowPointsRewardPercentage: 5,
  flowPointsMaxDiscountPercentage: 5,
  flowPointRedemptionScope: 'exclusive',
  doublePoints: { status: 'paused', rules: {} },
  happyHour: { status: 'paused', rules: {} },
}

function StudioServicePoints({ service, settings }) {
  if (!settings.flowPointsEnabled) return null
  const multiplier = settings.doublePoints?.status === 'active' ? 2 : 1
  const points = calculateServiceFlowPoints(service.price, settings.flowPointsRewardPercentage, multiplier)
  return <small className="flow-points-slot-note">Otorga {points} FP al completar{multiplier === 2 ? ' / puntos dobles activos' : ''}</small>
}

const weekdayOptions = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mie' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sab' },
  { value: 0, label: 'Dom' },
]

function parseDateValue(dateValue) {
  const [year, month, day] = String(dateValue || '').split('-').map(Number)
  if (!year || !month || !day) return new Date()

  return new Date(year, month - 1, day)
}

function formatDateValue(date) {
  const normalizedDate = new Date(date)
  normalizedDate.setMinutes(normalizedDate.getMinutes() - normalizedDate.getTimezoneOffset())
  return normalizedDate.toISOString().slice(0, 10)
}

function getTodayDateValue() {
  return formatDateValue(new Date())
}

function buildVisibleDays(startDateValue) {
  const startDate = parseDateValue(startDateValue)

  return Array.from({ length: 31 }, (_, index) => {
    const date = new Date(startDate)
    date.setDate(startDate.getDate() + index - 15)
    return formatDateValue(date)
  })
}

function getAppointmentDate(appointment = {}) {
  return appointment.date || String(appointment.startsAt || appointment.starts_at || '').slice(0, 10)
}

function getAppointmentTime(appointment = {}) {
  return appointment.time || String(appointment.startsAt || appointment.starts_at || '').slice(11, 16) || 'Horario por confirmar'
}

function getAppointmentTimestamp(appointment = {}) {
  const date = getAppointmentDate(appointment)
  const time = getAppointmentTime(appointment)
  return new Date(`${date}T${time && time.includes(':') ? time : '00:00'}`).getTime()
}

function getInitials(value = '') {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function appointmentMatchesClientQuery(appointment = {}, query = '') {
  const normalizedQuery = String(query || '').trim().toLowerCase()
  if (!normalizedQuery) return true

  const searchableText = [
    appointment.client,
    appointment.clientName,
    appointment.clientPhone,
    appointment.phone,
    appointment.clientEmail,
    appointment.email,
  ].filter(Boolean).join(' ').toLowerCase()

  return searchableText.includes(normalizedQuery)
}

function filterAppointmentsByAttendedClientQuery(appointments = [], query = '') {
  const normalizedQuery = String(query || '').trim()
  if (!normalizedQuery) return appointments
  return appointments.filter((appointment) => appointmentMatchesClientQuery(appointment, normalizedQuery))
}

function isConfirmedAppointment(appointment = {}) {
  const status = String(appointment.appointmentStatus || appointment.appointment_status || appointment.status || '').toLowerCase()
  const blockedStatuses = ['pending', 'pendiente', 'cancelled', 'canceled', 'cancelada', 'cancelado', 'por aprobar']
  return !blockedStatuses.some((blockedStatus) => status.includes(blockedStatus))
}

function countAppointmentsBetween(appointments, startDate, endDate) {
  const start = parseDateValue(startDate)
  const end = parseDateValue(endDate)
  end.setHours(23, 59, 59, 999)

  return appointments.filter((appointment) => {
    const date = parseDateValue(getAppointmentDate(appointment))
    return date >= start && date <= end
  }).length
}

function getWeekEndDate(startDateValue) {
  const endDate = parseDateValue(startDateValue)
  endDate.setDate(endDate.getDate() + 6)
  return formatDateValue(endDate)
}

function getMonthEndDate(startDateValue) {
  const startDate = parseDateValue(startDateValue)
  return formatDateValue(new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0))
}

function getMonthStartDate(startDateValue) {
  const startDate = parseDateValue(startDateValue)
  return formatDateValue(new Date(startDate.getFullYear(), startDate.getMonth(), 1))
}

function isCompletedAppointment(appointment = {}) {
  return String(appointment.appointmentStatus || appointment.status || '').toLowerCase().includes('complet')
}

function OwnerDayStrip({ selectedDate, setSelectedDate, visibleDays }) {
  const stripRef = useRef(null)

  useEffect(() => {
    try {
      const activeDay = stripRef.current?.querySelector('.active')
      activeDay?.scrollIntoView({ block: 'nearest', inline: 'center' })
    } catch {
      // Mantiene la tira util aunque algun navegador ignore el centrado suave.
    }
  }, [selectedDate])

  return (
    <div className="day-strip scrollable-day-strip professional-day-strip" ref={stripRef}>
      {visibleDays.map((dateValue) => {
        const date = parseDateValue(dateValue)
        const dayLabel = date.toLocaleDateString('es-MX', { weekday: 'short' }).substring(0, 3)
        const dayNum = date.getDate()

        return (
          <button
            className={selectedDate === dateValue ? 'active' : ''}
            key={dateValue}
            type="button"
            onClick={() => setSelectedDate(dateValue)}
          >
            <span>{dayLabel}</span>
            <strong>{dayNum}</strong>
          </button>
        )
      })}
    </div>
  )
}

function StudioSummarySection({
  activeMemberships,
  currentStudio,
  membershipOperationsById,
  navigate,
  onCancelAppointment,
  onRequestConfirmations,
  ownerAppointments,
  ownStudio,
  profileDraft,
  cancellingAppointmentId,
}) {
  const [showMetrics, setShowMetrics] = useState(false)
  const [showCalendarFilter, setShowCalendarFilter] = useState(false)
  const [selectedAgendaDate, setSelectedAgendaDate] = useState(getTodayDateValue)
  const [appointmentClientQuery, setAppointmentClientQuery] = useState('')
  const [locationShareFeedback, setLocationShareFeedback] = useState('')
  const [nowTimestamp] = useState(() => Date.now())
  const studioName = profileDraft.commercialName || currentStudio?.profile?.commercialName || currentStudio?.name || 'Estudio'
  const publicBookingShare = usePublicBookingShare({ studioId: currentStudio?.id, businessName: studioName })
  const shareLocation = () => {
    const shared = shareBusinessLocation({
      businessName: studioName,
      location: currentStudio?.professionalLocation,
      fallbackAddress: currentStudio?.profile?.addressLine || currentStudio?.addressLine,
      studio: true,
    })
    if (!shared) setLocationShareFeedback('Agrega la ubicación de tu estudio en Mi perfil de estudio para poder compartirla.')
    else setLocationShareFeedback('')
  }
  const studioLogoUrl = profileDraft.logoUrl
    || profileDraft.logoPath
    || currentStudio?.profile?.logoUrl
    || currentStudio?.profile?.logoPath
    || currentStudio?.logoUrl
    || currentStudio?.logoPath
    || ownStudio?.profile?.logoUrl
    || ownStudio?.profile?.logoPath
    || ownStudio?.logoUrl
    || ownStudio?.logoPath
    || ''
  const visibleDays = useMemo(() => buildVisibleDays(selectedAgendaDate), [selectedAgendaDate])
  const today = getTodayDateValue()
  const weekEndDate = getWeekEndDate(today)
  const monthStartDate = getMonthStartDate(today)
  const monthEndDate = getMonthEndDate(today)
  const operations = Object.values(membershipOperationsById)
  const activeServices = operations
    .flatMap((operation) => operation?.services || [])
    .filter((service) => ['active', 'activo'].includes(String(service.status || '').toLowerCase()))
  const upcomingSlots = operations.flatMap((operation) => operation?.upcomingSlots || [])
  const filteredOwnerAppointments = filterAppointmentsByAttendedClientQuery(ownerAppointments, appointmentClientQuery)
  const selectedDateAppointments = filteredOwnerAppointments
    .filter((appointment) => getAppointmentDate(appointment) === selectedAgendaDate)
    .sort((firstAppointment, secondAppointment) => getAppointmentTimestamp(firstAppointment) - getAppointmentTimestamp(secondAppointment))
  const todayAppointments = ownerAppointments.filter((appointment) => getAppointmentDate(appointment) === today)
  const upcomingAppointments = ownerAppointments
    .filter((appointment) => getAppointmentTimestamp(appointment) >= nowTimestamp)
    .sort((firstAppointment, secondAppointment) => getAppointmentTimestamp(firstAppointment) - getAppointmentTimestamp(secondAppointment))
  const todayAvailableSlots = upcomingSlots.filter((slot) => getAppointmentDate(slot) === today && slot.status === 'available')
  const occupationBase = todayAppointments.length + todayAvailableSlots.length
  const occupancy = occupationBase > 0 ? Math.round((todayAppointments.length / occupationBase) * 100) : 0
  const completedMonthAppointments = ownerAppointments.filter((appointment) => (
    isCompletedAppointment(appointment)
    && getAppointmentDate(appointment) >= monthStartDate
    && getAppointmentDate(appointment) <= monthEndDate
  ))
  const completedServices = completedMonthAppointments.length
  const membershipsByArtistId = new Map(activeMemberships.map((membership) => [membership.artistId, membership]))
  const membershipsById = new Map(activeMemberships.map((membership) => [getMembershipRecordId(membership), membership]))
  const appointmentsByArtist = activeMemberships.reduce((accumulator, membership) => {
    accumulator[membership.realName || membership.name || 'Artista'] = 0
    return accumulator
  }, {})
  completedMonthAppointments.forEach((appointment) => {
    const membership = membershipsById.get(appointment.membershipId) || membershipsByArtistId.get(appointment.artistId)
    const artistName = membership?.realName || membership?.name || appointment.artist || appointment.artistName || 'Artista'
    appointmentsByArtist[artistName] = (appointmentsByArtist[artistName] || 0) + 1
  })
  const artistRanking = Object.entries(appointmentsByArtist).sort((first, second) => second[1] - first[1])
  return (
    <>
      <section className="hero-panel studio-hero artist-profile-hero mobile-screen studio-owner-hero-card professional-home-hero studio-home-hero">
        <div className="artist-hero-copy studio-owner-summary-copy">
          <span className="professional-home-kicker">EL PULSO DE TU ESTUDIO</span>
          <h2>{studioName}</h2>
          <div>
            <span className="studio-owner-badge inline">STUDIO OWNER</span>
          </div>
        </div>
        <div className="artist-hero-photo studio-owner-summary-logo">
          {studioLogoUrl ? (
            <img src={studioLogoUrl} alt={`Foto de perfil de ${studioName}`} />
          ) : (
            <span>{studioName.slice(0, 2)}</span>
          )}
        </div>
        <div className="studio-owner-hero-details">
          <p className="professional-home-message">Tu equipo, tus clientas y el crecimiento de tu estudio, reunidos en un solo lugar.</p>
          <span className="professional-home-location">{currentStudio?.professionalLocation?.address || currentStudio?.profile?.addressLine || currentStudio?.addressLine || 'Ubicación del estudio por confirmar'}</span>
        </div>
        <div className="hero-actions artist-hero-actions studio-owner-hero-actions">
          <Button onClick={() => navigate(`${paths.adminStudio}?section=schedule`)}>Agregar cita</Button>
          <Button disabled={publicBookingShare.loading || !publicBookingShare.available} onClick={publicBookingShare.share}>Compartir enlace para agendar</Button>
          <Button className="full-width" variant="ghost" onClick={() => navigate(`${paths.studioAccounting}?tarjeta=1`, { state: { returnTo: `${paths.adminStudio}?section=summary` } })}>Volante digital</Button>
          <Button className="full-width" variant="ghost" onClick={shareLocation}>Compartir ubicación</Button>
        </div>
        {publicBookingShare.feedback && <small className="studio-owner-share-feedback">{publicBookingShare.feedback}</small>}
        {locationShareFeedback && <small className="studio-owner-share-feedback">{locationShareFeedback}</small>}
      </section>

      {showMetrics && (
        <section className="profile-foundation-card studio-owner-metrics-panel professional-metrics-experience">
          <div>
            <span className="eyebrow">Metricas operativas</span>
            <h3>Rendimiento del estudio</h3>
          </div>
          <div className="studio-owner-metric-grid">
            <div className="studio-owner-metric"><strong>{todayAppointments.length}</strong><span>Citas hoy</span></div>
            <div className="studio-owner-metric"><strong>{countAppointmentsBetween(ownerAppointments, today, weekEndDate)}</strong><span>Citas semana</span></div>
            <div className="studio-owner-metric"><strong>{countAppointmentsBetween(ownerAppointments, monthStartDate, monthEndDate)}</strong><span>Citas del mes</span></div>
            <div className="studio-owner-metric"><strong>{occupancy}%</strong><span>Ocupacion hoy</span></div>
            <div className="studio-owner-metric"><strong>{completedServices}</strong><span>Servicios realizados este mes</span></div>
            <div className="studio-owner-metric"><strong>{activeMemberships.length}</strong><span>Artistas activas</span></div>
          </div>
          <Button variant="ghost" onClick={() => setShowMetrics(false)}>Ocultar metricas</Button>
        </section>
      )}

      <section className="profile-foundation-card professional-agenda-experience">
        <div>
          <span className="eyebrow">Agenda visual</span>
          <h3>{selectedAgendaDate === today ? 'Hoy' : selectedAgendaDate}</h3>
          <small>Desliza lateralmente para revisar dias cercanos.</small>
        </div>
        <div className="studio-review-actions">
          <Button size="sm" variant="ghost" onClick={() => setShowMetrics((currentValue) => !currentValue)}>
            {showMetrics ? 'Ocultar métricas' : 'Mostrar métricas'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowCalendarFilter((currentValue) => !currentValue)}>
            Filtrar
          </Button>
        </div>
        {showCalendarFilter && (
          <div className="form-stack compact-form" style={{ marginBottom: '14px', marginTop: 0 }}>
            <Input
              label="Seleccionar fecha"
              type="date"
              value={selectedAgendaDate}
              onChange={(event) => setSelectedAgendaDate(event.target.value || today)}
            />
            <Input
              label="Filtrar por nombre o celular"
              placeholder="Nombre o celular de clienta"
              type="search"
              value={appointmentClientQuery}
              onChange={(event) => setAppointmentClientQuery(event.target.value)}
            />
          </div>
        )}
        <OwnerDayStrip
          selectedDate={selectedAgendaDate}
          setSelectedDate={setSelectedAgendaDate}
          visibleDays={visibleDays}
        />
        <div className="compact-list">
          {selectedDateAppointments.slice(0, 6).map((appointment) => (
            <div className="list-row elevated-row professional-day-appointment owner-day-appointment" key={appointment.id || `${getAppointmentDate(appointment)}-${getAppointmentTime(appointment)}-${appointment.client}`}>
              <div>
                <strong>{getAppointmentTime(appointment)} / {appointment.client || 'Clienta'}</strong>
                <small>{appointment.service || 'Servicio'} / {appointment.contextName || studioName}</small>
                <AppointmentPayment appointment={appointment} />
                <AppointmentDeposit appointment={appointment} audience="business" onUpdated={() => window.dispatchEvent(new Event('studioflow:deposit-updated'))} />
                {!appointment.pendingClientConfirmation && <CompleteAppointmentButton appointment={appointment} />}
              </div>
              <div className="agenda-card-actions">
                {appointment.pendingClientConfirmation
                  ? <StatusPill tone="warm">Esperando confirmación de la clienta</StatusPill>
                  : <StatusPill tone={getAppointmentStatusTone(appointment)}>{appointment.status || 'Confirmada'}</StatusPill>}
                {['google', 'instagram', 'facebook'].includes(appointment.bookingSource) && <StatusPill tone="warm">Enlace {appointment.bookingSource}</StatusPill>}
                {appointment.appointmentStatus === 'scheduled' && (
                  <>
                    <Button
                      disabled={cancellingAppointmentId === appointment.id}
                      size="sm"
                      variant="danger"
                      onClick={() => onCancelAppointment(appointment)}
                    >
                      {cancellingAppointmentId === appointment.id ? 'Cancelando...' : 'Cancelar cita'}
                    </Button>
                    <RescheduleAppointmentButton appointment={appointment} />
                  </>
                )}
                {appointment.pointsGranted > 0 && <StatusPill tone="success">+{appointment.pointsGranted} FP otorgados</StatusPill>}
                {appointment.happyHourApplied && <StatusPill tone="success">Happy Hour</StatusPill>}
                {appointment.rewardMultiplier > 1 && <StatusPill tone="warm">Puntos dobles</StatusPill>}
              </div>
            </div>
          ))}
          {selectedDateAppointments.length === 0 && (
            <div className="list-row elevated-row">
              <div>
                <strong>Sin citas confirmadas</strong>
                <small>No hay citas operativas para este dia.</small>
              </div>
              <StatusPill tone="neutral">Libre</StatusPill>
            </div>
          )}
        </div>
      </section>

      <section className="profile-foundation-card professional-summary-experience">
        <div>
          <span className="eyebrow">Resumen operativo</span>
          <h3>Estado del estudio</h3>
          <small>{currentStudio?.studioStatus === 'approved' ? 'Estudio aprobado' : currentStudio?.studioStatus || 'Estado por confirmar'}</small>
        </div>
        {selectedDateAppointments.length > 0 && (
          <div className="studio-review-actions">
            {selectedDateAppointments.some((appointment) => !appointment.confirmationRequestedAt) ? (
              <Button size="sm" variant="success" onClick={() => onRequestConfirmations(selectedAgendaDate)}>
                Enviar confirmacion
              </Button>
            ) : (
              <StatusPill tone="success">Confirmacion enviada</StatusPill>
            )}
          </div>
        )}
        <div className="studio-owner-metric-grid studio-owner-summary-grid">
          <div className="studio-owner-metric"><strong>{activeMemberships.length}</strong><span>Artistas activas</span></div>
          <div className="studio-owner-metric"><strong>{activeServices.length}</strong><span>Servicios activos</span></div>
          <div className="studio-owner-metric"><strong>{todayAppointments.length}</strong><span>Citas hoy</span></div>
          <div className="studio-owner-metric"><strong>{upcomingAppointments.length}</strong><span>Proximas citas</span></div>
        </div>
      </section>

      <section className="profile-foundation-card studio-owner-team-ranking">
        <div>
          <span className="eyebrow">Resumen equipo</span>
          <h3>Servicios completados este mes</h3>
          <small>El conteo inicia nuevamente el dia 1 de cada mes.</small>
        </div>
        <div className="studio-owner-ranking-table">
          {artistRanking.map(([artistName, appointmentCount], index) => (
            <div className={index === 0 ? 'studio-owner-ranking-row leader' : 'studio-owner-ranking-row'} key={artistName}>
              <span>{index === 0 && <b aria-label="Artista mas activa">★</b>}{artistName}</span>
              <strong>{appointmentCount}</strong>
            </div>
          ))}
          {artistRanking.length === 0 && (
            <div className="list-row elevated-row">
              <div>
                <strong>Sin servicios completados este mes</strong>
                <small>El ranking se actualizara con cada cita completada.</small>
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  )
}

function StudioTeamSection({ children }) {
  return <>{children}</>
}

function StudioServicesSection({
  activeMemberships,
  expandedMembershipId,
  membershipOperationsById,
  membershipOperationsLoadingId,
  toggleMembershipOperations,
}) {
  return (
    <section className="profile-foundation-card">
      <div>
        <span className="eyebrow">Servicios</span>
        <h3>Servicios por artista</h3>
        <small>Servicios existentes con owner_type membership para este estudio.</small>
      </div>
      <div className="compact-list">
        {activeMemberships.map((membership) => {
          const membershipRecordId = getMembershipRecordId(membership)
          const operations = membershipOperationsById[membershipRecordId]
          const isExpanded = expandedMembershipId === membershipRecordId
          const isLoadingOperations = membershipOperationsLoadingId === membershipRecordId

          return (
            <div className="elevated-row" key={membership.id}>
              <div className="list-row" style={{ padding: 0 }}>
                <div>
                  <strong>{membership.name}</strong>
                  <small>{membership.email || 'Correo no disponible'}</small>
                </div>
                <div className="studio-review-actions">
                  <StatusPill tone="neutral">{operations?.services?.length || 0} servicios</StatusPill>
                  <Button
                    disabled={isLoadingOperations}
                    size="sm"
                    variant="ghost"
                    onClick={() => toggleMembershipOperations(membershipRecordId)}
                  >
                    {isLoadingOperations ? 'Cargando...' : isExpanded ? 'Ocultar' : 'Ver servicios'}
                  </Button>
                </div>
              </div>
              {isExpanded && (
                <div className="compact-list" style={{ marginTop: 14 }}>
                  {operations?.services?.map((service) => (
                    <div className="list-row elevated-row" key={service.id}>
                      <div>
                        <strong>{service.name}</strong>
                        <small>{service.category} / {service.duration || `${service.durationMinutes} min`}</small>
                        <small>{service.status}</small>
                      </div>
                      <StatusPill tone={service.status === 'active' ? 'success' : 'neutral'}>
                        ${service.price}
                      </StatusPill>
                    </div>
                  ))}
                  {operations && operations.services.length === 0 && (
                    <div className="list-row elevated-row">
                      <div>
                        <strong>Sin servicios configurados</strong>
                        <small>La artista aun no tiene servicios para este contexto de estudio.</small>
                      </div>
                      <StatusPill tone="neutral">Lectura</StatusPill>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {activeMemberships.length === 0 && (
          <div className="list-row elevated-row">
            <div>
              <strong>Sin artistas vinculadas</strong>
              <small>Los servicios apareceran cuando exista una membership activa.</small>
            </div>
            <StatusPill tone="neutral">Vacio</StatusPill>
          </div>
        )}
      </div>
    </section>
  )
}

function StudioScheduleSection({
  activeMemberships,
  expandedMembershipId,
  membershipOperationsById,
  membershipOperationsLoadingId,
  onOpenAppointmentModal,
  onRequestConfirmations,
  ownerAppointments,
  renderOwnerAppointmentForm,
  toggleMembershipOperations,
}) {
  const [showCalendarFilter, setShowCalendarFilter] = useState(false)
  const [selectedAgendaDate, setSelectedAgendaDate] = useState(getTodayDateValue)
  const [appointmentClientQuery, setAppointmentClientQuery] = useState('')
  const [membershipViewById, setMembershipViewById] = useState({})
  const filteredOwnerAppointments = filterAppointmentsByAttendedClientQuery(ownerAppointments, appointmentClientQuery)
  const selectedDateAppointments = filteredOwnerAppointments
    .filter((appointment) => getAppointmentDate(appointment) === selectedAgendaDate)
    .sort((firstAppointment, secondAppointment) => getAppointmentTimestamp(firstAppointment) - getAppointmentTimestamp(secondAppointment))
  const artistByMembershipId = new Map(activeMemberships.map((membership) => [getMembershipRecordId(membership), membership]))
  const artistById = new Map(activeMemberships.map((membership) => [membership.artistId, membership]))
  const calendarAppointments = filteredOwnerAppointments.map((appointment) => {
    const artist = artistByMembershipId.get(appointment.membershipId || appointment.membership_id)
      || artistById.get(appointment.artistId || appointment.artist_id)
    return {
      ...appointment,
      date: getAppointmentDate(appointment),
      time: getAppointmentTime(appointment),
      artistName: artist?.name || appointment.artistName || appointment.artist || '',
    }
  })

  const toggleMembershipView = async (membershipId, view) => {
    const currentView = membershipViewById[membershipId]
    if (expandedMembershipId === membershipId && currentView === view) {
      await toggleMembershipOperations(membershipId)
      return
    }
    setMembershipViewById((currentValue) => ({ ...currentValue, [membershipId]: view }))
    if (expandedMembershipId !== membershipId) await toggleMembershipOperations(membershipId)
  }

  return (
    <>
      {renderOwnerAppointmentForm?.()}
      <section className="owner-calendar-overview artist-appointments-experience" aria-label="Agenda del estudio">
        <div className="owner-calendar-heading">
          <div><span className="eyebrow">AGENDA DEL ESTUDIO</span><h3>Citas de tu equipo</h3></div>
          <div className="owner-calendar-heading-actions">
            <Button className="appointment-primary-action" size="sm" onClick={() => onOpenAppointmentModal({})}>Generar cita</Button>
            <Button size="sm" variant="ghost" aria-expanded={showCalendarFilter} onClick={() => setShowCalendarFilter((currentValue) => !currentValue)}>Filtrar</Button>
          </div>
        </div>
        {showCalendarFilter && (
          <div className="form-stack compact-form" style={{ marginBottom: '14px', marginTop: 0 }}>
            <Input
              label="Seleccionar fecha"
              type="date"
              value={selectedAgendaDate}
              onChange={(event) => setSelectedAgendaDate(event.target.value || getTodayDateValue())}
            />
            <Input
              label="Filtrar por nombre o celular"
              placeholder="Nombre o celular de clienta"
              type="search"
              value={appointmentClientQuery}
              onChange={(event) => setAppointmentClientQuery(event.target.value)}
            />
          </div>
        )}
        {selectedDateAppointments.length > 0 && (
          <div className="studio-review-actions">
            {selectedDateAppointments.some((appointment) => !appointment.confirmationRequestedAt) ? (
              <Button size="sm" variant="success" onClick={() => onRequestConfirmations(selectedAgendaDate)}>
                Enviar confirmacion
              </Button>
            ) : (
              <StatusPill tone="success">Confirmacion enviada</StatusPill>
            )}
          </div>
        )}
        <ArtistAppointmentCalendar
          appointments={calendarAppointments}
          appointmentsOnly
          selectedDate={selectedAgendaDate}
          onSelectDate={setSelectedAgendaDate}
        />
        {selectedDateAppointments.some((appointment) => appointment.depositPlan || appointment.appointmentStatus === 'scheduled') && <div className="owner-day-deposits"><strong>Cobros de este día</strong>{selectedDateAppointments.filter((appointment) => appointment.depositPlan || appointment.appointmentStatus === 'scheduled').map((appointment) => <div key={appointment.id}><span>{appointment.time} · {appointment.client} · {appointment.service}</span><AppointmentDeposit appointment={appointment} audience="business" onUpdated={() => window.dispatchEvent(new Event('studioflow:deposit-updated'))} /></div>)}</div>}
      </section>

      <section className="profile-foundation-card">
        <div>
          <span className="eyebrow">Agenda</span>
          <h3>Disponibilidad del equipo</h3>
          <small>Horarios configurados y proximos espacios disponibles por artista.</small>
        </div>
        <div className="compact-list">
          {activeMemberships.map((membership) => {
            const membershipRecordId = getMembershipRecordId(membership)
            const operations = membershipOperationsById[membershipRecordId]
            const isExpanded = expandedMembershipId === membershipRecordId
            const isLoadingOperations = membershipOperationsLoadingId === membershipRecordId
            const selectedView = membershipViewById[membershipRecordId] || 'schedule'

            return (
              <div className="elevated-row owner-team-agenda-card owner-availability-artist-card" key={membershipRecordId || membership.id}>
                <div className="list-row owner-availability-artist-row" style={{ padding: 0 }}>
                  <span className="owner-artist-avatar">
                    {membership.studioPhotoUrl || membership.photoUrl
                      ? <img src={membership.studioPhotoUrl || membership.photoUrl} alt={`Foto de ${membership.name}`} />
                      : getInitials(membership.name)}
                  </span>
                  <div>
                    <strong>{membership.name}</strong>
                    <small>{operations?.schedule ? 'Horarios de trabajo configurados para esta artista' : 'Agenda pendiente de configurar'}</small>
                  </div>
                  <div className="studio-review-actions">
                    <Button
                      disabled={isLoadingOperations}
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleMembershipView(membershipRecordId, 'schedule')}
                    >
                      {isLoadingOperations ? 'Cargando...' : isExpanded && selectedView === 'schedule' ? 'Ocultar' : 'Mis horarios'}
                    </Button>
                  </div>
                </div>
                {isExpanded && selectedView === 'schedule' && (
                  <div className="compact-list" style={{ marginTop: 14 }}>
                    {operations?.schedule?.rules?.map((rule) => (
                      <div className="list-row elevated-row" key={rule.id || rule.weekday}>
                        <div>
                          <strong>{rule.day}</strong>
                          <small>{rule.active ? `${String(rule.startTime).slice(0, 5)} a ${String(rule.endTime).slice(0, 5)}` : 'Dia no disponible'}</small>
                          {rule.active && rule.breakStartTime && rule.breakEndTime && (
                            <small>Descanso: {String(rule.breakStartTime).slice(0, 5)} a {String(rule.breakEndTime).slice(0, 5)}</small>
                          )}
                        </div>
                        <StatusPill tone={rule.active ? 'success' : 'danger'}>
                          {rule.active ? 'Activo' : 'No disponible'}
                        </StatusPill>
                      </div>
                    ))}
                    {operations && !operations.schedule && (
                      <div className="list-row elevated-row">
                        <div>
                          <strong>Sin horarios configurados</strong>
                          <small>La artista debe configurar sus reglas de disponibilidad para este estudio.</small>
                        </div>
                        <StatusPill tone="neutral">Pendiente</StatusPill>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          {activeMemberships.length === 0 && (
            <div className="list-row elevated-row">
              <div>
                <strong>Sin artistas vinculadas</strong>
                <small>La disponibilidad aparecera cuando exista una membership activa.</small>
              </div>
              <StatusPill tone="neutral">Vacio</StatusPill>
            </div>
          )}
        </div>
      </section>
    </>
  )
}

function StudioMarketplaceSection({ children }) {
  return <div className="studio-marketplace-stack">{children}</div>
}

function StudioMetricsSection({ activeMemberships, membershipOperationsById, membershipState }) {
  const loadedOperations = Object.values(membershipOperationsById)
  const loadedServices = loadedOperations.reduce((total, operations) => total + (operations?.services?.length || 0), 0)
  const loadedSlots = loadedOperations.reduce((total, operations) => total + (operations?.upcomingSlots?.length || 0), 0)

  return (
    <section className="profile-foundation-card">
      <div>
        <span className="eyebrow">Metricas</span>
        <h3>Lectura operativa</h3>
        <small>Resumen con informacion ya cargada en esta pantalla.</small>
      </div>
      <div className="compact-list">
        <div className="list-row elevated-row">
          <div>
            <strong>Artistas activas</strong>
            <small>Memberships activas del estudio.</small>
          </div>
          <StatusPill tone="neutral">{activeMemberships.length}</StatusPill>
        </div>
        <div className="list-row elevated-row">
          <div>
            <strong>Invitaciones pendientes</strong>
            <small>Invitaciones sin aceptar o cancelar.</small>
          </div>
          <StatusPill tone="neutral">{membershipState.invitations.length}</StatusPill>
        </div>
        <div className="list-row elevated-row">
          <div>
            <strong>Servicios cargados</strong>
            <small>Servicios visibles desde recursos consultados.</small>
          </div>
          <StatusPill tone="neutral">{loadedServices}</StatusPill>
        </div>
        <div className="list-row elevated-row">
          <div>
            <strong>Slots cargados</strong>
            <small>Slots disponibles desde recursos consultados.</small>
          </div>
          <StatusPill tone="neutral">{loadedSlots}</StatusPill>
        </div>
      </div>
    </section>
  )
}

function StudioSettingsSection({ children, studioName, studioLogo }) {
  return <div className="studio-profile-experience">
    <header className="studio-profile-welcome">
      <div><span>EL CORAZÓN DE TU ESTUDIO</span><h1>{studioName || 'Mi estudio'}</h1><p>Aquí empieza la experiencia que quieres regalarle a cada clienta.</p></div>
      <div className="studio-profile-welcome-logo">{studioLogo ? <img src={studioLogo} alt={`Logo de ${studioName}`} /> : (studioName || 'SF').slice(0, 2).toUpperCase()}</div>
    </header>
    <div className="studio-profile-stack">{children}</div>
  </div>
}

function OwnerAppointmentModal({
  clients,
  clientSearchStatus,
  currentStudio,
  draft,
  feedback,
  inline = false,
  isClientSearchLoading,
  isSaving,
  membershipOperationsById,
  memberships,
  onClose,
  onDraftChange,
  onSearchClients,
  onSave,
  availabilityRefresh,
}) {
  const selectedMembership = memberships.find((membership) => getMembershipRecordId(membership) === draft.membershipId || membership.id === draft.membershipId)
  const selectedOperationsKey = selectedMembership ? getMembershipRecordId(selectedMembership) : draft.membershipId
  const selectedOperations = selectedOperationsKey ? membershipOperationsById[selectedOperationsKey] : null
  const services = (selectedOperations?.services || []).filter((service) => ['active', 'activo'].includes(String(service.status || '').toLowerCase()))
  const selectedService = services.find((service) => service.id === draft.serviceOfferingId)
  const [month, setMonth] = useState(() => getTodayDateValue().slice(0, 7))
  const [availabilityRevision, setAvailabilityRevision] = useState(0)
  const [availability, setAvailability] = useState({ key: '', days: [], slots: [], error: '' })
  const [existingClientMatch, setExistingClientMatch] = useState(null)
  const displayMonth = draft.date?.slice(0, 7) || month
  const availabilityKey = `${currentStudio?.id || ''}|${draft.membershipId}|${displayMonth}|${draft.serviceOfferingId}|${draft.date}|${availabilityRevision}|${availabilityRefresh}`
  const currentAvailability = availability.key === availabilityKey ? availability : { days: [], slots: [], error: '' }
  const availabilityLoading = Boolean(draft.membershipId && availability.key !== availabilityKey)
  const availabilityError = currentAvailability.error
  const selectedSlot = currentAvailability.slots.find((slot) => slot.id === draft.availabilitySlotId)
  const monthStart = parseDateValue(`${displayMonth}-01`)
  const monthOffset = (monthStart.getDay() + 6) % 7
  const monthLength = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate()
  const daySet = new Set(currentAvailability.days)
  const currentMonth = getTodayDateValue().slice(0, 7)
  const nextMonth = formatDateValue(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1)).slice(0, 7)
  const canGoForward = nextMonth <= formatDateValue(new Date(parseDateValue(`${currentMonth}-01`).getFullYear(), parseDateValue(`${currentMonth}-01`).getMonth() + 12, 1)).slice(0, 7)
  useEffect(() => {
    if (!currentStudio?.id || !draft.membershipId) return
    let active = true
    fetchStudioOwnerBookingCalendar({
      studioId: currentStudio.id, membershipId: draft.membershipId, month: `${displayMonth}-01`,
      serviceOfferingId: draft.serviceOfferingId || null, date: draft.date || null,
    }).then((result) => { if (active) setAvailability({ ...result, key: availabilityKey, error: '' }) })
      .catch((error) => { if (active) setAvailability({ key: availabilityKey, days: [], slots: [], error: error.message || 'No se pudo consultar la agenda.' }) })
    return () => { active = false }
  }, [currentStudio?.id, draft.membershipId, draft.serviceOfferingId, draft.date, displayMonth, availabilityKey])
  useEffect(() => {
    if (!selectedSlot || draft.clientId || !currentStudio?.id) return undefined
    const phone = draft.clientPhone.replace(/\D/g, '')
    const email = draft.clientEmail.trim()
    if (phone.length < 10 && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return undefined
    let active = true
    const timeout = window.setTimeout(() => {
      findStudioOwnerExistingClient({ studioId: currentStudio.id, phone, email })
        .then((client) => { if (active) setExistingClientMatch(client) })
        .catch(() => { if (active) setExistingClientMatch(null) })
    }, 350)
    return () => { active = false; window.clearTimeout(timeout) }
  }, [currentStudio?.id, draft.clientId, draft.clientPhone, draft.clientEmail, selectedSlot])
  const search = draft.clientSearch.trim().toLowerCase()
  const matchingClients = search
    ? clients.filter((client) => `${client.name} ${client.email}`.toLowerCase().includes(search)).slice(0, 5)
    : []
  const selectedClient = clients.find((client) => client.id === draft.clientId)

  return (
    <div className={inline ? 'inline-appointment-form owner-appointment-inline' : 'modal-shell owner-appointment-modal'} aria-label="Agendar cita">
      <div className={inline ? 'owner-appointment-inline-card' : 'modal-card'}>
        <div className="modal-header">
          <div>
            <span className="eyebrow">{currentStudio?.profile?.commercialName || currentStudio?.name || 'Estudio'}</span>
            <h3>Elige el momento ideal</h3>
          </div>
          <Button className="owner-appointment-hide" variant="ghost" size="sm" onClick={onClose}>
            {inline ? 'Limpiar' : 'Cerrar'}
          </Button>
        </div>
        <div className="modal-body form-stack compact-form">
          {!selectedSlot && <>
          <section className="owner-artist-picker" aria-label="Seleccion de artista">
            <div>
              <span className="eyebrow">TU EQUIPO</span>
              <h4>¿Con quién será la cita?</h4>
            </div>
            <div className="owner-artist-grid owner-artist-grid-highlight">
              {memberships.length > 0 ? memberships.map((membership) => {
                const membershipRecordId = getMembershipRecordId(membership)
                const isSelected = draft.membershipId === membershipRecordId
                const photoUrl = membership.studioPhotoUrl || membership.photoUrl || ''

                return (
                  <button
                    className={`owner-artist-card${isSelected ? ' active' : ''}`}
                    key={membershipRecordId || membership.id}
                    type="button"
                    onClick={() => onDraftChange({ membershipId: membershipRecordId, date: '', serviceOfferingId: '', availabilitySlotId: '' })}
                  >
                    <span className="owner-artist-avatar">
                      {photoUrl ? <img src={photoUrl} alt={`Foto de ${membership.name}`} /> : getInitials(membership.name)}
                    </span>
                    <strong>{membership.name}</strong>
                    <small>Artista del estudio</small>
                  </button>
                )
              }) : (
                <div className="list-row elevated-row">
                  <div>
                    <strong>Sin artistas activas</strong>
                    <small>Agrega artistas al estudio para asignar citas.</small>
                  </div>
                </div>
              )}
            </div>
          </section>
          {selectedMembership && <section className="owner-booking-calendar" aria-label="Dias disponibles">
            <div className="owner-booking-month"><button type="button" aria-label="Mes anterior" disabled={displayMonth <= currentMonth} onClick={() => { setMonth(formatDateValue(new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1)).slice(0, 7)); onDraftChange({ date: '', serviceOfferingId: '', availabilitySlotId: '' }) }}><ChevronLeft size={20} /></button><strong>{new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(monthStart)}</strong><button type="button" aria-label="Mes siguiente" disabled={!canGoForward} onClick={() => { setMonth(nextMonth); onDraftChange({ date: '', serviceOfferingId: '', availabilitySlotId: '' }) }}><ChevronRight size={20} /></button></div>
            <div className="owner-booking-days">{['L','M','M','J','V','S','D'].map((day, index) => <span key={index}>{day}</span>)}{Array.from({ length: monthOffset }, (_, index) => <span key={`empty-${index}`} />)}{Array.from({ length: monthLength }, (_, index) => { const date = `${displayMonth}-${String(index + 1).padStart(2, '0')}`; return <button key={date} type="button" disabled={!daySet.has(date) || availabilityLoading} className={draft.date === date ? 'active' : ''} onClick={() => onDraftChange({ date, serviceOfferingId: '', availabilitySlotId: '' })}>{index + 1}</button> })}</div>
            {availabilityLoading && <small>Consultando días disponibles...</small>}
            {!availabilityLoading && currentAvailability.days.length === 0 && !availabilityError && <small>No hay horarios libres de esta artista en este mes.</small>}
            {availabilityError && <small role="alert">{availabilityError}</small>}
          </section>}
          {draft.date && <label className="input-field owner-booking-service"><span>¿Qué servicio desea?</span><select value={draft.serviceOfferingId} onChange={(event) => onDraftChange({ serviceOfferingId: event.target.value, availabilitySlotId: '' })}><option value="">Selecciona un servicio</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name} · {service.duration || `${service.durationMinutes} min`} · ${Number(service.priceAmount ?? service.price ?? 0).toLocaleString('es-MX')}</option>)}</select></label>}
          {draft.date && services.length === 0 && <small>{selectedOperations ? 'Esta artista aún no tiene servicios activos en el estudio.' : 'Cargando los servicios de la artista...'}</small>}
          {selectedService && draft.date && <section className="owner-booking-times"><div className="owner-booking-times-heading"><strong>Horarios para {selectedService.name}</strong><button type="button" onClick={() => { onDraftChange({ availabilitySlotId: '' }); setAvailabilityRevision((value) => value + 1) }} aria-label="Actualizar horarios" title="Actualizar horarios"><RefreshCw size={17} /></button></div>{availabilityLoading ? <small>Comprobando horarios...</small> : currentAvailability.slots.length ? <div className="owner-booking-times-grid">{currentAvailability.slots.map((slot) => <button type="button" key={slot.id} className={draft.availabilitySlotId === slot.id ? 'active' : ''} onClick={() => onDraftChange({ availabilitySlotId: slot.id })}>{slot.time} - {slot.end}</button>)}</div> : <small>Ese servicio no cabe en los espacios libres de este día. Elige otro día o servicio.</small>}</section>}
          </>}
          {selectedSlot && <section className="owner-booking-client"><div className="owner-booking-selection"><strong>{selectedMembership.name} · {selectedService.name} · {selectedSlot.date} a las {selectedSlot.time}</strong><Button size="sm" variant="ghost" onClick={() => onDraftChange({ availabilitySlotId: '' })}>Cambiar horario</Button></div><div className="location-form-grid"><Input label="Buscar clienta" placeholder="Nombre o correo electrónico" type="search" value={draft.clientSearch} onChange={(event) => onDraftChange({ clientSearch: event.target.value, clientId: '' })} /><div style={{ alignSelf: 'end' }}><Button disabled={isClientSearchLoading} size="sm" onClick={onSearchClients}>{isClientSearchLoading ? 'Buscando...' : 'Buscar'}</Button></div></div><div className="compact-list">{matchingClients.map((client) => <div className="list-row elevated-row" key={client.id}><div><strong>{client.name}</strong><small>{client.email || client.phone || 'Sin contacto'}</small></div><Button size="sm" variant={draft.clientId === client.id ? 'primary' : 'ghost'} onClick={() => onDraftChange({ clientId: client.id, clientName: client.name, clientPhone: client.phone || '', clientEmail: client.email || '' })}>Usar perfil</Button></div>)}{clientSearchStatus.message && <small>{clientSearchStatus.message}</small>}</div>{selectedClient && <small>Clienta existente: {selectedClient.name}</small>}{!draft.clientId && <><Input label="Nombre de la clienta" value={draft.clientName} onChange={(event) => onDraftChange({ clientName: event.target.value })} /><Input label="Teléfono" type="tel" value={draft.clientPhone} onChange={(event) => onDraftChange({ clientPhone: event.target.value })} /><Input label="Correo opcional" type="email" value={draft.clientEmail} onChange={(event) => onDraftChange({ clientEmail: event.target.value })} />{existingClientMatch && <div className="owner-existing-client" role="status"><strong>Esta clienta ya forma parte de Studio Flow</strong><span>{existingClientMatch.name} · Usa su perfil para agendar y evitar duplicados.</span><Button size="sm" onClick={() => onDraftChange({ clientId: existingClientMatch.id, clientName: existingClientMatch.name, clientPhone: existingClientMatch.phone || '', clientEmail: existingClientMatch.email || '' })}>Usar perfil para agendar</Button></div>}</>}<label className="input-field"><span>Notas</span><textarea rows="3" value={draft.notes} onChange={(event) => onDraftChange({ notes: event.target.value })} /></label></section>}
          {feedback.message && (
            <small style={{ color: feedback.tone === 'success' ? 'var(--success)' : 'var(--rose-dark)', fontWeight: 800 }}>
              {feedback.message}
            </small>
          )}
        </div>
        {selectedSlot && <div className="modal-actions">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" disabled={isSaving || !selectedSlot || !selectedService} onClick={onSave}>
            {isSaving ? 'Guardando...' : 'Guardar cita'}
          </Button>
        </div>}
      </div>
    </div>
  )
}

function normalizeOwnerClient(client = {}) {
  return {
    ...client,
    id: client.id,
    name: client.name || client.displayName || client.display_name || 'Clienta',
    email: client.email || '',
    phone: client.phone || '',
    status: client.status || 'Activo',
    createdAt: client.createdAt || client.created_at || '',
    lastAppointmentAt: client.lastAppointmentAt || client.last_appointment_at || client.lastVisit || '',
  }
}

function isActiveMembership(membership = {}) {
  const status = String(membership.status || '').toLowerCase()
  return Boolean(membership.active) || ['active', 'activo'].includes(status)
}

function getMembershipRecordId(membership = {}) {
  return membership.membershipId || membership.membership_id || membership.id || ''
}

function buildMembershipsFromAdminArtists(artists = [], studioId = '') {
  if (!studioId) return []

  return artists
    .flatMap((artist) => {
      const memberships = Array.isArray(artist.memberships) ? artist.memberships : []
      const explicitMemberships = memberships
        .filter((membership) => (
          (membership.studioId || membership.studio_id) === studioId
          && !['inactive', 'inactivo', 'archived', 'archivado'].includes(String(membership.status || '').toLowerCase())
        ))
        .map((membership) => ({
          id: membership.id || artist.membershipId || `membership-${artist.id}-${studioId}`,
          membershipId: membership.id || artist.membershipId || null,
          artistId: artist.id,
          profileId: artist.profileId || artist.profile_id || null,
          name: artist.name || artist.owner || 'Artista',
          email: artist.email || artist.profile?.email || '',
          photoUrl: artist.artistProfile?.photo_path || artist.profile?.photoUrl || '',
          studioPhotoUrl: artist.artistProfile?.studio_photo_paths?.[studioId] || '',
          role: membership.role || artist.plan || 'artist',
          status: membership.status || 'active',
          active: true,
          startedAt: membership.startedAt || membership.started_at || '',
          createdAt: membership.createdAt || membership.created_at || artist.registeredAt || '',
        }))

      if (explicitMemberships.length > 0) return explicitMemberships

      if (
        artist.studioId === studioId
        && artist.membershipId
        && !['inactive', 'inactivo', 'archived', 'archivado', 'rejected', 'rechazado'].includes(String(artist.status || '').toLowerCase())
      ) {
        return [{
          id: artist.membershipId,
          membershipId: artist.membershipId,
          artistId: artist.id,
          profileId: artist.profileId || null,
          name: artist.name || artist.owner || 'Artista',
          email: artist.email || artist.profile?.email || '',
          photoUrl: artist.artistProfile?.photo_path || artist.profile?.photoUrl || '',
          studioPhotoUrl: artist.artistProfile?.studio_photo_paths?.[studioId] || '',
          role: artist.plan || 'artist',
          status: 'active',
          active: true,
          startedAt: artist.registeredAt || '',
          createdAt: artist.registeredAt || '',
        }]
      }

      return []
    })
}

function AdminStudioProfile() {
  const now = useCurrentTime()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { adminState, loadAdminArtists, loadAdminClients, session, updateManagedStudioProfile } = useApp()
  const [isPublishingMarketplace, setIsPublishingMarketplace] = useState(false)
  const [marketplaceVisibilityOverride, setMarketplaceVisibilityOverride] = useState('')
  const [ownStudioMarketplaceState, setOwnStudioMarketplaceState] = useState(null)
  const [marketplaceFeedback, setMarketplaceFeedback] = useState({ tone: 'neutral', message: '' })
  const [mediaFeedback, setMediaFeedback] = useState({ tone: 'neutral', message: '' })
  const [isProfileSaving, setIsProfileSaving] = useState(false)
  const [profileSaveFeedback, setProfileSaveFeedback] = useState({ tone: 'neutral', message: '' })
  const [membershipState, setMembershipState] = useState({
    memberships: [],
    invitations: [],
    artistCandidates: [],
    lastInvitation: null,
  })
  const [isMembershipsLoading, setIsMembershipsLoading] = useState(false)
  const [isArtistSearchLoading, setIsArtistSearchLoading] = useState(false)
  const [membershipFeedback, setMembershipFeedback] = useState({ tone: 'neutral', message: '' })
  const [expandedMembershipId, setExpandedMembershipId] = useState('')
  const [membershipOperationsById, setMembershipOperationsById] = useState({})
  const [membershipOperationsLoadingId, setMembershipOperationsLoadingId] = useState('')
  const [unlinkingMembershipId, setUnlinkingMembershipId] = useState('')
  const [unlinkedMembershipIds, setUnlinkedMembershipIds] = useState([])
  const [pendingUnlinkMembership, setPendingUnlinkMembership] = useState(null)
  const [editingMembershipId, setEditingMembershipId] = useState('')
  const [membershipServiceDrafts, setMembershipServiceDrafts] = useState({})
  const [savingMembershipServiceId, setSavingMembershipServiceId] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [searchedArtist, setSearchedArtist] = useState(null)
  const [artistSearchStatus, setArtistSearchStatus] = useState({ tone: 'neutral', message: '' })
  const [ownerAppointmentDraft, setOwnerAppointmentDraft] = useState(emptyOwnerAppointmentDraft)
  const [isOwnerAppointmentOpen, setIsOwnerAppointmentOpen] = useState(false)
  const [isOwnerAppointmentSaving, setIsOwnerAppointmentSaving] = useState(false)
  const [ownerAppointmentFeedback, setOwnerAppointmentFeedback] = useState({ tone: 'neutral', message: '' })
  const [ownerAvailabilityRefresh, setOwnerAvailabilityRefresh] = useState(0)
  const [confirmationFeedback, setConfirmationFeedback] = useState({ tone: 'neutral', message: '' })
  const [ownerClientResults, setOwnerClientResults] = useState([])
  const [isOwnerClientSearchLoading, setIsOwnerClientSearchLoading] = useState(false)
  const [ownerClientSearchStatus, setOwnerClientSearchStatus] = useState({ tone: 'neutral', message: '' })
  const [studioOwnerAppointments, setStudioOwnerAppointments] = useState([])
  const [cancellingAppointmentId, setCancellingAppointmentId] = useState('')
  const [studioMarketingSettings, setStudioMarketingSettings] = useState(emptyStudioMarketingSettings)
  const [studioHappyHourDraft, setStudioHappyHourDraft] = useState({ discountPercent: 10, weekdays: [1, 2, 3, 4, 5], startTime: '14:00', endTime: '17:00' })
  const [isStudioMarketingLoading, setIsStudioMarketingLoading] = useState(false)
  const [isStudioMarketingSaving, setIsStudioMarketingSaving] = useState(false)
  const [studioMarketingFeedback, setStudioMarketingFeedback] = useState({ tone: 'neutral', message: '' })
  const studioMarketingRequestRef = useRef(0)
  const ownerAppointmentFormRef = useRef(null)
  const localProfiles = session.user ? [{ ...session.user, id: session.user.id }] : []
  const currentProfile = getCurrentProfile({ session, profiles: localProfiles })
  const studioOwnerAssignment = (session.roles || []).find((assignment) => (
    assignment.role === 'studio_owner'
    && (assignment.status || 'active') !== 'inactive'
    && (assignment.status || 'active') !== 'revoked'
    && (assignment.studioId || assignment.studio_id)
  ))
  const activeStudioOwnerContextId = session.activeSessionContext?.role === 'studio_owner'
    ? session.activeSessionContext?.studioId || session.activeSessionContext?.studio_id || null
    : null
  const activeStudioId = activeStudioOwnerContextId
    || studioOwnerAssignment?.studioId
    || studioOwnerAssignment?.studio_id
    || session.user?.studioId
    || session.user?.studio_id
    || null
  const currentStudio = getCurrentStudio({
    session,
    profiles: localProfiles,
    studios: adminState.studios.map((studio) => (
      studio.id === activeStudioId && currentProfile
        ? { ...studio, ownerProfileId: currentProfile.id }
        : studio
    )),
    activeStudioId,
  }) || (activeStudioId
    ? {
        id: activeStudioId,
        name: session.activeSessionContext?.studioName
          || session.activeSessionContext?.studio_name
          || studioOwnerAssignment?.studioName
          || studioOwnerAssignment?.studio_name
          || 'Estudio',
        studioStatus: session.activeSessionContext?.studioStatus
          || session.activeSessionContext?.studio_status
          || studioOwnerAssignment?.studioStatus
          || studioOwnerAssignment?.studio_status
          || '',
        profile: {},
        professionalLocation: {},
      }
    : null)
  const [profileDraft, setProfileDraft] = useState(currentStudio?.profile || {})
  const [locationDraft, setLocationDraft] = useState(createProfessionalLocation(currentStudio?.professionalLocation || {}))
  const [locationErrors, setLocationErrors] = useState({})
  const [locationDetection, setLocationDetection] = useState({ status: 'idle', message: '' })
  const [isStudioLocationConfirmed, setIsStudioLocationConfirmed] = useState(false)
  const mapsUrl = buildGoogleMapsUrl(locationDraft)
  const locationHasCoordinates = hasCoordinates(locationDraft)
  const galleryCount = (profileDraft.gallery || []).length
  const hasGalleryCapacity = galleryCount < galleryLimit
  const activeMemberships = useMemo(
    () => membershipState.memberships.filter(isActiveMembership),
    [membershipState.memberships],
  )
  const fallbackMemberships = useMemo(
    () => buildMembershipsFromAdminArtists(adminState.artists, currentStudio?.id),
    [adminState.artists, currentStudio?.id],
  )
  const operationalMemberships = useMemo(() => {
    const merged = activeMemberships.filter((membership) => !unlinkedMembershipIds.includes(getMembershipRecordId(membership))).map((membership) => {
      const fallback = fallbackMemberships.find((item) => item.artistId && item.artistId === membership.artistId)
      return { ...membership, photoUrl: membership.photoUrl || fallback?.photoUrl || '', studioPhotoUrl: membership.studioPhotoUrl || fallback?.studioPhotoUrl || '' }
    })

    fallbackMemberships.forEach((fallbackMembership) => {
      if (unlinkedMembershipIds.includes(getMembershipRecordId(fallbackMembership))) return
      const exists = merged.some((membership) => (
        membership.id === fallbackMembership.id
        || (getMembershipRecordId(membership) && getMembershipRecordId(membership) === getMembershipRecordId(fallbackMembership))
        || (membership.artistId && membership.artistId === fallbackMembership.artistId)
      ))

      if (!exists) merged.push(fallbackMembership)
    })

    return merged
  }, [activeMemberships, fallbackMemberships, unlinkedMembershipIds])
  const studioFlowPointsEnabled = Boolean(studioMarketingSettings.flowPointsEnabled)
  const studioDoublePointsActive = studioMarketingSettings.doublePoints?.status === 'active'
  const studioHappyHourActive = studioMarketingSettings.happyHour?.status === 'active'
  const displayedTeamMemberships = useMemo(() => {
    if (!searchedArtist?.alreadyMember) return operationalMemberships

    const searchedMembershipId = searchedArtist.membershipId || searchedArtist.membership_id || null
    const alreadyDisplayed = operationalMemberships.some((membership) => (
      (searchedMembershipId && (membership.id === searchedMembershipId || membership.membershipId === searchedMembershipId))
      || (searchedArtist.id && membership.artistId === searchedArtist.id)
      || (searchedArtist.email && membership.email === searchedArtist.email)
    ))

    if (alreadyDisplayed) return operationalMemberships

    return [
      {
        id: searchedMembershipId || `searched-${searchedArtist.id || searchedArtist.email}`,
        membershipId: searchedMembershipId,
        artistId: searchedArtist.id,
        name: searchedArtist.name,
        email: searchedArtist.email,
        photoUrl: searchedArtist.photoUrl,
        studioPhotoUrl: searchedArtist.studioPhotoUrl,
        status: searchedArtist.membershipStatus || 'active',
        active: true,
        startedAt: '',
        createdAt: '',
      },
      ...operationalMemberships,
    ]
  }, [operationalMemberships, searchedArtist])
  const requestedSectionParam = searchParams.get('section') || 'summary'
  const requestedSection = requestedSectionParam === 'config' ? 'settings' : requestedSectionParam
  const selectedSection = studioSections.includes(requestedSection) ? requestedSection : 'summary'
  const suggestedStudioDay = searchParams.get('sugerirDia')
  const suggestedStudioHour = searchParams.get('sugerirHora')
  useEffect(() => { if (selectedSection === 'marketplace' && suggestedStudioDay !== null && suggestedStudioHour !== null) requestAnimationFrame(() => document.querySelector('.happy-hour-panel')?.scrollIntoView({ block: 'start', behavior: 'smooth' })) }, [selectedSection, suggestedStudioDay, suggestedStudioHour])
  const ownerAppointments = useMemo(() => {
    const activeMembershipIds = new Set(operationalMemberships.map(getMembershipRecordId).filter(Boolean))
    const activeArtistIds = new Set(operationalMemberships.map((membership) => membership.artistId).filter(Boolean))

    return studioOwnerAppointments
      .filter(isConfirmedAppointment)
      .filter((appointment) => {
        const appointmentStudioId = appointment.studioId || appointment.studio_id || null
        const appointmentMembershipId = appointment.membershipId || appointment.membership_id || null
        const appointmentArtistId = appointment.artistId || appointment.artist_id || null

        if (appointmentStudioId) return appointmentStudioId === currentStudio?.id
        if (appointmentMembershipId) return activeMembershipIds.has(appointmentMembershipId)
        if (appointmentArtistId) return activeArtistIds.has(appointmentArtistId)
        return false
      })
  }, [operationalMemberships, currentStudio?.id, studioOwnerAppointments])
  const modalClientResults = ownerClientResults

  const activeMembershipIds = useMemo(
    () => operationalMemberships.map(getMembershipRecordId).filter(Boolean),
    [operationalMemberships],
  )

  const currentStudioId = currentStudio?.id
  const loadStudioOwnerAppointments = useCallback(async () => {
    if (!currentStudioId) return []

    try {
      const appointments = await fetchStudioOwnerAppointments({
        studioId: currentStudioId,
        membershipIds: activeMembershipIds,
      })
      setStudioOwnerAppointments(appointments)
      return appointments
    } catch {
      setStudioOwnerAppointments([])
      return []
    }
  }, [activeMembershipIds, currentStudioId])

  useEffect(() => {
    window.addEventListener('studioflow:deposit-updated', loadStudioOwnerAppointments)
    return () => window.removeEventListener('studioflow:deposit-updated', loadStudioOwnerAppointments)
  }, [loadStudioOwnerAppointments])

  const sendStudioConfirmationRequests = useCallback(async (date = null) => {
    if (!currentStudioId) return

    setConfirmationFeedback({ tone: 'neutral', message: '' })

    try {
      const updatedCount = await requestStudioOwnerAppointmentConfirmations({
        studioId: currentStudioId,
        date,
      })
      setConfirmationFeedback({
        tone: 'success',
        message: updatedCount > 0
          ? `Aviso enviado a ${updatedCount} clientas.`
          : 'No hay citas pendientes para avisar.',
      })
      await loadStudioOwnerAppointments()
    } catch (error) {
      setConfirmationFeedback({ tone: 'warm', message: error.message || 'No se pudo enviar el aviso.' })
    }
  }, [currentStudioId, loadStudioOwnerAppointments])

  const cancelStudioAppointment = useCallback(async (appointment = {}) => {
    if (!appointment.id) return
    const sourceLabel = ['google', 'instagram', 'facebook'].includes(appointment.bookingSource) ? ` reserva desde enlace de ${appointment.bookingSource}` : ' cita'
    if (!window.confirm(`Confirma que deseas cancelar esta${sourceLabel}. El horario volvera a quedar disponible si aun cumple las reglas de la agenda.`)) return

    setCancellingAppointmentId(appointment.id)
    setConfirmationFeedback({ tone: 'neutral', message: '' })
    try {
      await cancelArtistAppointment({ appointmentId: appointment.id })
      setConfirmationFeedback({ tone: 'success', message: 'Cita cancelada. El horario disponible fue actualizado.' })
      await loadStudioOwnerAppointments()
    } catch (error) {
      setConfirmationFeedback({ tone: 'warm', message: error.message || 'No se pudo cancelar la cita.' })
    } finally {
      setCancellingAppointmentId('')
    }
  }, [loadStudioOwnerAppointments])

  const loadStudioMemberships = useCallback(async ({ silent = false, successMessage = '' } = {}) => {
    if (!currentStudioId) return null

    if (!silent) {
      setIsMembershipsLoading(true)
      setMembershipFeedback({ tone: 'neutral', message: '' })
    }

    try {
      const payload = await fetchStudioMemberships(currentStudioId)
      setMembershipState(payload)
      if (successMessage) {
        setMembershipFeedback({ tone: 'success', message: successMessage })
      }
      return payload
    } catch (error) {
      if (!silent) {
        setMembershipFeedback({ tone: 'warm', message: error.message || 'No se pudieron cargar artistas del estudio.' })
      }
      return null
    } finally {
      if (!silent) setIsMembershipsLoading(false)
    }
  }, [currentStudioId])

  const loadMembershipOperations = useCallback(async (membershipId) => {
    if (!currentStudioId || !membershipId) return null

    setMembershipOperationsLoadingId(membershipId)

    try {
      const payload = await fetchStudioMembershipOperations({
        studioId: currentStudioId,
        membershipId,
      })
      setMembershipOperationsById((currentState) => ({
        ...currentState,
        [membershipId]: payload,
      }))
      return payload
    } catch (error) {
      setMembershipFeedback({ tone: 'warm', message: error.message || 'No se pudo cargar la operacion de la artista.' })
      return null
    } finally {
      setMembershipOperationsLoadingId('')
    }
  }, [currentStudioId])

  useEffect(() => {
    queueMicrotask(() => {
      setProfileDraft(currentStudio?.profile || {})
      setLocationDraft(createProfessionalLocation(currentStudio?.professionalLocation || {}))
      setIsStudioLocationConfirmed(false)
      setMarketplaceFeedback({ tone: 'neutral', message: '' })
    })
  }, [currentStudio?.id, currentStudio?.professionalLocation, currentStudio?.profile])

  const [previousMembershipStudioId, setPreviousMembershipStudioId] = useState(null)
  if (previousMembershipStudioId !== currentStudioId) {
    setPreviousMembershipStudioId(currentStudioId)
    setMembershipState({ memberships: [], invitations: [], artistCandidates: [], lastInvitation: null })
    setMembershipOperationsById({})
    setUnlinkedMembershipIds([])
    setExpandedMembershipId('')
    setStudioOwnerAppointments([])
    setOwnerAppointmentDraft(emptyOwnerAppointmentDraft)
    setIsOwnerAppointmentOpen(false)
    setOwnerClientResults([])
    setSearchedArtist(null)
    setInviteEmail('')
    setStudioMarketingSettings(emptyStudioMarketingSettings)
    setIsMembershipsLoading(Boolean(currentStudioId))
    setMembershipFeedback({ tone: 'neutral', message: '' })
  }
  useEffect(() => {
    if (!currentStudioId) return undefined
    let active = true
    fetchStudioMemberships(currentStudioId)
      .then((payload) => { if (active) setMembershipState(payload) })
      .catch((error) => { if (active) setMembershipFeedback({ tone: 'warm', message: error.message || 'No se pudieron cargar artistas del estudio.' }) })
      .finally(() => { if (active) setIsMembershipsLoading(false) })
    loadAdminArtists?.().catch(() => null)
    return () => { active = false }
  }, [currentStudioId, loadAdminArtists])

  const [previousMarketplaceStudioId, setPreviousMarketplaceStudioId] = useState(currentStudioId)
  if (previousMarketplaceStudioId !== currentStudioId) {
    setPreviousMarketplaceStudioId(currentStudioId)
    setMarketplaceVisibilityOverride('')
    setOwnStudioMarketplaceState(null)
  }
  useEffect(() => {
    if (!currentStudioId) return undefined
    let isActive = true
    fetchOwnStudios()
      .then((studios) => {
        if (!isActive) return
        const ownStudio = studios.find((studio) => studio.id === currentStudioId || studio.studioId === currentStudioId)
        setOwnStudioMarketplaceState(ownStudio || null)
      })
      .catch((error) => {
        if (isActive) {
          setOwnStudioMarketplaceState(null)
          setMarketplaceFeedback({ tone: 'warm', message: error.message || 'No se pudo consultar si el estudio esta publicado.' })
        }
      })

    return () => {
      isActive = false
    }
  }, [currentStudioId])

  useEffect(() => {
    if (!currentStudioId) return undefined
    let active = true
    fetchStudioOwnerAppointments({ studioId: currentStudioId, membershipIds: activeMembershipIds })
      .then((appointments) => { if (active) setStudioOwnerAppointments(appointments) })
      .catch(() => { if (active) setStudioOwnerAppointments([]) })
    window.addEventListener('studio-flow-appointment-completed', loadStudioOwnerAppointments)
    return () => {
      active = false
      window.removeEventListener('studio-flow-appointment-completed', loadStudioOwnerAppointments)
    }
  }, [currentStudioId, activeMembershipIds, loadStudioOwnerAppointments])

  useEffect(() => {
    if (!supabase || !currentStudio?.id) return undefined

    const channel = supabase
      .channel(`studio-flow-owner-appointments-${currentStudio.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments', filter: `studio_id=eq.${currentStudio.id}` },
        () => {
          loadStudioOwnerAppointments()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentStudio?.id, loadStudioOwnerAppointments])

  useEffect(() => {
    if (!currentStudio?.id) return undefined
    let lastRefresh = Date.now()
    const refreshMemberships = () => {
      if (document.visibilityState === 'hidden' || Date.now() - lastRefresh < 60000) return
      lastRefresh = Date.now()
      loadStudioMemberships({ silent: true })
    }
    const intervalId = window.setInterval(() => {
      refreshMemberships()
    }, 300000)
    window.addEventListener('focus', refreshMemberships)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', refreshMemberships)
    }
  }, [currentStudio?.id, loadStudioMemberships])

  useEffect(() => {
    if (!['summary', 'services', 'schedule', 'metrics'].includes(selectedSection)) return undefined

    const membershipsToLoad = operationalMemberships.filter((membership) => {
      const membershipRecordId = getMembershipRecordId(membership)
      return membershipRecordId && !membershipOperationsById[membershipRecordId]
    })
    if (membershipsToLoad.length === 0) return undefined

    let isCancelled = false

    const loadOperationalResources = async () => {
      for (const membership of membershipsToLoad) {
        if (isCancelled) return
        await loadMembershipOperations(getMembershipRecordId(membership))
      }
    }

    loadOperationalResources()

    return () => {
      isCancelled = true
    }
  }, [operationalMemberships, loadMembershipOperations, membershipOperationsById, selectedSection])

  const updateProfileField = (field, value) => {
    setProfileDraft((currentDraft) => ({
      ...currentDraft,
      [field]: value,
    }))
  }

  const updateLocationField = (field, value) => {
    setLocationDraft((currentDraft) => ({
      ...currentDraft,
      [field]: value,
    }))
    if (['address', 'city', 'state', 'postalCode', 'latitude', 'longitude'].includes(field)) {
      setIsStudioLocationConfirmed(false)
    }
    setLocationErrors((currentErrors) => ({ ...currentErrors, [field]: '' }))
  }

  const updateProfileContactLink = (field, value) => {
    setProfileDraft((currentDraft) => ({
      ...currentDraft,
      contactLinks: {
        ...(currentDraft.contactLinks || {}),
        [field]: value,
      },
    }))
  }

  const useCurrentLocation = async () => {
    setLocationDetection({ status: 'loading', message: 'Detectando ubicacion actual...' })

    try {
      const coordinates = await getCurrentBrowserCoordinates()

      setLocationDraft((currentDraft) => ({
        ...currentDraft,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
      }))
      setLocationErrors((currentErrors) => ({
        ...currentErrors,
        latitude: '',
        longitude: '',
      }))
      setLocationDetection({
        status: 'success',
        message: `Ubicacion detectada: ${coordinates.latitude}, ${coordinates.longitude}. Esta ubicacion es aproximada. Verifica que corresponda a tu direccion antes de guardar.`,
      })
      setIsStudioLocationConfirmed(false)
    } catch (error) {
      setLocationDetection({
        status: 'error',
        message: error.message || 'No se pudo usar la ubicacion actual.',
      })
    }
  }

  const handleLogoChange = async (event) => {
    const file = event.target.files?.[0]
    try {
      if (!file) return
      const logoUrl = await optimizeImageFile(file, { maxWidth: 720, maxHeight: 720, quality: 0.82 })
      setProfileDraft((currentDraft) => ({ ...currentDraft, logoUrl }))
      setMediaFeedback({ tone: 'success', message: 'Logotipo optimizado. Guarda el perfil para aplicar el cambio.' })
    } catch (error) {
      setMediaFeedback({ tone: 'warm', message: error.message || 'No se pudo optimizar el logotipo.' })
    }
    event.target.value = ''
  }

  const handleGalleryChange = async (event) => {
    const files = Array.from(event.target.files || []).slice(0, galleryLimit - (profileDraft.gallery || []).length)
    try {
      const images = await Promise.all(files.map(async (file) => ({
        id: `studio-gallery-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        label: file.name,
        url: await optimizeImageFile(file),
      })))
      if (images.length) {
        setProfileDraft((currentDraft) => ({
          ...currentDraft,
          gallery: [...(currentDraft.gallery || []), ...images].slice(0, galleryLimit),
        }))
        setMediaFeedback({ tone: 'success', message: 'Fotografias optimizadas. Guarda el perfil para aplicar los cambios.' })
      }
    } catch (error) {
      setMediaFeedback({ tone: 'warm', message: error.message || 'No se pudieron optimizar las fotografias.' })
    }
    event.target.value = ''
  }

  const removeGalleryImage = (imageId) => {
    setProfileDraft((currentDraft) => ({
      ...currentDraft,
      gallery: (currentDraft.gallery || []).filter((image) => image.id !== imageId),
    }))
  }

  const saveStudioProfile = async () => {
    if (!currentStudio?.id || isProfileSaving) return
    const savedLocation = currentStudio.professionalLocation || {}
    const coordinatesChanged = ['latitude', 'longitude'].some((field) => (
      String(locationDraft[field] || '') !== String(savedLocation[field] || '')
    ))
    if (locationHasCoordinates && coordinatesChanged && !isStudioLocationConfirmed) {
      setLocationErrors({ latitude: 'Confirma que esta ubicacion corresponde a tu estudio.' })
      setProfileSaveFeedback({ tone: 'warm', message: 'Confirma la ubicación en el mapa para guardar los cambios.' })
      return
    }
    setLocationErrors({})

    const nextStudioProfile = {
      profile: profileDraft,
      professionalLocation: {
        ...locationDraft,
        businessName: profileDraft.commercialName,
      },
    }

    setIsProfileSaving(true)
    setProfileSaveFeedback({ tone: 'neutral', message: '' })
    const savedStudio = await updateManagedStudioProfile(currentStudio.id, nextStudioProfile)
      .catch(() => null)
    setIsProfileSaving(false)

    if (!savedStudio) {
      setProfileSaveFeedback({ tone: 'warm', message: 'No se pudo guardar el perfil del estudio. Revisa el aviso del sistema.' })
      return
    }

    const hasCompleteLocation = Boolean(String(locationDraft.address || '').trim() && String(locationDraft.city || '').trim())
    setProfileSaveFeedback({
      tone: 'success',
      message: hasCompleteLocation
        ? 'Perfil y ubicación del estudio actualizados.'
        : 'Perfil guardado. Agrega dirección y ciudad para completar la ubicación.',
    })
  }

  const hasMarketplaceMinimumData = Boolean(
    currentStudio?.studioStatus === 'approved'
    && String(profileDraft.commercialName || currentStudio?.profile?.commercialName || currentStudio?.name || '').trim()
    && String(locationDraft.city || currentStudio?.profile?.city || currentStudio?.city || '').trim()
    && (
      String(locationDraft.address || currentStudio?.professionalLocation?.address || '').trim()
      || (String(locationDraft.latitude || '').trim() && String(locationDraft.longitude || '').trim())
    ),
  )
  const marketplaceStatus = String(
    marketplaceVisibilityOverride
    || ownStudioMarketplaceState?.marketplaceStatus
    || ownStudioMarketplaceState?.marketplace_status
    || currentStudio?.marketplaceStatus
    || currentStudio?.marketplace_status
    || currentStudio?.profile?.marketplaceStatus
    || currentStudio?.profile?.marketplace_status
    || '',
  ).toLowerCase()
  const isStudioMarketplacePublished = ['published', 'active', 'visible'].includes(marketplaceStatus)

  const publishMarketplace = async () => {
    if (!currentStudio?.id || !hasMarketplaceMinimumData || isPublishingMarketplace) return

    setIsPublishingMarketplace(true)
    setMarketplaceFeedback({ tone: 'neutral', message: '' })

    try {
      const publishedState = await publishStudioMarketplace(currentStudio.id)
      setMarketplaceVisibilityOverride('visible')
      setOwnStudioMarketplaceState((currentState) => ({
        ...(currentState || {}),
        ...publishedState,
        marketplaceStatus: publishedState.visibilityStatus || publishedState.visibility_status || 'visible',
        marketplace_status: publishedState.visibilityStatus || publishedState.visibility_status || 'visible',
      }))
      await loadAdminArtists?.().catch(() => null)
      setMarketplaceFeedback({ tone: 'success', message: isStudioMarketplacePublished ? 'Publicacion actualizada.' : 'Estudio publicado en Marketplace.' })
    } catch (error) {
      setMarketplaceFeedback({ tone: 'warm', message: error.message || 'No se pudo publicar el estudio.' })
    } finally {
      setIsPublishingMarketplace(false)
    }
  }

  const hideMarketplace = async () => {
    if (!currentStudio?.id || isPublishingMarketplace) return

    setIsPublishingMarketplace(true)
    setMarketplaceFeedback({ tone: 'neutral', message: '' })

    try {
      const hiddenState = await hideStudioMarketplace(currentStudio.id)
      setMarketplaceVisibilityOverride('hidden')
      setOwnStudioMarketplaceState((currentState) => ({
        ...(currentState || {}),
        ...hiddenState,
        marketplaceStatus: hiddenState.visibilityStatus || hiddenState.visibility_status || 'hidden',
        marketplace_status: hiddenState.visibilityStatus || hiddenState.visibility_status || 'hidden',
      }))
      await loadAdminArtists?.().catch(() => null)
      setMarketplaceFeedback({ tone: 'success', message: 'Estudio oculto del Marketplace.' })
    } catch (error) {
      setMarketplaceFeedback({ tone: 'warm', message: error.message || 'No se pudo ocultar el estudio.' })
    } finally {
      setIsPublishingMarketplace(false)
    }
  }

  const marketingLoadKey = JSON.stringify([currentStudioId, selectedSection])
  const [previousMarketingLoadKey, setPreviousMarketingLoadKey] = useState(null)
  if (previousMarketingLoadKey !== marketingLoadKey) {
    setPreviousMarketingLoadKey(marketingLoadKey)
    setIsStudioMarketingLoading(Boolean(currentStudioId && selectedSection === 'marketplace'))
  }
  useEffect(() => {
    if (!currentStudioId || selectedSection !== 'marketplace') return undefined
    let active = true
    const requestId = studioMarketingRequestRef.current + 1
    studioMarketingRequestRef.current = requestId
    async function load() {
    try {
      const settings = await fetchStudioMarketingSettings({ studioId: currentStudioId })
      if (!active || requestId !== studioMarketingRequestRef.current) return

      const happyHourRules = settings.happyHour?.rules || {}
      setStudioMarketingSettings(settings)
      setStudioHappyHourDraft({
        discountPercent: Number(happyHourRules.discountPercent || 10),
        weekdays: Array.isArray(happyHourRules.weekdays) ? happyHourRules.weekdays.map(Number) : [1, 2, 3, 4, 5],
        startTime: happyHourRules.startTime || '14:00',
        endTime: happyHourRules.endTime || '17:00',
      })
      setStudioMarketingFeedback({ tone: 'neutral', message: '' })
    } catch (error) {
      if (active) setStudioMarketingFeedback({ tone: 'warm', message: error.message || 'No se pudo cargar Marketplace.' })
    } finally {
      if (active) setIsStudioMarketingLoading(false)
    }
    }
    load()
    return () => { active = false }
  }, [currentStudioId, selectedSection])

  const updateStudioMarketingSettings = (settings, fallbackMessage = 'Marketplace actualizado.') => {
    setStudioMarketingSettings(settings)
    setStudioMarketingFeedback({ tone: 'success', message: fallbackMessage })
  }

  const toggleStudioFlowPointsEnabled = async () => {
    const nextActive = !studioFlowPointsEnabled
    const previousSettings = studioMarketingSettings
    setIsStudioMarketingSaving(true)
    setStudioMarketingSettings((current) => ({ ...current, flowPointsEnabled: nextActive }))

    try {
      const settings = await setStudioFlowPointsEnabled({ active: nextActive, studioId: currentStudio.id })
      updateStudioMarketingSettings(settings, nextActive ? 'Flow Points activos para el estudio.' : 'Flow Points pausados para el estudio.')
    } catch (error) {
      setStudioMarketingSettings(previousSettings)
      setStudioMarketingFeedback({ tone: 'warm', message: error.message || 'No se pudo actualizar Flow Points.' })
    } finally {
      setIsStudioMarketingSaving(false)
    }
  }

  const selectStudioFlowPointsRewardPercentage = async (percentage) => {
    const previousSettings = studioMarketingSettings
    setIsStudioMarketingSaving(true)
    setStudioMarketingSettings((current) => ({ ...current, flowPointsRewardPercentage: percentage }))
    try {
      const settings = await setStudioFlowPointsRewardPercentage({ percentage, studioId: currentStudio.id })
      updateStudioMarketingSettings(settings, `Recompensa automatica configurada en ${percentage}%.`)
    } catch (error) {
      setStudioMarketingSettings(previousSettings)
      setStudioMarketingFeedback({ tone: 'warm', message: error.message || 'No se pudo actualizar la recompensa.' })
    } finally {
      setIsStudioMarketingSaving(false)
    }
  }

  const selectStudioFlowPointsMaxDiscountPercentage = async (percentage) => {
    const previousSettings = studioMarketingSettings
    setIsStudioMarketingSaving(true)
    setStudioMarketingSettings((current) => ({ ...current, flowPointsMaxDiscountPercentage: percentage }))
    try {
      const settings = await setStudioFlowPointsMaxDiscountPercentage({ percentage, studioId: currentStudio.id })
      updateStudioMarketingSettings(settings, `Descuento maximo configurado en ${percentage}%.`)
    } catch (error) {
      setStudioMarketingSettings(previousSettings)
      setStudioMarketingFeedback({ tone: 'warm', message: error.message || 'No se pudo actualizar el descuento maximo.' })
    } finally { setIsStudioMarketingSaving(false) }
  }

  const toggleStudioDoublePoints = async () => {
    const nextActive = !studioDoublePointsActive
    const previousSettings = studioMarketingSettings
    setIsStudioMarketingSaving(true)
    setStudioMarketingSettings((current) => ({
      ...current,
      doublePoints: {
        ...(current.doublePoints || {}),
        status: nextActive ? 'active' : 'paused',
        rules: { ...(current.doublePoints?.rules || {}), multiplier: 2 },
      },
    }))

    try {
      const settings = await setStudioDoublePointsPromotion({ active: nextActive, studioId: currentStudio.id })
      updateStudioMarketingSettings({
        ...settings,
        doublePoints: {
          ...(settings.doublePoints || {}),
          type: 'double_points',
          name: 'Puntos dobles',
          status: nextActive ? 'active' : 'paused',
          rules: { ...(settings.doublePoints?.rules || {}), multiplier: 2 },
        },
      }, nextActive ? 'Puntos dobles activos para el estudio.' : 'Puntos dobles pausados.')
    } catch (error) {
      setStudioMarketingSettings(previousSettings)
      setStudioMarketingFeedback({ tone: 'warm', message: error.message || 'No se pudo actualizar puntos dobles.' })
    } finally {
      setIsStudioMarketingSaving(false)
    }
  }

  const toggleStudioHappyHourDay = (weekday) => {
    setStudioHappyHourDraft((draft) => ({
      ...draft,
      weekdays: draft.weekdays.includes(weekday)
        ? draft.weekdays.filter((day) => day !== weekday)
        : [...draft.weekdays, weekday].sort((first, second) => first - second),
    }))
  }

  const saveStudioHappyHour = async (active = true) => {
    const previousSettings = studioMarketingSettings
    setIsStudioMarketingSaving(true)
    setStudioMarketingSettings((current) => ({
      ...current,
      happyHour: {
        ...(current.happyHour || {}),
        status: active ? 'active' : 'paused',
        rules: studioHappyHourDraft,
      },
    }))

    try {
      const settings = await saveStudioHappyHourPromotion({ ...studioHappyHourDraft, active, studioId: currentStudio.id })
      updateStudioMarketingSettings({
        ...settings,
        happyHour: {
          ...(settings.happyHour || {}),
          type: 'happy_hour',
          name: 'Happy Hour',
          status: active ? 'active' : 'paused',
          rules: studioHappyHourDraft,
        },
      }, active ? 'Happy Hour actualizado para el estudio.' : 'Happy Hour pausado.')
    } catch (error) {
      setStudioMarketingSettings(previousSettings)
      setStudioMarketingFeedback({ tone: 'warm', message: error.message || 'No se pudo guardar Happy Hour.' })
    } finally {
      setIsStudioMarketingSaving(false)
    }
  }

  const resetArtistSearch = () => {
    setSearchedArtist(null)
    setArtistSearchStatus({ tone: 'neutral', message: '' })
  }

  const searchArtistByEmail = async () => {
    const email = inviteEmail.trim().toLowerCase()

    if (!email) {
      setArtistSearchStatus({ tone: 'warm', message: 'Agrega el correo de la artista.' })
      setSearchedArtist(null)
      return
    }

    setIsArtistSearchLoading(true)
    setArtistSearchStatus({ tone: 'neutral', message: '' })
    setSearchedArtist(null)

    try {
      const artist = await findStudioArtistByEmail({
        studioId: currentStudio.id,
        email,
      })

      if (!artist) {
        setArtistSearchStatus({ tone: 'warm', message: 'No se encontro una artista registrada con ese correo.' })
        return
      }

      setSearchedArtist(artist)
      setArtistSearchStatus({ tone: 'success', message: 'Artista encontrada.' })
      if (artist.alreadyMember) {
        await loadStudioMemberships({ silent: true })
      }
    } catch (error) {
      setArtistSearchStatus({ tone: 'warm', message: error.message || 'No se pudo buscar la artista.' })
    } finally {
      setIsArtistSearchLoading(false)
    }
  }

  const inviteArtist = async () => {
    if (isMembershipsLoading) return

    const email = searchedArtist?.email || inviteEmail

    if (!String(email || '').trim()) {
      setMembershipFeedback({ tone: 'warm', message: 'Busca una artista registrada por correo antes de invitar.' })
      return
    }

    if (!searchedArtist?.id) {
      setMembershipFeedback({ tone: 'warm', message: 'Busca una artista registrada por correo antes de invitar.' })
      return
    }

    if (searchedArtist.alreadyMember) {
      setMembershipFeedback({ tone: 'warm', message: 'Esta artista ya pertenece al estudio.' })
      return
    }

    setIsMembershipsLoading(true)
    setMembershipFeedback({ tone: 'neutral', message: '' })

    try {
      const payload = await inviteStudioArtist({
        studioId: currentStudio.id,
        email,
        artistId: searchedArtist.id,
      })
      setMembershipState(payload)
      await loadStudioMemberships({ silent: true })
      setInviteEmail('')
      resetArtistSearch()
      setMembershipFeedback({
        tone: 'success',
        message: payload.lastInvitation?.token
          ? `Invitacion creada. Token: ${payload.lastInvitation.token}`
          : 'Invitacion creada.',
      })
    } catch (error) {
      setMembershipFeedback({ tone: 'warm', message: error.message || 'No se pudo invitar a la artista.' })
    } finally {
      setIsMembershipsLoading(false)
    }
  }

  const cancelInvitation = async (invitationId) => {
    if (!invitationId || isMembershipsLoading) return

    setIsMembershipsLoading(true)
    setMembershipFeedback({ tone: 'neutral', message: '' })

    try {
      const payload = await cancelStudioArtistInvitation(invitationId)
      setMembershipState(payload)
      await loadStudioMemberships({ silent: true })
      setMembershipFeedback({ tone: 'success', message: 'Invitacion cancelada.' })
    } catch (error) {
      setMembershipFeedback({ tone: 'warm', message: error.message || 'No se pudo cancelar la invitacion.' })
    } finally {
      setIsMembershipsLoading(false)
    }
  }

  const unlinkArtist = async (membership) => {
    const membershipId = getMembershipRecordId(membership)
    if (!membershipId || !currentStudioId || unlinkingMembershipId) return

    setUnlinkingMembershipId(membershipId)
    setMembershipFeedback({ tone: 'neutral', message: '' })
    try {
      const payload = await unlinkStudioArtist({ studioId: currentStudioId, membershipId })
      setMembershipState(payload)
      setUnlinkedMembershipIds((currentValue) => [...new Set([...currentValue, membershipId])])
      setMembershipOperationsById((currentValue) => {
        const nextValue = { ...currentValue }
        delete nextValue[membershipId]
        return nextValue
      })
      setExpandedMembershipId('')
      setPendingUnlinkMembership(null)
      await loadAdminArtists?.().catch(() => null)
      setMembershipFeedback({ tone: 'success', message: 'Artista desvinculada del estudio.' })
    } catch (error) {
      setMembershipFeedback({ tone: 'warm', message: error.message || 'No se pudo desvincular a la artista.' })
    } finally {
      setUnlinkingMembershipId('')
    }
  }

  const openMembershipServiceEditor = async (membership) => {
    const membershipId = getMembershipRecordId(membership)
    if (!membershipId) return

    const operations = membershipOperationsById[membershipId] || await loadMembershipOperations(membershipId)
    if (!operations) return

    setExpandedMembershipId(membershipId)
    setEditingMembershipId(membershipId)
    setMembershipServiceDrafts(Object.fromEntries((operations.services || []).map((service) => [
      service.id,
      {
        name: service.name,
        durationMinutes: service.durationMinutes,
        price: service.price,
      },
    ])))
  }

  const updateMembershipServiceDraft = (serviceId, field, value) => {
    setMembershipServiceDrafts((currentValue) => ({
      ...currentValue,
      [serviceId]: { ...currentValue[serviceId], [field]: value },
    }))
  }

  const saveMembershipService = async (membershipId, serviceId) => {
    const draft = membershipServiceDrafts[serviceId]
    if (!draft || savingMembershipServiceId) return

    setSavingMembershipServiceId(serviceId)
    setMembershipFeedback({ tone: 'neutral', message: '' })
    try {
      await updateStudioMembershipService({
        studioId: currentStudioId,
        membershipId,
        serviceId,
        name: draft.name,
        durationMinutes: Number(draft.durationMinutes),
        price: Number(draft.price),
      })
      await loadMembershipOperations(membershipId)
      setMembershipFeedback({ tone: 'success', message: 'Servicio actualizado para el estudio.' })
    } catch (error) {
      setMembershipFeedback({ tone: 'warm', message: error.message || 'No se pudo actualizar el servicio.' })
    } finally {
      setSavingMembershipServiceId('')
    }
  }

  const toggleMembershipOperations = async (membershipId) => {
    const nextExpandedId = expandedMembershipId === membershipId ? '' : membershipId
    setExpandedMembershipId(nextExpandedId)

    if (nextExpandedId && !membershipOperationsById[nextExpandedId]) {
      await loadMembershipOperations(nextExpandedId)
    }
  }

  const updateOwnerAppointmentDraft = (patch) => {
    setOwnerAppointmentDraft((currentDraft) => ({
      ...currentDraft,
      ...patch,
    }))
    setOwnerAppointmentFeedback({ tone: 'neutral', message: '' })
    if (Object.prototype.hasOwnProperty.call(patch, 'clientSearch')) {
      setOwnerClientResults([])
      setOwnerClientSearchStatus({ tone: 'neutral', message: '' })
    }
  }

  const openOwnerAppointmentModal = async ({ membership = null, slot = null, client = null } = {}) => {
    const normalizedClient = client ? normalizeOwnerClient(client) : null
    const fallbackMembership = membership || operationalMemberships[0] || null
    const membershipId = getMembershipRecordId(fallbackMembership)

    setOwnerAppointmentDraft({
      ...emptyOwnerAppointmentDraft,
      clientSearch: normalizedClient?.name || normalizedClient?.email || '',
      clientId: normalizedClient?.id || '',
      clientName: normalizedClient?.name || '',
      clientPhone: normalizedClient?.phone || '',
      clientEmail: normalizedClient?.email || '',
      membershipId,
      date: slot?.date || '',
      availabilitySlotId: '',
    })
    setOwnerClientResults(normalizedClient ? [normalizedClient] : [])
    setOwnerClientSearchStatus({ tone: 'neutral', message: '' })
    setOwnerAppointmentFeedback({ tone: 'neutral', message: '' })
    setIsOwnerAppointmentOpen(true)

    if (membershipId && !membershipOperationsById[membershipId]) {
      await loadMembershipOperations(membershipId).catch(() => null)
    }

    window.setTimeout(() => {
      ownerAppointmentFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
  }

  const closeOwnerAppointmentModal = () => {
    if (isOwnerAppointmentSaving) return

    setIsOwnerAppointmentOpen(false)
    setOwnerAppointmentDraft(emptyOwnerAppointmentDraft)
    setOwnerAppointmentFeedback({ tone: 'neutral', message: '' })
    setOwnerClientResults([])
    setOwnerClientSearchStatus({ tone: 'neutral', message: '' })
  }

  const searchOwnerClients = async () => {
    const query = ownerAppointmentDraft.clientSearch.trim()

    if (!query) {
      setOwnerClientResults([])
      setOwnerClientSearchStatus({ tone: 'neutral', message: 'Ingresa nombre o correo para buscar.' })
      return
    }

    setIsOwnerClientSearchLoading(true)
    setOwnerClientSearchStatus({ tone: 'neutral', message: '' })

    try {
      const exactMatch = await findStudioOwnerExistingClient({
        studioId: currentStudio.id,
        phone: query.replace(/\D/g, '').length >= 10 ? query : '',
        email: query.includes('@') ? query : '',
      })
      const clients = exactMatch ? [exactMatch] : await searchStudioOwnerClients({ studioId: currentStudio.id, query, limit: 5 })
      setOwnerClientResults(clients.map(normalizeOwnerClient))
      setOwnerClientSearchStatus(clients.length === 0 ? { tone: 'neutral', message: 'No se encontraron clientas con ese nombre o correo.' } : { tone: 'neutral', message: '' })
    } catch (error) {
      setOwnerClientResults([])
      setOwnerClientSearchStatus({ tone: 'warm', message: error.message || 'No se pudo buscar clientas.' })
    } finally {
      setIsOwnerClientSearchLoading(false)
    }
  }

  const saveOwnerAppointment = async () => {
    if (isOwnerAppointmentSaving) return

    if (!currentStudio?.id || !ownerAppointmentDraft.membershipId || !ownerAppointmentDraft.serviceOfferingId || !ownerAppointmentDraft.availabilitySlotId) {
      setOwnerAppointmentFeedback({ tone: 'warm', message: 'Selecciona artista, servicio y horario disponible.' })
      return
    }

    if (!ownerAppointmentDraft.clientId && (!ownerAppointmentDraft.clientName.trim() || !ownerAppointmentDraft.clientPhone.trim())) {
      setOwnerAppointmentFeedback({ tone: 'warm', message: 'Agrega nombre y telefono para crear clienta rapida.' })
      return
    }

    setIsOwnerAppointmentSaving(true)
    setOwnerAppointmentFeedback({ tone: 'neutral', message: '' })

    try {
      const booking = await createStudioOwnerAppointment({
        studioId: currentStudio.id,
        membershipId: ownerAppointmentDraft.membershipId,
        serviceOfferingId: ownerAppointmentDraft.serviceOfferingId,
        availabilitySlotId: ownerAppointmentDraft.availabilitySlotId,
        clientId: ownerAppointmentDraft.clientId,
        clientName: ownerAppointmentDraft.clientName,
        clientPhone: ownerAppointmentDraft.clientPhone,
        clientEmail: ownerAppointmentDraft.clientEmail,
        notes: ownerAppointmentDraft.notes,
      })
      await loadMembershipOperations(ownerAppointmentDraft.membershipId)
      await loadStudioOwnerAppointments()
      await loadAdminClients?.().catch(() => null)
      setOwnerAppointmentFeedback({ tone: 'success', message: booking.requiresConfirmation
        ? 'Horario apartado. La clienta recibirá un aviso privado para confirmar la cita desde Studio Flow.'
        : 'Cita creada y horario reservado.' })
      setIsOwnerAppointmentOpen(false)
      setOwnerAppointmentDraft(emptyOwnerAppointmentDraft)
    } catch (error) {
      const message = error.message || 'No se pudo crear la cita.'
      if (/horario|slot|agenda|time is not available|available slot/i.test(message)) {
        setOwnerAppointmentDraft((draft) => ({ ...draft, availabilitySlotId: '' }))
        setOwnerAvailabilityRefresh((revision) => revision + 1)
        setOwnerAppointmentFeedback({ tone: 'warm', message: 'Ese horario acaba de dejar de estar disponible. Elige uno de los horarios actualizados.' })
      } else {
        setOwnerAppointmentFeedback({ tone: 'warm', message })
      }
    } finally {
      setIsOwnerAppointmentSaving(false)
    }
  }

  const routedAppointment = location.state?.ownerAppointment || null
  const [handledAppointmentRoute, setHandledAppointmentRoute] = useState(null)
  const [routedMembershipRequest, setRoutedMembershipRequest] = useState(null)
  if (routedAppointment && handledAppointmentRoute !== location.key && currentStudioId && !isMembershipsLoading) {
    const client = routedAppointment.client ? normalizeOwnerClient(routedAppointment.client) : null
    const membershipId = getMembershipRecordId(operationalMemberships[0] || null)
    setHandledAppointmentRoute(location.key)
    setOwnerAppointmentDraft({
      ...emptyOwnerAppointmentDraft,
      clientSearch: client?.name || client?.email || '',
      clientId: client?.id || '',
      clientName: client?.name || '',
      clientPhone: client?.phone || '',
      clientEmail: client?.email || '',
      membershipId,
    })
    setOwnerClientResults(client ? [client] : [])
    setOwnerClientSearchStatus({ tone: 'neutral', message: '' })
    setOwnerAppointmentFeedback({ tone: 'neutral', message: '' })
    setIsOwnerAppointmentOpen(true)
    setRoutedMembershipRequest(membershipId && !membershipOperationsById[membershipId]
      ? { studioId: currentStudioId, membershipId } : null)
  }

  useEffect(() => {
    if (!routedAppointment || handledAppointmentRoute !== location.key) return
    navigate(`${paths.adminStudio}?section=schedule`, { replace: true, state: null })
    ownerAppointmentFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [routedAppointment, handledAppointmentRoute, location.key, navigate])

  useEffect(() => {
    if (!routedMembershipRequest || routedMembershipRequest.studioId !== currentStudioId) return undefined
    let active = true
    fetchStudioMembershipOperations(routedMembershipRequest)
      .then((payload) => {
        if (active) setMembershipOperationsById((current) => ({
          ...current,
          [routedMembershipRequest.membershipId]: payload,
        }))
      })
      .catch((error) => {
        if (active) setOwnerAppointmentFeedback({ tone: 'warm', message: error.message || 'No se pudo cargar la disponibilidad.' })
      })
    return () => { active = false }
  }, [routedMembershipRequest, currentStudioId])

  if (!currentStudio?.id) {
    return (
      <main className="dashboard-grid admin-grid profile-foundation-grid">
        <Card className="wide-card mobile-screen primary-panel">
          <div className="profile-foundation-stack">
            <section className="profile-foundation-card">
              <div>
                <span className="eyebrow">Studio owner</span>
                <h3>Aun no tienes un estudio registrado.</h3>
                <p>Primero crea tu estudio desde el dashboard para poder completar perfil, ubicacion y branding.</p>
              </div>
              <Button onClick={() => navigate(paths.admin)}>Ir al dashboard</Button>
            </section>
          </div>
        </Card>
      </main>
    )
  }

  const renderOwnerAppointmentForm = (inline = true) => (
    <div ref={ownerAppointmentFormRef}>
      <OwnerAppointmentModal
        clients={modalClientResults}
        clientSearchStatus={ownerClientSearchStatus}
        currentStudio={currentStudio}
        draft={ownerAppointmentDraft}
        feedback={ownerAppointmentFeedback}
        inline={inline}
        isClientSearchLoading={isOwnerClientSearchLoading}
        isSaving={isOwnerAppointmentSaving}
        membershipOperationsById={membershipOperationsById}
        memberships={displayedTeamMemberships}
        onClose={closeOwnerAppointmentModal}
        onDraftChange={updateOwnerAppointmentDraft}
        onSearchClients={searchOwnerClients}
        onSave={saveOwnerAppointment}
        availabilityRefresh={ownerAvailabilityRefresh}
      />
    </div>
  )

  return (
    <main className="dashboard-grid admin-grid profile-foundation-grid">
      <PendingPointsNotice appointments={pendingAppointmentPoints(studioOwnerAppointments, now)} audience="business" onOpen={() => navigate(`${paths.adminStudio}?section=schedule&pendientes=1`)} />
      <Card className="wide-card mobile-screen primary-panel studio-owner-screen-card">
        <div className="profile-foundation-stack">
          {confirmationFeedback.message && (
            <div className="list-row elevated-row">
              <div>
                <strong>{confirmationFeedback.tone === 'success' ? 'Confirmaciones enviadas' : 'No se pudo enviar'}</strong>
                <small>{confirmationFeedback.message}</small>
              </div>
              <StatusPill tone={confirmationFeedback.tone === 'success' ? 'success' : 'neutral'}>
                Aviso
              </StatusPill>
            </div>
          )}
          {selectedSection === 'summary' && (
            <StudioSummarySection
              activeMemberships={operationalMemberships}
              currentStudio={currentStudio}
              membershipOperationsById={membershipOperationsById}
              navigate={navigate}
              onCancelAppointment={cancelStudioAppointment}
              onRequestConfirmations={sendStudioConfirmationRequests}
              ownerAppointments={ownerAppointments}
              ownStudio={ownStudioMarketplaceState}
              profileDraft={profileDraft}
              cancellingAppointmentId={cancellingAppointmentId}
            />
          )}

          {selectedSection === 'settings' && (
            <StudioSettingsSection studioName={profileDraft.commercialName || currentStudio?.name} studioLogo={profileDraft.logoUrl}>
          <BusinessPaymentSettings scopeType="studio" scopeId={currentStudioId} />
          <StudioOperatingHours studioId={currentStudio?.id} />
          <section className="profile-foundation-card studio-profile-identity">
            <div>
              <span className="eyebrow">TU ESPACIO</span>
              <h3>Lo que hace especial a tu estudio</h3>
              <small>Cuéntales a tus clientas qué van a sentir al entrar y por qué les encantará volver.</small>
            </div>
            <Input
              label="Nombre de tu estudio"
              value={profileDraft.commercialName}
              onChange={(event) => updateProfileField('commercialName', event.target.value)}
            />
            <label className="input-field">
              <span>Tu historia y tu esencia</span>
              <textarea
                value={profileDraft.description}
                onChange={(event) => updateProfileField('description', event.target.value)}
                placeholder="Háblales de tu espacio, de tu equipo y de cómo cuidan cada visita."
                rows="4"
              />
            </label>
            <div className="location-form-grid">
              <Input
                label="Telefono"
                value={profileDraft.phone}
                onChange={(event) => updateProfileField('phone', event.target.value)}
              />
              <Input
                label="Correo electronico"
                type="email"
                value={profileDraft.email}
                onChange={(event) => updateProfileField('email', event.target.value)}
              />
            </div>
            <label className="input-field">
              <span>Cómo presentar tus horarios</span>
              <textarea
                value={profileDraft.hours}
                onChange={(event) => updateProfileField('hours', event.target.value)}
                placeholder="Por ejemplo: un momento para ti, de lunes a sábado."
                rows="3"
              />
              <small>Este texto se muestra en tu perfil; las reservas respetan el horario que configuraste arriba.</small>
            </label>
            <div className="owner-studio-social-editor">
              <strong>Conecta también fuera del estudio</strong>
              <small>Agrega tus redes para que puedan descubrir tu trabajo con un toque.</small>
              <div className="location-form-grid">
                {[
                  ['whatsapp', 'WhatsApp'],
                  ['instagram', 'Instagram'],
                  ['facebook', 'Facebook'],
                  ['tiktok', 'TikTok'],
                ].map(([field, label]) => (
                  <Input
                    key={field}
                    label={label}
                    value={profileDraft.contactLinks?.[field] || ''}
                    onChange={(event) => updateProfileContactLink(field, event.target.value)}
                  />
                ))}
              </div>
            </div>
          </section>

          <section className="profile-foundation-card studio-profile-logo-story">
            <div>
              <span className="eyebrow">TU SELLO</span>
              <h3>La imagen que recordarán</h3>
              <small>Tu logo acompaña la primera impresión de tu estudio.</small>
            </div>
            <div className="studio-logo-row">
              <div className="studio-logo-preview">
                {profileDraft.logoUrl ? (
                  <img src={profileDraft.logoUrl} alt={`Logo de ${profileDraft.commercialName}`} />
                ) : (
                  <span>{(profileDraft.commercialName || 'SF').slice(0, 2)}</span>
                )}
              </div>
              <div className="artist-photo-actions">
                <label className="button button-ghost button-sm" htmlFor="studio-logo-input">
                  {profileDraft.logoUrl ? 'Actualizar logo' : 'Subir logo'}
                </label>
                <input
                  accept="image/*"
                  className="visually-hidden"
                  id="studio-logo-input"
                  type="file"
                  onChange={handleLogoChange}
                />
                {profileDraft.logoUrl && (
                  <button type="button" onClick={() => updateProfileField('logoUrl', '')}>Eliminar logo</button>
                )}
              </div>
            </div>
          </section>

          <section className="profile-foundation-card studio-profile-location-story">
            <div>
              <span className="eyebrow">ENCUÉNTRAME</span>
              <h3>Haz fácil llegar a ti</h3>
              <small>Una dirección clara ayuda a que cada clienta llegue tranquila a su cita.</small>
            </div>
            <Input
              label="Nombre comercial"
              value={profileDraft.commercialName}
              onChange={(event) => updateProfileField('commercialName', event.target.value)}
            />
            <Input
              helper={locationErrors.address}
              label="Direccion"
              value={locationDraft.address}
              onChange={(event) => updateLocationField('address', event.target.value)}
            />
            <div className="location-form-grid">
              <Input
                helper={locationErrors.city}
                label="Ciudad"
                value={locationDraft.city}
                onChange={(event) => updateLocationField('city', event.target.value)}
              />
              <Input
                helper={locationErrors.state}
                label="Estado"
                value={locationDraft.state}
                onChange={(event) => updateLocationField('state', event.target.value)}
              />
            </div>
            <div className="location-form-grid">
              <Input
                label="Codigo Postal"
                value={locationDraft.postalCode}
                onChange={(event) => updateLocationField('postalCode', event.target.value)}
              />
              <Input
                helper={locationErrors.latitude || 'Puedes ajustar manualmente las coordenadas si el punto no es exacto.'}
                label="Latitud"
                value={locationDraft.latitude}
                onChange={(event) => updateLocationField('latitude', event.target.value)}
              />
            </div>
            {mediaFeedback.message && <StatusPill tone={mediaFeedback.tone}>{mediaFeedback.message}</StatusPill>}
            <Input
              helper="Puedes ajustar manualmente las coordenadas si el punto no es exacto."
              label="Longitud"
              value={locationDraft.longitude}
              onChange={(event) => updateLocationField('longitude', event.target.value)}
            />
            <div className="location-detection-row">
              <Button
                disabled={locationDetection.status === 'loading'}
                size="sm"
                variant="ghost"
                onClick={useCurrentLocation}
              >
                {locationDetection.status === 'loading' ? 'Detectando...' : '📍 Usar mi ubicacion actual'}
              </Button>
              {locationDetection.message && (
                <small className={`location-detection-message location-detection-${locationDetection.status}`}>
                  {locationDetection.message}
                </small>
              )}
            </div>
            {locationHasCoordinates && (
              <div className="location-detection-row">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => window.open(mapsUrl, '_blank', 'noopener,noreferrer')}
                >
                  Ver ubicacion en Google Maps
                </Button>
                <label className="location-toggle-row">
                  <input
                    checked={isStudioLocationConfirmed}
                    type="checkbox"
                    onChange={(event) => setIsStudioLocationConfirmed(event.target.checked)}
                  />
                  <span>Confirmo que esta ubicacion corresponde a mi estudio.</span>
                </label>
              </div>
            )}
            <label className="input-field">
              <span>Referencias</span>
              <textarea
                value={locationDraft.address_references}
                onChange={(event) => updateLocationField('address_references', event.target.value)}
                rows="3"
              />
            </label>
            <small className="location-helper-text">
              Google Maps: {mapsUrl || 'Completa direccion, ciudad y estado para generar la URL base.'}
            </small>
          </section>

          <section className="profile-foundation-card studio-profile-gallery-story">
            <div className="studio-gallery-heading">
              <div>
                <span className="eyebrow">UN VISTAZO A TU ESPACIO</span>
                <h3>Invítalas a conocerte</h3>
                <small>Muestra la bienvenida, los espacios y los detalles que hacen especial cada visita.</small>
                <small>Incluye solo fotos de tus instalaciones y áreas de atención.</small>
              </div>
              <span className="studio-gallery-counter">{galleryCount}/{galleryLimit} fotos</span>
            </div>
            <div className="studio-gallery-grid">
              {(profileDraft.gallery || []).map((image) => (
                <article className="studio-gallery-item" key={image.id}>
                  <img src={image.url} alt={image.label || 'Foto del estudio'} />
                  <button type="button" onClick={() => removeGalleryImage(image.id)}>Quitar</button>
                </article>
              ))}
              <label className={`studio-gallery-upload${hasGalleryCapacity ? '' : ' is-disabled'}`} htmlFor={hasGalleryCapacity ? 'studio-gallery-input' : undefined}>
                <span>{hasGalleryCapacity ? 'Agregar foto' : 'Límite alcanzado'}</span>
                <small>{galleryCount}/{galleryLimit} fotos</small>
              </label>
            </div>
            {!hasGalleryCapacity && (
              <small className="studio-gallery-limit-message">
                Has alcanzado el límite máximo de 5 fotografías.
              </small>
            )}
            <input
              accept="image/*"
              disabled={!hasGalleryCapacity}
              className="visually-hidden"
              id="studio-gallery-input"
              multiple
              type="file"
              onChange={handleGalleryChange}
            />
            {mediaFeedback.message && <StatusPill tone={mediaFeedback.tone}>{mediaFeedback.message}</StatusPill>}
          </section>

          <section className="profile-foundation-card">
            <div>
              <span className="eyebrow">QUE TE ENCUENTREN</span>
              <h3>{isStudioMarketplacePublished ? 'Tu estudio ya está a la vista' : 'Abre la puerta a nuevas clientas'}</h3>
              <small>
                {isStudioMarketplacePublished
                  ? 'Tus clientas pueden descubrirte en Studio Flow. Actualiza la publicación cuando cambies tus fotos, ubicación o servicios.'
                  : 'Cuando tu estudio esté aprobado y completes su nombre y ubicación, podrás mostrarlo a nuevas clientas.'}
              </small>
            </div>
            {isStudioMarketplacePublished && <StatusPill tone="success">Publicado</StatusPill>}
            <div className="row-actions">
              <Button
                disabled={!hasMarketplaceMinimumData || isPublishingMarketplace}
                onClick={publishMarketplace}
              >
                {isPublishingMarketplace ? 'Guardando...' : isStudioMarketplacePublished ? 'Actualizar publicacion' : 'Publicar estudio'}
              </Button>
              {isStudioMarketplacePublished && (
                <Button
                  disabled={isPublishingMarketplace}
                  variant="danger"
                  onClick={hideMarketplace}
                >
                  Ocultar estudio
                </Button>
              )}
            </div>
            {!hasMarketplaceMinimumData && (
              <small style={{ color: 'var(--muted)', fontWeight: 800 }}>
                Para publicarlo faltan la aprobación del estudio o los datos de nombre y ubicación.
              </small>
            )}
            {marketplaceFeedback.message && (
              <small style={{ color: marketplaceFeedback.tone === 'success' ? 'var(--success)' : 'var(--rose-dark)', fontWeight: 800 }}>
                {marketplaceFeedback.message}
              </small>
            )}
          </section>

          <section className="profile-foundation-card">
            <div>
              <span className="eyebrow">LO QUE HACE TU EQUIPO</span>
              <h3>Lo que pueden reservar contigo</h3>
              <small>Aquí verás los servicios que tu equipo ofrece dentro de este estudio.</small>
            </div>
            <div className="compact-list">
              {operationalMemberships.flatMap((membership) => (
                (membershipOperationsById[getMembershipRecordId(membership)]?.services || [])
                  .filter((service) => ['active', 'activo'].includes(String(service.status || '').toLowerCase()))
                  .map((service) => (
                    <div className="list-row elevated-row" key={`${membership.id}-${service.id}`}>
                      <div>
                        <strong>{service.name}</strong>
                        <small>{membership.name} / {service.category} / {service.duration || `${service.durationMinutes} min`}</small>
                        <StudioServicePoints service={service} settings={studioMarketingSettings} />
                      </div>
                      <StatusPill tone="success">${service.price}</StatusPill>
                    </div>
                  ))
              ))}
              {operationalMemberships.flatMap((membership) => (
                (membershipOperationsById[getMembershipRecordId(membership)]?.services || [])
                  .filter((service) => ['active', 'activo'].includes(String(service.status || '').toLowerCase()))
              )).length === 0 && (
                <div className="list-row elevated-row">
                  <div>
                    <strong>Tu equipo aún no ha publicado servicios aquí</strong>
                    <small>Cuando una artista agregue sus servicios para este estudio, aparecerán aquí para que las clientas puedan elegirlos.</small>
                  </div>
                  <StatusPill tone="neutral">Pendiente</StatusPill>
                </div>
              )}
            </div>
          </section>
          {profileSaveFeedback.message && <StatusPill tone={profileSaveFeedback.tone}>{profileSaveFeedback.message}</StatusPill>}
          <Button className="full-width studio-profile-save" disabled={isProfileSaving} onClick={saveStudioProfile}>
            {isProfileSaving ? 'Guardando...' : 'Guardar perfil del estudio'}
          </Button>
            </StudioSettingsSection>
          )}

          {selectedSection === 'team' && (
            <StudioTeamSection>
          <section className="profile-foundation-card">
            <div>
              <span className="eyebrow">Equipo</span>
              <h3>Artistas del estudio</h3>
              <small>Invita artistas reales y consulta memberships activas del estudio.</small>
            </div>
            <Button
              disabled={isMembershipsLoading}
              onClick={async () => {
                await loadAdminArtists?.().catch(() => null)
                const payload = await loadStudioMemberships()
                const remoteCount = (payload?.memberships || []).filter(isActiveMembership).length
                const detectedCount = Math.max(remoteCount, operationalMemberships.length)
                setMembershipFeedback({
                  tone: detectedCount > 0 ? 'success' : 'warm',
                  message: detectedCount > 0
                    ? `${detectedCount} artista${detectedCount === 1 ? '' : 's'} vinculada${detectedCount === 1 ? '' : 's'} detectada${detectedCount === 1 ? '' : 's'}.`
                    : 'No se detectaron artistas vinculadas para este estudio.',
                })
              }}
            >
              {isMembershipsLoading ? 'Actualizando...' : 'Actualizar'}
            </Button>
            {membershipFeedback.message && (
              <small style={{ color: membershipFeedback.tone === 'success' ? 'var(--success)' : 'var(--rose-dark)', fontWeight: 800 }}>
                {membershipFeedback.message}
              </small>
            )}
          </section>

          <section className="profile-foundation-card">
                <div>
                  <span className="eyebrow">Invitar artista</span>
                  <h3>Nueva invitacion</h3>
                </div>
                <Input
                  label="Correo electronico de la artista"
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => {
                    setInviteEmail(event.target.value)
                    resetArtistSearch()
                  }}
                />
                <Button disabled={isArtistSearchLoading || isMembershipsLoading} onClick={searchArtistByEmail}>
                  {isArtistSearchLoading ? 'Buscando...' : 'Buscar artista'}
                </Button>
                {artistSearchStatus.message && (
                  <small style={{ color: artistSearchStatus.tone === 'success' ? 'var(--success)' : 'var(--rose-dark)', fontWeight: 800 }}>
                    {artistSearchStatus.message}
                  </small>
                )}
                {searchedArtist && (
                  <div className="list-row elevated-row">
                    <div className="client-photo-preview" style={{ height: 44, width: 44 }}>
                      {searchedArtist.studioPhotoUrl ? (
                        <img src={searchedArtist.studioPhotoUrl} alt={`Foto de ${searchedArtist.name}`} />
                      ) : (
                        <span>{String(searchedArtist.name || 'AR').slice(0, 2).toUpperCase()}</span>
                      )}
                    </div>
                    <div>
                      <strong>{searchedArtist.name}</strong>
                      <small>{searchedArtist.email}</small>
                      <small>Estado: {searchedArtist.status}</small>
                    </div>
                    <StatusPill tone={searchedArtist.alreadyMember ? 'success' : 'neutral'}>
                      {searchedArtist.alreadyMember ? 'Ya vinculada' : 'Disponible'}
                    </StatusPill>
                  </div>
                )}
                <Button disabled={isMembershipsLoading || !searchedArtist || searchedArtist.alreadyMember} onClick={inviteArtist}>
                  {isMembershipsLoading ? 'Procesando...' : 'Invitar artista'}
                </Button>
                {membershipFeedback.message && selectedSection !== 'team' && (
                  <small style={{ color: membershipFeedback.tone === 'success' ? 'var(--success)' : 'var(--rose-dark)', fontWeight: 800 }}>
                    {membershipFeedback.message}
                  </small>
                )}
          </section>

          <section className="profile-foundation-card">
                <div>
                  <span className="eyebrow">Memberships</span>
                  <h3>Artistas vinculadas</h3>
                </div>
                <div className="compact-list">
                  {displayedTeamMemberships.map((membership) => {
                    const membershipRecordId = getMembershipRecordId(membership)
                    const operations = membershipOperationsById[membershipRecordId]
                    const isExpanded = expandedMembershipId === membershipRecordId
                    const isLoadingOperations = membershipOperationsLoadingId === membershipRecordId

                    return (
                      <div className="elevated-row owner-team-agenda-card" key={membershipRecordId || membership.id}>
                        <div className="list-row owner-team-member-header" style={{ padding: 0 }}>
                          <div className="client-photo-preview" style={{ height: 44, width: 44 }}>
                            {membership.studioPhotoUrl ? (
                              <img src={membership.studioPhotoUrl} alt={`Foto de ${membership.name}`} />
                            ) : (
                              <span>{String(membership.name || 'AR').slice(0, 2).toUpperCase()}</span>
                            )}
                          </div>
                          <div>
                            <strong>{membership.name}</strong>
                            <small>{membership.email || 'Correo no disponible'}</small>
                            <small>Incorporacion: {membership.startedAt || membership.createdAt || 'Pendiente'}</small>
                          </div>
                          <Button
                            className="owner-unlink-button"
                            disabled={unlinkingMembershipId === membershipRecordId}
                            size="sm"
                            variant="danger"
                            onClick={() => setPendingUnlinkMembership(membership)}
                          >
                            Desvincular
                          </Button>
                          <div className="studio-review-actions owner-team-resource-actions">
                            <Button
                              disabled={isLoadingOperations}
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingMembershipId('')
                                toggleMembershipOperations(membershipRecordId)
                              }}
                            >
                              {isLoadingOperations ? 'Cargando...' : isExpanded ? 'Ocultar' : 'Ver recursos'}
                            </Button>
                            <Button
                              disabled={isLoadingOperations}
                              size="sm"
                              variant="ghost"
                              onClick={() => openMembershipServiceEditor(membership)}
                            >
                              Editar servicios
                            </Button>
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="compact-list" style={{ marginTop: 14 }}>
                            {(operations?.services || [])
                              .filter((service) => ['active', 'activo'].includes(String(service.status || '').toLowerCase()))
                              .map((service) => {
                                const serviceDraft = membershipServiceDrafts[service.id] || {
                                  name: service.name,
                                  durationMinutes: service.durationMinutes,
                                  price: service.price,
                                }
                                const isEditingService = editingMembershipId === membershipRecordId

                                return (
                                  <div className="list-row elevated-row owner-membership-service-row" key={service.id}>
                                    {isEditingService ? (
                                      <div className="owner-membership-service-editor">
                                        <Input label="Servicio" value={serviceDraft.name} onChange={(event) => updateMembershipServiceDraft(service.id, 'name', event.target.value)} />
                                        <Input label="Duracion en minutos" min="1" type="number" value={serviceDraft.durationMinutes} onChange={(event) => updateMembershipServiceDraft(service.id, 'durationMinutes', event.target.value)} />
                                        <Input label="Costo" min="0" step="0.01" type="number" value={serviceDraft.price} onChange={(event) => updateMembershipServiceDraft(service.id, 'price', event.target.value)} />
                                        <Button disabled={savingMembershipServiceId === service.id} size="sm" onClick={() => saveMembershipService(membershipRecordId, service.id)}>
                                          {savingMembershipServiceId === service.id ? 'Guardando...' : 'Guardar cambios'}
                                        </Button>
                                      </div>
                                    ) : (
                                      <div>
                                        <strong>{service.name}</strong>
                                        <small>{service.category} / {service.duration || `${service.durationMinutes} min`}</small>
                                        <StudioServicePoints service={service} settings={studioMarketingSettings} />
                                      </div>
                                    )}
                                    {!isEditingService && <strong className="owner-membership-service-price">${service.price}</strong>}
                                  </div>
                                )
                              })}
                            {operations && operations.services.filter((service) => ['active', 'activo'].includes(String(service.status || '').toLowerCase())).length === 0 && (
                              <div className="list-row elevated-row">
                                <div>
                                  <strong>Sin servicios activos</strong>
                                  <small>La artista aun no tiene servicios activos en este estudio.</small>
                                </div>
                                <StatusPill tone="neutral">Lectura</StatusPill>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {!isMembershipsLoading && displayedTeamMemberships.length === 0 && (
                    <div className="list-row elevated-row">
                      <div>
                        <strong>Sin artistas vinculadas</strong>
                        <small>Las artistas apareceran aqui cuando acepten su token.</small>
                      </div>
                      <StatusPill tone="neutral">Vacio</StatusPill>
                    </div>
                  )}
                </div>
          </section>

          <section className="profile-foundation-card">
                <div>
                  <span className="eyebrow">Pendientes</span>
                  <h3>Invitaciones pendientes</h3>
                </div>
                <div className="compact-list">
                  {membershipState.invitations.map((invitation) => (
                    <div className="list-row elevated-row" key={invitation.id}>
                      <div>
                        <strong>{invitation.artistName || invitation.invitedEmail}</strong>
                        <small>{invitation.invitedEmail}</small>
                        <small>Token: {invitation.token}</small>
                        <small>Expira: {invitation.expiresAt || '14 dias'}</small>
                      </div>
                      <div className="studio-review-actions">
                        <StatusPill tone="pending">Pendiente</StatusPill>
                        <Button
                          disabled={isMembershipsLoading}
                          size="sm"
                          variant="ghost"
                          onClick={() => cancelInvitation(invitation.id)}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ))}
                  {!isMembershipsLoading && membershipState.invitations.length === 0 && (
                    <div className="list-row elevated-row">
                      <div>
                        <strong>Sin invitaciones pendientes</strong>
                        <small>Genera una invitacion para compartir el token con la artista.</small>
                      </div>
                      <StatusPill tone="neutral">Pendientes</StatusPill>
                    </div>
                  )}
                </div>
          </section>
            </StudioTeamSection>
          )}

          {selectedSection === 'services' && (
            <StudioServicesSection
              activeMemberships={operationalMemberships}
              expandedMembershipId={expandedMembershipId}
              membershipOperationsById={membershipOperationsById}
              membershipOperationsLoadingId={membershipOperationsLoadingId}
              toggleMembershipOperations={toggleMembershipOperations}
            />
          )}

          {selectedSection === 'schedule' && (
            <StudioScheduleSection
              activeMemberships={operationalMemberships}
              currentStudio={currentStudio}
              expandedMembershipId={expandedMembershipId}
              membershipOperationsById={membershipOperationsById}
              membershipOperationsLoadingId={membershipOperationsLoadingId}
              onOpenAppointmentModal={openOwnerAppointmentModal}
              onCancelAppointment={cancelStudioAppointment}
              onRequestConfirmations={sendStudioConfirmationRequests}
              ownerAppointments={ownerAppointments}
              profileDraft={profileDraft}
              renderOwnerAppointmentForm={renderOwnerAppointmentForm}
              toggleMembershipOperations={toggleMembershipOperations}
              cancellingAppointmentId={cancellingAppointmentId}
            />
          )}

          {selectedSection === 'metrics' && (
            <StudioMetricsSection
              activeMemberships={operationalMemberships}
              membershipOperationsById={membershipOperationsById}
              membershipState={membershipState}
            />
          )}

          {selectedSection === 'marketplace' && (
            <StudioMarketplaceSection>
              <section className="profile-foundation-card">
                <div>
                  <span className="eyebrow">Marketplace</span>
                  <h3>{isStudioMarketplacePublished ? 'Estudio visible en busqueda' : 'Activar visibilidad del estudio'}</h3>
                  <small>
                    {isStudioMarketplacePublished
                      ? 'El estudio ya puede aparecer para clientas. Usa este boton solo si cambiaste perfil, ubicacion o servicios.'
                      : 'Activalo cuando el estudio este aprobado y tenga nombre comercial, ciudad y ubicacion.'}
                  </small>
                </div>
                {isStudioMarketplacePublished && <StatusPill tone="success">Publicado</StatusPill>}
                <div className="row-actions">
                  <Button
                    disabled={!hasMarketplaceMinimumData || isPublishingMarketplace}
                    onClick={publishMarketplace}
                  >
                    {isPublishingMarketplace ? 'Guardando...' : isStudioMarketplacePublished ? 'Actualizar publicacion' : 'Publicar estudio'}
                  </Button>
                  {isStudioMarketplacePublished && (
                    <Button
                      disabled={isPublishingMarketplace}
                      variant="danger"
                      onClick={hideMarketplace}
                    >
                      Ocultar estudio
                    </Button>
                  )}
                </div>
                {!hasMarketplaceMinimumData && (
                  <small style={{ color: 'var(--muted)', fontWeight: 800 }}>
                    Requiere estudio aprobado, nombre comercial, ciudad y direccion o coordenadas.
                  </small>
                )}
                {marketplaceFeedback.message && (
                  <small style={{ color: marketplaceFeedback.tone === 'success' ? 'var(--success)' : 'var(--rose-dark)', fontWeight: 800 }}>
                    {marketplaceFeedback.message}
                  </small>
                )}
              </section>

              <section className="profile-foundation-card flow-points-benefits-panel">
                <div>
                  <span className="eyebrow">Flow Points</span>
                  <h3>Beneficios del estudio</h3>
                  <small>Configura si {profileDraft.commercialName || currentStudio?.name || 'el estudio'} otorga y acepta puntos en sus reservas.</small>
                </div>
                <div className={`marketplace-switch-card ${studioFlowPointsEnabled ? 'active' : ''}`}>
                  <div>
                    <strong>{studioFlowPointsEnabled ? 'Flow Points activos' : 'Flow Points pausados'}</strong>
                    <small>{studioFlowPointsEnabled ? 'Las clientas pueden ver beneficios del estudio.' : 'No se mostraran beneficios de puntos para este estudio.'}</small>
                  </div>
                  <Button disabled={isStudioMarketingSaving || isStudioMarketingLoading} size="sm" variant={studioFlowPointsEnabled ? 'danger' : 'success'} onClick={toggleStudioFlowPointsEnabled}>
                    {studioFlowPointsEnabled ? 'Desactivar Flow Points' : 'Activar Flow Points'}
                  </Button>
                </div>
                <div className="flow-points-reward-setting">
                  <div>
                    <strong>Recompensa automatica por cita completada</strong>
                    <small>Se calcula sobre el total final pagado. Las citas con puntos aplicados no generan nuevos puntos.</small>
                  </div>
                  <div className="flow-points-reward-options" role="group" aria-label="Porcentaje de recompensa Flow Points">
                    {[5, 10].map((percentage) => (
                      <Button
                        disabled={isStudioMarketingSaving || isStudioMarketingLoading}
                        key={percentage}
                        size="sm"
                        variant={studioMarketingSettings.flowPointsRewardPercentage === percentage ? 'primary' : 'secondary'}
                        onClick={() => selectStudioFlowPointsRewardPercentage(percentage)}
                      >
                        {percentage}%{percentage === 5 ? ' recomendado' : ''}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="flow-points-reward-setting">
                  <div><strong>Maximo descuento que deseas otorgar usando FlowPoints</strong><small>La clienta elegira una cantidad de puntos sin superar este limite.</small></div>
                  <label className="input-field">
                    <span>Maximo beneficio</span>
                    <select value={studioMarketingSettings.flowPointsMaxDiscountPercentage || 5} onChange={(event) => selectStudioFlowPointsMaxDiscountPercentage(Number(event.target.value))}>
                      {[5, 10, 20, 30, 50].map((percent) => <option value={percent} key={percent}>{percent}%</option>)}
                    </select>
                  </label>
                </div>
                <small className="flow-points-minimum-note">Al reunir 1,000 FP con el estudio, la clienta puede usar desde 100 FP por canje. Para volver a canjear deberá recuperar los 1,000 FP. Happy Hour no admite descuentos adicionales con FlowPoints.</small>
              </section>

              {currentStudioId && <FlowPointRedemptionHistory studioId={currentStudioId} />}

              <section className="profile-foundation-card double-points-panel">
                <div>
                  <span className="eyebrow">PUNTOS DOBLES!</span>
                  <h3>{studioDoublePointsActive ? 'Promocion activa' : 'Promocion pausada'}</h3>
                  <small>Cuando esta activo, las citas del estudio duplican los puntos al otorgarlos.</small>
                </div>
                <Button disabled={isStudioMarketingSaving || isStudioMarketingLoading} variant={studioDoublePointsActive ? 'danger' : 'success'} onClick={toggleStudioDoublePoints}>
                  {studioDoublePointsActive ? 'Desactivar' : 'Activar'}
                </Button>
              </section>

              <section className="profile-foundation-card happy-hour-panel">
                <div>
                  <span className="eyebrow">Happy Hour</span>
                  <h3>{studioHappyHourActive ? 'Happy Hour activo' : 'Happy Hour pausado'}</h3>
                  <small>Define dias, horario y descuento para reservas del estudio.</small>
                </div>
                {searchParams.has('sugerirDia') && searchParams.has('sugerirHora') && Number(searchParams.get('sugerirDia')) >= 1 && Number(searchParams.get('sugerirDia')) <= 7 && Number(searchParams.get('sugerirHora')) >= 0 && Number(searchParams.get('sugerirHora')) <= 22 && <div className="marketing-suggestion"><strong>Hay espacios el {weekdayOptions.find((day) => day.value === (Number(searchParams.get('sugerirDia')) === 7 ? 0 : Number(searchParams.get('sugerirDia'))))?.label} a las {String(searchParams.get('sugerirHora')).padStart(2, '0')}:00.</strong><button type="button" onClick={() => { const day = Number(searchParams.get('sugerirDia')); const hour = Number(searchParams.get('sugerirHora')); setStudioHappyHourDraft((draft) => ({ ...draft, weekdays: [day === 7 ? 0 : day], startTime: `${String(hour).padStart(2, '0')}:00`, endTime: `${String(hour + 1).padStart(2, '0')}:00` })) }}>Usar este horario</button><small>Revisa el descuento antes de guardar.</small></div>}
                <div className="location-form-grid">
                  <label className="input-field">
                    <span>Descuento</span>
                    <select
                      value={studioHappyHourDraft.discountPercent}
                      onChange={(event) => setStudioHappyHourDraft((draft) => ({ ...draft, discountPercent: Number(event.target.value) }))}
                    >
                      {[5, 10, 15, 20, 25, 30].map((percent) => (
                        <option value={percent} key={percent}>{percent}%</option>
                      ))}
                    </select>
                  </label>
                  <Input label="Desde" type="time" value={studioHappyHourDraft.startTime} onChange={(event) => setStudioHappyHourDraft((draft) => ({ ...draft, startTime: event.target.value }))} />
                  <Input label="Hasta" type="time" value={studioHappyHourDraft.endTime} onChange={(event) => setStudioHappyHourDraft((draft) => ({ ...draft, endTime: event.target.value }))} />
                </div>
                <div className="weekday-toggle-row">
                  {weekdayOptions.map((day) => (
                    <button
                      className={studioHappyHourDraft.weekdays.includes(day.value) ? 'active' : ''}
                      key={day.value}
                      type="button"
                      onClick={() => toggleStudioHappyHourDay(day.value)}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
                <div className="row-actions">
                  <Button disabled={isStudioMarketingSaving || isStudioMarketingLoading} size="sm" variant={studioHappyHourActive ? 'danger' : 'success'} onClick={() => saveStudioHappyHour(!studioHappyHourActive)}>
                    {studioHappyHourActive ? 'Desactivar Happy Hour' : 'Activar Happy Hour'}
                  </Button>
                  <Button disabled={isStudioMarketingSaving || isStudioMarketingLoading} size="sm" variant="ghost" onClick={() => saveStudioHappyHour(true)}>
                    Guardar ajustes
                  </Button>
                </div>
              </section>

              {currentStudioId && <MarketingReminderSettings key={currentStudioId} studioId={currentStudioId} />}

              {studioMarketingFeedback.message && (
                <small style={{ color: studioMarketingFeedback.tone === 'success' ? 'var(--success)' : 'var(--rose-dark)', fontWeight: 800 }}>
                  {studioMarketingFeedback.message}
                </small>
              )}
            </StudioMarketplaceSection>
          )}

        </div>
      </Card>
      {isOwnerAppointmentOpen && selectedSection !== 'schedule' && renderOwnerAppointmentForm(false)}
      {pendingUnlinkMembership && (
        <div className="modal-shell studio-confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="unlink-artist-title">
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <span className="eyebrow">Confirmar desvinculacion</span>
                <h3 id="unlink-artist-title">Desvincular artista</h3>
              </div>
              <button className="modal-close" type="button" aria-label="Cerrar" onClick={() => setPendingUnlinkMembership(null)}>x</button>
            </div>
            <div className="modal-body">
              <p>
                ¿Deseas desvincular a <strong>{pendingUnlinkMembership.realName || pendingUnlinkMembership.name}</strong> de este estudio?
                Sus servicios y horarios asociados al estudio dejaran de estar disponibles.
              </p>
            </div>
            <div className="modal-actions">
              <Button disabled={Boolean(unlinkingMembershipId)} size="sm" variant="ghost" onClick={() => setPendingUnlinkMembership(null)}>Conservar vinculacion</Button>
              <Button disabled={Boolean(unlinkingMembershipId)} size="sm" variant="danger" onClick={() => unlinkArtist(pendingUnlinkMembership)}>
                {unlinkingMembershipId ? 'Desvinculando...' : 'Desvincular'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

export default AdminStudioProfile
