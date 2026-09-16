import assert from 'node:assert/strict'
import { test } from 'node:test'
import { summarizeDay } from './daySummary.js'

const date = '2026-09-16'
const settings = {
  schedule: [{ weekday: 3, active: true, start: '10:00', end: '14:00', blocks: [{ start: '12:00', end: '13:00' }] }],
  blockedDates: [],
}
test('cancelled events do not count as income or occupied time', () => {
  const result = summarizeDay([
    { appointmentStatus: 'completed', time: '10:00', duration: '60 min', paymentDetails: { total: 800 } },
    { appointmentStatus: 'scheduled', time: '11:00', duration: '60 min' },
    { appointmentStatus: 'cancelled', time: '13:00', duration: '60 min', paymentDetails: { total: 1000 } },
  ], settings, date)
  assert.deepEqual(result, { completed: 1, cancelled: 1, pending: 1, occupancy: 67, income: 800 })
})
test('overlapping appointments do not double count occupied minutes', () => {
  const result = summarizeDay([
    { status: 'scheduled', time: '10:00', duration: '120 min' },
    { status: 'scheduled', time: '11:00', duration: '120 min' },
  ], settings, date)
  assert.equal(result.occupancy, 67)
})
test('missing completed payment is unknown, not zero income', () => {
  assert.equal(summarizeDay([{ status: 'completed' }], settings, date).income, null)
})
test('blocked and disabled workdays have no occupancy percentage', () => {
  assert.equal(summarizeDay([], { ...settings, blockedDates: [{ date }] }, date).occupancy, null)
  assert.equal(summarizeDay([], { schedule: [{ ...settings.schedule[0], active: false }] }, date).occupancy, null)
})
