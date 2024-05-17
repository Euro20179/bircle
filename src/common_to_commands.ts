import { APIButtonComponent, ActionRowBuilder, AwaitMessagesOptions, ButtonBuilder, ButtonComponentData, ButtonInteraction, ButtonStyle, Collection, DMChannel, EmbedBuilder, Guild, Message, MessageCreateOptions, MessageFlagsBitField, MessageMentions, MessagePayload, MessageType, PartialMessage, ReactionManager, TextChannel, User } from 'discord.js';
import fs from 'fs'


import user_options  from "./user-options"
import common from './common';
import { getInnerPairsAndDeafultBasedOnRegex } from './parsing';
import { cmdCatToStr, isMsgChannel, isBetween, getToolIp, valuesOf } from './util';

import { parseBracketPair } from './parsing'

import cmds, { RuntimeOptions, SymbolTable } from './command-parser/cmds';
import globals from './globals';
import useTracker from './use-tracker';
import amountParser from './amount-parser';

function createFakeMessage(author: User, channel: DMChannel | TextChannel, content: string, guild: Guild | null = null) {
    //@ts-ignore
    let msg: Message = {
        activity: null,
        applicationId: String(common.client.user?.id),
        id: "_1033110249244213260",
        attachments: new Collection(),
        author: author,
        channel: channel,
        channelId: channel.id,
        cleanContent: content as string,
        components: [],
        content: content as string,
        createdAt: new Date(Date.now()),
        createdTimestamp: Date.now(),
        crosspostable: false,
        deletable: false,
        editable: false,
        editedAt: null,
        editedTimestamp: null,
        embeds: [],
        flags: new MessageFlagsBitField(),
        groupActivityApplication: null,
        guild: guild,
        guildId: guild?.id || null,
        hasThread: false,
        interaction: null,
        member: null,
        mentions: {
            parsedUsers: new Collection(),
            channels: new Collection(),
            crosspostedChannels: new Collection(),
            everyone: false,
            members: null,
            repliedUser: null,
            roles: new Collection(),
            users: new Collection(),
            has: (_data: any, _options: any) => false,
            _parsedUsers: new Collection(),
            _channels: null,
            _content: content as string,
            _members: null,
            client: common.client,
            guild: guild,
            toJSON: () => {
                return {}
            }
        } as unknown as MessageMentions,
        nonce: null,
        partial: false,
        pinnable: false,
        pinned: false,
        position: null,
        reactions: new Object() as ReactionManager,
        reference: null,
        stickers: new Collection(),
        system: false,
        thread: null,
        tts: false,
        type: MessageType.Default,
        url: "http://0.0.0.0",
        webhookId: null,
        bulkDeletable: false,
        roleSubscriptionData: null,
        _cacheType: false,
        _patch: (_data: any) => { }
    }
    Object.defineProperty(msg, "client", {
        enumerable: false,
        value: common.client
    })
    return msg
}

export class PagedEmbed {
    msg: Message
    embeds: EmbedBuilder[]
    id: string
    buttonOrder: string[]
    button_data: {
        [key: string]: {
            button_data: Partial<ButtonComponentData>,
            page?: number,
            cb?: (this: PagedEmbed, int: ButtonInteraction, m: Message) => any
        }
    }
    #currentPage: number = 0
    constructor(msg: Message, embeds: EmbedBuilder[], id: string, add_std_buttons = true) {
        this.msg = msg
        this.embeds = embeds
        this.id = id
        this.button_data = {}
        this.buttonOrder = []

        if (add_std_buttons) {
            this.addButton(`back`, {
                customId: `${this.id}.back:${msg.author.id}`, label: "BACK", style: ButtonStyle.Secondary
            })
            this.addButton(`next`, {
                customId: `${this.id}.next:${msg.author.id}`, label: "NEXT", style: ButtonStyle.Primary
            })
        }
    }

    private get currentEmbed() {
        return this.embeds[this.#currentPage]
    }

    get page() {
        return this.#currentPage
    }

    get pages() {
        return this.embeds.length
    }

    get currentPage() {
        return this.#currentPage
    }

    next() {
        this.#currentPage++;
    }

    back() {
        this.#currentPage--;
    }

    goto_start() {
        this.#currentPage = 0
    }

    removeButtonIfExists(action: string) {
        if (this.buttonExists(action)) {
            this.removeButton(action)
            return true
        }
        return false
    }

    removeButton(action: string) {
        this.buttonOrder = this.buttonOrder.filter(v => v !== `${this.id}.${action}`)
        delete this.button_data[`${this.id}.${action}`]
    }

    buttonExists(action: string) {
        if (this.button_data[`${this.id}.${action}`]) {
            return true
        }
        return false
    }

    addButton(action: string, data: Partial<ButtonComponentData> | Partial<APIButtonComponent>, cb?: PagedEmbed['button_data'][string]['cb'], page?: number) {
        this.buttonOrder.push(`${this.id}.${action}`)
        this.button_data[`${this.id}.${action}`] = {
            button_data: data,
            cb,
            page
        }
    }

    insertButton(spot: size_t, action: string, data: Partial<ButtonComponentData> | Partial<APIButtonComponent>, cb?: PagedEmbed['button_data'][string]['cb'], page?: number) {
        this.buttonOrder.splice(spot, 0, `${this.id}.${action}`)
        this.button_data[`${this.id}.${action}`] = {
            button_data: data,
            cb,
            page
        }
    }

    createActionRow() {
        let row = new ActionRowBuilder<ButtonBuilder>()

        for (let id of this.buttonOrder) {
            if (this.button_data[id].page !== undefined && this.button_data[id].page !== this.#currentPage) continue
            let b = new ButtonBuilder(this.button_data[id].button_data)
            row.addComponents(b)
        }
        return row
    }

    async begin(_sendcallback?: CommandReturn['sendCallback']) {
        let m = await cmds.handleSending(this.msg, { components: [this.createActionRow()], embeds: [this.currentEmbed], status: StatusCode.INFO })

        let msgCollector = m.channel.createMessageCollector({ filter: newM => newM.author.id === this.msg.author.id })
        let mCollectorTo = setTimeout(msgCollector.stop.bind(msgCollector), 60000)
        msgCollector.on("collect", newM => {
            mCollectorTo = setTimeout(msgCollector.stop.bind(msgCollector), 60000)
            if(newM.content === "stop"){
                msgCollector.stop()
                clearTimeout(mCollectorTo)
                clearTimeout(to)
                collector.stop()
                return
            }
            else if(newM.content.startsWith("!")){
                const res = amountParser.runRelativeCalculator(this.pages, newM.content.slice(1)) as number
                this.#currentPage = res - 1
            }
            else {
                let n = Number(newM.content)
                if (isNaN(n) || !isBetween(0, n, this.pages + 1)) {
                    return
                }
                this.#currentPage = n - 1
            }
            if (newM.deletable) newM.delete().catch(console.error)
            m.edit({ components: [this.createActionRow()], embeds: [this.currentEmbed] }).catch(console.error)
        })

        let collector = m.createMessageComponentCollector({ filter: int => int.user.id === this.msg.author.id })

        let to = setTimeout(collector.stop.bind(collector), 60000)

        collector.on("collect", async (int) => {
            clearTimeout(to)
            to = setTimeout(collector.stop.bind(collector), 60000)

            if (int.customId.startsWith(`${this.id}.next`)) {
                this.next()
                if (this.#currentPage >= this.pages) {
                    this.goto_start()
                }
            }

            else if (int.customId.startsWith(`${this.id}.back`)) {
                this.back()
                if (this.#currentPage < 0) {
                    this.goto_start()
                }
            }
            else {
                let bd = this.button_data[int.customId.split(":")[0]]
                if (bd) {
                    bd.cb?.bind(this)(int as ButtonInteraction, m)
                }
            }

            await m.edit({ components: [this.createActionRow()], embeds: [this.currentEmbed] })
            try {
                await int.deferUpdate()
            }
            catch (err) {
                //interaction agknowledged
                console.error(err)
            }
        })
    }
}

export const StatusCode = {
    CHECKIN: -4,
    ACHIEVEMENT: -3,
    PROMPT: -2,
    INFO: -1,
    RETURN: 0,
    WARNING: 1,
    ERR: 2,
    CMDSTATUS: 3, //implies that the statusNo return value is set, which is the real status code
               //works more like unix commands, where the command can decide the exit code, 0 being sccess
                //1+ being some cmd designated error
                //${stdin:status} will be set to the statusNo if statusCode is CMDSTATUS
                //defaults 0, if there's an error the command is expected to use a number 101 or larger
    //          //4-99 are reserved
    //          //also sets the ${%:?} var
} as const

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

export async function promptUser(msg: Message, prompt?: string, sendCallback?: (data: MessageCreateOptions | MessagePayload | string) => Promise<Message>, options?: { timeout?: milliseconds_t, filter?: AwaitMessagesOptions['filter'] }): Promise<Message<boolean> | false> {
    if (!isMsgChannel(msg.channel)) return false
    if (prompt)
        await cmds.handleSending(msg, { content: prompt, status: StatusCode.PROMPT }, sendCallback)
    let msgs = await msg.channel.awaitMessages({ filter: options?.filter || (m => m.author.id === msg.author.id), time: options?.timeout || 30000, max: 1 })
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

    basicPrepare(args: string[], opts: Opts) {
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

    prepare(args: string[], opts: Opts, fillPlaceholders = false) {
        let tempExec = this.exec

        if (!fillPlaceholders) {
            return this.basicPrepare(args, opts)
        }

        //FIXME: opts is not part of args.., add a seperate one for `opts..` (we dont need others becasue of the variables)
        const argsRegex = /^(?:args\.\.|args\d+|args\d+\.\.|args\d+\.\.\d+|#args\.\.|args\[\d*\])$/

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

    async *run({ msg, rawArgs: _rawArgs, sendCallback, opts, args, commandBans: _commandBans, symbols, runtime_opts }: { msg: Message<boolean>, rawArgs: ArgumentList, sendCallback?: (data: MessageCreateOptions | MessagePayload | string) => Promise<Message>, opts: Opts, args: ArgumentList, recursionCount: number, commandBans?: { categories?: CommandCategory[], commands?: string[] }, stdin?: CommandReturn, context?: InterpreterContext, symbols?: SymbolTable, runtime_opts: RuntimeOptions }) {

        let tempExec = ""
        let lastCmd = ""

        for(let opt in opts){
            symbols?.set(`%:-${opt}`, String(opts[opt]))
        }

        //this.name does not get added to cmdUse in the events if it's legacy
        await this.expand(args, opts, ((a, preArgs) => {
            useTracker.cmdUsage.addToUsage(a)
            lastCmd = a
            tempExec = `${preArgs}`
        }))

        if (lastCmd === this.name) {
            return { content: `Failed to expand ${this.name} (infinitely recursive)` }
        }

        //if this doesnt happen it will be added twice because of the fact that running it will add it again
        useTracker.cmdUsage.removeFromUsage(lastCmd)

        const optsThatNeedStandardizing = [
            ["pipe-symbol", ">pipe>"],
            ["1-arg-string", ""],
            ["opts-parser", "normal"],
            ["and-symbol", ">and>"],
            ["or-symbol", ">or>"]
        ] as const
        let oldOpts = optsThatNeedStandardizing.map(([name, def]) => [name, user_options.getOpt(msg.author.id, name, def)])

        if (this.standardizeOpts) {
            for (let [name, def] of optsThatNeedStandardizing) {
                user_options.setOpt(msg.author.id, name, def)
            }
        }

        runtime_opts.set("disableCmdConfirmations", false)

        //it is not possible to fix double interpretation
        //we dont know if the user gave the args and should only be interpreted or if the args are from the alias and should be double interpreted
        //
        //The fact that we are returning json here means that if a command in an alias exceeds the 2k limit, it will not be put in a file
        //the reason for this is that handleSending is never called, and handleSending puts it in a file
        for await (
            let result of
            globals.PROCESS_MANAGER.spawn_cmd({ command: `(PREFIX)${tempExec}`, prefix: "(PREFIX)", msg, sendCallback, symbols, runtime_opts }, `${this.name}(SUB)`,)
        ) {
            yield result
        }

        //MIGHT BE IMPORTANT IF RANDOM ALIAS ISSUES HAPPEN
        //IT IS COMMENTED OUT BECAUSE ALIAISES CAUSE DOUBLE PIPING

        // if(interpreter?.sendCallback)
        //     rv.sendCallback = interpreter?.sendCallback

        if (this.standardizeOpts) {
            for (let [name, val] of oldOpts) {
                user_options.setOpt(msg.author.id, name, val)
            }
        }
    }
    toJsonString() {
        return JSON.stringify({ name: this.name, exec: this.exec, help: this.help, creator: this.creator, appendOpts: this.appendOpts, appendArgs: this.appendArgs })
    }


    async expand(args: string[], opts: Opts, onExpand?: (alias: string, preArgs: string) => any, fillPlaceholders = true): Promise<AliasV2 | false> {
        let expansions = 0
        let command = this.exec.split(" ")[0]
        let preArgs = this.prepare(args, opts, fillPlaceholders)
        if (onExpand && !onExpand?.(command, preArgs)) {
            return false
        }
        let curAlias: AliasV2;
        while (curAlias = aliasesV2[command]) {
            expansions++;
            if (expansions > 1000) {
                return false
            }
            preArgs = curAlias.prepare(preArgs.split(" ").slice(1), opts, fillPlaceholders)
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
export function clearSnipes() {
    snipes = []
}
export let purgeSnipe: (Message | PartialMessage)[] = [];

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
    return !text.match(/^\[.*\]\((?:https?|discord):\/\/\S*\).?/) && text.slice(0, prefix.length) === prefix
}

export async function handleUserMatchCommands(msg: Message, content: string) {
    let userMatchCmds = common.getUserMatchCommands()?.get(msg.author.id) ?? []
    for (let [name, [regex, run]] of userMatchCmds) {
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
            await cmds.handleSending(msg, (await globals.PROCESS_MANAGER.spawn_cmd_then_die({ msg, command: tempExec, prefix: "" })))
        }
        catch (err) {
            console.error(err)
            if (isMsgChannel(msg.channel)) await msg.channel.send({ content: `Command failure: **${name}**\n\`\`\`${censor_error(err as Error)}\`\`\`` })
        }
    }
}

export async function handleMatchCommands(msg: Message, command_excluding_prefix: string, enableUserMatch: boolean) {
    if(msg.author.bot){
        return false
    }
    let matchCommands = getMatchCommands()
    for (let obj of valuesOf(matchCommands)) {
        let match = command_excluding_prefix.match(obj.match)
        if (match?.[0]) {
            return cmds.handleSending(msg, await obj.run({ msg, match }))
        }
    }
    if (enableUserMatch) {
        return handleUserMatchCommands(msg, command_excluding_prefix)
    }
    return false
}

type InterpreterOptionNames = "dryRun" | "explicit" | "no-int-cache" | "silent"
type InterpreterOptions = { [K in InterpreterOptionNames]?: number }

type InterpreterEnv = Record<string, string>

/*
    This class is not simply part of Interpreter because it can be reused between Interpreters to keep specific information

    information such as environment variables which should carry between interpreters if the interpreter spawns a subprocess or any othe reason.

    the main use of this is for the cmd() function which carries the context between different commands
*/
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

function censor_error(err: Error) {
    let ip = getToolIp()
    return err.toString().replaceAll(ip as string, "")
}

export function createHelpArgument(description: string, required?: boolean, requires?: string, default_?: string) {
    return {
        description: description,
        required: required,
        requires: requires,
        default: default_
    }
}

export const helpArg = createHelpArgument

export function createHelpOption(description: string, alternatives?: string[], default_?: string, takes_value?: boolean): CommandHelpOptions[string] {
    return {
        description: description,
        alternatives: alternatives,
        default: default_,
        takes_value
    }
}
export function cho(description: string, takes_value?: boolean, default_?: string, alternatives?: string[]){
    return {
        description,
        alternatives,
        default: default_,
        takes_value
    }
}

export const helpOpt = createHelpOption

export function createMatchCommand(run: MatchCommand['run'], match: MatchCommand['match'], name: MatchCommand['name'], help?: MatchCommand['help']): MatchCommand {
    return {
        run: run,
        match: match,
        name: `match:${name}`,
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
    use_result_cache?: boolean,
    can_run_on_web?: boolean): CommandV2 {
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
        use_result_cache: use_result_cache,
        can_run_on_web
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

function cre(content: string, options?: { [K in keyof CommandReturn] ?: CommandReturn[K] }, status = StatusCode.ERR): CommandReturn {
    return {
        content,
        status: options?.status ?? status,
        mimetype: options?.mimetype ?? "plain/text",
        ...options
    }
}

export function crvFile(fp: string, name: string, description?: string, delete_: boolean = false) {
    return { attachment: fp, name, description, delete: delete_ }
}

export function ccmdV2(cb: CommandV2Run, helpInfo: string, options?: {
    category?: CommandCategory,
    helpArguments?: CommandHelpArguments,
    arguments?: CommandHelpArguments,
    helpOptions?: CommandHelpOptions,
    options?: CommandHelpOptions,
    tags?: string[],
    docs?: string,
    permCheck?: (m: Message) => boolean,
    shouldType?: boolean,
    use_result_cache?: boolean,
    accepts_stdin?: CommandHelp['accepts_stdin'],
    prompt_before_run?: boolean,
    argShape?: CommandV2['argShape'],
    can_run_on_web?: boolean,
    short_opts?: string,
    long_opts?: [string, ":"?][],
    gen_opts?: boolean
}): CommandV2 {
    if (options?.gen_opts) {
        let short_opts = options?.short_opts || ""
        let long_opts = options?.long_opts || []
        const addOpt = (opt: string, takes_value: boolean) => {
            if (opt.length === 1) {
                if (takes_value) {
                    short_opts += `${opt}:`
                }
                else short_opts += opt
            }
            else {
                if (takes_value) {
                    long_opts.push([opt, ":"])
                }
                else long_opts.push([opt])
            }
        }
        for (let opt in options.helpOptions || {}) {
            let takes_value = options.helpOptions?.[opt].takes_value
            addOpt(opt, takes_value || false)
            for (let alt of options.helpOptions?.[opt].alternatives || []) {
                addOpt(alt, takes_value || false)
            }
        }
        options.short_opts = short_opts
        options.long_opts = long_opts
    }
    return {
        run: cb,
        help: {
            info: helpInfo,
            docs: options?.docs,
            arguments: options?.arguments || options?.helpArguments,
            options: options?.options || options?.helpOptions,
            tags: options?.tags,
            accepts_stdin: options?.accepts_stdin
        },
        category: options?.category,
        permCheck: options?.permCheck,
        make_bot_type: options?.shouldType,
        cmd_std_version: 2,
        use_result_cache: options?.use_result_cache,
        prompt_before_run: options?.prompt_before_run,
        argShape: options?.argShape,
        can_run_on_web: options?.can_run_on_web,
        short_opts: options?.short_opts,
        long_opts: options?.long_opts,
    }

}

export function generateDefaultRecurseBans() {
    return { categories: [CommandCategory.GAME, CommandCategory.ADMIN], commands: ["sell", "buy", "bitem", "bstock", "bpet", "option", "!!", "rccmd", "var", "expr", "do", "runas", "archive-channel"] }
}

export let commands: Map<string, (CommandV2)> = new Map()
export let matchCommands: { [key: string]: MatchCommand } = {}

export function registerCommand(name: string, command: CommandV2, cat: CommandCategory) {
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
    censor_error,
    PagedEmbed,
    createFakeMessage,
    clearSnipes,
    handleUserMatchCommands,
    handleMatchCommands,
    cre,
}
