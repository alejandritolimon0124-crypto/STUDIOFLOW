import { NavLink, Outlet, useLocation } from 'react-router-dom'
import DashboardLayout from './DashboardLayout'
import { paths } from '../routes/paths'

const copyByPath = {
  [paths.artist]: ['Agenda de artista', 'Tu dia, proximas citas y acciones rapidas.'],
  [paths.artistAppointments]: ['Citas', 'Gestiona reservas confirmadas y solicitudes pendientes.'],
  [paths.artistServices]: ['Servicios', 'Crea, edita, activa o suspende servicios de tu menu.'],
  [paths.artistSchedule]: ['Horarios', 'Define disponibilidad, descansos, bloqueos y reglas de agenda.'],
  [paths.artistClients]: ['Clientas', 'Seguimiento de clientas recurrentes y valor historico.'],
  [paths.artistSettings]: ['Ajustes', 'Configuraciones rapidas del workspace.'],
}

function ArtistLayout() {
  const { pathname } = useLocation()
  const [title, subtitle] = copyByPath[pathname] || copyByPath[paths.artist]

  return (
    <DashboardLayout role="artist" title={title} subtitle={subtitle} showMobileAppbar={false}>
      <div className="role-layout-shell">
        <Outlet />
        <nav className="role-bottom-nav" aria-label="Navegacion de artista">
          <NavLink to="/artist">Inicio</NavLink>
          <NavLink to="/artist/services">Servicios</NavLink>
          <NavLink to="/artist/schedule">Agenda</NavLink>
          <NavLink to="/artist/appointments">Citas</NavLink>
          <NavLink to="/artist/clients">Clientes</NavLink>
        </nav>
      </div>
    </DashboardLayout>
  )
}

export default ArtistLayout
