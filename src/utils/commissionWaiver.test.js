import assert from 'node:assert/strict'
import test from 'node:test'
import { isCommissionWaived } from './commissionWaiver.js'
import { calculatePlatformFee } from '../modules/business/appointmentEconomyEngine.js'

test('October through December 2026 appointments are commission-free', () => {
  assert.equal(isCommissionWaived('2026-09-30'), false)
  assert.equal(isCommissionWaived('2026-10-01'), true)
  assert.equal(isCommissionWaived('2026-12-31 23:59'), true)
  assert.equal(isCommissionWaived('2027-01-01'), false)
  assert.equal(calculatePlatformFee(500, '2026-12-31'), 0)
  assert.equal(calculatePlatformFee(500, '2027-01-01'), 50)
})

test('timestamp boundaries use Mexico City time', () => {
  assert.equal(isCommissionWaived('2027-01-01T05:59:59Z'), true)
  assert.equal(isCommissionWaived('2027-01-01T06:00:00Z'), false)
})
