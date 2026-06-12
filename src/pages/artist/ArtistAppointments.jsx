import { useEffect, useState } from 'react'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Input from '../../components/Input'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import { useApp } from '../../contexts/appContextCore'
import {
  deriveMembershipsFromLegacyData,
  getCurrentArtist,
  getMembershipForArtist,
  getStudioForArtist,
} from '../../modules/entities/entitySelectors'

const mockClients = ['Mariana L.', 'Camila R.', 'Ana G.', 'Renata M.']

function ArtistAppointments() {
  const {
    adminState,
    artistServices,
    artistState,
    artistAppointments: realArtistAppointments,
    appointmentState,
    session,
    addArtistAppointment,
    bookSlot,
  } = useApp()
  const activeArtistServices = artistServices.length ? artistServices : [{ name: '', price: 0, duration: '60 min', serviceTier: 'basic' }]
  const [draft, setDraft] = useState({
    client: mockClients[0],
    service: activeArtistServices[0].name,
    date: '2026-05-18',
    time: '10:00',
  })

  useEffect(() => {
    if (!draft.service && artistServices[0]?.name) {
      setDraft((currentDraft) => ({ ...currentDraft, service: artistServices[0].name }))
    }
  }, [artistServices, draft.service])
  const realArtistAppointmentSourceReady = !session.isMockSession && appointmentState.artistLoaded
  const artistAppointmentSource = realArtistAppointmentSourceReady
    ? realArtistAppointments
    : artistState.appointments
  const upcomingAppointments = artistAppointmentSource.filter((appointment) => appointment.status !== 'Completada')
  const pastAppointments = artistAppointmentSource.filter((appointment) => appointment.status === 'Completada')
  const localProfiles = session.user ? [{ ...session.user, id: session.user.id }] : []
  const artistStudioMemberships = deriveMembershipsFromLegacyData({ artists: adminState.artists })
  const selectorArtists = adminState.artists.map((artist) => (
    getMembershipForArtist({
      artistId: artist.id,
      studioId: session.user?.studioId,
      artistStudioMemberships,
    })
      ? { ...artist, profileId: session.user?.id }
      : artist
  ))
  const currentArtist = getCurrentArtist({ session, profiles: localProfiles, artists: selectorArtists }) || selectorArtists[0]
  const currentMembership = getMembershipForArtist({
    artistId: currentArtist?.id,
    artistStudioMemberships,
  })
  const currentStudio = getStudioForArtist({
    artistId: currentArtist?.id,
    studios: adminState.studios,
    artistStudioMemberships,
    preferredStudioId: currentMembership?.studioId,
  })

  const saveAppointment = () => {
    const service = activeArtistServices.find((item) => item.name === draft.service) || activeArtistServices[0]

    addArtistAppointment({
      ...draft,
      artistId: currentArtist?.id,
      studioId: currentStudio?.id || null,
      membershipId: currentMembership?.id || null,
      end: draft.time,
      duration: service.duration,
      room: 'Agenda',
      type: 'appointment',
      status: 'Confirmada',
    })
    bookSlot({
      artistId: currentArtist?.id,
      studioId: currentStudio?.id || null,
      membershipId: currentMembership?.id || null,
      date: draft.date,
      time: draft.time,
      end: draft.time,
      artist: currentArtist?.owner || currentArtist?.name || 'Artista profesional',
      service: draft.service,
      durationMinutes: Number.parseInt(service.duration, 10) || 60,
    })
  }

  return (
    <main className="dashboard-grid artist-grid">
      <Card className="mobile-screen primary-panel">
        <PanelHeader title="Nueva cita" eyebrow="Mock" />
        <div className="form-stack compact-form">
          <label className="input-field">
            <span>Cliente</span>
            <select value={draft.client} onChange={(event) => setDraft({ ...draft, client: event.target.value })}>
              {mockClients.map((client) => <option key={client}>{client}</option>)}
            </select>
          </label>
          <label className="input-field">
            <span>Servicio</span>
            <select value={draft.service} onChange={(event) => setDraft({ ...draft, service: event.target.value })}>
              {activeArtistServices.map((service) => <option key={service.name}>{service.name}</option>)}
            </select>
          </label>
          <Input label="Fecha" type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} />
          <Input label="Hora" type="time" value={draft.time} onChange={(event) => setDraft({ ...draft, time: event.target.value })} />
          <Button className="full-width" onClick={saveAppointment}>Guardar cita</Button>
        </div>
      </Card>

      <Card className="wide-card mobile-screen primary-panel">
        <PanelHeader title="Proximas citas" eyebrow="Agenda" />
        <div className="compact-list">
          {upcomingAppointments.map((appointment) => (
            <div className="list-row elevated-row" key={appointment.id}>
              <div>
                <strong>{appointment.client}</strong>
                <small>{appointment.service} / {appointment.date} / {appointment.time}</small>
              </div>
              <StatusPill tone="success">{appointment.status}</StatusPill>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mobile-screen">
        <PanelHeader title="Citas pasadas" eyebrow="Historial" />
        <div className="compact-list">
          {pastAppointments.map((appointment) => (
            <div className="list-row elevated-row" key={appointment.id}>
              <div>
                <strong>{appointment.client}</strong>
                <small>{appointment.service} / {appointment.date} / {appointment.time}</small>
              </div>
              <StatusPill tone="neutral">{appointment.status}</StatusPill>
            </div>
          ))}
        </div>
      </Card>
    </main>
  )
}

export default ArtistAppointments
