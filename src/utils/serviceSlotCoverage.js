export function serviceSlotCoverage(slots, durationMinutes, now = Date.now()) {
  const duration = Number(durationMinutes) * 60000
  if (!Number.isFinite(duration) || duration <= 0) return []
  const available = slots.filter((slot) => slot.status === 'available'
    && Date.parse(slot.endsAt) > Date.parse(slot.startsAt))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))

  return available.filter((candidate) => {
    const start = Date.parse(candidate.startsAt)
    if (start <= now) return false
    const end = start + duration
    let coveredUntil = start
    for (const slot of available) {
      if (slot.scheduleId !== candidate.scheduleId
        || slot.membershipId !== candidate.membershipId
        || slot.studioId !== candidate.studioId
        || slot.artistId !== candidate.artistId) continue
      const slotStart = Date.parse(slot.startsAt)
      const slotEnd = Date.parse(slot.endsAt)
      if (slotStart < start) continue
      if (slotStart > coveredUntil) break
      coveredUntil = Math.max(coveredUntil, slotEnd)
      if (coveredUntil >= end) return true
    }
    return false
  })
}
