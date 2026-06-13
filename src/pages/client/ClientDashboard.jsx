import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Input from '../../components/Input'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import { useApp } from '../../contexts/appContextCore'
import { paths } from '../../routes/paths'
import { clientAppointments as mockClientAppointments, clientHistory } from '../../services/mockData'
import { getClientById } from '../../utils/clientHelpers'
import { calculateFlowPoints, flowPointRewards, getActivePoints, getExpiringPoints, vipTierThresholds } from '../../modules/loyalty/flowPointsEngine'
import { generateClientAutomations } from '../../modules/automation/smartAutomationEngine'
import { canUseOperationalFeature } from '../../modules/governance/studioGovernance'
import {
  deriveMembershipsFromLegacyData,
  getMembershipForArtist,
  getStudioForArtist,
} from '../../modules/entities/entitySelectors'
import { buildGoogleMapsQuery, buildGoogleMapsUrl } from '../../utils/locationHelpers'

const searchServices = {
  Unas: [
    { name: 'Gelish', durationMinutes: 60 },
    { name: 'Rubber', durationMinutes: 75 },
    { name: 'Acrilicas', durationMinutes: 90 },
    { name: 'Esculturales', durationMinutes: 120 },
    { name: 'Soft gel', durationMinutes: 80 },
    { name: 'Nail art', durationMinutes: 75 },
    { name: 'Francesas', durationMinutes: 70 },
  ],
  Pestanas: [
    { name: 'Clasicas', durationMinutes: 90 },
    { name: 'Hibridas', durationMinutes: 100 },
    { name: 'Volumen ruso', durationMinutes: 120 },
    { name: 'Anime lashes', durationMinutes: 110 },
    { name: 'Lash lifting', durationMinutes: 70 },
    { name: 'Wispy', durationMinutes: 105 },
    { name: 'Mega volumen', durationMinutes: 140 },
  ],
  Maquillaje: [
    { name: 'Soft glam makeup', durationMinutes: 90 },
    { name: 'Maquillaje social', durationMinutes: 80 },
    { name: 'Maquillaje de novia', durationMinutes: 120 },
    { name: 'Maquillaje natural', durationMinutes: 60 },
    { name: 'Maquillaje editorial', durationMinutes: 110 },
    { name: 'Maquillaje de noche', durationMinutes: 90 },
  ],
  Cejas: [
    { name: 'Brow design', durationMinutes: 45 },
    { name: 'Laminado de ceja', durationMinutes: 55 },
    { name: 'Henna brows', durationMinutes: 50 },
    { name: 'Perfilado con hilo', durationMinutes: 30 },
    { name: 'Tinte de ceja', durationMinutes: 35 },
  ],
  Faciales: [
    { name: 'Facial glow', durationMinutes: 60 },
    { name: 'Limpieza facial profunda', durationMinutes: 80 },
    { name: 'Facial hidratante', durationMinutes: 70 },
    { name: 'Facial antiacne', durationMinutes: 75 },
    { name: 'Peeling facial', durationMinutes: 60 },
  ],
  Depilacion: [
    { name: 'Cera facial', durationMinutes: 30 },
    { name: 'Cera corporal', durationMinutes: 60 },
    { name: 'Depilacion con hilo', durationMinutes: 35 },
    { name: 'Axilas', durationMinutes: 25 },
    { name: 'Pierna completa', durationMinutes: 70 },
  ],
  Peinado: [
    { name: 'Ondas glam', durationMinutes: 60 },
    { name: 'Peinado social', durationMinutes: 75 },
    { name: 'Recogido elegante', durationMinutes: 90 },
    { name: 'Brushing', durationMinutes: 45 },
  ],
  Skincare: [
    { name: 'Rutina personalizada', durationMinutes: 50 },
    { name: 'Dermaplaning', durationMinutes: 60 },
    { name: 'Mascarilla premium', durationMinutes: 40 },
    { name: 'Tratamiento luminoso', durationMinutes: 70 },
  ],
  Spa: [
    { name: 'Spa manicure', durationMinutes: 75 },
    { name: 'Spa pedicure', durationMinutes: 80 },
    { name: 'Ritual relajante', durationMinutes: 90 },
    { name: 'Exfoliacion corporal', durationMinutes: 60 },
  ],
  Masajes: [
    { name: 'Masaje relajante', durationMinutes: 60 },
    { name: 'Masaje descontracturante', durationMinutes: 75 },
    { name: 'Masaje drenante', durationMinutes: 70 },
    { name: 'Masaje facial', durationMinutes: 40 },
  ],
  Microblading: [
    { name: 'Microblading pelo a pelo', durationMinutes: 120 },
    { name: 'Microshading', durationMinutes: 130 },
    { name: 'Retoque microblading', durationMinutes: 80 },
    { name: 'Diseno previo', durationMinutes: 45 },
  ],
  Laminado: [
    { name: 'Laminado de ceja', durationMinutes: 55 },
    { name: 'Laminado con tinte', durationMinutes: 65 },
    { name: 'Lash lifting', durationMinutes: 70 },
    { name: 'Combo ceja y pestana', durationMinutes: 100 },
  ],
}

const artistMarketplaceProfile = {
  'artist-1': {
    services: ['Lash lifting', 'Brow design', 'Laminado de ceja', 'Soft glam makeup', 'Combo ceja y pestana'],
    occupancy: 58,
  },
  'artist-2': {
    services: ['Acrilicas', 'Gelish', 'Nail art', 'Soft gel', 'Francesas'],
    occupancy: 86,
  },
  'artist-3': {
    services: ['Facial glow', 'Limpieza facial profunda', 'Brow design', 'Facial hidratante', 'Masaje facial'],
    occupancy: 42,
  },
}

const allSearchServices = Object.values(searchServices).flat()

function buildServiceGroupsFromListings(listings = []) {
  return listings.reduce((groups, listing) => {
    const services = Array.isArray(listing.marketplaceServiceOptions) ? listing.marketplaceServiceOptions : []

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

function getServiceOptionsForArtist(artist = {}) {
  if (Array.isArray(artist.marketplaceServiceOptions) && artist.marketplaceServiceOptions.length > 0) {
    return artist.marketplaceServiceOptions.map((service) => ({
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
  return artistMarketplaceProfile[artist.id] || {
    services: ['Lash lifting', 'Brow design'],
    occupancy: 64,
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
  const availabilityScore = Math.max(0, visibleSlotCount - Math.floor(profile.occupancy / 25))
  const badge = getMarketplaceBadge(availabilityScore, profile.occupancy)

  return {
    ...artist,
    membership,
    studio,
    marketplaceServices: profile.services,
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

  window.open(`https://wa.me/${cleanNumber}?text=${message}`, '_blank', 'noopener,noreferrer')
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
    marketplaceAvailabilitySlots,
    isAvailabilityLoading,
    availabilityError,
    loadMarketplaceAvailability,
    isMarketplaceLoading,
    marketplaceError,
    clientState,
    session,
    bookSlot,
    getAvailableSlots,
    toggleFavoriteArtist,
    updateClientProfile,
  } = useApp()
  const [bookingDate, setBookingDate] = useState('2026-05-18')
  const [profileDraft, setProfileDraft] = useState(clientState.profile)
  const [searchMode, setSearchMode] = useState('Servicio')
  const [primaryService, setPrimaryService] = useState('Pestanas')
  const [secondaryService, setSecondaryService] = useState(searchServices.Pestanas[0].name)
  const [studioQuery, setStudioQuery] = useState('')
  const [selectedArtistProfile, setSelectedArtistProfile] = useState(null)
  const [openDropdown, setOpenDropdown] = useState(null)
  const isRealMarketplace = !session.isMockSession
  const marketplaceSearchServices = useMemo(() => {
    if (!isRealMarketplace) return searchServices

    return buildServiceGroupsFromListings(marketplaceListings)
  }, [isRealMarketplace, marketplaceListings])
  const primaryServiceOptions = Object.keys(marketplaceSearchServices)
  const currentServiceGroup = marketplaceSearchServices[primaryService]
    || marketplaceSearchServices[primaryServiceOptions[0]]
    || []
  const marketplaceService =
    currentServiceGroup.find((service) => service.name === secondaryService)
    || currentServiceGroup[0]
    || { name: secondaryService || 'Servicio', durationMinutes: 60 }
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
  const selectedArtistMembership = selectedArtistProfile?.membership || getArtistMembership(selectedArtistProfile)
  const selectedArtistStudio = selectedArtistProfile?.studio || getArtistStudio(selectedArtistProfile)
  const selectedMarketplaceService = useMemo(() => {
    if (!isRealMarketplace || !selectedArtistProfile) return null

    const services = Array.isArray(selectedArtistProfile.marketplaceServiceOptions)
      ? selectedArtistProfile.marketplaceServiceOptions
      : []

    return services.find((service) => service.name === secondaryService) || services[0] || null
  }, [isRealMarketplace, secondaryService, selectedArtistProfile])
  const effectiveMarketplaceService = selectedMarketplaceService || marketplaceService

  useEffect(() => {
    if (!isRealMarketplace) return
    if (!selectedArtistProfile?.listingId || !bookingDate) return

    loadMarketplaceAvailability({
      listingId: selectedArtistProfile.listingId,
      serviceOfferingId: selectedMarketplaceService?.id || null,
      date: bookingDate,
    })
  }, [
    bookingDate,
    isRealMarketplace,
    loadMarketplaceAvailability,
    selectedArtistProfile?.listingId,
    selectedMarketplaceService?.id,
  ])

  useEffect(() => {
    if (searchMode !== 'Servicio') return
    if (primaryServiceOptions.length === 0) return

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
  }, [marketplaceSearchServices, primaryService, primaryServiceOptions, searchMode, secondaryService])

  const availableSlots = useMemo(
    () => {
      if (isRealMarketplace) return marketplaceAvailabilitySlots

      return getAvailableSlots({
        artistId: selectedArtistProfile?.id,
        studioId: selectedArtistStudio?.id || null,
        membershipId: selectedArtistMembership?.id || null,
        date: bookingDate,
        durationMinutes: effectiveMarketplaceService.durationMinutes || 60,
      })
    },
    [
      bookingDate,
      effectiveMarketplaceService.durationMinutes,
      getAvailableSlots,
      isRealMarketplace,
      marketplaceAvailabilitySlots,
      selectedArtistMembership?.id,
      selectedArtistProfile?.id,
      selectedArtistStudio?.id,
    ],
  )
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
  const activeArtists = isRealMarketplace
    ? marketplaceListings
    : adminState.artists.filter((artist) => {
      const artistStudio = getArtistStudio(artist)
      return artist.status === 'Activo' && canUseOperationalFeature(artistStudio || artist, 'publicAgenda')
    })
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
    notes: clientState.profile?.notes || artistClientProfile?.notes,
    photoUrl: clientState.profile?.photoUrl || '',
    flowPoints: clientState.profile?.flowPoints || 0,
    vipTier: clientState.profile?.vipTier || 'Glow',
    streak: clientState.profile?.streak || 0,
    rewardsHistory: artistClientProfile?.rewardsHistory || [],
  }
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
    }))
  }, [
    hasRealClientSession,
    currentClient.id,
    currentClient.profileId,
    currentClient.name,
    currentClient.email,
    currentClient.phone,
  ])
  const currentClientActivePoints = getActivePoints(currentClient)
  const nextReward = flowPointRewards.discount10
  const nextRewardProgress = Math.min(100, Math.round((currentClientActivePoints / nextReward.pointsCost) * 100))
  const pointsToNextReward = Math.max(0, nextReward.pointsCost - currentClientActivePoints)
  const tierProgressTarget = vipTierThresholds.find((tier) => tier.minPoints > (currentClient.flowPoints || 0))
  const pointsToNextTier = tierProgressTarget ? tierProgressTarget.minPoints - (currentClient.flowPoints || 0) : 0
  const expiringSoon = getExpiringPoints(currentClient, 30)

  const expiringEntries = (currentClient.rewardsHistory || [])
    .filter((entry) => entry.points && entry.points > 0 && entry.expirationDate)
    .map((entry) => {
      const expiration = new Date(entry.expirationDate)
      const now = new Date()
      return {
        ...entry,
        daysUntil: Math.max(0, Math.ceil((expiration - now) / (1000 * 60 * 60 * 24))),
      }
    })
    .filter((entry) => entry.daysUntil >= 0)
    .sort((a, b) => a.daysUntil - b.daysUntil)

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

  const nearestExpiration = expiringEntries[0]

  const realAppointmentSourceReady = !session.isMockSession && appointmentState.clientLoaded
  const clientAppointmentSource = realAppointmentSourceReady
    ? realClientAppointments
    : artistState.appointments
  const clientHistoryConnected = clientAppointmentSource
    .filter((item) => item.clientId === clientLookupId && item.type === 'appointment')
    .map((item) => {
      const service = artistServices.find((serviceItem) => serviceItem.name === item.service)
      return {
        ...item,
        points: calculateFlowPoints(service?.serviceTier || 'basic'),
        artist: item.artist || 'Valeria Moon',
      }
    })

  const vipBenefits = {
    Glow: ['Promociones privadas', 'Bonus cumpleaños', 'Prioridad agenda'],
    Muse: ['Reservas ultra-rápidas', 'Acceso a productos exclusivos', 'Invitaciones VIP'],
    Icon: ['Estilo personalizado', 'Servicio exprés', 'Beneficios especiales de otoño'],
    Elite: ['Atención prioritaria', 'Experiencias a la medida', 'Eventos de lanzamiento'],
  }

  const clientBenefits = vipBenefits[currentClient.vipTier] || vipBenefits.Glow

  // Generar automatizaciones inteligentes
  const clientAutomations = generateClientAutomations(currentClient, artistServices)

  const marketplaceArtists = useMemo(
    () => {
      return activeArtists
        .map((artist) => {
          if (isRealMarketplace) return artist

          return hydrateMarketplaceArtist(artist, getVisibleSlotCountForArtist(artist), getArtistStudio(artist), getArtistMembership(artist))
        })
        .filter((artist) => {
          if (searchMode === 'Nombre estudio') {
            const artistStudio = getStudioPublicProfile({
              artist,
              studios: adminState.studios,
              artistStudioMemberships,
            })
            const searchable = `${artist.name} ${artist.owner} ${artist.city} ${artistStudio.profile?.commercialName || ''}`.toLowerCase()
            return searchable.includes(studioQuery.toLowerCase())
          }

          return !secondaryService || artist.marketplaceServices.includes(secondaryService)
        })
        .sort((firstArtist, secondArtist) => (
          secondArtist.availabilityScore - firstArtist.availabilityScore
          || firstArtist.occupancy - secondArtist.occupancy
        ))
    },
    [
      activeArtists,
      adminState.studios,
      artistStudioMemberships,
      bookingDate,
      getAvailableSlots,
      isRealMarketplace,
      effectiveMarketplaceService.durationMinutes,
      searchMode,
      secondaryService,
      studioQuery,
    ],
  )
  const bookedAppointments = realAppointmentSourceReady ? [] : agendaSettings.bookedSlots.map((slot) => ({
    artist: slot.artist || 'Valeria Moon',
    service: slot.service || 'Servicio reservado',
    date: slot.date,
    time: slot.time,
    address: 'Agenda Studio Flow',
    status: 'Reservada',
  }))
  const upcomingAppointments = realAppointmentSourceReady
    ? realClientAppointments.filter((appointment) => !['Completada', 'Cancelada'].includes(appointment.status))
    : [...bookedAppointments, ...mockClientAppointments]

  const reserveSlot = (slot) => {
    if (!slot.available) return
    if (isRealMarketplace) return
    if (!selectedArtistProfile?.id) return

    bookSlot({
      ...slot,
      artistId: selectedArtistProfile.id,
      studioId: selectedArtistStudio?.id || null,
      membershipId: selectedArtistMembership?.id || null,
      artist: selectedArtistProfile?.owner || selectedArtistProfile?.name || 'Valeria Moon',
      service: effectiveMarketplaceService.name,
      durationMinutes: effectiveMarketplaceService.durationMinutes,
    })
  }

  const openArtistProfile = (artist, { scrollToBooking = false } = {}) => {
    setSelectedArtistProfile(artist)
    setSecondaryService(artist.marketplaceServices?.[0] || secondaryService)
    setOpenDropdown(null)

    if (scrollToBooking) {
      setTimeout(() => {
        document.getElementById(`marketplace-slots-${artist.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 0)
    }
  }

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
                <p>Estás acumulando Flow Points con cada experiencia. Mantén tu ritmo en Studio Flow y desbloquea beneficios exclusivos.</p>
                <div className="hero-actions">
                  <Button onClick={() => navigate(paths.clientExplore)}>Agendar ahora</Button>
                  <Button variant="ghost" onClick={() => navigate(paths.clientAppointments)}>Ver mis citas</Button>
                </div>
              </div>
              <div className="hero-summary client-hero-summary">
                <span>{currentClient.vipTier || 'Glow'} VIP</span>
                <strong>{currentClient.flowPoints || 0} Flow Points</strong>
                <small>{pointsToNextTier > 0 ? `A solo ${pointsToNextTier} puntos de tu siguiente tier` : 'Estás en el máximo tier'}</small>
              </div>
            </section>

            <aside className="client-metrics-grid mobile-screen">
              <Card className="loyalty-card">
                <PanelHeader title="Flow Points" eyebrow="Balance actual" />
                <div className="loyalty-status">
                  <div>
                    <strong>{currentClient.flowPoints || 0}</strong>
                    <span>puntos disponibles</span>
                  </div>
                  <div>
                    <strong>{currentClient.vipTier || 'Glow'}</strong>
                    <span>tier VIP</span>
                  </div>
                </div>
                <div className="progress-row">
                  <span>Próxima recompensa</span>
                  <strong>{nextReward.name}</strong>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${nextRewardProgress}%` }} />
                </div>
                <small>{pointsToNextReward > 0 ? `A solo ${pointsToNextReward} puntos de ${nextReward.name}` : 'Listo para redimir tu próxima recompensa'}</small>
              </Card>

              <Card className="loyalty-card streak-card">
                <PanelHeader title="Streak" eyebrow="Ritmo de visitas" />
                <div className="streak-block">
                  <strong>🔥 {currentClient.streak || 0} visitas consecutivas</strong>
                  <p>Mantén tu streak y gana bonus rewards.</p>
                </div>
                <div className="reward-callout">
                  <span>Próxima recompensa</span>
                  <strong>10% OFF</strong>
                </div>
              </Card>
            </aside>

            <section className="client-summary-grid mobile-screen">
              <Card className="points-expire-card">
                <PanelHeader title="Puntos por vencer" eyebrow="Atención" />
                {nearestExpiration ? (
                  <>
                    <strong>⚠️ {expiringSoon} puntos expiran en {nearestExpiration.daysUntil} días</strong>
                    <p>Activa tu próxima cita para conservar tu saldo premium.</p>
                    <Button onClick={() => navigate(paths.clientExplore)}>Agendar ahora</Button>
                  </>
                ) : (
                  <p>No hay puntos en riesgo en los próximos 30 días.</p>
                )}
              </Card>

              <Card className="vip-benefits-card">
                <PanelHeader title="Beneficios" eyebrow={`${currentClient.vipTier || 'Glow'} VIP`} />
                <ul className="benefits-list">
                  {clientBenefits.map((benefit) => (
                    <li key={benefit}>{benefit}</li>
                  ))}
                </ul>
              </Card>
            </section>

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

            <Card className="mobile-screen primary-panel history-card">
              <PanelHeader title="Historial conectado" eyebrow="Tus últimos servicios" />
              <div className="history-table">
                <div className="history-row header-row">
                  <span>Fecha</span>
                  <span>Servicio</span>
                  <span>Artista</span>
                  <span>Puntos</span>
                </div>
                {clientHistoryConnected.length > 0 ? clientHistoryConnected.map((item) => (
                  <div className="history-row" key={`${item.service}-${item.date}-${item.time}`}>
                    <span>{item.date}</span>
                    <span>{item.service}</span>
                    <span>{item.artist}</span>
                    <strong>+{item.points}</strong>
                  </div>
                )) : (
                  <div className="history-row empty-row">
                    <span>Aún no tienes historial conectado con tus citas.</span>
                  </div>
                )}
              </div>
            </Card>
          </>
        )}

        {view === 'citas' && (
          <>
            <Card className="wide-card mobile-screen primary-panel">
              <PanelHeader title="Proximas citas" eyebrow="Confirmadas" />
              <div className="appointment-stack">
                {upcomingAppointments.map((appointment) => (
                  <article className="client-appointment" key={`${appointment.artist}-${appointment.time}-${appointment.date}`}>
                    <div className="date-block">
                      <strong>{appointment.date}</strong>
                      <span>{appointment.time}</span>
                    </div>
                    <div>
                      <h3>{appointment.service}</h3>
                      <p>{appointment.artist} / {appointment.address}</p>
                    </div>
                    <StatusPill tone="success">{appointment.status || 'Lista'}</StatusPill>
                  </article>
                ))}
              </div>
            </Card>
            <Card className="mobile-screen">
              <PanelHeader title="Historial" eyebrow="Reservas anteriores" />
              <div className="compact-list">
                {clientHistory.map((item) => (
                  <div className="list-row elevated-row" key={`${item.service}-${item.date}`}>
                    <div>
                      <strong>{item.service}</strong>
                      <small>{item.artist} / {item.date}</small>
                    </div>
                    <StatusPill tone="neutral">Finalizada</StatusPill>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}

        {view === 'explorar' && (
          <Card className="mobile-screen primary-panel">
            <PanelHeader title="Busqueda de artistas" eyebrow="Explorar" />
            <div className="form-stack compact-form">
              <PremiumDropdown
                label="Buscar por"
                value={searchMode}
                open={openDropdown === 'searchMode'}
                onToggle={() => setOpenDropdown(openDropdown === 'searchMode' ? null : 'searchMode')}
                onChange={(nextMode) => {
                  setSearchMode(nextMode)
                  setSelectedArtistProfile(null)
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
                      setSelectedArtistProfile(null)
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
                      setSelectedArtistProfile(null)
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
                const isProfileOpen = selectedArtistProfile?.id === artist.id
                const artistPhotoUrl = publicArtistProfile.photoUrl
                const artistDisplayName = publicArtistProfile.fullName || artist.owner || 'Artista beauty'
                const artistInitials = getArtistInitials(artistDisplayName)
                const artistBiography = publicArtistProfile.biography?.trim()
                const hasSocialLinks = contactLinks.whatsapp || contactLinks.instagram || contactLinks.facebook

                return (
                  <article className={`artist-result marketplace-result-card${isProfileOpen ? ' is-expanded' : ''}`} key={artist.name}>
                    <div className="marketplace-result-summary">
                      <div className="marketplace-artist-avatar avatar">
                        {artistPhotoUrl ? (
                          <img src={artistPhotoUrl} alt={`Foto de ${artistDisplayName}`} />
                        ) : (
                          <span>{artistInitials}</span>
                        )}
                      </div>
                      <div className="marketplace-result-copy">
                        <strong>{artistDisplayName}</strong>
                        <small>{artist.marketplaceServices.slice(0, 3).join(' • ')}</small>
                        <span className={`marketplace-availability availability-${artist.badge.level}`}>
                          {artist.badge.label}
                        </span>
                      </div>
                      <div className="marketplace-result-actions">
                        <button
                          className="marketplace-profile-button"
                          type="button"
                          aria-expanded={isProfileOpen}
                          onClick={() => {
                            if (isProfileOpen) {
                              setSelectedArtistProfile(null)
                              setOpenDropdown(null)
                              return
                            }

                            openArtistProfile(artist)
                          }}
                        >
                          {isProfileOpen ? 'Ocultar perfil' : 'Ver perfil'}
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

                    {isProfileOpen && (
                      <div className="public-profile-panel">
                        <section className="public-profile-hero">
                          <div className="public-profile-hero-copy">
                            <span className="eyebrow">{publicArtistProfile.primarySpecialty || 'Artista beauty'}</span>
                            <h3>{artistDisplayName}</h3>
                            <span className={`marketplace-availability availability-${artist.badge.level}`}>
                              {artist.badge.label}
                            </span>
                            <small>{professionalAddress || artist.city || 'Ubicacion profesional por confirmar'}</small>
                          </div>
                        </section>

                        <section className="public-profile-section">
                          <h4>Sobre mi</h4>
                          <p>{artistBiography || 'Esta artista aún está completando su perfil profesional.'}</p>
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
                                <button type="button" onClick={() => openWhatsAppContact(contactLinks.whatsapp, secondaryService)}>WhatsApp</button>
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
                            label="Servicio"
                            value={secondaryService}
                            open={openDropdown === 'profileService'}
                            onToggle={() => setOpenDropdown(openDropdown === 'profileService' ? null : 'profileService')}
                            onChange={(nextService) => setSecondaryService(nextService)}
                            options={getServiceOptionsForArtist(artist)}
                          />
                          <label className="input-field">
                            <span>Fecha</span>
                            <input type="date" value={bookingDate} onChange={(event) => setBookingDate(event.target.value)} />
                          </label>
                        </div>

                        <div className="compact-list public-slot-list" id={`marketplace-slots-${artist.id}`}>
                          {availableSlots.length > 0 ? (
                            availableSlots.map((slot) => (
                              <div className="list-row elevated-row" key={`${artist.id}-${slot.date}-${slot.time}`}>
                                <div>
                                  <strong>{slot.time} - {slot.end}</strong>
                                  <small>{effectiveMarketplaceService.name}</small>
                                </div>
                                <Button
                                  size="sm"
                                  variant={slot.available && !isRealMarketplace ? 'primary' : 'ghost'}
                                  disabled={isRealMarketplace || !slot.available}
                                  onClick={() => reserveSlot(slot)}
                                >
                                  {isRealMarketplace ? 'Disponible' : slot.available ? 'Reservar' : 'Ocupado'}
                                </Button>
                              </div>
                            ))
                          ) : (
                            <div className="list-row elevated-row">
                              <div>
                                <strong>{isAvailabilityLoading ? 'Cargando horarios...' : 'Sin horarios disponibles'}</strong>
                                <small>{availabilityError || 'La agenda del artista no permite reservas en esta fecha.'}</small>
                              </div>
                              <StatusPill tone="neutral">No disponible</StatusPill>
                            </div>
                          )}
                        </div>

                        <div className="public-profile-final-actions">
                          <Button
                            onClick={() => document.getElementById(`marketplace-slots-${artist.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                            disabled={isRealMarketplace || !availableSlots.some((slot) => slot.available)}
                          >
                            📅 Reservar cita
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={!contactLinks.whatsapp}
                            onClick={() => openWhatsAppContact(contactLinks.whatsapp, secondaryService)}
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

                        <button className="public-profile-hide" type="button" onClick={() => setSelectedArtistProfile(null)}>
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
                  const isProfileOpen = selectedArtistProfile?.id === artist.id
                  const artistPhotoUrl = publicArtistProfile.photoUrl
                  const artistDisplayName = publicArtistProfile.fullName || artist.owner || 'Artista beauty'
                  const artistInitials = getArtistInitials(artistDisplayName)
                  const artistBiography = publicArtistProfile.biography?.trim()
                  const hasSocialLinks = contactLinks.whatsapp || contactLinks.instagram || contactLinks.facebook

                  return (
                    <article className={`favorite-card marketplace-result-card${isProfileOpen ? ' is-expanded' : ''}`} key={artist.name}>
                      <div className="marketplace-result-summary">
                        <div className="marketplace-artist-avatar avatar">
                          {artistPhotoUrl ? (
                            <img src={artistPhotoUrl} alt={`Foto de ${artistDisplayName}`} />
                          ) : (
                            <span>{artistInitials}</span>
                          )}
                        </div>
                        <div className="marketplace-result-copy">
                          <strong>{artistDisplayName}</strong>
                          <small>{artist.marketplaceServices.slice(0, 3).join(' • ')}</small>
                          <span className={`marketplace-availability availability-${artist.badge.level}`}>
                            {artist.badge.label}
                          </span>
                        </div>
                        <div className="marketplace-result-actions">
                          <button
                            className="marketplace-profile-button"
                            type="button"
                            aria-expanded={isProfileOpen}
                            onClick={() => {
                              if (isProfileOpen) {
                                setSelectedArtistProfile(null)
                                setOpenDropdown(null)
                                return
                              }

                              openArtistProfile(artist)
                            }}
                          >
                            👤 {isProfileOpen ? 'Ocultar perfil' : 'Ver perfil'}
                          </button>
                          <button
                            className="marketplace-profile-button"
                            type="button"
                            onClick={() => openArtistProfile(artist, { scrollToBooking: true })}
                          >
                            📅 Reservar cita
                          </button>
                        </div>
                      </div>

                      {isProfileOpen && (
                        <div className="public-profile-panel">
                          <section className="public-profile-hero">
                            <div className="public-profile-hero-copy">
                              <span className="eyebrow">{publicArtistProfile.primarySpecialty || 'Artista beauty'}</span>
                              <h3>{artistDisplayName}</h3>
                              <span className={`marketplace-availability availability-${artist.badge.level}`}>
                                {artist.badge.label}
                              </span>
                              <small>{professionalAddress || artist.city || 'Ubicacion profesional por confirmar'}</small>
                            </div>
                          </section>

                          <section className="public-profile-section">
                            <h4>Sobre mi</h4>
                            <p>{artistBiography || 'Esta artista aún está completando su perfil profesional.'}</p>
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
                                  <button type="button" onClick={() => openWhatsAppContact(contactLinks.whatsapp, secondaryService)}>WhatsApp</button>
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
                              label="Servicio"
                              value={secondaryService}
                              open={openDropdown === 'favoriteProfileService'}
                              onToggle={() => setOpenDropdown(openDropdown === 'favoriteProfileService' ? null : 'favoriteProfileService')}
                              onChange={(nextService) => setSecondaryService(nextService)}
                              options={getServiceOptionsForArtist(artist)}
                            />
                            <label className="input-field">
                              <span>Fecha</span>
                              <input type="date" value={bookingDate} onChange={(event) => setBookingDate(event.target.value)} />
                            </label>
                          </div>

                          <div className="compact-list public-slot-list" id={`marketplace-slots-${artist.id}`}>
                            {availableSlots.length > 0 ? (
                              availableSlots.map((slot) => (
                                <div className="list-row elevated-row" key={`${artist.id}-${slot.date}-${slot.time}`}>
                                  <div>
                                    <strong>{slot.time} - {slot.end}</strong>
                                    <small>{effectiveMarketplaceService.name}</small>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant={slot.available && !isRealMarketplace ? 'primary' : 'ghost'}
                                    disabled={isRealMarketplace || !slot.available}
                                    onClick={() => reserveSlot(slot)}
                                  >
                                    {isRealMarketplace ? 'Disponible' : slot.available ? 'Reservar' : 'Ocupado'}
                                  </Button>
                                </div>
                              ))
                            ) : (
                              <div className="list-row elevated-row">
                                <div>
                                  <strong>{isAvailabilityLoading ? 'Cargando horarios...' : 'Sin horarios disponibles'}</strong>
                                  <small>{availabilityError || 'La agenda del artista no permite reservas en esta fecha.'}</small>
                                </div>
                                <StatusPill tone="neutral">No disponible</StatusPill>
                              </div>
                            )}
                          </div>

                          <div className="public-profile-final-actions">
                            <Button
                              onClick={() => document.getElementById(`marketplace-slots-${artist.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                              disabled={isRealMarketplace || !availableSlots.some((slot) => slot.available)}
                            >
                              📅 Reservar cita
                            </Button>
                            <Button
                              variant="ghost"
                              disabled={!contactLinks.whatsapp}
                              onClick={() => openWhatsAppContact(contactLinks.whatsapp, secondaryService)}
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

                          <button className="public-profile-hide" type="button" onClick={() => setSelectedArtistProfile(null)}>
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
            <Card className="mobile-screen">
              <PanelHeader title="Historial" eyebrow="Reciente" />
              <div className="compact-list">
                {clientHistory.map((item) => (
                  <div className="list-row elevated-row" key={`${item.service}-${item.date}`}>
                    <div>
                      <strong>{item.service}</strong>
                      <small>{item.artist} / {item.date}</small>
                    </div>
                    <span>{item.amount}</span>
                  </div>
                ))}
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
                <label className="input-field">
                  <span>Notas</span>
                  <textarea
                    value={profileDraft.notes}
                    onChange={(event) => setProfileDraft({ ...profileDraft, notes: event.target.value })}
                    rows="3"
                  />
                </label>
                <Button className="full-width" onClick={() => updateClientProfile(profileDraft)}>Guardar perfil</Button>
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
    </main>
  )
}

export default ClientDashboard
