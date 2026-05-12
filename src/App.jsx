import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppProvider } from './contexts/AppContext'
import AdminArtists from './pages/admin/AdminArtists'
import AdminClients from './pages/admin/AdminClients'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminLayout from './layouts/AdminLayout'
import ArtistLayout from './layouts/ArtistLayout'
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
          </Route>

          <Route path="/artist" element={<ProtectedRoute allowedRole="artist"><ArtistLayout /></ProtectedRoute>}>
            <Route index element={<ArtistDashboard view="agenda" />} />
            <Route path="services" element={<ArtistServices />} />
            <Route path="schedule" element={<ArtistScheduleSettings />} />
          </Route>

          <Route path="/admin" element={<ProtectedRoute allowedRole="admin"><AdminLayout /></ProtectedRoute>}>
            <Route index element={<AdminDashboard />} />
            <Route path="artists" element={<AdminArtists />} />
            <Route path="clients" element={<AdminClients />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
  )
}

export default App
