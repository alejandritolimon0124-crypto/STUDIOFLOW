import { NavLink, Outlet, useLocation } from 'react-router-dom'
import DashboardLayout from './DashboardLayout'
import { paths } from '../routes/paths'

const copyByPath = {
  [paths.admin]: ['Panel administrativo', 'Metricas globales, gestion de artistas, clientes y estado del sistema.'],
  [paths.adminArtists]: ['Artistas', 'Gestiona artistas, estados y perfiles dentro de Studio Flow.'],
  [paths.adminClients]: ['Clientes', 'Gestiona clientas, perfiles, historial y estado de cuenta.'],
  [paths.adminSystem]: ['Sistema', 'Estado operativo y modulos listos para conectar.'],
}

function AdminLayout() {
  const { pathname } = useLocation()
  const [title, subtitle] = copyByPath[pathname] || copyByPath[paths.admin]

  return (
    <DashboardLayout role="admin" title={title} subtitle={subtitle} showMobileAppbar={false}>
      <div className="role-layout-shell">
        <Outlet />
        <nav className="role-bottom-nav" aria-label="Navegacion de admin">
          <NavLink to="/admin">Inicio</NavLink>
          <NavLink to="/admin/artists">Artistas</NavLink>
          <NavLink to="/admin/clients">Clientes</NavLink>
          <NavLink to="/admin/system">Sistema</NavLink>
        </nav>
      </div>
    </DashboardLayout>
  )
}

export default AdminLayout
