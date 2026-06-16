import { Navigate } from 'react-router-dom'
import { useApp } from '../contexts/appContextCore'
import { ROLES } from '../modules/permissions/rolePermissions'

const allowedOrganizationalRolesByRoute = {
  admin: [ROLES.PLATFORM_OWNER, ROLES.STUDIO_OWNER, ROLES.STUDIO_MANAGER],
  artist: [ROLES.ARTIST, ROLES.STUDIO_OWNER, ROLES.STUDIO_MANAGER],
  client: [ROLES.CLIENT],
}

function ProtectedRoute({ allowedRole, children }) {
  const { isAuthenticated, isAuthLoading, session } = useApp()

  if (isAuthLoading) {
    return null
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (!allowedRole) {
    return children
  }

  const allowedOrganizationalRoles = allowedOrganizationalRolesByRoute[allowedRole] || []
  const assignedRoles = Array.isArray(session.roles)
    ? session.roles.map((assignment) => assignment.role || assignment.code).filter(Boolean)
    : []
  const hasLegacyRouteRole = session.role === allowedRole
  const hasOrganizationalRole = allowedOrganizationalRoles.some((role) => (
    role === session.user?.role || assignedRoles.includes(role)
  ))

  if (!hasLegacyRouteRole && !hasOrganizationalRole) {
    return <Navigate to="/login" replace />
  }

  return children
}

export default ProtectedRoute
