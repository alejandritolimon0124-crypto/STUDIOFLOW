import { requireSupabase } from '../lib/supabaseClient'

const STATUS_FROM_DB = {
  active: 'Activo',
  inactive: 'Inactivo',
  pending: 'Pendiente',
  rejected: 'Rechazado',
  archived: 'Archivado',
}

const STUDIO_STATUS_FROM_DB = {
  approved: 'approved',
  pending: 'pending',
  suspended: 'suspended',
  rejected: 'rejected',
  archived: 'archived',
}

function indexById(items = []) {
  return Object.fromEntries(items.filter((item) => item?.id).map((item) => [item.id, item]))
}

function firstMembershipForArtist(memberships = [], artistId) {
  return memberships.find((membership) => membership.artist_id === artistId || membership.artistId === artistId) || null
}

function profileLocationFromArtistProfile(artistProfile = {}) {
  return {
    useStudioLocation: artistProfile.use_studio_location !== false,
    customLocation: {
      address: artistProfile.address_line || '',
      city: artistProfile.city || '',
      state: artistProfile.state || '',
      postalCode: artistProfile.postal_code || '',
      address_references: artistProfile.address_references || '',
      latitude: artistProfile.latitude ?? '',
      longitude: artistProfile.longitude ?? '',
      googleMapsUrl: artistProfile.google_maps_url || '',
    },
  }
}

function mapStudio(row = {}) {
  const profile = row.profile || {}
  const contactLinks = profile.contact_links || profile.contactLinks || {}

  return {
    id: row.id,
    name: row.name || profile.commercial_name || 'Studio Flow',
    city: profile.city || '',
    specialty: '',
    studioStatus: STUDIO_STATUS_FROM_DB[row.studio_status] || row.studio_status || 'pending',
    createdAt: row.created_at,
    profile: {
      commercialName: profile.commercial_name || row.name || '',
      description: profile.description || '',
      phone: profile.phone || '',
      email: profile.email || '',
      hours: '',
      logoUrl: profile.logo_path || '',
      gallery: Array.isArray(profile.gallery_paths) ? profile.gallery_paths : [],
      contactLinks: {
        whatsapp: profile.whatsapp || contactLinks.whatsapp || '',
        instagram: profile.instagram || contactLinks.instagram || '',
        facebook: profile.facebook || contactLinks.facebook || '',
        tiktok: profile.tiktok || contactLinks.tiktok || '',
      },
    },
    professionalLocation: {
      businessName: profile.commercial_name || row.name || '',
      address: profile.address_line || '',
      city: profile.city || '',
      latitude: profile.geo_lat ?? '',
      longitude: profile.geo_lng ?? '',
    },
  }
}

function nullableText(value) {
  const text = String(value ?? '').trim()
  return text || null
}

function nullableNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function normalizeGalleryPaths(value) {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => {
      if (typeof item === 'string') return item
      return item?.url || item?.path || ''
    })
    .filter(Boolean)
}

function mapSavedStudioProfile(row = {}) {
  return {
    profile: {
      commercialName: row.commercial_name || '',
      description: row.description || '',
      phone: row.phone || '',
      email: row.email || '',
      hours: '',
      logoUrl: row.logo_path || '',
      gallery: Array.isArray(row.gallery_paths) ? row.gallery_paths : [],
      contactLinks: {
        whatsapp: row.whatsapp || '',
        instagram: row.instagram || '',
        facebook: row.facebook || '',
        tiktok: row.tiktok || '',
      },
    },
    professionalLocation: {
      businessName: row.commercial_name || '',
      address: row.address_line || '',
      city: row.city || '',
      latitude: row.geo_lat ?? '',
      longitude: row.geo_lng ?? '',
    },
  }
}

function mapArtist({ artist, artistProfilesByArtistId, profilesById, memberships, studiosById }) {
  const artistProfile = artistProfilesByArtistId[artist.id] || {}
  const profile = artist.profile_id ? profilesById[artist.profile_id] : null
  const membership = firstMembershipForArtist(memberships, artist.id)
  const studio = membership ? studiosById[membership.studio_id || membership.studioId] : null
  const specialties = Array.isArray(artistProfile.specialties) ? artistProfile.specialties.filter(Boolean) : []
  const name = artistProfile.artistic_name || artist.display_name || profile?.display_name || 'Artista Studio Flow'
  const portfolioPaths = Array.isArray(artistProfile.portfolio_paths) ? artistProfile.portfolio_paths : []

  return {
    id: artist.id,
    profileId: artist.profile_id || null,
    studioId: membership?.studio_id || membership?.studioId || null,
    membershipId: membership?.id || null,
    name,
    city: artistProfile.city || studio?.city || '',
    plan: membership?.role || 'Artist',
    status: STATUS_FROM_DB[artist.status] || artist.status || 'Inactivo',
    studioStatus: studio?.studioStatus || 'pending',
    registeredAt: artist.created_at,
    specialties,
    revenue: '$0',
    owner: profile?.display_name || name,
    services: specialties.length > 0 ? specialties.join(', ') : artistProfile.primary_specialty || '',
    description: artistProfile.bio || '',
    email: profile?.email || '',
    phone: profile?.phone || '',
    profile,
    artistProfile,
    contactLinks: {
      whatsapp: artistProfile.whatsapp || '',
      instagram: artistProfile.instagram || '',
      facebook: artistProfile.facebook || '',
      tiktok: artistProfile.tiktok || '',
      website: artistProfile.website || '',
    },
    photoUrl: artistProfile.photo_path || '',
    portfolio: portfolioPaths.map((path, index) => ({
      id: `admin-artist-portfolio-${index + 1}`,
      label: `Foto ${index + 1}`,
      url: typeof path === 'string' ? path : path?.url || path?.path || '',
    })).filter((image) => image.url),
    memberships: memberships.filter((item) => item.artist_id === artist.id || item.artistId === artist.id),
    professionalLocation: profileLocationFromArtistProfile(artistProfile),
  }
}

export function mapAdminArtistsPayload(data = {}) {
  const artists = Array.isArray(data.artists) ? data.artists : []
  const artistProfiles = Array.isArray(data.artist_profiles) ? data.artist_profiles : []
  const profiles = Array.isArray(data.profiles) ? data.profiles : []
  const memberships = Array.isArray(data.memberships) ? data.memberships : []
  const studios = Array.isArray(data.studios) ? data.studios : []
  const artistProfilesByArtistId = Object.fromEntries(
    artistProfiles.filter((profile) => profile?.artist_id).map((profile) => [profile.artist_id, profile]),
  )
  const profilesById = indexById(profiles)
  const mappedStudios = studios.map(mapStudio)
  const studiosById = indexById(mappedStudios)

  return {
    artists: artists.map((artist) => mapArtist({
      artist,
      artistProfilesByArtistId,
      profilesById,
      memberships,
      studiosById,
    })),
    studios: mappedStudios,
    memberships,
    profiles,
    artistProfiles,
  }
}

export async function fetchAdminArtists() {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_admin_get_artists')

  if (error) throw error
  const mappedPayload = mapAdminArtistsPayload(data)
  const studioIds = mappedPayload.studios.map((studio) => studio.id).filter(Boolean)

  if (studioIds.length === 0) return mappedPayload

  const { data: studioContactRows, error: studioContactError } = await client
    .from('studio_profiles')
    .select('studio_id, whatsapp, instagram, facebook, tiktok')
    .in('studio_id', studioIds)

  if (studioContactError) throw studioContactError

  const contactsByStudioId = Object.fromEntries((studioContactRows || []).map((row) => [row.studio_id, row]))

  return {
    ...mappedPayload,
    studios: mappedPayload.studios.map((studio) => {
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
    }),
  }
}

function firstMappedArtistFromPayload(data) {
  const payload = mapAdminArtistsPayload(data)
  return payload.artists[0] || null
}

export async function activateAdminArtist(artistId) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_admin_activate_artist', {
    p_artist_id: artistId,
  })

  if (error) throw error

  return firstMappedArtistFromPayload(data)
}

export async function deactivateAdminArtist(artistId) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_admin_deactivate_artist', {
    p_artist_id: artistId,
  })

  if (error) throw error

  return firstMappedArtistFromPayload(data)
}

export async function approveAdminArtist(artistId) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_admin_approve_artist', {
    p_artist_id: artistId,
  })

  if (error) throw error

  return firstMappedArtistFromPayload(data)
}

export async function rejectAdminArtist(artistId) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_admin_reject_artist', {
    p_artist_id: artistId,
  })

  if (error) throw error

  return firstMappedArtistFromPayload(data)
}

export async function updateAdminArtistProfile(artistId, patch) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_admin_update_artist_profile', {
    p_artist_id: artistId,
    p_patch: patch,
  })

  if (error) throw error

  if (patch.contactLinks) {
    const { data: contactData, error: contactError } = await client.rpc('studio_flow_admin_update_artist_contact_links', {
      p_artist_id: artistId,
      p_contact_links: patch.contactLinks,
    })

    if (contactError) throw contactError
    return firstMappedArtistFromPayload(contactData)
  }

  return firstMappedArtistFromPayload(data)
}

export async function updateAdminStudioProfile(studioId, patch = {}) {
  if (!studioId) throw new Error('Studio requerido para guardar perfil.')

  const client = requireSupabase()
  const profile = patch.profile || {}
  const location = patch.professionalLocation || {}
  const contactLinks = profile.contactLinks || profile.contact_links || {}
  const commercialName = nullableText(profile.commercialName || location.businessName || patch.name) || 'Studio Flow'

  const payload = {
    studio_id: studioId,
    commercial_name: commercialName,
    description: nullableText(profile.description),
    email: nullableText(profile.email),
    phone: nullableText(profile.phone),
    address_line: nullableText(location.address || profile.addressLine),
    city: nullableText(location.city || patch.city),
    geo_lat: nullableNumber(location.latitude),
    geo_lng: nullableNumber(location.longitude),
    logo_path: nullableText(profile.logoUrl || profile.logoPath),
    gallery_paths: normalizeGalleryPaths(profile.gallery),
    whatsapp: nullableText(contactLinks.whatsapp),
    instagram: nullableText(contactLinks.instagram),
    facebook: nullableText(contactLinks.facebook),
    tiktok: nullableText(contactLinks.tiktok),
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await client
    .from('studio_profiles')
    .upsert(payload, { onConflict: 'studio_id' })
    .select('*')
    .single()

  if (error) throw error

  return mapSavedStudioProfile(data)
}
