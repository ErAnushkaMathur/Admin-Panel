import { env } from './config/env.js'
import { connectDB } from './config/db.js'
import app from './app.js'
import { scheduleMissingCheckoutJob } from './jobs/missingCheckout.job.js'

import dns from 'node:dns'
dns.setServers(['8.8.8.8', '1.1.1.1'])
async function start() {
  try {
    await connectDB()
    scheduleMissingCheckoutJob()
    app.listen(env.port, () => {
      console.log(`API listening on http://localhost:${env.port} (${env.nodeEnv})`)
    })
  } catch (err) {
    console.error('Failed to start server:', err.message)
    process.exit(1)
  }
}

start()
