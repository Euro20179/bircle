import { max, min } from "lodash"
import { enumerate, isNumeric, listComprehension } from "./util"

function randInt(min: number, max: number) {
    return Math.random() * (max - min) + min
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

    #specialChars = "#,()+-*/÷"
    #whitespace = "\n\t "


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
                case "x":
                case "*": {
                    this.tokens.push(new Token(TT.mul, "*"))
                    break
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
}

class UnOpNode extends Node {
    left: Node | Token<TT.hash>
    operator: Token<TT.percent | TT.hash | TT.number_suffix> | Node
    constructor(left: Node | Token<TT.hash>, operator: Token<TT.percent | TT.hash> | Node) {
        super()
        this.left = left
        this.operator = operator
    }
    visit(relativeTo: number): number {
        let number = 0
        if (this.left instanceof Node) {
            number = this.left.visit(relativeTo)
        }
        if (this.operator instanceof Node) {
            number = this.operator.visit(relativeTo)
            return number - (relativeTo % relativeTo)
        }
        else {
            switch (this.operator.data) {
                case '#': return relativeTo % number
                case '%': return (number / 100) * relativeTo
                case 'k': return number * 1000
                case 'm': return number * 1_000_000
                case 'b': return number * 1_000_000_000
                case 't': return number * 1_000_000_000_000
            }
        }
    }
}

class BinOpNode extends Node {
    left: Node
    operator: Token<TT.mul | TT.div | TT.plus | TT.minus>
    right: Node
    constructor(left: Node, operator: Token<TT.mul | TT.div | TT.plus | TT.minus>, right: Node) {
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
        }
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
        }
        return 0
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
        //if we aren't using a (, that means that this is not a function
        if(this.#curTok?.type !== TT.lparen && name?.type === TT.special_literal){
            return new SpecialLiteralNode((name as Token<TT.special_literal>).data, this.specialLiterals[name.data])
        }
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
            throw new SyntaxError("Expected ')'")
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
        return this.func()
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

    term(): Node {
        let node = this.factor()
        while ([TT.mul, TT.div].includes(this.#curTok?.type as TT)) {
            let token = this.#curTok as Token<any>
            this.advance()
            node = new BinOpNode(node, token, this.factor())
        }
        return node
    }

    arith_expr(): Node {
        let node = this.mutate_expr()
        while ([TT.plus, TT.minus].includes(this.#curTok?.type as TT)) {
            let token = this.#curTok as Token<any>
            this.advance()
            node = new BinOpNode(node, token, this.mutate_expr())
        }
        return node
    }

    mutate_expr() {
        if (this.#curTok?.type === TT.hash) {
            let tok = this.#curTok as Token<TT.hash>
            this.advance()
            return new UnOpNode(tok, this.term())
        }
        let node = this.term()
        if ([TT.percent, TT.hash, TT.number_suffix].includes(this.#curTok?.type as TT)) {
            let next = this.#curTok as Token<any>
            this.advance()
            return new UnOpNode(node, next)
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


function calculateAmountRelativeTo(money: number, amount: string, extras?: Record<string, (total: number, k: string) => number>): number {
    let lexer = new Lexer(amount, Object.keys(extras ?? {}))
    lexer.tokenize()
    let parser = new Parser(lexer.tokens, extras)
    let expression = parser.parse()
    const int = new Interpreter(expression, money)
    return int.visit()
}

export default {
    calculateAmountRelativeTo
}
