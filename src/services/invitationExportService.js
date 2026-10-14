import { requireSupabase } from '../lib/supabaseClient'

export async function fetchInvitationExportDetails(events = []) {
  const ids = events.map((event) => event.id).filter(Boolean)
  if (!ids.length) return {}
  const { data, error } = await requireSupabase().rpc('studio_flow_invitation_export_details', { p_ids: ids })
  if (error) throw error
  return data || {}
}
