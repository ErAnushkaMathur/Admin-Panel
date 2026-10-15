import mongoose from 'mongoose'

export const USER_ROLES = ['owner', 'manager']

const userSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Never selected by default; request explicitly with .select('+passwordHash')
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: USER_ROLES, default: 'owner' },
    // Tokens issued before this are rejected, so changing the password logs out other sessions
    passwordChangedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.passwordHash
        delete ret.__v
        return ret
      },
    },
  },
)

export default mongoose.model('User', userSchema)
