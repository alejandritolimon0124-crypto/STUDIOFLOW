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
    flowPointRedemptionScope: data.flowPointRedemptionScope || data.flow_point_redemption_scope || 'exclusive',
    lowOccupancy: {
      active: Boolean(data.lowOccupancy?.active ?? data.low_occupancy?.active),
      period: data.lowOccupancy?.period || data.low_occupancy?.period || 'week',
      threshold: Number(data.lowOccupancy?.threshold || data.low_occupancy?.threshold || 40),
    },
    maintenanceReminderDays: Number(data.maintenanceReminderDays || data.maintenance_reminder_days || 14),
    doublePoints: normalizePromotion(data.doublePoints || data.double_points),
    happyHour: normalizePromotion(data.happyHour || data.happy_hour),
  }
}

function artistParams(artistId) {
  return artistId ? { p_artist_id: artistId } : {}
}

function studioParams(studioId) {
  return studioId ? { p_studio_id: studioId } : {}
}

export async function setArtistFlowPointsEnabled({ active, artistId } = {}) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_artist_set_flow_points_enabled', {
    p_active: Boolean(active),
    ...artistParams(artistId),
  })

  if (error) throw error

  return normalizeMarketingPayload(data)
}

export async function setArtistFlowPointRedemptionScope({ scope, artistId } = {}) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_artist_set_flow_points_redemption_scope', {
    p_scope: scope === 'open' ? 'open' : 'exclusive',
    ...artistParams(artistId),
  })

  if (error) throw error

  return normalizeMarketingPayload(data)
}

export async function fetchArtistMarketingSettings({ artistId } = {}) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_artist_get_marketing_settings', {
    ...artistParams(artistId),
  })

  if (error) throw error

  return normalizeMarketingPayload(data)
}

export async function saveArtistFlowPointReward({ discountPercent, pointsCost, artistId } = {}) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_artist_save_flow_point_reward', {
    p_discount_percent: Number(discountPercent) || 0,
    p_points_cost: Number(pointsCost) || 0,
    ...artistParams(artistId),
  })

  if (error) throw error

  return normalizeReward(data?.reward)
}

export async function deleteArtistFlowPointReward({ rewardId, artistId } = {}) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_artist_delete_flow_point_reward', {
    p_reward_id: rewardId,
    ...artistParams(artistId),
  })

  if (error) throw error

  return normalizeMarketingPayload(data)
}

export async function setArtistDoublePointsPromotion({ active, artistId } = {}) {
  const client = requireSupabase()
  const { error } = await client.rpc('studio_flow_artist_set_double_points_promotion', {
    p_active: Boolean(active),
    ...artistParams(artistId),
  })

  if (error) throw error

  return fetchArtistMarketingSettings({ artistId })
}

export async function saveArtistHappyHourPromotion({ active, discountPercent, weekdays, startTime, endTime, artistId } = {}) {
  const client = requireSupabase()
  const { error } = await client.rpc('studio_flow_artist_save_happy_hour_promotion', {
    p_active: Boolean(active),
    p_discount_percent: Number(discountPercent) || 0,
    p_weekdays: weekdays,
    p_start_time: startTime,
    p_end_time: endTime,
    ...artistParams(artistId),
  })

  if (error) throw error

  return fetchArtistMarketingSettings({ artistId })
}

export async function setArtistLowOccupancyAutomation({ active, period, threshold, artistId } = {}) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_artist_set_low_occupancy_automation', {
    p_active: Boolean(active),
    p_period: period || 'week',
    p_threshold: Number(threshold) || 40,
    ...artistParams(artistId),
  })

  if (error) throw error

  return normalizeMarketingPayload(data)
}

export async function sendArtistMarketingNotification({ type, maintenanceDays, artistId } = {}) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_artist_send_marketing_notification', {
    p_type: type,
    p_maintenance_days: Number(maintenanceDays) || 14,
    ...artistParams(artistId),
  })

  if (error) throw error

  return {
    insertedCount: Number(data?.insertedCount || data?.inserted_count || 0),
  }
}

export async function fetchStudioMarketingSettings({ studioId } = {}) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_studio_get_marketing_settings', {
    ...studioParams(studioId),
  })

  if (error) throw error

  return normalizeMarketingPayload(data)
}

export async function setStudioFlowPointsEnabled({ active, studioId } = {}) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_studio_set_flow_points_enabled', {
    p_active: Boolean(active),
    ...studioParams(studioId),
  })

  if (error) throw error

  return normalizeMarketingPayload(data)
}

export async function setStudioFlowPointRedemptionScope({ scope, studioId } = {}) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_studio_set_flow_points_redemption_scope', {
    p_scope: scope === 'open' ? 'open' : 'exclusive',
    ...studioParams(studioId),
  })

  if (error) throw error

  return normalizeMarketingPayload(data)
}

export async function saveStudioFlowPointReward({ discountPercent, pointsCost, studioId } = {}) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_studio_save_flow_point_reward', {
    p_discount_percent: Number(discountPercent) || 0,
    p_points_cost: Number(pointsCost) || 0,
    ...studioParams(studioId),
  })

  if (error) throw error

  return normalizeReward(data?.reward)
}

export async function deleteStudioFlowPointReward({ rewardId, studioId } = {}) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_studio_delete_flow_point_reward', {
    p_reward_id: rewardId,
    ...studioParams(studioId),
  })

  if (error) throw error

  return normalizeMarketingPayload(data)
}

export async function setStudioDoublePointsPromotion({ active, studioId } = {}) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_studio_set_double_points_promotion', {
    p_active: Boolean(active),
    ...studioParams(studioId),
  })

  if (error) throw error

  return normalizeMarketingPayload(data)
}

export async function saveStudioHappyHourPromotion({ active, discountPercent, weekdays, startTime, endTime, studioId } = {}) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('studio_flow_studio_save_happy_hour_promotion', {
    p_active: Boolean(active),
    p_discount_percent: Number(discountPercent) || 0,
    p_weekdays: weekdays,
    p_start_time: startTime,
    p_end_time: endTime,
    ...studioParams(studioId),
  })

  if (error) throw error

  return normalizeMarketingPayload(data)
}
