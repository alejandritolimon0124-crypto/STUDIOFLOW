export const ROLES = {
  PLATFORM_OWNER: 'platform_owner',
  STUDIO_OWNER: 'studio_owner',
  STUDIO_MANAGER: 'studio_manager',
  ARTIST: 'artist',
  CLIENT: 'client',
}

export const permissions = {
  GOVERNANCE: 'governance',
  STUDIOS: 'studios',
  GLOBAL_REVENUE: 'global_revenue',
  GLOBAL_INSIGHTS: 'global_insights',
  ECOSYSTEM_RISK: 'ecosystem_risk',
  STUDIO_REVENUE: 'studio_revenue',
  STUDIO_ARTISTS: 'studio_artists',
  STUDIO_MARKETING: 'studio_marketing',
  STUDIO_OCCUPANCY: 'studio_occupancy',
  STUDIO_CLIENTS: 'studio_clients',
  AGENDA: 'agenda',
  CLIENTS: 'clients',
  OWN_AGENDA: 'own_agenda',
  OWN_CLIENTS: 'own_clients',
  FLOW_POINTS: 'flow_points',
  CLIENT_PORTAL: 'client_portal',
}

export const permissionsByRole = {
  [ROLES.PLATFORM_OWNER]: [
    permissions.GOVERNANCE,
    permissions.STUDIOS,
    permissions.GLOBAL_REVENUE,
    permissions.GLOBAL_INSIGHTS,
    permissions.ECOSYSTEM_RISK,
    permissions.STUDIO_REVENUE,
    permissions.STUDIO_ARTISTS,
    permissions.STUDIO_MARKETING,
    permissions.STUDIO_OCCUPANCY,
    permissions.STUDIO_CLIENTS,
    permissions.AGENDA,
    permissions.CLIENTS,
  ],
  [ROLES.STUDIO_OWNER]: [
    permissions.STUDIO_REVENUE,
    permissions.STUDIO_ARTISTS,
    permissions.STUDIO_MARKETING,
    permissions.STUDIO_OCCUPANCY,
    permissions.STUDIO_CLIENTS,
    permissions.AGENDA,
    permissions.CLIENTS,
  ],
  [ROLES.STUDIO_MANAGER]: [
    permissions.AGENDA,
    permissions.CLIENTS,
    permissions.STUDIO_MARKETING,
    permissions.STUDIO_OCCUPANCY,
  ],
  [ROLES.ARTIST]: [
    permissions.OWN_AGENDA,
    permissions.OWN_CLIENTS,
    permissions.FLOW_POINTS,
  ],
  [ROLES.CLIENT]: [
    permissions.CLIENT_PORTAL,
    permissions.FLOW_POINTS,
  ],
}

export const roleLabels = {
  admin: 'Platform owner',
  [ROLES.PLATFORM_OWNER]: 'Platform owner',
  [ROLES.STUDIO_OWNER]: 'Studio owner',
  [ROLES.STUDIO_MANAGER]: 'Studio manager',
  [ROLES.ARTIST]: 'Artist',
  [ROLES.CLIENT]: 'Client',
}

function normalizeRole(role) {
  if (role === 'admin') return ROLES.PLATFORM_OWNER
  return role
}

export function hasPermission(user, permission) {
  const role = normalizeRole(user?.role)
  if (!role) return false
  return permissionsByRole[role]?.includes(permission) || false
}

export function hasAnyPermission(user, permissionList = []) {
  return permissionList.some((permission) => hasPermission(user, permission))
}

export function canAccessStudio(user, studioId, accessibleStudioIds = []) {
  if (!user) return false
  const role = normalizeRole(user.role)
  if (role === ROLES.PLATFORM_OWNER) return true
  if (role === ROLES.CLIENT) return true
  return accessibleStudioIds.includes(studioId)
}

export function filterByStudioAccess(items = [], user, accessibleStudioIds = []) {
  const role = normalizeRole(user?.role)
  if (role === ROLES.PLATFORM_OWNER || role === ROLES.CLIENT) return items
  return items.filter((item) => accessibleStudioIds.includes(item.studioId))
}

export function getRoleLabel(role) {
  return roleLabels[normalizeRole(role)] || 'Workspace user'
}
