import { MongoMemoryReplSet } from 'mongodb-memory-server'

// Boots the real app against a throwaway in-memory MongoDB (replica set, for transactions).
// Never touches the database in .env.
export async function startTestServer() {
  const rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } })
  process.env.MONGO_URI = rs.getUri('test')
  process.env.JWT_SECRET = 'test-secret'
  process.env.NODE_ENV = 'test'

  const { default: mongoose } = await import('mongoose')
  const { connectDB } = await import('../../src/config/db.js')
  const { default: app } = await import('../../src/app.js')
  await connectDB()
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()))

  const server = app.listen(0)
  const baseUrl = `http://localhost:${server.address().port}/api`

  async function request(method, path, { token, body, headers } = {}) {
    const res = await fetch(baseUrl + path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token && { authorization: `Bearer ${token}` }),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    return { status: res.status, body: text ? JSON.parse(text) : null }
  }

  // Registers a new business + owner and returns their token and ids
  async function registerOwner(label) {
    const { status, body } = await request('POST', '/auth/register', {
      body: { businessName: `${label} Sweets`, name: `${label} Owner`, email: `${label.toLowerCase()}@test.com`, password: 'secret123' },
    })
    if (status !== 201) throw new Error(`register failed: ${status} ${JSON.stringify(body)}`)
    return { token: body.token, businessId: body.business._id, userId: body.user._id }
  }

  async function stop() {
    server.close()
    await mongoose.disconnect()
    await rs.stop()
  }

  return { request, registerOwner, stop, db: () => mongoose.connection.db, mongoose }
}
