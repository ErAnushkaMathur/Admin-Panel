import { randomBytes } from 'node:crypto'

// Unguessable, URL-safe token for the public punch link (/punch/:businessToken)
export function generatePunchToken() {
  return randomBytes(16).toString('base64url')
}
