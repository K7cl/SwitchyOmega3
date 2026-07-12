// messaging — typed RPC client for UI pages talking to the service worker.
// Mirrors the SW's message router: { method, args } -> options[method](...args),
// or getState -> state.get(keys). See adapter/messaging.ts.

interface RpcResponse {
  result?: unknown
  error?: { _error?: string; name?: string; message?: string; reason?: string }
}

function decodeError(error: NonNullable<RpcResponse['error']>): Error {
  const err = new Error(error.message ?? error.reason ?? 'Background error')
  if (error.name) err.name = error.name
  return err
}

export function callBackground<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    chrome.runtime.sendMessage({ method, args }, (response: RpcResponse | undefined) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }
      if (!response) {
        resolve(undefined as T)
        return
      }
      if (response.error) {
        reject(decodeError(response.error))
        return
      }
      resolve(response.result as T)
    })
  })
}

/** Fire-and-forget variant (SW replies are ignored). */
export function notifyBackground(method: string, ...args: unknown[]): void {
  chrome.runtime.sendMessage({ method, args, noReply: true })
}

export function getState<T = Record<string, unknown>>(keys: string | string[] | null): Promise<T> {
  return callBackground<T>('getState', keys)
}
