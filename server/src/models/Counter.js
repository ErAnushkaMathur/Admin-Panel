import mongoose from 'mongoose'
import { tenantPlugin } from './plugins/tenant.js'

// Per-business sequence numbers (e.g. employee codes), incremented atomically
const counterSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { versionKey: false },
)

counterSchema.plugin(tenantPlugin)
counterSchema.index({ businessId: 1, key: 1 }, { unique: true })

export default mongoose.model('Counter', counterSchema)
