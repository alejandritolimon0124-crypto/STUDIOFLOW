export function maintenanceBookingUrl(notice) {
  const params = new URLSearchParams()
  if (notice?.service_offering_id) params.set('service', notice.service_offering_id)
  if (notice?.artist_id) params.set('artist', notice.artist_id)
  if (notice?.studio_id) params.set('studio', notice.studio_id)
  return `/client/search${params.size ? `?${params}` : ''}`
}

export function findMaintenanceListing(listings, { serviceId, artistId, studioId }) {
  if (!serviceId || (!artistId && !studioId)) return null
  return listings.find((listing) => (
    (!artistId || listing.artistId === artistId)
    && (!studioId || listing.studioId === studioId)
    && listing.marketplaceServiceOptions?.some((service) => service.id === serviceId)
  )) || null
}
