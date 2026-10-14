import { requireSupabase } from '../lib/supabaseClient'
import { fetchAppointmentDeposits } from './depositService'

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

  const [{ data, error }, deposits, accounts] = await Promise.all([
    requireSupabase().rpc('studio_flow_get_appointment_reward_details', { p_ids: ids }),
    fetchAppointmentDeposits(ids).catch((error) => {
      if (error.code === 'PGRST202' || error.code === '42883') return {}
      throw error
    }),
    requireSupabase().rpc('studio_flow_get_appointment_payment_accounts', { p_ids: ids }).then(({ data: accountData, error: accountError }) => {
      if (accountError && !['PGRST202', '42883'].includes(accountError.code)) throw accountError
      return accountData || {}
    }),
  ])
  if (error) throw error

  return withPayments.map((item) => {
    const details = data?.[item.id] || {}
    return {
      ...item,
      depositPlan: deposits[item.id] || null,
      paymentAccount: accounts[item.id] || null,
      status: item.appointmentStatus === 'scheduled' && deposits[item.id] && !deposits[item.id].depositReceivedAt
        ? 'Pendiente de anticipo'
        : item.status,
      pointsGranted: Number(details.pointsGranted ?? item.pointsGranted ?? 0),
      rewardMultiplier: Number(details.rewardMultiplier ?? item.rewardMultiplier ?? 1),
      happyHourApplied: Boolean(details.happyHourApplied ?? item.happyHourApplied),
    }
  })
}
