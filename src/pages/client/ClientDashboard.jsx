import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Input from '../../components/Input'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import { useApp } from '../../contexts/appContextCore'
import { paths } from '../../routes/paths'
import { getClientById } from '../../utils/clientHelpers'
import { generateClientAutomations } from '../../modules/automation/smartAutomationEngine'
import { canUseOperationalFeature } from '../../modules/governance/studioGovernance'
import {
  deriveMembershipsFromLegacyData,
  getMembershipForArtist,
  getStudioForArtist,
} from '../../modules/entities/entitySelectors'
import { buildGoogleMapsQuery, buildGoogleMapsUrl } from '../../utils/locationHelpers'
import { getAppointmentStatusTone } from '../../utils/appointmentStatus'
import { getCurrentBrowserCoordinates } from '../../utils/browserGeolocation'
import { getMaxBirthDateForAdult, validateBirthDate } from '../../utils/birthdayValidation'
import { fetchClientFlowPointsBalance } from '../../services/appointmentService'
import { serviceCatalog } from '../../services/staticCatalogs'

const clientConfirmationNoticeKey = 'studio-flow-client-confirmation-notices'

function canUseBrowserNotifications() {
  return typeof window !== 'undefined' && 'Notification' in window
}

function getStoredConfirmationNoticeKeys() {
  try {
    return JSON.parse(localStorage.getItem(clientConfirmationNoticeKey) || '[]')
  } catch {
    return []
  }
}

function storeConfirmationNoticeKey(key) {
  try {
    const keys = new Set(getStoredConfirmationNoticeKeys())
    keys.add(key)
    localStorage.setItem(clientConfirmationNoticeKey, JSON.stringify([...keys].slice(-80)))
  } catch {
    // El aviso visual dentro de la app sigue funcionando aunque localStorage falle.
  }
}

function getConfirmationNoticeKey(appointment = {}) {
  return `${appointment.id || ''}:${appointment.confirmationRequestedAt || appointment.confirmation_requested_at || ''}`
}

function showAppointmentBrowserNotification(appointment = {}) {
  if (!canUseBrowserNotifications() || Notification.permission !== 'granted') return

  try {
    new Notification('Confirma tu cita en Studio Flow', {
      body: `${appointment.service || 'Servicio'} con ${appointment.artist || appointment.contextName || 'tu artista'} el ${appointment.date || ''} a las ${appointment.time || ''}.`,
      tag: getConfirmationNoticeKey(appointment),
    })
  } catch {
    // La tarjeta dentro de la app queda como respaldo.
  }
}

const searchServices = Object.fromEntries(
  Object.entries(serviceCatalog).map(([category, services]) => [
    category,
    services.map((name) => ({ name, durationMinutes: 60 })),
  ]),
)

const allSearchServices = Object.values(searchServices).flat()
const weekdayLabels = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']

function getTodayAvailabilityCount(artist = {}) {
  return Number(artist.availability?.availableTodayCount || artist.availability?.available_today_count || 0)
}

function getHappyHourWeekdays(artist = {}) {
  const activeHappyHours = (artist.activePromotions || []).filter((promotion) => (
    (promotion.type === 'happy_hour' || promotion.promotion_type === 'happy_hour')
    && promotion.status !== 'paused'
  ))
  const weekdays = new Set()

  activeHappyHours.forEach((promotion) => {
    const rules = promotion.rules || {}
    const rawWeekdays = rules.weekdays || rules.weekDays || rules.week_days

    if (Array.isArray(rawWeekdays) && rawWeekdays.length > 0) {
      rawWeekdays.forEach((weekday) => {
        const index = Number(weekday)
        if (Number.isInteger(index) && weekdayLabels[index]) weekdays.add(weekdayLabels[index])
      })
      return
    }

    weekdayLabels.forEach((weekday) => weekdays.add(weekday))
  })

  return [...weekdays]
}

function isSlotWithinHappyHour(artist = {}, slot = {}) {
  const slotDate = slot.date || ''
  const slotTime = slot.time || ''
  if (!slotDate || !slotTime) return Boolean(slot.isHappyHour)

  const slotWeekday = new Date(`${slotDate}T00:00:00`).getDay()
  const activeHappyHours = (artist.activePromotions || []).filter((promotion) => (
    (promotion.type === 'happy_hour' || promotion.promotion_type === 'happy_hour')
    && promotion.status !== 'paused'
  ))

  return activeHappyHours.some((promotion) => {
    const rules = promotion.rules || {}
    const rawWeekdays = rules.weekdays || rules.weekDays || rules.week_days
    const weekdays = Array.isArray(rawWeekdays) ? rawWeekdays.map(Number) : []
    const startTime = String(rules.startTime || rules.start_time || '00:00').slice(0, 5)
    const endTime = String(rules.endTime || rules.end_time || '23:59').slice(0, 5)
    const weekdayMatches = weekdays.length === 0 || weekdays.includes(slotWeekday)

    return weekdayMatches && slotTime >= startTime && String(slot.end || slotTime) <= endTime
  })
}

function getActiveDoublePointsMultiplier(artist = {}) {
  const activeDoublePoints = (artist.activePromotions || []).find((promotion) => (
    (promotion.type === 'double_points' || promotion.promotion_type === 'double_points')
    && promotion.status !== 'paused'
  ))

  const multiplier = Number(activeDoublePoints?.rules?.multiplier || 1)
  return Number.isFinite(multiplier) && multiplier > 1 ? multiplier : 1
}

function hasActiveDoublePoints(artist = {}) {
  return getActiveDoublePointsMultiplier(artist) > 1
}

function hasActiveHappyHour(artist = {}) {
  return (artist.activePromotions || []).some((promotion) => (
    (promotion.type === 'happy_hour' || promotion.promotion_type === 'happy_hour')
    && promotion.status !== 'paused'
  ))
}

function getKnownServiceCategory(serviceName = '') {
  const normalizedName = String(serviceName || '').trim().toLowerCase()
  const entry = Object.entries(searchServices).find(([, services]) => (
    services.some((service) => service.name.toLowerCase() === normalizedName)
  ))

  return entry?.[0] || 'Servicios'
}

function isActiveMarketplaceService(service = {}) {
  const status = String(service.status || 'active').toLowerCase()
  return !['archived', 'borrador', 'draft', 'suspended', 'suspendido', 'inactive', 'inactivo'].includes(status)
}

function normalizeMarketplaceServiceOption(service) {
  const rawName = typeof service === 'string' ? service : service?.name
  const name = String(rawName || '').trim()
  if (!name) return null

  const knownService = allSearchServices.find((item) => item.name.toLowerCase() === name.toLowerCase())
  const durationMinutes = Number(service?.durationMinutes || service?.duration_minutes || knownService?.durationMinutes) || 60

  return {
    ...(typeof service === 'object' && service !== null ? service : {}),
    id: typeof service === 'object' && service?.id ? service.id : name,
    name,
    category: service?.category || service?.category_name || getKnownServiceCategory(name),
    durationMinutes,
    status: service?.status || 'active',
  }
}

function getArtistServiceOptions(artist = {}) {
  if (!artist) return []

  const source = Array.isArray(artist.marketplaceServiceOptions) && artist.marketplaceServiceOptions.length > 0
    ? artist.marketplaceServiceOptions
    : Array.isArray(artist.marketplaceServices) && artist.marketplaceServices.length > 0
      ? artist.marketplaceServices
      : String(artist.services || '')
        .split(/[,•|]/)
        .map((service) => service.trim())
        .filter(Boolean)

  return Array.from(
    source
      .map(normalizeMarketplaceServiceOption)
      .filter(Boolean)
      .filter(isActiveMarketplaceService)
      .reduce((itemsByName, service) => {
        if (!itemsByName.has(service.name)) itemsByName.set(service.name, service)
        return itemsByName
      }, new Map())
      .values(),
  )
}

function getTodayDateValue() {
  const today = new Date()
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset())
  return today.toISOString().slice(0, 10)
}

function getAppointmentDateKey(appointmentOrDate) {
  const rawValue = typeof appointmentOrDate === 'object' && appointmentOrDate !== null
    ? appointmentOrDate.date || appointmentOrDate.startsAt || appointmentOrDate.starts_at
    : appointmentOrDate
  const value = String(rawValue || '')

  if (value.includes('T')) return value.slice(0, 10)
  return value.slice(0, 10)
}

function parseAppointmentDateValue(appointmentOrDate) {
  const value = getAppointmentDateKey(appointmentOrDate)
  const [year, month, day] = value.split('-').map(Number)

  if (!year || !month || !day) return null

  return new Date(year, month - 1, day)
}

function getAppointmentStartDateTime(appointmentOrDate) {
  if (!appointmentOrDate) return null

  if (typeof appointmentOrDate === 'object') {
    const startsAt = appointmentOrDate.startsAt || appointmentOrDate.starts_at
    if (startsAt) {
      const parsedStartsAt = new Date(startsAt)
      if (!Number.isNaN(parsedStartsAt.getTime())) return parsedStartsAt
    }

    const dateKey = getAppointmentDateKey(appointmentOrDate)
    const timeValue = String(appointmentOrDate.time || '00:00').slice(0, 5)
    if (dateKey) {
      const parsedLocalDate = new Date(`${dateKey}T${timeValue || '00:00'}:00`)
      if (!Number.isNaN(parsedLocalDate.getTime())) return parsedLocalDate
    }
  }

  return parseAppointmentDateValue(appointmentOrDate)
}

function isFutureAppointmentDate(dateValue) {
  const appointmentDate = getAppointmentStartDateTime(dateValue)

  return Boolean(appointmentDate && appointmentDate > new Date())
}

function isCurrentMonthAppointment(dateValue) {
  const appointmentDate = parseAppointmentDateValue(dateValue)
  const today = parseAppointmentDateValue(getTodayDateValue())

  return Boolean(
    appointmentDate
    && today
    && appointmentDate.getFullYear() === today.getFullYear()
    && appointmentDate.getMonth() === today.getMonth()
  )
}

function buildServiceGroupsFromListings(listings = []) {
  return listings.reduce((groups, listing) => {
    const services = getArtistServiceOptions(listing)

    services.forEach((service) => {
      const category = service.category || 'Servicios'
      const currentGroup = groups[category] || []
      const exists = currentGroup.some((item) => item.name === service.name)

      if (!exists) {
        groups[category] = [
          ...currentGroup,
          {
            name: service.name,
            durationMinutes: service.durationMinutes || 60,
          },
        ]
      }
    })

    return groups
  }, {})
}

function buildServiceGroupsForArtist(artist = {}) {
  return getArtistServiceOptions(artist).reduce((groups, service) => {
    const category = service.category || 'Servicios'
    groups[category] = [...(groups[category] || []), service]
    return groups
  }, {})
}

function getServiceOptionsForArtist(artist = {}) {
  const serviceOptions = getArtistServiceOptions(artist)

  if (serviceOptions.length > 0) {
    return serviceOptions.map((service) => ({
      value: service.name,
      label: service.name,
      meta: `${service.durationMinutes || 60} min`,
    }))
  }

  return (artist.marketplaceServices || []).map((serviceName) => {
    const service =
      allSearchServices.find((item) => item.name === serviceName)
      || { name: serviceName, durationMinutes: 60 }

    return {
      value: service.name,
      label: service.name,
      meta: `${service.durationMinutes} min`,
    }
  })
}

function PremiumDropdown({ label, value, options, open, onToggle, onChange }) {
  const safeOptions = options.length > 0
    ? options
    : [{ value: '', label: 'Sin opciones', meta: 'No disponible', disabled: true }]
  const selectedOption = safeOptions.find((option) => option.value === value) || safeOptions[0]

  return (
    <div className="input-field" style={{ position: 'relative' }}>
      <span>{label}</span>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        style={{
          alignItems: 'center',
          background: 'rgba(255, 250, 247, 0.96)',
          border: '1px solid rgba(214, 186, 177, 0.72)',
          borderRadius: '18px',
          boxShadow: open ? '0 16px 34px rgba(118, 77, 67, 0.14)' : '0 10px 24px rgba(118, 77, 67, 0.08)',
          color: 'var(--ink)',
          display: 'flex',
          font: 'inherit',
          fontWeight: 800,
          justifyContent: 'space-between',
          minHeight: '48px',
          padding: '0 14px',
          textAlign: 'left',
          transition: 'box-shadow 180ms ease, transform 180ms ease, border-color 180ms ease',
          width: '100%',
        }}
      >
        <span style={{ display: 'grid', gap: '2px' }}>
          {selectedOption?.label || value}
          {selectedOption?.meta && (
            <small style={{ color: 'var(--muted)', fontWeight: 700 }}>{selectedOption.meta}</small>
          )}
        </span>
        <span style={{ color: 'var(--rose)', fontSize: '16px', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          v
        </span>
      </button>
      {open && (
        <div
          style={{
            background: 'rgba(255, 251, 248, 0.98)',
            border: '1px solid rgba(214, 186, 177, 0.7)',
            borderRadius: '20px',
            boxShadow: '0 22px 44px rgba(118, 77, 67, 0.18)',
            left: 0,
            maxHeight: '260px',
            overflowY: 'auto',
            padding: '8px',
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 8px)',
            zIndex: 40,
          }}
        >
          {safeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={option.disabled}
              onClick={() => {
                if (option.disabled) return
                onChange(option.value)
                onToggle()
              }}
              style={{
                background: option.value === value ? 'rgba(229, 177, 168, 0.2)' : 'transparent',
                border: 0,
                borderRadius: '14px',
                color: 'var(--ink)',
                display: 'grid',
                font: 'inherit',
                fontWeight: option.value === value ? 900 : 750,
                gap: '2px',
                padding: '12px',
                textAlign: 'left',
                width: '100%',
              }}
            >
              {option.label}
              {option.meta && <small style={{ color: 'var(--muted)', fontWeight: 700 }}>{option.meta}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function getArtistMarketplaceProfile(artist) {
  return {
    services: getArtistServiceOptions(artist).map((service) => service.name),
    occupancy: Number(artist?.occupancy || 0),
  }
}

function getMarketplaceBadge(availableCount, occupancy) {
  if (availableCount >= 8 && occupancy <= 65) return { label: 'Alta disponibilidad', tone: 'success', level: 'high' }
  if (availableCount >= 4 && occupancy <= 75) return { label: 'Disponibilidad media', tone: 'success', level: 'medium' }
  if (availableCount > 0) return { label: 'Pocos horarios', tone: 'warm', level: 'low' }
  return { label: 'Pocos horarios', tone: 'rose', level: 'low' }
}

function hydrateMarketplaceArtist(artist, visibleSlotCount, studio = null, membership = null) {
  const profile = getArtistMarketplaceProfile(artist)
  const serviceOptions = getArtistServiceOptions(artist)
  const fallbackServiceOptions = profile.services.map(normalizeMarketplaceServiceOption).filter(Boolean)
  const marketplaceServiceOptions = serviceOptions.length > 0 ? serviceOptions : fallbackServiceOptions
  const availabilityScore = Math.max(0, visibleSlotCount - Math.floor(profile.occupancy / 25))
  const badge = getMarketplaceBadge(availabilityScore, profile.occupancy)

  return {
    ...artist,
    membership,
    studio,
    marketplaceServices: marketplaceServiceOptions.map((service) => service.name),
    marketplaceServiceOptions,
    occupancy: profile.occupancy,
    availabilityScore,
    badge,
  }
}

function getArtistInitials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
}

function getArtistPublicProfile(artistState, artist) {
  const profile = artist?.id === 'artist-1' ? artistState.profile || {} : {}

  return {
    photoUrl: profile.photoUrl || artist?.photoUrl || '',
    fullName: profile.personalInfo?.artisticName || profile.personalInfo?.fullName || artist?.owner || artist?.name || '',
    primarySpecialty: profile.professionalProfile?.primarySpecialty || profile.professionalProfile?.specialties || artist?.specialties?.[0] || artist?.services || '',
    biography: profile.professionalProfile?.biography || profile.professionalProfile?.shortBio || artist?.summary || '',
    contactLinks: profile.contactLinks || artist?.contactLinks || {},
    professionalLocation: profile.professionalLocation || artist?.professionalLocation,
    portfolio: Array.isArray(profile.portfolio) ? profile.portfolio : artist?.portfolio || [],
    specialties: profile.professionalProfile?.specialties || artist?.specialties || '',
  }
}

function getStudioPublicProfile({ artist, studios = [], artistStudioMemberships = [] }) {
  return artist?.studio || getStudioForArtist({
    artistId: artist?.artistId || artist?.id,
    studios,
    artistStudioMemberships,
  }) || {}
}

function getStudioDisplayName(studio = {}) {
  return studio.profile?.commercialName || studio.name || ''
}

function getStudioContactItems(studio = {}) {
  return [
    studio.profile?.phone && { label: 'Telefono', value: studio.profile.phone },
    studio.profile?.email && { label: 'Correo', value: studio.profile.email },
    studio.profile?.hours && { label: 'Horarios', value: studio.profile.hours },
  ].filter(Boolean)
}

function hasUsableProfessionalLocation(location = {}) {
  return Boolean(
    String(location.latitude || '').trim() && String(location.longitude || '').trim()
    || buildGoogleMapsQuery(location),
  )
}

function getEffectiveProfessionalLocation(artistProfile, studio, artist = {}) {
  const artistLocationCandidates = [
    {
      settings: artistProfile.professionalLocation,
      sourcePrefix: 'artistState.profile.professionalLocation',
    },
    {
      settings: artist.professionalLocation,
      sourcePrefix: 'artist.professionalLocation',
    },
  ].filter((candidate) => candidate.settings)
  const studioLocation = studio?.professionalLocation || {}

  const configuredArtistLocation = artistLocationCandidates.find(({ settings }) => (
    settings.useStudioLocation === false && hasUsableProfessionalLocation(settings.customLocation || {})
  ))

  if (configuredArtistLocation) {
    return {
      location: configuredArtistLocation.settings.customLocation,
      source: `${configuredArtistLocation.sourcePrefix}.customLocation`,
    }
  }

  if (hasUsableProfessionalLocation(studioLocation)) {
    return {
      location: studioLocation,
      source: 'studio.professionalLocation',
    }
  }

  const fallbackArtistLocation = artistLocationCandidates.find(({ settings }) => (
    hasUsableProfessionalLocation(settings.customLocation || {})
  ))

  if (fallbackArtistLocation) {
    return {
      location: fallbackArtistLocation.settings.customLocation,
      source: `${fallbackArtistLocation.sourcePrefix}.customLocation.fallback`,
    }
  }

  const flatArtistLocation = artistLocationCandidates.find(({ settings }) => hasUsableProfessionalLocation(settings))

  if (flatArtistLocation) {
    return {
      location: flatArtistLocation.settings,
      source: flatArtistLocation.sourcePrefix,
    }
  }

  return {
    location: {},
    source: 'empty',
  }
}

function formatProfessionalAddress(location = {}, fallbackCity = '') {
  return [
    location.address,
    location.city || fallbackCity,
    location.state,
    location.postalCode,
  ].filter(Boolean).join(' / ')
}

function normalizeCoordinate(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function calculateDistanceKm(firstLocation = {}, secondLocation = {}) {
  const firstLatitude = normalizeCoordinate(firstLocation.latitude)
  const firstLongitude = normalizeCoordinate(firstLocation.longitude)
  const secondLatitude = normalizeCoordinate(secondLocation.latitude)
  const secondLongitude = normalizeCoordinate(secondLocation.longitude)

  if ([firstLatitude, firstLongitude, secondLatitude, secondLongitude].some((value) => value === null)) {
    return null
  }

  const toRadians = (value) => (value * Math.PI) / 180
  const earthRadiusKm = 6371
  const deltaLatitude = toRadians(secondLatitude - firstLatitude)
  const deltaLongitude = toRadians(secondLongitude - firstLongitude)
  const haversine =
    Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(toRadians(firstLatitude)) * Math.cos(toRadians(secondLatitude))
    * Math.sin(deltaLongitude / 2) ** 2

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

function normalizeText(value = '') {
  return String(value || '').trim().toLowerCase()
}

function getClientLocation(client = {}) {
  const location = client.location || client.professionalLocation || {}

  return {
    latitude: client.latitude || client.geoLat || location.latitude || '',
    longitude: client.longitude || client.geoLng || location.longitude || '',
    city: client.city || location.city || '',
    state: client.state || location.state || '',
    postalCode: client.postalCode || location.postalCode || '',
  }
}

function buildWhatsAppMessage(serviceName) {
  if (serviceName) {
    return `Hola 👋

Vi tu perfil en Studio Flow.

Me interesa el servicio de: ${serviceName}

¿Podrías orientarme sobre disponibilidad y detalles del servicio?

Gracias.`
  }

  return `Hola 👋

Vi tu perfil en Studio Flow y me gustaría recibir más información sobre tus servicios.

¿Podrías ayudarme?

Gracias.`
}

function openWhatsAppContact(whatsapp, serviceName = '') {
  const cleanNumber = String(whatsapp || '').replace(/\D/g, '')
  if (!cleanNumber) return

  const message = encodeURIComponent(buildWhatsAppMessage(serviceName))
  const whatsappUrl = `https://wa.me/${cleanNumber}?text=${message}`
  const isStandaloneIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent)
    && (window.navigator.standalone || window.matchMedia?.('(display-mode: standalone)').matches)

  if (isStandaloneIos) {
    window.location.href = whatsappUrl
    return
  }

  window.open(whatsappUrl, '_blank', 'noopener,noreferrer')
}

function openDirections(location, source = 'effectiveLocation') {
  const mapsUrl = buildGoogleMapsUrl(location)
  if (!mapsUrl) return

  console.info('[Studio Flow] Como llegar audit', {
    source,
    Latitude: location?.latitude || '',
    Longitude: location?.longitude || '',
    effectiveLocation: location,
    MapsURL: mapsUrl,
  })

  window.open(mapsUrl, '_blank', 'noopener,noreferrer')
}

function getSocialUrl(value, baseUrl) {
  if (!value) return ''
  if (String(value).startsWith('http')) return value
  return `${baseUrl}${String(value).replace('@', '')}`
}

function ClientDashboard({ view = 'inicio' }) {
  const navigate = useNavigate()
  const {
    adminState,
    agendaSettings,
    artistServices,
    artistState,
    clientAppointments: realClientAppointments,
    appointmentState,
    marketplaceListings,
    availabilityState,
    marketplaceAvailabilitySlots,
    bookingState,
    isAvailabilityLoading,
    availabilityError,
    isClientAppointmentsLoading,
    isBookingLoading,
    bookingError,
    loadMarketplaceListings,
    loadMarketplaceAvailability,
    loadClientAppointments,
    isMarketplaceLoading,
    marketplaceError,
    clientState,
    session,
    bookSlot,
    bookMarketplaceAppointment,
    getAvailableSlots,
    updateClientAppointmentResponse,
    redeemClientFlowPoints,
    toggleFavoriteArtist,
    updateClientProfile,
  } = useApp()
  const [bookingDate, setBookingDate] = useState(getTodayDateValue)
  const [profileDraft, setProfileDraft] = useState(clientState.profile)
  const [profileError, setProfileError] = useState('')
  const [searchMode, setSearchMode] = useState('Servicio')
  const [primaryService, setPrimaryService] = useState('Pestañas')
  const [secondaryService, setSecondaryService] = useState(searchServices.Pestañas[0].name)
  const [studioQuery, setStudioQuery] = useState('')
  const [selectedArtistProfile, setSelectedArtistProfile] = useState(null)
  const [selectedArtistPanelMode, setSelectedArtistPanelMode] = useState('')
  const [selectedMarketplaceServiceId, setSelectedMarketplaceServiceId] = useState('')
  const [selectedMarketplaceRewardId, setSelectedMarketplaceRewardId] = useState('')
  const [bookingNotice, setBookingNotice] = useState('')
  const [openDropdown, setOpenDropdown] = useState(null)
  const [recommendationMode, setRecommendationMode] = useState('')
  const [happyHourOnly, setHappyHourOnly] = useState(false)
  const [doublePointsOnly, setDoublePointsOnly] = useState(false)
  const [showPastAppointments, setShowPastAppointments] = useState(false)
  const [showAppointmentDateFilter, setShowAppointmentDateFilter] = useState(false)
  const [appointmentHistoryDate, setAppointmentHistoryDate] = useState('')
  const [visibleHistoryCount, setVisibleHistoryCount] = useState(5)
  const [respondingAppointmentId, setRespondingAppointmentId] = useState('')
  const [appointmentResponseNotice, setAppointmentResponseNotice] = useState(null)
  const [clientFlowPoints, setClientFlowPoints] = useState({ monthlyBalance: 0, monthlyEarned: 0, monthlySpent: 0, activeBalance: 0, expiringSoonPoints: 0, nextExpirationAt: null, validityDays: 90 })
  const [redeemDraft, setRedeemDraft] = useState({ points: '', targetId: '', targetQuery: '' })
  const [redeemStatus, setRedeemStatus] = useState('')
  const [locationDetection, setLocationDetection] = useState({ status: 'idle', message: '' })
  const [notificationPermission, setNotificationPermission] = useState(() => (
    canUseBrowserNotifications() ? Notification.permission : 'unsupported'
  ))
  const isRealMarketplace = !session.isMockSession
  const artistStudioMemberships = useMemo(
    () => deriveMembershipsFromLegacyData({ artists: adminState.artists }),
    [adminState.artists],
  )
  const getArtistMembership = (artist) => artist?.membership || getMembershipForArtist({
    artistId: artist?.artistId || artist?.id,
    artistStudioMemberships,
  })
  const getArtistStudio = (artist) => artist?.studio || getStudioForArtist({
    artistId: artist?.artistId || artist?.id,
    studios: adminState.studios,
    artistStudioMemberships,
  })
  const activeArtists = isRealMarketplace
    ? marketplaceListings
    : adminState.artists.filter((artist) => {
      const artistStudio = getArtistStudio(artist)
      return artist.status === 'Activo' && canUseOperationalFeature(artistStudio || artist, 'publicAgenda')
    })
  const marketplaceSearchServices = useMemo(() => {
    const groupsFromArtists = buildServiceGroupsFromListings(activeArtists)
    const mergedGroups = { ...searchServices }

    Object.entries(groupsFromArtists).forEach(([category, services]) => {
      const existingServices = mergedGroups[category] || []
      const servicesByName = new Map(existingServices.map((service) => [service.name, service]))

      services.forEach((service) => {
        servicesByName.set(service.name, {
          ...servicesByName.get(service.name),
          ...service,
        })
      })

      mergedGroups[category] = [...servicesByName.values()]
    })

    return mergedGroups
  }, [activeArtists, isRealMarketplace])
  const primaryServiceOptions = Object.keys(marketplaceSearchServices)
  const currentServiceGroup = marketplaceSearchServices[primaryService]
    || marketplaceSearchServices[primaryServiceOptions[0]]
    || []
  const marketplaceService =
    currentServiceGroup.find((service) => service.name === secondaryService)
    || currentServiceGroup[0]
    || { name: secondaryService || 'Servicio', durationMinutes: 60 }
  const selectedArtistMembership = selectedArtistProfile?.membership || getArtistMembership(selectedArtistProfile)
  const selectedArtistStudio = selectedArtistProfile?.studio || getArtistStudio(selectedArtistProfile)
  const selectedMarketplaceService = useMemo(() => {
    if (!isRealMarketplace || !selectedArtistProfile) return null

    const services = Array.isArray(selectedArtistProfile.marketplaceServiceOptions)
      ? selectedArtistProfile.marketplaceServiceOptions
      : []

    return services.find((service) => service.id === selectedMarketplaceServiceId)
      || services.find((service) => service.name === secondaryService)
      || services[0]
      || null
  }, [isRealMarketplace, secondaryService, selectedArtistProfile, selectedMarketplaceServiceId])
  const effectiveMarketplaceService = selectedMarketplaceService || marketplaceService
  const selectedMarketplaceServiceName = selectedMarketplaceService?.name || effectiveMarketplaceService.name || secondaryService
  const selectedServiceOfferingId = selectedMarketplaceService?.id || effectiveMarketplaceService.id || null
  const selectedArtistServiceGroups = useMemo(
    () => selectedArtistProfile ? buildServiceGroupsForArtist(selectedArtistProfile) : {},
    [selectedArtistProfile],
  )
  const selectedArtistPrimaryOptions = Object.keys(selectedArtistServiceGroups)
  const selectedArtistPrimaryService = selectedMarketplaceService?.category
    || selectedArtistPrimaryOptions.find((category) => selectedArtistServiceGroups[category]?.some((service) => service.name === secondaryService))
    || selectedArtistPrimaryOptions[0]
    || 'Servicios'
  const selectedArtistSecondaryGroup = selectedArtistServiceGroups[selectedArtistPrimaryService] || []
  const currentAvailabilityRequestKey = selectedArtistProfile?.listingId && bookingDate
    ? [selectedArtistProfile.listingId, selectedServiceOfferingId || '', bookingDate].join('|')
    : ''

  useEffect(() => {
    if (!isRealMarketplace) return
    if (!selectedArtistProfile?.listingId || !bookingDate) return

    loadMarketplaceAvailability({
      listingId: selectedArtistProfile.listingId,
      serviceOfferingId: selectedServiceOfferingId,
      date: bookingDate,
    })
  }, [
    bookingDate,
    isRealMarketplace,
    loadMarketplaceAvailability,
    selectedArtistProfile?.listingId,
    selectedServiceOfferingId,
  ])

  useEffect(() => {
    if (!isRealMarketplace) return undefined

    const refreshMarketplaceAfterExternalReturn = () => {
      if (document.visibilityState && document.visibilityState !== 'visible') return

      loadMarketplaceListings()
      if (selectedArtistProfile?.listingId && bookingDate) {
        loadMarketplaceAvailability({
          listingId: selectedArtistProfile.listingId,
          serviceOfferingId: selectedServiceOfferingId,
          date: bookingDate,
        })
      }
    }

    window.addEventListener('pageshow', refreshMarketplaceAfterExternalReturn)
    window.addEventListener('focus', refreshMarketplaceAfterExternalReturn)

    return () => {
      window.removeEventListener('pageshow', refreshMarketplaceAfterExternalReturn)
      window.removeEventListener('focus', refreshMarketplaceAfterExternalReturn)
    }
  }, [
    bookingDate,
    isRealMarketplace,
    loadMarketplaceAvailability,
    loadMarketplaceListings,
    selectedArtistProfile?.listingId,
    selectedServiceOfferingId,
  ])

  useEffect(() => {
    if (searchMode !== 'Servicio') return
    if (primaryServiceOptions.length === 0) return
    if (selectedArtistProfile && selectedMarketplaceServiceId) return

    const hasPrimaryService = Boolean(marketplaceSearchServices[primaryService])
    const nextPrimaryService = hasPrimaryService ? primaryService : primaryServiceOptions[0]
    const nextServiceGroup = marketplaceSearchServices[nextPrimaryService] || []
    const hasSecondaryService = nextServiceGroup.some((service) => service.name === secondaryService)

    if (!hasPrimaryService) {
      setPrimaryService(nextPrimaryService)
    }

    if (!hasSecondaryService && nextServiceGroup[0]?.name) {
      setSecondaryService(nextServiceGroup[0].name)
    }
  }, [
    marketplaceSearchServices,
    primaryService,
    primaryServiceOptions,
    searchMode,
    secondaryService,
    selectedArtistProfile,
    selectedMarketplaceServiceId,
  ])

  const availableSlots = useMemo(
    () => {
      const normalizeSlots = (slots = []) => {
        const seenSlots = new Set()
        const selectedArtistId = selectedArtistProfile?.artistId || selectedArtistProfile?.id || ''
        const selectedStudioId = selectedArtistProfile?.studioId || selectedArtistStudio?.id || ''
        const selectedMembershipId = selectedArtistProfile?.membershipId || selectedArtistMembership?.id || ''
        const slotBelongsToSelectedTarget = (slot = {}) => {
          const slotArtistId = slot.artistId || slot.artist_id || ''
          const slotStudioId = slot.studioId || slot.studio_id || ''
          const slotMembershipId = slot.membershipId || slot.membership_id || ''

          if (selectedMembershipId) return slotMembershipId === selectedMembershipId
          if (selectedStudioId) return slotStudioId === selectedStudioId && (!selectedArtistId || slotArtistId === selectedArtistId)
          return (!selectedArtistId || slotArtistId === selectedArtistId) && !slotStudioId && !slotMembershipId
        }

        return slots
          .filter(Boolean)
          .map((slot) => ({
            ...slot,
            isHappyHour: Boolean(slot.isHappyHour || isSlotWithinHappyHour(selectedArtistProfile, slot)),
          }))
          .filter((slot) => !slot.date || slot.date === bookingDate)
          .filter(slotBelongsToSelectedTarget)
          .filter((slot) => !happyHourOnly || slot.isHappyHour)
          .filter((slot) => {
            const slotKey = [
              slot.date,
              slot.time,
              slot.end,
              slot.serviceOfferingId || selectedServiceOfferingId || selectedMarketplaceService?.id || '',
              slot.artistId || slot.artist_id || '',
              slot.studioId || slot.studio_id || '',
              slot.membershipId || slot.membership_id || '',
            ].join('|')

            if (seenSlots.has(slotKey)) return false
            seenSlots.add(slotKey)
            return true
          })
          .sort((firstSlot, secondSlot) => (
            String(firstSlot.date || '').localeCompare(String(secondSlot.date || ''))
            || String(firstSlot.time || '').localeCompare(String(secondSlot.time || ''))
            || String(firstSlot.end || '').localeCompare(String(secondSlot.end || ''))
          ))
      }

      if (isRealMarketplace) {
        if (!currentAvailabilityRequestKey || availabilityState.requestKey !== currentAvailabilityRequestKey) return []
        return normalizeSlots(marketplaceAvailabilitySlots)
      }

      return normalizeSlots(getAvailableSlots({
        artistId: selectedArtistProfile?.id,
        studioId: selectedArtistStudio?.id || null,
        membershipId: selectedArtistMembership?.id || null,
        date: bookingDate,
        durationMinutes: effectiveMarketplaceService.durationMinutes || 60,
      }))
    },
    [
      bookingDate,
      effectiveMarketplaceService.durationMinutes,
      getAvailableSlots,
      isRealMarketplace,
      marketplaceAvailabilitySlots,
      availabilityState.requestKey,
      currentAvailabilityRequestKey,
      selectedMarketplaceService?.id,
      selectedServiceOfferingId,
      happyHourOnly,
      selectedArtistMembership?.id,
      selectedArtistProfile?.id,
      selectedArtistStudio?.id,
    ],
  )
  const noAvailabilityMessage = happyHourOnly
    ? `No hay espacio suficiente dentro de Happy Hour para ${selectedMarketplaceServiceName || 'este servicio'} en esta fecha. Prueba otro dia marcado o un servicio de menor duracion.`
    : 'La agenda del artista no permite reservas en esta fecha.'
  const getVisibleSlotCountForArtist = (artist) => {
    if (isRealMarketplace) return artist?.availability?.availableCount || 0

    const membership = getArtistMembership(artist)
    const studio = getArtistStudio(artist)
    return getAvailableSlots({
      artistId: artist?.id,
      studioId: studio?.id || null,
      membershipId: membership?.id || null,
      date: bookingDate,
      durationMinutes: effectiveMarketplaceService.durationMinutes || 60,
    }).filter((slot) => slot.available).length
  }
  useEffect(() => {
    if (!isRealMarketplace || !selectedArtistProfile) return

    const refreshedArtistProfile = marketplaceListings.find((listing) => (
      listing.id === selectedArtistProfile.id
      || listing.artistId === selectedArtistProfile.artistId
      || listing.listingId === selectedArtistProfile.listingId
    ))

    if (!refreshedArtistProfile) return

    const refreshedServices = Array.isArray(refreshedArtistProfile.marketplaceServiceOptions)
      ? refreshedArtistProfile.marketplaceServiceOptions
      : []
    const selectedServiceStillExists = !selectedMarketplaceServiceId
      || refreshedServices.some((service) => service.id === selectedMarketplaceServiceId)

    if (selectedArtistProfile !== refreshedArtistProfile) {
      setSelectedArtistProfile(refreshedArtistProfile)
    }

    if (!selectedServiceStillExists) {
      const fallbackService = refreshedServices[0]
      setSelectedMarketplaceServiceId(fallbackService?.id || '')
      if (fallbackService?.name) setSecondaryService(fallbackService.name)
    }
  }, [
    isRealMarketplace,
    marketplaceListings,
    selectedArtistProfile,
    selectedMarketplaceServiceId,
  ])

  const favoriteArtists = activeArtists
    .filter((artist) => (
      clientState.favoriteArtistIds.includes(artist.artistId || artist.id)
      && (isRealMarketplace || canUseOperationalFeature(getArtistStudio(artist) || artist, 'publicAgenda'))
    ))
    .map((artist) => (
      isRealMarketplace
        ? artist
        : hydrateMarketplaceArtist(artist, getVisibleSlotCountForArtist(artist), getArtistStudio(artist), getArtistMembership(artist))
    ))
  const hasRealClientSession = Boolean(session.client || session.profile)
  const clientLookupId = hasRealClientSession
    ? session.client?.id || clientState.profile?.id || session.profile?.id || ''
    : clientState.profile?.id || 'client-mf'
  const artistClientProfile = getClientById(artistState.clients, clientLookupId)
  const sessionClientProfile = session.client || {}
  const sessionProfile = session.profile || {}
  const sessionClientName = sessionClientProfile.display_name
    || sessionClientProfile.displayName
    || sessionProfile.display_name
    || sessionProfile.displayName
  const sessionClientEmail = sessionClientProfile.email || sessionProfile.email
  const sessionClientPhone = sessionClientProfile.phone || sessionProfile.phone
  const currentClient = {
    ...clientState.profile,
    ...(hasRealClientSession ? {} : artistClientProfile),
    id: clientLookupId || clientState.profile?.id || '',
    profileId: sessionProfile.id || clientState.profile?.profileId || '',
    name: sessionClientName || clientState.profile?.name || artistClientProfile?.name,
    email: sessionClientEmail || clientState.profile?.email || artistClientProfile?.email,
    phone: sessionClientPhone || clientState.profile?.phone || artistClientProfile?.phone,
    birthday: clientState.profile?.birthday || '',
    notes: clientState.profile?.notes || artistClientProfile?.notes,
    photoUrl: clientState.profile?.photoUrl || '',
    latitude: clientState.profile?.latitude || '',
    longitude: clientState.profile?.longitude || '',
    city: clientState.profile?.city || '',
    state: clientState.profile?.state || '',
    postalCode: clientState.profile?.postalCode || '',
    flowPoints: hasRealClientSession ? null : clientState.profile?.flowPoints || 0,
    vipTier: hasRealClientSession ? null : clientState.profile?.vipTier || 'Glow',
    streak: hasRealClientSession ? null : clientState.profile?.streak || 0,
    rewardsHistory: hasRealClientSession ? [] : artistClientProfile?.rewardsHistory || [],
  }
  const clientLocation = getClientLocation(currentClient)
  console.log('CLIENT DASHBOARD SESSION CLIENT', {
    hasRealClientSession,
    sessionClient: session.client,
    sessionProfile: session.profile,
    clientStateProfile: clientState.profile,
  })
  console.log('CLIENT DASHBOARD CURRENT CLIENT', currentClient)

  useEffect(() => {
    if (!hasRealClientSession) return

    setProfileDraft((currentDraft) => ({
      ...currentDraft,
      id: currentClient.id,
      profileId: currentClient.profileId,
      name: currentClient.name,
      email: currentClient.email,
      phone: currentClient.phone,
      birthday: currentClient.birthday,
      latitude: currentClient.latitude || '',
      longitude: currentClient.longitude || '',
      city: currentClient.city || '',
      state: currentClient.state || '',
      postalCode: currentClient.postalCode || '',
    }))
  }, [
    hasRealClientSession,
    currentClient.id,
    currentClient.profileId,
    currentClient.name,
    currentClient.email,
    currentClient.phone,
    currentClient.birthday,
    currentClient.latitude,
    currentClient.longitude,
    currentClient.city,
    currentClient.state,
    currentClient.postalCode,
  ])
  const handleClientPhotoChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const photoUrl = String(reader.result || '')
      setProfileDraft((currentDraft) => ({ ...currentDraft, photoUrl }))
      updateClientProfile({ photoUrl })
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  const removeClientPhoto = () => {
    setProfileDraft((currentDraft) => ({ ...currentDraft, photoUrl: '' }))
    updateClientProfile({ photoUrl: '' })
  }

  const saveClientProfile = async () => {
    const birthdayError = validateBirthDate(profileDraft.birthday)
    if (birthdayError) {
      setProfileError(birthdayError)
      return
    }

    setProfileError('')
    const savedProfile = await updateClientProfile(profileDraft)
    setProfileDraft((currentDraft) => ({ ...currentDraft, ...savedProfile }))
    setProfileError('Perfil guardado.')
  }

  const detectClientLocation = async () => {
    setLocationDetection({ status: 'loading', message: 'Detectando ubicacion actual...' })

    try {
      const coordinates = await getCurrentBrowserCoordinates()
      setProfileDraft((currentDraft) => ({
        ...currentDraft,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
      }))
      setLocationDetection({
        status: 'success',
        message: `Ubicacion detectada: ${coordinates.latitude}, ${coordinates.longitude}. Presiona Guardar perfil para actualizar recomendaciones.`,
      })
    } catch (error) {
      setLocationDetection({
        status: 'error',
        message: error.message || 'No se pudo usar la ubicacion actual.',
      })
    }
  }

  const realAppointmentSourceReady = !session.isMockSession && appointmentState.clientLoaded

  // Generar automatizaciones inteligentes
  const clientAutomations = hasRealClientSession ? [] : generateClientAutomations(currentClient, artistServices)

  const marketplaceArtists = useMemo(
    () => {
      const directSearchQuery = studioQuery.trim().toLowerCase()

      return activeArtists
        .map((artist) => {
          if (isRealMarketplace) return artist

          return hydrateMarketplaceArtist(artist, getVisibleSlotCountForArtist(artist), getArtistStudio(artist), getArtistMembership(artist))
        })
        .filter((artist) => {
          if (searchMode === 'Nombre estudio') {
            if (directSearchQuery.length < 2) return false

            const artistStudio = getStudioPublicProfile({
              artist,
              studios: adminState.studios,
              artistStudioMemberships,
            })
            const searchable = `${artist.name} ${artist.owner} ${artist.city} ${artistStudio.profile?.commercialName || ''}`.toLowerCase()
            return searchable.includes(directSearchQuery)
          }

          return !secondaryService || artist.marketplaceServices.includes(secondaryService)
        })
        .filter((artist) => recommendationMode !== 'today' || getTodayAvailabilityCount(artist) > 0)
        .filter((artist) => !happyHourOnly || hasActiveHappyHour(artist))
        .filter((artist) => !doublePointsOnly || hasActiveDoublePoints(artist))
        .sort((firstArtist, secondArtist) => {
          if (recommendationMode === 'nearby') {
            const firstProfile = getArtistPublicProfile(artistState, firstArtist)
            const firstStudio = getStudioPublicProfile({
              artist: firstArtist,
              studios: adminState.studios,
              artistStudioMemberships,
            })
            const secondProfile = getArtistPublicProfile(artistState, secondArtist)
            const secondStudio = getStudioPublicProfile({
              artist: secondArtist,
              studios: adminState.studios,
              artistStudioMemberships,
            })
            const firstLocation = getEffectiveProfessionalLocation(firstProfile, firstStudio, firstArtist).location
            const secondLocation = getEffectiveProfessionalLocation(secondProfile, secondStudio, secondArtist).location
            const firstDistance = calculateDistanceKm(clientLocation, firstLocation)
            const secondDistance = calculateDistanceKm(clientLocation, secondLocation)

            if (firstDistance !== null || secondDistance !== null) {
              return (firstDistance ?? Number.POSITIVE_INFINITY) - (secondDistance ?? Number.POSITIVE_INFINITY)
                || secondArtist.availabilityScore - firstArtist.availabilityScore
            }

            const clientCity = normalizeText(clientLocation.city)
            const clientState = normalizeText(clientLocation.state)
            const firstLocationScore = Number(clientCity && normalizeText(firstLocation.city || firstArtist.city).includes(clientCity))
              + Number(clientState && normalizeText(firstLocation.state).includes(clientState))
            const secondLocationScore = Number(clientCity && normalizeText(secondLocation.city || secondArtist.city).includes(clientCity))
              + Number(clientState && normalizeText(secondLocation.state).includes(clientState))

            return secondLocationScore - firstLocationScore
              || secondArtist.availabilityScore - firstArtist.availabilityScore
              || firstArtist.occupancy - secondArtist.occupancy
          }

          if (recommendationMode === 'today') {
            return getTodayAvailabilityCount(secondArtist) - getTodayAvailabilityCount(firstArtist)
              || secondArtist.availabilityScore - firstArtist.availabilityScore
              || firstArtist.occupancy - secondArtist.occupancy
          }

          return secondArtist.availabilityScore - firstArtist.availabilityScore
            || firstArtist.occupancy - secondArtist.occupancy
        })
    },
    [
      activeArtists,
      adminState.studios,
      artistStudioMemberships,
      artistState,
      bookingDate,
      clientLocation,
      getAvailableSlots,
      isRealMarketplace,
      effectiveMarketplaceService.durationMinutes,
      recommendationMode,
      searchMode,
      secondaryService,
      studioQuery,
      happyHourOnly,
      doublePointsOnly,
    ],
  )
  const bookedAppointments = realAppointmentSourceReady ? [] : agendaSettings.bookedSlots.map((slot) => ({
    artist: slot.artist || 'Artista',
    service: slot.service || 'Servicio reservado',
    date: slot.date,
    time: slot.time,
    address: 'Agenda Studio Flow',
    status: 'Reservada',
  }))
  const upcomingAppointments = realAppointmentSourceReady
    ? realClientAppointments
      .filter((appointment) => (
        !['Completada', 'Cancelada'].includes(appointment.status)
        && isFutureAppointmentDate(appointment)
      ))
      .sort((firstAppointment, secondAppointment) => (
        String(firstAppointment.date || '').localeCompare(String(secondAppointment.date || ''))
        || String(firstAppointment.time || '').localeCompare(String(secondAppointment.time || ''))
      ))
    : bookedAppointments
  const historicalAppointments = realAppointmentSourceReady
    ? realClientAppointments
      .filter((appointment) => (
        ['Completada', 'Cancelada', 'No show'].includes(appointment.status)
        || ['completed', 'cancelled', 'no_show'].includes(appointment.appointmentStatus)
        || !isFutureAppointmentDate(appointment)
      ))
      .filter((appointment) => appointmentHistoryDate || isCurrentMonthAppointment(appointment))
      .filter((appointment) => !appointmentHistoryDate || getAppointmentDateKey(appointment) === appointmentHistoryDate)
      .sort((firstAppointment, secondAppointment) => (
        String(secondAppointment.date || '').localeCompare(String(firstAppointment.date || ''))
        || String(secondAppointment.time || '').localeCompare(String(firstAppointment.time || ''))
      ))
    : []
  const visibleHistoricalAppointments = historicalAppointments.slice(0, visibleHistoryCount)
  const hasMoreHistoricalAppointments = visibleHistoryCount < historicalAppointments.length
  const nextAppointment = [...upcomingAppointments].sort((firstAppointment, secondAppointment) => (
    String(firstAppointment.date || '').localeCompare(String(secondAppointment.date || ''))
    || String(firstAppointment.time || '').localeCompare(String(secondAppointment.time || ''))
  ))[0]
  const pendingConfirmationAppointments = useMemo(() => upcomingAppointments.filter((appointment) => (
    appointment.confirmationRequestedAt
    && !appointment.clientConfirmedAt
    && !appointment.client_confirmed_at
  )), [upcomingAppointments])
  const pendingConfirmationCount = pendingConfirmationAppointments.length
  const canRespondToAppointment = (appointment = {}) => (
    appointment.id
    && !['completed', 'cancelled', 'no_show'].includes(String(appointment.appointmentStatus || '').toLowerCase())
    && !['Completada', 'Cancelada', 'No show'].includes(appointment.status)
  )
  const canConfirmAppointment = (appointment = {}) => (
    canRespondToAppointment(appointment)
    && !appointment.clientConfirmedAt
    && !appointment.client_confirmed_at
  )
  const respondToAppointment = async (appointmentId, action) => {
    setRespondingAppointmentId(appointmentId)
    setAppointmentResponseNotice(null)
    try {
      await updateClientAppointmentResponse({ appointmentId, action })
      setAppointmentResponseNotice(action === 'cancel'
        ? {
          tone: 'danger',
          title: 'Cancelacion registrada',
          message: 'Gracias por avisarnos de tu cancelacion. Puedes consultar esta cita en tu historial.',
        }
        : {
          tone: 'success',
          title: 'Cita confirmada',
          message: 'Tu artista o estudio ya puede ver que confirmaste tu asistencia.',
        })
    } finally {
      setRespondingAppointmentId('')
    }
  }

  useEffect(() => {
    if (!hasRealClientSession) return undefined

    let isActive = true
    fetchClientFlowPointsBalance()
      .then((balance) => {
        if (isActive) setClientFlowPoints(balance)
      })
      .catch(() => {
        if (isActive) setClientFlowPoints({ monthlyBalance: 0, monthlyEarned: 0, monthlySpent: 0, activeBalance: 0, expiringSoonPoints: 0, nextExpirationAt: null, validityDays: 90 })
      })

    return () => {
      isActive = false
    }
  }, [hasRealClientSession, realClientAppointments])

  useEffect(() => {
    if (!appointmentResponseNotice) return undefined

    const noticeTimer = window.setTimeout(() => {
      setAppointmentResponseNotice(null)
    }, 8000)

    return () => window.clearTimeout(noticeTimer)
  }, [appointmentResponseNotice])

  const redeemTargets = useMemo(() => {
    const targets = new Map()
    realClientAppointments.forEach((appointment) => {
      if (appointment.studioId) {
        targets.set(`studio:${appointment.studioId}`, {
          id: appointment.studioId,
          type: 'studio',
          label: appointment.contextName || appointment.room || 'Estudio',
        })
        return
      }

      if (appointment.artistId) {
        targets.set(`artist:${appointment.artistId}`, {
          id: appointment.artistId,
          type: 'artist',
          label: appointment.artist || appointment.contextName || 'Artista',
        })
      }
    })

    return [...targets.values()]
  }, [realClientAppointments])
  const redeemTargetMatches = useMemo(() => {
    const query = redeemDraft.targetQuery.trim().toLowerCase()
    if (query.length < 2) return []

    return redeemTargets
      .filter((target) => target.label.toLowerCase().includes(query))
      .slice(0, 5)
  }, [redeemDraft.targetQuery, redeemTargets])

  const redeemFlowPoints = async () => {
    const target = redeemTargets.find((item) => `${item.type}:${item.id}` === redeemDraft.targetId)
    const points = Number(redeemDraft.points)

    if (!target || !Number.isFinite(points) || points <= 0) {
      setRedeemStatus('Elige cuantos puntos y donde canjearlos.')
      return
    }

    const payload = await redeemClientFlowPoints({
      points,
      artistId: target.type === 'artist' ? target.id : null,
      studioId: target.type === 'studio' ? target.id : null,
    })

    if (payload) {
      setClientFlowPoints((current) => ({
        ...current,
        monthlyBalance: Number(payload.monthlyBalance || payload.monthly_balance || 0),
      }))
      setRedeemDraft({ points: '', targetId: '', targetQuery: '' })
      setRedeemStatus('Flow Points canjeados.')
    }
  }
  const enableAppointmentNotifications = async () => {
    if (!canUseBrowserNotifications()) return

    const permission = await Notification.requestPermission()
    setNotificationPermission(permission)

    if (permission === 'granted') {
      pendingConfirmationAppointments.forEach((appointment) => {
        showAppointmentBrowserNotification(appointment)
        storeConfirmationNoticeKey(getConfirmationNoticeKey(appointment))
      })
    }
  }

  useEffect(() => {
    setVisibleHistoryCount(5)
  }, [appointmentHistoryDate, showPastAppointments])

  useEffect(() => {
    if (!canUseBrowserNotifications()) return

    setNotificationPermission(Notification.permission)
  }, [])

  useEffect(() => {
    if (!canUseBrowserNotifications() || Notification.permission !== 'granted') return

    const seenKeys = new Set(getStoredConfirmationNoticeKeys())
    pendingConfirmationAppointments.forEach((appointment) => {
      const noticeKey = getConfirmationNoticeKey(appointment)
      if (!noticeKey || seenKeys.has(noticeKey)) return

      showAppointmentBrowserNotification(appointment)
      storeConfirmationNoticeKey(noticeKey)
    })
  }, [pendingConfirmationAppointments])

  const reserveSlot = async (slot) => {
    console.error('[BOOKING TRACE]', 'ClientDashboard reserveSlot entry', {
      slot,
      isRealMarketplace,
      selectedServiceOfferingId,
      selectedMarketplaceService,
      selectedArtistProfile,
    })

    if (!slot.available) return
    setBookingNotice('')

    if (isRealMarketplace) {
      console.error('[BOOKING TRACE]', 'ClientDashboard real marketplace branch', {
        slot,
        selectedServiceOfferingId,
        selectedMarketplaceService,
        selectedArtistProfile,
      })

      console.log('[BOOKING] click reserve', {
        slot,
        selectedMarketplaceService,
        selectedArtistProfile,
      })

      const serviceOfferingId = slot.serviceOfferingId || selectedServiceOfferingId
      const availabilitySlotIds = slot.availabilitySlotIds?.length
        ? slot.availabilitySlotIds
        : [slot.availabilitySlotId || slot.id]

      console.error('[BOOKING TRACE]', 'ClientDashboard calling bookMarketplaceAppointment', {
        availabilitySlotIds,
        serviceOfferingId,
        rewardId: selectedMarketplaceRewardId || null,
      })

      try {
        const booking = await bookMarketplaceAppointment({
          availabilitySlotIds,
          serviceOfferingId,
          rewardId: selectedMarketplaceRewardId || null,
        })

        console.error('[BOOKING TRACE]', 'ClientDashboard bookMarketplaceAppointment returned', {
          booking,
        })

        if (booking) {
          await loadClientAppointments()
          await loadMarketplaceAvailability({
            listingId: selectedArtistProfile?.listingId,
            serviceOfferingId,
            date: bookingDate,
          })
          setBookingNotice('Reservado con exito. Tu cita ya aparece en Citas.')
          setSelectedArtistPanelMode('')
          setSelectedMarketplaceRewardId('')
        } else {
          setBookingNotice(bookingError || 'No se pudo reservar. Revisa que el horario siga disponible.')
        }
      } catch (error) {
        setBookingNotice(error?.message || 'No se pudo reservar. Revisa que el horario siga disponible.')
      }

      return
    }

    if (!selectedArtistProfile?.id) return

    bookSlot({
      ...slot,
      artistId: selectedArtistProfile.id,
      studioId: selectedArtistStudio?.id || null,
      membershipId: selectedArtistMembership?.id || null,
      artist: selectedArtistProfile?.owner || selectedArtistProfile?.name || 'Artista',
      service: effectiveMarketplaceService.name,
      durationMinutes: effectiveMarketplaceService.durationMinutes,
    })
  }

  const getNextServiceForArtist = (artist) => {
    const services = artist?.marketplaceServices || []
    if (services.includes(secondaryService)) return secondaryService

    return services[0] || secondaryService
  }

  const getInitialServiceForArtistProfile = (artist) => {
    const services = Array.isArray(artist?.marketplaceServiceOptions)
      ? artist.marketplaceServiceOptions
      : []

    return services.find((service) => service.name === secondaryService)
      || services[0]
      || { id: '', name: getNextServiceForArtist(artist) }
  }

  const getSlotServiceName = (slot) => {
    const services = selectedArtistProfile?.marketplaceServiceOptions || []
    const service = services.find((item) => item.id === (slot.serviceOfferingId || slot.service_offering_id))

    return service?.name || selectedMarketplaceServiceName || effectiveMarketplaceService.name
  }

  const getSlotFlowPoints = (slot) => {
    const services = selectedArtistProfile?.marketplaceServiceOptions || []
    const service = services.find((item) => item.id === (slot.serviceOfferingId || slot.service_offering_id))
      || selectedMarketplaceService
      || effectiveMarketplaceService
    const multiplier = getActiveDoublePointsMultiplier(selectedArtistProfile)

    return Number(service?.flowPointsAwarded || service?.flow_points_awarded || 0) * multiplier
  }

  const selectedArtistFlowPointsActive = Boolean(selectedArtistProfile) && (
    selectedArtistProfile?.activePromotions?.some((promotion) => (
    (promotion.type || promotion.promotion_type) === 'private_promo'
    && (promotion.name || '').toLowerCase().includes('flow points')
  )) || selectedArtistProfile?.rewards?.some((reward) => reward.status === 'active')
  )

  const openArtistProfile = (artist, { mode = 'profile' } = {}) => {
    const nextService = getInitialServiceForArtistProfile(artist)

    setSelectedArtistProfile(artist)
    setSelectedArtistPanelMode(mode)
    setSelectedMarketplaceServiceId(nextService.id || '')
    setSecondaryService(nextService.name || getNextServiceForArtist(artist))
    setBookingNotice('')
    setOpenDropdown(null)
  }

  const closeArtistProfile = () => {
    setSelectedArtistProfile(null)
    setSelectedArtistPanelMode('')
    setSelectedMarketplaceServiceId('')
    setSelectedMarketplaceRewardId('')
    setBookingNotice('')
    setOpenDropdown(null)
  }

  const selectRecommendationMode = (nextMode) => {
    setRecommendationMode((currentMode) => currentMode === nextMode ? '' : nextMode)
    closeArtistProfile()

    if (nextMode === 'today') {
      setBookingDate(getTodayDateValue())
    }
  }

  const changeSelectedMarketplaceService = (nextServiceName) => {
    const services = Array.isArray(selectedArtistProfile?.marketplaceServiceOptions)
      ? selectedArtistProfile.marketplaceServiceOptions
      : []
    const nextService = services.find((service) => service.name === nextServiceName)

    setSelectedMarketplaceServiceId(nextService?.id || '')
    setSecondaryService(nextService?.name || nextServiceName)
    setSelectedMarketplaceRewardId('')
  }

  const changeSelectedArtistPrimaryService = (nextPrimaryService) => {
    const nextService = selectedArtistServiceGroups[nextPrimaryService]?.[0]
    setSelectedMarketplaceServiceId(nextService?.id || '')
    setSecondaryService(nextService?.name || '')
    setSelectedMarketplaceRewardId('')
    setOpenDropdown(null)
  }

  const renderMarketplaceBookingPanel = (artist, dropdownPrefix = 'marketplace') => (
    <div className="public-profile-panel booking-only-panel">
      <div className="form-stack compact-form public-booking-flow">
        {happyHourOnly && (
          <div className="happy-hour-calendar-hint">
            <span>Happy Hour disponible</span>
            <div>
              {getHappyHourWeekdays(artist).length > 0 ? (
                getHappyHourWeekdays(artist).map((weekday) => (
                  <strong key={weekday}>{weekday}</strong>
                ))
              ) : (
                <small>Esta promocion no tiene dias configurados.</small>
              )}
            </div>
          </div>
        )}
        <PremiumDropdown
          label="Servicio primario"
          value={selectedArtistPrimaryService}
          open={openDropdown === `${dropdownPrefix}PrimaryService`}
          onToggle={() => setOpenDropdown(openDropdown === `${dropdownPrefix}PrimaryService` ? null : `${dropdownPrefix}PrimaryService`)}
          onChange={changeSelectedArtistPrimaryService}
          options={selectedArtistPrimaryOptions.map((category) => ({
            value: category,
            label: category,
            meta: `${selectedArtistServiceGroups[category]?.length || 0} opciones`,
          }))}
        />
        <PremiumDropdown
          label="Servicio secundario"
          value={selectedMarketplaceServiceName}
          open={openDropdown === `${dropdownPrefix}SecondaryService`}
          onToggle={() => setOpenDropdown(openDropdown === `${dropdownPrefix}SecondaryService` ? null : `${dropdownPrefix}SecondaryService`)}
          onChange={changeSelectedMarketplaceService}
          options={selectedArtistSecondaryGroup.map((service) => ({
            value: service.name,
            label: service.name,
            meta: `${service.durationMinutes || 60} min`,
          }))}
        />
        <label className="input-field">
          <span>Fecha</span>
          <input type="date" min={getTodayDateValue()} value={bookingDate} onChange={(event) => setBookingDate(event.target.value)} />
        </label>
        {selectedArtistFlowPointsActive && artist.rewards?.length > 0 && (
          <label className="input-field">
            <span>Usar Flow Points</span>
            <select value={selectedMarketplaceRewardId} onChange={(event) => setSelectedMarketplaceRewardId(event.target.value)}>
              <option value="">No usar puntos en esta cita</option>
              {artist.rewards.map((reward) => (
                <option value={reward.id} key={reward.id}>
                  {reward.discountPercent}% descuento / {reward.pointsCost} puntos
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="public-slot-list public-slot-grid" id={`marketplace-slots-${artist.id}`}>
        {availableSlots.length > 0 ? (
          availableSlots.map((slot) => (
            <button
              className={`public-slot-button${slot.isHappyHour ? ' happy-hour-slot' : ''}`}
              disabled={!slot.available || isBookingLoading}
              key={`${artist.id}-${slot.date}-${slot.time}-${slot.end}`}
              onClick={() => reserveSlot(slot)}
              type="button"
            >
              <strong>{slot.time}</strong>
              <span>{slot.end}</span>
              {slot.isHappyHour && <small>{slot.happyHourDiscountPercent}% off</small>}
              <small>{getSlotFlowPoints(slot)} pts</small>
            </button>
          ))
        ) : (
          <div className="list-row elevated-row">
            <div>
              <strong>{isAvailabilityLoading ? 'Cargando horarios...' : happyHourOnly ? 'Sin horarios disponibles para Happy Hour' : 'Sin horarios disponibles'}</strong>
              <small>{availabilityError || noAvailabilityMessage}</small>
            </div>
            <StatusPill tone="neutral">No disponible</StatusPill>
          </div>
        )}
      </div>
      {bookingNotice && (
        <div className={`list-row elevated-row ${bookingNotice.toLowerCase().includes('exito') ? 'booking-success-row' : 'booking-error-row'}`}>
          <div>
            <strong>{bookingNotice.toLowerCase().includes('exito') ? 'Reservado con exito' : 'No se pudo reservar'}</strong>
            <small>{bookingNotice}</small>
          </div>
          <StatusPill tone={bookingNotice.toLowerCase().includes('exito') ? 'success' : 'danger'}>
            Reserva
          </StatusPill>
        </div>
      )}
      {bookingError && (
        <div className="list-row elevated-row">
          <div>
            <strong>No se pudo reservar</strong>
            <small>{bookingError}</small>
          </div>
          <StatusPill tone="neutral">Reserva</StatusPill>
        </div>
      )}
    </div>
  )

  const renderFavoriteDirectionsPanel = ({ address, location, source, directionsUrl }) => (
    <div className="public-profile-panel favorite-directions-panel">
      <section className="public-profile-section">
        <h4>Direccion</h4>
        <p>{address || 'Direccion pendiente por confirmar.'}</p>
        {directionsUrl && (
          <Button variant="primary" onClick={() => openDirections(location, source)}>
            Abrir en Maps
          </Button>
        )}
      </section>
    </div>
  )

  return (
    <main className={`dashboard-grid client-grid view-${view}`}>
        {view === 'inicio' && (
          <>
            <section className="hero-panel client-hero mobile-screen">
              <div className="client-hero-photo">
                {currentClient.photoUrl ? (
                  <img src={currentClient.photoUrl} alt={`Foto de ${currentClient.name}`} />
                ) : (
                  <span>Agregar foto</span>
                )}
              </div>
              <div>
                <span className="client-hero-greeting">Hola</span>
                <strong className="client-hero-name">{currentClient.name}</strong>
                <h2>Tu universo beauty premium</h2>
                <div className="hero-actions">
                  <Button onClick={() => navigate(paths.clientExplore)}>Agendar ahora</Button>
                  <Button variant="ghost" onClick={() => navigate(paths.clientAppointments)}>Ver mis citas</Button>
                </div>
              </div>
              <div className="hero-summary client-hero-summary">
                <strong>{upcomingAppointments.length} citas próximas</strong>
              </div>
            </section>

            <Card className="mobile-screen flow-points-client-card">
              <PanelHeader title="Flow Points" eyebrow={`Vigencia ${clientFlowPoints.validityDays || 90} dias`} />
              <div className="flow-points-client-balance">
                <span>Puntos disponibles</span>
                <strong>{clientFlowPoints.activeBalance ?? clientFlowPoints.monthlyBalance}</strong>
              </div>
              {clientFlowPoints.expiringSoonPoints > 0 && (
                <div className="points-expiring-warning">
                  <strong>{clientFlowPoints.expiringSoonPoints} puntos por caducar</strong>
                  <small>Usalos pronto para aprovechar tus beneficios antes de que venza su vigencia.</small>
                </div>
              )}
              <div className="location-form-grid">
                <Input
                  label="Puntos a usar"
                  min="1"
                  max={(clientFlowPoints.activeBalance ?? clientFlowPoints.monthlyBalance) || 1}
                  type="number"
                  value={redeemDraft.points}
                  onChange={(event) => setRedeemDraft((draft) => ({ ...draft, points: event.target.value }))}
                />
                <Input
                  label="Buscar artista o estudio"
                  placeholder="Escribe el nombre..."
                  type="search"
                  value={redeemDraft.targetQuery}
                  onChange={(event) => setRedeemDraft((draft) => ({
                    ...draft,
                    targetId: '',
                    targetQuery: event.target.value,
                  }))}
                />
              </div>
              {redeemDraft.targetId && (
                <div className="selected-client-result">
                  <strong>{redeemTargets.find((target) => `${target.type}:${target.id}` === redeemDraft.targetId)?.label}</strong>
                  <small>Seleccionado para canje</small>
                </div>
              )}
              {!redeemDraft.targetId && redeemTargetMatches.length > 0 && (
                <div className="compact-list flow-points-target-results">
                  {redeemTargetMatches.map((target) => (
                    <button
                      className="list-row elevated-row"
                      key={`${target.type}:${target.id}`}
                      type="button"
                      onClick={() => setRedeemDraft((draft) => ({
                        ...draft,
                        targetId: `${target.type}:${target.id}`,
                        targetQuery: target.label,
                      }))}
                    >
                      <div>
                        <strong>{target.label}</strong>
                        <small>{target.type === 'studio' ? 'Estudio' : 'Artista'}</small>
                      </div>
                      <StatusPill tone="success">Elegir</StatusPill>
                    </button>
                  ))}
                </div>
              )}
              <Button
                className="full-width"
                disabled={!(clientFlowPoints.activeBalance ?? clientFlowPoints.monthlyBalance) || !redeemDraft.targetId}
                onClick={redeemFlowPoints}
              >
                Canjear puntos
              </Button>
              {redeemStatus && <small>{redeemStatus}</small>}
            </Card>

            {pendingConfirmationCount > 0 && (
              <Card className="mobile-screen primary-panel">
                <PanelHeader title="Confirma tu asistencia" eyebrow="Aviso de cita" />
                <div className="compact-list">
                  {pendingConfirmationAppointments.slice(0, 2).map((appointment) => (
                    <div className={`list-row elevated-row appointment-status-row appointment-status-${getAppointmentStatusTone(appointment)}`} key={appointment.id}>
                      <div>
                        <strong>{appointment.service || 'Servicio agendado'}</strong>
                        <small>{appointment.contextName || appointment.artist || 'Studio Flow'} / {appointment.date} {appointment.time}</small>
                      </div>
                      <div className="row-actions appointment-result-actions" style={{ justifyContent: 'flex-end', gap: 6 }}>
                        <Button
                          size="sm"
                          variant="success"
                          disabled={respondingAppointmentId === appointment.id}
                          onClick={() => respondToAppointment(appointment.id, 'confirm')}
                        >
                          Confirmar
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={respondingAppointmentId === appointment.id}
                          onClick={() => respondToAppointment(appointment.id, 'cancel')}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ))}
                  {notificationPermission === 'default' && (
                    <Button className="full-width" variant="ghost" onClick={enableAppointmentNotifications}>
                      Activar notificaciones
                    </Button>
                  )}
                </div>
              </Card>
            )}

            {appointmentResponseNotice && (
              <Card className="mobile-screen primary-panel">
                <div className={`list-row elevated-row appointment-status-row appointment-status-${appointmentResponseNotice.tone}`}>
                  <div>
                    <strong>{appointmentResponseNotice.title}</strong>
                    <small>{appointmentResponseNotice.message}</small>
                  </div>
                  <StatusPill tone={appointmentResponseNotice.tone}>
                    Cita
                  </StatusPill>
                </div>
              </Card>
            )}

            <Card className="mobile-screen primary-panel client-next-appointment-card">
              <PanelHeader title="Tu próxima cita" eyebrow="Agenda activa" />
              {nextAppointment ? (
                <article className="client-next-appointment">
                  <div className="date-block">
                    <strong>{nextAppointment.date}</strong>
                    <span>{nextAppointment.time || '--:--'}</span>
                  </div>
                  <div>
                    <h3>{nextAppointment.service || 'Servicio agendado'}</h3>
                    <p>{nextAppointment.artist || 'Artista'} / {nextAppointment.contextName || nextAppointment.address || 'Ubicacion por confirmar'}</p>
                    <small className="flow-points-slot-note client-flow-points-highlight">
                      {nextAppointment.pointsGranted > 0
                        ? `${nextAppointment.pointsGranted} Flow Points otorgados`
                        : `Otorga ${nextAppointment.flowPointsAwarded || 0} Flow Points al finalizar`}
                    </small>
                  </div>
                  <div className="row-actions" style={{ justifyContent: 'flex-end', gap: 6 }}>
                    {canRespondToAppointment(nextAppointment) && (
                      <>
                        {canConfirmAppointment(nextAppointment) && (
                          <Button
                            size="sm"
                            variant="success"
                            disabled={respondingAppointmentId === nextAppointment.id}
                            onClick={() => respondToAppointment(nextAppointment.id, 'confirm')}
                          >
                            Confirmar
                          </Button>
                        )}
                        {!canConfirmAppointment(nextAppointment) && (
                          <StatusPill tone="success">Cita confirmada</StatusPill>
                        )}
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={respondingAppointmentId === nextAppointment.id}
                          onClick={() => respondToAppointment(nextAppointment.id, 'cancel')}
                        >
                          Cancelar
                        </Button>
                      </>
                    )}
                  </div>
                </article>
              ) : (
                <article className="client-next-appointment">
                  <div className="date-block">
                    <strong>Sin cita</strong>
                    <span>--:--</span>
                  </div>
                  <div>
                    <h3>{isClientAppointmentsLoading ? 'Consultando tu agenda...' : 'No tienes citas activas'}</h3>
                    <p>{isClientAppointmentsLoading ? 'Estamos revisando tus reservas.' : 'Agenda un servicio para verlo aqui.'}</p>
                  </div>
                  <StatusPill tone="neutral">Vacio</StatusPill>
                </article>
              )}
            </Card>

            {clientAutomations.length > 0 && (
              <section className="automations-grid mobile-screen">
                <PanelHeader title="Recomendaciones inteligentes" eyebrow="Para ti" />
                <div className="automations-stack">
                  {clientAutomations.map((automation) => (
                    <Card key={automation.type} className="automation-card">
                      <div className="automation-header">
                        <div>
                          <h3>{automation.title}</h3>
                          <p>{automation.message}</p>
                        </div>
                        <span className={`automation-badge priority-${automation.priority}`}>
                          {automation.priority === 'critical' && '🔴'}
                          {automation.priority === 'high' && '🟠'}
                          {automation.priority === 'medium' && '🟡'}
                          {automation.priority === 'low' && '🟢'}
                        </span>
                      </div>
                      <Button onClick={() => navigate(paths.clientExplore)}>{automation.ctaText}</Button>
                    </Card>
                  ))}
                </div>
              </section>
            )}

          </>
        )}

        {view === 'citas' && (
          <>
            <Card className="wide-card mobile-screen primary-panel">
              <PanelHeader title="Proximas citas" eyebrow="Confirmadas" />
              {bookingState.successMessage && (
                <div className="list-row elevated-row">
                  <div>
                    <strong>{bookingState.successMessage}</strong>
                    <small>Tu cita ya aparece en este listado.</small>
                  </div>
                  <StatusPill tone="success">Lista</StatusPill>
                </div>
              )}
              {bookingError && (
                <div className="list-row elevated-row">
                  <div>
                    <strong>No se pudo actualizar la cita</strong>
                    <small>{bookingError}</small>
                  </div>
                  <StatusPill tone="neutral">Cita</StatusPill>
                </div>
              )}
              {pendingConfirmationCount > 0 && (
                <div className="list-row elevated-row">
                  <div>
                    <strong>Confirma tu asistencia</strong>
                    <small>{pendingConfirmationCount === 1 ? 'Tienes una cita esperando respuesta.' : `Tienes ${pendingConfirmationCount} citas esperando respuesta.`}</small>
                  </div>
                  {notificationPermission === 'default' ? (
                    <Button size="sm" variant="ghost" onClick={enableAppointmentNotifications}>
                      Activar notificaciones
                    </Button>
                  ) : (
                    <StatusPill tone="warm">Pendiente</StatusPill>
                  )}
                </div>
              )}
              {appointmentResponseNotice && (
                <div className={`list-row elevated-row appointment-status-row appointment-status-${appointmentResponseNotice.tone}`}>
                  <div>
                    <strong>{appointmentResponseNotice.title}</strong>
                    <small>{appointmentResponseNotice.message}</small>
                  </div>
                  <StatusPill tone={appointmentResponseNotice.tone}>Cita</StatusPill>
                </div>
              )}
              <div className="appointment-stack">
                {upcomingAppointments.length > 0 ? upcomingAppointments.map((appointment) => (
                  <article className={`client-appointment appointment-status-row appointment-status-${getAppointmentStatusTone(appointment)}`} key={`${appointment.artist}-${appointment.time}-${appointment.date}`}>
                    <div className="date-block">
                      <strong>{appointment.date}</strong>
                      <span>{appointment.time}</span>
                    </div>
                    <div>
                      <h3>{appointment.service}</h3>
                      <p>{appointment.artist} / {appointment.contextName || appointment.address}</p>
                      <small className="flow-points-slot-note">
                        {appointment.pointsGranted > 0
                          ? `${appointment.pointsGranted} Flow Points otorgados`
                          : `Otorga ${appointment.flowPointsAwarded || 0} Flow Points al finalizar`}
                      </small>
                    </div>
                    <div className="row-actions appointment-result-actions" style={{ justifyContent: 'flex-end', gap: 6 }}>
                      {canRespondToAppointment(appointment) && (
                        <>
                          {canConfirmAppointment(appointment) && (
                            <Button
                              size="sm"
                              variant="success"
                              disabled={respondingAppointmentId === appointment.id}
                              onClick={() => respondToAppointment(appointment.id, 'confirm')}
                            >
                              Confirmar
                            </Button>
                          )}
                          {!canConfirmAppointment(appointment) && (
                            <StatusPill tone="success">Cita confirmada</StatusPill>
                          )}
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={respondingAppointmentId === appointment.id}
                            onClick={() => respondToAppointment(appointment.id, 'cancel')}
                          >
                            Cancelar
                          </Button>
                        </>
                      )}
                    </div>
                  </article>
                )) : (
                  <article className="client-appointment">
                    <div className="date-block">
                      <strong>Sin citas</strong>
                      <span>--:--</span>
                    </div>
                    <div>
                      <h3>{isClientAppointmentsLoading ? 'Cargando citas...' : 'No tienes citas proximas'}</h3>
                      <p>{isClientAppointmentsLoading ? 'Estamos consultando tus reservas reales.' : 'Cuando reserves un servicio aparecera aqui.'}</p>
                    </div>
                    <StatusPill tone="neutral">Vacio</StatusPill>
                  </article>
                )}
              </div>
            </Card>
            <Card className="mobile-screen">
              <PanelHeader
                title="Citas pasadas"
                eyebrow="Historial"
                action={(
                  <Button size="sm" variant="ghost" onClick={() => setShowPastAppointments((current) => !current)}>
                    {showPastAppointments ? 'Ocultar' : 'Mostrar mis citas pasadas'}
                  </Button>
                )}
              />
              {showPastAppointments && (
                <>
                  <div className="history-actions">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowAppointmentDateFilter((current) => !current)}
                    >
                      Filtrar
                    </Button>
                    {appointmentHistoryDate && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setAppointmentHistoryDate('')}
                      >
                        Limpiar filtro
                      </Button>
                    )}
                  </div>
                  {showAppointmentDateFilter && (
                    <label className="input-field history-date-filter">
                      <span>Fecha</span>
                      <input
                        type="date"
                        value={appointmentHistoryDate}
                        onChange={(event) => setAppointmentHistoryDate(event.target.value)}
                      />
                    </label>
                  )}
                  <div className="compact-list">
                    {visibleHistoricalAppointments.length > 0 ? visibleHistoricalAppointments.map((item) => (
                      <div className="list-row elevated-row" key={`${item.id || item.service}-${item.date}-${item.time || ''}`}>
                        <div>
                          <strong>{item.service}</strong>
                          <small>{item.artist} / {item.date}</small>
                        </div>
                        <StatusPill tone="neutral">{item.status || 'Finalizada'}</StatusPill>
                      </div>
                    )) : (
                      <div className="list-row elevated-row">
                        <div>
                          <strong>{isClientAppointmentsLoading ? 'Cargando historial...' : 'Sin citas pasadas'}</strong>
                          <small>
                            {appointmentHistoryDate
                              ? 'No hay citas registradas en la fecha seleccionada.'
                              : 'Solo se muestra historial del mes en curso.'}
                          </small>
                        </div>
                        <StatusPill tone="neutral">Vacio</StatusPill>
                      </div>
                    )}
                    {hasMoreHistoricalAppointments && (
                      <Button
                        className="full-width"
                        variant="ghost"
                        onClick={() => setVisibleHistoryCount((current) => current + 5)}
                      >
                        Mostrar mas
                      </Button>
                    )}
                  </div>
                </>
              )}
            </Card>
          </>
        )}

        {view === 'explorar' && (
          <Card className="mobile-screen primary-panel">
            <PanelHeader title="Busqueda de artistas" eyebrow="Explorar" />
            <section className="client-recommendation-panel" aria-label="Recomendaciones de busqueda">
              <div className="client-recommendation-heading">
                <span className="eyebrow">Busqueda inteligente</span>
                <h3>Recomiendame</h3>
                <small>Elige una prioridad y Studio Flow acomoda los resultados.</small>
              </div>
              <div className="client-recommendation-actions">
                <button
                  className={`recommendation-choice${recommendationMode === 'nearby' ? ' is-active' : ''}`}
                  type="button"
                  onClick={() => selectRecommendationMode('nearby')}
                >
                  <strong>Cerca de mi</strong>
                  {recommendationMode === 'nearby' && <span>Seleccionado</span>}
                </button>
                <button
                  className={`recommendation-choice${recommendationMode === 'today' ? ' is-active' : ''}`}
                  type="button"
                  onClick={() => selectRecommendationMode('today')}
                >
                  <strong>Citas para hoy</strong>
                  {recommendationMode === 'today' && <span>Seleccionado</span>}
                </button>
              </div>
              {recommendationMode && (
                <p className="client-recommendation-status">
                  {recommendationMode === 'nearby'
                    ? 'Mostrando primero opciones cercanas.'
                    : 'Mostrando solo opciones con citas para hoy.'}
                </p>
              )}
              <div className="client-promo-filter-grid">
                <button
                  className={`client-promo-filter happy-hour${happyHourOnly ? ' is-active' : ''}`}
                  type="button"
                  aria-pressed={happyHourOnly}
                  onClick={() => {
                    setHappyHourOnly((current) => !current)
                    closeArtistProfile()
                  }}
                >
                  <span>Happy Hour</span>
                  <strong>{happyHourOnly ? 'Activo' : 'Filtrar'}</strong>
                  <small>Descuentos por horario</small>
                </button>
                <button
                  className={`client-promo-filter double-points${doublePointsOnly ? ' is-active' : ''}`}
                  type="button"
                  aria-pressed={doublePointsOnly}
                  onClick={() => {
                    setDoublePointsOnly((current) => !current)
                    closeArtistProfile()
                  }}
                >
                  <span>Puntos dobles</span>
                  <strong>{doublePointsOnly ? 'Activo' : 'Filtrar'}</strong>
                  <small>Más Flow Points por cita</small>
                </button>
              </div>
            </section>
            <div className="form-stack compact-form">
              <PremiumDropdown
                label="Buscar por"
                value={searchMode}
                open={openDropdown === 'searchMode'}
                onToggle={() => setOpenDropdown(openDropdown === 'searchMode' ? null : 'searchMode')}
                onChange={(nextMode) => {
                  setSearchMode(nextMode)
                  closeArtistProfile()
                }}
                options={[
                  { value: 'Servicio', label: 'Servicio', meta: 'Encuentra disponibilidad por tratamiento' },
                  { value: 'Nombre estudio', label: 'Nombre estudio', meta: 'Busca directo por artista o studio' },
                ]}
              />
              {searchMode === 'Servicio' ? (
                <>
                  <PremiumDropdown
                    label="Servicio primario"
                    value={primaryService}
                    open={openDropdown === 'primaryService'}
                    onToggle={() => setOpenDropdown(openDropdown === 'primaryService' ? null : 'primaryService')}
                    onChange={(nextPrimary) => {
                      setPrimaryService(nextPrimary)
                      setSecondaryService(marketplaceSearchServices[nextPrimary]?.[0]?.name || '')
                      closeArtistProfile()
                    }}
                    options={primaryServiceOptions.map((service) => ({
                      value: service,
                      label: service,
                      meta: `${marketplaceSearchServices[service].length} opciones`,
                    }))}
                  />
                  <PremiumDropdown
                    label="Servicio secundario"
                    value={secondaryService}
                    open={openDropdown === 'secondaryService'}
                    onToggle={() => setOpenDropdown(openDropdown === 'secondaryService' ? null : 'secondaryService')}
                    onChange={(nextService) => {
                      setSecondaryService(nextService)
                      closeArtistProfile()
                    }}
                    options={currentServiceGroup.map((service) => ({
                      value: service.name,
                      label: service.name,
                      meta: `${service.durationMinutes} min`,
                    }))}
                  />
                </>
              ) : (
                <Input
                  label="Nombre estudio"
                  type="search"
                        placeholder="Nombre de artista o estudio..."
                  value={studioQuery}
                  onChange={(event) => setStudioQuery(event.target.value)}
                />
              )}
            </div>
            {bookingNotice && (
              <div className={`list-row elevated-row ${bookingNotice.toLowerCase().includes('exito') ? 'booking-success-row' : 'booking-error-row'}`} style={{ marginTop: '14px' }}>
                <div>
                  <strong>{bookingNotice.toLowerCase().includes('exito') ? 'Reservado con exito' : 'No se pudo reservar'}</strong>
                  <small>{bookingNotice}</small>
                </div>
                <StatusPill tone={bookingNotice.toLowerCase().includes('exito') ? 'success' : 'danger'}>
                  Reserva
                </StatusPill>
              </div>
            )}
            <div className="artist-results" style={{ marginTop: '14px' }}>
              {marketplaceArtists.map((artist) => {
                const isFavorite = clientState.favoriteArtistIds.includes(artist.id)
                const publicArtistProfile = getArtistPublicProfile(artistState, artist)
                const studioProfile = getStudioPublicProfile({
                  artist,
                  studios: adminState.studios,
                  artistStudioMemberships,
                })
                const studioDisplayName = getStudioDisplayName(studioProfile)
                const effectiveLocationResult = getEffectiveProfessionalLocation(publicArtistProfile, studioProfile, artist)
                const effectiveLocation = effectiveLocationResult.location
                const directionsUrl = buildGoogleMapsUrl(effectiveLocation)
                const professionalAddress = formatProfessionalAddress(effectiveLocation, artist.city)
                const studioGallery = (studioProfile.profile?.gallery || []).slice(0, 5)
                const studioContactItems = getStudioContactItems(studioProfile)
                const artistPortfolio = publicArtistProfile.portfolio.slice(0, 12)
                const contactLinks = publicArtistProfile.contactLinks || {}
                const isSelectedArtist = selectedArtistProfile?.id === artist.id
                const isProfileOpen = isSelectedArtist && selectedArtistPanelMode === 'profile'
                const isBookingOpen = isSelectedArtist && selectedArtistPanelMode === 'booking'
                const isStudioListing = artist.profileType === 'studio'
                const profilePhotoUrl = isStudioListing
                  ? studioProfile.profile?.logoUrl || publicArtistProfile.photoUrl
                  : publicArtistProfile.photoUrl
                const profileDisplayName = isStudioListing
                  ? studioDisplayName || artist.title || artist.owner || 'Estudio beauty'
                  : publicArtistProfile.fullName || artist.owner || 'Artista beauty'
                const profileTypeLabel = isStudioListing ? 'Estudio' : 'Artista'
                const profileInitials = getArtistInitials(profileDisplayName)
                const artistBiography = publicArtistProfile.biography?.trim()
                const hasSocialLinks = contactLinks.whatsapp || contactLinks.instagram || contactLinks.facebook

                return (
                  <article className={`artist-result marketplace-result-card${isSelectedArtist ? ' is-expanded' : ''}`} key={artist.name}>
                    <div className="marketplace-result-summary">
                      <div className="marketplace-artist-avatar avatar">
                        {profilePhotoUrl ? (
                          <img src={profilePhotoUrl} alt={`Foto de ${profileDisplayName}`} />
                        ) : (
                          <span>{profileInitials}</span>
                        )}
                      </div>
                      <div className="marketplace-result-copy">
                        <strong>{profileDisplayName}</strong>
                        <small>{profileTypeLabel}</small>
                        <small>{artist.marketplaceServices.slice(0, 3).join(' • ')}</small>
                        <span className={`marketplace-availability availability-${artist.badge.level}`}>
                          {artist.badge.label}
                        </span>
                        {artist.activePromotions?.some((promotion) => promotion.type === 'happy_hour' || promotion.promotion_type === 'happy_hour') && (
                          <span className="happy-hour-badge">Happy Hour activo</span>
                        )}
                        {getActiveDoublePointsMultiplier(artist) > 1 && (
                          <span className="double-points-badge">Puntos dobles</span>
                        )}
                        {artist.rewards?.length > 0 && (
                          <span className={`flow-points-scope-badge ${artist.flowPointRedemptionScope === 'open' ? 'open' : 'exclusive'}`}>
                            ★ {artist.flowPointRedemptionScope === 'open' ? 'Puntos libres' : 'Puntos exclusivos'}
                          </span>
                        )}
                      </div>
                      <div className="marketplace-result-actions">
                        <button
                          className="marketplace-profile-button"
                          type="button"
                          aria-expanded={isProfileOpen}
                          onClick={() => {
                            if (isProfileOpen) {
                              closeArtistProfile()
                              return
                            }

                            openArtistProfile(artist, { mode: 'profile' })
                          }}
                        >
                          {isProfileOpen ? 'Ocultar perfil' : 'Ver perfil'}
                        </button>
                        <button
                          className="marketplace-profile-button"
                          type="button"
                          onClick={() => {
                            if (isBookingOpen) {
                              closeArtistProfile()
                              return
                            }

                            openArtistProfile(artist, { mode: 'booking' })
                          }}
                        >
                          {isBookingOpen ? 'Ocultar agenda' : 'Agendar ahora'}
                        </button>
                        <button
                          className={`marketplace-favorite-button${isFavorite ? ' is-saved' : ''}`}
                          type="button"
                          aria-pressed={isFavorite}
                          onClick={() => toggleFavoriteArtist(artist.id)}
                        >
                          {isFavorite ? '❤️ Guardado' : '♡ Guardar'}
                        </button>
                      </div>
                    </div>

                    {isBookingOpen && renderMarketplaceBookingPanel(artist, 'searchBooking')}

                    {isProfileOpen && (
                      <div className="public-profile-panel">
                        <section className="public-profile-hero">
                          <div className="public-profile-hero-copy">
                            <span className="eyebrow">{publicArtistProfile.primarySpecialty || profileTypeLabel}</span>
                            <h3>{profileDisplayName}</h3>
                            <span className={`marketplace-availability availability-${artist.badge.level}`}>
                              {artist.badge.label}
                            </span>
                            <small>{professionalAddress || artist.city || 'Ubicacion profesional por confirmar'}</small>
                          </div>
                        </section>

                        <section className="public-profile-section">
                          <h4>Sobre mi</h4>
                          <p>{artistBiography || `${isStudioListing ? 'Este estudio' : 'Esta artista'} aun esta completando su perfil profesional.`}</p>
                        </section>

                        {artistPortfolio.length > 0 && (
                          <section className="public-profile-section">
                            <h4>✨ Conoce mi estudio y mis trabajos</h4>
                            <div className="public-portfolio-strip">
                              {artistPortfolio.map((image) => (
                                <img src={image.url} alt={image.label || 'Trabajo realizado por la artista'} key={image.id || image.url} />
                              ))}
                            </div>
                          </section>
                        )}

                        <section className="public-profile-section">
                          <h4>Servicios destacados</h4>
                          <div className="public-service-badges">
                            {artist.marketplaceServices.slice(0, 5).map((serviceName) => (
                              <span key={serviceName}>✨ {serviceName}</span>
                            ))}
                          </div>
                        </section>

                        <section className="public-studio-card">
                          <div className="public-studio-logo">
                            {studioProfile.profile?.logoUrl ? (
                              <img src={studioProfile.profile.logoUrl} alt={`Logo de ${studioDisplayName}`} />
                            ) : (
                              <span>{getArtistInitials(studioDisplayName || 'Studio')}</span>
                            )}
                          </div>
                          <div>
                            <h4>{studioDisplayName || 'Estudio profesional'}</h4>
                            {studioProfile.profile?.description && <p>{studioProfile.profile.description}</p>}
                          </div>
                        </section>

                        {studioContactItems.length > 0 && (
                          <section className="public-profile-section">
                            <h4>Datos del estudio</h4>
                            <div className="public-service-badges">
                              {studioContactItems.map((item) => (
                                <span key={item.label}>{item.label}: {item.value}</span>
                              ))}
                            </div>
                          </section>
                        )}

                        {studioGallery.length > 0 && (
                          <section className="public-profile-section">
                            <h4>Galeria del estudio</h4>
                            <div className="public-gallery-strip">
                              {studioGallery.map((image) => (
                                <img src={image.url} alt={image.label || 'Foto del estudio'} key={image.id || image.url} />
                              ))}
                            </div>
                          </section>
                        )}

                        {professionalAddress && (
                          <section className="public-profile-section">
                            <h4>Ubicacion</h4>
                            <p>📍 {professionalAddress}</p>
                          </section>
                        )}

                        {hasSocialLinks && (
                          <section className="public-profile-section">
                            <h4>Redes y contacto</h4>
                            <div className="public-contact-actions">
                              {contactLinks.whatsapp && (
                                <button type="button" onClick={() => openWhatsAppContact(contactLinks.whatsapp, selectedMarketplaceServiceName)}>WhatsApp</button>
                              )}
                              {contactLinks.instagram && (
                                <a href={getSocialUrl(contactLinks.instagram, 'https://instagram.com/')} target="_blank" rel="noreferrer">
                                  Instagram
                                </a>
                              )}
                              {contactLinks.facebook && (
                                <a href={getSocialUrl(contactLinks.facebook, 'https://facebook.com/')} target="_blank" rel="noreferrer">
                                  Facebook
                                </a>
                              )}
                            </div>
                          </section>
                        )}

                        <div className="form-stack compact-form public-booking-flow">
                          <PremiumDropdown
                            label="Servicio primario"
                            value={selectedArtistPrimaryService}
                            open={openDropdown === 'profilePrimaryService'}
                            onToggle={() => setOpenDropdown(openDropdown === 'profilePrimaryService' ? null : 'profilePrimaryService')}
                            onChange={changeSelectedArtistPrimaryService}
                            options={selectedArtistPrimaryOptions.map((category) => ({
                              value: category,
                              label: category,
                              meta: `${selectedArtistServiceGroups[category]?.length || 0} opciones`,
                            }))}
                          />
                          <PremiumDropdown
                            label="Servicio secundario"
                            value={selectedMarketplaceServiceName}
                            open={openDropdown === 'profileSecondaryService'}
                            onToggle={() => setOpenDropdown(openDropdown === 'profileSecondaryService' ? null : 'profileSecondaryService')}
                            onChange={changeSelectedMarketplaceService}
                            options={selectedArtistSecondaryGroup.map((service) => ({
                              value: service.name,
                              label: service.name,
                              meta: `${service.durationMinutes || 60} min`,
                            }))}
                          />
                          <label className="input-field">
                            <span>Fecha</span>
                            <input type="date" min={getTodayDateValue()} value={bookingDate} onChange={(event) => setBookingDate(event.target.value)} />
                          </label>
                          {selectedArtistFlowPointsActive && artist.rewards?.length > 0 && (
                            <label className="input-field">
                              <span>Usar Flow Points</span>
                              <select value={selectedMarketplaceRewardId} onChange={(event) => setSelectedMarketplaceRewardId(event.target.value)}>
                                <option value="">No usar puntos en esta cita</option>
                                {artist.rewards.map((reward) => (
                                  <option value={reward.id} key={reward.id}>
                                    {reward.discountPercent}% descuento / {reward.pointsCost} puntos
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                        </div>

                        <div className="compact-list public-slot-list" id={`marketplace-slots-${artist.id}`}>
                          {availableSlots.length > 0 ? (
                            availableSlots.map((slot) => (
                              <div className={`list-row elevated-row${slot.isHappyHour ? ' happy-hour-slot' : ''}`} key={`${artist.id}-${slot.date}-${slot.time}`}>
                                <div>
                                  <strong>{slot.time} - {slot.end}</strong>
                                  <small>{getSlotServiceName(slot)}</small>
                                  <small className="flow-points-slot-note">Otorga {getSlotFlowPoints(slot)} Flow Points</small>
                                </div>
                                <Button
                                  size="sm"
                                  variant={slot.isHappyHour ? 'success' : slot.available ? 'primary' : 'ghost'}
                                  disabled={!slot.available || isBookingLoading}
                                  onClick={() => {
                                    console.error('[BOOKING TRACE]', 'ClientDashboard reserve button onClick', {
                                      slot,
                                      selectedMarketplaceService,
                                      selectedArtistProfile,
                                    })
                                    reserveSlot(slot)
                                  }}
                                >
                                  {isBookingLoading ? 'Reservando...' : slot.available ? (slot.isHappyHour ? `${slot.happyHourDiscountPercent}% Reservar` : 'Reservar') : 'Ocupado'}
                                </Button>
                              </div>
                            ))
                          ) : (
                            <div className="list-row elevated-row">
                              <div>
                                <strong>{isAvailabilityLoading ? 'Cargando horarios...' : happyHourOnly ? 'Sin horarios disponibles para Happy Hour' : 'Sin horarios disponibles'}</strong>
                                <small>{availabilityError || noAvailabilityMessage}</small>
                              </div>
                              <StatusPill tone="neutral">No disponible</StatusPill>
                            </div>
                          )}
                        </div>
                        {bookingNotice && (
                          <div className={`list-row elevated-row ${bookingNotice.toLowerCase().includes('exito') ? 'booking-success-row' : 'booking-error-row'}`}>
                            <div>
                              <strong>{bookingNotice.toLowerCase().includes('exito') ? 'Reservado con exito' : 'No se pudo reservar'}</strong>
                              <small>{bookingNotice}</small>
                            </div>
                            <StatusPill tone={bookingNotice.toLowerCase().includes('exito') ? 'success' : 'danger'}>
                              Reserva
                            </StatusPill>
                          </div>
                        )}
                        {bookingError && (
                          <div className="list-row elevated-row">
                            <div>
                              <strong>No se pudo reservar</strong>
                              <small>{bookingError}</small>
                            </div>
                            <StatusPill tone="neutral">Reserva</StatusPill>
                          </div>
                        )}

                        <div className="public-profile-final-actions">
                          <Button
                            onClick={() => document.getElementById(`marketplace-slots-${artist.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                            disabled={!availableSlots.some((slot) => slot.available)}
                          >
                            📅 Reservar cita
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={!contactLinks.whatsapp}
                            onClick={() => openWhatsAppContact(contactLinks.whatsapp, selectedMarketplaceServiceName)}
                          >
                            💬 Contactar artista
                          </Button>
                          {directionsUrl && (
                            <Button
                              variant="ghost"
                              onClick={() => openDirections(effectiveLocation, effectiveLocationResult.source)}
                            >
                              📍 Cómo llegar
                            </Button>
                          )}
                        </div>

                        <button className="public-profile-hide" type="button" onClick={closeArtistProfile}>
                          Ocultar perfil
                        </button>
                      </div>
                    )}
                  </article>
                )
              })}
              {marketplaceArtists.length === 0 && (
                <div className="artist-result">
                  <div>
                    <strong>{isRealMarketplace ? 'No hay perfiles publicados' : 'Sin resultados disponibles'}</strong>
                    <small>
                      {isRealMarketplace
                        ? 'Cuando existan listings visibles apareceran aqui.'
                        : 'Prueba otro servicio o nombre de estudio.'}
                    </small>
                    {isRealMarketplace && marketplaceError && (
                      <small>{marketplaceError}</small>
                    )}
                  </div>
                  <StatusPill tone="neutral">{isMarketplaceLoading ? 'Cargando' : 'Marketplace'}</StatusPill>
                </div>
              )}
            </div>
          </Card>
        )}

        {view === 'favoritos' && (
          <>
            <Card className="mobile-screen primary-panel">
              <PanelHeader title="Favoritos" eyebrow="Guardados" />
              <div className="favorite-grid">
                {favoriteArtists.map((artist) => {
                  const publicArtistProfile = getArtistPublicProfile(artistState, artist)
                  const studioProfile = getStudioPublicProfile({
                    artist,
                    studios: adminState.studios,
                    artistStudioMemberships,
                  })
                  const studioDisplayName = getStudioDisplayName(studioProfile)
                  const effectiveLocationResult = getEffectiveProfessionalLocation(publicArtistProfile, studioProfile, artist)
                  const effectiveLocation = effectiveLocationResult.location
                  const directionsUrl = buildGoogleMapsUrl(effectiveLocation)
                  const professionalAddress = formatProfessionalAddress(effectiveLocation, artist.city)
                  const studioGallery = (studioProfile.profile?.gallery || []).slice(0, 5)
                  const studioContactItems = getStudioContactItems(studioProfile)
                  const artistPortfolio = publicArtistProfile.portfolio.slice(0, 12)
                  const contactLinks = publicArtistProfile.contactLinks || {}
                  const isSelectedArtist = selectedArtistProfile?.id === artist.id
                  const isProfileOpen = isSelectedArtist && selectedArtistPanelMode === 'profile'
                  const isBookingOpen = isSelectedArtist && selectedArtistPanelMode === 'booking'
                  const isDirectionsOpen = isSelectedArtist && selectedArtistPanelMode === 'directions'
                  const isStudioListing = artist.profileType === 'studio'
                  const profilePhotoUrl = isStudioListing
                    ? studioProfile.profile?.logoUrl || publicArtistProfile.photoUrl
                    : publicArtistProfile.photoUrl
                  const profileDisplayName = isStudioListing
                    ? studioDisplayName || artist.title || artist.owner || 'Estudio beauty'
                    : publicArtistProfile.fullName || artist.owner || 'Artista beauty'
                  const profileTypeLabel = isStudioListing ? 'Estudio' : 'Artista'
                  const profileInitials = getArtistInitials(profileDisplayName)
                  const artistBiography = publicArtistProfile.biography?.trim()
                  const hasSocialLinks = contactLinks.whatsapp || contactLinks.instagram || contactLinks.facebook

                  return (
                    <article className={`favorite-card marketplace-result-card${isSelectedArtist ? ' is-expanded' : ''}`} key={artist.name}>
                      <div className="marketplace-result-summary">
                        <div className="marketplace-artist-avatar avatar">
                          {profilePhotoUrl ? (
                            <img src={profilePhotoUrl} alt={`Foto de ${profileDisplayName}`} />
                          ) : (
                            <span>{profileInitials}</span>
                          )}
                        </div>
                        <div className="marketplace-result-copy">
                          <strong>{profileDisplayName}</strong>
                          <small>{profileTypeLabel}</small>
                          <small>{artist.marketplaceServices.slice(0, 3).join(' • ')}</small>
                          <span className={`marketplace-availability availability-${artist.badge.level}`}>
                            {artist.badge.label}
                          </span>
                          {artist.rewards?.length > 0 && (
                            <span className={`flow-points-scope-badge ${artist.flowPointRedemptionScope === 'open' ? 'open' : 'exclusive'}`}>
                              ★ {artist.flowPointRedemptionScope === 'open' ? 'Puntos libres' : 'Puntos exclusivos'}
                            </span>
                          )}
                          {getActiveDoublePointsMultiplier(artist) > 1 && (
                            <span className="double-points-badge">Puntos dobles</span>
                          )}
                        </div>
                        <div className="marketplace-result-actions">
                          <button
                            className="marketplace-profile-button"
                            type="button"
                            aria-expanded={isProfileOpen}
                            onClick={() => {
                              if (isProfileOpen) {
                                closeArtistProfile()
                                return
                              }

                              openArtistProfile(artist, { mode: 'profile' })
                            }}
                          >
                            👤 {isProfileOpen ? 'Ocultar perfil' : 'Ver perfil'}
                          </button>
                          <button
                            className="marketplace-profile-button"
                            type="button"
                            onClick={() => {
                              if (isBookingOpen) {
                                closeArtistProfile()
                                return
                              }

                              openArtistProfile(artist, { mode: 'booking' })
                            }}
                          >
                            {isBookingOpen ? 'Ocultar agenda' : 'Reservar cita'}
                          </button>
                          <button
                            className="marketplace-profile-button"
                            type="button"
                            onClick={() => {
                              if (isDirectionsOpen) {
                                closeArtistProfile()
                                return
                              }

                              openArtistProfile(artist, { mode: 'directions' })
                            }}
                          >
                            {isDirectionsOpen ? 'Ocultar direccion' : 'Como llegar'}
                          </button>
                          <button
                            className="marketplace-favorite-button is-saved"
                            type="button"
                            onClick={() => toggleFavoriteArtist(artist.id)}
                          >
                            Eliminar favorito
                          </button>
                        </div>
                      </div>

                      {isBookingOpen && renderMarketplaceBookingPanel(artist, 'favoriteBooking')}
                      {isDirectionsOpen && renderFavoriteDirectionsPanel({
                        address: professionalAddress,
                        location: effectiveLocation,
                        source: effectiveLocationResult.source,
                        directionsUrl,
                      })}

                      {isProfileOpen && (
                        <div className="public-profile-panel">
                          <section className="public-profile-hero">
                            <div className="public-profile-hero-copy">
                              <span className="eyebrow">{publicArtistProfile.primarySpecialty || profileTypeLabel}</span>
                              <h3>{profileDisplayName}</h3>
                              <span className={`marketplace-availability availability-${artist.badge.level}`}>
                                {artist.badge.label}
                              </span>
                              <small>{professionalAddress || artist.city || 'Ubicacion profesional por confirmar'}</small>
                            </div>
                          </section>

                          <section className="public-profile-section">
                            <h4>Sobre mi</h4>
                            <p>{artistBiography || `${isStudioListing ? 'Este estudio' : 'Esta artista'} aun esta completando su perfil profesional.`}</p>
                          </section>

                          {artistPortfolio.length > 0 && (
                            <section className="public-profile-section">
                              <h4>✨ Conoce mi estudio y mis trabajos</h4>
                              <div className="public-portfolio-strip">
                                {artistPortfolio.map((image) => (
                                  <img src={image.url} alt={image.label || 'Trabajo realizado por la artista'} key={image.id || image.url} />
                                ))}
                              </div>
                            </section>
                          )}

                          <section className="public-profile-section">
                            <h4>Servicios destacados</h4>
                            <div className="public-service-badges">
                              {artist.marketplaceServices.slice(0, 5).map((serviceName) => (
                                <span key={serviceName}>✨ {serviceName}</span>
                              ))}
                            </div>
                          </section>

                          <section className="public-studio-card">
                            <div className="public-studio-logo">
                              {studioProfile.profile?.logoUrl ? (
                                <img src={studioProfile.profile.logoUrl} alt={`Logo de ${studioDisplayName}`} />
                              ) : (
                                <span>{getArtistInitials(studioDisplayName || 'Studio')}</span>
                              )}
                            </div>
                            <div>
                              <h4>{studioDisplayName || 'Estudio profesional'}</h4>
                              {studioProfile.profile?.description && <p>{studioProfile.profile.description}</p>}
                            </div>
                          </section>

                          {studioContactItems.length > 0 && (
                            <section className="public-profile-section">
                              <h4>Datos del estudio</h4>
                              <div className="public-service-badges">
                                {studioContactItems.map((item) => (
                                  <span key={item.label}>{item.label}: {item.value}</span>
                                ))}
                              </div>
                            </section>
                          )}

                          {studioGallery.length > 0 && (
                            <section className="public-profile-section">
                              <h4>Galeria del estudio</h4>
                              <div className="public-gallery-strip">
                                {studioGallery.map((image) => (
                                  <img src={image.url} alt={image.label || 'Foto del estudio'} key={image.id || image.url} />
                                ))}
                              </div>
                            </section>
                          )}

                          {professionalAddress && (
                            <section className="public-profile-section">
                              <h4>Ubicacion</h4>
                              <p>📍 {professionalAddress}</p>
                            </section>
                          )}

                          {hasSocialLinks && (
                            <section className="public-profile-section">
                              <h4>Redes y contacto</h4>
                              <div className="public-contact-actions">
                                {contactLinks.whatsapp && (
                                  <button type="button" onClick={() => openWhatsAppContact(contactLinks.whatsapp, selectedMarketplaceServiceName)}>WhatsApp</button>
                                )}
                                {contactLinks.instagram && (
                                  <a href={getSocialUrl(contactLinks.instagram, 'https://instagram.com/')} target="_blank" rel="noreferrer">
                                    Instagram
                                  </a>
                                )}
                                {contactLinks.facebook && (
                                  <a href={getSocialUrl(contactLinks.facebook, 'https://facebook.com/')} target="_blank" rel="noreferrer">
                                    Facebook
                                  </a>
                                )}
                              </div>
                            </section>
                          )}

                          <div className="form-stack compact-form public-booking-flow">
                            <PremiumDropdown
                              label="Servicio primario"
                              value={selectedArtistPrimaryService}
                              open={openDropdown === 'favoriteProfilePrimaryService'}
                              onToggle={() => setOpenDropdown(openDropdown === 'favoriteProfilePrimaryService' ? null : 'favoriteProfilePrimaryService')}
                              onChange={changeSelectedArtistPrimaryService}
                              options={selectedArtistPrimaryOptions.map((category) => ({
                                value: category,
                                label: category,
                                meta: `${selectedArtistServiceGroups[category]?.length || 0} opciones`,
                              }))}
                            />
                            <PremiumDropdown
                              label="Servicio secundario"
                              value={selectedMarketplaceServiceName}
                              open={openDropdown === 'favoriteProfileSecondaryService'}
                              onToggle={() => setOpenDropdown(openDropdown === 'favoriteProfileSecondaryService' ? null : 'favoriteProfileSecondaryService')}
                              onChange={changeSelectedMarketplaceService}
                              options={selectedArtistSecondaryGroup.map((service) => ({
                                value: service.name,
                                label: service.name,
                                meta: `${service.durationMinutes || 60} min`,
                              }))}
                            />
                            <label className="input-field">
                              <span>Fecha</span>
                              <input type="date" min={getTodayDateValue()} value={bookingDate} onChange={(event) => setBookingDate(event.target.value)} />
                            </label>
                            {selectedArtistFlowPointsActive && artist.rewards?.length > 0 && (
                              <label className="input-field">
                                <span>Usar Flow Points</span>
                                <select value={selectedMarketplaceRewardId} onChange={(event) => setSelectedMarketplaceRewardId(event.target.value)}>
                                  <option value="">No usar puntos en esta cita</option>
                                  {artist.rewards.map((reward) => (
                                    <option value={reward.id} key={reward.id}>
                                      {reward.discountPercent}% descuento / {reward.pointsCost} puntos
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )}
                          </div>

                          <div className="compact-list public-slot-list" id={`marketplace-slots-${artist.id}`}>
                            {availableSlots.length > 0 ? (
                              availableSlots.map((slot) => (
                                <div className={`list-row elevated-row${slot.isHappyHour ? ' happy-hour-slot' : ''}`} key={`${artist.id}-${slot.date}-${slot.time}`}>
                                  <div>
                                    <strong>{slot.time} - {slot.end}</strong>
                                    <small>{getSlotServiceName(slot)}</small>
                                    <small className="flow-points-slot-note">Otorga {getSlotFlowPoints(slot)} Flow Points</small>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant={slot.isHappyHour ? 'success' : slot.available ? 'primary' : 'ghost'}
                                    disabled={!slot.available || isBookingLoading}
                                    onClick={() => {
                                      console.error('[BOOKING TRACE]', 'ClientDashboard reserve button onClick', {
                                        slot,
                                        selectedMarketplaceService,
                                        selectedArtistProfile,
                                      })
                                      reserveSlot(slot)
                                    }}
                                  >
                                    {isBookingLoading ? 'Reservando...' : slot.available ? (slot.isHappyHour ? `${slot.happyHourDiscountPercent}% Reservar` : 'Reservar') : 'Ocupado'}
                                  </Button>
                                </div>
                              ))
                            ) : (
                              <div className="list-row elevated-row">
                                <div>
                                  <strong>{isAvailabilityLoading ? 'Cargando horarios...' : happyHourOnly ? 'Sin horarios disponibles para Happy Hour' : 'Sin horarios disponibles'}</strong>
                                  <small>{availabilityError || noAvailabilityMessage}</small>
                                </div>
                                <StatusPill tone="neutral">No disponible</StatusPill>
                              </div>
                            )}
                          </div>
                          {bookingNotice && (
                            <div className={`list-row elevated-row ${bookingNotice.toLowerCase().includes('exito') ? 'booking-success-row' : 'booking-error-row'}`}>
                              <div>
                                <strong>{bookingNotice.toLowerCase().includes('exito') ? 'Reservado con exito' : 'No se pudo reservar'}</strong>
                                <small>{bookingNotice}</small>
                              </div>
                              <StatusPill tone={bookingNotice.toLowerCase().includes('exito') ? 'success' : 'danger'}>
                                Reserva
                              </StatusPill>
                            </div>
                          )}
                          {bookingError && (
                            <div className="list-row elevated-row">
                              <div>
                                <strong>No se pudo reservar</strong>
                                <small>{bookingError}</small>
                              </div>
                              <StatusPill tone="neutral">Reserva</StatusPill>
                            </div>
                          )}

                          <div className="public-profile-final-actions">
                            <Button
                              onClick={() => document.getElementById(`marketplace-slots-${artist.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                              disabled={!availableSlots.some((slot) => slot.available)}
                            >
                              📅 Reservar cita
                            </Button>
                            <Button
                              variant="ghost"
                              disabled={!contactLinks.whatsapp}
                              onClick={() => openWhatsAppContact(contactLinks.whatsapp, selectedMarketplaceServiceName)}
                            >
                              💬 Contactar artista
                            </Button>
                            {directionsUrl && (
                              <Button
                                variant="ghost"
                                onClick={() => openDirections(effectiveLocation, effectiveLocationResult.source)}
                              >
                                📍 Cómo llegar
                              </Button>
                            )}
                          </div>

                          <button className="public-profile-hide" type="button" onClick={closeArtistProfile}>
                            Ocultar perfil
                          </button>
                        </div>
                      )}
                    </article>
                  )
                })}
                {favoriteArtists.length === 0 && (
                  <article className="favorite-card">
                    <div className="favorite-topline">
                      <strong>Sin favoritos</strong>
                      <StatusPill tone="neutral">Vacio</StatusPill>
                    </div>
                    <span>Agrega artistas desde Buscar.</span>
                  </article>
                )}
              </div>
            </Card>
          </>
        )}

        {view === 'perfil' && (
          <>
            <Card className="mobile-screen primary-panel">
              <PanelHeader title="Perfil" eyebrow="Cliente" />
              <div className="form-stack compact-form">
                <div className="client-photo-editor">
                  <div className="client-photo-preview">
                    {profileDraft.photoUrl ? (
                      <img src={profileDraft.photoUrl} alt={`Foto de ${profileDraft.name}`} />
                    ) : (
                      <span>MF</span>
                    )}
                  </div>
                  <div>
                    <strong>Foto de perfil</strong>
                    <small>Visible en tu dashboard, navegación y perfil.</small>
                    <div className="client-photo-actions">
                      <label className="button button-ghost button-sm" htmlFor="client-photo-input">
                        {profileDraft.photoUrl ? 'Cambiar foto' : 'Subir foto'}
                      </label>
                      <input
                        accept="image/*"
                        className="visually-hidden"
                        id="client-photo-input"
                        type="file"
                        onChange={handleClientPhotoChange}
                      />
                      {profileDraft.photoUrl && (
                        <button type="button" onClick={removeClientPhoto}>Eliminar foto</button>
                      )}
                    </div>
                  </div>
                </div>
                <Input
                  label="Nombre"
                  value={profileDraft.name}
                  onChange={(event) => setProfileDraft({ ...profileDraft, name: event.target.value })}
                />
                <Input
                  label="Correo"
                  value={profileDraft.email}
                  onChange={(event) => setProfileDraft({ ...profileDraft, email: event.target.value })}
                />
                <Input
                  label="Telefono"
                  value={profileDraft.phone}
                  onChange={(event) => setProfileDraft({ ...profileDraft, phone: event.target.value })}
                />
                <Input
                  label="Fecha de nacimiento"
                  type="date"
                  value={profileDraft.birthday || ''}
                  max={getMaxBirthDateForAdult()}
                  onChange={(event) => setProfileDraft({ ...profileDraft, birthday: event.target.value })}
                  required
                />
                <div className="location-foundation-card">
                  <div>
                    <h3>Ubicacion para recomendaciones</h3>
                    <small>Permite encontrar artistas y estudios cerca de ti.</small>
                  </div>
                  <div className="location-form-grid">
                    <Input
                      label="Ciudad"
                      value={profileDraft.city || ''}
                      onChange={(event) => setProfileDraft({ ...profileDraft, city: event.target.value })}
                    />
                    <Input
                      label="Estado"
                      value={profileDraft.state || ''}
                      onChange={(event) => setProfileDraft({ ...profileDraft, state: event.target.value })}
                    />
                  </div>
                  <div className="location-form-grid">
                    <Input
                      label="Latitud"
                      value={profileDraft.latitude || ''}
                      onChange={(event) => setProfileDraft({ ...profileDraft, latitude: event.target.value })}
                    />
                    <Input
                      label="Longitud"
                      value={profileDraft.longitude || ''}
                      onChange={(event) => setProfileDraft({ ...profileDraft, longitude: event.target.value })}
                    />
                  </div>
                  <div className="location-detection-row">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={locationDetection.status === 'loading'}
                      onClick={detectClientLocation}
                    >
                      {locationDetection.status === 'loading' ? 'Detectando...' : 'Usar mi ubicacion actual'}
                    </Button>
                  </div>
                  {locationDetection.message && (
                    <small className={`location-detection-message location-detection-${locationDetection.status}`}>
                      {locationDetection.message}
                    </small>
                  )}
                </div>
                <label className="input-field">
                  <span>Notas</span>
                  <textarea
                    value={profileDraft.notes}
                    onChange={(event) => setProfileDraft({ ...profileDraft, notes: event.target.value })}
                    rows="3"
                  />
                </label>
                {profileError && (
                  <small style={{ color: profileError.includes('guardado') ? 'var(--success)' : 'var(--rose-dark)', fontWeight: 800 }}>
                    {profileError}
                  </small>
                )}
                <Button className="full-width" onClick={saveClientProfile}>Guardar perfil</Button>
              </div>
            </Card>
            <Card className="mobile-screen">
              <PanelHeader title="Resumen" eyebrow="Actividad" />
              <div className="compact-list">
                <div className="list-row elevated-row">
                  <div>
                    <strong>{upcomingAppointments.length}</strong>
                    <small>Citas proximas registradas.</small>
                  </div>
                  <StatusPill tone="success">Activas</StatusPill>
                </div>
                <div className="list-row elevated-row">
                  <div>
                    <strong>{favoriteArtists.length}</strong>
                    <small>Artistas favoritos guardados.</small>
                  </div>
                  <StatusPill tone="rose">Favoritos</StatusPill>
                </div>
              </div>
            </Card>
          </>
        )}
      {appointmentResponseNotice && (
        <div className={`client-appointment-toast appointment-status-${appointmentResponseNotice.tone}`} role="status" aria-live="polite">
          <div>
            <strong>{appointmentResponseNotice.title}</strong>
            <small>{appointmentResponseNotice.message}</small>
          </div>
          <button type="button" onClick={() => setAppointmentResponseNotice(null)}>
            Cerrar
          </button>
        </div>
      )}
    </main>
  )
}

export default ClientDashboard
