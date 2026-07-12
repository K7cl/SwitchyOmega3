// messaging — the RPC bridge between UI pages (options/popup) and the SW.
// A message { method, args, noReply?, refreshActivePage? } invokes
// options[method](...args) (or state.get for 'getState') and replies with
// { result } or { error }. Ported from background.coffee's onMessage handler.
//
// chrome.runtime.onMessage only receives from same-extension contexts, so no
// external-sender validation is needed (the external API was dropped).

import type { Storage } from '@switchyomega/omega-core'
import type { ChromeOptions } from './chrome_options.js'

interface RpcRequest {
  method: string
  args?: unknown[]
  noReply?: boolean
  refreshActivePage?: boolean
}

function encodeError(obj: unknown): unknown {
  if (obj instanceof Error) {
    return { _error: 'error', name: obj.name, message: obj.message, stack: obj.stack }
  }
  return obj
}

function refreshActivePageIfEnabled(): void {
  chrome.tabs.query({ active: true, lastFocusedWindow: true }).then((tabs) => {
    const tab = tabs[0]
    if (!tab?.url || tab.id == null) return
    if (
      tab.url.substr(0, 6) === 'chrome' ||
      tab.url.substr(0, 6) === 'about:' ||
      tab.url.substr(0, 4) === 'moz-'
    ) {
      return
    }
    chrome.tabs.reload(tab.id, { bypassCache: true })
  })
}

export function installMessageRouter(options: ChromeOptions, state: Storage): void {
  chrome.runtime.onMessage.addListener((request: RpcRequest, _sender, respond) => {
    if (!request || !request.method) return undefined
    options.ready?.then(() => {
      let target: object
      let method: unknown
      if (request.method === 'getState') {
        target = state
        method = state.get
      } else {
        target = options
        method = (options as unknown as Record<string, unknown>)[request.method]
      }
      if (typeof method !== 'function') {
        respond({ error: { reason: 'noSuchMethod' } })
        return
      }
      const promise = Promise.resolve().then(() =>
        (method as (...a: unknown[]) => unknown).apply(target, request.args ?? []),
      )
      if (request.refreshActivePage) promise.then(refreshActivePageIfEnabled)
      if (request.noReply) return
      promise
        .then((result) => {
          if (request.method === 'updateProfile' && result && typeof result === 'object') {
            const r = result as Record<string, unknown>
            for (const k of Object.keys(r)) r[k] = encodeError(r[k])
          }
          respond({ result })
        })
        .catch((error) => respond({ error: encodeError(error) }))
    })
    // Keep the message channel open for the async response.
    return !request.noReply
  })
}
