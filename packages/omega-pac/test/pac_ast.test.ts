import { describe, it, expect } from 'vitest'
import * as A from '../src/pac_ast.js'

describe('pac_ast', () => {
  it('emits an evaluable function whose behavior is correct', () => {
    const fn = new A.FunctionExpr({
      argnames: [
        new A.SymbolFunarg({ name: 'url' }),
        new A.SymbolFunarg({ name: 'host' }),
        new A.SymbolFunarg({ name: 'scheme' }),
      ],
      body: [
        new A.Return({
          value: new A.Binary({
            left: new A.SymbolRef({ name: 'scheme' }),
            operator: '===',
            right: new A.Str({ value: 'http' }),
          }),
        }),
      ],
    })
    const compiled = eval('(' + fn.print_to_string() + ')') as (
      url: string,
      host: string,
      scheme: string,
    ) => boolean
    expect(compiled('http://x/', 'x', 'http')).toBe(true)
    expect(compiled('https://x/', 'x', 'https')).toBe(false)
  })

  it('emits the isInNet call form without spaces', () => {
    const call = new A.Call({
      expression: new A.SymbolRef({ name: 'isInNet' }),
      args: [
        new A.SymbolRef({ name: 'host' }),
        new A.Str({ value: '192.168.1.1' }),
        new A.Str({ value: '255.255.0.0' }),
      ],
    })
    expect(call.print_to_string()).toContain('isInNet(host,"192.168.1.1","255.255.0.0")')
  })

  it('prints "use strict" as a bare directive', () => {
    expect(new A.Directive({ value: 'use strict' }).toStmt()).toBe('"use strict";')
  })

  it('emits an IIFE with a parenthesized callee', () => {
    const iife = new A.Call({
      expression: new A.FunctionExpr({
        argnames: [],
        body: [new A.Return({ value: new A.Num({ value: 42 }) })],
      }),
      args: [],
    })
    expect(eval(iife.print_to_string())).toBe(42)
  })
})
