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
    currentMonthPaid: normalizeNumber(entity.currentMonthPaid ?? entity.current_month_paid),
    currentMonthUnpaid: normalizeNumber(entity.currentMonthUnpaid ?? entity.current_month_unpaid),
    todayCommission: normalizeNumber(entity.todayCommission ?? entity.today_commission),
    overdueCommission: normalizeNumber(entity.overdueCommission ?? entity.overdue_commission),
    unpaidCommission: normalizeNumber(entity.unpaidCommission ?? entity.unpaid_commission),
    appointmentCount: normalizeNumber(entity.appointmentCount ?? entity.appointment_count),
    status: entity.status || 'current',
  }
}

function normalizeHistoryMonth(month = {}) {
  return {
    month: month.month || '',
    grossAmount: normalizeNumber(month.grossAmount ?? month.gross_amount),
    commissionAmount: normalizeNumber(month.commissionAmount ?? month.commission_amount),
    paidAmount: normalizeNumber(month.paidAmount ?? month.paid_amount),
    unpaidAmount: normalizeNumber(month.unpaidAmount ?? month.unpaid_amount),
    appointmentCount: normalizeNumber(month.appointmentCount ?? month.appointment_count),
    status: month.status || 'pending',
    paidAt: month.paidAt || month.paid_at || null,
  }
}

function normalizeHistoryEntity(entity = {}) {
  return {
    id: entity.id,
    type: entity.type || '',
    name: entity.name || 'Cuenta',
    email: entity.email || '',
    phone: entity.phone || '',
    months: asArray(entity.months).map(normalizeHistoryMonth),
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

export async function markAdminCommissionPaid({
  entityType,
  entityId,
  month = null,
  paymentMethod = 'manual',
  notes = null,
}) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_admin_mark_commission_paid', {
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_month: month,
    p_payment_method: paymentMethod,
    p_notes: notes,
  })

  if (error) throw error

  return data
}

export async function fetchAdminBillingHistory({ query = '', year = new Date().getFullYear() } = {}) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_admin_get_billing_history', {
    p_query: query,
    p_year: year,
  })

  if (error) throw error

  return {
    year: Number(data?.year) || year,
    entities: asArray(data?.entities).map(normalizeHistoryEntity),
  }
}
