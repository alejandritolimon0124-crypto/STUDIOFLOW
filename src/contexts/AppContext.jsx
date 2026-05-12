import { useCallback, useMemo, useState } from 'react'
import { AppContext } from './appContextCore'
import { weeklySchedule } from '../services/mockData'

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

  const getAvailableSlots = useCallback(
    ({ date, durationMinutes = 60 }) => {
      if (!date) return []

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
    [agendaSettings],
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

  const value = useMemo(
    () => ({
      session,
      setSession,
      login,
      logout,
      isAuthenticated: Boolean(session.user),
      agendaSettings,
      toggleScheduleDay,
      cancelScheduleDay,
      updateScheduleDayTime,
      addScheduleBlock,
      updateScheduleBlock,
      addBlockedDate,
      removeBlockedDate,
      updateAgendaRule,
      getAvailableSlots,
      bookSlot,
    }),
    [
      session,
      agendaSettings,
      toggleScheduleDay,
      cancelScheduleDay,
      updateScheduleDayTime,
      addScheduleBlock,
      updateScheduleBlock,
      addBlockedDate,
      removeBlockedDate,
      updateAgendaRule,
      getAvailableSlots,
      bookSlot,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
