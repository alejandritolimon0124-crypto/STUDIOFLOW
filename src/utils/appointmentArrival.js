export function formatAppointmentArrival(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function canCheckInAppointment(appointment, now = new Date()) {
  if (!appointment?.id || appointment.appointmentStatus !== 'scheduled' || appointment.arrivedAt) return false
  const startsAt = new Date(appointment.startsAt)
  const endsAt = new Date(appointment.endsAt)
  return !Number.isNaN(startsAt.getTime()) && !Number.isNaN(endsAt.getTime())
    && now >= new Date(startsAt.getTime() - 90 * 60_000)
    && now <= new Date(endsAt.getTime() + 30 * 60_000)
}
