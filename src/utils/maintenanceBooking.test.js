import test from 'node:test'
import assert from 'node:assert/strict'
import { findMaintenanceListing, maintenanceBookingUrl } from './maintenanceBooking.js'

test('builds a booking link for the maintenance service', () => {
  assert.equal(maintenanceBookingUrl({ service_offering_id: 'svc-1', studio_id: 'studio-1' }), '/client/search?service=svc-1&studio=studio-1')
  assert.equal(maintenanceBookingUrl({}), '/client/search')
})

test('selects only a listing that offers the notice service', () => {
  const listings = [
    { artistId: 'a-1', studioId: 's-1', marketplaceServiceOptions: [{ id: 'other' }] },
    { artistId: 'a-1', studioId: 's-1', marketplaceServiceOptions: [{ id: 'svc-1' }] },
  ]
  assert.equal(findMaintenanceListing(listings, { artistId: 'a-1', studioId: 's-1', serviceId: 'svc-1' }), listings[1])
  assert.equal(findMaintenanceListing(listings, { artistId: 'a-2', studioId: 's-1', serviceId: 'svc-1' }), null)
})
