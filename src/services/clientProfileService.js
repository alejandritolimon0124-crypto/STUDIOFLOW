import { requireSupabase } from '../lib/supabaseClient'

function normalizeClientProfilePayload(data = {}) {
  const client = data.client || {}
  const clientProfile = data.clientProfile || data.client_profile || {}

  return {
    id: client.id || '',
    profileId: client.profile_id || client.profileId || '',
    name: client.display_name || client.displayName || client.name || '',
    email: client.email || '',
    phone: client.phone || '',
    birthday: clientProfile.birthday || clientProfile.birthDate || client.birthday || '',
    photoUrl: clientProfile.photo_path || clientProfile.photoPath || client.photoUrl || client.photo_url || '',
  }
}

export async function fetchOwnClientProfile() {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_get_own_client_profile')

  if (error) throw error

  return normalizeClientProfilePayload(data)
}

export async function updateOwnClientProfile(patch = {}) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_update_own_client_profile', {
    p_patch: patch,
  })

  if (error) throw error

  return normalizeClientProfilePayload(data)
}
