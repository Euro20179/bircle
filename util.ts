import cheerio = require("cheerio")

const vm = require('vm')
const fs = require('fs')

import { Client, Guild, Message, MessageEmbed } from "discord.js"

import globals = require("./globals")

const { execFileSync } = require('child_process')
const { vars, setVar, aliases, prefix, BLACKLIST, WHITELIST } = require("./common.js")

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

function* cycle(iter: any, onNext: Function) {
    for (let i = 0; true; i++) {
        onNext(i)
        yield iter[i % iter.length]
    }
}

function randomColor() {
    let colors = []
    for (let i = 0; i < 3; i++) {
        colors.push(Math.floor(Math.random() * 256))
    }
    return colors
}

function choice(list: Array<any> | string) {
    return list[Math.floor(Math.random() * list.length)]
}

function mulStr(str: string, amount: number) {
    let ans = ""
    for (let i = 0; i < amount; i++) {
        ans += str
    }
    return ans
}

async function fetchChannel(guild: Guild, find: string) {
    let channels = await guild.channels.fetch()
    let channel = channels.filter(channel => `<#${channel?.id}>` == find || channel?.id == find || channel?.name == find || channel?.name?.indexOf(find) > -1).at(0)
    return channel
}

async function fetchUserFromClient(client: Client, find: string) {
    if (!client.guilds.cache.at(0)) {
        return undefined
    }
    return await fetchUser(client.guilds.cache.at(0) as Guild, find)
}

async function fetchUser(guild: Guild, find: string) {
    let res;
    if (res = find?.match(/<@!?(\d{18})>/)) {
        find = res[1]
    }
    await guild.members.fetch()
    let user = (await guild.members.search({ query: find }))?.at(0)
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

function format(str: string, formats: { [key: string]: string }, doPercent?: boolean, doBraces?: boolean) {
    if (doBraces === undefined) doBraces = true
    if (doPercent === undefined) doPercent = true
    for (let fmt in formats) {
        if (fmt.length > 1) {
            str = str.replaceAll(`{${fmt}}`, formats[fmt])
        }
        else {
            let unescaped = fmt
            fmt = escapeRegex(fmt)
            str = str.replaceAll(new RegExp(`((?<!%)%${fmt}|(?<!\\\\)\\{${fmt}\\})`, "g"), formats[unescaped])
        }
    }
    return str
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
    return { uid: msg.member?.id, uavatar: msg.member?.avatar, ubannable: msg.member?.bannable, ucolor: msg.member?.displayColor, uhex: msg.member?.displayHexColor, udispname: msg.member?.displayName, ujoinedAt: msg.member?.joinedAt, ujoinedTimeStamp: msg.member?.joinedTimestamp, unick: msg.member?.nickname, ubot: msg.author.bot }
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
    context['yes'] = true
    context['no'] = false
    context['rgbToHex'] = rgbToHex
    context['escapeRegex'] = escapeRegex
    context['escapeShell'] = escapeShell
    context['randomColor'] = randomColor
    context['mulStr'] = mulStr
    context['choice'] = choice
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
    }
}

function getImgFromMsgAndOpts(opts: Opts, msg: Message) {
    let img = opts['img']
    if (msg.attachments?.at(0)) {
        //@ts-ignore
        img = msg.attachments.at(0)?.attachment
    }
    //@ts-ignore
    else if (msg.reply?.attachments?.at(0)) {
        //@ts-ignore
        img = msg.reply.attachments.at(0)?.attachment
    }
    else if (msg.embeds?.at(0)?.image?.url) {
        //@ts-ignore
        img = msg.embeds?.at(0)?.image?.url
    }
    else if (!img) {
        //@ts-ignore
        img = msg.channel.messages.cache.filter((m) => m.attachments?.last()?.size ? true : false)?.last()?.attachments?.first()?.attachment
    }
    return img
}

function getOpts(args: ArgumentList) {
    let opts = {}
    let newArgs = []
    let idxOfFirstRealArg = 0
    for (let arg of args) {
        idxOfFirstRealArg++
        if (arg[0] == "-") {
            if (arg[1] && arg[1] === '-') {
                break
            }
            if (arg[1]) {
                let [opt, ...value] = arg.slice(1).split("=")
                //@ts-ignore
                opts[opt] = value[0] == undefined ? true : value.join("=");
            }
        } else {
            idxOfFirstRealArg--
            break
        }
    }
    for (let i = idxOfFirstRealArg; i < args.length; i++) {
        newArgs.push(args[i])
    }
    return [opts, newArgs]
}

async function handleSending(msg: Message, rv: CommandReturn) {
    if (!Object.keys(rv).length) {
        return
    }
    //by default delete files that are being sent from local storage
    if (rv.deleteFiles === undefined) {
        rv.deleteFiles = true
    }
    if (rv.delete && msg.deletable) {
        msg.delete().catch(_err => console.log("Message not deleted"))
    }
    if (rv.noSend) {
        return
    }
    //if the content is > 2000 (discord limit), send a file instead
    if ((rv.content?.length || 0) >= 2000) {
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
    if (!rv?.content) {
        //if content is empty string, delete it so it shows up as undefined to discord, so it wont bother trying to send an empty string
        delete rv['content']
    }
    else {
        //if not empty, save in the _! variable
        setVar("_!", rv.content, msg.author.id)
        setVar("_!", rv.content)
    }
    //the place to send message to
    let location = msg.channel
    if (rv['dm']) {

        //@ts-ignore
        location = msg.author
    }
    try {
        await location.send(rv)
    }
    catch (err) {
        console.log(err)
        //usually happens when there is nothing to send
        await location.send("broken")
    }
    //delete files that were sent
    if (rv.files) {
        for (let file of rv.files) {
            if (file.delete !== false && rv.deleteFiles && fs.existsSync(file.attachment))
                fs.rmSync(file.attachment)
        }
    }
}

function getContentFromResult(result: CommandReturn) {
    let res = ""
    if (result.content)
        res += result.content + "\n"
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

function generateTextFromCommandHelp(name: string, command: Command) {
    let text = `***${name}***:\n\n`
    let helpData = command.help
    if (!helpData)
        return text
    if (helpData.info) {
        text += `**${cheerio.load(helpData.info).text()}**\n\n`
    }
    if (helpData.aliases) {
        text += `Aliases: ${helpData.aliases.join(", ")}\n`
    }
    if (helpData.arguments) {
        text += "__Arguments__:\n"
        for (let arg in helpData.arguments) {
            text += `\t* **${arg}**`
            if (helpData.arguments[arg].required !== false) {
                text += " (required) "
            }
            if (helpData.arguments[arg].requires) {
                text += ` (required: ${helpData.arguments[arg].requires}) `
            }
            text += `:\n\t\t- ${cheerio.load(helpData.arguments[arg].description).text()}\n`
        }
        text += "\n"
    }
    if (helpData.options) {
        text += "__Options__:\n"
        for (let op in helpData.options) {
            text += `\t* **-${op}**: ${cheerio.load(helpData.options[op].description).text()}\n`
            if (helpData.options[op].alternates) {
                text += `\t\t-- alternatives: ${helpData.options[op].alternates?.join(" ")}\n`
            }
        }
        text += "\n"
    }
    if (helpData.tags?.length) {
        text += `__Tags__:\n${helpData.tags.join(", ")}\n`
    }
    return text.replace("\n\n\n", "\n")
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
        if (args !== {}) {
            html += `<h2 class="command-arguments">Arguments</h2><ul class="command-argument-list">`
            for (let argName in args) {
                let argument = args[argName].description
                let required = args[argName].required || false
                let requires = args[argName].requires || ""
                let extraText = ""
                if (requires) {
                    extraText = `<span class="requires">requires: ${requires}</span>`
                }
                html += `<li class="command-argument" data-required="${required}">
    <details class="command-argument-details-label" data-required="${required}" title="required: ${required}"><summary class="command-argument-summary" data-required="${required}">${argName}&nbsp;</summary>${argument}<br>${extraText}</details>
    </li>`
            }
            html += "</ul>"
        }
        if (options !== {}) {
            html += `<h2 class="command-options">Options</h2><ul class="command-option-list">`
            for (let option in options) {
                let desc = options[option].description || ""
                let alternates = options[option].alternates || 0
                let requiresValue = options[option].requiresValue || false
                html += `<li class="command-option">
    <span class="command-option-details-label" title="requires value: ${requiresValue}"><summary class="command-option-summary">-${option}&nbsp</summary> ${desc}</details>`
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
        if (aliases !== []) {
            html += `<h2 class="command-aliases">Aliases</h2><ul class="command-alias-list">`
            for (let alias of aliases) {
                html += `<li class="command-alias">${alias}</li>`
            }
            html += "</ul>"
        }
    }
    return `${html}</div><hr>`
}


export {
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
    handleSending,
    fetchUserFromClient,
    generateSafeEvalContextFromMessage,
    choice,
    getContentFromResult,
    generateHTMLFromCommandHelp,
    generateTextFromCommandHelp,
}

