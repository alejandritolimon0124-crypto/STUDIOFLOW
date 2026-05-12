import StatusPill from './StatusPill'

function AgendaCard({ time, title, subtitle, status, accent = 'rose', type = 'appointment' }) {
  const tone = type === 'break' || status === 'Por llegar' || status === 'Anticipo' ? 'warm' : 'success'

  return (
    <article className={`agenda-card agenda-${accent} agenda-${type}`}>
      <div className="agenda-time">
        <span>{time}</span>
      </div>
      <div className="agenda-content">
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </div>
      <StatusPill tone={tone}>{status}</StatusPill>
    </article>
  )
}

export default AgendaCard
