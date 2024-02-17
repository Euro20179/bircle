import { max, min } from "lodash"
import { isBetween, isNumeric, choice, randInt } from "./util"
import units, { LengthUnit } from "./units"

let unit_names: string[] = []
for (let key in units) {
    unit_names.push(units[key as keyof typeof units].shorthand)
    unit_names.push(units[key as keyof typeof units].longname)
}

class FunctionError extends Error {
    constructor(msg: string) {
        super(msg)
        this.name = "FunctionError"
    }
}

class OperatorError extends Error {
    constructor(msg: string) {
        super(msg)
        this.name = 'OperatorError'
    }
}

enum TT {
    "hash",
    "string",
    "comma",
    "number",
    "lparen",
    "rparen",
    "percent",
    "plus",
    "pluseq",
    "minus",
    "minuseq",
    "mul",
    "muleq",
    "div",
    "diveq",
    'pow',
    poweq,
    root,
    rooteq,
    semi,
    ident,
    keyword,
    eq,
    "number_suffix",
    "special_literal",
    "pipe",
    "lt",
    "le",
    gt,
    ge,
    unit
}

const ENDFUNC = 'rav',
    CREATE_VAR = 'var',
    IF = 'if',
    THEN = 'then',
    ELSE = 'else',
    ENDIF = 'fi',
    ELIF = 'elif',
    SETREL = 'setrel',
    WHILE = 'while',
    DONE = 'done'
const KEYWORDS = [ENDFUNC, CREATE_VAR, IF, THEN, ELSE, ENDIF, ELIF, SETREL, WHILE, DONE] as const


type TokenDataType = {
    [TT.hash]: "#",
    [TT.string]: string,
    [TT.comma]: ",",
    [TT.number]: number,
    [TT.lparen]: "(",
    [TT.rparen]: ")",
    [TT.percent]: "%",
    [TT.number_suffix]: 'K' | 'M' | 'B' | 'T'
    [TT.plus]: "+",
    [TT.pluseq]: "+=",
    [TT.minus]: "-",
    [TT.minuseq]: "-=",
    [TT.mul]: "*",
    [TT.muleq]: "*=",
    [TT.div]: "/",
    [TT.diveq]: "/="
    [TT.pow]: "^",
    [TT.poweq]: "^=",
    [TT.root]: "^/",
    [TT.rooteq]: "^/=",
    [TT.special_literal]: string,
    [TT.semi]: ';',
    [TT.ident]: string,
    [TT.eq]: '=',
    [TT.keyword]: typeof KEYWORDS[number],
    [TT.pipe]: "|",
    [TT.le]: "<=",
    [TT.lt]: "<",
    [TT.gt]: ">",
    [TT.ge]: ">=",
    [TT.unit]: string
}

class Token<TokenType extends TT> {
    constructor(public type: TokenType, public data: TokenDataType[TokenType]) { }
}

class Lexer {
    tokens: Token<TT>[] = []

    #curChar: string[number] | undefined
    #i: number = -1

    #whitespace = "\n\t "
    #specialChars = `#,()+-*/÷${this.#whitespace};="'`


    constructor(public data: string, public specialLiterals: string[] = []) { }

    advance() {
        if ((this.#curChar = this.data[++this.#i]) === undefined) {
            return false;
        }
        return this.#curChar
    }

    back() {
        if ((this.#curChar = this.data[--this.#i]) === undefined) {
            return false;
        }
        return this.#curChar;
    }

    get atEnd() {
        return this.#curChar === undefined
    }

    parseNumber() {
        let n = this.#curChar as string
        let hasDot = n === '.'
        while (this.advance() !== false &&
            (isNumeric(this.#curChar as string) || (this.#curChar === '.' && !hasDot))) {
            if (this.#curChar === '.') hasDot = true
            n += this.#curChar as string
        }
        let number = Number(n)
        if ('kmbt'.includes(this.#curChar as string)) {
            switch (this.#curChar) {
                case 'k': number *= 1000; break;
                case 'm': number *= 1_000_000; break;
                case 'b': number *= 1_000_000_000; break;
                case 't': number *= 1_000_000_000_000; break;
            }
        }
        //only go back if we have not reached the end and is not a special case suffix
        else if (!this.atEnd) {
            this.back()
        }
        return number
    }

    parseLiteral() {
        let s = this.#curChar as string
        while (
            this.advance() !== false && !this.#specialChars.includes(this.#curChar as string)
        ) {
            s += this.#curChar as string
        }
        //only go back if we have not reached the end
        if (!this.atEnd) this.back()
        return s
    }

    parseString() {
        let quoteType = this.#curChar
        let s = ""
        let escaped = false
        while (this.advance() !== false && (this.#curChar !== quoteType && !escaped)) {
            if (this.#curChar === '\\') {
                escaped = true;
                continue;
            }
            escaped = false;
            s += this.#curChar;
        }
        return s;
    }

    buildMul() {
        this.advance()
        if (this.#curChar === '*') {
            return new Token(TT.pow, '^')
        }
        this.back()
        return new Token(TT.mul, '*')
    }

    buildInequality() {
        let start = this.#curChar
        if (this.advance() && this.#curChar === '=') {
            return start + '='
        }
        this.back()
        return start
    }

    tokenize() {
        //this.advance() could return empty string which is still technically valid
        while (this.advance() !== false) {
            if (this.#whitespace.includes(this.#curChar as string)) continue;
            if (isNumeric(this.#curChar as string) || this.#curChar === '.') {
                this.tokens.push(new Token(TT.number, this.parseNumber()))
                continue;
            }
            switch (this.#curChar) {
                case ';': {
                    this.tokens.push(new Token(TT.semi, ';'))
                    break;
                }
                case "#": {
                    this.tokens.push(new Token(TT.hash, "#"))
                    break;
                }
                case "(": {
                    this.tokens.push(new Token(TT.lparen, "("))
                    break;
                }
                case ")": {
                    this.tokens.push(new Token(TT.rparen, ")"))
                    break;
                }
                case '|': {
                    this.tokens.push(new Token(TT.pipe, '|'))
                    break;
                }
                case ",": {
                    this.tokens.push(new Token(TT.comma, ","))
                    break;
                }
                case "%": {
                    this.tokens.push(new Token(TT.percent, "%"))
                    break;
                }
                case "$": {
                    this.advance()
                    this.tokens.push(new Token(TT.number, this.parseNumber()))
                    break;
                }
                case "+": {
                    this.tokens.push(new Token(TT.plus, "+"))
                    break
                }
                case "-": {
                    this.tokens.push(new Token(TT.minus, "-"))
                    break
                }
                case "/": {
                    if (this.tokens[this.tokens.length - 1].type === TT.pow) {
                        this.tokens.pop()
                        this.tokens.push(new Token(TT.root, '^/'))
                        break;
                    }
                    //unintentional no break here so it moves to next div case
                }
                case "÷": {
                    this.tokens.push(new Token(TT.div, "/"))
                    break
                }
                case "^": {
                    this.tokens.push(new Token(TT.pow, "^"))
                    break;
                }
                case "*": {
                    this.tokens.push(this.buildMul())
                    break;
                }
                case "'":
                case '"': {
                    this.tokens.push(new Token(TT.string, this.parseString()))
                    break;
                }
                case '=': {
                    let tok;
                    switch (this.tokens[this.tokens.length - 1].type) {
                        case TT.mul: tok = new Token(TT.muleq, "*="); break;
                        case TT.div: tok = new Token(TT.diveq, "/="); break;
                        case TT.minus: tok = new Token(TT.minuseq, "-="); break;
                        case TT.plus: tok = new Token(TT.pluseq, "+="); break;
                        case TT.pow: tok = new Token(TT.poweq, "^="); break;
                        case TT.root: tok = new Token(TT.rooteq, "^/="); break;
                    }
                    if (tok) {
                        this.tokens[this.tokens.length - 1] = tok
                    }
                    else this.tokens.push(new Token(TT.eq, "="))
                    break;
                }
                case '>': {
                    let data = this.buildInequality()
                    this.tokens.push(
                        data === ">" ? new Token(TT.gt, ">") : new Token(TT.ge, ">=")
                    )
                    break;
                }
                case '<': {
                    let data = this.buildInequality()
                    this.tokens.push(
                        data === "<" ? new Token(TT.lt, "<") : new Token(TT.le, "<=")
                    )
                    break;
                }
                case 'M': case 'B': case 'K': case 'T': {
                    this.tokens.push(new Token(TT.number_suffix, this.#curChar))
                    break;
                }
                default: {
                    let str = this.parseLiteral()
                    if (unit_names.includes(str)) {
                        this.tokens.push(new Token(TT.unit, str as typeof unit_names[number]))
                    }
                    else if (KEYWORDS.includes(str as typeof KEYWORDS[number])) {
                        this.tokens.push(new Token(TT.keyword, str as typeof KEYWORDS[number]))
                    }
                    else this.tokens.push(new Token(TT.ident, str))
                }
            }
        }
    }
}

type EnvironBase = Record<
    string, ((total: number, k: string) => number) | number | string | Type<TT>
>

class SymbolTable extends Map {
    parent?: SymbolTable
    constructor(base?: EnvironBase, parent?: SymbolTable) {
        super()
        for (let key in base) {
            this.set(key, base[key])
        }
        this.parent = parent
    }

    get(key: string): NumberType | StringType | ((total: number, k: string) => number) | Type<ValidJSTypes> {
        let val = super.get(key);
        if (!val && this.parent) {
            val = this.parent.get(key)
        }
        if (!val) {
            return new NumberType(0)
        }
        else if (typeof val === 'string') {
            return new StringType(val)
        }
        else if (typeof val === 'number') {
            return new NumberType(val)
        }
        return val
    }

    repr() {
        let text = `SymbolTable{`
        for (let [k, v] of this.entries()) {
            text += `\n\t${k} = ${v}`
        }
        return text + "\n}"
    }
}

abstract class Node {
    abstract visit(program: ProgramNode, table: SymbolTable): Type<any>
    abstract repr(indent: number): string
}

type ValidJSTypes = string | number | UserFunction | LengthUnit

abstract class Type<JSType extends ValidJSTypes>{
    protected data: JSType
    type: string
    constructor(internalData: JSType) {
        this.data = internalData
        this.type = "Type"
    }
    abstract access(): JSType
    abstract add(other: Type<any>): Type<JSType>
    abstract iadd(other: Type<any>): Type<JSType>
    abstract mul(other: Type<any>): Type<JSType>
    abstract imul(other: Type<any>): Type<JSType>
    abstract sub(other: Type<any>): Type<JSType>
    abstract isub(other: Type<any>): Type<JSType>
    abstract div(other: Type<any>): Type<JSType>
    abstract idiv(other: Type<any>): Type<JSType>

    abstract truthy(): boolean

    abstract string(): StringType
    abstract number(): NumberType

    toString() {
        return `[${this.type}] ${this.string().access()}`
    }
}

class UnitType extends Type<LengthUnit> {
    type = "unit"
    access(): LengthUnit {
        return this.data
    }

    string(): StringType {
        return new StringType(`${this.data.value}${this.data.getShorthand()}`)
    }

    number(): NumberType {
        return new NumberType(this.data.value)
    }

    truthy(): boolean {
        return this.data.value !== 0
    }

    sub(other: Type<any>): Type<LengthUnit> {
        if (other instanceof NumberType) {
            return new UnitType(
                LengthUnit.fromUnitRepr(
                    `${this.data.value - other.access()}${this.data.getShorthand()}`
                )
            )
        }
        else if (other instanceof UnitType) {
            return new UnitType(
                //@ts-ignore
                LengthUnit.fromUnitRepr(`${this.data.value - other.access().toUnit(this.data.constructor).value}${this.data.constructor.shorthand}`)
            )
        }
        throw new TypeError(`(Relscript): Cannot add Unit and ${other.constructor.name}`)
    }

    add(other: Type<any>): Type<LengthUnit> {
        if (other instanceof NumberType) {
            return new UnitType(LengthUnit.fromUnitRepr(`${this.data.value + other.access()}${this.data.getShorthand()}`))
        }
        else if (other instanceof UnitType) {
            return new UnitType(
                //@ts-ignore
                LengthUnit.fromUnitRepr(`${this.data.value + other.access().toUnit(this.data.constructor).value}${this.data.constructor.shorthand}`)
            )
        }
        throw new TypeError(`(Relscript): Cannot add Unit and ${other.constructor.name}`)
    }

    isub(other: Type<any>): Type<LengthUnit> {
        if (other instanceof NumberType) {
            this.data.value -= other.access()
            return this
        }
        else if (other instanceof UnitType) {
            //@ts-ignore
            this.data.value -= other.access().toUnit(this.data.constructor).value
            return this
        }
        throw new TypeError(`(Relscript): Cannot add Unit and ${other.constructor.name}`)
    }

    idiv(other: Type<any>): Type<LengthUnit> {
        if (other instanceof NumberType) {
            this.data.value /= other.access()
            return this
        }
        else if (other instanceof UnitType) {
            //@ts-ignore
            this.data.value /= other.access().toUnit(this.data.constructor).value
            return this
        }
        throw new TypeError(`(Relscript): Cannot add Unit and ${other.constructor.name}`)
    }
    imul(other: Type<any>): Type<LengthUnit> {
        if (other instanceof NumberType) {
            this.data.value *= other.access()
            return this
        }
        else if (other instanceof UnitType) {
            //@ts-ignore
            this.data.value *= other.access().toUnit(this.data.constructor).value
            return this
        }
        throw new TypeError(`(Relscript): Cannot add Unit and ${other.constructor.name}`)
    }
    iadd(other: Type<any>): Type<LengthUnit> {
        if (other instanceof NumberType) {
            this.data.value += other.access()
            return this
        }
        else if (other instanceof UnitType) {
            //@ts-ignore
            this.data.value += other.access().toUnit(this.data.constructor).value
            return this
        }
        throw new TypeError(`(Relscript): Cannot add Unit and ${other.constructor.name}`)
    }

    mul(other: Type<any>): Type<LengthUnit> {
        if (other instanceof NumberType) {
            return new UnitType(LengthUnit.fromUnitRepr(`${this.data.value * other.access()}${this.data.getShorthand()}`))
        }
        else if (other instanceof UnitType) {
            return new UnitType(
                //@ts-ignore
                LengthUnit.fromUnitRepr(`${this.data.value * other.access().toUnit(this.data.constructor).value}${this.data.constructor.shorthand}`)
            )
        }
        throw new TypeError(`(Relscript): Cannot add Unit and ${other.constructor.name}`)
    }

    div(other: Type<any>): Type<LengthUnit> {
        if (other instanceof NumberType) {
            return new UnitType(
                LengthUnit.fromUnitRepr(
                    `${this.data.value / other.access()}${this.data.getShorthand()}`
                )
            )
        }
        else if (other instanceof UnitType) {
            return new UnitType(
                //@ts-ignore
                LengthUnit.fromUnitRepr(`${this.data.value / other.access().toUnit(this.data.constructor).value}${this.data.constructor.shorthand}`)
            )
        }
        throw new TypeError(`(Relscript): Cannot add Unit and ${other.constructor.name}`)
    }
}

class NumberType extends Type<number>{
    type = "number"
    access(): number {
        return this.data
    }

    truthy(): boolean {
        return this.data !== 0
    }

    add(other: Type<any>): NumberType {
        return new NumberType(this.data + other.number().access())
    }

    iadd(other: Type<any>): NumberType {
        this.data += other.number().access()
        return this
    }

    mul(other: Type<number>): NumberType {
        return new NumberType(this.data * other.number().access())
    }

    imul(other: Type<number>): NumberType {
        this.data *= other.number().access()
        return this
    }

    sub(other: Type<any>): NumberType {
        return new NumberType(this.data - other.number().access())
    }

    isub(other: Type<any>): NumberType {
        this.data -= other.number().access()
        return this
    }

    div(other: Type<any>): NumberType {
        return new NumberType(this.data / other.number().access())
    }

    idiv(other: Type<any>): NumberType {
        this.data /= other.number().access()
        return this
    }

    pow(other: Type<any>): NumberType {
        return new NumberType(this.data ** other.number().access())
    }

    ipow(other: Type<any>): NumberType {
        this.data **= other.number().access()
        return this
    }

    root(other: Type<any>): NumberType {
        return this.pow(new NumberType(1 / other.number().access()))
    }

    iroot(other: Type<any>): NumberType {
        this.data = Math.pow(this.data, 1 / other.number().access())
        return this
    }

    string(): StringType {
        return new StringType(this.data.toString())
    }

    number(): NumberType {
        return this
    }

}

class StringType extends Type<string>{
    type = "string"
    access(): string {
        return this.data
    }
    truthy(): boolean {
        return this.data !== ""
    }
    add(other: Type<string>): StringType {
        return new StringType(this.data + other.string().access())
    }
    iadd(other: Type<string>): Type<string> {
        this.data += other.string().access()
        return this
    }
    mul(other: Type<number>): Type<string> {
        return new StringType(this.data.repeat(other.number().access()))
    }
    imul(other: Type<any>): Type<string> {
        this.data = this.data.repeat(other.number().access())
        return this
    }

    sub(_other: Type<any>): Type<string> {
        throw new TypeError("(Relscript): Cannot subtract strings")
    }

    isub(_other: Type<any>): Type<string> {
        throw new TypeError("(Relscript): Cannot subtract strings")
    }

    div(_other: Type<any>): Type<string> {
        throw new TypeError("(Relscript): Cannot divide strings")
    }

    idiv(_other: Type<any>): Type<string> {
        throw new TypeError("(Relscript): Cannot divide strings")
    }

    string(): StringType {
        return this
    }

    number(): NumberType {
        return new NumberType(NaN)
    }

}

class FunctionType extends Type<UserFunction> {
    type = "function"
    access(): UserFunction {
        return this.data
    }

    truthy(): boolean {
        return true
    }

    mul(_other: Type<any>): Type<UserFunction> {
        throw new OperatorError("Cannot use * with function")
    }
    imul(other: Type<any>): Type<UserFunction> {
        return this.mul(other)
    }

    div(_other: Type<any>): Type<UserFunction> {
        throw new OperatorError("Cannot use / with function")
    }
    idiv(other: Type<any>): Type<UserFunction> {
        return this.div(other)
    }

    sub(_other: Type<any>): Type<UserFunction> {
        throw new OperatorError("Cannot use - with function")
    }
    isub(other: Type<any>): Type<UserFunction> {
        return this.sub(other)
    }

    add(_other: Type<any>): Type<UserFunction> {
        throw new OperatorError("Cannot use + with function")
    }
    iadd(other: Type<any>): Type<UserFunction> {
        return this.add(other)
    }

    string(): StringType {
        return new StringType(
            `${this.data.name}(${this.data.argIdents.join(", ")}) = ${this.data.toString()}`
        )
    }

    number(): NumberType {
        throw new TypeError(
            `(Relscript): Function: ${this.data.name} cannot be converted to a number`
        )
    }

    run(program: ProgramNode, args: Type<any>[], table: SymbolTable) {
        return this.data.run(program, args, table)
    }
}

class UserFunction {
    code: ProgramNode | undefined
    constructor(
        public name: string,
        public codeToks: Token<any>[],
        public argIdents: string[]
    ) { }
    run(program: ProgramNode, args: Type<any>[], table: SymbolTable) {
        let argRecord: { [key: string]: any } = {}
        if (args.length < this.argIdents.length) {
            throw new TypeError(`(Relscript): ${this.name} expected ${this.argIdents.length} arguments but got ${args.length}`)
        }
        for (let i = 0; i < this.argIdents.length; i++) {
            argRecord[this.argIdents[i]] = args[i]
        }
        if (!this.code) {
            let data = calculateAmountRelativeToInternals(
                program.relativeTo,
                this.codeToks,
                argRecord
            ).expression
            this.code = data
        }
        return this.code.visit(program, new SymbolTable(argRecord, table))
    }
    toString() {
        return `${this.codeToks.reduce((p, c) => p + " " + c.data, "")}`
    }
}

function createTypeFromJSType<T extends ValidJSTypes>(jsType: T) {
    if (typeof jsType === 'string') {
        return new StringType(jsType)
    }
    else if (typeof jsType === 'number') {
        return new NumberType(jsType)
    }
    else if (jsType instanceof LengthUnit) {
        return new UnitType(jsType)
    }
    return new FunctionType(jsType)
}

class ProgramNode extends Node {
    relativeTo: number
    constructor(public program: Node, rel: number) {
        super()
        this.relativeTo = rel
    }

    visit(program: ProgramNode, table: SymbolTable): Type<any> {
        return this.program.visit(program, table)
    }

    repr(indent: number = 0): string {
        return `Program(
${'\t'.repeat(indent + 1)}${this.program.repr(indent + 1)}
${'\t'.repeat(indent)})`
    }
}

class MultiStatementNode extends Node {
    expressions: Exclude<Node, MultiStatementNode>[]
    constructor(ns: Node[]) {
        super()
        this.expressions = ns
    }

    visit(program: ProgramNode, table: SymbolTable): Type<any> {
        let res;
        for (let expr of this.expressions) {
            res = expr.visit(program, table)
        }
        return res ?? new NumberType(0);
    }

    repr(indent: number = 0): string {
        let text = `MultiStatement(\n`
        for (let node of this.expressions) {
            text += "\t".repeat(indent + 1)
            text += `${node.repr(indent + 1)}\n`
        }
        text += `${'\t'.repeat(indent)})`
        return text
    }
}

class SetRelNode extends Node {
    constructor(public val: Node) {
        super()
    }

    visit(program: ProgramNode, table: SymbolTable): Type<any> {
        let val = this.val.visit(program, table)
        program.relativeTo = val.number().access()
        return val
    }

    repr(indent: number): string {
        return `SetRel(
${'\t'.repeat(indent + 1)}${this.val.repr(indent + 1)}
${'\t'.repeat(indent)})`
    }
}

class PipeNode extends Node {
    chain: Node[]
    constructor(public start: Node) {
        super()
        this.chain = []
    }

    addToChain(node: Node) {
        this.chain.push(node)
    }

    visit(program: ProgramNode, table: SymbolTable): Type<any> {
        let final: Type<any> = this.start.visit(program, table);
        for (let node of this.chain) {
            table.set('!', final)
            final = node.visit(program, table)
        }
        return final
    }

    repr(indent: number): string {
        let text = `Pipechain(\n`;
        for (let node of [this.start, ...this.chain]) {
            text += '\t'.repeat(indent + 1) + node.repr(indent + 1) + "\n"
        }
        text += '\t'.repeat(indent).concat(")")
        return text;
    }
}

class ExpressionNode extends Node {
    constructor(public node: Node) {
        super()
    }

    visit(program: ProgramNode, table: SymbolTable): Type<any> {
        return this.node.visit(program, table)
    }

    repr(indent: number = 0): string {
        return `Expr(
${'\t'.repeat(indent + 1)}${this.node.repr(indent + 1)}
${'\t'.repeat(indent)})`
    }
}

class VariableBinOpAssignNode extends Node {
    constructor(
        public name: Token<TT.ident>,
        public op: Token<
            TT.muleq | TT.minuseq | TT.diveq | TT.poweq | TT.rooteq | TT.pluseq | TT.eq
        >,
        public value: Node
    ) {
        super()
    }

    visit(program: ProgramNode, table: SymbolTable): Type<any> {
        let var_ = table.get(this.name.data)
        if (var_ === undefined) {
            throw new OperatorError(`${this.name.data} is undefined`)
        }
        if (!(var_ instanceof Type)) {
            return new NumberType(0)
        }
        switch (this.op.data) {
            case '*=': return var_.number().imul(this.value.visit(program, table).number())
            case '^=': return var_.number().ipow(this.value.visit(program, table).number())
            case '+=': return var_.number().iadd(this.value.visit(program, table).number())
            case '-=': return var_.number().isub(this.value.visit(program, table).number())
            case '/=': return var_.number().idiv(this.value.visit(program, table).number())
            case '^/=': return var_.number().iroot(this.value.visit(program, table).number())
            case '=': {
                table.set(this.name.data, this.value.visit(program, table))
                let val = table.get(this.name.data)
                if (val instanceof Type) {
                    return val
                }
                return new NumberType(val(program.relativeTo, this.name.data))
            }
        }
    }

    repr(indent: number): string {
        return `VarBinOpAssign(
${'\t'.repeat(indent + 1)}${this.name.data} ${this.op.data} ${this.value.repr(indent + 1)}
${'\t'.repeat(indent)})`
    }
}

class VariableAssignNode extends Node {
    name: string
    constructor(name: Token<TT.ident>[], public value: Node) {
        super()
        this.name = name[0].data
        for (let i = 1; i < name.length; i++) {
            this.name += ` ${name[i].data}`
        }
    }

    visit(program: ProgramNode, table: SymbolTable): Type<ValidJSTypes> {
        let val = this.value.visit(program, table)
        table.set(this.name, val)
        return val
    }

    repr(indent: number = 0): string {
        return `VarAssign(
${'\t'.repeat(indent + 1)}${this.name}
${'\t'.repeat(indent + 1)}=
${'\t'.repeat(indent + 1)}${this.value.repr(indent + 1)}
${'\t'.repeat(indent)})`
    }
}

class WhileNode extends Node {
    constructor(public condition: Node, public code: MultiStatementNode) {
        super()
    }

    visit(program: ProgramNode, table: SymbolTable): Type<any> {
        let res;
        let iters = 0;
        while (this.condition.visit(program, table).number().access() !== 0 && iters < 1000) {
            res = this.code.visit(program, table)
            iters++
        }
        return res ?? new NumberType(0)
    }

    repr(_indent: number): string {
        return 'loop'
    }
}

class IfNode extends Node {
    elifPrograms: [Node, MultiStatementNode][]
    constructor(
        public condition: Node,
        public code: MultiStatementNode,
        elifPrograms?: [Node, MultiStatementNode][],
        public elseProgram?: MultiStatementNode
    ) {
        super()
        this.elifPrograms = elifPrograms ?? []
    }

    visit(program: ProgramNode, table: SymbolTable): Type<ValidJSTypes> {
        if (this.condition.visit(program, table).truthy()) {
            return this.code.visit(program, table)
        }
        if (this.elifPrograms) {
            for (let [check, multiStatement] of this.elifPrograms) {
                if (check.visit(program, table).truthy()) {
                    return multiStatement.visit(program, table)
                }
            }
        }
        if (this.elseProgram) {
            return this.elseProgram.visit(program, table)
        }
        return new NumberType(0)
    }

    repr(indent: number): string {
        let text = `IfNode(
${'\t'.repeat(indent + 1)}check(${this.condition.repr(indent + 1)})
${'\t'.repeat(indent + 1)}(
${'\t'.repeat(indent + 2)}${this.code.repr(indent + 2)}
${'\t'.repeat(indent + 1)})\n`
        for (let [_, program] of this.elifPrograms) {
            text += `${'\t'.repeat(indent + 1)}Elif(
${'\t'.repeat(indent + 2)}${program.repr(indent + 2)}
${'\t'.repeat(indent + 1)})\n`
        }
        if (this.elseProgram) {
            text += `${'\t'.repeat(indent + 1)}Else(
${'\t'.repeat(indent + 2)}${this.elseProgram.repr(indent + 2)}
${'\t'.repeat(indent + 1)})\n`
        }
        text += '\t'.repeat(indent) + ")"
        return text
    }
}

class FuncCreateNode extends Node {
    name: string
    code: Token<TT>[]
    parameterNames: Token<TT.ident>[]
    constructor(name: Token<TT.ident>[], parameterNames: Token<TT.ident>[], code: Token<TT>[]) {
        super()
        this.name = name[0].data
        for (let i = 1; i < name.length; i++) {
            this.name += ` ${name[i].data}`
        }
        this.code = code
        this.parameterNames = parameterNames
    }

    visit(_program: ProgramNode, table: SymbolTable): Type<ValidJSTypes> {
        let fn = new FunctionType(new UserFunction(
            this.name,
            this.code,
            this.parameterNames.map(v => v.data)
        ))
        table.set(this.name, fn)
        return fn
    }

    repr(indent: number): string {
        return `FunctionCreate(
${'\t'.repeat(indent + 1)}${this.name}(${this.parameterNames.map(v => v.data)})
${'\t'.repeat(indent + 1)}(
${'\t'.repeat(indent + 2)}${this.code.reduce((p, c) => p + " " + c.data, "")}
${'\t'.repeat(indent + 1)})
${'\t'.repeat(indent)})`
    }
}

class VarAccessNode extends Node {
    name: string
    constructor(name: Token<TT.ident>[]) {
        super()
        this.name = name[0].data
        for (let i = 1; i < name.length; i++) {
            this.name += ` ${name[i].data}`
        }
    }

    visit(program: ProgramNode, table: SymbolTable): Type<ValidJSTypes> {
        let val = table.get(this.name)
        if (typeof val === 'function') {
            return new NumberType(val(program.relativeTo, this.name))
        }
        else if (val instanceof MultiStatementNode) {
            let data = val.visit(program, Object.assign({}, table))
            return new NumberType(Number(data))
        }
        return val ?? new NumberType(0)
    }

    repr(_indent: number): string {
        return `VarAccess(${this.name})`
    }
}


class StringNode extends Node {
    data: Token<TT.string>

    constructor(n: Token<TT.string>) {
        super()
        this.data = n
    }

    visit(_program: ProgramNode, _table: SymbolTable): StringType {
        return new StringType(this.data.data)
    }

    repr(_indent: number): string {
        return `String(${JSON.stringify(this.data.data)})`
    }
}

class NumberNode extends Node {
    data: Token<TT.number>
    constructor(n: Token<TT.number>) {
        super()
        this.data = n
    }
    visit(): NumberType {
        return new NumberType(this.data.data)
    }

    repr() {
        return `Number(${this.data.data})`
    }

}

class RightUnOpNode extends Node {
    constructor(
        public left: Node,
        public operator: Token<TT.percent | TT.hash | TT.number_suffix | TT.unit>
    ) {
        super()
    }
    visit(program: ProgramNode, table: SymbolTable): NumberType | UnitType {
        let number = this.left.visit(program, table)
        if (!(number instanceof NumberType)) {
            throw new OperatorError(`'${this.operator.data}' expected number, found string`)
        }
        let n = number.access()
        let data: number;
        if (this.operator.type === TT.unit) {
            let unit = LengthUnit.fromUnitRepr(`${n}${this.operator.data}`)
            return new UnitType(unit)
        }
        switch (this.operator.data) {
            case '#': data = program.relativeTo % n; break;
            case '%': data = (n / 100) * program.relativeTo; break;
            case 'K': data = n * 1000; break;
            case 'M': data = n * 1_000_000; break;
            case 'B': data = n * 1_000_000_000; break;
            case 'T': data = n * 1_000_000_000_000; break;
            default: data = n
        }
        return new NumberType(data)
    }

    repr(indent = 0) {
        let left = this.left.repr(indent + 1);
        let right = `op(${this.operator.data})`;
        return `RightUnOp(
${'\t'.repeat(indent + 1)}${left} ${right}
${'\t'.repeat(indent)})`
    }
}

class LeftUnOpNode extends Node {
    constructor(public left: Node, public operator: Token<TT.hash | TT.minus>) {
        super()
    }
    visit(program: ProgramNode, table: SymbolTable): NumberType {
        let number = this.left.visit(program, table).access()
        if (typeof number === 'string') {
            throw new OperatorError(`'${this.operator.data}' expected number, found string`)
        }
        switch (this.operator.type) {
            case TT.hash:
                return new NumberType(number - (program.relativeTo % number))
            case TT.minus:
                return new NumberType(number * -1)
        }
    }

    repr(indent = 0) {
        let right = this.left.repr(indent + 1);
        let left = `op(${this.operator.data})`;
        return `LeftUnOpNode(
${'\t'.repeat(indent + 1)}${left} ${right}
${'\t'.repeat(indent)})`
    }
}

class BinOpNode extends Node {
    constructor(
        public left: Node,
        public operator: Token<
              TT.mul 
			| TT.div 
			| TT.plus 
			| TT.minus 
			| TT.pow 
			| TT.root 
			| TT.le 
			| TT.ge 
			| TT.lt 
			| TT.gt 
			| TT.eq
        >,
        public right: Node
    ) {
        super()
    }
    visit(program: ProgramNode, table: SymbolTable): Type<ValidJSTypes> {
        let left = this.left.visit(program, table)
        let right = this.right.visit(program, table)
        let data;
        switch (this.operator.data) {
            case '+': return left.add(right)
            case '-': return left.sub(right)
            case '*': return left.mul(right)
            case '/': return left.div(right)
            case '^': return left.number().pow(right)
            case '^/': return left.number().root(right)
            case '<=': data = Number(left.access() <= right.access()); break;
            case '>=': data = Number(left.access() >= right.access()); break;
            case '>': data = Number(left.access() > right.access()); break;
            case '<': data = Number(left.access() < right.access()); break;
            case '=': data = Number(left.access() === right.access()); break;
        }
        return new NumberType(data)
    }

    repr(indent = 0) {
        return `BinOp(
${'\t'.repeat(indent + 1)}${this.left.repr(indent + 1)}
${'\t'.repeat(indent + 1)}op(${this.operator.data})
${'\t'.repeat(indent + 1)}${this.right.repr(indent + 1)}
${'\t'.repeat(indent)})`
    }
}

class FunctionNode extends Node {
    name: string
    constructor(name: Token<TT.ident>[], public nodes: Node[]) {
        super()
        this.name = name[0].data
        for (let i = 1; i < name.length; i++) {
            this.name += ` ${name[i].data}`
        }
    }
    visit(
        program: ProgramNode,
        table: SymbolTable
    ): NumberType | StringType | FunctionType | UnitType {
        let values = this.nodes.map(v => v.visit(program, table)) ?? [new NumberType(0)]
        let argCount = {
            'rand': 2,
            'needed': 1,
            'ineeded': 1,
            'neg': 1,
            'floor': 1,
            'ceil': 1,
            'round': 1,
            'minmax': 3,
            'aspercent': 1,
            "length": 1,
            "abs": 1,
            'string': 1,
            'typeof': 1,
            'eval': 1,
            'factorial': 1,
            'setrel': 1,
            sin: 1,
            cos: 1,
            number: 1,
            signof: 1
        }
        if (this.name in argCount && values.length < argCount[this.name as keyof typeof argCount]) {
            throw new FunctionError(`${this.name} expects ${argCount[this.name as keyof typeof argCount]} items, but got ${values.length}`)
        }
        switch (this.name) {
            case 'eval': return createTypeFromJSType(
                runRelativeCalculator(program.relativeTo, values[0].access())
            )
            case 'signof': {
                let val = values[0].access()
                return new NumberType(val < 0 ? -1 : 1)
            }
            case 'min': return new NumberType(min(values.map(v => v.access())) as number)
            case 'max': return new NumberType(max(values.map(v => v.access())) as number)
            case 'rand': return new NumberType(randInt(values[0].access(), values[1].access()))
            case 'choose': return choice(values)
            case 'needed': return new NumberType(values[0].access() - program.relativeTo)
            case 'ineeded': return new NumberType(program.relativeTo - (values[0].access()))
            case 'neg': return values[0].mul(new NumberType(-1))
            case 'ineg': return values[0].imul(new NumberType(-1))
            case 'floor': return new NumberType(Math.floor(values[0].access()))
            case 'ceil': return new NumberType(Math.ceil(values[0].access()))
            case 'round': return new NumberType(Math.round(values[0].access()))
            case 'aspercent': return new NumberType(
                (values[0].access() / program.relativeTo) * 100
            )
            case 'length': return new NumberType(String(values[0]).length)
            case 'concat': return new StringType(values.map(v => v.string()).join(""))
            case 'abs': return new NumberType(Math.abs(values[0].access()))
            case 'sin': return new NumberType(Math.sin(values[0].access()))
            case 'cos': return new NumberType(Math.cos(values[0].access()))
            case 'string': return values[0].string()
            case 'number': return values[0].number()
            case 'typeof': return new StringType(values[0].type)
            case 'symbols': return new StringType(table.repr())
            case 'factorial': {
                let ans = 1
                for (let i = values[0].number().access(); i > 1; i--) {
                    ans *= i
                };
                return new NumberType(ans)
            }
            case 'sum': return function() {
                switch (typeof values[0].access()) {
                    case 'string': return new StringType(
                        values.reduce((p, c) => p + c.access(), "")
                    )
                    case 'number': return new NumberType(
                        values.reduce((p, c) => p + c.access(), 0)
                    )
                    default: return new NumberType(0)
                }
            }()
            case 'product': {
                return new NumberType(values.reduce((p, c) => p * c.number().access(), 1))
            }
            case 'minmax': {
                let min = values[0].access() ?? 0
                let value = values[1].access() ?? 0
                let max = values[2].access() ?? 0
                if (isBetween(Number(min), Number(value), Number(max))) {
                    return new NumberType(value)
                }
                else if (value > max) {
                    return new NumberType(max)
                }
                return new NumberType(min)

            }
            default: {
                let code = table.get(this.name)
                if (!(code instanceof FunctionType)) {
                    break;
                }

                return code.run(program, values, table)
            }
        }
        return new NumberType(0)
    }

    repr(indent = 0) {
        return `Function(
${'\t'.repeat(indent + 1)}${this.name}(
${'\t'.repeat(indent + 2)}${this.nodes.map(v => v.repr(indent + 2)).join(", ")}
${'\t'.repeat(indent + 1)})
${'\t'.repeat(indent)})`
    }
}

class Parser {
    tokens: Token<TT>[]
    nodes: Node[] = []
    #i = -1
    #curTok: Token<TT> | undefined = undefined

    constructor(tokens: Token<TT>[]) {
        this.tokens = tokens
        this.advance()
    }

    advance() {
        if ((this.#curTok = this.tokens[++this.#i]) === undefined) {
            return false;
        }
        return this.#curTok
    }

    back() {
        if ((this.#curTok = this.tokens[--this.#i]) === undefined) {
            return false;
        }
        return this.#curTok;
    }

    get atEnd() {
        return this.#curTok === undefined
    }

    func() {
        let name = [this.#curTok as Token<TT.ident>]
        while (this.advance() && this.#curTok?.type === TT.ident) {
            name.push(this.#curTok as Token<TT.ident>)
        }

        //skip (
        this.advance()
        if (this.#curTok?.type === TT.rparen) {
            this.advance()
            return new FunctionNode(name, [])
        }
        if (this.#curTok === undefined) {
            throw new SyntaxError(
                `Expected expression after '${name.map(v => v.data).join(" ")}('`
            )
        }
        let nodes = [this.statement()]
        while (this.#curTok?.type === TT.comma) {
            //skip ,
            this.advance()
            nodes.push(this.statement())
        }
        if (this.#curTok === undefined) {
            throw new SyntaxError(`Expected ')' after '${name.map(v => v.data).join(" ")}(...`)
        }
        //skip )
        this.advance()
        return new FunctionNode(name, nodes)
    }

    atom(): Node {
        let tok = this.#curTok
        if (tok?.type === TT.number) {
            this.advance()
            return new NumberNode(tok as Token<TT.number>)
        }
        else if (tok?.type === TT.string) {
            this.advance()
            return new StringNode(tok as Token<TT.string>)
        }
        if (this.#curTok?.type !== TT.ident) {
            throw new SyntaxError("expected identifier")
        }

        let nameTok = [this.#curTok as Token<TT.ident>]
        while (this.advance() && this.#curTok?.type === TT.ident) {
            nameTok.push(this.#curTok as Token<TT.ident>)
        }

        if (this.#curTok?.type as TT === TT.lparen) {
            for (let i = 0; i < nameTok.length; i++)
                this.back()
            return this.func()
        }


        return new VarAccessNode(nameTok)
    }

    factor(): Node {
        let tok = this.#curTok as Token<TT>
        if (tok?.type === TT.lparen) {
            this.advance()
            let node = this.multi_statement()
            this.advance()
            return node
        }
        return this.atom()
    }

    left_unary_op(): Node {
        let node;
        let isOp = false
        while ([TT.hash, TT.minus].includes(this.#curTok?.type as TT)) {
            isOp = true
            let tok = this.#curTok as Token<TT.hash | TT.minus>
            this.advance()
            node = new LeftUnOpNode(this.mutate_expr(), tok)
        }
        if (!isOp) node = this.factor()
        return node as Node
    }

    mutate_expr(): Node {
        let node = this.left_unary_op();
        while ([
            TT.percent,
            TT.hash,
            TT.number_suffix,
            TT.unit
        ].includes(this.#curTok?.type as TT)) {
            let next = this.#curTok as Token<any>
            this.advance()
            node = new RightUnOpNode(node, next)
        }
        return node
    }

    higher_order_term() {
        let node = this.mutate_expr()
        while (TT.pow === this.#curTok?.type) {
            let token = this.#curTok as Token<TT.pow>
            this.advance()
            node = new BinOpNode(node, token, this.mutate_expr())
        }
        return node
    }

    term(): Node {
        let node = this.higher_order_term()
        while ([TT.mul, TT.div].includes(this.#curTok?.type as TT)) {
            let token = this.#curTok as Token<any>
            this.advance()
            node = new BinOpNode(node, token, this.higher_order_term())
        }
        return node
    }

    arithmetic(): Node {
        let node = this.term()
        while ([TT.plus, TT.minus].includes(this.#curTok?.type as TT)) {
            let token = this.#curTok as Token<any>
            this.advance()
            node = new BinOpNode(node, token, this.term())
        }
        return node
    }

    root(): Node {
        let node = this.arithmetic()
        while (this.#curTok?.type === TT.root) {
            let token = this.#curTok as Token<TT.root>
            this.advance()
            node = new BinOpNode(node, token, this.arithmetic())
        }
        return node
    }

    var_assign(): Node {
        this.advance()
        let name = [this.#curTok as Token<TT.ident>]
        while (this.advance() && this.#curTok?.type === TT.ident) {
            name.push(this.#curTok as Token<TT.ident>)
        }
        if (this.#curTok?.type === TT.eq) {
            this.advance()
            return new VariableAssignNode(name, this.comp())
        }
        else if (this.#curTok?.type === TT.lparen) {
            let idents: Token<TT.ident>[] = []

            while (this.advance() && this.#curTok?.type as TT === TT.ident) {
                idents.push(this.#curTok as Token<TT.ident>)
                this.advance()
                if (this.#curTok?.type as TT !== TT.comma) {
                    break;
                }
            }

            if (this.#curTok?.type as TT !== TT.rparen) {
                throw new SyntaxError("Expected ')'")
            }

            this.advance()

            if (this.#curTok?.type as TT !== TT.eq) {
                throw new SyntaxError("Expected '='")
            }

            let code: Token<any>[] = []

            while (this.advance()) {
                if (this.#curTok?.type as TT === TT.keyword && this.#curTok?.data === ENDFUNC) {
                    break
                }
                if (!this.#curTok) {
                    throw new SyntaxError(`'${ENDFUNC}' expected to end function`)
                }
                code.push(this.#curTok)
            }

            this.advance()

            return new FuncCreateNode(name, idents, code)

        }
        throw new SyntaxError(`Expected '=' after ${name.map(v => v.data).join(" ")}`)
    }

    expr(): Node {
        return new ExpressionNode(this.root())
    }

    pipe(): Node {
        let node = this.expr()
        while (this.#curTok?.type === TT.pipe) {
            if (!(node instanceof PipeNode)) {
                node = new PipeNode(node)
            }
            this.advance();
            (node as PipeNode).addToChain(this.expr())
        }
        return node
    }

    comp(): Node {
        let left = this.pipe()
        if ([TT.lt, TT.le, TT.eq, TT.gt, TT.ge].includes(this.#curTok?.type as TT)) {
            let op = this.#curTok as Token<any>
            this.advance()
            left = new BinOpNode(left, op, this.pipe())
        }
        return left
    }

    while_loop() {
        this.advance()
        let comp = this.comp()
        if (this.#curTok?.type !== TT.keyword || this.#curTok?.data !== THEN) {
            throw new SyntaxError(`Expected '${THEN}' to start while loop block`)

        }
        this.advance()
        let code = this.multi_statement()
        if (this.#curTok?.type !== TT.keyword || this.#curTok?.data as string !== DONE) {
            throw new SyntaxError(`Expected '${DONE}' to end while loop block`)
        }
        return new WhileNode(comp, code)
    }

    if_statement() {
        this.advance()
        let comp = this.comp()
        if (this.#curTok?.type !== TT.keyword || this.#curTok?.data !== THEN) {
            throw new SyntaxError(`Expected '${THEN}' to start if block`)
        }
        this.advance()
        let code = this.multi_statement()
        let elseNode
        let elifPrograms: [Node, MultiStatementNode][] = []
        while (this.#curTok?.type === TT.keyword && (this.#curTok?.data as string) === ELIF) {
            this.advance()
            let check = this.comp()
            if (this.#curTok?.type !== TT.keyword || (this.#curTok?.data as string) !== THEN) {
                throw new SyntaxError(`Expected '${THEN}' to start the elif block`)
            }
            this.advance()
            let program = this.multi_statement()
            elifPrograms.push([check, program])
        }
        if (this.#curTok?.type === TT.keyword && (this.#curTok?.data as string) === ELSE) {
            this.advance()
            elseNode = this.multi_statement()
        }
        if (this.#curTok?.type !== TT.keyword || (this.#curTok?.data as string) !== ENDIF) {
            throw new SyntaxError(`Expected '${ENDIF}' to end if block`)
        }
        this.advance()
        return new IfNode(comp, code, elifPrograms, elseNode)
    }

    set_rel() {
        this.advance()
        return new SetRelNode(this.comp())
    }

    statement() {
        if (this.#curTok?.type === TT.keyword) {
            if (this.#curTok.data === CREATE_VAR)
                return this.var_assign()
            else if (this.#curTok.data === IF) {
                return this.if_statement()
            }
            else if (this.#curTok.data === WHILE) {
                return this.while_loop()
            }
            else if (this.#curTok.data === SETREL) {
                return this.set_rel()
            }
        }
        else if (this.#curTok?.type === TT.ident) {
            let name = this.#curTok as Token<TT.ident>
            this.advance()
            if ([
                TT.muleq,
                TT.pluseq,
                TT.minuseq,
                TT.rooteq,
                TT.poweq,
                TT.diveq,
                TT.eq
            ].includes(this.#curTok?.type as TT)) {
                let op = this.#curTok as Token<TT.muleq>
                this.advance()
                return new VariableBinOpAssignNode(name, op, this.comp())
            }
            this.back()
        }
        return this.comp()
    }

    multi_statement(): MultiStatementNode {
        let nodeArr = [this.statement()]
        while (this.#curTok?.type === TT.semi) {
            this.advance()
            //trailing semi
            if (!this.#curTok) break;
            nodeArr.push(this.statement())
        }
        return new MultiStatementNode(nodeArr)
    }

    program(relativeTo: number) {
        return new ProgramNode(this.multi_statement(), relativeTo)

    }

    parse(relativeTo: number): ProgramNode {
        return this.program(relativeTo)
    }
}

class Interpreter {
    symbolTable: SymbolTable
    constructor(
        public program: ProgramNode,
        public relativeTo: number,
        baseEnv: EnvironBase | SymbolTable
    ) {
        this.program = program
        this.relativeTo = relativeTo
        if (!(baseEnv instanceof SymbolTable))
            this.symbolTable = new SymbolTable(baseEnv)
        else this.symbolTable = baseEnv
    }
    visit(): ValidJSTypes {
        return this.program.visit(this.program, this.symbolTable).access()
    }
}

function calculateAmountRelativeToInternals(
    money: number,
    amount: string | Token<TT>[],
    extras?: EnvironBase | SymbolTable
) {
    let tokens, lexer;
    if (typeof amount !== 'object') {
        let lexer = new Lexer(amount, Object.keys(extras ?? {}))
        lexer.tokenize()

        tokens = lexer.tokens
    }
    else tokens = amount
    let parser = new Parser(tokens)
    let expression = parser.parse(money)
    let env = extras instanceof SymbolTable ? extras : {
        'all': (total: number) => total * .99,
        'all!': (total: number) => total,
        'rel!': new NumberType(money),
        'max!': new NumberType(Number.MAX_SAFE_INTEGER),
        'min!': new NumberType(Number.MIN_SAFE_INTEGER),
        'Inf!': new NumberType(Infinity),
        "infinity": new NumberType(Infinity),
        'NaN!': new NumberType(NaN),
        'true': new NumberType(1),
        'false': new NumberType(0),
        ...(extras ?? {})
    }
    const int = new Interpreter(expression, money, env)
    return { lexer, parser, interpreter: int, expression }
}

function calculateAmountRelativeTo(
    money: number,
    amount: string,
    extras?: Record<string,
    (total: number, k: string) => number>,
    typeConv = Number
): number {
    return typeConv(calculateAmountRelativeToInternals(money, amount, extras).interpreter.visit())
}

function runRelativeCalculator(
    relativeTo: number,
    amount: string,
    extras?: Record<string,
    (total: number, k: string) => number>
): ValidJSTypes {
    return calculateAmountRelativeToInternals(relativeTo, amount, extras).interpreter.visit()
}

export default {
    calculateAmountRelativeTo,
    calculateAmountRelativeToInternals,
    runRelativeCalculator
}
