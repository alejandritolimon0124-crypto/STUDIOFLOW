import test from 'node:test'
import assert from 'node:assert/strict'
import { getHappyHourMinutes, getServicesLongerThanHappyHour } from './happyHourDuration.js'

test('calculates the promotional window in minutes', () => {
  assert.equal(getHappyHourMinutes('14:00', '15:30'), 90)
  assert.equal(getHappyHourMinutes('15:30', '14:00'), 0)
})

test('warns only for services longer than the window', () => {
  const services = [
    { name: 'Extensiones', duration: '120 min', status: 'Activo' },
    { name: 'Retoque', durationMinutes: 60, status: 'active' },
    { name: 'Archivado', durationMinutes: 180, status: 'archived' },
  ]
  assert.deepEqual(getServicesLongerThanHappyHour(services, '14:00', '15:00').map((service) => service.name), ['Extensiones'])
})
