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

function mapAppointmentStatus(status = '') {
  const normalizedStatus = String(status || '').toLowerCase()
  if (normalizedStatus === 'scheduled') return 'Confirmada'
  if (normalizedStatus === 'completed') return 'Completada'
  if (normalizedStatus === 'cancelled') return 'Cancelada'
  if (normalizedStatus === 'disputed') return 'En revision'
  return status || 'Programada'
}

function normalizeClient(client = {}) {
  return {
    ...client,
    id: client.id,
    name: client.name || client.fullName || client.full_name || client.displayName || client.display_name || 'Clienta',
    fullName: client.fullName || client.full_name || client.name || client.displayName || client.display_name || 'Clienta',
    email: client.email || '',
    phone: client.phone || '',
    status: client.status || 'active',
    createdAt: client.createdAt || client.created_at || '',
  }
}

export async function searchStudioOwnerClients({ query = '', limit = 5 } = {}) {
  const client = requireSupabase()
  const normalizedQuery = String(query || '').trim()
  let request = client
    .from('clients')
    .select('id, display_name, email, phone, status, created_at')
    .neq('status', 'archived')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (normalizedQuery) {
    const escapedQuery = normalizedQuery.replaceAll('%', '\\%').replaceAll('_', '\\_')
    request = request.or(`display_name.ilike.%${escapedQuery}%,email.ilike.%${escapedQuery}%`)
  }

  const { data, error } = await request

  if (error) throw error

  return (data || []).map(normalizeClient)
}

export async function fetchStudioOwnerAppointmentClients({ studioId, query = '', limit = 5 } = {}) {
  if (!studioId) return []

  const client = requireSupabase()
  const { data, error } = await client
    .from('appointments')
    .select('id, client_id, starts_at, status, client:clients(id, display_name, email, phone, status, created_at)')
    .eq('studio_id', studioId)
    .in('status', ['scheduled', 'completed', 'disputed'])
    .order('starts_at', { ascending: false })
    .limit(100)

  if (error) throw error

  const normalizedQuery = String(query || '').trim().toLowerCase()
  const clientsById = new Map()

  ;(data || []).forEach((appointment) => {
    const appointmentClient = normalizeClient(appointment.client || {})
    if (!appointmentClient.id) return

    const searchable = `${appointmentClient.name} ${appointmentClient.fullName} ${appointmentClient.email}`.toLowerCase()
    if (normalizedQuery && !searchable.includes(normalizedQuery)) return

    const existingClient = clientsById.get(appointmentClient.id)
    clientsById.set(appointmentClient.id, {
      ...appointmentClient,
      appointments: (existingClient?.appointments || 0) + 1,
      lastAppointmentAt: existingClient?.lastAppointmentAt || appointment.starts_at,
      lastAppointment: existingClient?.lastAppointment || appointment.starts_at,
      studioId,
    })
  })

  return Array.from(clientsById.values())
    .sort((firstClient, secondClient) => String(secondClient.lastAppointmentAt || '').localeCompare(String(firstClient.lastAppointmentAt || '')))
    .slice(0, limit)
}

export async function fetchStudioOwnerAppointments({ studioId, membershipIds = [], limit = 100 } = {}) {
  const normalizedMembershipIds = [...new Set((membershipIds || []).filter(Boolean))]
  if (!studioId && normalizedMembershipIds.length === 0) return []

  const client = requireSupabase()
  const selectColumns = 'id, client_id, artist_id, studio_id, membership_id, service_offering_id, availability_slot_id, starts_at, ends_at, status, booking_source, client_notes, created_at'
  const appointmentRows = []

  if (studioId) {
    const { data, error } = await client
      .from('appointments')
      .select(selectColumns)
      .eq('studio_id', studioId)
      .neq('status', 'cancelled')
      .order('starts_at', { ascending: true })
      .limit(limit)

    if (error) throw error
    appointmentRows.push(...(data || []))
  }

  if (normalizedMembershipIds.length > 0) {
    const { data, error } = await client
      .from('appointments')
      .select(selectColumns)
      .in('membership_id', normalizedMembershipIds)
      .neq('status', 'cancelled')
      .order('starts_at', { ascending: true })
      .limit(limit)

    if (error) throw error
    appointmentRows.push(...(data || []))
  }

  const appointments = Array.from(new Map(appointmentRows.map((appointment) => [appointment.id, appointment])).values())
    .sort((firstAppointment, secondAppointment) => String(firstAppointment.starts_at || '').localeCompare(String(secondAppointment.starts_at || '')))
    .slice(0, limit)
  const clientIds = [...new Set(appointments.map((appointment) => appointment.client_id).filter(Boolean))]
  const serviceIds = [...new Set(appointments.map((appointment) => appointment.service_offering_id).filter(Boolean))]
  const artistIds = [...new Set(appointments.map((appointment) => appointment.artist_id).filter(Boolean))]
  const clientsById = new Map()
  const servicesById = new Map()
  const artistsById = new Map()

  if (clientIds.length > 0) {
    const { data: clients, error: clientsError } = await client
      .from('clients')
      .select('id, display_name, email, phone')
      .in('id', clientIds)

    if (clientsError) throw clientsError
    ;(clients || []).forEach((appointmentClient) => clientsById.set(appointmentClient.id, appointmentClient))
  }

  if (serviceIds.length > 0) {
    const { data: services, error: servicesError } = await client
      .from('service_offerings')
      .select('id, name, duration_minutes')
      .in('id', serviceIds)

    if (servicesError) throw servicesError
    ;(services || []).forEach((service) => servicesById.set(service.id, service))
  }

  if (artistIds.length > 0) {
    const { data: artists, error: artistsError } = await client
      .from('artists')
      .select('id, display_name')
      .in('id', artistIds)

    if (artistsError) throw artistsError
    ;(artists || []).forEach((artist) => artistsById.set(artist.id, artist))
  }

  return appointments.map((appointment) => {
    const appointmentClient = clientsById.get(appointment.client_id)
    const service = servicesById.get(appointment.service_offering_id)
    const artist = artistsById.get(appointment.artist_id)
    const startsAt = appointment.starts_at || ''
    const endsAt = appointment.ends_at || ''

    return normalizeAppointment({
      ...appointment,
      client: appointmentClient?.display_name || 'Clienta',
      service: service?.name || 'Servicio',
      artist: artist?.display_name || 'Artista',
      date: startsAt.slice(0, 10),
      time: startsAt.slice(11, 16),
      end: endsAt.slice(11, 16),
      status: mapAppointmentStatus(appointment.status),
      appointmentStatus: appointment.status,
    })
  })
}

export async function fetchStudioOwnerClientAppointments({
  studioId,
  clientId,
  upcomingOnly = false,
  limit = 10,
} = {}) {
  if (!studioId || !clientId) return []

  const client = requireSupabase()
  let request = client
    .from('appointments')
    .select('id, client_id, artist_id, studio_id, membership_id, service_offering_id, availability_slot_id, starts_at, ends_at, status, booking_source, client_notes, created_at')
    .eq('studio_id', studioId)
    .eq('client_id', clientId)
    .order('starts_at', { ascending: upcomingOnly })
    .limit(limit)

  if (upcomingOnly) {
    request = request
      .gte('starts_at', new Date().toISOString())
      .in('status', ['scheduled', 'disputed'])
  }

  const { data, error } = await request

  if (error) throw error

  const appointments = data || []
  const serviceIds = [...new Set(appointments.map((appointment) => appointment.service_offering_id).filter(Boolean))]
  const artistIds = [...new Set(appointments.map((appointment) => appointment.artist_id).filter(Boolean))]
  const servicesById = new Map()
  const artistsById = new Map()

  if (serviceIds.length > 0) {
    const { data: services, error: servicesError } = await client
      .from('service_offerings')
      .select('id, name, duration_minutes')
      .in('id', serviceIds)

    if (servicesError) throw servicesError
    ;(services || []).forEach((service) => servicesById.set(service.id, service))
  }

  if (artistIds.length > 0) {
    const { data: artists, error: artistsError } = await client
      .from('artists')
      .select('id, display_name')
      .in('id', artistIds)

    if (artistsError) throw artistsError
    ;(artists || []).forEach((artist) => artistsById.set(artist.id, artist))
  }

  return appointments.map((appointment) => {
    const service = servicesById.get(appointment.service_offering_id)
    const artist = artistsById.get(appointment.artist_id)
    const startsAt = appointment.starts_at || ''
    const endsAt = appointment.ends_at || ''

    return normalizeAppointment({
      ...appointment,
      service: service?.name || 'Servicio',
      artist: artist?.display_name || 'Artista',
      date: startsAt.slice(0, 10),
      time: startsAt.slice(11, 16),
      end: endsAt.slice(11, 16),
      status: mapAppointmentStatus(appointment.status),
      appointmentStatus: appointment.status,
    })
  })
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
