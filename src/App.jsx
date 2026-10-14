import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppProvider } from './contexts/AppContext'
import AdminArtists from './pages/admin/AdminArtists'
import AdminClients from './pages/admin/AdminClients'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminBilling from './pages/admin/AdminBilling'
import AdminGrowth from './pages/admin/AdminGrowth'
import AdminStudios from './pages/admin/AdminStudios'
import AdminStudioProfile from './pages/admin/AdminStudioProfile'
import QASandbox from './pages/admin/QASandbox'
import AdminLayout from './layouts/AdminLayout'
import StudioOwnerLayout from './layouts/StudioOwnerLayout'
import ArtistLayout from './layouts/ArtistLayout'
import ArtistAppointments from './pages/artist/ArtistAppointments'
import ArtistClients from './pages/artist/ArtistClients'
import ArtistDashboard from './pages/artist/ArtistDashboard'
import ArtistProfileSettings from './pages/artist/ArtistProfileSettings'
import ArtistScheduleSettings from './pages/artist/ArtistScheduleSettings'
import ArtistServices from './pages/artist/ArtistServices'
import ArtistMarketing from './pages/artist/ArtistMarketing'
import ArtistBranches from './pages/artist/ArtistBranches'
import Accounting from './pages/Accounting'
import ClientLayout from './layouts/ClientLayout'
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import ForgotPassword from './pages/auth/ForgotPassword'
import ResetPassword from './pages/auth/ResetPassword'
import PublicBooking from './pages/public/PublicBooking'
import PaymentCard from './pages/public/PaymentCard'
import InvitationCard from './pages/public/InvitationCard'
import PublicCampaign from './pages/public/PublicCampaign'
import ProfessionalWelcome from './pages/public/ProfessionalWelcome'
import ClientWelcome from './pages/public/ClientWelcome'
import StudioFlowLanding from './pages/public/StudioFlowLanding'
import FlowPointsGuide from './pages/FlowPointsGuide'
import AuroraPreview from './pages/AuroraPreview'
import AdminCampaigns from './pages/admin/AdminCampaigns'
import Onboarding from './pages/auth/Onboarding'
import ClientDashboard from './pages/client/ClientDashboard'
import ClientRewards from './pages/client/ClientRewards'
import BirthdayCard from './pages/client/BirthdayCard'
import ProtectedRoute from './routes/ProtectedRoute'
import PushNotificationManager from './components/PushNotificationManager'
import SeoMeta from './components/SeoMeta'
import PWAInstallPrompt from './components/PWAInstallPrompt'
import './styles/global.css'

function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <SeoMeta />
        <PushNotificationManager />
        <Routes>
          <Route path="/" element={<StudioFlowLanding />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/reservar/:slug?/:serviceSlug?" element={<PublicBooking />} />
          <Route path="/pago/:token" element={<PaymentCard />} />
          <Route path="/invitacion/:code" element={<InvitationCard />} />
          <Route path="/felicitacion/:id" element={<ProtectedRoute allowedRole="client"><BirthdayCard /></ProtectedRoute>} />
          <Route path="/campana/:slug" element={<PublicCampaign />} />
          <Route path="/profesionales" element={<ProfessionalWelcome />} />
          <Route path="/para-clientas" element={<ClientWelcome />} />
          <Route path="/flow-points" element={<ProtectedRoute><FlowPointsGuide /></ProtectedRoute>} />
          <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />

          <Route path="/client" element={<ProtectedRoute allowedRole="client"><ClientLayout /></ProtectedRoute>}>
            <Route index element={<ClientDashboard view="inicio" />} />
            <Route path="search" element={<ClientDashboard view="explorar" />} />
            <Route path="appointments" element={<ClientDashboard view="citas" />} />
            <Route path="favorites" element={<ClientDashboard view="favoritos" />} />
            <Route path="rewards" element={<ClientRewards />} />
            <Route path="fp" element={<ClientDashboard view="fp" />} />
            <Route path="profile" element={<ClientDashboard view="perfil" />} />
          </Route>

          <Route path="/artist" element={<ProtectedRoute allowedRole="artist"><ArtistLayout /></ProtectedRoute>}>
            <Route index element={<ArtistDashboard view="agenda" />} />
            <Route path="services" element={<ArtistServices />} />
            <Route path="schedule" element={<ArtistScheduleSettings />} />
            <Route path="appointments" element={<ArtistAppointments />} />
            <Route path="clients" element={<ArtistClients />} />
            <Route path="marketing" element={<ArtistMarketing />} />
            <Route path="accounting" element={<Accounting />} />
            <Route path="settings" element={<ArtistProfileSettings />} />
            <Route path="branches" element={<ArtistBranches />} />
            <Route path="campaigns" element={<AdminCampaigns />} />
            <Route path="aurora" element={<AuroraPreview />} />
          </Route>

          <Route path="/admin" element={<ProtectedRoute allowedRole="admin"><AdminLayout /></ProtectedRoute>}>
            <Route index element={<AdminDashboard />} />
            <Route path="artists" element={<AdminArtists />} />
            <Route path="studios" element={<AdminStudios />} />
            <Route path="billing" element={<AdminBilling />} />
            <Route path="growth" element={<AdminGrowth />} />
            <Route path="clients" element={<AdminClients />} />
            <Route path="system" element={<QASandbox />} />
          </Route>

          <Route element={<ProtectedRoute allowedRole="admin"><StudioOwnerLayout /></ProtectedRoute>}>
            <Route path="/admin/studio" element={<AdminStudioProfile />} />
            <Route path="/admin/studio/clients" element={<AdminClients />} />
            <Route path="/admin/studio/accounting" element={<Accounting studio />} />
            <Route path="/admin/studio/campaigns" element={<AdminCampaigns />} />
            <Route path="/admin/studio/aurora" element={<AuroraPreview studio />} />
          </Route>
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
        <PWAInstallPrompt />
      </BrowserRouter>
    </AppProvider>
  )
}

export default App
