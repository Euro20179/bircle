import { Message, MessageOptions, MessagePayload, PartialMessage } from 'discord.js';
import fs from 'fs'

import globals = require("./globals")
import user_options = require("./user-options")
import { BLACKLIST,  delVar, getUserMatchCommands, getVar, prefix, setVar, vars, WHITELIST } from './common';
import { Parser, Token, T, Modifier, parseAliasReplacement,  RedirModifier, TypingModifier, SkipModifier } from './parsing';
import { ArgList, cmdCatToStr,  generateSafeEvalContextFromMessage, getContentFromResult, getOpts, Options, safeEval, parseBracketPair, listComprehension, mimeTypeToFileExtension, getInnerPairsAndDeafultBasedOnRegex } from './util';
import { cloneDeep } from 'lodash';

import parse_escape from './parse_escape';
import parse_format from './parse_format';


export enum StatusCode {
    PROMPT = -2,
    INFO = -1,
    RETURN = 0,
    WARNING = 1,
    ERR = 2,
}

export function statusCodeToStr(code: StatusCode) {
    return {
        [StatusCode.PROMPT]: "-2",
        [StatusCode.INFO]: "-1",
        [StatusCode.RETURN]: "0",
        [StatusCode.WARNING]: "1",
        [StatusCode.ERR]: "2"
    }[code]
}

export enum CommandCategory {
    UTIL,
    GAME,
    FUN,
    META,
    IMAGES,
    ECONOMY,
    VOICE,
    ADMIN,
    MATCH,
    ALIASV2
}

export async function promptUser(msg: Message, prompt: string, sendCallback?: (data: MessageOptions | MessagePayload | string) => Promise<Message>) {
    await handleSending(msg, { content: prompt, status: StatusCode.PROMPT }, sendCallback)
    let msgs = await msg.channel.awaitMessages({ filter: m => m.author.id === msg.author.id, time: 30000, max: 1 })
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

        for (let opt of Object.entries(opts)) {
            setVar(`-${opt[0]}`, String(opt[1]), msg.author.id)
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
            let rightIndex = right ? Number(right) : NaN
            if (!isNaN(rightIndex)) {
                let slice = args.slice(leftIndex, rightIndex)
                let text = ""
                if (!slice.length)
                    text = innerOr
                else
                    text = slice.join(" ")
                tempExec = tempExec.replace(toReplace, text)
            }
            else if (right === "") {
                let slice = args.slice(leftIndex)
                let text = ""
                if (!slice.length)
                    text = innerOr
                else
                    text = slice.join(" ")
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

    async run({ msg, rawArgs, sendCallback, opts, args, recursionCount, commandBans, stdin, modifiers }: { msg: Message<boolean>, rawArgs: ArgumentList, sendCallback?: (data: MessageOptions | MessagePayload | string) => Promise<Message>, opts: Opts, args: ArgumentList, recursionCount: number, commandBans?: { categories?: CommandCategory[], commands?: string[] }, stdin?: CommandReturn, modifiers?: Modifier[] }) {

        if (BLACKLIST[msg.author.id]?.includes(this.name)) {
            return { content: `You are blacklisted from ${this.name}`, status: StatusCode.ERR }
        }

        let tempExec = ""
        let lastCmd = ""

        globals.addToCmdUse(this.name)

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
            ["IFS", " "],
            ["pipe-symbol", ">pipe>"],
            ["1-arg-string", ""]
        ] as const
        let oldOpts = optsThatNeedStandardizing.map(([name, def]) => [name, user_options.getOpt(msg.author.id, name, def)])

        if (this.standardizeOpts) {
            for (let [name, def] of optsThatNeedStandardizing) {
                user_options.setOpt(msg.author.id, name, def)
            }
        }

        let modifierText = ""
        for (let mod of modifiers?.filter(v => !(v instanceof RedirModifier)) ?? []) {
            modifierText += mod.stringify() as string
        }

        //it is not possible to fix double interpretation
        //we dont know if the user gave the args and should only be interpreted or if the args are from the alias and should be double interpreted
        let { rv, interpreter } = await cmd({ msg, command_excluding_prefix: `${modifierText}${tempExec}`, recursion: recursionCount + 1, returnJson: true, pipeData: stdin, sendCallback: sendCallback })

        //MIGHT BE IMPORTANT IF RANDOM ALIAS ISSUES HAPPEN
        //IT IS COMMENTED OUT BECAUSE ALIAISES CAUSE DOUBLE PIPING

        // if(interpreter?.sendCallback)
        //     rv.sendCallback = interpreter?.sendCallback

        for (let opt of Object.entries(opts)) {
            delVar(`-${opt[0]}`, msg.author.id)
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

export function createAliases() {
    let a: { [key: string]: Array<string> } = {}
    let data = fs.readFileSync("command-results/alias", "utf-8")
    for (let cmd of data.split(';END')) {
        if (!cmd.trim()) continue
        let [_, ...argList] = cmd.split(":")
        let args = argList.join(":")
        args = args.trim()
        let [actualCmd, ...rest] = args.split(" ")
        actualCmd = actualCmd.trim()
        a[actualCmd] = rest
    }
    return a
}

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

export let aliases = createAliases()
export let aliasesV2 = createAliasesV2()

export function isCmd(text: string, prefix: string) {
    return text.slice(0, prefix.length) === prefix
}

export async function cmd({
    msg,
    command_excluding_prefix,
    recursion = 0,
    returnJson = false,
    disable,
    sendCallback,
    pipeData,
    enableUserMatch

}: { msg: Message, command_excluding_prefix: string, recursion?: number, returnJson?: boolean, disable?: { categories?: CommandCategory[], commands?: string[] }, sendCallback?: (options: MessageOptions | MessagePayload | string) => Promise<Message>, pipeData?: CommandReturn, returnInterpreter?: boolean, enableUserMatch?: boolean }) {
    let parser = new Parser(msg, command_excluding_prefix)
    await parser.parse()
    let rv: CommandReturn | false = { noSend: true, status: StatusCode.RETURN };
    let int;
    if (!(await Interpreter.handleMatchCommands(msg, command_excluding_prefix, enableUserMatch, recursion))) {
        let int = new Interpreter(msg, parser.tokens, parser.modifiers, recursion, returnJson, disable, sendCallback, pipeData)
        //this previously ored to false
        rv = await int.run() ?? { noSend: true, status: StatusCode.RETURN };
    }
    return {
        rv: rv,
        interpreter: int
    }
}

export class Interpreter {
    tokens: Token[]
    args: string[]
    cmd: string
    real_cmd: string
    recursion: number
    returnJson: boolean
    disable: { categories?: CommandCategory[], commands?: string[] }
    sendCallback: ((options: MessageOptions | MessagePayload | string) => Promise<Message>) | undefined
    alias: boolean | [string, string[]]
    aliasV2: false | AliasV2

    #originalTokens: Token[]

    #interprated: boolean
    #aliasExpandSuccess: boolean
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

    constructor(msg: Message, tokens: Token[], modifiers: Modifier[], recursion = 0, returnJson = false, disable?: { categories?: CommandCategory[], commands?: string[] }, sendCallback?: (options: MessageOptions | MessagePayload | string) => Promise<Message>, pipeData?: CommandReturn) {
        this.tokens = cloneDeep(tokens)
        this.#originalTokens = cloneDeep(tokens)
        this.args = []
        this.cmd = ""
        this.real_cmd = ""
        this.recursion = recursion
        this.returnJson = returnJson
        this.disable = disable ?? {}
        this.sendCallback = sendCallback
        this.alias = false
        this.aliasV2 = false

        this.#pipeData = pipeData
        this.#pipeTo = []

        this.modifiers = modifiers
        this.#i = -1
        this.#curTok = undefined
        this.#doFirstCountValueTable = {}
        this.#msg = msg
        this.#argOffset = 0
        this.#doFirstNoFromArgNo = {}
        this.#interprated = false
        this.#aliasExpandSuccess = false

        this.#shouldType = false
    }

    setTyping(bool?: boolean) {
        this.#shouldType = bool ?? true
    }

    #initializePipeDataVars() {
        if (this.#pipeData) {
            //FIXME: using stdin as prefix can lead to race condition where if 2 people run pipes at the same time, the data may get jumbled.
            //possible solution: make all prefixes user based instead of accessed globally, then have just one __global__ prefix
            setVar("content", this.#pipeData.content ?? "", "stdin", this.#msg.author.id)
            setVar("status", statusCodeToStr(this.#pipeData.status), "stdin", this.#msg.author.id)
            setVar("raw", JSON.stringify(this.#pipeData), "stdin", this.#msg.author.id)
        }
    }

    #deletePipeDataVars() {
        if (this.#pipeData) {
            delVar("content", "stdin", this.#msg.author.id)
            delVar("status", "stdin", this.#msg.author.id)
            delVar("raw", "stdin", this.#msg.author.id)
        }
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
        if (this.#curTok === undefined) {
            return false
        }
        return true
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
        this.args = this.args.slice(0, -1)
    }

    //str token
    async [0](token: Token): Promise<Token[] | false> {
        return [token]
    }
    //dofirst token
    async [1](token: Token): Promise<Token[] | false> {
        const runCmd = async (data: string) => (await cmd({
            msg: this.#msg,
            command_excluding_prefix: data,
            disable: this.disable,
            recursion: this.recursion + 1,
            returnJson: true
        })).rv
        let rv = await runCmd(token.data as string)
        let data = rv ? getContentFromResult(rv as CommandReturn, "\n").trim() : ""
        if (rv && rv.recurse && rv.content && isCmd(rv.content, prefix) && this.recursion < 20) {
            let rv2 = await runCmd(rv.content.slice(prefix.length))
            data = rv2 ? getContentFromResult(rv2 as CommandReturn, "\n").trim() : ""
        }
        this.#doFirstCountValueTable[Object.keys(this.#doFirstCountValueTable).length] = data
        this.#doFirstNoFromArgNo[token.argNo] = Object.keys(this.#doFirstCountValueTable).length - 1
        return []
    }
    //calc
    async [2](token: Token): Promise<Token[] | false> {
        let parser = new Parser(this.#msg, token.data as string, false)
        await parser.parse()
        let int = new Interpreter(this.#msg, parser.tokens, parser.modifiers, this.recursion + 1, false, this.disable)
        await int.interprate()
        token.data = int.args.join(" ")
        let t = new Token(T.str, String(safeEval(token.data, { ...generateSafeEvalContextFromMessage(this.#msg), ...vars["__global__"] }, { timeout: 1000 })), token.argNo)
        return [t]
    }
    //esc sequence
    async [3](token: Token): Promise<Token[] | false> {
        let [char, sequence] = token.data

        if (parse_escape[`escape_${char}`]) {
            return parse_escape[`escape_${char}`](token, char, sequence, this)
        }
        if (sequence) {
            return [new Token(T.str, `${char}{${sequence}}`, token.argNo)]
        }
        return [new Token(T.str, `${char}`, token.argNo)]
    }
    //fmt
    async[4](token: Token): Promise<Token[] | false> {
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
    //dofirstrepl
    async[5](token: Token): Promise<Token[] | false> {
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
    //command
    async[6](token: Token): Promise<Token[] | false> {
        if (typeof token.data === 'object') {
            token.data = token.data[0]
        }
        this.cmd = token.data as string
        this.real_cmd = token.data as string

        if (!commands.get(this.cmd) && aliases[this.cmd]) {
            let expansion = await expandAlias(this.cmd, (alias: any) => {
                globals.addToCmdUse(alias) //for every expansion, add to cmd use
                if (BLACKLIST[this.#msg.author.id]?.includes(alias)) { //make sure they're not blacklisted from the alias
                    handleSending(this.#msg, { content: `You are blacklisted from ${alias}`, status: StatusCode.ERR }, this.sendCallback, this.recursion + 1)
                    return false
                }
                return true
            })


            if (expansion) {
                this.#aliasExpandSuccess = true
                this.alias = expansion
                this.real_cmd = expansion[0]
            }
            else {
                this.alias = true
            }
        }

        else if (!commands.get(this.cmd) && getAliasesV2()[this.cmd]) {
            this.aliasV2 = aliasesV2[this.cmd]
        }

        return [new Token(T.str, Interpreter.commandUndefined as string, token.argNo)]
    }
    //syntax
    async[7](token: Token): Promise<Token[] | false> {
        let parse = new Parser(this.#msg, token.data as string, false)
        await parse.parse()
        let int = new Interpreter(this.#msg, parse.tokens, parse.modifiers, this.recursion + 1)
        let args = await int.interprate()
        return listComprehension(args, (arg, index) => new Token(T.str, index < args.length ? `${arg} ` : arg, token.argNo))
    }

    //pipe
    async[8](token: Token): Promise<Token[] | false> {
        return false
    }

    //variable
    async [9](token: Token): Promise<Token[] | false> {
        let [varName, ifNull] = token.data
        let _var = getVar(this.#msg, varName)
        if (_var === false) {
            if (ifNull) {
                return [new Token(T.str, ifNull, token.argNo)]
            }
            return [new Token(T.str, `\${${varName}}`, token.argNo)]
        }
        return [new Token(T.str, _var, token.argNo)]
    }

    hasModifier(mod: typeof Modifier) {
        return this.modifiers.filter(v => v instanceof mod).length > 0
    }

    async runAlias() {
        //alias is actually the real command
        //aliasPreArgs are the arguments taht go after the commnad
        let [alias, aliasPreArgs] = this.alias as [string, string[]]
        let content = `${alias} ${aliasPreArgs.join(" ")}`.trim()
        let oldC = content
        //aliasPreArgs.join is the command  content, args is what the user typed
        content = `${alias} ${parseAliasReplacement(this.#msg, aliasPreArgs.join(" "), this.args)}`.trim()
        if (oldC == content) {
            content += ` ${this.args.join(" ")}`
        }

        if (this.hasModifier(TypingModifier)) {
            await this.#msg.channel.sendTyping()
        }

        for (let mod of this.modifiers) {
            if (mod instanceof RedirModifier)
                continue;
            content = mod.stringify() + content
        }

        return (await cmd({ msg: this.#msg, command_excluding_prefix: content, recursion: this.recursion + 1, returnJson: true, disable: this.disable })).rv
    }

    async sendDataToVariable(place: string, name: string, _data: CommandReturn) {
        let data = _data.content
        if (data) {
            let oldData = getVar(this.#msg, name, place)
            if (oldData === false) {
                setVar(name, data, place, this.#msg.author.id)
            }
            else setVar(name, oldData + "\n" + data, place, this.#msg.author.id)
        }
        return this.#msg

    }

    async run(): Promise<CommandReturn | undefined> {
        let args = await this.interprate()
        //canRun is true if the user is not BLACKLISTED from a command
        //it is also  true if the user is WHITELISTED for a command
        let canRun = true

        //The return  value from this function
        let rv: CommandReturn = { status: StatusCode.RETURN };

        for (let mod of this.modifiers) {
            mod.modify(this)
        }

        let warn_cmds = user_options.getOpt(this.#msg.author.id, "warn-cmds", "").split(" ")
        let warn_categories = user_options.getOpt(this.#msg.author.id, "warn-categories", "").split(" ")

        let [opts, args2] = getOpts(args)

        let cmdObject: Command | CommandV2 | AliasV2 | undefined = commands.get(this.real_cmd)
        if (!cmdObject && this.aliasV2) {
            cmdObject = this.aliasV2
            this.real_cmd = this.aliasV2.name
        }

        if (opts['?']) {
            args = [this.real_cmd]
            args2 = [this.real_cmd]
            this.real_cmd = "help"
            this.aliasV2 = false
        }

        if (this.alias && this.#aliasExpandSuccess) {
            await handleSending(this.#msg, { content: `Aliasv1 is deprecated, convert \`${this.cmd}\` into an aliasv2`, status: StatusCode.WARNING })
            rv = await this.runAlias() || { content: "You found a secret", status: StatusCode.ERR }
        }
        else if (this.alias && !this.#aliasExpandSuccess) {
            rv = { content: `Failed to expand ${this.cmd}`, status: StatusCode.ERR }
        }
        else if (cmdObject) {
            //make sure it passes the command's perm check if it has one
            if (!(cmdObject instanceof AliasV2) && cmdObject?.permCheck) {
                canRun = (cmdObject as Command | CommandV2)?.permCheck?.(this.#msg) ?? true
            }

            let declined = false

            if (warn_categories.includes(cmdCatToStr(cmdObject?.category)) || (!(cmdObject instanceof AliasV2) && cmdObject?.prompt_before_run === true) || warn_cmds.includes(this.real_cmd)) {
                let m = await promptUser(this.#msg, `You are about to run the \`${this.real_cmd}\` command with args \`${this.args.join(" ")}\`\nAre you sure you want to do this **(y/n)**`)
                if (!m || (m && m.content.toLowerCase() !== 'y')) {
                    rv = { content: `Declined to run ${this.real_cmd}`, status: StatusCode.RETURN }
                    declined = true
                    canRun = false
                }
            }

            //is whitelisted
            if (WHITELIST[this.#msg.author.id]?.includes(this.real_cmd)) {
                canRun = true
            }
            //is blacklisted
            if (BLACKLIST[this.#msg.author.id]?.includes(this.real_cmd)) {
                canRun = false
            }
            if (
                this.disable?.commands && this.disable.commands.includes(this.real_cmd) ||
                this.disable?.commands && this.disable.categories?.includes(cmdObject?.category)
            ) {
                canRun = false
            }
            if (canRun) {

                if (this.#shouldType || cmdObject?.make_bot_type)
                    await this.#msg.channel.sendTyping()

                if (cmdObject?.use_result_cache === true && Interpreter.resultCache.get(`${this.real_cmd} ${this.args}`)) {
                    rv = Interpreter.resultCache.get(`${this.real_cmd} ${this.args}`)
                }

                else if (cmdObject?.cmd_std_version == 2) {
                    let obj: CommandV2RunArg = {
                        msg: this.#msg,
                        rawArgs: args,
                        args: new ArgList(args2),
                        sendCallback: this.sendCallback ?? this.#msg.channel.send.bind(this.#msg.channel),
                        recursionCount: this.recursion,
                        commandBans: typeof rv.recurse === 'object' ? rv.recurse : undefined,
                        opts: new Options(opts),
                        rawOpts: opts,
                        argList: new ArgList(args2),
                        stdin: this.#pipeData,
                        pipeTo: this.#pipeTo
                    };
                    let cmd = cmdObject as CommandV2
                    rv = await cmd.run.bind([this.real_cmd, cmd])(obj)
                }
                else if (cmdObject instanceof AliasV2) {
                    rv = await cmdObject.run({ msg: this.#msg, rawArgs: args, sendCallback: this.sendCallback, opts, args: new ArgList(args2), recursionCount: this.recursion, commandBans: this.disable, stdin: this.#pipeData, modifiers: this.modifiers }) as CommandReturn
                }
                else {
                    rv = await (cmdObject as Command).run(this.#msg, args, this.sendCallback ?? this.#msg.channel.send.bind(this.#msg.channel), opts, args2, this.recursion, typeof rv.recurse === "object" ? rv.recurse : undefined)
                }
                if (cmdObject?.use_result_cache === true) {
                    Interpreter.resultCache.set(`${this.real_cmd} ${this.args}`, rv)
                }
                //it will double add this if it's an alias
                if (!this.alias && !this.aliasV2) {
                    globals.addToCmdUse(this.real_cmd)
                }
                //if normal command, it counts as use
            }
            else if (!declined) rv = { content: "You do not have permissions to run this command", status: StatusCode.ERR }
        }
        else {
            //We dont want to keep running commands if the command doens't exist
            //fixes the [[[[[[[[[[[[[[[[[ exploit
            if (this.real_cmd.startsWith(prefix)) {
                this.real_cmd = `\\${this.real_cmd}`
            }
            if (user_options.getOpt(this.#msg.author.id, "error-on-no-cmd", "true") === "true")
                rv = { content: `${this.real_cmd} does not exist`, status: StatusCode.ERR }
            else rv = { noSend: true, status: StatusCode.ERR }
        }

        //illegalLastCmds is a list that stores commands that shouldn't be counted as last used, !!, and spam
        if (!illegalLastCmds.includes(this.real_cmd)) {
            //this is for the !! command
            lastCommand[this.#msg.author.id] = `[${this.cmd} ${this.args.join(" ")}`
        }
        if (this.returnJson) {
            return this.handlePipes(rv)
        }
        let m
        if (m = this.modifiers.filter(v => v instanceof RedirModifier)[0]?.data) {
            let [_all, place, name] = m
            let data = getVar(this.#msg, name, place)
            if (data !== false) {
                data += getContentFromResult(rv, "\n")
            }
            setVar(name, data, place, this.#msg.author.id)
            return { noSend: true, status: StatusCode.RETURN }
        }
        //handles the rv protocol
        handleSending(this.#msg, rv, this.sendCallback, this.recursion + 1)
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
            tks[0] = tks[0].convertToCommand()
            //we cant return json or it will double pipe
            let int = new Interpreter(this.#msg, tks, this.modifiers, this.recursion, false, this.disable, undefined, commandReturn)

            await int.interprate()

            //instead force sendCallback to get the result
            int.sendCallback = async (o) => {
                let obj = o as CommandReturn
                commandReturn = obj as CommandReturn
                //if a file contains content that was previously supposed to be sent to chat, dont keep in file
                for (let i = 0; i < (obj.files?.length ?? 0); i++) {
                    if (obj.files?.[i].wasContent) {
                        commandReturn.content = obj.files[i].wasContent
                        obj.files = obj.files.filter((_v, idx) => idx !== i)
                    }
                }
                return int.getMessage()
            }

            await int.run() as CommandReturn
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
        if (this.hasModifier(SkipModifier)) {
            this.advance()
            if ((this.#curTok as Token).type === T.command) {
                await this[T.command](this.#curTok as Token)
            }
            await this.interprateAllAsToken(T.str)
        }
        else {

            this.#initializePipeDataVars()

            for (let doFirst of this.tokens.slice(this.#i === -1 ? 0 : this.#i).filter(v => v.type === T.dofirst)) {
                await this[1](doFirst)
            }

            let pipeIndex = this.tokens.findIndex(v => v.type === T.pipe)

            this.tokens = this.tokens.slice(this.#i === -1 ? 0 : this.#i, pipeIndex === -1 ? undefined : pipeIndex + 1).filter(v => v.type !== T.dofirst)

            while (this.advance()) {
                if ((this.#curTok as Token).type === T.pipe) {
                    //dofirst tokens get removed, so we must filter them out here or offset errors occure
                    this.#pipeTo = this.#originalTokens.filter((v, i) => i < this.#i + 1 ? v.type !== T.dofirst : true).slice(this.#i + 1)
                    //this.returnJson = true
                    break
                }
                let tokList = await this.interprateCurrentAsToken((this.#curTok as Token).type)
                if (tokList && tokList.length) {
                    for (let tok of tokList) {
                        this.addTokenToArgList(tok)
                    }
                }
            }

            this.#deletePipeDataVars()
        }

        //null comes from %{-1}doFirsts
        this.args = this.args.filter(v => v !== null)

        //undefined can get in args if {token} format is used, and they want a command token
        let lastUndefIdx = this.args.lastIndexOf(Interpreter.commandUndefined as string)

        //if it is found
        if (lastUndefIdx > -1) {
            //we basically treat everythign before it as if it didn't happen
            this.args = this.args.slice(lastUndefIdx + 1)
        }

        this.#interprated = true

        let intPipeData = this.getPipeTo()

        //if the pipe is open, all calls to handleSending, and returns should run through the pipe
        if (intPipeData.length) {
            this.sendCallback = (async function(this: Interpreter, options: string | MessageOptions | MessagePayload) {
                options = await this.handlePipes(options as CommandReturn)
                return handleSending(this.#msg, options as CommandReturn, undefined)
            }).bind(this)
        }
        return this.args
    }

    static async handleMatchCommands(msg: Message, content: string, enableUserMatch?: boolean, recursion?: number) {
        let matchCommands = getMatchCommands()
        for (let cmd in matchCommands) {
            let obj = matchCommands[cmd]
            let match;
            if (match = content.match(obj.match)) {
                return handleSending(msg, await obj.run({ msg, match }))
            }
        }
        if (!enableUserMatch) {
            return false
        }
        let userMatchCmds = getUserMatchCommands()?.get(msg.author.id) ?? []
        for (let [_name, [regex, run]] of userMatchCmds) {
            let m;
            if (m = content.match(regex)) {
                const argsRegex = /^(match\d+)$/
                let innerPairs = getInnerPairsAndDeafultBasedOnRegex(run, ["match"], argsRegex)

                let tempExec = run

                for (let [match, or] of innerPairs) {
                    let innerText = `{${match}${or}}`
                    or = or.slice(2)
                    let n = Number(match.slice("match".length))
                    tempExec = tempExec.replace(innerText, m[n] ?? or)
                }

                try {
                    await cmd({ msg, command_excluding_prefix: tempExec, recursion: 0 })
                }
                catch (err) {
                    console.error(err)
                    await msg.channel.send({ content: `Command failure: **${cmd}**\n\`\`\`${err}\`\`\`` })
                }
            }
        }
    }
}

export async function expandAlias(command: string, onExpand?: (alias: string, preArgs: string[]) => any): Promise<[string, string[]] | false> {
    let expansions = 0
    let aliasPreArgs = aliases[command]?.slice(1)
    if (aliasPreArgs === undefined)
        return [command, []]
    command = aliases[command][0]
    if (onExpand && !onExpand?.(command, aliasPreArgs)) {
        return false
    }
    while (aliases[command]?.[0]) {
        expansions++;
        if (expansions > 1000) {
            return false
        }
        let newPreArgs = aliases[command].slice(1)
        aliasPreArgs = newPreArgs.concat(aliasPreArgs)
        command = aliases[command][0]
        if (onExpand && !onExpand?.(command, newPreArgs)) {
            return false
        }
    }
    return [command, aliasPreArgs]
}

export async function handleSending(msg: Message, rv: CommandReturn, sendCallback?: (data: MessageOptions | MessagePayload | string) => Promise<Message>, recursion = 0): Promise<Message> {
    if (!Object.keys(rv).length) {
        return msg
    }
    if (!sendCallback && rv.sendCallback) {
        sendCallback = rv.sendCallback
    }
    if (!sendCallback && rv.dm) {
        sendCallback = msg.author.send.bind(msg.author.dmChannel)
    }
    else if (!sendCallback && rv.channel) {
        sendCallback = rv.channel.send.bind(rv.channel)
    }
    else if (!sendCallback) {
        sendCallback = msg.channel.send.bind(msg.channel)
    }

    if (rv.delete && msg.deletable) {
        msg.delete().catch(_err => console.log("Message not deleted"))
    }
    if (rv.noSend) {
        //${%:?} should still be set despite nosend
        if (rv.do_change_cmd_user_expansion !== false) setVar("?", rv.status, msg.author.id)
        return msg
    }
    //we only want to do this if the return cant expand into a cmd
    if (rv.do_change_cmd_user_expansion !== false) {
        setVar("?", rv.status, msg.author.id)
        let c = getContentFromResult(rv, "\n")
        setVar("_!", c, msg.author.id)
        setVar("_!", c)
    }
    if (rv.content && rv.do_change_cmd_user_expansion !== false) {
        //if not empty, save in the _! variable


        let optionToGet: user_options.UserOption = ({
            [StatusCode.ERR]: "change-cmd-error",
            [StatusCode.INFO]: "change-cmd-info",
            [StatusCode.PROMPT]: "change-cmd-prompt",
            [StatusCode.RETURN]: "change-cmd-return",
            [StatusCode.WARNING]: "change-cmd-warning"
        } as { [key: number]: user_options.UserOption })[rv.status] as user_options.UserOption


        let opt = user_options.getOpt(msg.author.id, optionToGet, "")
        if (opt !== "") {
            rv.content = opt
            if (rv.recurse && rv.recurse !== true) {
                //if rv specified different bans, we want those to take priority
                rv.recurse = { ...rv.recurse }
            }
            else {
                rv.recurse = true
            }
            rv.do_change_cmd_user_expansion = false
        }
    }

    if (!rv?.content) {
        //if content is empty string, delete it so it shows up as undefined to discord, so it wont bother trying to send an empty string
        delete rv['content']
    }
    //only do this if content
    else if (recursion < globals.RECURSION_LIMIT && rv.recurse && rv.content.slice(0, prefix.length) === prefix) {
        let do_change_cmd_user_expansion = rv.do_change_cmd_user_expansion

        let ret = await cmd({ msg, command_excluding_prefix: rv.content.slice(prefix.length), recursion: recursion + 1, returnJson: true, disable: rv.recurse === true ? undefined : rv.recurse })

        rv = ret.rv as CommandReturn
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
        newMsg = await sendCallback(rv)
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

/**
    * @deprecated use createCommandV2
*/
export function createCommand(
    cb: (msg: Message, args: ArgumentList, sendCallback: (_data: MessageOptions | MessagePayload | string) => Promise<Message>, opts: Opts, deopedArgs: ArgumentList, recursion: number, command_bans?: { categories?: CommandCategory[], commands?: string[] }) => Promise<CommandReturn>,
    category: CommandCategory,
    helpInfo?: string,
    helpArguments?: CommandHelpArguments | null,
    helpOptions?: CommandHelpOptions | null,
    tags?: string[] | null,
    permCheck?: (m: Message) => boolean,
    use_result_cache?: boolean): Command {
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
        use_result_cache: use_result_cache,
        cmd_std_version: 1
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
    prompt_before_run?: boolean
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
        prompt_before_run: options?.prompt_before_run
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

export function getAliases(refresh?: boolean) {
    if (refresh) {
        aliases = createAliases()
    }
    return aliases
}

export function createChatCommandOption(type: number, name: string, description: string, { min, max, required }: { min?: number, max?: number | null, required?: boolean }) {
    let obj: { [key: string]: any } = {
        type: type,
        name: name,
        description: description,
        required: required || false
    }
    if (min) {
        obj["min"] = min
    }
    if (max) {
        obj["max"] = max
    }
    return obj
}

function createChatCommand(name: string, description: string, options: any) {
    return {
        name: name,
        description: description,
        options: options
    }
}

const STRING = 3
const INTEGER = 4
const USER = 6



export const slashCommands = [
    createChatCommand("attack", "attacks chris, and no one else", [createChatCommandOption(USER, "user", "who to attack", { required: true })]),
    createChatCommand("ping", "Pings a user for some time", [
        createChatCommandOption(USER, "user", "who to ping twice", { required: true }),
        createChatCommandOption(INTEGER, "evilness", "on a scale of 1 to 10 how evil are you", {})
    ]),
    createChatCommand("img", "create an image", [
        createChatCommandOption(INTEGER, "width", "width of image", { required: true, min: 0, max: 5000 }),
        createChatCommandOption(INTEGER, "height", "height of image", { required: true, min: 0, max: 5000 }),
        createChatCommandOption(STRING, "color", "color of image", {})
    ]),
    createChatCommand("rps", "Rock paper scissors", [
        createChatCommandOption(USER, "opponent", "opponent", { required: true }),
        createChatCommandOption(STRING, "choice", "choice", { required: true }),
        createChatCommandOption(STRING, "bet", "bet", { required: false })
    ]),
    createChatCommand("say", "says something", [
        createChatCommandOption(STRING, "something", "the something to say", { required: true })
    ]),
    createChatCommand("md", "say markdown", [
        createChatCommandOption(STRING, "text", "The text to say", { required: true })
    ]),
    {
        name: 'aheist',
        description: 'Add a heist response',
        options: [
            {
                type: STRING,
                name: "stage",
                required: true,
                description: "The stage (getting_in, robbing, escape)",

            },
            {
                type: STRING,
                name: "gain-or-lose",
                description: "Whether to gain or lose money",
                required: true,
                choices: [
                    {
                        name: "gain",
                        value: "GAIN",
                    },
                    {
                        name: "lose",
                        value: "LOSE",
                    }
                ]
            },
            {
                type: STRING,
                name: "users-to-gain-or-lose",
                description: "User numbers (or all) seperated by ,",
                required: true
            },
            {
                type: STRING,
                name: "amount",
                description: "The amount to gain/lose",
                required: true,
                choices: [
                    {
                        name: "none",
                        value: "none"
                    },
                    {
                        name: "normal",
                        value: "normal",
                    },
                    {
                        name: "cents",
                        value: "cents",
                    }
                ]
            },
            {
                type: STRING,
                name: "message",
                description: "The message, {user1} is replaced w/ user 1, {userall} with all users, and {amount} with amount",
                required: true
            },
            {
                type: STRING,
                name: "nextstage",
                description: "The stage to enter into after this response",
                required: false,
            },
            {
                type: STRING,
                name: "location",
                description: "The location of this response",
                required: false,
            },
            {
                type: STRING,
                name: "set-location",
                description: "The location that this response will set the game to",
                required: false
            },
            {
                type: STRING,
                name: "button-response",
                description: "Reply that happens if set-location is multiple locations",
                required: false
            },
            {
                type: STRING,
                name: "if",
                description: "This response can only happen under this condition",
                required: false
            }
        ]
    },
    createChatCommand("help", "get help", []),
    {
        name: "ping",
        type: 2
    },
    {
        name: "info",
        type: 2
    },
    {
        name: "fileify",
        type: 3
    }
]

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
    createAliases,
    createAliasesV2,
    aliases,
    aliasesV2,
    isCmd,
    expandAlias,
    createCommand,
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
    getAliases,
    createChatCommandOption,
    slashCommands,
    cmd,
    handleSending,
    Interpreter
}
