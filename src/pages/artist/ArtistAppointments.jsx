import { useState } from 'react'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Input from '../../components/Input'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import { useApp } from '../../contexts/appContextCore'
import { artistServices } from '../../services/mockData'

const mockClients = ['Mariana L.', 'Camila R.', 'Ana G.', 'Renata M.']

function ArtistAppointments() {
  const { artistState, addArtistAppointment, bookSlot } = useApp()
  const [draft, setDraft] = useState({
    client: mockClients[0],
    service: artistServices[0].name,
    date: '2026-05-18',
    time: '10:00',
  })
  const upcomingAppointments = artistState.appointments.filter((appointment) => appointment.status !== 'Completada')
  const pastAppointments = artistState.appointments.filter((appointment) => appointment.status === 'Completada')

  const saveAppointment = () => {
    const service = artistServices.find((item) => item.name === draft.service) || artistServices[0]

    addArtistAppointment({
      ...draft,
      end: draft.time,
      duration: service.duration,
      room: 'Agenda',
      type: 'appointment',
      status: 'Confirmada',
    })
    bookSlot({
      date: draft.date,
      time: draft.time,
      end: draft.time,
      artist: 'Valeria Moon',
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
              {artistServices.map((service) => <option key={service.name}>{service.name}</option>)}
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
