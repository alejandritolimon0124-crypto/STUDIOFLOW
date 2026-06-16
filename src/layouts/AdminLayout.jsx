import { NavLink, Outlet, useLocation } from 'react-router-dom'
import DashboardLayout from './DashboardLayout'
import { paths } from '../routes/paths'
import { useApp } from '../contexts/appContextCore'
import { ROLES, hasPermission, permissions } from '../modules/permissions/rolePermissions'

const copyByPath = {
  [paths.admin]: ['Panel administrativo', 'Metricas globales, gestion de artistas, clientes y estado del sistema.'],
  [paths.adminArtists]: ['Artistas', 'Gestiona artistas, estados y perfiles dentro de Studio Flow.'],
  [paths.adminStudios]: ['Estudios', 'Revision, aprobacion y control operativo de estudios.'],
  [paths.adminClients]: ['Clientes', 'Gestiona clientas, perfiles, historial y estado de cuenta.'],
  [paths.adminStudio]: ['Mi estudio', 'Administra la fuente de informacion profesional del estudio.'],
  [paths.adminSystem]: ['Sistema', 'Estado operativo y modulos listos para conectar.'],
}

function AdminLayout() {
  const { pathname } = useLocation()
  const { session } = useApp()
  const [title, subtitle] = copyByPath[pathname] || copyByPath[paths.admin]
  const assignedRoles = Array.isArray(session.roles) ? session.roles : []
  const effectiveAdminRole =
    session.user?.role === ROLES.PLATFORM_OWNER || assignedRoles.some((assignment) => assignment.role === ROLES.PLATFORM_OWNER)
      ? ROLES.PLATFORM_OWNER
      : assignedRoles.some((assignment) => assignment.role === ROLES.STUDIO_OWNER)
        ? ROLES.STUDIO_OWNER
        : assignedRoles.some((assignment) => assignment.role === ROLES.STUDIO_MANAGER)
          ? ROLES.STUDIO_MANAGER
          : session.user?.role
  const effectiveAdminAssignment = assignedRoles.find((assignment) => assignment.role === effectiveAdminRole)
  const effectiveAdminUser = {
    ...session.user,
    role: effectiveAdminRole,
    studioId: effectiveAdminAssignment?.studioId || effectiveAdminAssignment?.studio_id || session.user?.studioId || null,
  }
  const canSeeArtists = hasPermission(effectiveAdminUser, permissions.STUDIO_ARTISTS)
  const canSeeClients = hasPermission(effectiveAdminUser, permissions.CLIENTS) || hasPermission(effectiveAdminUser, permissions.STUDIO_CLIENTS)
  const canSeeStudioProfile = [ROLES.PLATFORM_OWNER, ROLES.STUDIO_OWNER].includes(effectiveAdminUser.role)
  const canSeeSystem = hasPermission(effectiveAdminUser, permissions.GOVERNANCE)

  return (
    <DashboardLayout role="admin" title={title} subtitle={subtitle} showMobileAppbar={false}>
      <div className="role-layout-shell">
        <Outlet />
        <nav className="role-bottom-nav" aria-label="Navegacion de admin">
          <NavLink to="/admin">Inicio</NavLink>
          {canSeeArtists && <NavLink to="/admin/artists">Artistas</NavLink>}
          {canSeeSystem && <NavLink to="/admin/studios">Estudios</NavLink>}
          {canSeeClients && <NavLink to="/admin/clients">Clientes</NavLink>}
          {canSeeStudioProfile && <NavLink to="/admin/studio">Mi Estudio</NavLink>}
          {canSeeSystem && <NavLink to="/admin/system">Sistema</NavLink>}
        </nav>
      </div>
    </DashboardLayout>
  )
}

export default AdminLayout
