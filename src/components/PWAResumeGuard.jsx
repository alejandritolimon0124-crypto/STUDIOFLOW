import { useEffect } from 'react'

function isStandaloneIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
    && (window.navigator.standalone || window.matchMedia?.('(display-mode: standalone)').matches)
}

function PWAResumeGuard() {
  useEffect(() => {
    const handlePageShow = (event) => {
      if (!isStandaloneIos()) return
      if (event.persisted) window.location.reload()
    }

    window.addEventListener('pageshow', handlePageShow)

    return () => {
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [])

  return null
}

export default PWAResumeGuard
