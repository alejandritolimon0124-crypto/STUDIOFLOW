import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Input from '../../components/Input'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import { supabase } from '../../lib/supabaseClient'
import { useApp } from '../../contexts/appContextCore'
import { getCurrentBrowserCoordinates } from '../../utils/browserGeolocation'
import { buildGoogleMapsUrl, createProfessionalLocation, hasCoordinates, validateProfessionalLocation } from '../../utils/locationHelpers'
import { getAppointmentStatusTone } from '../../utils/appointmentStatus'
import { getCurrentProfile, getCurrentStudio } from '../../modules/entities/entitySelectors'
import { paths } from '../../routes/paths'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { fetchOwnStudios, hideStudioMarketplace, publishStudioMarketplace } from '../../services/studioService'
import {
  createStudioOwnerAppointment,
  fetchStudioOwnerAppointments,
  requestStudioOwnerAppointmentConfirmations,
  searchStudioOwnerClients,
} from '../../services/studioOwnerAppointmentService'
import { awardAppointmentFlowPoints } from '../../services/appointmentService'
import {
  cancelStudioArtistInvitation,
  fetchStudioMembershipOperations,
  fetchStudioMemberships,
  findStudioArtistByEmail,
  inviteStudioArtist,
} from '../../services/studioMembershipService'
import {
  deleteStudioFlowPointReward,
  fetchStudioMarketingSettings,
  saveStudioFlowPointReward,
  saveStudioHappyHourPromotion,
  setStudioDoublePointsPromotion,
  setStudioFlowPointRedemptionScope,
  setStudioFlowPointsEnabled,
} from '../../services/artistMarketingService'

const galleryLimit = 5
const studioSections = ['summary', 'team', 'services', 'schedule', 'marketplace', 'metrics', 'settings']
const emptyOwnerAppointmentDraft = {
  clientSearch: '',
  clientId: '',
  clientName: '',
  clientPhone: '',
  clientEmail: '',
  membershipId: '',
  serviceOfferingId: '',
  availabilitySlotId: '',
  notes: '',
}

const emptyStudioMarketingSettings = {
  rewards: [],
  flowPointsEnabled: false,
  flowPointRedemptionScope: 'exclusive',
  doublePoints: { status: 'paused', rules: {} },
  happyHour: { status: 'paused', rules: {} },
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

function getAttendedClientIds(appointments = []) {
  return new Set(appointments
    .filter((appointment) => (
      appointment.clientId
      && !['Cancelada', 'No show'].includes(appointment.status)
      && !['cancelled', 'no_show'].includes(String(appointment.appointmentStatus || '').toLowerCase())
      && (
        appointment.status === 'Completada'
        || String(appointment.appointmentStatus || '').toLowerCase() === 'completed'
        || getAppointmentTimestamp(appointment) < Date.now()
      )
    ))
    .map((appointment) => appointment.clientId))
}

function filterAppointmentsByAttendedClientQuery(appointments = [], query = '') {
  const normalizedQuery = String(query || '').trim()
  if (!normalizedQuery) return appointments

  const attendedClientIds = getAttendedClientIds(appointments)

  return appointments.filter((appointment) => (
    (!appointment.clientId || attendedClientIds.has(appointment.clientId))
    && appointmentMatchesClientQuery(appointment, normalizedQuery)
  ))
}

function isConfirmedAppointment(appointment = {}) {
  const status = String(appointment.appointmentStatus || appointment.appointment_status || appointment.status || '').toLowerCase()
  const blockedStatuses = ['pending', 'pendiente', 'cancelled', 'canceled', 'cancelada', 'cancelado', 'por aprobar']
  return !blockedStatuses.some((blockedStatus) => status.includes(blockedStatus))
}

function canAwardFlowPoints(appointment = {}) {
  const status = String(appointment.appointmentStatus || appointment.appointment_status || appointment.status || '').toLowerCase()
  return appointment.flowPointsAwarded > 0
    && appointment.pointsGranted <= 0
    && !['cancelled', 'canceled', 'cancelada', 'cancelado', 'no_show', 'no show'].some((blockedStatus) => status.includes(blockedStatus))
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
    <div className="day-strip scrollable-day-strip" ref={stripRef}>
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
  onAwardFlowPoints,
  onRequestConfirmations,
  ownerAppointments,
  profileDraft,
}) {
  const [showMetrics, setShowMetrics] = useState(false)
  const [showCalendarFilter, setShowCalendarFilter] = useState(false)
  const [selectedAgendaDate, setSelectedAgendaDate] = useState(getTodayDateValue)
  const [appointmentClientQuery, setAppointmentClientQuery] = useState('')
  const [pendingMetricsScroll, setPendingMetricsScroll] = useState('')
  const dashboardHeaderRef = useRef(null)
  const metricsRef = useRef(null)
  const [nowTimestamp] = useState(() => Date.now())
  const studioName = profileDraft.commercialName || currentStudio?.profile?.commercialName || currentStudio?.name || 'Estudio'
  const studioLogoUrl = profileDraft.logoUrl
    || profileDraft.logoPath
    || currentStudio?.profile?.logoUrl
    || currentStudio?.profile?.logoPath
    || ''
  const visibleDays = useMemo(() => buildVisibleDays(selectedAgendaDate), [selectedAgendaDate])
  const today = getTodayDateValue()
  const weekEndDate = getWeekEndDate(today)
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
  const completedServices = countAppointmentsBetween(ownerAppointments, today, monthEndDate)
  const appointmentsByArtist = ownerAppointments.reduce((accumulator, appointment) => {
    const artistName = appointment.artist || appointment.artistName || 'Artista'
    accumulator[artistName] = (accumulator[artistName] || 0) + 1
    return accumulator
  }, {})
  const mostActiveArtist = Object.entries(appointmentsByArtist).sort((first, second) => second[1] - first[1])[0]
  const toggleMetrics = () => {
    const nextShowMetrics = !showMetrics
    setShowMetrics(nextShowMetrics)
    setPendingMetricsScroll(nextShowMetrics ? 'metrics' : 'header')
  }

  useEffect(() => {
    if (!pendingMetricsScroll) return

    const target = pendingMetricsScroll === 'metrics' ? metricsRef.current : dashboardHeaderRef.current
    window.requestAnimationFrame(() => {
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setPendingMetricsScroll('')
    })
  }, [pendingMetricsScroll, showMetrics])

  return (
    <>
      <section className="profile-foundation-card" ref={dashboardHeaderRef}>
        <div>
          <span className="eyebrow">Agenda visual</span>
          <h3>{selectedAgendaDate === today ? 'Hoy' : selectedAgendaDate}</h3>
          <small>Desliza lateralmente para revisar dias cercanos.</small>
        </div>
        <div className="studio-review-actions">
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
            {appointmentClientQuery.trim() && (
              <small style={{ color: 'var(--muted)', fontWeight: 800 }}>
                Solo se muestran clientas que ya acudieron al menos una vez con este estudio.
              </small>
            )}
          </div>
        )}
        <OwnerDayStrip
          selectedDate={selectedAgendaDate}
          setSelectedDate={setSelectedAgendaDate}
          visibleDays={visibleDays}
        />
        <div className="compact-list">
          {selectedDateAppointments.slice(0, 6).map((appointment) => (
            <div className="list-row elevated-row" key={appointment.id || `${getAppointmentDate(appointment)}-${getAppointmentTime(appointment)}-${appointment.client}`}>
              <div>
                <strong>{getAppointmentTime(appointment)} / {appointment.client || 'Clienta'}</strong>
                <small>{appointment.service || 'Servicio'} / {appointment.contextName || studioName}</small>
              </div>
              <div className="agenda-card-actions">
                <StatusPill tone={getAppointmentStatusTone(appointment)}>{appointment.status || 'Confirmada'}</StatusPill>
                <Button
                  className="flow-points-award-button"
                  disabled={!canAwardFlowPoints(appointment)}
                  size="sm"
                  variant="success"
                  onClick={() => onAwardFlowPoints(appointment)}
                >
                  {appointment.pointsGranted > 0 ? `+${appointment.pointsGranted} otorgados` : `Otorgar ${appointment.flowPointsAwarded || 0} pts`}
                </Button>
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

      <section className="profile-foundation-card">
        <div className="studio-owner-summary-heading">
          <div className="studio-owner-summary-logo">
            {studioLogoUrl ? (
              <img src={studioLogoUrl} alt={`Foto de perfil de ${studioName}`} />
            ) : (
              <span>{studioName.slice(0, 2)}</span>
            )}
          </div>
          <div>
            <span className="eyebrow">Resumen operativo</span>
            <h3>{studioName}</h3>
            <span className="studio-owner-badge inline">STUDIO OWNER</span>
            <small>{currentStudio?.studioStatus === 'approved' ? 'Estudio aprobado' : currentStudio?.studioStatus || 'Estado por confirmar'}</small>
          </div>
        </div>
        <div className="studio-review-actions">
          <Button onClick={() => navigate(`${paths.adminStudio}?section=schedule`)}>Agregar cita</Button>
          <Button variant="ghost" onClick={toggleMetrics}>
            {showMetrics ? 'Ocultar metricas' : 'Mostrar metricas'}
          </Button>
        </div>
        {selectedDateAppointments.length > 0 && (
          <div className="studio-review-actions">
            <Button size="sm" variant="success" onClick={() => onRequestConfirmations(selectedAgendaDate)}>
              Enviar confirmacion
            </Button>
          </div>
        )}
        <div className="compact-list">
          <div className="list-row elevated-row">
            <div>
              <strong>Artistas activas</strong>
              <small>Memberships listas para operar.</small>
            </div>
            <StatusPill tone="neutral">{activeMemberships.length}</StatusPill>
          </div>
          <div className="list-row elevated-row">
            <div>
              <strong>Servicios activos</strong>
              <small>Servicios cargados en recursos del equipo.</small>
            </div>
            <StatusPill tone="neutral">{activeServices.length}</StatusPill>
          </div>
          <div className="list-row elevated-row">
            <div>
              <strong>Citas hoy</strong>
              <small>Solo citas confirmadas o programadas.</small>
            </div>
            <StatusPill tone="success">{todayAppointments.length}</StatusPill>
          </div>
          <div className="list-row elevated-row">
            <div>
              <strong>Proximas citas</strong>
              <small>Agenda confirmada por venir.</small>
            </div>
            <StatusPill tone="neutral">{upcomingAppointments.length}</StatusPill>
          </div>
        </div>
      </section>

      {showMetrics && (
        <section className="profile-foundation-card" ref={metricsRef}>
          <div>
            <span className="eyebrow">Metricas operativas</span>
            <h3>Rendimiento del estudio</h3>
          </div>
          <div className="compact-list">
            <div className="list-row elevated-row">
              <strong>Citas hoy</strong>
              <StatusPill tone="neutral">{todayAppointments.length}</StatusPill>
            </div>
            <div className="list-row elevated-row">
              <strong>Citas semana</strong>
              <StatusPill tone="neutral">{countAppointmentsBetween(ownerAppointments, today, weekEndDate)}</StatusPill>
            </div>
            <div className="list-row elevated-row">
              <strong>Citas mes</strong>
              <StatusPill tone="neutral">{countAppointmentsBetween(ownerAppointments, today, monthEndDate)}</StatusPill>
            </div>
            <div className="list-row elevated-row">
              <strong>Ocupacion agenda</strong>
              <StatusPill tone={occupancy > 70 ? 'success' : 'neutral'}>{occupancy}%</StatusPill>
            </div>
            <div className="list-row elevated-row">
              <strong>Servicios realizados</strong>
              <StatusPill tone="neutral">{completedServices}</StatusPill>
            </div>
            <div className="list-row elevated-row">
              <strong>Artista mas activa</strong>
              <StatusPill tone="neutral">{mostActiveArtist ? `${mostActiveArtist[0]} (${mostActiveArtist[1]})` : 'Sin citas'}</StatusPill>
            </div>
          </div>
          <Button variant="ghost" onClick={toggleMetrics}>Ocultar metricas</Button>
        </section>
      )}

      <section className="profile-foundation-card">
        <div>
          <span className="eyebrow">Resumen equipo</span>
          <h3>Artistas activas: {activeMemberships.length}</h3>
        </div>
        <div className="compact-list">
          {activeMemberships.map((membership) => {
            const memberServices = (membershipOperationsById[getMembershipRecordId(membership)]?.services || [])
              .filter((service) => ['active', 'activo'].includes(String(service.status || '').toLowerCase()))

            return (
              <div className="list-row elevated-row" key={membership.id}>
                <div>
                  <strong>{membership.name}</strong>
                  <small>Servicios activos: {memberServices.length}</small>
                </div>
                <StatusPill tone="success">Activa</StatusPill>
              </div>
            )
          })}
          {activeMemberships.length === 0 && (
            <div className="list-row elevated-row">
              <div>
                <strong>Sin artistas activas</strong>
                <small>Las artistas apareceran aqui cuando acepten su token.</small>
              </div>
              <StatusPill tone="neutral">Vacio</StatusPill>
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
  currentStudio,
  expandedMembershipId,
  membershipOperationsById,
  membershipOperationsLoadingId,
  onOpenAppointmentModal,
  onAwardFlowPoints,
  onRequestConfirmations,
  ownerAppointments,
  profileDraft,
  renderOwnerAppointmentForm,
  toggleMembershipOperations,
}) {
  const [showCalendarFilter, setShowCalendarFilter] = useState(false)
  const [selectedAgendaDate, setSelectedAgendaDate] = useState(getTodayDateValue)
  const [appointmentClientQuery, setAppointmentClientQuery] = useState('')
  const visibleDays = useMemo(() => buildVisibleDays(selectedAgendaDate), [selectedAgendaDate])
  const studioName = profileDraft?.commercialName || currentStudio?.profile?.commercialName || currentStudio?.name || 'Estudio'
  const filteredOwnerAppointments = filterAppointmentsByAttendedClientQuery(ownerAppointments, appointmentClientQuery)
  const selectedDateAppointments = filteredOwnerAppointments
    .filter((appointment) => getAppointmentDate(appointment) === selectedAgendaDate)
    .sort((firstAppointment, secondAppointment) => getAppointmentTimestamp(firstAppointment) - getAppointmentTimestamp(secondAppointment))

  return (
    <>
      <section className="profile-foundation-card">
        <div>
          <span className="eyebrow">Calendario operativo</span>
          <h3>{selectedAgendaDate === getTodayDateValue() ? 'Hoy' : selectedAgendaDate}</h3>
          <small>Citas confirmadas del estudio y vista rapida de dias.</small>
        </div>
        <div className="studio-review-actions">
          <Button className="appointment-primary-action" size="sm" onClick={() => onOpenAppointmentModal({})}>
            Generar cita
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
              onChange={(event) => setSelectedAgendaDate(event.target.value || getTodayDateValue())}
            />
            <Input
              label="Filtrar por nombre o celular"
              placeholder="Nombre o celular de clienta"
              type="search"
              value={appointmentClientQuery}
              onChange={(event) => setAppointmentClientQuery(event.target.value)}
            />
            {appointmentClientQuery.trim() && (
              <small style={{ color: 'var(--muted)', fontWeight: 800 }}>
                Solo se muestran clientas que ya acudieron al menos una vez con este estudio.
              </small>
            )}
          </div>
        )}
        {renderOwnerAppointmentForm?.()}
        <OwnerDayStrip
          selectedDate={selectedAgendaDate}
          setSelectedDate={setSelectedAgendaDate}
          visibleDays={visibleDays}
        />
        {selectedDateAppointments.length > 0 && (
          <div className="studio-review-actions">
            <Button size="sm" variant="success" onClick={() => onRequestConfirmations(selectedAgendaDate)}>
              Enviar confirmacion
            </Button>
          </div>
        )}
        <div className="compact-list">
          {selectedDateAppointments.map((appointment) => (
            <div className="list-row elevated-row" key={appointment.id || `${getAppointmentDate(appointment)}-${getAppointmentTime(appointment)}-${appointment.client}`}>
              <div>
                <strong>{getAppointmentTime(appointment)} / {appointment.client || 'Clienta'}</strong>
                <small>{appointment.service || 'Servicio'} / {appointment.contextName || studioName}</small>
              </div>
              <div className="agenda-card-actions">
                <StatusPill tone={getAppointmentStatusTone(appointment)}>{appointment.status || 'Confirmada'}</StatusPill>
                <Button
                  className="flow-points-award-button"
                  disabled={!canAwardFlowPoints(appointment)}
                  size="sm"
                  variant="success"
                  onClick={() => onAwardFlowPoints(appointment)}
                >
                  {appointment.pointsGranted > 0 ? `+${appointment.pointsGranted} otorgados` : `Otorgar ${appointment.flowPointsAwarded || 0} pts`}
                </Button>
              </div>
            </div>
          ))}
          {selectedDateAppointments.length === 0 && (
            <div className="list-row elevated-row">
              <div>
                <strong>Sin citas confirmadas</strong>
                <small>No hay agenda consolidada para este dia.</small>
              </div>
              <StatusPill tone="neutral">Libre</StatusPill>
            </div>
          )}
        </div>
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

            return (
              <div className="elevated-row owner-team-agenda-card" key={membershipRecordId || membership.id}>
                <div className="list-row" style={{ padding: 0 }}>
                  <div>
                    <strong>{membership.name}</strong>
                    <small>{operations?.schedule ? `${operations.schedule.timezone} / cada ${operations.schedule.intervalMinutes} min` : 'Sin agenda membership cargada.'}</small>
                  </div>
                  <div className="studio-review-actions">
                    <StatusPill tone="neutral">{operations?.upcomingSlots?.length || 0} slots</StatusPill>
                    <Button
                      disabled={isLoadingOperations}
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleMembershipOperations(membershipRecordId)}
                    >
                      {isLoadingOperations ? 'Cargando...' : isExpanded ? 'Ocultar' : 'Ver agenda'}
                    </Button>
                  </div>
                </div>
                {isExpanded && (
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
                        <StatusPill tone={rule.active ? 'success' : 'neutral'}>
                          {rule.active ? 'Activo' : 'Libre'}
                        </StatusPill>
                      </div>
                    ))}
                    <div className="list-row elevated-row">
                      <div>
                        <strong>Proximos espacios disponibles</strong>
                        <small>Disponibilidad real con membership_id de este estudio.</small>
                      </div>
                      <StatusPill tone="neutral">{operations?.upcomingSlots?.length || 0} slots</StatusPill>
                    </div>
                    {operations?.upcomingSlots?.map((slot) => (
                      <div className="list-row elevated-row" key={slot.id}>
                        <div>
                          <strong>{slot.date || String(slot.startsAt || '').slice(0, 10)}</strong>
                          <small>{slot.time || String(slot.startsAt || '').slice(11, 16)} a {slot.end || String(slot.endsAt || '').slice(11, 16)}</small>
                        </div>
                        <div className="studio-review-actions">
                          <StatusPill tone="success">{slot.status}</StatusPill>
                          <Button
                            size="sm"
                            onClick={() => onOpenAppointmentModal({
                              membership,
                              slot,
                            })}
                          >
                            Agendar
                          </Button>
                        </div>
                      </div>
                    ))}
                    {operations && !operations.schedule && operations.upcomingSlots.length === 0 && (
                      <div className="list-row elevated-row">
                        <div>
                          <strong>Sin disponibilidad configurada</strong>
                          <small>No hay agenda ni slots disponibles para esta membership.</small>
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
  return <>{children}</>
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

function StudioSettingsSection({ children }) {
  return <>{children}</>
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
}) {
  const selectedMembership = memberships.find((membership) => getMembershipRecordId(membership) === draft.membershipId || membership.id === draft.membershipId)
  const selectedOperationsKey = selectedMembership ? getMembershipRecordId(selectedMembership) : draft.membershipId
  const selectedOperations = selectedOperationsKey ? membershipOperationsById[selectedOperationsKey] : null
  const services = (selectedOperations?.services || []).filter((service) => ['active', 'activo'].includes(String(service.status || '').toLowerCase()))
  const selectedService = services.find((service) => service.id === draft.serviceOfferingId)
  const slots = (selectedOperations?.upcomingSlots || []).filter((slot) => slot.status === 'available')
  const selectedSlot = slots.find((slot) => slot.id === draft.availabilitySlotId)
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
            <h3>Generar cita</h3>
          </div>
          <button className="modal-close" type="button" aria-label="Cerrar" onClick={onClose}>x</button>
        </div>
        <div className="modal-body form-stack compact-form">
          <div className="location-form-grid">
            <Input
              label="Buscar clienta"
              placeholder="Nombre o correo electronico"
              type="search"
              value={draft.clientSearch}
              onChange={(event) => onDraftChange({ clientSearch: event.target.value, clientId: '' })}
            />
            <div style={{ alignSelf: 'end' }}>
              <Button disabled={isClientSearchLoading} size="sm" onClick={onSearchClients}>
                {isClientSearchLoading ? 'Buscando...' : 'Buscar'}
              </Button>
            </div>
          </div>
          <div className="compact-list">
            {matchingClients.map((client) => (
              <div className="list-row elevated-row" key={client.id}>
                <div>
                  <strong>{client.name}</strong>
                  <small>{client.email || client.phone || 'Sin contacto'}</small>
                </div>
                <Button
                  size="sm"
                  variant={draft.clientId === client.id ? 'primary' : 'ghost'}
                  onClick={() => onDraftChange({
                    clientId: client.id,
                    clientName: client.name,
                    clientPhone: client.phone || '',
                    clientEmail: client.email || '',
                  })}
                >
                  Usar
                </Button>
              </div>
            ))}
            {clientSearchStatus.message && (
              <div className="list-row elevated-row">
                <div>
                  <strong>{clientSearchStatus.message}</strong>
                  <small>Tambien puedes crear una clienta rapida abajo.</small>
                </div>
              </div>
            )}
          </div>
          {selectedClient && (
            <small style={{ color: 'var(--success)', fontWeight: 800 }}>
              Clienta existente: {selectedClient.name}
            </small>
          )}
          {!draft.clientId && (
            <>
              <Input
                label="Nombre clienta"
                value={draft.clientName}
                onChange={(event) => onDraftChange({ clientName: event.target.value })}
              />
              <Input
                label="Telefono"
                type="tel"
                value={draft.clientPhone}
                onChange={(event) => onDraftChange({ clientPhone: event.target.value })}
              />
              <Input
                label="Correo opcional"
                type="email"
                value={draft.clientEmail}
                onChange={(event) => onDraftChange({ clientEmail: event.target.value })}
              />
            </>
          )}
          <section className="owner-artist-picker" aria-label="Seleccion de artista">
            <div>
              <span className="eyebrow">Artista asignada</span>
              <h4>Selecciona quien atiende la cita</h4>
            </div>
            <div className="owner-artist-grid owner-artist-grid-highlight">
              {memberships.length > 0 ? memberships.map((membership) => {
                const membershipRecordId = getMembershipRecordId(membership)
                const isSelected = draft.membershipId === membershipRecordId
                const photoUrl = membership.studioPhotoUrl || ''

                return (
                  <button
                    className={`owner-artist-card${isSelected ? ' active' : ''}`}
                    key={membershipRecordId || membership.id}
                    type="button"
                    onClick={() => onDraftChange({ membershipId: membershipRecordId, serviceOfferingId: '', availabilitySlotId: '' })}
                  >
                    <span className="owner-artist-avatar">
                      {photoUrl ? <img src={photoUrl} alt={`Foto de ${membership.name}`} /> : getInitials(membership.name)}
                    </span>
                    <strong>{membership.name}</strong>
                    <small>{membership.email || 'Artista del estudio'}</small>
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
          <label className="input-field">
            <span>Servicio</span>
            <select
              value={draft.serviceOfferingId}
              onChange={(event) => onDraftChange({ serviceOfferingId: event.target.value })}
            >
              <option value="">Selecciona servicio</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name} / {service.duration || `${service.durationMinutes} min`}
                </option>
              ))}
            </select>
          </label>
          {selectedService && (
            <small>Duracion automatica: {selectedService.duration || `${selectedService.durationMinutes} min`}</small>
          )}
          <label className="input-field">
            <span>Horario disponible</span>
            <select
              value={draft.availabilitySlotId}
              onChange={(event) => onDraftChange({ availabilitySlotId: event.target.value })}
            >
              <option value="">Selecciona horario</option>
              {slots.map((slot) => (
                <option key={slot.id} value={slot.id}>
                  {slot.date} / {slot.time} - {slot.end}
                </option>
              ))}
            </select>
          </label>
          {selectedMembership && selectedSlot && (
            <small>{selectedMembership.name} / {selectedSlot.date} {selectedSlot.time}</small>
          )}
          <label className="input-field">
            <span>Notas</span>
            <textarea
              rows="3"
              value={draft.notes}
              onChange={(event) => onDraftChange({ notes: event.target.value })}
            />
          </label>
          {feedback.message && (
            <small style={{ color: feedback.tone === 'success' ? 'var(--success)' : 'var(--rose-dark)', fontWeight: 800 }}>
              {feedback.message}
            </small>
          )}
        </div>
        <div className="modal-actions">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" disabled={isSaving} onClick={onSave}>
            {isSaving ? 'Guardando...' : 'Guardar cita'}
          </Button>
        </div>
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
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { adminState, loadAdminArtists, loadAdminClients, session, updateManagedStudioProfile } = useApp()
  const [isPublishingMarketplace, setIsPublishingMarketplace] = useState(false)
  const [marketplaceVisibilityOverride, setMarketplaceVisibilityOverride] = useState('')
  const [ownStudioMarketplaceState, setOwnStudioMarketplaceState] = useState(null)
  const [marketplaceFeedback, setMarketplaceFeedback] = useState({ tone: 'neutral', message: '' })
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
  const [inviteEmail, setInviteEmail] = useState('')
  const [searchedArtist, setSearchedArtist] = useState(null)
  const [artistSearchStatus, setArtistSearchStatus] = useState({ tone: 'neutral', message: '' })
  const [ownerAppointmentDraft, setOwnerAppointmentDraft] = useState(emptyOwnerAppointmentDraft)
  const [isOwnerAppointmentOpen, setIsOwnerAppointmentOpen] = useState(false)
  const [isOwnerAppointmentSaving, setIsOwnerAppointmentSaving] = useState(false)
  const [ownerAppointmentFeedback, setOwnerAppointmentFeedback] = useState({ tone: 'neutral', message: '' })
  const [confirmationFeedback, setConfirmationFeedback] = useState({ tone: 'neutral', message: '' })
  const [ownerClientResults, setOwnerClientResults] = useState([])
  const [isOwnerClientSearchLoading, setIsOwnerClientSearchLoading] = useState(false)
  const [ownerClientSearchStatus, setOwnerClientSearchStatus] = useState({ tone: 'neutral', message: '' })
  const [studioOwnerAppointments, setStudioOwnerAppointments] = useState([])
  const [studioMarketingSettings, setStudioMarketingSettings] = useState(emptyStudioMarketingSettings)
  const [studioRewardDraft, setStudioRewardDraft] = useState({ discountPercent: 10, pointsCost: '' })
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
    const merged = [...activeMemberships]

    fallbackMemberships.forEach((fallbackMembership) => {
      const exists = merged.some((membership) => (
        membership.id === fallbackMembership.id
        || (getMembershipRecordId(membership) && getMembershipRecordId(membership) === getMembershipRecordId(fallbackMembership))
        || (membership.artistId && membership.artistId === fallbackMembership.artistId)
      ))

      if (!exists) merged.push(fallbackMembership)
    })

    return merged
  }, [activeMemberships, fallbackMemberships])
  const studioFlowPointsEnabled = Boolean(studioMarketingSettings.flowPointsEnabled)
  const studioDoublePointsActive = studioMarketingSettings.doublePoints?.status === 'active'
  const studioHappyHourActive = studioMarketingSettings.happyHour?.status === 'active'
  const studioFlowPointRedemptionScope = studioMarketingSettings.flowPointRedemptionScope || 'exclusive'
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

  const loadStudioOwnerAppointments = useCallback(async () => {
    if (!currentStudio?.id) return []

    try {
      const appointments = await fetchStudioOwnerAppointments({
        studioId: currentStudio.id,
        membershipIds: activeMembershipIds,
      })
      setStudioOwnerAppointments(appointments)
      return appointments
    } catch (error) {
      setStudioOwnerAppointments([])
      return []
    }
  }, [activeMembershipIds, currentStudio?.id])

  const sendStudioConfirmationRequests = useCallback(async (date = null) => {
    if (!currentStudio?.id) return

    setConfirmationFeedback({ tone: 'neutral', message: '' })

    try {
      const updatedCount = await requestStudioOwnerAppointmentConfirmations({
        studioId: currentStudio.id,
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
  }, [currentStudio?.id, loadStudioOwnerAppointments])

  const awardStudioAppointmentPoints = useCallback(async (appointment = {}) => {
    if (!appointment.id) return

    setConfirmationFeedback({ tone: 'neutral', message: '' })

    try {
      const payload = await awardAppointmentFlowPoints({ appointmentId: appointment.id })
      setConfirmationFeedback({
        tone: 'success',
        message: `Flow Points otorgados: ${payload?.pointsAwarded || payload?.points_awarded || 0}.`,
      })
      await loadStudioOwnerAppointments()
    } catch (error) {
      setConfirmationFeedback({ tone: 'warm', message: error.message || 'No se pudieron otorgar Flow Points.' })
    }
  }, [loadStudioOwnerAppointments])

  const loadStudioMemberships = useCallback(async ({ silent = false, successMessage = '' } = {}) => {
    if (!currentStudio?.id) return null

    if (!silent) {
      setIsMembershipsLoading(true)
      setMembershipFeedback({ tone: 'neutral', message: '' })
    }

    try {
      const payload = await fetchStudioMemberships(currentStudio.id)
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
  }, [currentStudio?.id])

  const loadMembershipOperations = useCallback(async (membershipId) => {
    if (!currentStudio?.id || !membershipId) return null

    setMembershipOperationsLoadingId(membershipId)

    try {
      const payload = await fetchStudioMembershipOperations({
        studioId: currentStudio.id,
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
  }, [currentStudio?.id])

  useEffect(() => {
    queueMicrotask(() => {
      setProfileDraft(currentStudio?.profile || {})
      setLocationDraft(createProfessionalLocation(currentStudio?.professionalLocation || {}))
      setIsStudioLocationConfirmed(false)
      setMarketplaceFeedback({ tone: 'neutral', message: '' })
    })
  }, [currentStudio?.id, currentStudio?.professionalLocation, currentStudio?.profile])

  useEffect(() => {
    if (!currentStudio?.id) return

    loadStudioMemberships()
    loadAdminArtists?.().catch(() => null)
  }, [currentStudio?.id, loadAdminArtists, loadStudioMemberships])

  useEffect(() => {
    if (!currentStudio?.id) return

    let isActive = true

    fetchOwnStudios()
      .then((studios) => {
        if (!isActive) return
        const ownStudio = studios.find((studio) => studio.id === currentStudio.id || studio.studioId === currentStudio.id)
        setOwnStudioMarketplaceState(ownStudio || null)
      })
      .catch(() => {
        if (isActive) setOwnStudioMarketplaceState(null)
      })

    return () => {
      isActive = false
    }
  }, [currentStudio?.id])

  useEffect(() => {
    if (!currentStudio?.id) return

    loadStudioOwnerAppointments()
  }, [currentStudio?.id, loadStudioOwnerAppointments])

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

    const intervalId = window.setInterval(() => {
      if (document.visibilityState && document.visibilityState !== 'visible') return
      loadStudioMemberships({ silent: true })
    }, 30000)

    return () => {
      window.clearInterval(intervalId)
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

  const readImageFile = (file, onLoad) => {
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const source = String(reader.result || '')
      const image = new Image()

      image.onload = () => {
        const maxSize = 1200
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(image.width * scale))
        canvas.height = Math.max(1, Math.round(image.height * scale))

        const context = canvas.getContext('2d')
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        onLoad(canvas.toDataURL('image/jpeg', 0.78))
      }

      image.onerror = () => onLoad(source)
      image.src = source
    }
    reader.readAsDataURL(file)
  }

  const handleLogoChange = (event) => {
    readImageFile(event.target.files?.[0], (logoUrl) => {
      setProfileDraft((currentDraft) => ({ ...currentDraft, logoUrl }))
    })
    event.target.value = ''
  }

  const handleGalleryChange = (event) => {
    const files = Array.from(event.target.files || []).slice(0, galleryLimit - (profileDraft.gallery || []).length)

    files.forEach((file) => {
      readImageFile(file, (url) => {
        setProfileDraft((currentDraft) => ({
          ...currentDraft,
          gallery: [
            ...(currentDraft.gallery || []),
            {
              id: `studio-gallery-${Date.now()}-${Math.random().toString(16).slice(2)}`,
              label: file.name,
              url,
            },
          ].slice(0, galleryLimit),
        }))
      })
    })
    event.target.value = ''
  }

  const removeGalleryImage = (imageId) => {
    setProfileDraft((currentDraft) => ({
      ...currentDraft,
      gallery: (currentDraft.gallery || []).filter((image) => image.id !== imageId),
    }))
  }

  const saveStudioProfile = () => {
    const nextErrors = validateProfessionalLocation(locationDraft)
    const hasLocationErrors = Object.keys(nextErrors).length > 0

    if (hasLocationErrors) {
      setLocationErrors(nextErrors)
      return
    }

    if (locationHasCoordinates && !isStudioLocationConfirmed) {
      setLocationErrors({ latitude: 'Confirma que esta ubicacion corresponde a tu estudio.' })
      return
    } else {
      setLocationErrors({})
    }

    const nextStudioProfile = {
      profile: profileDraft,
    }

    if (!hasLocationErrors) {
      nextStudioProfile.professionalLocation = {
        ...locationDraft,
        businessName: profileDraft.commercialName,
      }
    }

    updateManagedStudioProfile(currentStudio.id, nextStudioProfile)
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
  const isStudioMarketplacePublished = Boolean(
    marketplaceStatus !== 'hidden'
    && (
      currentStudio?.marketplaceListingId
      || currentStudio?.marketplace_listing_id
      || currentStudio?.marketplaceProfileId
      || currentStudio?.marketplace_profile_id
      || ownStudioMarketplaceState?.marketplaceListingId
      || ownStudioMarketplaceState?.marketplace_listing_id
      || ownStudioMarketplaceState?.marketplaceProfileId
      || ownStudioMarketplaceState?.marketplace_profile_id
      || ['published', 'active', 'visible'].includes(marketplaceStatus)
    ),
  )

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

  const loadStudioMarketingSettings = useCallback(async () => {
    if (!currentStudio?.id) return

    const requestId = studioMarketingRequestRef.current + 1
    studioMarketingRequestRef.current = requestId
    setIsStudioMarketingLoading(true)

    try {
      const settings = await fetchStudioMarketingSettings({ studioId: currentStudio.id })
      if (requestId !== studioMarketingRequestRef.current) return

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
      setStudioMarketingFeedback({ tone: 'warm', message: error.message || 'No se pudo cargar Marketplace.' })
    } finally {
      setIsStudioMarketingLoading(false)
    }
  }, [currentStudio?.id])

  useEffect(() => {
    if (selectedSection === 'marketplace') {
      loadStudioMarketingSettings()
    }
  }, [loadStudioMarketingSettings, selectedSection])

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

  const changeStudioFlowPointScope = async (scope) => {
    const previousSettings = studioMarketingSettings
    setIsStudioMarketingSaving(true)
    setStudioMarketingSettings((current) => ({ ...current, flowPointRedemptionScope: scope }))

    try {
      const settings = await setStudioFlowPointRedemptionScope({ scope, studioId: currentStudio.id })
      updateStudioMarketingSettings(settings, scope === 'open' ? 'El estudio acepta puntos libres.' : 'El estudio acepta solo puntos exclusivos.')
    } catch (error) {
      setStudioMarketingSettings(previousSettings)
      setStudioMarketingFeedback({ tone: 'warm', message: error.message || 'No se pudo guardar el tipo de puntos.' })
    } finally {
      setIsStudioMarketingSaving(false)
    }
  }

  const addStudioFlowPointReward = async () => {
    if (!studioRewardDraft.pointsCost) return

    setIsStudioMarketingSaving(true)
    try {
      const reward = await saveStudioFlowPointReward({ ...studioRewardDraft, studioId: currentStudio.id })
      setStudioMarketingSettings((current) => ({
        ...current,
        rewards: [...current.rewards, reward].sort((first, second) => first.pointsCost - second.pointsCost),
      }))
      setStudioRewardDraft({ discountPercent: 10, pointsCost: '' })
      setStudioMarketingFeedback({ tone: 'success', message: 'Beneficio Flow Points agregado.' })
    } catch (error) {
      setStudioMarketingFeedback({ tone: 'warm', message: error.message || 'No se pudo agregar el beneficio.' })
    } finally {
      setIsStudioMarketingSaving(false)
    }
  }

  const deleteStudioReward = async (rewardId) => {
    if (!window.confirm('Eliminar este beneficio Flow Points?')) return

    const previousSettings = studioMarketingSettings
    setIsStudioMarketingSaving(true)
    setStudioMarketingSettings((current) => ({
      ...current,
      rewards: current.rewards.filter((reward) => reward.id !== rewardId),
    }))

    try {
      const settings = await deleteStudioFlowPointReward({ rewardId, studioId: currentStudio.id })
      updateStudioMarketingSettings(settings, 'Beneficio eliminado.')
    } catch (error) {
      setStudioMarketingSettings(previousSettings)
      setStudioMarketingFeedback({ tone: 'warm', message: error.message || 'No se pudo eliminar el beneficio.' })
    } finally {
      setIsStudioMarketingSaving(false)
    }
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
      availabilitySlotId: slot?.id || '',
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
      const clients = await searchStudioOwnerClients({
        query,
        limit: 5,
      })
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
      await createStudioOwnerAppointment({
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
      setOwnerAppointmentFeedback({ tone: 'success', message: 'Cita creada y slots bloqueados.' })
      setIsOwnerAppointmentOpen(false)
      setOwnerAppointmentDraft(emptyOwnerAppointmentDraft)
    } catch (error) {
      setOwnerAppointmentFeedback({ tone: 'warm', message: error.message || 'No se pudo crear la cita.' })
    } finally {
      setIsOwnerAppointmentSaving(false)
    }
  }

  useEffect(() => {
    const ownerAppointmentState = location.state?.ownerAppointment || null
    if (!ownerAppointmentState) return

    openOwnerAppointmentModal({ client: ownerAppointmentState.client || null })
    navigate(`${paths.adminStudio}?section=schedule`, { replace: true, state: null })
  }, [location.state])

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
      />
    </div>
  )

  return (
    <main className="dashboard-grid admin-grid profile-foundation-grid">
      <Card className="wide-card mobile-screen primary-panel">
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
              onAwardFlowPoints={awardStudioAppointmentPoints}
              onRequestConfirmations={sendStudioConfirmationRequests}
              ownerAppointments={ownerAppointments}
              profileDraft={profileDraft}
            />
          )}

          {selectedSection === 'settings' && (
            <StudioSettingsSection>
          <section className="profile-foundation-card">
            <div>
              <span className="eyebrow">Configuracion</span>
              <h3>Perfil del estudio</h3>
            </div>
            <Input
              label="Nombre comercial del estudio"
              value={profileDraft.commercialName}
              onChange={(event) => updateProfileField('commercialName', event.target.value)}
            />
            <label className="input-field">
              <span>Descripcion</span>
              <textarea
                value={profileDraft.description}
                onChange={(event) => updateProfileField('description', event.target.value)}
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
              <span>Horarios</span>
              <textarea
                value={profileDraft.hours}
                onChange={(event) => updateProfileField('hours', event.target.value)}
                rows="3"
              />
            </label>
          </section>

          <section className="profile-foundation-card">
            <div>
              <span className="eyebrow">Branding</span>
              <h3>Logo del estudio</h3>
              <small>Imagen principal del estudio.</small>
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

          <section className="profile-foundation-card">
            <div>
              <span className="eyebrow">Ubicacion</span>
              <h3>Ubicacion del Estudio</h3>
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

          <section className="profile-foundation-card">
            <div className="studio-gallery-heading">
              <div>
                <span className="eyebrow">Fotos del Estudio</span>
                <h3>📸 Fotos del Estudio</h3>
                <small>Estas imágenes serán visibles para las clientas en tu perfil público.</small>
                <small>Comparte únicamente fotografías de tus instalaciones, recepción y áreas de atención.</small>
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
          </section>

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

          <section className="profile-foundation-card">
            <div>
              <span className="eyebrow">Servicios del estudio</span>
              <h3>Servicios activos</h3>
              <small>Lectura consolidada de servicios activos publicados por artistas vinculadas.</small>
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
                    <strong>Sin servicios activos cargados</strong>
                    <small>Los servicios apareceran cuando las artistas configuren servicios en contexto de estudio.</small>
                  </div>
                  <StatusPill tone="neutral">Vacio</StatusPill>
                </div>
              )}
            </div>
          </section>
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
                        <div className="list-row" style={{ padding: 0 }}>
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
                          <div className="studio-review-actions">
                            <StatusPill tone="success">Membership activa</StatusPill>
                            <Button
                              disabled={isLoadingOperations}
                              size="sm"
                              variant="ghost"
                              onClick={() => toggleMembershipOperations(membershipRecordId)}
                            >
                              {isLoadingOperations ? 'Cargando...' : isExpanded ? 'Ocultar' : 'Ver recursos'}
                            </Button>
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="compact-list" style={{ marginTop: 14 }}>
                            <div className="list-row elevated-row">
                              <div>
                                <strong>Estado membership</strong>
                                <small>Vinculo activo con este estudio.</small>
                              </div>
                              <StatusPill tone="success">{membership.status || 'active'}</StatusPill>
                            </div>
                            {(operations?.services || [])
                              .filter((service) => ['active', 'activo'].includes(String(service.status || '').toLowerCase()))
                              .map((service) => (
                                <div className="list-row elevated-row" key={service.id}>
                                  <div>
                                    <strong>{service.name}</strong>
                                    <small>{service.category} / {service.duration || `${service.durationMinutes} min`}</small>
                                  </div>
                                  <StatusPill tone="success">${service.price}</StatusPill>
                                </div>
                              ))}
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
              onAwardFlowPoints={awardStudioAppointmentPoints}
              onRequestConfirmations={sendStudioConfirmationRequests}
              ownerAppointments={ownerAppointments}
              profileDraft={profileDraft}
              renderOwnerAppointmentForm={isOwnerAppointmentOpen ? renderOwnerAppointmentForm : null}
              toggleMembershipOperations={toggleMembershipOperations}
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
                <div className="flow-points-scope-options">
                  <button
                    className={studioFlowPointRedemptionScope === 'exclusive' ? 'is-active exclusive' : 'exclusive'}
                    disabled={isStudioMarketingSaving}
                    onClick={() => changeStudioFlowPointScope('exclusive')}
                    type="button"
                  >
                    <strong>★ Puntos exclusivos</strong>
                    <small>Solo acepta puntos generados en este estudio.</small>
                  </button>
                  <button
                    className={studioFlowPointRedemptionScope === 'open' ? 'is-active open' : 'open'}
                    disabled={isStudioMarketingSaving}
                    onClick={() => changeStudioFlowPointScope('open')}
                    type="button"
                  >
                    <strong>★ Puntos libres</strong>
                    <small>Acepta puntos de otros perfiles.</small>
                  </button>
                </div>
                <div className="location-form-grid">
                  <label className="input-field">
                    <span>Descuento</span>
                    <select
                      value={studioRewardDraft.discountPercent}
                      onChange={(event) => setStudioRewardDraft((draft) => ({ ...draft, discountPercent: Number(event.target.value) }))}
                    >
                      {[5, 10, 15, 20, 25, 30].map((percent) => (
                        <option value={percent} key={percent}>{percent}%</option>
                      ))}
                    </select>
                  </label>
                  <Input
                    label="Puntos necesarios"
                    min="1"
                    type="number"
                    value={studioRewardDraft.pointsCost}
                    onChange={(event) => setStudioRewardDraft((draft) => ({ ...draft, pointsCost: event.target.value }))}
                  />
                </div>
                <Button disabled={isStudioMarketingSaving || !studioRewardDraft.pointsCost} onClick={addStudioFlowPointReward}>
                  Agregar beneficio Flow Points
                </Button>
                <div className="compact-list">
                  {studioMarketingSettings.rewards.length > 0 ? studioMarketingSettings.rewards.map((reward) => (
                    <div className="list-row elevated-row" key={reward.id}>
                      <div>
                        <strong>{reward.discountPercent}% de descuento</strong>
                        <small>Disponible con {reward.pointsCost} Flow Points</small>
                      </div>
                      <Button disabled={isStudioMarketingSaving} size="sm" variant="danger" onClick={() => deleteStudioReward(reward.id)}>
                        Eliminar
                      </Button>
                    </div>
                  )) : (
                    <div className="list-row elevated-row">
                      <div>
                        <strong>Sin beneficios agregados.</strong>
                        <small>Agrega descuentos para que las clientas puedan canjear puntos.</small>
                      </div>
                      <StatusPill tone="neutral">Vacio</StatusPill>
                    </div>
                  )}
                </div>
              </section>

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

              {studioMarketingFeedback.message && (
                <small style={{ color: studioMarketingFeedback.tone === 'success' ? 'var(--success)' : 'var(--rose-dark)', fontWeight: 800 }}>
                  {studioMarketingFeedback.message}
                </small>
              )}
            </StudioMarketplaceSection>
          )}

          {selectedSection === 'settings' && (
            <Button className="full-width" onClick={saveStudioProfile}>Guardar estudio</Button>
          )}
        </div>
      </Card>
      {isOwnerAppointmentOpen && selectedSection !== 'schedule' && renderOwnerAppointmentForm(false)}
    </main>
  )
}

export default AdminStudioProfile
