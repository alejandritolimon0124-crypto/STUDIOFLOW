import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { CalendarDays, Camera, Clock3, CreditCard, FileText, Heart, ListFilter, MapPin, Phone, Share2, Sparkles, UserRound } from 'lucide-react'
import facebookIcon from '../../assets/social/facebook.png'
import instagramIcon from '../../assets/social/instagram.png'
import tiktokIcon from '../../assets/social/tiktok.png'
import whatsappIcon from '../../assets/social/whatsapp.png'
import { hasCurrentAttendanceConfirmation } from '../../utils/appointmentConfirmation'
import { historyDateTime, newestAppointmentFirst } from '../../utils/appointmentHistory'
import Button from '../../components/Button'
import AppointmentPayment from '../../components/AppointmentPayment'
import AppointmentDeposit from '../../components/AppointmentDeposit'
import { depositAmount, fetchDepositPolicy, formatPayment } from '../../services/depositService'
import '../../styles/appointment-deposits.css'
import Card from '../../components/Card'
import Input from '../../components/Input'
import PanelHeader from '../../components/PanelHeader'
import { ClientMarketingNotices } from '../../components/MarketingReminders'
import { MarketplaceVisitReviews, VisitReviewEditor } from '../../components/VisitReviews'
import { fetchMyVisitReviews } from '../../services/visitReviewService'
import { fetchMarketplaceListingPortfolio } from '../../services/marketplaceService'
import ClientManualBookingRequests from '../../components/ClientManualBookingRequests'
import StatusPill from '../../components/StatusPill'
import RescheduleAppointmentButton from '../../components/RescheduleAppointmentButton'
import { useApp } from '../../contexts/appContextCore'
import useCurrentTime from '../../hooks/useCurrentTime'
import PendingPointsNotice from '../../components/PendingPointsNotice'
import ClientAttendancePanel from '../../components/ClientAttendancePanel'
import { pendingAppointmentPoints } from '../../utils/pendingAppointmentPoints'
import { paths } from '../../routes/paths'
import { sharePreviewUrl } from '../../utils/sharePreviewUrl'
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
import { fetchClientFlowPointsBalance, fetchClientFlowPointDestinations, fetchClientFlowPointRedemptions, redeemClientFlowPoints as redeemClientFlowPointsRecord } from '../../services/appointmentService'
import { normalizeServiceName, serviceCatalog } from '../../services/staticCatalogs'
import { optimizeImageFile } from '../../utils/imageOptimization'
import { pushRegistrationStorageKey } from '../../services/pushNotificationService'
import { BEAUTY_SPACES } from '../../services/beautySpaceService'
import { advancedAestheticsCatalog } from '../../services/advancedAestheticsCatalog'

const clientConfirmationNoticeKey = 'studio-flow-client-confirmation-notices'
const FLOW_POINTS_MINIMUM_REDEMPTION = 1000
const FLOW_POINTS_REDEMPTION_STEP = 100
const FLOW_POINTS_PER_MXN = 10
const FLOW_POINTS_VALIDITY_DAYS = 180
const flowPointsNumber = new Intl.NumberFormat('es-MX')
const flowPointsMoney = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })

function getServicePriceAmount(service = {}) {
  const rawPrice = service.priceAmount ?? service.price_amount ?? service.price
  const normalizedPrice = typeof rawPrice === 'string'
    ? rawPrice.replace(/[^0-9.-]/g, '')
    : rawPrice
  const price = Number(normalizedPrice)

  return Number.isFinite(price) && price >= 0 ? price : null
}

function formatServiceOptionMeta(service = {}) {
  const duration = Number(service.durationMinutes || service.duration_minutes) || 60
  const minimumPrice = Number.isFinite(service.minimumPrice) ? service.minimumPrice : getServicePriceAmount(service)
  const maximumPrice = Number.isFinite(service.maximumPrice) ? service.maximumPrice : minimumPrice

  if (minimumPrice === null) return `${duration} min`

  const priceLabel = maximumPrice !== null && maximumPrice !== minimumPrice
    ? `${flowPointsMoney.format(minimumPrice)} - ${flowPointsMoney.format(maximumPrice)}`
    : flowPointsMoney.format(minimumPrice)

  return `${duration} min · ${priceLabel}`
}

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
  if (localStorage.getItem(pushRegistrationStorageKey) === 'true') return

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

const advancedSearchServices = Object.fromEntries(
  Object.entries(advancedAestheticsCatalog).map(([category, secondaryGroups]) => [
    category,
    Object.entries(secondaryGroups).flatMap(([secondary, variants]) => (
      variants.map((variant) => ({ name: `${secondary} · ${variant}`, durationMinutes: 60 }))
    )),
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
  const name = normalizeServiceName(rawName)
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

function formatBookingDate(dateValue) {
  if (!dateValue) return 'la fecha seleccionada'

  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${dateValue}T12:00:00Z`))
}

function formatAppointmentCardDate(dateValue) {
  if (!dateValue) return 'PRÓXIMA'

  const date = new Date(`${String(dateValue).slice(0, 10)}T12:00:00`)
  if (Number.isNaN(date.getTime())) return dateValue

  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
  }).format(date).replace('.', '').toUpperCase()
}

function formatAppointmentProvider(appointment = {}) {
  const artist = String(appointment.artist || '').trim()
  const place = String(appointment.contextName || appointment.address || '').trim()

  if (!artist) return place || 'Ubicación por confirmar'
  if (!place || artist.localeCompare(place, 'es', { sensitivity: 'base' }) === 0) return artist
  return `${artist} / ${place}`
}

function openClientPaymentCard(appointmentId) {
  const card = document.getElementById(`client-payment-card-${appointmentId}`)
  if (!card) return
  card.open = true
  card.scrollIntoView({ behavior: 'smooth', block: 'center' })
  card.querySelector('summary')?.focus({ preventScroll: true })
}

function openBookingDatePicker(event) {
  const input = event.currentTarget
  if (typeof input.showPicker !== 'function') return
  try {
    input.showPicker()
  } catch {
    input.focus()
  }
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

function buildServiceGroupsFromListings(listings = []) {
  return listings.reduce((groups, listing) => {
    const services = getArtistServiceOptions(listing)

    services.forEach((service) => {
      const category = service.category || 'Servicios'
      const currentGroup = groups[category] || []
      const existingService = currentGroup.find((item) => item.name === service.name)
      const price = getServicePriceAmount(service)

      if (!existingService) {
        groups[category] = [
          ...currentGroup,
          {
            name: service.name,
            durationMinutes: service.durationMinutes || 60,
            minimumPrice: price,
            maximumPrice: price,
          },
        ]
      } else if (price !== null) {
        existingService.minimumPrice = existingService.minimumPrice === null
          ? price
          : Math.min(existingService.minimumPrice, price)
        existingService.maximumPrice = existingService.maximumPrice === null
          ? price
          : Math.max(existingService.maximumPrice, price)
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

function MarketplaceServiceMenu({ artist, onSelect }) {
  const groups = buildServiceGroupsForArtist(artist)
  const entries = Object.entries(groups).filter(([, services]) => services.length > 0)
  const [activeCategory, setActiveCategory] = useState(entries[0]?.[0] || '')
  const currentCategory = groups[activeCategory] ? activeCategory : entries[0]?.[0] || ''
  const activeServices = groups[currentCategory] || []

  if (entries.length === 0) return null

  return (
    <section className="public-profile-section public-service-menu-section">
      <div className="public-service-menu-heading">
        <div>
          <span className="eyebrow">SU EXPERIENCIA, A TU MANERA</span>
          <h4>Elige lo que te hará sentir increíble</h4>
          <p>Explora por categoría y reserva con un toque.</p>
        </div>
        <strong>{entries.reduce((total, [, services]) => total + services.length, 0)}<small> servicios</small></strong>
      </div>
      <div className="public-service-category-tabs" role="tablist" aria-label="Categorías de servicios">
        {entries.map(([category, services]) => (
          <button
            type="button"
            role="tab"
            aria-selected={currentCategory === category}
            className={currentCategory === category ? 'is-active' : ''}
            key={category}
            onClick={() => setActiveCategory(category)}
          >
            {category}<small>{services.length}</small>
          </button>
        ))}
      </div>
      <div className="public-service-menu-list" role="tabpanel">
        <div className="public-service-menu-list-title">
          <span>{currentCategory}</span>
          <small>{activeServices.length} opciones</small>
        </div>
        {activeServices.map((service, index) => (
          <button type="button" key={service.id || `${currentCategory}-${service.name}`} onClick={() => onSelect(service)}>
            <span className="public-service-number">{String(index + 1).padStart(2, '0')}</span>
            <span className="public-service-name">{service.name}<small>{Number(service.durationMinutes || service.duration_minutes) || 60} min</small></span>
            <strong>{getServicePriceAmount(service) === null ? 'Consultar' : flowPointsMoney.format(getServicePriceAmount(service))}</strong>
            <span className="public-service-arrow" aria-hidden="true">›</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function PremiumDropdown({ label, value, options, open, onToggle, onChange, compact = false }) {
  const dropdownRef = useRef(null)
  const safeOptions = options.length > 0
    ? options
    : [{ value: '', label: 'Sin opciones', meta: 'No disponible', disabled: true }]
  const selectedOption = safeOptions.find((option) => option.value === value) || safeOptions[0]

  useEffect(() => {
    if (!open) return undefined

    const alignmentFrame = window.requestAnimationFrame(() => {
      dropdownRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })

    const closeOnOutsideInteraction = (event) => {
      if (!dropdownRef.current?.contains(event.target)) onToggle()
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onToggle()
    }

    document.addEventListener('pointerdown', closeOnOutsideInteraction)
    document.addEventListener('keydown', closeOnEscape)

    return () => {
      window.cancelAnimationFrame(alignmentFrame)
      document.removeEventListener('pointerdown', closeOnOutsideInteraction)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open, onToggle])

  return (
    <div ref={dropdownRef} className="input-field premium-dropdown-field" style={{ position: 'relative' }}>
      <span>{label}</span>
      <button
        className="premium-dropdown-trigger"
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        style={{
          alignItems: 'center',
          background: '#fff',
          border: open ? '2px solid var(--rose-dark)' : '2px solid var(--rose)',
          borderRadius: 'var(--radius)',
          boxShadow: open ? '0 0 0 4px rgba(201, 135, 145, 0.18), 0 12px 28px rgba(141, 79, 90, 0.16)' : '0 8px 20px rgba(141, 79, 90, 0.1)',
          color: 'var(--ink)',
          display: 'flex',
          font: 'inherit',
          fontWeight: 800,
          justifyContent: 'space-between',
          boxSizing: 'border-box',
          minWidth: 0,
          minHeight: '58px',
          padding: '0 14px',
          position: 'relative',
          textAlign: 'left',
          touchAction: 'manipulation',
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
            display: 'grid',
            minWidth: 0,
            width: '100%',
          }}
        >
          <div
            style={{
              background: 'rgba(255, 251, 248, 0.98)',
              border: '1px solid rgba(214, 186, 177, 0.7)',
              borderRadius: '24px',
              boxShadow: '0 22px 58px rgba(45, 37, 39, 0.22)',
              alignContent: 'start',
              display: 'grid',
              gridAutoRows: 'max-content',
              gap: '10px',
              margin: '0 auto',
              boxSizing: 'border-box',
              minHeight: 0,
              maxHeight: '55dvh',
              maxWidth: '100%',
              overflowY: 'auto',
              overscrollBehaviorY: 'auto',
              padding: compact ? '16px' : '18px 16px',
              touchAction: 'pan-y',
              WebkitOverflowScrolling: 'touch',
              width: '100%',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{
              alignItems: 'center',
              borderBottom: '1px solid rgba(214, 186, 177, 0.52)',
              display: 'flex',
              justifyContent: 'space-between',
              padding: '0 4px 12px',
            }}>
              <div>
                <strong style={{ display: 'block', fontSize: '20px' }}>{label}</strong>
                <small style={{ color: 'var(--muted)', fontWeight: 800 }}>Selecciona una opción</small>
              </div>
              <button
                className="premium-dropdown-option"
                type="button"
                onClick={onToggle}
                style={{
                  background: 'rgba(245, 221, 223, 0.72)',
                  border: '1px solid rgba(201, 135, 145, 0.24)',
                  borderRadius: '999px',
                  color: 'var(--rose-dark)',
                  font: 'inherit',
                  fontSize: '18px',
                  fontWeight: 900,
                  height: '42px',
                  width: '42px',
                }}
              >
                x
              </button>
            </div>
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
                  background: option.value === value ? 'rgba(245, 221, 223, 0.7)' : '#fff',
                  border: option.value === value ? '2px solid var(--rose-dark)' : '2px solid var(--rose)',
                  borderRadius: 'var(--radius)',
                  boxShadow: option.value === value ? '0 8px 20px rgba(141, 79, 90, 0.14)' : '0 6px 16px rgba(141, 79, 90, 0.08)',
                  color: 'var(--ink)',
                  alignContent: 'center',
                  display: 'grid',
                  font: 'inherit',
                  fontSize: compact ? '16px' : '18px',
                  fontWeight: option.value === value ? 900 : 750,
                  gap: '4px',
                  minHeight: compact ? '50px' : '66px',
                  padding: compact ? '10px 14px' : '14px 16px',
                  textAlign: 'left',
                  touchAction: 'manipulation',
                  width: '100%',
                }}
              >
                {option.label}
                {option.meta && <small style={{ color: 'var(--muted)', fontSize: '14px', fontWeight: 800 }}>{option.meta}</small>}
              </button>
            ))}
          </div>
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
    phone: profile.personalInfo?.phone || artist?.phone || artist?.profile?.phone || '',
    hours: profile.hours || profile.professionalProfile?.hours || artist?.hours || artist?.profile?.hours || '',
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

function getMarketplaceHoursLabel({ artist = {}, publicArtistProfile = {}, studioProfile = {}, isStudioListing = false } = {}) {
  const profile = artist.profile || {}
  const studioHours = studioProfile?.profile?.hours || studioProfile?.hours || ''
  const artistHours = publicArtistProfile?.hours
    || profile.hours
    || profile.businessHours
    || profile.business_hours
    || artist.hours
    || artist.businessHours
    || artist.business_hours
    || ''
  const hours = isStudioListing ? studioHours : artistHours

  if (typeof hours === 'string' && hours.trim()) return hours.trim()

  const schedule = Array.isArray(artist.schedule) && artist.schedule.length > 0
    ? artist.schedule
    : Array.isArray(hours)
    ? hours
    : Array.isArray(profile.schedule)
      ? profile.schedule
      : Array.isArray(artist.schedule)
        ? artist.schedule
        : []
  const activeDays = schedule.filter((day) => day?.active !== false && day?.isActive !== false && day?.is_active !== false)

  if (activeDays.length > 0) {
    const dayLabels = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
    const getStart = (day) => day.start || day.startTime || day.start_time
    const getEnd = (day) => day.end || day.endTime || day.end_time
    const normalizedDays = activeDays
      .map((day) => ({
        weekday: Number.isFinite(Number(day.weekday)) ? Number(day.weekday) : null,
        name: day.day || day.name || dayLabels[Number(day.weekday)],
        start: getStart(day),
        end: getEnd(day),
      }))
      .filter((day) => day.name && day.start && day.end)
      .sort((first, second) => (first.weekday ?? 8) - (second.weekday ?? 8))

    const groups = normalizedDays.reduce((result, day) => {
      const key = `${day.start}-${day.end}`
      const existing = result.find((group) => group.key === key)
      if (existing) existing.days.push(day)
      else result.push({ key, start: day.start, end: day.end, days: [day] })
      return result
    }, [])

    if (groups.length > 0) {
      return groups.map((group) => {
        const isConsecutive = group.days.every((day, index) => (
          index === 0 || day.weekday === group.days[index - 1].weekday + 1
        ))
        const firstDay = group.days[0].name
        const lastDay = group.days[group.days.length - 1].name
        const daysLabel = group.days.length > 1 && isConsecutive
          ? `${firstDay}–${lastDay}`
          : group.days.map((day) => day.name).join(', ')
        return `${daysLabel} ${group.start}–${group.end}`
      }).join(' · ')
    }
  }

  return 'Horario por confirmar'
}

function getMarketplaceContactPhone({ artist = {}, publicArtistProfile = {}, studioProfile = {}, isStudioListing = false } = {}) {
  const studioPhone = studioProfile?.profile?.phone
    || studioProfile?.phone
    || studioProfile?.ownerPhone
    || ''
  const artistPhone = publicArtistProfile?.phone
    || artist?.phone
    || artist?.profile?.phone
    || artist?.contactLinks?.whatsapp
    || publicArtistProfile?.contactLinks?.whatsapp
    || ''

  return isStudioListing ? studioPhone : artistPhone
}

function getMarketplaceContactLinks({ artist = {}, publicArtistProfile = {}, studioProfile = {}, isStudioListing = false } = {}) {
  const artistLinks = publicArtistProfile?.contactLinks || artist?.contactLinks || {}
  const studioLinks = studioProfile?.profile?.contactLinks
    || studioProfile?.profile?.contact_links
    || studioProfile?.contactLinks
    || studioProfile?.contact_links
    || {}
  const sources = isStudioListing ? [artistLinks, studioLinks] : [artistLinks]

  return Object.fromEntries(
    ['whatsapp', 'instagram', 'facebook', 'tiktok', 'website'].map((key) => [
      key,
      sources.find((source) => String(source?.[key] || '').trim())?.[key] || '',
    ]),
  )
}

function hasUsableProfessionalLocation(location = {}) {
  const normalizedLocation = {
    ...location,
    address: location.address || location.addressLine || location.address_line || '',
    postalCode: location.postalCode || location.postal_code || '',
  }

  return Boolean(
    String(normalizedLocation.latitude || '').trim() && String(normalizedLocation.longitude || '').trim()
    || buildGoogleMapsQuery(normalizedLocation),
  )
}

function normalizeProfessionalLocation(location = {}) {
  return {
    ...location,
    address: location.address || location.addressLine || location.address_line || '',
    postalCode: location.postalCode || location.postal_code || '',
  }
}

function getEffectiveProfessionalLocation(artistProfile, studio, artist = {}, isStudioListing = false) {
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

  if (isStudioListing) {
    const studioLocationCandidates = [
      artistProfile.professionalLocation,
      artist.professionalLocation,
      studio?.professionalLocation,
    ].filter(Boolean)
    const studioLocation = studioLocationCandidates.find(hasUsableProfessionalLocation)

    return studioLocation
      ? { location: normalizeProfessionalLocation(studioLocation), source: 'studio.profile' }
      : { location: {}, source: 'empty' }
  }

  const configuredArtistLocation = artistLocationCandidates.find(({ settings }) => (
    settings.useStudioLocation === false && hasUsableProfessionalLocation(settings.customLocation || {})
  ))

  if (configuredArtistLocation) {
    return {
      location: normalizeProfessionalLocation(configuredArtistLocation.settings.customLocation),
      source: `${configuredArtistLocation.sourcePrefix}.customLocation`,
    }
  }

  const fallbackArtistLocation = artistLocationCandidates.find(({ settings }) => (
    settings.useStudioLocation !== true
    && hasUsableProfessionalLocation(settings.customLocation || {})
  ))

  if (fallbackArtistLocation) {
    return {
      location: normalizeProfessionalLocation(fallbackArtistLocation.settings.customLocation),
      source: `${fallbackArtistLocation.sourcePrefix}.customLocation.fallback`,
    }
  }

  const flatArtistLocation = artistLocationCandidates.find(({ settings }) => (
    settings.useStudioLocation !== true && hasUsableProfessionalLocation(settings)
  ))

  if (flatArtistLocation) {
    return {
      location: normalizeProfessionalLocation(flatArtistLocation.settings),
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
  const whatsappUrl = getWhatsAppContactUrl(whatsapp, serviceName)
  if (!whatsappUrl) return
  const isStandaloneIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent)
    && (window.navigator.standalone || window.matchMedia?.('(display-mode: standalone)').matches)

  if (isStandaloneIos) {
    window.location.href = whatsappUrl
    return
  }

  window.open(whatsappUrl, '_blank', 'noopener,noreferrer')
}

function openDirections(location) {
  const mapsUrl = buildGoogleMapsUrl(location)
  if (!mapsUrl) return


  window.open(mapsUrl, '_blank', 'noopener,noreferrer')
}

function getSocialUrl(value, baseUrl) {
  if (!value) return ''
  const normalizedValue = String(value).trim()
  if (/^https?:\/\//i.test(normalizedValue)) return normalizedValue
  if (/^www\./i.test(normalizedValue)) return `https://${normalizedValue}`
  return `${baseUrl}${normalizedValue.replace(/^@/, '')}`
}

function getWhatsAppContactUrl(whatsapp, serviceName = '') {
  const cleanNumber = String(whatsapp || '').replace(/\D/g, '')
  if (!cleanNumber) return ''

  const message = encodeURIComponent(buildWhatsAppMessage(serviceName))
  return `https://wa.me/${cleanNumber}?text=${message}`
}

function getPhoneHref(phone) {
  const cleanPhone = String(phone || '').trim().replace(/[^\d+]/g, '')
  return cleanPhone ? `tel:${cleanPhone}` : ''
}

function MarketplaceContactActions({ contactLinks = {}, phone = '', serviceName = '', hero = false }) {
  const phoneHref = getPhoneHref(phone)
  const socialLinks = [
    {
      key: 'whatsapp',
      label: 'WhatsApp',
      href: getWhatsAppContactUrl(contactLinks.whatsapp, serviceName),
      icon: whatsappIcon,
    },
    {
      key: 'instagram',
      label: 'Instagram',
      href: getSocialUrl(contactLinks.instagram, 'https://instagram.com/'),
      icon: instagramIcon,
    },
    {
      key: 'facebook',
      label: 'Facebook',
      href: getSocialUrl(contactLinks.facebook, 'https://facebook.com/'),
      icon: facebookIcon,
    },
    {
      key: 'tiktok',
      label: 'TikTok',
      href: getSocialUrl(contactLinks.tiktok, 'https://www.tiktok.com/@'),
      icon: tiktokIcon,
    },
  ].filter((socialLink) => socialLink.href)

  if (!phoneHref && socialLinks.length === 0) return null

  return (
    <div className={`marketplace-contact-actions${hero ? ' is-hero' : ''}`}>
      {phoneHref && (
        <a
          className="marketplace-call-button"
          href={phoneHref}
          aria-label={`Llamar al ${phone}`}
          title={`Llamar al ${phone}`}
          onClick={(event) => event.stopPropagation()}
        >
          <Phone aria-hidden="true" size={18} strokeWidth={2.6} />
          <span>{phone}</span>
        </a>
      )}
      {socialLinks.length > 0 && (
        <div className="marketplace-social-icons" aria-label="Redes sociales">
          {socialLinks.map((socialLink) => (
            <a
              className={`marketplace-social-link social-${socialLink.key}`}
              href={socialLink.href}
              target="_blank"
              rel="noreferrer"
              aria-label={`Abrir ${socialLink.label}`}
              title={socialLink.label}
              key={socialLink.key}
              onClick={(event) => event.stopPropagation()}
            >
              <img src={socialLink.icon} alt="" aria-hidden="true" />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

function MarketplaceGallery({ photos, isStudioListing, status, onRetry }) {
  if (photos.length === 0 && status !== 'loading' && status !== 'error') return null

  return (
    <section className="public-profile-section">
      <h4>{isStudioListing ? 'Galeria del estudio' : 'Trabajos de la artista'}</h4>
      {photos.length > 0 ? (
        <div className="public-portfolio-strip">
          {photos.map((image) => (
            <img src={image.url} alt={image.label || (isStudioListing ? 'Foto del estudio' : 'Trabajo realizado por la artista')} key={image.id || image.url} />
          ))}
        </div>
      ) : status === 'loading' ? (
        <p role="status">Cargando fotos...</p>
      ) : (
        <button type="button" onClick={onRetry}>No pudimos cargar las fotos. Reintentar</button>
      )}
    </section>
  )
}

function ClientDashboard({ view = 'inicio' }) {
  const navigate = useNavigate()
  const location = useLocation()
  const now = useCurrentTime()

  useEffect(() => {
    if (view !== 'inicio' || location.hash !== '#mis-flowpoints') return undefined
    const timer = window.setTimeout(() => {
      navigate(paths.clientFlowPoints, { replace: true })
    }, 150)
    return () => window.clearTimeout(timer)
  }, [location.hash, navigate, view])
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
    toggleFavoriteArtist,
    updateClientProfile,
  } = useApp()
  const [bookingDate, setBookingDate] = useState(getTodayDateValue)
  const [profileDraft, setProfileDraft] = useState(clientState.profile)
  const [profileError, setProfileError] = useState('')
  const [isProfileSaving, setIsProfileSaving] = useState(false)
  const [searchMode, setSearchMode] = useState('Servicio')
  const [beautySpace, setBeautySpace] = useState(BEAUTY_SPACES.BEAUTY_AND_PERSONAL_CARE)
  const [primaryService, setPrimaryService] = useState('Pestañas')
  const [secondaryService, setSecondaryService] = useState(searchServices.Pestañas[0].name)
  const [serviceFilterMode, setServiceFilterMode] = useState('')
  const [studioQuery, setStudioQuery] = useState('')
  const [selectedArtistProfile, setSelectedArtistProfile] = useState(null)
  const [portfolioByListing, setPortfolioByListing] = useState({})
  const [portfolioStatusByListing, setPortfolioStatusByListing] = useState({})
  const portfolioRequestsRef = useRef(new Set())
  const [selectedArtistPanelMode, setSelectedArtistPanelMode] = useState('')
  const [selectedMarketplaceServiceId, setSelectedMarketplaceServiceId] = useState('')
  const [selectedMarketplaceServiceExplicit, setSelectedMarketplaceServiceExplicit] = useState(false)
  const [selectedMarketplaceRewardId, setSelectedMarketplaceRewardId] = useState('')
  const [bookingNotice, setBookingNotice] = useState('')
  const [depositPolicyResult, setDepositPolicyResult] = useState({ serviceId: '', policy: {}, error: '' })
  const [pendingDepositSlot, setPendingDepositSlot] = useState(null)
  const [openDropdown, setOpenDropdown] = useState(null)
  const [nearbyOnly, setNearbyOnly] = useState(false)
  const [todayOnly, setTodayOnly] = useState(false)
  const [happyHourOnly, setHappyHourOnly] = useState(false)
  const [doublePointsOnly, setDoublePointsOnly] = useState(false)
  const [visibleMarketplaceCount, setVisibleMarketplaceCount] = useState(5)
  const [showPastAppointments, setShowPastAppointments] = useState(false)
  const [showAppointmentDateFilter, setShowAppointmentDateFilter] = useState(false)
  const [appointmentHistoryDate, setAppointmentHistoryDate] = useState('')
  const [appointmentHistoryBusiness, setAppointmentHistoryBusiness] = useState('')
  const [visibleHistoryCount, setVisibleHistoryCount] = useState(5)
  const [myVisitReviews, setMyVisitReviews] = useState([])
  const [respondingAppointmentId, setRespondingAppointmentId] = useState('')
  const [appointmentResponseNotice, setAppointmentResponseNotice] = useState(null)
  const [shareApplicationNotice, setShareApplicationNotice] = useState('')
  const [clientFlowPoints, setClientFlowPoints] = useState({ monthlyBalance: 0, monthlyEarned: 0, monthlySpent: 0, activeBalance: 0, expiringSoonPoints: 0, nextExpirationAt: null, validityDays: FLOW_POINTS_VALIDITY_DAYS })
  const [redeemDraft, setRedeemDraft] = useState({ points: '', targetId: '', targetQuery: '' })
  const [redeemStatus, setRedeemStatus] = useState('')
  const [redeemTargets, setRedeemTargets] = useState([])
  const [redeemTargetsError, setRedeemTargetsError] = useState('')
  const [recentRedemptions, setRecentRedemptions] = useState([])
  const [redeemBusy, setRedeemBusy] = useState(false)
  const redeemInFlightRef = useRef(false)
  const [confirmRedeem, setConfirmRedeem] = useState(false)
  const [showRedeemPanel, setShowRedeemPanel] = useState(false)
  const [redemptionReceipt, setRedemptionReceipt] = useState(null)
  const flowPointsBalance = Number(clientFlowPoints.activeBalance ?? clientFlowPoints.monthlyBalance) || 0
  const redeemableTargets = redeemTargets.filter((target) => target.redeemable !== false)
  const highestBusinessBalance = Math.max(0, ...redeemableTargets.map((target) => Number(target.availablePoints) || 0))
  const hasPausedPoints = redeemTargets.some((target) => target.redeemable === false)
  const flowPointsMissing = Math.max(FLOW_POINTS_MINIMUM_REDEMPTION - highestBusinessBalance, 0)
  const flowPointsProgress = Math.min((highestBusinessBalance / FLOW_POINTS_MINIMUM_REDEMPTION) * 100, 100)
  const canStartFlowPointsRedemption = highestBusinessBalance >= FLOW_POINTS_MINIMUM_REDEMPTION
  const eligibleRedeemTargets = redeemableTargets.filter((target) => Number(target.availablePoints) >= FLOW_POINTS_MINIMUM_REDEMPTION)
  const [locationDetection, setLocationDetection] = useState({ status: 'idle', message: '' })
  const [notificationPermission, setNotificationPermission] = useState(() => (
    canUseBrowserNotifications() ? Notification.permission : 'unsupported'
  ))

  const shareApplication = async () => {
    const shareData = {
      title: 'Studio Flow',
      text: 'Reserva servicios de belleza, encuentra promociones y acumula FlowPoints en Studio Flow.',
      url: sharePreviewUrl('https://studioflow.vip/para-clientas'),
    }

    setShareApplicationNotice('')

    try {
      if (navigator.share) {
        await navigator.share(shareData)
        setShareApplicationNotice('Studio Flow se compartio correctamente.')
        return
      }

      await navigator.clipboard.writeText(shareData.url)
      setShareApplicationNotice('Enlace copiado. Ya puedes compartirlo.')
    } catch (error) {
      if (error?.name !== 'AbortError') {
        setShareApplicationNotice('No se pudo compartir. Intenta nuevamente.')
      }
    }
  }
  const isRealMarketplace = !session.isMockSession
  const artistStudioMemberships = useMemo(
    () => deriveMembershipsFromLegacyData({ artists: adminState.artists }),
    [adminState.artists],
  )
  const getArtistMembership = (artist) => artist?.membership || (isRealMarketplace ? null : getMembershipForArtist({
    artistId: artist?.artistId || artist?.id,
    artistStudioMemberships,
  }))
  const getArtistStudio = (artist) => artist?.studio || (isRealMarketplace ? null : getStudioForArtist({
    artistId: artist?.artistId || artist?.id,
    studios: adminState.studios,
    artistStudioMemberships,
  }))
  const activeArtists = isRealMarketplace
    ? marketplaceListings
    : adminState.artists.filter((artist) => {
      const artistStudio = getArtistStudio(artist)
      return artist.status === 'Activo' && canUseOperationalFeature(artistStudio || artist, 'publicAgenda')
    })
  const beautySpaceCategoryNames = new Set(Object.keys(
    beautySpace === BEAUTY_SPACES.SPA_AND_ADVANCED_AESTHETICS ? advancedAestheticsCatalog : serviceCatalog,
  ))
  beautySpaceCategoryNames.add(beautySpace === BEAUTY_SPACES.SPA_AND_ADVANCED_AESTHETICS
    ? 'Personalizar · Spa y estética avanzada'
    : 'Personalizar · Salón de belleza')
  const beautySpaceArtists = activeArtists
    .filter((artist) => (
      (artist.beautySpaces || [artist.beautySpace || BEAUTY_SPACES.BEAUTY_AND_PERSONAL_CARE]).includes(beautySpace)
    ))
    .map((artist) => {
      const marketplaceServiceOptions = (artist.marketplaceServiceOptions || []).filter((service) => (
        beautySpaceCategoryNames.has(service.category)
      ))
      return {
        ...artist,
        marketplaceServiceOptions,
        marketplaceServices: marketplaceServiceOptions.map((service) => service.name),
        services: marketplaceServiceOptions.map((service) => service.name).join(', '),
      }
    })
  const marketplaceSearchServices = useMemo(() => {
    const groupsFromArtists = buildServiceGroupsFromListings(beautySpaceArtists)
    const mergedGroups = beautySpace === BEAUTY_SPACES.SPA_AND_ADVANCED_AESTHETICS
      ? { ...advancedSearchServices }
      : { ...searchServices }

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
  }, [beautySpace, beautySpaceArtists])
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
  const depositPolicyLoading = Boolean(selectedServiceOfferingId && depositPolicyResult.serviceId !== selectedServiceOfferingId)
  const depositPolicy = depositPolicyLoading ? {} : depositPolicyResult.policy
  const depositPolicyError = depositPolicyLoading ? '' : depositPolicyResult.error
  useEffect(() => {
    if (!selectedServiceOfferingId) return undefined
    let active = true
    fetchDepositPolicy(selectedServiceOfferingId).then((policy) => { if (active) setDepositPolicyResult({ serviceId: selectedServiceOfferingId, policy, error: '' }) })
      .catch((error) => { if (active) setDepositPolicyResult({ serviceId: selectedServiceOfferingId, policy: {}, error: error.message || 'No se pudo consultar el anticipo.' }) })
    return () => { active = false }
  }, [selectedServiceOfferingId])
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

    let refreshTimer
    const refreshMarketplaceAfterExternalReturn = () => {
      if (document.visibilityState && document.visibilityState !== 'visible') return

      window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => {
        if (document.visibilityState === 'hidden') return
        if (selectedArtistProfile?.listingId && bookingDate) {
          loadMarketplaceAvailability({
            listingId: selectedArtistProfile.listingId,
            serviceOfferingId: selectedServiceOfferingId,
            date: bookingDate,
          })
        }
      }, 150)
    }

    window.addEventListener('pageshow', refreshMarketplaceAfterExternalReturn)
    window.addEventListener('focus', refreshMarketplaceAfterExternalReturn)

    return () => {
      window.clearTimeout(refreshTimer)
      window.removeEventListener('pageshow', refreshMarketplaceAfterExternalReturn)
      window.removeEventListener('focus', refreshMarketplaceAfterExternalReturn)
    }
  }, [
    bookingDate,
    isRealMarketplace,
    loadMarketplaceAvailability,
    selectedArtistProfile?.listingId,
    selectedServiceOfferingId,
  ])

  if (searchMode === 'Servicio' && primaryServiceOptions.length > 0 && !(selectedArtistProfile && selectedMarketplaceServiceId)) {
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
  }

  const availableSlots = useMemo(
    () => {
      const normalizeSlots = (slots = []) => {
        const seenSlots = new Set()
        const selectedArtistId = selectedArtistProfile?.artistId || (isRealMarketplace ? '' : selectedArtistProfile?.id) || ''
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
      selectedArtistProfile,
      selectedArtistStudio?.id,
    ],
  )
  const noAvailabilityMessage = happyHourOnly
    ? `No hay espacio suficiente dentro de Happy Hour para ${selectedMarketplaceServiceName || 'este servicio'} en esta fecha. Prueba otro dia marcado o un servicio de menor duracion.`
    : `No encontramos un horario continuo para ${selectedMarketplaceServiceName || 'este servicio'} el ${formatBookingDate(bookingDate)}. Prueba otra fecha; la búsqueda considera la duración, los descansos, las citas ocupadas y la anticipación mínima.`
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
  if (isRealMarketplace && selectedArtistProfile) {
    const refreshedArtistProfile = marketplaceListings.find((listing) => (
      listing.listingId === selectedArtistProfile.listingId
    ))

    if (!refreshedArtistProfile) {
      setSelectedArtistProfile(null)
      setSelectedArtistPanelMode('')
    } else {
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
    }
  }

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
    name: clientState.profile?.name || sessionClientName || artistClientProfile?.name,
    email: clientState.profile?.email || sessionClientEmail || artistClientProfile?.email,
    phone: clientState.profile?.phone || sessionClientPhone || artistClientProfile?.phone,
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

  const clientProfileSourceKey = JSON.stringify([
    hasRealClientSession, currentClient.id, currentClient.profileId, currentClient.name,
    currentClient.email, currentClient.phone, currentClient.birthday, currentClient.latitude,
    currentClient.longitude, currentClient.city, currentClient.state, currentClient.postalCode,
    currentClient.notes, currentClient.photoUrl,
  ])
  const [previousClientProfileSourceKey, setPreviousClientProfileSourceKey] = useState(null)
  if (hasRealClientSession && previousClientProfileSourceKey !== clientProfileSourceKey) {
    setPreviousClientProfileSourceKey(clientProfileSourceKey)
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
      notes: currentClient.notes || '',
      photoUrl: currentClient.photoUrl || '',
    }))
  }
  const handleClientPhotoChange = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const photoUrl = await optimizeImageFile(file, { maxWidth: 720, maxHeight: 720, quality: 0.8 })
      setProfileDraft((currentDraft) => ({ ...currentDraft, photoUrl }))
      setProfileError('Fotografia optimizada. Guarda el perfil para aplicar el cambio.')
    } catch (error) {
      setProfileError(error.message || 'No se pudo optimizar la fotografia.')
    }
    event.target.value = ''
  }

  const removeClientPhoto = () => {
    setProfileDraft((currentDraft) => ({ ...currentDraft, photoUrl: '' }))
  }

  const saveClientProfile = async () => {
    if (isProfileSaving) return
    const birthdayError = validateBirthDate(profileDraft.birthday)
    if (birthdayError) {
      setProfileError(birthdayError)
      return
    }

    setProfileError('')
    setIsProfileSaving(true)
    try {
      const savedProfile = await updateClientProfile(profileDraft)
      setProfileDraft((currentDraft) => ({ ...currentDraft, ...savedProfile }))
      setProfileError('Perfil guardado.')
    } catch (error) {
      setProfileError(error.message || 'No se pudo guardar el perfil. Intenta nuevamente.')
    } finally {
      setIsProfileSaving(false)
    }
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

  useEffect(() => {
    if (!realAppointmentSourceReady) return undefined
    let active = true
    fetchMyVisitReviews().then((reviews) => { if (active) setMyVisitReviews(reviews) }).catch(() => {})
    return () => { active = false }
  }, [realAppointmentSourceReady])

  // Generar automatizaciones inteligentes
  const clientAutomations = hasRealClientSession ? [] : generateClientAutomations(currentClient, artistServices)

  const marketplaceArtists = (() => {
      const directSearchQuery = studioQuery.trim().toLowerCase()
      return beautySpaceArtists
        .map((artist) => {
          if (isRealMarketplace) return artist

          return hydrateMarketplaceArtist(artist, getVisibleSlotCountForArtist(artist), getArtistStudio(artist), getArtistMembership(artist))
        })
        .filter((artist) => {
          if (searchMode === 'Nombre estudio') {
            if (directSearchQuery.length < 2) return true

            const artistStudio = getStudioPublicProfile({
              artist,
              studios: adminState.studios,
              artistStudioMemberships,
            })
            const searchable = `${artist.name} ${artist.owner} ${artist.city} ${artistStudio.profile?.commercialName || ''}`.toLowerCase()
            return searchable.includes(directSearchQuery)
          }

          if (serviceFilterMode === 'category') return artist.marketplaceServiceOptions.some((service) => service.category === primaryService)
          if (serviceFilterMode === 'service') return artist.marketplaceServices.includes(secondaryService)
          return true
        })
        .filter((artist) => !todayOnly || getTodayAvailabilityCount(artist) > 0)
        .filter((artist) => !happyHourOnly || hasActiveHappyHour(artist))
        .filter((artist) => !doublePointsOnly || hasActiveDoublePoints(artist))
        .sort((firstArtist, secondArtist) => {
          if (nearbyOnly) {
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
            const firstLocation = getEffectiveProfessionalLocation(
              firstProfile,
              firstStudio,
              firstArtist,
              firstArtist.profileType === 'studio',
            ).location
            const secondLocation = getEffectiveProfessionalLocation(
              secondProfile,
              secondStudio,
              secondArtist,
              secondArtist.profileType === 'studio',
            ).location
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

          if (todayOnly) {
            return getTodayAvailabilityCount(secondArtist) - getTodayAvailabilityCount(firstArtist)
              || secondArtist.availabilityScore - firstArtist.availabilityScore
              || firstArtist.occupancy - secondArtist.occupancy
          }

          return secondArtist.availabilityScore - firstArtist.availabilityScore
            || firstArtist.occupancy - secondArtist.occupancy
        })
  })()
  const visibleMarketplaceArtists = marketplaceArtists.slice(0, visibleMarketplaceCount)
  const hasMoreMarketplaceArtists = marketplaceArtists.length > visibleMarketplaceArtists.length
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
      .filter((appointment) => !appointmentHistoryDate || getAppointmentDateKey(appointment) === appointmentHistoryDate)
      .filter((appointment) => !appointmentHistoryBusiness.trim() || normalizeText([
        appointment.artist, appointment.studio, appointment.studioName, appointment.contextName,
      ].filter(Boolean).join(' ')).includes(normalizeText(appointmentHistoryBusiness.trim())))
      .sort(newestAppointmentFirst)
    : []
  const appointmentsAwaitingPoints = realAppointmentSourceReady
    ? pendingAppointmentPoints(realClientAppointments, now)
    : []
  const visibleHistoricalAppointments = historicalAppointments.slice(0, visibleHistoryCount)
  const hasMoreHistoricalAppointments = visibleHistoryCount < historicalAppointments.length
  const nextAppointment = [...upcomingAppointments].sort((firstAppointment, secondAppointment) => (
    String(firstAppointment.date || '').localeCompare(String(secondAppointment.date || ''))
    || String(firstAppointment.time || '').localeCompare(String(secondAppointment.time || ''))
  ))[0]
  const pendingConfirmationAppointments = upcomingAppointments.filter((appointment) => (
    appointment.confirmationRequestedAt
    && !hasCurrentAttendanceConfirmation(appointment)
  ))
  const pendingConfirmationCount = pendingConfirmationAppointments.length
  const canRespondToAppointment = (appointment = {}) => (
    appointment.id
    && !['completed', 'cancelled', 'no_show'].includes(String(appointment.appointmentStatus || '').toLowerCase())
    && !['Completada', 'Cancelada', 'No show'].includes(appointment.status)
  )
  const canConfirmAppointment = (appointment = {}) => (
    canRespondToAppointment(appointment)
    && (!appointment.depositPlan || appointment.depositPlan.depositReceivedAt)
    && !hasCurrentAttendanceConfirmation(appointment)
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
        if (isActive) setClientFlowPoints({ monthlyBalance: 0, monthlyEarned: 0, monthlySpent: 0, activeBalance: 0, expiringSoonPoints: 0, nextExpirationAt: null, validityDays: FLOW_POINTS_VALIDITY_DAYS })
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

  useEffect(() => {
    if (!hasRealClientSession) return undefined
    let active = true
    Promise.all([fetchClientFlowPointDestinations(), fetchClientFlowPointRedemptions()])
      .then(([destinations, redemptions]) => {
        if (!active) return
        setRedeemTargets(destinations)
        setRecentRedemptions(redemptions)
        setRedeemTargetsError('')
      })
      .catch(() => { if (active) setRedeemTargetsError('No pudimos consultar dónde puedes usar tus puntos. Vuelve a intentarlo.') })
    return () => { active = false }
  }, [hasRealClientSession, realClientAppointments])
  const selectedRedeemTarget = redeemTargets.find((item) => `${item.type}:${item.id}` === redeemDraft.targetId)
  const selectedRedeemBalance = Number(selectedRedeemTarget?.availablePoints) || 0
  const pointsToRedeem = Number(redeemDraft.points)
  const canReviewRedemption = Boolean(selectedRedeemTarget)
    && selectedRedeemTarget.redeemable !== false
    && selectedRedeemBalance >= FLOW_POINTS_MINIMUM_REDEMPTION
    && Number.isInteger(pointsToRedeem)
    && pointsToRedeem >= FLOW_POINTS_REDEMPTION_STEP
    && pointsToRedeem % FLOW_POINTS_REDEMPTION_STEP === 0
    && pointsToRedeem <= selectedRedeemBalance
    && !redeemBusy
  const redeemTargetMatches = useMemo(() => {
    const query = redeemDraft.targetQuery.trim().toLowerCase()
    return redeemTargets
      .filter((target) => !query || target.label.toLowerCase().includes(query))
  }, [redeemDraft.targetQuery, redeemTargets])

  const redeemFlowPoints = async () => {
    if (redeemInFlightRef.current) return
    const target = selectedRedeemTarget
    const points = Number(redeemDraft.points)

    if (!target || target.redeemable === false || Number(target.availablePoints) < FLOW_POINTS_MINIMUM_REDEMPTION) {
      setRedeemStatus('Elige un negocio activo donde hayas reunido al menos 1,000 FlowPoints.')
      return
    }
    if (!Number.isInteger(points) || points < FLOW_POINTS_REDEMPTION_STEP || points % FLOW_POINTS_REDEMPTION_STEP !== 0) {
      setRedeemStatus('Elige 100 FP o más, en múltiplos de 100.')
      return
    }

    if (points > Number(target.availablePoints)) {
      setRedeemStatus(`Tienes ${flowPointsNumber.format(target.availablePoints)} FP disponibles con ${target.label}.`)
      return
    }
    redeemInFlightRef.current = true
    setRedeemBusy(true)
    setRedeemStatus('')
    try {
      const payload = await redeemClientFlowPointsRecord({
        points,
        artistId: target.type === 'artist' ? target.id : null,
        studioId: target.type === 'studio' ? target.id : null,
      })
      setRedemptionReceipt({ id: payload.redemptionId || payload.redemption_id, points, businessName: target.label })
      setRedeemDraft({ points: '', targetId: '', targetQuery: '' })
      setConfirmRedeem(false)
      try {
        const [balance, destinations, redemptions] = await Promise.all([
          fetchClientFlowPointsBalance(), fetchClientFlowPointDestinations(), fetchClientFlowPointRedemptions(),
        ])
        setClientFlowPoints(balance)
        setRedeemTargets(destinations)
        setRecentRedemptions(redemptions)
      } catch { setRedeemStatus('Canje realizado. Actualiza la pantalla para ver tu nuevo saldo.') }
    } catch (error) { setRedeemStatus(error.message || 'No se pudo completar el canje. Tus puntos no se descontaron.') }
    finally { redeemInFlightRef.current = false; setRedeemBusy(false) }
  }
  const enableAppointmentNotifications = async () => {
    if (!canUseBrowserNotifications()) return

    const permission = await Notification.requestPermission()
    setNotificationPermission(permission)
    window.dispatchEvent(new Event('studioflow:notification-permission'))

    if (permission === 'granted') {
      pendingConfirmationAppointments.forEach((appointment) => {
        showAppointmentBrowserNotification(appointment)
        storeConfirmationNoticeKey(getConfirmationNoticeKey(appointment))
      })
    }
  }

  useEffect(() => {
    if (!canUseBrowserNotifications()) return undefined
    const syncNotificationPermission = () => setNotificationPermission(Notification.permission)
    window.addEventListener('studioflow:notification-permission', syncNotificationPermission)
    return () => window.removeEventListener('studioflow:notification-permission', syncNotificationPermission)
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

  const reserveSlot = async (slot, acceptedDeposit = false) => {

    if (!slot.available) return
    if (depositPolicyLoading || depositPolicyError) {
      setBookingNotice(depositPolicyError || 'Consultando las condiciones de pago. Inténtalo de nuevo en un momento.')
      return
    }
    if (isRealMarketplace && depositPolicy.enabled && !acceptedDeposit) {
      setPendingDepositSlot(slot)
      return
    }
    setBookingNotice('')

    if (isRealMarketplace) {


      const serviceOfferingId = slot.serviceOfferingId || selectedServiceOfferingId
      const availabilitySlotIds = slot.availabilitySlotIds?.length
        ? slot.availabilitySlotIds
        : [slot.availabilitySlotId || slot.id]


      try {
        const booking = await bookMarketplaceAppointment({
          availabilitySlotIds,
          serviceOfferingId,
          flowPointsToUse: flowPointsUseOptions.includes(Number(selectedMarketplaceRewardId)) ? Number(selectedMarketplaceRewardId) : 0,
        })


        if (booking) {
          await loadClientAppointments()
          await loadMarketplaceAvailability({
            listingId: selectedArtistProfile?.listingId,
            serviceOfferingId,
            date: bookingDate,
          })
          setBookingNotice(depositPolicy.enabled ? 'Cita solicitada. Abre Citas y reseñas y toca Ver tarjeta de anticipo para consultar los datos de pago. El negocio confirmará al recibirlo.' : 'Reservado con exito. Tu cita ya aparece en Citas.')
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

  const selectedArtistFlowPointsActive = Boolean(selectedArtistProfile) && (
    selectedArtistProfile?.activePromotions?.some((promotion) => (
    (promotion.type || promotion.promotion_type) === 'private_promo'
    && (promotion.name || '').toLowerCase().includes('flow points')
  )) || selectedArtistProfile?.rewards?.some((reward) => reward.status === 'active')
  )

  const profileOffersFlowPoints = (profile) => profile?.rewards?.some((reward) => reward.status === 'active')

  const selectedServicePrice = Number(selectedMarketplaceService?.priceAmount || effectiveMarketplaceService?.priceAmount || 0)
  const maxFlowPointsDiscountPercentage = Number(
    selectedArtistProfile?.flowPointsMaxDiscountPercentage
      || selectedArtistProfile?.rewards?.[0]?.discountPercent
      || 5,
  )
  const selectedFlowPointsTarget = redeemTargets.find((target) => target.type === (selectedArtistProfile?.studioId || selectedArtistStudio?.id ? 'studio' : 'artist')
    && target.id === (selectedArtistProfile?.studioId || selectedArtistStudio?.id || selectedArtistProfile?.artistId || selectedArtistProfile?.id))
  const selectedFlowPointsBalance = selectedFlowPointsTarget?.redeemable === false ? 0 : Number(selectedFlowPointsTarget?.availablePoints) || 0
  const maxFlowPointsForAppointment = Math.max(0, Math.floor(
    Math.min(selectedFlowPointsBalance, selectedServicePrice * maxFlowPointsDiscountPercentage / 100 * FLOW_POINTS_PER_MXN) / FLOW_POINTS_REDEMPTION_STEP,
  ) * FLOW_POINTS_REDEMPTION_STEP)
  const flowPointsUseOptions = selectedFlowPointsBalance >= FLOW_POINTS_MINIMUM_REDEMPTION && maxFlowPointsForAppointment >= FLOW_POINTS_REDEMPTION_STEP
    ? Array.from(
        { length: Math.floor(maxFlowPointsForAppointment / FLOW_POINTS_REDEMPTION_STEP) },
        (_, index) => (index + 1) * FLOW_POINTS_REDEMPTION_STEP,
      )
    : []

  const renderFlowPointsSelector = () => selectedArtistFlowPointsActive && (
    <label className="input-field">
      <span>FlowPoints que deseas usar</span>
      <select value={selectedMarketplaceRewardId} onChange={(event) => setSelectedMarketplaceRewardId(event.target.value)}>
        <option value="">No usar puntos en esta cita</option>
        {flowPointsUseOptions.map((points) => (
          <option value={points} key={points}>{flowPointsNumber.format(points)} FP = ${flowPointsNumber.format(points / FLOW_POINTS_PER_MXN)} MXN</option>
        ))}
      </select>
      <small>
        {flowPointsUseOptions.length > 0
          ? `Desde 100 FP. Después del descuento necesitarás volver a 1,000 FP para otro canje. Solo uno por día.`
          : selectedFlowPointsTarget?.redeemable === false
            ? 'Los puntos de este estudio están en pausa mientras permanezca suspendido.'
            : `Necesitas 1,000 FP con este negocio y un servicio que admita al menos 100 FP de descuento.`}
      </small>
    </label>
  )

  const loadMarketplacePortfolio = (listingId) => {
    if (!listingId || portfolioRequestsRef.current.has(listingId)) return
    portfolioRequestsRef.current.add(listingId)
    setPortfolioStatusByListing((current) => ({ ...current, [listingId]: 'loading' }))
    fetchMarketplaceListingPortfolio(listingId, {
      onPage: (portfolio) => setPortfolioByListing((current) => ({ ...current, [listingId]: portfolio })),
    })
      .then((portfolio) => {
        setPortfolioByListing((current) => ({ ...current, [listingId]: portfolio }))
        setPortfolioStatusByListing((current) => ({ ...current, [listingId]: 'loaded' }))
      })
      .catch(() => setPortfolioStatusByListing((current) => ({ ...current, [listingId]: 'error' })))
      .finally(() => portfolioRequestsRef.current.delete(listingId))
  }

  const openArtistProfile = (artist, { mode = 'profile' } = {}) => {
    const nextService = getInitialServiceForArtistProfile(artist)

    setSelectedArtistProfile(artist)
    setSelectedArtistPanelMode(mode)
    setSelectedMarketplaceServiceId(nextService.id || '')
    setSelectedMarketplaceServiceExplicit(serviceFilterMode === 'service' && nextService.name === secondaryService)
    setSecondaryService(nextService.name || getNextServiceForArtist(artist))
    setBookingNotice('')
    setOpenDropdown(null)
    if (mode === 'profile' && isRealMarketplace && artist.listingId && !Object.hasOwn(portfolioByListing, artist.listingId)) {
      loadMarketplacePortfolio(artist.listingId)
    }
  }

  const closeArtistProfile = () => {
    setSelectedArtistProfile(null)
    setSelectedArtistPanelMode('')
    setSelectedMarketplaceServiceId('')
    setSelectedMarketplaceServiceExplicit(false)
    setSelectedMarketplaceRewardId('')
    setBookingNotice('')
    setOpenDropdown(null)
  }

  const resetMarketplaceList = () => {
    setVisibleMarketplaceCount(5)
    closeArtistProfile()
  }

  const toggleNearbyFilter = () => {
    setNearbyOnly((currentValue) => !currentValue)
    resetMarketplaceList()
  }

  const toggleTodayFilter = () => {
    setTodayOnly((currentValue) => !currentValue)
    setBookingDate(getTodayDateValue())
    resetMarketplaceList()
  }

  const toggleHappyHourFilter = () => {
    setHappyHourOnly((currentValue) => !currentValue)
    resetMarketplaceList()
  }

  const toggleDoublePointsFilter = () => {
    setDoublePointsOnly((currentValue) => !currentValue)
    resetMarketplaceList()
  }

  const changeSelectedMarketplaceService = (nextServiceName) => {
    const services = Array.isArray(selectedArtistProfile?.marketplaceServiceOptions)
      ? selectedArtistProfile.marketplaceServiceOptions
      : []
    const nextService = services.find((service) => service.name === nextServiceName)

    setSelectedMarketplaceServiceId(nextService?.id || '')
    setSelectedMarketplaceServiceExplicit(Boolean(nextService))
    setSecondaryService(nextService?.name || nextServiceName)
    setSelectedMarketplaceRewardId('')
  }

  const changeSelectedArtistPrimaryService = (nextPrimaryService) => {
    const nextService = selectedArtistServiceGroups[nextPrimaryService]?.[0]
    setSelectedMarketplaceServiceId(nextService?.id || '')
    setSelectedMarketplaceServiceExplicit(false)
    setSecondaryService(nextService?.name || '')
    setSelectedMarketplaceRewardId('')
    setOpenDropdown(null)
  }

  const selectServiceFromProfileMenu = (service) => {
    setSelectedMarketplaceServiceId(service?.id || '')
    setSelectedMarketplaceServiceExplicit(Boolean(service))
    setSecondaryService(service?.name || '')
    setSelectedMarketplaceRewardId('')
    setSelectedArtistPanelMode('booking')
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
          label="Elige una categoria"
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
          label="Elige el servicio que quieres agendar"
          value={selectedMarketplaceServiceName}
          open={openDropdown === `${dropdownPrefix}SecondaryService`}
          onToggle={() => setOpenDropdown(openDropdown === `${dropdownPrefix}SecondaryService` ? null : `${dropdownPrefix}SecondaryService`)}
          onChange={changeSelectedMarketplaceService}
          options={selectedArtistSecondaryGroup.map((service) => ({
            value: service.name,
            label: service.name,
            meta: formatServiceOptionMeta(service),
          }))}
        />
        <label className="input-field">
          <span>Fecha</span>
          <input className="booking-date-input" type="date" min={getTodayDateValue()} value={bookingDate} onClick={openBookingDatePicker} onChange={(event) => setBookingDate(event.target.value)} />
        </label>
        {renderFlowPointsSelector()}
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
              <small>FP automaticos al completar</small>
            </button>
          ))
        ) : (
          <div className="list-row elevated-row availability-empty-row">
            <div className="availability-empty-copy">
              <strong>{isAvailabilityLoading ? 'Cargando horarios...' : happyHourOnly ? 'Sin horarios disponibles para Happy Hour' : 'Sin horarios disponibles'}</strong>
              <small>{availabilityError || noAvailabilityMessage}</small>
            </div>
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

  return (
    <main className={`dashboard-grid client-grid view-${view}`}>
        {view === 'inicio' && (
          <>
            {hasRealClientSession && <ClientManualBookingRequests key={`manual-${currentClient.id}`} />}
            {hasRealClientSession && <ClientMarketingNotices key={currentClient.id} />}
            <PendingPointsNotice appointments={appointmentsAwaitingPoints} audience="client" onOpen={() => navigate(paths.clientAppointments)} />
            <section className="hero-panel client-hero mobile-screen">
              <div className="client-home-intro">
                <div className="client-hero-heading">
                  <div className="client-hero-identity">
                    <span className="client-hero-greeting">Hola</span>
                    <strong className="client-hero-name">{currentClient.name}</strong>
                    <p className="client-home-message">Tu próximo momento favorito empieza aquí.</p>
                  </div>
                  <div className="client-hero-photo">
                    {currentClient.photoUrl ? (
                      <img src={currentClient.photoUrl} alt={`Foto de ${currentClient.name}`} />
                    ) : (
                      <span>Agregar foto</span>
                    )}
                  </div>
                </div>
                <div className="hero-actions">
                  <Button onClick={() => navigate(paths.clientExplore)}><CalendarDays size={18} aria-hidden="true" /> Agendar ahora</Button>
                  <Button variant="ghost" onClick={() => navigate(paths.clientAppointments)}>Ver mis citas</Button>
                </div>
              </div>
              <div className="client-hero-summary-stack">
                <div className="hero-summary client-hero-summary">
                  <span>{nextAppointment ? 'Tu próxima cita' : 'Tu agenda está libre'}</span>
                  {nextAppointment ? (
                    <>
                      <strong>{nextAppointment.date}</strong>
                      <small><Clock3 size={14} aria-hidden="true" /> {nextAppointment.time || '--:--'} · {nextAppointment.service || 'Servicio reservado'}</small>
                    </>
                  ) : (
                    <strong>¿Qué se te antoja?</strong>
                  )}
                  <b>{upcomingAppointments.length} {upcomingAppointments.length === 1 ? 'cita próxima' : 'citas próximas'}</b>
                </div>
                <Button className="full-width client-share-application" onClick={shareApplication}>
                  <Share2 size={19} aria-hidden="true" />
                  Compartir aplicación
                </Button>
                {shareApplicationNotice && (
                  <small className="client-share-application-notice" role="status" aria-live="polite">
                    {shareApplicationNotice}
                  </small>
                )}
              </div>
            </section>

            <button className="client-fp-home-preview" type="button" onClick={() => navigate(paths.clientFlowPoints)}>
              <span><Sparkles size={21} aria-hidden="true" /> TUS FLOWPOINTS</span>
              <strong>{flowPointsNumber.format(flowPointsBalance)} FP</strong>
              <small>Tu próxima recompensa empieza aquí <span aria-hidden="true">→</span></small>
            </button>
          </>
        )}

        {view === 'fp' && (
          <>
            <Card id="mis-flowpoints" className="mobile-screen flow-points-client-card fp-dedicated-card">
              <header className="fp-dedicated-hero">
                <span><Sparkles size={17} aria-hidden="true" /> CADA VISITA CUENTA</span>
                <h1>Tus FlowPoints</h1>
                <strong>{flowPointsNumber.format(flowPointsBalance)} <small>FP</small></strong>
                <p>Tu belleza también te recompensa.</p>
              </header>
              <section className="flow-points-business-balances" aria-labelledby="flow-points-business-title">
                <div className="flow-points-business-heading">
                  <div>
                    <span>TUS BENEFICIOS</span>
                    <h3 id="flow-points-business-title">Puntos por negocio</h3>
                  </div>
                  <Sparkles size={22} aria-hidden="true" />
                </div>
                <p>Cada negocio guarda los puntos que ganaste con él.</p>
                {redeemTargets.length > 4 && <Input
                  label="Buscar artista o estudio"
                  placeholder="Escribe el nombre..."
                  type="search"
                  value={redeemDraft.targetQuery}
                  onChange={(event) => { setConfirmRedeem(false); setRedeemDraft((draft) => ({
                    ...draft,
                    targetId: '',
                    targetQuery: event.target.value,
                  })) }}
                />}
                {redeemTargetsError && <small role="alert">{redeemTargetsError}</small>}
                {!redeemTargetsError && redeemTargets.length === 0 && <small>Aún no tienes puntos por negocio. Se acreditan al completar una cita participante.</small>}
                {redeemTargets.length > 0 && <div className="flow-points-business-list">
                  {redeemTargetMatches.map((target) => {
                    const balance = Number(target.availablePoints) || 0
                    const selected = redeemDraft.targetId === `${target.type}:${target.id}`
                    const paused = target.redeemable === false
                    const ready = !paused && balance >= FLOW_POINTS_MINIMUM_REDEMPTION
                    return <button
                      className={`flow-points-business-row${selected ? ' is-selected' : ''}${paused ? ' is-paused' : ''}`}
                      key={`${target.type}:${target.id}`}
                      type="button"
                      disabled={paused}
                      aria-pressed={selected}
                      onClick={() => {
                        setRedeemDraft((draft) => ({
                          ...draft,
                          targetId: `${target.type}:${target.id}`,
                          targetQuery: '',
                          points: ready && (!draft.points || Number(draft.points) > balance) ? String(FLOW_POINTS_REDEMPTION_STEP) : draft.points,
                        }))
                        setRedeemStatus('')
                        setConfirmRedeem(false)
                      }}
                    >
                      <span className="flow-points-business-icon" aria-hidden="true">✦</span>
                      <span className="flow-points-business-copy"><strong>{target.label}</strong><small>{target.type === 'studio' ? 'Estudio' : 'Artista'} · {paused ? 'Puntos en pausa · negocio suspendido' : ready ? 'Puedes usar desde 100 FP' : `Faltan ${flowPointsNumber.format(FLOW_POINTS_MINIMUM_REDEMPTION - balance)} FP para volver a canjear`}</small></span>
                      <span className="flow-points-business-amount"><strong>{flowPointsNumber.format(balance)}</strong><small>FP</small></span>
                      <span className="flow-points-business-meter" aria-hidden="true"><span style={{ width: `${Math.min(balance / FLOW_POINTS_MINIMUM_REDEMPTION * 100, 100)}%` }} /></span>
                    </button>
                  })}
                  {redeemTargetMatches.length === 0 && <small>No hay negocios con ese nombre.</small>}
                </div>}
              </section>
              <div className={`flow-points-threshold fp-dedicated-progress ${canStartFlowPointsRedemption ? 'is-ready' : ''}`}>
                <div>
                  <strong>{canStartFlowPointsRedemption ? '¡Ya puedes usar tus puntos!' : hasPausedPoints && highestBusinessBalance === 0 ? 'Tus puntos te esperan' : `A ${flowPointsNumber.format(flowPointsMissing)} FP de volver a canjear`}</strong>
                  <small>{canStartFlowPointsRedemption ? 'Usa desde 100 FP con un negocio activo. Si bajas de 1,000 FP, vuelve a reunirlos para tu próximo canje.' : hasPausedPoints && highestBusinessBalance === 0 ? 'Los puntos de negocios suspendidos siguen visibles, pero su canje está en pausa.' : 'Reúne 1,000 FP con un mismo negocio para desbloquear otro canje.'}</small>
                </div>
                <div className="flow-points-progress" aria-label={`${Math.round(flowPointsProgress)}% del minimo para canjear`}>
                  <span style={{ width: `${flowPointsProgress}%` }} />
                </div>
              </div>
              {clientFlowPoints.expiringSoonPoints > 0 && (
                <div className="points-expiring-warning">
                  <strong>{clientFlowPoints.expiringSoonPoints} puntos por caducar</strong>
                  <small>Usalos pronto para aprovechar tus beneficios antes de que venza su vigencia.</small>
                </div>
              )}
              <div className="fp-dedicated-links">
                <Button disabled={!canStartFlowPointsRedemption} onClick={() => {
                  if (!showRedeemPanel) {
                    const onlyTarget = eligibleRedeemTargets.length === 1 ? eligibleRedeemTargets[0] : null
                    setRedeemDraft((draft) => ({
                      ...draft,
                      targetId: eligibleRedeemTargets.some((target) => `${target.type}:${target.id}` === draft.targetId)
                        ? draft.targetId
                        : onlyTarget ? `${onlyTarget.type}:${onlyTarget.id}` : '',
                      points: draft.points || String(FLOW_POINTS_REDEMPTION_STEP),
                    }))
                    setRedeemStatus('')
                    setConfirmRedeem(false)
                  }
                  setShowRedeemPanel((value) => !value)
                }}>{showRedeemPanel ? 'Cerrar canje' : 'Usar mis puntos'}</Button>
                <button type="button" onClick={() => navigate(paths.flowPointsGuide)}>¿Cómo funcionan?</button>
                <button type="button" onClick={() => navigate(paths.clientRewards)}>Ver mis premios</button>
              </div>
              {showRedeemPanel && <section className="fp-dedicated-redemption" aria-label="Canje de artículos">
              <h2>Canjear en el local</h2>
              <p>Con 1,000 FP reunidos puedes usar desde 100 FP. El negocio te dirá cuántos aplicar al artículo y cuánto pagar en efectivo.</p>
              <p className="fp-redemption-selection" role="status">{selectedRedeemTarget
                ? `${selectedRedeemTarget.label} · ${flowPointsNumber.format(selectedRedeemBalance)} FP disponibles`
                : 'Toca arriba el negocio donde quieres usar tus puntos.'}</p>
              <div className="location-form-grid">
                <Input
                  label="Puntos a usar"
                  disabled={!selectedRedeemTarget || selectedRedeemTarget.redeemable === false || selectedRedeemBalance < FLOW_POINTS_MINIMUM_REDEMPTION}
                  min={FLOW_POINTS_REDEMPTION_STEP}
                  max={selectedRedeemTarget?.availablePoints || flowPointsBalance || FLOW_POINTS_MINIMUM_REDEMPTION}
                  step={FLOW_POINTS_REDEMPTION_STEP}
                  type="number"
                  value={redeemDraft.points}
                  onChange={(event) => { setConfirmRedeem(false); setRedeemStatus(''); setRedeemDraft((draft) => ({ ...draft, points: event.target.value })) }}
                />
              </div>
              {selectedRedeemTarget && <small>Puedes usar de 100 a {flowPointsNumber.format(selectedRedeemBalance)} FP, en múltiplos de 100. El próximo canje se habilita al volver a 1,000 FP.</small>}
              <Button
                className="full-width"
                disabled={!canReviewRedemption}
                onClick={() => { setRedeemStatus(''); setConfirmRedeem(true) }}
              >
                Revisar canje para artículo
              </Button>
              {confirmRedeem && selectedRedeemTarget && <div className="flow-points-confirm"><strong>Vas a usar {flowPointsNumber.format(Number(redeemDraft.points))} FP con {selectedRedeemTarget.label}</strong><span>Confirma con el negocio que estos son los puntos para el artículo que elegiste y cuánto dinero pagarás allí. Al continuar se descontarán de tu saldo.</span><Button disabled={redeemBusy} onClick={redeemFlowPoints}>{redeemBusy ? 'Canjeando...' : 'Confirmar canje de artículo'}</Button><button type="button" onClick={() => setConfirmRedeem(false)}>Cambiar elección</button></div>}
              {redeemStatus && <small role="alert">{redeemStatus}</small>}
              {redemptionReceipt && <div className="flow-points-receipt" role="status"><strong>Canje realizado</strong><span>{flowPointsNumber.format(redemptionReceipt.points)} FP con {redemptionReceipt.businessName}</span><small>Muéstrale este folio al negocio: {redemptionReceipt.id?.slice(0, 8).toUpperCase()}</small></div>}
              </section>}
              {recentRedemptions.length > 0 && <details className="flow-points-history"><summary>Mis canjes recientes</summary>{recentRedemptions.slice(0, 3).map((item) => <div key={item.id}><span>{item.businessName} · {flowPointsNumber.format(item.points)} FP</span><small>Folio {item.id.slice(0, 8).toUpperCase()}</small></div>)}</details>}
            </Card>

          </>
        )}

        {view === 'inicio' && (
          <>
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
                    <p>{formatAppointmentProvider(nextAppointment)}</p>
                    <small className="flow-points-slot-note client-flow-points-highlight">
                      {nextAppointment.pointsGranted > 0
                        ? `${nextAppointment.pointsGranted} Flow Points otorgados`
                        : 'Los FlowPoints se calculan automaticamente al completar'}
                    </small>
                  </div>
                  <div className="client-next-payment">
                    <AppointmentPayment appointment={nextAppointment} compact />
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
                          <StatusPill tone={nextAppointment.depositPlan && !nextAppointment.depositPlan.depositReceivedAt ? 'warm' : 'success'}>{nextAppointment.depositPlan && !nextAppointment.depositPlan.depositReceivedAt ? 'Anticipo pendiente · ver en Citas' : 'Cita confirmada'}</StatusPill>
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
                    {nextAppointment.appointmentStatus === 'scheduled' && (
                      <RescheduleAppointmentButton appointment={nextAppointment} onRescheduled={loadClientAppointments} />
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
            <ClientAttendancePanel appointments={realClientAppointments} enabled={hasRealClientSession} />
            <PendingPointsNotice appointments={appointmentsAwaitingPoints} audience="client" />
            <Card className="wide-card mobile-screen primary-panel client-appointments-experience">
              <header className="client-appointments-hero">
                <div>
                  <h2>Lo bonito está por venir</h2>
                  <p>Todo listo para tus próximas experiencias.</p>
                </div>
                <CalendarDays aria-hidden="true" size={34} />
              </header>
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
                      <strong>{formatAppointmentCardDate(appointment.date)}</strong>
                      <span>{appointment.time}</span>
                    </div>
                    <div>
                      <h3>{appointment.service}</h3>
                      <AppointmentPayment appointment={appointment} />
                      <AppointmentDeposit appointment={appointment} />
                      <p>{formatAppointmentProvider(appointment)}</p>
                      <small className="flow-points-slot-note">
                        {appointment.pointsGranted > 0
                          ? `${appointment.pointsGranted} Flow Points otorgados`
                          : 'Los FlowPoints se calculan automaticamente al completar'}
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
                          {!canConfirmAppointment(appointment) && (appointment.depositPlan && !appointment.depositPlan.balanceReceivedAt ? (
                            <Button size="sm" className="appointment-pay-cta" onClick={() => openClientPaymentCard(appointment.id)}><CreditCard size={18} aria-hidden="true" />{appointment.depositPlan.depositReceivedAt ? 'Pagar saldo' : 'Pagar anticipo'}</Button>
                          ) : <StatusPill tone="success">Cita confirmada</StatusPill>)}
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
                      {appointment.appointmentStatus === 'scheduled' && (
                        <RescheduleAppointmentButton appointment={appointment} onRescheduled={loadClientAppointments} />
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
            <Card className="mobile-screen client-history-experience">
              <PanelHeader
                title="Citas pasadas y reseñas"
                eyebrow="TUS EXPERIENCIAS"
              />
              <p className="client-history-invitation">Cada visita tiene una historia. Cuéntanos cómo te fue y comparte lo que hizo especial tu experiencia.</p>
              <Button className="client-history-open-button" onClick={() => { setShowPastAppointments((current) => !current); setVisibleHistoryCount(5) }}>
                {showPastAppointments ? 'Ocultar citas y reseñas' : 'Ver mis citas y escribir reseñas'}
              </Button>
              {showPastAppointments && (
                <>
                  <div className="history-filter-intro">
                    <Button
                      className="history-filter-toggle"
                      aria-expanded={showAppointmentDateFilter}
                      onClick={() => setShowAppointmentDateFilter((current) => !current)}
                    >
                      <ListFilter size={19} aria-hidden="true" /> Filtrar
                    </Button>
                    <p>Busca en tu historial de citas por fecha o por negocio.</p>
                  </div>
                  {(appointmentHistoryDate || appointmentHistoryBusiness) && <div className="history-actions">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setAppointmentHistoryDate(''); setAppointmentHistoryBusiness(''); setVisibleHistoryCount(5) }}
                      >
                        Limpiar filtro
                      </Button>
                  </div>}
                  {showAppointmentDateFilter && (
                    <div className="history-filter-fields">
                      <label className="input-field history-date-filter">
                        <span>Fecha</span>
                        <input
                          type="date"
                          value={appointmentHistoryDate}
                          onChange={(event) => { setAppointmentHistoryDate(event.target.value); setVisibleHistoryCount(5) }}
                        />
                      </label>
                      <label className="input-field">
                        <span>Artista o estudio</span>
                        <input
                          type="search"
                          placeholder="Nombre del negocio"
                          value={appointmentHistoryBusiness}
                          onChange={(event) => { setAppointmentHistoryBusiness(event.target.value); setVisibleHistoryCount(5) }}
                        />
                      </label>
                    </div>
                  )}
                  <div className="compact-list">
                    {visibleHistoricalAppointments.length > 0 ? visibleHistoricalAppointments.map((item) => (
                      <div className="list-row elevated-row client-history-entry" key={`${item.id || item.service}-${item.date}-${item.time || ''}`}>
                        <div className="client-history-details">
                          <strong>{item.service}</strong>
                          <small>{item.artist}</small>
                          <time className="client-history-time" dateTime={item.startsAt || item.starts_at || undefined}>{historyDateTime(item)}</time>
                          <AppointmentPayment appointment={item} compact />
                          {item.pointsGranted > 0 && <small className="flow-points-slot-note">+{item.pointsGranted} FlowPoints otorgados</small>}
                          {item.happyHourApplied && <small className="flow-points-slot-note">Descuento Happy Hour aplicado</small>}
                          {Number(item.rewardMultiplier) > 1 && <small className="flow-points-slot-note">Puntos dobles aplicados</small>}
                        </div>
                        <StatusPill tone={getAppointmentStatusTone(item)}>{item.appointmentStatus === 'completed' ? 'Completada' : item.appointmentStatus === 'cancelled' ? 'Cancelada' : item.status || 'Finalizada'}</StatusPill>
                        {item.appointmentStatus === 'completed' && <VisitReviewEditor
                          key={`${item.id}-${myVisitReviews.find((review) => review.appointmentId === item.id)?.rating ?? 'new'}`}
                          appointment={item}
                          existing={myVisitReviews.find((review) => review.appointmentId === item.id)}
                          clientPhoto={currentClient.photoUrl}
                          clientName={currentClient.name}
                          onSaved={(review) => { setMyVisitReviews((current) => [review, ...current.filter((entry) => entry.appointmentId !== review.appointmentId)]); window.dispatchEvent(new Event('studio-flow-review-saved')) }}
                        />}
                      </div>
                    )) : (
                      <div className="list-row elevated-row">
                        <div>
                          <strong>{isClientAppointmentsLoading ? 'Cargando historial...' : 'Sin citas pasadas'}</strong>
                          <small>
                            {appointmentHistoryDate || appointmentHistoryBusiness
                              ? 'No hay citas que coincidan con tu búsqueda.'
                              : 'No hay citas registradas en tu historial.'}
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
          <Card className="mobile-screen primary-panel client-search-panel">
            <header className="client-search-hero">
              <span>ENCUENTRA TU FAVORITO</span>
              <h2>¿Qué buscas hoy?</h2>
            </header>
            <section className="beauty-space-selector" aria-label="Selecciona tu beauty space">
              <span className="eyebrow">ELIGE TU ESPACIO</span>
              <div className="beauty-space-options">
                <button
                  className={`beauty-space-choice${beautySpace === BEAUTY_SPACES.BEAUTY_AND_PERSONAL_CARE ? ' is-active' : ''}`}
                  type="button"
                  aria-pressed={beautySpace === BEAUTY_SPACES.BEAUTY_AND_PERSONAL_CARE}
                  onClick={() => { setBeautySpace(BEAUTY_SPACES.BEAUTY_AND_PERSONAL_CARE); setServiceFilterMode(''); resetMarketplaceList() }}
                >
                  Belleza y cuidado personal
                </button>
                <button
                  className={`beauty-space-choice${beautySpace === BEAUTY_SPACES.SPA_AND_ADVANCED_AESTHETICS ? ' is-active' : ''}`}
                  type="button"
                  aria-pressed={beautySpace === BEAUTY_SPACES.SPA_AND_ADVANCED_AESTHETICS}
                  onClick={() => { setBeautySpace(BEAUTY_SPACES.SPA_AND_ADVANCED_AESTHETICS); setServiceFilterMode(''); resetMarketplaceList() }}
                >
                  Spa y estética avanzada
                </button>
              </div>
            </section>
            <section className="client-recommendation-panel" aria-label="Recomendaciones de busqueda">
              <div className="client-recommendation-heading">
                <span className="eyebrow">PARA TI</span>
                <h3>Encuentra tu momento</h3>
                <small>Elige lo que más te importa ahora.</small>
              </div>
              <div className="client-recommendation-actions">
                <button
                  className={`recommendation-choice${nearbyOnly ? ' is-active' : ''}`}
                  type="button"
                  aria-pressed={nearbyOnly}
                  onClick={toggleNearbyFilter}
                >
                  <strong>Cerca de mí</strong>
                  {nearbyOnly && <span>Listo</span>}
                </button>
                <button
                  className={`recommendation-choice${todayOnly ? ' is-active' : ''}`}
                  type="button"
                  aria-pressed={todayOnly}
                  onClick={toggleTodayFilter}
                >
                  <strong>Disponible hoy</strong>
                  {todayOnly && <span>Listo</span>}
                </button>
              </div>
              {(nearbyOnly || todayOnly || happyHourOnly || doublePointsOnly) && (
                <p className="client-recommendation-status">
                  Perfecto, ajustamos las opciones para ti.
                </p>
              )}
              <div className="client-promo-filter-grid">
                <button
                  className={`client-promo-filter happy-hour${happyHourOnly ? ' is-active' : ''}`}
                  type="button"
                  aria-pressed={happyHourOnly}
                  onClick={toggleHappyHourFilter}
                >
                  <span>OPORTUNIDADES</span>
                  <strong>{happyHourOnly ? 'Elegido' : 'Happy Hour'}</strong>
                  <small>Horarios con descuento</small>
                </button>
                <button
                  className={`client-promo-filter double-points${doublePointsOnly ? ' is-active' : ''}`}
                  type="button"
                  aria-pressed={doublePointsOnly}
                  onClick={toggleDoublePointsFilter}
                >
                  <span>MÁS BENEFICIOS</span>
                  <strong>{doublePointsOnly ? 'Elegido' : 'Puntos dobles'}</strong>
                  <small>Gana más en tu visita</small>
                </button>
              </div>
            </section>
            <div className="form-stack compact-form">
              <PremiumDropdown
                label="¿Cómo quieres buscar?"
                value={searchMode}
                open={openDropdown === 'searchMode'}
                compact
                onToggle={() => setOpenDropdown(openDropdown === 'searchMode' ? null : 'searchMode')}
                onChange={(nextMode) => {
                  setSearchMode(nextMode)
                  setServiceFilterMode('')
                  resetMarketplaceList()
                }}
                options={[
                  { value: 'Servicio', label: 'Por servicio', meta: 'Explora todo lo que puedes reservar' },
                  { value: 'Nombre estudio', label: 'Por nombre', meta: 'Ya sé con quién quiero ir' },
                ]}
              />
              {searchMode === 'Servicio' ? (
                <>
                  <PremiumDropdown
                    label="¿Qué tipo de servicio?"
                    value={serviceFilterMode ? primaryService : ''}
                    open={openDropdown === 'primaryService'}
                    onToggle={() => setOpenDropdown(openDropdown === 'primaryService' ? null : 'primaryService')}
                    onChange={(nextPrimary) => {
                      if (!nextPrimary) {
                        setServiceFilterMode('')
                        resetMarketplaceList()
                        return
                      }
                      setPrimaryService(nextPrimary)
                      setSecondaryService(marketplaceSearchServices[nextPrimary]?.[0]?.name || '')
                      setServiceFilterMode('category')
                      resetMarketplaceList()
                    }}
                    options={[
                      { value: '', label: 'Todas las categorías' },
                      ...primaryServiceOptions.map((service) => ({
                        value: service,
                        label: service,
                        meta: `${marketplaceSearchServices[service].length} opciones`,
                      })),
                    ]}
                  />
                  <PremiumDropdown
                    label="Elige tu favorito"
                    value={serviceFilterMode === 'service' ? secondaryService : ''}
                    open={openDropdown === 'secondaryService'}
                    onToggle={() => setOpenDropdown(openDropdown === 'secondaryService' ? null : 'secondaryService')}
                    onChange={(nextService) => {
                      if (!nextService) {
                        setServiceFilterMode('category')
                        resetMarketplaceList()
                        return
                      }
                      setSecondaryService(nextService)
                      setServiceFilterMode('service')
                      resetMarketplaceList()
                    }}
                    options={[
                      { value: '', label: 'Todos los servicios' },
                      ...currentServiceGroup.map((service) => ({
                        value: service.name,
                        label: service.name,
                        meta: formatServiceOptionMeta(service),
                      })),
                    ]}
                  />
                </>
              ) : (
                <Input
                  label="¿A quién buscas?"
                  type="search"
                        placeholder="Escribe su nombre..."
                  value={studioQuery}
                  onChange={(event) => {
                    setStudioQuery(event.target.value)
                    resetMarketplaceList()
                  }}
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
              {visibleMarketplaceArtists.map((artist) => {
                const isFavorite = clientState.favoriteArtistIds.includes(artist.id)
                const publicArtistProfile = getArtistPublicProfile(artistState, artist)
                const studioProfile = getStudioPublicProfile({
                  artist,
                  studios: adminState.studios,
                  artistStudioMemberships,
                })
                const studioDisplayName = getStudioDisplayName(studioProfile)
                const isStudioListing = artist.profileType === 'studio'
                const effectiveLocationResult = getEffectiveProfessionalLocation(publicArtistProfile, studioProfile, artist, isStudioListing)
                const effectiveLocation = effectiveLocationResult.location
                const directionsUrl = buildGoogleMapsUrl(effectiveLocation)
                const professionalAddress = formatProfessionalAddress(effectiveLocation, isStudioListing ? artist.city : '')
                const profileContactItems = isStudioListing ? getStudioContactItems(studioProfile) : []
                const profileGallery = portfolioByListing[artist.listingId] || publicArtistProfile.portfolio.slice(0, 12)
                const isSelectedArtist = selectedArtistProfile?.id === artist.id
                const contactServiceName = isSelectedArtist && selectedMarketplaceServiceExplicit
                  ? selectedMarketplaceServiceName
                  : serviceFilterMode === 'service' && artist.marketplaceServices.includes(secondaryService)
                    ? secondaryService
                    : ''
                const isProfileOpen = isSelectedArtist && selectedArtistPanelMode === 'profile'
                const isBookingOpen = isSelectedArtist && selectedArtistPanelMode === 'booking'
                const isServicesOpen = isSelectedArtist && selectedArtistPanelMode === 'services'
                const contactLinks = getMarketplaceContactLinks({
                  artist,
                  publicArtistProfile,
                  studioProfile,
                  isStudioListing,
                })
                const profilePhotoUrl = publicArtistProfile.photoUrl
                const profileDisplayName = isStudioListing
                  ? studioDisplayName || artist.title || artist.owner || 'Estudio beauty'
                  : publicArtistProfile.fullName || artist.owner || 'Artista beauty'
                const profileTypeLabel = isStudioListing ? 'Estudio' : 'Artista'
                const profilePhone = getMarketplaceContactPhone({
                  artist,
                  publicArtistProfile,
                  studioProfile,
                  isStudioListing,
                })
                const profileInitials = getArtistInitials(profileDisplayName)
                const profileBiography = publicArtistProfile.biography?.trim()
                const hasSocialLinks = contactLinks.whatsapp || contactLinks.instagram || contactLinks.facebook || contactLinks.tiktok
                const profileHours = getMarketplaceHoursLabel({ artist, publicArtistProfile, studioProfile, isStudioListing })

                return (
                  <article className={`artist-result marketplace-result-card${isSelectedArtist ? ' is-expanded' : ''}`} key={artist.name}>
                    <div className="marketplace-card-badges">
                      {artist.activePromotions?.some((promotion) => promotion.type === 'happy_hour' || promotion.promotion_type === 'happy_hour') && <span className="happy-hour-badge"><span className="marketplace-badge-full">Happy Hour activo</span><span className="marketplace-badge-short">Happy Hour</span></span>}
                      {profileOffersFlowPoints(artist) && <span className="flow-points-profile-distinction"><span aria-hidden="true">★</span><strong>Otorga FlowPoints</strong></span>}
                      {getActiveDoublePointsMultiplier(artist) > 1 && <span className="double-points-badge"><span className="marketplace-badge-regular">Puntos dobles</span><span className="marketplace-badge-narrow">2× puntos</span></span>}
                    </div>
                    <div className="marketplace-result-summary">
                      <div className="marketplace-premium-identity">
                        <div className="marketplace-artist-avatar avatar">
                          {profilePhotoUrl ? (
                            <img src={profilePhotoUrl} alt={`Foto de ${profileDisplayName}`} loading="lazy" decoding="async" />
                          ) : (
                            <span>{profileInitials}</span>
                          )}
                        </div>
                        <div className="marketplace-result-copy">
                          <strong>{profileDisplayName}</strong>
                        </div>
                      </div>
                      <MarketplaceVisitReviews artistId={isStudioListing ? null : artist.artistId || artist.id} studioId={artist.studioId || (isStudioListing ? artist.id : null)} membershipId={isStudioListing ? null : artist.membershipId} />
                      <div className="marketplace-card-info-row">
                        <div className="marketplace-card-contact-row">
                          <MarketplaceContactActions contactLinks={contactLinks} phone={profilePhone} serviceName={contactServiceName} />
                        </div>
                        <div className="marketplace-card-hours-panel">
                          <span>HORARIO DE ATENCIÓN</span>
                          <small className="marketplace-hours">{profileHours}</small>
                        </div>
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
                          <UserRound size={18} aria-hidden="true" /> {isProfileOpen ? 'Ocultar perfil' : 'Ver perfil'}
                        </button>
                        <button
                          className="marketplace-profile-button marketplace-services-button"
                          type="button"
                          aria-expanded={isServicesOpen}
                          onClick={() => isServicesOpen ? closeArtistProfile() : openArtistProfile(artist, { mode: 'services' })}
                        >
                          <FileText size={18} aria-hidden="true" /> {isServicesOpen ? 'Ocultar servicios' : 'Ver servicios y costos'}
                        </button>
                        <button
                          className="marketplace-profile-button marketplace-booking-button"
                          type="button"
                          onClick={() => {
                            if (isBookingOpen) {
                              closeArtistProfile()
                              return
                            }

                            openArtistProfile(artist, { mode: 'booking' })
                          }}
                        >
                          <CalendarDays size={18} aria-hidden="true" /> {isBookingOpen ? 'Ocultar agenda' : 'Agendar ahora'}
                        </button>
                        <button
                          className={`marketplace-favorite-button${isFavorite ? ' is-saved' : ''}`}
                          type="button"
                          aria-pressed={isFavorite}
                          onClick={() => toggleFavoriteArtist(artist.id)}
                        >
                          <Heart size={18} aria-hidden="true" fill={isFavorite ? 'currentColor' : 'none'} /> {isFavorite ? 'Guardado' : 'Guardar'}
                        </button>
                      </div>
                    </div>

                    {isBookingOpen && renderMarketplaceBookingPanel(artist, 'searchBooking')}

                    {isServicesOpen && (
                      <div className="public-profile-panel service-menu-only-panel">
                        <MarketplaceServiceMenu artist={artist} onSelect={selectServiceFromProfileMenu} />
                      </div>
                    )}

                    {isProfileOpen && (
                      <div className="public-profile-panel">
                        <section className="public-profile-hero">
                          <div className="public-profile-hero-copy">
                            <span className="eyebrow">{publicArtistProfile.primarySpecialty || profileTypeLabel}</span>
                            <h3>{profileDisplayName}</h3>
                            <MarketplaceContactActions
                              contactLinks={contactLinks}
                              phone={profilePhone}
                              serviceName={selectedMarketplaceServiceName}
                              hero
                            />
                            <span className={`marketplace-availability availability-${artist.badge.level}`}>
                              {artist.badge.label}
                            </span>
                            <small>{professionalAddress || (isStudioListing ? artist.city : '') || 'Ubicacion profesional por confirmar'}</small>
                          </div>
                        </section>

                        <section className="public-profile-section">
                          <h4>{isStudioListing ? 'Sobre el estudio' : 'Sobre mi'}</h4>
                          <p>{profileBiography || `${isStudioListing ? 'Este estudio' : 'Esta artista'} aun esta completando su perfil profesional.`}</p>
                        </section>

                        <MarketplaceGallery
                          photos={profileGallery}
                          isStudioListing={isStudioListing}
                          status={portfolioStatusByListing[artist.listingId]}
                          onRetry={() => loadMarketplacePortfolio(artist.listingId)}
                        />

                        {profileContactItems.length > 0 && (
                          <section className="public-profile-section">
                            <h4>Datos del estudio</h4>
                            <div className="public-service-badges">
                              {profileContactItems.map((item) => (
                                <span key={item.label}>{item.label}: {item.value}</span>
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
                            <MarketplaceContactActions
                              contactLinks={contactLinks}
                              serviceName={selectedMarketplaceServiceName}
                            />
                          </section>
                        )}

                        <div className="form-stack compact-form public-booking-flow">
                          <PremiumDropdown
                            label="Elige una categoria"
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
                            label="Elige el servicio que quieres agendar"
                            value={selectedMarketplaceServiceName}
                            open={openDropdown === 'profileSecondaryService'}
                            onToggle={() => setOpenDropdown(openDropdown === 'profileSecondaryService' ? null : 'profileSecondaryService')}
                            onChange={changeSelectedMarketplaceService}
                            options={selectedArtistSecondaryGroup.map((service) => ({
                              value: service.name,
                              label: service.name,
                              meta: formatServiceOptionMeta(service),
                            }))}
                          />
                          <label className="input-field">
                            <span>Fecha</span>
                            <input className="booking-date-input" type="date" min={getTodayDateValue()} value={bookingDate} onClick={openBookingDatePicker} onChange={(event) => setBookingDate(event.target.value)} />
                          </label>
                          {renderFlowPointsSelector()}
                        </div>

                        <div className="compact-list public-slot-list" id={`marketplace-slots-${artist.id}`}>
                          {availableSlots.length > 0 ? (
                            availableSlots.map((slot) => (
                              <div className={`list-row elevated-row${slot.isHappyHour ? ' happy-hour-slot' : ''}`} key={`${artist.id}-${slot.date}-${slot.time}`}>
                                <div>
                                  <strong>{slot.time} - {slot.end}</strong>
                                  <small>{getSlotServiceName(slot)}</small>
                                  <small className="flow-points-slot-note">FlowPoints automaticos al completar</small>
                                </div>
                                <Button
                                  size="sm"
                                  variant={slot.isHappyHour ? 'success' : slot.available ? 'primary' : 'ghost'}
                                  disabled={!slot.available || isBookingLoading}
                                  onClick={() => {
                                    reserveSlot(slot)
                                  }}
                                >
                                  {isBookingLoading ? 'Reservando...' : slot.available ? (slot.isHappyHour ? `${slot.happyHourDiscountPercent}% Reservar` : 'Reservar') : 'Ocupado'}
                                </Button>
                              </div>
                            ))
                          ) : (
                            <div className="list-row elevated-row availability-empty-row">
                              <div className="availability-empty-copy">
                                <strong>{isAvailabilityLoading ? 'Cargando horarios...' : happyHourOnly ? 'Sin horarios disponibles para Happy Hour' : 'Sin horarios disponibles'}</strong>
                                <small>{availabilityError || noAvailabilityMessage}</small>
                              </div>
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
                            onClick={() => openWhatsAppContact(contactLinks.whatsapp, contactServiceName)}
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
              {hasMoreMarketplaceArtists && (
                <button
                  className="marketplace-show-more-button"
                  type="button"
                  onClick={() => setVisibleMarketplaceCount((currentCount) => currentCount + 5)}
                >
                  Mostrar mas
                </button>
              )}

              {marketplaceArtists.length === 0 && (
                <div className="artist-result">
                  <div>
                    <strong>{isMarketplaceLoading ? 'Buscando las mejores opciones para ti...' : marketplaceError ? 'No se pudo cargar la busqueda' : 'Sin coincidencias con esta busqueda'}</strong>
                    <small>
                      {isMarketplaceLoading ? 'Estamos revisando las agendas disponibles.' : 'Prueba otro servicio, nombre de estudio o filtro.'}
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
                  const isStudioListing = artist.profileType === 'studio'
                  const effectiveLocationResult = getEffectiveProfessionalLocation(publicArtistProfile, studioProfile, artist, isStudioListing)
                  const effectiveLocation = effectiveLocationResult.location
                  const directionsUrl = buildGoogleMapsUrl(effectiveLocation)
                  const professionalAddress = formatProfessionalAddress(effectiveLocation, isStudioListing ? artist.city : '')
                  const profileContactItems = isStudioListing ? getStudioContactItems(studioProfile) : []
                  const profileGallery = portfolioByListing[artist.listingId] || publicArtistProfile.portfolio.slice(0, 12)
                  const isSelectedArtist = selectedArtistProfile?.id === artist.id
                  const contactServiceName = isSelectedArtist && selectedMarketplaceServiceExplicit
                    ? selectedMarketplaceServiceName
                    : serviceFilterMode === 'service' && artist.marketplaceServices.includes(secondaryService)
                      ? secondaryService
                      : ''
                  const isProfileOpen = isSelectedArtist && selectedArtistPanelMode === 'profile'
                  const isBookingOpen = isSelectedArtist && selectedArtistPanelMode === 'booking'
                  const isServicesOpen = isSelectedArtist && selectedArtistPanelMode === 'services'
                  const contactLinks = getMarketplaceContactLinks({
                    artist,
                    publicArtistProfile,
                    studioProfile,
                    isStudioListing,
                  })
                  const profilePhotoUrl = publicArtistProfile.photoUrl
                  const profileDisplayName = isStudioListing
                    ? studioDisplayName || artist.title || artist.owner || 'Estudio beauty'
                    : publicArtistProfile.fullName || artist.owner || 'Artista beauty'
                  const profileTypeLabel = isStudioListing ? 'Estudio' : 'Artista'
                  const profilePhone = getMarketplaceContactPhone({
                    artist,
                    publicArtistProfile,
                    studioProfile,
                    isStudioListing,
                  })
                  const profileInitials = getArtistInitials(profileDisplayName)
                  const profileBiography = publicArtistProfile.biography?.trim()
                  const hasSocialLinks = contactLinks.whatsapp || contactLinks.instagram || contactLinks.facebook || contactLinks.tiktok
                  const profileHours = getMarketplaceHoursLabel({ artist, publicArtistProfile, studioProfile, isStudioListing })

                  return (
                    <article className={`favorite-card marketplace-result-card${isSelectedArtist ? ' is-expanded' : ''}`} key={artist.name}>
                      <div className="marketplace-card-badges">
                        {artist.activePromotions?.some((promotion) => promotion.type === 'happy_hour' || promotion.promotion_type === 'happy_hour') && <span className="happy-hour-badge"><span className="marketplace-badge-full">Happy Hour activo</span><span className="marketplace-badge-short">Happy Hour</span></span>}
                        {profileOffersFlowPoints(artist) && <span className="flow-points-profile-distinction"><span aria-hidden="true">★</span><strong>Otorga FlowPoints</strong></span>}
                        {getActiveDoublePointsMultiplier(artist) > 1 && <span className="double-points-badge"><span className="marketplace-badge-regular">Puntos dobles</span><span className="marketplace-badge-narrow">2× puntos</span></span>}
                      </div>
                      <div className="marketplace-result-summary">
                        <div className="marketplace-premium-identity">
                          <div className="marketplace-artist-avatar avatar">
                            {profilePhotoUrl ? (
                              <img src={profilePhotoUrl} alt={`Foto de ${profileDisplayName}`} loading="lazy" decoding="async" />
                            ) : (
                              <span>{profileInitials}</span>
                            )}
                          </div>
                          <div className="marketplace-result-copy">
                            <strong>{profileDisplayName}</strong>
                          </div>
                        </div>
                        <MarketplaceVisitReviews artistId={isStudioListing ? null : artist.artistId || artist.id} studioId={artist.studioId || (isStudioListing ? artist.id : null)} membershipId={isStudioListing ? null : artist.membershipId} />
                        <div className="marketplace-card-info-row">
                          <div className="marketplace-card-contact-row">
                            <MarketplaceContactActions contactLinks={contactLinks} phone={profilePhone} serviceName={contactServiceName} />
                          </div>
                          <div className="marketplace-card-hours-panel">
                            <span>HORARIO DE ATENCIÓN</span>
                            <small className="marketplace-hours">{profileHours}</small>
                          </div>
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
                            <UserRound size={18} aria-hidden="true" /> {isProfileOpen ? 'Ocultar perfil' : 'Ver perfil'}
                          </button>
                          <button
                            className="marketplace-profile-button marketplace-services-button"
                            type="button"
                            aria-expanded={isServicesOpen}
                            onClick={() => isServicesOpen ? closeArtistProfile() : openArtistProfile(artist, { mode: 'services' })}
                          >
                            <FileText size={18} aria-hidden="true" /> {isServicesOpen ? 'Ocultar servicios' : 'Ver servicios y costos'}
                          </button>
                          <button
                            className="marketplace-profile-button marketplace-booking-button"
                            type="button"
                            onClick={() => {
                              if (isBookingOpen) {
                                closeArtistProfile()
                                return
                              }

                              openArtistProfile(artist, { mode: 'booking' })
                            }}
                          >
                            <CalendarDays size={18} aria-hidden="true" /> {isBookingOpen ? 'Ocultar agenda' : 'Agendar ahora'}
                          </button>
                          <button
                            className="marketplace-favorite-button is-saved"
                            type="button"
                            onClick={() => toggleFavoriteArtist(artist.id)}
                          >
                            <Heart size={18} aria-hidden="true" fill="currentColor" /> Guardado
                          </button>
                        </div>
                      </div>

                      {isBookingOpen && renderMarketplaceBookingPanel(artist, 'favoriteBooking')}
                      {isServicesOpen && (
                        <div className="public-profile-panel service-menu-only-panel">
                          <MarketplaceServiceMenu artist={artist} onSelect={selectServiceFromProfileMenu} />
                        </div>
                      )}
                      {isProfileOpen && (
                        <div className="public-profile-panel">
                          <section className="public-profile-hero">
                            <div className="public-profile-hero-copy">
                              <span className="eyebrow">{publicArtistProfile.primarySpecialty || profileTypeLabel}</span>
                              <h3>{profileDisplayName}</h3>
                              <MarketplaceContactActions
                                contactLinks={contactLinks}
                                phone={profilePhone}
                                serviceName={selectedMarketplaceServiceName}
                                hero
                              />
                              <span className={`marketplace-availability availability-${artist.badge.level}`}>
                                {artist.badge.label}
                              </span>
                              <small>{professionalAddress || (isStudioListing ? artist.city : '') || 'Ubicacion profesional por confirmar'}</small>
                            </div>
                          </section>

                          <section className="public-profile-section">
                            <h4>{isStudioListing ? 'Sobre el estudio' : 'Sobre mi'}</h4>
                            <p>{profileBiography || `${isStudioListing ? 'Este estudio' : 'Esta artista'} aun esta completando su perfil profesional.`}</p>
                          </section>

                          <MarketplaceGallery
                            photos={profileGallery}
                            isStudioListing={isStudioListing}
                            status={portfolioStatusByListing[artist.listingId]}
                            onRetry={() => loadMarketplacePortfolio(artist.listingId)}
                          />

                          {profileContactItems.length > 0 && (
                            <section className="public-profile-section">
                              <h4>Datos del estudio</h4>
                              <div className="public-service-badges">
                                {profileContactItems.map((item) => (
                                  <span key={item.label}>{item.label}: {item.value}</span>
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
                              <MarketplaceContactActions
                                contactLinks={contactLinks}
                                serviceName={selectedMarketplaceServiceName}
                              />
                            </section>
                          )}

                          <div className="form-stack compact-form public-booking-flow">
                            <PremiumDropdown
                              label="Elige una categoria"
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
                              label="Elige el servicio que quieres agendar"
                              value={selectedMarketplaceServiceName}
                              open={openDropdown === 'favoriteProfileSecondaryService'}
                              onToggle={() => setOpenDropdown(openDropdown === 'favoriteProfileSecondaryService' ? null : 'favoriteProfileSecondaryService')}
                              onChange={changeSelectedMarketplaceService}
                              options={selectedArtistSecondaryGroup.map((service) => ({
                                value: service.name,
                                label: service.name,
                                meta: formatServiceOptionMeta(service),
                              }))}
                            />
                            <label className="input-field">
                              <span>Fecha</span>
                              <input className="booking-date-input" type="date" min={getTodayDateValue()} value={bookingDate} onClick={openBookingDatePicker} onChange={(event) => setBookingDate(event.target.value)} />
                            </label>
                            {renderFlowPointsSelector()}
                          </div>

                          <div className="compact-list public-slot-list" id={`marketplace-slots-${artist.id}`}>
                            {availableSlots.length > 0 ? (
                              availableSlots.map((slot) => (
                                <div className={`list-row elevated-row${slot.isHappyHour ? ' happy-hour-slot' : ''}`} key={`${artist.id}-${slot.date}-${slot.time}`}>
                                  <div>
                                    <strong>{slot.time} - {slot.end}</strong>
                                    <small>{getSlotServiceName(slot)}</small>
                                    <small className="flow-points-slot-note">FlowPoints automaticos al completar</small>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant={slot.isHappyHour ? 'success' : slot.available ? 'primary' : 'ghost'}
                                    disabled={!slot.available || isBookingLoading}
                                    onClick={() => {
                                      reserveSlot(slot)
                                    }}
                                  >
                                    {isBookingLoading ? 'Reservando...' : slot.available ? (slot.isHappyHour ? `${slot.happyHourDiscountPercent}% Reservar` : 'Reservar') : 'Ocupado'}
                                  </Button>
                                </div>
                              ))
                            ) : (
                              <div className="list-row elevated-row availability-empty-row">
                                <div className="availability-empty-copy">
                                  <strong>{isAvailabilityLoading ? 'Cargando horarios...' : happyHourOnly ? 'Sin horarios disponibles para Happy Hour' : 'Sin horarios disponibles'}</strong>
                                  <small>{availabilityError || noAvailabilityMessage}</small>
                                </div>
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
                              onClick={() => openWhatsAppContact(contactLinks.whatsapp, contactServiceName)}
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
            <ClientAttendancePanel appointments={realClientAppointments} enabled={hasRealClientSession} />
            <Card className="mobile-screen primary-panel client-profile-experience">
              <header className="client-profile-hero">
                <span>ESTE ESPACIO ES TUYO</span>
                <h2>Tu esencia, tus momentos</h2>
                <p>Mantén tus datos al día y deja que Studio Flow encuentre experiencias pensadas para ti.</p>
              </header>
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
                    <span className="client-photo-kicker"><Sparkles aria-hidden="true" size={14} /> TU IMAGEN EN STUDIO FLOW</span>
                    <strong>Hazlo más tuyo</strong>
                    <small>Esta foto te acompaña en tus citas y experiencias.</small>
                    <div className="client-photo-actions">
                      <label className="button button-ghost button-sm" htmlFor="client-photo-input">
                        <Camera aria-hidden="true" size={16} /> {profileDraft.photoUrl ? 'Cambiar foto' : 'Subir foto'}
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
                    <span className="client-location-icon"><MapPin aria-hidden="true" size={18} /></span>
                    <h3>Tu zona favorita</h3>
                    <small>Así podemos acercarte artistas y estudios que realmente te convienen.</small>
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
                <Button className="full-width" disabled={isProfileSaving || locationDetection.status === 'loading'} onClick={saveClientProfile}>
                  {isProfileSaving ? 'Guardando perfil...' : 'Guardar perfil'}
                </Button>
              </div>
            </Card>
            <Card className="mobile-screen client-profile-summary">
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
      {pendingDepositSlot && <div className="deposit-dialog-backdrop" role="presentation" onClick={() => setPendingDepositSlot(null)}><div className="deposit-dialog" role="dialog" aria-modal="true" aria-labelledby="deposit-dialog-title" onClick={(event) => event.stopPropagation()}>
        <span className="eyebrow">ANTES DE RESERVAR</span>
        <h2 id="deposit-dialog-title">Tu cita solicita anticipo</h2>
        <p>{depositPolicy.businessName} recibirá el pago directamente. La cita quedará pendiente hasta que confirme la transferencia.</p>
        <div className="deposit-dialog-amounts"><span>Servicio</span><strong>{formatPayment(selectedServicePrice)}</strong><span>Anticipo {depositPolicy.kind === 'percent' ? `(${depositPolicy.value}%)` : ''}</span><strong>{formatPayment(depositAmount(selectedServicePrice, depositPolicy))}</strong><span>Saldo restante</span><strong>{formatPayment(Math.max(0, selectedServicePrice - depositAmount(selectedServicePrice, depositPolicy)))}</strong></div>
        <div className="deposit-dialog-next-step" role="note"><CalendarDays size={25} aria-hidden="true" /><div><strong>Tu tarjeta estará en Citas y reseñas</strong><span>Después de solicitar tu cita, toca <b>Ver tarjeta de anticipo</b> para consultar la CLABE y realizar tu transferencia.</span></div></div>
        {(Number(selectedMarketplaceRewardId) > 0 || pendingDepositSlot.isHappyHour) && <small>Si aplicas un beneficio, el importe final se actualizará en la tarjeta de pago de tu cita.</small>}
        {depositPolicy.terms && <small>{depositPolicy.terms}</small>}
        <div className="deposit-dialog-actions"><button type="button" onClick={() => setPendingDepositSlot(null)}>Volver</button><button type="button" onClick={() => { const slot = pendingDepositSlot; setPendingDepositSlot(null); reserveSlot(slot, true) }}>Entiendo, solicitar cita</button></div>
      </div></div>}
    </main>
  )
}

export default ClientDashboard
