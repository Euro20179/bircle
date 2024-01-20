import { PREFIX } from "../globals"
import { RuntimeOptions } from "./cmds"

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
}

class TTString extends TT<string> { }
class TTPipe extends TT<string> { }
class TTPipeRun extends TT<string> { }
class TTJSExpr extends TT<string> { }
class TTDoFirst extends TT<string> { }
class TTDoFirstRepl extends TT<string> { }
class TTPrefix extends TT<string> { }
class TTVariable extends TT<string> { }
class TTSemi extends TT<string> { }
class TTFormat extends TT<string> { }
class TTRange extends TT<[number, number]> { }
class TTIFS extends TT<string> { }
class TTEsc extends TT<[string, string]>{ }


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


function getModifiers(command: string): [string, Modifier[]] {
    const modifiers = [WebModifier, SkipModifier, SilentModifier, TypingModifier, DeleteModifier, CommandModifier, AliasModifier]

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
    prefix?: string
    is_command?: boolean
    skip_parsing?: boolean
}

class Lexer {
    private i = -1
    private curChar = ""
    private IFS = " "
    private special_chars = `{$\\${this.IFS};`
    private options: LexerOptions
    public tokens: TT<any>[] = []
    constructor(public command: string, options: LexerOptions) {
        this.options = options
    }

    private prefix() {
        return this.options.prefix ?? PREFIX
    }

    private pipe_sign() {
        return this.options.pipe_sign ?? ">pipe>"
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

    parsePipeSign() {
        let pipe_sign = this.pipe_sign()
        let builtString = this.curChar
        while (pipe_sign.startsWith(builtString)) {
            if (!this.advance()) {
                break
            }
            builtString += this.curChar
            if (builtString === pipe_sign) {
                break
            }
        }
        return builtString
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
                const inside = parseBracketPair(this.command, "{}", this.i)
                this.advance(inside.length)
                return new TTVariable(inside, start, this.i)
            }
        }
        this.back()
    }

    parseContinuousChars() {
        let builtString = this.curChar
        while (this.advance() && !this.special_chars.includes(this.curChar)) {
            builtString += this.curChar
        }
        this.back()
        return builtString
    }

    parseEscape() {
        const escChars = "ntUusyYAbiSdDTVv\\ a"
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

    parse_simple() {
        while (this.advance()) {
            switch (this.curChar) {
                case this.IFS: {
                    while (this.curChar === this.IFS) {
                        this.advance()
                    }
                    this.back()
                    this.tokens.push(new TTIFS(this.IFS, this.i, this.i))
                    continue;
                }
                default: {
                    let start = this.i
                    let str = this.parseContinuousChars()
                    this.tokens.push(new TTString(str, start, this.i))
                }
            }
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

    lex() {
        let pipe_sign = this.pipe_sign()
        if (this.options.is_command !== false) {
            let prefix = this.prefix()
            this.advance(prefix.length)
            this.tokens.push(new TTPrefix(prefix, 0, this.i))
        }
        if (this.options.skip_parsing) {
            return this.parse_simple()
        }
        while (this.advance()) {
            switch (this.curChar) {
                case "%": {
                    let start = this.i
                    let data = this.parse_percent()
                    if (data == "%") {
                        this.tokens.push(new TTString(data, this.i, this.i))
                    }
                    else {
                        this.tokens.push(new TTDoFirstRepl(data, start, this.i))
                    }
                    break;
                }
                case "\\": {
                    let start = this.i
                    let data = this.parseEscape()
                    if (typeof data === 'string') {
                        this.tokens.push(new TTString(`${data}`, start, this.i))
                    }
                    else {
                        this.tokens.push(new TTEsc(data as [string, string], start, this.i))
                    }
                    break
                }
                case pipe_sign[0]: {
                    let string = this.parsePipeSign()
                    if (string === pipe_sign) {
                        this.tokens.push(new TTPipe(string, this.i - string.length, this.i))
                    }
                    else {
                        this.tokens.push(new TTString(string, this.i - string.length, this.i))
                    }
                    break;
                }
                case "$": {
                    let token_or_str = this.parseDollar()
                    if (typeof token_or_str == "undefined") {
                        this.tokens.push(new TTString("$", this.i, this.i))
                    }
                    else {
                        this.tokens.push(token_or_str)
                    }
                    break
                }
                case ";": {
                    this.advance()
                    if (this.curChar == ";") {
                        this.tokens.push(new TTSemi(";;", this.i - 1, this.i))
                    }
                    else {
                        this.tokens.push(new TTString(";", this.i, this.i))
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
                        let match = inner.match(/(\d+)\.\.(\d+)/)
                        if (match) {
                            this.tokens.push(new TTRange([Number(match[1]), Number(match[2])], start, this.i - 1))
                        }
                        else {
                            this.tokens.push(new TTFormat(inner, start, this.i - 1))
                        }
                    }
                    else {
                        this.tokens.push(new TTString(`{${inner}`, start, this.i - 1))
                    }
                    break
                }
                case this.IFS: {
                    while (this.curChar === this.IFS) {
                        this.advance()
                    }
                    this.back()
                    this.tokens.push(new TTIFS(this.IFS, this.i, this.i))
                    continue;
                }
                default: {
                    let start = this.i
                    let data = this.parseContinuousChars()
                    this.tokens.push(new TTString(data, start, this.i))
                }
            }
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
    TTPipeRun,
    TTJSExpr,
    TTDoFirst,
    TTPrefix,
    TTSemi,
    TTFormat,
    TTIFS,
    TTEsc,
    TTVariable,
    TTDoFirstRepl,
    TTRange,
    getModifiers
}