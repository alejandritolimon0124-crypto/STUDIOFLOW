function PanelHeader({ eyebrow, title, action }) {
  return (
    <div className="panel-header">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}

export default PanelHeader
