import cheerio = require("cheerio")
import { spawnSync } from "child_process"

const vm = require('vm')
const fs = require('fs')

import { Client, EmbedFieldData, Guild, GuildMember, Message, MessageEmbed } from "discord.js"
import { client } from "./common"
import { AliasV2, CommandCategory } from "./common_to_commands"

import globals = require("./globals")
import { formatMoney, getOpt } from "./user-options"

const { execFileSync, exec } = require('child_process')
const { vars, setVar, aliases, prefix, BLACKLIST, WHITELIST, getVar } = require("./common.js")

function isSafeFilePath(fp: string) {
    if (fp.match(/\/?\.\.\//)) {
        return false
    }
    else if (fp.match(/[^A-Z_a-z0-9\.,-]/)) {
        return false
    }
    return true
}

function createEmbedFieldData(name: string, value: string, inline?: boolean): EmbedFieldData {
    return { name: name, value: value, inline: inline ?? false }
}

/**
    * @description Creates an array of embedfielddata
*/
function efd(...data: [string, string, boolean?][]) {
    return listComprehension<[string, string, boolean?], [string, string, boolean?][], EmbedFieldData>(data, i => createEmbedFieldData(i[0], i[1], i[2] ?? false))
}

class LengthUnit {
    value: number

    /**
        * @abstract
    */
    static shorthand: string = "units"

    /**
        * @abstract
    */
    static longname: string = "units"

    constructor(value: number) {
        this.value = value
    }

    static fromUnitName(name: string): typeof LengthUnit {
        let convTable: { [key: string]: typeof LengthUnit } = {}
        for (let unit of Object.values(Units)) {
            convTable[unit.shorthand] = unit
            convTable[unit.longname] = unit
        }
        //@ts-ignore
        return Reflect.get(convTable, name, convTable) ?? Yard
    }

    static fromUnitRepr(repr: `${number}${string}`) {
        let numberPart = ""
        let unitPart = ""
        for (let ch of repr) {
            if (!"0123456789".includes(ch)) {
                unitPart += ch
            }
            else {
                numberPart += ch
            }
        }
        return new (this.fromUnitName(unitPart))(Number(numberPart))
    }

    /**
        * @abstract
    */
    yards(): number {
        return 0
    }

    toUnit(cls: typeof LengthUnit) {
        let inYards = this.yards()
        let amountOfUnitsInYards = (new cls(1)).yards()
        return new cls(inYards / amountOfUnitsInYards)
    }
}

class AstronomicalUnit extends LengthUnit {
    static longname = 'astronomicalunit'
    static shorthand = 'AU'
    yards() {
        return this.value * 92955807.267433 * 1760
    }
}

class Mile extends LengthUnit {
    static longname = "mile"
    static shorthand = "mi"
    yards() {
        return this.value * 1760
    }
}

class Yard extends LengthUnit {
    static longname = "yard"
    static shorthand = "yd"
    yards() {
        return 1
    }
}

class Foot extends LengthUnit {
    static longname = "foot"
    static shorthand = "ft"
    yards() {
        return this.value / 3
    }
}

class MetricFoot extends LengthUnit {
    static longname = 'metricfoot'
    static shorthand = 'metricft'
    yards() {
        return (new Inch(11.811)).toUnit(Foot).value / 3
    }
}

class Inch extends LengthUnit {
    static longname = "inch"
    static shorthand = "in"
    yards() {
        return this.value / 3 / 12
    }
}

class Kilometer extends LengthUnit {
    static longname = 'kilometer'
    static shorthand = 'km'
    yards() {
        return (new Meter(this.value * 1000)).yards()
    }
}

class Hectometer extends LengthUnit {
    static longname = 'hectometer'
    static shorthand = 'hm'
    yards() {
        return (new Meter(this.value * 100)).yards()
    }
}


class Dekameter extends LengthUnit {
    static longname = 'dekameter'
    static shorthand = 'dam'
    yards() {
        return (new Meter(this.value * 10)).yards()
    }
}

class Meter extends LengthUnit {
    static longname = 'meter'
    static shorthand = 'm'
    yards() {
        return (new Centimeter(this.value * 100)).yards()
    }
}

class Decimeter extends LengthUnit {
    static longname = 'decimeter'
    static shorthand = 'dm'
    yards() {
        return (new Centimeter(this.value * 10)).yards()
    }
}

class Centimeter extends LengthUnit {
    static longname = "centimeter"
    static shorthand = "cm"
    yards() {
        return this.value / 2.54 / 36
    }
}

class Millimeter extends LengthUnit {
    static longname = 'millimeter'
    static shorthand = 'mm'
    yards() {
        return (this.value / 10) / 2.54 / 36
    }
}

class Micrometer extends LengthUnit {
    static longname = 'micrometer'
    static shorthand = 'µm'
    yards() {
        return (this.value / 100) / 2.54 / 36
    }
}

class Nanometer extends LengthUnit {
    static longname = 'nanometer'
    static shortname = 'nm'
    yards() {
        return (this.value / 1000) / 2.54 / 36
    }
}

class Horse extends LengthUnit {
    static longname = 'horse'
    static shorthand = 'horse'
    yards() {
        return (new Foot(this.value * 8)).yards()
    }
}

class Hand extends LengthUnit {
    static longname = "hand"
    static shorthand = "hand"

    yards() {
        return (new Inch(this.value * 4)).yards()
    }
}

class ValveSourceHammer extends LengthUnit {
    static longname = "ValveSourcehammer"
    static shorthand = "VShammer"
    yards() {
        return this.value / 3 / 16
    }
}

class Mickey extends LengthUnit {
    static longname = 'Mickey'
    static shorthand = 'Mickey'
    yards() {
        return this.value / 16000 / 36
    }
}

class Smoot extends LengthUnit {
    static longname = 'Smoot'
    static shorthand = 'Smoot'
    yards() {
        return (new Centimeter(170)).yards()
    }
}

class Footballfield extends LengthUnit {
    static longname = 'footballfield'
    static shorthand = 'footballfield'
    yards() {
        return this.value * 100
    }
}

class Minecraftblock extends LengthUnit {
    static longname = 'Minecraftblock'
    static shorthand = 'MCblock'
    yards() {
        return (new Meter(this.value * 100)).yards()
    }
}


class Lightyear extends LengthUnit {
    static longname = 'lightyear'
    static shorthand = 'lighty'
    yards() {
        return (new AstronomicalUnit(this.value * 63241.08)).yards()
    }
}

class Lightmonth extends LengthUnit {
    static longname = 'lightmonth'
    static shorthand = 'lightm'
    yards() {
        return (new Lightyear(this.value / 12.175)).yards()
    }
}

class Lightweek extends LengthUnit {
    static longname = 'lightweek'
    static shorthand = 'lightw'
    yards() {
        return (new Lightmonth(this.value * .233333333333333333333333)).yards()
    }
}

class Lightday extends LengthUnit {
    static longname = 'lightday'
    static shorthand = 'lightd'
    yards() {
        return (new Lightweek(this.value / 7)).yards()
    }
}

class Lighthour extends LengthUnit {
    static longname = 'lighthour'
    static shorthand = 'lightH'
    yards() {
        return (new Lightday(this.value / 24)).yards()
    }
}

class Lightminute extends LengthUnit {
    static longname = 'lightminute'
    static shorthand = 'lightM'
    yards() {
        return (new Lighthour(this.value / 60)).yards()
    }
}

class Lightsecond extends LengthUnit {
    static longname = 'lightsecond'
    static shorthand = 'lightS'
    yards() {
        return (new Lightminute(this.value / 60)).yards()
    }
}

const Units = {
    LengthUnit,
    AstronomicalUnit,
    Mile,
    Yard,
    Foot,
    Inch,
    Hand,
    ValveSourceHammer,
    MetricFoot,
    Centimeter,
    Millimeter,
    Micrometer,
    Nanometer,
    Meter,
    Kilometer,
    Decimeter,
    Dekameter,
    Hectometer,
    Horse,
    Mickey,
    Smoot,
    Footballfield,
    Minecraftblock,
    Lightmonth,
    Lightyear,
    Lightweek,
    Lightday,
    Lighthour,
    Lightminute,
    Lightsecond
}


function parsePercentFormat(string: string, replacements?: { [key: string]: string }) {
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
            formats.push(replacements[char] || char)
        }
        else {
            formats.push(char)
        }
        //skip past char
        string = string.slice(1)
    }
    return formats
}

function formatPercentStr(string: string, replacements: { [key: string]: string }) {
    let ploc = -1;
    let newStr = ""
    while ((ploc = string.indexOf("%")) > -1) {
        newStr += string.slice(0, ploc)
        string = string.slice(ploc + 1)
        let char = string[0]
        if (char === undefined)
            break
        if (char !== "%") {
            newStr += replacements[char] ?? `%${char}`
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

function formatBracePairs(string: string, replacements: { [key: string]: string }, pair = "{}", recursion = true) {
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
                newStr += replacements[inner] ?? `${pair[0]}${formatBracePairs(inner, replacements, pair, recursion)}${pair[1]}`
            }
            else {
                newStr += replacements[inner] ?? `${pair[0]}${inner}${pair[1]}`
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
        return string
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

function* enumerate<T>(iterable: T[]): Generator<[number, T]> {
    for (let i = 0; i < iterable.length; i++) {
        yield [i, iterable[i]]
    }
}

function* range(start: number, stop: number, step: number = 1) {
    for (let i = start; i < stop; i += step) {
        yield i
    }
}

function listComprehension<T, TList extends Iterable<T>, TReturn>(l: TList, fn: (i: T) => TReturn): TReturn[] {
    let newList = []
    for (let item of l) {
        newList.push(fn(item))
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

async function fetchUserFromClient(client: Client, find: string) {
    let user = client.users.cache.find((v, k) => {
        return v.username.toLowerCase() === find || v.username.toLowerCase().startsWith(find) || v.id === find || `<@${v.id}>` === find || `<@!${v.id}>` === find
    })
    return user
}

async function fetchUser(guild: Guild, find: string) {
    let res;
    if (res = find?.match(/<@!?(\d{18})>/)) {
        find = res[1]
    }
    find = find.toLowerCase()
    let user = guild.members.cache.find((v, k) => {
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
        if (!user) {
            fetchUserFromClient(client, find)
        }
    }
    return user
}

function generateFileName(cmd: string, userId: string) {
    return `${cmd}::${userId}.txt`
}

function downloadSync(url: string) {
    return execFileSync(`curl`, ['--silent', url])
}

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

function format(str: string, formats: { [key: string]: string }, recursion = false) {
    return formatPercentStr(formatBracePairs(str, formats, "{}", recursion), formats)
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

//@ts-ignore
async function applyJimpFilter(img, filter, arg) {
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
    return { uid: msg.member?.id, uavatar: msg.member?.avatar, ubannable: msg.member?.bannable, ucolor: msg.member?.displayColor, uhex: msg.member?.displayHexColor, udispname: msg.member?.displayName, ujoinedAt: msg.member?.joinedAt, ujoinedTimeStamp: msg.member?.joinedTimestamp, unick: msg.member?.nickname, ubot: msg.author.bot, Units: Units }
}

function safeEval(code: string, context: { [key: string]: any }, opts: any) {

    let resultKey = 'SAFE_EVAL_' + Math.floor(Math.random() * 1000000)
    //@ts-ignore
    context[resultKey] = {}
    //@ts-ignore
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
        mul_t: weirdMulStr,
        choice,
        Units,
        Pipe,
        parseBracketPair,
        parsePercentFormat,
        formatPercentStr,
        formatBracePairs,
        searchList,
        renderHTML,
        getOpts,
        user_options: {
            formatMoney: formatMoney,
            getOpt: getOpt
        },
    }).forEach(v => context[v[0]] = v[1])
    try {
        vm.runInNewContext(code, context, opts)
        //@ts-ignore
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
    switch (cat) {
        case 0:
            return "util"
        case 1:
            return "game"
        case 2:
            return "fun"
        case 3:
            return "meta"
        case 4:
            return "images"
        case 5:
            return "economy"
        case 6:
            return "voice"
        case 7:
            return "admin"
        case 8:
            return "match"
    }
}

function getImgFromMsgAndOpts(opts: Opts, msg: Message) {
    let img = opts['img']
    if (msg.attachments?.at(0)) {
        //@ts-ignore
        img = msg.attachments.at(0)?.attachment
    }
    else if (msg.stickers?.at(0)) {
        //@ts-ignore
        img = msg.stickers.at(0).url as string
    }
    else if (msg.embeds?.at(0)?.image?.url) {
        //@ts-ignore
        img = msg.embeds?.at(0)?.image?.url
    }
    else if (!img || img == true) {
        //@ts-ignore
        img = msg.channel.messages.cache.filter((m) => m.attachments?.last()?.size ? true : false)?.last()?.attachments?.first()?.attachment
    }
    return img
}

const GOODVALUE = Symbol("GOODVALUE")
const BADVALUE = Symbol("BADVALUE")

type AmountOfArgs = number | ((arg: string, index: number, argsUsed: number) => boolean)
class ArgList extends Array {
    #i: number
    #curArg: string | null
    constructor(args: string[]) {
        super(args.length)
        for (let index in args) {
            Reflect.set(this, index, args[index])
        }
        this.#i = NaN
        this.#curArg = null
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
    #createArgList(amountOfArgs: AmountOfArgs) {
        let argsToUse = []
        if (typeof amountOfArgs === 'number') {
            this.advance()
            argsToUse = listComprehension(range(this.#i, this.#i + amountOfArgs), (i: number) => this[i])
        }
        else {
            while (this.advance() && amountOfArgs(this.#curArg as string, this.#i, argsToUse.length)) {
                argsToUse.push(this.#curArg)
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
        if ((res = filter(argsToUse)) !== BADVALUE) {
            return res === GOODVALUE ? this.#curArg : res
        }
        return null
    }
    async expectAsync<T>(amountOfArgs: AmountOfArgs, filter: (i: string[]) => typeof GOODVALUE | typeof BADVALUE | T) {
        if (this.#curArg === null) {
            throw new Error("beginIter must be run before this function")
        }
        let argsToUse = this.#createArgList(amountOfArgs)
        let res;
        if ((res = (await filter(argsToUse))) !== BADVALUE) {
            return res === GOODVALUE ? this.#curArg : res
        }
        return null
    }
    expectOneOf(amountOfArgs: AmountOfArgs, list: string[]) {
        return this.expect(amountOfArgs, i => {
            list.includes(i.join(" "))
        })
    }
    expectString(amountOfArgs: AmountOfArgs = 1) {
        return this.expect(amountOfArgs, i => i.join(" "))
    }
    expectInt(amountOfArgs: AmountOfArgs = 1) {
        return this.expect(amountOfArgs, i => i.join(" ").match(/^\d+$/) ? parseInt(i[0]) : BADVALUE)
    }
    expectBool(amountOfArgs: AmountOfArgs = 1) {
        return this.expect(amountOfArgs, i => {
            let s = i.join(" ").toLowerCase()
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
            let s = i.join(" ")
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
    //@ts-ignore
    get<T>(key: string, default_: T, assert: (v: any) => undefined | any = (_v) => _v) {
        let rv = Reflect.get(this, key, this)
        return assert(rv) ?? default_
    }

    getString(key: string, default_: string, toString: (v: string | boolean) => string = String): string {
        let n = super.get(key)
        if (n !== undefined && n !== true) {
            n = toString(n)
            if (n) {
                return n
            }
            return default_
        }
        return default_
    }

    getNumber(key: string, default_: number, toNumber: (v: string) => number = Number): number {
        let n = super.get(key)
        if (n !== undefined) {
            let number = toNumber(n)
            if (!isNaN(number)) {
                return number
            }
            return default_
        }
        return default_
    }
    getBool(key: string, default_: boolean, toBoolean: (v: any) => boolean = Boolean): boolean {
        let v = super.get(key)
        if (v !== undefined) {
            let bool = toBoolean(v)
            return bool
        }
        return default_
    }
}

function getOpts(args: ArgumentList): [Opts, ArgumentList] {
    let opts = {}
    let arg, idxOfFirstRealArg = -1;
    while ((arg = args[++idxOfFirstRealArg])?.startsWith("-")) {
        if (arg[1]) {
            let [opt, ...value] = arg.slice(1).split("=")
            if (opt === '-') {
                //needs to be increased one more time
                idxOfFirstRealArg++
                break
            }
            //@ts-ignore
            opts[opt] = value[0] == undefined ? true : value.join("=");
        }
    }
    return [opts, args.slice(idxOfFirstRealArg)]
}

function getContentFromResult(result: CommandReturn, end = "") {
    let res = ""
    if (result.content)
        res += result.content + end
    if (result.files) {
        for (let file of result.files) {
            res += fs.readFileSync(file.attachment, "base64") + "\n"
        }
    }
    if (result.embeds) {
        for (let embed of result.embeds) {
            res += `${JSON.stringify(embed.toJSON())}\n`
        }
    }
    return res
}

function renderElementChildren(elem: cheerio.Element, indentation = 0) {
    let text = ""

    if (elem.type == "text")
        return elem.data
    else if (elem.type == "comment")
        return ""

    for (let child of elem.children) {
        if (child.type === "text") {
            text += child.data?.replaceAll(/\s+/g, " ")
        }
        else if (child.type === "tag") {
            text += renderELEMENT(child, indentation)
        }
    }
    return text
}

function renderLiElement(elem: cheerio.Element, indentation = 0, marker = "*\t") {
    if (elem.type === "text" || elem.type === "comment") {
        return ""
    }
    marker = Object.entries(elem.attribs).filter(v => v[0] === "marker")?.[0]?.[1] ?? marker
    return "\t".repeat(indentation) + marker + renderElementChildren(elem, indentation + 1) + "\n"
}

function renderUlElement(elem: cheerio.Element, indentation = 0, marker = "*\t") {
    let text = ""
    if (elem.type === "text" || elem.type === "comment") {
        return ""
    }

    marker = Object.entries(elem.attribs).filter(v => v[0] === "marker")?.[0]?.[1] ?? marker
    for (let child of elem.children) {
        if (child.type === "tag") {
            if (child.name === "li") {
                text += renderLiElement(child, indentation + 1, marker)
            }
        }
        else if (child.type === "text") {
            text += child.data?.replaceAll(/\s+/g, " ")
        }
    }
    return text
}

function renderLHElement(elem: cheerio.Element, indentation = 0) {
    return `__${renderElementChildren(elem, indentation)}__`
}

function renderBElement(elem: cheerio.Element, indentation = 0) {
    return `**${renderElementChildren(elem, indentation)}**`
}

function renderIElement(elem: cheerio.Element, indentation = 0) {
    return `*${renderElementChildren(elem, indentation)}*`
}
function renderSElement(elem: cheerio.Element, indentation = 0) {
    return `~~${renderElementChildren(elem, indentation)}~~`
}

function renderAElement(elem: cheerio.TagElement, indentation = 0) {
    let href = Object.entries(elem.attribs).filter(v => v[0] === "href")?.[0]?.[1] ?? ""
    return `[${renderElementChildren(elem)}](${href})`
}

function renderBlockcodeElement(elem: cheerio.TagElement, indentation = 0) {
    return `> ${renderElementChildren(elem)}`
}

function renderCodeElement(elem: cheerio.Element, indentation = 0) {
    let text = "`"
    if (elem.type === "text" || elem.type === "comment") {
        return ""
    }

    let lang = Object.entries(elem.attribs).filter(v => v[0] === "lang")?.[0]?.[1]
    if (lang) {
        text += `\`\`${lang}\`\`\n`
    }
    text += renderElementChildren(elem, indentation)
    if (lang) {
        text += "\n``"
    }
    return text + "`"
}

function renderPElement(elem: cheerio.TagElement, indentation = 0) {
    return `\n${renderElementChildren(elem, indentation)}\n`
}

function renderELEMENT(elem: cheerio.Element, indentation = 0) {
    let text = ""
    if (elem.type === "tag") {
        if (elem.name === "br") {
            text += `\n${"\t".repeat(indentation)}`
        }
        else if (elem.name === "ul") {
            text += `\n${renderUlElement(elem, indentation)}${"\t".repeat(indentation)}`
        }
        else if (elem.name === "a") {
            text += renderAElement(elem, indentation)
        }
        else if (elem.name === "lh") {
            text += renderLHElement(elem, indentation)
        }
        else if (elem.name === "code") {
            text += renderCodeElement(elem, indentation)
        }
        else if (elem.name === "blockquote") {
            text += renderBlockcodeElement(elem, indentation)
        }
        else if (["strong", "b"].includes(elem.name)) {
            text += renderBElement(elem, indentation)
        }
        else if (["i"].includes(elem.name)) {
            text += renderIElement(elem, indentation)
        }
        else if (["del"].includes(elem.name)) {
            text += renderSElement(elem, indentation)
        }
        else if (elem.name === "p") {
            text += renderPElement(elem, indentation)
        }
        else {
            for (let child of elem.children ?? []) {
                text += renderELEMENT(child, indentation)
            }
        }
    }
    if (elem.type === "text") {
        text += elem.data?.replaceAll(/\s+/g, " ")
    }
    return text

}

function renderHTML(text: string, indentation = 0) {
    let h = cheerio.load(text)("body")[0]
    return renderELEMENT(h, indentation)
}

function generateCommandSummary(name: string, command: Command | CommandV2 | AliasV2 | MatchCommand) {
    let summary = `***${name}***`

    if (command.help?.options) {
        summary += ` [-options...]`
    }

    for (let arg in command.help?.arguments) {
        let argData = command.help?.arguments[arg]
        if (argData?.required !== false) {
            summary += ` <${arg}>`
        }
        else {
            summary += ` [${arg}`;
            if (argData.default) {
                summary += ` (${argData.default})`
            }
            summary += ']'
        }
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
        textInfo = "\n\n" + renderHTML(helpData.info) + "\n\n"
    }
    if (helpData.aliases) {
        aliasInfo = `Aliases: ${helpData.aliases.join(", ")}\n`
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
            argInfo += `:\n\t\t- ${renderELEMENT(html("*")[0], 2).trim()}`
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
            optInfo += renderHTML(helpData.options[op].description, 2).trim()
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

function generateHTMLFromCommandHelp(name: string, command: any) {
    let html = `<div class="command-section"><h1 class="command-title">${name}</h1>`
    let help = command["help"]
    if (help) {
        let info = help["info"] || ""
        let aliases = help["aliases"] || []
        let options = help["options"] || {}
        let args = help["arguments"] || {}
        if (info !== "") {
            html += `<h2 class="command-info">Info</h2><p class="command-info">${info}</p>`
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
    <details class="command-argument-details-label" data-required="${required}" title="required: ${required}"><summary class="command-argument-summary" data-required="${required}">${argName}&nbsp; (default: ${default_})</summary>${argument}<br>${extraText}</details>
    </li>`
            }
            html += "</ul>"
        }
        if (options && Object.keys(options).length) {
            html += `<h2 class="command-options">Options</h2><ul class="command-option-list">`
            for (let option in options) {
                let desc = options[option].description || ""
                let alternates = options[option].alternates || 0
                // let requiresValue = options[option].requiresValue || false
                let default_ = options[option]["default"] || ""
                html += `<li class="command-option">
    <summary class="command-option-summary" title="default: ${default_}">-${option}&nbsp</summary> ${desc}</details>`
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
        if (aliases) {
            html += `<h2 class="command-aliases">Aliases</h2><ul class="command-alias-list">`
            for (let alias of aliases) {
                html += `<li class="command-alias">${alias}</li>`
            }
            html += "</ul>"
        }
    }
    return `${html}</div><hr>`
}

function weirdMulStr(text: string[], ...count: string[]) {
    return mulStr(text.join(" "), Number(count[0]) ?? 1)
}

function searchList(search: string, list_of_strings: string[]) {
    let results: { [key: string]: number } = {}
    for (let str of list_of_strings) {
        let lastMatch = 0;
        let matchIndicies: number[] = []
        for (let i = 0; i < search.length; i++) {
            // let foundMatch = false
            for (let j = lastMatch; j < str.length; j++) {
                if (str[j] === search[i]) {
                    matchIndicies.push(j)
                    lastMatch = j
                    // accuracy += (j - i) * sequence * (file.length - j)
                    // sequence += 1
                    // foundMatch = true
                    // break
                }
                // else if(i === j)
                //     sequence = 1
            }
            // if(!foundMatch){
            //     accuracy -= file.length
            //     sequence = 1
            // }
        }
        let total = 0
        for (let i = 1; i < matchIndicies.length; i++) {
            if (matchIndicies[i] - matchIndicies[i - 1] === 0) {
                continue
            }
            total += matchIndicies.length / (matchIndicies[i] - matchIndicies[i - 1])
        }
        results[str] = total
    }
    return results
}

function strToCommandCat(category: string) {
    let catNum;

    switch (category.toLowerCase()) {
        case "meta":
            catNum = CommandCategory.META
            break;
        case "util":
            catNum = CommandCategory.UTIL
            break;
        case "game":
            catNum = CommandCategory.GAME; break;
        case "fun":
            catNum = CommandCategory.FUN; break;
        case "image": catNum = CommandCategory.IMAGES; break;
        case "economy": catNum = CommandCategory.ECONOMY; break;
        case "voice": catNum = CommandCategory.VOICE; break;
        case "admin": catNum = CommandCategory.ADMIN; break;
        case "match": catNum = CommandCategory.MATCH; break;
        default: catNum = -1
    }
    return catNum
}

export {
    strToCommandCat,
    fetchUser,
    fetchChannel,
    generateFileName,
    downloadSync,
    format,
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
    getOpts,
    fetchUserFromClient,
    generateSafeEvalContextFromMessage,
    choice,
    getContentFromResult,
    generateHTMLFromCommandHelp,
    generateTextFromCommandHelp,
    Pipe,
    getFonts,
    intoColorList,
    renderHTML,
    parseBracketPair,
    Options,
    Units,
    formatPercentStr,
    parsePercentFormat,
    formatBracePairs,
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
    isSafeFilePath
}

