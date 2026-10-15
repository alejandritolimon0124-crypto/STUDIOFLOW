import test from 'node:test'
import assert from 'node:assert/strict'
import { canCheckInAppointment, formatAppointmentArrival } from './appointmentArrival.js'

const startsAt = '2026-10-15T16:00:00Z'
const endsAt = '2026-10-15T17:00:00Z'
const appointment = { id: 'appointment-1', appointmentStatus: 'scheduled', startsAt, endsAt }

test('check-in opens 90 minutes before the appointment and closes 30 minutes after it ends', () => {
  assert.equal(canCheckInAppointment(appointment, new Date('2026-10-15T14:29:59Z')), false)
  assert.equal(canCheckInAppointment(appointment, new Date('2026-10-15T14:30:00Z')), true)
  assert.equal(canCheckInAppointment(appointment, new Date('2026-10-15T17:30:00Z')), true)
  assert.equal(canCheckInAppointment(appointment, new Date('2026-10-15T17:30:01Z')), false)
})

test('check-in is not offered after arrival or for a closed appointment', () => {
  const now = new Date('2026-10-15T16:00:00Z')
  assert.equal(canCheckInAppointment({ ...appointment, arrivedAt: startsAt }, now), false)
  assert.equal(canCheckInAppointment({ ...appointment, appointmentStatus: 'completed' }, now), false)
})

test('arrival time is displayed in the studio timezone', () => {
  assert.match(formatAppointmentArrival(startsAt), /10:00/)
})
