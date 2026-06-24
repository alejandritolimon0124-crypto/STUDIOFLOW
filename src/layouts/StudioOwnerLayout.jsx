import { useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../contexts/appContextCore'
import { paths } from '../routes/paths'
import { ROLES } from '../modules/permissions/rolePermissions'
import drawerLogo from '../assets/studioflowlogo2.png'

const studioOwnerNavItems = [
  ['Inicio', `${paths.adminStudio}?section=summary`],
  ['Equipo', `${paths.adminStudio}?section=team`],
  ['Agenda', `${paths.adminStudio}?section=schedule`],
  ['Clientes', paths.adminClients],
  ['Config', `${paths.adminStudio}?section=config`],
]

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

function cleanWorkspaceLabel(value = '') {
  return String(value || '')
    .replace(/\s*\(Independiente\)\s*$/i, '')
    .trim()
}

function isRealOwnerWorkspace(workspace = {}) {
  const technicalRoles = new Set([ROLES.CLIENT, ROLES.PLATFORM_OWNER, 'admin', 'client', 'platform_owner'])
  const technicalLabels = new Set(['admin', 'cliente', 'client', 'platform owner', 'studio owner', 'artista'])
  const label = String(workspace.label || '').trim().toLowerCase()

  if (technicalRoles.has(workspace.role)) return false
  if (technicalLabels.has(label)) return false
  return Boolean(workspace.studioId || workspace.contextType === 'artist')
}

function StudioOwnerLayout() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { adminState, artistWorkContexts, logout, session, setSession } = useApp()
  const studioAssignments = (session.roles || []).filter((assignment) => (
    assignment.role === 'studio_owner'
    && (assignment.status || 'active') !== 'inactive'
    && (assignment.status || 'active') !== 'revoked'
    && (assignment.studioId || assignment.studio_id)
  ))
  const primaryStudioOwnerAssignment = studioAssignments[0]
  const activeStudioId = session.activeSessionContext?.studioId
    || session.activeSessionContext?.studio_id
    || session.user?.studioId
    || session.user?.studio_id
    || primaryStudioOwnerAssignment?.studioId
    || primaryStudioOwnerAssignment?.studio_id
    || null
  const activeStudio = activeStudioId
    ? adminState.studios.find((studio) => studio.id === activeStudioId)
    : null
  const activeAssignment = studioAssignments.find((assignment) => (
    (assignment.studioId || assignment.studio_id) === activeStudioId
  )) || primaryStudioOwnerAssignment
  const studioName = activeStudio?.profile?.commercialName
    || activeStudio?.name
    || session.activeSessionContext?.studioName
    || session.activeSessionContext?.studio_name
    || activeAssignment?.studioName
    || activeAssignment?.studio_name
    || ''
  const studioStatus = activeStudio?.studioStatus === 'approved' ? 'Estudio aprobado' : activeStudio?.studioStatus || 'Estudio activo'
  const avatar = getInitials(studioName) || 'SO'
  const currentLocation = `${location.pathname}${location.search || ''}`
  const currentSection = location.pathname === paths.adminStudio
    ? new URLSearchParams(location.search).get('section') || 'summary'
    : ''
  const normalizeStudioPath = (path) => {
    if (!path.includes('?')) return path

    const [pathname, queryString] = path.split('?')
    const params = new URLSearchParams(queryString)
    const section = params.get('section')

    return `${pathname}?section=${section === 'config' ? 'settings' : section || 'summary'}`
  }
  const isActiveItem = (path) => {
    if (path === paths.adminClients) return location.pathname === paths.adminClients
    if (!path.includes('?')) return location.pathname === path
    if (location.pathname !== paths.adminStudio) return false

    const [, queryString] = path.split('?')
    const params = new URLSearchParams(queryString)
    const targetSection = params.get('section') || 'summary'
    const normalizedCurrentSection = currentSection === 'config' ? 'settings' : currentSection
    const normalizedTargetSection = targetSection === 'config' ? 'settings' : targetSection

    return normalizedCurrentSection === normalizedTargetSection
  }
  const independentArtistContext = (artistWorkContexts || []).find((context) => (
    (context.contextType || context.type) === 'artist'
  ))
  const independentWorkspaceLabel = cleanWorkspaceLabel(
    independentArtistContext?.label
    || session.artist?.displayName
    || session.artist?.display_name
    || session.artist?.name
    || session.user?.artistName
    || session.user?.name
    || 'Artista independiente',
  )
  const ownerWorkspaces = studioAssignments.reduce((items, assignment) => {
    const studioId = assignment.studioId || assignment.studio_id
    if (!studioId || items.some((item) => item.studioId === studioId)) return items

    const studio = adminState.studios.find((item) => item.id === studioId)
    const label = studio?.profile?.commercialName
      || studio?.name
      || assignment.studioName
      || assignment.studio_name
      || 'Studio Owner'

    return [
      ...items,
      {
        label,
        path: `${paths.adminStudio}?section=summary`,
        role: ROLES.STUDIO_OWNER,
        studioId,
      },
    ]
  }, [])
  const workspaceItems = [
    {
      label: independentWorkspaceLabel,
      path: paths.artistAgenda,
      role: ROLES.ARTIST,
      contextType: 'artist',
    },
    ...ownerWorkspaces,
  ].filter(isRealOwnerWorkspace)

  console.log('workspaceItems', workspaceItems)
  console.log('ownerWorkspaces', ownerWorkspaces)
  console.log('studioAssignments', studioAssignments)
  const goTo = (path) => {
    navigate(normalizeStudioPath(path))
    setIsMenuOpen(false)
  }
  const activateWorkspace = (workspace) => {
    setSession((currentSession) => {
      const nextContext = {
        role: workspace.role,
        ...(workspace.studioId ? { studioId: workspace.studioId } : {}),
      }

      return {
        ...currentSession,
        role: workspace.role || currentSession.role,
        activeSessionContext: nextContext,
        user: currentSession.user
          ? {
              ...currentSession.user,
              role: workspace.role || currentSession.user.role,
              studioId: workspace.studioId || null,
            }
          : currentSession.user,
      }
    })
    goTo(workspace.path)
  }
  const handleLogout = async () => {
    await logout()
    goTo(paths.login)
  }

  return (
    <div className={`app-shell studio-owner-shell ${isMenuOpen ? 'menu-open' : ''}`}>
      <button className="sidebar-backdrop" type="button" aria-label="Cerrar menu" onClick={() => setIsMenuOpen(false)}></button>

      <aside className="sidebar studio-owner-sidebar">
        <button className="brand-button sidebar-brand drawer-brand-logo" type="button" onClick={() => goTo(`${paths.adminStudio}?section=summary`)}>
          <img src={drawerLogo} alt="Studio Flow" />
        </button>

        <div className="sidebar-profile">
          <div className="avatar">{avatar}</div>
          <div>
            <strong>{studioName}</strong>
            <small>{studioStatus}</small>
          </div>
        </div>

        <div className="sidebar-insight">
          <span>Hoy</span>
          <strong>{studioName}</strong>
          <small>Operacion, equipo, servicios y configuracion</small>
        </div>

        <nav className="sidebar-nav" aria-label="Navegacion del estudio">
          {studioOwnerNavItems.map(([label, path]) => (
            <button
              className={isActiveItem(path) ? 'active' : ''}
              key={path}
              type="button"
              onClick={() => goTo(path)}
            >
              <span aria-hidden="true"></span>
              {label}
            </button>
          ))}
        </nav>

        <div className="sidebar-switcher workspace-switcher">
          <small>Workspaces</small>
          {workspaceItems.map((workspace) => (
            <button
              className={workspace.studioId === activeStudioId || (workspace.contextType === 'artist' && session.activeSessionContext?.role === ROLES.ARTIST) ? 'active' : ''}
              key={`${workspace.path}-${workspace.label}-${workspace.studioId || workspace.contextType || workspace.role}`}
              type="button"
              onClick={() => activateWorkspace(workspace)}
            >
              {workspace.label}
            </button>
          ))}
        </div>

        <div className="sidebar-switcher drawer-actions">
          <small>Cuenta</small>
          <button type="button" onClick={handleLogout}>Cerrar sesion</button>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <button className="menu-button topbar-menu-button" type="button" aria-label="Abrir menu" onClick={() => setIsMenuOpen(true)}>
            <span></span>
            <span></span>
            <span></span>
          </button>
          <div className="topbar-center">
            <img className="mobile-brand-logo" src={drawerLogo} alt="Studio Flow" />
          </div>
          <button className="avatar mini topbar-profile-avatar" type="button" onClick={() => goTo(`${paths.adminStudio}?section=settings`)}>
            {avatar}
          </button>
        </header>

        <div className="topbar-titles">
          <h1>{studioName}</h1>
          <p>Operacion, equipo, servicios y configuracion del estudio.</p>
        </div>

        <div className="role-layout-shell">
          <Outlet />
          <nav className="role-bottom-nav studio-owner-role-nav" aria-label="Navegacion del estudio">
            {studioOwnerNavItems.map(([label, path]) => (
              <button className={isActiveItem(path) ? 'active' : ''} key={path} type="button" onClick={() => goTo(path)}>
                {label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <nav className="mobile-bottom-nav" aria-label="Navegacion movil del estudio">
        {studioOwnerNavItems.map(([label, path]) => (
          <button className={isActiveItem(path) ? 'active' : ''} type="button" onClick={() => goTo(path)} key={path}>
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

export default StudioOwnerLayout
