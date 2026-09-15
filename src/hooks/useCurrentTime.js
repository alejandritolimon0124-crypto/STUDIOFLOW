import { useEffect, useState } from 'react'

export default function useCurrentTime() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const refresh = () => setNow(Date.now())
    const timer = window.setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [])
  return now
}
