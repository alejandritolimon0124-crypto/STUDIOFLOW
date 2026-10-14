import { requireSupabase } from '../lib/supabaseClient'

const pageSize = 3

export async function fetchPortfolioPages({ functionName, params, onPage }) {
  const client = requireSupabase()
  const photos = []
  let total = pageSize

  for (let offset = 0; offset < total && offset < 12; offset += pageSize) {
    let page
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { data, error } = await client.rpc(functionName, { ...params, p_offset: offset })
      if (!error && data && Array.isArray(data.photos)) {
        page = data
        break
      }
      if (attempt === 2) throw error || new Error('No se pudo cargar la galeria.')
    }

    total = Math.min(Number(page.total) || 0, 12)
    photos.push(...page.photos)
    onPage?.(photos.slice())
  }

  return photos
}
