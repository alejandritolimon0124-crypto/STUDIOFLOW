import { requireSupabase } from '../lib/supabaseClient'

export async function withAppointmentPayments(appointments) {
  const ids = appointments.map((item) => item.id).filter(Boolean)
  if (!ids.length) return appointments
  const { data, error } = await requireSupabase().rpc('studio_flow_get_appointment_payment_details', { p_ids: ids })
  if (error) throw error
  return appointments.map((item) => ({ ...item, paymentDetails: data?.[item.id] || null }))
}

export async function withAppointmentReporting(appointments) {
  const withPayments = await withAppointmentPayments(appointments)
  const ids = withPayments.map((item) => item.id).filter(Boolean)
  if (!ids.length) return withPayments

  const { data, error } = await requireSupabase().rpc('studio_flow_get_appointment_reward_details', { p_ids: ids })
  if (error) throw error

  return withPayments.map((item) => {
    const details = data?.[item.id] || {}
    return {
      ...item,
      pointsGranted: Number(details.pointsGranted ?? item.pointsGranted ?? 0),
      rewardMultiplier: Number(details.rewardMultiplier ?? item.rewardMultiplier ?? 1),
      happyHourApplied: Boolean(details.happyHourApplied ?? item.happyHourApplied),
    }
  })
}
