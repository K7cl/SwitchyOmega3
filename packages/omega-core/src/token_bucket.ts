// token_bucket — a minimal token-bucket rate limiter, replacing the `limiter`
// dependency. Only the surface used by OptionsSync is implemented:
// removeTokens(count, cb), tryRemoveTokens(count), content, clear().
//
// Constructed with no arguments, the bucket is "unlimited" (never throttles) —
// used as the sync throttle in tests and where rate limiting is not desired.

type IntervalName = 'sec' | 'second' | 'min' | 'minute' | 'hour' | 'day'
type Interval = number | IntervalName

const INTERVAL_MS: Record<IntervalName, number> = {
  sec: 1000,
  second: 1000,
  min: 60000,
  minute: 60000,
  hour: 3600000,
  day: 86400000,
}

export type RemoveTokensCallback = (err: Error | null, remainingTokens?: number) => void

export class TokenBucket {
  bucketSize: number
  tokensPerInterval: number
  content: number
  private readonly intervalMs: number
  private lastDrip: number
  private readonly unlimited: boolean
  private readonly parent?: TokenBucket

  constructor(bucketSize?: number, tokensPerInterval?: number, interval?: Interval, parent?: TokenBucket | null) {
    if (bucketSize == null) {
      this.unlimited = true
      this.bucketSize = Infinity
      this.tokensPerInterval = Infinity
      this.content = Infinity
      this.intervalMs = 0
      this.lastDrip = 0
    } else {
      this.unlimited = false
      this.bucketSize = bucketSize
      this.tokensPerInterval = tokensPerInterval ?? bucketSize
      this.intervalMs = typeof interval === 'number' ? interval : INTERVAL_MS[interval ?? 'second']
      this.content = bucketSize
      this.lastDrip = Date.now()
      this.parent = parent ?? undefined
    }
  }

  private drip(): void {
    if (this.unlimited || this.intervalMs <= 0) return
    const now = Date.now()
    const delta = now - this.lastDrip
    this.lastDrip = now
    this.content = Math.min(
      this.bucketSize,
      this.content + (delta / this.intervalMs) * this.tokensPerInterval,
    )
  }

  tryRemoveTokens(count: number): boolean {
    if (this.unlimited) return true
    this.drip()
    if (count > this.bucketSize) return false
    if (this.content < count) return false
    if (this.parent && !this.parent.tryRemoveTokens(count)) return false
    this.content -= count
    return true
  }

  removeTokens(count: number, callback: RemoveTokensCallback): void {
    if (this.unlimited) {
      callback(null, Infinity)
      return
    }
    if (count > this.bucketSize) {
      callback(new Error('Requested tokens exceed bucket size'))
      return
    }
    this.drip()
    if (this.content >= count && (!this.parent || this.parent.tryRemoveTokens(count))) {
      this.content -= count
      callback(null, this.content)
      return
    }
    const deficit = count - this.content
    const waitMs = Math.ceil((deficit / this.tokensPerInterval) * this.intervalMs)
    setTimeout(() => this.removeTokens(count, callback), Math.max(waitMs, 1))
  }

  clear(): void {
    this.content = 0
  }
}
