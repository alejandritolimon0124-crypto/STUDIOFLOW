import AppointmentPayment from './AppointmentPayment'
import StatusPill from './StatusPill'
import './ownerAgenda.css'

const labels = { scheduled: 'Agendada', completed: 'Completada', cancelled: 'Cancelada', no_show: 'No asistio', disputed: 'En revision' }
const date = (value) => {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? 'Fecha por confirmar' : new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City' }).format(parsed)
}

export default function OwnerAppointmentCard({ appointment: item, clientName }) {
  return <article className="owner-agenda-event">
    <strong>{clientName || item.client}</strong><span>{item.artist} · {item.service}</span>
    {item.studio && <span>{item.studio}</span>}
    <time dateTime={item.startsAt}>{date(item.startsAt)} – {date(item.endsAt)}</time>
    <strong className={`owner-agenda-status-${item.appointmentStatus}`}>{labels[item.appointmentStatus] || item.status || item.appointmentStatus}</strong>
    <AppointmentPayment appointment={item} compact />
    <div className="row-actions">
      {Number(item.pointsGranted) > 0 && <StatusPill tone="success">+{item.pointsGranted} FP otorgados</StatusPill>}
      {item.happyHourApplied && <StatusPill tone="success">Happy Hour</StatusPill>}
      {Number(item.rewardMultiplier) > 1 && <StatusPill tone="warm">Puntos dobles</StatusPill>}
    </div>
  </article>
}
