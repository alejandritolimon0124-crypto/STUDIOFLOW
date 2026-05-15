import Card from '../../components/Card'
import MetricCard from '../../components/MetricCard'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import Button from '../../components/Button'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { paths } from '../../routes/paths'
import {
  artistAppointments,
  artistClients,
  artistServices,
  managedArtists,
  managedClients,
  studios,
  systemStatus,
} from '../../services/mockData'
import {
  calculateFlaggedAppointments,
  calculateOccupancyMetrics,
  calculatePlatformRevenue,
  calculateTotalRevenue,
  generateBusinessInsights,
  generateOwnerDashboardSummary,
} from '../../modules/business/businessMetricsEngine'
import { calculateAppointmentEconomy } from '../../modules/business/appointmentEconomyEngine'
import { flowPointRewards, getVipTierForPoints, vipTierThresholds } from '../../modules/loyalty/flowPointsEngine'
import {
  STUDIO_STATUS,
  calculateEcosystemGovernanceMetrics,
  getStudioStatusLabel,
  getStudioStatusTone,
} from '../../modules/governance/studioGovernance'
import { generateStudioInsights, generateStudioPortfolioSummary } from '../../modules/studio/studioMetricsEngine'

const executiveRiskEvents = [
  {
    time: '10:20',
    end: '14:00',
    clientId: 'client-rg',
    client: 'Regina Campos',
    service: 'Servicio express registrado como extendido',
    duration: '220 min',
    status: 'Revision',
    room: 'Studio Norte',
    type: 'appointment',
    studioId: 'studio-aura',
    date: '2026-05-18',
    grossAmount: 360,
    serviceTier: 'basic',
    rewardApplied: 'double_points',
    pointsGranted: 110,
    appointmentStatus: 'flagged',
    artistId: 'aura-nails',
  },
  {
    time: '13:40',
    end: '14:10',
    clientId: 'client-iv',
    client: 'Ivanna Rey',
    service: 'Tratamiento premium abreviado',
    duration: '30 min',
    status: 'Revision',
    room: 'Suite Glow',
    type: 'appointment',
    studioId: 'studio-velvet',
    date: '2026-05-18',
    grossAmount: 980,
    serviceTier: 'premium',
    rewardApplied: null,
    pointsGranted: 90,
    appointmentStatus: 'scheduled',
    artistId: 'nude-beauty-lab',
  },
  {
    time: '18:00',
    end: '22:00',
    clientId: 'client-lu',
    client: 'Lucia Navarro',
    service: 'Servicio basico con recompensa alta',
    duration: '240 min',
    status: 'Revision urgente',
    room: 'Suite Rose',
    type: 'appointment',
    studioId: 'studio-glow',
    date: '2026-05-18',
    grossAmount: 520,
    serviceTier: 'basic',
    rewardApplied: 'double_points',
    pointsGranted: 200,
    appointmentStatus: 'flagged',
    artistId: 'valeria-moon',
  },
  {
    time: '19:00',
    end: '20:30',
    clientId: 'client-pa',
    client: 'Paola Sierra',
    service: 'Campana doble puntos',
    duration: '90 min',
    status: 'Confirmada',
    room: 'Makeup bar',
    type: 'appointment',
    studioId: 'studio-glow',
    date: '2026-05-18',
    grossAmount: 1180,
    serviceTier: 'vip',
    rewardApplied: 'double_points',
    pointsGranted: 120,
    appointmentStatus: 'scheduled',
    artistId: 'valeria-moon',
  },
]

const executiveClients = [
  ...artistClients,
  { id: 'client-muse', studioId: 'studio-velvet', name: 'Daniela Muse', flowPoints: 640, vipTier: 'Muse' },
  { id: 'client-icon', studioId: 'studio-glow', name: 'Elena Icon', flowPoints: 1320, vipTier: 'Icon' },
  { id: 'client-elite', studioId: 'studio-glow', name: 'Marina Elite', flowPoints: 2680, vipTier: 'Elite' },
  { id: 'client-near', studioId: 'studio-aura', name: 'Claudia Near', flowPoints: 142, vipTier: 'Glow' },
]

const executiveAlertMessages = {
  medium: 'Evento con posible inconsistencia de duracion y servicio.',
  high: 'Evento con riesgo operativo que requiere validacion del equipo.',
  critical: 'Evento critico: revisar antes de consolidar indicadores del dia.',
}

const formatCurrency = (value) => `$${Math.round(value).toLocaleString('es-MX')}`

function AdminDashboard() {
  const navigate = useNavigate()
  const [reviewStudios, setReviewStudios] = useState(studios)

  const ownerAppointments = [...artistAppointments, ...executiveRiskEvents]
  const portfolioSummary = generateStudioPortfolioSummary(reviewStudios, managedArtists, executiveClients, ownerAppointments)
  const studioInsights = generateStudioInsights(reviewStudios, managedArtists, executiveClients, ownerAppointments)
  const ownerSummary = generateOwnerDashboardSummary(ownerAppointments, artistServices)
  const totalRevenue = calculateTotalRevenue(ownerAppointments)
  const platformRevenue = calculatePlatformRevenue(ownerAppointments)
  const flaggedAppointments = calculateFlaggedAppointments(ownerAppointments)
  const occupancyMetrics = calculateOccupancyMetrics(ownerAppointments, 32)
  const businessInsights = generateBusinessInsights(ownerAppointments)
  const executiveInsights = businessInsights.map((insight) => {
    const copyByType = {
      promotion: 'Las promociones con doble puntos generan mayor recurrencia y sostienen ingresos incrementales.',
      occupancy: 'La ocupacion global puede mejorar activando campanas en dias bajos.',
      risk: 'Hay eventos que requieren revision por riesgo operativo antes del cierre.',
      revenue: `El negocio mantiene ${formatCurrency(totalRevenue)} en ingresos mock y ${formatCurrency(platformRevenue)} de comision Studio Flow.`,
    }

    return {
      ...insight,
      message: copyByType[insight.type] || insight.message,
    }
  })
  const riskAlerts = ownerAppointments
    .map((appointment) => ({
      ...appointment,
      economy: calculateAppointmentEconomy(appointment),
    }))
    .filter(({ economy }) => ['medium', 'high', 'critical'].includes(economy.riskScore))
    .sort((a, b) => {
      const order = { critical: 3, high: 2, medium: 1 }
      return order[b.economy.riskScore] - order[a.economy.riskScore]
    })

  const totalActivePoints = executiveClients.reduce((total, client) => total + (client.flowPoints || 0), 0)
  const rewardThreshold = flowPointRewards.freeService.pointsCost
  const clientsNearReward = executiveClients.filter((client) => {
    const points = client.flowPoints || 0
    return points < rewardThreshold && rewardThreshold - points <= 30
  })
  const tierCounts = vipTierThresholds.map((tier) => ({
    ...tier,
    count: executiveClients.filter((client) => getVipTierForPoints(client.flowPoints || 0) === tier.name).length,
  }))
  const potentialRewards = Object.values(flowPointRewards).filter((reward) =>
    executiveClients.some((client) => (client.flowPoints || 0) >= reward.pointsCost),
  ).length
  const ecosystemMetrics = calculateEcosystemGovernanceMetrics(reviewStudios)
  const pendingReviewStudios = reviewStudios.filter((studio) => studio.studioStatus === STUDIO_STATUS.PENDING)

  const updateReviewStatus = (studioName, studioStatus) => {
    setReviewStudios((currentStudios) =>
      currentStudios.map((studio) =>
        studio.name === studioName
          ? {
              ...studio,
              studioStatus,
            }
          : studio,
      ),
    )
  }

  const topArtists = [
    { artist: 'Valeria Moon Studio', appointments: ownerAppointments.filter((item) => item.artistId === 'valeria-moon' || !item.artistId) },
    { artist: 'Nude Beauty Lab', appointments: ownerAppointments.filter((item) => item.artistId === 'nude-beauty-lab') },
    { artist: 'Aura Nails', appointments: ownerAppointments.filter((item) => item.artistId === 'aura-nails') },
  ].map((artist) => {
    const revenue = calculateTotalRevenue(artist.appointments)
    const commission = calculatePlatformRevenue(artist.appointments)
    const occupancy = calculateOccupancyMetrics(artist.appointments, 10).occupancyRate
    const risk = calculateFlaggedAppointments(artist.appointments).length

    return {
      ...artist,
      revenue,
      commission,
      occupancy,
      risk,
    }
  })

  const ownerKpis = [
    { label: 'Ingresos totales', value: formatCurrency(totalRevenue), trend: 'Gross mock conectado', tone: 'rose' },
    { label: 'Comision Studio Flow', value: formatCurrency(platformRevenue), trend: '10% foundation', tone: 'sage' },
    { label: 'Eventos con riesgo', value: flaggedAppointments.length, trend: riskAlerts.length ? 'Revision activa' : 'Sin alertas', tone: flaggedAppointments.length ? 'warm' : 'success' },
    { label: 'Ocupacion global', value: `${occupancyMetrics.occupancyRate}%`, trend: `${occupancyMetrics.bookedSlots}/${occupancyMetrics.totalSlots} slots`, tone: 'nude' },
    { label: 'Clientas activas', value: executiveClients.length, trend: `${managedClients.filter((client) => client.status === 'Activo').length} segmentos admin`, tone: 'rose' },
    { label: 'Flow Points activos', value: totalActivePoints.toLocaleString('es-MX'), trend: `${clientsNearReward.length} cerca de recompensa`, tone: 'sage' },
    { label: 'Estudios pendientes', value: ecosystemMetrics.pending, trend: 'Curaduria activa', tone: 'warm' },
    { label: 'Estudios aprobados', value: ecosystemMetrics.approved, trend: 'Marketplace premium', tone: 'success' },
    { label: 'Estudios suspendidos', value: ecosystemMetrics.suspended, trend: 'Revision elegante', tone: 'nude' },
    { label: 'Riesgo ecosistema', value: ecosystemMetrics.ecosystemRisk, trend: ecosystemMetrics.ecosystemRisk > 3 ? 'Atencion owner' : 'Controlado', tone: ecosystemMetrics.ecosystemRisk > 3 ? 'warm' : 'sage' },
    { label: 'Studio revenue', value: formatCurrency(portfolioSummary.totalRevenue), trend: `${reviewStudios.length} studios`, tone: 'rose' },
    { label: 'Studio occupancy', value: `${portfolioSummary.averageOccupancy}%`, trend: 'Promedio portfolio', tone: 'nude' },
    { label: 'Active artists', value: portfolioSummary.activeArtists, trend: 'Multi-studio', tone: 'success' },
    { label: 'Active clients', value: portfolioSummary.activeClients, trend: 'Relacion studioId', tone: 'sage' },
    { label: 'Studio risk', value: portfolioSummary.studioRisk, trend: 'Portfolio score', tone: portfolioSummary.studioRisk > 8 ? 'warm' : 'sage' },
  ]

  return (
    <main className="dashboard-grid admin-grid">
      <section className="hero-panel admin-hero executive-hero">
        <div>
          <span className="eyebrow">Executive Owner Dashboard</span>
          <h2>Control de negocio Studio Flow</h2>
          <p>Ingresos, comision, ocupacion, riesgo operativo y economia Flow Points en una vista premium lista para conectar datos reales.</p>
        </div>
        <div className="hero-summary">
          <span>Revenue owner</span>
          <strong>{formatCurrency(ownerSummary.totalRevenue)}</strong>
          <small>{ownerSummary.flaggedAppointments} eventos a revisar</small>
        </div>
      </section>

      {ownerKpis.map((metric) => (
        <MetricCard
          key={metric.label}
          label={metric.label}
          value={metric.value}
          trend={metric.trend}
          tone={metric.tone}
        />
      ))}

      <Card className="wide-card executive-card">
        <PanelHeader title="Estudios pendientes de validacion" eyebrow="Ecosystem governance" />
        <div className="studio-review-stack">
          {pendingReviewStudios.map((studio) => (
            <div className="studio-review-row" key={studio.name}>
              <div>
                <strong>{studio.name}</strong>
                <small>{studio.city} · {studio.specialty} · Registro {studio.createdAt}</small>
              </div>
              <StatusPill tone={getStudioStatusTone(studio.studioStatus)}>
                {getStudioStatusLabel(studio.studioStatus)}
              </StatusPill>
              <div className="studio-review-actions">
                <Button size="sm" onClick={() => updateReviewStatus(studio.name, STUDIO_STATUS.APPROVED)}>Aprobar</Button>
                <Button size="sm" variant="ghost" onClick={() => updateReviewStatus(studio.name, STUDIO_STATUS.SUSPENDED)}>Suspender</Button>
                <Button size="sm" variant="ghost" onClick={() => updateReviewStatus(studio.name, STUDIO_STATUS.PENDING)}>Solicitar cambios</Button>
              </div>
            </div>
          ))}
          {pendingReviewStudios.length === 0 && (
            <div className="studio-review-row">
              <div>
                <strong>Pipeline curado al dia</strong>
                <small>No hay estudios esperando validacion en este mock.</small>
              </div>
              <StatusPill tone="approved">Listo</StatusPill>
            </div>
          )}
        </div>
      </Card>

      <Card className="wide-card executive-card">
        <PanelHeader title="Alertas de negocio" eyebrow="Riesgo operativo" />
        <div className="executive-alert-stack">
          {riskAlerts.map((alert) => (
            <div className="executive-alert" key={`${alert.client}-${alert.time}`}>
              <div>
                <span>{alert.client} · {alert.service}</span>
                <strong>{executiveAlertMessages[alert.economy.riskScore]}</strong>
                <small>{formatCurrency(alert.economy.grossAmount)} · {alert.duration} · {alert.date}</small>
              </div>
              <StatusPill tone={alert.economy.riskScore === 'critical' ? 'rose' : 'warm'}>
                {alert.economy.riskScore === 'critical' ? 'Critico' : alert.economy.riskScore === 'high' ? 'Alto' : 'Medio'}
              </StatusPill>
            </div>
          ))}
        </div>
      </Card>

      <Card className="wide-card executive-card">
        <PanelHeader title="Portfolio multi-studio" eyebrow="Studio intelligence" />
        <div className="data-table executive-table">
          <div className="table-head">
            <span>Studio</span>
            <span>Revenue</span>
            <span>Ocupacion</span>
            <span>Activos</span>
            <span>Riesgo</span>
          </div>
          {portfolioSummary.studioMetrics.map((studio) => (
            <div className="table-row" key={studio.studioId}>
              <strong>{studio.studioName}</strong>
              <span>{formatCurrency(studio.revenue)}</span>
              <span>{studio.occupancy}%</span>
              <span>{studio.activeArtists} artistas / {studio.activeClients} clientas</span>
              <StatusPill tone={studio.studioRisk > 4 ? 'warm' : 'success'}>{studio.studioRisk}</StatusPill>
            </div>
          ))}
        </div>
      </Card>

      <Card className="executive-card">
        <PanelHeader title="Studio Flow Insights" eyebrow="Lectura ejecutiva" />
        <div className="insights-stack">
          {executiveInsights.slice(0, 4).map((insight) => (
            <div key={`${insight.type}-${insight.priority}`} className="insight-item executive-insight">
              <div className="insight-header">
                <h4>{insight.type === 'promotion' ? 'Promociones y recurrencia' : insight.type === 'occupancy' ? 'Ocupacion global' : insight.type === 'risk' ? 'Riesgo operativo' : 'Economia del negocio'}</h4>
                <StatusPill tone={insight.priority === 'critical' ? 'rose' : insight.priority === 'high' ? 'warm' : 'neutral'}>
                  {insight.priority}
                </StatusPill>
              </div>
              <p>{insight.message}</p>
            </div>
          ))}
          <div className="insight-item executive-insight">
            <h4>Activacion inteligente</h4>
            <p>La ocupacion global puede mejorar activando campanas en dias bajos y reforzando promociones con doble puntos.</p>
          </div>
          {studioInsights.map((insight) => (
            <div key={insight} className="insight-item executive-insight">
              <h4>Studio insight</h4>
              <p>{insight}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="executive-card">
        <PanelHeader title="Economia Flow Points" eyebrow="Loyalty" />
        <div className="flow-economy-grid">
          <div>
            <span>Puntos activos</span>
            <strong>{totalActivePoints.toLocaleString('es-MX')}</strong>
            <small>{potentialRewards} recompensas potenciales disponibles</small>
          </div>
          <div>
            <span>Cerca de recompensa</span>
            <strong>{clientsNearReward.length}</strong>
            <small>{clientsNearReward.map((client) => client.name).join(', ') || 'Sin clientas en umbral critico'}</small>
          </div>
        </div>
        <div className="tier-strip">
          {tierCounts.map((tier) => (
            <div key={tier.name}>
              <span>{tier.name}</span>
              <strong>{tier.count}</strong>
              <small>{tier.minPoints.toLocaleString('es-MX')}+ pts</small>
            </div>
          ))}
        </div>
      </Card>

      <Card className="wide-card executive-card">
        <PanelHeader title="Top artistas" eyebrow="Ranking mock ejecutivo" />
        <div className="data-table executive-table">
          <div className="table-head">
            <span>Artista</span>
            <span>Ingresos</span>
            <span>Comision</span>
            <span>Ocupacion</span>
            <span>Riesgo</span>
          </div>
          {topArtists.map((artist) => (
            <div className="table-row" key={artist.artist}>
              <strong>{artist.artist}</strong>
              <span>{formatCurrency(artist.revenue)}</span>
              <span>{formatCurrency(artist.commission)}</span>
              <span>{artist.occupancy}%</span>
              <StatusPill tone={artist.risk > 0 ? 'warm' : 'success'}>{artist.risk > 0 ? `${artist.risk} eventos` : 'Controlado'}</StatusPill>
            </div>
          ))}
        </div>
      </Card>

      <Card className="wide-card">
        <PanelHeader title="Gestion de studios" eyebrow="Operaciones" action={<Button size="sm" onClick={() => navigate(paths.adminArtists)}>Abrir</Button>} />
        <div className="data-table">
          <div className="table-head">
            <span>Studio</span>
            <span>Ciudad</span>
            <span>Especialidad</span>
            <span>Ingresos</span>
            <span>Estado</span>
          </div>
          {reviewStudios.map((studio) => (
            <div className="table-row" key={studio.id}>
              <strong>{studio.name}</strong>
              <span>{studio.city}</span>
              <span>{studio.specialty}</span>
              <span>{formatCurrency(studio.revenue)}</span>
              <StatusPill tone={getStudioStatusTone(studio.studioStatus)}>{getStudioStatusLabel(studio.studioStatus)}</StatusPill>
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
