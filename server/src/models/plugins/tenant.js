import mongoose from 'mongoose'

const QUERY_OPS = [
  'find',
  'findOne',
  'findOneAndUpdate',
  'findOneAndDelete',
  'findOneAndReplace',
  'updateOne',
  'updateMany',
  'replaceOne',
  'deleteOne',
  'deleteMany',
  'countDocuments',
  'distinct',
]

// Multi-tenant guard (golden rule 2): adds `businessId` and makes every query without it throw,
// so a forgotten filter fails loudly in development instead of leaking another shop's data.
// Opt out only for deliberate cross-tenant jobs with `.setOptions({ skipTenant: true })`.
export function tenantPlugin(schema) {
  schema.add({
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true, immutable: true },
  })

  schema.pre(QUERY_OPS, function () {
    if (this.getOptions().skipTenant) return
    if (!this.getFilter().businessId) {
      throw new Error(`Tenant scope missing: ${this.model.modelName}.${this.op}() must filter by businessId`)
    }
  })

  schema.pre('aggregate', function () {
    if (this.options?.skipTenant) return
    if (!this.pipeline()[0]?.$match?.businessId) {
      throw new Error(`Tenant scope missing: ${this._model?.modelName}.aggregate() must start with $match on businessId`)
    }
  })
}
