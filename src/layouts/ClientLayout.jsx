import { NavLink, Outlet, useLocation } from 'react-router-dom'
import DashboardLayout from './DashboardLayout'
import { paths } from '../routes/paths'

const copyByPath = {
  [paths.client]: ['Mi belleza', 'Reserva, revisa tus citas y descubre artistas premium.'],
  [paths.clientAppointments]: ['Mis citas', 'Tus proximas reservas y servicios confirmados.'],
  [paths.clientSearch]: ['Explorar', 'Encuentra artistas, servicios y horarios cerca de ti.'],
  [paths.clientFavorites]: ['Favoritos', 'Tus estudios y artistas guardadas.'],
}

function ClientLayout() {
  const { pathname } = useLocation()
  const [title, subtitle] = copyByPath[pathname] || copyByPath[paths.client]

  return (
    <DashboardLayout role="client" title={title} subtitle={subtitle} showMobileAppbar={false}>
      <div className="role-layout-shell">
        <Outlet />
        <nav className="role-bottom-nav" aria-label="Navegacion de cliente">
          <NavLink to="/client">Inicio</NavLink>
          <NavLink to="/client/search">Buscar</NavLink>
          <NavLink to="/client/appointments">Citas</NavLink>
          <NavLink to="/client/favorites">Favoritos</NavLink>
          <NavLink to="/client/profile">Perfil</NavLink>
        </nav>
      </div>
    </DashboardLayout>
  )
}

export default ClientLayout
