import { requireSupabase } from '../lib/supabaseClient'

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function normalizeBillingEntity(entity = {}) {
  return {
    id: entity.id,
    type: entity.type || '',
    name: entity.name || 'Cuenta',
    email: entity.email || '',
    phone: entity.phone || '',
    currentMonthGross: normalizeNumber(entity.currentMonthGross ?? entity.current_month_gross),
    currentMonthCommission: normalizeNumber(entity.currentMonthCommission ?? entity.current_month_commission),
    todayCommission: normalizeNumber(entity.todayCommission ?? entity.today_commission),
    overdueCommission: normalizeNumber(entity.overdueCommission ?? entity.overdue_commission),
    appointmentCount: normalizeNumber(entity.appointmentCount ?? entity.appointment_count),
    status: entity.status || 'current',
  }
}

export function mapAdminBillingPayload(data = {}) {
  return {
    source: data.source || 'supabase',
    month: data.month || '',
    currentMonthGross: normalizeNumber(data.currentMonthGross ?? data.current_month_gross),
    currentMonthCommission: normalizeNumber(data.currentMonthCommission ?? data.current_month_commission),
    currentStudios: normalizeNumber(data.currentStudios ?? data.current_studios),
    overdueStudios: normalizeNumber(data.overdueStudios ?? data.overdue_studios),
    currentArtists: normalizeNumber(data.currentArtists ?? data.current_artists),
    overdueArtists: normalizeNumber(data.overdueArtists ?? data.overdue_artists),
    entities: asArray(data.entities).map(normalizeBillingEntity),
  }
}

export async function fetchAdminBillingSummary({ query = '', month = null } = {}) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_admin_get_billing_summary', {
    p_query: query || '',
    p_month: month,
  })

  if (error) throw error

  return mapAdminBillingPayload(data)
}
