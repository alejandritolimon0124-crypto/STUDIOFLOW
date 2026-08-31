import { requireSupabase } from '../lib/supabaseClient'

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeReward(reward = {}) {
  return {
    id: reward.id,
    name: reward.name || 'Beneficio Flow Points',
    discountPercent: Number(reward.discountPercent || reward.discount_percent || reward.metadata?.discountPercent || 0),
    pointsCost: Number(reward.pointsCost || reward.points_cost || 0),
    status: reward.status || 'active',
  }
}

function normalizePromotion(promotion = {}) {
  return {
    id: promotion.id || null,
    type: promotion.type || promotion.promotionType || promotion.promotion_type || '',
    name: promotion.name || '',
    status: promotion.status || 'paused',
    rules: promotion.rules || {},
  }
}

function normalizeMarketingPayload(data = {}) {
  return {
    rewards: asArray(data.rewards).map(normalizeReward),
    flowPointsEnabled: Boolean(data.flowPointsEnabled ?? data.flow_points_enabled),
    doublePoints: normalizePromotion(data.doublePoints || data.double_points),
    happyHour: normalizePromotion(data.happyHour || data.happy_hour),
  }
}

export async function setArtistFlowPointsEnabled({ active } = {}) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_artist_set_flow_points_enabled', {
    p_active: Boolean(active),
  })

  if (error) throw error

  return normalizeMarketingPayload(data)
}

export async function fetchArtistMarketingSettings() {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_artist_get_marketing_settings')

  if (error) throw error

  return normalizeMarketingPayload(data)
}

export async function saveArtistFlowPointReward({ discountPercent, pointsCost } = {}) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_artist_save_flow_point_reward', {
    p_discount_percent: Number(discountPercent) || 0,
    p_points_cost: Number(pointsCost) || 0,
  })

  if (error) throw error

  return normalizeReward(data?.reward)
}

export async function setArtistDoublePointsPromotion({ active } = {}) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_artist_set_double_points_promotion', {
    p_active: Boolean(active),
  })

  if (error) throw error

  return normalizePromotion(data?.promotion)
}

export async function saveArtistHappyHourPromotion({ active, discountPercent, weekdays, startTime, endTime } = {}) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_artist_save_happy_hour_promotion', {
    p_active: Boolean(active),
    p_discount_percent: Number(discountPercent) || 0,
    p_weekdays: weekdays,
    p_start_time: startTime,
    p_end_time: endTime,
  })

  if (error) throw error

  return normalizePromotion(data?.promotion)
}
