import Card from '../../components/Card'
import MetricCard from '../../components/MetricCard'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import Button from '../../components/Button'
import { useNavigate } from 'react-router-dom'
import { paths } from '../../routes/paths'
import { adminMetrics, managedArtists, managedClients, systemStatus, artistAppointments } from '../../services/mockData'
import { generateOwnerDashboardSummary } from '../../modules/business/businessMetricsEngine'

function AdminDashboard() {
  const navigate = useNavigate()

  // Business metrics calculation
  const businessSummary = generateOwnerDashboardSummary(artistAppointments, [])

  return (
    <main className="dashboard-grid admin-grid">
        <section className="hero-panel admin-hero">
          <div>
            <span className="eyebrow">Studio Flow HQ</span>
            <h2>Operacion global</h2>
            <p>Supervisa actividad, crecimiento y salud de la plataforma desde una vista ejecutiva preparada para datos reales.</p>
          </div>
          <div className="hero-summary">
            <span>Uptime visual</span>
            <strong>99.9%</strong>
            <small>demo preparada</small>
          </div>
        </section>

        {adminMetrics.map((metric, index) => (
          <MetricCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            trend={metric.trend}
            tone={index % 2 === 0 ? 'rose' : 'nude'}
          />
        ))}

        <MetricCard
          label="Ingresos totales"
          value={`$${businessSummary.totalRevenue.toLocaleString()}`}
          trend="+18%"
          tone="rose"
        />
        <MetricCard
          label="Ingresos plataforma"
          value={`$${businessSummary.platformRevenue.toLocaleString()}`}
          trend="+15%"
          tone="sage"
        />
        <MetricCard
          label="Eventos con riesgo"
          value={businessSummary.flaggedAppointments}
          trend={businessSummary.flaggedAppointments > 0 ? "Revisar" : "Limpio"}
          tone={businessSummary.flaggedAppointments > 0 ? "warm" : "success"}
        />

        <Card className="wide-card">
          <PanelHeader title="Business Insights" eyebrow="Vista ejecutiva" />
          <div className="insights-stack">
            {businessSummary.insights.slice(0, 3).map((insight, index) => (
              <div key={index} className="insight-item">
                <div className="insight-header">
                  <h4>{insight.title}</h4>
                  <span className={`insight-badge priority-${insight.priority}`}>
                    {insight.priority === 'critical' && '🔴'}
                    {insight.priority === 'high' && '🟠'}
                    {insight.priority === 'medium' && '🟡'}
                    {insight.priority === 'low' && '🟢'}
                  </span>
                </div>
                <p>{insight.message}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="wide-card">
          <PanelHeader title="Gestion de artistas" eyebrow="Operaciones" action={<Button size="sm" onClick={() => navigate(paths.adminArtists)}>Abrir</Button>} />
          <div className="data-table">
            <div className="table-head">
              <span>Estudio</span>
              <span>Ciudad</span>
              <span>Plan</span>
              <span>Ingresos</span>
              <span>Estado</span>
            </div>
            {managedArtists.map((artist) => (
              <div className="table-row" key={artist.name}>
                <strong>{artist.name}</strong>
                <span>{artist.city}</span>
                <span>{artist.plan}</span>
                <span>{artist.revenue}</span>
                <StatusPill tone={artist.status === 'Activo' ? 'success' : 'warm'}>{artist.status}</StatusPill>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <PanelHeader title="Gestion de clientes" eyebrow="Comunidad" action={<Button size="sm" onClick={() => navigate(paths.adminClients)}>Abrir</Button>} />
          <div className="compact-list">
            {managedClients.map((client) => (
              <div className="list-row elevated-row" key={client.name}>
                <div>
                  <strong>{client.name}</strong>
                  <small>{client.appointments} citas / {client.spend}</small>
                </div>
                <StatusPill tone={client.status === 'VIP' ? 'rose' : 'neutral'}>{client.status}</StatusPill>
              </div>
            ))}
          </div>
        </Card>

        <Card className="system-card">
          <PanelHeader title="Estado del sistema" eyebrow="Infraestructura futura" />
          <div className="system-stack">
            {systemStatus.map((item) => (
              <div className="system-row" key={item.label}>
                <div>
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </div>
                <StatusPill tone={item.tone}>{item.status}</StatusPill>
              </div>
            ))}
          </div>
        </Card>
    </main>
  )
}

export default AdminDashboard
