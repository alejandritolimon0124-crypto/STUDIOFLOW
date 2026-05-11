import { paths } from '../routes/paths'
import { isActivePath, navigateTo } from '../routes/routerUtils'
import Button from '../components/Button'

const roleNavigation = {
  admin: [
    { label: 'Dashboard', path: paths.admin },
    { label: 'Artistas', path: paths.admin },
    { label: 'Clientes', path: paths.admin },
    { label: 'Sistema', path: paths.admin },
  ],
  artist: [
    { label: 'Agenda', path: paths.artist },
    { label: 'Citas', path: paths.artist },
    { label: 'Servicios', path: paths.artist },
    { label: 'Clientes', path: paths.artist },
    { label: 'Ajustes', path: paths.artist },
  ],
  client: [
    { label: 'Inicio', path: paths.client },
    { label: 'Citas', path: paths.client },
    { label: 'Explorar', path: paths.client },
    { label: 'Favoritos', path: paths.client },
  ],
}

function DashboardLayout({ children, role, title, subtitle, currentPath }) {
  const navigation = roleNavigation[role]

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand-button sidebar-brand" type="button" onClick={() => navigateTo(paths.artist)}>
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

        <nav className="sidebar-nav" aria-label="Navegacion principal">
          {navigation.map((item) => (
            <button
              className={isActivePath(currentPath, item.path) ? 'active' : ''}
              key={item.label}
              type="button"
              onClick={() => navigateTo(item.path)}
            >
              <span aria-hidden="true"></span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-switcher">
          <small>Vistas demo</small>
          <button type="button" onClick={() => navigateTo(paths.admin)}>Admin</button>
          <button type="button" onClick={() => navigateTo(paths.artist)}>Artista</button>
          <button type="button" onClick={() => navigateTo(paths.client)}>Cliente</button>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div>
            <span className="eyebrow">Studio Flow</span>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          <div className="topbar-actions">
            <Button variant="ghost" onClick={() => navigateTo(paths.login)}>Salir</Button>
            <Button>Nueva cita</Button>
          </div>
        </header>

        {children}
      </div>
    </div>
  )
}

export default DashboardLayout
