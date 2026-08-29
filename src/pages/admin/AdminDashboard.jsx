import { useNavigate } from 'react-router-dom'
import Button from '../../components/Button'
import Card from '../../components/Card'
import MetricCard from '../../components/MetricCard'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import { useApp } from '../../contexts/appContextCore'
import { paths } from '../../routes/paths'

function isActiveStatus(value = '') {
  return ['active', 'activo', 'aprobado', 'approved'].includes(String(value).toLowerCase())
}

function isSuspendedStatus(value = '') {
  return ['suspended', 'suspendido', 'inactive', 'inactivo'].includes(String(value).toLowerCase())
}

function formatCurrency(value) {
  return `$${Math.round(Number(value) || 0).toLocaleString('es-MX')}`
}

function AdminDashboard() {
  const navigate = useNavigate()
  const { adminState } = useApp()
  const dashboard = adminState.dashboard || {}
  const studios = adminState.studios.length ? adminState.studios : dashboard.studios || []
  const artists = adminState.artists.length ? adminState.artists : dashboard.artists || []
  const clients = adminState.clients.length ? adminState.clients : dashboard.clients || []
  const appointments = dashboard.appointments || []
  const monthGross = appointments.reduce((total, appointment) => total + (Number(appointment.grossAmount) || 0), 0)
  const monthCommission = appointments.reduce((total, appointment) => total + (Number(appointment.platformFee) || 0), 0)

  const activeStudios = studios.filter((studio) => isActiveStatus(studio.studioStatus)).length
  const suspendedStudios = studios.filter((studio) => isSuspendedStatus(studio.studioStatus)).length
  const activeArtists = artists.filter((artist) => isActiveStatus(artist.status)).length
  const suspendedArtists = artists.filter((artist) => isSuspendedStatus(artist.status)).length
  const activeClients = clients.filter((client) => isActiveStatus(client.status)).length
  const suspendedClients = clients.filter((client) => isSuspendedStatus(client.status)).length

  return (
    <main className="dashboard-grid admin-grid">
      <MetricCard label="Estudios activos" value={activeStudios} trend={`${suspendedStudios} suspendidos`} tone={suspendedStudios ? 'warm' : 'success'} />
      <MetricCard label="Artistas activas" value={activeArtists} trend={`${suspendedArtists} suspendidas`} tone={suspendedArtists ? 'warm' : 'success'} />
      <MetricCard label="Clientas activas" value={activeClients} trend={`${suspendedClients} suspendidas`} tone={suspendedClients ? 'warm' : 'success'} />
      <MetricCard label="Comision estimada" value={formatCurrency(monthCommission)} trend={`${formatCurrency(monthGross)} agendado`} tone="sage" />

      <Card className="wide-card executive-card">
        <PanelHeader title="Panel administrativo" eyebrow="Acciones criticas" />
        <div className="admin-action-grid">
          <article className="admin-action-card">
            <div>
              <span className="eyebrow">Estudios y artistas</span>
              <h3>Suspension y reactivacion</h3>
              <small>Busca por nombre, correo o celular y ejecuta acciones directas.</small>
            </div>
            <StatusPill tone={suspendedStudios + suspendedArtists ? 'warm' : 'success'}>
              {suspendedStudios + suspendedArtists} suspendidos
            </StatusPill>
            <Button size="sm" onClick={() => navigate(paths.adminStudios)}>Abrir panel</Button>
          </article>

          <article className="admin-action-card">
            <div>
              <span className="eyebrow">Clientes</span>
              <h3>Estado de clientas</h3>
              <small>Consulta estatus actual y activa o suspende clientas.</small>
            </div>
            <StatusPill tone={suspendedClients ? 'warm' : 'success'}>
              {suspendedClients} suspendidas
            </StatusPill>
            <Button size="sm" onClick={() => navigate(paths.adminClients)}>Abrir panel</Button>
          </article>

          <article className="admin-action-card">
            <div>
              <span className="eyebrow">Cobranza</span>
              <h3>Comisiones Studio Flow</h3>
              <small>10% por servicio agendado, con consulta por estudio o artista.</small>
            </div>
            <StatusPill tone="sage">Mes actual</StatusPill>
            <Button size="sm" onClick={() => navigate(paths.adminBilling)}>Abrir panel</Button>
          </article>
        </div>
      </Card>
    </main>
  )
}

export default AdminDashboard
