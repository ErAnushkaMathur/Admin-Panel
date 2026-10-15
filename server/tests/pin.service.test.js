import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generatePin, hashPin, verifyPin, isWeakPin } from '../src/services/pin.service.js'
import { formatEmployeeCode } from '../src/services/employeeCode.service.js'
import { normalizeIndianPhone } from '../src/utils/phone.js'

test('isWeakPin flags repeats and straight sequences', () => {
  for (const pin of ['0000', '1111', '1234', '4321', '0123', '6789', '9876']) assert.equal(isWeakPin(pin), true, pin)
  for (const pin of ['0583', '1235', '2468', '9075', '1122']) assert.equal(isWeakPin(pin), false, pin)
})

test('generatePin returns 4 digits, keeps leading zeros, skips weak PINs', () => {
  for (let i = 0; i < 200; i++) {
    const pin = generatePin()
    assert.match(pin, /^\d{4}$/)
    assert.equal(isWeakPin(pin), false)
  }
  // Weak values from the RNG are retried
  const values = [1111, 1234, 42]
  assert.equal(generatePin(() => values.shift()), '0042')
})

test('hashPin/verifyPin round-trip and never store the PIN', async () => {
  const hash = await hashPin('0583')
  assert.notEqual(hash, '0583')
  assert.ok(!hash.includes('0583'))
  assert.equal(await verifyPin('0583', hash), true)
  assert.equal(await verifyPin('0584', hash), false)
})

test('formatEmployeeCode starts at 101', () => {
  assert.equal(formatEmployeeCode(1), '101')
  assert.equal(formatEmployeeCode(2), '102')
  assert.equal(formatEmployeeCode(900), '1000')
})

test('normalizeIndianPhone', () => {
  assert.equal(normalizeIndianPhone('+91 98765 43210'), '9876543210')
  assert.equal(normalizeIndianPhone('919876543210'), '9876543210')
  assert.equal(normalizeIndianPhone('098765-43210'), '9876543210')
  assert.equal(normalizeIndianPhone('98765 43210'), '9876543210')
  assert.equal(normalizeIndianPhone('12345'), '12345')
})
