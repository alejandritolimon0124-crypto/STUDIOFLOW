function getInitials(value = '') {
  return String(value)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function getWorkspaceImage(context = {}) {
  return context.logoUrl
    || context.logo_url
    || context.avatarUrl
    || context.avatar_url
    || context.photoUrl
    || context.photo_url
    || context.imageUrl
    || context.image_url
    || ''
}

function getWorkspaceType(context = {}) {
  return (context.contextType || context.type) === 'membership' ? 'Estudio' : 'Independiente'
}

function WorkspaceCardSelector({ activeContext, contexts = [], name, onSelect }) {
  const workspaceItems = contexts.length ? contexts : [activeContext].filter(Boolean)

  return (
    <div className="workspace-card-selector" role="radiogroup" aria-label="Trabajando como">
      {workspaceItems.map((context) => {
        const isActive = activeContext?.id === context.id
        const imageUrl = getWorkspaceImage(context)
        const label = context.label || 'Workspace'
        const type = getWorkspaceType(context)

        return (
          <button
            aria-checked={isActive}
            className={`workspace-card-option ${isActive ? 'active' : ''}`}
            key={context.id}
            name={name}
            role="radio"
            type="button"
            onClick={() => onSelect(context.id)}
          >
            <span className="workspace-card-avatar" aria-hidden="true">
              {imageUrl ? <img src={imageUrl} alt="" /> : getInitials(label)}
            </span>
            <span className="workspace-card-copy">
              <strong>{label}</strong>
              <small>{type}</small>
            </span>
            <span className="workspace-card-check" aria-hidden="true"></span>
          </button>
        )
      })}
    </div>
  )
}

export default WorkspaceCardSelector
