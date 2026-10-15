// Palette access for code outside CSS classes. Every colour lives in index.css (@theme).

// For inline styles / SVG: `var(--color-present)` (follows the theme, no hex in components)
export const cssVar = (name) => `var(--color-${name})`

// The token's current value as a hex string, for libraries that need a literal colour
// (QR code images, WebGL materials). Reads the CSS variable at runtime.
export function themeColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim()
}
