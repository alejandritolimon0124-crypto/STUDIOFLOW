import { requireSupabase } from '../lib/supabaseClient'

export async function fetchPublicBookingListings() {
  const { data, error } = await requireSupabase().rpc('studio_flow_public_booking_get_listings')
  if (error) throw error
  return Array.isArray(data?.listings) ? data.listings : []
}

export async function fetchPublicBookingAvailability({ listingId, serviceOfferingId, date }) {
  const { data, error } = await requireSupabase().rpc('studio_flow_marketplace_get_availability', {
    p_listing_id: listingId, p_service_offering_id: serviceOfferingId, p_date: date,
  })
  if (error) throw error
  return data || { slots: [] }
}

export async function createPublicGoogleReservation(payload) {
  const source = ['instagram', 'facebook'].includes(payload.bookingSource) ? payload.bookingSource : 'google'
  const { data, error } = await requireSupabase().rpc(source === 'google' ? 'studio_flow_public_book_google_reservation' : 'studio_flow_public_book_social_reservation', {
    p_listing_id: payload.listingId, p_availability_slot_ids: payload.slotIds, p_service_offering_id: payload.serviceOfferingId,
    p_name: payload.name, p_email: payload.email, p_phone: payload.phone,
    ...(source === 'google' ? {} : { p_channel: source }),
    p_notes: payload.notes || null,
  })
  if (error) throw error
  return data
}
