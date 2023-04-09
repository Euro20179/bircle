import { Message, MessageCreateOptions, MessagePayload, PartialMessage } from 'discord.js';
import fs from 'fs'

import vars from './vars';

import events from './events';

import globals = require("./globals")
import user_options = require("./user-options")
import common from './common';
import { Parser, Token, T, Modifier, TypingModifier, SkipModifier, getInnerPairsAndDeafultBasedOnRegex, DeleteModifier, SilentModifier, getOptsWithNegate, getOptsUnix } from './parsing';
import { ArgList, cmdCatToStr, generateSafeEvalContextFromMessage, getContentFromResult, Options, safeEval, listComprehension, mimeTypeToFileExtension, isMsgChannel, isBetween, BADVALUE, generateCommandSummary} from './util';

import { parseBracketPair, getOpts } from './parsing'

import { cloneDeep } from 'lodash';

import parse_escape from './parse_escape';
import parse_format from './parse_format';


export const StatusCode = {
    ACHIEVEMENT: -3,
    PROMPT: -2,
    INFO: -1,
    RETURN: 0,
    WARNING: 1,
    ERR: 2
} as const

class OrderedDict<TKey, TValue>{
    keys: TKey[]
    values: TValue[]
    constructor(){
        this.keys = []
        this.values = []
    }

    get(key: TKey){
        return this.values[this.keys.indexOf(key)]
    }

    set(key: TKey, value: TValue){
        if(this.keys.includes(key)){
            return false
        }
        this.keys.push(key)
        this.values.push(value)
        return true
    }

    delete(key: TKey){
        let val = this.get(key)
        this.keys = this.keys.filter(v => v !== key)
        this.values = this.values.filter(v => v !== val)
    }

    keyAt(index: number){
        return this.keys[index]
    }

    valueAt(index: number){
        return this.values[index]
    }

    keyExists(key: TKey){
        return this.keys.includes(key)
    }

    get length(){
        return this.keys.length
    }
}

export const PIDS: OrderedDict<number, string> = new OrderedDict()

export type StatusCode = typeof StatusCode[keyof typeof StatusCode]

export function statusCodeToStr(code: StatusCode) {
    return String(code)
}

export const CommandCategory = {
    UTIL: 0,
    GAME: 1,
    FUN: 2,
    META: 3,
    IMAGES: 4,
    ECONOMY: 5,
    VOICE: 6,
    ADMIN: 7,
    MATCH: 8,
    ALIASV2: 9
} as const

export async function promptUser(msg: Message, prompt?: string, sendCallback?: (data: MessageCreateOptions | MessagePayload | string) => Promise<Message>, options?: {timeout: milliseconds_t}): Promise<Message<boolean> | false> {
    if (!isMsgChannel(msg.channel)) return false
    if(prompt)
        await handleSending(msg, { content: prompt, status: StatusCode.PROMPT }, sendCallback)
    let msgs = await msg.channel.awaitMessages({ filter: m => m.author.id === msg.author.id, time: options?.timeout || 30000, max: 1 })
    let m = msgs.at(0)
    if (!m) {
        return false
    }
    return m
}

export class AliasV2 {
    help: CommandHelp;
    name: string
    exec: string
    creator: string
    appendArgs: boolean
    appendOpts: boolean
    standardizeOpts: boolean
    category: CommandCategory
    make_bot_type: boolean
    cmd_std_version: "alias"
    use_result_cache: false
    constructor(name: string, exec: string, creator: string, help: CommandHelp, appendArgs?: boolean, appendOpts?: boolean, standardizeOpts?: boolean) {
        this.name = name
        this.exec = exec
        this.creator = creator
        this.help = help
        this.appendArgs = appendArgs ?? true
        this.appendOpts = appendOpts ?? true
        this.standardizeOpts = standardizeOpts ?? true
        this.category = CommandCategory.ALIASV2
        this.make_bot_type = false
        this.cmd_std_version = "alias"
        this.use_result_cache = false
    }
    setAppendArgs(bool?: boolean) {
        this.appendArgs = bool ?? false
    }
    setAppendOpts(bool?: boolean) {
        this.appendOpts = bool ?? false
    }
    setStandardizeOpts(bool?: boolean) {
        this.standardizeOpts = bool ?? false
    }

    basicPrepare(msg: Message, args: string[], opts: Opts) {
        let tempExec = this.exec

        if (this.appendOpts && Object.keys(opts).length) {
            //if opt is true, we want it to JUST be -<opt> if it's anything else it should be -<opt>=<value>
            tempExec += " " + Object.entries(opts).map(v => `-${v[0]}${v[1] === true ? "" : `=\\s{${v[1]}}`}`).join(" ")
        }

        if (this.appendArgs && args.length) {
            tempExec += " " + args.join(" ")
        }
        return tempExec

    }

    prepare(msg: Message, args: string[], opts: Opts, fillPlaceholders = false) {
        let tempExec = this.exec

        if (!fillPlaceholders) {
            return this.basicPrepare(msg, args, opts)
        }

        //FIXME: opts is not part of args.., add a seperate one for `opts..` (we dont need others becasue of the variables)
        const argsRegex = /^(?:args\.\.|args\d+|args\d+\.\.|args\d+\.\.\d+|#args\.\.|args\[[^\]]*\])$/

        let innerPairs = getInnerPairsAndDeafultBasedOnRegex(this.exec, ["#args", "args"], argsRegex)

        for (let [innerText, innerOr] of innerPairs) {
            let toReplace = `{${innerText}${innerOr}}`
            //remove the leading ||
            //the leading || is there to make the above line easier
            innerOr = innerOr.slice(2)

            if (innerText.startsWith('args[')) {
                let innerBracket = parseBracketPair(innerText, "[]")
                innerOr = JSON.stringify([innerOr])
                if (!innerBracket) {
                    tempExec = tempExec.replace(toReplace, args.length ? JSON.stringify(args) : innerOr)
                }
                else if (!isNaN(Number(innerBracket))) {
                    tempExec = tempExec.replace(toReplace, JSON.stringify([args[Number(innerBracket)]]) || innerOr)
                }
                continue
            }

            let [left, right] = innerText.split("..")
            if (left === "args") {
                tempExec = tempExec.replace(toReplace, args.join(" ") || innerOr)
                continue
            }
            else if (left === '#args') {
                tempExec = tempExec.replace(toReplace, String(args.length))
                continue
            }
            let leftIndex = Number(left.replace("args", ""))
            let rightIndex = right ? Number(right) : undefined
            if (right !== undefined) {
                let slice = args.slice(leftIndex, rightIndex)
                let text = slice.length ? slice.join(" ") : innerOr
                tempExec = tempExec.replace(toReplace, text)
            }
            else {
                tempExec = tempExec.replace(toReplace, args[leftIndex] ?? innerOr)
            }
        }

        if (this.appendOpts && Object.keys(opts).length) {
            //if opt is true, we want it to JUST be -<opt> if it's anything else it should be -<opt>=<value>
            tempExec += " " + Object.entries(opts).map(v => `-${v[0]}${v[1] === true ? "" : `=\\s{${v[1]}}`}`).join(" ")
        }

        if (this.appendArgs && args.length) {
            tempExec += " " + args.join(" ")
        }
        return tempExec
    }

    async run({ msg, rawArgs, sendCallback, opts, args, recursionCount, commandBans, stdin, modifiers, context, returnJson }: { msg: Message<boolean>, rawArgs: ArgumentList, sendCallback?: (data: MessageCreateOptions | MessagePayload | string) => Promise<Message>, opts: Opts, args: ArgumentList, recursionCount: number, commandBans?: { categories?: CommandCategory[], commands?: string[] }, stdin?: CommandReturn, modifiers?: Modifier[], context: InterpreterContext, returnJson?: boolean }) {

        if (common.BLACKLIST[msg.author.id]?.includes(this.name)) {
            return { content: `You are blacklisted from ${this.name}`, status: StatusCode.ERR }
        }

        let tempExec = ""
        let lastCmd = ""

        globals.addToCmdUse(this.name)

        for (let opt of Object.entries(opts)) {
            vars.setVarEasy(`%:-${opt[0]}`, String(opt[1]), msg.author.id)
        }

        await this.expand(msg, args, opts, ((a, preArgs) => {
            globals.addToCmdUse(a)
            lastCmd = a
            tempExec = `${preArgs}`
        }))

        if (lastCmd === this.name) {
            return { content: `Failed to expand ${this.name} (infinitely recursive)` }
        }

        //if this doesnt happen it will be added twice because of the fact that running it will add it again
        globals.removeFromCmdUse(lastCmd)

        const optsThatNeedStandardizing = [
            ["pipe-symbol", ">pipe>"],
            ["1-arg-string", ""],
            ["opts-parser", "normal"]
        ] as const
        let oldOpts = optsThatNeedStandardizing.map(([name, def]) => [name, user_options.getOpt(msg.author.id, name, def)])

        if (this.standardizeOpts) {
            for (let [name, def] of optsThatNeedStandardizing) {
                user_options.setOpt(msg.author.id, name, def)
            }
        }

        let modifierText = ""
        for (let mod of modifiers ?? []) {
            modifierText += mod.stringify() as string
        }

        //it is not possible to fix double interpretation
        //we dont know if the user gave the args and should only be interpreted or if the args are from the alias and should be double interpreted
        //
        //The fact that we are returning json here means that if a command in an alias exceeds the 2k limit, it will not be put in a file
        //the reason for this is that handleSending is never called, and handleSending puts it in a file
        let { rv } = await cmd({ msg, command_excluding_prefix: `${modifierText}${tempExec}`, recursion: recursionCount + 1, returnJson, pipeData: stdin, sendCallback: sendCallback, context })

        //MIGHT BE IMPORTANT IF RANDOM ALIAS ISSUES HAPPEN
        //IT IS COMMENTED OUT BECAUSE ALIAISES CAUSE DOUBLE PIPING

        // if(interpreter?.sendCallback)
        //     rv.sendCallback = interpreter?.sendCallback

        for (let opt of Object.entries(opts)) {
            vars.delVar(`${msg.author.id}:-${opt[0]}`)
        }

        if (this.standardizeOpts) {
            for (let [name, val] of oldOpts) {
                user_options.setOpt(msg.author.id, name, val)
            }
        }

        return rv
    }
    toJsonString() {
        return JSON.stringify({ name: this.name, exec: this.exec, help: this.help, creator: this.creator, appendOpts: this.appendOpts, appendArgs: this.appendArgs })
    }


    async expand(msg: Message, args: string[], opts: Opts, onExpand?: (alias: string, preArgs: string) => any, fillPlaceholders = true): Promise<AliasV2 | false> {
        let expansions = 0
        let command = this.exec.split(" ")[0]
        let preArgs = this.prepare(msg, args, opts, fillPlaceholders)
        if (onExpand && !onExpand?.(command, preArgs)) {
            return false
        }
        let curAlias: AliasV2;
        while (curAlias = aliasesV2[command]) {
            expansions++;
            if (expansions > 1000) {
                return false
            }
            preArgs = curAlias.prepare(msg, preArgs.split(" ").slice(1), opts, fillPlaceholders)
            command = aliasesV2[command].exec.split(" ")[0]
            if (onExpand && !onExpand?.(command, preArgs)) {
                return false
            }
        }
        return curAlias as AliasV2
    }

    static allToJson(aliases: AliasV2[]) {
        return JSON.stringify(aliases.map(v => v.toJsonString()))
    }
}


export let lastCommand: { [key: string]: string } = {};
export let snipes: (Message | PartialMessage)[] = [];
export let purgeSnipe: (Message | PartialMessage)[] = [];

export let currently_playing: { link: string, filename: string } | undefined;

export function setCurrentlyPlaying(to: { link: string, filename: string } | undefined) {
    currently_playing = to
}

export const illegalLastCmds = ["!!", "spam"]

export function createAliasesV2(): { [key: string]: AliasV2 } {
    if (fs.existsSync("./command-results/aliasV2")) {
        let j: { [key: string]: AliasV2 } = JSON.parse(fs.readFileSync("./command-results/aliasV2", "utf-8"))
        for (let aName in j) {
            j[aName] = new AliasV2(j[aName].name, j[aName].exec, j[aName].creator, j[aName].help, j[aName].appendArgs, j[aName].appendOpts, j[aName].standardizeOpts)
        }
        return j
    }
    return {}
}

export let aliasesV2 = createAliasesV2()

export function isCmd(text: string, prefix: string) {
    return text.slice(0, prefix.length) === prefix
}

type CmdArguments = {
    msg: Message,
    command_excluding_prefix: string,
    recursion?: number,
    returnJson?: boolean,
    disable?: {
        categories?: CommandCategory[],
        commands?: string[]
    },
    sendCallback?: (options: MessageCreateOptions | MessagePayload | string) => Promise<Message>,
    pipeData?: CommandReturn,
    returnInterpreter?: boolean,
    enableUserMatch?: boolean,
    programArgs?: string[],
    env?: Record<string, string>,
    context?: InterpreterContext
}

export async function cmd({
    msg,
    command_excluding_prefix,
    recursion = 0,
    returnJson = false,
    disable,
    sendCallback,
    pipeData,
    enableUserMatch,
    programArgs,
    env,
    context
}: CmdArguments) {

    let int, rv: CommandReturn | false = { noSend: true, status: StatusCode.RETURN };

    if (await Interpreter.handleMatchCommands(msg, command_excluding_prefix, enableUserMatch, recursion)) {
        return { rv, interpreter: int }
    }

    let parser = new Parser(msg, command_excluding_prefix)
    await parser.parse()

    let logicalLine = 0

    context ??= new InterpreterContext(programArgs, env)

    let PID = (PIDS.keyAt(PIDS.length - 1) ?? 0) + 1

    context.export("PID", String(PID))

    PIDS.set(PID, command_excluding_prefix)

    //commands that are aliases where the alias comtains ;; will not work properly because the alias doesn't handle ;;, this does
    while (parser.tokens.length > 0 && PIDS.keyExists(PID)) {
        context.env.LINENO = String(++logicalLine)

        let eolIdx = parser.tokens.findIndex(v => v.type === T.end_of_line)
        let currentToks = parser.tokens.slice(0, eolIdx)
        parser.tokens = parser.tokens.slice(eolIdx + 1)

        //happens if there is some kind of empty statement
        if (currentToks.length === 0) continue


        int = new Interpreter(msg, currentToks, {
            modifiers: parser.modifiers,
            recursion, returnJson, disable, sendCallback, pipeData, context
        })
        
        //this was previously ored to false
        rv = await int.run() ?? { noSend: true, status: StatusCode.RETURN };
        //we handle piping for command return here, and not interpreter because when the interpreter handles this itself, it leads to double piping
        //  double piping is when the result pipes into itself
        //  this happens essentially because handlePipes gets called twice, once in handlePipes and when handlePipes requests json from interpreter
        if (returnJson) {
            rv = await int.handlePipes(rv)
        }

        context = int.context
    }

    PIDS.delete(PID)

    return {
        rv: rv,
        interpreter: int
    }
}


type InterpreterOptionNames = "dryRun" | "explicit" | "no-int-cache"
type InterpreterOptions = { [K in InterpreterOptionNames]?: number }

type InterpreterEnv = Record<string, string>

class InterpreterContext {
    env: InterpreterEnv
    options: InterpreterOptions
    programArgs: string[]
    constructor(programArgs?: string[], env?: InterpreterEnv, options?: InterpreterOptions) {
        this.env = {
            IFS: " ",
            ...(env ?? {}),
        }

        this.options = {
            ...(options ?? {})
        }

        this.programArgs = programArgs ?? []
    }

    setOpt(opt: InterpreterOptionNames, value: number) {
        return this.options[opt] = value
    }

    export(name: keyof InterpreterEnv, value: InterpreterEnv[keyof InterpreterEnv]) {
        return this.env[name] = value
    }

    unexport(name: string) {
        if (this.env[name]) {
            delete this.env[name]
            return true
        }
        return false
    }
}

export class Interpreter {
    tokens: Token[]
    args: string[]
    recursion: number
    returnJson: boolean
    disable: { categories?: CommandCategory[], commands?: string[] }
    sendCallback: ((options: MessageCreateOptions | MessagePayload | string) => Promise<Message>) | undefined
    aliasV2: false | AliasV2

    context: InterpreterContext

    #originalTokens: Token[]

    #interprated: boolean
    #i: number
    #curTok: Token | undefined
    #doFirstCountValueTable: { [key: number]: string }
    #doFirstNoFromArgNo: { [key: number]: number }
    #msg: Message
    #argOffset: number

    #pipeData: CommandReturn | undefined
    #pipeTo: Token[]

    #shouldType: boolean

    modifiers: Modifier[]

    static commandUndefined = new Object()

    static resultCache = new Map()

    constructor(msg: Message, tokens: Token[], options: {
        modifiers?: Modifier[],
        recursion?: number,
        returnJson?: boolean,
        disable?: {
            categories?: CommandCategory[],
            commands?: string[]
        },
        sendCallback?: (options: MessageCreateOptions | MessagePayload | string) => Promise<Message>,
        pipeData?: CommandReturn,
        programArgs?: string[],
        context?: InterpreterContext
    }) {
        this.tokens = cloneDeep(tokens)
        this.#originalTokens = cloneDeep(tokens)
        this.args = []
        this.recursion = options.recursion ?? 0
        this.returnJson = options.returnJson ?? false
        this.disable = options.disable ?? {}
        this.sendCallback = options.sendCallback
        this.aliasV2 = false

        this.context = options.context ?? new InterpreterContext(options.programArgs, {
            IFS: " "
        })

        this.#pipeData = options.pipeData
        this.#pipeTo = []

        this.modifiers = options.modifiers ?? []
        this.#i = -1
        this.#curTok = undefined
        this.#doFirstCountValueTable = {}
        this.#msg = msg
        this.#argOffset = 0
        this.#doFirstNoFromArgNo = {}
        this.#interprated = false

        this.#shouldType = false
    }

    setTyping(bool?: boolean) {
        this.#shouldType = bool ?? true
    }

    getMessage() {
        return this.#msg
    }

    getPipeTo() {
        return this.#pipeTo
    }

    getPipeData() {
        return this.#pipeData
    }

    advance(amount = 1) {
        this.#i += amount;
        this.#curTok = this.tokens[this.#i]
        return this.#curTok !== undefined
    }
    back() {
        this.#i--;
        if (this.#i < 0) {
            return false
        }
        this.#curTok = this.tokens[this.#i]
        return true
    }
    addTokenToArgList(token: Token) {
        if (token.data === Interpreter.commandUndefined) {
            return;
        }
        if (typeof token.data === 'object') {
            throw Error(`Invalid token data, expected string not array (${token.data.join(" + ")})`)
        }
        if (this.args[token.argNo + this.#argOffset] === undefined) {
            this.args[token.argNo + this.#argOffset] = token.data
        }
        else {
            this.args[token.argNo + this.#argOffset] += token.data
        }
    }
    removeLastTokenFromArgList() {
        this.args = this.args.splice(0, -1)
    }

    async [T.str](token: Token): Promise<Token[] | false> {
        return [new Token(T.str, token.originalText(), token.argNo)]
    }
    async [T.dofirst](token: Token): Promise<Token[] | false> {
        const runCmd = async (data: string) => (await cmd({
            msg: this.#msg,
            command_excluding_prefix: data,
            disable: this.disable,
            recursion: this.recursion + 1,
            returnJson: true,
            pipeData: this.getPipeData()
        })).rv

        let rv = await runCmd(token.data as string)
        let data = rv ? getContentFromResult(rv as CommandReturn, "\n").trim() : ""

        if (rv && rv.recurse && rv.content && isCmd(rv.content, common.prefix) && this.recursion < 20) {
            rv = await runCmd(rv.content.slice(common.prefix.length))
            data = rv ? getContentFromResult(rv as CommandReturn, "\n").trim() : ""
        }

        this.#doFirstCountValueTable[Object.keys(this.#doFirstCountValueTable).length] = data
        this.#doFirstNoFromArgNo[token.argNo] = Object.keys(this.#doFirstCountValueTable).length - 1
        return [new Token(T.str, data, token.argNo)]
    }
    async [T.calc](token: Token): Promise<Token[] | false> {
        let parser = new Parser(this.#msg, token.data as string, false)
        await parser.parse()
        let int = new Interpreter(this.#msg, parser.tokens, {
            modifiers: parser.modifiers,
            recursion: this.recursion + 1,
            disable: this.disable,
            context: this.context
        })
        await int.interprate()
        token.data = int.args.join(" ")
        let t = new Token(T.str, String(safeEval(token.data, { ...generateSafeEvalContextFromMessage(this.#msg), ...vars.vars["__global__"] }, { timeout: 1000 })), token.argNo)
        return [t]
    }
    async [T.esc](token: Token): Promise<Token[] | false> {
        let [char, sequence] = token.data

        if (parse_escape[`escape_${char}`]) {
            return parse_escape[`escape_${char}`](token, char, sequence, this)
        }
        if (sequence) {
            return [new Token(T.str, `${char}{${sequence}}`, token.argNo)]
        }
        return [new Token(T.str, `${char}`, token.argNo)]
    }
    async[T.format](token: Token): Promise<Token[] | false> {
        let [format_name, ...args] = (token.data as string).split("|")
        if (parse_format[`parse_${format_name}`]) {
            let dat = await parse_format[`parse_${format_name}`](token, format_name, args, this)
            if (typeof dat === 'string') {
                return [new Token(T.str, dat, token.argNo)]
            }
            return dat
        }
        if (args.length > 0) {
            return [new Token(T.str, `{${format_name}|${args.join("|")}}`, token.argNo)]
        }
        return [new Token(T.str, `{${format_name}}`, token.argNo)]
    }
    async[T.dofirstrepl](token: Token): Promise<Token[] | false> {
        let [doFirstArgNo, doFirstResultNo] = (token.data as string).split(":")
        if (doFirstResultNo === undefined) {
            doFirstResultNo = doFirstArgNo
            doFirstArgNo = String(this.#doFirstNoFromArgNo[token.argNo])
        }
        let doFirst = this.#doFirstCountValueTable[Number(doFirstArgNo)]
        if (doFirst !== undefined) {
            let text = ""
            if (doFirstResultNo === "") {
                text = doFirst
            }
            else {
                text = doFirst.split(" ")[Number(doFirstResultNo)] ?? null
            }
            return [new Token(T.str, text, token.argNo)]
        }
        //TODO: %{...} spreads  args into  multiple arguments
        return []
    }
    async[T.syntax](token: Token): Promise<Token[] | false> {
        let parse = new Parser(this.#msg, token.data as string, false)
        await parse.parse()
        let int = new Interpreter(this.#msg, parse.tokens, {
            modifiers: parse.modifiers,
            recursion: this.recursion + 1
        })
        let args = await int.interprate()
        return listComprehension(args, (arg, index) => new Token(T.str, index < args.length - 1 ? `${arg} ` : arg, token.argNo))
    }

    async[T.pipe](token: Token): Promise<Token[] | false> {
        //gets everything after the current pipe
        this.#pipeTo = this.#originalTokens.slice(this.#i + 1)
        return false
    }

    async [T.variable](token: Token): Promise<Token[] | false> {
        let [varName, ifNull] = token.data
        if (this.context.env[varName] !== undefined) {
            return [new Token(T.str, this.context.env[varName], token.argNo)]
        }
        let _var = vars.getVar(this.#msg, varName)
        if (_var === false) {
            if (ifNull) {
                return [new Token(T.str, ifNull, token.argNo)]
            }
            return [new Token(T.str, `\${${varName}}`, token.argNo)]
        }
        return [new Token(T.str, _var, token.argNo)]
    }

    async [T.end_of_line](token: Token): Promise<false> {
        return false
    }

    hasModifier(mod: typeof Modifier) {
        return this.modifiers.filter(v => v instanceof mod).length > 0
    }

    async sendDataToVariable(place: string, name: string, _data: CommandReturn | string | MessagePayload | MessageCreateOptions) {
        let data;
        if (typeof _data === 'string') {
            data = _data
        }
        else if ("content" in _data) {
            data = _data.content
        }
        else {
            data = "__BIRCLE_UNDEFINED__"
        }
        if (data) {
            let oldData = vars.getVar(this.#msg, name, place)
            if (oldData === false) {
                vars.setVar(`${place}:${name}`, data, this.#msg.author.id)
            }
            else vars.setVar(`${place}:${name}`, oldData + "\n" + data, this.#msg.author.id)
        }
        return this.#msg

    }

    getModifiersFromCmd(cmd: string) {
        let modMap = new Map<RegExp, typeof Modifier>()
        modMap.set(/^d:/, DeleteModifier)
        modMap.set(/^t:/, TypingModifier)
        modMap.set(/^s:/, SilentModifier)
        modMap.set(/^n:/, SkipModifier)

        let modifiers = []
        let foundMatch = true
        while (foundMatch) {
            for (let mod of modMap.keys()) {
                let m = cmd.match(mod);
                if (m) {
                    let modifier = modMap.get(mod)
                    if (modifier) {
                        modifiers.push(new modifier(m))
                    }
                    cmd = cmd.slice(m[0].length)
                    break
                }
                foundMatch = false
            }
        }
        return [modifiers, cmd] as const
    }

    async runBircleFile(cmd_to_run: string, args: string[]): Promise<CommandReturn | undefined> {
        let data = fs.readFileSync(`./src/bircle-bin/${cmd_to_run}.bircle`, 'utf-8')
        return (await cmd({
            msg: this.#msg,
            command_excluding_prefix: data,
            programArgs: args,
            returnJson: this.returnJson
        })).rv
    }

    async run(): Promise<CommandReturn | undefined> {
        let args = await this.interprate()

        args[0] = args[0].trim()

        if (this.context.options.dryRun) {
            if (this.returnJson)
                return { noSend: true, status: StatusCode.RETURN }
            if (this.getPipeTo().length)
                return void await handleSending(this.#msg, crv("PLACEHOLDER_DATA"), this.sendCallback, this.recursion + 1)
        }

        let cmd = args[0];

        [this.modifiers, cmd] = this.getModifiersFromCmd(cmd)

        for (let mod of this.modifiers) {
            mod.modify(this)
        }

        args = args.slice(1)

        //The return  value from this function
        let rv: CommandReturn = { status: StatusCode.RETURN };

        let warn_cmds = user_options.getOpt(this.#msg.author.id, "warn-cmds", "").split(" ")
        let warn_categories = user_options.getOpt(this.#msg.author.id, "warn-categories", "").split(" ")

        let optParser = user_options.getOpt(this.#msg.author.id, "opts-parser", "normal")

        let [opts, args2] = ({
            "with-negate": getOptsWithNegate,
            unix: getOptsUnix,
            normal: getOpts
        }[optParser] ?? getOpts)(args);

        if (fs.existsSync(`./src/bircle-bin/${cmd}.bircle`)) {
            return this.runBircleFile(cmd, args)
        }

        if (opts['?']) {
            args = [cmd]
            args2 = [cmd]
            cmd = "help"
            this.aliasV2 = false
        }

        let cmdObject: Command | CommandV2 | AliasV2 | undefined = commands.get(cmd) || getAliasesV2()[cmd]

        if (!cmdObject) {
            //We dont want to keep running commands if the command doens't exist
            //fixes the [[[[[[[[[[[[[[[[[ exploit
            if (cmd.startsWith(common.prefix)) {
                cmd = `\\${cmd}`
            }
            rv = user_options.getOpt(this.#msg.author.id, "error-on-no-cmd", "true") === "true" ?
                { content: `${cmd} does not exist`, status: StatusCode.ERR } :
                { noSend: true, status: StatusCode.ERR }
        }
        else runnerIf: {
            //make sure it passes the command's perm check if it has one
            if (!(cmdObject instanceof AliasV2) && !common.WHITELIST[this.#msg.author.id]?.includes(cmd) && cmdObject?.permCheck && !cmdObject.permCheck(this.#msg)) {
                rv = { content: "You do not have permissions to run this command", status: StatusCode.ERR }
                break runnerIf
            }

            if (warn_categories.includes(cmdCatToStr(cmdObject?.category)) || (!(cmdObject instanceof AliasV2) && cmdObject?.prompt_before_run === true) || warn_cmds.includes(cmd)) {
                let m = await promptUser(this.#msg, `You are about to run the \`${cmd}\` command with args \`${this.args.join(" ")}\`\nAre you sure you want to do this **(y/n)**`)
                if (!m || m.content.toLowerCase() !== 'y') {
                    rv = { content: `Declined to run ${cmd}`, status: StatusCode.RETURN }
                    break runnerIf
                }
            }

            //if any are true, the user cannot run the command
            if (
                //is blacklisted
                common.BLACKLIST[this.#msg.author.id]?.includes(cmd) ||
                //is disabled from the caller
                this.disable?.commands && this.disable.commands.includes(cmd) ||
                this.disable?.commands && this.disable.categories?.includes(cmdObject?.category) ||
                //is a stage channel
                !isMsgChannel(this.#msg.channel)

            ) {
                break runnerIf;
            }

            events.botEvents.emit(events.CmdRun, this)

            if (this.#shouldType || cmdObject.make_bot_type)
                await this.#msg.channel.sendTyping()

            if (!this.context.options['no-int-cache'] && cmdObject.use_result_cache === true && Interpreter.resultCache.get(`${cmd} ${this.args}`)) {
                rv = Interpreter.resultCache.get(`${cmd} ${this.args}`)
            }

            else if (cmdObject?.cmd_std_version == 2) {
                let argList = new ArgList(args2)
                let argShapeResults: Record<string, any> = {}
                let obj: CommandV2RunArg = {
                    msg: this.#msg,
                    rawArgs: args,
                    args: argList,
                    sendCallback: this.sendCallback ?? this.#msg.channel.send.bind(this.#msg.channel),
                    recursionCount: this.recursion,
                    commandBans: typeof rv.recurse === 'object' ? rv.recurse : undefined,
                    opts: new Options(opts),
                    rawOpts: opts,
                    argList: argList,
                    stdin: this.#pipeData,
                    pipeTo: this.#pipeTo,
                    interpreter: this,
                    argShapeResults
                };
                let cmdO = cmdObject as CommandV2
                if (cmdO.argShape) {
                    argList.beginIter()
                    for await (const [result, type, optional, default_] of cmdO.argShape(argList, this.#msg)) {
                        if (result === BADVALUE && !optional) {
                            rv = { content: `Expected ${type}\nUsage: ${generateCommandSummary(cmd, cmdO)}`, status: StatusCode.ERR }
                            break runnerIf;
                        }
                        else if (result === BADVALUE && default_ !== undefined) argShapeResults[type] = default_
                        else argShapeResults[type] = result
                    }
                }
                rv = await cmdO.run.bind([cmd, cmdO])(obj)
            }
            else if (cmdObject instanceof AliasV2) {
                rv = await cmdObject.run({ msg: this.#msg, rawArgs: args, sendCallback: this.sendCallback, opts, args: new ArgList(args2), recursionCount: this.recursion, commandBans: this.disable, stdin: this.#pipeData, modifiers: this.modifiers, context: this.context, returnJson: this.returnJson }) as CommandReturn
            }
            else {
                rv = await (cmdObject as Command).run(this.#msg, args, this.sendCallback ?? this.#msg.channel.send.bind(this.#msg.channel), opts, args2, this.recursion, typeof rv.recurse === "object" ? rv.recurse : undefined)
            }
            if (cmdObject?.use_result_cache === true) {
                Interpreter.resultCache.set(`${cmd} ${this.args}`, rv)
            }
            //it will double add this if it's an alias
            if (!this.aliasV2) {
                globals.addToCmdUse(cmd)
            }
        }

        //the point of explicit is to say which command is currently being run, and which "line number" it's on
        if (this.context.options.explicit) {
            if (rv.content) {
                rv.content = `${this.context.env.LINENO}\t${args.join(" ")}\n${rv.content}`
            }
            else rv.content = `${this.context.env.LINENO}\t${args.join(" ")}`
        }

        //illegalLastCmds is a list that stores commands that shouldn't be counted as last used, !!, and spam
        if (!illegalLastCmds.includes(cmd)) {
            //this is for the !! command
            lastCommand[this.#msg.author.id] = `[${cmd} ${this.args.join(" ")}`
        }
        if (this.returnJson) {
            return rv
        }
        //handles the rv protocol
        await handleSending(this.#msg, rv, this.sendCallback, this.recursion + 1)
    }

    async interprateAsToken(token: Token, t: T) {
        return await this[t](token)
    }
    async interprateCurrentAsToken(t: T) {
        return await this[t](this.#curTok as Token)
    }

    async interprateAllAsToken(t: T) {
        while (this.advance()) {
            let tokList = await this.interprateCurrentAsToken(t)
            if (tokList && tokList.length) {
                for (let tok of tokList) {
                    this.addTokenToArgList(tok)
                }
            }
        }
    }

    async handlePipes(commandReturn: CommandReturn) {
        let tks = this.getPipeTo()
        let allowedMentions = commandReturn.allowedMentions
        //if noSend is given, we dont want to pipe it
        while (tks.length && !commandReturn.noSend) {
            //we cant return json or it will double pipe
            let int = new Interpreter(this.#msg, tks, {
                modifiers: this.modifiers,
                recursion: this.recursion,
                returnJson: true,
                disable: this.disable,
                pipeData: commandReturn,
                context: this.context
            })

            await int.interprate()

            commandReturn = defileCommandReturn(await int.run() as CommandReturn)

            if (allowedMentions) {
                //not sure the best way to combine 2 allowedMentions (new commandReturn + oldCommandReturn), so we're just going to set it to none
                commandReturn.allowedMentions = { parse: [] }
            }
            tks = int.getPipeTo()
        }
        return commandReturn
    }

    async interprate() {
        if (this.#interprated) {
            return this.args
        }

        let tokList
        while (this.advance() && (tokList = await this.interprateCurrentAsToken((this.#curTok as Token).type))) {
            for (let tok of tokList) {
                this.addTokenToArgList(tok)
            }
        }

        //null comes from %{-1}doFirsts
        this.args = this.args.filter(v => v !== null)

        //undefined can get in args if {token} format is used, and they want a command token
        let lastUndefIdx = this.args.lastIndexOf(Interpreter.commandUndefined as string)

        //if it is found
        if (lastUndefIdx > -1) {
            //we basically treat everythign before it as if it didn't happen
            this.args = this.args.splice(lastUndefIdx + 1)
        }

        this.#interprated = true

        let intPipeData = this.getPipeTo()

        //if the pipe is open, all calls to handleSending, and returns should run through the pipe
        if (intPipeData.length) {
            this.sendCallback = (async function(this: Interpreter, options: string | MessageCreateOptions | MessagePayload) {
                options = defileCommandReturn(options as CommandReturn) as typeof options
                options = await this.handlePipes(options as CommandReturn) as typeof options
                return handleSending(this.#msg, options as CommandReturn, undefined)
            }).bind(this)
        }
        return this.args
    }

    static async handleMatchCommands(msg: Message, content: string, enableUserMatch?: boolean, recursion?: number) {

        let matchCommands = getMatchCommands()
        for (let cmd in matchCommands) {
            let obj = matchCommands[cmd]
            let match = content.match(obj.match)
            if (match?.[0]) {
                return handleSending(msg, await obj.run({ msg, match }))
            }
        }
        if (!enableUserMatch) {
            return false
        }
        let userMatchCmds = common.getUserMatchCommands()?.get(msg.author.id) ?? []
        for (let [_name, [regex, run]] of userMatchCmds) {
            let m = content.match(regex);
            if (!m) continue;

            const argsRegex = /^(match\d+)$/
            let innerPairs = getInnerPairsAndDeafultBasedOnRegex(run, ["match"], argsRegex)

            let tempExec = run

            for (let [match, or] of innerPairs) {
                let innerText = `{${match}${or}}`
                or = or.stripStart("|")
                let n = Number(match.slice("match".length))
                tempExec = tempExec.replace(innerText, m[n] ?? or)
            }

            try {
                await cmd({ msg, command_excluding_prefix: tempExec, recursion: 0 })
            }
            catch (err) {
                console.error(err)
                if (isMsgChannel(msg.channel)) await msg.channel.send({ content: `Command failure: **${cmd}**\n\`\`\`${err}\`\`\`` })
            }
        }
    }
}

function defileCommandReturn(rv: CommandReturn) {
    //if a file contains content that was previously supposed to be sent to chat, dont keep in file
    for (let i = 0; i < (rv.files?.length ?? 0); i++) {
        if (rv.files?.[i].wasContent) {
            rv.content = rv.files[i].wasContent
            rv.files = rv.files.filter((_v, idx) => idx !== i)
        }
    }
    return rv
}

function cmdUserExpansion(msg: Message, rv: CommandReturn) {
    let optionToGet: user_options.UserOption = ({
        [StatusCode.ERR]: "change-cmd-error",
        [StatusCode.INFO]: "change-cmd-info",
        [StatusCode.PROMPT]: "change-cmd-prompt",
        [StatusCode.RETURN]: "change-cmd-return",
        [StatusCode.WARNING]: "change-cmd-warning"
    } as { [key: number]: user_options.UserOption })[rv.status] as user_options.UserOption

    let opt = user_options.getOpt(msg.author.id, optionToGet, "")

    if (opt === "") return rv;

    rv.content = opt
    if (rv.recurse && rv.recurse !== true) {
        //if rv specified different bans, we want those to take priority
        rv.recurse = { ...rv.recurse }
    }
    else {
        rv.recurse = true
    }
    rv.do_change_cmd_user_expansion = false

    return rv
}

export async function handleSending(msg: Message, rv: CommandReturn, sendCallback?: (data: MessageCreateOptions | MessagePayload | string) => Promise<Message>, recursion = 0): Promise<Message> {

    if (!isMsgChannel(msg.channel)) return msg

    if (!Object.keys(rv).length) {
        return msg
    }

    events.botEvents.emit(events.HandleSend, msg, rv, sendCallback, recursion)

    if (!sendCallback) {
        sendCallback = rv.sendCallback ||
            rv.channel?.send.bind(rv.channel) ||
            msg.channel.send.bind(msg.channel)
    }

    if (rv.delete && msg.deletable) {
        msg.delete().catch(_err => console.log("Message not deleted"))
    }

    if (rv.noSend) {
        return msg
    }

    if (rv.content && rv.do_change_cmd_user_expansion !== false) {
        rv = cmdUserExpansion(msg, rv)
    }

    if (!rv?.content) {
        //if content is empty string, delete it so it shows up as undefined to discord, so it wont bother trying to send an empty string
        delete rv['content']
    }
    //only do this if content
    else if (recursion < globals.RECURSION_LIMIT && rv.recurse && rv.content.slice(0, common.prefix.length) === common.prefix) {
        let do_change_cmd_user_expansion = rv.do_change_cmd_user_expansion

        let ret = await cmd({ msg, command_excluding_prefix: rv.content.slice(common.prefix.length), recursion: recursion + 1, returnJson: true, disable: rv.recurse === true ? undefined : rv.recurse })

        rv = ret.rv

        //we only want to override it if the command doens't explicitly want to do it
        if (rv.do_change_cmd_user_expansion !== true && do_change_cmd_user_expansion === false) {
            rv.do_change_cmd_user_expansion = do_change_cmd_user_expansion
        }
        //
        //it's better to just recursively do this, otherwise all the code above would be repeated
        return await handleSending(msg, rv, sendCallback, recursion + 1)
    }
    //if the content is > 2000 (discord limit), send a file instead
    if ((rv.content?.length || 0) >= 2000) {
        let oldContent = rv.content
        if (rv.onOver2kLimit) {
            rv = rv.onOver2kLimit(msg, rv)
        }
        let fn = `./garbage-files/${msg.author.id}-${msg.id}`
        fs.writeFileSync(fn, rv.content as string)
        let extension = rv.mimetype ? mimeTypeToFileExtension(rv.mimetype) || "txt" : "txt"
        rv.files = (rv.files ?? []).concat([{ attachment: fn, name: `cmd.${extension}`, description: "command output too long", wasContent: oldContent }])
        delete rv["content"]
    }
    let newMsg
    try {
        newMsg = await sendCallback(rv as MessageCreateOptions)
    }
    catch (err) {
        //usually happens when there is nothing to send
        console.log(err)
        newMsg = await sendCallback({ content: `${err}` })
    }
    return newMsg
}

export function createHelpArgument(description: string, required?: boolean, requires?: string, default_?: string) {
    return {
        description: description,
        required: required,
        requires: requires,
        default: default_
    }
}

export function createHelpOption(description: string, alternatives?: string[], default_?: string) {
    return {
        description: description,
        alternatives: alternatives,
        default: default_
    }
}

export function createMatchCommand(run: MatchCommand['run'], match: MatchCommand['match'], name: MatchCommand['name'], help?: MatchCommand['help']): MatchCommand {
    return {
        run: run,
        match: match,
        name: name,
        help: help,
        category: CommandCategory.MATCH
    }
}

export function createCommandV2(
    cb: CommandV2Run,
    category: CommandCategory,
    helpInfo?: string,
    helpArguments?: CommandHelpArguments | null,
    helpOptions?: CommandHelpOptions | null,
    tags?: string[] | null,
    permCheck?: (m: Message) => boolean,
    shouldType?: boolean,
    use_result_cache?: boolean): CommandV2 {
    return {
        run: cb,
        help: {
            info: helpInfo,
            arguments: helpArguments ? helpArguments : undefined,
            options: helpOptions ? helpOptions : undefined,
            tags: tags ? tags : undefined
        },
        category: category,
        permCheck: permCheck,
        make_bot_type: shouldType,
        cmd_std_version: 2,
        use_result_cache: use_result_cache
    }
}

//this funky type modifies each key in CommandReturn with the following transformation function:
//  f(key) = key?: CommandReturn[key]
//  essentially it makes every key optional
/**
    * @description crv: stands for: commandReturnValue
*/
export function crv(content: string, options?: { [K in keyof CommandReturn]?: CommandReturn[K] }, status = StatusCode.RETURN): CommandReturn {
    return {
        content,
        status: options?.status ?? status,
        mimetype: options?.mimetype ?? "plain/text",
        ...options
    }
}

export function ccmdV2(cb: CommandV2Run, helpInfo: string, options?: {
    category?: CommandCategory,
    helpArguments?: CommandHelpArguments,
    helpOptions?: CommandHelpOptions,
    tags?: string[],
    docs?: string,
    permCheck?: (m: Message) => boolean,
    shouldType?: boolean,
    use_result_cache?: boolean,
    accepts_stdin?: CommandHelp['accepts_stdin'],
    prompt_before_run?: boolean,
    argShape?: CommandV2['argShape']
}): CommandV2 {
    return {
        run: cb,
        help: {
            info: helpInfo,
            docs: options?.docs,
            arguments: options?.helpArguments,
            options: options?.helpOptions,
            tags: options?.tags,
            accepts_stdin: options?.accepts_stdin
        },
        category: options?.category,
        permCheck: options?.permCheck,
        make_bot_type: options?.shouldType,
        cmd_std_version: 2,
        use_result_cache: options?.use_result_cache,
        prompt_before_run: options?.prompt_before_run,
        argShape: options?.argShape
    }

}

export function generateDefaultRecurseBans() {
    return { categories: [CommandCategory.GAME, CommandCategory.ADMIN], commands: ["sell", "buy", "bitem", "bstock", "bpet", "option", "!!", "rccmd", "var", "expr", "do", "runas"] }
}

export let commands: Map<string, (Command | CommandV2)> = new Map()
export let matchCommands: { [key: string]: MatchCommand } = {}

export function registerCommand(name: string, command: Command | CommandV2, cat: CommandCategory) {
    if (!command.category) {
        command.category = cat
    }
    if (!command.help?.info) {
        console.warn(name, `(${cmdCatToStr(command.category)})`, "does not have help")
    }
    commands.set(name, command)
}

export function registerMatchCommand(command: MatchCommand) {
    command.category = CommandCategory.MATCH
    Reflect.set(matchCommands, command.name, command)
}

export function getCommands() {
    return commands
}

export function getMatchCommands() {
    return matchCommands
}

export function getAliasesV2(refresh?: boolean) {
    if (refresh) {
        aliasesV2 = createAliasesV2()
    }
    return aliasesV2
}

export default {
    StatusCode,
    statusCodeToStr,
    CommandCategory,
    promptUser,
    AliasV2,
    lastCommand,
    snipes,
    purgeSnipe,
    currently_playing,
    setCurrentlyPlaying,
    illegalLastCmds,
    createAliasesV2,
    aliasesV2,
    isCmd,
    createCommandV2,
    crv,
    ccmdV2,
    generateDefaultRecurseBans,
    commands,
    matchCommands,
    registerCommand,
    registerMatchCommand,
    getCommands,
    getMatchCommands,
    getAliasesV2,
    cmd,
    handleSending,
    Interpreter,
    PIDS
}
