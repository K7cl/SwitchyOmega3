// icon — renders the profile-colored Omega action icon via OffscreenCanvas
// (service workers have no DOM). Ports draw_omega.js + the icon cache.
//
// NOTE: draws at PIXEL coordinates. The original used ctx.scale(size,size) +
// unit coordinates, but that renders BLANK in the service-worker software
// canvas — pixel coordinates render correctly.

const SIZES = [16, 19, 24, 32, 38] as const

export type IconImageData = Record<number, ImageData>

const cache = new Map<string, IconImageData | null>()

function drawOmega(
  ctx: OffscreenCanvasRenderingContext2D,
  size: number,
  outerCircleColor: string,
  innerCircleColor?: string,
): void {
  const r = size / 2
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = outerCircleColor
  ctx.beginPath()
  ctx.arc(r, r, r, 0, Math.PI * 2, true)
  ctx.closePath()
  ctx.fill()

  if (innerCircleColor != null) {
    ctx.fillStyle = innerCircleColor
  } else {
    ctx.globalCompositeOperation = 'destination-out'
  }
  ctx.beginPath()
  ctx.arc(r, r, r / 2, 0, Math.PI * 2, true)
  ctx.closePath()
  ctx.fill()
}

/**
 * Build the multi-size ImageData set for chrome.action.setIcon. `profileColor`
 * fills the inner disc; when `resultColor` is given it fills the outer ring
 * (two-tone, for inclusive profiles), otherwise the inner disc is cut out.
 * Returns null only if canvas rendering is unavailable.
 */
export function drawIcon(profileColor: string, resultColor?: string): IconImageData | null {
  const cacheKey = `omega+${resultColor ?? ''}+${profileColor}`
  const cached = cache.get(cacheKey)
  if (cached !== undefined) return cached

  let icon: IconImageData | null = {}
  try {
    for (const size of SIZES) {
      const canvas = new OffscreenCanvas(size, size)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('No 2d context')
      if (resultColor != null) drawOmega(ctx, size, resultColor, profileColor)
      else drawOmega(ctx, size, profileColor)
      icon[size] = ctx.getImageData(0, 0, size, size)
    }
  } catch {
    icon = null
  }
  cache.set(cacheKey, icon)
  return icon
}

export function clearIconCache(): void {
  cache.clear()
}
