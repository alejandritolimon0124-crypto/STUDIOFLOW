// Business Control Layer - Business Metrics Engine
// Owner insights and platform-wide analytics foundation

import { calculateAppointmentEconomy } from './appointmentEconomyEngine.js'

// Calculate total revenue across all appointments
export function calculateTotalRevenue(appointments) {
  return appointments.reduce((total, appointment) => {
    const economy = calculateAppointmentEconomy(appointment)
    return total + economy.grossAmount
  }, 0)
}

// Calculate platform revenue (total fees collected)
export function calculatePlatformRevenue(appointments) {
  return appointments.reduce((total, appointment) => {
    const economy = calculateAppointmentEconomy(appointment)
    return total + economy.platformFee
  }, 0)
}

// Calculate total artist revenue across all appointments
export function calculateArtistRevenueTotals(appointments) {
  return appointments.reduce((total, appointment) => {
    const economy = calculateAppointmentEconomy(appointment)
    return total + economy.artistRevenue
  }, 0)
}

// Get flagged appointments (high or critical risk)
export function calculateFlaggedAppointments(appointments) {
  return appointments.filter(appointment => {
    const economy = calculateAppointmentEconomy(appointment)
    return economy.riskScore === 'high' || economy.riskScore === 'critical'
  })
}

// Calculate occupancy metrics with economic context
export function calculateOccupancyMetrics(appointments, totalSlots = 24) {
  const bookedAppointments = appointments.filter(app => app.type === 'appointment')
  const occupancyRate = (bookedAppointments.length / totalSlots) * 100

  const revenueBySlot = bookedAppointments.reduce((total, app) => {
    const economy = calculateAppointmentEconomy(app)
    return total + economy.grossAmount
  }, 0)

  const avgRevenuePerSlot = bookedAppointments.length > 0 ? revenueBySlot / bookedAppointments.length : 0

  return {
    occupancyRate: Math.round(occupancyRate),
    totalSlots,
    bookedSlots: bookedAppointments.length,
    revenueBySlot,
    avgRevenuePerSlot,
  }
}

// Generate business insights for owner dashboard
export function generateBusinessInsights(appointments) {
  const insights = []

  // Revenue insights
  const totalRevenue = calculateTotalRevenue(appointments)
  const platformRevenue = calculatePlatformRevenue(appointments)
  const artistRevenue = calculateArtistRevenueTotals(appointments)

  if (totalRevenue > 0) {
    insights.push({
      type: 'revenue',
      priority: 'high',
      title: '💰 Ingresos del período',
      message: `Total: $${totalRevenue.toLocaleString()} | Plataforma: $${platformRevenue.toLocaleString()} | Artistas: $${artistRevenue.toLocaleString()}`,
      metric: totalRevenue,
    })
  }

  // Risk insights
  const flaggedAppointments = calculateFlaggedAppointments(appointments)
  if (flaggedAppointments.length > 0) {
    const criticalCount = flaggedAppointments.filter(app => {
      const economy = calculateAppointmentEconomy(app)
      return economy.riskScore === 'critical'
    }).length

    insights.push({
      type: 'risk',
      priority: criticalCount > 0 ? 'critical' : 'high',
      title: '🚨 Eventos con riesgo',
      message: `${flaggedAppointments.length} eventos requieren revisión${criticalCount > 0 ? ` (${criticalCount} críticos)` : ''}`,
      metric: flaggedAppointments.length,
    })
  }

  // Occupancy insights
  const occupancyMetrics = calculateOccupancyMetrics(appointments)
  insights.push({
    type: 'occupancy',
    priority: 'medium',
    title: '📊 Ocupación global',
    message: `${occupancyMetrics.occupancyRate}% ocupación | Ingreso promedio: $${Math.round(occupancyMetrics.avgRevenuePerSlot)} por slot`,
    metric: occupancyMetrics.occupancyRate,
  })

  // Promotion insights
  const doublePointsAppointments = appointments.filter(app => app.rewardApplied === 'double_points')
  if (doublePointsAppointments.length > 0) {
    const revenueFromPromotions = doublePointsAppointments.reduce((total, app) => {
      const economy = calculateAppointmentEconomy(app)
      return total + economy.grossAmount
    }, 0)

    insights.push({
      type: 'promotion',
      priority: 'medium',
      title: '🎯 Impacto promocional',
      message: `Doble puntos generó $${revenueFromPromotions.toLocaleString()} en ${doublePointsAppointments.length} eventos`,
      metric: revenueFromPromotions,
    })
  }

  // Sort by priority
  const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 }
  return insights.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority])
}

// Calculate artist-specific metrics
export function calculateArtistMetrics(appointments, artistId) {
  const artistAppointments = appointments.filter(app => app.artistId === artistId || !app.artistId) // Mock for single artist

  const totalRevenue = calculateTotalRevenue(artistAppointments)
  const platformFees = calculatePlatformRevenue(artistAppointments)
  const netRevenue = calculateArtistRevenueTotals(artistAppointments)
  const avgRevenuePerAppointment = artistAppointments.length > 0 ? netRevenue / artistAppointments.length : 0

  return {
    totalAppointments: artistAppointments.length,
    totalRevenue,
    platformFees,
    netRevenue,
    avgRevenuePerAppointment: Math.round(avgRevenuePerAppointment),
    flaggedAppointments: calculateFlaggedAppointments(artistAppointments).length,
  }
}

// Generate owner dashboard summary
export function generateOwnerDashboardSummary(appointments, services) {
  const totalRevenue = calculateTotalRevenue(appointments)
  const platformRevenue = calculatePlatformRevenue(appointments)
  const flaggedCount = calculateFlaggedAppointments(appointments).length
  const occupancyMetrics = calculateOccupancyMetrics(appointments)

  return {
    totalRevenue,
    platformRevenue,
    artistRevenue: calculateArtistRevenueTotals(appointments),
    flaggedAppointments: flaggedCount,
    occupancyRate: occupancyMetrics.occupancyRate,
    avgRevenuePerSlot: Math.round(occupancyMetrics.avgRevenuePerSlot),
    insights: generateBusinessInsights(appointments, services),
  }
}