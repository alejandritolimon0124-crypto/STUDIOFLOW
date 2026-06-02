import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { paths } from '../routes/paths'
import { isActivePath } from '../routes/routerUtils'
import BrandLogo from '../components/BrandLogo'
import { useApp } from '../contexts/appContextCore'
import drawerLogo from '../assets/studioflowlogo2.png'
import { ROLES, getRoleLabel, hasPermission, permissions } from '../modules/permissions/rolePermissions'

const roleNavigation = {
  admin: [
    { label: 'Dashboard', path: paths.admin },
    { label: 'Artistas', path: paths.adminArtists },
    { label: 'Clientes', path: paths.adminClients },
    { label: 'Mi Estudio', path: paths.adminStudio },
    { label: 'Sistema', path: paths.adminSystem },
  ],
  artist: [
    { label: 'Agenda', path: paths.artistAgenda },
    { label: 'Citas', path: paths.artistAppointments },
    { label: 'Servicios', path: paths.artistServices },
    { label: 'Mi Perfil', path: paths.artistSettings },
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
    { label: 'Mi perfil', path: paths.clientProfile },
  ],
  artist: [
    { label: 'Dashboard', path: paths.artist },
    { label: 'Servicios', path: paths.artistServices },
    { label: 'Agenda', path: paths.artistAgenda },
    { label: 'Clientes', path: paths.artistClients },
    { label: 'Perfil', path: paths.artistSettings },
  ],
  admin: [
    { label: 'Dashboard', path: paths.admin },
    { label: 'Artistas', path: paths.adminArtists },
    { label: 'Clientes', path: paths.adminClients },
    { label: 'Mi Estudio', path: paths.adminStudio },
    { label: 'Sistema', path: paths.adminSystem },
  ],
}

function DashboardLayout({ children, role, title, subtitle, showMobileAppbar = true }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const navigate = useNavigate()
  const { artistState, clientState, logout, session } = useApp()
  const location = useLocation()
  const currentPath = location.pathname
  const canUseAdminItem = (item) => {
    if (role !== 'admin') return true
    if (item.path === paths.adminArtists) return hasPermission(session.user, permissions.STUDIO_ARTISTS)
    if (item.path === paths.adminClients) return hasPermission(session.user, permissions.CLIENTS) || hasPermission(session.user, permissions.STUDIO_CLIENTS)
    if (item.path === paths.adminStudio) return [ROLES.PLATFORM_OWNER, ROLES.STUDIO_OWNER].includes(session.user?.role)
    if (item.path === paths.adminSystem) return hasPermission(session.user, permissions.GOVERNANCE)
    return true
  }
  const navigation = roleNavigation[role].filter(canUseAdminItem)
  const bottomNavigation = bottomNavigationByRole[role].filter(canUseAdminItem)
  const drawerHomePath = role === 'admin' ? paths.admin : role === 'client' ? paths.client : paths.artist
  const adminPrimaryAction = hasPermission(session.user, permissions.STUDIO_ARTISTS)
    ? { label: 'Artistas', path: paths.adminArtists }
    : hasPermission(session.user, permissions.CLIENTS) || hasPermission(session.user, permissions.STUDIO_CLIENTS)
      ? { label: 'Clientas', path: paths.adminClients }
      : { label: 'Inicio', path: paths.admin }
  const primaryActionPath = role === 'client' ? paths.clientExplore : role === 'admin' ? adminPrimaryAction.path : paths.artistAppointments
  const primaryActionLabel = role === 'client' ? 'Reservar' : role === 'admin' ? adminPrimaryAction.label : 'Nueva cita'
  const drawerActions = role === 'client'
    ? [
        { label: 'Inicio', path: drawerHomePath },
        { label: 'Mi perfil', path: paths.clientProfile },
      ]
    : [
        { label: 'Inicio', path: drawerHomePath },
        { label: primaryActionLabel, path: primaryActionPath },
      ]
  const clientPhotoUrl = role === 'client' ? clientState.profile?.photoUrl : ''
  const artistPhotoUrl = role === 'artist' ? artistState.profile?.photoUrl : ''
  const profilePhotoUrl = clientPhotoUrl || artistPhotoUrl
  const fallbackAvatar = role === 'admin' ? 'HQ' : role === 'client' ? 'ML' : 'VM'
  const renderAvatarContent = () => (
    profilePhotoUrl ? <img src={profilePhotoUrl} alt="Foto de perfil" /> : fallbackAvatar
  )

  const handleNavigate = (path) => {
    navigate(path)
    setIsMenuOpen(false)
  }

  const handleLogout = () => {
    logout()
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
            <strong>{session.user?.name || (role === 'admin' ? 'Studio Flow HQ' : role === 'client' ? 'Mariana Lopez' : 'Valeria Moon')}</strong>
            <small>{getRoleLabel(session.user?.role)}</small>
          </div>
        </div>

        <div className="sidebar-insight">
          <span>Hoy</span>
          <strong>{role === 'admin' ? '2,184 reservas' : role === 'client' ? '2 citas activas' : '8 citas agendadas'}</strong>
          <small>{role === 'admin' ? 'Sistema estable' : role === 'client' ? 'Tu agenda beauty' : 'Ocupacion al 82%'}</small>
        </div>

        <nav className="sidebar-nav" aria-label="Navegacion principal">
          {navigation.map((item, index) => (
            <button
              className={isItemActive(item, index) ? 'active' : ''}
              key={item.label}
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
          {drawerActions.map((item) => (
            <button type="button" onClick={() => handleNavigate(item.path)} key={item.label}>
              {item.label}
            </button>
          ))}
          <button type="button" onClick={handleLogout}>Cerrar sesion</button>
        </div>

        <div className="sidebar-switcher">
          <small>Workspaces</small>
          <button type="button" onClick={() => handleNavigate(paths.admin)}>Admin</button>
          <button type="button" onClick={() => handleNavigate(paths.artistAgenda)}>Artista</button>
          <button type="button" onClick={() => handleNavigate(paths.client)}>Cliente</button>
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

        {!([paths.artistMarketing].includes(currentPath)) && (
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
          <button className={isItemActive(item, index) ? 'active' : ''} type="button" onClick={() => handleNavigate(item.path)} key={item.label}>
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
