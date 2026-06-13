import { useEffect } from 'react'

const resumeRepairKey = 'studio-flow-pwa-resume-repair'

function isStandaloneIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
    && (window.navigator.standalone || window.matchMedia?.('(display-mode: standalone)').matches)
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

  return null
}

export default PWAResumeGuard
