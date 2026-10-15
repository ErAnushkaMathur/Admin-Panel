import { useEffect, useRef, useState } from 'react'
import { cssVar } from '../../utils/theme.js'

// Chart primitives for Staff Analytics. They only draw: every value comes from the server
// (golden rule 1). Scaling values to pixels is presentation, not calculation of totals.
// Specs follow the dataviz guide: 2px lines, 4px rounded bar ends on a single baseline,
// hairline solid grid, one series colour, text in text tokens, hover tooltips + table view.

// Single series in teal, the positive/growth accent (the 3:1 step: raw teal is too light for marks)
const SERIES = cssVar('secondary-strong')
const GRID = cssVar('border')
const SURFACE = cssVar('surface')
const CROSSHAIR = cssVar('syrup-faint')

// Width of an element, kept up to date (charts are drawn at the real pixel size, so text never stretches)
function useWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!ref.current) return undefined
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

function Tooltip({ x, y, width, children }) {
  // Keep the box inside the chart: flip to the left of the pointer near the right edge
  const flip = x > width - 180
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 min-w-36 rounded-xl bg-surface px-3 py-2 text-xs shadow-soft ring-1 ring-border"
      style={{ left: flip ? undefined : x + 12, right: flip ? width - x + 12 : undefined, top: Math.max(0, y - 10) }}
    >
      {children}
    </div>
  )
}

export function TooltipRow({ label, value, strong = false }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-syrup-muted">{label}</span>
      <span className={strong ? 'text-sm font-semibold text-syrup' : 'font-medium text-syrup'}>{value}</span>
    </div>
  )
}

// Every `step`-th index, always including the last, so x labels never collide
function tickIndexes(count, maxTicks) {
  if (count <= maxTicks) return [...Array(count).keys()]
  const step = Math.ceil(count / maxTicks)
  const out = []
  for (let i = 0; i < count; i += step) out.push(i)
  if (out.at(-1) !== count - 1) {
    if (count - 1 - out.at(-1) < step / 2) out.pop()
    out.push(count - 1)
  }
  return out
}

/**
 * Single-series line over time with a crosshair tooltip. `points`: [{ key, value (null = gap) }].
 * yMax fixed (e.g. 100 for percentages); `tooltip(point)` renders the readout.
 */
export function LineChart({ points, yMax = 100, yTicks = [0, 25, 50, 75, 100], formatY, formatX, tooltip, label }) {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState(null)
  const height = 220
  const pad = { top: 12, right: 12, bottom: 28, left: 40 }
  const innerW = Math.max(0, width - pad.left - pad.right)
  const innerH = height - pad.top - pad.bottom
  const x = (i) => pad.left + (points.length <= 1 ? innerW / 2 : (i * innerW) / (points.length - 1))
  const y = (v) => pad.top + innerH - (v / yMax) * innerH

  // Split into runs of consecutive values so gaps (no data) stay gaps
  const runs = []
  let run = []
  points.forEach((p, i) => {
    if (p.value === null || p.value === undefined) {
      if (run.length) runs.push(run)
      run = []
    } else run.push([x(i), y(p.value)])
  })
  if (run.length) runs.push(run)
  const path = (r) => r.map(([px, py], i) => `${i ? 'L' : 'M'}${px},${py}`).join(' ')
  const area = (r) => `${path(r)} L${r.at(-1)[0]},${y(0)} L${r[0][0]},${y(0)} Z`
  const lastIndex = points.findLastIndex((p) => p.value !== null && p.value !== undefined)

  function onMove(e) {
    const box = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - box.left
    if (!points.length || innerW <= 0) return
    const i = points.length === 1 ? 0 : Math.round(((px - pad.left) / innerW) * (points.length - 1))
    setHover(Math.min(points.length - 1, Math.max(0, i)))
  }
  function onKey(e) {
    if (e.key === 'ArrowRight') setHover((h) => Math.min(points.length - 1, (h ?? -1) + 1))
    else if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? points.length) - 1))
  }

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={label}
          tabIndex={0}
          className="outline-none focus-visible:ring-2 focus-visible:ring-primary"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          onFocus={() => setHover(lastIndex >= 0 ? lastIndex : 0)}
          onBlur={() => setHover(null)}
          onKeyDown={onKey}
        >
          {yTicks.map((tick) => (
            <g key={tick}>
              <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} style={{ stroke: GRID }} strokeWidth="1" />
              <text x={pad.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-syrup-muted text-[11px] tabular-nums">
                {formatY(tick)}
              </text>
            </g>
          ))}
          {tickIndexes(points.length, Math.max(2, Math.floor(innerW / 70))).map((i) => (
            <text
              key={points[i].key}
              x={x(i)}
              y={height - 8}
              // First/last labels hug the edges so they're never clipped
              textAnchor={points.length > 1 && i === 0 ? 'start' : points.length > 1 && i === points.length - 1 ? 'end' : 'middle'}
              className="fill-syrup-muted text-[11px]"
            >
              {formatX(points[i])}
            </text>
          ))}
          {runs.map((r) => (
            <g key={`${r[0][0]}`}>
              <path d={area(r)} style={{ fill: SERIES }} opacity="0.1" />
              <path d={path(r)} fill="none" style={{ stroke: SERIES }} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            </g>
          ))}
          {/* End marker on the latest value */}
          {lastIndex >= 0 && <circle cx={x(lastIndex)} cy={y(points[lastIndex].value)} r="4" style={{ fill: SERIES, stroke: SURFACE }} strokeWidth="2" />}
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + innerH} style={{ stroke: CROSSHAIR }} strokeWidth="1" />
              {points[hover].value !== null && points[hover].value !== undefined && (
                <circle cx={x(hover)} cy={y(points[hover].value)} r="4" style={{ fill: SERIES, stroke: SURFACE }} strokeWidth="2" />
              )}
            </g>
          )}
        </svg>
      )}
      {hover !== null && width > 0 && (
        <Tooltip x={x(hover)} y={points[hover].value === null || points[hover].value === undefined ? pad.top : y(points[hover].value)} width={width}>
          {tooltip(points[hover])}
        </Tooltip>
      )}
    </div>
  )
}

/**
 * Columns on one baseline, one colour; `faded` columns (e.g. draft months) at lower opacity.
 * `bars`: [{ key, value (null = no data), label, faded? }]. Hover/focus a column for its tooltip.
 */
export function ColumnChart({ bars, formatY, tooltip, label, valueLabel }) {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState(null)
  const height = 220
  const pad = { top: 24, right: 8, bottom: 28, left: 8 }
  const innerW = Math.max(0, width - pad.left - pad.right)
  const innerH = height - pad.top - pad.bottom
  const max = Math.max(0, ...bars.map((b) => b.value ?? 0))
  const slot = bars.length ? innerW / bars.length : 0
  const barW = Math.min(24, Math.max(6, slot * 0.6))
  const baseline = pad.top + innerH
  const h = (v) => (max ? (v / max) * innerH : 0)
  const radius = 4

  // Rounded data end, square at the baseline
  const column = (cx, value) => {
    const top = baseline - h(value)
    const r = Math.min(radius, h(value), barW / 2)
    const left = cx - barW / 2
    const right = cx + barW / 2
    return `M${left},${baseline} L${left},${top + r} Q${left},${top} ${left + r},${top} L${right - r},${top} Q${right},${top} ${right},${top + r} L${right},${baseline} Z`
  }

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label}>
          <line x1={pad.left} x2={width - pad.right} y1={baseline} y2={baseline} style={{ stroke: GRID }} strokeWidth="1" />
          {bars.map((b, i) => {
            const cx = pad.left + slot * i + slot / 2
            const has = b.value !== null && b.value !== undefined
            return (
              <g
                key={b.key}
                tabIndex={0}
                role="graphics-symbol"
                aria-label={`${b.label}: ${has ? formatY(b.value) : 'no data'}`}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className="cursor-default outline-none"
              >
                {/* Hit target: the whole slot, taller than the bar */}
                <rect x={pad.left + slot * i} y={pad.top} width={slot} height={innerH} fill="transparent" />
                {has && h(b.value) > 0 && (
                  <path d={column(cx, b.value)} style={{ fill: SERIES }} opacity={(b.faded ? 0.4 : 1) * (hover === null || hover === i ? 1 : 0.75)} />
                )}
                {has && valueLabel && valueLabel(b) && (
                  <text x={cx} y={baseline - h(b.value) - 6} textAnchor="middle" className="fill-syrup text-[11px] font-semibold tabular-nums">
                    {valueLabel(b)}
                  </text>
                )}
                <text x={cx} y={height - 8} textAnchor="middle" className="fill-syrup-muted text-[11px]">
                  {b.label}
                </text>
              </g>
            )
          })}
        </svg>
      )}
      {hover !== null && width > 0 && (
        <Tooltip x={pad.left + slot * hover + slot / 2} y={pad.top} width={width}>
          {tooltip(bars[hover])}
        </Tooltip>
      )}
    </div>
  )
}

/**
 * Horizontal bars, one row per item, value at the tip. `rows`: [{ key, label, sublabel?, value, valueText, hint? }]
 */
export function BarList({ rows, testId }) {
  const max = Math.max(0, ...rows.map((r) => r.value))
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.key} data-testid={testId} title={r.hint}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">
              <span className="font-medium">{r.label}</span>
              {r.sublabel && <span className="ml-1.5 text-xs text-syrup-muted">{r.sublabel}</span>}
            </span>
            <span className="shrink-0 font-semibold tabular-nums">{r.valueText}</span>
          </div>
          <div className="h-2.5 rounded-r-[4px] bg-transparent">
            <div className="h-full rounded-r-[4px]" style={{ width: `${max ? (r.value / max) * 100 : 0}%`, minWidth: r.value ? 4 : 0, backgroundColor: SERIES }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

// "Show as table": the same values without hovering (accessibility; dataviz table view)
export function TableView({ columns, rows, caption }) {
  return (
    <details className="mt-4 text-sm">
      <summary className="cursor-pointer select-none font-semibold text-syrup-soft hover:text-primary-ink">Show as table</summary>
      <div className="mt-2 max-h-72 overflow-auto rounded-xl ring-1 ring-border">
        <table className="w-full text-left text-xs tabular-nums">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-background text-syrup-muted">
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={`px-3 py-2 font-semibold ${c.align === 'right' ? 'text-right' : ''}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.key}>
                {columns.map((c) => (
                  <td key={c.key} className={`px-3 py-1.5 ${c.align === 'right' ? 'text-right' : ''}`}>
                    {row[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
