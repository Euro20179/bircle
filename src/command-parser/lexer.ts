import { PREFIX } from "../globals"

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
class TTVarExpand extends TT<string> { }
class TTPrefix extends TT<string> { }
class TTVariable extends TT<string> {}

class TTSemi extends TT<string> {}
class TTSemiRun extends TT<string> {}


class Modifier {
    repr = "X"
}

class WebModifier extends Modifier {
    static repr = "W"
}

class SkipModifier extends Modifier {
    static repr = "n"
}

class SilentModifier extends Modifier {
    static repr = "s"
}

class TypingModifier extends Modifier {
    static repr = "t"

}

class DeleteModifier extends Modifier {
    static repr = "d"

}

class CommandModifier extends Modifier {
    static repr = "c:"
}

class AliasModifier extends Modifier {
    static repr = "a:"
}


function getModifiers(command: string) {
    const modifiers = [WebModifier, SkipModifier, SilentModifier, TypingModifier, DeleteModifier, CommandModifier, AliasModifier]

    let used_modifiers = []

    outer_while:
    while (true) {
        for (let mod of modifiers) {
            if (!command.startsWith(mod.repr)) {
                continue
            }
            used_modifiers.push(mod)
            command = command.slice(0, mod.repr.length)
            continue outer_while;
        }
        break
    }

    return used_modifiers
}

type LexerOptions = {
    pipe_sign?: string
    prefix?: string
    is_command?: boolean
}

class Lexer {
    private i = -1
    private curChar = ""
    private IFS = " "
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
                let inside = parseBracketPair(this.command, "()", this.i)
                this.advance(inside.length)
                end = this.i
                return new TTDoFirst(inside, start, end)
            }
            case "{": {
                const inside = parseBracketPair(this.command, "{}", this.i)
                this.advance(inside.length)
                return new TTVariable(inside, start, this.i)
            }
        }
        this.back()
    }

    parseContinuousChars() {
        let builtString = this.curChar
        while (this.advance() && !this.IFS.includes(this.curChar)) {
            builtString += this.curChar
        }
        this.back()
        return builtString
    }

    lex() {
        let pipe_sign = this.pipe_sign()
        if (this.options.is_command !== false) {
            let prefix = this.prefix()
            this.advance(prefix.length)
            this.tokens.push(new TTPrefix(prefix, 0, this.i))
        }
        let token: undefined | null | TT<any>;
        outer_while:
        while (this.advance()) {
            switch (this.curChar) {
                case pipe_sign[0]: {
                    let string = this.parsePipeSign()
                    if (string === pipe_sign) {
                        token = new TTPipe(string, this.i - string.length, this.i)
                        //once theres a pipe, stop parsing, and make a special token for the rest as to not expand in TokenEvaulator
                        let pipe_run = new TTPipeRun(this.command.slice(this.i + 1), this.i + 1, this.command.length)
                        this.tokens.push(pipe_run)
                        break outer_while
                    }
                    else {
                        if(token)
                            token.data += string
                        else token = new TTString(string, this.i - string.length, this.i)
                    }
                    break;
                }
                case "$": {
                    let token_or_str = this.parseDollar()
                    if(typeof token_or_str == "undefined"){
                        if(token) token.data += "$"
                        else token = new TTString("$", this.i, this.i)
                    }
                    else {
                        if(token) this.tokens.push(token)
                        this.tokens.push(token_or_str)
                    }
                    break
                }
                case ";": {
                    this.advance()
                    if(this.curChar == ";"){
                        if(token){
                            this.tokens.push(token)
                            token = null
                        }
                        this.tokens.push(new TTSemi(";;", this.i - 1, this.i))
                        let semi_run = new TTSemiRun(this.command.slice(this.i + 1), this.i + 1, this.command.length)
                        this.tokens.push(semi_run)
                        break outer_while
                    }
                    else {
                        this.back()
                        if(token) token.data += ";"
                        else token = new TTString(";", this.i, this.i)
                    }
                    break
                }
                case this.IFS: {
                    continue;
                }
                default: {
                    if(!token){
                        token = new TTString("", 0, 0)
                    }
                    token.start = this.i
                    token.data = this.parseContinuousChars()
                    token.end = this.i
                }
            }
            if(token){
                this.tokens.push(token)
                token = null
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
    TTVarExpand,
    TTPrefix,
    TTSemi,
    getModifiers
}
