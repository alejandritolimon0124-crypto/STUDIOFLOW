import Card from './Card'
import './ownerStatusMetric.css'

export default function OwnerStatusMetric({ title, positive, negative, positiveLabel, negativeLabel }) {
  return (
    <Card className="metric-card owner-status-metric">
      <h2>{title}</h2>
      <div className="owner-status-columns">
        <div className="owner-status-half owner-status-active">
          <span>{positiveLabel}</span>
          <strong>{positive}</strong>
        </div>
        <div className="owner-status-half owner-status-suspended">
          <span>{negativeLabel}</span>
          <strong>{negative}</strong>
        </div>
      </div>
    </Card>
  )
}
