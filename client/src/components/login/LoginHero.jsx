import { Component, lazy, Suspense, useSyncExternalStore } from 'react'
import CupcakeIllustration from './CupcakeIllustration.jsx'

// The 3D scene (three.js + React Three Fiber) is a separate chunk, fetched only when this
// component decides to show it: wide screen + WebGL available.
const CupcakeScene = lazy(() => import('./CupcakeScene.jsx'))

const WIDE = '(min-width: 768px)'
const REDUCED = '(prefers-reduced-motion: reduce)'

function useMediaQuery(query) {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

let webglSupport
function hasWebGL() {
  if (webglSupport === undefined) {
    try {
      const canvas = document.createElement('canvas')
      webglSupport = Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
    } catch {
      webglSupport = false
    }
  }
  return webglSupport
}

function StaticCupcake({ className = '' }) {
  return <CupcakeIllustration className={className} />
}

// If the 3D chunk fails to load or WebGL breaks, fall back to the picture
class SceneBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/**
 * Decorative cupcake beside the Login form. Phones (< 768px) and devices without WebGL get the
 * static picture and never download three.js; prefers-reduced-motion gets a still 3D frame.
 */
export default function LoginHero() {
  const wide = useMediaQuery(WIDE)
  const reduced = useMediaQuery(REDUCED)

  if (!wide || !hasWebGL()) {
    return <StaticCupcake className="mx-auto h-28 w-28 md:h-72 md:w-72" />
  }
  const fallback = <StaticCupcake className="h-72 w-72" />
  return (
    <div className="flex h-80 w-full items-center justify-center lg:h-[26rem]" data-testid="cupcake-3d">
      <SceneBoundary fallback={fallback}>
        <Suspense fallback={fallback}>
          <CupcakeScene spin={!reduced} />
        </Suspense>
      </SceneBoundary>
    </div>
  )
}
