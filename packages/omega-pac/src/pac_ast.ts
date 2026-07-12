// pac_ast — a minimal, dependency-free JavaScript AST emitter.
//
// Replaces the legacy dependency on uglify-js (v2) whose AST classes were used
// purely to *build* and *print* the generated PAC (FindProxyForURL) script and
// per-condition boolean expressions. We only ever need to CONSTRUCT nodes and
// print valid JavaScript — never parse or optimize — so this is a small typed
// set of node classes mirroring the uglify AST_* nodes the codebase used.
//
// Printing strategy: correctness over compactness. Expression nodes are
// aggressively parenthesized so operator precedence can never change meaning
// (over-parenthesizing an expression is always semantically safe in JS). The
// generated string is *data* handed to chrome.proxy — it runs inside Chrome's
// own PAC sandbox, never via eval() in the extension (CSP-safe). See
// docs/mv3-rewrite-plan.md §4.3.

/** Any AST node can render as an expression and (where valid) as a statement. */
export interface Node {
  /** Optional leading block comment, printed before the node. */
  commentBefore?: string
  /** Render as a JS expression (parenthesized for precedence safety). */
  toExpr(): string
  /** Render as a JS statement (with its own terminator). */
  toStmt(): string
  /** Public entry mirroring uglify's `print_to_string()`. */
  print_to_string(): string
}

const sanitizeComment = (s: string): string => s.replace(/\*\//g, '* /')

abstract class Base implements Node {
  /** Optional leading block comment (used by Conditions.comment / between). */
  commentBefore?: string
  abstract toExpr(): string
  toStmt(): string {
    return this.toExpr() + ';'
  }
  print_to_string(): string {
    return this.toStmt === Base.prototype.toStmt ? this.toExpr() : this.toStmt()
  }
  protected comment(): string {
    return this.commentBefore ? `/*${sanitizeComment(this.commentBefore)}*/ ` : ''
  }
}

const renderBody = (body: Node[]): string => body.map((n) => n.toStmt()).join('\n')

// ---------- Symbols / identifiers ----------

export class SymbolRef extends Base {
  name: string
  constructor(props: { name: string }) {
    super()
    this.name = props.name
  }
  toExpr(): string {
    return this.comment() + this.name
  }
}

export class SymbolVar extends Base {
  name: string
  constructor(props: { name: string }) {
    super()
    this.name = props.name
  }
  toExpr(): string {
    return this.name
  }
}

export class SymbolFunarg extends Base {
  name: string
  constructor(props: { name: string }) {
    super()
    this.name = props.name
  }
  toExpr(): string {
    return this.name
  }
}

/**
 * Verbatim raw code injection (used to splice a user's PAC script into the
 * generated wrapper). Prints its content untouched, as a self-terminating
 * statement — no extra semicolon is appended.
 */
export class Raw extends Base {
  code: string
  constructor(code: string) {
    super()
    this.code = code
  }
  toExpr(): string {
    return this.code
  }
  override toStmt(): string {
    return this.code
  }
  aborts(): boolean {
    return false
  }
}

// ---------- Literals ----------

export class Num extends Base {
  value: number
  constructor(props: { value: number }) {
    super()
    this.value = props.value
  }
  toExpr(): string {
    return this.comment() + String(this.value)
  }
}

export class Str extends Base {
  value: string
  constructor(props: { value: string }) {
    super()
    this.value = props.value
  }
  toExpr(): string {
    return this.comment() + JSON.stringify(this.value)
  }
}

export class RegExpLit extends Base {
  value: RegExp
  constructor(props: { value: RegExp }) {
    super()
    this.value = props.value
  }
  toExpr(): string {
    // RegExp.prototype.toString() yields a literal-safe /source/flags form
    // (forward slashes escaped, empty source rendered as /(?:)/).
    return this.comment() + this.value.toString()
  }
}

export class True extends Base {
  toExpr(): string {
    return this.comment() + 'true'
  }
}

export class False extends Base {
  toExpr(): string {
    return this.comment() + 'false'
  }
}

export class This extends Base {
  toExpr(): string {
    return 'this'
  }
}

// ---------- Operators ----------

export class Binary extends Base {
  left: Node
  operator: string
  right: Node
  constructor(props: { left: Node; operator: string; right: Node }) {
    super()
    this.left = props.left
    this.operator = props.operator
    this.right = props.right
  }
  toExpr(): string {
    return `${this.comment()}(${this.left.toExpr()} ${this.operator} ${this.right.toExpr()})`
  }
}

export class UnaryPrefix extends Base {
  operator: string
  expression: Node
  constructor(props: { operator: string; expression: Node }) {
    super()
    this.operator = props.operator
    this.expression = props.expression
  }
  toExpr(): string {
    return `${this.comment()}(${this.operator} ${this.expression.toExpr()})`
  }
}

export class Conditional extends Base {
  condition: Node
  consequent: Node
  alternative: Node
  constructor(props: { condition: Node; consequent: Node; alternative: Node }) {
    super()
    this.condition = props.condition
    this.consequent = props.consequent
    this.alternative = props.alternative
  }
  toExpr(): string {
    return `${this.comment()}(${this.condition.toExpr()} ? ${this.consequent.toExpr()} : ${this.alternative.toExpr()})`
  }
}

export class Assign extends Base {
  left: Node
  operator: string
  right: Node
  constructor(props: { left: Node; operator: string; right: Node }) {
    super()
    this.left = props.left
    this.operator = props.operator
    this.right = props.right
  }
  toExpr(): string {
    return `(${this.left.toExpr()} ${this.operator} ${this.right.toExpr()})`
  }
}

// ---------- Access / calls ----------

const needsCalleeParens = (n: Node): boolean =>
  n instanceof FunctionExpr || n instanceof Conditional || n instanceof Binary || n instanceof Assign

export class Dot extends Base {
  expression: Node
  property: string
  constructor(props: { expression: Node; property: string }) {
    super()
    this.expression = props.expression
    this.property = props.property
  }
  toExpr(): string {
    return `${this.expression.toExpr()}.${this.property}`
  }
}

export class Sub extends Base {
  expression: Node
  property: Node
  constructor(props: { expression: Node; property: Node }) {
    super()
    this.expression = props.expression
    this.property = props.property
  }
  toExpr(): string {
    return `${this.expression.toExpr()}[${this.property.toExpr()}]`
  }
}

export class Call extends Base {
  expression: Node
  args: Node[]
  constructor(props: { expression: Node; args: Node[] }) {
    super()
    this.expression = props.expression
    this.args = props.args
  }
  toExpr(): string {
    const callee = this.expression.toExpr()
    const target = needsCalleeParens(this.expression) ? `(${callee})` : callee
    // Args joined WITHOUT spaces — some tests assert exact call substrings.
    return `${this.comment()}${target}(${this.args.map((a) => a.toExpr()).join(',')})`
  }
}

export class New extends Base {
  expression: Node
  args: Node[]
  constructor(props: { expression: Node; args: Node[] }) {
    super()
    this.expression = props.expression
    this.args = props.args
  }
  toExpr(): string {
    const callee = this.expression.toExpr()
    const target = needsCalleeParens(this.expression) ? `(${callee})` : callee
    return `new ${target}(${this.args.map((a) => a.toExpr()).join(',')})`
  }
}

// ---------- Functions / statements ----------

export class FunctionExpr extends Base {
  argnames: Array<SymbolFunarg | SymbolVar>
  body: Node[]
  constructor(props: { argnames: Array<SymbolFunarg | SymbolVar>; body: Node[] }) {
    super()
    this.argnames = props.argnames
    this.body = props.body
  }
  toExpr(): string {
    const args = this.argnames.map((a) => a.name).join(',')
    return `function(${args}){${renderBody(this.body)}}`
  }
}

export class Return extends Base {
  value?: Node
  constructor(props: { value?: Node } = {}) {
    super()
    this.value = props.value
  }
  toExpr(): string {
    return this.value ? `return ${this.value.toExpr()}` : 'return'
  }
  override toStmt(): string {
    return this.toExpr() + ';'
  }
}

export class VarDef {
  name: SymbolVar
  value?: Node
  constructor(props: { name: SymbolVar; value?: Node }) {
    this.name = props.name
    this.value = props.value
  }
  render(): string {
    return this.value ? `${this.name.name} = ${this.value.toExpr()}` : this.name.name
  }
}

export class Var extends Base {
  definitions: VarDef[]
  constructor(props: { definitions: VarDef[] }) {
    super()
    this.definitions = props.definitions
  }
  toExpr(): string {
    return 'var ' + this.definitions.map((d) => d.render()).join(',')
  }
  override toStmt(): string {
    return this.toExpr() + ';'
  }
}

export class Directive extends Base {
  value: string
  constructor(props: { value: string }) {
    super()
    this.value = props.value
  }
  toExpr(): string {
    return JSON.stringify(this.value)
  }
  // Must print exactly as a string-literal statement to remain a directive
  // prologue (e.g. "use strict";) — never parenthesized.
  override toStmt(): string {
    return JSON.stringify(this.value) + ';'
  }
}

/** A block `{ ... }`. */
export class BlockStatement extends Base {
  body: Node[]
  constructor(props: { body: Node[] }) {
    super()
    this.body = props.body
  }
  toExpr(): string {
    return this.toStmt()
  }
  override toStmt(): string {
    return `{${renderBody(this.body)}}`
  }
}

/** An expression used in statement position. */
export class SimpleStatement extends Base {
  body: Node
  constructor(props: { body: Node }) {
    super()
    this.body = props.body
  }
  toExpr(): string {
    return this.body.toExpr()
  }
  override toStmt(): string {
    return this.body.toExpr() + ';'
  }
}

const asBlock = (n: Node): string =>
  n instanceof BlockStatement ? n.toStmt() : `{${n.toStmt()}}`

export class If extends Base {
  condition: Node
  body: Node
  alternative?: Node
  constructor(props: { condition: Node; body: Node; alternative?: Node }) {
    super()
    this.condition = props.condition
    this.body = props.body
    this.alternative = props.alternative
  }
  toExpr(): string {
    return this.toStmt()
  }
  override toStmt(): string {
    let out = `if (${this.condition.toExpr()}) ${asBlock(this.body)}`
    if (this.alternative) out += ` else ${asBlock(this.alternative)}`
    return out
  }
}

export class Do extends Base {
  body: Node
  condition: Node
  constructor(props: { body: Node; condition: Node }) {
    super()
    this.body = props.body
    this.condition = props.condition
  }
  toExpr(): string {
    return this.toStmt()
  }
  override toStmt(): string {
    return `do ${asBlock(this.body)} while (${this.condition.toExpr()});`
  }
}

export class Case extends Base {
  expression: Node
  body: Node[]
  constructor(props: { expression: Node; body: Node[] }) {
    super()
    this.expression = props.expression
    this.body = props.body
  }
  toExpr(): string {
    return this.toStmt()
  }
  override toStmt(): string {
    return `case ${this.expression.toExpr()}: ${renderBody(this.body)}`
  }
}

export class Default extends Base {
  body: Node[]
  constructor(props: { body: Node[] }) {
    super()
    this.body = props.body
  }
  toExpr(): string {
    return this.toStmt()
  }
  override toStmt(): string {
    return `default: ${renderBody(this.body)}`
  }
}

export class Switch extends Base {
  expression: Node
  body: Array<Case | Default>
  constructor(props: { expression: Node; body: Array<Case | Default> }) {
    super()
    this.expression = props.expression
    this.body = props.body
  }
  toExpr(): string {
    return this.toStmt()
  }
  override toStmt(): string {
    return `switch (${this.expression.toExpr()}) {${this.body.map((c) => c.toStmt()).join('\n')}}`
  }
}

export class ObjectKeyVal {
  key: string
  value: Node
  constructor(props: { key: string; value: Node }) {
    this.key = props.key
    this.value = props.value
  }
  render(): string {
    return `${JSON.stringify(this.key)}:${this.value.toExpr()}`
  }
}

export class ObjectLit extends Base {
  properties: ObjectKeyVal[]
  constructor(props: { properties: ObjectKeyVal[] }) {
    super()
    this.properties = props.properties
  }
  toExpr(): string {
    return `{${this.properties.map((p) => p.render()).join(',')}}`
  }
}

export class Toplevel extends Base {
  body: Node[]
  constructor(props: { body: Node[] }) {
    super()
    this.body = props.body
  }
  toExpr(): string {
    return renderBody(this.body)
  }
  override toStmt(): string {
    return renderBody(this.body)
  }
  override print_to_string(): string {
    return renderBody(this.body)
  }
}
