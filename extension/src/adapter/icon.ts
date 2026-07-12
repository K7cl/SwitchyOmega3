// icon — renders the profile-colored Omega action icon via OffscreenCanvas
// (service workers have no DOM). Ports draw_omega.js + the icon cache from the
// legacy background.coffee.

const SIZES = [16, 19, 24, 32, 38] as const

export type IconImageData = Record<number, ImageData>

const cache = new Map<string, IconImageData | null>()

function drawOmega(
  ctx: OffscreenCanvasRenderingContext2D,
  outerCircleColor: string,
  innerCircleColor?: string,
): void {
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = outerCircleColor
  ctx.beginPath()
  ctx.arc(0.5, 0.5, 0.5, 0, Math.PI * 2, true)
  ctx.closePath()
  ctx.fill()

  if (innerCircleColor != null) {
    ctx.fillStyle = innerCircleColor
  } else {
    ctx.globalCompositeOperation = 'destination-out'
  }
  ctx.beginPath()
  ctx.arc(0.5, 0.5, 0.25, 0, Math.PI * 2, true)
  ctx.closePath()
  ctx.fill()
}

/**
 * Build the multi-size ImageData set for chrome.action.setIcon. Returns null if
 * canvas rendering is unavailable/blocked (caller falls back to the static icon).
 */
export function drawIcon(profileColor: string, resultColor?: string): IconImageData | null {
  const cacheKey = `omega+${resultColor ?? ''}+${profileColor}`
  if (cache.has(cacheKey)) return cache.get(cacheKey)!

  let icon: IconImageData | null = {}
  try {
    for (const size of SIZES) {
      const canvas = new OffscreenCanvas(size, size)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('No 2d context')
      ctx.scale(size, size)
      ctx.clearRect(0, 0, 1, 1)
      if (resultColor != null) drawOmega(ctx, resultColor, profileColor)
      else drawOmega(ctx, profileColor)
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      const data = ctx.getImageData(0, 0, size, size)
      // Fingerprint-resistance may blank the canvas to opaque white.
      if (data.data[3] === 255) throw new Error('Icon drawing blocked (resistFingerprinting).')
      icon[size] = data
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
