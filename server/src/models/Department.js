import mongoose from 'mongoose'
import { tenantPlugin } from './plugins/tenant.js'

// Keep in sync with client/src/utils/departmentIcons.js
export const DEPARTMENT_ICONS = ['chef-hat', 'store', 'sparkles', 'bike', 'package', 'cake-slice', 'coffee', 'users']

const departmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    color: { type: String, required: true, match: /^#[0-9a-f]{6}$/i },
    icon: { type: String, enum: DEPARTMENT_ICONS, default: 'users' },
    // Archive = soft delete
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.__v
        return ret
      },
    },
  },
)

departmentSchema.plugin(tenantPlugin)
// Name unique per business, case-insensitive
departmentSchema.index({ businessId: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } })

export default mongoose.model('Department', departmentSchema)
