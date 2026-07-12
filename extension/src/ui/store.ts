// store — the pinia options store. Holds a working copy of the options plus a
// last-saved snapshot; Apply sends a jsondiffpatch delta to the SW (matching the
// legacy diff-based save). Runtime state (current profile, available profiles)
// comes from the SW state store.

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { create } from 'jsondiffpatch'
import { Profiles, type Profile } from '@switchyomega/omega-pac'
import { callBackground, getState } from './messaging.js'

export type OmegaOptions = Record<string, unknown>

const differ = create({ objectHash: (obj: object) => JSON.stringify(obj) })
const clone = <T>(v: T): T => structuredClone(v)

export const useOptionsStore = defineStore('options', () => {
  const options = ref<OmegaOptions>({})
  const snapshot = ref<OmegaOptions>({})
  const state = ref<Record<string, unknown>>({})
  const loaded = ref(false)

  async function refreshState(): Promise<void> {
    state.value = await getState(null)
  }

  async function load(): Promise<void> {
    const opts = await callBackground<OmegaOptions>('getAll')
    options.value = clone(opts)
    snapshot.value = clone(opts)
    await refreshState()
    loaded.value = true
  }

  const isDirty = computed(() => differ.diff(snapshot.value, options.value) != null)

  const profiles = computed<Profile[]>(() => {
    const list: Profile[] = []
    for (const key of Object.keys(options.value)) {
      if (key[0] === '+') list.push(options.value[key] as Profile)
    }
    return list.sort((a, b) => a.name.localeCompare(b.name))
  })

  const currentProfileName = computed<string>(() => (state.value['currentProfileName'] as string) || '')

  function profile(name: string): Profile | undefined {
    return options.value['+' + name] as Profile | undefined
  }

  function setting<T = unknown>(key: string): T {
    return options.value[key] as T
  }
  function setSetting(key: string, value: unknown): void {
    options.value[key] = value
  }

  async function apply(): Promise<void> {
    const delta = differ.diff(snapshot.value, options.value)
    if (delta) {
      await callBackground('patch', delta)
      snapshot.value = clone(options.value)
      await refreshState()
    }
  }

  function discard(): void {
    options.value = clone(snapshot.value)
  }

  async function applyProfile(name: string): Promise<void> {
    await callBackground('applyProfile', name)
    await refreshState()
  }

  function addProfile(base: Partial<Profile> & { name: string; profileType: string }): Profile {
    const created = Profiles.create(clone(base) as Profile)
    Profiles.updateRevision(created)
    options.value['+' + created.name] = created
    return created
  }

  function deleteProfile(name: string): void {
    delete options.value['+' + name]
    const qs = options.value['-quickSwitchProfiles'] as string[] | undefined
    if (qs) options.value['-quickSwitchProfiles'] = qs.filter((n) => n !== name)
    if (options.value['-startupProfileName'] === name) options.value['-startupProfileName'] = ''
  }

  /** Rename requires SW-side reference updates; save pending edits first. */
  async function renameProfile(from: string, to: string): Promise<void> {
    await apply()
    await callBackground('renameProfile', from, to)
    await load()
  }

  function touchProfile(name: string): void {
    const p = profile(name)
    if (p) Profiles.updateRevision(p)
  }

  async function resetToOptions(opts: OmegaOptions): Promise<void> {
    await callBackground('reset', opts)
    await load()
  }

  return {
    options,
    state,
    loaded,
    isDirty,
    profiles,
    currentProfileName,
    load,
    refreshState,
    profile,
    setting,
    setSetting,
    apply,
    discard,
    applyProfile,
    addProfile,
    deleteProfile,
    renameProfile,
    touchProfile,
    resetToOptions,
  }
})
