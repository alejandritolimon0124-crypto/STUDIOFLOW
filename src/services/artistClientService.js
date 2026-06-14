import { requireSupabase } from '../lib/supabaseClient'

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeArtistClient(client = {}) {
  return {
    ...client,
    id: client.id,
    name: client.name || client.displayName || client.display_name || 'Clienta',
    email: client.email || '',
    phone: client.phone || '',
    photoUrl: client.photoUrl || client.photo_path || '',
    visits: Number(client.visits ?? client.totalVisits ?? client.total_visits ?? 0),
    totalVisits: Number(client.totalVisits ?? client.total_visits ?? client.visits ?? 0),
    lastVisit: client.lastVisit || client.last_visit || '',
    lastVisitAt: client.lastVisitAt || client.last_visit_at || null,
    history: asArray(client.history),
  }
}

export async function fetchArtistClients({ search = '', limit = 5 } = {}) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_artist_get_clients', {
    p_search: search || null,
    p_limit: limit,
  })

  if (error) throw error

  return asArray(data?.clients).map(normalizeArtistClient)
}
