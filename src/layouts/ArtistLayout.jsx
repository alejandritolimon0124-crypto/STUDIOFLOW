import { useEffect } from 'react'
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

const publicationCopy = {
  visible: {
    label: 'Publicado en Marketplace',
    tone: 'success',
    title: 'Tu perfil independiente ya esta publicado en Marketplace.',
    body: 'Las clientas pueden descubrir tus servicios publicados desde el marketplace de Studio Flow.',
  },
  suspended: {
    label: 'Publicacion pausada',
    tone: 'warning',
    title: 'Tu publicacion independiente esta pausada.',
    body: 'Puedes seguir preparando perfil y servicios mientras el equipo revisa la publicacion.',
  },
  default: {
    label: 'Perfil no publicado',
    tone: 'neutral',
    title: 'Tu perfil independiente aun no esta publicado en Marketplace.',
    body: 'Completa perfil y servicios para que Platform Owner pueda publicarlo.',
  },
}

function ArtistLayout() {
  const { pathname } = useLocation()
  const {
    adminState,
    session,
    publicationState,
    loadIndependentArtistPublicationReadiness,
  } = useApp()
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
  const artistId = primaryArtist?.id || session.artist?.id || session.user?.artistId
  const hasStudioContext = Boolean(primaryMembership?.studioId || currentStudio?.id)
  const isPendingExperience = hasStudioContext && !studioAccess.publicAgenda
  const publicationReadiness = artistId ? publicationState.readinessByArtistId?.[artistId] : null
  const independentPublicationStatus = publicationReadiness?.publicationStatus || 'not_published'
  const independentPublicationCopy = publicationCopy[independentPublicationStatus] || publicationCopy.default

  useEffect(() => {
    if (session.isMockSession || session.role !== 'artist' || hasStudioContext || !artistId) return

    loadIndependentArtistPublicationReadiness(artistId)
  }, [
    artistId,
    hasStudioContext,
    loadIndependentArtistPublicationReadiness,
    session.isMockSession,
    session.role,
  ])

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
        {!hasStudioContext && (
          <section className="studio-validation-banner">
            <div>
              <span className="eyebrow">Marketplace independiente</span>
              <h3>{independentPublicationCopy.title}</h3>
              <p>{independentPublicationCopy.body}</p>
            </div>
            <StatusPill tone={independentPublicationCopy.tone}>
              {independentPublicationCopy.label}
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
