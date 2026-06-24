import { NavLink, Outlet, useLocation } from 'react-router-dom'
import DashboardLayout from './DashboardLayout'
import { paths } from '../routes/paths'
import { useApp } from '../contexts/appContextCore'
import { ROLES, hasPermission, permissions } from '../modules/permissions/rolePermissions'

const copyByPath = {
  [paths.admin]: ['Panel administrativo', 'Metricas globales, gestion de artistas, clientes y estado del sistema.'],
  [paths.adminArtists]: ['Artistas', 'Gestiona artistas, estados y perfiles dentro de Studio Flow.'],
  [paths.adminStudios]: ['Estudios', 'Revision, aprobacion y control operativo de estudios.'],
  [paths.adminSystem]: ['Sistema', 'Estado operativo y modulos listos para conectar.'],
}

function AdminLayout() {
  const { pathname } = useLocation()
  const { session } = useApp()
  const assignedRoles = Array.isArray(session.roles) ? session.roles : []
  const activeContextRole = session.activeSessionContext?.role || null
  const activeContextStudioId = session.activeSessionContext?.studioId || session.activeSessionContext?.studio_id || null
  const isAdminContextResolving = !session.isMockSession && !session.activeSessionContext
  if (isAdminContextResolving) {
    return (
      <main className="dashboard-grid admin-grid">
        <section className="profile-foundation-card">
          <span className="eyebrow">Studio Flow</span>
          <h3>Resolviendo contexto...</h3>
          <small>Preparando workspace activo.</small>
        </section>
      </main>
    )
  }
  const effectiveAdminRole =
    activeContextRole
      || (session.user?.role === ROLES.PLATFORM_OWNER || assignedRoles.some((assignment) => assignment.role === ROLES.PLATFORM_OWNER)
      ? ROLES.PLATFORM_OWNER
      : assignedRoles.some((assignment) => assignment.role === ROLES.STUDIO_OWNER)
        ? ROLES.STUDIO_OWNER
        : assignedRoles.some((assignment) => assignment.role === ROLES.STUDIO_MANAGER)
          ? ROLES.STUDIO_MANAGER
          : session.user?.role)
  const effectiveAdminAssignment = assignedRoles.find((assignment) => assignment.role === effectiveAdminRole)
  const effectiveAdminUser = {
    ...session.user,
    role: effectiveAdminRole,
    studioId: activeContextStudioId || session.user?.studioId || effectiveAdminAssignment?.studioId || effectiveAdminAssignment?.studio_id || null,
  }
  const [title, subtitle] = copyByPath[pathname] || copyByPath[paths.admin]
  const canSeeArtists = hasPermission(effectiveAdminUser, permissions.STUDIO_ARTISTS)
  const canSeeSystem = hasPermission(effectiveAdminUser, permissions.GOVERNANCE)

  return (
    <DashboardLayout role="admin" title={title} subtitle={subtitle} showMobileAppbar={false}>
      <div className="role-layout-shell">
        <Outlet />
        <nav className="role-bottom-nav" aria-label="Navegacion de admin">
          <NavLink to="/admin">Inicio</NavLink>
          {canSeeArtists && <NavLink to="/admin/artists">Artistas</NavLink>}
          {canSeeSystem && <NavLink to="/admin/studios">Estudios</NavLink>}
          {canSeeSystem && <NavLink to="/admin/system">Sistema</NavLink>}
        </nav>
      </div>
    </DashboardLayout>
  )
}

export default AdminLayout
