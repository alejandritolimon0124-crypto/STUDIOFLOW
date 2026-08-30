export function getAppointmentStatusTone(appointmentOrStatus = '') {
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
