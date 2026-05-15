export const STUDIO_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  SUSPENDED: 'suspended',
  REJECTED: 'rejected',
}

export const studioStatusLabels = {
  [STUDIO_STATUS.PENDING]: 'En validacion',
  [STUDIO_STATUS.APPROVED]: 'Aprobado',
  [STUDIO_STATUS.SUSPENDED]: 'En pausa curada',
  [STUDIO_STATUS.REJECTED]: 'No disponible',
}

export const studioStatusTones = {
  [STUDIO_STATUS.PENDING]: 'pending',
  [STUDIO_STATUS.APPROVED]: 'approved',
  [STUDIO_STATUS.SUSPENDED]: 'suspended',
  [STUDIO_STATUS.REJECTED]: 'rejected',
}

export const guardedStudioFeatures = {
  profile: true,
  branding: true,
  schedule: true,
  services: true,
  marketing: false,
  economy: false,
  automations: false,
  publicAgenda: false,
}

export function getDefaultStudioStatus() {
  return STUDIO_STATUS.PENDING
}

export function isStudioApproved(studio) {
  return (studio?.studioStatus || getDefaultStudioStatus()) === STUDIO_STATUS.APPROVED
}

export function getStudioAccess(studio) {
  if (isStudioApproved(studio)) {
    return Object.keys(guardedStudioFeatures).reduce((access, feature) => ({
      ...access,
      [feature]: true,
    }), {})
  }

  return guardedStudioFeatures
}

export function canUseOperationalFeature(studio, feature) {
  return Boolean(getStudioAccess(studio)[feature])
}

export function getStudioStatusLabel(status) {
  return studioStatusLabels[status] || studioStatusLabels[STUDIO_STATUS.PENDING]
}

export function getStudioStatusTone(status) {
  return studioStatusTones[status] || studioStatusTones[STUDIO_STATUS.PENDING]
}

export function calculateEcosystemGovernanceMetrics(studios) {
  const pending = studios.filter((studio) => studio.studioStatus === STUDIO_STATUS.PENDING).length
  const approved = studios.filter((studio) => studio.studioStatus === STUDIO_STATUS.APPROVED).length
  const suspended = studios.filter((studio) => studio.studioStatus === STUDIO_STATUS.SUSPENDED).length
  const rejected = studios.filter((studio) => studio.studioStatus === STUDIO_STATUS.REJECTED).length
  const ecosystemRisk = pending + suspended * 2 + rejected * 3

  return {
    pending,
    approved,
    suspended,
    rejected,
    ecosystemRisk,
  }
}
