import { Message } from "discord.js"

const { getOpt } = require("./user-options")
const { prefix, vars, getVar } = require('./common.js')
const { format, safeEval, getOpts, generateSafeEvalContextFromMessage, parseBracketPair } = require('./util.js')
const economy = require('./economy.js')
const timer = require("./timer.js")

enum T {
    str,
    dofirst,
    calc,
    esc,
    format,
    dofirstrepl,
    command,
}

class Token {
    type: T
    data: string
    argNo: number
    constructor(type: T, data: string, argNo: number) {
        this.type = type
        this.data = data
        this.argNo = argNo
    }
}

enum Modifiers{
    skip = 0,
    silent = 1,
    typing = 2,
    delete = 3,
    redir = 4
}

class Modifier{
    data: RegExpMatchArray
    type: Modifiers
    constructor(data: RegExpMatchArray, type: Modifiers){
        this.data = data
        this.type = type
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
    #hasCmd: boolean

    get specialChars() {
        return `\\\$${this.IFS}{%`
    }

    constructor(msg: Message, string: string) {
        this.tokens = []
        this.string = string
        this.#i = -1
        this.#curChar = undefined
        this.#curArgNo = 0
        this.#hasCmd = false
        this.#msg = msg
        this.modifiers = []
        this.IFS = getVar(msg, "IFS", msg.author.id) || " "
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
        parseLoop: while (this.advance()) {
            switch (this.#curChar) {
                case this.IFS: {
                    if(!lastWasspace){
                        this.#curArgNo++;
                    }
                    lastWasspace = true
                    break
                }
                case "$": {
                    lastWasspace = false
                    this.tokens.push(this.parseDollar(this.#msg))
                    break
                }
                case "%": {
                    lastWasspace = false
                    this.tokens.push(this.parseDoFirstReplacement())
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
                default: {
                    lastWasspace = false
                    if(!this.#hasCmd){
                        this.tokens.push(this.parseCmd())
                        if(this.modifiers.filter(v => v.type === Modifiers.skip).length){
                            this.tokens = this.tokens.concat(this.string.split(this.IFS).slice(1).map((v, i) => new Token(T.str, v, i)))
                            break parseLoop
                        }
                    }
                    else{
                        this.tokens.push(this.parseString())
                    }
                    break
                }
            }
        }
    }

    parseCmd(){
        let cmd = this.#curChar as string
        let modifiers = [/^n:/, /^s:/, /^t:/, /^d:/, /^redir(!)?\(([^:]*):([^:]+)\):/]
        while(this.advance()  && this.#curChar !== this.IFS && this.#curChar !== "\n"){
            cmd += this.#curChar as string
        }
        while(true){
            let foundMatch = false
            for(let modNo = 0; modNo < modifiers.length; modNo++){
                let mod = modifiers[modNo]
                let m = cmd.match(mod)
                if(m){
                    cmd = cmd.slice(m[0].length)
                    this.modifiers.push(new Modifier(m, modNo))
                    foundMatch = true
                }
            }
            if(!foundMatch)
                break
        }
        this.#hasCmd = true
        return new Token(T.command, cmd, -1)
    }

    get lastToken() {
        return this.tokens[this.tokens.length - 1]
    }

    parseEscape(msg: Message) {
        if (!this.advance()) {
            return new Token(T.str, "\\", this.#curArgNo)
        }
        let char = this.#curChar
        let sequence = ""
        if(this.advance()){
            if(this.#curChar === "{"){
                if(this.advance()){
                    sequence = parseBracketPair(this.string, "{}", this.#i)
                    this.advance(sequence.length)
                }
                else{
                    this.back()
                }
            }
            else{
                this.back()
            }
        }
        switch (char) {
            case "n":
                return new Token(T.str, "\n", this.#curArgNo)
            case "t":
                return new Token(T.str, "\t", this.#curArgNo)
            case "U":
            case "u":
                if (!sequence) {
                    return new Token(T.str, "\\u", this.#curArgNo)
                }
                try {
                    return new Token(T.str, String.fromCodePoint(parseInt(`0x${sequence}`)), this.#curArgNo)
                }
                catch (err) {
                    return new Token(T.str,  `\\u{${sequence}}`, this.#curArgNo)
                }
            case "s":
                if (sequence) {
                    return new Token(T.str, sequence, this.#curArgNo)
                }
                return new Token(T.str, this.IFS, this.#curArgNo)
            case "A":
                if(sequence){
                    for(let i = 0; i < sequence.length - 1; i++){
                        this.tokens.push(new Token(T.str, sequence[i], ++this.#curArgNo))
                    }
                    return new Token(T.str, sequence[sequence.length - 1], ++this.#curArgNo)
                }
                return new Token(T.str, "", ++this.#curArgNo)
            case "b":
                return new Token(T.str, `**${sequence}**`, this.#curArgNo)
            case "i":
                return new Token(T.str, `*${sequence}*`, this.#curArgNo)
            case "S":
                return new Token(T.str, `~~${sequence}~~`, this.#curArgNo)
            case "d":
                let date = new Date(sequence)
                if (date.toString() === "Invalid Date") {
                    if (sequence) {
                        return new Token(T.str, `\\d{${sequence}}`,  this.#curArgNo)
                    }
                    else {
                        return new Token(T.str, `\\d`,  this.#curArgNo)
                    }
                }
                return new Token(T.str, date.toString(), this.#curArgNo)
            case "D":
                if (isNaN(parseInt(sequence))) {
                    if (sequence) {
                        return new Token(T.str, `\\D{${sequence}}`,  this.#curArgNo)
                    }
                    return new Token(T.str, `\\D`,  this.#curArgNo)
                }
                return new Token(T.str, (new Date(parseInt(sequence))).toString(), this.#curArgNo)
            case "T": {
                let ts = Date.now()
                if (parseFloat(sequence)) {
                    return new Token(T.str, String(ts / parseFloat(sequence)), this.#curArgNo)
                }
                return new Token(T.str, String(Date.now()), this.#curArgNo)
            }
            case "V": {
                let [scope, ...name] = sequence.split(":")
                //@ts-ignore
                name = name.join(":")
                if (scope == "%") {
                    scope = msg.author.id
                }
                else if (scope == ".") {
                    let v = getVar(msg, name)
                    if (v !== false)
                        return new Token(T.str, v, this.#curArgNo)
                    else return new Token(T.str, `\\V{${sequence}}`,  this.#curArgNo)
                }
                else if (!name) {
                    //@ts-ignore
                    name = scope
                    let v = getVar(msg, name)
                    if (v !== false)
                        return new Token(T.str, v, this.#curArgNo)
                    return new Token(T.str, `\\V{${sequence}}`,  this.#curArgNo)
                }
                let v = getVar(msg, name, scope)
                if (v !== false)
                    return new Token(T.str, v, this.#curArgNo)
                else return new Token(T.str, `\\V{${sequence}}`,  this.#curArgNo)
            }
            case "v":
                let num = Number(sequence)
                //basically checks if it's a n
                if (!isNaN(num)) {
                    let args = msg.content.split(" ")
                    return new Token(T.str, String(args[num]), this.#curArgNo)
                }
                let v = getVar(msg, sequence, msg.author.id)
                if (v === false)
                    v = getVar(msg, sequence)
                if (v !== false)
                    return new Token(T.str, v, this.#curArgNo)
                else return new Token(T.str, `\\v{${sequence}}`,  this.#curArgNo)
            case "\\":
                return new Token(T.str, "\\", this.#curArgNo)
            default:
                if (sequence) {
                    return new Token(T.str, `${char}{${sequence}}`, this.#curArgNo)
                }
                return new Token(T.str, `${char}`, this.#curArgNo)
        }
    }

    async parseFormat(msg:  Message){
        this.advance()
        let inner = parseBracketPair(this.string, "{}", this.#i)
        this.advance(inner.length)
        let [format, ...args] = inner.split("|")
        let data = ""
        switch(format){
            case "cmd":
                data = msg.content.split(this.IFS)[0].slice(getOpt(msg.author.id, "prefix", prefix).length)
                break
            case "fhex":
            case "fbase": {
                let [num, base] = args
                data = String(parseInt(num, parseInt(base) || 16))
                break
            }
            case "hex":
            case "base": {
                let [num, base] = args
                data= String(Number(num).toString(parseInt(base) || 16))
                break
            }
            case "rev":
            case "reverse":
            console.log(format, args)
                if (args.length > 1)
                    data = args.reverse().join(" ")
                else{
                    data = [...args.join(" ")].reverse().join("")
                }
                break
            case 'c':
                data = msg.content.split(this.IFS).slice(1).join(this.IFS).trim()
                break
            case "channel": {
                let fmt = args.join(" ") || "<#%i>"
                let channel = msg.channel
                //@ts-ignore
                data = format(fmt, { i: channel.id, n: channel.name ?? `{${channel.type}}` })
                break
            }
            case '$': {
                data = String(economy.calculateAmountFromString(msg.author.id, args.join(" ") || "100%"))
                break
            }
            case '$l': {
                data = String(economy.calculateLoanAmountFromString(msg.author.id, args.join(" ") || "100%"))
                break
            }
            case '$t': {
                data = String(economy.calculateAmountFromStringIncludingStocks(msg.author.id, args.join(" ") || "100%"))
                break
            }
            case '$n': {
                data = String(economy.calculateAmountFromStringIncludingStocks(msg.author.id, args.join(" ") || "100%") - economy.calculateLoanAmountFromString(msg.author.id, "100%"))
                break
            }
            case "timer": {
                let name = args.join(" ").trim()
                if (name[0] === '-') {
                    data = String(timer.default.do_lap(msg.author.id, name.slice(1)))
                }
                else{
                    data = String(timer.default.getTimer(msg.author.id, args.join(" ").trim()))
                }
                break
            }
            case "user": {
                let fmt = args.join(" ") || "<@%i>"
                let member = msg.member
                let user = member?.user
                if (user === undefined || member === undefined || member === null) {
                    data = `{${args.join(" ")}}`
                    break
                }
                data = format(fmt,
                    {
                        i: user.id || "#!N/A",
                        u: user.username || "#!N/A",
                        n: member.nickname || "#!N/A",
                        X: member.displayHexColor.toString() || "#!N/A",
                        x: member.displayColor.toString() || "#!N/A",
                        c: user.createdAt.toString() || "#!N/A",
                        j: member.joinedAt?.toString() || "#!N/A",
                        b: member.premiumSince?.toString() || "#!N/A",
                        a: member.user.avatarURL() || "#N/A"
                    }
                )
                break
            }
            case "rand":
                if (args && args?.length > 0)
                    data = args[Math.floor(Math.random() * args.length)]
                else{
                    data = "{rand}"
                }
                break
            case "num":
            case "number":
                if (args && args?.length > 0) {
                    let low = Number(args[0])
                    let high = Number(args[1]) || low * 10
                    let dec = ["y", "yes", "true", "t", "."].indexOf(args[2]) > -1 ? true : false
                    if (dec)
                        data = String((Math.random() * (high - low)) + low)
                    else{
                        data = String(Math.floor((Math.random() * (high - low)) + low))
                    }
                    break
                }
                data = String(Math.random())
                break
            case "ruser":
                let fmt = args.join(" ") || "%u"
                let guild = msg.guild
                if (guild === null) {
                    data = `{${fmt}}`
                    break
                }

                let member = guild.members.cache.random()
                if (member === undefined)
                    member = (await guild.members.fetch()).random()
                if (member === undefined) {
                    data = `{${fmt}}`
                    break
                }
                let user = member.user
                data = format(fmt,
                    {
                        i: user.id || "#!N/A",
                        u: user.username || "#!N/A",
                        n: member.nickname || "#!N/A",
                        X: member.displayHexColor.toString() || "#!N/A",
                        x: member.displayColor.toString() || "#!N/A",
                        c: user.createdAt.toString() || "#!N/A",
                        j: member.joinedAt?.toString() || "#!N/A",
                        b: member.premiumSince?.toString() || "#!N/A"
                    }
                )
                break
            case "time":
                let date = new Date()
                if (!args.length) {
                    data = date.toString()
                    break
                }
                let hours = date.getHours()
                let AMPM = hours < 12 ? "AM" : "PM"
                if (args[0].trim() == '12') {
                    hours > 12 ? hours = hours - 12 : hours
                    args.splice(0, 1)
                }
                data = format(args.join("|"), {
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
                    "w": `${date.getDay()}`
                })
                break
            case "arg":{
                for(let i = 0; i < this.tokens.filter(v => v.argNo === this.#curArgNo).length; i++){
                    this.tokens.push(this.tokens[i])
                }
                data = ""
                break
            }
            case "channel":
                data = format(args.join("|"), {
                    "i": `${msg.channel.id}`,
                    //@ts-ignore
                    "N!": `${msg.channel.nsfw}`,
                    //@ts-ignore
                    "n": `${msg.channel.name}`,
                    "c": `${msg.channel.createdAt}`
                })
                break
            default:{
                if (args.length > 0) {
                    data = `{${format}|${args.join("|")}}`
                }
                else{
                    data = `{${format}}`
                }
            }
        }
        return new Token(T.str, data, this.#curArgNo)
    }

    parseDoFirstReplacement() {
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

    parseDollar(msg: Message) {
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
                if(token.type === T.dofirstrepl){
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

function getCommand(content: string) {
    return content.split(" ")[0]
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
                let isSlice = false
                let dotsInARow = 0
                for (i++; i < cmdContent.length; i++) {
                    let ch = cmdContent[i]
                    if (ch === "}") {
                        break
                    }
                    if (ch == '.') {
                        dotsInARow++
                        isSlice = true
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

function parseDoFirstInnerBracketData(data: string) {
    if (data == "")
        return [undefined, undefined]
    let [doFirstIndex, slice] = data.split(":")
    if (doFirstIndex == data) {
        slice = doFirstIndex
        //@ts-ignore
        doFirstIndex = undefined
    }
    else {
        //@ts-ignore
        doFirstIndex = Number(doFirstIndex)
        if (slice)
            slice = slice
        else
            //@ts-ignore
            slice = undefined
    }
    return [doFirstIndex, slice]
}

function parseDoFirst(cmdData: string, doFirstCountNoToArgNo: number, args: string) {
    let finalArgs = []
    for (let i = 0; i < args.length; i++) {
        let arg = args[i]
        let argIdx = i
        let finalArg = ""
        for (let i = 0; i < arg.length; i++) {
            let ch = arg[i]
            if (ch == "%") {
                i++
                ch = arg[i]
                if (ch == "{") {
                    let data = ""
                    for (i++; i < arg.length; i++) {
                        ch = arg[i]
                        if (ch == "}") break;
                        data += ch
                    }
                    let [doFirstIndex, slice] = parseDoFirstInnerBracketData(data)
                    console.log(doFirstIndex, slice)
                    if (doFirstIndex !== undefined && slice === undefined) {
                        //@ts-ignore
                        finalArg += `${cmdData[doFirstCountNoToArgNo[doFirstIndex]]}`
                    }
                    else if (doFirstIndex === undefined && slice !== undefined) {
                        if (slice === "...") {
                            let splitData = cmdData[argIdx]?.split(" ")
                            if (splitData === undefined) {
                                finalArg += `%{${data}}`
                            }
                            else {
                                finalArg += splitData[0]
                                finalArgs.push(finalArg)
                                finalArg = ""
                                for (let splitIdx = 1; splitIdx < splitData.length; splitIdx++) {
                                    finalArgs.push(splitData[splitIdx])
                                }
                            }
                        }
                        else {
                            //@ts-ignore
                            slice = Number(slice)
                            //@ts-ignore
                            if (slice == -1) {
                                finalArg += "__BIRCLE__UNDEFINED__"
                            }
                            else {
                                let splitData = cmdData[argIdx]?.split(" ")
                                //@ts-ignore
                                if (splitData?.[slice] !== undefined) {
                                    //@ts-ignore
                                    finalArg += splitData?.[slice]
                                }
                                else {
                                    finalArg += `%{${data}}`
                                }
                            }
                        }
                    }
                    //@ts-ignore
                    else if (doFirstIndex !== argIdx && slice !== undefined) {
                        if (slice === "...") {
                            //@ts-ignore
                            if (cmdData[doFirstCountNoToArgNo[doFirstIndex]]) {
                                //@ts-ignore
                                let splitData = cmdData[doFirstCountNoToArgNo[doFirstIndex]].split(" ")
                                finalArg += splitData[0]
                                finalArgs.push(finalArg)
                                for (let splitIdx = 1; splitIdx < splitData.length; splitIdx++) {
                                    finalArgs.push(splitData[splitIdx])
                                }
                            }
                            else {
                                finalArg += `%{${data}}`
                            }
                        }
                        else {
                            //@ts-ignore
                            slice = Number(slice)
                            //@ts-ignore
                            if (cmdData[doFirstCountNoToArgNo[doFirstIndex]]) {
                                //@ts-ignore
                                let splitData = cmdData[doFirstCountNoToArgNo[doFirstIndex]].split(" ")
                                //@ts-ignore
                                finalArg += `${splitData[slice]}`
                            }
                            else {
                                finalArg += `%{${data}}`
                            }
                        }
                    }
                    //@ts-ignore
                    else if (isNaN(doFirstIndex)) {
                        finalArg += cmdData[argIdx]
                    }
                    else {
                        finalArg += `%{${data}}`
                    }
                }
                else {
                    finalArg += "%"
                    if (ch)
                        finalArg += ch
                }
            }
            else {
                finalArg += ch
            }
        }
        finalArgs.push(finalArg)
    }
    return finalArgs
}

function operateOnPositionValues(v1: string, op: string, v2: string, areaSize: number, objectSize: number, numberConv: Function) {
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
    if (conversions[v1] !== undefined) {
        //@ts-ignore
        v1 = conversions[v1]
    } else v1 = numberConv(v1)
    if (conversions[v2] !== undefined) {
        //@ts-ignore
        v2 = conversions[v2]
    } else v2 = numberConv(v2)
    if (v1 == undefined || v1 == null)
        return numberConv(v2)
    switch (op) {
        case "+":
            return v1 + v2;
        case "-":
            //@ts-ignore
            return v1 - v2;
        case "*":
            //@ts-ignore
            return v1 * v2;
        case "/":
            //@ts-ignore
            return Math.round(v1 / v2);
        case "%":
            //@ts-ignore
            return Math.round(areaSize * (v1 / 100))
    }
    return numberConv(v2)
}

function parsePosition(position: string, areaSize: number, objectSize: number, numberConv: Function) {
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

export {
    parsePosition,
    parseAliasReplacement,
    parseDoFirst,
    Parser,
    Token,
    T,
    Modifier,
    Modifiers
}
