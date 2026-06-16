import { requireSupabase } from '../lib/supabaseClient'

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function normalizeAppointment(appointment = {}) {
  const durationMinutes = normalizeNumber(appointment.durationMinutes || appointment.duration_minutes, 60)

  return {
    ...appointment,
    id: appointment.id,
    type: appointment.type || 'appointment',
    clientId: appointment.clientId || appointment.client_id || null,
    artistId: appointment.artistId || appointment.artist_id || null,
    studioId: appointment.studioId || appointment.studio_id || null,
    membershipId: appointment.membershipId || appointment.membership_id || null,
    serviceOfferingId: appointment.serviceOfferingId || appointment.service_offering_id || null,
    availabilitySlotId: appointment.availabilitySlotId || appointment.availability_slot_id || null,
    client: appointment.client || 'Clienta',
    artist: appointment.artist || 'Artista',
    service: appointment.service || 'Servicio',
    serviceTier: appointment.serviceTier || appointment.service_tier || 'basic',
    date: appointment.date || '',
    time: appointment.time || '',
    end: appointment.end || '',
    startsAt: appointment.startsAt || appointment.starts_at || null,
    endsAt: appointment.endsAt || appointment.ends_at || null,
    durationMinutes,
    duration: appointment.duration || `${durationMinutes} min`,
    room: appointment.room || 'Agenda',
    address: appointment.address || 'Agenda Studio Flow',
    status: appointment.status || 'Confirmada',
    appointmentStatus: appointment.appointmentStatus || appointment.appointment_status || 'scheduled',
    bookingSource: appointment.bookingSource || appointment.booking_source || null,
    grossAmount: normalizeNumber(appointment.grossAmount || appointment.gross_amount),
    platformFee: normalizeNumber(appointment.platformFee || appointment.platform_fee),
    artistRevenue: normalizeNumber(appointment.artistRevenue || appointment.artist_revenue),
    pointsGranted: normalizeNumber(appointment.pointsGranted || appointment.points_granted),
    riskScore: appointment.riskScore || appointment.risk_score || 'low',
  }
}

function mapAppointmentsPayload(data) {
  return asArray(data?.appointments).map(normalizeAppointment)
}

function normalizeAvailabilitySlot(slot = {}) {
  return {
    ...slot,
    id: slot.id || slot.availabilitySlotId || slot.availability_slot_id,
    availabilitySlotId: slot.availabilitySlotId || slot.availability_slot_id || slot.id,
    availabilitySlotIds: Array.isArray(slot.availabilitySlotIds)
      ? slot.availabilitySlotIds
      : Array.isArray(slot.availability_slot_ids)
        ? slot.availability_slot_ids
        : [],
    artistId: slot.artistId || slot.artist_id || null,
    studioId: slot.studioId || slot.studio_id || null,
    membershipId: slot.membershipId || slot.membership_id || null,
    serviceOfferingId: slot.serviceOfferingId || slot.service_offering_id || null,
    startsAt: slot.startsAt || slot.starts_at || slot.start || null,
    endsAt: slot.endsAt || slot.ends_at || null,
    date: slot.date || '',
    time: slot.time || '',
    end: slot.end || '',
    durationMinutes: normalizeNumber(slot.durationMinutes || slot.duration_minutes),
    available: slot.available !== false,
    status: slot.status || 'available',
  }
}

function normalizeManualAvailabilityPayload(data = {}) {
  return {
    artistId: data.artistId || data.artist_id || null,
    studioId: data.studioId || data.studio_id || null,
    membershipId: data.membershipId || data.membership_id || null,
    serviceOfferingId: data.serviceOfferingId || data.service_offering_id || null,
    date: data.date || '',
    requestedDate: data.requestedDate || data.requested_date || '',
    durationMinutes: normalizeNumber(data.durationMinutes || data.duration_minutes),
    slots: asArray(data.slots).map(normalizeAvailabilitySlot),
  }
}

export async function fetchClientAppointments() {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_get_client_appointments')

  if (error) throw error

  return mapAppointmentsPayload(data)
}

export async function fetchArtistAppointments({ artistId } = {}) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_get_artist_appointments', {
    p_artist_id: artistId || null,
  })

  if (error) throw error

  return mapAppointmentsPayload(data)
}

export async function fetchManualArtistAvailability({
  serviceOfferingId,
  date,
} = {}) {
  if (!serviceOfferingId) throw new Error('Selecciona un servicio.')
  if (!date) throw new Error('Selecciona una fecha.')

  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_artist_get_manual_availability', {
    p_service_offering_id: serviceOfferingId,
    p_date: date,
  })

  if (error) throw error

  return normalizeManualAvailabilityPayload(data)
}

export async function createManualArtistAppointment({
  firstName,
  lastName,
  phone,
  serviceOfferingId,
  date,
  time,
  notes = '',
} = {}) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_artist_create_manual_appointment', {
    p_client_first_name: firstName,
    p_client_last_name: lastName,
    p_client_phone: phone,
    p_service_offering_id: serviceOfferingId,
    p_date: date,
    p_time: time,
    p_notes: notes || null,
  })

  if (error) throw error

  return normalizeAppointment(data?.appointment)
}
