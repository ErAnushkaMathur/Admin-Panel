import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import Business from '../models/Business.js'
import User from '../models/User.js'
import { HttpError } from '../utils/httpError.js'
import { signToken, AUTH_COOKIE, authCookieOptions } from '../utils/jwt.js'
import { now as serverNow } from '../utils/clock.js'
import { inTransaction, recordAudit } from '../services/auditTrail.service.js'

const SALT_ROUNDS = 12

function sendAuth(res, status, user, business) {
  const token = signToken(user)
  res.cookie(AUTH_COOKIE, token, authCookieOptions())
  res.status(status).json({ token, user, business })
}

export async function register(req, res) {
  const { businessName, name, email, password } = req.body

  if (await User.exists({ email })) throw new HttpError(409, 'Email is already registered')

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
  const userId = new mongoose.Types.ObjectId()
  const businessId = new mongoose.Types.ObjectId()

  // Business and owner reference each other; create both or neither.
  let user, business
  const session = await mongoose.startSession()
  try {
    await session.withTransaction(async () => {
      ;[business] = await Business.create([{ _id: businessId, name: businessName, ownerId: userId }], { session })
      ;[user] = await User.create([{ _id: userId, businessId, name, email, passwordHash, role: 'owner' }], { session })
    })
  } finally {
    await session.endSession()
  }

  sendAuth(res, 201, user, business)
}

export async function login(req, res) {
  const { email, password } = req.body

  const user = await User.findOne({ email }).select('+passwordHash')
  // Same message for unknown email and wrong password
  const ok = user && (await bcrypt.compare(password, user.passwordHash))
  if (!ok) throw new HttpError(401, 'Invalid email or password')

  const business = await Business.findById(user.businessId)
  sendAuth(res, 200, user, business)
}


// httpOnly cookie can't be removed by the browser's JS, so the server clears it
export function logout(req, res) {
  const { maxAge, ...options } = authCookieOptions()
  res.clearCookie(AUTH_COOKIE, options)
  res.status(204).end()
}

export async function me(req, res) {
  const [user, business] = await Promise.all([
    User.findOne({ _id: req.user.id, businessId: req.user.businessId }),
    Business.findById(req.user.businessId),
  ])
  if (!user || !business) throw new HttpError(401, 'User no longer exists')
  res.json({ user, business })
}

// POST /auth/change-password: signs out every other session (tokens issued before now are rejected)
export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body
  const user = await User.findOne({ _id: req.user.id, businessId: req.user.businessId }).select('+passwordHash')
  if (!user) throw new HttpError(401, 'User no longer exists')
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new HttpError(400, 'Validation failed', undefined, [{ field: 'currentPassword', message: 'Current password is wrong' }])
  }

  user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS)
  user.passwordChangedAt = serverNow()
  await inTransaction(async (session) => {
    await user.save({ session })
    // Logged without any password or hash
    await recordAudit(session, {
      businessId: user.businessId,
      actorId: user._id,
      action: 'account.password_change',
      entity: 'User',
      entityId: user._id,
      before: null,
      after: null,
    })
  })
  // Keep this session signed in with a fresh token
  const token = signToken(user)
  res.cookie(AUTH_COOKIE, token, authCookieOptions())
  res.json({ token })
}