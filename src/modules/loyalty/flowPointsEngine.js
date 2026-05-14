// Flow Points Engine - Loyalty System Foundation
// Vigencia: 90 días desde la fecha de ganancia

export const flowPointRewards = {
  discount10: {
    id: 'discount10',
    name: '10% Descuento',
    description: 'Descuento del 10% en cualquier servicio',
    pointsCost: 50,
    type: 'discount',
    value: 10,
    validDays: 30,
  },
  discount20: {
    id: 'discount20',
    name: '20% Descuento',
    description: 'Descuento del 20% en cualquier servicio',
    pointsCost: 90,
    type: 'discount',
    value: 20,
    validDays: 30,
  },
  freeService: {
    id: 'freeService',
    name: 'Servicio Gratis',
    description: 'Un servicio gratuito (hasta $800)',
    pointsCost: 150,
    type: 'freeService',
    value: 800,
    validDays: 60,
  },
  vipUpgrade: {
    id: 'vipUpgrade',
    name: 'Upgrade VIP',
    description: 'Acceso prioritario y beneficios VIP por 30 días',
    pointsCost: 200,
    type: 'vipUpgrade',
    value: 30,
    validDays: 30,
  },
  birthdayGift: {
    id: 'birthdayGift',
    name: 'Regalo de Cumpleaños',
    description: 'Producto o tratamiento especial de cumpleaños',
    pointsCost: 120,
    type: 'birthdayGift',
    value: 'special',
    validDays: 365,
  },
}

export const flowPointRules = {
  expirationDays: 90,
}

export const serviceTierPoints = {
  basic: 40,
  medium: 60,
  premium: 90,
  vip: 120,
}

export const vipTierThresholds = [
  { name: 'Glow', minPoints: 0 },
  { name: 'Muse', minPoints: 500 },
  { name: 'Icon', minPoints: 1200 },
  { name: 'Elite', minPoints: 2500 },
]

export function getVipTierForPoints(points) {
  return [...vipTierThresholds]
    .reverse()
    .find((tier) => points >= tier.minPoints)?.name || 'Glow'
}

export function calculateFlowPoints(serviceTier) {
  if (!serviceTier || typeof serviceTier !== 'string') {
    return serviceTierPoints.basic
  }

  return serviceTierPoints[serviceTier.toLowerCase()] || serviceTierPoints.basic
}

export const calculatePointsForAppointment = calculateFlowPoints

export function addPointsToClient(client, pointsToAdd, reason = 'appointment') {
  const now = new Date()
  const expirationDate = new Date(now)
  expirationDate.setDate(now.getDate() + flowPointRules.expirationDays)

  const newPointsEntry = {
    id: `points-${Date.now()}`,
    points: pointsToAdd,
    reason,
    earnedDate: now.toISOString().split('T')[0],
    expirationDate: expirationDate.toISOString().split('T')[0],
  }

  const newFlowPoints = (client.flowPoints || 0) + pointsToAdd

  return {
    ...client,
    flowPoints: newFlowPoints,
    vipTier: getVipTierForPoints(newFlowPoints),
    rewardsHistory: [
      ...client.rewardsHistory,
      newPointsEntry,
    ],
  }
}

export function getActivePoints(client) {
  const now = new Date()

  return client.rewardsHistory
    .filter(entry => entry.points && entry.points > 0)
    .filter(entry => {
      const expiration = new Date(entry.expirationDate)
      return expiration > now
    })
    .reduce((total, entry) => total + entry.points, 0)
}

export function canRedeemReward(client, rewardId) {
  const reward = flowPointRewards[rewardId]
  if (!reward) return false

  const activePoints = getActivePoints(client)
  return activePoints >= reward.pointsCost
}

export function redeemReward(client, rewardId) {
  const reward = flowPointRewards[rewardId]
  if (!reward || !canRedeemReward(client, rewardId)) {
    return { success: false, client, error: 'Insufficient points or invalid reward' }
  }

  const now = new Date()
  const redemptionEntry = {
    id: `redemption-${Date.now()}`,
    type: 'redemption',
    rewardId,
    rewardName: reward.name,
    pointsSpent: reward.pointsCost,
    date: now.toISOString().split('T')[0],
  }

  const updatedClient = {
    ...client,
    flowPoints: client.flowPoints - reward.pointsCost,
    rewardsHistory: [
      ...client.rewardsHistory,
      redemptionEntry,
    ],
  }

  return {
    success: true,
    client: updatedClient,
    reward,
    pointsSpent: reward.pointsCost,
  }
}

export function getExpiringPoints(client, daysAhead = 7) {
  const now = new Date()
  const futureDate = new Date(now)
  futureDate.setDate(now.getDate() + daysAhead)

  return client.rewardsHistory
    .filter(entry => entry.points && entry.points > 0)
    .filter(entry => {
      const expiration = new Date(entry.expirationDate)
      return expiration <= futureDate && expiration > now
    })
    .reduce((total, entry) => total + entry.points, 0)
}

export function getPointsFeedback(pointsEarned, serviceName) {
  const messages = {
    low: [
      `¡Genial! Ganaste ${pointsEarned} Flow Points por tu ${serviceName}`,
      `¡Gracias por visitarnos! ${pointsEarned} puntos añadidos a tu cuenta`,
    ],
    medium: [
      `¡Excelente! ${pointsEarned} Flow Points por tu ${serviceName}`,
      `¡Tu lealtad nos encanta! ${pointsEarned} puntos ganados`,
    ],
    high: [
      `¡Increíble! ${pointsEarned} Flow Points por tu ${serviceName}`,
      `¡Eres VIP! ${pointsEarned} puntos añadidos por tu visita`,
    ],
  }

  let tier = 'low'
  if (pointsEarned >= 30) tier = 'high'
  else if (pointsEarned >= 15) tier = 'medium'

  const tierMessages = messages[tier]
  return tierMessages[Math.floor(Math.random() * tierMessages.length)]
}

export function checkBirthdayBonus(client, appointmentDate) {
  if (!client.birthday) return false

  const [, birthMonth] = client.birthday.split('-').map(Number)
  const [, apptMonth] = appointmentDate.split('-').map(Number)

  return birthMonth === apptMonth
}

export function updateClientStreak(client, appointmentDate) {
  // Lógica simplificada: si la última visita fue hace menos de 45 días, aumenta la racha
  if (!client.lastVisit) return 1

  const lastVisit = new Date(client.lastVisit)
  const currentVisit = new Date(appointmentDate)
  const daysDiff = Math.floor((currentVisit - lastVisit) / (1000 * 60 * 60 * 24))

  if (daysDiff <= 45) {
    return client.streak + 1
  } else {
    return 1 // Reinicia racha
  }
}