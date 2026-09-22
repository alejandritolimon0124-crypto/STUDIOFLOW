import { requireSupabase } from '../lib/supabaseClient'

function normalizeStudio(row = {}) {
  const logoUrl = row.logoUrl || row.logo_url || row.logoPath || row.logo_path || row.profile?.logoUrl || row.profile?.logo_path || ''
  const contactLinks = row.profile?.contactLinks || row.profile?.contact_links || {}

  return {
    id: row.studioId || row.studio_id || null,
    studioId: row.studioId || row.studio_id || null,
    studioStatus: row.studioStatus || row.studio_status || 'pending',
    commercialName: row.commercialName || row.commercial_name || '',
    logoUrl,
    logoPath: logoUrl,
    city: row.city || '',
    addressLine: row.addressLine || row.address_line || '',
    geoLat: row.geoLat || row.geo_lat || null,
    geoLng: row.geoLng || row.geo_lng || null,
    marketplaceProfileId: row.marketplaceProfileId || row.marketplace_profile_id || null,
    marketplaceListingId: row.marketplaceListingId || row.marketplace_listing_id || null,
    marketplaceStatus: row.marketplaceStatus || row.marketplace_status || 'not_published',
    createdAt: row.createdAt || row.created_at || null,
    profile: {
      ...(row.profile || {}),
      commercialName: row.profile?.commercialName || row.profile?.commercial_name || row.commercialName || row.commercial_name || '',
      logoUrl,
      logoPath: logoUrl,
      contactLinks: {
        whatsapp: row.profile?.whatsapp || contactLinks.whatsapp || '',
        instagram: row.profile?.instagram || contactLinks.instagram || '',
        facebook: row.profile?.facebook || contactLinks.facebook || '',
        tiktok: row.profile?.tiktok || contactLinks.tiktok || '',
      },
    },
  }
}

export async function fetchOwnStudios() {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_get_own_studios')

  if (error) throw error

  const studios = Array.isArray(data?.studios) ? data.studios : []
  const normalizedStudios = studios.map(normalizeStudio)
  const studioIds = normalizedStudios.map((studio) => studio.id).filter(Boolean)
  if (studioIds.length === 0) return normalizedStudios

  const { data: contactRows, error: contactError } = await client
    .from('studio_profiles')
    .select('studio_id, whatsapp, instagram, facebook, tiktok')
    .in('studio_id', studioIds)

  if (contactError) throw contactError
  const contactsByStudioId = Object.fromEntries((contactRows || []).map((row) => [row.studio_id, row]))

  return normalizedStudios.map((studio) => {
    const contactRow = contactsByStudioId[studio.id] || {}
    return {
      ...studio,
      profile: {
        ...studio.profile,
        contactLinks: {
          whatsapp: contactRow.whatsapp || '',
          instagram: contactRow.instagram || '',
          facebook: contactRow.facebook || '',
          tiktok: contactRow.tiktok || '',
        },
      },
    }
  })
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

export async function publishStudioMarketplace(studioId) {
  if (!studioId) throw new Error('Studio requerido para publicar marketplace.')

  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_publish_studio_marketplace', {
    p_studio_id: studioId,
  })

  if (error) throw error

  return data
}

export async function hideStudioMarketplace(studioId) {
  if (!studioId) throw new Error('Studio requerido para ocultar marketplace.')

  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_hide_studio_marketplace', {
    p_studio_id: studioId,
  })

  if (error) throw error

  return data
}
