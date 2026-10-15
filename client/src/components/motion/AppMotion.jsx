import { LazyMotion } from 'framer-motion'

// framer-motion's animation features as their own chunk, fetched once by the signed-in app.
// Until they arrive, `m` elements simply render in place. Never used by the punch page or Login.
const loadFeatures = () => import('./features.js').then((mod) => mod.default)

export default function AppMotion({ children }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      {children}
    </LazyMotion>
  )
}
