import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppContext } from './appContextCore'
import { artistAppointments, artistClients, artistServices as mockArtistServices, clientHistory, managedArtists, managedClients, studios, systemStatus, users, weeklySchedule } from '../services/mockData'
import { canUseOperationalFeature, getDefaultStudioStatus } from '../modules/governance/studioGovernance'
import { ROLES } from '../modules/permissions/rolePermissions'
import {
  deriveMembershipsFromLegacyData,
  getStudioForArtist,
} from '../modules/entities/entitySelectors'
import { createArtistLocationSettings, createProfessionalLocation } from '../utils/locationHelpers'
import { mapAuthContextToArtistProfile } from '../utils/artistProfileMapper'
import { mapAuthContextToClientProfile } from '../utils/clientProfileMapper'
import {
  getCurrentAuthSession,
  hasSupabaseAuth,
  onAuthStateChange,
  sendPasswordReset,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  updatePassword as updateSupabasePassword,
} from '../services/authService'
import {
  bootstrapArtistProfile,
  bootstrapClientProfile,
  fetchAuthContext,
} from '../services/profileBootstrapService'
import {
  archiveArtistServiceOffering,
  fetchArtistServices,
  saveArtistServiceOffering,
  updateArtistServiceOfferingStatus,
} from '../services/artistServiceService'
import {
  fetchArtistProfile,
  saveArtistProfile as saveArtistProfileRecord,
} from '../services/artistProfileService'
import {
  activateAdminArtist,
  deactivateAdminArtist,
  fetchAdminArtists,
  updateAdminArtistProfile,
} from '../services/adminArtistService'
import { fetchAdminDashboardSummary } from '../services/adminDashboardService'
import {
  activateAdminClient,
  deactivateAdminClient,
  fetchAdminClients,
  updateAdminClientProfile,
} from '../services/adminClientService'

const initialSession = {
  user: null,
  role: null,
  authUser: null,
  profile: null,
  roles: [],
  activeSessionContext: null,
  isMockSession: false,
}

const storageKey = 'studio-flow-session'
const adminStateStorageKey = 'studio-flow-admin-state'
const clientStateStorageKey = 'studio-flow-client-state'
const artistStateStorageKey = 'studio-flow-artist-state'

function getStoredSession() {
  try {
    const storedSession = localStorage.getItem(storageKey)
    if (!storedSession) return initialSession

    const parsedSession = JSON.parse(storedSession)

    return parsedSession.user
      ? {
          ...initialSession,
          ...parsedSession,
          isMockSession: parsedSession.isMockSession ?? true,
        }
      : initialSession
  } catch {
    return initialSession
  }
}

const mockUsers = {
  client: users.find((user) => user.role === ROLES.CLIENT) || { id: 'client-demo', name: 'Clienta Demo', role: ROLES.CLIENT, studioId: null },
  artist: users.find((user) => user.role === ROLES.ARTIST) || { id: 'artist-demo', name: 'Artista Demo', role: ROLES.ARTIST, studioId: null },
  admin: users.find((user) => user.role === ROLES.PLATFORM_OWNER) || { id: 'admin-demo', name: 'Studio Flow HQ', role: ROLES.PLATFORM_OWNER, studioId: null },
  studio_owner: users.find((user) => user.role === ROLES.STUDIO_OWNER) || { id: 'studio-owner-demo', name: 'Studio Owner Demo', role: ROLES.STUDIO_OWNER, studioId: null },
  studio_manager: users.find((user) => user.role === ROLES.STUDIO_MANAGER) || { id: 'studio-manager-demo', name: 'Studio Manager Demo', role: ROLES.STUDIO_MANAGER, studioId: null },
}

function normalizeRoleCode(role) {
  if (role === 'admin') return ROLES.PLATFORM_OWNER
  return role || ROLES.CLIENT
}

function getRoleAssignments(authContext) {
  return Array.isArray(authContext?.roles) ? authContext.roles : []
}

function getActiveRole(authContext) {
  const profileRole = normalizeRoleCode(authContext?.profile?.default_role)
  const roles = getRoleAssignments(authContext)
  const hasProfileRole = roles.some((assignment) => assignment.role === profileRole)

  return hasProfileRole ? profileRole : normalizeRoleCode(roles[0]?.role || profileRole)
}

function createSessionFromAuthContext(authSession, authContext = {}) {
  const profile = authContext.profile

  if (!authSession?.user || !profile) return initialSession

  const role = getActiveRole(authContext)
  const roles = getRoleAssignments(authContext)
  const activeRoleAssignment = roles.find((assignment) => assignment.role === role) || roles[0]
  const memberships = Array.isArray(authContext.memberships) ? authContext.memberships : []
  const activeMembership = memberships[0]
  const studioId = activeRoleAssignment?.studioId || activeRoleAssignment?.studio_id || activeMembership?.studioId || activeMembership?.studio_id || null
  const artistId = authContext.artist?.id || null
  const clientId = authContext.client?.id || null

  return {
    user: {
      id: profile.id,
      profileId: profile.id,
      name: profile.display_name || authSession.user.email,
      email: profile.email || authSession.user.email,
      phone: profile.phone || '',
      role,
      studioId,
      artistId,
      clientId,
      membershipId: activeMembership?.id || null,
    },
    role,
    authUser: authSession.user,
    profile,
    roles,
    artist: authContext.artist || null,
    client: authContext.client || null,
    memberships,
    activeSessionContext: {
      role,
      studioId,
      artistId,
      clientId,
      membershipId: activeMembership?.id || null,
    },
    isMockSession: false,
  }
}

function getAuthMetadata(authSession) {
  return authSession?.user?.user_metadata || {}
}

function getBootstrapRole(authSession, authContext = {}) {
  const metadata = getAuthMetadata(authSession)

  return normalizeRoleCode(authContext.profile?.default_role || metadata.default_role)
}

function hasRoleAssignment(authContext, role) {
  return getRoleAssignments(authContext).some((assignment) => assignment.role === role)
}

async function repairIncompleteAuthContext(authSession, authContext = {}) {
  const metadata = getAuthMetadata(authSession)
  const role = getBootstrapRole(authSession, authContext)
  const displayName = metadata.display_name || authContext.profile?.display_name || authSession?.user?.email || ''
  const phone = metadata.phone || authContext.profile?.phone || ''

  console.log('CLIENT REPAIR START', {
    hasAuthUser: Boolean(authSession?.user),
    hasProfile: Boolean(authContext.profile),
    hasClient: Boolean(authContext.client),
    role,
  })
  console.log('CLIENT REPAIR PROFILE', {
    display_name: authContext.profile?.display_name,
    phone: authContext.profile?.phone,
    default_role: authContext.profile?.default_role,
    metadata_default_role: metadata.default_role,
  })

  if (role === ROLES.CLIENT && (!authContext.client || !hasRoleAssignment(authContext, ROLES.CLIENT))) {
    console.log('CLIENT REPAIR MISSING CLIENT', {
      missingClient: !authContext.client,
      missingClientRole: !hasRoleAssignment(authContext, ROLES.CLIENT),
    })
    console.log('CLIENT REPAIR BOOTSTRAP CALLED', {
      display_name: displayName,
      phone,
      default_role: role,
    })

    try {
      const repairedAuthContext = await bootstrapClientProfile({ displayName, phone })
      console.log('CLIENT REPAIR SUCCESS', {
        hasProfile: Boolean(repairedAuthContext.profile),
        hasClient: Boolean(repairedAuthContext.client),
        roles: repairedAuthContext.roles,
      })
      return repairedAuthContext
    } catch (error) {
      console.error('CLIENT REPAIR ERROR', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      })
      throw error
    }
  }

  if (role === ROLES.ARTIST && (!authContext.artist || !hasRoleAssignment(authContext, ROLES.ARTIST))) {
    return bootstrapArtistProfile({
      displayName,
      phone,
      artisticName: metadata.artistic_name || displayName,
      city: metadata.city || '',
      claimToken: metadata.claim_token || null,
    })
  }

  return authContext
}

const initialBlockedDates = [
  { id: '2026-05-20', label: '20 mayo / Capacitacion' },
  { id: '2026-05-25', label: '25 mayo / Dia libre' },
  { id: '2026-06-02', label: '02 junio / Evento privado' },
]

function createArtistProfessionalProfile(overrides = {}) {
  return {
    registration: {
      studioStatus: overrides.registration?.studioStatus || overrides.studioStatus || getDefaultStudioStatus(),
    },
    personalInfo: {
      artisticName: '',
      fullName: '',
      phone: '55 0000 0000',
      email: 'valeria@studioflow.mx',
      ...(overrides.personalInfo || {}),
    },
    professionalProfile: {
      primarySpecialty: 'Lash lifting y brow design',
      specialties: 'Lash lifting, Brow design',
      shortBio: '',
      experienceYears: '',
      ...(overrides.professionalProfile || {}),
      paymentMethods: {
        cash: false,
        transfer: false,
        card: false,
        ...(overrides.professionalProfile?.paymentMethods || {}),
      },
    },
    contactLinks: {
      whatsapp: '',
      instagram: '',
      facebook: '',
      ...(overrides.contactLinks || {}),
    },
    portfolio: Array.isArray(overrides.portfolio) ? overrides.portfolio.slice(0, 12) : [],
    security: {
      email: overrides.security?.email || overrides.personalInfo?.email || 'valeria@studioflow.mx',
      password: overrides.security?.password || '',
      confirmPassword: overrides.security?.confirmPassword || '',
    },
  }
}

function createStudioProfessionalProfile(studio, overrides = {}) {
  return {
    commercialName: overrides.commercialName || studio.name || '',
    description: overrides.description || 'Experiencia beauty profesional preparada para perfil publico.',
    phone: overrides.phone || '55 0000 0000',
    email: overrides.email || 'contacto@studioflow.mx',
    hours: overrides.hours || 'Lunes a sabado, 10:00 - 19:00',
    logoUrl: overrides.logoUrl || '',
    gallery: Array.isArray(overrides.gallery) ? overrides.gallery.slice(0, 5) : [],
  }
}

function createInitialAgendaSettings() {
  return {
    schedule: weeklySchedule.map((day) => ({
      ...day,
      blocks: day.active
        ? [{ id: `${day.day}-break`, start: day.breakStart, end: day.breakEnd }]
        : [],
    })),
    blockedDates: initialBlockedDates,
    intervalMinutes: 15,
    minAdvanceHours: 2,
    bookedSlots: [],
  }
}

function createInitialAdminState() {
  const initialStudios = studios.map((studio) => ({
    ...studio,
    profile: createStudioProfessionalProfile(studio, studio.profile),
    professionalLocation: createProfessionalLocation({
      businessName: studio.name,
      city: studio.city,
      ...(studio.professionalLocation || {}),
    }),
  }))
  const initialArtists = managedArtists.map(({ studioId: legacyStudioId, ...artist }, index) => ({
    ...artist,
    id: `artist-${index + 1}`,
    studioId: legacyStudioId || null,
    studioStatus: artist.studioStatus || getDefaultStudioStatus(),
    description: artist.description || 'Perfil profesional beauty listo para recibir reservas.',
    services: artist.services || 'Lashes, brows, makeup',
    professionalLocation: createArtistLocationSettings(artist.professionalLocation),
  }))
  const initialClients = managedClients.map((client, index) => ({
    ...client,
    id: `client-${index + 1}`,
    studioId: client.studioId || null,
    email: client.email || `${client.name.toLowerCase().replaceAll(' ', '.')}@studioflow.demo`,
    phone: client.phone || '55 0000 0000',
    notes: client.notes || 'Perfil mock administrable.',
    history: clientHistory.map((item, historyIndex) => ({
      id: `${client.name}-${historyIndex + 1}`,
      artist: item.artist,
      date: item.date,
      service: item.service,
      status: historyIndex === 0 ? 'Completada' : 'Finalizada',
    })),
  }))

  return {
    dashboard: {
      source: 'mock',
      studios: initialStudios,
      artists: initialArtists,
      clients: artistClients,
      appointments: artistAppointments,
      users,
      systemStatus,
    },
    studios: initialStudios,
    users,
    artists: initialArtists,
    clients: initialClients,
  }
}

function createInitialClientState() {
  return {
    profile: {
      id: 'client-mf',
      name: 'María Fernanda',
      email: 'mariana.lopez@studioflow.demo',
      phone: '55 0000 0000',
      notes: 'Clienta premium Studio Flow.',
      flowPoints: 98,
      vipTier: 'Glow',
      streak: 4,
      pointsExpirationDate: '2026-12-31',
      photoUrl: '',
    },
    favoriteArtistIds: ['artist-1', 'artist-3'],
  }
}

function getStoredClientState() {
  const initialClientState = createInitialClientState()

  try {
    const storedClientState = localStorage.getItem(clientStateStorageKey)
    return storedClientState
      ? {
          ...initialClientState,
          ...JSON.parse(storedClientState),
          profile: {
            ...initialClientState.profile,
            ...JSON.parse(storedClientState).profile,
          },
        }
      : initialClientState
  } catch {
    return initialClientState
  }
}

function getStoredAdminState() {
  const initialAdminState = createInitialAdminState()

  try {
    const storedAdminState = localStorage.getItem(adminStateStorageKey)
    const parsedAdminState = storedAdminState ? JSON.parse(storedAdminState) : null

    if (!parsedAdminState) return initialAdminState

    return {
      ...initialAdminState,
      ...parsedAdminState,
      studios: initialAdminState.studios.map((studio) => {
        const storedStudio = parsedAdminState.studios?.find((item) => item.id === studio.id)

        return storedStudio
          ? {
              ...studio,
              ...storedStudio,
              profile: createStudioProfessionalProfile(storedStudio, storedStudio.profile),
              professionalLocation: createProfessionalLocation({
                ...studio.professionalLocation,
                ...(storedStudio.professionalLocation || {}),
              }),
            }
          : studio
      }),
      artists: initialAdminState.artists.map((artist) => {
        const storedArtist = parsedAdminState.artists?.find((item) => item.id === artist.id)

        return storedArtist
          ? {
              ...artist,
              ...storedArtist,
              professionalLocation: createArtistLocationSettings(storedArtist.professionalLocation),
            }
          : artist
      }),
      clients: parsedAdminState.clients || initialAdminState.clients,
    }
  } catch {
    return initialAdminState
  }
}

function createInitialArtistState() {
  const artistProfessionalProfile = createArtistProfessionalProfile()

  return {
    profile: {
      ...artistProfessionalProfile,
      photoUrl: '',
      professionalLocation: createArtistLocationSettings(),
    },
    appointments: artistAppointments.map((appointment, index) => ({
      ...appointment,
      id: appointment.id || `artist-appointment-${index + 1}`,
      studioId: appointment.studioId || null,
      date: appointment.date || '2026-05-18',
      status: appointment.status || 'Confirmada',
    })),
    clients: artistClients.map((client) => ({
      ...client,
      history: client.history || [],
    })),
    services: mockArtistServices.map((service, index) => ({
      ...service,
      id: service.id || `artist-service-${index + 1}`,
    })),
  }
}

function getStoredArtistState() {
  const initialArtistState = createInitialArtistState()

  try {
    const storedArtistState = localStorage.getItem(artistStateStorageKey)
    const parsedArtistState = storedArtistState ? JSON.parse(storedArtistState) : null
    return parsedArtistState
      ? {
          ...initialArtistState,
          ...parsedArtistState,
          profile: {
            ...initialArtistState.profile,
            ...parsedArtistState.profile,
            personalInfo: {
              ...initialArtistState.profile.personalInfo,
              ...parsedArtistState.profile?.personalInfo,
            },
            registration: {
              ...initialArtistState.profile.registration,
              ...parsedArtistState.profile?.registration,
            },
            professionalProfile: {
              ...initialArtistState.profile.professionalProfile,
              ...parsedArtistState.profile?.professionalProfile,
              paymentMethods: {
                ...initialArtistState.profile.professionalProfile.paymentMethods,
                ...parsedArtistState.profile?.professionalProfile?.paymentMethods,
              },
            },
            contactLinks: {
              ...initialArtistState.profile.contactLinks,
              ...parsedArtistState.profile?.contactLinks,
            },
            portfolio: Array.isArray(parsedArtistState.profile?.portfolio)
              ? parsedArtistState.profile.portfolio.slice(0, 12)
              : initialArtistState.profile.portfolio,
            security: {
              ...initialArtistState.profile.security,
              ...parsedArtistState.profile?.security,
            },
            professionalLocation: createArtistLocationSettings(parsedArtistState.profile?.professionalLocation),
          },
        }
      : initialArtistState
  } catch {
    return initialArtistState
  }
}

function formatBlockedDate(value) {
  if (!value) return ''

  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year} / Bloqueo manual`
}

function timeToMinutes(time) {
  if (!time || !time.includes(':')) return null

  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

function minutesToTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60).toString().padStart(2, '0')
  const minutes = (totalMinutes % 60).toString().padStart(2, '0')
  return `${hours}:${minutes}`
}

function getScheduleIndex(dateValue) {
  const [year, month, day] = dateValue.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  const dayIndex = date.getDay()
  return dayIndex === 0 ? 6 : dayIndex - 1
}

function overlapsBlockedTime(start, end, blocks) {
  return blocks.some((block) => {
    const blockStart = timeToMinutes(block.start)
    const blockEnd = timeToMinutes(block.end)

    if (blockStart === null || blockEnd === null) return false

    return start < blockEnd && end > blockStart
  })
}

function isSameDate(dateValue, comparisonDate) {
  const [year, month, day] = dateValue.split('-').map(Number)
  return (
    comparisonDate.getFullYear() === year
    && comparisonDate.getMonth() === month - 1
    && comparisonDate.getDate() === day
  )
}

function normalizeBookingField(value) {
  return String(value || '').trim().toLowerCase()
}

function hasDuplicateClientServiceBooking(bookedSlots, nextSlot) {
  const nextClientId = normalizeBookingField(nextSlot.clientId)
  const nextArtist = normalizeBookingField(nextSlot.artistId || nextSlot.artist)
  const nextService = normalizeBookingField(nextSlot.service)
  const nextDate = normalizeBookingField(nextSlot.date)

  if (!nextClientId || !nextArtist || !nextService || !nextDate) return false

  return bookedSlots.some((bookedSlot) => (
    normalizeBookingField(bookedSlot.clientId) === nextClientId
    && normalizeBookingField(bookedSlot.artistId || bookedSlot.artist) === nextArtist
    && normalizeBookingField(bookedSlot.service) === nextService
    && normalizeBookingField(bookedSlot.date) === nextDate
  ))
}

export function AppProvider({ children }) {
  const [session, setSession] = useState(getStoredSession)
  const [isAuthLoading, setIsAuthLoading] = useState(hasSupabaseAuth)
  const [authError, setAuthError] = useState('')
  const sessionRef = useRef(session)
  const demoLoginInProgressRef = useRef(false)
  const [agendaSettings, setAgendaSettings] = useState(createInitialAgendaSettings)
  const [adminState, setAdminState] = useState(getStoredAdminState)
  const [clientState, setClientState] = useState(getStoredClientState)
  const [artistState, setArtistState] = useState(getStoredArtistState)
  const [isArtistServicesLoading, setIsArtistServicesLoading] = useState(false)
  const [artistServicesError, setArtistServicesError] = useState('')
  const [isArtistProfileSaving, setIsArtistProfileSaving] = useState(false)
  const [artistProfileError, setArtistProfileError] = useState('')
  const [isAdminArtistsLoading, setIsAdminArtistsLoading] = useState(false)
  const [adminArtistsError, setAdminArtistsError] = useState('')
  const [isAdminDashboardLoading, setIsAdminDashboardLoading] = useState(false)
  const [adminDashboardError, setAdminDashboardError] = useState('')
  const [isAdminClientsLoading, setIsAdminClientsLoading] = useState(false)
  const [adminClientsError, setAdminClientsError] = useState('')
  const [selectedDate, setSelectedDate] = useState('2026-05-18')

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  const hydrateSupabaseSession = useCallback(async (authSession) => {
    if (!authSession?.user) {
      setIsAuthLoading(false)
      return initialSession
    }

    console.log('CLIENT REPAIR START', {
      source: 'hydrateSupabaseSession',
      authUserId: authSession.user.id,
      email: authSession.user.email,
    })

    const authContext = await repairIncompleteAuthContext(authSession, await fetchAuthContext())
    const nextSession = createSessionFromAuthContext(authSession, authContext)

    if (authContext.artist) {
      const artistProfile = await fetchArtistProfile({ artistId: authContext.artist.id })
      setArtistState((currentState) => ({
        ...currentState,
        profile: mapAuthContextToArtistProfile({
          ...authContext,
          artistProfile,
        }, currentState.profile),
      }))
    }

    if (authContext.client) {
      const mappedClientProfile = mapAuthContextToClientProfile(authContext)
      console.log('CLIENT HYDRATION INPUT', {
        source: 'hydrateSupabaseSession',
        profile: authContext.profile,
        client: authContext.client,
      })
      console.log('CLIENT HYDRATION MAPPED PROFILE', mappedClientProfile)
      setClientState((currentState) => ({
        ...currentState,
        profile: {
          ...currentState.profile,
          ...mappedClientProfile,
        },
      }))
    }

    localStorage.removeItem(storageKey)
    setSession(nextSession)
    setIsAuthLoading(false)

    return nextSession
  }, [])

  const loginDemo = useCallback(async (role) => {
    demoLoginInProgressRef.current = true

    if (hasSupabaseAuth()) {
      try {
        await signOut()
      } catch {
        // Demo mode must remain available even if the remote auth session is already gone.
      }
    }

    const nextSession = {
      user: mockUsers[role],
      role,
      authUser: null,
      profile: null,
      roles: [],
      activeSessionContext: {
        role,
        studioId: mockUsers[role]?.studioId || null,
        artistId: role === ROLES.ARTIST ? mockUsers[role]?.id : null,
        clientId: role === ROLES.CLIENT ? mockUsers[role]?.id : null,
        membershipId: null,
      },
      isMockSession: true,
    }

    localStorage.setItem(storageKey, JSON.stringify(nextSession))
    sessionRef.current = nextSession
    setSession(nextSession)
    demoLoginInProgressRef.current = false

    return nextSession
  }, [])

  const loginWithPassword = useCallback(async ({ email, password }) => {
    setAuthError('')
    setIsAuthLoading(true)

    try {
      const data = await signInWithPassword({ email, password })
      return await hydrateSupabaseSession(data.session)
    } catch (error) {
      setAuthError(error.message || 'No se pudo iniciar sesion.')
      setIsAuthLoading(false)
      throw error
    }
  }, [hydrateSupabaseSession])

  const registerClient = useCallback(async ({ displayName, email, phone, password }) => {
    setAuthError('')
    setIsAuthLoading(true)

    try {
      const data = await signUpWithPassword({
        email,
        password,
        displayName,
        phone,
        defaultRole: ROLES.CLIENT,
      })

      if (!data.session) {
        setIsAuthLoading(false)
        return { needsEmailConfirmation: true }
      }

      const authContext = await bootstrapClientProfile({ displayName, phone })
      const nextSession = createSessionFromAuthContext(data.session, authContext)
      const mappedClientProfile = mapAuthContextToClientProfile(authContext)
      console.log('CLIENT HYDRATION INPUT', {
        source: 'registerClient',
        profile: authContext.profile,
        client: authContext.client,
      })
      console.log('CLIENT HYDRATION MAPPED PROFILE', mappedClientProfile)
      setClientState((currentState) => ({
        ...currentState,
        profile: {
          ...currentState.profile,
          ...mappedClientProfile,
        },
      }))
      localStorage.removeItem(storageKey)
      setSession(nextSession)
      setIsAuthLoading(false)

      return { session: nextSession, needsEmailConfirmation: false }
    } catch (error) {
      setAuthError(error.message || 'No se pudo crear la cuenta cliente.')
      setIsAuthLoading(false)
      throw error
    }
  }, [])

  const registerArtist = useCallback(async ({ displayName, email, phone, password, artisticName, city, claimToken }) => {
    setAuthError('')
    setIsAuthLoading(true)

    try {
      const data = await signUpWithPassword({
        email,
        password,
        displayName,
        phone,
        defaultRole: ROLES.ARTIST,
        metadata: {
          artistic_name: artisticName,
          city,
          claim_token: claimToken || null,
        },
      })

      if (!data.session) {
        setIsAuthLoading(false)
        return { needsEmailConfirmation: true }
      }

      const authContext = await bootstrapArtistProfile({ displayName, phone, artisticName, city, claimToken })
      const nextSession = createSessionFromAuthContext(data.session, authContext)
      const artistProfile = await fetchArtistProfile({ artistId: authContext.artist?.id })
      setArtistState((currentState) => ({
        ...currentState,
        profile: mapAuthContextToArtistProfile({
          ...authContext,
          artistProfile,
        }, currentState.profile),
      }))
      localStorage.removeItem(storageKey)
      setSession(nextSession)
      setIsAuthLoading(false)

      return { session: nextSession, needsEmailConfirmation: false }
    } catch (error) {
      setAuthError(error.message || 'No se pudo crear la cuenta artista.')
      setIsAuthLoading(false)
      throw error
    }
  }, [])

  const resetPassword = useCallback(async (email) => {
    setAuthError('')

    try {
      await sendPasswordReset(email)
    } catch (error) {
      setAuthError(error.message || 'No se pudo enviar el correo de recuperacion.')
      throw error
    }
  }, [])

  const updatePassword = useCallback(async (password) => {
    setAuthError('')

    try {
      await updateSupabasePassword(password)
    } catch (error) {
      setAuthError(error.message || 'No se pudo actualizar la contrasena.')
      throw error
    }
  }, [])

  const logout = useCallback(async () => {
    if (!session.isMockSession) {
      await signOut()
    }

    localStorage.removeItem(storageKey)
    sessionRef.current = initialSession
    setSession(initialSession)
  }, [session.isMockSession])

  useEffect(() => {
    if (!hasSupabaseAuth()) {
      return undefined
    }

    let isMounted = true

    getCurrentAuthSession()
      .then((authSession) => {
        if (!isMounted) return

        if (authSession) {
          hydrateSupabaseSession(authSession).catch((error) => {
            setAuthError(error.message || 'No se pudo cargar la sesion.')
            setIsAuthLoading(false)
          })
        } else {
          setIsAuthLoading(false)
        }
      })
      .catch((error) => {
        if (!isMounted) return
        setAuthError(error.message || 'No se pudo cargar la sesion.')
        setIsAuthLoading(false)
      })

    const subscription = onAuthStateChange((authSession) => {
      if (!isMounted) return

      if (authSession) {
        hydrateSupabaseSession(authSession).catch((error) => {
          setAuthError(error.message || 'No se pudo cargar la sesion.')
          setIsAuthLoading(false)
        })
      } else if (!demoLoginInProgressRef.current && !sessionRef.current.isMockSession) {
        setSession(initialSession)
        setIsAuthLoading(false)
      }
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [hydrateSupabaseSession, session.isMockSession])

  useEffect(() => {
    try {
      localStorage.setItem(adminStateStorageKey, JSON.stringify(adminState))
    } catch {
      // Keep runtime profile state if gallery/logo data URLs exceed localStorage.
    }
  }, [adminState])

  useEffect(() => {
    try {
      localStorage.setItem(clientStateStorageKey, JSON.stringify(clientState))
    } catch {
      // Data URL photos can exceed localStorage in some browsers; keep runtime state even if persistence fails.
    }
  }, [clientState])

  useEffect(() => {
    try {
      localStorage.setItem(artistStateStorageKey, JSON.stringify(artistState))
    } catch {
      // Data URL photos can exceed localStorage in some browsers; keep runtime state even if persistence fails.
    }
  }, [artistState])

  const loadArtistServices = useCallback(async (artistId = session.artist?.id || session.user?.artistId) => {
    if (!artistId || session.isMockSession) return []

    setIsArtistServicesLoading(true)
    setArtistServicesError('')

    try {
      const services = await fetchArtistServices({ artistId })
      setArtistState((currentState) => ({
        ...currentState,
        services,
      }))
      setIsArtistServicesLoading(false)
      return services
    } catch (error) {
      setArtistServicesError(error.message || 'No se pudieron cargar los servicios.')
      setIsArtistServicesLoading(false)
      throw error
    }
  }, [session.artist?.id, session.isMockSession, session.user?.artistId])

  useEffect(() => {
    if (session.role !== ROLES.ARTIST || session.isMockSession) return

    const artistId = session.artist?.id || session.user?.artistId
    if (!artistId) return

    loadArtistServices(artistId).catch(() => {
      // artistServicesError already exposes the failure to the UI.
    })
  }, [loadArtistServices, session.artist?.id, session.isMockSession, session.role, session.user?.artistId])

  const loadAdminArtists = useCallback(async () => {
    if (session.isMockSession) return null
    if (![ROLES.PLATFORM_OWNER, ROLES.STUDIO_OWNER, ROLES.STUDIO_MANAGER].includes(session.role)) return null

    setIsAdminArtistsLoading(true)
    setAdminArtistsError('')

    try {
      const payload = await fetchAdminArtists()
      setAdminState((currentState) => ({
        ...currentState,
        artists: payload.artists,
        studios: payload.studios.length > 0 ? payload.studios : currentState.studios,
      }))
      setIsAdminArtistsLoading(false)
      return payload
    } catch (error) {
      setAdminArtistsError(error.message || 'No se pudieron cargar los artistas.')
      setIsAdminArtistsLoading(false)
      throw error
    }
  }, [session.isMockSession, session.role])

  const loadAdminDashboard = useCallback(async () => {
    if (session.isMockSession) return null
    if (![ROLES.PLATFORM_OWNER, ROLES.STUDIO_OWNER, ROLES.STUDIO_MANAGER].includes(session.role)) return null

    setIsAdminDashboardLoading(true)
    setAdminDashboardError('')

    try {
      const payload = await fetchAdminDashboardSummary()
      setAdminState((currentState) => ({
        ...currentState,
        dashboard: payload,
      }))
      return payload
    } catch (error) {
      setAdminDashboardError(error.message || 'No se pudo cargar el dashboard administrativo.')
      setAdminState((currentState) => ({
        ...currentState,
        dashboard: {
          source: 'supabase',
          studios: [],
          artists: [],
          clients: [],
          appointments: [],
          users: [],
          systemStatus: [],
        },
      }))
      return null
    } finally {
      setIsAdminDashboardLoading(false)
    }
  }, [session.isMockSession, session.role])

  const loadAdminClients = useCallback(async () => {
    if (session.isMockSession) return null
    if (![ROLES.PLATFORM_OWNER, ROLES.STUDIO_OWNER, ROLES.STUDIO_MANAGER].includes(session.role)) return null

    setIsAdminClientsLoading(true)
    setAdminClientsError('')

    try {
      const clients = await fetchAdminClients()
      setAdminState((currentState) => ({
        ...currentState,
        clients,
      }))
      return clients
    } catch (error) {
      setAdminClientsError(error.message || 'No se pudieron cargar los clientes.')
      setAdminState((currentState) => ({
        ...currentState,
        clients: [],
      }))
      return null
    } finally {
      setIsAdminClientsLoading(false)
    }
  }, [session.isMockSession, session.role])

  useEffect(() => {
    if (session.isMockSession) return
    if (![ROLES.PLATFORM_OWNER, ROLES.STUDIO_OWNER, ROLES.STUDIO_MANAGER].includes(session.role)) return

    loadAdminArtists().catch(() => {
      // adminArtistsError keeps the failure available to admin screens.
    })
    loadAdminDashboard().catch(() => {
      // adminDashboardError keeps the failure available to admin screens.
    })
    loadAdminClients().catch(() => {
      // adminClientsError keeps the failure available to admin screens.
    })
  }, [loadAdminArtists, loadAdminClients, loadAdminDashboard, session.isMockSession, session.role])

  const toggleScheduleDay = useCallback((dayName) => {
    setAgendaSettings((currentSettings) => ({
      ...currentSettings,
      schedule: currentSettings.schedule.map((day) => {
        if (day.day !== dayName) return day

        const nextActive = !day.active

        return {
          ...day,
          active: nextActive,
          start: nextActive && day.start === 'Libre' ? '10:00' : day.start,
          end: nextActive && day.end === 'Libre' ? '18:00' : day.end,
          blocks: nextActive && day.blocks.length === 0
            ? [{ id: `${day.day}-block-${Date.now()}`, start: '14:00', end: '15:00' }]
            : day.blocks,
        }
      }),
    }))
  }, [])

  const cancelScheduleDay = useCallback((dayName) => {
    setAgendaSettings((currentSettings) => ({
      ...currentSettings,
      schedule: currentSettings.schedule.map((day) =>
        day.day === dayName
          ? { ...day, active: false, blocks: [] }
          : day,
      ),
    }))
  }, [])

  const updateScheduleDayTime = useCallback((dayName, field, value) => {
    setAgendaSettings((currentSettings) => ({
      ...currentSettings,
      schedule: currentSettings.schedule.map((day) =>
        day.day === dayName ? { ...day, [field]: value } : day,
      ),
    }))
  }, [])

  const addScheduleBlock = useCallback((dayName) => {
    setAgendaSettings((currentSettings) => ({
      ...currentSettings,
      schedule: currentSettings.schedule.map((day) =>
        day.day === dayName
          ? {
              ...day,
              blocks: [
                ...day.blocks,
                { id: `${day.day}-block-${Date.now()}`, start: '16:00', end: '16:30' },
              ],
            }
          : day,
      ),
    }))
  }, [])

  const updateScheduleBlock = useCallback((dayName, blockId, field, value) => {
    setAgendaSettings((currentSettings) => ({
      ...currentSettings,
      schedule: currentSettings.schedule.map((day) =>
        day.day === dayName
          ? {
              ...day,
              blocks: day.blocks.map((block) =>
                block.id === blockId ? { ...block, [field]: value } : block,
              ),
            }
          : day,
      ),
    }))
  }, [])

  const addBlockedDate = useCallback((dateValue) => {
    if (!dateValue) return

    setAgendaSettings((currentSettings) => {
      if (currentSettings.blockedDates.some((date) => date.id === dateValue)) {
        return currentSettings
      }

      return {
        ...currentSettings,
        blockedDates: [
          ...currentSettings.blockedDates,
          { id: dateValue, label: formatBlockedDate(dateValue) },
        ],
      }
    })
  }, [])

  const removeBlockedDate = useCallback((dateId) => {
    setAgendaSettings((currentSettings) => ({
      ...currentSettings,
      blockedDates: currentSettings.blockedDates.filter((date) => date.id !== dateId),
    }))
  }, [])

  const updateAgendaRule = useCallback((field, value) => {
    setAgendaSettings((currentSettings) => ({
      ...currentSettings,
      [field]: Number(value),
    }))
  }, [])

  const toggleManagedArtistStatus = useCallback(async (artistId) => {
    if (session.isMockSession) {
      setAdminState((currentState) => ({
        ...currentState,
        artists: currentState.artists.map((artist) =>
          artist.id === artistId
            ? { ...artist, status: artist.status === 'Activo' ? 'Inactivo' : 'Activo' }
            : artist,
        ),
      }))
      return null
    }

    const currentArtist = adminState.artists.find((artist) => artist.id === artistId)
    if (!currentArtist) return null

    setAdminArtistsError('')

    try {
      const savedArtist = currentArtist.status === 'Activo'
        ? await deactivateAdminArtist(artistId)
        : await activateAdminArtist(artistId)

      if (!savedArtist) return null

      setAdminState((currentState) => ({
        ...currentState,
        artists: currentState.artists.map((artist) =>
          artist.id === artistId ? { ...artist, ...savedArtist } : artist,
        ),
      }))

      return savedArtist
    } catch (error) {
      setAdminArtistsError(error.message || 'No se pudo actualizar el estado del artista.')
      return null
    }
  }, [adminState.artists, session.isMockSession])

  const updateManagedArtistProfile = useCallback(async (artistId, updates) => {
    if (session.isMockSession) {
      setAdminState((currentState) => ({
        ...currentState,
        artists: currentState.artists.map((artist) =>
          artist.id === artistId ? { ...artist, ...updates } : artist,
        ),
      }))
      return updates
    }

    setAdminArtistsError('')

    try {
      const savedArtist = await updateAdminArtistProfile(artistId, updates)

      if (!savedArtist) return null

      setAdminState((currentState) => ({
        ...currentState,
        artists: currentState.artists.map((artist) =>
          artist.id === artistId ? { ...artist, ...savedArtist } : artist,
        ),
      }))

      return savedArtist
    } catch (error) {
      setAdminArtistsError(error.message || 'No se pudo guardar el perfil del artista.')
      return null
    }
  }, [session.isMockSession])

  const updateManagedStudioProfile = useCallback((studioId, updates) => {
    setAdminState((currentState) => ({
      ...currentState,
      studios: currentState.studios.map((studio) =>
        studio.id === studioId ? { ...studio, ...updates } : studio,
      ),
    }))
  }, [])

  const toggleManagedClientStatus = useCallback(async (clientId) => {
    if (session.isMockSession) {
      setAdminState((currentState) => ({
        ...currentState,
        clients: currentState.clients.map((client) =>
          client.id === clientId
            ? { ...client, status: client.status === 'Activo' ? 'Inactivo' : 'Activo' }
            : client,
        ),
      }))
      return null
    }

    const currentClient = adminState.clients.find((client) => client.id === clientId)
    if (!currentClient) return null

    setAdminClientsError('')

    try {
      const savedClient = currentClient.status === 'Activo'
        ? await deactivateAdminClient(clientId)
        : await activateAdminClient(clientId)

      if (!savedClient) return null

      setAdminState((currentState) => ({
        ...currentState,
        clients: currentState.clients.map((client) =>
          client.id === clientId ? savedClient : client,
        ),
      }))

      return savedClient
    } catch (error) {
      setAdminClientsError(error.message || 'No se pudo actualizar el estado del cliente.')
      return null
    }
  }, [adminState.clients, session.isMockSession])

  const updateManagedClientProfile = useCallback(async (clientId, updates) => {
    if (session.isMockSession) {
      setAdminState((currentState) => ({
        ...currentState,
        clients: currentState.clients.map((client) =>
          client.id === clientId ? { ...client, ...updates } : client,
        ),
      }))
      return null
    }

    setAdminClientsError('')

    try {
      const savedClient = await updateAdminClientProfile(clientId, updates)
      if (!savedClient) return null

      setAdminState((currentState) => ({
        ...currentState,
        clients: currentState.clients.map((client) =>
          client.id === clientId ? savedClient : client,
        ),
      }))

      return savedClient
    } catch (error) {
      setAdminClientsError(error.message || 'No se pudo actualizar el perfil del cliente.')
      return null
    }
  }, [session.isMockSession])

  const getAvailableSlots = useCallback(
    ({ artistId, studioId = null, membershipId = null, date, durationMinutes = 60 }) => {
      if (!artistId || !date) return []

      const artistStudioMemberships = deriveMembershipsFromLegacyData({ artists: adminState.artists })
      const bookingArtist = adminState.artists.find((artist) => artist.id === artistId)
      const bookingStudio = studioId
        ? adminState.studios.find((studio) => studio.id === studioId)
        : getStudioForArtist({
          artistId,
          studios: adminState.studios,
          artistStudioMemberships,
        })

      if (bookingArtist && bookingArtist.status !== 'Activo') return []
      if (bookingArtist && !canUseOperationalFeature(bookingStudio || bookingArtist, 'publicAgenda')) return []

      const isBlockedDate = agendaSettings.blockedDates.some((blockedDate) => blockedDate.id === date)
      if (isBlockedDate) return []

      const day = agendaSettings.schedule[getScheduleIndex(date)]
      if (!day || !day.active) return []

      const start = timeToMinutes(day.start)
      const end = timeToMinutes(day.end)
      const interval = Number(agendaSettings.intervalMinutes) || 15
      const duration = Number(durationMinutes) || 60

      if (start === null || end === null || start >= end) return []

      const now = new Date()
      const sameDate = isSameDate(date, now)
      const minStartToday = now.getHours() * 60 + now.getMinutes() + ((Number(agendaSettings.minAdvanceHours) || 0) * 60)
      const slots = []

      for (let current = start; current + duration <= end; current += interval) {
        const slotEnd = current + duration
        const time = minutesToTime(current)
        const booked = agendaSettings.bookedSlots.some((slot) => (
          slot.artistId === artistId
          && slot.date === date
          && slot.time === time
        ))
        const blockedByTime = overlapsBlockedTime(current, slotEnd, day.blocks)
        const blockedByAdvance = sameDate && current < minStartToday

        if (blockedByTime || blockedByAdvance) continue

        slots.push({
          artistId,
          studioId: bookingStudio?.id || studioId || null,
          membershipId: membershipId || null,
          date,
          time,
          end: minutesToTime(slotEnd),
          available: !booked,
          status: booked ? 'Ocupado' : 'Disponible',
        })
      }

      return slots
    },
    [agendaSettings, adminState.artists, adminState.studios],
  )

  const bookSlot = useCallback((slot) => {
    if (!slot.artistId) {
      window.alert('Selecciona una artista para reservar.')
      return
    }

    const slotWithClient = {
      ...slot,
      studioId: slot.studioId || null,
      membershipId: slot.membershipId || null,
      clientId: slot.clientId || (session.role === ROLES.CLIENT ? clientState.profile?.id : ''),
    }

    const duplicateClientServiceBooking = hasDuplicateClientServiceBooking(
      agendaSettings.bookedSlots,
      slotWithClient,
    )

    if (duplicateClientServiceBooking) {
      window.alert('Ya tienes una cita agendada para este servicio con esta artista en la fecha seleccionada.')
      return
    }

    setAgendaSettings((currentSettings) => {
      const alreadyBooked = currentSettings.bookedSlots.some(
        (bookedSlot) => (
          bookedSlot.artistId === slotWithClient.artistId
          && bookedSlot.date === slotWithClient.date
          && bookedSlot.time === slotWithClient.time
        ),
      )

      if (alreadyBooked) return currentSettings

      return {
        ...currentSettings,
        bookedSlots: [...currentSettings.bookedSlots, slotWithClient],
      }
    })
  }, [agendaSettings.bookedSlots, clientState.profile?.id, session.role])

  const resetBookedSlots = useCallback(() => {
    setAgendaSettings((currentSettings) => ({
      ...currentSettings,
      bookedSlots: [],
    }))
  }, [])

  const clearBlockedDates = useCallback(() => {
    setAgendaSettings((currentSettings) => ({
      ...currentSettings,
      blockedDates: [],
    }))
  }, [])

  const releaseAgenda = useCallback(() => {
    setAgendaSettings((currentSettings) => ({
      ...currentSettings,
      schedule: currentSettings.schedule.map((day) => ({
        ...day,
        active: true,
        start: day.start === 'Libre' ? '10:00' : day.start,
        end: day.end === 'Libre' ? '18:00' : day.end,
        blocks: [],
      })),
      blockedDates: [],
      bookedSlots: [],
    }))
  }, [])

  const blockTuesdays = useCallback(() => {
    setAgendaSettings((currentSettings) => ({
      ...currentSettings,
      schedule: currentSettings.schedule.map((day) =>
        day.day === 'Martes'
          ? { ...day, active: false, blocks: [] }
          : day,
      ),
    }))
  }, [])

  const setPrimaryArtistStatus = useCallback((status, artistId) => {
    setAdminState((currentState) => ({
      ...currentState,
      artists: currentState.artists.map((artist, index) => {
        const targetArtistId = artistId || currentState.artists[0]?.id
        return artist.id === targetArtistId || (!targetArtistId && index === 0)
          ? { ...artist, status }
          : artist
      }),
    }))
  }, [])

  const addMockBooking = useCallback(() => {
    const mockSlot = {
      date: '2026-05-18',
      studioId: null,
      time: '10:00',
      end: '11:10',
      artist: 'Artista Demo',
      service: 'Lash lifting',
      durationMinutes: 70,
    }

    setAgendaSettings((currentSettings) => {
      const alreadyBooked = currentSettings.bookedSlots.some(
        (bookedSlot) => bookedSlot.date === mockSlot.date && bookedSlot.time === mockSlot.time,
      )

      if (alreadyBooked) return currentSettings

      return {
        ...currentSettings,
        bookedSlots: [...currentSettings.bookedSlots, mockSlot],
      }
    })
  }, [])

  const toggleFavoriteArtist = useCallback((artistId) => {
    setClientState((currentState) => {
      const isFavorite = currentState.favoriteArtistIds.includes(artistId)

      return {
        ...currentState,
        favoriteArtistIds: isFavorite
          ? currentState.favoriteArtistIds.filter((favoriteId) => favoriteId !== artistId)
          : [...currentState.favoriteArtistIds, artistId],
      }
    })
  }, [])

  const updateClientProfile = useCallback((updates) => {
    setClientState((currentState) => ({
      ...currentState,
      profile: {
        ...currentState.profile,
        ...updates,
      },
    }))
  }, [])

  const saveArtistService = useCallback(async (service) => {
    const artistId = session.artist?.id || session.user?.artistId
    if (!artistId || session.isMockSession) {
      const localService = {
        ...service,
        id: service.id || `artist-service-${Date.now()}`,
        status: service.status || 'Activo',
      }

      setArtistState((currentState) => ({
        ...currentState,
        services: service.id
          ? currentState.services.map((item) => (item.id === service.id ? localService : item))
          : [localService, ...currentState.services],
      }))

      return localService
    }

    setArtistServicesError('')
    const savedService = await saveArtistServiceOffering({ artistId, service })
    setArtistState((currentState) => ({
      ...currentState,
      services: service.id
        ? currentState.services.map((item) => (item.id === service.id ? savedService : item))
        : [savedService, ...currentState.services],
    }))
    return savedService
  }, [session.artist?.id, session.isMockSession, session.user?.artistId])

  const updateArtistServiceStatus = useCallback(async (serviceId, status) => {
    if (session.isMockSession) {
      setArtistState((currentState) => ({
        ...currentState,
        services: currentState.services.map((service) =>
          service.id === serviceId ? { ...service, status } : service,
        ),
      }))
      return null
    }

    setArtistServicesError('')
    const updatedService = await updateArtistServiceOfferingStatus({ serviceId, status })
    setArtistState((currentState) => ({
      ...currentState,
      services: currentState.services.map((service) =>
        service.id === serviceId ? updatedService : service,
      ),
    }))
    return updatedService
  }, [session.isMockSession])

  const archiveArtistService = useCallback(async (serviceId) => {
    if (session.isMockSession) {
      setArtistState((currentState) => ({
        ...currentState,
        services: currentState.services.filter((service) => service.id !== serviceId),
      }))
      return
    }

    setArtistServicesError('')
    await archiveArtistServiceOffering({ serviceId })
    setArtistState((currentState) => ({
      ...currentState,
      services: currentState.services.filter((service) => service.id !== serviceId),
    }))
  }, [session.isMockSession])

  const addArtistClient = useCallback((client) => {
    setArtistState((currentState) => ({
      ...currentState,
      clients: [
        ...currentState.clients,
        {
          ...client,
          id: client.id || `artist-client-${Date.now()}`,
          studioId: client.studioId || null,
          history: client.history || [],
        },
      ],
    }))
  }, [])

  const updateArtistClient = useCallback((clientId, updates) => {
    setArtistState((currentState) => ({
      ...currentState,
      clients: currentState.clients.map((client) =>
        client.id === clientId ? { ...client, ...updates } : client,
      ),
    }))
  }, [])

  const updateArtistProfile = useCallback((updates) => {
    setArtistState((currentState) => ({
      ...currentState,
      profile: {
        ...currentState.profile,
        ...updates,
        registration: {
          ...currentState.profile.registration,
          ...updates.registration,
        },
        personalInfo: {
          ...currentState.profile.personalInfo,
          ...updates.personalInfo,
        },
        professionalProfile: {
          ...currentState.profile.professionalProfile,
          ...updates.professionalProfile,
          paymentMethods: {
            ...currentState.profile.professionalProfile?.paymentMethods,
            ...updates.professionalProfile?.paymentMethods,
          },
        },
        contactLinks: {
          ...currentState.profile.contactLinks,
          ...updates.contactLinks,
        },
        security: {
          ...currentState.profile.security,
          ...updates.security,
        },
        portfolio: Array.isArray(updates.portfolio)
          ? updates.portfolio.slice(0, 12)
          : currentState.profile.portfolio,
        professionalLocation: createArtistLocationSettings(
          updates.professionalLocation || currentState.profile.professionalLocation,
        ),
      },
    }))
  }, [])

  const saveArtistProfile = useCallback(async (profile) => {
    const artistId = session.artist?.id || session.user?.artistId
    const profileId = session.profile?.id || session.user?.profileId

    if (!artistId || session.isMockSession) {
      updateArtistProfile(profile)
      return profile
    }

    setIsArtistProfileSaving(true)
    setArtistProfileError('')

    try {
      const savedArtistProfile = await saveArtistProfileRecord({
        artistId,
        profileId,
        profile,
      })
      const nextProfileContext = {
        ...session.profile,
        phone: profile.personalInfo?.phone || session.profile?.phone || '',
      }
      const nextArtistContext = {
        ...session.artist,
        display_name: savedArtistProfile.artistic_name || session.artist?.display_name,
      }
      const mappedProfile = mapAuthContextToArtistProfile({
        profile: nextProfileContext,
        artist: nextArtistContext,
        artistProfile: savedArtistProfile,
      }, profile)

      setArtistState((currentState) => ({
        ...currentState,
        profile: {
          ...currentState.profile,
          ...mappedProfile,
        },
      }))
      setSession((currentSession) => ({
        ...currentSession,
        profile: currentSession.profile
          ? {
              ...currentSession.profile,
              phone: nextProfileContext.phone,
            }
          : currentSession.profile,
        artist: currentSession.artist
          ? {
              ...currentSession.artist,
              display_name: nextArtistContext.display_name,
            }
          : currentSession.artist,
        user: currentSession.user
          ? {
              ...currentSession.user,
              phone: nextProfileContext.phone,
            }
          : currentSession.user,
      }))
      setIsArtistProfileSaving(false)
      return mappedProfile
    } catch (error) {
      setArtistProfileError(error.message || 'No se pudo guardar el perfil artista.')
      setIsArtistProfileSaving(false)
      throw error
    }
  }, [session.artist, session.isMockSession, session.profile, session.user, updateArtistProfile])

  const addArtistAppointment = useCallback((appointment) => {
    if (!appointment.artistId) return

    setArtistState((currentState) => ({
      ...currentState,
      appointments: [
        {
          ...appointment,
          artistId: appointment.artistId,
          studioId: appointment.studioId || null,
          membershipId: appointment.membershipId || null,
          id: `artist-appointment-${Date.now()}`,
          type: 'appointment',
          status: appointment.status || 'Confirmada',
        },
        ...currentState.appointments,
      ],
    }))
  }, [])

  const value = useMemo(
    () => ({
      session,
      setSession,
      login: loginDemo,
      loginDemo,
      loginWithPassword,
      registerClient,
      registerArtist,
      logout,
      resetPassword,
      updatePassword,
      isAuthenticated: Boolean(session.user),
      isAuthLoading,
      authError,
      isMockSession: Boolean(session.isMockSession),
      agendaSettings,
      adminState,
      clientState,
      artistState,
      artistServices: artistState.services || [],
      isArtistServicesLoading,
      artistServicesError,
      isArtistProfileSaving,
      artistProfileError,
      isAdminArtistsLoading,
      adminArtistsError,
      isAdminDashboardLoading,
      adminDashboardError,
      isAdminClientsLoading,
      adminClientsError,
      toggleScheduleDay,
      cancelScheduleDay,
      updateScheduleDayTime,
      addScheduleBlock,
      updateScheduleBlock,
      addBlockedDate,
      removeBlockedDate,
      updateAgendaRule,
      toggleManagedArtistStatus,
      updateManagedArtistProfile,
      updateManagedStudioProfile,
      toggleManagedClientStatus,
      updateManagedClientProfile,
      getAvailableSlots,
      bookSlot,
      resetBookedSlots,
      clearBlockedDates,
      releaseAgenda,
      blockTuesdays,
      setPrimaryArtistStatus,
      addMockBooking,
      toggleFavoriteArtist,
      updateClientProfile,
      loadAdminDashboard,
      loadAdminArtists,
      loadAdminClients,
      loadArtistServices,
      saveArtistService,
      updateArtistServiceStatus,
      archiveArtistService,
      addArtistClient,
      updateArtistClient,
      updateArtistProfile,
      saveArtistProfile,
      addArtistAppointment,
      selectedDate,
      setSelectedDate,
    }),
    [
      session,
      loginDemo,
      loginWithPassword,
      registerClient,
      registerArtist,
      logout,
      resetPassword,
      updatePassword,
      isAuthLoading,
      authError,
      agendaSettings,
      adminState,
      clientState,
      artistState,
      isArtistServicesLoading,
      artistServicesError,
      isArtistProfileSaving,
      artistProfileError,
      isAdminArtistsLoading,
      adminArtistsError,
      isAdminDashboardLoading,
      adminDashboardError,
      isAdminClientsLoading,
      adminClientsError,
      toggleScheduleDay,
      cancelScheduleDay,
      updateScheduleDayTime,
      addScheduleBlock,
      updateScheduleBlock,
      addBlockedDate,
      removeBlockedDate,
      updateAgendaRule,
      toggleManagedArtistStatus,
      updateManagedArtistProfile,
      updateManagedStudioProfile,
      toggleManagedClientStatus,
      updateManagedClientProfile,
      getAvailableSlots,
      bookSlot,
      resetBookedSlots,
      clearBlockedDates,
      releaseAgenda,
      blockTuesdays,
      setPrimaryArtistStatus,
      addMockBooking,
      toggleFavoriteArtist,
      updateClientProfile,
      loadAdminDashboard,
      loadAdminArtists,
      loadAdminClients,
      loadArtistServices,
      saveArtistService,
      updateArtistServiceStatus,
      archiveArtistService,
      addArtistClient,
      updateArtistClient,
      updateArtistProfile,
      saveArtistProfile,
      addArtistAppointment,
      selectedDate,
      setSelectedDate,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
