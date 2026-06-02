import { Navigate, Route, Routes } from 'react-router-dom'
import AdminDashboard from '../pages/admin/AdminDashboard'
import AdminArtists from '../pages/admin/AdminArtists'
import AdminClients from '../pages/admin/AdminClients'
import AdminStudioProfile from '../pages/admin/AdminStudioProfile'
import ArtistDashboard from '../pages/artist/ArtistDashboard'
import ArtistProfileSettings from '../pages/artist/ArtistProfileSettings'
import ArtistScheduleSettings from '../pages/artist/ArtistScheduleSettings'
import ArtistServices from '../pages/artist/ArtistServices'
import ArtistMarketing from '../pages/artist/ArtistMarketing'
import ClientDashboard from '../pages/client/ClientDashboard'
import Login from '../pages/auth/Login'
import Register from '../pages/auth/Register'
import AdminLayout from '../layouts/AdminLayout'
import ArtistLayout from '../layouts/ArtistLayout'
import ClientLayout from '../layouts/ClientLayout'
import { paths } from './paths'

function AppRouter() {
  return (
    <Routes>
      <Route path={paths.home} element={<Navigate to={paths.login} replace />} />
      <Route path={paths.login} element={<Login />} />
      <Route path={paths.register} element={<Register />} />

      <Route element={<AdminLayout />}>
        <Route path={paths.admin} element={<AdminDashboard />} />
        <Route path={paths.adminDashboard} element={<AdminDashboard />} />
        <Route path={paths.adminArtists} element={<AdminArtists />} />
        <Route path={paths.adminClients} element={<AdminClients />} />
        <Route path={paths.adminStudio} element={<AdminStudioProfile />} />
        <Route path={paths.adminSystem} element={<AdminDashboard />} />
      </Route>

      <Route element={<ArtistLayout />}>
        <Route path={paths.artist} element={<ArtistDashboard view="agenda" />} />
        <Route path={paths.artistDashboard} element={<ArtistDashboard view="agenda" />} />
        <Route path={paths.artistAppointments} element={<ArtistDashboard view="citas" />} />
        <Route path={paths.artistServices} element={<ArtistServices />} />
        <Route path={paths.artistClients} element={<ArtistDashboard view="clientes" />} />
        <Route path={paths.artistSettings} element={<ArtistProfileSettings />} />
        <Route path={paths.artistSchedule} element={<ArtistScheduleSettings />} />
        <Route path={paths.artistMarketing} element={<ArtistMarketing />} />
      </Route>

      <Route element={<ClientLayout />}>
        <Route path={paths.client} element={<ClientDashboard view="inicio" />} />
        <Route path={paths.clientDashboard} element={<ClientDashboard view="inicio" />} />
        <Route path={paths.clientSearch} element={<ClientDashboard view="explorar" />} />
        <Route path={paths.clientAppointments} element={<ClientDashboard view="citas" />} />
        <Route path={paths.clientFavorites} element={<ClientDashboard view="favoritos" />} />
      </Route>

      <Route path="*" element={<Navigate to={paths.login} replace />} />
    </Routes>
  )
}

export default AppRouter
