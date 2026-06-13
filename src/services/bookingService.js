import { requireSupabase } from '../lib/supabaseClient'

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeAppointment(appointment = {}) {
  return {
    ...appointment,
    id: appointment.id,
    clientId: appointment.clientId || appointment.client_id || null,
    artistId: appointment.artistId || appointment.artist_id || null,
    studioId: appointment.studioId || appointment.studio_id || null,
    membershipId: appointment.membershipId || appointment.membership_id || null,
    serviceOfferingId: appointment.serviceOfferingId || appointment.service_offering_id || null,
    availabilitySlotId: appointment.availabilitySlotId || appointment.availability_slot_id || null,
    marketplaceListingId: appointment.marketplaceListingId || appointment.marketplace_listing_id || null,
    startsAt: appointment.startsAt || appointment.starts_at || null,
    endsAt: appointment.endsAt || appointment.ends_at || null,
    date: appointment.date || '',
    time: appointment.time || '',
    end: appointment.end || '',
    status: appointment.status || 'Confirmada',
    appointmentStatus: appointment.appointmentStatus || appointment.appointment_status || 'scheduled',
    bookingSource: appointment.bookingSource || appointment.booking_source || 'marketplace',
    clientNotes: appointment.clientNotes || appointment.client_notes || '',
  }
}

function normalizeBookingPayload(data = {}) {
  return {
    appointment: normalizeAppointment(data.appointment),
    service: data.service || null,
    artist: data.artist || null,
    startsAt: data.startsAt || data.starts_at || null,
    endsAt: data.endsAt || data.ends_at || null,
    status: data.status || 'scheduled',
  }
}

export async function bookMarketplaceAppointment({
  availabilitySlotIds,
  serviceOfferingId,
  notes = null,
} = {}) {
  const slotIds = asArray(availabilitySlotIds).filter(Boolean)

  if (slotIds.length === 0) throw new Error('Selecciona un horario disponible.')
  if (!serviceOfferingId) throw new Error('Selecciona un servicio.')

  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_marketplace_book_appointment', {
    p_availability_slot_ids: slotIds,
    p_service_offering_id: serviceOfferingId,
    p_notes: notes || null,
  })

  if (error) throw error

  return normalizeBookingPayload(data)
}
