import { Message } from "discord.js"
import vars from "./vars"
import { Interpreter } from "./common_to_commands"

const { getOpt } = require("./user-options")
enum T {
    str,
    dofirst,
    calc,
    esc,
    format,
    dofirstrepl,
    command,
    syntax,
    pipe,
    variable,
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

        case "command":
            return T.command

        case "syntax":
            return T.syntax

        case "pipe":
            return T.pipe

        default:
            return T.str
    }
}

class Token {
    type: T
    data: string | string[]
    argNo: number
    id: number
    constructor(type: T, data: string | string[], argNo: number) {
        this.type = type
        this.data = data
        this.argNo = argNo
        this.id = Math.random()
    }

    convertToCommand() {
        switch (this.type) {
            case T.esc:
                let str = `\\${this.data[0]}`
                if (this.data[1]) {
                    str += `{${this.data[1]}}`
                }
                return new Token(T.command, str, -1)
            case T.variable: {
                let str = `\${${this.data[0]}`
                if (this.data[1]) {
                    str += `||${this.data[1]}`
                }
                //extra } is to close braces
                return new Token(T.command, `${str}}`, -1)
            }
            default: return new Token(T.command, this.data, -1)
        }
    }
}

class Modifier {
    data: RegExpMatchArray
    constructor(data: RegExpMatchArray) {
        this.data = data
    }
    modify(int: Interpreter): any {}
    stringify(): string{return "W:"}
}

class SkipModifier extends Modifier{
    modify(int: Interpreter){
    }
    stringify(){
        return "n:"
    }
}

class SilentModifier extends Modifier{
    modify(int: Interpreter){
        int.sendCallback = async(_data) => int.getMessage()
    }
    stringify(){
        return "s:"
    }
}

class RedirModifier extends Modifier{
    modify(int: Interpreter){
            let m = this.data
            //whether or not to redirect *all* message sends to the variable, or just the return value from the command
            let all = m[1] //this matches the ! after redir
            if (all) {
                //the variable scope
                let prefix = m[2] //matches the text before the  : in the parens in redir
                //the variable name
                let name = m[3] //matches the text after the :  in the parens in redir
                int.sendCallback = int.sendDataToVariable.bind(int, prefix, name)
            }
            //the variable scope
            let prefix = m[2] //matches the text before the  : in the parens in redir
            //the variable name
            let name = m[3] //matches the text after the :  in the parens in redir
            vars.setVar(`${prefix}:${name}`, "", int.getMessage().author.id)
    }
    stringify(){
        let str = "redir"
        if(this.data[1])
            str += "!"
        str += "("
        if(this.data[2]){
            str += this.data[2]
        }
        str += `:${this.data[3]})`
        return str
    }
}

class TypingModifier extends Modifier{
    modify(int: Interpreter){
        int.setTyping()
    }
    stringify(){
        return "t:"
    }
}

class DeleteModifier extends Modifier{
    modify(int: Interpreter){
        int.getMessage().deletable && int.getMessage().delete()
    }
    stringify(){
        return "d:"
    }
}

class Parser {
    tokens: Token[]
    string: string

    modifiers: Modifier[]

    IFS: string

    #isParsingCmd: boolean
    #msg: Message
    #curChar: string | undefined
    #i: number
    #curArgNo: number
    #hasCmd: boolean

    #pipeSign: string = ">pipe>"
    #defaultPipeSign: string = ">pipe>"

    #parseQuotedString: boolean


    get specialChars() {
        return `\\\$${this.IFS}{%>`
    }

    constructor(msg: Message, string: string, isCmd = true) {
        this.tokens = []
        this.string = string
        this.#i = -1
        this.#curChar = undefined
        //starts at negative one for commands
        this.#curArgNo = isCmd ? -1 : 0
        this.#hasCmd = false
        this.#msg = msg
        this.#isParsingCmd = isCmd
        this.modifiers = []
        this.IFS = getOpt(msg.author.id, "IFS", " ")
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
            if (!this.#hasCmd && this.#isParsingCmd) {
                this.tokens.push(this.parseCmd())
                if (this.modifiers.filter(v => v instanceof SkipModifier).length) {
                    this.tokens = this.tokens.concat(this.string.split(this.IFS).slice(1).filter(v => v !== '').map((v, i) => new Token(T.str, v, i)))
                    break
                }
                //ignore new lines after cmds
                if(this.#curChar === '\n'){
                    this.#curArgNo++;
                    continue;
                }
            }
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
            //ensure that the command WILL have argNo -1
            //bit hacky though
            if (this.#curChar === this.IFS) {
                this.#curArgNo = -2
            }
            else {
                //command Argno should start at -1
                this.#curArgNo = -1
            }
            this.back()
            return new Token(T.pipe, this.#defaultPipeSign, this.#curArgNo)
        }
        else {
            return new Token(T.str, builtString, this.#curArgNo)
        }
    }

    parseCmd() {
        let cmd = this.#curChar as string
        let modMap = new Map<RegExp, typeof Modifier>()
        modMap.set(/^redir(!)?\(([^:]*):([^:]+)\):/, RedirModifier)
        modMap.set(/^d:/,  DeleteModifier)
        modMap.set(/^t:/,  TypingModifier)
        modMap.set(/^s:/,  SilentModifier)
        modMap.set(/^n:/,  SkipModifier)
        while (this.advance() && !this.IFS.includes(this.#curChar as string) && this.#curChar !== "\n") {
            cmd += this.#curChar as string
        }
        while (true) {
            let foundMatch = false
            for (let modRegex of modMap.keys()) {
                let m = cmd.match(modRegex)
                if (m) {
                    cmd = cmd.slice(m[0].length)
                    this.modifiers.push(new (modMap.get(modRegex) ?? Modifier)(m))
                    foundMatch = true
                }
            }
            if (!foundMatch)
                break
        }
        this.#hasCmd = true
        return new Token(T.command, cmd, this.#curArgNo)
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
            let containsDoFirstRepl = false
            for (let token of this.tokens.filter(v => v.argNo === this.#curArgNo)) {
                if (token.type === T.dofirstrepl) {
                    containsDoFirstRepl = true
                    break
                }
            }
            if (!containsDoFirstRepl) {
                this.tokens.push(new Token(T.dofirstrepl, "", this.#curArgNo))
            }

            let inside = ""

            this.advance()
            inside += parseBracketPair(this.string, "()", this.#i)
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

function parseAliasReplacement(msg: Message, cmdContent: string, args: string[]) {
    let finalText = ""
    let isEscaped = false
    for (let i = 0; i < cmdContent.length; i++) {
        let ch = cmdContent[i]
        switch (ch) {
            case "\\": {
                isEscaped = true
                break
            }
            case "{": {
                let startingI = i
                if (isEscaped) {
                    isEscaped = false
                    finalText += "{"
                    continue
                }
                let val = ""
                for (i++; i < cmdContent.length; i++) {
                    let ch = cmdContent[i]
                    if (!"abcdefghijklmnopqrstuvwxyz".includes(ch)) {
                        i--
                        break
                    }
                    val += ch
                }
                let suffix = ""
                let dotsInARow = 0
                for (i++; i < cmdContent.length; i++) {
                    let ch = cmdContent[i]
                    if (ch === "}") {
                        break
                    }
                    if (ch == '.') {
                        dotsInARow++
                        continue
                    }
                    suffix += ch
                }
                if (val == "arg" || val == "args") {
                    if (suffix == "#") {
                        finalText += String(args.length)
                    }
                    else if (dotsInARow == 3) {
                        let startingPoint = 0
                        if (suffix) {
                            startingPoint = Number(suffix) - 1 || 0
                        }
                        finalText += String(args.slice(startingPoint).join(" "))
                    }
                    else if (dotsInARow == 2) {
                        let [n1, n2] = suffix.split("..")
                        finalText += String(args.slice(Number(n1) - 1, Number(n2) - 1).join(" "))
                    }
                    else if (Number(suffix)) {
                        finalText += args[Number(suffix) - 1]
                    }
                    else {
                        finalText += `{${cmdContent.slice(startingI, i)}}`
                    }
                }
                else if (val == "opt") {
                    let opt = suffix.replace(":", "")
                    let opts;
                    [opts, args] = getOpts(args)
                    if (opts[opt] !== undefined)
                        finalText += opts[opt]
                }
                else if (val == "sender") {
                    finalText += String(msg.author)
                }
                else if (val == "senderid") {
                    finalText += msg.author.id
                }
                else if (val == "sendername") {
                    finalText += String(msg.author.username)
                }
                else if (val == "channel") {
                    finalText += String(msg.channel)
                }
                else {
                    finalText += `{${cmdContent.slice(startingI + 1, i)}}`
                }
                break
            }
            default: {
                if (isEscaped) {
                    finalText += `\\${ch}`
                }
                else {
                    finalText += ch
                }
                isEscaped = false
            }
        }
    }
    return finalText
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

function getOptsUnix(args: ArgumentList): [Opts, ArgumentList] {
    let opts: Opts = {}
    let arg, idxOfFirstRealArg = -1
    while ((arg = args[++idxOfFirstRealArg])?.startsWith("-")) {
        if (arg === '--') {
            idxOfFirstRealArg++;
            break;
        }
        else if (arg.startsWith("--")) {
            let name = arg.slice(2)
            let value = args[++idxOfFirstRealArg];
            opts[name] = value
        }
        else if (arg.startsWith("-")) {
            for (let char of arg.slice(1)) {
                opts[char] = true
            }
        }
        else {
            break;
        }
    }
    return [opts, args.slice(idxOfFirstRealArg)]
}

function getOpts(args: ArgumentList): [Opts, ArgumentList] {
    let opts: Record<string, boolean | string> = {}
    let arg, idxOfFirstRealArg = -1;
    while ((arg = args[++idxOfFirstRealArg])?.startsWith("-")) {
        if (arg[1]) {
            let [opt, ...value] = arg.slice(1).split("=")
            if (opt === '-') {
                //needs to be increased one more time
                idxOfFirstRealArg++
                break
            }
            opts[opt] = value[0] == undefined ? true : value.join("=");
        }
    }
    return [opts, args.slice(idxOfFirstRealArg)]
}

export {
    parsePosition,
    parseAliasReplacement,
    Parser,
    Token,
    T,
    Modifier,
    strToTT,
    TypingModifier,
    DeleteModifier,
    SkipModifier,
    RedirModifier,
    SilentModifier,
    getInnerPairsAndDeafultBasedOnRegex,
    format,
    formatPercentStr,
    formatBracePairs,
    parsePercentFormat,
    parseBracketPair,
    getOpts,
    getOptsUnix
}
