import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AdminDashboard from '../pages/admin/AdminDashboard'
import ArtistDashboard from '../pages/artist/ArtistDashboard'
import ClientDashboard from '../pages/client/ClientDashboard'
import Login from '../pages/auth/Login'
import Register from '../pages/auth/Register'
import { paths } from './paths'

function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path={paths.login} element={<Login />} />
        <Route path={paths.register} element={<Register />} />

        <Route path={paths.admin} element={<AdminDashboard />} />

        <Route path={paths.artist} element={<ArtistDashboard view="agenda" />} />
        <Route path={paths.artistAgenda} element={<ArtistDashboard view="agenda" />} />
        <Route path={paths.artistAppointments} element={<ArtistDashboard view="citas" />} />
        <Route path={paths.artistServices} element={<ArtistDashboard view="servicios" />} />
        <Route path={paths.artistClients} element={<ArtistDashboard view="clientes" />} />
        <Route path={paths.artistSettings} element={<ArtistDashboard view="ajustes" />} />

        <Route path={paths.client} element={<ClientDashboard view="inicio" />} />
        <Route path={paths.clientAppointments} element={<ClientDashboard view="citas" />} />
        <Route path={paths.clientExplore} element={<ClientDashboard view="explorar" />} />
        <Route path={paths.clientFavorites} element={<ClientDashboard view="favoritos" />} />

        <Route path="*" element={<Navigate to={paths.login} replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default AppRouter
