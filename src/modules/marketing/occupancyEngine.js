export function calculateWeeklyOccupancy() {
  return {
    weeklyOccupancy: 62,
    lowSlots: ['Martes 2PM', 'Jueves 11AM'],
    busyDays: ['Viernes', 'Sábado'],
  }
}

export function detectLowOccupancySlots() {
  return calculateWeeklyOccupancy().lowSlots
}

export function detectBusyDays() {
  return calculateWeeklyOccupancy().busyDays
}
