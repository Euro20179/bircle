import { RuntimeOptions } from "./cmds"
import configManager from "../config-manager"

/*
    The way I'm planning this to work is first it goes through the lexer which creates a list of tokens
    Each token contains the raw text, and the start/end positions of the text

    After lexing, it goes to the TokenEvaulator which expands any non-string tokens into string tokens, and removes the prefix token
        An exception to this would be the Pipe and PipeRun tokens which stay for later

    After the TokenEvaulator we go to the interprater which treats the first string token as a command, and the rest as arguments/options
        It treats the Pipe token as a piope, and the PipeRun token what to pipe into
    It will then recursively repeat this process (possibly setting some special variables like for {%}, and setting stdin to the result of the previous command) for PipeRun
*/

export class TT<T>{
    public data: T
    public start: number = 0
    public end: number = 0
    constructor(data: T, start: number, end: number) {
        this.data = data
        this.start = start
        this.end = end
    }

    isTok(type: any){
        return this instanceof type.constructor
    }

    isAny(tt: any[]){
        for(const t of tt){
            if (this instanceof t){
                return true
            }
        }
        return false
    }
}

class TTString extends TT<string> { }
class TTSyntax extends TT<string> { }
class TTCommand extends TT<string> { }
class TTPipe extends TT<string> { }
class TTJSExpr extends TT<string> { }
class TTDoFirst extends TT<string> { }
class TTDoFirstRepl extends TT<string> { }
class TTPrefix extends TT<string> { }
class TTVariable extends TT<[string, string, string]> { }
class TTSemi extends TT<string> { }
class TTFormat extends TT<string> { }
class TTRange extends TT<[string, number]> { }
class TTIFS extends TT<string> { }
class TTEsc extends TT<[string, string]>{ }
class TTOr extends TT<string> { }
class TTAnd extends TT<string> { }

class TTNop extends TT<string> { }


export abstract class Modifier {
    repr = "X"

    abstract set_runtime_opt(options: RuntimeOptions): any
    abstract unset_runtime_opt(options: RuntimeOptions): any
}

class WebModifier extends Modifier {
    static repr = "W"

    set_runtime_opt(options: RuntimeOptions) {
        options.set("remote", true)
    }

    unset_runtime_opt(options: RuntimeOptions) {
        options.delete("remote")
    }
}

class PingModifier extends Modifier {
    static repr = "p"
    set_runtime_opt(options: RuntimeOptions){
        options.set("allowPings", true)
    }
    unset_runtime_opt(options: RuntimeOptions) {
        options.delete("allowPings")
    }
}

class CmdConfirmationModifier extends Modifier {
    static repr = "y"

    set_runtime_opt(options: RuntimeOptions) {
        //if it wasn't set before, it's allowed to be set
        if(options.get("disableCmdConfirmations", null) === null){
            options.set("disableCmdConfirmations", true)
        }
    }

    unset_runtime_opt(options: RuntimeOptions) {
        options.delete("disableCmdConfirmations")
    }
}

class SkipModifier extends Modifier {
    static repr = "n"

    set_runtime_opt(options: RuntimeOptions) {
        options.set("skip", true)
    }

    unset_runtime_opt(options: RuntimeOptions) {
        options.delete("skip")
    }
}

class SilentModifier extends Modifier {
    static repr = "s"
    set_runtime_opt(options: RuntimeOptions) {
        options.set("silent", true)
    }

    unset_runtime_opt(options: RuntimeOptions) {
        options.delete("silent")
    }
}

class TypingModifier extends Modifier {
    static repr = "t"
    set_runtime_opt(options: RuntimeOptions) {
        options.set("typing", true)
    }

    unset_runtime_opt(options: RuntimeOptions) {
        options.delete("typing")
    }
}

class DeleteModifier extends Modifier {
    static repr = "d"
    set_runtime_opt(options: RuntimeOptions) {
        options.set("delete", true)
    }

    unset_runtime_opt(options: RuntimeOptions) {
        options.delete("delete")
    }
}

class CommandModifier extends Modifier {
    static repr = "c"
    set_runtime_opt(options: RuntimeOptions) {
        options.set("command", true)
    }

    unset_runtime_opt(options: RuntimeOptions) {
        options.delete("command")
    }
}

class AliasModifier extends Modifier {
    static repr = "a"
    set_runtime_opt(options: RuntimeOptions) {
        options.set("alias", true)
    }

    unset_runtime_opt(options: RuntimeOptions) {
        options.delete("alias")
    }
}

class ResetStdinModifier extends Modifier {
    static repr = "r"
    private previousStdin?: CommandReturn
    constructor() {
        super()
    }
    set_runtime_opt(options: RuntimeOptions) {
        this.previousStdin = options.get('stdin', null)
        options.delete("stdin")
    }
    unset_runtime_opt(options: RuntimeOptions) {
        if (this.previousStdin) {
            options.set("stdin", this.previousStdin)
        }
    }
}

//class PingModifier extends Modifier {
//    static repr = "p"
//    set_runtime_opt(options: RuntimeOptions){
//        options.set("allowPings", true)
//    }
//    unset_runtime_opt(options: RuntimeOptions) {
//        options.delete("allowPings")
//    }
//}

function getModifiers(command: string): [string, Modifier[]] {
    const modifiers = [
        WebModifier,
        SkipModifier,
        SilentModifier,
        TypingModifier,
        DeleteModifier,
        CommandModifier,
        AliasModifier,
        ResetStdinModifier,
        CmdConfirmationModifier,
        PingModifier
    ]

    let used_modifiers = []

    outer_while:
    while (true) {
        for (let mod of modifiers) {
            let repr = `${mod.repr}:`
            if (!command.startsWith(repr)) {
                continue
            }
            used_modifiers.push(new mod())
            command = command.slice(repr.length)
            continue outer_while;
        }
        break
    }

    return [command, used_modifiers]
}

type LexerOptions = {
    pipe_sign?: string
    and_sign?: string
    or_sign?: string
    prefix?: string
    is_command?: boolean
    skip_parsing?: boolean,
    enable_1_arg_string?: boolean
}

export class Lexer {
    private i = -1
    private curChar = ""
    private IFS = " \t"
    private special_chars = `{$\\${this.IFS};`
    private options: LexerOptions
    public done: boolean = false
    public tokens: TT<any>[] = []
    constructor(public command: string, options: LexerOptions) {
        this.options = options

        if (this.options.enable_1_arg_string) {
            this.special_chars += `"'`
        }
    }

    private prefix() {
        return this.options.prefix ?? configManager.PREFIX
    }

    private pipe_sign() {
        return this.options.pipe_sign ?? ">pipe>"
    }

    private get and_sign() {
        return this.options.and_sign ?? ">and>"
    }

    private get or_sign() {
        return this.options.or_sign ?? ">or>"
    }

    advance(amount = 1) {
        this.i += amount
        this.curChar = this.command[this.i]
        return this.i < this.command.length
    }

    back() {
        this.i -= 1
        this.curChar = this.command[this.i]
        return this.i > 0
    }

    parseName(name: string, start: string) {
        let builtString = start
        while (name.startsWith(builtString)) {
            if (!this.advance()) {
                break
            }
            builtString += this.curChar
            if (builtString === name) {
                return builtString
            }
        }
        //failed, meaning we advanced too far
        this.back()
        //exclude the last char, since it's not part of the name trying to get parsed
        return builtString.slice(0, builtString.length - 1)
    }

    //has 2 jobs,
    //parse until the closing }
    //and seperate out the varPart, operator, operatorArg
    parseVariable(): [string, string, string] {
        let varPart = this.curChar
        let operator = ""
        let operatorArg = ""
        const operators = [
            "||",
            "#",
            "%",
            "/",
            "&&",
            "IF/",
            ">!>",
            "<<"
        ]
        let curOp = ""

        let bracketNo = 1

        while (this.advance()) {
            const ch = this.curChar
            if (ch === "{") {
                bracketNo++
                continue
            } else if (ch === "}") {
                bracketNo--
            }
            if (bracketNo === 0) {
                break
            }
            //variable is guaranteed to be 1+ char
            if (!varPart) {
                varPart += ch
            }
            else if (!operator) {
                const opAndCh = curOp + ch
                let foundOp = false
                for (const op of operators) {
                    if (op == opAndCh) {
                        operator = opAndCh
                        curOp = ""
                        foundOp = true
                        break
                    }
                    else if (op.startsWith(opAndCh)) {
                        curOp += ch
                        foundOp = true
                        break
                    }
                }
                if (!foundOp) {
                    varPart += opAndCh
                    curOp = ""
                }
                //if the length of the operator string is 1, curOp is "", therefore we also need
                //to check if operator is empty
                else if (curOp == "" && operator == "") {
                    varPart += ch
                }
            }
            else if (operator) {
                operatorArg += ch
            }
        }

        return [varPart, operator as "||", operatorArg]
    }

    parseDollar() {
        let start = this.i
        let end = this.i
        this.advance()
        switch (this.curChar) {
            case "[": {
                this.advance()
                let inside = parseBracketPair(this.command, "[]", this.i)
                this.advance(inside.length)
                end = this.i
                return new TTJSExpr(inside, start, end)
            }
            case "(": {
                this.advance()
                let inside = parseBracketPair(this.command, "()", this.i)
                this.advance(inside.length)
                end = this.i
                return new TTDoFirst(inside, start, end)
            }
            case "{": {
                this.advance()
                return new TTVariable(this.parseVariable(), start, this.i)
            }
        }
        this.back()
    }

    parseCommand() {
        let builtString = this.curChar
        while (
            this.advance() && !this.IFS.includes(this.curChar) && this.curChar !== '\n'
        ) {
            builtString += this.curChar
        }
        return builtString
    }

    parseContinuousChars() {
        let builtString = this.curChar
        while (this.advance() && !this.special_chars.includes(this.curChar)) {
            builtString += this.curChar
        }
        this.back()
        return builtString
    }

    parseSimpleString() {
        let string = ""
        while (this.advance() && this.curChar !== "'") {
            string += this.curChar
        }
        return string
    }

    parseEscapeableString() {
        let string = ""
        let escape = false
        while (this.advance()) {
            if (!escape && this.curChar === '\\') {
                escape = true
                continue
            }
            else if (escape) {
                string += this.curChar
            }
            else if (this.curChar === '"') {
                break
            }
            else {
                string += this.curChar
            }
            escape = false
        }
        return string
    }

    parseEscape() {
        const escChars = "ntUusyYAbiSdDTVv\\ ap"
        if (!this.advance()) {
            return ""
        }
        let char = this.curChar
        if (!escChars.includes(char)) {
            return char
        }
        let sequence = ""
        if (char !== ' ' && this.advance()) {
            if (this.curChar === '{') {
                if (this.advance()) {
                    sequence = parseBracketPair(this.command, "{}", this.i)
                    this.advance(sequence.length)
                }
                else {
                    this.back()
                }
            }
            else {
                this.back()
            }
        }
        return [char, sequence]
    }

    *gen_parse_simple() {
        while (this.advance()) {
            if (this.IFS.includes(this.curChar)) {
                while (this.IFS.includes(this.curChar)) {
                    this.advance()
                }
                this.back()
                yield new TTIFS(this.IFS[0], this.i, this.i)
                continue
            }
            let start = this.i
            let str = this.parseContinuousChars()
            yield new TTString(str, start, this.i)
        }
    }

    parse_simple() {
        while (this.advance()) {
            if (this.IFS.includes(this.curChar)) {
                while (this.IFS.includes(this.curChar)) {
                    this.advance()
                }
                this.back()
                this.tokens.push(new TTIFS(this.IFS[0], this.i, this.i))
                continue
            }
            let start = this.i
            let str = this.parseContinuousChars()
            this.tokens.push(new TTString(str, start, this.i))
        }
        return this.tokens
    }

    parse_percent() {
        this.advance()
        if (this.curChar !== "{") {
            this.back()
            return "%"
        }
        this.advance()
        let inner = parseBracketPair(this.command, "{}", this.i)
        this.advance(inner.length)
        return inner
    }

    *gen_tokens() {
        let pipe_sign = this.pipe_sign()
        const and_sign = this.and_sign
        const or_sign = this.or_sign
        if (this.options.is_command !== false) {
            let prefix = this.prefix()
            this.advance(prefix.length)
            yield new TTPrefix(prefix, 0, this.i)
        }
        if (this.options.skip_parsing) {
            yield* this.parse_simple()
        }
        else {
            lexing: while (this.advance()) {
                if (this.IFS.includes(this.curChar)) {
                    while (this.IFS.includes(this.curChar)) {
                        this.advance()
                    }
                    this.back()
                    yield new TTIFS(this.IFS[0], this.i, this.i)
                    continue;
                }
                let variableSyntaxString = ""
                for (const [sign, tt] of [
                    [or_sign, TTOr],
                    [and_sign, TTAnd],
                    [pipe_sign, TTPipe]
                ] as const) {
                    if (sign[0] === this.curChar) {
                        variableSyntaxString = this.parseName(sign, variableSyntaxString || this.curChar)
                        if (variableSyntaxString === sign) {
                            yield new tt(variableSyntaxString, this.i - variableSyntaxString.length, this.i)
                            continue lexing
                        }
                    }
                }
                switch (this.curChar) {
                    case "%": {
                        let start = this.i
                        let data = this.parse_percent()
                        if (data == "%") {
                            yield new TTString(data, this.i, this.i)
                        }
                        else {
                            yield new TTDoFirstRepl(data, start, this.i)
                        }
                        break;
                    }
                    case "\\": {
                        let start = this.i
                        let data = this.parseEscape()
                        if (typeof data === 'string') {
                            yield new TTString(`${data}`, start, this.i)
                        }
                        else {
                            yield new TTEsc(data as [string, string], start, this.i)
                        }
                        break
                    }
                    case "$": {
                        let token_or_str = this.parseDollar()
                        if (typeof token_or_str == "undefined") {
                            yield new TTString("$", this.i, this.i)
                        }
                        else {
                            yield token_or_str
                        }
                        break
                    }
                    case ";": {
                        this.advance()
                        if (this.curChar == ";") {
                            yield new TTSemi(";;", this.i - 1, this.i)
                        }
                        else {
                            this.back()
                            yield new TTString(`;`, this.i, this.i)
                        }
                        break
                    }
                    case "{": {
                        this.advance()
                        let start = this.i
                        let inner = parseBracketPair(this.command, "{}", this.i)
                        this.advance(inner.length)
                        //@ts-ignore
                        if (this.curChar === '}') {
                            let match = inner.match(/^(\d+(?:,\d+)*)\.\.(\d+)$/)
                            if (match) {
                                yield new TTRange([match[1], Number(match[2])], start, this.i - 1)
                            }
                            else {
                                yield new TTFormat(inner, start, this.i - 1)
                            }
                        }
                        else {
                            yield new TTString(`{${inner}`, start, this.i - 1)
                        }
                        break
                    }
                    case "'": case '"': {
                        if (this.options.enable_1_arg_string) {
                            let start = this.i
                            if (this.curChar === "'") {
                                yield new TTString(this.parseSimpleString(), start, this.i)
                            }
                            else {
                                yield new TTSyntax(this.parseEscapeableString(), start, this.i)
                            }
                            break
                        }
                    }
                    default: {
                        let start = this.i
                        let data
                        let is_command =
                            this.options.is_command !== false && this.i === this.prefix.length
                        if (is_command) {
                            data = this.parseCommand()
                        }
                        else {
                            data = this.parseContinuousChars()
                        }
                        if (is_command)
                            yield new TTCommand(data, start, this.i)
                        else yield new TTString(data, start, this.i)
                    }
                }
            }
        }
        this.done = true
    }

    lex() {
        for (let tok of this.gen_tokens()) {
            this.tokens.push(tok)
        }
        return this.tokens
    }
}
function parseBracketPair(string: string, pair: string, start = -1) {
    let count = 1;
    if (string.indexOf(pair[0]) === -1) {
        return ""
    }
    let curStr = ""
    start = start === -1 ? string.indexOf(pair[0]) + 1 : start
    for (let i = start; i < string.length; i++) {
        let ch = string[i]
        if (ch == pair[0]) {
            count++;
        }
        if (ch == pair[1]) {
            count--;
        }
        if (count == 0) {
            return curStr
        }
        //sspecial case when the pairs are the same
        if (count == 1 && pair[0] == ch && pair[1] == pair[0] && curStr) {
            return curStr
        }
        curStr += ch
    }
    return curStr
}

export default {
    Lexer,
    TT,
    TTString,
    TTPipe,
    TTJSExpr,
    TTDoFirst,
    TTPrefix,
    TTSemi,
    TTFormat,
    TTIFS,
    TTEsc,
    TTVariable,
    TTDoFirstRepl,
    TTCommand,
    TTRange,
    TTSyntax,
    TTAnd,
    TTOr,
    TTNop,
    CmdConfirmationModifier,
    getModifiers
}
