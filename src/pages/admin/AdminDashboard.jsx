import Card from '../../components/Card'
import MetricCard from '../../components/MetricCard'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import Button from '../../components/Button'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { paths } from '../../routes/paths'
import { useApp } from '../../contexts/appContextCore'
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
import {
  filterByStudioAccess,
  getRoleLabel,
  hasPermission,
  permissions,
  ROLES,
} from '../../modules/permissions/rolePermissions'
import {
  deriveMembershipsFromLegacyData,
  getArtistsForStudio,
  getStudiosForArtist,
} from '../../modules/entities/entitySelectors'

const executiveAlertMessages = {
  medium: 'Evento con posible inconsistencia de duracion y servicio.',
  high: 'Evento con riesgo operativo que requiere validacion del equipo.',
  critical: 'Evento critico: revisar antes de consolidar indicadores del dia.',
}

const formatCurrency = (value) => `$${Math.round(value).toLocaleString('es-MX')}`
const getStudioCommercialName = (studio = {}) => studio.profile?.commercialName?.trim() || ''
const uniqueById = (items = []) => Array.from(new Map(items.filter(Boolean).map((item) => [item.id, item])).values())
const emptyDashboardData = {
  source: 'supabase',
  studios: [],
  artists: [],
  clients: [],
  appointments: [],
  users: [],
  systemStatus: [],
}

function AdminDashboard() {
  const navigate = useNavigate()
  const {
    adminState,
    artistServices,
    session,
    reviewStudioGovernance,
    isGovernanceLoading,
    governanceError,
  } = useApp()
  const currentUser = session.user
  const dashboardSnapshot = adminState.dashboard || emptyDashboardData
  const dashboardData = session.isMockSession || dashboardSnapshot.source === 'supabase'
    ? dashboardSnapshot
    : emptyDashboardData
  const dashboardStudios = dashboardData.studios || []
  const dashboardArtists = dashboardData.artists || []
  const dashboardClients = dashboardData.clients || []
  const dashboardAppointments = dashboardData.appointments || []
  const dashboardUsers = dashboardData.users || []
  const dashboardSystemStatus = dashboardData.systemStatus || []
  const [reviewStudios, setReviewStudios] = useState(dashboardStudios)

  useEffect(() => {
    setReviewStudios(dashboardStudios)
  }, [dashboardStudios])

  const normalizedRole = currentUser?.role === 'admin' ? ROLES.PLATFORM_OWNER : currentUser?.role
  const isPlatformOwner = normalizedRole === ROLES.PLATFORM_OWNER
  const isStudioOwner = normalizedRole === ROLES.STUDIO_OWNER
  const isStudioManager = normalizedRole === ROLES.STUDIO_MANAGER
  const ownerAppointments = dashboardAppointments
  const canSeeGovernance = hasPermission(currentUser, permissions.GOVERNANCE)
  const canSeeGlobalRevenue = hasPermission(currentUser, permissions.GLOBAL_REVENUE)
  const canSeeGlobalInsights = hasPermission(currentUser, permissions.GLOBAL_INSIGHTS)
  const canSeeEcosystemRisk = hasPermission(currentUser, permissions.ECOSYSTEM_RISK)
  const canSeeStudioRevenue = hasPermission(currentUser, permissions.STUDIO_REVENUE)
  const canSeeStudioMarketing = hasPermission(currentUser, permissions.STUDIO_MARKETING)
  const canSeeStudioOccupancy = hasPermission(currentUser, permissions.STUDIO_OCCUPANCY)
  const canSeeStudioArtists = hasPermission(currentUser, permissions.STUDIO_ARTISTS)
  const canSeeStudioClients = hasPermission(currentUser, permissions.STUDIO_CLIENTS) || hasPermission(currentUser, permissions.CLIENTS)
  const artistStudioMemberships = deriveMembershipsFromLegacyData({ artists: dashboardArtists })
  const artistsOwnedByUser = dashboardArtists.filter((artist) => artist.owner === currentUser?.name || artist.name === currentUser?.name)
  const studiosFromOwnedArtists = uniqueById(artistsOwnedByUser.flatMap((artist) => getStudiosForArtist({
    artistId: artist.id,
    studios: reviewStudios,
    artistStudioMemberships,
  })))
  const accessibleStudios = isPlatformOwner ? reviewStudios : studiosFromOwnedArtists
  const accessibleStudioIds = accessibleStudios.map((studio) => studio.id)
  const accessibleArtists = isPlatformOwner
    ? dashboardArtists
    : uniqueById(accessibleStudioIds.flatMap((studioId) => getArtistsForStudio({
      studioId,
      artists: dashboardArtists,
      artistStudioMemberships,
    })))
  const accessibleClients = filterByStudioAccess(dashboardClients, currentUser, accessibleStudioIds)
  const accessibleArtistIds = accessibleArtists.map((artist) => artist.id)
  const accessibleAppointments = ownerAppointments.filter((appointment) => (
    !appointment.artistId
    || accessibleArtistIds.includes(appointment.artistId)
    || hasPermission(currentUser, permissions.GLOBAL_REVENUE)
  ))
  const roleExperience = {
    [ROLES.PLATFORM_OWNER]: {
      eyebrow: 'Platform owner',
      title: 'Control completo del ecosistema Studio Flow',
      description: 'Gobernanza, ingresos globales, riesgo, insights, roles y portfolio multi-studio en la vista mas completa del sistema.',
      summaryLabel: 'Revenue global',
      portfolioTitle: 'Portfolio multi-studio',
      portfolioEyebrow: 'Studio intelligence global',
      insightsTitle: 'Insights globales',
      insightsEyebrow: 'Lectura ejecutiva',
      flowTitle: 'Economia Flow Points global',
    },
    [ROLES.STUDIO_OWNER]: {
      eyebrow: 'Studio owner',
      title: 'Direccion ejecutiva de tu estudio',
      description: 'Revenue, artistas, ocupacion, campanas, clientas, metricas y Flow Points filtrados al studio asignado.',
      summaryLabel: 'Revenue del estudio',
      portfolioTitle: 'Metricas del estudio',
      portfolioEyebrow: 'Studio intelligence local',
      insightsTitle: 'Insights del estudio',
      insightsEyebrow: 'Crecimiento local',
      flowTitle: 'Flow Points del estudio',
    },
    [ROLES.STUDIO_MANAGER]: {
      eyebrow: 'Studio manager',
      title: 'Operacion diaria del estudio',
      description: 'Agenda global del estudio, citas, clientas, automatizaciones, campanas y ocupacion sin gobierno ni finanzas profundas.',
      summaryLabel: 'Ocupacion estudio',
      portfolioTitle: 'Ocupacion y operacion',
      portfolioEyebrow: 'Gestion del estudio',
      insightsTitle: 'Automatizaciones operativas',
      insightsEyebrow: 'Acciones del dia',
      flowTitle: 'Senales de clientas',
    },
  }[normalizedRole] || {
    eyebrow: 'Workspace',
    title: 'Panel organizacional',
    description: 'Vista adaptada por permisos.',
    summaryLabel: 'Resumen',
    portfolioTitle: 'Metricas',
    portfolioEyebrow: 'Operacion',
    insightsTitle: 'Insights',
    insightsEyebrow: 'Workspace',
    flowTitle: 'Flow Points',
  }
  const portfolioSummary = generateStudioPortfolioSummary(accessibleStudios, accessibleArtists, accessibleClients, accessibleAppointments, artistStudioMemberships)
  const studioInsights = generateStudioInsights(accessibleStudios, accessibleArtists, accessibleClients, accessibleAppointments, artistStudioMemberships)
  const ownerSummary = generateOwnerDashboardSummary(accessibleAppointments, artistServices)
  const totalRevenue = calculateTotalRevenue(accessibleAppointments)
  const platformRevenue = calculatePlatformRevenue(accessibleAppointments)
  const flaggedAppointments = calculateFlaggedAppointments(accessibleAppointments)
  const occupancyMetrics = calculateOccupancyMetrics(accessibleAppointments, isPlatformOwner ? 32 : 12)
  const businessInsights = generateBusinessInsights(accessibleAppointments)
  const executiveInsights = businessInsights.map((insight) => {
    const copyByType = {
      promotion: 'Las promociones con doble puntos generan mayor recurrencia y sostienen ingresos incrementales.',
      occupancy: 'La ocupacion global puede mejorar activando campanas en dias bajos.',
      risk: 'Hay eventos que requieren revision por riesgo operativo antes del cierre.',
      revenue: `El negocio mantiene ${formatCurrency(totalRevenue)} en ingresos reales y ${formatCurrency(platformRevenue)} de comision Studio Flow.`,
    }

    return {
      ...insight,
      message: copyByType[insight.type] || insight.message,
    }
  })
  const visibleInsights = executiveInsights.filter((insight) => {
    if (isPlatformOwner) return true
    if (isStudioOwner) return insight.type !== 'risk'
    if (isStudioManager) return ['promotion', 'occupancy'].includes(insight.type)
    return false
  })
  const riskAlerts = accessibleAppointments
    .map((appointment) => ({
      ...appointment,
      economy: calculateAppointmentEconomy(appointment),
    }))
    .filter(({ economy }) => ['medium', 'high', 'critical'].includes(economy.riskScore))
    .sort((a, b) => {
      const order = { critical: 3, high: 2, medium: 1 }
      return order[b.economy.riskScore] - order[a.economy.riskScore]
    })

  const totalActivePoints = accessibleClients.reduce((total, client) => total + (client.flowPoints || 0), 0)
  const rewardThreshold = flowPointRewards.freeService.pointsCost
  const clientsNearReward = accessibleClients.filter((client) => {
    const points = client.flowPoints || 0
    return points < rewardThreshold && rewardThreshold - points <= 30
  })
  const tierCounts = vipTierThresholds.map((tier) => ({
    ...tier,
    count: accessibleClients.filter((client) => getVipTierForPoints(client.flowPoints || 0) === tier.name).length,
  }))
  const potentialRewards = Object.values(flowPointRewards).filter((reward) =>
    accessibleClients.some((client) => (client.flowPoints || 0) >= reward.pointsCost),
  ).length
  const ecosystemMetrics = calculateEcosystemGovernanceMetrics(accessibleStudios)
  const pendingReviewStudios = accessibleStudios.filter((studio) => studio.studioStatus === STUDIO_STATUS.PENDING)
  const roleDistribution = dashboardUsers.reduce((distribution, user) => ({
    ...distribution,
    [user.role]: (distribution[user.role] || 0) + 1,
  }), {})
  const scopedUsers = isPlatformOwner
    ? dashboardUsers
    : dashboardUsers.filter((user) => user.id === currentUser?.id || accessibleStudios.some((studio) => user.name === getStudioCommercialName(studio)))
  const managersActive = scopedUsers.filter((user) => user.role === 'studio_manager' && user.status === 'Activo').length
  const studiosByOwner = dashboardUsers.filter((user) => user.role === 'studio_owner').map((owner) => ({
    owner: owner.name,
    studios: getStudiosForArtist({
      artistId: dashboardArtists.find((artist) => artist.owner === owner.name || artist.name === owner.name)?.id,
      studios: reviewStudios,
      artistStudioMemberships,
    }),
  }))

  const updateReviewStatus = async (studioId, decision) => {
    const result = await reviewStudioGovernance({
      studioId,
      decision,
      reason: decision,
      decisionNotes: `Decision ${decision} ejecutada desde Platform Owner dashboard.`,
    })

    if (!result?.studio?.id) return

    setReviewStudios((currentStudios) =>
      currentStudios.map((studio) =>
        studio.id === studioId
          ? {
              ...studio,
              studioStatus: result.studio.studioStatus,
              approvedAt: result.studio.approvedAt,
              suspendedAt: result.studio.suspendedAt,
            }
          : studio,
      ),
    )
  }

  const topArtists = accessibleArtists.slice(0, 3).map((artist) => {
    const artistAppointments = accessibleAppointments.filter((item) => item.artistId === artist.id)
    const revenue = calculateTotalRevenue(artistAppointments)
    const commission = calculatePlatformRevenue(artistAppointments)
    const occupancy = calculateOccupancyMetrics(artistAppointments, 10).occupancyRate
    const risk = calculateFlaggedAppointments(artistAppointments).length

    return {
      artist: artist.name,
      artistId: artist.id,
      appointments: artistAppointments,
      revenue,
      commission,
      occupancy,
      risk,
    }
  })

  const ownerKpis = [
    canSeeGlobalRevenue && { label: 'Ingresos totales', value: formatCurrency(totalRevenue), trend: 'Gross conectado', tone: 'rose' },
    canSeeGlobalRevenue && { label: 'Comision Studio Flow', value: formatCurrency(platformRevenue), trend: '10% foundation', tone: 'sage' },
    canSeeEcosystemRisk && { label: 'Eventos con riesgo', value: flaggedAppointments.length, trend: riskAlerts.length ? 'Revision activa' : 'Sin alertas', tone: flaggedAppointments.length ? 'warm' : 'success' },
    canSeeStudioRevenue && !canSeeGlobalRevenue && { label: 'Revenue estudio', value: formatCurrency(totalRevenue), trend: getStudioCommercialName(accessibleStudios[0]) || 'Studio asignado', tone: 'rose' },
    canSeeStudioOccupancy && { label: isPlatformOwner ? 'Ocupacion global' : 'Ocupacion estudio', value: `${occupancyMetrics.occupancyRate}%`, trend: `${occupancyMetrics.bookedSlots}/${occupancyMetrics.totalSlots} slots`, tone: 'nude' },
    canSeeStudioClients && { label: isPlatformOwner ? 'Clientas activas' : 'Clientas estudio', value: accessibleClients.length, trend: `${accessibleClients.filter((client) => client.status === 'Activo').length} activas`, tone: 'rose' },
    (isPlatformOwner || isStudioOwner) && { label: 'Flow Points activos', value: totalActivePoints.toLocaleString('es-MX'), trend: `${clientsNearReward.length} cerca de recompensa`, tone: 'sage' },
    canSeeGovernance && { label: 'Estudios pendientes', value: ecosystemMetrics.pending, trend: 'Curaduria activa', tone: 'warm' },
    canSeeGovernance && { label: 'Estudios aprobados', value: ecosystemMetrics.approved, trend: 'Marketplace premium', tone: 'success' },
    canSeeGovernance && { label: 'Estudios suspendidos', value: ecosystemMetrics.suspended, trend: 'Revision elegante', tone: 'nude' },
    canSeeEcosystemRisk && { label: 'Riesgo ecosistema', value: ecosystemMetrics.ecosystemRisk, trend: ecosystemMetrics.ecosystemRisk > 3 ? 'Atencion owner' : 'Controlado', tone: ecosystemMetrics.ecosystemRisk > 3 ? 'warm' : 'sage' },
    canSeeStudioRevenue && isPlatformOwner && { label: 'Studio revenue', value: formatCurrency(portfolioSummary.totalRevenue), trend: `${accessibleStudios.length} studios`, tone: 'rose' },
    canSeeStudioOccupancy && isPlatformOwner && { label: 'Studio occupancy', value: `${portfolioSummary.averageOccupancy}%`, trend: 'Promedio portfolio', tone: 'nude' },
    canSeeStudioArtists && { label: isPlatformOwner ? 'Active artists' : 'Artistas estudio', value: portfolioSummary.activeArtists, trend: isPlatformOwner ? 'Multi-studio' : 'Equipo local', tone: 'success' },
    canSeeStudioClients && isPlatformOwner && { label: 'Active clients', value: portfolioSummary.activeClients, trend: 'Relacion membership', tone: 'sage' },
    canSeeEcosystemRisk && { label: 'Studio risk', value: portfolioSummary.studioRisk, trend: 'Portfolio score', tone: portfolioSummary.studioRisk > 8 ? 'warm' : 'sage' },
  ].filter(Boolean)

  return (
    <main className="dashboard-grid admin-grid">
      <section className={`hero-panel admin-hero executive-hero role-hero-${normalizedRole}`}>
        <div>
          <span className="eyebrow">{roleExperience.eyebrow}</span>
          <h2>{roleExperience.title}</h2>
          <p>{roleExperience.description}</p>
        </div>
        <div className="hero-summary">
          <span>{roleExperience.summaryLabel}</span>
          <strong>{isStudioManager ? `${occupancyMetrics.occupancyRate}%` : formatCurrency(ownerSummary.totalRevenue)}</strong>
          <small>{isStudioManager ? `${accessibleAppointments.length} citas visibles` : `${ownerSummary.flaggedAppointments} eventos a revisar`}</small>
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
        <PanelHeader title="Roles & permisos" eyebrow="Organizacion enterprise" />
        <div className="role-governance-grid">
          <div>
            <span>Rol actual</span>
            <strong>{getRoleLabel(currentUser?.role)}</strong>
            <small>{accessibleStudioIds.join(' / ') || 'Acceso ecosistema completo'}</small>
          </div>
          <div>
            <span>Managers activos</span>
            <strong>{managersActive}</strong>
            <small>Operan agenda, clientas y marketing.</small>
          </div>
          <div>
            <span>Artistas activas</span>
            <strong>{accessibleArtists.filter((artist) => artist.status === 'Activo').length}</strong>
            <small>{isPlatformOwner ? 'Distribuidas por memberships.' : 'Equipo del estudio asignado.'}</small>
          </div>
          <div>
            <span>{isPlatformOwner ? 'Distribucion roles' : 'Equipo visible'}</span>
            <strong>{isPlatformOwner ? Object.keys(roleDistribution).length : scopedUsers.length}</strong>
            <small>{isPlatformOwner ? Object.entries(roleDistribution).map(([role, count]) => `${getRoleLabel(role)} ${count}`).join(' / ') : scopedUsers.map((user) => getRoleLabel(user.role)).join(' / ')}</small>
          </div>
        </div>
      </Card>

      {canSeeGovernance && (
      <Card className="wide-card executive-card">
        <PanelHeader title="Estudios pendientes de validacion" eyebrow="Ecosystem governance" />
        {governanceError && (
          <div className="studio-review-row">
            <div>
              <strong>No se pudo actualizar governance.</strong>
              <small>{governanceError}</small>
            </div>
            <StatusPill tone="warm">Error</StatusPill>
          </div>
        )}
        <div className="studio-review-stack">
          {pendingReviewStudios.map((studio) => (
            <div className="studio-review-row" key={studio.id}>
              <div>
                <strong>{getStudioCommercialName(studio) || 'Estudio profesional'}</strong>
                <small>{studio.city} · {studio.specialty} · Registro {studio.createdAt}</small>
              </div>
              <StatusPill tone={getStudioStatusTone(studio.studioStatus)}>
                {getStudioStatusLabel(studio.studioStatus)}
              </StatusPill>
              <div className="studio-review-actions">
                <Button size="sm" disabled={isGovernanceLoading} onClick={() => updateReviewStatus(studio.id, 'approve')}>Aprobar</Button>
                <Button size="sm" variant="ghost" disabled={isGovernanceLoading} onClick={() => updateReviewStatus(studio.id, 'request_changes')}>Solicitar cambios</Button>
                <Button size="sm" variant="ghost" disabled={isGovernanceLoading} onClick={() => updateReviewStatus(studio.id, 'reject')}>Rechazar</Button>
                <Button size="sm" variant="ghost" disabled={isGovernanceLoading} onClick={() => updateReviewStatus(studio.id, 'suspend')}>Suspender</Button>
              </div>
            </div>
          ))}
          {pendingReviewStudios.length === 0 && (
            <div className="studio-review-row">
              <div>
                <strong>Pipeline curado al dia</strong>
                <small>No hay estudios esperando validacion.</small>
              </div>
              <StatusPill tone="approved">Listo</StatusPill>
            </div>
          )}
        </div>
      </Card>
      )}

      {canSeeEcosystemRisk && (
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
      )}

      <Card className="wide-card executive-card">
        <PanelHeader title={roleExperience.portfolioTitle} eyebrow={roleExperience.portfolioEyebrow} />
        <div className="data-table executive-table">
          <div className="table-head">
            <span>Studio</span>
            {canSeeStudioRevenue && <span>Revenue</span>}
            <span>Ocupacion</span>
            <span>Activos</span>
            {isPlatformOwner && <span>Riesgo</span>}
          </div>
          {portfolioSummary.studioMetrics.map((studio) => (
            <div className="table-row" key={studio.studioId}>
              <strong>{studio.studioName}</strong>
              {canSeeStudioRevenue && <span>{formatCurrency(studio.revenue)}</span>}
              <span>{studio.occupancy}%</span>
              <span>{studio.activeArtists} artistas / {studio.activeClients} clientas</span>
              {isPlatformOwner && <StatusPill tone={studio.studioRisk > 4 ? 'warm' : 'success'}>{studio.studioRisk}</StatusPill>}
            </div>
          ))}
        </div>
      </Card>

      {(isStudioManager || isStudioOwner) && (
      <Card className="wide-card executive-card">
        <PanelHeader title="Agenda global estudio" eyebrow="Citas y ocupacion" />
        <div className="data-table executive-table">
          <div className="table-head">
            <span>Hora</span>
            <span>Clienta</span>
            <span>Servicio</span>
            <span>Estado</span>
          </div>
          {accessibleAppointments.slice(0, 6).map((appointment) => (
            <div className="table-row" key={`${appointment.client}-${appointment.time}-${appointment.service}`}>
              <strong>{appointment.time}</strong>
              <span>{appointment.client}</span>
              <span>{appointment.service}</span>
              <StatusPill tone={appointment.status === 'Confirmada' ? 'success' : 'warm'}>{appointment.status}</StatusPill>
            </div>
          ))}
        </div>
      </Card>
      )}

      {(canSeeGlobalInsights || canSeeStudioMarketing) && (
      <Card className="executive-card">
        <PanelHeader title={roleExperience.insightsTitle} eyebrow={roleExperience.insightsEyebrow} />
        <div className="insights-stack">
          {visibleInsights.slice(0, 4).map((insight) => (
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
            <h4>{isStudioManager ? 'Automatizacion recomendada' : 'Activacion inteligente'}</h4>
            <p>{isPlatformOwner ? 'La ocupacion global puede mejorar activando campanas en dias bajos y reforzando promociones con doble puntos.' : 'La ocupacion del estudio puede mejorar con campanas en dias bajos y recordatorios a clientas inactivas.'}</p>
          </div>
          {studioInsights.map((insight) => (
            <div key={insight} className="insight-item executive-insight">
              <h4>Studio insight</h4>
              <p>{insight}</p>
            </div>
          ))}
        </div>
      </Card>
      )}

      {(isPlatformOwner || isStudioOwner) && (
      <Card className="executive-card">
        <PanelHeader title={roleExperience.flowTitle} eyebrow="Loyalty" />
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
      )}

      {isPlatformOwner && (
      <Card className="wide-card executive-card">
        <PanelHeader title="Studios por owner" eyebrow="Ownership map" />
        <div className="compact-list">
          {studiosByOwner.map((row) => (
            <div className="list-row elevated-row" key={row.owner}>
              <div>
                <strong>{row.owner}</strong>
                <small>{row.studios.map((studio) => getStudioCommercialName(studio)).filter(Boolean).join(', ') || 'Sin estudio asignado'}</small>
              </div>
              <StatusPill tone="approved">{row.studios.length} studio</StatusPill>
            </div>
          ))}
        </div>
      </Card>
      )}

      {(isPlatformOwner || isStudioOwner) && (
      <Card className="wide-card executive-card">
        <PanelHeader title={isPlatformOwner ? 'Top artistas' : 'Artistas del estudio'} eyebrow={isPlatformOwner ? 'Ranking ejecutivo' : 'Equipo y rendimiento'} />
        <div className="data-table executive-table">
          <div className="table-head">
            <span>Artista</span>
            <span>Ingresos</span>
            {isPlatformOwner && <span>Comision</span>}
            <span>Ocupacion</span>
            {isPlatformOwner && <span>Riesgo</span>}
          </div>
          {topArtists.map((artist) => (
            <div className="table-row" key={artist.artist}>
              <strong>{artist.artist}</strong>
              <span>{canSeeStudioRevenue ? formatCurrency(artist.revenue) : 'Privado'}</span>
              {isPlatformOwner && <span>{canSeeGlobalRevenue ? formatCurrency(artist.commission) : 'Privado'}</span>}
              <span>{artist.occupancy}%</span>
              {isPlatformOwner && <StatusPill tone={artist.risk > 0 ? 'warm' : 'success'}>{artist.risk > 0 ? `${artist.risk} eventos` : 'Controlado'}</StatusPill>}
            </div>
          ))}
        </div>
      </Card>
      )}

      {(isPlatformOwner || isStudioOwner) && (
      <Card className="wide-card">
        <PanelHeader title={isPlatformOwner ? 'Gestion de studios' : 'Mi estudio'} eyebrow="Operaciones" action={<Button size="sm" onClick={() => navigate(paths.adminArtists)}>Abrir</Button>} />
        <div className="data-table">
          <div className="table-head">
            <span>Studio</span>
            <span>Ciudad</span>
            <span>Especialidad</span>
            {canSeeStudioRevenue && <span>Ingresos</span>}
            <span>Estado</span>
          </div>
          {accessibleStudios.map((studio) => (
            <div className="table-row" key={studio.id}>
              <strong>{getStudioCommercialName(studio) || 'Estudio profesional'}</strong>
              <span>{studio.city}</span>
              <span>{studio.specialty}</span>
              {canSeeStudioRevenue && <span>{formatCurrency(studio.revenue)}</span>}
              <StatusPill tone={getStudioStatusTone(studio.studioStatus)}>{getStudioStatusLabel(studio.studioStatus)}</StatusPill>
            </div>
          ))}
        </div>
      </Card>
      )}

      {canSeeStudioClients && (
      <Card>
        <PanelHeader title={isPlatformOwner ? 'Gestion de clientes' : 'Clientas del estudio'} eyebrow="Comunidad" action={<Button size="sm" onClick={() => navigate(paths.adminClients)}>Abrir</Button>} />
        <div className="compact-list">
          {accessibleClients.map((client) => (
            <div className="list-row elevated-row" key={client.name}>
              <div>
                <strong>{client.name}</strong>
                <small>{client.appointments || 0} citas{isStudioManager ? '' : ` / ${client.spend || `${client.flowPoints || 0} pts`}`}</small>
              </div>
              <StatusPill tone={client.status === 'VIP' ? 'rose' : 'neutral'}>{client.status}</StatusPill>
            </div>
          ))}
        </div>
      </Card>
      )}

      {isPlatformOwner && (
      <Card className="system-card">
        <PanelHeader title="Estado del sistema" eyebrow="Infraestructura" />
        <div className="system-stack">
          {dashboardSystemStatus.map((item) => (
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
      )}
    </main>
  )
}

export default AdminDashboard
