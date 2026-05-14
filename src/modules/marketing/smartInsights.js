export function generateInsights({ weeklyOccupancy, lowSlots, busyDays, inactiveCount, happyHourActive }) {
  const insights = []

  if (weeklyOccupancy < 65) {
    insights.push({
      title: 'Baja ocupación detectada',
      message: `Activa Happy Hour este ${lowSlots[0]}.`,
      tone: 'rose',
    })
  }

  if (inactiveCount >= 3) {
    insights.push({
      title: 'Clientes inactivos',
      message: `${inactiveCount} clientas podrían reactivarse.`,
      tone: 'warm',
    })
  }

  if (busyDays.length > 0) {
    insights.push({
      title: 'Alta demanda',
      message: `Tu ${busyDays[0]} está casi lleno.`,
      tone: 'success',
    })
  }

  if (!happyHourActive && weeklyOccupancy < 40) {
    insights.push({
      title: 'Oportunidad urgente',
      message: 'Happy Hour se recomienda para mejorar la ocupación.',
      tone: 'rose',
    })
  }

  return insights.slice(0, 4)
}
