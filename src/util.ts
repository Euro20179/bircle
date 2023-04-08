import cheerio = require("cheerio")
import { spawnSync } from "child_process"

import htmlRenderer from "./html-renderer"

import vm from 'vm'
import fs from 'fs'

import { APIEmbedField, BaseChannel, Channel, ChannelType, Client, Guild, GuildMember, Message, PartialDMChannel } from "discord.js"
import { existsSync } from "fs"
import common from "./common"
import { AliasV2, CommandCategory } from "./common_to_commands"

import events from './events'

import { formatMoney, getOpt } from "./user-options"


export type MimeType = `${string}/${string}`

export type UnixTime = number

function getToolIp() {
    return fs.existsSync("./data/ip.key") ? fs.readFileSync("./data/ip.key", "utf-8") : undefined
}

//discord.js' isTextBased thing is absolutely useless
function isMsgChannel(channel: BaseChannel | PartialDMChannel): channel is Exclude<Channel, { type: ChannelType.GuildStageVoice }> {
    return channel.type !== ChannelType.GuildStageVoice
}

function databaseFileToArray(name: string) {
    return fs.readFileSync(`./command-results/${name}`, 'utf-8').split(";END").map(v => v.split(":")).map(v => [v[0], v.slice(1).join(":")])
}

const sleep = async (time: milliseconds_t) => await new Promise(res => setTimeout(res, time))

const Enum = function<const T>(data: T){
    return data
}

function mimeTypeToFileExtension(mime: MimeType) {
    let [_, specific] = mime.split("/")
    return {
        "typescript": "ts",
        "javascript": "js",
        "text": "txt",
        "markdown": "md",
        "html": "html"
    }[specific] ?? "dat"
}

function isSafeFilePath(fp: string) {
    return !(
        fp.match(/\/?\.\.\//) ||
        fp.match(/[^A-Z_a-z0-9\.,-]/)
    )
}

const createEmbedFieldData = (name: string, value: string, inline: boolean = false): APIEmbedField => { return { name, value, inline } }

/**
    * @description Creates an array of embedfielddata
*/
function efd(...data: [string, string, boolean?][]) {
    return listComprehension<[string, string, boolean?], APIEmbedField>(data, i => createEmbedFieldData(i[0], i[1], i[2] ?? false))
}

class Pipe {
    data: any[]
    fn: Function
    default_data: any
    #can_set_default: boolean
    #failed: boolean
    constructor(...data: any[]) {
        this.data = data.filter(v => v !== undefined)
        this.fn = (() => this.data)
        this.#can_set_default = false;
        this.#failed = false;
    }
    static start(...data: any[]) {
        let pipe = new Pipe(...data)
        return pipe
    }
    next(fn: Function): any {
        this.fn = fn
        if (this.data.length && !this.#failed) {
            this.#can_set_default = true
            this.data = [this.fn.bind(this)(...this.data)].flat(1)
        }
        else {
            this.data = this.default_data
            this.#can_set_default = false
            this.#failed = true;
        }
        return this
    }
    default(data: any) {
        if (this.#can_set_default || this.data.length == 0) {
            this.default_data = data
        }
        return this
    }
    done() {
        if (this.data.length === 0) {
            return this.default_data
        }
        if (this.data.length === 1) {
            return this.data[0]
        }
        return this.data
    }
}

function getFonts() {
    const stdout = spawnSync(`which`, ["fc-list"])
    let fcBin;
    if (stdout.stdout.toString("utf-8").length) {
        fcBin = 'fc-list'
    }
    else {
        fcBin = 'fc-list2'
    }
    let fontsStdout = spawnSync(fcBin, ["-f", "%{family[0]}\n"])
    let fonts = fontsStdout.stdout.toString("utf-8").split("\n")
    return Array.from(new Set(fonts))
}

class UTF8String {
    text: string[]
    constructor(text: string) {
        this.text = [...text]
    }
    toString() {
        return this.text.join("")
    }
    length() {
        return this.text.length
    }
}

function* enumerate<T>(iterable: Iterable<T>): Generator<[number, T]> {
    let i = 0
    for (let item of iterable) {
        yield [i++, item]
    }
}

function* range(start: number, stop: number, step: number = 1) {
    for (let i = start; i < stop; i += step) {
        yield i
    }
}

function listComprehension<T, TReturn>(l: Iterable<T>, fn: (i: T, index: number) => TReturn): TReturn[] {
    let newList = []
    for (let [i, item] of enumerate(l)) {
        newList.push(fn(item, i))
    }
    return newList
}

/**
 * @param {Iterable} iter
 * @param {function(number):void} [onNext]
 * @returns {Iterable}
 */
function* cycle<T>(iter: Array<T>, onNext?: (n: number) => void): Generator<T> {
    for (let i = 0; true; i++) {
        if (onNext)
            onNext(i)
        yield iter[i % iter.length]
    }
}



/**
 * Generates a random color
 * @returns {Array} An array of three numbers representing the RGB values of the color
 */
function randomColor() {
    return listComprehension(range(0, 3), () => Math.floor(Math.random() * 256))
}



function intoColorList(color: string) {
    return String(color).replaceAll("|", ">").split(">").map(v => v.trim())
        .map(v => v && !(["rand", "random"].includes(v)) ? v : `#${randomColor().map(v => `0${v.toString(16)}`.slice(-2)).join("")}`)
}

function choice<T>(list: Array<T>): T {
    return list[Math.floor(Math.random() * list.length)]
}

function mulStr(str: string, amount: number) {
    return listComprehension(range(0, amount), () => str).join("")
}

async function fetchChannel(guild: Guild, find: string) {
    let channels = await guild.channels.fetch()
    let channel = channels.filter(channel => `<#${channel?.id}>` == find || channel?.id == find || channel?.name == find || (channel?.name?.indexOf(find) ?? -1) > -1).at(0)
    return channel
}

/**
    * @description Finds a user from the client cache
*/
async function fetchUserFromClient(client: Client, find: string) {
    let res;
    if (res = find.match(/<@!?(\d{18})>/)) {
        find = res[1]
    }
    find = find.toLowerCase()
    let user = client.users.cache.find((v, k) => {
        return v.username.toLowerCase() === find || v.username.toLowerCase().startsWith(find) || v.id === find
    })
    if (!user) {
        try {
            user = await client.users.fetch(find)
        }
        catch (err) {
            return user
        }
    }
    return user
}

/**
    * @description finds the member in a guild
*/
async function fetchUser(guild: Guild, find: string) {
    let res;
    if (res = find?.match(/<@!?(\d{18})>/)) {
        find = res[1]
    }
    find = find.toLowerCase()
    let user = guild.members.cache.find((v) => {
        return v.user.username.toLowerCase().startsWith(find) ||
            v.nickname?.toLowerCase().startsWith(find) ||
            v.id === find ||
            `<@${v.id}>` === find || `<@!${v.id}>` === find
    })
    if (!user) {
        await guild.members.fetch()
        user = (await guild.members.search({ query: find }))?.at(0)
        if (!user) {
            try {
                user = await guild.members.fetch({ user: find })
            }
            catch (DiscordAPIError) {
                user = undefined
            }
        }
        if (!user) {
            user = (await guild.members.list()).filter(u => u.id == find || u.user.username?.indexOf(find) > -1 || (u.nickname?.indexOf(find) || -1) > -1)?.at(0)
        }
    }
    return user
}

async function fetchUserFromClientOrGuild(find: string, guild?: Guild | null) {
    if (guild) {
        return (await fetchUser(guild, find))?.user
    }
    return await fetchUserFromClient(common.client, find)
}

const generateFileName = (cmd: string, userId: string, ext: string = "txt") => `garbage-files/${cmd}-${userId}.${ext}`

const cmdFileName = (data: TemplateStringsArray, ...template: string[]) => generateFileName(data[0]?.trim() ?? "CMD", template[0] ?? String(Math.random()), data[1]?.trim())

function escapeRegex(str: string) {
    let finalString = ""
    let escaped = false
    for (let char of str) {
        if (escaped) {
            finalString += char
        }
        else if (char === "\\") {
            escaped = true
            finalString += "\\"
        }
        else if ("^*+[]{}()$".includes(char)) {
            finalString += `\\${char}`
        }
        else {
            finalString += char
        }
    }
    return finalString
}


async function createGradient(gradient: string[], width: number | string, height: number | string) {
    let gradientSvg = "<linearGradient id=\"gradient\">"
    let styleSvg = "<style type=\"text/css\"><![CDATA[#rect{fill: url(#gradient);}"
    let colorStep = 1 / (gradient.length - 1)
    for (let i = 0; i < gradient.length; i++) {
        let grad = gradient[i]
        gradientSvg += `<stop class="stop${i}" offset="${i * colorStep * 100}%" />`
        styleSvg += `.stop${i}{stop-color: ${grad};}`
    }
    styleSvg += "]]></style>"
    gradientSvg += "</linearGradient>"

    let svg = Buffer.from(`<svg>
		    <defs>
			${gradientSvg}
			${styleSvg}
		    </defs>
		    <rect id="rect" x="0" y="0" width="${width}" height="${height}" />
		</svg>`)
    return svg
}

async function applyJimpFilter(img: any, filter: any, arg: any) {
    switch (filter) {
        case "rotate":
            let deg, resize
            if (arg?.length)
                [deg, resize] = arg.split(",")
            deg = parseFloat(deg) || 90.0
            resize = resize ?? true
            if (resize == "false")
                resize = false
            return img.rotate(deg, resize)
        case "flip":
            let hor, vert
            if (arg) {
                if (arg == "horizontal" || arg == "hor") {
                    hor = true
                    vert = false
                }
                else if (arg == 'vertical' || arg == "vert") {
                    hor = false
                    vert = true
                }
            } else {
                hor = true
                vert = false
            }
            return img.flip(hor, vert)
        case "brightness": {
            let val = parseInt(arg) || .5
            return img.brightness(val)
        }
        case "grey":
        case "greyscale":
        case "gray":
        case "grayscale":
            return img.greyscale()
        case "invert":
            return img.invert()
        case "contrast": {
            let val = parseInt(arg) || .5
            return img.contrast(val)
        }
        default:
            return img
    }
}

function rgbToHex(r: number, g: number, b: number) {
    let [rhex, ghex, bhex] = [r.toString(16), g.toString(16), b.toString(16)]
    return `#${rhex.length == 1 ? "0" + rhex : rhex}${ghex.length == 1 ? "0" + ghex : ghex}${bhex.length == 1 ? "0" + bhex : bhex}`
}

function generateSafeEvalContextFromMessage(msg: Message) {
    return { uid: msg.member?.id, uavatar: msg.member?.avatar, ubannable: msg.member?.bannable, ucolor: msg.member?.displayColor, uhex: msg.member?.displayHexColor, udispname: msg.member?.displayName, ujoinedAt: msg.member?.joinedAt, ujoinedTimeStamp: msg.member?.joinedTimestamp, unick: msg.member?.nickname, ubot: msg.author.bot, Units: require("./units").default }
}

function safeEval(code: string, context: { [key: string]: any }, opts: any) {

    let resultKey = 'SAFE_EVAL_' + Math.floor(Math.random() * 1000000)
    context[resultKey] = {}
    context["Buffer"] = Buffer
    let clearContext = `
      Function = undefined;
      require = undefined;
      WebAssembly.constructor = undefined;
      fetch = undefined;
  `
    //let clearContext = 'Function = undefined;'
    code = clearContext + resultKey + '=' + code
    if (!context) {
        context = {}
    }
    Object.entries({
        yes: true,
        false: false,
        efd,
        rgbToHex,
        escapeRegex,
        escapeShell,
        randomColor,
        mulStr,
        choice,
        Pipe,
        mimeTypeToFileExtension,
        searchList,
        renderHTML: htmlRenderer.renderHTML,
        generateCommandSummary,
        user_options: {
            formatMoney: formatMoney,
            getOpt: getOpt
        },
    }).forEach(v => context[v[0]] = v[1])
    try {
        vm.runInNewContext(code, context, opts)
        return context[resultKey]
    }
    catch (err) {
        console.log(err)
        return undefined
    }
}

function escapeShell(text: string) {
    return text.replaceAll(/\$/g, "\\$").replaceAll(";", "\\;")
}

function strlen(text: string) {
    return [...text].length
}

function cmdCatToStr(cat: number) {
    return {
        [CommandCategory.UTIL]: "util",
        [CommandCategory.GAME]: "game",
        [CommandCategory.FUN]: "fun",
        [CommandCategory.META]: "meta",
        [CommandCategory.IMAGES]: "images",
        [CommandCategory.ECONOMY]: "economy",
        [CommandCategory.VOICE]: "voice",
        [CommandCategory.ADMIN]: "admin",
        [CommandCategory.MATCH]: "match",
        [CommandCategory.ALIASV2]: "aliasv2"
    }[cat] ?? "UNKNOWN"
}

function getImgFromMsgAndOpts(opts: Opts | Options, msg: Message, stdin?: CommandReturn, pop?: boolean) {
    let img;
    if (opts instanceof Options) {
        img = opts.getString("img", "")
        if (img && pop)
            opts.delete("img")
    }
    if (!img && !(opts instanceof Options) && typeof opts['img'] === 'string') {
        img = opts['img']
        if (img && pop)
            delete opts['img']
    }
    if (!img && stdin?.files) {
        img = stdin?.files[0]?.attachment
        if (img && pop)
            delete stdin.files[0]
    }
    if (!img && msg.attachments?.at(0)) {
        img = msg.attachments.at(0)?.url
        if (img && pop)
            msg.attachments.delete(msg.attachments.keyAt(0) as string)
    }
    if (!img && msg.stickers?.at(0)) {
        img = msg.stickers.at(0)?.url as string
        if (img && pop)
            msg.stickers.delete(msg.stickers.keyAt(0) as string)
    }
    if (!img && msg.embeds?.at(0)?.image?.url) {
        img = msg.embeds?.at(0)?.image?.url
    }
    if (!img && msg.channel.type === ChannelType.GuildText) {
        img = msg.channel.messages.cache.filter(
            (m) => m.attachments?.last()?.size ? true : false
        )?.last()?.attachments.last()?.url
    }
    //ts complains when these are the same check even though it's the same god damn thing
    if (!img && msg.channel.type === ChannelType.DM) {
        img = msg.channel.messages.cache.filter(
            (m) => m.attachments?.last()?.size ? true : false
        )?.last()?.attachments.last()?.url
    }
    return img
}

const GOODVALUE = Symbol("GOODVALUE")
const BADVALUE = Symbol("BADVALUE")

type AmountOfArgs = number | ((arg: string, index: number, argsUsed: number) => typeof GOODVALUE | typeof BADVALUE | true | false)
class ArgList extends Array {
    #i: number
    #curArg: string | null
    IFS: string
    constructor(args: string[], IFS = " ") {
        super(args.length)
        for (let index in args) {
            Reflect.set(this, index, args[index])
        }
        this.#i = NaN
        this.#curArg = null
        this.IFS = IFS
    }
    beginIter() {
        this.#i = -1
        this.#curArg = this[this.#i]
    }
    //mainly for semantics
    reset() {
        this.beginIter()
    }
    advance() {
        this.#i++;
        this.#curArg = this[this.#i]
        return this.#curArg
    }
    back() {
        this.#i--;
        this.#curArg = this[this.#i]
        return this.#curArg
    }
    get currentIndex() {
        return this.#i
    }
    #createArgList(amountOfArgs: AmountOfArgs) {
        let argsToUse = []
        if (typeof amountOfArgs === 'number') {
            if (this.#i === -1)
                this.advance()
            for (let start = this.#i; this.#i < start + amountOfArgs; this.advance()) {
                if (this.#curArg !== undefined && this.#curArg !== null) {
                    argsToUse.push(this.#curArg)
                }
                else {
                    return []
                }
            }
        }
        else {
            if (this.#i === -1)
                this.advance()
            while (this.#curArg && amountOfArgs(this.#curArg as string, this.#i, argsToUse.length)) {
                argsToUse.push(this.#curArg as string)
                this.advance()
            }
            this.back()
        }
        return argsToUse
    }
    expect<T>(amountOfArgs: AmountOfArgs, filter: (i: string[]) => typeof GOODVALUE | typeof BADVALUE | T) {
        if (this.#curArg === null) {
            throw new Error("beginIter must be run before this function")
        }
        let argsToUse = this.#createArgList(amountOfArgs)
        let res;
        if ((res = filter.bind(this)(argsToUse)) !== false && res !== BADVALUE) {
            return res === GOODVALUE ? this.#curArg : res
        }
        return BADVALUE
    }
    async expectAsync<T>(amountOfArgs: AmountOfArgs, filter: (i: string[]) => typeof GOODVALUE | typeof BADVALUE | T) {
        if (this.#curArg === null) {
            throw new Error("beginIter must be run before this function")
        }
        let argsToUse = this.#createArgList(amountOfArgs)
        let res;
        if ((res = (await filter(argsToUse))) !== BADVALUE && res !== false) {
            return res === GOODVALUE ? this.#curArg : res
        }
        return BADVALUE
    }
    expectOneOf(amountOfArgs: AmountOfArgs, list: string[]) {
        return this.expect(amountOfArgs, i => {
            list.includes(i.join(" "))
        })
    }
    expectList(splitter: string, amountOfListItems: number = 1) {
        let resArr: string[] = []
        let curItem = 0
        return this.expect((arg) => {
            if (resArr[curItem] === undefined) {
                resArr[curItem] = ""
            }
            if (arg === splitter) {
                curItem++;
            }
            else if (arg.includes(splitter)) {
                let [last, ...rest] = arg.split(splitter)
                resArr[curItem] += last + this.IFS
                if (resArr.length > amountOfListItems) {
                    return false
                }
                if (resArr.length + rest.length > amountOfListItems) {
                    rest.length = amountOfListItems - resArr.length
                }
                if (rest.length) {
                    rest[rest.length - 1] += this.IFS
                    resArr = resArr.concat(rest)
                }
                curItem = resArr.length - 1
            }
            else resArr[curItem] += arg + this.IFS
            return resArr.length < amountOfListItems
            //slicing here removes the extra IFS at the end of each item
        }, () => resArr.map(v => v.slice(0, -1))) as string[] | typeof BADVALUE
    }
    expectSizedString(size: number, amountOfArgs: AmountOfArgs = 1) {
        return this.expect(amountOfArgs, i => {
            let v = i.join(" ")
            return v.length >= size ? BADVALUE : v
        })

    }
    expectString(amountOfArgs: AmountOfArgs = 1) {
        return this.expect(amountOfArgs, i => i.length ? i.join(this.IFS) : BADVALUE)
    }
    expectInt(amountOfArgs: AmountOfArgs = 1) {
        return this.expect(amountOfArgs, i => i.join(this.IFS).match(/^\d+$/) ? parseInt(i[0]) : BADVALUE)
    }
    expectBool(amountOfArgs: AmountOfArgs = 1) {
        return this.expect(amountOfArgs, i => {
            let s = i.join(this.IFS).toLowerCase()
            if (s === 'true') {
                return true
            }
            else if (s === 'false') {
                return false
            }
            return BADVALUE
        })
    }
    async expectRole(guild: Guild, amountOfArgs: AmountOfArgs = 1) {
        return await this.expectAsync(amountOfArgs, async (i) => {
            let roles = await guild.roles.fetch()
            if (!roles) {
                return BADVALUE
            }
            let s = i.join(this.IFS)
            let foundRoles = roles.filter(r => r.name.toLowerCase() === s ? true : false)
            if (!foundRoles.size) {
                foundRoles = roles.filter(r => r.name.toLowerCase().match(s) ? true : false)
            }
            if (!foundRoles.size) {
                foundRoles = roles.filter(r => r.id == s ? true : false)
            }
            let role = foundRoles.at(0)
            if (!role) {
                return BADVALUE
            }
            return role
        })
    }
    async assertIndexIs<T>(index: number, assertion: (data: string) => Promise<T | undefined>, fallback: T): Promise<T> {
        return await assertion(this.at(index)) ?? fallback
    }

    async assertIndexIsUser(guild: Guild, index: number, fallback: GuildMember) {
        return await this.assertIndexIs(index, async (data) => await fetchUser(guild, data), fallback)
    }
}

class Options extends Map {
    constructor(opts: Opts) {
        super()
        for (let op in opts) {
            this.set(op, opts[op])
        }
    }
    /**
        * @description Looks for <value> if it is not found, return <default_>
    */
    //overriding the default map.get
    getDefault<T>(key: string, default_: T, assert: (v: any) => any = (_v) => _v) {
        return assert(super.get(key)) ?? default_
    }

    getString(key: string, default_: string, toString: (v: string | boolean) => string = String): string {
        let n = super.get(key)
        if (n === undefined || n === true) return default_
        return toString(n) || default_
    }

    getNumber<TDefault>(key: string, default_: TDefault, toNumber: (v: string) => number = Number): number | TDefault {
        let n = super.get(key)
        if (n === undefined) return default_
        let number = toNumber(n)
        return isNaN(number) ? default_ : number
    }
    //this weird inverted logic is because if v === false, it should return false, 
    getBool<TDefault>(key: string, default_: TDefault, toBoolean: (v: any) => boolean = v => String(v) === "true" ? true : !(String(v) === "false")): boolean | TDefault {
        let v = super.get(key)
        return v === undefined ? default_ : toBoolean(v)
    }
}


function getContentFromResult(result: CommandReturn, end = "") {
    let res = ""
    if (result.content)
        res += result.content
    if (result.files) {
        for (let file of result.files) {
            if (existsSync(file.attachment))
                res += end + fs.readFileSync(file.attachment, "base64")
        }
    }
    if (result.embeds) {
        for (let embed of result.embeds) {
            res += `${end}${JSON.stringify(embed.toJSON())}`
        }
    }
    return res
}


function generateDocSummary(name: string, command: Command | CommandV2 | AliasV2 | MatchCommand) {
    let summary = generateCommandSummary(name, command)
    summary += htmlRenderer.renderHTML(`<br><br><b>docs</b><br>${command['help']?.['docs'] || ""}`)
    return summary
}

function generateCommandSummary(name: string, command: Command | CommandV2 | AliasV2 | MatchCommand) {
    let summary = `***${name}***`

    if (command.help?.accepts_stdin) {
        summary = `\\[<command> >pipe>] ${summary}`
    }

    if (command.help?.options) {
        summary += ` [-options...]`
    }

    if (command.help?.arguments)
        for (const [arg, argData] of Object.entries(command.help.arguments)) {
            if (argData?.required !== false) {
                summary += ` <${arg}>`
                continue;
            }
            summary += ` [${arg}`;
            if (argData.default) {
                summary += ` (${argData.default})`
            }
            summary += ']'
        }
    return summary
}

function generateTextFromCommandHelp(name: string, command: Command | CommandV2 | AliasV2 | MatchCommand) {
    let helpData = command.help

    let nameInfo = generateCommandSummary(name, command)

    if (!helpData)
        return nameInfo + "\n"
    let textInfo = "";
    let aliasInfo = "";
    let argInfo = "";
    let optInfo = "";
    let tagInfo = "";

    if (helpData.info) {
        textInfo = "\n\n" + htmlRenderer.renderHTML(helpData.info) + "\n\n"
    }
    if (helpData.docs) {
        textInfo += htmlRenderer.renderHTML(`<h1>docs</h1>` + helpData.docs) + '\n\n'
    }
    if (helpData.accepts_stdin) {
        argInfo += "__stdin__:\n"
        if (typeof helpData.accepts_stdin === 'string') {
            argInfo += htmlRenderer.renderHTML(helpData.accepts_stdin, 2)
        }
        else {
            argInfo += 'true'
        }
        argInfo += '\n'
    }
    if (helpData.arguments) {
        argInfo += "__Arguments__:\n"
        for (let arg in helpData.arguments) {
            argInfo += `\t* **${arg}**`
            if (helpData.arguments[arg].required !== false) {
                argInfo += " (required) "
            }
            if (helpData.arguments[arg].requires) {
                argInfo += ` (requires: ${helpData.arguments[arg].requires}) `
            }
            if (helpData.arguments[arg].default) {
                argInfo += ` (default: ${helpData.arguments[arg].default})`
            }
            let html = cheerio.load(helpData.arguments[arg].description)
            argInfo += `:\n\t\t- ${htmlRenderer.renderELEMENT(html("*")[0], 2).trim()}`
            //we want exactly 2 new lines
            while (!argInfo.endsWith("\n\n")) {
                argInfo += "\n"
            }
        }
    }
    if (helpData.options) {
        optInfo += "__Options__:\n"
        for (let op in helpData.options) {
            optInfo += `\t* **-${op}**`
            if (helpData.options[op].default) {
                optInfo += ` (default: ${helpData.options[op].default})`
            }
            optInfo += ': '
            optInfo += htmlRenderer.renderHTML(helpData.options[op].description, 2).trim()
            if (helpData.options[op].alternates) {
                optInfo += `\t\t-- alternatives: ${helpData.options[op].alternates?.join(" ")}\n`
            }
            //we want exactly 2 new lines
            while (!optInfo.endsWith("\n\n")) {
                optInfo += "\n"
            }
        }
    }
    if (helpData.tags?.length) {
        tagInfo += `__Tags__:\n${helpData.tags.join(", ")}\n`
    }
    return (nameInfo + "\n\n" + textInfo + aliasInfo + argInfo + optInfo + tagInfo).replace("\n\n\n", "\n")
}

function generateHTMLFromCommandHelp(name: string, command: Command | CommandV2) {
    let html = `<div class="command-section" tabindex=0><h1 class="command-title" id="${name}">${name}</h1>`
    let help = command["help"]
    if (help) {
        let info = help["info"] || ""
        let options = help["options"] || {}
        let args = help["arguments"] || {}
        if (info !== "") {
            html += `<h2 class="command-info">Info</h2><p class="command-info">${info}</p>`
        }
        if (help['docs']) {
            html += `<h2 class="command-doc">Docs</h2><p class="command-doc">${help['docs']}</p>`
        }
        if (help["accepts_stdin"]) {
            html += `<h2 class="command-stdin">Stdin</h2><p class="stdin-text">${help['accepts_stdin']}</p>`
        }
        if (args && Object.keys(args).length) {
            html += `<h2 class="command-arguments">Arguments</h2><ul class="command-argument-list">`
            for (let argName in args) {
                let argument = args[argName].description
                let required = args[argName].required || false
                let requires = args[argName].requires || ""
                let default_ = args[argName]["default"] || ""
                let extraText = ""
                if (requires) {
                    extraText = `<span class="requires">requires: ${requires}</span>`
                }
                html += `<li class="command-argument" data-required="${required}">
    <details class="command-argument-details-label" data-required="${required}" title="required: ${required}">
        <summary class="command-argument-summary" data-required="${required}">${argName}`

                if (default_) html += `&nbsp; (default: ${default_})`

                html += `</summary>
        ${argument}<br>${extraText}
        </details>
    </li>`
            }
            html += "</ul>"
        }
        if (options && Object.keys(options).length) {
            html += `<h2 class="command-options">Options</h2><ul class="command-option-list">`
            for (let option in options) {
                let desc = options[option].description || ""
                let alternates = options[option].alternates
                // let requiresValue = options[option].requiresValue || false
                let default_ = options[option]["default"] || ""
                html += `<li class="command-option">
    <details class="command-option-details-label">
    <summary class="command-option-summary"${default_ ? ` title="default: ${default_}"` : ""}>-${option}</summary>${desc}</details>`
                if (alternates) {
                    html += '<span class="option-alternates-title">Aliases:</span>'
                    html += `<ul class="option-alternates">`
                    for (let alternate of alternates) {
                        html += `<li class="option-alternate">-${alternate}</li>`
                    }
                    html += "</ul>"
                }
                html += "</li>"
            }
            html += "</ul>"

        }
    }
    return `${html}</div><hr>`
}

function searchList(search: string, list_of_strings: string[], caseSentive = false) {
    let results: { [key: string]: number } = {}
    for (let str of list_of_strings) {
        if (caseSentive === false)
            str = str.toLowerCase()
        let score = 0
        let inARow = 0
        let maxInARow = 0;
        let lastMatchI = 0;
        let lastMatchJ = 0;
        for (let i = 0; i < str.length; i++) {
            let foundMatch = false
            for (let j = lastMatchJ + 1; j < search.length; j++) {
                if (str[i] === search[j]) {
                    if (i === lastMatchI + 1) {
                        inARow++;
                        score += j
                    }
                    else {
                        inARow = 1
                    }
                    if (inARow > maxInARow) {
                        maxInARow = inARow
                    }
                    lastMatchI = i
                    lastMatchJ = j
                    if (inARow > maxInARow)
                        maxInARow = inARow

                    foundMatch = true
                    break;
                }
            }
            if (!foundMatch) {
                if (maxInARow / search.length < .7) {
                    score /= 2
                }
                inARow = 0;
                lastMatchJ = 0
                lastMatchI = 0
            }
        }
        results[str] = score * maxInARow
    }
    return results
}

function strToCommandCat(category: keyof typeof CommandCategory) {
    return CommandCategory[category.toUpperCase() as keyof typeof CommandCategory]
}

function isCommandCategory(category: string): category is keyof typeof CommandCategory {
    return CommandCategory[category as keyof typeof CommandCategory] !== undefined ? true : false
}

function isBetween(low: number, checking: number, high: number) {
    return checking > low && checking < high
}

function isNumeric(string: string) {
    return string.match(/^[0-9]+$/) ? true : false
}

function emitsEvent<T extends (...args: any[]) => any>(fn: T) {
    return function(...data: Parameters<T>): ReturnType<T> {
        events.botEvents.emit(events.FuncUsed, fn)
        return fn(...data)
    }
}

export {
    strToCommandCat,
    fetchUser,
    fetchChannel,
    generateFileName,
    createGradient,
    applyJimpFilter,
    randomColor,
    rgbToHex,
    safeEval,
    mulStr,
    cycle,
    escapeShell,
    strlen,
    UTF8String,
    cmdCatToStr,
    getImgFromMsgAndOpts,
    fetchUserFromClient,
    fetchUserFromClientOrGuild,
    generateSafeEvalContextFromMessage,
    choice,
    getContentFromResult,
    generateHTMLFromCommandHelp,
    generateTextFromCommandHelp,
    Pipe,
    getFonts,
    intoColorList,
    Options,
    ArgList,
    searchList,
    listComprehension,
    range,
    enumerate,
    BADVALUE,
    GOODVALUE,
    createEmbedFieldData,
    efd,
    generateCommandSummary,
    isSafeFilePath,
    mimeTypeToFileExtension,
    getToolIp,
    generateDocSummary,
    isBetween,
    isNumeric,
    databaseFileToArray,
    isMsgChannel,
    isCommandCategory,
    emitsEvent,
    cmdFileName,
    sleep,
    Enum
}

