import { useEffect, useState } from 'react'

export default function AppLaunchSplash() {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), 1650)
    return () => window.clearTimeout(timer)
  }, [])

  if (!visible) return null

  return <div className="app-launch-splash" aria-hidden="true">
    <div className="app-launch-glow" />
    <img src="/studioflow-launch-brand-v5-512.jpg" alt="" />
    <span>Tu mundo beauty fluye aquí</span>
  </div>
}
