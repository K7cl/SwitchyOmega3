// options — the browser-independent options manager: load/upgrade/apply
// profiles, temp rules, conditions, sync, and profile CRUD. Ported from
// omega-target/src/options.coffee (bluebird -> native promises).
//
// Browser-specific behavior is provided by overriding the no-op methods
// (printProfile, setInspect, setMonitorWebRequests, currentProfileChanged,
// setQuickSwitch, schedule, fetchUrl, onFirstRun) and by the injected ProxyImpl.

import {
  Profiles,
  Conditions,
  PacGenerator,
  Revision,
  type Profile,
  type Options as PacOptions,
} from '@switchyomega/omega-pac'
import { patch as jsonpatchImpl } from 'jsondiffpatch'
import { Log, type LogType } from './log.js'
import { Storage, type StorageItems } from './storage.js'
import { getDefaultOptions } from './default_options.js'
import type { OptionsSync } from './options_sync.js'
import type { ProxyImpl } from './proxy_impl.js'
import type { OmegaOptions } from './types.js'

// --- native-promise helpers replacing bluebird conveniences ---

/** bluebird .tap: run fn (awaiting it), then pass the original value through. */
function tap<T>(p: Promise<T>, fn: (v: T) => unknown): Promise<T> {
  return p.then((v) => Promise.resolve(fn(v)).then(() => v))
}

/** bluebird typed .catch(ErrorClass, fn). */
function catchType<T>(
  p: Promise<T>,
  ErrorClass: new (...args: never[]) => Error,
  fn: (e: Error) => T | Promise<T>,
): Promise<T> {
  return p.catch((e: unknown) => {
    if (e instanceof ErrorClass) return fn(e)
    throw e
  })
}

/** bluebird Promise.props: resolve an object of (possibly promised) values. */
function promiseProps<T>(obj: Record<string, T | Promise<T>>): Promise<Record<string, T>> {
  const keys = Object.keys(obj)
  return Promise.all(keys.map((k) => Promise.resolve(obj[k]))).then((vals) => {
    const out: Record<string, T> = {}
    keys.forEach((k, i) => {
      out[k] = vals[i]
    })
    return out
  })
}

function base64ToUtf8(b64: string): string {
  const binary = atob(b64)
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  return new TextDecoder('utf-8').decode(bytes)
}

interface ApplyProfileOptions {
  proxy?: boolean
  update?: boolean
  system?: boolean
  reason?: unknown
}

interface TempRule {
  condition: { conditionType: string; pattern: string }
  profileName: string | null
  isTempRule?: boolean
}

export class Options {
  static ProfileNotExistError = class ProfileNotExistError extends Error {
    constructor(public profileName?: string) {
      super(`Profile ${profileName} does not exist!`)
      this.name = 'ProfileNotExistError'
    }
  }

  static NoOptionsError = class NoOptionsError extends Error {}

  /** Transform options values (profiles) for syncing — strip volatile fields. */
  static transformValueForSync(value: unknown, key: string): unknown {
    if (key[0] === '+') {
      const profile = value as Profile
      if (Profiles.updateUrl(profile)) {
        const stripped: Record<string, unknown> = {}
        for (const k of Object.keys(profile)) {
          if (k === 'lastUpdate' || k === 'ruleList' || k === 'pacScript') continue
          stripped[k] = profile[k]
        }
        return stripped
      }
    }
    return value
  }

  _options: OmegaOptions = {}
  protected _storage: Storage
  protected _state: Storage
  // Ephemeral, browser-session-scoped storage for temp rules. When absent (e.g.
  // in unit tests) temp rules stay in-memory only, as before.
  protected _session?: Storage
  log: LogType
  sync?: OptionsSync
  proxyImpl?: ProxyImpl

  fallbackProfileName = 'system'
  debugStr = 'Options'
  ready: Promise<OmegaOptions> | null = null
  optionsLoaded: Promise<OmegaOptions> | null = null

  protected _currentProfileName: string | null = null
  protected _revertToProfileName: string | null = null
  protected _watchingProfiles: Record<string, string> = {}
  protected _tempProfile: Profile | null = null
  protected _tempProfileActive = false
  protected _isSystem = false
  protected _externalProfile: Profile | null = null
  protected _tempProfileRules: Record<string, TempRule> = {}
  protected _tempProfileRulesByProfile: Record<string, TempRule[]> = {}
  private _syncWatchStop: (() => void) | null = null
  private _watchStop: (() => void) | null = null

  constructor(
    options?: OmegaOptions | null,
    storage?: Storage,
    state?: Storage,
    log?: LogType,
    sync?: OptionsSync,
    proxyImpl?: ProxyImpl,
    session?: Storage,
  ) {
    this._storage = storage ?? new Storage()
    this._state = state ?? new Storage()
    this._session = session
    this.log = log ?? Log
    this.sync = sync
    this.proxyImpl = proxyImpl
    if (options == null) {
      this.init()
    } else {
      this.ready = this._storage
        .remove()
        .then(() => this._storage.set(options))
        .then(() => this.init())
    }
  }

  /** Cast the option map to omega-pac's profile-keyed view. */
  private get pac(): PacOptions {
    return this._options as unknown as PacOptions
  }

  toString(): string {
    return '<Options>'
  }

  loadOptions({ retry }: { retry?: number } = {}): Promise<OmegaOptions> {
    retry ??= 3
    this._syncWatchStop?.()
    this._syncWatchStop = null
    this._watchStop?.()
    this._watchStop = null

    let loadRaw: Promise<OmegaOptions>
    if (!this.sync?.enabled) {
      if (!this.sync) this._state.set({ syncOptions: 'unsupported' })
      loadRaw = this._storage.get(null)
    } else {
      this._state.set({ syncOptions: 'sync' })
      this._syncWatchStop = this.sync.watchAndPull(this._storage)
      loadRaw = catchType(this.sync.copyTo(this._storage), Storage.StorageUnavailableError, () => {
        console.error(
          'Warning: Sync storage is not available in this browser! Disabling options sync.',
        )
        this._syncWatchStop?.()
        this._syncWatchStop = null
        this.sync = undefined
        this._state.set({ syncOptions: 'unsupported' })
      }).then(() => this._storage.get(null))
    }

    const loaded = tap(
      loadRaw
        .then((raw) => this.upgrade(raw))
        .then(([options, changes]) => this._storage.apply({ changes }).then(() => options)),
      (options) => {
        this._options = options
        this._watchStop = this._watch()
        return this._state.get({ syncOptions: '' }).then(({ syncOptions }) => {
          if (syncOptions) return undefined
          this._state.set({ syncOptions: 'conflict' })
          return this.sync?.storage.get('schemaVersion').then(({ schemaVersion }) => {
            if (!schemaVersion) this._state.set({ syncOptions: 'pristine' })
          })
        })
      },
    ).catch((e: unknown) => {
      if (!(retry! > 0)) return Promise.reject(e)

      const getFallbackOptions: Promise<OmegaOptions | null> = Promise.resolve().then(() => {
        if (e instanceof Options.NoOptionsError) {
          this._state
            .get({ firstRun: 'new', 'web.switchGuide': 'showOnFirstUse' })
            .then((items) => this._state.set(items))
          if (!this.sync) return null
          return this._state.get({ syncOptions: '' }).then(({ syncOptions }) => {
            if (syncOptions === 'conflict') return null
            return this.sync!.storage.get(null)
              .then((options): OmegaOptions | null => {
                if (!options['schemaVersion']) {
                  this._state.set({ syncOptions: 'pristine' })
                  return null
                }
                this._state.set({ syncOptions: 'sync' })
                this.sync!.enabled = true
                this.log.log('Options#loadOptions::fromSync', options)
                return options
              })
              .catch(() => null)
          })
        }
        this.log.error((e as Error).stack)
        this._state.remove(['syncOptions'])
        return null
      })

      return getFallbackOptions.then((options) => {
        options ??= this.parseOptions(this.getDefaultOptions())
        let prevEnabled: boolean | undefined
        if (this.sync) {
          prevEnabled = this.sync.enabled
          this.sync.enabled = false
        }
        return this._storage
          .remove()
          .then(() => this._storage.set(options!))
          .then(() => {
            if (this.sync && prevEnabled !== undefined) this.sync.enabled = prevEnabled
            return this.loadOptions({ retry: retry! - 1 })
          })
      })
    })

    this.optionsLoaded = loaded
    return loaded
  }

  init(): Promise<OmegaOptions> {
    this.ready = this.loadOptions()
      .then(() => this._restoreTempRules())
      .then(() => {
        if (this._options['-startupProfileName']) {
          return this.applyProfile(this._options['-startupProfileName'] as string)
        }
        return this._state
          .get({ currentProfileName: this.fallbackProfileName, isSystemProfile: false })
          .then((st) => {
            if (st['isSystemProfile']) return this.applyProfile('system')
            return this.applyProfile((st['currentProfileName'] as string) || this.fallbackProfileName)
          })
      })
      .catch((err: unknown) => {
        if (!(err instanceof Options.ProfileNotExistError)) this.log.error(err)
        return this.applyProfile(this.fallbackProfileName)
      })
      .catch((err: unknown) => {
        this.log.error(err)
      })
      .then(() => this.getAll())

    this.ready.then(() => {
      if (this.sync?.enabled) this.sync.requestPush(this._options)
      this._state.get({ firstRun: '' }).then(({ firstRun }) => {
        if (firstRun) this.onFirstRun(firstRun as string)
      })
      if ((this._options['-downloadInterval'] as number) > 0) this.updateProfile()
    })

    return this.ready
  }

  /** Localized, human-readable profile description. Base: not implemented. */
  printProfile(_profile: Profile): string | null {
    return null
  }

  /** Upgrade options from previous schema versions (v1 -> v2; v2 is current). */
  upgrade(options: OmegaOptions | null, changes?: StorageItems): Promise<[OmegaOptions, StorageItems]> {
    changes ??= {}
    let version = options?.['schemaVersion'] as number | undefined
    if (!version) {
      // No stored options yet (fresh install or cleared storage). Signal
      // first-run cleanly instead of treating an empty store as a corrupt
      // schema — the loader then seeds defaults via the NoOptionsError path.
      return Promise.reject(new Options.NoOptionsError())
    }
    if (version === 1) {
      let autoDetectUsed = false
      Profiles.each(options as unknown as PacOptions, (_key, profile) => {
        if (!autoDetectUsed) {
          const refs = Profiles.directReferenceSet(profile)
          if (refs['+auto_detect']) autoDetectUsed = true
        }
      })
      if (autoDetectUsed) {
        ;(options as OmegaOptions)['+auto_detect'] = Profiles.create({
          name: 'auto_detect',
          profileType: 'PacProfile',
          pacUrl: 'http://wpad/wpad.dat',
          color: '#00cccc',
        } as Profile)
      }
      version = changes['schemaVersion'] = (options as OmegaOptions)['schemaVersion'] = 2
    }
    if (version === 2) {
      return Promise.resolve([options as OmegaOptions, changes])
    }
    return Promise.reject(new Error(`Invalid schemaVerion ${version}!`))
  }

  /** Parse options from an object, JSON string, or base64-encoded JSON. */
  parseOptions(options: OmegaOptions | string): OmegaOptions {
    let parsed: unknown = options
    if (typeof options === 'string') {
      let text: string | null = options
      if (options[0] !== '{') {
        try {
          text = base64ToUtf8(options)
        } catch {
          text = null
        }
      }
      try {
        parsed = text == null ? null : JSON.parse(text)
      } catch {
        parsed = null
      }
    }
    if (!parsed) throw new Error('Invalid options!')
    return parsed as OmegaOptions
  }

  reset(options?: OmegaOptions | string): Promise<OmegaOptions> {
    this.log.method('Options#reset', this, [options])
    const src = options ?? this.getDefaultOptions()
    return this.upgrade(this.parseOptions(src)).then(([opt]) => {
      if (this.sync) this.sync.enabled = false
      this._state.remove(['syncOptions'])
      return this._storage
        .remove()
        .then(() => this._storage.set(opt))
        .then(() => this.init())
    })
  }

  /** Called on the first initialization of options. Base: no-op. */
  onFirstRun(_reason: string): void {
    return undefined
  }

  getDefaultOptions(): OmegaOptions {
    return getDefaultOptions()
  }

  getAll(): OmegaOptions {
    return this._options
  }

  profile(name: string): Profile | undefined {
    return Profiles.byName(name, this.pac)
  }

  patch(patch: Record<string, [unknown, unknown?, unknown?]> | null): Promise<unknown> | void {
    if (!patch) return undefined
    this.log.method('Options#patch', this, [patch])

    this._options = jsonpatch(this._options, patch)
    const changes: StorageItems = {}
    for (const key of Object.keys(patch)) {
      const delta = patch[key]
      if (delta.length === 3 && delta[1] === 0 && delta[2] === 0) {
        // [previousValue, 0, 0] indicates the key was removed.
        changes[key] = undefined
      } else {
        changes[key] = this._options[key]
      }
    }
    return this._setOptions(changes)
  }

  protected _setOptions(
    changes: StorageItems,
    args?: { checkRevision?: boolean; persist?: boolean },
  ): Promise<unknown> | void {
    const removed: string[] = []
    const checkRev = args?.checkRevision ?? false
    let profilesChanged = false
    let currentProfileAffected: false | 'removed' | 'changed' = false
    for (const key of Object.keys(changes)) {
      const value = changes[key]
      if (typeof value === 'undefined') {
        delete this._options[key]
        removed.push(key)
        if (key[0] === '+') {
          profilesChanged = true
          if (key === '+' + this._currentProfileName) currentProfileAffected = 'removed'
        }
      } else {
        if (key[0] === '+') {
          if (checkRev && this._options[key]) {
            const result = Revision.compare(
              (this._options[key] as Profile).revision,
              (value as Profile).revision,
            )
            if (result >= 0) continue
          }
          profilesChanged = true
        }
        this._options[key] = value
      }
      if (!currentProfileAffected && this._watchingProfiles[key]) currentProfileAffected = 'changed'
    }
    switch (currentProfileAffected) {
      case 'removed':
        this.applyProfile(this.fallbackProfileName)
        break
      case 'changed':
        this.applyProfile(this._currentProfileName!, { update: false })
        break
      default:
        if (profilesChanged) this._setAvailableProfiles()
    }
    if (args?.persist ?? true) {
      if (this.sync?.enabled) this.sync.requestPush(changes)
      for (const key of removed) delete changes[key]
      return this._storage.set(changes).then(() => {
        this._storage.remove(removed)
        return this._options
      })
    }
    return undefined
  }

  protected _watch(): () => void {
    const handler = (rawChanges: StorageItems | null): void => {
      let changes: StorageItems
      if (rawChanges) {
        this._setOptions(rawChanges, { checkRevision: true, persist: false })
        changes = rawChanges
      } else {
        changes = this._options
      }

      const refresh = changes['-refreshOnProfileChange']
      if (refresh != null) this._state.set({ refreshOnProfileChange: refresh })

      if (Object.prototype.hasOwnProperty.call(changes, '-showExternalProfile')) {
        let showExternal = changes['-showExternalProfile']
        if (showExternal == null) {
          showExternal = true
          this._setOptions({ '-showExternalProfile': true }, { persist: true })
        }
        this._state.set({ showExternalProfile: showExternal })
      }

      let quickSwitchProfiles = changes['-quickSwitchProfiles'] as string[] | undefined
      quickSwitchProfiles = this._cleanUpQuickSwitchProfiles(quickSwitchProfiles)
      if (changes['-enableQuickSwitch'] != null || quickSwitchProfiles != null) {
        this.reloadQuickSwitch()
      }
      if (changes['-downloadInterval'] != null) {
        this.schedule('updateProfile', this._options['-downloadInterval'] as number, () => {
          this.updateProfile()
        })
      }
      if (changes['-showInspectMenu'] != null || changes === this._options) {
        let showMenu = this._options['-showInspectMenu']
        if (showMenu == null) {
          showMenu = true
          this._setOptions({ '-showInspectMenu': true }, { persist: true })
        }
        this.setInspect({ showMenu: showMenu as boolean })
      }
      if (changes['-monitorWebRequests'] != null || changes === this._options) {
        let monitorWebRequests = this._options['-monitorWebRequests']
        if (monitorWebRequests == null) {
          monitorWebRequests = true
          this._setOptions({ '-monitorWebRequests': true }, { persist: true })
        }
        this.setMonitorWebRequests(monitorWebRequests as boolean)
      }
    }

    handler(null)
    return this._storage.watch(null, handler)
  }

  protected _cleanUpQuickSwitchProfiles(quickSwitchProfiles?: string[]): string[] | undefined {
    if (quickSwitchProfiles == null) return undefined
    const seen: Record<string, boolean> = {}
    const valid = quickSwitchProfiles.filter((name) => {
      if (!name) return false
      const key = Profiles.nameAsKey(name)
      if (seen[key]) return false
      if (!Profiles.byName(name, this.pac)) return false
      seen[key] = true
      return true
    })
    if (valid.length !== quickSwitchProfiles.length) {
      this._setOptions({ '-quickSwitchProfiles': valid }, { persist: true })
    }
    return valid
  }

  reloadQuickSwitch(): Promise<unknown> {
    let profiles = this._options['-quickSwitchProfiles'] as string[]
    const usable = profiles && profiles.length >= 2 ? profiles : null
    profiles = usable as string[]
    if (this._options['-enableQuickSwitch']) {
      return this.setQuickSwitch(profiles, !!profiles)
    }
    return this.setQuickSwitch(null, !!profiles)
  }

  /** Apply element-inspection settings. Base: no-op. */
  setInspect(_settings: { showMenu: boolean }): Promise<unknown> {
    return Promise.resolve()
  }

  /** Apply web-request monitoring setting. Base: no-op. */
  setMonitorWebRequests(_enabled: boolean): Promise<unknown> {
    return Promise.resolve()
  }

  watch(callback: (changes: StorageItems | null) => void): () => void {
    return this._storage.watch(null, callback)
  }

  protected _profileNotFound(name: string): Profile {
    this.log.error(`Profile ${name} not found! Things may go very, very wrong.`)
    return Profiles.create({
      name,
      profileType: 'VirtualProfile',
      defaultProfileName: 'direct',
    } as Profile)
  }

  pacForProfile(profile: string | Profile, compress = false): Promise<string> {
    let ast = PacGenerator.script(this.pac, profile, {
      profileNotFound: this._profileNotFound.bind(this),
    })
    if (compress) ast = PacGenerator.compress(ast)
    return Promise.resolve(PacGenerator.ascii(ast.print_to_string()))
  }

  protected _setAvailableProfiles(): void {
    const profile = this._currentProfileName ? this.currentProfile() : null
    const profiles: Record<string, unknown> = {}
    const currentIncludable = profile && Profiles.isIncludable(profile)
    let allReferenceSet: Record<string, string> | null = null
    let results: string[] | undefined
    if (!profile || !Profiles.isInclusive(profile)) results = []
    Profiles.each(this.pac, (key, p) => {
      const entry: Record<string, unknown> = {
        name: p.name,
        profileType: p.profileType,
        color: p.color,
        desc: this.printProfile(p),
        builtin: p.builtin ? true : undefined,
      }
      profiles[key] = entry
      if (p.profileType === 'VirtualProfile') {
        entry.defaultProfileName = p.defaultProfileName
        if (allReferenceSet == null) {
          allReferenceSet = profile
            ? Profiles.allReferenceSet(profile, this.pac, {
                profileNotFound: this._profileNotFound.bind(this),
              })
            : {}
        }
        if (allReferenceSet[key]) {
          entry.validResultProfiles = Profiles.validResultProfilesFor(p, this.pac).map((r) => r.name)
        }
      }
      if (currentIncludable && Profiles.isIncludable(p)) results?.push(p.name)
    })
    if (profile && Profiles.isInclusive(profile)) {
      results = Profiles.validResultProfilesFor(profile, this.pac).map((r) => r.name)
    }
    this._state.set({ availableProfiles: profiles, validResultProfiles: results })
  }

  applyProfile(name: string, options?: ApplyProfileOptions): Promise<unknown> {
    this.log.method('Options#applyProfile', this, [name, options])
    const profile = Profiles.byName(name, this.pac)
    if (!profile) return Promise.reject(new Options.ProfileNotExistError(name))

    this._currentProfileName = profile.name
    this._isSystem = !!options?.system || profile.profileType === 'SystemProfile'
    this._watchingProfiles = Profiles.allReferenceSet(profile, this.pac, {
      profileNotFound: this._profileNotFound.bind(this),
    })

    this._state.set({
      currentProfileName: this._currentProfileName,
      isSystemProfile: this._isSystem,
      currentProfileCanAddRule: profile.rules != null && profile.profileType !== 'VirtualProfile',
    })
    this._setAvailableProfiles()

    this.currentProfileChanged(options?.reason)
    if (options && options.proxy === false) return Promise.resolve()
    this._tempProfileActive = false
    let applyProxy: Promise<unknown>
    if (this._tempProfile != null && Profiles.isIncludable(profile)) {
      this._tempProfileActive = true
      if (this._tempProfile.defaultProfileName !== profile.name) {
        this._tempProfile.defaultProfileName = profile.name
        this._tempProfile.color = profile.color
        Profiles.updateRevision(this._tempProfile)
      }

      const removedKeys: string[] = []
      for (const key of Object.keys(this._tempProfileRulesByProfile)) {
        const list = this._tempProfileRulesByProfile[key]
        if (!Profiles.byKey(key, this.pac)) {
          removedKeys.push(key)
          const rules = this._tempProfile.rules as TempRule[]
          for (const rule of list) {
            rule.profileName = null
            rules.splice(rules.indexOf(rule), 1)
          }
        }
      }
      if (removedKeys.length > 0) {
        for (const key of removedKeys) delete this._tempProfileRulesByProfile[key]
        Profiles.updateRevision(this._tempProfile)
      }

      this._watchingProfiles = Profiles.allReferenceSet(this._tempProfile, this.pac, {
        profileNotFound: this._profileNotFound.bind(this),
      })

      // Persist the temp profile so it survives an MV3 service-worker restart.
      this._saveTempRules()

      applyProxy = this.proxyImpl!.applyProfile(this._tempProfile, profile, this._options)
    } else {
      applyProxy = this.proxyImpl!.applyProfile(profile, profile, this._options)
    }

    if (options && options.update === false) return applyProxy

    applyProxy.then(() => {
      if (!((this._options['-downloadInterval'] as number) > 0)) return
      if (this._currentProfileName !== profile.name) return
      const updateProfiles: string[] = []
      for (const key of Object.keys(this._watchingProfiles)) {
        updateProfiles.push(this._watchingProfiles[key])
      }
      if (updateProfiles.length > 0) this.updateProfile(updateProfiles)
    })
    return applyProxy
  }

  currentProfile(): Profile | null | undefined {
    if (this._currentProfileName) return Profiles.byName(this._currentProfileName, this.pac)
    return this._externalProfile
  }

  isSystem(): boolean {
    return this._isSystem
  }

  /** Called when the current profile changes. Base: no-op. */
  currentProfileChanged(_reason?: unknown): void {
    return undefined
  }

  /** Set or disable quick-switch profiles. Base: no-op. */
  setQuickSwitch(_quickSwitch: string[] | null, _canEnable: boolean): Promise<unknown> {
    return Promise.resolve()
  }

  /** Schedule a recurring task. Base: no-op. */
  schedule(_name: string, _periodInMinutes: number, _callback: () => void): Promise<unknown> {
    return Promise.resolve()
  }

  isCurrentProfileStatic(): boolean {
    if (!this._currentProfileName) return true
    if (this._tempProfileActive) return false
    const currentProfile = this.currentProfile()
    if (currentProfile && Profiles.isInclusive(currentProfile)) return false
    return true
  }

  updateProfile(
    name?: string | string[] | null,
    opt_bypass_cache?: boolean,
  ): Promise<Record<string, Profile | Error>> {
    this.log.method('Options#updateProfile', this, [name, opt_bypass_cache])
    const results: Record<string, Promise<Profile | Error>> = {}
    Profiles.each(this.pac, (key, profile) => {
      if (name != null) {
        if (Array.isArray(name)) {
          if (name.indexOf(profile.name) < 0) return
        } else if (profile.name !== name) {
          return
        }
      }
      const url = Profiles.updateUrl(profile)
      if (url) {
        const typeHints = Profiles.updateContentTypeHints(profile)
        const fetchResult = this.fetchUrl(url, opt_bypass_cache, typeHints)
        results[key] = fetchResult
          .then((data): Profile | Promise<Profile> => {
            if (!data) return profile
            const p = Profiles.byKey(key, this.pac)!
            p.lastUpdate = new Date().toISOString()
            if (Profiles.update(p, data)) {
              Profiles.dropCache(p)
              const changes: StorageItems = {}
              changes[key] = p
              return Promise.resolve(this._setOptions(changes)).then(() => p)
            }
            return p
          })
          .catch((reason: unknown) => (reason instanceof Error ? reason : new Error(String(reason))))
      }
    })
    return promiseProps(results)
  }

  /** Make an HTTP GET request. Base: not implemented. */
  fetchUrl(_url: string, _opt_bypass_cache?: boolean, _opt_type_hints?: string[]): Promise<string> {
    return Promise.reject(new Error('not implemented'))
  }

  protected _replaceRefChanges(fromName: string, toName: string, changes?: StorageItems): StorageItems {
    changes ??= {}
    Profiles.each(this.pac, (_key, p) => {
      if (p.name === fromName || p.name === toName) return
      if (Profiles.replaceRef(p, fromName, toName)) {
        Profiles.updateRevision(p)
        changes![Profiles.nameAsKey(p)] = p
      }
    })

    if (this._options['-startupProfileName'] === fromName) changes['-startupProfileName'] = toName
    const quickSwitch = this._options['-quickSwitchProfiles'] as string[]
    if (quickSwitch && quickSwitch.indexOf(toName) < 0) {
      for (let i = 0; i < quickSwitch.length; i++) {
        if (quickSwitch[i] === fromName) {
          quickSwitch[i] = toName
          changes['-quickSwitchProfiles'] = quickSwitch
        }
      }
    }
    return changes
  }

  replaceRef(fromName: string, toName: string): Promise<unknown> | void {
    this.log.method('Options#replaceRef', this, [fromName, toName])
    const profile = Profiles.byName(fromName, this.pac)
    if (!profile) return Promise.reject(new Options.ProfileNotExistError(fromName))

    const changes = this._replaceRefChanges(fromName, toName)
    for (const key of Object.keys(changes)) this._options[key] = changes[key]

    const fromKey = Profiles.nameAsKey(fromName)
    if (this._watchingProfiles[fromKey]) {
      if (this._currentProfileName === fromName) this._currentProfileName = toName
      this.applyProfile(this._currentProfileName!)
    }
    return this._setOptions(changes)
  }

  renameProfile(fromName: string, toName: string): Promise<unknown> | void {
    this.log.method('Options#renameProfile', this, [fromName, toName])
    if (Profiles.byName(toName, this.pac)) {
      return Promise.reject(new Error(`Target name ${toName} already taken!`))
    }
    const profile = Profiles.byName(fromName, this.pac)
    if (!profile) return Promise.reject(new Options.ProfileNotExistError(fromName))

    profile.name = toName
    const changes: StorageItems = {}
    changes[Profiles.nameAsKey(profile)] = profile

    this._replaceRefChanges(fromName, toName, changes)
    for (const key of Object.keys(changes)) this._options[key] = changes[key]

    const fromKey = Profiles.nameAsKey(fromName)
    changes[fromKey] = undefined
    delete this._options[fromKey]

    if (this._watchingProfiles[fromKey]) {
      if (this._currentProfileName === fromName) this._currentProfileName = toName
      this.applyProfile(this._currentProfileName!)
    }
    return this._setOptions(changes)
  }

  addTempRule(domain: string, profileName: string): Promise<unknown> {
    this.log.method('Options#addTempRule', this, [domain, profileName])
    if (!this._currentProfileName) return Promise.resolve()
    const profile = Profiles.byName(profileName, this.pac)
    if (!profile) return Promise.reject(new Options.ProfileNotExistError(profileName))
    if (this._tempProfile == null) {
      this._tempProfile = Profiles.create('', 'SwitchProfile')
      const currentProfile = this.currentProfile()!
      this._tempProfile.color = currentProfile.color
      this._tempProfile.defaultProfileName = currentProfile.name
    }

    let changed = false
    let rule = this._tempProfileRules[domain]
    if (rule && rule.profileName) {
      if (rule.profileName !== profileName) {
        const key = Profiles.nameAsKey(rule.profileName)
        const list = this._tempProfileRulesByProfile[key]
        list.splice(list.indexOf(rule), 1)
        rule.profileName = profileName
        changed = true
      }
    } else {
      rule = {
        condition: { conditionType: 'HostWildcardCondition', pattern: '*.' + domain },
        profileName,
        isTempRule: true,
      }
      ;(this._tempProfile.rules as TempRule[]).push(rule)
      this._tempProfileRules[domain] = rule
      changed = true
    }

    const key = Profiles.nameAsKey(profileName)
    let rulesByProfile = this._tempProfileRulesByProfile[key]
    if (rulesByProfile == null) rulesByProfile = this._tempProfileRulesByProfile[key] = []
    rulesByProfile.push(rule)

    if (changed) {
      Profiles.updateRevision(this._tempProfile)
      return this.applyProfile(this._currentProfileName)
    }
    return Promise.resolve()
  }

  queryTempRule(domain: string): string | null {
    const rule = this._tempProfileRules[domain]
    if (rule) {
      if (rule.profileName) return rule.profileName
      delete this._tempProfileRules[domain]
    }
    return null
  }

  /**
   * Persist the temp profile to session storage. Temp rules live only in
   * memory, so under MV3 they would be lost every time the service worker is
   * terminated (~30 s idle); session storage survives SW restarts and clears on
   * browser restart, matching the original persistent-background lifetime.
   * No-op when no session store was provided.
   */
  protected _saveTempRules(): void {
    if (!this._session) return
    const rules = (this._tempProfile?.rules as TempRule[] | undefined) ?? []
    if (this._tempProfile && rules.length > 0) {
      this._session.set({ tempProfile: this._tempProfile }).catch(() => undefined)
    } else {
      this._session.remove(['tempProfile']).catch(() => undefined)
    }
  }

  /**
   * Rebuild the domain→rule and profile→rules lookup maps from the temp
   * profile's rules. Used after restoring the temp profile from session storage,
   * since only the profile itself (with its rules) is persisted.
   */
  protected _rebuildTempRuleIndexes(): void {
    this._tempProfileRules = {}
    this._tempProfileRulesByProfile = {}
    const rules = (this._tempProfile?.rules as TempRule[] | undefined) ?? []
    for (const rule of rules) {
      const pattern = rule.condition?.pattern
      // addTempRule stores conditions as HostWildcardCondition '*.' + domain.
      const domain = pattern?.startsWith('*.') ? pattern.slice(2) : pattern
      if (domain) this._tempProfileRules[domain] = rule
      if (rule.profileName) {
        const key = Profiles.nameAsKey(rule.profileName)
        ;(this._tempProfileRulesByProfile[key] ??= []).push(rule)
      }
    }
  }

  /**
   * Rehydrate the in-memory temp profile from session storage. Called during
   * init() before the current profile is applied, so a temp rule added before
   * an MV3 service-worker termination is re-applied on the next wake.
   */
  protected _restoreTempRules(): Promise<void> {
    if (!this._session) return Promise.resolve()
    return this._session
      .get({ tempProfile: null })
      .then((st) => {
        const tp = st['tempProfile'] as Profile | null
        if (tp && Array.isArray((tp as { rules?: unknown[] }).rules) && (tp.rules as unknown[]).length > 0) {
          this._tempProfile = tp
          this._rebuildTempRuleIndexes()
        }
      })
      .catch(() => undefined)
  }

  addCondition(condition: unknown, profileName: string): Promise<unknown> | void {
    this.log.method('Options#addCondition', this, [condition, profileName])
    if (!this._currentProfileName) return Promise.resolve()
    const profile = Profiles.byName(this._currentProfileName, this.pac)
    if (!profile?.rules) {
      return Promise.reject(new Error(`Cannot add condition to Profile ${profile?.name}`))
    }
    const target = Profiles.byName(profileName, this.pac)
    if (!target) return Promise.reject(new Options.ProfileNotExistError(profileName))
    const conditions = Array.isArray(condition) ? condition : [condition]

    const rules = profile.rules as Array<{ condition: unknown; profileName: string }>
    for (const cond of conditions) {
      const tag = Conditions.tag(cond)
      for (let i = 0; i < rules.length; i++) {
        if (Conditions.tag(rules[i].condition as never) === tag) {
          rules.splice(i, 1)
          break
        }
      }
      if (this._options['-addConditionsToBottom']) {
        rules.push({ condition: cond, profileName })
      } else {
        rules.unshift({ condition: cond, profileName })
      }
    }

    Profiles.updateRevision(profile)
    const changes: StorageItems = {}
    changes[Profiles.nameAsKey(profile)] = profile
    return this._setOptions(changes)
  }

  setDefaultProfile(profileName: string, defaultProfileName: string): Promise<unknown> | void {
    this.log.method('Options#setDefaultProfile', this, [profileName, defaultProfileName])
    const profile = Profiles.byName(profileName, this.pac)
    if (!profile) return Promise.reject(new Options.ProfileNotExistError(profileName))
    if (profile.defaultProfileName == null) {
      return Promise.reject(new Error(`Profile ${profile.name} does not have defaultProfileName!`))
    }
    const target = Profiles.byName(defaultProfileName, this.pac)
    if (!target) return Promise.reject(new Options.ProfileNotExistError(defaultProfileName))

    profile.defaultProfileName = defaultProfileName
    Profiles.updateRevision(profile)
    const changes: StorageItems = {}
    changes[Profiles.nameAsKey(profile)] = profile
    return this._setOptions(changes)
  }

  addProfile(profile: Profile): Promise<unknown> | void {
    this.log.method('Options#addProfile', this, [profile])
    if (Profiles.byName(profile.name, this.pac)) {
      return Promise.reject(new Error(`Target name ${profile.name} already taken!`))
    }
    const changes: StorageItems = {}
    changes[Profiles.nameAsKey(profile)] = profile
    return this._setOptions(changes)
  }

  matchProfile(request: {
    url: string
    host: string
    scheme: string
  }): Promise<{ profile: Profile | null | undefined; results: unknown[] }> {
    if (!this._currentProfileName) {
      return Promise.resolve({ profile: this._externalProfile, results: [] })
    }
    const results: unknown[] = []
    let profile: Profile | undefined | null = this._tempProfileActive
      ? this._tempProfile
      : Profiles.byName(this._currentProfileName, this.pac)
    let lastProfile = profile
    while (profile) {
      lastProfile = profile
      const result = Profiles.match(profile, request)
      if (result == null) break
      results.push(result)
      let next: string
      if (Array.isArray(result)) {
        next = result[0] as string
      } else if ((result as { profileName?: string }).profileName) {
        next = Profiles.nameAsKey((result as { profileName: string }).profileName)
      } else {
        break
      }
      profile = Profiles.byKey(next, this.pac)
    }
    return Promise.resolve({ profile: lastProfile, results })
  }

  setExternalProfile(
    profile: Profile,
    args?: { noRevert?: boolean; internal?: boolean },
  ): Promise<unknown> | void {
    if (this._options['-revertProxyChanges'] && !this._isSystem) {
      if (profile.name !== this._currentProfileName && this._currentProfileName) {
        if (!args?.noRevert) {
          this.applyProfile(this._revertToProfileName!)
          this._revertToProfileName = null
          return undefined
        }
        this._revertToProfileName ??= this._currentProfileName
      }
    }
    const p = Profiles.byName(profile.name, this.pac)
    if (p) {
      if (args?.internal) {
        this.applyProfile(p.name, { proxy: false })
      } else {
        this.applyProfile(p.name, { proxy: false, system: this._isSystem, reason: 'external' })
      }
      return undefined
    }
    this._currentProfileName = null
    this._externalProfile = profile
    profile.color ??= '#49afcd'
    this._state.set({
      currentProfileName: '',
      externalProfile: profile,
      validResultProfiles: [],
      currentProfileCanAddRule: false,
    })
    this.currentProfileChanged('external')
    return undefined
  }

  setOptionsSync(enabled: boolean, args?: { force?: boolean }): Promise<unknown> {
    this.log.method('Options#setOptionsSync', this, [enabled, args])
    if (!this.sync) return Promise.reject(new Error('Options syncing is unsupported.'))
    return this._state.get({ syncOptions: '' }).then(({ syncOptions }) => {
      if (!enabled) {
        if (syncOptions === 'sync') this._state.set({ syncOptions: 'conflict' })
        this.sync!.enabled = false
        this._syncWatchStop?.()
        this._syncWatchStop = null
        return undefined
      }

      if (syncOptions === 'conflict' && !args?.force) {
        return Promise.reject(
          new Error(
            'Syncing not enabled due to conflict. Retry with force to overwrite local options and enable syncing.',
          ),
        )
      }
      if (syncOptions === 'sync') return undefined
      return this._state.set({ syncOptions: 'sync' }).then(() => {
        if (syncOptions === 'conflict') {
          this.sync!.enabled = false
          return this._storage.remove().then(() => {
            this.sync!.enabled = true
            return this.init()
          })
        }
        this.sync!.enabled = true
        this._syncWatchStop?.()
        this.sync!.requestPush(this._options)
        this._syncWatchStop = this.sync!.watchAndPull(this._storage)
        return undefined
      })
    })
  }

  resetOptionsSync(): Promise<unknown> {
    this.log.method('Options#resetOptionsSync', this, [])
    if (!this.sync) return Promise.reject(new Error('Options syncing is unsupported.'))
    this.sync.enabled = false
    this._syncWatchStop?.()
    this._syncWatchStop = null
    this._state.set({ syncOptions: 'conflict' })
    return this.sync.storage.remove().then(() => {
      this._state.set({ syncOptions: 'pristine' })
    })
  }
}

// jsondiffpatch top-level patch, wrapped to keep the delta shape typed.
function jsonpatch(obj: OmegaOptions, delta: unknown): OmegaOptions {
  return jsonpatchImpl(obj, delta as never) as OmegaOptions
}
