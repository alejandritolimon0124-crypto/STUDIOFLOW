import { Navigate } from 'react-router-dom'
import { useApp } from '../contexts/appContextCore'

function ProtectedRoute({ allowedRole, children }) {
  const { isAuthenticated, session } = useApp()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (session.role !== allowedRole) {
    return <Navigate to="/login" replace />
  }

  return children
}

export default ProtectedRoute
