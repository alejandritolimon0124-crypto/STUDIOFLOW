import { requireSupabase } from '../lib/supabaseClient'

export async function withAppointmentPayments(appointments) {
  const ids = appointments.map((item) => item.id).filter(Boolean)
  if (!ids.length) return appointments
  const { data, error } = await requireSupabase().rpc('studio_flow_get_appointment_payment_details', { p_ids: ids })
  if (error) throw error
  return appointments.map((item) => ({ ...item, paymentDetails: data?.[item.id] || null }))
}
