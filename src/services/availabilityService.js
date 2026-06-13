import { requireSupabase } from '../lib/supabaseClient'

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeSlot(slot = {}) {
  return {
    ...slot,
    id: slot.id || slot.availabilitySlotId || slot.availability_slot_id,
    availabilitySlotId: slot.availabilitySlotId || slot.availability_slot_id || slot.id,
    listingId: slot.listingId || slot.listing_id || null,
    artistId: slot.artistId || slot.artist_id || null,
    studioId: slot.studioId || slot.studio_id || null,
    membershipId: slot.membershipId || slot.membership_id || null,
    serviceOfferingId: slot.serviceOfferingId || slot.service_offering_id || null,
    startsAt: slot.startsAt || slot.starts_at || null,
    endsAt: slot.endsAt || slot.ends_at || null,
    date: slot.date || '',
    time: slot.time || '',
    end: slot.end || '',
    durationMinutes: Number(slot.durationMinutes || slot.duration_minutes || 0),
    available: slot.available !== false,
    status: slot.status || 'available',
  }
}

function normalizeAvailabilityPayload(data = {}) {
  return {
    listingId: data.listingId || data.listing_id || null,
    artistId: data.artistId || data.artist_id || null,
    studioId: data.studioId || data.studio_id || null,
    membershipId: data.membershipId || data.membership_id || null,
    serviceOfferingId: data.serviceOfferingId || data.service_offering_id || null,
    date: data.date || '',
    slots: asArray(data.slots).map(normalizeSlot),
  }
}

export async function fetchMarketplaceAvailability({
  listingId,
  serviceOfferingId = null,
  date,
} = {}) {
  if (!listingId) throw new Error('Listing requerido para consultar horarios.')
  if (!date) throw new Error('Fecha requerida para consultar horarios.')

  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_marketplace_get_availability', {
    p_listing_id: listingId,
    p_service_offering_id: serviceOfferingId || null,
    p_date: date,
  })

  if (error) throw error

  return normalizeAvailabilityPayload(data)
}
