import { requireSupabase } from '../lib/supabaseClient'
import { buildGoogleMapsUrl } from '../utils/locationHelpers'

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

function cleanText(value) {
  return String(value || '').trim()
}

function nullableText(value) {
  const text = cleanText(value)
  return text || null
}

function nullableNumber(value) {
  const text = cleanText(value)
  if (!text) return null

  const number = Number(text)
  return Number.isFinite(number) ? number : null
}

function normalizePaymentMethods(paymentMethods = {}) {
  return {
    cash: Boolean(paymentMethods.cash),
    transfer: Boolean(paymentMethods.transfer),
    card: Boolean(paymentMethods.card),
  }
}

function mapArtistProfileRow(row = {}) {
  return {
    id: row.id,
    artist_id: row.artist_id,
    artistic_name: row.artistic_name || '',
    birthday: row.birthday || '',
    bio: row.bio || '',
    specialties: Array.isArray(row.specialties) ? row.specialties : [],
    primary_specialty: row.primary_specialty || '',
    years_experience: row.years_experience ?? '',
    payment_methods: row.payment_methods && typeof row.payment_methods === 'object' ? row.payment_methods : {},
    whatsapp: row.whatsapp || '',
    instagram: row.instagram || '',
    facebook: row.facebook || '',
    tiktok: row.tiktok || '',
    website: row.website || '',
    photo_path: row.photo_path || '',
    portfolio_paths: Array.isArray(row.portfolio_paths) ? row.portfolio_paths : [],
    use_studio_location: row.use_studio_location ?? true,
    address_line: row.address_line || '',
    city: row.city || '',
    state: row.state || '',
    postal_code: row.postal_code || '',
    latitude: row.latitude ?? '',
    longitude: row.longitude ?? '',
    address_references: row.address_references || '',
    google_maps_url: row.google_maps_url || '',
  }
}

function profileToPayload(profile = {}, artistId) {
  const artisticName = cleanText(profile.personalInfo?.artisticName || profile.personalInfo?.fullName)
  const professionalProfile = profile.professionalProfile || {}
  const contactLinks = profile.contactLinks || {}
  const locationSettings = profile.professionalLocation || {}
  const customLocation = locationSettings.customLocation || {}
  const bio = cleanText(professionalProfile.shortBio)
  const city = cleanText(customLocation.city)
  const googleMapsUrl = nullableText(customLocation.googleMapsUrl) || buildGoogleMapsUrl(customLocation) || null

  return {
    artist_id: artistId,
    artistic_name: artisticName,
    birthday: nullableText(profile.personalInfo?.birthday),
    bio: bio || null,
    specialties: splitSpecialties(professionalProfile.specialties),
    primary_specialty: nullableText(professionalProfile.primarySpecialty),
    years_experience: nullableNumber(professionalProfile.experienceYears),
    payment_methods: normalizePaymentMethods(professionalProfile.paymentMethods),
    whatsapp: nullableText(contactLinks.whatsapp),
    instagram: nullableText(contactLinks.instagram),
    facebook: nullableText(contactLinks.facebook),
    tiktok: nullableText(contactLinks.tiktok),
    website: nullableText(contactLinks.website),
    photo_path: nullableText(profile.photoUrl),
    portfolio_paths: portfolioToPaths(profile.portfolio),
    use_studio_location: locationSettings.useStudioLocation !== false,
    address_line: nullableText(customLocation.address),
    city: city || null,
    state: nullableText(customLocation.state),
    postal_code: nullableText(customLocation.postalCode),
    latitude: nullableNumber(customLocation.latitude),
    longitude: nullableNumber(customLocation.longitude),
    address_references: nullableText(customLocation.address_references),
    google_maps_url: googleMapsUrl,
    updated_at: new Date().toISOString(),
  }
}

export async function fetchArtistProfile({ artistId }) {
  if (!artistId) return null

  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_artist_get_own_profile', {
    p_artist_id: artistId,
  })

  if (error) throw error
  return data?.artist_profile ? mapArtistProfileRow(data.artist_profile) : null
}

export async function saveArtistProfile({ artistId, profileId, profile }) {
  if (!artistId) throw new Error('Artist id requerido para guardar el perfil.')

  const client = requireSupabase()
  const payload = profileToPayload(profile, artistId)
  const phone = String(profile.personalInfo?.phone || '').trim()

  if (!payload.artistic_name) {
    throw new Error('Nombre artistico requerido para guardar el perfil.')
  }

  const { data, error } = await client.rpc('studio_flow_artist_save_own_profile', {
    p_artist_id: artistId,
    p_profile: {
      ...payload,
      phone: phone || null,
    },
    p_update_phone: Boolean(profileId),
  })

  if (error) throw error

  return mapArtistProfileRow(data?.artist_profile)
}
