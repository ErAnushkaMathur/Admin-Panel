import { useCallback, useEffect, useRef, useState } from 'react'

// Briefly marks one item (e.g. a just-edited table row) so it can flash.
// -> [flashId, flash(id)]: render `flash-row` (tables) or `flash-card` (cards) while flashId matches.
export function useFlash(duration = 1600) {
  const [flashId, setFlashId] = useState(null)
  const timer = useRef(null)
  const flash = useCallback(
    (id) => {
      clearTimeout(timer.current)
      setFlashId(id == null ? null : String(id))
      timer.current = setTimeout(() => setFlashId(null), duration)
    },
    [duration],
  )
  useEffect(() => () => clearTimeout(timer.current), [])
  return [flashId, flash]
}

// Fade-in for list rows: a short stagger, capped so long lists don't wait
export function rowFadeIn(index) {
  return { className: 'animate-row-in', style: { animationDelay: `${Math.min(index, 12) * 25}ms` } }
}
