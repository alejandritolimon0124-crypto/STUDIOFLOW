import { requireSupabase } from '../lib/supabaseClient'

function normalizeStudio(row = {}) {
  return {
    id: row.studioId || row.studio_id || null,
    studioId: row.studioId || row.studio_id || null,
    studioStatus: row.studioStatus || row.studio_status || 'pending',
    commercialName: row.commercialName || row.commercial_name || '',
    city: row.city || '',
    createdAt: row.createdAt || row.created_at || null,
  }
}

export async function fetchOwnStudios() {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_get_own_studios')

  if (error) throw error

  const studios = Array.isArray(data?.studios) ? data.studios : []
  return studios.map(normalizeStudio)
}

export async function bootstrapStudio({
  studioName,
  commercialName,
  city,
  phone = '',
  email = '',
  addressLine = '',
  latitude = '',
  longitude = '',
  description = '',
} = {}) {
  const client = requireSupabase()
  const parsedLatitude = latitude === '' ? null : Number(latitude)
  const parsedLongitude = longitude === '' ? null : Number(longitude)

  if ((parsedLatitude === null) !== (parsedLongitude === null)) {
    throw new Error('Latitude y longitude deben capturarse juntas.')
  }

  if (
    (parsedLatitude !== null && !Number.isFinite(parsedLatitude))
    || (parsedLongitude !== null && !Number.isFinite(parsedLongitude))
  ) {
    throw new Error('Las coordenadas deben ser numericas.')
  }

  const { data, error } = await client.rpc('studio_flow_bootstrap_studio', {
    p_studio_name: studioName,
    p_commercial_name: commercialName,
    p_city: city,
    p_phone: phone || null,
    p_email: email || null,
    p_address_line: addressLine || null,
    p_geo_lat: parsedLatitude,
    p_geo_lng: parsedLongitude,
    p_description: description || null,
  })

  if (error) throw error

  const studio = data?.studio || {}
  const studioProfile = data?.studioProfile || data?.studio_profile || {}

  return {
    ...data,
    ownStudio: normalizeStudio({
      studio_id: studio.id || studio.studio_id,
      studio_status: studio.studio_status,
      commercial_name: studioProfile.commercial_name,
      city: studioProfile.city,
      created_at: studio.created_at,
    }),
  }
}
