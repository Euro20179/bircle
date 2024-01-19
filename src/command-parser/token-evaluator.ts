import { Message } from 'discord.js'
import { getContentFromResult, safeEval } from '../util'
import cmds from './cmds'
import { SymbolTable } from './cmds'
import lexer, { TT } from './lexer'
import { escape } from 'querystring'
import vars from '../vars'


/**
    * @description This class takes a list of tokens, and as necessary expands them into string tokens.
    * @description By the end, all tokens should be string tokens where each string represents 1 arg
*/
class TokenEvaluator {
    public new_tokens: TT<any>[]
    private cur_tok = new lexer.TTString("", 0, 0)
    private char_pos = 0
    constructor(public tokens: TT<any>[], private symbols: SymbolTable, private msg: Message) {
        this.new_tokens = []
    }

    add_to_cur_tok(data: string) {
        this.cur_tok.data += data
        this.char_pos += data.length
    }

    complete_cur_tok() {
        this.cur_tok.end = this.char_pos
        this.new_tokens.push(this.cur_tok)
        this.cur_tok = new lexer.TTString("", this.char_pos, this.char_pos)
    }

    async evaluate() {
        for (let token of this.tokens) {
            if (token instanceof lexer.TTPipe || token instanceof lexer.TTSemi) {
                break
            }
            else if (token instanceof lexer.TTVariable) {
                let [varName, ...ifNull] = token.data.split("||")
                let value = this.symbols.get(varName)
                if (value !== undefined) {
                    this.add_to_cur_tok(value)
                }
                else {
                    let _var = vars.getVar(this.msg, varName)
                    if (_var === false) {
                        if (ifNull) {
                            this.add_to_cur_tok(ifNull.join("||"))
                        }
                        else {
                            this.add_to_cur_tok(`\${${varName}}`)
                        }
                    }
                    else {
                        this.add_to_cur_tok(_var)
                    }
                }
            }
            else if (token instanceof lexer.TTJSExpr) {
                let lex = new lexer.Lexer(token.data, {
                    is_command: false
                })
                let tokens = lex.lex()
                let evaulator = new TokenEvaluator(tokens, this.symbols, this.msg)
                let evauluated_tokens = await evaulator.evaluate()
                let text = ""
                for (let t of evauluated_tokens) {
                    text += t.data + " "
                }
                let new_text = String(safeEval(text, {}, {}))
                this.add_to_cur_tok(new_text)
                // this.new_tokens.push(new lexer.TTString(new_text, token.start, token.end))
            }
            else if (token instanceof lexer.TTDoFirst) {
                //(PREFIX) could be really anything, it just has to be something
                let rv = await cmds.runcmd(`(PREFIX)${token.data}`, "(PREFIX)", this.msg)
                let data = getContentFromResult(rv)
                this.add_to_cur_tok(data)
                // this.new_tokens.push(new lexer.TTString(JSON.stringify(tokens), token.start, token.end))
            }
            else if (token instanceof lexer.TTString) {
                this.add_to_cur_tok(token.data)
                // this.new_tokens.push(token)
            }
            else if (token instanceof lexer.TTFormat) {
                let str = token.data
                if (format_parsers[token.data]) {
                    str = await format_parsers[token.data](token, this.symbols, this.msg)
                }
                this.add_to_cur_tok(str)
                // this.new_tokens.push(new lexer.TTString(str, token.start, token.end))
            }
            else if (token instanceof lexer.TTIFS) {
                this.complete_cur_tok()
            }
            else if (token instanceof lexer.TTEsc) {
                let char = token.data[0]
                let resp: string | string[] = ""
                if (esc_parsers[char]) {
                    resp = await esc_parsers[char](token, this.symbols, this.msg)
                }
                if (typeof resp === 'string') {
                    this.add_to_cur_tok(resp)
                }
                else if (resp.length === 1) {
                    this.add_to_cur_tok(resp[0])
                }
                //if it's a list
                else {
                    //append the first item in the list to the current arg
                    this.add_to_cur_tok(resp[0])
                    this.complete_cur_tok()
                    resp.splice(0, 1)
                    let end = resp.splice(resp.length - 1)
                    //append the middle elements as their own args
                    for (let str of resp) {
                        this.add_to_cur_tok(str)
                        this.complete_cur_tok()
                    }
                    //prepend the last item in the list to the next arg (this also creates the next arg)
                    if (end) {
                        this.add_to_cur_tok(end[0])
                    }
                }
            }
        }
        if (this.cur_tok.data) {
            this.complete_cur_tok()
        }
        if (this.new_tokens[0] && this.new_tokens[0].start == 0 && this.new_tokens[0].end == 0 && this.new_tokens[0].data == "") {
            this.new_tokens = this.new_tokens.slice(1)
        }
        return this.new_tokens
    }
}

const format_parsers: Record<string, (token: TT<any>, symbols: SymbolTable, msg: Message) => Promise<string>> = {
    ["%"]: async (_token, symbols) => {
        return symbols.get("stdin:%") ?? "{%}"
    },
}

const esc_parsers: Record<string, (token: TT<[string, string]>, symbols: SymbolTable, msg: Message) => Promise<string | string[]>> = {
    "n": async (token, _) => {
        return "\n"
    },
    t: async () => "\t",
    u: async (token) => {
        let [_, seq] = token.data
        if (!seq) {
            return "\\u"
        }
        try {
            return String.fromCodePoint(parseInt(`0x${seq}`))
        }
        catch (err) {
            return `\\u{${seq}}`
        }
    },
    U: async (...args) => await esc_parsers['u'](...args),
    s: async (token) => {
        let [_, seq] = token.data
        if (seq) {
            return seq
        }
        return " "
    },
    y: async (token, symbols, msg) => {
        let [_, seq] = token.data
        if (seq) {
            let lex = new lexer.Lexer(seq, {
                is_command: false
            })
            let tokens = lex.lex()
            let ev = new TokenEvaluator(tokens, symbols, msg)
            let new_tokens = await ev.evaluate()
            let text = ""
            for (let tok of new_tokens) {
                text += tok.data + " "
            }
            return text
        }
        return " "
    },
    Y: async (token, symbols, msg) => {
        let [_, seq] = token.data
        if (seq) {
            let lex = new lexer.Lexer(seq, {
                is_command: false
            })
            let tokens = lex.lex()
            let ev = new TokenEvaluator(tokens, symbols, msg)
            let new_tokens = await ev.evaluate()
            let strs: string[] = []
            for (let tok of new_tokens) {
                strs.push(tok.data)
            }
            return strs
        }
        return " "
    },
    //TODO: a: should return the programArgs, * returns as 1 arg, @ seperates the args, # returns the number of args, eg: \a{*}, \a{@}, \a{#}, \a{1}: would return the 1st argument (0 indexed)
    b: async (token) => `**${token.data[1]}**`,
    i: async (token) => `*${token.data[1]}*`,
    S: async (token) => `~~${token.data[1]}~~`,
    d: async (token) => {
        let [_, seq] = token.data
        let date = new Date(seq).toString()
        if (date === 'Invalid Date') {
            if (seq) {
                return `\\d{${seq}}`
            }
            return `\\d`
        }
        return date
    },
    D: async (...args) => esc_parsers['d'](...args),
    A: async (token) => {
        let [_, seq] = token.data
        if (seq) {
            return seq.split("")
        }
        return ""
    },
    T: async (token) => {
        let [_, seq] = token.data
        let ts = Date.now()
        if (parseFloat(seq)) {
            return String(ts / parseFloat(seq))
        }
        return String(ts)
    },
    V: async (token, __, msg) => {
        let [_, sequence] = token.data
        let [scope, ...n] = sequence.split(":")
        let name = n.join(":")
        if (scope == "%") {
            scope = msg.author.id
        }
        else if (scope == ".") {
            let v = vars.getVar(msg, name)
            if (v !== false) {
                return v
            }
            return `\\V{${sequence}}`
        }
        else if (!name) {
            name = scope
            let v = vars.getVar(msg, name)
            if (v !== false) {
                return v
            }
            return `\\V{${sequence}}`
        }
        let v = vars.getVar(msg, name, scope)
        if (v !== false) {
            return v
        }
        return `\\V{${sequence}}`
    },
    v: async(token, _, msg) => {
        let [__, sequence] = token.data
        let num = Number(sequence)
        //basically checks if it's a n
        if (!isNaN(num)) {
            let args = msg.content.split(" ")
            return args[num]
        }
        let v = vars.getVar(msg, sequence, msg.author.id)
        if (v === false)
            v = vars.getVar(msg, sequence)
        if (v !== false) {
            v
        }
        return `\\v{${sequence}}`
    },
    ["\\"]: async(token) => {
        let seq = token.data[1]
        if(seq){
            return `\\{${seq}}`
        }
        return `\\`
    },
    [" "]: async(token) => {
        let seq = token.data[1]
        if(seq){
            return seq
        }
        return " "
    }
}

export default {
    TokenEvaluator
}
