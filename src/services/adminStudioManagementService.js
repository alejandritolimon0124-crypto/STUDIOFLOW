import { requireSupabase } from '../lib/supabaseClient'

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeReview(review = null) {
  if (!review) return null

  return {
    id: review.id,
    reviewType: review.reviewType || review.review_type || '',
    status: review.status || '',
    reason: review.reason || '',
    decisionNotes: review.decisionNotes || review.decision_notes || '',
    reviewedByProfileId: review.reviewedByProfileId || review.reviewed_by_profile_id || null,
    createdAt: review.createdAt || review.created_at || null,
    resolvedAt: review.resolvedAt || review.resolved_at || null,
  }
}

function normalizeStudio(studio = {}) {
  const profile = studio.profile || {}
  const owner = studio.owner || {}

  return {
    id: studio.id || studio.studioId || studio.studio_id,
    name: studio.name || '',
    studioStatus: studio.studioStatus || studio.studio_status || 'pending',
    riskScore: studio.riskScore || studio.risk_score || '',
    createdAt: studio.createdAt || studio.created_at || '',
    approvedAt: studio.approvedAt || studio.approved_at || '',
    suspendedAt: studio.suspendedAt || studio.suspended_at || '',
    commercialName: profile.commercialName || profile.commercial_name || studio.name || 'Estudio profesional',
    city: profile.city || '',
    email: profile.email || '',
    phone: profile.phone || '',
    addressLine: profile.addressLine || profile.address_line || '',
    description: profile.description || '',
    ownerName: owner.displayName || owner.display_name || 'Owner',
    ownerEmail: owner.email || '',
    ownerPhone: owner.phone || '',
    ownerProfileId: owner.profileId || owner.profile_id || null,
    latestReview: normalizeReview(studio.latestReview || studio.latest_review),
  }
}

function normalizePayload(data = {}) {
  return asArray(data.studios).map(normalizeStudio)
}

export async function fetchOwnerStudios() {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_owner_get_studios')

  if (error) throw error

  return normalizePayload(data)
}

export async function reviewOwnerStudio({ studioId, action, reason = '' } = {}) {
  if (!studioId) throw new Error('Estudio requerido.')
  if (!action) throw new Error('Accion requerida.')

  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_owner_review_studio', {
    p_studio_id: studioId,
    p_action: action,
    p_reason: reason || null,
  })

  if (error) throw error

  return normalizePayload(data)
}
