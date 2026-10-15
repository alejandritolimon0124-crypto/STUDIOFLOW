export const CHANGE_NOTICE_OPTIONS = [2, 4, 6, 12, 24]

export function canClientChangeAppointment(appointment, now = Date.now()) {
  if (!appointment?.startsAt || appointment.appointmentStatus !== 'scheduled') return false
  const start = new Date(appointment.startsAt).getTime()
  const hours = Number(appointment.clientChangeNoticeHours) || 2
  return Number.isFinite(start) && Number(now) <= start - hours * 60 * 60_000
}
