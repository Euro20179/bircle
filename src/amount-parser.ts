import { max, min } from "lodash"
import { enumerate, isBetween, isNumeric, listComprehension } from "./util"

function randInt(min: number, max: number) {
    return Math.random() * (max - min) + min
}


class FunctionError extends Error{
    constructor(msg: string){
        super(msg)
        this.name = "FunctionError"
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
    "number_suffix",
    "special_literal"
}

const LITERALS = ['all', 'all!', 'infinity'] as const

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
    [TT.special_literal]: string
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
    #specialChars = `#,()+-*/÷ ${this.#whitespace}`


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
        let hasDot = false
        while (this.advance() !== false && (isNumeric(this.#curChar as string) || (this.#curChar === '.' && !hasDot))) {
            if (this.#curChar === '.') hasDot = true
            n += this.#curChar as string
        }
        //only go back if we have not reached the end
        if (!this.atEnd) this.back()
        return Number(n)
    }

    parseString() {
        let s = this.#curChar as string
        while (this.advance() !== false && !this.#specialChars.includes(this.#curChar as string)) {
            s += this.#curChar as string
        }
        //only go back if we have not reached the end
        if (!this.atEnd) this.back()
        return s
    }

    buildMul(){
        this.advance()
        if(this.#curChar === '*'){
            return new Token(TT.pow, '^')
        }
        this.back()
        return new Token(TT.mul, '*')
    }

    tokenize() {
        //this.advance() could return empty string which is still technically valid
        while (this.advance() !== false) {
            if (this.#whitespace.includes(this.#curChar as string)) continue;
            if (isNumeric(this.#curChar as string)) {
                this.tokens.push(new Token(TT.number, this.parseNumber()))
                continue;
            }
            switch (this.#curChar) {
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
                case "x": {
                    this.tokens.push(new Token(TT.mul, "*"))
                    break

                }
                case "*": {
                    this.tokens.push(this.buildMul())
                    break;
                }
                default: {
                    let str = this.parseString()
                    if (str === 'all' || str === 'all!' || str === 'infinity') {
                        this.tokens.push(new Token(TT.literal, str))
                    }
                    else if (this.specialLiterals.includes(str)) {
                        this.tokens.push(new Token(TT.special_literal, str))
                    }
                    else if (NUMBERSUFFIXES.includes(str as 'm' | 'b' | 'k' | 't')) {
                        this.tokens.push(new Token(TT.number_suffix, str as 'k' | 'm' | 'b' | "t"))
                        continue;
                    }
                    else this.tokens.push(new Token(TT.string, str))
                }
            }
        }
    }
}

class Node {
    visit(relativeTo: number): number {
        return 0
    }

    repr(indent = 0) {
        return ""
    }
}

class LiteralNode extends Node {
    data: Token<TT.literal>
    constructor(t: Token<TT.literal>) {
        super()
        this.data = t
    }

    visit(relativeTo: number): number {
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

class NumberNode extends Node {
    data: Token<TT.number>
    constructor(n: Token<TT.number>) {
        super()
        this.data = n
    }
    visit(relativeTo: number): number {
        return this.data.data
    }

    repr(indent = 0) {
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
    visit(relativeTo: number): number {
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
    visit(relativeTo: number): number {
        let number = this.left.visit(relativeTo)
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
    visit(relativeTo: number): number {
        let number = this.left.visit(relativeTo)
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
    visit(relativeTo: number): number {
        let left = this.left.visit(relativeTo)
        let right = this.right.visit(relativeTo)
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
    name: Token<TT.string>
    nodes: Node[]
    constructor(name: Token<TT.string>, nodes: Node[]) {
        super()
        this.name = name
        this.nodes = nodes
    }
    visit(relativeTo: number): number {
        let values = this.nodes.map(v => v.visit(relativeTo)) ?? [0]
        let argCount = {
            'rand': 2,
            'needed': 1,
            'ineeded': 1,
            'neg': 1,
            'floor': 1,
            'ceil': 1,
            'round': 1,
            'minmax': 3
        }
        if(this.name.data in argCount && values.length < argCount[this.name.data as keyof typeof argCount]){
            throw new FunctionError(`${this.name.data} expects ${argCount[this.name.data as keyof typeof argCount]} items, but got ${values.length}`)
        }
        switch (this.name.data) {
            case 'min': return min(values) ?? 0
            case 'max': return max(values) ?? 0
            case 'rand': return randInt(values[0] ?? 0, values[1] ?? 0)
            case 'needed': return (values[0] ?? 0) - relativeTo
            case 'ineeded': return relativeTo - (values[0] ?? 0)
            case 'neg': return (values[0] ?? 0) * -1
            case 'floor': return Math.floor(values[0] ?? 0)
            case 'ceil': return Math.ceil(values[0] ?? 0)
            case 'round': return Math.round(values[0] ?? 0)
            case 'minmax': {
                let min = values[0] ?? 0
                let value = values[1] ?? 0
                let max = values[2] ?? 0
                if (isBetween(min, value, max)) {
                    return value
                }
                else if (value > max) {
                    return max
                }
                return min

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
            return new FunctionNode(name as Token<TT.string>, [])
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
        return new FunctionNode(name as Token<TT.string>, nodes)
    }

    atom(): Node {
        let tok = this.#curTok
        if (tok?.type === TT.number) {
            this.advance()
            return new NumberNode(tok as Token<TT.number>)
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

    higher_order_term(){
        let node = this.mutate_expr()
        while(this.#curTok?.type === TT.pow){
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

    expr(): Node {
        return this.arith_expr()
    }

    parse(): Node {
        return this.expr()
    }
}

class Interpreter {
    node: Node
    relativeTo: number
    constructor(node: Node, relativeTo: number) {
        this.node = node
        this.relativeTo = relativeTo
    }
    visit(): number {
        return this.node.visit(this.relativeTo)
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
    return calculateAmountRelativeToInternals(money, amount, extras).interpreter.visit()
}

calculateAmountRelativeTo(3, '44')

export default {
    calculateAmountRelativeTo,
    calculateAmountRelativeToInternals
}
