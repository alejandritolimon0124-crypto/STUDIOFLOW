import { requireSupabase } from '../lib/supabaseClient'

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function formatCurrency(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return '$0'
  return `$${Math.round(number).toLocaleString('es-MX')}`
}

function mapHistoryItem(item = {}) {
  return {
    id: item.id,
    artist: item.artist || 'Artista',
    date: item.date || '',
    service: item.service || 'Servicio',
    status: item.status || 'Programada',
    studioId: item.studioId || null,
  }
}

export function mapAdminClientsPayload(data) {
  return asArray(data?.clients).map((client) => ({
    id: client.id,
    profileId: client.profile_id || client.profileId || null,
    studioId: client.studioId || null,
    studioName: client.studioName || '',
    name: client.name || 'Clienta',
    email: client.email || '',
    phone: client.phone || '',
    status: client.status || 'Inactivo',
    dbStatus: client.db_status || client.dbStatus || null,
    segment: client.segment || 'Essential',
    appointments: Number(client.appointments) || 0,
    spendAmount: Number(client.spend_amount ?? client.spendAmount ?? client.spend) || 0,
    spend: typeof client.spend === 'string' ? client.spend : formatCurrency(client.spend_amount ?? client.spendAmount ?? client.spend),
    flowPoints: Number(client.flowPoints) || 0,
    lastAppointmentAt: client.lastAppointmentAt || client.lastAppointment || null,
    notes: client.notes || '',
    history: asArray(client.history).map(mapHistoryItem),
  }))
}

function firstClientFromPayload(data) {
  return mapAdminClientsPayload(data)[0] || null
}

export async function fetchAdminClients() {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_admin_get_clients')

  if (error) throw error

  return mapAdminClientsPayload(data)
}

export async function activateAdminClient(clientId) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_admin_activate_client', {
    p_client_id: clientId,
  })

  if (error) throw error

  return firstClientFromPayload(data)
}

export async function deactivateAdminClient(clientId) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_admin_deactivate_client', {
    p_client_id: clientId,
  })

  if (error) throw error

  return firstClientFromPayload(data)
}

export async function updateAdminClientProfile(clientId, patch) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_admin_update_client_profile', {
    p_client_id: clientId,
    p_patch: patch || {},
  })

  if (error) throw error

  return firstClientFromPayload(data)
}
