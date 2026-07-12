// @switchyomega/omega-core — browser-independent options manager.
//
// Ported to TypeScript from the legacy CoffeeScript omega-target.
// See docs/mv3-rewrite-plan.md §3.

export { Log } from './log.js'
export type { LogType } from './log.js'
export { Storage } from './storage.js'
export type { StorageItems, WriteOperations, MergeFn, ChangesInput, WatchCallback } from './storage.js'
export { BrowserStorage } from './browser_storage.js'
export type { WebStorageLike } from './browser_storage.js'
export { Options } from './options.js'
export { OptionsSync } from './options_sync.js'
export { TokenBucket } from './token_bucket.js'
export { getDefaultOptions } from './default_options.js'
export type { ProxyImpl } from './proxy_impl.js'
export type { OmegaOptions, Profile } from './types.js'
export * as Errors from './errors.js'

// Re-export omega-pac for convenience (legacy index exposed OmegaPac).
export * as OmegaPac from '@switchyomega/omega-pac'
