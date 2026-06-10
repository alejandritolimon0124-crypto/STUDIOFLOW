import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppProvider } from './contexts/AppContext'
import AdminArtists from './pages/admin/AdminArtists'
import AdminClients from './pages/admin/AdminClients'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminStudioProfile from './pages/admin/AdminStudioProfile'
import QASandbox from './pages/admin/QASandbox'
import AdminLayout from './layouts/AdminLayout'
import ArtistLayout from './layouts/ArtistLayout'
import ArtistAppointments from './pages/artist/ArtistAppointments'
import ArtistClients from './pages/artist/ArtistClients'
import ArtistDashboard from './pages/artist/ArtistDashboard'
import ArtistProfileSettings from './pages/artist/ArtistProfileSettings'
import ArtistScheduleSettings from './pages/artist/ArtistScheduleSettings'
import ArtistServices from './pages/artist/ArtistServices'
import ArtistMarketing from './pages/artist/ArtistMarketing'
import ClientLayout from './layouts/ClientLayout'
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import ForgotPassword from './pages/auth/ForgotPassword'
import ResetPassword from './pages/auth/ResetPassword'
import Onboarding from './pages/auth/Onboarding'
import ClientDashboard from './pages/client/ClientDashboard'
import ProtectedRoute from './routes/ProtectedRoute'
import PWAInstallPrompt from './components/PWAInstallPrompt'
import PWAUpdatePrompt from './components/PWAUpdatePrompt'
import './styles/global.css'

function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />

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
            <Route path="marketing" element={<ArtistMarketing />} />
            <Route path="settings" element={<ArtistProfileSettings />} />
          </Route>

          <Route path="/admin" element={<ProtectedRoute allowedRole="admin"><AdminLayout /></ProtectedRoute>}>
            <Route index element={<AdminDashboard />} />
            <Route path="artists" element={<AdminArtists />} />
            <Route path="clients" element={<AdminClients />} />
            <Route path="studio" element={<AdminStudioProfile />} />
            <Route path="system" element={<QASandbox />} />
          </Route>
        </Routes>
        <PWAInstallPrompt />
        <PWAUpdatePrompt />
      </BrowserRouter>
    </AppProvider>
  )
}

export default App
