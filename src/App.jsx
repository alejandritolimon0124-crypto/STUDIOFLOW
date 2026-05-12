import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppProvider } from './contexts/AppContext'
import AdminArtists from './pages/admin/AdminArtists'
import AdminClients from './pages/admin/AdminClients'
import AdminDashboard from './pages/admin/AdminDashboard'
import QASandbox from './pages/admin/QASandbox'
import AdminLayout from './layouts/AdminLayout'
import ArtistLayout from './layouts/ArtistLayout'
import ArtistAppointments from './pages/artist/ArtistAppointments'
import ArtistClients from './pages/artist/ArtistClients'
import ArtistDashboard from './pages/artist/ArtistDashboard'
import ArtistScheduleSettings from './pages/artist/ArtistScheduleSettings'
import ArtistServices from './pages/artist/ArtistServices'
import ClientLayout from './layouts/ClientLayout'
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import ClientDashboard from './pages/client/ClientDashboard'
import ProtectedRoute from './routes/ProtectedRoute'
import './styles/global.css'

function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route path="/client" element={<ProtectedRoute allowedRole="client"><ClientLayout /></ProtectedRoute>}>
            <Route index element={<ClientDashboard view="inicio" />} />
            <Route path="search" element={<ClientDashboard view="explorar" />} />
            <Route path="appointments" element={<ClientDashboard view="citas" />} />
            <Route path="favorites" element={<ClientDashboard view="favoritos" />} />
            <Route path="profile" element={<ClientDashboard view="perfil" />} />
          </Route>

          <Route path="/artist" element={<ProtectedRoute allowedRole="artist"><ArtistLayout /></ProtectedRoute>}>
            <Route index element={<ArtistDashboard view="agenda" />} />
            <Route path="services" element={<ArtistServices />} />
            <Route path="schedule" element={<ArtistScheduleSettings />} />
            <Route path="appointments" element={<ArtistAppointments />} />
            <Route path="clients" element={<ArtistClients />} />
          </Route>

          <Route path="/admin" element={<ProtectedRoute allowedRole="admin"><AdminLayout /></ProtectedRoute>}>
            <Route index element={<AdminDashboard />} />
            <Route path="artists" element={<AdminArtists />} />
            <Route path="clients" element={<AdminClients />} />
            <Route path="system" element={<QASandbox />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
  )
}

export default App
