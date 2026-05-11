import { useEffect, useState } from 'react'
import AdminDashboard from '../pages/admin/AdminDashboard'
import ArtistDashboard from '../pages/artist/ArtistDashboard'
import ClientDashboard from '../pages/client/ClientDashboard'
import Login from '../pages/auth/Login'
import Register from '../pages/auth/Register'
import { paths } from './paths'

const routeMap = {
  [paths.login]: Login,
  [paths.register]: Register,
  [paths.admin]: AdminDashboard,
  [paths.artist]: ArtistDashboard,
  [paths.client]: ClientDashboard,
}

function normalizePath(pathname) {
  if (pathname === '') return paths.login
  return pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname
}

function AppRouter() {
  const [path, setPath] = useState(normalizePath(window.location.pathname))

  useEffect(() => {
    const handleRouteChange = () => setPath(normalizePath(window.location.pathname))

    window.addEventListener('popstate', handleRouteChange)
    return () => window.removeEventListener('popstate', handleRouteChange)
  }, [])

  const Page = routeMap[path] || ArtistDashboard

  return <Page currentPath={path} />
}

export default AppRouter
