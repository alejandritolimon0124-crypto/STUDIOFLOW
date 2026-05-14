// Business Control Layer - Appointment Economy Engine
// Foundation for financial and operational ecosystem

// Platform fee configuration
export const PLATFORM_FEE_RATE = 0.10 // 10% commission

// Risk score levels
export const RISK_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
}

// Appointment status types
export const APPOINTMENT_STATUS = {
  SCHEDULED: 'scheduled',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  FLAGGED: 'flagged',
}

// Calculate platform fee for an appointment
export function calculatePlatformFee(grossAmount) {
  if (!grossAmount || grossAmount <= 0) return 0
  return Math.round(grossAmount * PLATFORM_FEE_RATE)
}

// Calculate artist revenue after platform fee
export function calculateArtistRevenue(grossAmount) {
  const fee = calculatePlatformFee(grossAmount)
  return grossAmount - fee
}

// Calculate risk score based on appointment data
export function calculateRiskScore(appointment, serviceData) {
  if (!appointment || appointment.type === 'break') return RISK_LEVELS.LOW

  let riskPoints = 0

  // Service tier vs duration mismatch
  const expectedDuration = serviceData?.duration
  const actualDuration = appointment.duration

  if (expectedDuration && actualDuration) {
    const actualMinutes = parseInt(actualDuration.split(' ')[0])

    if (appointment.serviceTier === 'basic' && actualMinutes > 60) riskPoints += 2
    if (appointment.serviceTier === 'premium' && actualMinutes < 45) riskPoints += 1
    if (appointment.serviceTier === 'vip' && actualMinutes < 60) riskPoints += 1
  }

  // Points granted vs service tier coherence
  const expectedPoints = {
    basic: 40,
    medium: 60,
    premium: 90,
    vip: 120,
  }

  const expected = expectedPoints[appointment.serviceTier] || 0
  const granted = appointment.pointsGranted || 0

  if (granted > expected * 1.5) riskPoints += 2 // Excessive points
  if (granted < expected * 0.5) riskPoints += 1 // Too few points

  // Reward applied check
  if (appointment.rewardApplied && appointment.serviceTier === 'basic') riskPoints += 1

  // Duration anomalies
  if (actualDuration && parseInt(actualDuration.split(' ')[0]) > 180) riskPoints += 2 // Too long
  if (actualDuration && parseInt(actualDuration.split(' ')[0]) < 15) riskPoints += 1 // Too short

  // Determine risk level
  if (riskPoints >= 5) return RISK_LEVELS.CRITICAL
  if (riskPoints >= 3) return RISK_LEVELS.HIGH
  if (riskPoints >= 1) return RISK_LEVELS.MEDIUM
  return RISK_LEVELS.LOW
}

// Calculate complete appointment economy
export function calculateAppointmentEconomy(appointment, serviceData) {
  if (!appointment || appointment.type === 'break') {
    return {
      grossAmount: 0,
      platformFee: 0,
      artistRevenue: 0,
      serviceTier: null,
      rewardApplied: null,
      pointsGranted: 0,
      riskScore: RISK_LEVELS.LOW,
      appointmentStatus: APPOINTMENT_STATUS.SCHEDULED,
    }
  }

  const grossAmount = appointment.grossAmount || serviceData?.price || 0
  const platformFee = calculatePlatformFee(grossAmount)
  const artistRevenue = calculateArtistRevenue(grossAmount)
  const riskScore = calculateRiskScore(appointment, serviceData)

  return {
    grossAmount,
    platformFee,
    artistRevenue,
    serviceTier: appointment.serviceTier,
    rewardApplied: appointment.rewardApplied,
    pointsGranted: appointment.pointsGranted || 0,
    riskScore,
    appointmentStatus: appointment.appointmentStatus || APPOINTMENT_STATUS.SCHEDULED,
  }
}

// Get service data by name
export function getServiceData(serviceName, services) {
  return services?.find(service => service.name === serviceName)
}

// Validate appointment economy data
export function validateAppointmentEconomy(appointment) {
  const required = ['grossAmount', 'platformFee', 'artistRevenue', 'serviceTier', 'pointsGranted', 'riskScore', 'appointmentStatus']
  return required.every(field => Object.prototype.hasOwnProperty.call(appointment, field))
}