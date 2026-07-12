// ip.ts — minimal, dependency-free IPv4/IPv6 address + subnet math.
//
// Replaces the legacy `ip-address@4` dependency (whose v9/v10 successors carry
// the aging `jsbn` bignum lib and a breaking API). We only need: parse an IPv4
// or IPv6 literal with an optional CIDR prefix, canonical/compressed string
// forms (RFC 5952), netmask generation, and subnet containment. Native BigInt
// handles 128-bit IPv6 math with no dependencies.
//
// The public surface mirrors just what src/conditions.ts consumes.

export type IpVersion = 4 | 6

const V4_BITS = 32
const V6_BITS = 128

/** Parse 4 dotted decimal octets (0-255). Returns octets or null. */
function parseV4Octets(s: string): number[] | null {
  const parts = s.split('.')
  if (parts.length !== 4) return null
  const octets: number[] = []
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null
    const n = Number(p)
    if (n > 255) return null
    octets.push(n)
  }
  return octets
}

/** Parse an IPv6 literal into 8 16-bit groups (supports :: and embedded IPv4). */
function parseV6Groups(input: string): number[] | null {
  if (input.length === 0) return null
  const sides = input.split('::')
  if (sides.length > 2) return null
  const hasDouble = sides.length === 2

  const parseSide = (side: string): number[] | null => {
    if (side === '') return []
    const tokens = side.split(':')
    const groups: number[] = []
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i]
      if (tok.indexOf('.') >= 0) {
        // Embedded IPv4 — only valid as the final component.
        if (i !== tokens.length - 1) return null
        const oct = parseV4Octets(tok)
        if (!oct) return null
        groups.push((oct[0] << 8) | oct[1])
        groups.push((oct[2] << 8) | oct[3])
      } else {
        if (!/^[0-9a-fA-F]{1,4}$/.test(tok)) return null
        groups.push(parseInt(tok, 16))
      }
    }
    return groups
  }

  if (!hasDouble) {
    const groups = parseSide(input)
    return groups && groups.length === 8 ? groups : null
  }
  const head = parseSide(sides[0])
  const tail = parseSide(sides[1])
  if (!head || !tail) return null
  const missing = 8 - head.length - tail.length
  if (missing < 1) return null // '::' must stand for at least one zero group
  return [...head, ...new Array(missing).fill(0), ...tail]
}

/** Top-`prefix`-bits-set mask as a BigInt within `bitLength` bits. */
function maskBits(prefix: number, bitLength: number): bigint {
  if (prefix <= 0) return 0n
  const hostBits = bitLength - prefix
  return ((1n << BigInt(prefix)) - 1n) << BigInt(hostBits)
}

export class IpAddress {
  readonly version: IpVersion
  readonly bits: bigint
  readonly subnetMask: number // CIDR prefix length

  constructor(version: IpVersion, bits: bigint, subnetMask: number) {
    this.version = version
    this.bits = bits
    this.subnetMask = subnetMask
  }

  get bitLength(): number {
    return this.version === 4 ? V4_BITS : V6_BITS
  }

  /** True for IPv4 (mirrors ip-address@4's `.v4`). */
  get v4(): boolean {
    return this.version === 4
  }

  /** CIDR suffix, e.g. "/33". */
  get subnet(): string {
    return '/' + this.subnetMask
  }

  /** Address without the /prefix suffix, in compressed form. */
  get addressMinusSuffix(): string {
    return this.correctForm()
  }

  /** Groups: 4 octets for v4, 8 16-bit groups for v6. */
  private groups(): number[] {
    if (this.version === 4) {
      const b = this.bits
      return [
        Number((b >> 24n) & 0xffn),
        Number((b >> 16n) & 0xffn),
        Number((b >> 8n) & 0xffn),
        Number(b & 0xffn),
      ]
    }
    const g: number[] = []
    for (let i = 7; i >= 0; i--) {
      g.push(Number((this.bits >> BigInt(i * 16)) & 0xffffn))
    }
    return g
  }

  /** RFC 5952 compressed form (v6) or dotted decimal (v4). */
  correctForm(): string {
    if (this.version === 4) return this.groups().join('.')
    const g = this.groups()
    // Longest run of consecutive zero groups (>= 2), leftmost on tie.
    let bestStart = -1
    let bestLen = 0
    let curStart = -1
    let curLen = 0
    for (let i = 0; i < 8; i++) {
      if (g[i] === 0) {
        if (curStart < 0) {
          curStart = i
          curLen = 1
        } else {
          curLen++
        }
        if (curLen > bestLen) {
          bestLen = curLen
          bestStart = curStart
        }
      } else {
        curStart = -1
        curLen = 0
      }
    }
    const hex = g.map((x) => x.toString(16))
    if (bestLen < 2) return hex.join(':')
    const before = hex.slice(0, bestStart).join(':')
    const after = hex.slice(bestStart + bestLen).join(':')
    return before + '::' + after
  }

  /** Fully expanded form (v6: 8 groups padded to 4 hex digits; v4: dotted). */
  canonicalForm(): string {
    if (this.version === 4) return this.groups().join('.')
    return this.groups()
      .map((x) => x.toString(16).padStart(4, '0'))
      .join(':')
  }

  /** Network address (this AND netmask), full-width prefix. */
  startAddress(): IpAddress {
    const mask = maskBits(this.subnetMask, this.bitLength)
    return new IpAddress(this.version, this.bits & mask, this.bitLength)
  }

  /** Broadcast address (this OR host mask), full-width prefix. */
  endAddress(): IpAddress {
    const mask = maskBits(this.subnetMask, this.bitLength)
    const hostMask = ((1n << BigInt(this.bitLength)) - 1n) & ~mask
    return new IpAddress(this.version, this.bits | hostMask, this.bitLength)
  }

  /** Whether this address falls within `other`'s subnet. */
  isInSubnet(other: IpAddress): boolean {
    if (this.version !== other.version) return false
    const mask = maskBits(other.subnetMask, this.bitLength)
    return (this.bits & mask) === (other.bits & mask)
  }
}

/**
 * Parse an IPv4/IPv6 literal with an optional `/prefix`. Returns null on any
 * malformed input (including out-of-range prefixes), matching how the caller
 * treats invalid addresses.
 */
export function parse(input: string): IpAddress | null {
  let address = input
  let prefix: number | null = null
  const slash = input.indexOf('/')
  if (slash >= 0) {
    address = input.substring(0, slash)
    const rest = input.substring(slash + 1)
    if (!/^\d+$/.test(rest)) return null
    prefix = Number(rest)
  }

  const v4 = parseV4Octets(address)
  if (v4) {
    if (prefix !== null && prefix > V4_BITS) return null
    const bits = v4.reduce((acc, o) => (acc << 8n) | BigInt(o), 0n)
    return new IpAddress(4, bits, prefix ?? V4_BITS)
  }

  const v6 = parseV6Groups(address)
  if (v6) {
    if (prefix !== null && prefix > V6_BITS) return null
    const bits = v6.reduce((acc, g) => (acc << 16n) | BigInt(g), 0n)
    return new IpAddress(6, bits, prefix ?? V6_BITS)
  }

  return null
}
