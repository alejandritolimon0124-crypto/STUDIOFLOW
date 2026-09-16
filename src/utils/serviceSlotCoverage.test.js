import assert from 'node:assert/strict'
import { test } from 'node:test'
import { serviceSlotCoverage } from './serviceSlotCoverage.js'

const base = Date.parse('2030-01-01T10:00:00Z')
const slot = (start, end, extra = {}) => ({
  id: String(start), status: 'available', scheduleId: 's', artistId: 'a',
  membershipId: 'm', studioId: 'studio',
  startsAt: new Date(base + start * 60000).toISOString(),
  endsAt: new Date(base + end * 60000).toISOString(), ...extra,
})
const find = (slots, duration) => serviceSlotCoverage(slots, duration, base - 1).map((item) => item.id)

test('continuous blocks cover the complete service, including exact end', () => {
  assert.deepEqual(find([slot(30, 60), slot(0, 30)], 60), ['0'])
})
test('a break or unavailable block cannot bridge the service', () => {
  assert.deepEqual(find([slot(0, 30), slot(45, 60)], 60), [])
  assert.deepEqual(find([slot(0, 30), slot(30, 60, { status: 'booked' })], 60), [])
})
test('different workspace or schedule cannot complete coverage', () => {
  for (const key of ['scheduleId', 'artistId', 'membershipId', 'studioId']) {
    assert.deepEqual(find([slot(0, 30), slot(30, 60, { [key]: 'other' })], 60), [])
  }
})
test('past slots and invalid duration are excluded', () => {
  assert.deepEqual(serviceSlotCoverage([slot(0, 60)], 60, base), [])
  for (const duration of [0, -1, undefined, NaN]) assert.deepEqual(find([slot(0, 60)], duration), [])
})
