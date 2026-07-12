// utils — profile revision comparison, an attached-cache helper, and
// domain/URL helpers. Ported from the legacy omega-pac/src/utils.coffee.
//
// Dependency swaps: the deprecated `tldjs` -> maintained `tldts`; Node's `url`
// module -> the standard WHATWG `URL` (available in service workers + pages).

import { getDomain } from 'tldts'

export const Revision = {
  fromTime(time?: number | string | Date): string {
    const d = time ? new Date(time) : new Date()
    return d.getTime().toString(16)
  },
  compare(a: string | undefined | null, b: string | undefined | null): number {
    if (!a && !b) return 0
    if (!a) return -1
    if (!b) return 1
    if (a.length > b.length) return 1
    if (a.length < b.length) return -1
    if (a > b) return 1
    if (a < b) return -1
    return 0
  },
}

type TagFn<T> = (obj: T) => unknown

/**
 * Caches a computed value on an object under a hidden property, invalidated
 * when a "tag" derived from the object changes. Ported from the CoffeeScript
 * AttachedCache; the cache slot is a non-enumerable own property.
 */
export class AttachedCache<T extends object, V = unknown> {
  private prop: string
  private tag: TagFn<T>

  constructor(tagOrProp: TagFn<T> | string, tag?: TagFn<T>) {
    if (typeof tag === 'undefined') {
      this.tag = tagOrProp as TagFn<T>
      this.prop = '_cache'
    } else {
      this.prop = tagOrProp as string
      this.tag = tag
    }
  }

  get(obj: T, otherwise: V | (() => V)): V {
    const tag = this.tag(obj)
    const cache = this.getCache(obj)
    if (cache != null && cache.tag === tag) {
      return cache.value
    }
    const value = typeof otherwise === 'function' ? (otherwise as () => V)() : otherwise
    this.setCache(obj, { tag, value })
    return value
  }

  drop(obj: T): void {
    const record = obj as Record<string, unknown>
    if (record[this.prop] != null) {
      record[this.prop] = undefined
    }
  }

  /** Compute the current tag value for an object (public accessor). */
  getTag(obj: T): unknown {
    return this.tag(obj)
  }

  private getCache(obj: T): { tag: unknown; value: V } | undefined {
    return (obj as Record<string, unknown>)[this.prop] as
      | { tag: unknown; value: V }
      | undefined
  }

  private setCache(obj: T, value: { tag: unknown; value: V }): void {
    if (!Object.prototype.hasOwnProperty.call(obj, this.prop)) {
      Object.defineProperty(obj, this.prop, { writable: true })
    }
    ;(obj as Record<string, unknown>)[this.prop] = value
  }
}

/** Heuristic: is `domain` an IP literal (so it should not be TLD-processed)? */
export function isIp(domain: string): boolean {
  if (domain.indexOf(':') > 0) return true // IPv6
  const lastCharCode = domain.charCodeAt(domain.length - 1)
  return lastCharCode >= 48 && lastCharCode <= 57 // ends with a digit
}

export function getBaseDomain(domain: string): string {
  if (isIp(domain)) return domain
  return getDomain(domain) ?? domain
}

export function wildcardForDomain(domain: string): string {
  if (isIp(domain)) return domain
  return '*.' + getBaseDomain(domain)
}

export function wildcardForUrl(url: string): string {
  const domain = new URL(url).hostname
  return wildcardForDomain(domain)
}
