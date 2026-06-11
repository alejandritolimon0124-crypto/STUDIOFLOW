import { requireSupabase } from '../lib/supabaseClient'

const STATUS_FROM_DB = {
  active: 'Activo',
  inactive: 'Inactivo',
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

function mapArtist({ artist, artistProfilesByArtistId, profilesById, memberships, studiosById }) {
  const artistProfile = artistProfilesByArtistId[artist.id] || {}
  const profile = artist.profile_id ? profilesById[artist.profile_id] : null
  const membership = firstMembershipForArtist(memberships, artist.id)
  const studio = membership ? studiosById[membership.studio_id || membership.studioId] : null
  const specialties = Array.isArray(artistProfile.specialties) ? artistProfile.specialties.filter(Boolean) : []
  const name = artistProfile.artistic_name || artist.display_name || profile?.display_name || 'Artista Studio Flow'

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
    services: specialties.length > 0 ? specialties.join(', ') : artistProfile.primary_specialty || 'Servicios beauty',
    description: artistProfile.bio || 'Perfil profesional beauty listo para recibir reservas.',
    email: profile?.email || '',
    phone: profile?.phone || '',
    profile,
    artistProfile,
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

  return mapAdminArtistsPayload(data)
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

export async function updateAdminArtistProfile(artistId, patch) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_admin_update_artist_profile', {
    p_artist_id: artistId,
    p_patch: patch,
  })

  if (error) throw error

  return firstMappedArtistFromPayload(data)
}
