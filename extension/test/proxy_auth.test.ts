import { describe, it, expect } from 'vitest'
import { buildAuthCache, selectCredentials } from '../src/adapter/proxy/proxy_auth.js'
import type { Profile } from '@switchyomega/omega-pac'

describe('proxy auth', () => {
  const profiles = [
    {
      name: 'p1',
      profileType: 'FixedProfile',
      proxyForHttp: { scheme: 'http', host: 'Proxy.Example.com', port: 8080 },
      fallbackProxy: { scheme: 'http', host: 'fb.example.com', port: 9090 },
      auth: {
        proxyForHttp: { username: 'u1', password: 'p1' },
        all: { username: 'ua', password: 'pa' },
      },
    },
  ] as unknown as Profile[]
  const cache = buildAuthCache(profiles)

  it('indexes credentials by lowercased host:port', () => {
    expect(cache.proxies['proxy.example.com:8080'][0].auth).toEqual({ username: 'u1', password: 'p1' })
    expect(cache.fallbacks[0].auth).toEqual({ username: 'ua', password: 'pa' })
  })

  it('selects per-proxy credentials then fallbacks by attempt number', () => {
    expect(selectCredentials(cache, 'proxy.example.com:8080', 0)).toEqual({ username: 'u1', password: 'p1' })
    expect(selectCredentials(cache, 'proxy.example.com:8080', 1)).toEqual({ username: 'ua', password: 'pa' })
    expect(selectCredentials(cache, 'unknown:1', 0)).toEqual({ username: 'ua', password: 'pa' })
    expect(selectCredentials(cache, 'unknown:1', 1)).toBeUndefined()
  })
})
