import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// .env lives at the project root (one level above server/)
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

const required = ['MONGO_URI', 'JWT_SECRET']
const missing = required.filter((key) => !process.env[key])
if (missing.length) {
  throw new Error(`Missing required env vars: ${missing.join(', ')}`)
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET,
  // Token lifetime in days; the cookie expires at the same time
  jwtExpiresIn: `${Number(process.env.JWT_EXPIRES_DAYS) || 7}d`,
  jwtCookieMaxAgeMs: (Number(process.env.JWT_EXPIRES_DAYS) || 7) * 24 * 60 * 60 * 1000,
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  // Behind a reverse proxy / load balancer, set to the number of proxy hops (e.g. 1) so req.ip
  // is the real client IP stored on punches. Leave empty when the API is reached directly.
  trustProxy: process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : false,
  // Max punch-page requests per IP per 10 minutes (a whole shop may share one Wi-Fi IP)
  punchRateLimitMax: Number(process.env.PUNCH_RATE_LIMIT_MAX) || 120,
}
