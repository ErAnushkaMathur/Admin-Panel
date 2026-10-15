import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { themeColor } from '../../utils/theme.js'

// Loaded only by the Login page via React.lazy (its own chunk with three.js). Never import it
// anywhere else: the dashboard and the public punch page must stay free of three.js.

// Palette tokens (WebGL needs literal colours, so they're read from the CSS variables at runtime):
// rose wrapper, cream frosting, a deep-rose cherry, sprinkles in amber / indigo / teal / rose
function readPalette() {
  return {
    wrapper: themeColor('primary'),
    frosting: themeColor('surface'),
    frostingPink: themeColor('primary-tint'),
    cherry: themeColor('primary-ink'),
    stem: themeColor('syrup-soft'),
    sprinkles: ['amber', 'leave', 'secondary', 'primary'].map(themeColor),
    lightWarm: themeColor('background'),
    lightSky: themeColor('surface'),
    lightGround: themeColor('background-deep'),
    lightRose: themeColor('primary-tint'),
  }
}

// Sprinkles placed around the frosting (fixed, so the model looks the same every load)
const SPRINKLE_SPOTS = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2
  // On the surface of the bottom (odd) or middle (even) frosting blob
  const [ring, height] = i % 2 ? [0.95, 1.32] : [0.65, 1.7]
  return {
    position: [Math.cos(angle) * ring, height, Math.sin(angle) * ring],
    rotation: [angle, angle * 2, 0.6],
    colorIndex: i % 4,
  }
})

function Cupcake({ spin, palette }) {
  const group = useRef(null)
  // Slow turn: about one revolution every 25 seconds
  useFrame((_, delta) => {
    if (spin && group.current) group.current.rotation.y += delta * 0.25
  })

  return (
    <group ref={group} rotation={[0.18, 0.6, 0]} position={[0, -0.55, 0]}>
      {/* Wrapper: a tapered 10-sided cylinder (low poly, flat shaded) */}
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[1.05, 0.78, 1.0, 10, 1]} />
        <meshStandardMaterial color={palette.wrapper} flatShading roughness={0.7} />
      </mesh>
      {/* Frosting: three squashed low-poly blobs, largest at the bottom */}
      <mesh position={[0, 1.02, 0]} scale={[1.18, 0.5, 1.18]}>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color={palette.frosting} flatShading roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.42, 0]} scale={[0.86, 0.42, 0.86]}>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color={palette.frostingPink} flatShading roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.74, 0]} scale={[0.5, 0.32, 0.5]}>
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color={palette.frosting} flatShading roughness={0.9} />
      </mesh>
      {/* Cherry and stem */}
      <mesh position={[0, 2.12, 0]}>
        <icosahedronGeometry args={[0.22, 0]} />
        <meshStandardMaterial color={palette.cherry} flatShading roughness={0.4} />
      </mesh>
      <mesh position={[0.08, 2.4, 0]} rotation={[0, 0, -0.4]}>
        <cylinderGeometry args={[0.02, 0.025, 0.36, 5]} />
        <meshStandardMaterial color={palette.stem} flatShading />
      </mesh>
      {SPRINKLE_SPOTS.map((s, i) => (
        <mesh key={i} position={s.position} rotation={s.rotation}>
          <boxGeometry args={[0.16, 0.04, 0.04]} />
          <meshStandardMaterial color={palette.sprinkles[s.colorIndex]} roughness={0.5} />
        </mesh>
      ))}
    </group>
  )
}

/**
 * `spin` false (prefers-reduced-motion) renders one still frame and stops (frameloop "demand").
 */
export default function CupcakeScene({ spin = true }) {
  const palette = useMemo(() => readPalette(), [])
  return (
    <Canvas
      camera={{ position: [0, 1.4, 5.2], fov: 38 }}
      dpr={[1, 1.5]}
      frameloop={spin ? 'always' : 'demand'}
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      aria-hidden="true"
      onCreated={({ camera }) => camera.lookAt(0, 0.5, 0)}
    >
      {/* Soft lighting: warm sky/ground fill plus one gentle key light */}
      <ambientLight intensity={0.9} color={palette.lightWarm} />
      <hemisphereLight args={[palette.lightSky, palette.lightGround, 1.4]} />
      <directionalLight position={[3, 5, 4]} intensity={2.4} color={palette.lightWarm} />
      <directionalLight position={[-4, 2, -2]} intensity={0.8} color={palette.lightRose} />
      <Cupcake spin={spin} palette={palette} />
    </Canvas>
  )
}
