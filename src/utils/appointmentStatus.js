export function getAppointmentStatusTone(appointmentOrStatus = '') {
  if (
    typeof appointmentOrStatus === 'object'
    && appointmentOrStatus
    && String(appointmentOrStatus.appointmentStatus || appointmentOrStatus.appointment_status || '').toLowerCase() === 'scheduled'
  ) {
    if (appointmentOrStatus.clientConfirmedAt || appointmentOrStatus.client_confirmed_at) return 'success'
    if (appointmentOrStatus.confirmationRequestedAt || appointmentOrStatus.confirmation_requested_at) return 'warm'
    return 'neutral'
  }

  const rawStatus = typeof appointmentOrStatus === 'string'
    ? appointmentOrStatus
    : appointmentOrStatus?.appointmentStatus || appointmentOrStatus?.appointment_status || appointmentOrStatus?.status || ''
  const normalizedStatus = String(rawStatus || '').toLowerCase()

  if (['cancelled', 'canceled', 'cancelada', 'cancelado', 'no_show', 'no show'].some((status) => normalizedStatus.includes(status))) {
    return 'danger'
  }

  if (['scheduled', 'confirmada', 'confirmado', 'confirmed', 'completada', 'completed'].some((status) => normalizedStatus.includes(status))) {
    return 'success'
  }

  if (['pending', 'pendiente', 'disputed', 'revision'].some((status) => normalizedStatus.includes(status))) {
    return 'warm'
  }

  return 'neutral'
}
