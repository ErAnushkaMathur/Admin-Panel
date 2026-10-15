import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import { verifyToken, AUTH_COOKIE } from '../utils/jwt.js'
import { HttpError } from '../utils/httpError.js'
import { asyncHandler } from '../utils/asyncHandler.js'

function getToken(req) {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) return header.slice(7)
  return req.cookies?.[AUTH_COOKIE]
}

// Requires a valid JWT (Bearer header or httpOnly cookie). Sets req.user = { id, businessId, role }.
export const requireAuth = asyncHandler(async (req, res, next) => {
  const token = getToken(req)
  if (!token) throw new HttpError(401, 'Not authenticated', 'NO_TOKEN')

  let payload
  try {
    payload = verifyToken(token)
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new HttpError(401, 'Session expired, please log in again', 'TOKEN_EXPIRED')
    }
    throw new HttpError(401, 'Invalid token', 'INVALID_TOKEN')
  }

  // Read businessId/role from the DB, not the token, so role changes and removed users take effect immediately
  const user = await User.findById(payload.sub).select('businessId role passwordChangedAt').lean()
  if (!user) throw new HttpError(401, 'User no longer exists', 'INVALID_TOKEN')
  // Signed before the last password change (JWT iat is in whole seconds)
  if (user.passwordChangedAt && payload.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
    throw new HttpError(401, 'Your password was changed, please log in again', 'TOKEN_EXPIRED')
  }

  req.user = { id: user._id.toString(), businessId: user.businessId.toString(), role: user.role }
  next()
})

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) return next(new HttpError(403, 'Forbidden'))
  next()
}
