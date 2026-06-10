import { requireSupabase } from '../lib/supabaseClient'

const DEFAULT_CONTEXT = {
  profile: null,
  roles: [],
  client: null,
  artist: null,
  memberships: [],
}

function unwrapContext(data) {
  return data || DEFAULT_CONTEXT
}

export async function fetchAuthContext() {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_get_auth_context')

  if (error) throw error

  return unwrapContext(data)
}

export async function bootstrapClientProfile({ displayName, phone }) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_bootstrap_client', {
    p_display_name: displayName,
    p_phone: phone || null,
  })

  if (error) throw error

  return unwrapContext(data)
}

export async function bootstrapArtistProfile({ displayName, phone, artisticName, city, claimToken = null }) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_bootstrap_artist', {
    p_display_name: displayName,
    p_phone: phone || null,
    p_artistic_name: artisticName || displayName,
    p_city: city || null,
    p_claim_token: claimToken || null,
  })

  if (error) throw error

  return unwrapContext(data)
}
