import { useRegisterSW } from 'virtual:pwa-register/react'
import Button from './Button'

function PWAUpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      registration?.update()
    },
  })

  if (!needRefresh) return null

  return (
    <aside className="pwa-install-card pwa-update-card" aria-label="Nueva version disponible">
      <div>
        <span>Hay una nueva version disponible</span>
        <p>Actualiza Studio Flow para usar la version mas reciente.</p>
      </div>
      <Button size="sm" onClick={() => updateServiceWorker(true)}>Actualizar ahora</Button>
    </aside>
  )
}

export default PWAUpdatePrompt
