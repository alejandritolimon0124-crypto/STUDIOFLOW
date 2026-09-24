import { requireSupabase } from '../lib/supabaseClient'

export const BEAUTY_SPACES = {
  BEAUTY_AND_PERSONAL_CARE: 'beauty_and_personal_care',
  SPA_AND_ADVANCED_AESTHETICS: 'spa_and_advanced_aesthetics',
}

export async function saveOwnArtistBeautySpace(beautySpace) {
  const client = requireSupabase()
  const { error } = await client.rpc('studio_flow_set_own_artist_beauty_space', {
    p_beauty_space: beautySpace,
  })

  if (error) throw error
}

export async function fetchMarketplaceBeautySpaces() {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_marketplace_get_beauty_spaces')

  if (error) throw error
  return Array.isArray(data) ? data : []
}
