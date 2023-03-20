import { max, min } from "lodash"
import { emitsEvent, enumerate, isBetween, isNumeric, listComprehension, choice } from "./util"

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
    "literal",
    "plus",
    "minus",
    "mul",
    "div",
    'pow',
    semi,
    ident,
    keyword,
    eq,
    "number_suffix",
    "special_literal"
}

const LITERALS = ['all', 'all!', 'infinity'] as const

const KEYWORDS = ['var'] as const

function strIsLiteral(str: string): str is typeof LITERALS[number] {
    return LITERALS.includes(str as typeof LITERALS[number])
}

type TokenDataType = {
    [TT.hash]: "#",
    [TT.string]: string,
    [TT.comma]: ",",
    [TT.number]: number,
    [TT.lparen]: "(",
    [TT.rparen]: ")",
    [TT.percent]: "%",
    [TT.literal]: typeof LITERALS[number],
    [TT.number_suffix]: 'k' | 'm' | 'b' | 't'
    [TT.plus]: "+",
    [TT.minus]: "-",
    [TT.mul]: "*",
    [TT.div]: "/",
    [TT.pow]: "^",
    [TT.special_literal]: string,
    [TT.semi]: ';',
    [TT.ident]: string,
    [TT.eq]: '=',
    [TT.keyword]: typeof KEYWORDS[number]
}

class Token<TokenType extends TT> {
    type: TokenType
    data: TokenDataType[TokenType]
    constructor(type: TokenType, data: TokenDataType[TokenType]) {
        this.data = data
        this.type = type
    }
}

const NUMBERSUFFIXES = ['k', 'm', 'b', 't',] as const
class Lexer {
    tokens: Token<TT>[] = []
    data: string

    specialLiterals: string[]

    #curChar: string[number] | undefined
    #i: number = -1

    #whitespace = "\n\t "
    #specialChars = `#,()+-*/÷ ${this.#whitespace};`


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
        //only go back if we have not reached the end
        if (!this.atEnd) this.back()
        return Number(n)
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
                case "÷":
                case "/": {
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
                    this.tokens.push(new Token(TT.eq, '='))
                    break;
                }
                default: {
                    let str = this.parseLiteral()
                    if(KEYWORDS.includes(str as typeof KEYWORDS[number])){
                        this.tokens.push(new Token(TT.keyword, str as typeof KEYWORDS[number]))
                    }
                    else if (strIsLiteral(str)) {
                        this.tokens.push(new Token(TT.literal, str))
                    }
                    else if (this.specialLiterals.includes(str)) {
                        this.tokens.push(new Token(TT.special_literal, str))
                    }
                    else if (NUMBERSUFFIXES.includes(str as 'm' | 'b' | 'k' | 't')) {
                        this.tokens.push(new Token(TT.number_suffix, str as 'k' | 'm' | 'b' | "t"))
                        continue;
                    }
                    else this.tokens.push(new Token(TT.ident, str))
                }
            }
        }
    }
}

class SymbolTable extends Map{
}

abstract class Node {
    abstract visit(relativeTo: number, table: SymbolTable): number | string
    abstract repr(indent: number): string
}

abstract class Program {
    abstract visit(relativeTo: number, table: SymbolTable): number[]
    abstract repr(indent: number): string
}

class ProgramNode extends Program {
    expressions: Exclude<Node, ProgramNode>[]
    constructor(ns: Node[]) {
        super()
        this.expressions = ns
    }

    visit(relativeTo: number, table: SymbolTable): number[] {
        return this.expressions.map(v => v.visit(relativeTo, table)).flat().map(v => Number(v))
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

class ExpressionNode extends Node {
    node: Node
    constructor(n: Node) {
        super()
        this.node = n
    }

    visit(relativeTo: number, table: SymbolTable): number | string {
        return this.node.visit(relativeTo, table)
    }

    repr(indent: number = 0): string {
        return `Expr(
${'\t'.repeat(indent + 1)}${this.node.repr(indent + 1)}
${'\t'.repeat(indent)})`
    }
}

class VariableAssignNode extends Node{
    name: Token<TT.ident>
    value: Node
    constructor(name: Token<TT.ident>, value: Node){
        super()
        this.name = name
        this.value = value
    }

    visit(relativeTo: number, table: SymbolTable): string | number {
        let val = this.value.visit(relativeTo, table)
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

class VarAccessNode extends Node{
    name: Token<TT.ident>
    constructor(name: Token<TT.ident>){
        super()
        this.name = name
    }

    visit(relativeTo: number, table: SymbolTable): string | number {
        console.log(table, this.name)
        return table.get(this.name.data) ?? 0
    }

    repr(indent: number): string {
        return `VarAccess(${this.name.data})`
    }
}

class LiteralNode extends Node {
    data: Token<TT.literal>
    constructor(t: Token<TT.literal>) {
        super()
        this.data = t
    }

    visit(relativeTo: number, table: SymbolTable): number {
        switch (this.data.data) {
            case 'all': {
                return relativeTo * .99
            }
            case 'all!': {
                return relativeTo
            }
            case 'infinity': {
                return Infinity
            }
        }
    }

    repr(indent = 0) {
        return `Literal(
${'\t'.repeat(indent + 1)}${this.data.data}
${'\t'.repeat(indent)})`
    }
}

class StringNode extends Node {
    data: Token<TT.string>

    constructor(n: Token<TT.string>) {
        super()
        this.data = n
    }

    visit(relativeTo: number, table: SymbolTable): string {
        return this.data.data
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
    visit(): number {
        return this.data.data
    }

    repr() {
        return `Number(${this.data.data})`
    }

}

class SpecialLiteralNode extends Node {
    name: string
    onVisit: (total: number, k: string) => number
    constructor(name: string, onVisit: (total: number, k: string) => number) {
        super()
        this.name = name
        this.onVisit = onVisit
    }
    visit(relativeTo: number, table: SymbolTable): number {
        return this.onVisit(relativeTo, this.name)
    }

    repr(indent = 0) {
        return `Special(
${'\t'.repeat(indent + 1)}${this.name}
${'\t'.repeat(indent)})`
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
    visit(relativeTo: number, table: SymbolTable): number {
        let number = this.left.visit(relativeTo, table)
        if (typeof number === 'string') {
            throw new OperatorError(`'${this.operator.data}' expected number, found string`)
        }
        switch (this.operator.data) {
            case '#': return relativeTo % number
            case '%': return (number / 100) * relativeTo
            case 'k': return number * 1000
            case 'm': return number * 1_000_000
            case 'b': return number * 1_000_000_000
            case 't': return number * 1_000_000_000_000
        }
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
    operator: Token<TT.hash>
    constructor(left: Node, operator: Token<TT.hash>) {
        super()
        this.left = left
        this.operator = operator
    }
    visit(relativeTo: number, table: SymbolTable): number {
        let number = this.left.visit(relativeTo, table)
        if (typeof number === 'string') {
            throw new OperatorError(`'${this.operator.data}' expected number, found string`)
        }
        return number - (relativeTo % number)
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
    operator: Token<TT.mul | TT.div | TT.plus | TT.minus | TT.pow>
    right: Node
    constructor(left: Node, operator: Token<TT.mul | TT.div | TT.plus | TT.minus | TT.pow>, right: Node) {
        super()
        this.left = left
        this.operator = operator
        this.right = right
    }
    visit(relativeTo: number, table: SymbolTable): number {
        let left = this.left.visit(relativeTo, table)
        let right = this.right.visit(relativeTo, table)
        if (typeof left !== 'number' || typeof right !== 'number') {
            throw new OperatorError(`${this.operator.data} expected 2 numbers, but found ${typeof left} and ${typeof right}`)
        }
        switch (this.operator.data) {
            case '+': return left + right;
            case '-': return left - right;
            case '*': return left * right;
            case '/': return left / right;
            case '^': return Math.pow(left, right);
        }
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
    visit(relativeTo: number, table: SymbolTable): number | string {
        let values = this.nodes.map(v => v.visit(relativeTo, table)) ?? [0]
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
        }
        if (this.name.data in argCount && values.length < argCount[this.name.data as keyof typeof argCount]) {
            throw new FunctionError(`${this.name.data} expects ${argCount[this.name.data as keyof typeof argCount]} items, but got ${values.length}`)
        }
        switch (this.name.data) {
            case 'min': return min(values.map(v => Number(v))) ?? 0
            case 'max': return max(values.map(v => Number(v))) ?? 0
            case 'rand': return randInt(Number(values[0]) ?? 0, Number(values[1]) ?? 0)
            case 'choose': return choice(values ?? [0])
            case 'needed': return (Number(values[0]) ?? 0) - relativeTo
            case 'ineeded': return relativeTo - (Number(values[0]) ?? 0)
            case 'neg': return (Number(values[0]) ?? 0) * -1
            case 'floor': return Math.floor(Number(values[0]) ?? 0)
            case 'ceil': return Math.ceil(Number(values[0]) ?? 0)
            case 'round': return Math.round(Number(values[0]) ?? 0)
            case 'aspercent': return (Number(values[0]) / relativeTo) * 100
            case 'length': return String(values[0]).length
            case 'concat': return values.map(v => String(v)).join("")
            case 'minmax': {
                let min = values[0] ?? 0
                let value = values[1] ?? 0
                let max = values[2] ?? 0
                if (isBetween(Number(min), Number(value), Number(max))) {
                    return Number(value)
                }
                else if (value > max) {
                    return Number(max)
                }
                return Number(min)

            }
        }
        return 0
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
    specialLiterals: Record<string, (total: number, k: string) => number>
    #i = -1
    #curTok: Token<TT> | undefined = undefined

    constructor(tokens: Token<TT>[], specialLiterals?: Record<string, (total: number, k: string) => number>) {
        this.tokens = tokens
        this.specialLiterals = specialLiterals ?? {}
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
        let nodes = [this.expr()]
        while (this.#curTok?.type === TT.comma) {
            //skip ,
            this.advance()
            nodes.push(this.expr())
        }
        if (this.#curTok === undefined) {
            throw new SyntaxError(`Expected ')' after '${name?.data}(...`)
        }
        //skip )
        this.advance()
        return new FunctionNode(name as Token<TT.ident>, nodes)
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
        else if (tok?.type === TT.literal) {
            this.advance()
            return new LiteralNode(tok as Token<TT.literal>)
        }
        let nameTok = this.#curTok
        if (!nameTok) {
            return new NumberNode(new Token(TT.number, 0))
        }
        this.advance()
        if (this.#curTok?.type === TT.lparen) {
            this.back()
            return this.func()
        }
        if (this.specialLiterals[nameTok.data])
            return new SpecialLiteralNode((nameTok as Token<TT.special_literal>).data, this.specialLiterals[nameTok.data])

        if(nameTok.type === TT.ident)
            return new VarAccessNode(nameTok as Token<TT.ident>)
        return new NumberNode(new Token(TT.number, 0))
    }

    factor(): Node {
        let tok = this.#curTok as Token<TT>
        if (tok?.type === TT.lparen) {
            this.advance()
            let node = this.expr()
            this.advance()
            return node
        }
        return this.atom()
    }

    left_unary_op() {
        let node;
        if (this.#curTok?.type === TT.hash) {
            let tok = this.#curTok as Token<TT.hash>
            this.advance()
            node = new LeftUnOpNode(this.factor(), tok)
        }
        else node = this.factor()
        return node
    }

    mutate_expr() {
        let node = this.left_unary_op();
        while ([TT.percent, TT.hash, TT.number_suffix].includes(this.#curTok?.type as TT)) {
            let next = this.#curTok as Token<any>
            this.advance()
            node = new RightUnOpNode(node, next)
        }
        return node
    }

    higher_order_term() {
        let node = this.mutate_expr()
        while (this.#curTok?.type === TT.pow) {
            let token = this.#curTok as Token<any>
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

    arith_expr(): Node {
        let node = this.term()
        while ([TT.plus, TT.minus].includes(this.#curTok?.type as TT)) {
            let token = this.#curTok as Token<any>
            this.advance()
            node = new BinOpNode(node, token, this.term())
        }
        return node
    }

    var_assign(): Node {
        this.advance()
        let name = this.#curTok as Token<TT.ident>
        this.advance()
        if(this.#curTok?.type === TT.eq){
            this.advance()
            return new VariableAssignNode(name, this.arith_expr())
        }
        throw new SyntaxError(`Expected '=' after ${name.data}`)
    }

    expr(): Node {
        if(this.#curTok?.type === TT.keyword && this.#curTok.data === 'var'){
            return this.var_assign()
        }
        return new ExpressionNode(this.arith_expr())
    }

    program(): ProgramNode {
        let nodeArr = [this.expr()]
        while (this.#curTok?.type === TT.semi) {
            this.advance()
            nodeArr.push(this.expr())
        }
        return new ProgramNode(nodeArr)
    }

    parse(): ProgramNode {
        return this.program()
    }
}

class Interpreter {
    program: ProgramNode
    relativeTo: number
    symbolTable: SymbolTable
    constructor(program: ProgramNode, relativeTo: number) {
        this.program = program
        this.relativeTo = relativeTo
        this.symbolTable = new SymbolTable()
    }
    visit(): number[] {
        return this.program.visit(this.relativeTo, this.symbolTable)
    }
}

function calculateAmountRelativeToInternals(money: number, amount: string, extras?: Record<string, (total: number, k: string) => number>) {
    let lexer = new Lexer(amount, Object.keys(extras ?? {}))
    lexer.tokenize()
    let parser = new Parser(lexer.tokens, extras)
    let expression = parser.parse()
    const int = new Interpreter(expression, money)
    return { lexer, parser, interpreter: int, expression }
}

function calculateAmountRelativeTo(money: number, amount: string, extras?: Record<string, (total: number, k: string) => number>): number {
    return calculateAmountRelativeToInternals(money, amount, extras).interpreter.visit().slice(-1)[0]
}

function runRelativeCalculator(relativeTo: number, amount: string, extras?: Record<string, (total: number, k: string) => number>): number[] {
    return calculateAmountRelativeToInternals(relativeTo, amount, extras).interpreter.visit()
}

export default {
    calculateAmountRelativeTo,
    calculateAmountRelativeToInternals,
    runRelativeCalculator
}
