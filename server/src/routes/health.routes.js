import { Router } from 'express'
import mongoose from 'mongoose'

const router = Router()

router.get('/', (req, res) => {
  const dbUp = mongoose.connection.readyState === 1
  res.status(dbUp ? 200 : 503).json({
    status: dbUp ? 'ok' : 'degraded',
    db: dbUp ? 'connected' : 'disconnected',
    time: new Date().toISOString(),
  })
})

export default router
