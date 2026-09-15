import { useEffect, useState } from 'react'
import Button from './Button'

const entryScript = doc => doc.querySelector('script[type="module"][src]')?.getAttribute('src') || ''

export default function PWAUpdatePrompt() {
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    if (import.meta.env.DEV) return undefined
    const current = entryScript(document)
    let stopped = false
    let controller = null
    async function check() {
      if (controller || document.visibilityState !== 'visible' || !navigator.onLine) return
      controller = new AbortController()
      const request = controller
      const timeout = window.setTimeout(() => request.abort(), 15000)
      try {
        const response = await fetch(`/index.html?versionCheck=${Date.now()}`, { cache: 'no-store', signal: request.signal })
        if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return
        const latest = entryScript(new DOMParser().parseFromString(await response.text(), 'text/html'))
        if (!stopped && current && latest && latest !== current) setAvailable(true)
      } catch {
        // Connection failures do not imply a new version.
      } finally { window.clearTimeout(timeout); controller = null }
    }
    check()
    const interval = window.setInterval(check, 60000)
    window.addEventListener('focus', check)
    window.addEventListener('online', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      stopped = true
      controller?.abort()
      window.clearInterval(interval)
      window.removeEventListener('focus', check)
      window.removeEventListener('online', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])
  if (!available) return null
  return <aside className="pwa-install-card pwa-update-card" aria-label="Nueva version disponible" role="status">
    <div><span>Hay una nueva version disponible</span><p>Guarda tus cambios antes de actualizar Studio Flow.</p></div>
    <Button size="sm" onClick={() => window.location.reload()}>Actualizar ahora</Button>
  </aside>
}
