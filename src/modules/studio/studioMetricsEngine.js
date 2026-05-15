import {
  calculateFlaggedAppointments,
  calculateOccupancyMetrics,
  calculateTotalRevenue,
} from '../business/businessMetricsEngine'

function parseRevenueValue(value) {
  if (typeof value === 'number') return value
  if (!value) return 0

  const normalized = String(value).replace('$', '').replace(',', '').trim().toUpperCase()
  const multiplier = normalized.endsWith('K') ? 1000 : normalized.endsWith('M') ? 1000000 : 1
  const numeric = Number.parseFloat(normalized.replace(/[KM]/g, ''))

  return Number.isFinite(numeric) ? numeric * multiplier : 0
}

export function calculateStudioMetrics(studio, artists = [], clients = [], appointments = []) {
  const studioArtists = artists.filter((artist) => artist.studioId === studio.id)
  const studioClients = clients.filter((client) => client.studioId === studio.id)
  const studioAppointments = appointments.filter((appointment) => appointment.studioId === studio.id)
  const revenueFromAppointments = calculateTotalRevenue(studioAppointments)
  const occupancy = studioAppointments.length > 0
    ? calculateOccupancyMetrics(studioAppointments, Math.max(12, (studio.totalArtists || 1) * 8)).occupancyRate
    : studio.occupancy
  const flaggedAppointments = calculateFlaggedAppointments(studioAppointments).length
  const governanceRisk = studio.riskScore === 'critical' ? 4 : studio.riskScore === 'high' ? 3 : studio.riskScore === 'medium' ? 2 : 1

  return {
    studioId: studio.id,
    studioName: studio.name,
    city: studio.city,
    specialty: studio.specialty,
    studioStatus: studio.studioStatus,
    occupancy,
    revenue: revenueFromAppointments || parseRevenueValue(studio.revenue),
    activeArtists: studioArtists.filter((artist) => artist.status === 'Activo').length || studio.totalArtists,
    activeClients: studioClients.filter((client) => client.status !== 'Inactivo').length || studio.totalClients,
    studioRisk: flaggedAppointments + governanceRisk,
    flaggedAppointments,
  }
}

export function generateStudioPortfolioSummary(studios = [], artists = [], clients = [], appointments = []) {
  const studioMetrics = studios.map((studio) => calculateStudioMetrics(studio, artists, clients, appointments))
  const averageOccupancy = studioMetrics.length > 0
    ? Math.round(studioMetrics.reduce((total, studio) => total + studio.occupancy, 0) / studioMetrics.length)
    : 0
  const totalRevenue = studioMetrics.reduce((total, studio) => total + studio.revenue, 0)
  const activeArtists = studioMetrics.reduce((total, studio) => total + studio.activeArtists, 0)
  const activeClients = studioMetrics.reduce((total, studio) => total + studio.activeClients, 0)
  const studioRisk = studioMetrics.reduce((total, studio) => total + studio.studioRisk, 0)

  return {
    studioMetrics,
    averageOccupancy,
    totalRevenue,
    activeArtists,
    activeClients,
    studioRisk,
  }
}

export function generateStudioInsights(studios = [], artists = [], clients = [], appointments = []) {
  const summary = generateStudioPortfolioSummary(studios, artists, clients, appointments)
  const insights = []

  summary.studioMetrics.forEach((studio) => {
    if (studio.occupancy > summary.averageOccupancy + 10) {
      insights.push(`${studio.studioName} tiene ocupacion superior al promedio del ecosistema.`)
    }

    if (studio.activeClients < 5 || studio.occupancy < 45) {
      insights.push(`${studio.studioName} presenta baja recurrencia y merece una estrategia de activacion.`)
    }

    if (studio.revenue > 60000 && studio.studioRisk <= 2) {
      insights.push(`${studio.studioName} tiene crecimiento acelerado con riesgo operativo controlado.`)
    }
  })

  return insights.slice(0, 5)
}
