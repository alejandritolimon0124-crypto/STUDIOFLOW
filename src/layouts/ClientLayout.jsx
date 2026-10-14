import { NavLink, Outlet, useLocation } from 'react-router-dom'
import DashboardLayout from './DashboardLayout'
import { paths } from '../routes/paths'

const copyByPath = {
  [paths.client]: ['', ''],
  [paths.clientAppointments]: ['', ''],
  [paths.clientSearch]: ['', ''],
  [paths.clientFavorites]: ['Favoritos', 'Tus estudios y artistas guardadas.'],
  [paths.clientRewards]: ['', ''],
  [paths.clientFlowPoints]: ['', ''],
  [paths.clientProfile]: ['', ''],
}

function ClientLayout() {
  const { pathname } = useLocation()
  const [title, subtitle] = copyByPath[pathname] || copyByPath[paths.client]

  return (
    <DashboardLayout role="client" title={title} subtitle={subtitle} showMobileAppbar={false}>
      <div className="role-layout-shell">
        <Outlet />
        <nav className="role-bottom-nav" aria-label="Navegacion de cliente">
          <NavLink to={paths.client}>Inicio</NavLink>
          <NavLink to={paths.clientSearch}>Buscar</NavLink>
          <NavLink to={paths.clientFlowPoints} className="client-fp-nav" aria-label="FlowPoints">✦ <span>FP</span></NavLink>
          <NavLink to={paths.clientAppointments} className="client-reviews-nav"><span>Citas<br />y reseñas</span></NavLink>
          <NavLink to={paths.clientFavorites}>Favoritos</NavLink>
        </nav>
      </div>
    </DashboardLayout>
  )
}

export default ClientLayout
