import { requireSupabase } from '../lib/supabaseClient'
export { depositAmount } from '../utils/depositAmount'

export async function fetchPaymentSettings(scopeType, scopeId) {
  const { data, error } = await requireSupabase().rpc('studio_flow_get_business_payment_settings', {
    p_scope_type: scopeType, p_scope_id: scopeId,
  })
  if (error) throw error
  return data || {}
}

export async function savePaymentSettings(scopeType, scopeId, settings) {
  const { data, error } = await requireSupabase().rpc('studio_flow_save_business_payment_settings', {
    p_scope_type: scopeType, p_scope_id: scopeId,
    p_enabled: Boolean(settings.enabled), p_kind: settings.kind,
    p_value: Number(settings.value) || 0, p_bank_name: settings.bankName,
    p_account_holder: settings.accountHolder, p_clabe: settings.clabe,
    p_terms: settings.terms,
  })
  if (error) throw error
  return data
}

export async function fetchDepositPolicy(serviceOfferingId) {
  if (!serviceOfferingId) return {}
  const { data, error } = await requireSupabase().rpc('studio_flow_get_deposit_policy', {
    p_service_offering_id: serviceOfferingId,
  })
  if (error && !['PGRST202', '42883'].includes(error.code)) throw error
  return data || {}
}

export async function fetchAppointmentDeposits(ids) {
  if (!ids.length) return {}
  const { data, error } = await requireSupabase().rpc('studio_flow_get_appointment_deposits', { p_ids: ids })
  if (error) throw error
  return data || {}
}

export async function confirmAppointmentPayment(appointmentId, stage) {
  const { data, error } = await requireSupabase().rpc('studio_flow_confirm_appointment_payment', {
    p_appointment_id: appointmentId, p_stage: stage,
  })
  if (error) throw error
  return data
}

export async function prepareExistingAppointmentPayment(appointmentId) {
  const { data, error } = await requireSupabase().rpc('studio_flow_prepare_existing_appointment_payment', {
    p_appointment_id: appointmentId,
  })
  if (error) throw error
  return data
}

export async function fetchPublicPaymentCard(token) {
  const { data, error } = await requireSupabase().rpc('studio_flow_public_payment_card', { p_token: token })
  if (error) throw error
  return data
}

export const formatPayment = (value) => new Intl.NumberFormat('es-MX', {
  style: 'currency', currency: 'MXN',
}).format(Number(value) || 0)
