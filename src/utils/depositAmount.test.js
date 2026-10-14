import assert from 'node:assert/strict'
import { test } from 'node:test'
import { depositAmount } from './depositAmount.js'

test('calculates a percentage deposit with currency rounding', () => {
  assert.equal(depositAmount(650, { kind: 'percent', value: 30 }), 195)
  assert.equal(depositAmount(99.99, { kind: 'percent', value: 30 }), 30)
})

test('never asks for more than the payable total', () => {
  assert.equal(depositAmount(100, { kind: 'fixed', value: 150 }), 100)
  assert.equal(depositAmount(0, { kind: 'percent', value: 30 }), 0)
})
