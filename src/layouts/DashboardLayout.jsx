import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { paths } from '../routes/paths'
import { isActivePath } from '../routes/routerUtils'
import BrandLogo from '../components/BrandLogo'
import { useApp } from '../contexts/appContextCore'
import drawerLogo from '../assets/studioflowlogo2.png'
import { mapAuthContextToArtistProfile } from '../utils/artistProfileMapper'
import { ROLES, getRoleLabel, hasPermission, permissions } from '../modules/permissions/rolePermissions'
import {
  deriveMembershipsFromLegacyData,
  getCurrentArtist,
  getCurrentProfile,
  getCurrentStudio,
  getMembershipForArtist,
} from '../modules/entities/entitySelectors'

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

const mockArtistBusinessNames = [
  'valeria artist',
  'valeria moon',
  'valeria moon studio',
  'studio glow',
  'studio glow beauty',
]

function getCleanArtistBusinessName(value = '') {
  const normalizedName = String(value || '').trim()

  if (!normalizedName || mockArtistBusinessNames.includes(normalizedName.toLowerCase())) {
    return ''
  }

  return normalizedName
}

function normalizeArtistWorkspaceId(context = {}) {
  return context.id || `${context.contextType || context.type || 'artist'}:${context.membershipId || context.membership_id || context.artistId || context.artist_id || 'independent'}`
}

function cleanWorkspaceLabel(value = '') {
  return String(value || '')
    .replace(/\s*\(Independiente\)\s*$/i, '')
    .trim()
}

const roleNavigation = {
  admin: [
    { label: 'Dashboard', path: paths.admin },
    { label: 'Artistas', path: paths.adminArtists },
    { label: 'Estudios', path: paths.adminStudios },
    { label: 'Sistema', path: paths.adminSystem },
  ],
  artist: [
    { label: 'Agenda', path: paths.artistAgenda },
    { label: 'Citas', path: paths.artistAppointments },
    { label: 'Clientes', path: paths.artistClients },
    { label: 'Impulsa tu negocio', path: paths.artistMarketing },
  ],
  client: [
    { label: 'Inicio', path: paths.client },
    { label: 'Mis citas', path: paths.clientAppointments },
    { label: 'Reservar', path: paths.clientExplore },
    { label: 'Favoritos', path: paths.clientFavorites },
  ],
}

const bottomNavigationByRole = {
  client: [
    { label: 'Inicio', path: paths.client },
    { label: 'Reservar', path: paths.clientSearch },
    { label: 'Mis citas', path: paths.clientAppointments },
    { label: 'Favoritos', path: paths.clientFavorites },
    { label: 'MI PERFIL', path: paths.clientProfile },
  ],
  artist: [
    { label: 'Agenda', path: paths.artistAgenda },
    { label: 'Citas', path: paths.artistAppointments },
    { label: 'Clientes', path: paths.artistClients },
    { label: 'Impulsa', path: paths.artistMarketing },
  ],
  admin: [
    { label: 'Dashboard', path: paths.admin },
    { label: 'Artistas', path: paths.adminArtists },
    { label: 'Estudios', path: paths.adminStudios },
    { label: 'Sistema', path: paths.adminSystem },
  ],
}

const studioOwnerNavigation = [
  { label: 'Inicio', path: `${paths.adminStudio}?section=summary` },
  { label: 'Equipo', path: `${paths.adminStudio}?section=team` },
  { label: 'Agenda', path: `${paths.adminStudio}?section=schedule` },
  { label: 'Clientes', path: paths.adminClients },
  { label: 'Configuracion', path: `${paths.adminStudio}?section=settings` },
]

const studioOwnerBottomNavigation = [
  { label: 'Inicio', path: `${paths.adminStudio}?section=summary` },
  { label: 'Equipo', path: `${paths.adminStudio}?section=team` },
  { label: 'Agenda', path: `${paths.adminStudio}?section=schedule` },
  { label: 'Clientes', path: paths.adminClients },
  { label: 'Config', path: `${paths.adminStudio}?section=settings` },
]

function DashboardLayout({ children, role, title, subtitle, showMobileAppbar = true }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [pendingStudioWorkspace, setPendingStudioWorkspace] = useState(null)
  const navigate = useNavigate()
  const {
    adminState,
    artistState,
    artistWorkContextId,
    artistWorkContexts,
    clientState,
    logout,
    selectedDate,
    selectArtistWorkContext,
    session,
    setSession,
  } = useApp()
  const location = useLocation()
  const currentPath = location.pathname
  const assignedRoles = Array.isArray(session.roles) ? session.roles : []
  const activeContextRole = session.activeSessionContext?.role || null
  const activeContextStudioId = session.activeSessionContext?.studioId || session.activeSessionContext?.studio_id || null
  useEffect(() => {
    if (
      pendingStudioWorkspace
      && activeContextRole === ROLES.STUDIO_OWNER
      && activeContextStudioId === pendingStudioWorkspace.studioId
    ) {
      setPendingStudioWorkspace(null)
    }
  }, [activeContextRole, activeContextStudioId, pendingStudioWorkspace])
  const isStudioWorkspacePending = pendingStudioWorkspace
    && (activeContextRole !== ROLES.STUDIO_OWNER || activeContextStudioId !== pendingStudioWorkspace.studioId)
  const isAdminContextResolving = role === 'admin'
    && !session.isMockSession
    && (!session.activeSessionContext || isStudioWorkspacePending)
  if (isAdminContextResolving) {
    return (
      <div className="app-shell">
        <div className="main-shell">
          <main className="dashboard-grid admin-grid">
            <section className="profile-foundation-card">
              <span className="eyebrow">Studio Flow</span>
              <h3>Resolviendo contexto...</h3>
              <small>Preparando workspace activo.</small>
            </section>
          </main>
        </div>
      </div>
    )
  }
  const effectiveAdminRole =
    activeContextRole
      || (session.user?.role === ROLES.PLATFORM_OWNER || assignedRoles.some((assignment) => assignment.role === ROLES.PLATFORM_OWNER)
      ? ROLES.PLATFORM_OWNER
      : assignedRoles.some((assignment) => assignment.role === ROLES.STUDIO_OWNER)
        ? ROLES.STUDIO_OWNER
        : assignedRoles.some((assignment) => assignment.role === ROLES.STUDIO_MANAGER)
          ? ROLES.STUDIO_MANAGER
          : session.user?.role)
  const effectiveAdminAssignment = assignedRoles.find((assignment) => assignment.role === effectiveAdminRole)
  const ownerRouteStudioId = activeContextStudioId || session.user?.studioId || session.user?.studio_id || null
  const hasOwnerAssignmentForRouteStudio = assignedRoles.some((assignment) => (
    assignment.role === ROLES.STUDIO_OWNER
    && (assignment.studioId || assignment.studio_id)
    && (assignment.studioId || assignment.studio_id) === ownerRouteStudioId
  ))
  const shouldForceStudioOwnerChrome = role === 'admin'
    && [paths.adminStudio, paths.adminClients].includes(currentPath)
    && hasOwnerAssignmentForRouteStudio
    && Boolean(ownerRouteStudioId)
    && activeContextRole !== ROLES.PLATFORM_OWNER
  const effectiveAdminUser = {
    ...session.user,
    role: shouldForceStudioOwnerChrome ? ROLES.STUDIO_OWNER : effectiveAdminRole,
    studioId: shouldForceStudioOwnerChrome
      ? ownerRouteStudioId
      : activeContextStudioId || session.user?.studioId || effectiveAdminAssignment?.studioId || effectiveAdminAssignment?.studio_id || null,
  }
  const activeAdminStudio = role === 'admin' && effectiveAdminUser.studioId
    ? adminState.studios.find((studio) => studio.id === effectiveAdminUser.studioId)
    : null
  const activeAdminStudioName = activeAdminStudio?.profile?.commercialName || activeAdminStudio?.name || ''
  const isStudioOwnerWorkspace = role === 'admin' && effectiveAdminUser.role === ROLES.STUDIO_OWNER && Boolean(effectiveAdminUser.studioId)
  const canUseAdminItem = (item) => {
    if (role !== 'admin') return true
    if (item.path === paths.adminArtists) return hasPermission(effectiveAdminUser, permissions.STUDIO_ARTISTS)
    if (item.path === paths.adminStudios) return effectiveAdminUser.role === ROLES.PLATFORM_OWNER || hasPermission(effectiveAdminUser, permissions.GOVERNANCE)
    if (item.path === paths.adminSystem) return hasPermission(effectiveAdminUser, permissions.GOVERNANCE)
    return true
  }
  const navigation = isStudioOwnerWorkspace
    ? studioOwnerNavigation
    : roleNavigation[role].filter(canUseAdminItem)
  const bottomNavigation = isStudioOwnerWorkspace
    ? studioOwnerBottomNavigation
    : bottomNavigationByRole[role].filter(canUseAdminItem)
  const drawerHomePath = isStudioOwnerWorkspace ? paths.adminStudio : role === 'admin' ? paths.admin : role === 'client' ? paths.client : paths.artist
  const adminPrimaryAction = hasPermission(effectiveAdminUser, permissions.STUDIO_ARTISTS)
    ? { label: 'Artistas', path: paths.adminArtists }
    : { label: 'Inicio', path: paths.admin }
  const primaryActionPath = role === 'client' ? paths.clientExplore : role === 'admin' ? adminPrimaryAction.path : paths.artistAppointments
  const primaryActionLabel = role === 'client' ? 'Reservar' : role === 'admin' ? adminPrimaryAction.label : 'Nueva cita'
  const drawerActions = role === 'client'
    ? [
        { label: 'Inicio', path: drawerHomePath },
        { label: 'MI PERFIL', path: paths.clientProfile },
      ]
    : role === 'artist'
      ? []
    : [
        { label: 'Inicio', path: drawerHomePath },
        { label: primaryActionLabel, path: primaryActionPath },
      ]
  const clientPhotoUrl = role === 'client' ? clientState.profile?.photoUrl : ''
  const artistPhotoUrl = role === 'artist' ? artistState.profile?.photoUrl : ''
  const profilePhotoUrl = clientPhotoUrl || artistPhotoUrl
  const localProfiles = session.user ? [{ ...session.user, id: session.user.id }] : []
  const currentProfile = getCurrentProfile({ session, profiles: localProfiles })
  const artistStudioMemberships = deriveMembershipsFromLegacyData({ artists: adminState.artists })
  const selectorArtists = role === 'artist'
    ? adminState.artists.map((artist) => (
      getMembershipForArtist({
        artistId: artist.id,
        studioId: session.user?.studioId,
        artistStudioMemberships,
      })
        ? { ...artist, profileId: currentProfile?.id }
        : artist
    ))
    : adminState.artists
  const currentArtist = getCurrentArtist({ session, profiles: localProfiles, artists: selectorArtists })
  const currentMembership = getMembershipForArtist({
    artistId: currentArtist?.id,
    artistStudioMemberships,
  })
  const artistStudio = role === 'artist'
    ? getCurrentStudio({
      session,
      profiles: localProfiles,
      studios: adminState.studios,
      artists: selectorArtists,
      artistStudioMemberships,
      activeStudioId: currentMembership?.studioId,
    })
    : null
  const sessionArtistProfile = role === 'artist' && session.artist
    ? mapAuthContextToArtistProfile({ profile: session.profile, artist: session.artist }, artistState.profile)
    : null
  const artistStudioName = getCleanArtistBusinessName(artistStudio?.profile?.commercialName)
  const artistName = role === 'artist'
    ? getCleanArtistBusinessName(sessionArtistProfile?.personalInfo?.artisticName || artistState.profile?.personalInfo?.artisticName)
    : ''
  const clientDisplayName = session.client?.display_name
    || session.client?.displayName
    || session.profile?.display_name
    || session.profile?.displayName
    || session.user?.name
  const sidebarDisplayName = role === 'artist'
    ? artistName || artistStudioName || 'Artista Profesional'
    : role === 'client'
      ? clientDisplayName || clientState.profile?.name || 'Clienta'
      : isStudioOwnerWorkspace
        ? activeAdminStudioName || 'Studio Owner'
        : session.user?.name || 'Studio Flow'
  const sidebarSubtitle = role === 'artist' ? '' : isStudioOwnerWorkspace ? 'Studio Owner' : getRoleLabel(session.user?.role)
  const appointmentsForSelectedDate = role === 'artist'
    ? artistState.appointments.filter((appointment) => appointment.date === selectedDate && appointment.type === 'appointment')
    : []
  const appointmentCount = appointmentsForSelectedDate.length
  const totalDuration = appointmentsForSelectedDate.reduce((sum, appointment) => {
    const minutes = parseInt(appointment.duration, 10) || 60
    return sum + minutes
  }, 0)
  const occupancy = Math.round((totalDuration / 480) * 100)
  const sidebarAppointmentsLabel = isStudioOwnerWorkspace
    ? 'Consola owner'
    : role === 'admin'
      ? '2,184 reservas'
    : role === 'client'
      ? '2 citas activas'
      : `${appointmentCount} citas agendadas`
  const sidebarOccupancyLabel = isStudioOwnerWorkspace
    ? activeAdminStudioName || 'Studio Owner'
    : role === 'admin'
      ? 'Sistema estable'
    : role === 'client'
      ? 'Tu agenda beauty'
      : `Ocupación al ${occupancy}%`
  const fallbackAvatar = getInitials(sidebarDisplayName) || 'SF'
  const renderAvatarContent = () => (
    profilePhotoUrl ? <img src={profilePhotoUrl} alt="Foto de perfil" /> : fallbackAvatar
  )
  const studioOwnerWorkspaceItems = assignedRoles
    .filter((assignment) => (
      assignment.role === ROLES.STUDIO_OWNER
      && assignment.status !== 'inactive'
      && assignment.status !== 'revoked'
      && (assignment.studioId || assignment.studio_id)
    ))
    .reduce((items, assignment) => {
      const studioId = assignment.studioId || assignment.studio_id
      if (items.some((item) => item.studioId === studioId)) return items

      const studio = adminState.studios.find((item) => item.id === studioId)
      const studioName = studio?.profile?.commercialName || studio?.name || assignment.studioName || assignment.studio_name || 'Studio Owner'

      return [
        ...items,
        {
          label: studioName,
          path: paths.adminStudio,
          role: ROLES.STUDIO_OWNER,
          studioId,
        },
      ]
    }, [])
  const artistWorkspaceItems = (artistWorkContexts || [])
    .filter((context) => ['artist', 'membership'].includes(context.contextType || context.type || 'artist'))
    .map((context) => {
      const contextType = context.contextType || context.type || 'artist'
      const studioName = context.studioName || context.studio_name || ''
      const label = cleanWorkspaceLabel(
        contextType === 'membership'
          ? studioName || context.label || 'Estudio'
          : context.label || artistName || artistStudioName || 'Artista independiente',
      )

      return {
        label,
        path: paths.artistAgenda,
        role: ROLES.ARTIST,
        contextId: normalizeArtistWorkspaceId(context),
        contextType,
        studioId: context.studioId || context.studio_id || null,
        membershipId: context.membershipId || context.membership_id || null,
      }
    })
  const sessionMembershipWorkspaceItems = (session.memberships || [])
    .filter((membership) => (
      (membership.status || 'active') === 'active'
      && (membership.id || membership.membershipId || membership.membership_id)
      && (membership.studioId || membership.studio_id)
    ))
    .map((membership) => {
      const membershipId = membership.id || membership.membershipId || membership.membership_id
      const studioId = membership.studioId || membership.studio_id
      const studio = adminState.studios.find((item) => item.id === studioId)
      const studioName = studio?.profile?.commercialName
        || studio?.name
        || membership.studioName
        || membership.studio_name
        || membership.commercialName
        || membership.commercial_name
        || 'Estudio'

      return {
        label: cleanWorkspaceLabel(studioName),
        path: paths.artistAgenda,
        role: ROLES.ARTIST,
        contextId: `membership:${membershipId}`,
        contextType: 'membership',
        studioId,
        membershipId,
      }
    })
  const artistIndependentWorkspaceItems = artistWorkspaceItems.filter((workspace) => workspace.contextType === 'artist')
  const artistMembershipWorkspaceItems = [
    ...artistWorkspaceItems.filter((workspace) => workspace.contextType === 'membership'),
    ...sessionMembershipWorkspaceItems,
  ]
  const allArtistWorkspaceItems = [
    ...artistIndependentWorkspaceItems,
    ...studioOwnerWorkspaceItems,
    ...artistMembershipWorkspaceItems,
  ]
    .filter((workspace, index, items) => (
      workspace.label
      && !['admin', 'cliente', 'client', 'platform owner', 'studio owner', 'artista'].includes(workspace.label.toLowerCase())
      && items.findIndex((item) => (
        item.contextId === workspace.contextId
        || (workspace.studioId && item.studioId === workspace.studioId)
        || item.label === workspace.label
      )) === index
    ))
  const isStudioOwnerActiveContext = activeContextRole === ROLES.STUDIO_OWNER && Boolean(activeContextStudioId)
  const shouldShowAdminWorkspace = !isStudioOwnerActiveContext || activeContextRole === ROLES.PLATFORM_OWNER
  const workspaceItems = role === 'artist'
    ? allArtistWorkspaceItems
    : [
        ...(shouldShowAdminWorkspace ? [{ label: 'Admin', path: paths.admin, role: ROLES.PLATFORM_OWNER }] : []),
        { label: 'Artista', path: paths.artistAgenda },
        ...studioOwnerWorkspaceItems,
        { label: 'Cliente', path: paths.client },
      ]

  const handleNavigate = (path) => {
    navigate(path)
    setIsMenuOpen(false)
  }

  const handleWorkspaceNavigate = (workspace) => {
    if (workspace.contextId) {
      selectArtistWorkContext?.(workspace.contextId)
      setPendingStudioWorkspace(null)
      setSession((currentSession) => ({
        ...currentSession,
        role: ROLES.ARTIST,
        activeSessionContext: {
          role: ROLES.ARTIST,
          contextType: workspace.contextType,
          studioId: workspace.studioId || null,
          membershipId: workspace.membershipId || null,
        },
        user: currentSession.user
          ? {
              ...currentSession.user,
              role: ROLES.ARTIST,
              studioId: workspace.studioId || null,
            }
          : currentSession.user,
      }))
      handleNavigate(workspace.path)
      return
    }

    if (workspace.studioId) {
      setPendingStudioWorkspace({
        studioId: workspace.studioId,
        role: workspace.role || ROLES.STUDIO_OWNER,
      })
      setSession((currentSession) => {
        const nextRole = workspace.role || ROLES.STUDIO_OWNER
        const previousContext = currentSession.activeSessionContext || null
        const nextSession = {
          ...currentSession,
          role: nextRole,
          activeSessionContext: {
            ...(currentSession.activeSessionContext || {}),
            role: nextRole,
            studioId: workspace.studioId,
          },
          user: currentSession.user
            ? {
                ...currentSession.user,
                role: nextRole,
                studioId: workspace.studioId,
              }
            : currentSession.user,
        }

        console.log('[Studio Owner Workspace] activeSessionContext before', previousContext)
        console.log('[Studio Owner Workspace] activeSessionContext after', nextSession.activeSessionContext)

        return nextSession
      })
    } else {
      setPendingStudioWorkspace(null)
    }

    handleNavigate(workspace.path)
  }

  const handleLogout = async () => {
    await logout()
    navigate(paths.login)
    setIsMenuOpen(false)
  }

  const isItemActive = (item) => {
    const currentLocation = `${currentPath}${location.search || ''}`
    if (item.path.includes('?')) return currentLocation === item.path
    if (role === 'admin') return currentPath === item.path
    if (item.path === paths.artistAgenda && currentPath === paths.artist) return true
    return isActivePath(currentPath, item.path)
  }

  return (
    <div className={`app-shell ${isMenuOpen ? 'menu-open' : ''}`}>
      <button className="sidebar-backdrop" type="button" aria-label="Cerrar menu" onClick={() => setIsMenuOpen(false)}></button>

      <aside className={`sidebar ${role === 'artist' ? 'artist-sidebar' : ''}`}>
        <button className="brand-button sidebar-brand drawer-brand-logo" type="button" onClick={() => handleNavigate(drawerHomePath)}>
          <img src={drawerLogo} alt="Studio Flow" />
        </button>

        <div className="sidebar-profile">
          <div className="avatar">{renderAvatarContent()}</div>
          <div>
            <strong>{sidebarDisplayName}</strong>
            {sidebarSubtitle && <small>{sidebarSubtitle}</small>}
          </div>
        </div>

        <div className="sidebar-insight">
          <span>Hoy</span>
          <strong>{sidebarAppointmentsLabel}</strong>
          <small>{sidebarOccupancyLabel}</small>
        </div>

        <nav className="sidebar-nav" aria-label="Navegacion principal">
          {navigation.map((item, index) => (
            <button
              className={isItemActive(item, index) ? 'active' : ''}
              key={`${item.path}-${item.label}`}
              type="button"
              onClick={() => handleNavigate(item.path)}
            >
              <span aria-hidden="true"></span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-switcher">
          <small>Workspaces</small>
          {workspaceItems.map((workspace) => (
            <button
              className={workspace.contextId && workspace.contextId === artistWorkContextId ? 'active' : ''}
              type="button"
              onClick={() => handleWorkspaceNavigate(workspace)}
              key={`${workspace.path}-${workspace.label}-${workspace.studioId || workspace.contextId || 'base'}`}
            >
              {workspace.label}
            </button>
          ))}
        </div>

        <div className="sidebar-switcher drawer-actions">
          <small>Acciones</small>
          {drawerActions.map((item, index) => (
            <button type="button" onClick={() => handleNavigate(item.path)} key={`${item.path}-${item.label}-${index}`}>
              {item.label}
            </button>
          ))}
          <button type="button" onClick={handleLogout}>Cerrar sesion</button>
        </div>
      </aside>

      <div className="main-shell">
        {showMobileAppbar && (
          <header className="mobile-appbar">
            <button className="menu-button" type="button" aria-label="Abrir menu" onClick={() => setIsMenuOpen(true)}>
              <span></span>
              <span></span>
            </button>
            <button className="brand-button" type="button" onClick={() => handleNavigate(role === 'client' ? paths.client : paths.artistAgenda)}>
              <BrandLogo compact />
            </button>
            <button className="avatar mini" type="button" onClick={() => setIsMenuOpen(true)}>
              {renderAvatarContent()}
            </button>
          </header>
        )}

        <header className="topbar">
          <button className="menu-button topbar-menu-button" type="button" aria-label="Abrir menu" onClick={() => setIsMenuOpen(true)}>
            <span></span>
            <span></span>
            <span></span>
          </button>
          <div className="topbar-center">
            <img className="mobile-brand-logo" src={drawerLogo} alt="Studio Flow" />
          </div>
          <button className="avatar mini topbar-profile-avatar" type="button" onClick={() => setIsMenuOpen(true)}>
            {renderAvatarContent()}
          </button>
        </header>

        {(title || subtitle) && !([paths.artistMarketing].includes(currentPath)) && (
          <div className="topbar-titles">
            <span className="eyebrow">Studio Flow</span>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
        )}

        {children}
      </div>

      <nav className="mobile-bottom-nav" aria-label="Navegacion movil">
        {bottomNavigation.map((item, index) => (
          <button className={isItemActive(item, index) ? 'active' : ''} type="button" onClick={() => handleNavigate(item.path)} key={`${item.path}-${item.label}`}>
            <span>{item.label}</span>
          </button>
        ))}
        <button type="button" onClick={() => setIsMenuOpen(true)}>
          <span>Menu</span>
        </button>
      </nav>
    </div>
  )
}

export default DashboardLayout
