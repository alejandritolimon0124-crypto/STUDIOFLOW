import { useEffect, useState } from 'react'
import Button from './Button'

function isAppInstalled() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches
    || window.navigator.standalone === true
  )
}

function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    if (isAppInstalled()) return undefined

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault()
      setDeferredPrompt(event)
      setIsVisible(true)
    }

    const handleAppInstalled = () => {
      setDeferredPrompt(null)
      setIsVisible(false)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return

    await deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
    setIsVisible(false)
  }

  const handleDismiss = () => {
    setIsVisible(false)
  }

  if (!isVisible || !deferredPrompt) return null

  return (
    <aside className="pwa-install-card" aria-label="Instalar Studio Flow">
      <button className="pwa-install-close" type="button" aria-label="Cerrar instalación" onClick={handleDismiss}>
        ×
      </button>
      <div>
        <span>✨ Instala Studio Flow</span>
        <p>Accede más rápido, usa experiencia fullscreen y disfruta Studio Flow como app real.</p>
      </div>
      <Button size="sm" onClick={handleInstall}>Instalar aplicación</Button>
    </aside>
  )
}

export default PWAInstallPrompt
