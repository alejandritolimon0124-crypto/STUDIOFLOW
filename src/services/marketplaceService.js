import { requireSupabase } from '../lib/supabaseClient'

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function normalizeService(service = {}) {
  const durationMinutes = normalizeNumber(service.durationMinutes || service.duration_minutes, 60)
  const priceAmount = normalizeNumber(service.priceAmount || service.price_amount)

  return {
    ...service,
    id: service.id,
    name: service.name || 'Servicio',
    category: service.category || service.category_name || 'Servicios',
    description: service.description || '',
    ownerType: service.ownerType || service.owner_type || null,
    priceAmount,
    price: service.price || `$${priceAmount}`,
    durationMinutes,
    duration: service.duration || `${durationMinutes} min`,
    serviceTier: service.serviceTier || service.service_tier || 'basic',
    status: service.status || 'active',
  }
}

function normalizeAvailabilitySummary(listing = {}) {
  const rawAvailability = listing.availability || {}
  const availableCount = normalizeNumber(
    rawAvailability.availableCount
      ?? rawAvailability.available_count
      ?? listing.availableCount
      ?? listing.available_count,
  )

  return {
    ...rawAvailability,
    availableCount,
    available_count: availableCount,
    hasFutureSlots: Boolean(
      rawAvailability.hasFutureSlots
        ?? rawAvailability.has_future_slots
        ?? listing.hasFutureSlots
        ?? listing.has_future_slots
        ?? availableCount > 0,
    ),
  }
}

function getAvailabilityBadge(availability) {
  if (availability.availableCount > 0 || availability.hasFutureSlots) {
    return {
      label: 'Horarios disponibles',
      tone: 'success',
      level: 'high',
    }
  }

  return {
    label: 'Sin horarios publicados',
    tone: 'neutral',
    level: 'low',
  }
}

function normalizeListing(listing = {}) {
  const services = asArray(listing.services).map(normalizeService)
  const availability = normalizeAvailabilitySummary(listing)
  const artistId = listing.artistId || listing.artist_id || null
  const studioId = listing.studioId || listing.studio_id || null
  const membershipId = listing.membershipId || listing.membership_id || null
  const listingId = listing.listingId || listing.listing_id || listing.id
  const title = listing.title || listing.artistName || listing.artist_name || listing.name || 'Perfil publicado'
  const artistName = listing.artistName || listing.artist_name || title
  const studioName = listing.studioName || listing.studio_name || ''
  const city = listing.city || ''
  const profile = listing.profile || {}
  const studio = listing.studio || null
  const marketplaceServices = services.map((service) => service.name)

  return {
    ...listing,
    id: artistId || listingId,
    listingId,
    profileId: listing.profileId || listing.profile_id || null,
    profileType: listing.profileType || listing.profile_type || 'artist',
    artistId,
    studioId,
    membershipId,
    name: artistName,
    owner: artistName,
    title,
    summary: listing.summary || '',
    city,
    services: marketplaceServices.join(', '),
    marketplaceServices,
    marketplaceServiceOptions: services,
    specialties: asArray(profile.specialties || listing.specialties),
    photoUrl: profile.photoUrl || profile.photo_path || listing.photoUrl || listing.photo_path || '',
    portfolio: asArray(profile.portfolioPaths || profile.portfolio_paths || listing.portfolio),
    contactLinks: profile.contactLinks || profile.contact_links || {},
    professionalLocation: profile.professionalLocation || profile.professional_location || null,
    studio: studio ? {
      ...studio,
      professionalLocation: studio.professionalLocation || studio.professional_location || {
        addressLine: studio.profile?.addressLine || studio.profile?.address_line || '',
        city: studio.profile?.city || city,
        latitude: studio.profile?.latitude || studio.profile?.geo_lat || '',
        longitude: studio.profile?.longitude || studio.profile?.geo_lng || '',
      },
    } : (studioId ? {
      id: studioId,
      name: studioName,
      profile: {
        commercialName: studioName,
        city,
      },
      professionalLocation: {
        city,
      },
    } : null),
    membership: membershipId ? {
      id: membershipId,
      artistId,
      studioId,
    } : null,
    occupancy: 0,
    availability,
    availabilityScore: availability.availableCount,
    badge: getAvailabilityBadge(availability),
    visibilityStatus: listing.visibilityStatus || listing.visibility_status || 'visible',
  }
}

function mapMarketplacePayload(data) {
  return asArray(data?.listings).map(normalizeListing)
}

export async function fetchMarketplaceListings() {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_marketplace_get_listings')

  if (error) throw error

  return mapMarketplacePayload(data)
}
