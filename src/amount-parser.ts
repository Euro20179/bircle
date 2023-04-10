import { max, min } from "lodash"
import { emitsEvent, enumerate, isBetween, isNumeric, listComprehension, choice, Enum } from "./util"
import units, { LengthUnit } from "./units"

function randInt(min: number, max: number) {
    return Math.random() * (max - min) + min
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
}

const ENDFUNC = 'rav',
    CREATE_VAR = 'var',
    IF = 'if',
    THEN = 'then',
    ELSE = 'else',
    ENDIF = 'fi',
    ELIF = 'elif',
    SETREL = 'setrel'
const KEYWORDS = [ENDFUNC, CREATE_VAR, IF, THEN, ELSE, ENDIF, ELIF, SETREL] as const


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
    [TT.ge]: ">="
}

class Token<TokenType extends TT> {
    type: TokenType
    data: TokenDataType[TokenType]
    constructor(type: TokenType, data: TokenDataType[TokenType]) {
        this.data = data
        this.type = type
    }
}

class Lexer {
    tokens: Token<TT>[] = []
    data: string

    specialLiterals: string[]

    #curChar: string[number] | undefined
    #i: number = -1

    #whitespace = "\n\t "
    #specialChars = `#,()+-*/÷${this.#whitespace};="'`


    constructor(data: string, specialLiterals?: string[]) {
        this.data = data
        this.specialLiterals = specialLiterals ?? []
    }

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
        while (this.advance() !== false && (isNumeric(this.#curChar as string) || (this.#curChar === '.' && !hasDot))) {
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
        while (this.advance() !== false && !this.#specialChars.includes(this.#curChar as string)) {
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
                    if (KEYWORDS.includes(str as typeof KEYWORDS[number])) {
                        this.tokens.push(new Token(TT.keyword, str as typeof KEYWORDS[number]))
                    }
                    else this.tokens.push(new Token(TT.ident, str))
                }
            }
        }
    }
}

type EnvironBase = Record<string, ((total: number, k: string) => number) | number | string | Type<TT>>

class SymbolTable extends Map {
    parent?: SymbolTable
    constructor(base?: EnvironBase , parent?: SymbolTable) {
        super()
        for (let key in base) {
            this.set(key, base[key])
        }
        this.parent = parent
    }

    get(key: string): NumberType | StringType | ((total: number, k: string) => number) | Type<ValidJSTypes> {
        let val = super.get(key);
        if(!val && this.parent){
            val = this.parent.get(key)
        }
        if(!val){
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

    repr(){
        let text = `SymbolTable{`
        for(let [k, v] of this.entries()){
            text += `\n\t${k} = ${v}`
        }
        return text + "\n}"
    }
}

abstract class Node {
    abstract visit(program: ProgramNode, table: SymbolTable): Type<any>
    abstract repr(indent: number): string
}

abstract class Program {
    abstract visit(relativeTo: number, table: SymbolTable): Type<any>
    abstract repr(indent: number): string
}

type ValidJSTypes = string | number | UserFunction

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

    toString(){
        return `[${this.type}] ${this.string().access()}`
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
        throw new TypeError("Cannot subtract strings")
    }

    isub(_other: Type<any>): Type<string> {
        throw new TypeError("Cannot subtract strings")
    }

    div(_other: Type<any>): Type<string> {
        throw new TypeError("Cannot divide strings")
    }

    idiv(_other: Type<any>): Type<string> {
        throw new TypeError("Cannot divide strings")
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

    div(other: Type<any>): Type<UserFunction> {
        throw new OperatorError("Cannot use / with function")
    }
    idiv(other: Type<any>): Type<UserFunction> {
        return this.div(other)
    }

    sub(other: Type<any>): Type<UserFunction> {
        throw new OperatorError("Cannot use - with function")
    }
    isub(other: Type<any>): Type<UserFunction> {
        return this.sub(other)
    }

    add(other: Type<any>): Type<UserFunction> {
        throw new OperatorError("Cannot use + with function")
    }
    iadd(other: Type<any>): Type<UserFunction> {
        return this.add(other)
    }

    string(): StringType {
        return new StringType(`${this.data.name}(${this.data.argIdents.join(", ")}) = ${this.data.toString()}`)
    }

    number(): NumberType {
        throw new TypeError(`Function: ${this.data.name} cannot be converted to a number`)
    }

    run(relativeTo: number, args: Type<any>[], table: SymbolTable) {
        return this.data.run(relativeTo, args, table)
    }
}

class UserFunction {
    codeToks: Token<TT>[]
    argIdents: string[]
    name: string
    code: ProgramNode | undefined
    constructor(name: string, codeToks: Token<any>[], argIdents: string[]) {
        this.codeToks = codeToks
        this.argIdents = argIdents
        this.name = name
    }
    run(relativeTo: number, args: Type<any>[], table: SymbolTable) {
        let argRecord: { [key: string]: any } = {}
        if (args.length < this.argIdents.length) {
            throw new TypeError(`${this.name} expected ${this.argIdents.length} arguments but got ${args.length}`)
        }
        for (let i = 0; i < this.argIdents.length; i++) {
            argRecord[this.argIdents[i]] = args[i]
        }
        if (!this.code) {
            let data = calculateAmountRelativeToInternals(relativeTo, this.codeToks, argRecord).expression
            this.code = data
        }
        return this.code.visit(this.code, new SymbolTable(argRecord, table))
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
    return new FunctionType(jsType)
}

class ProgramNode extends Node {
    expressions: Exclude<Node, ProgramNode>[]
    #relativeTo: number
    constructor(ns: Node[], rel: number) {
        super()
        this.expressions = ns
        this.#relativeTo = rel
    }

    visit(program: ProgramNode, table: SymbolTable): Type<any> {
        let res;
        for (let expr of this.expressions) {
            res = expr.visit(this, table)
        }
        return res ?? new NumberType(0);
    }

    set rel(val: number){
        this.#relativeTo = val
    }

    get rel(){
        return this.#relativeTo
    }

    repr(indent: number = 0): string {
        let text = `Program(\n`
        for (let node of this.expressions) {
            text += "\t".repeat(indent + 1)
            text += `${node.repr(indent + 1)}\n`
        }
        text += `${'\t'.repeat(indent)})`
        return text
    }
}

class SetRelNode extends Node{
    val: Node

    constructor(val: Node){
        super()
        this.val = val
    }

    visit(program: ProgramNode, table: SymbolTable): Type<any> {
        let val = this.val.visit(program, table)
        program.rel = val.number().access()
        return val
    }

    repr(indent: number): string {
        return `SetRel(
${'\t'.repeat(indent + 1)}${this.val.repr(indent + 1)}
${'\t'.repeat(indent)})`
    }
}

class PipeNode extends Node {
    start: Node
    chain: Node[]
    constructor(start: Node) {
        super()
        this.start = start
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
    node: Node
    constructor(n: Node) {
        super()
        this.node = n
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
    name: Token<TT.ident>
    op: Token<TT.muleq | TT.minuseq | TT.diveq | TT.poweq | TT.rooteq | TT.pluseq | TT.eq>
    value: Node
    constructor(name: Token<TT.ident>, op: Token<TT.muleq | TT.minuseq | TT.diveq | TT.poweq | TT.rooteq | TT.pluseq | TT.eq>, value: Node) {
        super()
        this.name = name
        this.op = op
        this.value = value
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
                if(val instanceof Type){
                    return val
                }
                return new NumberType(val(program.rel, this.name.data))
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
    name: Token<TT.ident>
    value: Node
    constructor(name: Token<TT.ident>, value: Node) {
        super()
        this.name = name
        this.value = value
    }

    visit(program: ProgramNode, table: SymbolTable): Type<ValidJSTypes> {
        let val = this.value.visit(program, table)
        table.set(this.name.data, val)
        return val
    }

    repr(indent: number = 0): string {
        return `VarAssign(
${'\t'.repeat(indent + 1)}${this.name.data}
${'\t'.repeat(indent + 1)}=
${'\t'.repeat(indent + 1)}${this.value.repr(indent + 1)}
${'\t'.repeat(indent)})`
    }
}

class IfNode extends Node {
    condition: Node
    code: ProgramNode
    elifPrograms: [Node, ProgramNode][]
    elseProgram?: ProgramNode
    constructor(condition: Node, code: ProgramNode, elifPrograms?: [Node, ProgramNode][], elseProgram?: ProgramNode) {
        super()
        this.condition = condition
        this.code = code
        this.elseProgram = elseProgram
        this.elifPrograms = elifPrograms ?? []
    }

    visit(program: ProgramNode, table: SymbolTable): Type<ValidJSTypes> {
        if (this.condition.visit(program, table).truthy()) {
            return this.code.visit(program, table)
        }
        if (this.elifPrograms) {
            for (let [check, program] of this.elifPrograms) {
                if (check.visit(program, table).truthy()) {
                    return program.visit(program, table)
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
    name: Token<TT.ident>
    code: Token<TT>[]
    parameterNames: Token<TT.ident>[]
    constructor(name: Token<TT.ident>, parameterNames: Token<TT.ident>[], code: Token<TT>[]) {
        super()
        this.name = name
        this.code = code
        this.parameterNames = parameterNames
    }

    visit(program: ProgramNode, table: SymbolTable): Type<ValidJSTypes> {
        let fn = new FunctionType(new UserFunction(this.name.data, this.code, this.parameterNames.map(v => v.data)))
        table.set(this.name.data, fn)
        return fn
    }

    repr(indent: number): string {
        return `FunctionCreate(
${'\t'.repeat(indent + 1)}${this.name.data}(${this.parameterNames.map(v => v.data)})
${'\t'.repeat(indent + 1)}(
${'\t'.repeat(indent + 2)}${this.code.reduce((p, c) => p + " " + c.data, "")}
${'\t'.repeat(indent + 1)})
${'\t'.repeat(indent)})`
    }
}

class VarAccessNode extends Node {
    name: Token<TT.ident>
    constructor(name: Token<TT.ident>) {
        super()
        this.name = name
    }

    visit(program: ProgramNode, table: SymbolTable): Type<ValidJSTypes> {
        let val = table.get(this.name.data)
        if (typeof val === 'function') {
            return new NumberType(val(program.rel, this.name.data))
        }
        else if (val instanceof ProgramNode) {
            let data = val.visit(program, Object.assign({}, table))
            return new NumberType(Number(data))
        }
        return val ?? new NumberType(0)
    }

    repr(indent: number): string {
        return `VarAccess(${this.name.data})`
    }
}


class StringNode extends Node {
    data: Token<TT.string>

    constructor(n: Token<TT.string>) {
        super()
        this.data = n
    }

    visit(program: ProgramNode, table: SymbolTable): StringType {
        return new StringType(this.data.data)
    }

    repr(indent: number): string {
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
    left: Node
    operator: Token<TT.percent | TT.hash | TT.number_suffix>
    constructor(left: Node, operator: Token<TT.percent | TT.hash | TT.number_suffix>) {
        super()
        this.left = left
        this.operator = operator
    }
    visit(program: ProgramNode, table: SymbolTable): NumberType {
        let number = this.left.visit(program, table)
        if (!(number instanceof NumberType)) {
            throw new OperatorError(`'${this.operator.data}' expected number, found string`)
        }
        let n = number.access()
        let data: number;
        switch (this.operator.data) {
            case '#': data = program.rel % n; break;
            case '%': data = (n / 100) * program.rel; break;
            case 'K': data = n * 1000; break;
            case 'M': data = n * 1_000_000; break;
            case 'B': data = n * 1_000_000_000; break;
            case 'T': data = n * 1_000_000_000_000; break;
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
    left: Node
    operator: Token<TT.hash | TT.minus>
    constructor(left: Node, operator: Token<TT.hash | TT.minus>) {
        super()
        this.left = left
        this.operator = operator
    }
    visit(program: ProgramNode, table: SymbolTable): NumberType {
        let number = this.left.visit(program, table).access()
        if (typeof number === 'string') {
            throw new OperatorError(`'${this.operator.data}' expected number, found string`)
        }
        switch (this.operator.type) {
            case TT.hash:
                return new NumberType(number - (program.rel % number))
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
    left: Node
    operator: Token<TT.mul | TT.div | TT.plus | TT.minus | TT.pow | TT.root | TT.le | TT.ge | TT.lt | TT.gt | TT.eq>
    right: Node
    constructor(left: Node, operator: Token<TT.mul | TT.div | TT.plus | TT.minus | TT.pow | TT.root | TT.le | TT.ge | TT.lt | TT.gt | TT.eq>, right: Node) {
        super()
        this.left = left
        this.operator = operator
        this.right = right
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
    name: Token<TT.ident>
    nodes: Node[]
    constructor(name: Token<TT.ident>, nodes: Node[]) {
        super()
        this.name = name
        this.nodes = nodes
    }
    visit(program: ProgramNode, table: SymbolTable): NumberType | StringType | FunctionType {
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
            number: 1
        }
        if (this.name.data in argCount && values.length < argCount[this.name.data as keyof typeof argCount]) {
            throw new FunctionError(`${this.name.data} expects ${argCount[this.name.data as keyof typeof argCount]} items, but got ${values.length}`)
        }
        switch (this.name.data) {
            case 'eval': return createTypeFromJSType(runRelativeCalculator(program.rel, values[0].access()))
            case 'min': return new NumberType(min(values.map(v => v.access())) as number)
            case 'max': return new NumberType(max(values.map(v => v.access())) as number)
            case 'rand': return new NumberType(randInt(values[0].access(), values[1].access()))
            case 'choose': return choice(values)
            case 'needed': return new NumberType(values[0].access() - program.rel)
            case 'ineeded': return new NumberType(program.rel - (values[0].access()))
            case 'neg': return values[0].mul(new NumberType(-1))
            case 'ineg': return values[0].imul(new NumberType(-1))
            case 'floor': return new NumberType(Math.floor(values[0].access()))
            case 'ceil': return new NumberType(Math.ceil(values[0].access()))
            case 'round': return new NumberType(Math.round(values[0].access()))
            case 'aspercent': return new NumberType((values[0].access() / program.rel) * 100)
            case 'length': return new NumberType(String(values[0]).length)
            case 'concat': return new StringType(values.map(v => v.string()).join(""))
            case 'abs': return new NumberType(Math.abs(values[0].access()))
            case 'string': return values[0].string()
            case 'number': return values[0].number()
            case 'typeof': return new StringType(values[0].type)
            case 'symbols': return new StringType(table.repr())
            case 'factorial': {
                let ans = 1
                for(let i = values[0].number().access(); i > 1; i--){
                    ans *= i
                };
                return new NumberType(ans)
            }
            case 'sum': return function() {
                switch (typeof values[0].access()) {
                    case 'string': return new StringType(values.reduce((p, c) => p + c.access(), ""))
                    case 'number': return new NumberType(values.reduce((p, c) => p + c.access(), 0))
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
                let code = table.get(this.name.data)
                if (!(code instanceof FunctionType)) {
                    break;
                }

                return code.run(program.rel, values, table)
            }
        }
        return new NumberType(0)
    }

    repr(indent = 0) {
        return `Function(
${'\t'.repeat(indent + 1)}${this.name.data}(
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

    func(relativeTo: number) {
        let name = this.#curTok
        //skip name
        this.advance()

        //skip (
        this.advance()
        if (this.#curTok?.type === TT.rparen) {
            this.advance()
            return new FunctionNode(name as Token<TT.ident>, [])
        }
        if (this.#curTok === undefined) {
            throw new SyntaxError(`Expected expression after '${name?.data}('`)
        }
        let nodes = [this.statement(relativeTo)]
        while (this.#curTok?.type === TT.comma) {
            //skip ,
            this.advance()
            nodes.push(this.statement(relativeTo))
        }
        if (this.#curTok === undefined) {
            throw new SyntaxError(`Expected ')' after '${name?.data}(...`)
        }
        //skip )
        this.advance()
        return new FunctionNode(name as Token<TT.ident>, nodes)
    }

    atom(relativeTo: number): Node {
        let tok = this.#curTok
        if (tok?.type === TT.number) {
            this.advance()
            return new NumberNode(tok as Token<TT.number>)
        }
        else if (tok?.type === TT.string) {
            this.advance()
            return new StringNode(tok as Token<TT.string>)
        }
        let nameTok = this.#curTok
        if (!nameTok) {
            return new NumberNode(new Token(TT.number, 0))
        }
        this.advance()

        if (this.#curTok?.type === TT.lparen) {
            this.back()
            return this.func(relativeTo)
        }


        if (nameTok.type === TT.ident)
            return new VarAccessNode(nameTok as Token<TT.ident>)
        return new NumberNode(new Token(TT.number, 0))
    }

    factor(relativeTo: number): Node {
        let tok = this.#curTok as Token<TT>
        if (tok?.type === TT.lparen) {
            this.advance()
            let node = this.program(relativeTo)
            this.advance()
            return node
        }
        return this.atom(relativeTo)
    }

    left_unary_op(relativeTo: number): Node {
        let node;
        let isOp = false
        while ([TT.hash, TT.minus].includes(this.#curTok?.type as TT)) {
            isOp = true
            let tok = this.#curTok as Token<TT.hash | TT.minus>
            this.advance()
            node = new LeftUnOpNode(this.mutate_expr(relativeTo), tok)
        }
        if (!isOp) node = this.factor(relativeTo)
        return node as Node
    }

    mutate_expr(relativeTo: number): Node {
        let node = this.left_unary_op(relativeTo);
        while ([TT.percent, TT.hash, TT.number_suffix].includes(this.#curTok?.type as TT)) {
            let next = this.#curTok as Token<any>
            this.advance()
            node = new RightUnOpNode(node, next)
        }
        return node
    }

    higher_order_term(relativeTo: number) {
        let node = this.mutate_expr(relativeTo)
        while (TT.pow === this.#curTok?.type) {
            let token = this.#curTok as Token<TT.pow>
            this.advance()
            node = new BinOpNode(node, token, this.mutate_expr(relativeTo))
        }
        return node
    }

    term(relativeTo: number): Node {
        let node = this.higher_order_term(relativeTo)
        while ([TT.mul, TT.div].includes(this.#curTok?.type as TT)) {
            let token = this.#curTok as Token<any>
            this.advance()
            node = new BinOpNode(node, token, this.higher_order_term(relativeTo))
        }
        return node
    }

    arithmetic(relativeTo: number): Node {
        let node = this.term(relativeTo)
        while ([TT.plus, TT.minus].includes(this.#curTok?.type as TT)) {
            let token = this.#curTok as Token<any>
            this.advance()
            node = new BinOpNode(node, token, this.term(relativeTo))
        }
        return node
    }

    root(relativeTo: number): Node {
        let node = this.arithmetic(relativeTo)
        while (this.#curTok?.type === TT.root) {
            let token = this.#curTok as Token<TT.root>
            this.advance()
            node = new BinOpNode(node, token, this.arithmetic(relativeTo))
        }
        return node
    }

    var_assign(relativeTo: number): Node {
        this.advance()
        let name = this.#curTok as Token<TT.ident>
        this.advance()
        if (this.#curTok?.type === TT.eq) {
            this.advance()
            return new VariableAssignNode(name, this.comp(relativeTo))
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
        throw new SyntaxError(`Expected '=' after ${name.data}`)
    }

    expr(relativeTo: number): Node {
        return new ExpressionNode(this.root(relativeTo))
    }

    pipe(relativeTo: number): Node {
        let node = this.expr(relativeTo)
        while (this.#curTok?.type === TT.pipe) {
            if (!(node instanceof PipeNode)) {
                node = new PipeNode(node)
            }
            this.advance();
            (node as PipeNode).addToChain(this.expr(relativeTo))
        }
        return node
    }

    comp(relativeTo: number): Node {
        let left = this.pipe(relativeTo)
        if ([TT.lt, TT.le, TT.eq, TT.gt, TT.ge].includes(this.#curTok?.type as TT)) {
            let op = this.#curTok as Token<any>
            this.advance()
            left = new BinOpNode(left, op, this.pipe(relativeTo))
        }
        return left
    }

    if_statement(relativeTo: number) {
        this.advance()
        let comp = this.comp(relativeTo)
        if (this.#curTok?.type !== TT.keyword || this.#curTok?.data !== THEN) {
            throw new SyntaxError(`Expected '${THEN}' to start if block`)
        }
        this.advance()
        let code = this.program(relativeTo)
        let elseNode
        let elifPrograms: [Node, ProgramNode][] = []
        while (this.#curTok?.type === TT.keyword && (this.#curTok?.data as string) === ELIF) {
            this.advance()
            let check = this.comp(relativeTo)
            if (this.#curTok?.type !== TT.keyword || (this.#curTok?.data as string) !== THEN) {
                throw new SyntaxError(`Expected '${THEN}' to start the elif block`)
            }
            this.advance()
            let program = this.program(relativeTo)
            elifPrograms.push([check, program])
        }
        if (this.#curTok?.type === TT.keyword && (this.#curTok?.data as string) === ELSE) {
            this.advance()
            elseNode = this.program(relativeTo)
        }
        if (this.#curTok?.type !== TT.keyword || (this.#curTok?.data as string) !== ENDIF) {
            throw new SyntaxError(`Expected '${ENDIF}' to end if block`)
        }
        this.advance()
        return new IfNode(comp, code, elifPrograms, elseNode)
    }

    set_rel(relativeTo: number){
        this.advance()
        return new SetRelNode(this.comp(relativeTo))
    }

    statement(relativeTo: number) {
        if (this.#curTok?.type === TT.keyword) {
            if (this.#curTok.data === CREATE_VAR)
                return this.var_assign(relativeTo)
            else if (this.#curTok.data === IF) {
                return this.if_statement(relativeTo)
            }
            else if(this.#curTok.data === SETREL){
                return this.set_rel(relativeTo)
            }
        }
        else if (this.#curTok?.type === TT.ident) {
            let name = this.#curTok as Token<TT.ident>
            this.advance()
            if ([TT.muleq, TT.pluseq, TT.minuseq, TT.rooteq, TT.poweq, TT.diveq, TT.eq].includes(this.#curTok?.type as TT)) {
                let op = this.#curTok as Token<TT.muleq>
                this.advance()
                return new VariableBinOpAssignNode(name, op, this.comp(relativeTo))
            }
            this.back()
        }
        return this.comp(relativeTo)
    }

    program(relativeTo: number): ProgramNode {
        let nodeArr = [this.statement(relativeTo)]
        while (this.#curTok?.type === TT.semi) {
            this.advance()
            //trailing semi
            if (!this.#curTok) break;
            nodeArr.push(this.statement(relativeTo))
        }
        return new ProgramNode(nodeArr, relativeTo)
    }

    parse(relativeTo: number): ProgramNode {
        return this.program(relativeTo)
    }
}

class Interpreter {
    program: ProgramNode
    relativeTo: number
    symbolTable: SymbolTable
    constructor(program: ProgramNode, relativeTo: number, baseEnv: EnvironBase | SymbolTable) {
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

function calculateAmountRelativeToInternals(money: number, amount: string | Token<TT>[], extras?: EnvironBase | SymbolTable) {
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
        'NaN!': new NumberType(NaN),
        ...(extras ?? {})
    }
    const int = new Interpreter(expression, money, env)
    return { lexer, parser, interpreter: int, expression }
}

function calculateAmountRelativeTo(money: number, amount: string, extras?: Record<string, (total: number, k: string) => number>, typeConv = Number): number {
    return typeConv(calculateAmountRelativeToInternals(money, amount, extras).interpreter.visit())
}

function runRelativeCalculator(relativeTo: number, amount: string, extras?: Record<string, (total: number, k: string) => number>): ValidJSTypes {
    return calculateAmountRelativeToInternals(relativeTo, amount, extras).interpreter.visit()
}

export default {
    calculateAmountRelativeTo,
    calculateAmountRelativeToInternals,
    runRelativeCalculator
}
