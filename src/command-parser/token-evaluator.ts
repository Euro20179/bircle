import { ChannelType, Message } from 'discord.js'
import { formatMember, getContentFromResult, safeEval } from '../util'
import cmds, { RuntimeOptions } from './cmds'
import { SymbolTable } from './cmds'
import lexer, { TT } from './lexer'
import vars from '../vars'
import economy from '../economy'
import timer from '../timer'
import { format } from '../parsing'
import htmlRenderer from '../html-renderer'
import userOptions from '../user-options'
import amountParser from '../amount-parser'
import stackl2 from '../stackl2'
import dateParsing from '../date-parsing'
import iterators from '../iterators'



/**
    * @description This class takes a list of tokens, and as necessary expands them into string tokens.
    * @description By the end, all tokens should be string tokens where each string represents 1 arg
*/
class TokenEvaluator {
    public new_tokens: TT<any>[]
    private i = -1
    private cur_parsing_tok?: TT<any>
    private cur_tok = new lexer.TTString("", 0, 0)
    private char_pos = 0
    private cur_arg = 0
    //goes from arg to do first number
    private doFirstNoFromArgNo: Record<number, number> = {}
    //goes from do first number to the actual text of the dofirst
    private doFirstFromDoFirstNo: Record<number, string> = {}
    private do_first_count = 0
    constructor(public tokens: TT<any>[], private symbols: SymbolTable, private msg: Message, private runtime_opts: RuntimeOptions) {
        this.new_tokens = []
    }

    add_to_cur_tok(data: string) {
        this.cur_tok.data += data
        this.char_pos += data.length
    }

    complete_cur_tok() {
        this.cur_arg++
        this.cur_tok.end = this.char_pos
        this.new_tokens.push(this.cur_tok)
        this.cur_tok = new lexer.TTString("", this.char_pos, this.char_pos)
    }

    async eval_token(token: TT<any>) {
        if (token instanceof lexer.TTPipe || token instanceof lexer.TTSemi) {
            return false
        }
        else if (token instanceof lexer.TTDoFirstRepl) {
            if (token.data === "") {
                return true
            }
            let [doFirstArgNo, doFirstResultNo] = token.data.split(":")
            if (doFirstResultNo === undefined) {
                doFirstResultNo = doFirstArgNo
                doFirstArgNo = String(this.doFirstNoFromArgNo[this.cur_arg])
            }
            let doFirst = this.doFirstFromDoFirstNo[Number(doFirstArgNo)]
            if (doFirst !== undefined) {
                let text = ""
                if (doFirstResultNo === "") {
                    text = doFirst
                }
                else if (doFirstResultNo.startsWith("..")) {
                    let split = doFirstResultNo.slice(2) || " "
                    let strings = doFirst.split(split)
                    this.add_list_of_strings(strings)
                    return true
                }
                else {
                    text = doFirst.split(" ")[Number(doFirstResultNo)] ?? ""
                }
                this.add_to_cur_tok(text)
            }
        }
        else if (token instanceof lexer.TTVariable) {
            let [varName, operator, operatorArg] = token.data
            let val = ""
            //let [varName, ...ifNull] = token.data.split("||")
            if (varName.startsWith("&") && userOptions.isValidOption(varName.slice(1))) {
                val = userOptions.getOpt(this.msg.author.id, varName.slice(1) as "currency-sign", "")
            }
            else {
                let symbolValue = this.symbols.get(varName)
                if(typeof symbolValue === 'function'){
                    let res = ""
                    for await(let item of symbolValue()){
                        res += getContentFromResult(item, "\n")
                    }
                    val = res
                } else if(symbolValue === undefined){
                    val = vars.getVar(this.msg, varName)
                } else {
                    val = symbolValue
                }
            }
            switch (operator) {
                case '||': if (!val) val = operatorArg; break
                case '&&': if (val) val = operatorArg; break
                case '#': val = val.replace(new RegExp(`^${operatorArg}`), ""); break
                case '%': val = val.replace(new RegExp(`${operatorArg}$`), ""); break
                case '/':
                    let [find, replace, flags] = operatorArg.split(/(?<!\\)\//)
                    flags ||= ""
                    val = val.replace(new RegExp(find, flags), replace)
                    break
                case 'IF/':
                    let [i, e] = operatorArg.split("ELSE/")
                    val = val ? i : e
                    break
                case ">!>": {
                    let args = operatorArg.split("+")
                    for (let i = 0; i < args.length; i++) {
                        this.symbols.set(`#${i}`, args[i])
                    }
                    const syn = await cmds.expandSyntax(val, this.msg, this.symbols, this.runtime_opts)
                    this.add_list_of_strings(syn)
                    // for await(const r of cmds.runcmdv2({prefix: "", command: val, msg: this.msg, symbols: this.symbols, runtime_opts: this.runtime_opts})){
                    //     strings.push(getContentFromResult(r, '\n'))
                    // }
                    // this.add_list_of_strings(strings)
                    for (let i = 0; i < args.length; i++) {
                        this.symbols.delete(`#${i}`)
                    }
                    return true
                }
                case "<<": {
                    switch (varName.trim()) {
                        case "rel": {
                            val = amountParser.runRelativeCalculator(0, operatorArg).toString()
                            break
                        }
                        case "stk": {
                            val = stackl2.run(operatorArg).map(v => String(v[0])).join("\n")
                            break
                        }
                    }
                    break
                }
                default:
                    if (val == undefined || val === "") val = `\${${varName}}`
            }
            this.add_to_cur_tok(val)
        }
        else if (token instanceof lexer.TTJSExpr) {
            let text = (await cmds.expandSyntax(token.data, this.msg, this.symbols, this.runtime_opts)).join(" ")
            let new_text
            if(text.startsWith("#rel")){
                new_text = amountParser.runRelativeCalculator(0, text.slice("#rel".length)).toString()
            } else if(text.startsWith("#stk")){
                new_text = stackl2.run(text.slice("#stk".length)).map(v => String(v[0])).join("\n")
            }
            else new_text = String(safeEval(text, {}, {}))
            this.add_to_cur_tok(new_text)
            // this.new_tokens.push(new lexer.TTString(new_text, token.start, token.end))
        }
        else if (token instanceof lexer.TTDoFirst) {
            //(PREFIX) could be really anything, it just has to be something
            let text = ""
            let runtime_copy = this.runtime_opts.copy()
            for await (let result of cmds.runcmdv2({ command: `(PREFIX)${token.data}`, prefix: "(PREFIX)", msg: this.msg, runtime_opts: runtime_copy, symbols: this.symbols })) {
                text += result ? getContentFromResult(result, "\n") : ""
            }
            //let TTDoFirstRepl add to text, if the user doesnt provide one the lexer inserts a default of %{} before the doFirst
            this.doFirstNoFromArgNo[this.cur_arg] = this.do_first_count
            this.doFirstFromDoFirstNo[this.do_first_count] = text
            this.do_first_count++
            //if the next token is not a TTDoFirstRepl token insert a %{0} token
            //this allows for %{} syntax to make the dofirst replace with nothing
            this.advance()
            if (!(this.cur_parsing_tok instanceof lexer.TTDoFirstRepl)) {
                this.add_to_cur_tok(text)
                // await this.eval_token(new lexer.TTDoFirstRepl(":", this.i, this.i))
            }
            this.back()
            // this.new_tokens.push(new lexer.TTString(JSON.stringify(tokens), token.start, token.end))
        }
        else if (token instanceof lexer.TTCommand) {
            let syntax = await cmds.expandSyntax(token.data, this.msg, this.symbols, this.runtime_opts)
            this.add_to_cur_tok(syntax.join(" "))
            this.complete_cur_tok()
            this.cur_arg--
        }
        else if (token instanceof lexer.TTSyntax) {
            let text = await cmds.expandSyntax(token.data, this.msg, this.symbols, this.runtime_opts)
            this.add_to_cur_tok(text.join(" "))
        }
        else if (token instanceof lexer.TTString) {
            this.add_to_cur_tok(token.data)
            // this.new_tokens.push(token)
        }
        else if (token instanceof lexer.TTFormat) {
            let [seq, ...args] = token.data.split("|")
            let str = token.data
            if (format_parsers[seq]) {
                str = await format_parsers[seq](token, this.symbols, seq, args, this.msg, this.runtime_opts)
                this.add_to_cur_tok(`${str}`)
            }
            else {
                this.add_to_cur_tok(`{${str}}`)
            }
            // this.new_tokens.push(new lexer.TTString(str, token.start, token.end))
        }
        else if (token instanceof lexer.TTRange) {
            let [start, end] = token.data
            let pre_data = this.cur_tok.data ?? ""
            let post_data = ""
            if (this.advance() && !(this.cur_parsing_tok instanceof lexer.TTIFS)) {
                let ev = new TokenEvaluator([this.cur_parsing_tok as TT<any>], this.symbols, this.msg, this.runtime_opts)
                post_data = (await ev.evaluate())[0].data
            }
            else {
                this.back()
            }
            const seq = start.split(",").map(Number)
            const filledSeq = iterators.sequence(...seq, end)
            if(!filledSeq){
                this.add_to_cur_tok(`{${start}..${end}}`)
            } else {
                const strings = []
                for(const item of filledSeq.take(10000)){
                    strings.push(`${pre_data}${item}${post_data}`)
                }
                this.add_list_of_strings(strings)
            }
        }
        else if (token instanceof lexer.TTIFS) {
            if(this.cur_tok.data.length){
                this.complete_cur_tok()
            }
        }
        else if (token instanceof lexer.TTEsc) {
            let char = token.data[0]
            let resp: string | string[] = ""
            if (esc_parsers[char]) {
                resp = await esc_parsers[char](token, this.symbols, this.msg, this.runtime_opts)
            }
            if (typeof resp === 'string') {
                this.add_to_cur_tok(resp)
            }
            else {
                this.add_list_of_strings(resp)
            }
        }
        return true
    }

    add_list_of_strings(strings: string[], replace_current = false) {
        if (strings.length === 0) {
            return
        }
        else if (strings.length === 1) {
            //replace the current token data with the new text
            if (replace_current) {
                this.cur_tok.data = strings[0]
            }
            //otherwise append to the current token data
            else {
                this.add_to_cur_tok(strings[0])
            }
        }
        else {
            if (replace_current) {
                this.cur_tok.data = strings[0]
            }
            else this.add_to_cur_tok(strings[0])
            this.complete_cur_tok()
            strings.splice(0, 1)
            let end = strings.splice(strings.length - 1)
            for (let str of strings) {
                this.add_to_cur_tok(str)
                this.complete_cur_tok()
            }
            if (end) {
                this.add_to_cur_tok(end[0])
            }
        }
    }

    advance() {
        this.i++
        this.cur_parsing_tok = this.tokens[this.i]
        if (this.cur_parsing_tok) {
            return true
        }
        return false
    }
    back() {
        this.i--
        this.cur_parsing_tok = this.tokens[this.i]
        if (this.cur_parsing_tok) {
            return true
        }
        return false
    }

    async evaluate() {
        while (this.advance()) {
            if (!(await this.eval_token(this.cur_parsing_tok as TT<any>))) {
                break
            }
        }
        // for (let i = 0; i < this.tokens.length; i++) {
        //     let token = this.tokens[i]
        //     if(!this.eval_token(token)){
        //         break
        //     }
        // }
        if (this.cur_tok.data) {
            this.complete_cur_tok()
        }
        if (this.new_tokens[0] && this.new_tokens[0].start == 0 && this.new_tokens[0].end == 0 && this.new_tokens[0].data == "") {
            this.new_tokens = this.new_tokens.slice(1)
        }
        return this.new_tokens
    }
}

const format_parsers: Record<string, (token: TT<any>, symbols: SymbolTable, seq: string, args: string[], msg: Message, runtime_opts: RuntimeOptions) => Promise<string>> = {
    ["%"]: async (_token, symbols) => {
        return String(symbols.get("stdin:%")) ?? "{%}"
    },
    //TODO: cmd: async()
    fhex: async (_token, _, __, args) => {
        let [num, base] = args
        return String(parseInt(num, parseInt(base) || 16))
    },
    fbase: async (...args) => await format_parsers["fhex"](...args),
    token: async (token, symbols, _seq, args, msg, runtime_opts) => {
        let [tt, ...data] = args
        let text = data.join("|")
        let lexer_token_type = lexer[`TT${tt}` as keyof typeof lexer]
        if (!lexer_token_type) {
            return `{${token.data}}`
        }
        try {
            //@ts-ignore
            let t = new lexer_token_type(text, token.start, token.end)
            let evalulator = new TokenEvaluator([t], symbols, msg, runtime_opts)
            let new_tok = await evalulator.evaluate()
            return new_tok[0].data
        }
        catch (err) {
            return `{${token.data}}`

        }
    },
    rev: async (_, __, ___, args) => {
        if (args.length > 1) {
            return args.reverse().join(" ")
        }
        return [...args.join(" ")].reverse().join("")
    },
    reverse: async (...args) => await format_parsers['rev'](...args),
    ["$"]: async (_, __, ___, args, msg) => String(economy.calculateAmountFromString(msg.author.id, args.join(" ") || "100%")),
    ["$l"]: async (_, __, ___, args, msg) => String(economy.calculateLoanAmountFromString(msg.author.id, args.join(" ") || "100%")),
    ["$t"]: async (_, __, ___, args, msg) => String(economy.calculateAmountFromStringIncludingStocks(msg.author.id, args.join(" ") || "100%")),
    ["$n"]: async (_, __, ___, args, msg) => String(economy.calculateAmountFromStringIncludingStocks(msg.author.id, args.join(" ") || "100%") - economy.calculateLoanAmountFromString(msg.author.id, "100%")),
    timer: async (_, __, ___, args, msg) => {
        let name = args.join(" ").trim()
        if (name[0] === "-") {
            return String(timer.do_lap(msg.author.id, name.slice(1)))
        }
        return String(timer.getTimer(msg.author.id, args.join(" ").trim()))
    },
    user: async (_, __, ___, args, msg) => {
        let fmt = args.join(" ") || "<@%i>"
        let member = msg.member
        let user = member?.user || msg.author
        if (user === undefined || member === undefined || member === null) {
            return `{${args.join(" ")}}`
        }
        return formatMember(member, fmt)
    },
    rand: async (_, __, ___, args) => {
        if (args && args?.length > 0)
            return args[Math.floor(Math.random() * args.length)]
        return "{rand}"
    },
    num: async (_, __, ___, args) => {
        if (!args || args.length < 1)
            return String(Math.random())
        let low = Number(args[0])
        let high = Number(args[1]) || low * 10
        let dec = ["y", "yes", "true", "t", "."].indexOf(args[2]) > -1 ? true : false
        if (dec)
            return String((Math.random() * (high - low)) + low)
        return String(Math.floor((Math.random() * (high - low)) + low))
    },
    number: async (...args) => await format_parsers["num"](...args),
    ruser: async (_, __, ___, args, msg) => {
        let fmt = args.join(" ") || "%u"
        let guild = msg.guild
        if (guild === null) {
            return `{${fmt}}`
        }

        let member = guild.members.cache.random()
        if (member === undefined)
            member = (await guild.members.fetch()).random()
        if (member === undefined) {
            return `{${fmt}}`
        }
        return formatMember(member, fmt)
    },
    html: async (_, __, ___, args) => htmlRenderer.renderHTML(args.join("|")),
    time: async (_, __, ___, args) => {
        let date = new Date()
        if (!args.length) {
            return date.toString()
        }
        let hours = date.getHours()
        let AMPM = hours < 12 ? "AM" : "PM"
        if (args[0].trim() == '12') {
            hours > 12 ? hours = hours - 12 : hours
            args.splice(0, 1)
        }
        return format(args.join("|"), {
            "d": `${date.getDate()}`,
            "H": `${hours}`,
            "M": `${date.getMinutes()}`,
            "S": `${date.getSeconds()}`,
            "T": `${hours}:${date.getMinutes()}:${date.getSeconds()}`,
            "t": `${hours}:${date.getMinutes()}`,
            "1": `${date.getMilliseconds()}`,
            "z": `${date.getTimezoneOffset()}`,
            "x": AMPM,
            "D": `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`,
            "m": `${date.getMonth() + 1}`,
            "Y": `${date.getFullYear()}`,
            "w": `${date.getDay()}`,
            "s": `${Date.now()}`
        })
    },
    channel: async (_, __, ___, args, msg) => {
        return format(args.join("|"), {
            "i": `${msg.channel.id}`,
            "N!": `${(() => {
                let ch = msg.channel
                if (ch.type === ChannelType.GuildText)
                    return ch.nsfw
                return "IsNotText"
            })()}`,
            "n": `${(() => {
                let ch = msg.channel
                if (ch.type !== ChannelType.DM)
                    return ch.name
                return "IsDM"
            })()}`,
            "c": `${msg.channel.createdAt}`
        })

    }
}

const esc_parsers: Record<string, (token: TT<[string, string]>, symbols: SymbolTable, msg: Message, runtime_opts: RuntimeOptions) => Promise<string | string[]>> = {
    "n": async (_token, _) => {
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
    y: async (token, symbols, msg, runtime_opts) => {
        let [_, seq] = token.data
        if (seq) {
            let lex = new lexer.Lexer(seq, {
                is_command: false
            })
            let tokens = lex.lex()
            let ev = new TokenEvaluator(tokens, symbols, msg, runtime_opts)
            let new_tokens = await ev.evaluate()
            let text = ""
            for (let tok of new_tokens) {
                text += tok.data + " "
            }
            return text
        }
        return " "
    },
    Y: async (token, symbols, msg, runtime_opts) => {
        let [_, seq] = token.data
        if (seq) {
            let lex = new lexer.Lexer(seq, {
                is_command: false
            })
            let tokens = lex.lex()
            let ev = new TokenEvaluator(tokens, symbols, msg, runtime_opts)
            let new_tokens = await ev.evaluate()
            let strs: string[] = []
            for (let tok of new_tokens) {
                strs.push(tok.data)
            }
            return strs
        }
        return " "
    },
    a: async (token, _symbols, _msg, runtime_opts) => {
        let args = runtime_opts.get("program-args", [])
        if (token.data[1] === "*") {
            return args.join(" ")
        }
        else if (token.data[1] === "@") {
            //create a copy because TTEsc uses splice
            return args.slice(0)
        }
        else if (token.data[1] === "#") {
            return String(args.length)
        }
        let n = Number(token.data[1])
        if (!isNaN(n)) {
            return args[n] ?? ""
        }
        return ""
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
    p: async (token, _sym, msg) => {
        let [_, seq] = token.data
        let relative = false
        if(seq.startsWith("r:")){
            relative = true
            seq = seq.slice(2)
        }
        const date = dateParsing.parseDate(seq, userOptions.getOpt(msg.author.id, "time-zone", "-800"))
        if(relative){
            return `<t:${Math.floor(date.getTime() / 1000)}:R>`
        }
        return `<t:${Math.floor(date.getTime() / 1000)}>`
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
    v: async (token, _, msg) => {
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
            return v
        }
        return `\\v{${sequence}}`
    },
    ["\\"]: async (token) => {
        let seq = token.data[1]
        if (seq) {
            return `\\{${seq}}`
        }
        return `\\`
    },
    [" "]: async (token) => {
        let seq = token.data[1]
        if (seq) {
            return seq
        }
        return " "
    }
}

export default {
    TokenEvaluator
}
