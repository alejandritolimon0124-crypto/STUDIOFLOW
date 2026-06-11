import { requireSupabase } from '../lib/supabaseClient'

const STATUS_TO_DB = {
  Activo: 'active',
  Suspendido: 'suspended',
  Borrador: 'draft',
}

const STATUS_FROM_DB = {
  active: 'Activo',
  suspended: 'Suspendido',
  draft: 'Borrador',
  archived: 'Archivado',
}

function parseDurationMinutes(duration) {
  const minutes = Number.parseInt(String(duration || ''), 10)
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 60
}

function formatDuration(minutes) {
  return `${Number(minutes) || 60} min`
}

function isDatabaseId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''))
}

function normalizeTierCode(value) {
  const tier = String(value || 'basic').toLowerCase()
  return ['basic', 'medium', 'premium', 'vip'].includes(tier) ? tier : 'basic'
}

function mapServiceOffering(row, catalogs = {}) {
  const category = catalogs.categories?.[row.category_id]
  const tier = catalogs.tiers?.[row.tier_id]

  return {
    id: row.id,
    category: category?.name || row.category || 'Servicios',
    name: row.name,
    price: Number(row.price_amount ?? row.price) || 0,
    duration: row.duration || formatDuration(row.duration_minutes),
    bookings: row.bookings || 0,
    demand: row.demand || 'Nueva',
    status: STATUS_FROM_DB[row.status] || row.status || 'Borrador',
    serviceTier: tier?.code || row.serviceTier || row.service_tier || 'basic',
  }
}

export async function fetchArtistServices({ artistId }) {
  if (!artistId) return []

  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_artist_get_service_offerings', {
    p_artist_id: artistId,
    p_include_archived: false,
  })

  if (error) throw error

  return (data?.services || []).map((row) => mapServiceOffering(row))
}

export async function saveArtistServiceOffering({ artistId, service }) {
  if (!artistId) throw new Error('Artist id requerido para guardar servicios.')

  const client = requireSupabase()
  const payload = {
    category: service.category,
    tier_code: normalizeTierCode(service.serviceTier),
    name: String(service.name || '').trim(),
    price_amount: Number(service.price) || 0,
    duration_minutes: parseDurationMinutes(service.duration),
    status: STATUS_TO_DB[service.status] || 'active',
  }

  if (!payload.name) throw new Error('Nombre de servicio requerido.')

  const { data, error } = service.id && isDatabaseId(service.id)
    ? await client.rpc('studio_flow_artist_update_service_offering', {
        p_service_offering_id: service.id,
        p_patch: payload,
      })
    : await client.rpc('studio_flow_artist_create_service_offering', {
        p_artist_id: artistId,
        p_service: payload,
      })
  if (error) throw error

  return mapServiceOffering(data?.service)
}

export async function updateArtistServiceOfferingStatus({ serviceId, status }) {
  if (!isDatabaseId(serviceId)) throw new Error('Service id invalido para actualizar estado.')

  const client = requireSupabase()
  const dbStatus = STATUS_TO_DB[status] || 'active'
  const rpcName = dbStatus === 'suspended'
    ? 'studio_flow_artist_suspend_service_offering'
    : 'studio_flow_artist_activate_service_offering'
  const params = dbStatus === 'suspended'
    ? { p_service_offering_id: serviceId, p_reason: null }
    : { p_service_offering_id: serviceId }
  const { data, error } = await client.rpc(rpcName, params)

  if (error) throw error

  return mapServiceOffering(data?.service)
}

export async function archiveArtistServiceOffering({ serviceId }) {
  if (!isDatabaseId(serviceId)) throw new Error('Service id invalido para archivar.')

  const client = requireSupabase()
  const { error } = await client.rpc('studio_flow_artist_archive_service_offering', {
    p_service_offering_id: serviceId,
    p_reason: null,
  })

  if (error) throw error
}
