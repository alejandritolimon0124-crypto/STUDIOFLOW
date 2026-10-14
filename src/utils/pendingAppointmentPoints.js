export function pendingAppointmentPoints(appointments = [], now = Date.now()) {
  return (appointments || []).filter((appointment) => {
    const status = String(appointment.appointmentStatus || appointment.appointment_status || '').toLowerCase()
    const end = Date.parse(appointment.endsAt || appointment.ends_at || '')
    return status === 'scheduled' && Number.isFinite(end) && end <= now
  })
}
