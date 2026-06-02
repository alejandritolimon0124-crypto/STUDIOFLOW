import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppContext } from './appContextCore'
import { artistAppointments, artistClients, clientHistory, managedArtists, managedClients, studios, users, weeklySchedule } from '../services/mockData'
import { canUseOperationalFeature, getDefaultStudioStatus } from '../modules/governance/studioGovernance'
import { ROLES } from '../modules/permissions/rolePermissions'
import { createArtistLocationSettings, createProfessionalLocation } from '../utils/locationHelpers'

const initialSession = {
  user: null,
  role: null,
}

const storageKey = 'studio-flow-session'
const adminStateStorageKey = 'studio-flow-admin-state'
const clientStateStorageKey = 'studio-flow-client-state'
const artistStateStorageKey = 'studio-flow-artist-state'

function getStoredSession() {
  try {
    const storedSession = localStorage.getItem(storageKey)
    return storedSession ? JSON.parse(storedSession) : initialSession
  } catch {
    return initialSession
  }
}

const mockUsers = {
  client: users.find((user) => user.role === ROLES.CLIENT) || { id: 'client-demo', name: 'Mariana Lopez', role: ROLES.CLIENT, studioId: 'studio-glow' },
  artist: users.find((user) => user.role === ROLES.ARTIST) || { id: 'artist-demo', name: 'Valeria Moon', role: ROLES.ARTIST, studioId: 'studio-glow' },
  admin: users.find((user) => user.role === ROLES.PLATFORM_OWNER) || { id: 'admin-demo', name: 'Studio Flow HQ', role: ROLES.PLATFORM_OWNER, studioId: null },
  studio_owner: users.find((user) => user.role === ROLES.STUDIO_OWNER) || { id: 'studio-owner-demo', name: 'Valeria Moon', role: ROLES.STUDIO_OWNER, studioId: 'studio-glow' },
  studio_manager: users.find((user) => user.role === ROLES.STUDIO_MANAGER) || { id: 'studio-manager-demo', name: 'Lucia Manager', role: ROLES.STUDIO_MANAGER, studioId: 'studio-glow' },
}

const initialBlockedDates = [
  { id: '2026-05-20', label: '20 mayo / Capacitacion' },
  { id: '2026-05-25', label: '25 mayo / Dia libre' },
  { id: '2026-06-02', label: '02 junio / Evento privado' },
]

function createArtistProfessionalProfile(overrides = {}) {
  return {
    personalInfo: {
      fullName: 'Valeria Moon',
      phone: '55 0000 0000',
      email: 'valeria@studioflow.mx',
      ...(overrides.personalInfo || {}),
    },
    professionalProfile: {
      primarySpecialty: 'Lash lifting y brow design',
      shortBio: '',
      experienceYears: '',
      ...(overrides.professionalProfile || {}),
    },
    contactLinks: {
      whatsapp: '',
      instagram: '',
      facebook: '',
      ...(overrides.contactLinks || {}),
    },
    security: {
      email: overrides.security?.email || overrides.personalInfo?.email || 'valeria@studioflow.mx',
      password: overrides.security?.password || '',
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
  return {
    studios: studios.map((studio) => ({
      ...studio,
      profile: createStudioProfessionalProfile(studio, studio.profile),
      professionalLocation: createProfessionalLocation({
        businessName: studio.name,
        city: studio.city,
        ...(studio.professionalLocation || {}),
      }),
    })),
    users,
    artists: managedArtists.map((artist, index) => ({
      ...artist,
      id: `artist-${index + 1}`,
      studioId: artist.studioId || studios[index]?.id || 'studio-glow',
      studioStatus: artist.studioStatus || getDefaultStudioStatus(),
      description: artist.description || 'Perfil profesional beauty listo para recibir reservas.',
      services: artist.services || 'Lashes, brows, makeup',
      professionalLocation: createArtistLocationSettings(artist.professionalLocation),
    })),
    clients: managedClients.map((client, index) => ({
      ...client,
      id: `client-${index + 1}`,
      studioId: client.studioId || studios[index % studios.length]?.id || 'studio-glow',
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
    })),
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
              profile: createStudioProfessionalProfile(studio, storedStudio.profile),
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
      studioId: appointment.studioId || 'studio-glow',
      date: appointment.date || '2026-05-18',
      status: appointment.status || 'Confirmada',
    })),
    clients: artistClients.map((client) => ({
      ...client,
      history: client.history || [],
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
            professionalProfile: {
              ...initialArtistState.profile.professionalProfile,
              ...parsedArtistState.profile?.professionalProfile,
            },
            contactLinks: {
              ...initialArtistState.profile.contactLinks,
              ...parsedArtistState.profile?.contactLinks,
            },
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
  const [agendaSettings, setAgendaSettings] = useState(createInitialAgendaSettings)
  const [adminState, setAdminState] = useState(getStoredAdminState)
  const [clientState, setClientState] = useState(getStoredClientState)
  const [artistState, setArtistState] = useState(getStoredArtistState)
  const [selectedDate, setSelectedDate] = useState('2026-05-18')

  const login = (role) => {
    const nextSession = {
      user: mockUsers[role],
      role,
    }

    localStorage.setItem(storageKey, JSON.stringify(nextSession))
    setSession(nextSession)
  }

  const logout = () => {
    localStorage.removeItem(storageKey)
    setSession(initialSession)
  }

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

  const toggleManagedArtistStatus = useCallback((artistId) => {
    setAdminState((currentState) => ({
      ...currentState,
      artists: currentState.artists.map((artist) =>
        artist.id === artistId
          ? { ...artist, status: artist.status === 'Activo' ? 'Inactivo' : 'Activo' }
          : artist,
      ),
    }))
  }, [])

  const updateManagedArtistProfile = useCallback((artistId, updates) => {
    setAdminState((currentState) => ({
      ...currentState,
      artists: currentState.artists.map((artist) =>
        artist.id === artistId ? { ...artist, ...updates } : artist,
      ),
    }))
  }, [])

  const updateManagedStudioProfile = useCallback((studioId, updates) => {
    setAdminState((currentState) => ({
      ...currentState,
      studios: currentState.studios.map((studio) =>
        studio.id === studioId ? { ...studio, ...updates } : studio,
      ),
    }))
  }, [])

  const toggleManagedClientStatus = useCallback((clientId) => {
    setAdminState((currentState) => ({
      ...currentState,
      clients: currentState.clients.map((client) =>
        client.id === clientId
          ? { ...client, status: client.status === 'Activo' ? 'Inactivo' : 'Activo' }
          : client,
      ),
    }))
  }, [])

  const updateManagedClientProfile = useCallback((clientId, updates) => {
    setAdminState((currentState) => ({
      ...currentState,
      clients: currentState.clients.map((client) =>
        client.id === clientId ? { ...client, ...updates } : client,
      ),
    }))
  }, [])

  const getAvailableSlots = useCallback(
    ({ date, durationMinutes = 60 }) => {
      if (!date) return []

      const primaryArtist = adminState.artists.find((artist) => artist.owner === 'Valeria Moon')
      const primaryStudio = adminState.studios.find((studio) => studio.id === primaryArtist?.studioId)
      if (primaryArtist && primaryArtist.status !== 'Activo') return []
      if (primaryArtist && !canUseOperationalFeature(primaryStudio || primaryArtist, 'publicAgenda')) return []

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
        const booked = agendaSettings.bookedSlots.some((slot) => slot.date === date && slot.time === time)
        const blockedByTime = overlapsBlockedTime(current, slotEnd, day.blocks)
        const blockedByAdvance = sameDate && current < minStartToday

        if (blockedByTime || blockedByAdvance) continue

        slots.push({
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
    const slotWithClient = {
      ...slot,
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
        (bookedSlot) => bookedSlot.date === slotWithClient.date && bookedSlot.time === slotWithClient.time,
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

  const setPrimaryArtistStatus = useCallback((status) => {
    setAdminState((currentState) => ({
      ...currentState,
      artists: currentState.artists.map((artist) =>
        artist.owner === 'Valeria Moon' ? { ...artist, status } : artist,
      ),
    }))
  }, [])

  const addMockBooking = useCallback(() => {
    const mockSlot = {
      date: '2026-05-18',
      studioId: 'studio-glow',
      time: '10:00',
      end: '11:10',
      artist: 'Valeria Moon',
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

  const addArtistClient = useCallback((client) => {
    setArtistState((currentState) => ({
      ...currentState,
      clients: [
        ...currentState.clients,
        {
          ...client,
          id: client.id || `artist-client-${Date.now()}`,
          studioId: client.studioId || 'studio-glow',
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
      },
    }))
  }, [])

  const addArtistAppointment = useCallback((appointment) => {
    setArtistState((currentState) => ({
      ...currentState,
      appointments: [
        {
          ...appointment,
          studioId: appointment.studioId || 'studio-glow',
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
      login,
      logout,
      isAuthenticated: Boolean(session.user),
      agendaSettings,
      adminState,
      clientState,
      artistState,
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
      addArtistClient,
      updateArtistClient,
      updateArtistProfile,
      addArtistAppointment,
      selectedDate,
      setSelectedDate,
    }),
    [
      session,
      agendaSettings,
      adminState,
      clientState,
      artistState,
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
      addArtistClient,
      updateArtistClient,
      updateArtistProfile,
      addArtistAppointment,
      selectedDate,
      setSelectedDate,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
