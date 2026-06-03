import { NavLink, Outlet, useLocation } from 'react-router-dom'
import DashboardLayout from './DashboardLayout'
import { paths } from '../routes/paths'
import StatusPill from '../components/StatusPill'
import { useApp } from '../contexts/appContextCore'
import { getStudioAccess, getStudioStatusLabel, getStudioStatusTone } from '../modules/governance/studioGovernance'

const copyByPath = {
  [paths.artist]: ['Agenda de artista', 'Tu dia, proximas citas y acciones rapidas.'],
  [paths.artistAppointments]: ['Citas', 'Gestiona reservas confirmadas y solicitudes pendientes.'],
  [paths.artistServices]: ['Servicios', 'Crea, edita, activa o suspende servicios de tu menu.'],
  [paths.artistSchedule]: ['Horarios', 'Define disponibilidad, descansos, bloqueos y reglas de agenda.'],
  [paths.artistClients]: ['Clientas', 'Seguimiento de clientas recurrentes y valor historico.'],
  [paths.artistMarketing]: ['Marketing & Growth', 'Automatiza promociones, fidelización y crecimiento inteligente.'],
  [paths.artistSettings]: ['Mi perfil', 'Administra la fuente profesional que alimentara tu Perfil Publico.'],
}

function ArtistLayout() {
  const { pathname } = useLocation()
  const { adminState, session } = useApp()
  const [title, subtitle] = copyByPath[pathname] || copyByPath[paths.artist]
  const primaryArtist = adminState.artists.find((artist) => artist.studioId === session.user?.studioId) || adminState.artists[0]
  const currentStudio = adminState.studios.find((studio) => studio.id === primaryArtist?.studioId) || adminState.studios[0]
  const studioAccess = getStudioAccess(currentStudio)
  const isPendingExperience = !studioAccess.publicAgenda

  return (
    <DashboardLayout role="artist" title={title} subtitle={subtitle} showMobileAppbar={false}>
      <div className="role-layout-shell">
        {isPendingExperience && (
          <section className="studio-validation-banner">
            <div>
              <span className="eyebrow">Studio Flow Curated Access</span>
              <h3>Tu estudio esta siendo validado para mantener la calidad premium de Studio Flow.</h3>
              <p>Puedes preparar perfil, branding, horarios y servicios mientras el equipo revisa la experiencia completa.</p>
            </div>
            <StatusPill tone={getStudioStatusTone(currentStudio?.studioStatus)}>
              {getStudioStatusLabel(currentStudio?.studioStatus)}
            </StatusPill>
          </section>
        )}
        <Outlet />
        <nav className="role-bottom-nav" aria-label="Navegacion de artista">
          <NavLink to="/artist">Inicio</NavLink>
          <NavLink to="/artist/services">Servicios</NavLink>
          <NavLink to="/artist/schedule">Agenda</NavLink>
          <NavLink to="/artist/appointments">Citas</NavLink>
          <NavLink to="/artist/settings">Mi Perfil</NavLink>
        </nav>
      </div>
    </DashboardLayout>
  )
}

export default ArtistLayout
