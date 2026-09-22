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
  const contactLinks = profile.contactLinks || profile.contact_links || {}

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
    contactLinks: {
      whatsapp: profile.whatsapp || contactLinks.whatsapp || '',
      instagram: profile.instagram || contactLinks.instagram || '',
      facebook: profile.facebook || contactLinks.facebook || '',
      tiktok: profile.tiktok || contactLinks.tiktok || '',
    },
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
  const studios = normalizePayload(data)
  const studioIds = studios.map((studio) => studio.id).filter(Boolean)
  if (studioIds.length === 0) return studios

  const { data: contactRows, error: contactError } = await client
    .from('studio_profiles')
    .select('studio_id, whatsapp, instagram, facebook, tiktok')
    .in('studio_id', studioIds)

  if (contactError) throw contactError
  const contactsByStudioId = Object.fromEntries((contactRows || []).map((row) => [row.studio_id, row]))

  return studios.map((studio) => {
    const contactRow = contactsByStudioId[studio.id] || {}
    return {
      ...studio,
      contactLinks: {
        whatsapp: contactRow.whatsapp || '',
        instagram: contactRow.instagram || '',
        facebook: contactRow.facebook || '',
        tiktok: contactRow.tiktok || '',
      },
    }
  })
}

export async function saveOwnerStudioProfile(studio) {
  const name = studio.commercialName.trim()
  const contactLinks = studio.contactLinks || {}
  if (!name) throw new Error('Escribe el nombre del estudio.')
  const { error } = await requireSupabase().from('studio_profiles').upsert({
    studio_id: studio.id,
    commercial_name: name,
    email: studio.email.trim() || null,
    phone: studio.phone.trim() || null,
    city: studio.city.trim() || null,
    address_line: studio.addressLine.trim() || null,
    description: studio.description.trim() || null,
    whatsapp: String(contactLinks.whatsapp || '').trim() || null,
    instagram: String(contactLinks.instagram || '').trim() || null,
    facebook: String(contactLinks.facebook || '').trim() || null,
    tiktok: String(contactLinks.tiktok || '').trim() || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'studio_id' }).select('studio_id').single()
  if (error) throw error
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
