import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import PWAInstallPrompt from './components/PWAInstallPrompt.jsx'
import PWAUpdatePrompt from './components/PWAUpdatePrompt.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <PWAInstallPrompt />
    <PWAUpdatePrompt />
  </StrictMode>,
)
