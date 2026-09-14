export function hasCurrentAttendanceConfirmation(appointment = {}) {
  const confirmed = Date.parse(appointment.clientConfirmedAt || appointment.client_confirmed_at || '')
  const requested = Date.parse(appointment.confirmationRequestedAt || appointment.confirmation_requested_at || '')
  return Number.isFinite(confirmed) && (!Number.isFinite(requested) || confirmed >= requested)
}
