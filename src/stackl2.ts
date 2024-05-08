import iterators, { Iter } from "./iterators";

type StackItem = [string | number | bigint, string]
type Stack = StackItem[]

const keywords = [
    "<",
    ">",
    "-",
    "/",
    "*",
    "+",
    "pop",
    "nop",
    "dup",
    "reg",
    "set",
    "get",
    "if",
    "!",
    "not"
] as const
type Keyword = typeof keywords[number]

function popStack(ctx: Context): StackItem {
    const res = ctx.stack.pop() ?? [0, "number"]
    ctx.registers.length.val--
    return res
}

function pushStack(ctx: Context, item: StackItem){
    ctx.stack.push(item)
    ctx.registers.length.val++
}

function binOp(ctx: Context, op: (l: any, r: any) => any) {
    let right = popStack(ctx)[0]
    let left = popStack(ctx)[0]
    let res
    if (typeof left === 'number') {
        res = op(left, Number(right))
    } else if (typeof left === 'string') {
        res = op(left, String(right))
    } else res = left as any + right
    pushStack(ctx, [res, typeof left])
}

type Register<T> = {
    val: T;
    set(this: Context, val: T): any,
    get(this: Context): T
}

type Context = {
    stack: Stack,
    registers: {
        length: Register<number>
    },
    vars: Record<string, any>,
    code: Iter
}

function getReg(ctx: Context, regName: string){
    return ctx.registers[regName as keyof Context['registers']]?.get.bind(ctx)() || 0
}

function setReg(ctx: Context, regName: string, val: any){
    ctx.registers[regName as keyof Context['registers']]?.set.bind(ctx)(val)
}

const keywordOps: Record<Keyword, (ctx: Context) => any> = {
    ">": ctx => binOp(ctx, (a, b) => a > b),
    "<": ctx => binOp(ctx, (a, b) => a < b),
    "+": (ctx) => binOp(ctx, (a, b) => a + b),
    "-": (ctx) => binOp(ctx, (a, b) => a - b),
    "*": (ctx) => binOp(ctx, (a, b) => a * b),
    "/": (ctx) => binOp(ctx, (a, b) => a / b),
    "not": ctx => pushStack(ctx, [Number(!popStack(ctx)[0]), "number"]),
    pop: ({ stack }) => stack.pop(),
    nop: ({ stack }) => stack,
    dup: (ctx) => {
        let a = popStack(ctx)
        pushStack(ctx, a)
        pushStack(ctx, a)
    },
    reg: ctx => {
        let regName = popStack(ctx)[0]
        let regData = getReg(ctx, String(regName))
        pushStack(ctx, [regData, typeof regData])
    },
    set: ctx => {
        let varName = popStack(ctx)[0]
        let data = popStack(ctx)[0]
        console.log(varName)
        if((varName as string).startsWith("%")){
            setReg(ctx, String((varName as string).slice(1)), data)
        } else {
            ctx.vars[String(varName)] = data
        }
    },
    get: ctx => {
        let varName = String(popStack(ctx)[0])
        const val = ctx.vars[varName] ?? 0
        pushStack(ctx, [val, typeof val])
    },
    if: ctx => {
        const val = popStack(ctx)[0]
        if(val){
            //run the if statement
            runCodeIter(ctx)
        } else {
            //read past the if statement since we want to ignore it
            outer: while(true){
                for(let tok of getTokens(ctx.code)){
                    console.log(tok)
                    if(tok[0] === "!"){
                        break outer
                    }
                    if(!tok.length){
                        break outer
                    }
                }
            }
        }
    },
    "!": ctx => ctx
} as const


function getNumber(code: Iter, initial: string): number | bigint {
    let next = code.next()
    while (next !== undefined && !next.match(/\s+/) && !isNaN(next)) {
        initial += next
        next = code.next()
    }
    if (next === '.') {
        return Number(`${initial.split("").reverse().join("")}.${getNumber(code, "")}`)
    }
    return BigInt(initial)
}

function getString(code: Iter, quoteType: '"' | '\''): string {
    let next = code.next()
    let text = ""
    while (next && next !== quoteType) {
        text += next
        next = code.next()
    }
    return text
}

function getKeyword(code: Iter, init: string): string {
    let keyword = init
    let next = code.next()
    while (next && !next.match(/\s+/)) {
        keyword += next
        next = code.next()
    }
    return keyword
}

function getRegisterName(code: Iter): string {
    let regName = ""
    let next = code.next()
    while(next && !next.match(/\s+/)){
        regName += next
        next = code.next()
    }
    return regName
}

function* getTokens(code: Iter): Generator<StackItem | []> {
    let next = code.next()
    if (next === undefined) {
        yield []
        return
    }
    if (next.match(/\s+/)) {
        yield ["nop", "keyword"]
        return
    }
    if (!isNaN(next)) {
        let data = getNumber(code, next)
        yield [data, "number"]
        return
    } else if ('"\''.includes(next)) {
        yield [getString(code, next), "string"]
        return
    } else if(next === "!"){
        yield ["!", "keyword"]
        yield []
        return
    } else if(next === "%"){
        let name = getRegisterName(code)
        yield [name, "string"]
        yield ["reg", "keyword"]
        return
    } else if(next === "=") {
        let n = code.next()
        const varName = getKeyword(code, n.match(/\s+/) ? "" : n)
        yield [varName, "string"]
        yield ["set", "keyword"]
        return
    } else if(next === "$") {
        const varName = getRegisterName(code)
        yield [varName, "string"]
        yield ["get", "keyword"]
        return
    } else if (next) {
        yield [getKeyword(code, next), "keyword"]
        return
    }
    yield []
}

function doKeyword(ctx: Context, keyword: Keyword) {
    keywordOps[keyword](ctx)
}

function runCodeIter(ctx: Context){
    let tok = []
    do {
        for(tok of getTokens(ctx.code)){
            if (tok.length === 0)
                break
            if (tok[1] !== "keyword"){
                pushStack(ctx, tok)
            }
            else doKeyword(ctx, tok[0] as Keyword)
        }
    } while (tok.length)
    return ctx.stack
}

function run(code: string) {
    const iter = new Iter(iterators.intoIter(code))
    const context: Context = {
        stack: [],
        registers: {
            length: {
                val: 0,
                get(){
                    return this.stack.length
                },
                set(n){
                    this.registers.length.val = n
                    this.stack.length = n
                }
            }
        },
        vars: {},
        code: iter
    }
    return runCodeIter(context)
}

export default {
    run
}
