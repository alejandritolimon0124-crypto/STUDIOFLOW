export function getHappyHourMinutes(startTime, endTime) {
  const toMinutes = (value) => {
    const match = /^(\d{1,2}):(\d{2})/.exec(String(value || ''))
    return match ? Number(match[1]) * 60 + Number(match[2]) : NaN
  }
  const start = toMinutes(startTime)
  const end = toMinutes(endTime)
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? end - start : 0
}

export function getServicesLongerThanHappyHour(services, startTime, endTime) {
  const minutes = getHappyHourMinutes(startTime, endTime)
  if (!minutes) return []
  return services.filter((service) => {
    const duration = Number.parseInt(String(service.durationMinutes ?? service.duration_minutes ?? service.duration ?? ''), 10)
    return Number.isFinite(duration) && duration > minutes && !['suspended', 'draft', 'archived', 'Suspendido', 'Borrador'].includes(service.status)
  })
}
