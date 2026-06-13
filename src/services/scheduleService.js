import { requireSupabase } from '../lib/supabaseClient'

const WEEKDAYS = [
  { weekday: 1, day: 'Lunes' },
  { weekday: 2, day: 'Martes' },
  { weekday: 3, day: 'Miercoles' },
  { weekday: 4, day: 'Jueves' },
  { weekday: 5, day: 'Viernes' },
  { weekday: 6, day: 'Sabado' },
  { weekday: 0, day: 'Domingo' },
]

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function timeValue(value, fallback = '10:00') {
  if (!value) return fallback
  return String(value).slice(0, 5)
}

function normalizeRule(rule = {}) {
  const weekday = Number(rule.weekday)
  const active = Boolean(rule.isActive ?? rule.is_active)
  const day = WEEKDAYS.find((item) => item.weekday === weekday)?.day || `Dia ${weekday}`
  const breakStart = timeValue(rule.breakStartTime || rule.break_start_time, '')
  const breakEnd = timeValue(rule.breakEndTime || rule.break_end_time, '')

  return {
    day,
    weekday,
    active,
    start: active ? timeValue(rule.startTime || rule.start_time) : 'Libre',
    end: active ? timeValue(rule.endTime || rule.end_time, '18:00') : 'Libre',
    breakStart: breakStart || '-',
    breakEnd: breakEnd || '-',
    blocks: active && breakStart && breakEnd
      ? [{ id: `${day}-break`, start: breakStart, end: breakEnd }]
      : [],
  }
}

function normalizeBlockedDate(blockedDate = {}) {
  const id = blockedDate.id || blockedDate.date || ''

  return {
    ...blockedDate,
    id,
    label: blockedDate.label || id,
  }
}

function normalizeSchedulePayload(data = {}) {
  const rulesByWeekday = Object.fromEntries(
    asArray(data.schedule).map((rule) => [Number(rule.weekday), normalizeRule(rule)]),
  )

  return {
    scheduleId: data.scheduleId || data.schedule_id || null,
    artistId: data.artistId || data.artist_id || null,
    source: data.source || 'supabase',
    timezone: data.timezone || 'America/Mexico_City',
    intervalMinutes: Number(data.intervalMinutes ?? data.interval_minutes ?? 15),
    minAdvanceHours: Number(data.minAdvanceHours ?? data.min_advance_hours ?? 2),
    schedule: WEEKDAYS.map((day) => rulesByWeekday[day.weekday] || {
      ...day,
      active: false,
      start: 'Libre',
      end: 'Libre',
      breakStart: '-',
      breakEnd: '-',
      blocks: [],
    }),
    blockedDates: asArray(data.blockedDates || data.blocked_dates).map(normalizeBlockedDate),
    availabilitySlotCount: Number(data.availabilitySlotCount ?? data.availability_slot_count ?? 0),
    availabilitySlotsGenerated: Number(data.availabilitySlotsGenerated ?? data.availability_slots_generated ?? 0),
    availabilitySlotsDeleted: Number(data.availabilitySlotsDeleted ?? data.availability_slots_deleted ?? 0),
  }
}

function schedulePayloadFromAgendaSettings(agendaSettings = {}) {
  return {
    timezone: agendaSettings.timezone || 'America/Mexico_City',
    intervalMinutes: Number(agendaSettings.intervalMinutes) || 15,
    minAdvanceHours: Number(agendaSettings.minAdvanceHours) || 2,
    schedule: asArray(agendaSettings.schedule).map((day) => ({
      day: day.day,
      weekday: day.weekday,
      active: Boolean(day.active),
      start: day.start,
      end: day.end,
      blocks: asArray(day.blocks).map((block) => ({
        id: block.id,
        start: block.start,
        end: block.end,
      })),
    })),
    blockedDates: asArray(agendaSettings.blockedDates).map((date) => ({
      id: date.id,
      label: date.label,
    })),
  }
}

export async function fetchArtistScheduleSettings() {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_artist_get_schedule_settings')

  if (error) throw error

  return normalizeSchedulePayload(data)
}

export async function saveArtistScheduleSettings(agendaSettings) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_artist_save_schedule_settings', {
    p_payload: schedulePayloadFromAgendaSettings(agendaSettings),
  })

  if (error) throw error

  return normalizeSchedulePayload(data)
}
