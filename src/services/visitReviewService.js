import { requireSupabase } from '../lib/supabaseClient'

export const reviewHighlights = [
  'Excelente servicio',
  'Volvería sin pensarlo',
  'Instalaciones muy bonitas y cómodas',
  'Trato excepcional',
  'Trabajo de belleza increíble',
  'La mejor calidad que pude encontrar',
]

export async function fetchMyVisitReviews() {
  const { data, error } = await requireSupabase().rpc('studio_flow_get_my_visit_reviews')
  if (error) throw error
  return data || []
}

export async function saveVisitReview({ appointmentId, rating, highlights, body }) {
  const { data, error } = await requireSupabase().rpc('studio_flow_save_visit_review', {
    p_appointment_id: appointmentId,
    p_rating: rating,
    p_highlights: highlights,
    p_body: body,
  })
  if (error) throw error
  return data
}

export async function fetchVisitReviews({ artistId = null, studioId = null, membershipId = null, offset = 0 }) {
  const { data, error } = await requireSupabase().rpc('studio_flow_get_context_visit_reviews', {
    p_artist_id: artistId,
    p_studio_id: studioId,
    p_membership_id: membershipId,
    p_offset: offset,
  })
  if (error) throw error
  return data || { count: 0, average: 0, reviews: [] }
}
