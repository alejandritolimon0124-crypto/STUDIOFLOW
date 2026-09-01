import { requireSupabase } from '../lib/supabaseClient'
import { getContextRpcParams } from './artistWorkContextService'

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function normalizeAppointment(appointment = {}) {
  const durationMinutes = normalizeNumber(appointment.durationMinutes || appointment.duration_minutes, 60)
  const studioName = appointment.studioName || appointment.studio_name || ''
  const appointmentStatus = appointment.appointmentStatus || appointment.appointment_status || 'scheduled'
  const clientConfirmedAt = appointment.clientConfirmedAt || appointment.client_confirmed_at || null
  const confirmationRequestedAt = appointment.confirmationRequestedAt || appointment.confirmation_requested_at || null
  const displayStatus = appointmentStatus === 'scheduled'
    ? clientConfirmedAt
      ? 'Confirmada'
      : confirmationRequestedAt
        ? 'Pendiente de confirmar'
        : 'Agendada'
    : appointment.status || 'Confirmada'
  const contextName = appointment.contextName
    || appointment.context_name
    || (appointment.studioId || appointment.studio_id ? appointment.room || studioName : appointment.artist)
    || appointment.room
    || 'Agenda'

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
    status: displayStatus,
    appointmentStatus,
    clientConfirmedAt,
    confirmationRequestedAt,
    contextName,
    bookingSource: appointment.bookingSource || appointment.booking_source || null,
    grossAmount: normalizeNumber(appointment.grossAmount || appointment.gross_amount),
    platformFee: normalizeNumber(appointment.platformFee || appointment.platform_fee),
    artistRevenue: normalizeNumber(appointment.artistRevenue || appointment.artist_revenue),
    pointsGranted: normalizeNumber(appointment.pointsGranted || appointment.points_granted),
    flowPointsAwarded: normalizeNumber(appointment.flowPointsAwarded || appointment.flow_points_awarded),
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

export async function updateClientAppointmentResponse({ appointmentId, action } = {}) {
  if (!appointmentId) throw new Error('Cita requerida.')
  if (!['confirm', 'cancel'].includes(action)) throw new Error('Accion invalida.')

  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_client_update_appointment_response', {
    p_appointment_id: appointmentId,
    p_action: action,
  })

  if (error) throw error

  return normalizeAppointment(data?.appointment)
}

export async function awardAppointmentFlowPoints({ appointmentId } = {}) {
  if (!appointmentId) throw new Error('Cita requerida.')

  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_artist_award_appointment_points', {
    p_appointment_id: appointmentId,
  })

  if (error) throw error

  return data
}

export async function redeemClientFlowPoints({ points, artistId = null, studioId = null } = {}) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_client_redeem_flow_points', {
    p_points: Number(points) || 0,
    p_artist_id: artistId,
    p_studio_id: studioId,
  })

  if (error) throw error

  return data
}

export async function fetchClientFlowPointsBalance() {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_client_get_flow_points_balance')

  if (error) throw error

  return {
    monthlyBalance: normalizeNumber(data?.monthlyBalance ?? data?.monthly_balance),
    monthlyEarned: normalizeNumber(data?.monthlyEarned ?? data?.monthly_earned),
    monthlySpent: normalizeNumber(data?.monthlySpent ?? data?.monthly_spent),
    activeBalance: normalizeNumber(data?.activeBalance ?? data?.active_balance ?? data?.monthlyBalance ?? data?.monthly_balance),
    activeEarned: normalizeNumber(data?.activeEarned ?? data?.active_earned ?? data?.monthlyEarned ?? data?.monthly_earned),
    activeSpent: normalizeNumber(data?.activeSpent ?? data?.active_spent ?? data?.monthlySpent ?? data?.monthly_spent),
    validityDays: normalizeNumber(data?.validityDays ?? data?.validity_days, 90),
    expiringSoonPoints: normalizeNumber(data?.expiringSoonPoints ?? data?.expiring_soon_points),
    nextExpirationAt: data?.nextExpirationAt ?? data?.next_expiration_at ?? null,
  }
}

export async function requestArtistAppointmentConfirmations({ date = null, workContext = null } = {}) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_artist_request_appointment_confirmations', {
    p_scope: 'artist',
    p_date: date || null,
    ...getContextRpcParams(workContext),
  })

  if (error) throw error

  return Number(data?.updatedCount || data?.updated_count || 0)
}

export async function fetchManualArtistAvailability({
  serviceOfferingId,
  date,
  workContext = null,
} = {}) {
  if (!serviceOfferingId) throw new Error('Selecciona un servicio.')
  if (!date) throw new Error('Selecciona una fecha.')

  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_artist_get_manual_availability', {
    p_service_offering_id: serviceOfferingId,
    p_date: date,
    ...getContextRpcParams(workContext),
  })

  if (error) throw error

  return normalizeManualAvailabilityPayload(data)
}

export async function createManualArtistAppointment({
  clientId,
  firstName,
  lastName,
  phone,
  serviceOfferingId,
  date,
  time,
  notes = '',
  workContext = null,
} = {}) {
  const client = requireSupabase()
  const rpcName = clientId
    ? 'studio_flow_artist_create_manual_appointment_for_client'
    : 'studio_flow_artist_create_manual_appointment'
  const params = clientId
    ? {
      p_client_id: clientId,
      p_service_offering_id: serviceOfferingId,
      p_date: date,
      p_time: time,
      p_notes: notes || null,
      ...getContextRpcParams(workContext),
    }
    : {
      p_client_first_name: firstName,
      p_client_last_name: lastName,
      p_client_phone: phone,
      p_service_offering_id: serviceOfferingId,
      p_date: date,
      p_time: time,
      p_notes: notes || null,
      ...getContextRpcParams(workContext),
    }

  const { data, error } = await client.rpc(rpcName, params)

  if (error) throw error

  return normalizeAppointment(data?.appointment)
}
