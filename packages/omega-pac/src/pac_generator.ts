// pac_generator — assembles the final FindProxyForURL dispatcher PAC from a set
// of profiles. Ported from omega-pac/src/pac_generator.coffee.
//
// The uglify-js AST is replaced by ./pac_ast; the uglify compressor/mangler is
// dropped (the behavioral contract — correct FindProxyForURL output — is the
// gate, not byte size). `compress` is retained as an identity for API parity.

import * as A from './pac_ast.js'
import { Profiles, type Options, type Profile } from './profiles.js'

// Matches any non-ASCII UTF-16 code unit (U+0080..U+FFFF). Built from a string
// to keep the source file pure ASCII.
const NON_ASCII = new RegExp('[\\u0080-\\uffff]', 'g')

export const PacGenerator = {
  ascii(str: string): string {
    return str.replace(NON_ASCII, (char) => {
      const hex = char.charCodeAt(0).toString(16)
      return '\\u' + '0'.repeat(4 - hex.length) + hex
    })
  },

  compress<T extends A.Node>(ast: T): T {
    return ast
  },

  script(
    options: Options,
    profile: string | Profile,
    args?: { profileNotFound?: unknown },
  ): A.Toplevel {
    const resolved: Profile =
      typeof profile === 'string' ? Profiles.byName(profile, options)! : profile
    const refs = Profiles.allReferenceSet(resolved, options, {
      profileNotFound: args?.profileNotFound,
    })

    const properties: A.ObjectKeyVal[] = []
    for (const [key, name] of Object.entries(refs)) {
      if (key === '+direct') continue
      let p: Profile | null =
        typeof resolved === 'object' && resolved.name === name
          ? resolved
          : (Profiles.byName(name, options) ?? null)
      if (!p) p = Profiles.profileNotFound(name, args?.profileNotFound)
      properties.push(new A.ObjectKeyVal({ key, value: Profiles.compile(p!) }))
    }
    const profilesObj = new A.ObjectLit({ properties })

    // (function (init, profiles) { return function (url, host) { ... }; })
    const innerFn = new A.FunctionExpr({
      argnames: [new A.SymbolFunarg({ name: 'url' }), new A.SymbolFunarg({ name: 'host' })],
      body: [
        new A.Directive({ value: 'use strict' }),
        new A.Var({
          definitions: [
            new A.VarDef({ name: new A.SymbolVar({ name: 'result' }), value: new A.SymbolRef({ name: 'init' }) }),
            new A.VarDef({
              name: new A.SymbolVar({ name: 'scheme' }),
              value: new A.Call({
                expression: new A.Dot({ expression: new A.SymbolRef({ name: 'url' }), property: 'substr' }),
                args: [
                  new A.Num({ value: 0 }),
                  new A.Call({
                    expression: new A.Dot({ expression: new A.SymbolRef({ name: 'url' }), property: 'indexOf' }),
                    args: [new A.Str({ value: ':' })],
                  }),
                ],
              }),
            }),
          ],
        }),
        new A.Do({
          body: new A.BlockStatement({
            body: [
              new A.SimpleStatement({
                body: new A.Assign({
                  left: new A.SymbolRef({ name: 'result' }),
                  operator: '=',
                  right: new A.Sub({
                    expression: new A.SymbolRef({ name: 'profiles' }),
                    property: new A.SymbolRef({ name: 'result' }),
                  }),
                }),
              }),
              new A.If({
                condition: new A.Binary({
                  left: new A.UnaryPrefix({ operator: 'typeof', expression: new A.SymbolRef({ name: 'result' }) }),
                  operator: '===',
                  right: new A.Str({ value: 'function' }),
                }),
                body: new A.SimpleStatement({
                  body: new A.Assign({
                    left: new A.SymbolRef({ name: 'result' }),
                    operator: '=',
                    right: new A.Call({
                      expression: new A.SymbolRef({ name: 'result' }),
                      args: [
                        new A.SymbolRef({ name: 'url' }),
                        new A.SymbolRef({ name: 'host' }),
                        new A.SymbolRef({ name: 'scheme' }),
                      ],
                    }),
                  }),
                }),
              }),
            ],
          }),
          condition: new A.Binary({
            left: new A.Binary({
              left: new A.UnaryPrefix({ operator: 'typeof', expression: new A.SymbolRef({ name: 'result' }) }),
              operator: '!==',
              right: new A.Str({ value: 'string' }),
            }),
            operator: '||',
            right: new A.Binary({
              left: new A.Call({
                expression: new A.Dot({ expression: new A.SymbolRef({ name: 'result' }), property: 'charCodeAt' }),
                args: [new A.Num({ value: 0 })],
              }),
              operator: '===',
              right: new A.Num({ value: '+'.charCodeAt(0) }),
            }),
          }),
        }),
        new A.Return({ value: new A.SymbolRef({ name: 'result' }) }),
      ],
    })

    const factory = new A.FunctionExpr({
      argnames: [new A.SymbolFunarg({ name: 'init' }), new A.SymbolFunarg({ name: 'profiles' })],
      body: [new A.Return({ value: innerFn })],
    })

    return new A.Toplevel({
      body: [
        new A.Var({
          definitions: [
            new A.VarDef({
              name: new A.SymbolVar({ name: 'FindProxyForURL' }),
              value: new A.Call({
                expression: factory,
                args: [Profiles.profileResult(resolved.name), profilesObj],
              }),
            }),
          ],
        }),
      ],
    })
  },
}

export default PacGenerator
