import * as cheerio from "cheerio"
import { spawnSync } from "child_process"

import htmlRenderer from "./html-renderer"

import vm from 'vm'
import fs from 'fs'

import { APIEmbedField, BaseChannel, Channel, ChannelType, Client, Guild, GuildMember, Message, PartialDMChannel, TextChannel } from "discord.js"
import { existsSync } from "fs"
import common from "./common"
import { AliasV2, CommandCategory } from "./common_to_commands"

import events from './events'

import { formatMoney, getOpt } from "./user-options"
import { getConfigValue } from "./config-manager"
import { format, parseRangeString } from "./parsing"

import units from './units'
import iterators from "./iterators"


export type MimeType = `${string}/${string}`

export type UnixTime = Tagger<number>

export function reduce(numerator: number, denominator: number) {
    function gcd(a: number, b: number): number {
        return b ? gcd(b, a % b) : a;
    }
    let den = gcd(numerator, denominator);
    return [numerator / den, denominator / den];
}


function binStrToDec(str: string) {
    let ans = 0n
    for (let i = 0n; i < str.length; i++) {
        if (str[Number(i)] === '1') {
            ans += 2n ** (BigInt(str.length) - i - 1n)
        }
    }
    return ans
}

function fracBinStrToDec(str: string) {
    let ans = 0
    for (let i = 0; i < str.length; i++) {
        if (str[i] === '1') {
            ans += 1 / (2 ** (i + 1))
        }
    }
    return ans
}

//these pair of functions exist because using a for loop on a generator that *returns* a value
//doesn't use the return value from the return statement and breaks before the loop can do
//something with the return value
//example:
//```javascript
//function* yield_and_return(){
//  yield 1
//  yield 2
//  return 3
//}
//
//for(let item of yield_and_return()){
//  console.log(item)
//}
////this will not console.log 3, it breaks as soon as it hits return
//```

function* iterGenerator<T>(generator: Generator<T>) {
    let prev;
    do {
        prev = generator.next()
        //in case there is a stray return; that doesn't return anything
        if (prev.value !== undefined)
            yield prev.value
    } while (!prev.done)
}
async function* iterAsyncGenerator<T>(generator: AsyncGenerator<T>) {
    let prev;
    do {
        prev = await generator.next()
        //in case there is a stray return; that doesn't return anything
        if (prev.value !== undefined)
            yield prev.value
    } while (!prev.done)
}

function clamp(low: number, n: number, high: number) {
    return Math.max(Math.min(n, high), low)
}

/**
    * @!
*
* G
* qa!:qaAZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZzdescription
    * Finds the item in the haystack that's closest to n
    * requires haystack to be sorted least -> greatest
*/
function findClosest(needle: number, haystack: number[]): [number, number] {
    if (haystack.length == 0) {
        return [0, needle]
    }
    if (haystack.length === 1) {
        return [haystack[0], haystack[0] - needle]
    }
    const middle = Math.floor(haystack.length / 2)
    if (needle < haystack[middle]) {
        let closeness = haystack[middle] - needle
        let [n, newCloseness] = findClosest(needle, haystack.slice(0, middle))
        newCloseness = newCloseness
        //< prioritizes the earlier item here, because the new closer one is guaranteed to be earlier in the list
        //therefore select it if closeness and newCloseness are equal
        return Math.abs(closeness) < Math.abs(newCloseness) ? [haystack[middle], closeness] : [n, newCloseness]
    }
    else if (needle === haystack[middle]) {
        return [haystack[middle], 0]
    }
    else {
        let closeness = haystack[middle] - needle
        let [n, newCloseness] = findClosest(needle, haystack.slice(middle + 1))
        newCloseness = newCloseness
        //making this <= prioritizes the earlier item in the list, because the old closer one is guaranteed to be earlier in the list
        return Math.abs(closeness) <= Math.abs(newCloseness) ? [haystack[middle], closeness] : [n, newCloseness]
    }
}

function rotCharN(char: string, n: number) {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
    const idx = chars.indexOf(char)
    if (idx > 25) {
        return chars[((idx + n) % (chars.length / 2)) + 26] //to lazy to figure out why this needs to be 26
    }
    return chars[(idx + n) % (chars.length / 2)]
}

function rotN(text: string, n: number) {
    return text.split("").map(c => c.match(/[a-zA-Z]/) && rotCharN(c, n) || c).join("")
}

function base10ToRoman(n: number) {
    const toRoman = {
        1: "I",
        5: "V",
        10: "X",
        50: "L",
        100: "C",
        500: "D",
        1000: "M",
        5000: "B",
        10000: "K",
        50000: "R",
        100000: "G",
        500000: "T",
        1000000: "F"
    } as const
    if (n == 0) {
        return ""
    }
    let romanStr = ""
    const values = Object.keys(toRoman).map(Number).sort((l, r) => l - r)
    const [closest, closeness] = findClosest(n, values)
    romanStr += toRoman[closest as keyof typeof toRoman]
    if (closeness < 0) {
        romanStr += base10ToRoman(n - closest)
    }
    else {
        romanStr = base10ToRoman(closest - n) + romanStr
    }
    return romanStr
}

/**
    * @description Converts roman numerals to base 10
*/
function romanToBase10(roman: string) {
    const to10 = {
        "I": 1,
        "V": 5,
        "X": 10,
        "L": 50,
        "C": 100,
        "D": 500,
        "M": 1000,
        "B": 5000,
        "K": 10000,
        "R": 50000,
        "G": 100000,
        "T": 500000,
        "F": 1000000
    }
    let biggestRoman = 0
    let left, right;
    for (let i = 0; i < roman.length; i++) {
        let char = roman[i]
        let value = to10[char as keyof typeof to10]
        let dashCount = 0
        //keep going until all the - are eaten
        while (roman[i + 1 + dashCount] === "-") {
            value *= 1000
            dashCount++;
        }
        if (value > biggestRoman) {
            biggestRoman = value
            left = roman.slice(0, i)
            //we increase i here specifically because then right exludes all the dashes
            i += dashCount
            right = roman.slice(i + 1)
        }
    }
    let ans = biggestRoman
    if (!left && !right) {
        return ans
    }
    if (left) {
        ans -= romanToBase10(left)
    }
    if (right) {
        ans += romanToBase10(right)
    }
    return ans
}

function prettyObject(obj: object, tab = 0) {
    let text = `${"\t".repeat(tab)}{\n`
    for (let key in obj) {
        text += `${"\t".repeat(tab + 1)}"${key}": ${prettyJSON(obj[key as keyof typeof obj], tab + 1)},\n`
    }
    //only if there are keys, otherwise we remove the initial {
    if (Object.keys(obj).length)
        //remove the trailing comma and new line
        text = text.slice(0, -2)
    return text.trimStart() + `\n${"\t".repeat(tab)}}`
}

function prettyList(obj: Array<any>, tab = 0) {
    let text = `${"\t".repeat(tab)}[\n`
    for (let item of obj) {
        text += `${"\t".repeat(tab + 1)}${prettyJSON(item, tab + 1)},\n`
    }
    if (obj.length)
        //remove the trailing comma and new line
        text = text.slice(0, -2)
    return text.trimStart() + `\n${"\t".repeat(tab)}]`
}

/**
    * @description stringifies and formats a javascript objects
*/
function prettyJSON(obj: any, tab = 0) {
    switch (typeof obj) {
        case "object":
            if ("length" in obj) {
                return prettyList(obj, tab)
            }
            if (obj === null) {
                return `null`
            }
            return prettyObject(obj, tab)
        case "number":
            return String(obj)
        case "string":
            return JSON.stringify(obj)
        case "boolean":
            return `${obj}`
        case "undefined":
            return "null"
        default:
            return ""
    }
}

function getToolIp() {
    return getConfigValue("secrets.twin-bot-ip")
}

//discord.js' isTextBased thing is absolutely useless
/**
    * @description checks if the channel has `channel.send`
*/
function isMsgChannel(channel: BaseChannel | PartialDMChannel): channel is Exclude<Channel, { type: ChannelType.GuildStageVoice }> {
    return channel.type !== ChannelType.GuildStageVoice
}

function databaseFileToArray(name: string) {
    return fs.readFileSync(`./command-results/${name}`, 'utf-8').split(";END").map(v => v.split(":")).map(v => [v[0], v.slice(1).join(":")])
}

const sleep = async (time: milliseconds_t) => await new Promise(res => setTimeout(res, time))

function Enum<const T>(data: T) {
    return data
}

/**
    * @description similar to python's str.title()
*/
function titleStr(str: string) {
    return str.split(" ").map(v => v[0].toUpperCase() + v.slice(1)).join(" ")
}

/**
    * @description runs cb but in an async function to defer lower the importance
*/
async function defer(cb: Function) {
    cb()
}

/**
    * @description as apposed to Object.entries, this function is a generator
*/
function* entriesOf<T extends Object>(o: T): Generator<[string, T[Extract<keyof T, string>]]> {
    for (let prop in o) {
        if (o.hasOwnProperty(prop)) {
            yield [prop, o[prop]]
        }
    }
}

/**
    * @description as apposed to Object.values, this function is a generator
*/
function* valuesOf<T extends Object>(o: T): Generator<T[Extract<keyof T, string>]> {
    for (let key in o) {
        if (o.hasOwnProperty(key)) {
            yield o[key]
        }
    }
}

/**
    * @description as apposed to Object.keys, this function is a generator
*/
function* keysOf<T extends Object>(o: T): Generator<string> {
    for (let key in o) {
        if (o.hasOwnProperty(key)) {
            yield key
        }
    }
}

function formatMember(member: GuildMember, fmt: string) {
    const user = member.user
    let status = (() => {
        return member.presence?.clientStatus?.desktop ?? member.presence?.clientStatus?.web ?? member.presence?.clientStatus?.mobile
    })() ?? "invisible"
    let platform = member.presence?.clientStatus && Object.keys(member.presence.clientStatus)[0] || "offline"
    let platform_status = `${platform}/${status}`
    return format(fmt, {
        "{id}": user.id || "#!N/A",
        "{username}": user.username || "#!N/A",
        "{nickname}": member.displayName || "#!N/A",
        "{0xcolor}": member.displayHexColor.toString() || "#!N/A",
        "{color}": member.displayColor.toString() || "#!N/A",
        "{created}": () => user.createdAt.toString() || "#!N/A",
        "{joined}": () => member.joinedAt?.toString() || "#!N/A",
        "{boost}": member.premiumSince?.toString() || "#!N/A",
        "{status}": platform_status,
        i: user.id || "#!N/A",
        u: user.username || "#!N/A",
        n: member.nickname || "#!N/A",
        d: member.displayName,
        X: () => member.displayHexColor.toString() || "#!N/A",
        x: () => member.displayColor.toString() || "#!N/A",
        c: user.createdAt.toString() || "#!N/A",
        j: member.joinedAt?.toString() || "#!N/A",
        b: member.premiumSince?.toString() || "#!N/A",
        a: user.avatarURL() || "#!N/A",
        s: platform_status
    })
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

/**
    * @description checks if the file path is alphanumeric + ".,-" only
*/
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
    return Array.from(data, i => createEmbedFieldData(i[0], i[1], i[2] ?? false))
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

/**
    * @description uses an array to treat a string as utf8, because javascript strings are utf-16
*/
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


function countOf<T>(list: T[] | string, item: T): number {
    let count = 0
    for (let i of list) {
        if (i === item) count++
    }
    return count
}


function randomColor() {
    return randomHexColorCode()
}

function randomHexColorCode() {
    let code = '#'
    for (let i = 0; i < 6; i++) {
        code += "0123456789ABCDEF"[Math.floor(Math.random() * 16)]
    }
    return code
}

function intoColorList(color: string) {
    return String(color).replaceAll("|", ">").split(">").map(v => v.trim())
        .map(v => v && !(["rand", "random"].includes(v)) ? v : randomHexColorCode())
}

function choice<T>(list: Array<T>): T {
    return list[Math.floor(Math.random() * list.length)]
}

function mulStr(str: string, amount: int_t) {
    return Array.from(iterators.range(0, amount), () => str).join("")
}

async function fetchChannel(guild: Guild, find: string) {
    let channels = await guild.channels.fetch()
    let channel = channels.filter(channel => `<#${channel?.id}>` == find || channel?.id == find || channel?.name == find || (channel?.name?.indexOf(find) ?? -1) > -1).at(0)
    return channel
}

async function searchMsg(msg: Message, search?: string) {
    let infoMsg;
    if (msg.reference) {
        infoMsg = await msg.fetchReference()
    } else if (search?.length) {
        if (search.match(/^\d+\/\d+$/) && msg.guild) {
            const [channelId, msgId] = search.split("/")
            const channel = await msg.guild.channels.fetch(channelId)
            if (channel && isMsgChannel(channel)) {
                const msgs = await (channel as TextChannel).messages.fetch()
                infoMsg = msgs.find(v => v.id === msgId)
            }
        } else {
            const msgs = await msg.channel.messages.fetch()
            if (search.match(/^\d+$/)) {
                infoMsg = msgs.filter(m => m.id === search).at(0)
            } else {
                infoMsg = msgs.filter(m => m.content === search).at(0)
                if (!infoMsg) {
                    infoMsg = msgs.filter(m => m.content.includes(search)).at(0)
                }
            }
        }
    } else {
        const msgs = await msg.channel.messages.fetch()
        return msgs.at(1)
    }

    return infoMsg
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
    let user = client.users.cache.find((v, _k) => {
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

async function fetchRoleFromServer(guild: Guild, find: string) {
    find = find.toLowerCase()
    let role = guild.roles.cache.find(
        r => r.name.toLowerCase() === find ||
            r.id === find ||
            `<@&${r.id}>` === find
    )
    if (!role) {
        await guild.roles.fetch()
        role = guild.roles.cache.find(
            r => r.name.toLowerCase() === find ||
                r.id === find ||
                `<@&${r.id}>` === find
        )
    }
    return role
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
            v.displayName?.toLowerCase().startsWith(find) ||
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
            user = (await guild.members.list()).filter(u => u.id == find || u.user.username?.indexOf(find) > -1 || (u.displayName?.indexOf(find) || -1) > -1)?.at(0)
        }
    }
    return user
}

async function fetchUserFromClientOrGuild(find: string, guild?: Guild | null) {
    return guild ? (await fetchUser(guild, find))?.user : await fetchUserFromClient(common.client, find)
}

const generateFileName = (cmd: string, userId: string, ext: string = "txt") => `garbage-files/${cmd}-${userId}.${ext}`

const cmdFileName = (data: TemplateStringsArray, ...template: string[]) => generateFileName(data[0]?.trim() ?? "CMD", template[0] ?? String(Math.random()), data[1]?.trim())

/**
    * @description escapes all special characters in a regex
*/
function escapeRegex(str: string) {
    let finalString = ""
    let escaped = false
    for (let i = 0; i < str.length; i++) {
        let char = str[i]
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

function rgbToHex(r: int_t, g: int_t, b: int_t) {
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`
}

function generateSafeEvalContextFromMessage(msg: Message) {
    return { uid: msg.member?.id, uavatar: msg.member?.avatar, ubannable: msg.member?.bannable, ucolor: msg.member?.displayColor, uhex: msg.member?.displayHexColor, udispname: msg.member?.displayName, ujoinedAt: msg.member?.joinedAt, ujoinedTimeStamp: msg.member?.joinedTimestamp, unick: msg.member?.displayName, ubot: msg.author.bot, Units: units }
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
        context = Object.create(Math)
    }
    for (const key of Reflect.ownKeys(Math)) {
        context[key as string] = Math[key as keyof typeof Math]
    }

    Object.entries({
        yes: true,
        false: false,
        efd,
        rgbToHex,
        escapeRegex,
        randomColor,
        randomHexColorCode,
        mulStr,
        choice,
        Pipe,
        mimeTypeToFileExtension,
        searchList,
        renderHTML: htmlRenderer.renderHTML,
        generateCommandSummary,
        romanToBase10,
        findClosest,
        base10ToRoman,
        rotN,
        clamp,
        user_options: {
            formatMoney: formatMoney,
            getOpt: getOpt
        },
        ...iterators
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
    let img
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

async function getImgFromMsgAndOptsAndReply(opts: Opts | Options, msg: Message, stdin?: CommandReturn, pop?: boolean) {
    let img = getImgFromMsgAndOpts(opts, msg, stdin, pop)
    if (!img && msg.reference) {
        let m = await msg.fetchReference()
        img = getImgFromMsgAndOpts(opts, m)
    }
    return img
}

const GOODVALUE = Symbol("GOODVALUE")
const BADVALUE = Symbol("BADVALUE")

/**
    * @description for expect methods in ArgList when it should keep going until the arglist is exausted
*/
function truthy() {
    return true
}

type AmountOfArgs = int_t | ((arg: string, index: number, argsUsed: number) => typeof GOODVALUE | typeof BADVALUE | true | false)
class ArgList extends Array {
    #i: number
    #curArg: string | null
    constructor(args: string[], public IFS = " ") {
        super(args.length)
        for (let index in args) {
            Reflect.set(this, index, args[index])
        }
        this.#i = NaN
        this.#curArg = null
    }
    resplit(newSplit: string) {
        return new ArgList(this.join(this.IFS).split(newSplit))
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
            //TODO: remove this, probably breaks a lot of stuff
            //causes overlap
            this.back()
        }
        return argsToUse
    }
    /**
        * @description runs an expect function and temporarily changes the ifs to newIfs
    */
    expectWithIfs<T extends (...args: any[]) => any>(newIfs: char_t, expecter: T, ...args: Parameters<T>) {
        let oldIfs = this.IFS
        this.IFS = newIfs
        let data = expecter.bind(this)(...args)
        this.IFS = oldIfs
        return data as ReturnType<T>
    }
    expect<T>(amountOfArgs: AmountOfArgs, filter: (i: string[]) => typeof GOODVALUE | typeof BADVALUE | T) {
        // this.#checkCurArg()
        let argsToUse = this.#createArgList(amountOfArgs)
        let res = filter.bind(this)(argsToUse);
        if (res !== false && res !== BADVALUE) {
            return res === GOODVALUE ? this.#curArg as string : res
        }
        return BADVALUE
    }
    async expectAsync<T>(amountOfArgs: AmountOfArgs, filter: (i: string[]) => typeof GOODVALUE | typeof BADVALUE | T) {
        // this.#checkCurArg()
        let argsToUse = this.#createArgList(amountOfArgs)
        let res = await filter(argsToUse);
        if (res !== BADVALUE && res !== false) {
            return res === GOODVALUE ? this.#curArg : res
        }
        return BADVALUE
    }
    expectOneOf(amountOfArgs: AmountOfArgs, list: string[]) {
        return this.expect(amountOfArgs, i => {
            const idx = list.indexOf(i.join(" "))
            if (idx === -1) {
                return false
            }
            return list[idx]
        })
    }
    expectList(splitter: string, amountOfListItems: number = 1, sized = false) {
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
        }, () => {
            if (resArr.length < amountOfListItems && sized) return BADVALUE
            return resArr.map(v => v.slice(0, -1))
        }) as string[] | typeof BADVALUE
    }
    expectUnknownSizedList(splitter: string) {
        let resArr: string[] = []
        let curItem = 0
        return this.expect(arg => {
            if (resArr[curItem] === undefined) {
                resArr[curItem] = ""
            }
            if (arg === splitter) {
                curItem++;
            }
            else if (arg.includes(splitter)) {
                let [last, ...rest] = arg.split(splitter)
                resArr[curItem] += last + this.IFS
                if (rest.length) {
                    rest[rest.length - 1] += this.IFS
                    resArr = resArr.concat(rest)
                }
                curItem = resArr.length - 1
            }
            else resArr[curItem] += arg + this.IFS
            return true
        }, () => resArr.map(v => v.slice(0, -1))
        )
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
    expectFloat(amountOfArgs: AmountOfArgs = 1) {
        return this.expect(amountOfArgs, i => i.join(this.IFS).match(/^\d+(?:\.\d+)?/) ? parseFloat(i[0]) : BADVALUE)
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

    getString<TDefault>(key: string, default_: TDefault, toString: (v: string | boolean) => string = String): string | TDefault {
        let n = super.get(key)
        if (n === undefined || n === true) return default_
        return toString(n) || default_
    }

    getRange<TDefault>(key: string, default_: TDefault, toRange: (v: string) => [number, number] = parseRangeString) {
        let n = super.get(key)
        if (n === undefined || n === true) return default_
        return toRange(n) || default_
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
        for (let i = 0; i < result.files.length; i++) {
            let file = result.files[i]
            if (existsSync(file.attachment))
                res += end + fs.readFileSync(file.attachment, "base64")
        }
    }
    if (result.embeds) {
        for (let i = 0; i < result.embeds.length; i++) {
            res += `${end}${JSON.stringify(result.embeds[i].toJSON())}`
        }
    }
    return res
}


function generateDocSummary(name: string, command: CommandV2 | AliasV2 | MatchCommand) {
    let summary = generateCommandSummary(name, command)
    summary += htmlRenderer.renderHTML(`<br><br><b>docs</b><br>${command['help']?.['docs'] || ""}`)
    return summary
}

function generateCommandSummary(name: string, command: CommandV2 | AliasV2 | MatchCommand) {
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

function generateTextFromCommandHelp(name: string, command: CommandV2 | AliasV2 | MatchCommand) {
    let helpData = command.help

    let nameInfo = htmlRenderer.renderHTML("<h1>Usage</h1>") + "\n" + generateCommandSummary(name, command)

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
        textInfo += htmlRenderer.renderHTML(`<h1>Docs</h1>` + helpData.docs) + '\n\n'
    }
    if (helpData.accepts_stdin) {
        argInfo += "# Stdin\n"
        if (typeof helpData.accepts_stdin === 'string') {
            argInfo += htmlRenderer.renderHTML(helpData.accepts_stdin, 2)
        }
        else {
            argInfo += 'true'
        }
        argInfo += '\n'
    }
    if (helpData.arguments) {
        argInfo += htmlRenderer.renderHTML("<h1>Arguments</h1>") + "\n"
        for (let arg in helpData.arguments) {
            argInfo += `* **${arg}**`
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
            argInfo += `:\n\t${htmlRenderer.renderELEMENT(html("*")[0], 1).trim()}`
            //we want exactly 1 new lines
            if (!argInfo.endsWith("\n")) {
                argInfo += "\n"
            }
        }
    }
    if (helpData.options) {
        optInfo += htmlRenderer.renderHTML("<h1>Options</h1>") + "\n"
        for (let op in helpData.options) {
            optInfo += `* **-${op}**`
            if (helpData.options[op].default) {
                optInfo += ` (default: ${helpData.options[op].default})`
            }
            optInfo += ': '
            optInfo += htmlRenderer.renderHTML(helpData.options[op].description, 1).trim() + "\n"
            if (helpData.options[op].alternatives) {
                optInfo += `\t\t-- alternatives: ${helpData.options[op].alternatives?.join(" ")}\n`
            }
        }
    }
    if (helpData.tags?.length) {
        tagInfo += `__Tags__:\n${helpData.tags.join(", ")}\n`
    }
    return (nameInfo + "\n\n" + textInfo + aliasInfo + argInfo + optInfo + tagInfo).replace("\n\n\n", "\n")
}

function generateHTMLFromCommandHelp(name: string, command: CommandV2) {
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
                let alternates = options[option].alternatives
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

function randInt(min: number, max: number) {
    return Math.random() * (max - min) + min
}

export {
    randInt,
    strToCommandCat,
    fetchUser,
    fetchChannel,
    generateFileName,
    createGradient,
    applyJimpFilter,
    rgbToHex,
    safeEval,
    mulStr,
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
    Enum,
    defer,
    truthy,
    entriesOf,
    valuesOf,
    keysOf,
    randomHexColorCode,
    getImgFromMsgAndOptsAndReply,
    titleStr,
    romanToBase10,
    countOf,
    prettyJSON,
    escapeRegex,
    iterGenerator,
    iterAsyncGenerator,
    fetchRoleFromServer,
    base10ToRoman,
    rotN,
    formatMember,
    searchMsg,
    clamp,
    binStrToDec,
    fracBinStrToDec,
}

