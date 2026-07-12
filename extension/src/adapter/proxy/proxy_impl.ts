// Base proxy implementation. Ported from
// omega-target-chromium-extension/src/module/proxy/proxy_impl.coffee.
// Firefox (listener/script) impls are dropped — Chrome only.

import { Profiles, PacGenerator, type Profile } from '@switchyomega/omega-pac'
import type { ProxyImpl as IProxyImpl, OmegaOptions, LogType } from '@switchyomega/omega-core'

export abstract class ProxyImpl implements IProxyImpl {
  abstract readonly features: readonly string[]

  constructor(protected log: LogType) {}

  abstract applyProfile(profile: Profile, meta: Profile, options: OmegaOptions): Promise<unknown>

  watchProxyChange(_callback: (details: unknown) => void): void {
    return undefined
  }

  parseExternalProfile(_details: unknown, _options: OmegaOptions): Profile | null {
    return null
  }

  protected _profileNotFound(name: string): Profile {
    this.log.error(`Profile ${name} not found! Things may go very, very wrong.`)
    return Profiles.create({
      name,
      profileType: 'VirtualProfile',
      defaultProfileName: 'direct',
    } as Profile)
  }

  /** Apply proxy authentication for referenced profiles. Phase 4 implements this. */
  setProxyAuth(_profile: Profile, _options: OmegaOptions): Promise<unknown> {
    return Promise.resolve()
  }

  /** Build a PAC script for an inclusive profile, tagged with an identifying
   * header so external-change detection can recognize our own settings. */
  getProfilePacScript(profile: Profile, meta: Profile, options: OmegaOptions): string {
    meta ??= profile
    let ast = PacGenerator.script(options as never, profile, {
      profileNotFound: this._profileNotFound.bind(this),
    })
    ast = PacGenerator.compress(ast)
    const script = PacGenerator.ascii(ast.print_to_string())
    let profileName = PacGenerator.ascii(JSON.stringify(meta.name))
    profileName = profileName.replace(/\*/g, '\\u002a').replace(/\\/g, '\\u002f')
    const prefix = `/*OmegaProfile*${profileName}*${meta.revision}*/`
    return prefix + script
  }
}
