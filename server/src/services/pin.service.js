import { randomInt } from 'node:crypto'
import bcrypt from 'bcryptjs'

const PIN_SALT_ROUNDS = 10

// Easy-to-guess PINs we never hand out: 0000, 1111, …, 1234, 4321, 0123, 9876, …
export function isWeakPin(pin) {
  if (/^(\d)\1{3}$/.test(pin)) return true
  const digits = [...pin].map(Number)
  const steps = digits.slice(1).map((d, i) => d - digits[i])
  return steps.every((s) => s === 1) || steps.every((s) => s === -1)
}

// Cryptographically random 4-digit PIN (as a string, may start with 0)
export function generatePin(random = randomInt) {
  let pin
  do {
    pin = String(random(0, 10000)).padStart(4, '0')
  } while (isWeakPin(pin))
  return pin
}

export function hashPin(pin) {
  return bcrypt.hash(pin, PIN_SALT_ROUNDS)
}

export function verifyPin(pin, pinHash) {
  return bcrypt.compare(pin, pinHash)
}
