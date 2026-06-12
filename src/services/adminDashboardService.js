import { requireSupabase } from '../lib/supabaseClient'

const EMPTY_DASHBOARD = {
  source: 'supabase',
  studios: [],
  artists: [],
  clients: [],
  appointments: [],
  users: [],
  systemStatus: [],
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function normalizeStudio(studio = {}) {
  const profile = studio.profile || {}

  return {
    ...studio,
    studioStatus: studio.studioStatus || studio.studio_status || 'pending',
    riskScore: normalizeNumber(studio.riskScore ?? studio.risk_score),
    totalArtists: normalizeNumber(studio.totalArtists),
    totalClients: normalizeNumber(studio.totalClients),
    revenue: normalizeNumber(studio.revenue),
    city: studio.city || profile.city || '',
    profile: {
      ...profile,
      commercialName: profile.commercialName || profile.commercial_name || studio.name || 'Studio',
      addressLine: profile.addressLine || profile.address_line || '',
      galleryPaths: asArray(profile.galleryPaths),
    },
  }
}

function normalizeArtist(artist = {}) {
  return {
    ...artist,
    name: artist.name || 'Artista',
    owner: artist.owner || artist.name || 'Artista',
    city: artist.city || '',
    plan: artist.plan || 'Artist',
    status: artist.status || 'Inactivo',
    studioStatus: artist.studioStatus || 'independent',
    studioId: artist.studioId || null,
    membershipId: artist.membershipId || null,
    services: artist.services || '',
    revenue: normalizeNumber(artist.revenue),
  }
}

function normalizeClient(client = {}) {
  return {
    ...client,
    name: client.name || 'Clienta',
    status: client.status || 'Inactivo',
    studioId: client.studioId || null,
    flowPoints: normalizeNumber(client.flowPoints),
    spend: normalizeNumber(client.spend),
    appointments: normalizeNumber(client.appointments),
  }
}

function normalizeAppointment(appointment = {}) {
  return {
    ...appointment,
    type: appointment.type || 'appointment',
    client: appointment.client || 'Clienta',
    artist: appointment.artist || 'Artista',
    service: appointment.service || 'Servicio',
    time: appointment.time || '',
    status: appointment.status || 'Confirmada',
    grossAmount: normalizeNumber(appointment.grossAmount),
    platformFee: normalizeNumber(appointment.platformFee),
    artistRevenue: normalizeNumber(appointment.artistRevenue),
    pointsGranted: normalizeNumber(appointment.pointsGranted),
    riskScore: appointment.riskScore || 'low',
  }
}

function normalizeUser(user = {}) {
  return {
    ...user,
    name: user.name || user.email || 'Usuario',
    role: user.role || 'client',
    status: user.status || 'Activo',
    studioId: user.studioId || null,
  }
}

export function mapAdminDashboardPayload(data) {
  if (!data || typeof data !== 'object') return EMPTY_DASHBOARD

  return {
    source: 'supabase',
    studios: asArray(data.studios).map(normalizeStudio),
    artists: asArray(data.artists).map(normalizeArtist),
    clients: asArray(data.clients).map(normalizeClient),
    appointments: asArray(data.appointments).map(normalizeAppointment),
    users: asArray(data.users).map(normalizeUser),
    systemStatus: asArray(data.system_status || data.systemStatus),
  }
}

export async function fetchAdminDashboardSummary(params = {}) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_admin_get_dashboard_summary', {
    p_scope_studio_id: params.scopeStudioId || null,
    p_date_from: params.dateFrom || null,
    p_date_to: params.dateTo || null,
  })

  if (error) throw error

  return mapAdminDashboardPayload(data)
}
