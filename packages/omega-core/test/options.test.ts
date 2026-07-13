import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { Options } from '../src/options.js'
import { Storage } from '../src/storage.js'
import { getDefaultOptions } from '../src/default_options.js'
import { Log, type LogType } from '../src/log.js'
import type { ProxyImpl } from '../src/proxy_impl.js'
import type { Profile } from '@switchyomega/omega-pac'
import type { OmegaOptions } from '../src/types.js'

// Stub ProxyImpl that records what was applied (no real browser).
class StubProxy implements ProxyImpl {
  applied: Array<{ profile: Profile; meta: Profile }> = []
  applyProfile(profile: Profile, meta: Profile): Promise<unknown> {
    this.applied.push({ profile, meta })
    return Promise.resolve()
  }
  get last() {
    return this.applied.at(-1)
  }
}

const silentLog: LogType = { ...Log, log: () => undefined, error: () => undefined }

function makeOptions(seed?: OmegaOptions | null, proxy = new StubProxy()): { o: Options; proxy: StubProxy } {
  const o = new Options(seed, new Storage(), new Storage(), silentLog, undefined, proxy)
  return { o, proxy }
}

describe('Options', () => {
  beforeAll(() => {
    vi.spyOn(Log, 'log').mockImplementation(() => undefined)
  })
  afterAll(() => vi.restoreAllMocks())

  it('loads seeded options and applies the startup profile', async () => {
    const seed = { ...getDefaultOptions(), '-startupProfileName': 'proxy' }
    const { o, proxy } = makeOptions(seed)
    await o.ready
    expect(o.getAll()['+proxy']).toBeTruthy()
    expect(proxy.last?.meta.name).toBe('proxy')
  })

  it('falls back to the system profile when no startup profile is set', async () => {
    const { o, proxy } = makeOptions(getDefaultOptions())
    await o.ready
    // default has no -startupProfileName and no stored currentProfileName → 'system'
    expect(proxy.last?.meta.name).toBe('system')
  })

  it('self-heals to default options when storage is empty', async () => {
    const { o } = makeOptions(null)
    await o.ready
    expect(o.getAll()['+proxy']).toBeTruthy()
    expect((o.getAll()['schemaVersion'] as number)).toBe(2)
  })

  it('matches a request through the auto switch profile', async () => {
    const seed = { ...getDefaultOptions(), '-startupProfileName': 'auto switch' }
    const { o } = makeOptions(seed)
    await o.ready
    const result = await o.matchProfile({
      url: 'http://www.example.com/',
      host: 'www.example.com',
      scheme: 'http',
    })
    // auto switch: *.example.com -> proxy (a FixedProfile)
    expect(result.profile?.name).toBe('proxy')

    const direct = await o.matchProfile({
      url: 'http://internal.example.com/',
      host: 'internal.example.com',
      scheme: 'http',
    })
    // internal.example.com -> direct
    expect(direct.profile?.name).toBe('direct')
  })

  it('applies a profile and can switch the current profile', async () => {
    const { o, proxy } = makeOptions(getDefaultOptions())
    await o.ready
    proxy.applied.length = 0
    await o.applyProfile('auto switch')
    expect(proxy.last?.meta.name).toBe('auto switch')
    expect(o.currentProfile()?.name).toBe('auto switch')
  })

  it('upgrades schemaVersion 1 to 2', async () => {
    const { o } = makeOptions(getDefaultOptions())
    await o.ready
    const [upgraded, changes] = await o.upgrade({
      schemaVersion: 1,
      '+proxy': { name: 'proxy', profileType: 'FixedProfile' },
    })
    expect(upgraded['schemaVersion']).toBe(2)
    expect(changes['schemaVersion']).toBe(2)
  })

  it('rejects an unknown schemaVersion', async () => {
    const { o } = makeOptions(getDefaultOptions())
    await o.ready
    await expect(o.upgrade({ schemaVersion: 99 })).rejects.toThrow(/Invalid schemaVerion/)
  })

  it('signals first-run (NoOptionsError) when options lack a schemaVersion', async () => {
    const { o } = makeOptions(getDefaultOptions())
    await o.ready
    // Empty / schemaVersion-less stores are a fresh install, not corruption.
    await expect(o.upgrade({})).rejects.toBeInstanceOf(Options.NoOptionsError)
    await expect(o.upgrade(null)).rejects.toBeInstanceOf(Options.NoOptionsError)
  })

  it('adds a profile and rejects duplicates', async () => {
    const { o } = makeOptions(getDefaultOptions())
    await o.ready
    await o.addProfile({ name: 'work', profileType: 'DirectProfile' } as Profile)
    expect(o.profile('work')?.profileType).toBe('DirectProfile')
    await expect(
      Promise.resolve(o.addProfile({ name: 'work', profileType: 'DirectProfile' } as Profile)),
    ).rejects.toThrow(/already taken/)
  })

  it('renames a profile and updates references', async () => {
    const { o } = makeOptions(getDefaultOptions())
    await o.ready
    await o.renameProfile('proxy', 'renamed')
    expect(o.profile('proxy')).toBeUndefined()
    expect(o.profile('renamed')?.profileType).toBe('FixedProfile')
    // 'auto switch' referenced 'proxy' → should now reference 'renamed'
    const sw = o.profile('auto switch') as Profile
    const rules = sw.rules as Array<{ profileName: string }>
    expect(rules.some((r) => r.profileName === 'renamed')).toBe(true)
    expect(rules.some((r) => r.profileName === 'proxy')).toBe(false)
  })
})
