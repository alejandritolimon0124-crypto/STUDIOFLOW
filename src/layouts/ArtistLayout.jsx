import { NavLink, Outlet, useLocation } from 'react-router-dom'
import DashboardLayout from './DashboardLayout'
import { paths } from '../routes/paths'
import StatusPill from '../components/StatusPill'
import { useApp } from '../contexts/appContextCore'
import { getStudioAccess, getStudioStatusLabel, getStudioStatusTone } from '../modules/governance/studioGovernance'
import {
  deriveMembershipsFromLegacyData,
  getCurrentArtist,
  getCurrentProfile,
  getCurrentStudio,
  getMembershipForArtist,
} from '../modules/entities/entitySelectors'

const copyByPath = {
  [paths.artist]: ['', ''],
  [paths.artistAppointments]: ['Citas', 'Gestiona reservas confirmadas y solicitudes pendientes.'],
  [paths.artistServices]: ['Servicios', 'Crea, edita, activa o suspende servicios de tu menu.'],
  [paths.artistSchedule]: ['Horarios', 'Define disponibilidad, descansos, bloqueos y reglas de agenda.'],
  [paths.artistClients]: ['Clientas', 'Seguimiento de clientas recurrentes y valor historico.'],
  [paths.artistMarketing]: ['Marketing & Growth', 'Automatiza promociones, fidelización y crecimiento inteligente.'],
  [paths.artistSettings]: ['MI PERFIL', 'Administra la fuente profesional que alimentara tu Perfil Publico.'],
}

function ArtistLayout() {
  const { pathname } = useLocation()
  const { adminState, session } = useApp()
  const [title, subtitle] = copyByPath[pathname] || copyByPath[paths.artist]
  const localProfiles = session.user ? [{ ...session.user, id: session.user.id }] : []
  const currentProfile = getCurrentProfile({ session, profiles: localProfiles })
  const artistStudioMemberships = deriveMembershipsFromLegacyData({ artists: adminState.artists })
  const selectorArtists = adminState.artists.map((artist) => (
    getMembershipForArtist({
      artistId: artist.id,
      studioId: session.user?.studioId,
      artistStudioMemberships,
    })
      ? { ...artist, profileId: currentProfile?.id }
      : artist
  ))
  const primaryArtist = getCurrentArtist({ session, profiles: localProfiles, artists: selectorArtists }) || selectorArtists[0]
  const primaryMembership = getMembershipForArtist({
    artistId: primaryArtist?.id,
    artistStudioMemberships,
  })
  const currentStudio = getCurrentStudio({
    session,
    profiles: localProfiles,
    studios: adminState.studios,
    artists: selectorArtists,
    artistStudioMemberships,
    activeStudioId: primaryMembership?.studioId,
  }) || adminState.studios[0]
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
          <NavLink to="/artist/settings">MI PERFIL</NavLink>
        </nav>
      </div>
    </DashboardLayout>
  )
}

export default ArtistLayout
