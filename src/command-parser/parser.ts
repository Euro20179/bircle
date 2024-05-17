import lexer, { TT } from './lexer'

const logicType = {
    And: 0,
    Or: 1,
    Nop: 2,
} as const

export type LogicType = typeof logicType

function mkt(count: number){
    return '\t'.repeat(count)
}

export class Node<TChild> {
    protected children: TChild[]
    constructor(children: TChild[] = []){
        this.children = children
    }
    addChild(child: TChild){
        this.children.push(child)
    }

    get childs () {
        return this.children
    }
}
//pipe class has no children
export class PipeNode extends Node<never> {
    constructor(private data: TT<any>[] = []) {
        super()
    }

    get tokens(){
        return this.data
    }

    addTok(tok: TT<any>){
        this.data.push(tok)
    }

    sprint(tabCount: number = 0){
        return `${mkt(tabCount)}(
${mkt(tabCount + 1)}Pipe, ${JSON.stringify(this.data)}
${mkt(tabCount)})`
    }
}
export class LogicNode extends Node<PipeNode> {
    constructor(private logicType: LogicType[keyof LogicType], private left: PipeNode[], private right: LogicNode[] = []) {
        super()
    }
    sprint(tabCount: number = 0){
        let text = `${mkt(tabCount)}(
${mkt(tabCount + 1)}Logic(${this.logicType})
${mkt(tabCount + 1)}Todo:\n`
        for(const child of this.left){
            text += child.sprint(tabCount + 2) + "\n"
        }
        text += `${mkt(tabCount + 1)}Next:\n`
        for(const child of this.right){
            text += child.sprint(tabCount + 2) + "\n"
        }
        text += mkt(tabCount + 1) + ")"
        return text
    }

    addNext(child: LogicNode){
        this.next.push(child)
    }

    get todo(){
        return this.left
    }

    get next(){
        return this.right
    }

    get logic(){
        return this.logicType
    }
}
export class LineNode extends Node<LogicNode> {
    constructor() {
        super()
    }
    sprint(tabCount: number = 0){
        let text = `${mkt(tabCount)}(
${mkt(tabCount + 1)}Line\n`
        for(const child of this.children){
            text += child.sprint(tabCount + 1) + "\n"
        }
        text += mkt(tabCount) + ")"
        return text
    }
}

export class CommandNode extends Node<LineNode> {
    constructor(){
        super()
    }
    sprint(tabCount: number = 0){
        let text = `${mkt(tabCount)}(
${mkt(tabCount + 1)}Command\n`
        for(const child of this.children){
            text += child.sprint(tabCount + 1) + "\n"
        }
        text += mkt(tabCount) + ")"
        return text
    }
}

class Parser {
    private i = -1
    private genedToks: TT<any>[] = []
    constructor(private tokens: Generator<TT<any>>){ }

    get curTok () {
        if(this.genedToks.length === 0){
            this.next()
        }
        return this.genedToks[this.i]
    }

    next(){
        const next = this.tokens.next()
        this.genedToks.push(next.value)
        this.i++
        return !next.done
    }

    back(){
        return --this.i >= 0
    }

    pipeLine(): PipeNode{
        const pipe = new PipeNode()

        while(!(this.curTok.isAny([lexer.TTPipe, lexer.TTSemi, lexer.TTAnd, lexer.TTOr]))){
            pipe.addTok(this.curTok)
            if(!this.next()){
                break
            }
        }

        return pipe
    }

    logicLine(logicTok: TT<any>): LogicNode{
        let lt: number = logicType.Nop
        if(logicTok instanceof lexer.TTOr){
            lt = logicType.Or
        } else if(logicTok instanceof lexer.TTAnd){
            lt = logicType.And
        }

        let left = [this.pipeLine()]
        while(this.curTok instanceof lexer.TTPipe){
            this.next()
            left.push(this.pipeLine())
        }

        const logic = new LogicNode(lt as 0 | 1 | 2, left)

        while(this.curTok?.isAny([lexer.TTOr, lexer.TTAnd])){
            let logicTok = this.curTok
            if(!this.next()){
                break
            }
            logic.next.push(this.logicLine(logicTok))
        }

        return logic
    }

    semiLine(): LineNode{
        const line = new LineNode()

        do {
            let lt = new lexer.TTNop(">nop>", 0, 0)
            if(this.curTok instanceof lexer.TTAnd || this.curTok instanceof lexer.TTOr){
                lt  = this.curTok
                if(!this.next()){
                    break
                }
            }
            line.addChild(this.logicLine(lt))
        } while(this.curTok instanceof lexer.TTAnd || this.curTok instanceof lexer.TTOr)

        return line
    }

    buildCommandTree(): CommandNode{
        const tree = new CommandNode()

        do {
            if(this.curTok instanceof lexer.TTSemi){
                if(!this.next()){
                    break
                }
            }
            tree.addChild(this.semiLine())
        } while(this.curTok instanceof lexer.TTSemi)

        return tree
    }
}

function createCommandFromTokens(token_generator: Generator<TT<any>>): TT<any>[][][][] {
    let lines = []

    let cur_token: TT<any> | undefined

    let done = false

    function createPipePart(token_generator: Generator<TT<any>>) {
        let tokens = []
        let gen_value
        while ((gen_value = token_generator.next())) {
            cur_token = gen_value.value
            done = gen_value.done ?? false
            if (done || !cur_token || cur_token instanceof lexer.TTAnd || cur_token instanceof lexer.TTPipe || cur_token instanceof lexer.TTSemi) {
                break
            }
            tokens.push(cur_token)
        }
        return tokens
    }

    function createLogicPart(token_generator: Generator<TT<any>>) {
        let pipeLines = []
        do {
            pipeLines.push(createPipePart(token_generator))
        } while (!done && !(cur_token instanceof lexer.TTAnd || cur_token instanceof lexer.TTSemi))
        return pipeLines
    }

    function createCommandLine(token_generator: Generator<TT<any>>) {
        let ll = []
        do {
            ll.push(createLogicPart(token_generator))
        } while (!done && !(cur_token instanceof lexer.TTSemi))
        return ll
    }

    do {
        lines.push(createCommandLine(token_generator))
    } while (cur_token)
    return lines
}

export default {
    createCommandFromTokens,
    Parser,
    logicType
}

