export function calculateClientTier(visits = 0) {
  if (visits >= 20) return 'VIP'
  if (visits >= 12) return 'Gold'
  if (visits >= 5) return 'Frequent'
  return 'New'
}

export function calculateTierProgress(visits = 0) {
  if (visits >= 20) return 100
  if (visits >= 12) return 80
  if (visits >= 5) return 55
  return 25
}
