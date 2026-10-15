import mongoose from 'mongoose'
import AuditLog from '../models/AuditLog.js'
import { AUDIT_ACTIONS } from './auditLog.service.js'

// Runs `fn(session)` in a MongoDB transaction: the change and its audit entry commit together or not at all
export async function inTransaction(fn) {
  const session = await mongoose.startSession()
  try {
    let result
    await session.withTransaction(async () => {
      result = await fn(session)
    })
    return result
  } finally {
    await session.endSession()
  }
}

/**
 * Writes audit entries inside the caller's transaction. Refuses actions missing from AUDIT_ACTIONS
 * (golden rule 9), so an unregistered action fails loudly in tests instead of showing up unlabelled.
 * Never put secrets (PINs, hashes, tokens) in `before`/`after`.
 */
export async function recordAudit(session, entries) {
  const list = (Array.isArray(entries) ? entries : [entries]).filter(Boolean)
  for (const e of list) {
    if (!AUDIT_ACTIONS[e.action]) throw new Error(`Audit action "${e.action}" is not registered in AUDIT_ACTIONS`)
  }
  if (list.length) await AuditLog.create(list, { session, ordered: true })
}
