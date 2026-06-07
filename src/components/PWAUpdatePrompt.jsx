import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import Button from './Button'

async function clearRuntimeCaches() {
  if (!('caches' in window)) return

  const cacheNames = await caches.keys()
  await Promise.all(
    cacheNames
      .filter((cacheName) => cacheName.includes('runtime'))
      .map((cacheName) => caches.delete(cacheName)),
  )
}

function PWAUpdatePrompt() {
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false)
  const [swRegistration, setSwRegistration] = useState(null)

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onNeedRefresh() {
      setShowUpdatePrompt(true)
    },
    onRegisteredSW(_swUrl, registration) {
      setSwRegistration(registration)
      registration?.update()
    },
  })

  useEffect(() => {
    if (needRefresh) {
      setShowUpdatePrompt(true)
    }
  }, [needRefresh])

  useEffect(() => {
    if (!swRegistration) return undefined

    const intervalId = window.setInterval(() => {
      swRegistration.update()
    }, 60 * 60 * 1000)

    return () => window.clearInterval(intervalId)
  }, [swRegistration])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined

    const handleControllerChange = () => {
      setShowUpdatePrompt(true)
    }

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
    }
  }, [])

  const handleUpdate = async () => {
    await clearRuntimeCaches()
    swRegistration?.waiting?.postMessage({ type: 'SKIP_WAITING' })

    const reloadTimer = window.setTimeout(() => {
      window.location.reload()
    }, 800)

    await updateServiceWorker(true)
    window.clearTimeout(reloadTimer)
    window.location.reload()
  }

  if (!showUpdatePrompt && !needRefresh) return null

  return (
    <aside className="pwa-install-card pwa-update-card" aria-label="Nueva version disponible">
      <div>
        <span>Hay una nueva versión disponible</span>
        <p>Actualiza Studio Flow para usar la versión más reciente.</p>
      </div>
      <Button size="sm" onClick={handleUpdate}>Actualizar ahora</Button>
    </aside>
  )
}

export default PWAUpdatePrompt
