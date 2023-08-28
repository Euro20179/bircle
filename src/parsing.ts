import { Message } from "discord.js"
import { AliasV2, Interpreter, getAliasesV2, getCommands } from "./common_to_commands"

const { getOpt } = require("./user-options")
enum T {
    str,
    dofirst,
    calc,
    esc,
    format,
    dofirstrepl,
    syntax,
    pipe,
    variable,
    end_of_line
}

function strToTT(str: string) {
    switch (str.toLowerCase()) {
        case "str":
            return T.str

        case "dofirst":
            return T.dofirst

        case "calc":
            return T.calc

        case "esc":
            return T.esc

        case "format":
            return T.format

        case "dofirstrepl":
            return T.dofirstrepl

        case "syntax":
            return T.syntax

        case "pipe":
            return T.pipe

        case 'end_of_line':
            return T.end_of_line

        default:
            return T.str
    }
}

class Token {
    id: number
    constructor(public type: T, public data: string | string[], public argNo: number) {
        this.id = Math.random()
    }
    originalText() {
        switch (this.type) {
            case T.dofirst:
                return `$(${this.data})`
            case T.calc:
                return `$[${this.data}]`
            case T.esc: {
                let text = `\\${this.data[0]}`
                if (this.data[1]) {
                    text += `{${this.data[1]}}`
                }
                return text
            }
            case T.format: return `{${this.data}}`
            case T.dofirstrepl: return `%{${this.data}}`
            case T.variable: {
                let text = `\${${this.data[0]}`
                if (this.data[1]) {
                    text += `${this.data[1]}`
                }
                return text + "}"
            }
            case T.str: case T.pipe: {
                return typeof this.data === 'object' ? JSON.stringify(this.data) : this.data
            }
            case T.syntax: {
                return JSON.stringify(this.data)
            }
            case T.end_of_line: {
                return '[;'
            }
        }
    }
}

class Modifier {
    repr = "X"
    modifyCmd({ cmdObject, int, cmdName }: { cmdObject: CommandV2 | AliasV2 | undefined, int: Interpreter, cmdName: string }): any { return cmdObject }
    modify(int: Interpreter): any { }
    stringify(): string { return `${this.repr}:` }
}

class WebModifier extends Modifier {
    repr = "W"
    modify(int: Interpreter) {
        int.altClient = true
    }
}

class SkipModifier extends Modifier {
    repr = "n"
}

class SilentModifier extends Modifier {
    repr = "s"
    modify(int: Interpreter) {
        int.sendCallback = async (_data) => int.getMessage()
    }
}

class TypingModifier extends Modifier {
    repr = "t"
    modify(int: Interpreter) {
        int.setTyping()
    }
}

class DeleteModifier extends Modifier {
    repr = "d"
    modify(int: Interpreter) {
        int.getMessage().deletable && int.getMessage().delete()
    }
}

class CommandModifier extends Modifier {
    modifyCmd({ cmdObject, int, cmdName }: { cmdObject: CommandV2 | AliasV2 | undefined; int: Interpreter; cmdName: string }) {
        int.modifiers = int.modifiers.filter(v => v !== this)
        int.aliasV2 = false
        return getCommands().get(cmdName)
    }

    stringify(): string {
        return "c:"
    }
}

class AliasModifier extends Modifier {
    modifyCmd({ cmdName, int }: { cmdName: string, int: Interpreter }) {
        int.modifiers = int.modifiers.filter(v => v !== this)
        int.aliasV2 = getAliasesV2()[cmdName]
        console.log(int.modifiers)
        return getAliasesV2()[cmdName]
    }
    stringify(): string {
        return "a:"
    }
}

class Parser {
    tokens: Token[]
    string: string

    modifiers: Modifier[]

    IFS: string

    #msg: Message
    #curChar: string | undefined
    #i: number
    #curArgNo: number

    #pipeSign: string = ">pipe>"
    #defaultPipeSign: string = ">pipe>"

    #parseQuotedString: boolean

    get specialChars() {
        return `\\\$${this.IFS}{%>;`
    }

    constructor(msg: Message, string: string, isCmd = true) {
        this.tokens = []
        this.string = string
        this.#i = -1
        this.#curChar = undefined
        //starts at negative one for commands
        this.#curArgNo = 0
        this.#msg = msg
        this.modifiers = []
        this.IFS = " "
        this.#pipeSign = getOpt(msg.author.id, "pipe-symbol", ">pipe>")

        this.#parseQuotedString = getOpt(msg.author.id, "1-arg-string", "false") === "true" ? true : false
    }

    advance(amount = 1) {
        this.#i += amount;
        this.#curChar = this.string[this.#i]
        if (this.#curChar === undefined) {
            return false
        }
        return true
    }
    back() {
        this.#i--;
        if (this.#i < 0) {
            return false
        }
        this.#curChar = this.string[this.#i]
        return true
    }

    async parse() {
        let lastWasspace = false
        while (this.advance()) {
            if (this.#i === 0 && this.#curChar === 'n' && this.string[1] === ':') {
                this.tokens = Array.from(this.string.split(" "), item => new Token(T.str, item, this.#curArgNo++))
                break
            }
            //remove command special case, instead treat arg[0] (after interpreting all tokens) as the command
            switch (this.#curChar) {
                case this.IFS: {
                    if (!lastWasspace) {
                        this.#curArgNo++;
                    }
                    lastWasspace = true
                    break
                }
                case this.#defaultPipeSign[0]:
                case this.#pipeSign[0]: {
                    lastWasspace = false
                    this.tokens.push(this.parseGTBracket())
                    break
                }
                case "$": {
                    lastWasspace = false
                    this.tokens.push(this.parseDollar())
                    break
                }
                case "%": {
                    lastWasspace = false
                    this.tokens.push(this.parsePercent())
                    break
                }
                case "\\": {
                    lastWasspace = false
                    this.tokens.push(this.parseEscape(this.#msg))
                    break
                }
                case "{": {
                    lastWasspace = false
                    this.tokens.push(await this.parseFormat(this.#msg))
                    break
                }
                case ';': {
                    this.advance()
                    if (this.#curChar as string === ';') {
                        this.tokens.push(new Token(T.end_of_line, ";;", this.#curArgNo))
                        this.#curArgNo = 0
                        break;
                    }
                    this.back()
                    this.tokens.push(new Token(T.str, ';', this.#curArgNo))
                    break;
                }
                case '"': {
                    if (this.#parseQuotedString) {
                        this.tokens.push(this.parseQuotedString())
                    }
                    else {
                        this.tokens.push(new Token(T.str, '"', this.#curArgNo))
                    }
                    lastWasspace = false
                    break
                }
                default: {
                    lastWasspace = false
                    this.tokens.push(this.parseString())
                    break
                }
            }
        }
        this.tokens.push(new Token(T.end_of_line, "[;", this.#curArgNo))
    }

    parseQuotedString() {
        let text = ""
        let escape = false
        while (this.advance()) {
            if (this.#curChar === '\\') {
                escape = true
            }
            else if (this.#curChar !== '"') {
                text += this.#curChar
                escape = false
            }
            else if (this.#curChar === '"' && escape) {
                text += '"'
                escape = false
            }
            else {
                break
            }
        }
        return new Token(T.syntax, text, this.#curArgNo)
    }

    //parsegreaterthanbracket
    parseGTBracket() {
        let builtString = this.#curChar as string
        while (this.advance() && (
            this.#pipeSign.startsWith(builtString + this.#curChar) && builtString !== this.#pipeSign) ||
            this.#defaultPipeSign.startsWith(builtString + this.#curChar) && builtString !== this.#defaultPipeSign
        ) {
            builtString += this.#curChar
        }
        if (this.#curChar !== undefined) {
            this.back()
        }
        if (builtString === this.#pipeSign || builtString === this.#defaultPipeSign) {
            this.advance()
            this.#curArgNo = -1
            this.back()
            return new Token(T.pipe, this.#defaultPipeSign, this.#curArgNo)
        }
        else {
            return new Token(T.str, builtString, this.#curArgNo)
        }
    }

    get lastToken() {
        return this.tokens[this.tokens.length - 1]
    }

    parseEscape(msg: Message) {

        const escChars = "ntUusyYAbiSdDTVv\\ a"

        if (!this.advance()) {
            return new Token(T.str, "\\", this.#curArgNo)
        }
        let char = this.#curChar
        if (!escChars.includes(char as string)) {
            return new Token(T.str, char as string, this.#curArgNo)
        }
        let sequence = ""
        if (char !== ' ' && this.advance()) {
            if (this.#curChar === "{") {
                if (this.advance()) {
                    sequence = parseBracketPair(this.string, "{}", this.#i)
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
        return new Token(T.esc, [char ?? "", sequence], this.#curArgNo)
    }

    async parseFormat(msg: Message) {
        this.advance()
        let inner = parseBracketPair(this.string, "{}", this.#i)
        this.advance(inner.length)
        if (this.#curChar === '}') {
            return new Token(T.format, inner, this.#curArgNo)
        }
        return new Token(T.str, `{${inner}`, this.#curArgNo)
    }

    parsePercent() {
        let text = this.#curChar as string
        if (!this.advance()) {
            return new Token(T.str, text, this.#curArgNo)
        }
        if (this.#curChar === "{") {
            this.advance()
            let inner = parseBracketPair(this.string, "{}", this.#i)
            this.advance(inner.length)
            return new Token(T.dofirstrepl, inner, this.#curArgNo)
        }
        else if (this.specialChars.includes(this.#curChar as string)) {
            let tok = new Token(T.str, text, this.#curArgNo)
            this.back()
            return tok
        }
        else {
            return new Token(T.str, text + this.#curChar, this.#curArgNo)
        }

    }

    parseDollar() {
        this.advance()

        if (this.#curChar === '[') {
            this.advance()
            let inside = parseBracketPair(this.string, "[]", this.#i)
            this.advance(inside.length)
            return new Token(T.calc, inside, this.#curArgNo)
        }
        else if (this.#curChar === "(") {
            this.advance()
            const inside = parseBracketPair(this.string, "()", this.#i)
            this.advance(inside.length)

            return new Token(T.dofirst, inside, this.#curArgNo)
        }
        else if (this.#curChar === '{') {
            this.advance()
            let inner = parseBracketPair(this.string, "{}", this.#i)
            this.advance(inner.length)
            let _ifNull
            [inner, ..._ifNull] = inner.split("||")
            let ifNull = _ifNull.join("||")
            return new Token(T.variable, [inner, ifNull], this.#curArgNo)
        }
        else if (this.#curChar == ' ') {
            let tok = new Token(T.str, "$", this.#curArgNo)
            this.#curArgNo++;
            return tok
        }
        else {
            return new Token(T.str, `$${this.#curChar ?? ""}`, this.#curArgNo)
        }
    }
    parseString() {
        let str = this.#curChar as string
        while (this.advance() && !this.specialChars.includes(this.#curChar as string)) {
            str += this.#curChar
        }
        if (this.specialChars.includes(this.#curChar as string)) {
            this.back()
        }
        return new Token(T.str, str, this.#curArgNo)
    }
}


function operateOnPositionValues(v1: string, op: string, v2: string, areaSize: number, objectSize?: number, numberConv: Function = Number) {
    let conversions
    if (!objectSize) {
        conversions = {
            "center": areaSize / 2,
            "right": areaSize,
            "left": 0,
            "bottom": areaSize,
            "top": 0
        }
    }
    else {
        conversions = {
            "center": areaSize / 2 - objectSize / 2,
            "right": areaSize - objectSize,
            "left": 0,
            "bottom": areaSize - objectSize,
            "top": 0
        }
    }

    let n1, n2

    if (conversions[v1] !== undefined) {
        n1 = conversions[v1]
    } else n1 = numberConv(v1)
    if (conversions[v2] !== undefined) {
        n2 = conversions[v2]
    } else n2 = numberConv(v2)
    if (v1 == undefined || v1 == null)
        return numberConv(v2)
    switch (op) {
        case "+":
            return n1 + n2;
        case "-":
            return n1 - n2;
        case "*":
            return n1 * n2;
        case "/":
            return Math.round(n1 / n2);
        case "%":
            return Math.round(areaSize * (n1 / 100))
    }
    return numberConv(v2)
}

function parsePosition(position: string, areaSize: number, objectSize?: number, numberConv?: Function) {
    if (!numberConv) numberConv = parseInt
    let firstVal, secondVal, operator
    let curValue = ""
    for (let char of position) {
        switch (char) {
            case " ": continue
            case "-":
            case "+":
            case "/":
            case "%":
            case "*":
                operator = char
                firstVal = curValue
                curValue = ""
                break
            default:
                curValue += char
        }
    }
    secondVal = curValue
    return operateOnPositionValues(firstVal as string, operator as string, secondVal, areaSize, objectSize, numberConv)
}

function getInnerPairsAndDeafultBasedOnRegex(string: string, validStartsWithValues: string[], hasToMatch: RegExp, onMatch?: (match: string, or: string) => any) {
    let innerPairs: [string, string][] = []
    let escape = false
    let curPair = ""
    let buildingOr = false
    let currentOr = ""
    for (let i = 0; i < string.lastIndexOf("}") + 1; i++) {
        let ch = string[i]

        if (ch === "{" && !escape) {
            continue
        }
        else if (ch === "}" && !escape) {
            if (hasToMatch.test(curPair)) {
                innerPairs.push([curPair, currentOr])
                onMatch && onMatch(curPair, currentOr)
            }
            curPair = ""
            currentOr = ""
            continue
        }
        else if (ch === "|" && string[i + 1] === "|") {
            i++;
            buildingOr = true;
            currentOr = "||"
            continue;
        }
        else if (buildingOr) {
            currentOr += ch
        }
        else {
            curPair += ch
        }

        if (!buildingOr && !validStartsWithValues.filter(v => v.length > curPair.length ? v.startsWith(curPair) : curPair.startsWith(v)).length) {
            buildingOr = false
            curPair = ""
            currentOr = ""
        }

        //this needs to be its own if chain because we want escape to be false if it's not \\, this includes {}
        if (ch === "\\") {
            escape = true
        }
        else {
            escape = false
        }

    }
    if (curPair) {
        innerPairs.push([curPair, currentOr])
    }
    return innerPairs
}

type Replacements = { [key: string]: (() => string) | string }

function handleReplacement(replacement: Replacements[string]) {
    if (typeof replacement === 'function') {
        return replacement()
    }
    return replacement
}


function parsePercentFormat(string: string, replacements?: Replacements) {
    let formats = []
    let ploc = -1;
    while ((ploc = string.indexOf("%")) > -1) {
        string = string.slice(ploc + 1)
        let char = string[0]
        if (char === undefined)
            break
        else if (char === "%") {
            formats.push("%")
        }
        else if (replacements) {
            formats.push(handleReplacement(replacements[char]) || char)
        }
        else {
            formats.push(char)
        }
        //skip past char
        string = string.slice(1)
    }
    return formats
}

function formatPercentStr(string: string, replacements: Replacements) {
    let ploc = -1;
    let newStr = ""
    while ((ploc = string.indexOf("%")) > -1) {
        newStr += string.slice(0, ploc)
        string = string.slice(ploc + 1)
        let char = string[0]
        if (char === undefined)
            break
        if (char !== "%") {
            newStr += handleReplacement(replacements[char]) ?? `%${char}`
        }
        else {
            newStr += "%"
        }
        //get past char
        string = string.slice(1)
    }
    newStr += string
    return newStr
}

function formatBracePairs(string: string, replacements: Replacements, pair = "{}", recursion = true) {
    let newStr = ""
    let escape = false
    for (let i = 0; i < string.length; i++) {
        let ch = string[i]
        if (ch === "\\" && !escape) {
            escape = true
        }
        else if (ch == pair[0] && !escape) {
            let inner = parseBracketPair(string.slice(i), pair)
            if (recursion) {
                newStr += handleReplacement(replacements[inner]) ?? `${pair[0]}${formatBracePairs(inner, replacements, pair, recursion)}${pair[1]}`
            }
            else {
                newStr += handleReplacement(replacements[inner]) ?? `${pair[0]}${inner}${pair[1]}`
            }
            i += inner.length + 1
        }
        else {
            escape = false
            newStr += ch
        }
    }
    return newStr
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

function format(str: string, formats: Replacements, recursion = false) {
    return formatPercentStr(formatBracePairs(str, formats, "{}", recursion), formats)
}

function getOptsUnix(args: ArgumentList, shortOpts: string, longOpts: [string, ":"?][]): [Opts, ArgumentList] {
    let opts: Opts = {}
    let i: number;
    for (i = 0; i < args.length; i++) {
        if(args[i] === "--") break
        else if(args[i][0] === "-" && args[i][1] === "-"){
            if(longOpts.find(v => v[0] === args[i].slice(2))?.[1]){
                opts[args[i].slice(2)] = args[++i]
            }
            else {
                opts[args[i].slice(2)] = true
            }
        }
        else if (args[i][0] === "-") {
            for(let chN = 1; chN < args[i].length; chN++){
                let ch = args[i][chN]
                let value: string | boolean = ""
                if (shortOpts[shortOpts.indexOf(ch) + 1] === ":"){
                    if(args[i][++chN]){
                        for(let ch of args[i].slice(chN)){
                            value += ch
                        }
                    }
                    else {
                        while(!args[++i].match(/\s/)){
                            value += args[i] || ""
                        }
                        if(!value) value = true
                    }
                    opts[ch] = value
                }
                else {
                    opts[ch] = true
                }
            }
        }
        else break
    }
    return [opts, args.slice(i)]
}

function getOpts(args: ArgumentList): [Opts, ArgumentList] {
    let opts: Record<string, boolean | string> = {}
    let i;
    for (i = 0; i < args.length; i++) {
        if (args[i][0] === "-") {
            let [opt, ...value] = args[i].slice(1).split("=")
            if (opt !== "-")
                opts[opt] = value[0] == undefined ? true : value.join("=");
            else break
        }
        else { break }
    }
    return [opts, args.slice(i)]
}

function getOptsWithNegate(args: ArgumentList): [Opts, ArgumentList] {
    let opts: Record<string, boolean | string> = {}
    let arg, idxOfFirstRealArg = -1;
    while ("-+".includes((arg = args[++idxOfFirstRealArg])?.[0])) {
        if (!arg[1]) break
        switch (arg[0]) {
            case '+': {
                opts[arg.slice(1)] = "false"
                break;
            }
            case '-': {
                let [opt, ...value] = arg.slice(1).split("=")
                if (opt === '-') {
                    //needs to be increased one more time
                    idxOfFirstRealArg++
                    break
                }
                opts[opt] = value[0] == undefined ? true : value.join("=");

            }
        }
    }
    return [opts, args.slice(idxOfFirstRealArg)]
}

export {
    parsePosition,
    Parser,
    Token,
    T,
    Modifier,
    strToTT,
    TypingModifier,
    DeleteModifier,
    SkipModifier,
    SilentModifier,
    AliasModifier,
    CommandModifier,
    WebModifier,
    getInnerPairsAndDeafultBasedOnRegex,
    format,
    formatPercentStr,
    formatBracePairs,
    parsePercentFormat,
    parseBracketPair,
    getOpts,
    getOptsWithNegate,
    getOptsUnix
}
