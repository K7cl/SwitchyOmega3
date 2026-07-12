// log — pretty-printing + logging singleton. Ported from omega-target/src/log.coffee.
// Secrets (username/password/host/port) are redacted when serializing objects.

const replacer = (key: string, value: unknown): unknown => {
  switch (key) {
    case 'username':
    case 'password':
    case 'host':
    case 'port':
      return '<secret>'
    default:
      return value
  }
}

interface DebugStrCarrier {
  debugStr?: string | (() => string)
}

export const Log = {
  /** Pretty-print an object into a string (redacting secrets). */
  str(obj: unknown): string {
    if (typeof obj === 'object' && obj !== null) {
      const carrier = obj as DebugStrCarrier
      if (carrier.debugStr != null) {
        return typeof carrier.debugStr === 'function' ? carrier.debugStr() : carrier.debugStr
      } else if (obj instanceof Error) {
        return obj.stack || obj.message
      }
      return JSON.stringify(obj, replacer, 4)
    } else if (typeof obj === 'function') {
      return obj.name ? `<f: ${obj.name}>` : obj.toString()
    }
    return '' + obj
  },

  log(...args: unknown[]): void {
    console.log(...args)
  },

  error(...args: unknown[]): void {
    console.error(...args)
  },

  /** Log a function call with name and arguments. */
  func(name: string, args: ArrayLike<unknown>): void {
    this.log(name, '(', [].slice.call(args), ')')
  },

  /** Log a method call with target and arguments. */
  method(name: string, self: unknown, args: ArrayLike<unknown>): void {
    this.log(this.str(self), '<<', name, [].slice.call(args))
  },
}

export type LogType = typeof Log
