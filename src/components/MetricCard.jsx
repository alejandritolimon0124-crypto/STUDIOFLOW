import Card from './Card'

function MetricCard({ label, value, trend, tone = 'rose' }) {
  return (
    <Card className={`metric-card metric-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{trend}</small>
    </Card>
  )
}

export default MetricCard
