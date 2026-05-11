import Card from '../../components/Card'
import MetricCard from '../../components/MetricCard'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import DashboardLayout from '../../layouts/DashboardLayout'
import { adminMetrics, managedArtists, managedClients } from '../../services/mockData'

function AdminDashboard({ currentPath = '/admin' }) {
  return (
    <DashboardLayout
      currentPath={currentPath}
      role="admin"
      title="Panel administrativo"
      subtitle="Metricas globales, gestion de artistas, clientes y estado del sistema."
    >
      <main className="dashboard-grid admin-grid">
        {adminMetrics.map((metric, index) => (
          <MetricCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            trend={metric.trend}
            tone={index % 2 === 0 ? 'rose' : 'nude'}
          />
        ))}

        <Card className="wide-card">
          <PanelHeader title="Gestion de artistas" eyebrow="Operaciones" />
          <div className="data-table">
            <div className="table-head">
              <span>Estudio</span>
              <span>Ciudad</span>
              <span>Plan</span>
              <span>Estado</span>
            </div>
            {managedArtists.map((artist) => (
              <div className="table-row" key={artist.name}>
                <strong>{artist.name}</strong>
                <span>{artist.city}</span>
                <span>{artist.plan}</span>
                <StatusPill tone={artist.status === 'Activo' ? 'success' : 'warm'}>{artist.status}</StatusPill>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <PanelHeader title="Gestion de clientes" eyebrow="Comunidad" />
          <div className="compact-list">
            {managedClients.map((client) => (
              <div className="list-row" key={client.name}>
                <div>
                  <strong>{client.name}</strong>
                  <small>{client.appointments} citas</small>
                </div>
                <StatusPill tone={client.status === 'VIP' ? 'rose' : 'neutral'}>{client.status}</StatusPill>
              </div>
            ))}
          </div>
        </Card>

        <Card className="system-card">
          <PanelHeader title="Estado del sistema" eyebrow="Infraestructura futura" />
          <div className="system-row">
            <span>API</span>
            <StatusPill tone="success">Preparada</StatusPill>
          </div>
          <div className="system-row">
            <span>Supabase</span>
            <StatusPill tone="neutral">Pendiente</StatusPill>
          </div>
          <div className="system-row">
            <span>Pagos</span>
            <StatusPill tone="neutral">Pendiente</StatusPill>
          </div>
          <div className="system-row">
            <span>Autenticacion</span>
            <StatusPill tone="neutral">Pendiente</StatusPill>
          </div>
        </Card>
      </main>
    </DashboardLayout>
  )
}

export default AdminDashboard
