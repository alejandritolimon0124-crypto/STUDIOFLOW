import { requireSupabase } from '../lib/supabaseClient'

export async function fetchArtistBranches() {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_artist_get_branches')
  if (error) throw error
  return Array.isArray(data?.branches) ? data.branches : []
}

export async function saveArtistBranch(branch) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_artist_save_branch', {
    p_branch_id: branch.id || null,
    p_payload: branch,
  })
  if (error) throw error
  return data?.branchId || data?.branch_id || null
}
