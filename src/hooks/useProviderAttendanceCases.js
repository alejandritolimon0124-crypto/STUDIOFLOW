import { useCallback, useEffect, useState } from 'react'
import { requireSupabase } from '../lib/supabaseClient'

export default function useProviderAttendanceCases(studioId, enabled = true) {
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState('')
  const refresh = useCallback(async () => {
    if (!enabled) return
    try {
      const { data, error: failure } = await requireSupabase().rpc('studio_flow_provider_attendance_cases', { p_studio_id: studioId || null })
      if (failure) throw failure
      setCases(Array.isArray(data) ? data : [])
      setError('')
    } catch (failure) {
      setError(failure.message || 'No se pudieron revisar las citas.')
    } finally {
      setLoading(false)
    }
  }, [enabled, studioId])

  useEffect(() => {
    if (!enabled) return undefined
    const initial = window.setTimeout(refresh, 0)
    const timer = window.setInterval(refresh, 60000)
    window.addEventListener('focus', refresh)
    window.addEventListener('studio-flow-appointment-completed', refresh)
    return () => {
      window.clearTimeout(initial)
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('studio-flow-appointment-completed', refresh)
    }
  }, [enabled, refresh])
  return { cases, loading, error, refresh }
}
