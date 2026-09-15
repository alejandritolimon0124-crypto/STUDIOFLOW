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
  const [showInstructions, setShowInstructions] = useState(false)
  const [installError, setInstallError] = useState('')
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

  useEffect(() => {
    if (isAppInstalled()) return undefined
    setIsVisible(true)

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
    if (!deferredPrompt) {
      setShowInstructions(true)
      return
    }

    try {
      setInstallError('')
      await deferredPrompt.prompt()
      await deferredPrompt.userChoice
      setDeferredPrompt(null)
      setIsVisible(false)
    } catch {
      setDeferredPrompt(null)
      setShowInstructions(true)
      setInstallError('No se pudo abrir la instalación automática.')
    }
  }

  const handleDismiss = () => {
    setIsVisible(false)
  }

  if (!isVisible) return null

  return (
    <aside className="pwa-install-card" aria-label="Instalar Studio Flow">
      <button className="pwa-install-close" type="button" aria-label="Cerrar instalación" onClick={handleDismiss}>
        ×
      </button>
      <div>
        <span>Instala Studio Flow</span>
        <p>Agrega Studio Flow a la pantalla de inicio de tu dispositivo.</p>
        {installError && <p role="status">{installError}</p>}
        {showInstructions && (
          <p role="status">{isIOS
            ? 'Abre este enlace en Safari, toca Compartir y elige Agregar a pantalla de inicio.'
            : 'Abre este enlace en Chrome o Edge. En el menú del navegador busca Instalar aplicación o Agregar a pantalla de inicio. Si estás dentro de WhatsApp o Facebook, abre primero el enlace en tu navegador.'}</p>
        )}
      </div>
      <Button size="sm" onClick={handleInstall}>Instalar aplicación</Button>
    </aside>
  )
}

export default PWAInstallPrompt
