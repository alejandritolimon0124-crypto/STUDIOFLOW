import { requireSupabase } from '../lib/supabaseClient'

function normalizeContext(context = {}) {
  const contextType = context.contextType || context.context_type || 'artist'
  const membershipId = context.membershipId || context.membership_id || null
  const artistId = context.artistId || context.artist_id || null
  const id = context.id || `${contextType}:${membershipId || artistId || 'independent'}`

  return {
    id,
    contextType,
    type: contextType,
    label: context.label || (contextType === 'membership' ? 'Estudio' : 'Independiente'),
    artistId,
    studioId: context.studioId || context.studio_id || null,
    studioName: context.studioName || context.studio_name || '',
    membershipId,
  }
}

export function getContextRpcParams(context = {}) {
  const contextType = context.contextType || context.type || 'artist'

  return {
    p_context_type: contextType,
    p_membership_id: contextType === 'membership'
      ? context.membershipId || context.membership_id || null
      : null,
  }
}

export function createIndependentWorkContext(artist = {}) {
  const artistId = artist.id || artist.artistId || artist.artist_id || null
  const name = artist.displayName || artist.display_name || artist.name || 'Artista'

  return normalizeContext({
    id: `artist:${artistId || 'independent'}`,
    contextType: 'artist',
    label: `${name} (Independiente)`,
    artistId,
  })
}

export async function fetchArtistWorkContexts() {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_artist_get_work_contexts')

  if (error) throw error

  return Array.isArray(data?.contexts) ? data.contexts.map(normalizeContext) : []
}
