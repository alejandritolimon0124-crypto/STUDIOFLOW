export function calculateServiceFlowPoints(price, rewardPercentage, multiplier = 1) {
  const amount = Number(price) || 0
  const percentage = Number(rewardPercentage) || 0
  const rewardMultiplier = Math.max(1, Number(multiplier) || 1)

  return Math.max(0, Math.round((amount * percentage / 10) * rewardMultiplier))
}

