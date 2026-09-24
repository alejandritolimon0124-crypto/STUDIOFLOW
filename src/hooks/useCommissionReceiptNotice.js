import { useEffect, useState } from 'react'
import { requireSupabase } from '../lib/supabaseClient'

export default function useCommissionReceiptNotice({ enabled = true, studioId = null } = {}) {
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    if (!enabled) return undefined

    let active = true
    const load = async () => {
      const { data, error } = await requireSupabase().rpc('studio_flow_get_accounting_summary', {
        p_studio_id: studioId || null,
      })
      if (active && !error) setAvailable(Boolean(data?.receiptAvailable ?? data?.receipt_available))
    }

    load()
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => {
      active = false
      window.removeEventListener('focus', onFocus)
    }
  }, [enabled, studioId])

  return enabled && available
}
