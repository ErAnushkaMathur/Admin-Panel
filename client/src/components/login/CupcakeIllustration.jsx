// Static low-poly cupcake (phones, slow loads, no WebGL). Inline SVG so it uses the palette tokens:
// rose wrapper, cream frosting, deep-rose cherry, amber / indigo / teal sprinkles.
export default function CupcakeIllustration({ className = '' }) {
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden="true" data-testid="cupcake-static">
      <ellipse cx="100" cy="182" rx="56" ry="7" className="fill-syrup" opacity="0.08" />
      {/* Wrapper */}
      <polygon points="52,112 148,112 132,178 68,178" className="fill-primary-strong" />
      <polygon points="52,112 76,112 84,178 68,178" className="fill-primary-ink" />
      <polygon points="100,112 124,112 116,178 100,178" className="fill-primary" />
      <polygon points="124,112 148,112 132,178 116,178" className="fill-primary-ink" />
      {/* Frosting tiers */}
      <polygon points="44,114 62,92 100,86 138,92 156,114 128,122 100,124 72,122" className="fill-surface" />
      <polygon points="44,114 62,92 72,122" className="fill-background-deep" />
      <polygon points="156,114 138,92 128,122" className="fill-border" />
      <polygon points="58,94 76,72 100,66 124,72 142,94 122,100 100,102 78,100" className="fill-primary-tint" />
      <polygon points="58,94 76,72 78,100" className="fill-primary/25" />
      <polygon points="142,94 124,72 122,100" className="fill-primary/35" />
      <polygon points="74,72 88,54 100,50 112,54 126,72 112,78 100,80 88,78" className="fill-surface" />
      <polygon points="126,72 112,54 112,78" className="fill-border" />
      {/* Cherry */}
      <polygon points="92,46 100,34 110,40 108,52 96,54" className="fill-primary-ink" />
      <polygon points="100,34 110,40 103,44" className="fill-primary" />
      <path d="M104 36 Q108 24 118 20" className="stroke-syrup-soft" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {/* Sprinkles */}
      <rect x="70" y="104" width="10" height="3" rx="1.5" className="fill-amber" transform="rotate(-25 75 105)" />
      <rect x="118" y="106" width="10" height="3" rx="1.5" className="fill-leave" transform="rotate(20 123 107)" />
      <rect x="94" y="88" width="10" height="3" rx="1.5" className="fill-present" transform="rotate(-10 99 89)" />
      <rect x="84" y="64" width="9" height="3" rx="1.5" className="fill-leave" transform="rotate(30 88 65)" />
      <rect x="110" y="90" width="9" height="3" rx="1.5" className="fill-amber" transform="rotate(-35 114 91)" />
    </svg>
  )
}
