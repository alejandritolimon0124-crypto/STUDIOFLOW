// Smart Automations Engine
// Genera automatizaciones inteligentes basadas en Flow Points, streaks, ocupación y datos de cliente

import { getExpiringPoints, vipTierThresholds } from '../loyalty/flowPointsEngine'

export const automationTypes = {
  EXPIRING_POINTS: 'expiringPoints',
  STREAK_RISK: 'streakRisk',
  LOW_OCCUPANCY: 'lowOccupancy',
  INACTIVE_CLIENT: 'inactiveClient',
  VIP_PROGRESS: 'vipProgress',
  BIRTHDAY: 'birthday',
  TIER_ACHIEVEMENT: 'tierAchievement',
  SERVICE_RECOMMENDATION: 'serviceRecommendation',
  DOUBLE_POINTS: 'doublePoints',
}

export const automationPriority = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
}

// Detecta puntos próximos a vencer para un cliente
export function detectExpiringPoints(client, daysThreshold = 14) {
  if (!client || !client.rewardsHistory) {
    return null
  }

  const expiringPoints = getExpiringPoints(client, daysThreshold)

  if (expiringPoints === 0) {
    return null
  }

  const now = new Date()
  const expiringEntries = client.rewardsHistory
    .filter((entry) => entry.points && entry.points > 0 && entry.expirationDate)
    .map((entry) => {
      const expiration = new Date(entry.expirationDate)
      return {
        ...entry,
        daysUntil: Math.max(0, Math.ceil((expiration - now) / (1000 * 60 * 60 * 24))),
      }
    })
    .filter((entry) => entry.daysUntil > 0 && entry.daysUntil <= daysThreshold)
    .sort((a, b) => a.daysUntil - b.daysUntil)

  const nearestExpiration = expiringEntries[0]

  if (!nearestExpiration) {
    return null
  }

  return {
    type: automationTypes.EXPIRING_POINTS,
    priority: nearestExpiration.daysUntil <= 7 ? automationPriority.CRITICAL : automationPriority.HIGH,
    title: `⚠️ Puntos por vencer`,
    message: `${expiringPoints} Flow Points expiran en ${nearestExpiration.daysUntil} días. Usa tus puntos ahora mismo.`,
    ctaText: 'Agendar cita',
    ctaAction: 'schedule',
    daysUntil: nearestExpiration.daysUntil,
    points: expiringPoints,
  }
}

// Detecta si el streak del cliente está en riesgo
export function detectStreakRisk(client, streakThreshold = 45) {
  if (!client || !client.lastVisit || client.streak === 0) {
    return null
  }

  const lastVisit = new Date(client.lastVisit)
  const today = new Date()
  const daysSinceLastVisit = Math.floor((today - lastVisit) / (1000 * 60 * 60 * 24))

  // Si ha pasado más del 50% del umbral, hay riesgo
  if (daysSinceLastVisit > streakThreshold * 0.5 && daysSinceLastVisit <= streakThreshold) {
    const daysLeft = streakThreshold - daysSinceLastVisit

    return {
      type: automationTypes.STREAK_RISK,
      priority: automationPriority.HIGH,
      title: `🔥 Tu streak está en riesgo`,
      message: `Tienes ${daysLeft} días para mantener tu racha de ${client.streak} visitas. ¡No la pierdas!`,
      ctaText: 'Reservar ahora',
      ctaAction: 'schedule',
      streak: client.streak,
      daysLeft,
    }
  }

  return null
}

// Detecta baja ocupación en la agenda (para artista)
export function detectLowOccupancy(appointments, occupancyThreshold = 50) {
  if (!appointments || appointments.length === 0) {
    return null
  }

  const totalSlots = 12 // 8 horas / 40 minutos promedio
  const bookedSlots = appointments.filter((apt) => apt.type === 'appointment').length
  const occupancyPercent = Math.round((bookedSlots / totalSlots) * 100)

  if (occupancyPercent < occupancyThreshold) {
    return {
      type: automationTypes.LOW_OCCUPANCY,
      priority: automationPriority.MEDIUM,
      title: `📉 Baja ocupación detectada`,
      message: `Tu agenda está al ${occupancyPercent}% de ocupación. Activa una promoción para llenar espacios.`,
      ctaText: 'Habilitar promoción',
      ctaAction: 'enablePromotion',
      occupancyPercent,
      emptySlots: totalSlots - bookedSlots,
    }
  }

  return null
}

// Detecta clientes inactivos
export function detectInactiveClients(clients, inactivityDays = 60) {
  if (!clients || clients.length === 0) {
    return []
  }

  const today = new Date()

  return clients
    .map((client) => {
      if (!client.lastVisit) {
        return { ...client, daysSinceVisit: Infinity }
      }

      const lastVisit = new Date(client.lastVisit)
      const daysSinceVisit = Math.floor((today - lastVisit) / (1000 * 60 * 60 * 24))

      if (daysSinceVisit >= inactivityDays) {
        return { ...client, daysSinceVisit }
      }

      return null
    })
    .filter(Boolean)
    .sort((a, b) => b.daysSinceVisit - a.daysSinceVisit)
}

// Detecta progreso hacia el siguiente VIP tier
export function detectVipProgress(client) {
  if (!client || !client.flowPoints) {
    return null
  }

  const currentTierIndex = vipTierThresholds.findIndex((tier) => client.vipTier === tier.name)
  const nextTierIndex = currentTierIndex + 1

  if (nextTierIndex >= vipTierThresholds.length) {
    // Ya está en el máximo tier
    return null
  }

  const nextTier = vipTierThresholds[nextTierIndex]
  const pointsNeeded = nextTier.minPoints - client.flowPoints
  const progressPercent = Math.round(((client.flowPoints - vipTierThresholds[currentTierIndex].minPoints) / (nextTier.minPoints - vipTierThresholds[currentTierIndex].minPoints)) * 100)

  // Solo mostrar si está entre 30% y 95% del camino
  if (progressPercent >= 30 && progressPercent <= 95) {
    return {
      type: automationTypes.VIP_PROGRESS,
      priority: automationPriority.LOW,
      title: `✨ Casi llegas a ${nextTier.name}`,
      message: `Solo ${pointsNeeded} puntos más para convertirte en ${nextTier.name}. ¡Estás muy cerca!`,
      ctaText: 'Ver recompensas',
      ctaAction: 'viewRewards',
      currentTier: client.vipTier,
      nextTier: nextTier.name,
      pointsNeeded,
      progress: progressPercent,
    }
  }

  return null
}

// Detecta si el cliente cumple años (requiere birthday en el formato 'YYYY-MM-DD')
export function detectBirthday(client) {
  if (!client || !client.birthday) {
    return null
  }

  const today = new Date()
  const [, birthMonth, birthDay] = client.birthday.split('-').map(Number)
  const thisYearBirthday = new Date(today.getFullYear(), birthMonth - 1, birthDay)

  // Si ya pasó este año, considera el próximo
  if (thisYearBirthday < today) {
    thisYearBirthday.setFullYear(today.getFullYear() + 1)
  }

  const daysUntilBirthday = Math.ceil((thisYearBirthday - today) / (1000 * 60 * 60 * 24))

  if (daysUntilBirthday === 0) {
    return {
      type: automationTypes.BIRTHDAY,
      priority: automationPriority.HIGH,
      title: `🎉 ¡Feliz Cumpleaños!`,
      message: `Hoy es tu día especial. Recibe bonus 30 Flow Points como regalo de Studio Flow.`,
      ctaText: 'Reclamar gift',
      ctaAction: 'claimBirthdayGift',
      bonus: 30,
    }
  }

  if (daysUntilBirthday <= 7) {
    return {
      type: automationTypes.BIRTHDAY,
      priority: automationPriority.MEDIUM,
      title: `🎂 Tu cumpleaños es pronto`,
      message: `En ${daysUntilBirthday} días celebramos contigo. Prepárate para recibir un regalo especial.`,
      ctaText: 'Ver sorpresa',
      ctaAction: 'viewBirthdayOffer',
    }
  }

  return null
}

// Detecta cuando un cliente ha alcanzado un nuevo tier
export function detectTierAchievement(client, previousTier) {
  if (!client || !previousTier) {
    return null
  }

  if (client.vipTier !== previousTier) {
    return {
      type: automationTypes.TIER_ACHIEVEMENT,
      priority: automationPriority.HIGH,
      title: `👑 ¡Nuevas alturas!`,
      message: `Felicidades, ahora eres ${client.vipTier}. Desbloquea beneficios exclusivos y disfruta de privilegios especiales.`,
      ctaText: 'Ver nuevos beneficios',
      ctaAction: 'viewBenefits',
      newTier: client.vipTier,
      benefits: getBenefitsForTier(client.vipTier),
    }
  }

  return null
}

// Obtiene beneficios según tier (helper)
function getBenefitsForTier(tier) {
  const benefits = {
    Glow: ['Promociones privadas', 'Bonus cumpleaños', 'Prioridad agenda'],
    Muse: ['Reservas ultra-rápidas', 'Acceso a productos exclusivos', 'Invitaciones VIP'],
    Icon: ['Estilo personalizado', 'Servicio exprés', 'Beneficios especiales de otoño'],
    Elite: ['Atención prioritaria', 'Experiencias a la medida', 'Eventos de lanzamiento'],
  }

  return benefits[tier] || []
}

// Recomendación de servicio basada en preferencias
export function detectServiceRecommendation(client, availableServices = []) {
  if (!client || !availableServices || availableServices.length === 0) {
    return null
  }

  const preferredServices = client.preferredServices || []

  // Si tiene servicios preferidos, sugiere el siguiente en la lista o un relacionado
  if (preferredServices.length > 0) {
    const complementaryService = availableServices.find(
      (service) => !preferredServices.includes(service.name) && service.status === 'Activo',
    )

    if (complementaryService) {
      return {
        type: automationTypes.SERVICE_RECOMMENDATION,
        priority: automationPriority.LOW,
        title: `✨ Te recomendamos`,
        message: `Basado en tu historial, creemos que te encantará ${complementaryService.name}.`,
        ctaText: 'Conocer más',
        ctaAction: 'viewService',
        serviceName: complementaryService.name,
      }
    }
  }

  return null
}

// Genera todas las automatizaciones para un cliente
export function generateClientAutomations(client, availableServices = []) {
  const automations = []

  // Detectar cada tipo de automatización
  const expiringPoints = detectExpiringPoints(client)
  const streakRisk = detectStreakRisk(client)
  const vipProgress = detectVipProgress(client)
  const birthday = detectBirthday(client)
  const serviceRec = detectServiceRecommendation(client, availableServices)

  if (expiringPoints) automations.push(expiringPoints)
  if (streakRisk) automations.push(streakRisk)
  if (vipProgress) automations.push(vipProgress)
  if (birthday) automations.push(birthday)
  if (serviceRec) automations.push(serviceRec)

  // Ordenar por prioridad
  const priorityOrder = {
    [automationPriority.CRITICAL]: 0,
    [automationPriority.HIGH]: 1,
    [automationPriority.MEDIUM]: 2,
    [automationPriority.LOW]: 3,
  }

  return automations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
}

// Genera automatizaciones para el panel de artista/marketing
export function generateArtistAutomations(artistState, selectedDate = '2026-05-18') {
  const automations = []

  if (!artistState) {
    return automations
  }

  // Detectar baja ocupación en el día seleccionado
  const appointmentsToday = (artistState.appointments || []).filter((apt) => apt.date === selectedDate)
  const lowOccupancyToday = detectLowOccupancy(appointmentsToday, 50)

  if (lowOccupancyToday) {
    automations.push({
      ...lowOccupancyToday,
      title: `📉 Jueves con baja ocupación`,
      message: `Tu agenda del ${selectedDate} está al ${lowOccupancyToday.occupancyPercent}% de ocupación. Activa una promoción para llenar espacios.`,
    })
  }

  // Detectar clientes inactivos
  const inactiveClients = detectInactiveClients(artistState.clients || [], 60)

  if (inactiveClients.length > 0) {
    const topInactiveClient = inactiveClients[0]

    automations.push({
      type: automationTypes.INACTIVE_CLIENT,
      priority: automationPriority.MEDIUM,
      title: `🔄 Reactivación de cliente`,
      message: `${topInactiveClient.name} no ha visitado en ${topInactiveClient.daysSinceVisit} días. Envía una oferta especial.`,
      ctaText: 'Crear promoción',
      ctaAction: 'createPromotion',
      clientName: topInactiveClient.name,
      daysSinceVisit: topInactiveClient.daysSinceVisit,
    })
  }

  // Detectar oportunidad de double points para llenar agenda
  if (lowOccupancyToday && lowOccupancyToday.emptySlots >= 3) {
    automations.push({
      type: automationTypes.DOUBLE_POINTS,
      priority: automationPriority.MEDIUM,
      title: `💰 Oportunidad: Doble Flow Points`,
      message: `Activa doble Flow Points para llenar los ${lowOccupancyToday.emptySlots} espacios disponibles.`,
      ctaText: 'Habilitar doble puntos',
      ctaAction: 'enableDoublePoints',
      emptySlots: lowOccupancyToday.emptySlots,
    })
  }

  // Insight sobre clientas VIP
  const vipClients = (artistState.clients || []).filter((client) => client.vipTier === 'Icon' || client.vipTier === 'Elite')

  if (vipClients.length > 0) {
    automations.push({
      type: automationTypes.TIER_ACHIEVEMENT,
      priority: automationPriority.LOW,
      title: `👑 Engagement con VIP`,
      message: `Tus clientes ${vipClients.length} VIP responden mejor a rewards que a descuentos. Personaliza su experiencia.`,
      ctaText: 'Ver estrategia',
      ctaAction: 'viewVipStrategy',
      vipCount: vipClients.length,
    })
  }

  // Ordenar por prioridad
  const priorityOrder = {
    [automationPriority.CRITICAL]: 0,
    [automationPriority.HIGH]: 1,
    [automationPriority.MEDIUM]: 2,
    [automationPriority.LOW]: 3,
  }

  return automations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
}

// Función general que genera todas las automatizaciones
export function generateSmartAutomations(context) {
  const result = {
    client: [],
    artist: [],
  }

  if (context.clientProfile && context.availableServices) {
    result.client = generateClientAutomations(context.clientProfile, context.availableServices)
  }

  if (context.artistState) {
    result.artist = generateArtistAutomations(context.artistState, context.selectedDate)
  }

  return result
}
