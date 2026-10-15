import test from 'node:test'
import assert from 'node:assert/strict'
import { canClientChangeAppointment, CHANGE_NOTICE_OPTIONS } from './appointmentChangeNotice.js'

const appointment = {
  appointmentStatus: 'scheduled',
  startsAt: '2026-10-15T18:00:00Z',
  clientChangeNoticeHours: 4,
}

test('change notice offers only the configured choices', () => {
  assert.deepEqual(CHANGE_NOTICE_OPTIONS, [2, 4, 6, 12, 24])
})

test('client changes close after the selected lead time', () => {
  assert.equal(canClientChangeAppointment(appointment, new Date('2026-10-15T14:00:00Z')), true)
  assert.equal(canClientChangeAppointment(appointment, new Date('2026-10-15T14:00:01Z')), false)
  assert.equal(canClientChangeAppointment({ ...appointment, appointmentStatus: 'cancelled' }, new Date('2026-10-15T13:00:00Z')), false)
})
