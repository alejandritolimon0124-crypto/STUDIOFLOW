import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { paths } from '../routes/paths'
import { isActivePath } from '../routes/routerUtils'
import Button from '../components/Button'

const roleNavigation = {
  admin: [
    { label: 'Dashboard', path: paths.admin },
    { label: 'Artistas', path: paths.admin },
    { label: 'Clientes', path: paths.admin },
    { label: 'Sistema', path: paths.admin },
  ],
  artist: [
    { label: 'Agenda', path: paths.artistAgenda },
    { label: 'Citas', path: paths.artistAppointments },
    { label: 'Servicios', path: paths.artistServices },
    { label: 'Clientes', path: paths.artistClients },
    { label: 'Ajustes', path: paths.artistSettings },
  ],
  client: [
    { label: 'Inicio', path: paths.client },
    { label: 'Citas', path: paths.clientAppointments },
    { label: 'Explorar', path: paths.clientExplore },
    { label: 'Favoritos', path: paths.clientFavorites },
  ],
}

function DashboardLayout({ children, role, title, subtitle }) {
  const navigation = roleNavigation[role]
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const currentPath = location.pathname
  const bottomNavigation = role === 'admin'
    ? [
        { label: 'Admin', path: paths.admin },
        { label: 'Artista', path: paths.artistAgenda },
        { label: 'Cliente', path: paths.client },
      ]
    : navigation.slice(0, 4)

  const handleNavigate = (path) => {
    navigate(path)
    setIsMenuOpen(false)
  }

  const isItemActive = (item, index) => {
    if (role === 'admin') return index === 0 && currentPath === paths.admin
    if (item.path === paths.artistAgenda && currentPath === paths.artist) return true
    return isActivePath(currentPath, item.path)
  }

  return (
    <div className={`app-shell ${isMenuOpen ? 'menu-open' : ''}`}>
      <button className="sidebar-backdrop" type="button" aria-label="Cerrar menu" onClick={() => setIsMenuOpen(false)}></button>

      <aside className="sidebar">
        <button className="brand-button sidebar-brand" type="button" onClick={() => handleNavigate(role === 'client' ? paths.client : paths.artistAgenda)}>
          <span>SF</span>
          Studio Flow
        </button>

        <div className="sidebar-profile">
          <div className="avatar">VM</div>
          <div>
            <strong>{role === 'admin' ? 'Studio Flow HQ' : role === 'client' ? 'Mariana Lopez' : 'Valeria Moon'}</strong>
            <small>{role === 'admin' ? 'Administrador' : role === 'client' ? 'Clienta premium' : 'Artista Pro'}</small>
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

        <div className="sidebar-switcher">
          <small>Workspaces</small>
          <button type="button" onClick={() => handleNavigate(paths.admin)}>Admin</button>
          <button type="button" onClick={() => handleNavigate(paths.artistAgenda)}>Artista</button>
          <button type="button" onClick={() => handleNavigate(paths.client)}>Cliente</button>
        </div>
      </aside>

      <div className="main-shell">
        <header className="mobile-appbar">
          <button className="menu-button" type="button" aria-label="Abrir menu" onClick={() => setIsMenuOpen(true)}>
            <span></span>
            <span></span>
          </button>
          <button className="brand-button" type="button" onClick={() => handleNavigate(role === 'client' ? paths.client : paths.artistAgenda)}>
            <span>SF</span>
            Studio Flow
          </button>
          <button className="avatar mini" type="button" onClick={() => setIsMenuOpen(true)}>
            {role === 'admin' ? 'HQ' : role === 'client' ? 'ML' : 'VM'}
          </button>
        </header>

        <header className="topbar">
          <div>
            <span className="eyebrow">Studio Flow</span>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          <div className="topbar-actions">
            <Button variant="ghost" onClick={() => handleNavigate(paths.login)}>Salir</Button>
            <Button onClick={() => handleNavigate(role === 'client' ? paths.clientExplore : paths.artistAppointments)}>
              {role === 'client' ? 'Reservar' : 'Nueva cita'}
            </Button>
          </div>
        </header>

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
