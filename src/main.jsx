import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import AppLaunchSplash from './components/AppLaunchSplash.jsx'
import PWAUpdatePrompt from './components/PWAUpdatePrompt.jsx'
import AppErrorBoundary from './components/AppErrorBoundary.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary>
      <AppLaunchSplash />
      <App />
      <PWAUpdatePrompt />
    </AppErrorBoundary>
  </StrictMode>,
)
