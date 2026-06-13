import { requireSupabase } from '../lib/supabaseClient'

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeStudio(studio = {}) {
  const profile = studio.profile || {}

  return {
    ...studio,
    id: studio.id,
    name: studio.name || profile.commercialName || profile.commercial_name || 'Studio',
    studioStatus: studio.studioStatus || studio.studio_status || 'pending',
    riskScore: studio.riskScore || studio.risk_score || null,
    createdAt: studio.createdAt || studio.created_at || null,
    approvedAt: studio.approvedAt || studio.approved_at || null,
    suspendedAt: studio.suspendedAt || studio.suspended_at || null,
    archivedAt: studio.archivedAt || studio.archived_at || null,
    profile: {
      ...profile,
      commercialName: profile.commercialName || profile.commercial_name || studio.name || 'Studio',
      addressLine: profile.addressLine || profile.address_line || '',
      logoPath: profile.logoPath || profile.logo_path || '',
    },
  }
}

function normalizeReview(review = null) {
  if (!review) return null

  return {
    ...review,
    id: review.id,
    reviewType: review.reviewType || review.review_type || null,
    status: review.status || null,
    reason: review.reason || '',
    decisionNotes: review.decisionNotes || review.decision_notes || '',
    reviewedByProfileId: review.reviewedByProfileId || review.reviewed_by_profile_id || null,
    createdAt: review.createdAt || review.created_at || null,
    resolvedAt: review.resolvedAt || review.resolved_at || null,
  }
}

function normalizeQueueItem(item = {}) {
  const studio = normalizeStudio(item.studio || {})

  return {
    ...item,
    id: studio.id,
    studio,
    latestReview: normalizeReview(item.latestReview || item.latest_review),
    artists: asArray(item.artists),
    activeServiceCount: Number(item.activeServiceCount ?? item.active_service_count ?? 0),
    marketplace: item.marketplace || {
      profiles: [],
      listings: [],
    },
  }
}

function normalizeReviewResult(data = {}) {
  return {
    studio: normalizeStudio(data.studio || {}),
    governanceReview: normalizeReview(data.governanceReview || data.governance_review),
    queue: asArray(data.queue).map(normalizeQueueItem),
  }
}

function normalizeArtist(artist = {}) {
  return {
    ...artist,
    id: artist.id,
    profileId: artist.profileId || artist.profile_id || null,
    displayName: artist.displayName || artist.display_name || '',
    status: artist.status || null,
    createdAt: artist.createdAt || artist.created_at || null,
  }
}

function normalizeArtistProfile(profile = null) {
  if (!profile) return null

  return {
    ...profile,
    id: profile.id,
    artistId: profile.artistId || profile.artist_id || null,
    artisticName: profile.artisticName || profile.artistic_name || '',
    primarySpecialty: profile.primarySpecialty || profile.primary_specialty || '',
    photoPath: profile.photoPath || profile.photo_path || '',
    city: profile.city || '',
  }
}

function normalizeMarketplaceProfile(profile = null) {
  if (!profile) return null

  return {
    ...profile,
    id: profile.id,
    profileType: profile.profileType || profile.profile_type || null,
    artistId: profile.artistId || profile.artist_id || null,
    title: profile.title || '',
    summary: profile.summary || '',
    visibilityStatus: profile.visibilityStatus || profile.visibility_status || null,
    publishedAt: profile.publishedAt || profile.published_at || null,
    hiddenAt: profile.hiddenAt || profile.hidden_at || null,
  }
}

function normalizeMarketplaceListing(listing = {}) {
  return {
    ...listing,
    id: listing.id,
    visibilityStatus: listing.visibilityStatus || listing.visibility_status || null,
    generatedAt: listing.generatedAt || listing.generated_at || null,
    expiresAt: listing.expiresAt || listing.expires_at || null,
  }
}

function normalizeIndependentArtistReadiness(data = {}) {
  const artist = normalizeArtist(data.artist || {})

  return {
    artist,
    artistProfile: normalizeArtistProfile(data.artistProfile || data.artist_profile),
    activeServiceCount: Number(data.activeServiceCount ?? data.active_service_count ?? 0),
    marketplaceProfile: normalizeMarketplaceProfile(data.marketplaceProfile || data.marketplace_profile),
    marketplaceListings: asArray(data.marketplaceListings || data.marketplace_listings).map(normalizeMarketplaceListing),
    listingCount: Number(data.listingCount ?? data.listing_count ?? 0),
    publicationStatus: data.publicationStatus || data.publication_status || 'not_published',
    canPublish: Boolean(data.canPublish ?? data.can_publish),
    missing: asArray(data.missing),
  }
}

export function mapGovernanceQueuePayload(data = {}) {
  return asArray(data.queue).map(normalizeQueueItem)
}

export async function fetchGovernanceQueue() {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_admin_get_governance_queue')

  if (error) throw error

  return mapGovernanceQueuePayload(data)
}

export async function reviewStudio({
  studioId,
  decision,
  reason = null,
  decisionNotes = null,
} = {}) {
  if (!studioId) throw new Error('Studio requerido para governance.')
  if (!decision) throw new Error('Decision requerida para governance.')

  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_admin_review_studio', {
    p_studio_id: studioId,
    p_decision: decision,
    p_reason: reason,
    p_decision_notes: decisionNotes,
  })

  if (error) throw error

  return normalizeReviewResult(data)
}

export async function fetchIndependentArtistPublicationReadiness(artistId = null) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_admin_get_independent_artist_publication_readiness', {
    p_artist_id: artistId || null,
  })

  if (error) throw error

  return normalizeIndependentArtistReadiness(data)
}

export async function publishIndependentArtist({
  artistId,
  title = null,
  summary = null,
  city = null,
} = {}) {
  if (!artistId) throw new Error('Artista requerido para publicar.')

  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_admin_publish_independent_artist', {
    p_artist_id: artistId,
    p_title: title,
    p_summary: summary,
    p_city: city,
  })

  if (error) throw error

  return normalizeIndependentArtistReadiness(data)
}
