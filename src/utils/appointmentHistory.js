export function historyDateTime(item) {
  const timestamp = item.startsAt || item.starts_at
  if (timestamp && Number.isFinite(Date.parse(timestamp))) {
    return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City' }).format(new Date(timestamp))
  }
  return `${item.date || 'Fecha no registrada'} · ${item.time || 'Hora no registrada'}`
}

export function newestAppointmentFirst(a, b) {
  const key = (item) => {
    const timestamp = item.startsAt || item.starts_at
    if (timestamp && Number.isFinite(Date.parse(timestamp))) {
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(timestamp))
      const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
      return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}`
    }
    return `${item.date || ''} ${item.time || ''}`
  }
  return key(b).localeCompare(key(a)) || String(b.id || '').localeCompare(String(a.id || ''))
}
