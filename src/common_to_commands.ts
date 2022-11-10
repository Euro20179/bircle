import { Message, MessageOptions, MessagePayload, PartialMessage } from 'discord.js';
import fs from 'fs'

import globals = require("./globals")
import user_options = require("./user-options")
import { BLACKLIST, prefix, setVar, vars, WHITELIST } from './common';
import { Parser, Token, T, Modifier, Modifiers, parseAliasReplacement } from './parsing';
import { cmdCatToStr, generateSafeEvalContextFromMessage, getContentFromResult, getOpts, Options, safeEval } from './util';

export enum StatusCode {
    PROMPT = -2,
    INFO = -1,
    RETURN = 0,
    WARNING = 1,
    ERR = 2,
}


export enum CommandCategory {
    UTIL,
    GAME,
    FUN,
    META,
    IMAGES,
    ECONOMY,
    VOICE,
    ADMIN
}

export let lastCommand: { [key: string]: string } = {};
export let snipes: (Message | PartialMessage)[] = [];
export let purgeSnipe: (Message | PartialMessage)[];

export let currently_playing: { link: string, filename: string } | undefined;

export function setCurrentlyPlaying(to: { link: string, filename: string } | undefined){
    currently_playing = to
}

export const illegalLastCmds = ["!!", "spam"]

export function createAliases() {
    let a: { [key: string]: Array<string> } = {}
    let data = fs.readFileSync("command-results/alias", "utf-8")
    for (let cmd of data.split(';END')) {
        if (!cmd.trim()) continue
        let [_, ...args] = cmd.split(":")
        //@ts-ignore
        args = args.join(":")
        //@ts-ignore
        args = args.trim()
        //@ts-ignore
        let [actualCmd, ...rest] = args.split(" ")
        actualCmd = actualCmd.trim()
        a[actualCmd] = rest
    }
    return a
}

export let aliases = createAliases()

export function isCmd(text: string, prefix: string) {
    return text.slice(0, prefix.length) === prefix
}

export async function runCmd(msg: Message, command_excluding_prefix: string, recursion = 0, returnJson = false, disable?: { categories?: CommandCategory[], commands?: string[] }) {
    let parser = new Parser(msg, command_excluding_prefix)
    await parser.parse()
    let int = new Interprater(msg, parser.tokens, parser.modifiers, recursion, returnJson, disable)
    return await int.run()
}

export class Interprater {
    tokens: Token[]
    args: string[]
    cmd: string
    real_cmd: string
    recursion: number
    returnJson: boolean
    disable: { categories?: CommandCategory[], commands?: string[] }
    sendCallback: (options: MessageOptions | MessagePayload | string) => Promise<Message>
    alias: boolean | [string, string[]]

    #interprated: boolean
    #aliasExpandSuccess: boolean
    #i: number
    #curTok: Token | undefined
    #doFirstCountValueTable: { [key: number]: string }
    #doFirstNoFromArgNo: { [key: number]: number }
    #msg: Message
    #argOffsetFromDoFirstSpreading: number
    modifiers: Modifier[]

    constructor(msg: Message, tokens: Token[], modifiers: Modifier[], recursion = 0, returnJson = false, disable?: { categories?: CommandCategory[], commands?: string[] }, sendCallback?: (options: MessageOptions | MessagePayload | string) => Promise<Message>) {
        this.tokens = tokens
        this.args = []
        this.cmd = ""
        this.real_cmd = ""
        this.recursion = recursion
        this.returnJson = returnJson
        this.disable = disable ?? {}
        this.sendCallback = sendCallback || msg.channel.send.bind(msg.channel)
        this.alias = false

        this.modifiers = modifiers
        this.#i = -1
        this.#curTok = undefined
        this.#doFirstCountValueTable = {}
        this.#msg = msg
        this.#argOffsetFromDoFirstSpreading = 0
        this.#doFirstNoFromArgNo = {}
        this.#interprated = false
        this.#aliasExpandSuccess = false
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
        if (this.args[token.argNo + this.#argOffsetFromDoFirstSpreading] === undefined) {
            this.args[token.argNo + this.#argOffsetFromDoFirstSpreading] = token.data
        }
        else {
            this.args[token.argNo + this.#argOffsetFromDoFirstSpreading] += token.data
        }
    }
    //str token
    async [0](token: Token) {
        this.addTokenToArgList(token)
    }
    //dofirst token
    async [1](token: Token) {
        let parser = new Parser(this.#msg, token.data)
        await parser.parse()
        let int = new Interprater(this.#msg, parser.tokens, parser.modifiers, this.recursion, true, this.disable)
        let rv = await int.run() as CommandReturn
        let data = getContentFromResult(rv as CommandReturn).trim()
        if (rv.recurse && rv.content && isCmd(rv.content, prefix) && this.recursion < 20) {
            let parser = new Parser(this.#msg, token.data)
            await parser.parse()
            let int = new Interprater(this.#msg, parser.tokens, parser.modifiers, this.recursion, true, this.disable)
            let rv = await int.run() as CommandReturn
            data = getContentFromResult(rv as CommandReturn).trim()
        }
        this.#doFirstCountValueTable[Object.keys(this.#doFirstCountValueTable).length] = data
        this.#doFirstNoFromArgNo[token.argNo] = Object.keys(this.#doFirstCountValueTable).length - 1
    }
    //calc
    async [2](token: Token) {
        let parser = new Parser(this.#msg, token.data, false)
        await parser.parse()
        let int = new Interprater(this.#msg, parser.tokens, parser.modifiers, this.recursion + 1, false, this.disable)
        await int.interprate()
        token.data = int.args.join(" ")
        let t = new Token(T.str, String(safeEval(token.data, { ...generateSafeEvalContextFromMessage(this.#msg), ...vars["__global__"] }, { timeout: 1000 })), token.argNo)
        this.addTokenToArgList(t)
    }
    //esc sequence
    async [3](token: Token) {
        this.addTokenToArgList(token)
    }
    //fmt
    async [4](token: Token) {
        this.addTokenToArgList(token)
    }
    //dofirstrepl
    async [5](token: Token) {
        let [doFirstArgNo, doFirstResultNo] = token.data.split(":")
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
                text = doFirst.split(" ")[Number(doFirstResultNo)]
            }
            this.addTokenToArgList(new Token(T.str, text, token.argNo))
        }
        //TODO: %{...} spreads  args into  multiple arguments

    }
    async [6](token: Token) {
        this.cmd = token.data
        this.real_cmd = token.data

        if (!commands[this.cmd] && aliases[this.cmd]) {
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
    }

    hasModifier(mod: Modifiers) {
        return this.modifiers.filter(v => v.type === mod).length > 0
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

        if (this.hasModifier(Modifiers.typing)) {
            await this.#msg.channel.sendTyping()
        }

        return await runCmd(this.#msg, content, this.recursion + 1, true, this.disable) as CommandReturn
    }


    async run(): Promise<CommandReturn | undefined> {
        let args = await this.interprate()
        //canRun is true if the user is not BLACKLISTED from a command
        //it is also  true if the user is WHITELISTED for a command
        let canRun = true
        //This is true if the command exists
        let exists = true

        //This is true if the bot  is supposed  to type
        let typing = false

        //This is  false  if the command result is not redirected into a variable
        let redir: boolean | [Object, string] = false //Object is the object in which the variable is stored, string is the variable name

        //The return  value from this function
        let rv: CommandReturn = { status: StatusCode.RETURN };


        if (this.hasModifier(Modifiers.silent)) {
            this.sendCallback = async (_data) => this.#msg
        }

        if (this.hasModifier(Modifiers.redir)) {
            let m = this.modifiers.filter(v => v.type === Modifiers.redir)[0].data
            //whether or not to redirect *all* message sends to the variable, or just the return value from the command
            let all = m[1] //this matches the ! after redir
            if (all) {
                //change this function to redirect into the variable requested
                this.sendCallback = async (_data) => {
                    //@ts-ignore
                    if (_data.content) {
                        if (typeof redir === 'object') {
                            let [place, name] = redir
                            //@ts-ignore
                            place[name] = place[name] + "\n" + _data.content
                        }
                    }
                    else if (typeof _data === 'string') {
                        if (typeof redir === 'object') {
                            let [place, name] = redir
                            //@ts-ignore
                            place[name] = place[name] + "\n" + _data
                        }
                    }
                    return this.#msg
                }
            }
            //the variable scope
            let prefix = m[2] //matches the text before the  : in the parens in redir
            //the variable name
            let name = m[3] //matches the text after the :  in the parens in redir
            if (!prefix) {
                prefix = "__global__"
                redir = [vars["__global__"], name]
            }

            else if (prefix) {
                if (!vars[prefix])
                    vars[prefix] = {}
                redir = [vars[prefix], name]
            }
        }

        if (this.hasModifier(Modifiers.typing)) {
            typing = true
        }

        if (this.hasModifier(Modifiers.delete)) {
            if (this.#msg.deletable) await this.#msg.delete()
        }

        if (this.alias && this.#aliasExpandSuccess) {
            rv = await this.runAlias()
        }
        else if (this.alias && !this.#aliasExpandSuccess) {
            rv = { content: `Failed to expand ${this.cmd}`, status: StatusCode.ERR }
        }
        else if (!commands[this.real_cmd]) {
            //We dont want to keep running commands if the command doens't exist
            //fixes the [[[[[[[[[[[[[[[[[ exploit
            if (this.real_cmd.startsWith(prefix)) {
                this.real_cmd = `\\${this.real_cmd}`
            }
            rv = { content: `${this.real_cmd} does not exist`, status: StatusCode.ERR }
            exists = false
        }
        else if (exists) {
            //make sure it passes the command's perm check if it has one
            if (commands[this.real_cmd].permCheck) {
                canRun = commands[this.real_cmd].permCheck?.(this.#msg) ?? true
            }
            //is whitelisted
            if (WHITELIST[this.#msg.author.id]?.includes(this.real_cmd)) {
                canRun = true
            }
            //is blacklisted
            if (BLACKLIST[this.#msg.author.id]?.includes(this.real_cmd)) {
                canRun = false
            }
            if (this.disable?.commands && this.disable.commands.includes(this.real_cmd)) {
                canRun = false
            }
            if (this.disable?.categories && this.disable.categories.includes(commands[this.real_cmd].category)) {
                canRun = false
            }
            if (canRun) {
                if (typing)
                    await this.#msg.channel.sendTyping()
                let [opts, args2] = getOpts(args)

                if(commands[this.real_cmd].cmd_std_version == 2){
                    let obj: CommandV2RunArg = {
                        msg: this.#msg,
                        rawArgs: args,
                        args: args2,
                        sendCallback: this.sendCallback,
                        recursionCount: this.recursion,
                        commandBans: typeof rv.recurse === 'object' ? rv.recurse : undefined,
                        opts: new Options(opts)
                    }
                    rv = await (commands[this.real_cmd] as CommandV2).run(obj)
                }
                else{

                    rv = await (commands[this.real_cmd] as Command).run(this.#msg, args, this.sendCallback, opts, args2, this.recursion, typeof rv.recurse === "object" ? rv.recurse : undefined)
                }
                globals.addToCmdUse(this.real_cmd)
                //if normal command, it counts as use
            }
            else rv = { content: "You do not have permissions to run this command", status: StatusCode.ERR }
        }

        //illegalLastCmds is a list that stores commands that shouldn't be counted as last used, !!, and spam
        if (!illegalLastCmds.includes(this.real_cmd)) {
            //this is for the !! command
            lastCommand[this.#msg.author.id] = this.#msg.content
        }
        if (this.returnJson) {
            return rv;
        }
        if (redir) {
            let [place, name] = redir
            //set the variable to the response
            //@ts-ignore
            place[name] = () => getContentFromResult(rv)
            return
        }
        //handles the rv protocol
        handleSending(this.#msg, rv, this.sendCallback, this.recursion + 1)
    }

    async interprate() {
        if (this.#interprated) {
            return this.args
        }
        for (let doFirst of this.tokens.filter(v => v.type === T.dofirst)) {
            await this[1](doFirst)
        }
        this.tokens = this.tokens.filter(v => v.type !== T.dofirst)
        while (this.advance()) {
            await this[(this.#curTok as Token).type](this.#curTok as Token)
        }
        this.#interprated = true
        return this.args
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
    let local_prefix = user_options.getOpt(msg.author.id, "prefix", prefix)
    //by default delete files that are being sent from local storage
    if (rv.deleteFiles === undefined) {
        rv.deleteFiles = true
    }
    if (rv.delete && msg.deletable) {
        msg.delete().catch(_err => console.log("Message not deleted"))
    }
    if (rv.noSend) {
        return msg
    }
    if (rv.content && rv.do_change_cmd_user_expansion !== false) {
        //if not empty, save in the _! variable
        setVar("_!", rv.content, msg.author.id)
        setVar("_!", rv.content)

        //@ts-ignore
        let optionToGet: user_options.UserOption = {
            [StatusCode.ERR]: "change-cmd-error",
            [StatusCode.INFO]: "change-cmd-info",
            [StatusCode.PROMPT]: "change-cmd-prompt",
            [StatusCode.RETURN]: "change-cmd-return",
            [StatusCode.WARNING]: "change-cmd-warning"
        }[rv.status] as user_options.UserOption

        let opt = user_options.getOpt(msg.author.id, optionToGet, "")
        if (opt !== "") {
            rv.content = opt
            if (rv.recurse && rv.recurse !== true) {
                //if rv specified different bans, we want those to take priority
                rv.recurse = { ...rv.recurse }
            }
            else {
                rv.recurse = generateDefaultRecurseBans()
            }
            rv.do_change_cmd_user_expansion = false
        }
    }

    if (!rv?.content) {
        //if content is empty string, delete it so it shows up as undefined to discord, so it wont bother trying to send an empty string
        delete rv['content']
    }
    //only do this if content
    else if (recursion < globals.RECURSION_LIMIT && rv.recurse && rv.content.slice(0, prefix.length) === local_prefix) {
        let do_change_cmd_user_expansion = rv.do_change_cmd_user_expansion
        rv = await runCmd(msg, rv.content.slice(prefix.length), recursion + 1, true, rv.recurse === true ? undefined : rv.recurse) as CommandReturn
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
        //@ts-ignore
        fs.writeFileSync("out", rv.content)
        delete rv["content"]
        if (rv.files) {
            rv.files.push({ attachment: "out", name: "cmd.txt", description: "command output too long" })
        } else {
            rv.files = [{
                attachment: "out", name: "cmd.txt", description: "command output too long"
            }]
        }
    }
    //the place to send message to
    let location = msg.channel
    if (rv['dm']) {

        //@ts-ignore
        location = msg.author
    }
    let newMsg;
    try {
        if (sendCallback) {
            newMsg = await sendCallback(rv)
        }
        else {
            newMsg = await location.send(rv)
        }
    }
    catch (err) {
        //usually happens when there is nothing to send
        console.log(err)
        if (sendCallback) {
            newMsg = await sendCallback({ content: "Something went wrong" })
        }
        else {
            newMsg = await location.send({ content: "Something went wrong" })
        }
    }
    //delete files that were sent
    if (rv.files) {
        for (let file of rv.files) {
            if (file.delete !== false && rv.deleteFiles && fs.existsSync(file.attachment))
                fs.rmSync(file.attachment)
        }
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

export function createCommand(
    cb: (msg: Message, args: ArgumentList, sendCallback: (_data: MessageOptions | MessagePayload | string) => Promise<Message>, opts: Opts, deopedArgs: ArgumentList, recursion: number, command_bans?: { categories?: CommandCategory[], commands?: string[] }) => Promise<CommandReturn>,
    category: CommandCategory,
    helpInfo?: string,
    helpArguments?: CommandHelpArguments | null,
    helpOptions?: CommandHelpOptions | null,
    tags?: string[] | null,
    permCheck?: (m: Message) => boolean): Command {
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
        cmd_std_version: 1
    }
}

export function createCommandV2(
    cb: ({msg, rawArgs, sendCallback, opts, args, recursionCount, commandBans}: {msg: Message<boolean>, rawArgs: ArgumentList, sendCallback: (data: MessageOptions | MessagePayload | string) => Promise<Message>, opts: Options, args: ArgumentList, recursionCount: number, commandBans?: {categories?: CommandCategory[], commands?: string[]}}) => Promise<CommandReturn>,
    category: CommandCategory,
    helpInfo?: string,
    helpArguments?: CommandHelpArguments | null,
    helpOptions?: CommandHelpOptions | null,
    tags?: string[] | null,
    permCheck?: (m: Message) => boolean): CommandV2 {
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
        cmd_std_version: 2
    }
}

export function generateDefaultRecurseBans() {
    return { categories: [CommandCategory.GAME, CommandCategory.ADMIN], commands: ["sell", "buy", "bitem", "bstock", "bpet", "option", "!!", "rccmd", "var", "expr", "do", "runas"] }
}

export let commands: {[key: string]: Command | CommandV2} = {}

export function registerCommand(name: string, command: Command | CommandV2){
    if(!command.help){
        console.warn(name, `(${cmdCatToStr(command.category)})`, "does not have help")
    }
    Reflect.set(commands, name, command)
}

export function getCommands(){
    return commands
}

export function getAliases(refresh?: boolean){
    if(refresh){
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
    createChatCommand("defer-reply", "defers the reply :+1:", []),
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
    createChatCommand("ccmd", "create a custom command, WOWZERS", [
        createChatCommandOption(STRING, "name", "name of command (NO SPACES)", { required: true }),
        createChatCommandOption(STRING, "text", "what to say", { required: true })
    ]),
    createChatCommand("alias", "A more powerful ccmd", [
        createChatCommandOption(STRING, "name", "name of command (NO SPACES)", { required: true }),
        createChatCommandOption(STRING, "command", "command to run", { required: true }),
        createChatCommandOption(STRING, "text", "Text to give to command", {})
    ]),
    createChatCommand("rps", "Rock paper scissors", [
        createChatCommandOption(USER, "opponent", "opponent", { required: true }),
        createChatCommandOption(STRING, "choice", "choice", { required: true }),
        createChatCommandOption(STRING, "bet", "bet", { required: false })
    ]),
    createChatCommand("rccmd", "remove a custom command, WOWZERS", [
        createChatCommandOption(STRING, "name", "name of command to remove (NO SPACES)", { required: true }),
    ]),
    createChatCommand("say", "says something", [
        createChatCommandOption(STRING, "something", "the something to say", { required: true })
    ]),
    createChatCommand("poll", "create a poll", [
        createChatCommandOption(STRING, "options", "Options are seperated by |", { required: true }),
        createChatCommandOption(STRING, "title", "The title of the poll", { required: false }),
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
    createChatCommand("add-wordle", "add a word to wordle", [createChatCommandOption(STRING, "word", "the word", { required: true })]),
    createChatCommand("add-8", "add a response to 8ball", [createChatCommandOption(STRING, "response", "the response", { required: true })]),
    createChatCommand("dad", "add a distance response", [createChatCommandOption(STRING, "response", "The response", { required: true })]),
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

