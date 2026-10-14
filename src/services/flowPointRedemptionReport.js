import { requireSupabase } from '../lib/supabaseClient'

export async function fetchFlowPointRedemptionReport({ type, id, year = null, month = null, query = '', limit = 8, offset = 0 }) {
  const { data, error } = await requireSupabase().rpc('studio_flow_flow_point_redemptions_report', {
    p_type: type, p_id: id, p_year: year, p_month: month,
    p_query: query, p_limit: limit, p_offset: offset,
  })
  if (error) throw error
  return data
}

export async function fetchMonthlyFlowPointRedemptions(type, id, year, month) {
  const report = await fetchFlowPointRedemptionReport({ type, id, year: Number(year), month: Number(month), limit: 10000 })
  if (report.total > report.items.length) throw new Error('Hay demasiados canjes para un solo archivo. Contacta a soporte.')
  return report
}
