import { useCallback, useMemo, useState } from 'react'
import { AppContext } from './appContextCore'
import { artistAppointments, clientHistory, managedArtists, managedClients, recurringClients, weeklySchedule } from '../services/mockData'

const initialSession = {
  user: null,
  role: null,
}

const storageKey = 'studio-flow-session'

function getStoredSession() {
  try {
    const storedSession = localStorage.getItem(storageKey)
    return storedSession ? JSON.parse(storedSession) : initialSession
  } catch {
    return initialSession
  }
}

const mockUsers = {
  client: { id: 'client-demo', name: 'Mariana Lopez', role: 'client' },
  artist: { id: 'artist-demo', name: 'Valeria Moon', role: 'artist' },
  admin: { id: 'admin-demo', name: 'Studio Flow HQ', role: 'admin' },
}

const initialBlockedDates = [
  { id: '2026-05-20', label: '20 mayo / Capacitacion' },
  { id: '2026-05-25', label: '25 mayo / Dia libre' },
  { id: '2026-06-02', label: '02 junio / Evento privado' },
]

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
    artists: managedArtists.map((artist, index) => ({
      ...artist,
      id: `artist-${index + 1}`,
      description: artist.description || 'Perfil profesional beauty listo para recibir reservas.',
      services: artist.services || 'Lashes, brows, makeup',
    })),
    clients: managedClients.map((client, index) => ({
      ...client,
      id: `client-${index + 1}`,
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
      name: 'Mariana Lopez',
      email: 'mariana.lopez@studioflow.demo',
      phone: '55 0000 0000',
      notes: 'Clienta premium Studio Flow.',
    },
    favoriteArtistIds: ['artist-1', 'artist-3'],
  }
}

function createInitialArtistState() {
  return {
    appointments: artistAppointments.map((appointment, index) => ({
      ...appointment,
      id: `artist-appointment-${index + 1}`,
      date: index < 3 ? '2026-05-18' : '2026-05-10',
      status: index < 3 ? appointment.status : 'Completada',
    })),
    clients: recurringClients.map((client, index) => ({
      ...client,
      id: `artist-client-${index + 1}`,
      phone: `55 100${index} 20${index}0`,
      email: `${client.name.toLowerCase().replaceAll(' ', '.').replace('.', '')}@studioflow.demo`,
      history: [
        { service: 'Lash lifting', date: '2026-04-28', status: 'Completada' },
        { service: 'Brow design', date: '2026-04-10', status: 'Completada' },
      ],
    })),
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

export function AppProvider({ children }) {
  const [session, setSession] = useState(getStoredSession)
  const [agendaSettings, setAgendaSettings] = useState(createInitialAgendaSettings)
  const [adminState, setAdminState] = useState(createInitialAdminState)
  const [clientState, setClientState] = useState(createInitialClientState)
  const [artistState, setArtistState] = useState(createInitialArtistState)

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
      if (primaryArtist && primaryArtist.status !== 'Activo') return []

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
    [agendaSettings, adminState.artists],
  )

  const bookSlot = useCallback((slot) => {
    setAgendaSettings((currentSettings) => {
      const alreadyBooked = currentSettings.bookedSlots.some(
        (bookedSlot) => bookedSlot.date === slot.date && bookedSlot.time === slot.time,
      )

      if (alreadyBooked) return currentSettings

      return {
        ...currentSettings,
        bookedSlots: [...currentSettings.bookedSlots, slot],
      }
    })
  }, [])

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

  const addArtistAppointment = useCallback((appointment) => {
    setArtistState((currentState) => ({
      ...currentState,
      appointments: [
        {
          ...appointment,
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
      addArtistAppointment,
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
      addArtistAppointment,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
