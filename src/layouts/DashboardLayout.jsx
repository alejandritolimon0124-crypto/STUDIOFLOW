import { useState } from 'react'
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

const roleNavigation = {
  admin: [
    { label: 'Dashboard', path: paths.admin },
    { label: 'Artistas', path: paths.adminArtists },
    { label: 'Estudios', path: paths.adminStudios },
    { label: 'Clientes', path: paths.adminClients },
    { label: 'Mi Estudio', path: paths.adminStudio },
    { label: 'Sistema', path: paths.adminSystem },
  ],
  artist: [
    { label: 'Agenda', path: paths.artistAgenda },
    { label: 'Citas', path: paths.artistAppointments },
    { label: 'Servicios', path: paths.artistServices },
    { label: 'MI PERFIL', path: paths.artistSettings },
    { label: 'Clientes', path: paths.artistClients },
    { label: 'Horarios', path: paths.artistSchedule },
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
    { label: 'Dashboard', path: paths.artist },
    { label: 'Servicios', path: paths.artistServices },
    { label: 'Agenda', path: paths.artistAgenda },
    { label: 'Clientes', path: paths.artistClients },
    { label: 'MI PERFIL', path: paths.artistSettings },
  ],
  admin: [
    { label: 'Dashboard', path: paths.admin },
    { label: 'Artistas', path: paths.adminArtists },
    { label: 'Estudios', path: paths.adminStudios },
    { label: 'Clientes', path: paths.adminClients },
    { label: 'Mi Estudio', path: paths.adminStudio },
    { label: 'Sistema', path: paths.adminSystem },
  ],
}

function DashboardLayout({ children, role, title, subtitle, showMobileAppbar = true }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const navigate = useNavigate()
  const { adminState, artistState, clientState, logout, selectedDate, session, setSession } = useApp()
  const location = useLocation()
  const currentPath = location.pathname
  const assignedRoles = Array.isArray(session.roles) ? session.roles : []
  const effectiveAdminRole =
    session.user?.role === ROLES.PLATFORM_OWNER || assignedRoles.some((assignment) => assignment.role === ROLES.PLATFORM_OWNER)
      ? ROLES.PLATFORM_OWNER
      : assignedRoles.some((assignment) => assignment.role === ROLES.STUDIO_OWNER)
        ? ROLES.STUDIO_OWNER
        : assignedRoles.some((assignment) => assignment.role === ROLES.STUDIO_MANAGER)
          ? ROLES.STUDIO_MANAGER
          : session.user?.role
  const effectiveAdminAssignment = assignedRoles.find((assignment) => assignment.role === effectiveAdminRole)
  const effectiveAdminUser = {
    ...session.user,
    role: effectiveAdminRole,
    studioId: effectiveAdminAssignment?.studioId || effectiveAdminAssignment?.studio_id || session.user?.studioId || null,
  }
  const canUseAdminItem = (item) => {
    if (role !== 'admin') return true
    if (item.path === paths.adminArtists) return hasPermission(effectiveAdminUser, permissions.STUDIO_ARTISTS)
    if (item.path === paths.adminStudios) return effectiveAdminUser.role === ROLES.PLATFORM_OWNER || hasPermission(effectiveAdminUser, permissions.GOVERNANCE)
    if (item.path === paths.adminClients) return hasPermission(effectiveAdminUser, permissions.CLIENTS) || hasPermission(effectiveAdminUser, permissions.STUDIO_CLIENTS)
    if (item.path === paths.adminStudio) return [ROLES.PLATFORM_OWNER, ROLES.STUDIO_OWNER].includes(effectiveAdminUser.role)
    if (item.path === paths.adminSystem) return hasPermission(effectiveAdminUser, permissions.GOVERNANCE)
    return true
  }
  const navigation = roleNavigation[role].filter(canUseAdminItem)
  const bottomNavigation = bottomNavigationByRole[role].filter(canUseAdminItem)
  const drawerHomePath = role === 'admin' ? paths.admin : role === 'client' ? paths.client : paths.artist
  const adminPrimaryAction = hasPermission(effectiveAdminUser, permissions.STUDIO_ARTISTS)
    ? { label: 'Artistas', path: paths.adminArtists }
    : hasPermission(effectiveAdminUser, permissions.CLIENTS) || hasPermission(effectiveAdminUser, permissions.STUDIO_CLIENTS)
      ? { label: 'Clientas', path: paths.adminClients }
      : { label: 'Inicio', path: paths.admin }
  const primaryActionPath = role === 'client' ? paths.clientExplore : role === 'admin' ? adminPrimaryAction.path : paths.artistAppointments
  const primaryActionLabel = role === 'client' ? 'Reservar' : role === 'admin' ? adminPrimaryAction.label : 'Nueva cita'
  const drawerActions = role === 'client'
    ? [
        { label: 'Inicio', path: drawerHomePath },
        { label: 'MI PERFIL', path: paths.clientProfile },
      ]
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
      : session.user?.name || 'Studio Flow'
  const sidebarSubtitle = role === 'artist' ? '' : getRoleLabel(session.user?.role)
  const appointmentsForSelectedDate = role === 'artist'
    ? artistState.appointments.filter((appointment) => appointment.date === selectedDate && appointment.type === 'appointment')
    : []
  const appointmentCount = appointmentsForSelectedDate.length
  const totalDuration = appointmentsForSelectedDate.reduce((sum, appointment) => {
    const minutes = parseInt(appointment.duration, 10) || 60
    return sum + minutes
  }, 0)
  const occupancy = Math.round((totalDuration / 480) * 100)
  const sidebarAppointmentsLabel = role === 'admin'
    ? '2,184 reservas'
    : role === 'client'
      ? '2 citas activas'
      : `${appointmentCount} citas agendadas`
  const sidebarOccupancyLabel = role === 'admin'
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
  const workspaceItems = [
    { label: 'Admin', path: paths.admin },
    { label: 'Artista', path: paths.artistAgenda },
    ...studioOwnerWorkspaceItems,
    { label: 'Cliente', path: paths.client },
  ]

  const handleNavigate = (path) => {
    navigate(path)
    setIsMenuOpen(false)
  }

  const handleWorkspaceNavigate = (workspace) => {
    if (workspace.studioId) {
      setSession((currentSession) => ({
        ...currentSession,
        activeSessionContext: {
          ...(currentSession.activeSessionContext || {}),
          role: workspace.role || currentSession.activeSessionContext?.role || currentSession.role,
          studioId: workspace.studioId,
        },
        user: currentSession.user
          ? {
              ...currentSession.user,
              studioId: workspace.studioId,
            }
          : currentSession.user,
      }))
    }

    handleNavigate(workspace.path)
  }

  const handleLogout = async () => {
    await logout()
    navigate(paths.login)
    setIsMenuOpen(false)
  }

  const isItemActive = (item) => {
    if (role === 'admin') return currentPath === item.path
    if (item.path === paths.artistAgenda && currentPath === paths.artist) return true
    return isActivePath(currentPath, item.path)
  }

  return (
    <div className={`app-shell ${isMenuOpen ? 'menu-open' : ''}`}>
      <button className="sidebar-backdrop" type="button" aria-label="Cerrar menu" onClick={() => setIsMenuOpen(false)}></button>

      <aside className="sidebar">
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

        <div className="sidebar-switcher drawer-actions">
          <small>Acciones</small>
          {drawerActions.map((item, index) => (
            <button type="button" onClick={() => handleNavigate(item.path)} key={`${item.path}-${item.label}-${index}`}>
              {item.label}
            </button>
          ))}
          <button type="button" onClick={handleLogout}>Cerrar sesion</button>
        </div>

        <div className="sidebar-switcher">
          <small>Workspaces</small>
          {workspaceItems.map((workspace) => (
            <button type="button" onClick={() => handleWorkspaceNavigate(workspace)} key={`${workspace.path}-${workspace.label}-${workspace.studioId || 'base'}`}>
              {workspace.label}
            </button>
          ))}
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
