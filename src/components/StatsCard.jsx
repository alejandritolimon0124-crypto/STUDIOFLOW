import Card from './Card'

function StatsCard({ title, value, caption, children }) {
  return (
    <Card className="stats-card">
      <div>
        <span className="eyebrow">{title}</span>
        <strong>{value}</strong>
        <p>{caption}</p>
      </div>
      {children && <div className="stats-visual">{children}</div>}
    </Card>
  )
}

export default StatsCard
