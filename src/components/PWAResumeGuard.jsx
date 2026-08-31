import { useEffect } from 'react'

const resumeRepairKey = 'studio-flow-pwa-resume-repair'
const assetRepairKey = 'studio-flow-pwa-asset-repair'

function isStandaloneIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
    && (window.navigator.standalone || window.matchMedia?.('(display-mode: standalone)').matches)
}

function isStandaloneApp() {
  return Boolean(
    window.navigator.standalone
    || window.matchMedia?.('(display-mode: standalone)').matches
  )
}

function updateServiceWorkerRegistration() {
  if (!('serviceWorker' in navigator)) return

  navigator.serviceWorker.getRegistration()
    .then((registration) => registration?.update())
    .catch(() => {})
}

function repairBlankRootOnce() {
  window.setTimeout(() => {
    const root = document.getElementById('root')
    const alreadyRepaired = sessionStorage.getItem(resumeRepairKey) === 'true'

    if (!root || root.childElementCount > 0 || alreadyRepaired) return

    sessionStorage.setItem(resumeRepairKey, 'true')
    window.location.replace(window.location.href)
  }, 250)
}

async function clearAllCaches() {
  if (!('caches' in window)) return

  const cacheNames = await caches.keys()
  await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)))
}

function repairAssetLoadOnce() {
  const alreadyRepaired = sessionStorage.getItem(assetRepairKey) === 'true'
  if (alreadyRepaired) return

  sessionStorage.setItem(assetRepairKey, 'true')
  clearAllCaches()
    .catch(() => {})
    .finally(() => window.location.reload())
}

function PWAResumeGuard() {
  useEffect(() => {
    const handlePageShow = (event) => {
      if (!isStandaloneIos()) return
      if (!event.persisted) return

      updateServiceWorkerRegistration()
      repairBlankRootOnce()
    }

    const handleVisibilityChange = () => {
      if (!isStandaloneIos()) return
      if (document.visibilityState !== 'visible') return

      updateServiceWorkerRegistration()
      repairBlankRootOnce()
    }

    window.addEventListener('pageshow', handlePageShow)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('pageshow', handlePageShow)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  useEffect(() => {
    const handleError = (event) => {
      const target = event.target
      const assetUrl = target?.src || target?.href || ''
      const isScriptOrStyle = target?.tagName === 'SCRIPT' || target?.tagName === 'LINK'

      if (!isScriptOrStyle || !assetUrl.includes('/assets/')) return
      repairAssetLoadOnce()
    }

    const handleUnhandledRejection = (event) => {
      const message = String(event.reason?.message || event.reason || '')
      if (!/failed to fetch dynamically imported module|loading chunk|importing a module script/i.test(message)) return
      repairAssetLoadOnce()
    }

    window.addEventListener('error', handleError, true)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    return () => {
      window.removeEventListener('error', handleError, true)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])

  useEffect(() => {
    if (!isStandaloneApp()) return undefined

    const timerId = window.setTimeout(() => {
      const root = document.getElementById('root')
      const alreadyRepaired = sessionStorage.getItem(resumeRepairKey) === 'true'

      if (!root || root.childElementCount > 0 || alreadyRepaired) return

      sessionStorage.setItem(resumeRepairKey, 'true')
      clearAllCaches()
        .catch(() => {})
        .finally(() => window.location.reload())
    }, 900)

    return () => window.clearTimeout(timerId)
  }, [])

  return null
}

export default PWAResumeGuard
