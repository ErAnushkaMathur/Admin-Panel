import mongoose from 'mongoose'
import { tenantPlugin } from './plugins/tenant.js'

// Append-only record of sensitive changes (salary edits, manual attendance edits, ...)
const auditLogSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true }, // e.g. "employee.salary_update"
    entity: { type: String, required: true }, // model name, e.g. "Employee"
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
    before: { type: mongoose.Schema.Types.Mixed },
    after: { type: mongoose.Schema.Types.Mixed },
    reason: { type: String, trim: true, maxlength: 500 },
    at: { type: Date, default: Date.now, immutable: true },
  },
  { versionKey: false },
)

auditLogSchema.plugin(tenantPlugin)
auditLogSchema.index({ businessId: 1, entity: 1, entityId: 1, at: -1 })
// Audit Log page: newest first, optionally by action
auditLogSchema.index({ businessId: 1, at: -1 })
auditLogSchema.index({ businessId: 1, action: 1, at: -1 })

export default mongoose.model('AuditLog', auditLogSchema)
