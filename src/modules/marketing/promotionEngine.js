export function shouldActivateHappyHour(weeklyOccupancy) {
  return Number(weeklyOccupancy) < 40
}

export function generateAutomaticPromotion(weeklyOccupancy) {
  if (weeklyOccupancy < 40) {
    return {
      name: 'Happy Hour',
      status: 'Activo',
      message: 'Activa descuentos automáticos en horarios de baja ocupación.',
    }
  }

  if (weeklyOccupancy < 55) {
    return {
      name: 'Promoción adaptativa',
      status: 'Recomendado',
      message: 'Ajusta promociones en slots con baja demanda.',
    }
  }

  return {
    name: 'Promoción estándar',
    status: 'Estable',
    message: 'Mantén la visibilidad premium en tus clientes recurrentes.',
  }
}
