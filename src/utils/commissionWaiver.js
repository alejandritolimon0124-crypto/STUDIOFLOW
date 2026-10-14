const mexicoDate = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Mexico_City',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function isCommissionWaived(value) {
  if (!value) return false
  let day
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:$|\s)/.test(value)) {
    day = value.slice(0, 10)
  } else {
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) return false
    const parts = Object.fromEntries(mexicoDate.formatToParts(date).map(({ type, value: part }) => [type, part]))
    day = `${parts.year}-${parts.month}-${parts.day}`
  }
  return day >= '2026-10-01' && day < '2027-01-01'
}
