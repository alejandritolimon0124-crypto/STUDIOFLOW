import StatusPill from './StatusPill'

function AgendaCard({ time, title, subtitle, status, accent = 'rose', type = 'appointment', showEconomy = false, economyData = null }) {
  const tone = type === 'break' || status === 'Por llegar' || status === 'Anticipo' ? 'warm' : 'success'

  return (
    <article className={`agenda-card agenda-${accent} agenda-${type}`}>
      <div className="agenda-time">
        <span>{time}</span>
      </div>
      <div className="agenda-content">
        <strong>{title}</strong>
        <small>{subtitle}</small>
        {showEconomy && economyData && (
          <div className="agenda-economy">
            <div className="economy-item">
              <span className="economy-label">Monto:</span>
              <span className="economy-value">${economyData.grossAmount}</span>
            </div>
            <div className="economy-item">
              <span className="economy-label">Studio Flow:</span>
              <span className="economy-value economy-fee">${economyData.platformFee}</span>
            </div>
            <div className="economy-item">
              <span className="economy-label">Tu ganancia:</span>
              <span className="economy-value economy-net">${economyData.artistRevenue}</span>
            </div>
          </div>
        )}
      </div>
      <StatusPill tone={tone}>{status}</StatusPill>
    </article>
  )
}

export default AgendaCard
