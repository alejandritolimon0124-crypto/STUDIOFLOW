export const flowPointTiers = {
  basic: 40,
  medium: 60,
  premium: 90,
  vip: 120,
}

export function calculateVipTier(flowPoints) {
  if (flowPoints >= flowPointTiers.vip) return 'VIP'
  if (flowPoints >= flowPointTiers.premium) return 'Premium'
  if (flowPoints >= flowPointTiers.medium) return 'Medium'
  return 'Basic'
}

export function calculateFlowPoints({ totalVisits = 0, streak = 0 } = {}) {
  return totalVisits * 5 + streak * 8
}

export function getClientById(clients, clientId) {
  if (!clientId || !Array.isArray(clients)) return null
  return clients.find((client) => client.id === clientId) || null
}

export function getClientVisits(clientId, appointments) {
  if (!clientId || !Array.isArray(appointments)) return []
  return appointments.filter((appointment) => appointment.clientId === clientId)
}
