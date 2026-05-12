import { useNavigate } from 'react-router-dom'
import AgendaCard from '../../components/AgendaCard'
import Button from '../../components/Button'
import Card from '../../components/Card'
import MetricCard from '../../components/MetricCard'
import Modal from '../../components/Modal'
import PanelHeader from '../../components/PanelHeader'
import StatsCard from '../../components/StatsCard'
import { paths } from '../../routes/paths'
import { artistAppointments, artistProfile, artistServices, recurringClients } from '../../services/mockData'
import { formatCurrency } from '../../utils/formatters'

function ArtistDashboard({ view = 'agenda' }) {
  const navigate = useNavigate()
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
                  <Button onClick={() => navigate(paths.artistAppointments)}>Agregar cita</Button>
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
                {artistAppointments.map((item, index) => (
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
