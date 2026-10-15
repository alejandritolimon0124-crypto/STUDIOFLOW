import { supabase } from '../lib/supabaseClient'

export async function fetchStudioHours(studioId) {
  const { data, error } = await supabase.rpc('studio_flow_get_studio_hours', { p_studio_id: studioId })
  if (error) throw error
  return data || []
}

export async function saveStudioHours(studioId, days) {
  const { data, error } = await supabase.rpc('studio_flow_save_studio_hours', {
    p_studio_id: studioId,
    p_days: days,
  })
  if (error) throw error
  return data || []
}

export async function fetchStudioChangeNotice(studioId) {
  const { data, error } = await supabase.rpc('studio_flow_get_studio_change_notice', { p_studio_id: studioId })
  if (error) throw error
  return Number(data) || 2
}

export async function saveStudioChangeNotice(studioId, hours) {
  const { data, error } = await supabase.rpc('studio_flow_save_studio_change_notice', {
    p_studio_id: studioId,
    p_hours: Number(hours),
  })
  if (error) throw error
  return Number(data)
}
