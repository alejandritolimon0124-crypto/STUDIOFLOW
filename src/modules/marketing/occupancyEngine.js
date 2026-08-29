export function calculateWeeklyOccupancy(appointments = []) {
  if (!appointments.length) {
    return {
      weeklyOccupancy: 0,
      lowSlots: [],
      busyDays: [],
    }
  }

  return {
    weeklyOccupancy: Math.min(100, Math.round((appointments.length / 40) * 100)),
    lowSlots: [],
    busyDays: [],
  }
}

export function detectLowOccupancySlots(appointments = []) {
  return calculateWeeklyOccupancy(appointments).lowSlots
}

export function detectBusyDays(appointments = []) {
  return calculateWeeklyOccupancy(appointments).busyDays
}
