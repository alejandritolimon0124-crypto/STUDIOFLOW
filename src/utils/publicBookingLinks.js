import { sharePreviewUrl } from './sharePreviewUrl'

export const bookingSlug = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

export function publicBookingUrl(listing, source = 'google', service = null) {
  const base = `${import.meta.env.VITE_PUBLIC_APP_URL || 'https://studioflow.vip'}/reservar/${bookingSlug(listing.title || listing.name)}`
  const servicePath = service ? `/${bookingSlug(service.name)}` : ''
  const params = new URLSearchParams({ origen: source })
  const listingId = listing.listingId || listing.id
  if (listingId) params.set('perfil', listingId)
  return sharePreviewUrl(`${base}${servicePath}?${params}`)
}
