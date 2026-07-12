// @switchyomega/omega-pac — public API surface.
//
// Platform-independent proxy profile model, rule engine, and PAC generator.
// Ported to TypeScript from the legacy CoffeeScript omega-pac.
// See docs/mv3-rewrite-plan.md §3.

export { Conditions } from './conditions.js'
export type { Condition, OmegaRequest } from './conditions.js'
export { Profiles } from './profiles.js'
export type { Profile, Proxy, Options } from './profiles.js'
export { PacGenerator } from './pac_generator.js'
export { RuleList, AutoProxy, Switchy } from './rule_list.js'
export type { Rule } from './rule_list.js'
export * as ShexpUtils from './shexp_utils.js'
export * as AST from './pac_ast.js'
export * as Ip from './ip.js'
export { Revision, AttachedCache, isIp, getBaseDomain, wildcardForDomain, wildcardForUrl } from './utils.js'
