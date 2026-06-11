import { requireSupabase } from '../lib/supabaseClient'

function splitSpecialties(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean)

  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function portfolioToPaths(portfolio = []) {
  if (!Array.isArray(portfolio)) return []

  return portfolio
    .map((image) => image?.path || image?.url || image)
    .map((path) => String(path || '').trim())
    .filter(Boolean)
    .slice(0, 12)
}

function mapArtistProfileRow(row = {}) {
  return {
    id: row.id,
    artist_id: row.artist_id,
    artistic_name: row.artistic_name || '',
    bio: row.bio || '',
    specialties: Array.isArray(row.specialties) ? row.specialties : [],
    photo_path: row.photo_path || '',
    portfolio_paths: Array.isArray(row.portfolio_paths) ? row.portfolio_paths : [],
    city: row.city || '',
  }
}

function profileToPayload(profile = {}, artistId) {
  const artisticName = String(profile.personalInfo?.artisticName || profile.personalInfo?.fullName || '').trim()
  const bio = String(profile.professionalProfile?.shortBio || '').trim()
  const city = String(profile.professionalLocation?.customLocation?.city || '').trim()

  return {
    artist_id: artistId,
    artistic_name: artisticName,
    bio: bio || null,
    specialties: splitSpecialties(profile.professionalProfile?.specialties),
    photo_path: String(profile.photoUrl || '').trim() || null,
    portfolio_paths: portfolioToPaths(profile.portfolio),
    city: city || null,
    updated_at: new Date().toISOString(),
  }
}

export async function fetchArtistProfile({ artistId }) {
  if (!artistId) return null

  const client = requireSupabase()
  const { data, error } = await client
    .from('artist_profiles')
    .select('*')
    .eq('artist_id', artistId)
    .maybeSingle()

  if (error) throw error
  return data ? mapArtistProfileRow(data) : null
}

export async function saveArtistProfile({ artistId, profileId, profile }) {
  if (!artistId) throw new Error('Artist id requerido para guardar el perfil.')

  const client = requireSupabase()
  const payload = profileToPayload(profile, artistId)

  if (!payload.artistic_name) {
    throw new Error('Nombre artistico requerido para guardar el perfil.')
  }

  if (profileId) {
    const phone = String(profile.personalInfo?.phone || '').trim()
    const { error: profileError } = await client
      .from('profiles')
      .update({
        phone: phone || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', profileId)

    if (profileError) throw profileError
  }

  const { data, error } = await client
    .from('artist_profiles')
    .upsert(payload, { onConflict: 'artist_id' })
    .select('*')
    .single()

  if (error) throw error

  return mapArtistProfileRow(data)
}
