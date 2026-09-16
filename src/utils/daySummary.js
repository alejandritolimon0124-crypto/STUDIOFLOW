const minutes = (value) => {
  const match = /^(\d{2}):(\d{2})/.exec(String(value || ''))
  return match ? Number(match[1]) * 60 + Number(match[2]) : NaN
}

export function summarizeDay(appointments, settings, date) {
  const status = (item) => String(item.appointmentStatus || item.appointment_status || item.status || '').toLowerCase()
  const completed = appointments.filter((item) => ['completed', 'completada'].includes(status(item)))
  const cancelled = appointments.filter((item) => ['cancelled', 'cancelada'].includes(status(item)))
  const pending = appointments.filter((item) => ['scheduled', 'confirmada', 'pendiente', 'agendada'].includes(status(item)))
  const weekday = new Date(`${date}T12:00:00`).getDay()
  const rule = settings.schedule?.find((day) => Number(day.weekday) === weekday)
  const blocked = settings.blockedDates?.some((day) => (day.date || day.id) === date)
  const start = minutes(rule?.start)
  const end = minutes(rule?.end)
  const breaks = rule?.blocks || []
  const intervals = [...pending, ...completed].map((item) => {
    const begin = minutes(item.time)
    const duration = item.startsAt && item.endsAt
      ? (Date.parse(item.endsAt) - Date.parse(item.startsAt)) / 60000
      : parseInt(item.duration, 10)
    return [begin, begin + duration]
  })
  let available = 0
  let occupied = 0
  if (rule?.active && !blocked && Number.isFinite(start) && Number.isFinite(end)) {
    for (let minute = start; minute < end; minute++) {
      if (breaks.some((block) => minute >= minutes(block.start) && minute < minutes(block.end))) continue
      available++
      if (intervals.some(([from, to]) => minute >= from && minute < to)) occupied++
    }
  }
  const missingIncome = completed.some((item) => item.paymentDetails?.total == null || !Number.isFinite(Number(item.paymentDetails.total)))
  return {
    completed: completed.length, cancelled: cancelled.length, pending: pending.length,
    occupancy: available ? Math.round(occupied / available * 100) : null,
    income: missingIncome ? null : completed.reduce((sum, item) => sum + Number(item.paymentDetails.total), 0),
  }
}
