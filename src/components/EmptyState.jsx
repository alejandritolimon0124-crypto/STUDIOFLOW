function EmptyState({ title, description }) {
  return (
    <div className="empty-state">
      <div className="empty-mark">SF</div>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  )
}

export default EmptyState
