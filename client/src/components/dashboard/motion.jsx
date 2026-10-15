import { useLayoutEffect, useRef } from 'react'
import { m, useReducedMotion } from 'framer-motion'

// Presentation-only animation for the dashboard. Values always come from the server; these
// helpers only change how they appear. With prefers-reduced-motion everything renders final at once.
// Uses framer-motion's slim `m` components; the features load once for the whole app (AppMotion).

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
}
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } }

// A grid whose direct StaggerItem children fade in one after another (once, on mount)
export function StaggerGroup({ className, children }) {
  const reduce = useReducedMotion()
  return (
    <m.div className={className} variants={stagger} initial={reduce ? false : 'hidden'} animate="show">
      {children}
    </m.div>
  )
}

// One card in a StaggerGroup. Renders as `as` (div/section) so the card keeps its own markup.
export function StaggerItem({ as = 'div', className, children, ...props }) {
  const Tag = as === 'section' ? m.section : m.div
  return (
    <Tag className={className} variants={fadeUp} {...props}>
      {children}
    </Tag>
  )
}

const easeOutCubic = (t) => 1 - (1 - t) ** 3

/**
 * Counts up to `value` (and between values when the 60s refresh brings a new one).
 * The animated digits are aria-hidden; screen readers get the final value once.
 * `step` rounds the in-between numbers (e.g. 100 = whole rupees for paise). Ends on the exact value.
 */
export function CountUp({ value, format = (v) => String(v), step = 1, duration = 900 }) {
  const reduce = useReducedMotion()
  const ref = useRef(null)
  const from = useRef(0)

  // The effect owns the digits (React renders the span empty), set before paint so nothing flashes
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return undefined
    const start = from.current
    from.current = value
    if (reduce || start === value) {
      node.textContent = format(value)
      return undefined
    }
    node.textContent = format(start)
    let frame
    const began = performance.now()
    const tick = (now) => {
      const t = Math.min(1, (now - began) / duration)
      node.textContent = t < 1 ? format(Math.round((start + (value - start) * easeOutCubic(t)) / step) * step) : format(value)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      node.textContent = format(value)
    }
  }, [value, format, step, duration, reduce])

  return (
    <>
      <span ref={ref} aria-hidden="true" className="tabular-nums" />
      <span className="sr-only">{format(value)}</span>
    </>
  )
}

// Progress bar that grows to `percent` (a server number); jumps straight there with reduced motion
export function AnimatedBar({ percent, color, className = 'h-full rounded-full' }) {
  const reduce = useReducedMotion()
  return (
    <m.div
      className={className}
      style={{ backgroundColor: color }}
      initial={reduce ? false : { width: 0 }}
      animate={{ width: `${percent}%` }}
      transition={reduce ? { duration: 0 } : { duration: 0.8, ease: 'easeOut', delay: 0.15 }}
    />
  )
}
