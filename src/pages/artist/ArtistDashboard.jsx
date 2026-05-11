import Button from '../../components/Button'
import Card from '../../components/Card'
import MetricCard from '../../components/MetricCard'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import DashboardLayout from '../../layouts/DashboardLayout'
import { artistAppointments, artistProfile, artistServices, recurringClients } from '../../services/mockData'
import { formatCurrency } from '../../utils/formatters'

function ArtistDashboard({ currentPath = '/artist' }) {
  return (
    <DashboardLayout
      currentPath={currentPath}
      role="artist"
      title="Agenda de artista"
      subtitle="Vista operativa para reservas, servicios, clientas e historial."
    >
      <main className="dashboard-grid artist-grid">
        <section className="hero-panel">
          <div>
            <span className="eyebrow">{artistProfile.location}</span>
            <h2>{artistProfile.name}</h2>
            <p>Tu dia esta equilibrado: mayor demanda en lashes y cejas, con espacios libres al final de la tarde.</p>
          </div>
          <div className="rating-chip">{artistProfile.rating} rating</div>
        </section>

        <MetricCard label="Citas hoy" value="8" trend="+2 vs ayer" />
        <MetricCard label="Ingresos estimados" value="$7.8K" trend="+14%" tone="nude" />
        <MetricCard label="Ocupacion" value="82%" trend="Alta demanda" tone="sage" />

        <Card className="calendar-card">
          <PanelHeader title="Agenda visual" eyebrow="Lunes 11 mayo" action={<Button variant="ghost">Filtrar</Button>} />
          <div className="timeline">
            {artistAppointments.map((item) => (
              <article className="timeline-item" key={`${item.time}-${item.client}`}>
                <time>{item.time}</time>
                <div>
                  <strong>{item.client}</strong>
                  <span>{item.service}</span>
                </div>
                <StatusPill tone={item.status === 'Por llegar' ? 'warm' : 'success'}>{item.status}</StatusPill>
              </article>
            ))}
          </div>
        </Card>

        <Card>
          <PanelHeader title="Proximas citas" eyebrow="Hoy" />
          <div className="compact-list">
            {artistAppointments.slice(0, 3).map((item) => (
              <div className="list-row" key={item.client}>
                <div>
                  <strong>{item.client}</strong>
                  <small>{item.service}</small>
                </div>
                <span>{item.time}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <PanelHeader title="Servicios" eyebrow="Menu activo" />
          <div className="service-list">
            {artistServices.map((service) => (
              <div className="service-row" key={service.name}>
                <div>
                  <strong>{service.name}</strong>
                  <small>{service.duration} · {service.bookings} reservas</small>
                </div>
                <span>{formatCurrency(service.price)}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <PanelHeader title="Historial" eyebrow="Ultimos 30 dias" />
          <div className="history-chart">
            <span style={{ height: '45%' }}></span>
            <span style={{ height: '70%' }}></span>
            <span style={{ height: '58%' }}></span>
            <span style={{ height: '88%' }}></span>
            <span style={{ height: '76%' }}></span>
            <span style={{ height: '92%' }}></span>
          </div>
        </Card>

        <Card>
          <PanelHeader title="Clientes recurrentes" eyebrow="Lealtad" />
          <div className="compact-list">
            {recurringClients.map((client) => (
              <div className="list-row" key={client.name}>
                <div>
                  <strong>{client.name}</strong>
                  <small>{client.visits} visitas</small>
                </div>
                <span>{client.next}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="settings-card">
          <PanelHeader title="Configuraciones" eyebrow="Workspace" />
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
      </main>
    </DashboardLayout>
  )
}

export default ArtistDashboard
