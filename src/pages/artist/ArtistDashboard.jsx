import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AgendaCard from '../../components/AgendaCard'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Input from '../../components/Input'
import MetricCard from '../../components/MetricCard'
import Modal from '../../components/Modal'
import PanelHeader from '../../components/PanelHeader'
import StatsCard from '../../components/StatsCard'
import { useApp } from '../../contexts/appContextCore'
import { paths } from '../../routes/paths'
import { artistAppointments, artistProfile, artistServices, recurringClients } from '../../services/mockData'
import { formatCurrency } from '../../utils/formatters'

function ArtistDashboard({ view = 'agenda' }) {
  const navigate = useNavigate()
  const { artistState, addArtistAppointment, bookSlot } = useApp()
  const [showAppointmentForm, setShowAppointmentForm] = useState(false)
  const [appointmentDraft, setAppointmentDraft] = useState({
    client: artistState.clients[0]?.name || 'Mariana L.',
    service: artistServices[0].name,
    date: '2026-05-18',
    time: '10:00',
  })

  const saveAppointment = () => {
    const service = artistServices.find((item) => item.name === appointmentDraft.service) || artistServices[0]

    addArtistAppointment({
      ...appointmentDraft,
      end: appointmentDraft.time,
      duration: service.duration,
      room: 'Agenda',
      status: 'Confirmada',
    })
    bookSlot({
      date: appointmentDraft.date,
      time: appointmentDraft.time,
      end: appointmentDraft.time,
      artist: 'Valeria Moon',
      service: appointmentDraft.service,
      durationMinutes: Number.parseInt(service.duration, 10) || 60,
    })
    setShowAppointmentForm(false)
  }

  return (
    <main className={`dashboard-grid artist-grid view-${view}`}>
        {view === 'agenda' && (
          <>
            <section className="hero-panel studio-hero mobile-screen">
              <div>
                <span className="eyebrow">{artistProfile.location}</span>
                <h2>{artistProfile.name}</h2>
                <p>Tu agenda esta equilibrada, con mayor demanda en lashes y cejas durante la tarde.</p>
                <div className="hero-actions">
                  <Button onClick={() => setShowAppointmentForm((current) => !current)}>Agregar cita</Button>
                  <Button variant="ghost" onClick={() => navigate(paths.artistSchedule)}>Editar horario</Button>
                </div>
              </div>
              <div className="hero-summary">
                <span>{artistProfile.plan}</span>
                <strong>{artistProfile.occupancy}</strong>
                <small>ocupacion de hoy</small>
              </div>
            </section>

            <MetricCard label="Citas hoy" value="8" trend="+2 vs ayer" className="mobile-compact" />
            <MetricCard label="Ingresos estimados" value="$7.8K" trend="+14%" tone="nude" className="mobile-compact" />
            <MetricCard label="Rating promedio" value={artistProfile.rating} trend="312 reviews" tone="sage" className="mobile-compact" />

            {showAppointmentForm && (
              <Card className="mobile-screen primary-panel">
                <PanelHeader title="Nueva cita" eyebrow="Mock" />
                <div className="form-stack compact-form">
                  <label className="input-field">
                    <span>Cliente</span>
                    <select value={appointmentDraft.client} onChange={(event) => setAppointmentDraft({ ...appointmentDraft, client: event.target.value })}>
                      {artistState.clients.map((client) => <option key={client.id}>{client.name}</option>)}
                    </select>
                  </label>
                  <label className="input-field">
                    <span>Servicio</span>
                    <select value={appointmentDraft.service} onChange={(event) => setAppointmentDraft({ ...appointmentDraft, service: event.target.value })}>
                      {artistServices.map((service) => <option key={service.name}>{service.name}</option>)}
                    </select>
                  </label>
                  <Input label="Fecha" type="date" value={appointmentDraft.date} onChange={(event) => setAppointmentDraft({ ...appointmentDraft, date: event.target.value })} />
                  <Input label="Hora" type="time" value={appointmentDraft.time} onChange={(event) => setAppointmentDraft({ ...appointmentDraft, time: event.target.value })} />
                  <Button className="full-width" onClick={saveAppointment}>Guardar cita</Button>
                </div>
              </Card>
            )}

            <Card className="calendar-card mobile-screen primary-panel">
              <PanelHeader title="Agenda visual" eyebrow="Lunes 11 mayo" action={<Button variant="ghost" size="sm">Filtrar</Button>} />
              <div className="agenda-rules-strip">
                <span>Intervalo 15 min</span>
                <span>Anticipacion minima 2 h</span>
                <span>Descanso 14:00 - 15:00</span>
              </div>
              <div className="day-strip">
                {['Lun', 'Mar', 'Mie', 'Jue', 'Vie'].map((day, index) => (
                  <button className={index === 0 ? 'active' : ''} type="button" key={day}>
                    <span>{day}</span>
                    <strong>{11 + index}</strong>
                  </button>
                ))}
              </div>
              <div className="timeline">
                {artistState.appointments.map((item, index) => (
                  <AgendaCard
                    accent={index % 2 === 0 ? 'rose' : 'nude'}
                    key={`${item.time}-${item.client}`}
                    time={`${item.time} - ${item.end}`}
                    title={item.client}
                    subtitle={`${item.service} / ${item.duration} / ${item.room}`}
                    status={item.status}
                    type={item.type}
                  />
                ))}
              </div>
            </Card>
          </>
        )}

        {view === 'citas' && (
          <>
            <Card className="mobile-screen primary-panel">
              <PanelHeader title="Proximas citas" eyebrow="Hoy" action={<Button size="sm">Nueva</Button>} />
              <div className="compact-list">
                {artistAppointments.map((item) => (
                  <div className="list-row elevated-row" key={item.client}>
                    <div>
                      <strong>{item.client}</strong>
                      <small>{item.service} / {item.room}</small>
                    </div>
                    <span>{item.time}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="modal-preview-card">
              <PanelHeader title="Crear cita" eyebrow="Flujo preparado" />
              <Modal
                title="Nueva cita"
                description="Estructura visual lista para conectar agenda real, servicios y clientas."
                primaryAction="Crear cita"
              />
            </Card>
          </>
        )}

        {view === 'servicios' && (
          <>
            <Card className="mobile-screen primary-panel">
              <PanelHeader title="Servicios" eyebrow="Menu activo" />
              <div className="service-list">
                {artistServices.map((service) => (
                  <div className="service-row" key={service.name}>
                    <div>
                      <strong>{service.name}</strong>
                      <small>{service.duration} / {service.bookings} reservas</small>
                    </div>
                    <div className="service-price">
                      <span>{formatCurrency(service.price)}</span>
                      <small>{service.demand}</small>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            <StatsCard title="Historial" value="$42.6K" caption="Ingresos estimados de los ultimos 30 dias">
              <div className="history-chart">
                <span style={{ height: '45%' }}></span>
                <span style={{ height: '70%' }}></span>
                <span style={{ height: '58%' }}></span>
                <span style={{ height: '88%' }}></span>
                <span style={{ height: '76%' }}></span>
                <span style={{ height: '92%' }}></span>
              </div>
            </StatsCard>
          </>
        )}

        {view === 'clientes' && (
          <Card className="mobile-screen primary-panel">
            <PanelHeader title="Clientes recurrentes" eyebrow="Lealtad" />
            <div className="compact-list">
              {recurringClients.map((client) => (
                <div className="list-row elevated-row" key={client.name}>
                  <div>
                    <strong>{client.name}</strong>
                    <small>{client.visits} visitas / {client.value}</small>
                  </div>
                  <span>{client.next}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {view === 'ajustes' && (
          <Card className="settings-card mobile-screen primary-panel">
            <PanelHeader title="Configuraciones rapidas" eyebrow="Workspace" />
            <label className="toggle-row">
              Confirmacion automatica
              <input type="checkbox" defaultChecked />
            </label>
            <label className="toggle-row">
              Recordatorios a clientas
              <input type="checkbox" defaultChecked />
            </label>
            <label className="toggle-row">
              Pausa de reservas
              <input type="checkbox" />
            </label>
          </Card>
        )}
    </main>
  )
}

export default ArtistDashboard
