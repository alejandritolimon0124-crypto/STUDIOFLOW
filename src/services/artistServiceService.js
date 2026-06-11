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

const DEFAULT_TIER_LABELS = {
  basic: 'Basic',
  medium: 'Medium',
  premium: 'Premium',
  vip: 'VIP',
}

const DEFAULT_TIER_POINTS = {
  basic: 10,
  medium: 18,
  premium: 28,
  vip: 40,
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
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
    price: Number(row.price_amount) || 0,
    duration: formatDuration(row.duration_minutes),
    bookings: row.bookings || 0,
    demand: row.demand || 'Nueva',
    status: STATUS_FROM_DB[row.status] || 'Borrador',
    serviceTier: tier?.code || 'basic',
  }
}

async function fetchCatalogMaps(client, rows = []) {
  const categoryIds = [...new Set(rows.map((row) => row.category_id).filter(Boolean))]
  const tierIds = [...new Set(rows.map((row) => row.tier_id).filter(Boolean))]
  const catalogs = { categories: {}, tiers: {} }

  if (categoryIds.length) {
    const { data, error } = await client
      .from('service_categories')
      .select('id,name,slug,status')
      .in('id', categoryIds)

    if (error) throw error
    catalogs.categories = Object.fromEntries((data || []).map((category) => [category.id, category]))
  }

  if (tierIds.length) {
    const { data, error } = await client
      .from('service_tiers')
      .select('id,code,label,default_points,status')
      .in('id', tierIds)

    if (error) throw error
    catalogs.tiers = Object.fromEntries((data || []).map((tier) => [tier.id, tier]))
  }

  return catalogs
}

export async function fetchArtistServices({ artistId }) {
  if (!artistId) return []

  const client = requireSupabase()
  const { data, error } = await client
    .from('service_offerings')
    .select('*')
    .eq('owner_type', 'artist')
    .eq('artist_id', artistId)
    .neq('status', 'archived')
    .order('created_at', { ascending: false })

  if (error) throw error

  const rows = data || []
  const catalogs = await fetchCatalogMaps(client, rows)
  return rows.map((row) => mapServiceOffering(row, catalogs))
}

async function ensureServiceCategory(client, categoryName) {
  const name = String(categoryName || 'Servicios').trim() || 'Servicios'
  const slug = slugify(name) || 'servicios'
  const { data, error } = await client
    .from('service_categories')
    .upsert({ name, slug, status: 'active' }, { onConflict: 'slug' })
    .select('id,name,slug,status')
    .single()

  if (error) throw error
  return data
}

async function ensureServiceTier(client, tierCode) {
  const code = normalizeTierCode(tierCode)
  const { data, error } = await client
    .from('service_tiers')
    .upsert({
      code,
      label: DEFAULT_TIER_LABELS[code],
      default_points: DEFAULT_TIER_POINTS[code],
      status: 'active',
    }, { onConflict: 'code' })
    .select('id,code,label,default_points,status')
    .single()

  if (error) throw error
  return data
}

export async function saveArtistServiceOffering({ artistId, service }) {
  if (!artistId) throw new Error('Artist id requerido para guardar servicios.')

  const client = requireSupabase()
  const category = await ensureServiceCategory(client, service.category)
  const tier = await ensureServiceTier(client, service.serviceTier)
  const payload = {
    owner_type: 'artist',
    artist_id: artistId,
    studio_id: null,
    membership_id: null,
    category_id: category.id,
    tier_id: tier.id,
    name: String(service.name || '').trim(),
    price_amount: Number(service.price) || 0,
    duration_minutes: parseDurationMinutes(service.duration),
    status: STATUS_TO_DB[service.status] || 'active',
    updated_at: new Date().toISOString(),
  }

  if (!payload.name) throw new Error('Nombre de servicio requerido.')

  const request = service.id && isDatabaseId(service.id)
    ? client.from('service_offerings').update(payload).eq('id', service.id).select('*').single()
    : client.from('service_offerings').insert(payload).select('*').single()

  const { data, error } = await request
  if (error) throw error

  return mapServiceOffering(data, {
    categories: { [category.id]: category },
    tiers: { [tier.id]: tier },
  })
}

export async function updateArtistServiceOfferingStatus({ serviceId, status }) {
  if (!isDatabaseId(serviceId)) throw new Error('Service id invalido para actualizar estado.')

  const client = requireSupabase()
  const dbStatus = STATUS_TO_DB[status] || 'active'
  const { data, error } = await client
    .from('service_offerings')
    .update({
      status: dbStatus,
      archived_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', serviceId)
    .select('*')
    .single()

  if (error) throw error

  const catalogs = await fetchCatalogMaps(client, [data])
  return mapServiceOffering(data, catalogs)
}

export async function archiveArtistServiceOffering({ serviceId }) {
  if (!isDatabaseId(serviceId)) throw new Error('Service id invalido para archivar.')

  const client = requireSupabase()
  const { error } = await client
    .from('service_offerings')
    .update({
      status: 'archived',
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', serviceId)

  if (error) throw error
}
