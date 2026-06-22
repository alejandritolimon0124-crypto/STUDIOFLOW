import { requireSupabase } from '../lib/supabaseClient'

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
    startsAt: appointment.startsAt || appointment.starts_at || null,
    endsAt: appointment.endsAt || appointment.ends_at || null,
    date: appointment.date || '',
    time: appointment.time || '',
    end: appointment.end || '',
    client: appointment.client || appointment.clientName || 'Clienta',
    service: appointment.service || 'Servicio',
    artist: appointment.artist || 'Artista',
    status: appointment.status || 'Confirmada',
    appointmentStatus: appointment.appointmentStatus || appointment.appointment_status || 'scheduled',
  }
}

function normalizeClient(client = {}) {
  return {
    ...client,
    id: client.id,
    name: client.name || client.displayName || client.display_name || 'Clienta',
    email: client.email || '',
    phone: client.phone || '',
    status: client.status || 'active',
  }
}

export async function createStudioOwnerAppointment({
  studioId,
  membershipId,
  serviceOfferingId,
  availabilitySlotId,
  clientId = null,
  clientName = '',
  clientPhone = '',
  clientEmail = '',
  notes = '',
} = {}) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_owner_create_manual_appointment', {
    p_studio_id: studioId,
    p_membership_id: membershipId,
    p_service_offering_id: serviceOfferingId,
    p_availability_slot_id: availabilitySlotId,
    p_client_id: clientId || null,
    p_client_name: clientName || null,
    p_client_phone: clientPhone || null,
    p_client_email: clientEmail || null,
    p_notes: notes || null,
  })

  if (error) throw error

  return {
    appointment: normalizeAppointment(data?.appointment),
    client: normalizeClient(data?.client),
  }
}
