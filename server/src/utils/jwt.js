import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'

export const AUTH_COOKIE = 'token'

export function signToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), businessId: user.businessId.toString(), role: user.role },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn },
  )
}

export function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret)
}

export function authCookieOptions() {
  return {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: env.nodeEnv === 'production' ? 'none' : 'lax',
    maxAge: env.jwtCookieMaxAgeMs,
  }
}
