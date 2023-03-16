import fs from 'fs'
import https from 'https'
import cheerio from 'cheerio'

import fetch = require('node-fetch')

import { Stream } from 'stream'

import globals = require("../globals")
import economy from '../economy'
import pet from "../pets"
import timer from '../timer'

import htmlRenderer from '../html-renderer'

import { Collection, ColorResolvable, Guild, GuildEmoji, GuildMember, Message, ActionRowBuilder, ButtonBuilder, EmbedBuilder, Role, TextChannel, User, ButtonStyle } from 'discord.js'
import { StatusCode, lastCommand, handleSending, CommandCategory, commands, registerCommand, createCommandV2, createHelpOption, createHelpArgument, getCommands, generateDefaultRecurseBans, getAliasesV2, getMatchCommands, AliasV2, aliasesV2, ccmdV2, cmd, crv } from '../common_to_commands'
import { choice, cmdCatToStr, fetchChannel, fetchUser, format, generateFileName, generateTextFromCommandHelp, getContentFromResult, getOpts, mulStr, Pipe, safeEval, Units, BADVALUE, efd, generateCommandSummary, fetchUserFromClient, ArgList, GOODVALUE, parseBracketPair, MimeType, generateHTMLFromCommandHelp, mimeTypeToFileExtension, getToolIp, generateDocSummary, listComprehension, isMsgChannel, fetchUserFromClientOrGuild } from '../util'

import vars from '../vars'
import { addToPermList, ADMINS, BLACKLIST, client, prefix, removeFromPermList } from '../common'
import { spawn, spawnSync } from 'child_process'
import { getOpt } from '../user-options'
import { isNaN } from 'lodash'

export default function*(CAT: CommandCategory): Generator<[string, Command | CommandV2]> {

    yield ['school-stats', ccmdV2(async function({ msg, args, opts }) {
        let ip;
        if (fs.existsSync("./data/ip.key")) {

            ip = fs.readFileSync("./data/ip.key");
        }
        if (!ip) {
            return { content: "Euro has yet to add a special file", status: StatusCode.ERR }
        }

        let toFetch = opts.getString("of", msg.author.id)
        let user: User | undefined = msg.author;
        if (toFetch !== msg.author.id) {
            if (msg.guild) {
                user = (await fetchUser(msg.guild, toFetch))?.user
            }
            else {
                user = await fetchUserFromClient(client, toFetch)
            }
            if (!user) {
                user = msg.author
            }
        }

        let res;
        try {
            res = await fetch.default(`http://${ip}`, { method: "POST", body: JSON.stringify({ "id": user.id }), headers: { "Content-Type": "application/json" } })
        }
        catch (err) {
            return crv("Could not fetch data", { status: StatusCode.ERR })
        }
        let data
        try {
            data = await res.json()
        }
        catch (err) {
            return crv("Could not get json", { status: StatusCode.ERR })
        }
        let embed = new EmbedBuilder()
        embed.setTitle(`School stats of ${user.username}`)
        embed.setColor(msg.member?.displayColor || "NotQuiteBlack")
        embed.addFields(efd(["smarts", String(data.smarts)], ["charm", String(data.charm)], ["guts", String(data.guts)], ["money", String(data.money)], ["job", String(data.job?.name ?? "None")], ["grade", String(data.grade)]))
        return { embeds: [embed], status: StatusCode.RETURN }
    }, "School stats", {
        helpOptions: {
            of: createHelpOption("The user to get stats of")
        }
    })]

    yield ["cat", ccmdV2(async ({ stdin, opts, args }) => {
        let content = "";
        if (stdin) {
            content += getContentFromResult(stdin, "\n")
        }
        let folder = opts.getBool("g", false) ? "garbage-files" : "command-results"
        for (let arg of args) {
            if (fs.existsSync(`./${folder}/${arg}`)) {
                content += fs.readFileSync(`./${folder}/${arg}`, "utf-8")
            }
        }
        if (!content) {
            return { content: "No content", status: StatusCode.ERR }
        }
        if (opts.getBool("r", false) || opts.get("reverse", false) || opts.get("tac", false)) {
            content = content.split("\n").reverse().join("\n")
        }
        return { content: content, status: StatusCode.RETURN }
    }, "Concatinate files from pipe, and from file names", {
        helpArguments: {
            files: createHelpArgument("Files listed in <code>command-file -l</code> to act on", false)
        },
        helpOptions: {
            r: createHelpOption("Reverse order of the lines"),
            g: createHelpOption("Open a file from garbage-files folder instead of command-results")
        },
        accepts_stdin: "Instead of files, act on the text from pipe"
    })]

    yield ["rev", ccmdV2(async ({ stdin, args, opts }) => {
        let content = "";
        if (stdin) {
            content += getContentFromResult(stdin, "\n").split("").reverse().join("")
        }
        for (let arg of args) {
            if (fs.existsSync(`./command-results/${arg}`)) {
                content += fs.readFileSync(`./command-results/${arg}`, "utf-8").split("").reverse().join("")
            }
        }
        if (!content) {
            return { content: "No content", status: StatusCode.ERR }
        }
        if (opts.getBool("r", false) || opts.get("reverse", false) || opts.get("tac", false)) {
            content = content.split("\n").reverse().join("\n")
        }
        return { content: content, status: StatusCode.RETURN }
    }, "Take input from pipe and reverse it", {
        helpArguments: {
            files: createHelpOption("Files listed in <code>command-file -l</code> to act on")
        },
        helpOptions: {
            r: createHelpOption("reverse the order of the lines")
        },
        accepts_stdin: "Instead of files, reverse content from stdin"
    })]

    yield ["pet-info", createCommandV2(async ({ msg, args }) => {
        let pet_type = pet.hasPetByNameOrType(msg.author.id, args.join(" "))
        if (!pet_type[1]) {
            return { content: `${args.join(" ").toLowerCase()} is not a pet`, status: StatusCode.RETURN }
        }
        let petInfo = pet_type[1]
        let petType = pet_type[0]
        let petTypeInfo = pet.getPetShop()[petType]
        let embed = new EmbedBuilder()
        embed.setTitle(petInfo.name || petType)
        embed.addFields([
            { name: "Favorite food", value: petTypeInfo['favorite-food'], inline: true },
            { name: "HP", value: `${petInfo.health} / ${petTypeInfo['max-hunger']}`, inline: true }
        ])
        return { embeds: [embed], status: StatusCode.RETURN }
    }, CommandCategory.UTIL, "Gets information about a pet", {
        pet: createHelpArgument("The pet to get info on", true)
    })]

    yield ["google", createCommandV2(async ({ args }) => {
        let baseUrl = "https://www.google.com/search?q=";
        let s: string = args.join("+");
        const url = baseUrl + s;
        let data = await fetch.default(url)
        const html = await data.text()
        const $ = cheerio.load(html)
        const links = $(".egMi0 > a").toArray()
        const urls: string[] = []
        for (let i = 0; i < links.length; i++) {
            let elem = links[i]
            if (elem.type === 'tag' && elem.tagName === 'a') {
                const href = elem.attribs.href
                urls.push(href.slice(7).split("&sa=")[0])
            }
        }
        //return {content: links.text(), status: StatusCode.RETURN}
        return { content: urls.join("\n"), status: StatusCode.RETURN }
    }, CommandCategory.UTIL, "Search google and get a list of urls")]

    yield [
        "has-role", createCommandV2(async ({ msg, argList }) => {
            argList.beginIter()
            let user = argList.advance()
            if (!user) {
                return { content: "No user given", status: StatusCode.ERR }
            }
            let role = await argList.expectRole(msg.guild as Guild, () => true) as Role | null
            if (!role) {
                return { content: "Could not find role", status: StatusCode.ERR }
            }
            if (!msg.guild) {
                return crv(`You must run this from a server`)
            }
            let member: GuildMember | undefined = await fetchUser(msg.guild, user)
            if (!member) {
                return { content: "No member found", status: StatusCode.ERR }
            }
            return { content: String(member.roles.cache.has(role.id)), status: StatusCode.RETURN }
        }, CommandCategory.UTIL, "Check if a user has a role", {
            user: createHelpArgument("The user to checK", true),
            role: createHelpArgument("The role to check", true)
        })
    ]

    yield [
        "units", createCommandV2(async ({ args, opts }) => {
            let roundTo = opts.getNumber("round-to", 10)
            if (opts.get("l", false)) {
                let compareToUnit = opts.getString("l", "yd")
                let units: [typeof Units.LengthUnit, number][] = []
                Object.entries(Units).forEach(kv => {
                    units.push([kv[1], Number((new kv[1](1)).toUnit(Units.LengthUnit.fromUnitName(compareToUnit)).value.toFixed(roundTo))])
                })
                return { content: units.sort((a, b) => a[1] - b[1]).map(v => `${v[0].longname} (${v[0].shorthand}) (${v[1]}${compareToUnit})`).join("\n"), status: StatusCode.RETURN }
            }
            if (args.length < 2) {
                return { content: "Command usage: `[units <number><unit> <convert-to-unit>`", status: StatusCode.ERR }
            }
            let number = Number(args[0])
            let unit;
            if (isNaN(number)) {
                unit = Units.LengthUnit.fromUnitRepr(args[0] as `${number}${string}`)
            }
            else {
                args = new ArgList(args.slice(1))
                unit = new (Units.LengthUnit.fromUnitName(args[0]))(number)
            }
            args = new ArgList(args.slice(1))
            for (let i = 0; i < args.length; i += 1) {
                unit = unit.toUnit(Units.LengthUnit.fromUnitName(args[i]))
            }
            //eval complains Units is not defined, but this works for some reason
            let unitRef = Units
            return { content: `${unit.value.toFixed(roundTo)}${eval(`unitRef.${unit.constructor.name}.shorthand`)}`, status: StatusCode.RETURN }
        }, CommandCategory.UTIL, "Converts a unit to a different unit", {
            unit1: createHelpArgument("The first unit in the form of &lt;amount&gt;&lt;unit&gt;"),
            to: createHelpArgument("The unit to convert to"),
            unit2: createHelpArgument("The unit to convert to (use -l to see a list of units)")
        }, {
            l: createHelpOption("List units and compare them to a unit", undefined, "yd"),
            "round-to": createHelpOption("Round to a certain number of decimals", undefined, "10")
        })
    ]

    yield [
        "help", createCommandV2(async ({rawOpts: opts, args }) => {

            const matchCmds = getMatchCommands()
            let commands = { ...Object.fromEntries(getCommands().entries()), ...matchCmds }
            if (opts["g"]) {
                let text = fs.readFileSync("./website/help-web.html", "utf-8")
                return {
                    status: StatusCode.RETURN,
                    content: text
                }
            }
            if (opts['l']) {
                let category = String(opts['l']) || "all"
                let catNum = -1
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
                    case "images": catNum = CommandCategory.IMAGES; break;
                    case "economy": catNum = CommandCategory.ECONOMY; break;
                    case "voice": catNum = CommandCategory.VOICE; break;
                    case "admin": catNum = CommandCategory.ADMIN; break;
                    case "match": catNum = CommandCategory.MATCH; break;
                }
                let rv = ""
                for (let cmd in commands) {
                    if (catNum == -1 || commands[cmd]?.category == catNum)
                        rv += `${cmd}: ${cmdCatToStr(commands[cmd]?.category)}\n`
                }
                return { content: rv, status: StatusCode.RETURN }
            }
            const aliasesV2 = getAliasesV2()
            let commandsToUse = { ...commands, ...aliasesV2 }
            if (args[0] && args[0] !== '?') {
                commandsToUse = {}
                for (let cmd of args) {
                    if (commands[cmd]) {
                        commandsToUse[cmd] = commands[cmd] as Command | CommandV2
                    }
                    else if (matchCmds[cmd]) {
                        commandsToUse[cmd] = matchCmds[cmd]
                    }
                    else if (aliasesV2[cmd]) {
                        commandsToUse[cmd] = aliasesV2[cmd]
                    }
                    else { continue }
                }
            }
            if (opts['json']) {
                return { content: JSON.stringify(commandsToUse), status: StatusCode.RETURN, mimetype: "application/json" }
            }
            let text = ""

            let fn: (string: string, cmd: typeof commandsToUse[string]) => string
            let mimetype: MimeType = "plain/markdown"
            if (opts['s']) {
                fn = function() { return generateCommandSummary(arguments[0], arguments[1]) + "\n---------------------\n" }
            }
            else if (opts['d']) {
                fn = function() { return generateDocSummary(arguments[0], arguments[1]) + "\n---------------------\n" }
            }
            else if (opts['html']) {
                fn = function() { return generateHTMLFromCommandHelp(arguments[0], arguments[1]) + "<br>" }
                mimetype = "text/html"
            }
            else {
                fn = generateTextFromCommandHelp
            }
            for (let command in commandsToUse) {
                text += fn(command, commandsToUse[command])
            }
            return crv(text, {
                mimetype: mimetype
            })
        }, CommandCategory.UTIL,
            "Get help with specific commands",
            {
                commands: createHelpArgument("The commands to get help on, seperated by a space<br>If command is ?, it will do all commands", false)
            },
            {
                "g": createHelpOption("List the bot syntax"),
                "s": createHelpOption("Only show a summary"),
                html: createHelpOption("Show html instead of markdown format")
            }
        ),
    ]

    yield [
        "clear-logs",
        {
            run: async (_msg, _args, sendCallback) => {
                for (let file of fs.readdirSync("./command-results/")) {
                    if (file.match(/log-\d+\.txt/)) {
                        fs.rmSync(`./command-results/${file}`)
                    }
                }
                return {
                    content: "Cleared Logs",
                    status: StatusCode.RETURN
                }
            }, category: CommandCategory.UTIL,
            permCheck: (m) => ADMINS.includes(m.author.id),
            help: {
                info: "Clears logs"
            }
        },
    ]

    yield [
        "ed", createCommandV2(async ({ msg, rawOpts: opts, args, recursionCount: rec, commandBans: bans }) => {
            if (!isMsgChannel(msg.channel)) return { noSend: true, status: StatusCode.ERR }
            if (globals.EDS[msg.author.id]) {
                return { content: "Ur already editing", status: StatusCode.ERR }
            }
            let mode: "normal" | "insert" = "normal"
            let canEdit: (string | undefined)[] = String(opts['editors']).split(",")
            canEdit.push(msg.author.id)
            for (let i = 0; i < canEdit.length; i++) {
                //@ts-ignore
                canEdit[i] = (await fetchUser(msg.guild, canEdit[i]))?.user.id || undefined
                if (canEdit[i] === undefined)
                    continue
                //@ts-ignore
                if (globals.EDS[canEdit[i]])
                    //@ts-ignore
                    canEdit[i] = undefined
            }
            canEdit = canEdit.filter(v => v)
            for (let ed of canEdit) {
                //@ts-ignore
                globals.EDS[ed] = true
            }
            function parseNormalEdInput(input: string) {
                let cmds = "qnaipgsdg!"
                let range = ""
                let startArgs = false
                let cmd = ""
                let args = ""
                for (let i = 0; i < input.length; i++) {
                    let ch = input[i]
                    if (cmds.includes(ch) && !startArgs) {
                        range += cmd + args
                        cmd = ch
                        args = ""
                    }
                    else if (ch === " " && !startArgs) {
                        startArgs = true
                    }
                    else if (!cmd) {
                        range += ch
                    }
                    else if (cmd) {
                        args += ch
                    }
                }
                return [range, cmd, args]
            }

            function getLinesFromRange(range: string) {
                let m
                if (!range)
                    return [currentLine]
                if (Number(range)) {
                    return [Number(range)]
                }
                else if (range === "$") {
                    return [text.length]
                }
                else if (range === ",") {
                    return text.map((_v, i) => i + 1)
                }
                else if (m = range.match(/^(\d*),(\d*)$/)) {
                    let start = Number(m[1]) || 0
                    let end = undefined
                    if (m[2]) {
                        end = Number(m[2])
                    }
                    return text.slice(start - 1, end).map((_v, i) => i + start)
                }
                else {
                    let [search, _, __] = createSedRegex(range)
                    if (search) {
                        let rgx
                        try {
                            rgx = new RegExp(search, "g")
                        }
                        catch (err) {
                            handleSending(msg, { status: StatusCode.ERR, content: "? Invalid regex'" })
                            return [currentLine]
                        }
                        let validLines = []
                        for (let i = 0; i < text.length; i++) {
                            if (text[i]?.match(rgx)) {
                                validLines.push(i + 1)
                            }
                        }
                        if (validLines.length) {
                            return validLines
                        }
                        return [currentLine]
                    }
                }
                return [currentLine]
            }

            function addTextAtPosition(text: string[], textToAdd: string, position: number) {
                let number = position
                let dataAfter = text.slice(number)
                text[number] = textToAdd
                text = text.concat(dataAfter)
                for (let i = 0; i < number; i++) {
                    if (text[i] === undefined)
                        text[i] = ""
                }
                currentLine = position + 1
                return text
            }

            function createSedRegex(str: string, buildReplace = false) {
                let searchRegex = ""
                let replaceWith = ""
                let flags = ""
                let delimiter = str[0]

                let escape = false
                let searchDone = false
                let replaceDone = false

                str = str.slice(1)
                for (let char of str) {
                    if (char == "\\") {
                        escape = true
                        continue
                    }
                    else if (char === delimiter && searchRegex && !escape) {
                        if (!buildReplace)
                            break
                        searchDone = true
                    }
                    else if (char === delimiter && searchDone && !escape) {
                        replaceDone = true
                    }
                    else if (!searchDone) {
                        if (escape) searchRegex += "\\"
                        searchRegex += char
                    }
                    else if (!replaceDone) {
                        if (escape) replaceWith += "\\"
                        replaceWith += char
                    }
                    else if (replaceDone) {
                        if (escape) flags += "\\"
                        flags += char
                    }
                    escape = false
                }
                return [searchRegex, replaceWith, flags]
            }

            async function handleTextInMode(textStr: string) {
                if (mode === "normal") {
                    let [range, cmd, cmdArgs] = parseNormalEdInput(textStr)
                    if (edCmds[cmd]) {
                        if (!(await edCmds[cmd](range, cmdArgs))) {
                            return false
                        }
                    }
                    else if (!isNaN(Number(range))) {
                        currentLine = Number(range)
                    }

                    else if (!opts['exec']) {
                        await handleSending(msg, { status: StatusCode.ERR, content: "?" })
                    }
                }
                else {
                    if (textStr === '.') {
                        mode = "normal"
                    }
                    else {
                        text = addTextAtPosition(text, textStr, currentLine)
                    }
                }
                return true
            }

            let text: string[] = []
            let currentLine = 0
            if (opts['text-after']) {
                let newArgs;
                [newArgs, ...text] = args.join(" ").split(String(opts['text-after']))
                args = new ArgList(newArgs.split(" "))
                text = text.join(String(opts['text-after'])).split("\n").map(v => v.trim())
                currentLine = text.length
            }
            let commandLines = [0]
            let edCmds: { [key: string]: (range: string, args: string) => any } = {
                i: async (range, args) => {
                    commandLines = getLinesFromRange(range)
                    if (args) {
                        text = addTextAtPosition(text, args, commandLines[0])
                    }
                    else {
                        mode = "insert"
                    }
                    return true
                },
                a: async (range, args) => {
                    commandLines = getLinesFromRange(range).map(v => v - 1 >= 0 ? v - 1 : 0)
                    if (args) {
                        text = addTextAtPosition(text, args, commandLines[0])
                    }
                    else {
                        mode = "insert"
                    }
                    return true
                },
                d: async (range, _args) => {
                    commandLines = getLinesFromRange(range).map(v => v - 1 >= 0 ? v - 1 : 0)
                    text = text.filter((_v, i) => !commandLines.includes(i))
                    if (text.length < currentLine)
                        currentLine = text.length
                    return true
                },
                p: async (range, _args) => {
                    commandLines = getLinesFromRange(range).map(v => v - 1)
                    let textToSend = ""
                    for (let line of commandLines) {
                        textToSend += text[line] + "\n"
                    }
                    await handleSending(msg, { status: StatusCode.INFO, content: textToSend })
                    return true
                },
                n: async (range, _args) => {
                    commandLines = getLinesFromRange(range).map(v => v - 1)
                    let textToSend = ""
                    for (let line of commandLines) {
                        textToSend += `${String(line + 1)} ${text[line]}\n`
                    }
                    await handleSending(msg, { status: StatusCode.INFO, content: textToSend })
                    return true
                },
                s: async (range, args) => {
                    commandLines = getLinesFromRange(range).map(v => v - 1)
                    let [searchRegex, replaceWith, flags] = createSedRegex(args, true)
                    let rgx
                    try {
                        rgx = new RegExp(searchRegex, flags)
                    }
                    catch (err) {
                        await handleSending(msg, { status: StatusCode.INFO, content: "? Invalid regex'" })
                        return true
                    }
                    for (let line of commandLines) {
                        let newText = text[line].replace(rgx, replaceWith)
                        text[line] = newText
                    }
                    return true
                },
                "!": async (range, args) => {
                    commandLines = getLinesFromRange(range).map(v => v - 1)
                    if (args) {
                        for (let i = 0; i < commandLines.length; i++) {
                            let textAtLine = text[commandLines[i]]
                            vars.setVar("__ed_line", textAtLine, msg.author.id)
                            let rv = (await cmd({ msg, command_excluding_prefix: args, recursion: rec, returnJson: true, disable: bans })).rv
                            let t = getContentFromResult(rv, "\n").trim()
                            vars.delVar("__ed_line", msg.author.id)
                            text[commandLines[i]] = t
                        }
                    }
                    return true
                },
                q: async () => {
                    return false
                }
            }

            if (opts['exec']) {
                for (let line of args.join(" ").split("\n")) {
                    if (!(await handleTextInMode(line))) {
                        break
                    }
                }
            }
            else {
                while (true) {
                    let m
                    try {
                        m = (await msg.channel.awaitMessages({ filter: m => canEdit.includes(m.author.id), max: 1, time: 60000, errors: ["time"] })).at(0)
                    }
                    catch (err) {
                        for (let ed in globals.EDS) {
                            delete globals.EDS[ed]
                        }

                        return { content: "Timeout", status: StatusCode.ERR }
                    }
                    if (!m) break
                    if (!(await handleTextInMode(m.content))) {
                        break
                    }
                }
            }
            for (let ed in globals.EDS) {
                delete globals.EDS[ed]
            }
            if (opts['s']) {
                return { noSend: true, status: StatusCode.RETURN }
            }
            return { content: text.join("\n"), status: StatusCode.RETURN }
        }, CommandCategory.UTIL, `The excellent unix ed command<br><lh>Modes</lh>
<ul>
    <li>normal</li>
    <li>insert</li>
</ul>
<b>Normal mode</b>
<p indent=1>
    The general way to use a normal mode command is<br>
    <code>[range]&lt;command&gt;[args...]</code><br>
    All commands are 1 character
</p>
<lh>commands</lh>
<ul>
    <li>
        <b>i</b>: enter insert mode on line <code>range</code><br>
        or the current line if not given.<br>
        if <code>args</code> are given, it will insert the args and stay in normal mode.
    </li>
    <li>
        <b>a</b>: enter insert mode at the end of the text because its broken
    </li>
    <li>
        <b>d</b>: delete <code>range</code> lines or the current line.
    </li>
    <li>
        <b>p</b>: print <code>range</code> lines or the current line.
    </li>
    <li>
        <b>n</b>: same as <b>p</b> and also numbers the lines.
    </li>
    <li>
        <b>s</b>: runs a find/replace on <code>range</code> liens or the current line.
    </li>
    <li>
        <b>!</b>: replaces <code>range</code> lines with the output of a bircle command.
    </li>
    <li><b>q</b>: quit</li>
</ul>
<b>Insert</b>
<p indent=1>
    To exit insert mode do <code>.</code>
</p>`, {
            "...exec": createHelpArgument("If -exec is given, treat arguments as ed commands")
        }, {
            "exec": createHelpOption("Treat arguments as ed commands")
        }
        ),
    ]

    yield [
        "stk", createCommandV2(async ({ msg, args, sendCallback }) => {
            https.get(`https://www.google.com/search?q=${encodeURI(args.join(" "))}+stock`, resp => {
                let data = new Stream.Transform()
                resp.on("data", chunk => {
                    data.push(chunk)
                })
                resp.on("end", async () => {
                    let html = data.read().toString()
                    let embed = new EmbedBuilder()
                    let stockData = html.match(/<div class="BNeawe iBp4i AP7Wnd">(.*?)<\/div>/)
                    if (!stockData) {
                        await handleSending(msg, { status: StatusCode.ERR, content: "No data found" }, sendCallback)
                        return
                    }
                    stockData = stockData[0]
                    let price = stockData.match(/>(\d+\.\d+)/)
                    if (!price) {
                        await handleSending(msg, { status: StatusCode.ERR, content: "No price found" }, sendCallback)
                        return
                    }
                    price = price[1]
                    let change = stockData.match(/(\+|-)(\d+\.\d+)/)
                    if (!change) {
                        await handleSending(msg, { status: StatusCode.ERR, content: "No change found" }, sendCallback)
                        return
                    }
                    change = `${change[1]}${change[2]}`
                    let numberchange = Number(change)
                    let stockName = html.match(/<span class="r0bn4c rQMQod">([^a-z]+)<\/span>/)
                    if (!stockName) {
                        await handleSending(msg, { status: StatusCode.ERR, content: "Could not get stock name" }, sendCallback)
                        return
                    }
                    stockName = stockName[1]
                    if (numberchange > 0) {
                        embed.setColor("Green")
                    }
                    else {
                        embed.setColor("Red")
                    }
                    embed.setTitle(stockName)
                    embed.addFields(efd(["Price", price]))
                    embed.addFields(efd(["Price change", change, true]))
                    await handleSending(msg, { status: StatusCode.RETURN, embeds: [embed] }, sendCallback)
                })
            }).end()
            return { content: "Getting data", status: StatusCode.INFO }
        }, CommandCategory.UTIL,
            "Gets the stock symbol for a stock"
        ),
    ]

    yield [
        "heist-info",
        {
            run: async (_msg, args, sendCallback) => {
                let action = args[0] || 'list-types'
                let text = ""
                let responses = fs.readFileSync("./command-results/heist", "utf-8").split("\n").map(v => v.split(":").slice(1).join(":").replace(/;END$/, "").trim())
                switch (action) {
                    case "list-responses": {
                        text = responses.join("\n")
                        break
                    }
                    case "locations":
                    case "list-locations": {
                        let locations: string[] = ["__generic__"]
                        for (let resp of responses) {
                            let location = resp.match(/(?<!SET_)LOCATION=([^ ]+)/)
                            let locationText = location?.[1]
                            if (locationText && !locations.includes(locationText)) {
                                locations.push(locationText)
                            }
                        }
                        text = `LOCATIONS:\n${locations.join("\n")}`
                        break
                    }
                    case "stages":
                    case "list-stages": {
                        let stages: string[] = ["getting_in", "robbing", "escape", "end"]
                        for (let resp of responses) {
                            let stage = resp.match(/STAGE=([^ ]+)/)
                            if (!stage?.[1]) continue;
                            let stageText = stage[1]
                            if (stageText && !stages.includes(stageText)) {
                                stages.push(stageText)
                            }
                        }
                        text = `STAGES:\n${stages.join("\n")}`
                        break
                    }

                    case "list-types": {
                        let locations: string[] = ["__generic__"]
                        let stages: string[] = ["getting_in", "robbing", "escape", "end"]
                        for (let resp of responses) {
                            let stage = resp.match(/STAGE=([^ ]+)/)
                            if (!stage?.[1]) continue;
                            let location = resp.match(/(?<!SET_)LOCATION=([^ ]+)/)
                            let locationText = location?.[1]
                            let stageText = stage[1]
                            if (locationText && !locations.includes(locationText)) {
                                locations.push(locationText)
                            }
                            if (stageText && !stages.includes(stageText)) {
                                stages.push(stageText)
                            }
                        }
                        text = `LOCATIONS:\n${locations.join("\n")}\n---------------------\nSTAGES:\n${stages.join("\n")}`
                        break
                    }
                    case "search": {
                        let query = args[1]
                        if (!query) {
                            text = "No search query"
                            break
                        }
                        let results = []
                        for (let i = 0; i < responses.length; i++) {
                            try {
                                if (responses[i].match(query)) {
                                    results.push([i + 1, responses[i]])
                                }
                            }
                            catch (err) {
                                return { content: `${query} is an invalid regular expression`, status: StatusCode.ERR }
                            }
                        }
                        text = `RESULTS\n-------------------------\n${results.map(v => `${v[0]}: ${v[1]}`).join("\n")}`
                        break
                    }
                    default: {
                        text = `${action} is not a valid action`
                        break
                    }
                }
                return { content: text.replaceAll(/__/g, "\\_") || "nothing", status: StatusCode.RETURN }
            }, category: CommandCategory.UTIL,
            help: {
                info: "Get information about heist responses",
                arguments: {
                    type: {
                        description: `The type of information can be:<br>
<ul>
    <li>list-locations</li>
    <li>list-stages</li>
    <li>list-responses</li>
    <li>list-types</li>
    <li>search (requires search query)</li>
</ul>`
                    },
                    search_query: {
                        requires: "type",
                        description: "The search query if type is <code>search</code>"
                    }
                }
            }
        },
    ]

    yield [
        "ustock",
        {
            run: async (msg, args, sendCallback) => {
                let user = args[1] || msg.author.id
                //@ts-ignore
                let member = await fetchUser(msg.guild, user)
                if (!member)
                    member = msg.member || undefined
                let stockName = args[0]
                return { content: JSON.stringify(economy.userHasStockSymbol(member?.user.id || "", stockName)), status: StatusCode.RETURN }
            }, category: CommandCategory.UTIL,
            help: {
                info: "Check if a user has a stock",
                arguments: {
                    stockName: {
                        description: "The stock to check if the user has"
                    },
                    user: {
                        description: "The user to check"
                    }
                }
            }
        },
    ]

    yield [
        "gapet", ccmdV2(async function({ args, msg }) {
            let user = await fetchUserFromClientOrGuild(args[0] || msg.author.id, msg.guild ?? undefined)
            if (!user) return crv(`Could not find user: ${args[0]}`, { status: StatusCode.ERR })
            return { content: String(pet.getActivePet(user.id || "")), status: StatusCode.RETURN }

        }, "Gets the current active pet of a user", {
            helpArguments: {
                user: createHelpArgument("The user to get the active pet of", false, undefined, "Yourself")
            }
        })
    ]

    yield [
        "sapet",
        {
            run: async (msg, args, sendCallback) => {
                let newActivePet = args[0]
                if (!pet.hasPetByNameOrType(msg.author.id, newActivePet)[1]) {
                    return { content: `You do not have a ${newActivePet}`, status: StatusCode.ERR }
                }
                if (pet.setActivePet(msg.author.id, newActivePet)) {
                    return { content: `Your new active pet is ${newActivePet}`, status: StatusCode.RETURN }
                }
                return { content: "Failed to set active pet", status: StatusCode.ERR }
            }, category: CommandCategory.UTIL,
            help: {
                info: "Sets your active pet",
                arguments: {
                    pet: createHelpArgument("The pet to set to")
                }
            }
        },
    ]

    yield [
        "surround-text", createCommandV2(async ({ args, opts, stdin }) => {
            let maxWidth = opts.getNumber("max-width", 50)
            let vertChar = opts.getString("vert-char", "|")
            let horChar = opts.getString("hor-char", "-")
            let text = stdin ? getContentFromResult(stdin, "\n").split("\n") : args.join(" ").split("\n")
            let lines = [horChar.repeat(maxWidth + 2)]
            //FIXME: make sure each $line_of_text is at most $maxWidth
            for (let line_of_text of text) {
                if (line_of_text.length > maxWidth) {
                    for (let i = 0; i < line_of_text.length + maxWidth; i += maxWidth) {
                        let t = line_of_text.slice(i, i + maxWidth)
                        lines.push(`${vertChar}${" ".repeat((maxWidth - t.length) / 2)}${t}${" ".repeat((maxWidth - t.length) / 2)}${vertChar}`)
                    }
                    continue
                }
                lines.push(`${vertChar}${" ".repeat((maxWidth - line_of_text.length) / 2)}${line_of_text}${" ".repeat((maxWidth - line_of_text.length) / 2)}${vertChar}`)

            }
            lines.push(horChar.repeat(maxWidth + 2))
            return { content: `\`\`\`\n${lines.join("\n")}\n\`\`\``, status: StatusCode.RETURN }
        }, CommandCategory.UTIL, "Surrounds text with a character"),
    ]

    yield [
        "align-table",
        createCommandV2(async ({ opts, args, stdin }) => {
            let align = opts.getString("align", "left")
            let raw = opts.getBool("raw", false)
            let columnCounts = opts.getBool("cc", false)
            let table = stdin ? getContentFromResult(stdin, "\n") : args.join(" ")
            let columnLongestLengths: { [key: number]: number } = {}
            let longestRow = 0
            let rows = table.split("\n")
            let finalColumns: string[][] = []
            for (let row of rows) {
                let columns = row.split("|")
                let nextColumn = []
                for (let i = 0; i < columns.length; i++) {
                    nextColumn.push(columns[i])
                    if (i > longestRow)
                        longestRow = i
                }
                finalColumns.push(nextColumn)
            }
            for (let row of finalColumns) {
                for (let i = row.length - 1; i < longestRow; i++) {
                    row.push("")
                }
            }
            if (raw) {
                return { content: `\\${JSON.stringify(finalColumns)}`, status: StatusCode.RETURN }
            }
            for (let row of finalColumns) {
                for (let i = 0; i < row.length; i++) {
                    if (!columnLongestLengths[i]) {
                        columnLongestLengths[i] = 0
                    }
                    if (row[i].length > columnLongestLengths[i]) {
                        columnLongestLengths[i] = row[i].length
                    }
                }
            }
            if (columnCounts) {
                let text = ""
                for (let i = 0; i < finalColumns[0].length; i++) {
                    text += `(col: ${i + 1}): ${columnLongestLengths[i]}\n`
                }
                return { content: text, status: StatusCode.RETURN }
            }
            let newText = "```"
            for (let row of finalColumns) {
                for (let i = 0; i < row.length; i++) {
                    let col = row[i].replace(/^\|/, "").replace(/\|$/, "")
                    let maxLength = columnLongestLengths[i]
                    if (maxLength == 0) {
                        continue
                    }
                    else {
                        newText += "|"
                    }
                    if (col.length < maxLength) {
                        if (col.match(/^-+$/)) {
                            col = mulStr("-", maxLength)
                        }
                        else {
                            if (align == "left")
                                col = col + mulStr(" ", maxLength - col.length)
                            else if (align == "right")
                                col = mulStr(" ", maxLength - col.length) + col
                            else if (align == "center")
                                col = mulStr(" ", Math.floor((maxLength - col.length) / 2)) + col + mulStr(" ", Math.ceil((maxLength - col.length) / 2))
                        }
                    }
                    newText += `${col}`
                }
                newText += '|\n'
            }
            return { content: newText + "```", status: StatusCode.RETURN }

        }, CommandCategory.UTIL, "Align a table", {
            table: createHelpArgument("The markdown formatted table to align, can be given through pipe")
        }, {
            align: createHelpOption("Align either: <code>left</code>, <code>center</code> or <code>right</code>"),
            raw: createHelpOption("Give a javascript list containing lists of columns"),
            cc: createHelpOption("Give the length of the longest column in each column")
        })
    ]

    yield [
        "abattle",
        {
            run: async (msg, args, sendCallback) => {
                let opts;
                [opts, args] = getOpts(args)
                let text = args.join(" ")
                let damageUsers = opts['damage'] || opts['d']
                let healUsers = opts['heal'] || opts['h']
                let amounts = ['huge', 'big', 'medium', 'small', 'tiny']
                let givenAmount = opts['amount'] || opts['a']
                if (typeof givenAmount !== 'string') {
                    return { content: `You must provide an amount (${amounts.join(", ")})`, status: StatusCode.ERR }
                }
                if (typeof damageUsers !== 'string' && typeof healUsers !== 'string') {
                    return { content: `You must provide a user to damage/heal`, status: StatusCode.ERR }
                }
                if (damageUsers !== undefined && typeof damageUsers !== 'string') {
                    return { content: "-damage must be a user number or all", status: StatusCode.ERR }
                }
                if (healUsers !== undefined && typeof healUsers !== 'string') {
                    return { content: "-heal must be a user number or all", status: StatusCode.ERR }
                }
                if (!amounts.includes(givenAmount)) {
                    return { content: `You did not provide a valid amount (${amounts.join(", ")})`, status: StatusCode.ERR }
                }
                let damageHealText = ""
                if (damageUsers) {
                    if (!damageUsers.match(/(?:(\d+|all),?)+/)) {
                        return { content: "Users must be numbers seperated by ,", status: StatusCode.ERR }
                    }
                    damageHealText += ` DAMAGE=${damageUsers}`
                }
                if (healUsers) {
                    if (!healUsers.match(/(?:(\d+|all),?)+/)) {
                        return { content: "Users must be numbers seperated by ,", status: StatusCode.ERR }
                    }
                    damageHealText += ` HEAL=${healUsers}`
                }
                fs.appendFileSync("./command-results/battle", `${msg.author.id}: ${text} AMOUNT=${givenAmount} ${damageHealText};END\n`)
                return { content: `Added\n${text} AMOUNT=${givenAmount} ${damageHealText}`, status: StatusCode.RETURN }
            }, category: CommandCategory.UTIL,
            help: {
                info: "Add a battle command with a nice ui ™️",
                arguments: {
                    "text": {
                        description: "The text to show<br>{user1} will be replaced with user1, {user2} with user2, etc..."
                    }
                },
                options: {
                    "heal": {
                        alternates: ['u'],
                        description: "The user(s) to heal"
                    },
                    "damage": {
                        alternates: ['d'],
                        description: "The user(s) to damage"
                    },
                    "amount": {
                        alternates: ["a"],
                        description: "The amount to damage/heal, (huge, big, medium, small, tiny)"
                    }
                }
            }
        },
    ]

    yield [
        "calcet",
        {
            run: async (msg, args, sendCallback) => {
                let opts;
                [opts, args] = getOpts(args)
                let fmt = String(opts['fmt'] || "Money: %m\nStocks: %s\nLoans: %l\n---------------------\nGRAND TOTAL: %t")
                let reqAmount = args.join(" ") || "all!"
                let { money, stocks, loan, total: _ } = economy.economyLooseGrandTotal()
                let moneyAmount = economy.calculateAmountOfMoneyFromString(msg.author.id, money, reqAmount)
                let stockAmount = economy.calculateAmountOfMoneyFromString(msg.author.id, stocks, reqAmount)
                let loanAmount = economy.calculateAmountOfMoneyFromString(msg.author.id, loan, reqAmount)
                let grandTotal = economy.calculateAmountOfMoneyFromString(msg.author.id, money + stocks - loan, reqAmount)
                return { content: format(fmt, { m: String(moneyAmount), s: String(stockAmount), l: String(loanAmount), t: String(grandTotal) }), status: StatusCode.RETURN }
            }, category: CommandCategory.UTIL,
            help: {
                info: "Calculate the net worth of the economy",
                options: {
                    "fmt": {
                        description: "The format<br><ul><li>m: The money</li><li>s: The stocks</li><li>l: The loans</li><li>t: total</li>"
                    }
                }
            }
        },
    ]

    yield [
        "calcm",
        {
            run: async (msg, args, sendCallback) => {
                let opts;
                [opts, args] = getOpts(args)
                let dollarSign = opts['sign'] || ""
                let as = opts['as'] || msg.author.id
                if (as && typeof as === 'string') {
                    //@ts-ignore
                    as = (await fetchUser(msg.guild, as))?.user.id
                }
                if (!as)
                    as = msg.author.id

                let amount = economy.calculateAmountFromString(String(as), args.join(" "), {
                    ticketmin: (total, _k, _data) => total * 0.005,
                    battlemin: (total, _k, _data) => total * 0.002
                })
                if (dollarSign === true) {
                    return { content: `${amount}`, status: StatusCode.RETURN }
                }
                return { content: `${dollarSign}${amount}`, status: StatusCode.RETURN }
            }, category: CommandCategory.UTIL,
            help: {
                info: "Calculate balance",
                arguments: {
                    amount: createHelpArgument("The amount to calculate", true),
                },
                options: {
                    sign: createHelpOption("The currency symbol"),
                    as: createHelpOption("Get the balance of a different user")
                }
            }
        },
    ]

    yield [
        "calcl",
        {
            run: async (msg, args, sendCallback) => {
                let opts;
                [opts, args] = getOpts(args)
                let dollarSign = opts['sign'] || ""
                let as = opts['as'] || msg.author.id
                if (as && typeof as === 'string') {
                    //@ts-ignore
                    as = (await fetchUser(msg.guild, as))?.user.id
                }
                if (!as)
                    as = msg.author.id
                let amount = economy.calculateLoanAmountFromString(String(as), args.join(" "))
                if (!amount) {
                    return { content: "None", status: StatusCode.RETURN }
                }
                if (dollarSign === true) {
                    return { content: `${amount}`, status: StatusCode.RETURN }
                }
                return { content: `${dollarSign}${amount}`, status: StatusCode.RETURN }
            }, category: CommandCategory.UTIL,
            help: {
                info: "Calculate loan",
                arguments: {
                    amount: createHelpArgument("The amount to calculate", true),
                },
                options: {
                    sign: createHelpOption("The currency symbol"),
                    as: createHelpOption("Get the loan of a different user")
                }
            }
        },
    ]


    yield [
        "calcms",
        {
            run: async (msg, args, sendCallback) => {
                let opts;
                [opts, args] = getOpts(args)
                let dollarSign = opts['sign'] || ""
                let as = opts['as'] || msg.author.id
                if (as && typeof as === 'string') {
                    //@ts-ignore
                    as = (await fetchUser(msg.guild, as))?.user.id
                }
                if (!as)
                    as = msg.author.id
                let amount = economy.calculateAmountFromNetWorth(String(as), args.join(" ").trim())
                if (dollarSign === true) {
                    return { content: `${amount}`, status: StatusCode.RETURN }
                }
                return { content: `${dollarSign}${amount}`, status: StatusCode.RETURN }
            }, category: CommandCategory.UTIL,
            help: {
                info: "Calculate total worth",
                arguments: {
                    amount: createHelpArgument("The amount to calculate", true),
                },
                options: {
                    sign: createHelpOption("The currency symbol"),
                    as: createHelpOption("Get the total worth of a different user")
                }
            }

        },
    ]

    yield [
        "calcam",
        {
            run: async (msg, args, sendCallback) => {
                let opts;
                [opts, args] = getOpts(args)
                let [moneyStr, ...reqAmount] = args
                let amountStr = reqAmount.join(" ")
                let money = Number(moneyStr)
                if (isNaN(money)) {
                    return { content: `${moneyStr} is not a number`, status: StatusCode.ERR }
                }
                let dollarSign = opts['sign'] || ""
                //the id here doesn't really matter since we're basing this off a predetermined number
                let amount = economy.calculateAmountOfMoneyFromString(msg.author.id, money, amountStr)
                if (dollarSign === true) {
                    return { content: `${amount}`, status: StatusCode.RETURN }
                }
                return { content: `${dollarSign}${amount}`, status: StatusCode.RETURN }
            }, category: CommandCategory.UTIL,
            help: {
                info: "Calculate an amount",
                arguments: {
                    total: createHelpArgument("The total to start with", true),
                    amount: createHelpArgument("The amount of the total to calculate", true)
                },
                options: {
                    sign: createHelpOption("The currency symbol", undefined, "")
                }
            }
        },
    ]

    yield [
        "aheist", createCommandV2(async ({ msg, args, rawOpts: opts}) => {
            let text = args.join(" ")
            let damageUsers = opts['lose'] || opts['l']
            let healUsers = opts['gain'] || opts['g']
            let amounts = ['none', 'normal', 'medium', 'large', "cents"]
            let givenAmount = opts['amount'] || opts['a']
            let stage = opts['stage'] || opts['s']
            let substage = opts['sub-stage'] || opts['ss']
            let isNeutral = Boolean(opts['neutral'])
            let location = opts['location']
            let set_location = opts['set-location']
            let button_response = opts['button-response']
            let condition = opts['if']
            if (isNeutral) {
                givenAmount = 'none'
                healUsers = 'all'
                //@ts-ignore
                damageUsers = undefined
            }
            let textOptions = ""
            if (typeof stage !== 'string') {
                return { content: `You did not provide a valid stage`, status: StatusCode.ERR }
            }
            if (typeof substage !== 'undefined' && typeof substage !== 'string') {
                return { content: "You did not provide a valid substage", status: StatusCode.ERR }
            }
            if (typeof givenAmount !== 'string') {
                return { content: `You must provide an amount (${amounts.join(", ")})`, status: StatusCode.ERR }
            }
            if (typeof damageUsers !== 'string' && typeof healUsers !== 'string') {
                return { content: `You must provide a user to lose/gain`, status: StatusCode.ERR }
            }
            if (damageUsers !== undefined && typeof damageUsers !== 'string') {
                return { content: "-lose must be a user number or all", status: StatusCode.ERR }
            }
            if (healUsers !== undefined && typeof healUsers !== 'string') {
                return { content: "-gain must be a user number or all", status: StatusCode.ERR }
            }
            if (!amounts.includes(givenAmount)) {
                return { content: `You did not provide a valid amount (${amounts.join(", ")})`, status: StatusCode.ERR }
            }
            if (damageUsers && healUsers) {
                return { content: "Only -lose or -gain can be given, not both", status: StatusCode.ERR }
            }
            if (damageUsers) {
                if (!damageUsers.match(/(?:(\d+|all),?)+/)) {
                    return { content: "Users must be numbers seperated by ,", status: StatusCode.ERR }
                }
                textOptions += ` LOSE=${damageUsers}`
            }
            if (healUsers) {
                if (!healUsers.match(/(?:(\d+|all),?)+/)) {
                    return { content: "Users must be numbers seperated by ,", status: StatusCode.ERR }
                }
                textOptions += ` GAIN=${healUsers}`
            }
            textOptions += ` STAGE=${stage}`
            if (substage) {
                textOptions += ` SUBSTAGE=${substage}`
            }
            if (location && typeof location === 'string') {
                textOptions += ` LOCATION=${location}`
            }
            if (set_location && typeof set_location === 'string') {
                textOptions += ` SET_LOCATION=${set_location}`
                if (button_response && typeof button_response === 'string') {
                    textOptions += ` BUTTONCLICK=${button_response} ENDBUTTONCLICK`
                }
            }
            if (condition && typeof condition === 'string') {
                textOptions += ` IF=${condition}`
            }
            fs.appendFileSync("./command-results/heist", `${msg.author.id}: ${text} AMOUNT=${givenAmount} ${textOptions};END\n`)
            return { content: `Added\n${text} AMOUNT=${givenAmount} ${textOptions}`, status: StatusCode.RETURN }
        }, CommandCategory.UTIL,
            "Add a heist prompt with a nice ui ™️",
            {
                "text": createHelpArgument("The text to show<br>{user1} will be replaced with user1, {user2} with user2, etc...<br>{userall} will be replaced with every user<br>{amount} will be replaced with the amount gained/losed<br>{+amount} will show amount with a + sign in front (even if it should  be negative), same thing with -<br>{=amount} will show amount with  no sign", true),
            },
            {
                "gain": createHelpOption("The user(s) to heal", ['g']),
                "lose": createHelpOption("The user(s) to damage", ['l']),
                "stage": createHelpOption("the stage of the game that the message is for (getting_in, robbing, escape)", ['s']),
                "amount": createHelpOption("The amount to gain/lose, (normal, medium, large)", ['a']),
                "location": createHelpOption("Specify the location that the response takes place at"),
                "set-location": createHelpOption("Specify the location that  the response takes you to<br>seperate locations with | for the user to choose where they want to go<br>(builtin locations: \\_\\_generic__, \\_\\_random\\_\\_)"),
                "button-response": createHelpOption("Specify the message sent after the button is clicked, if the user can chose the location<br>{location} will be replaced with the location the user picked<br>{user} will be replaced with  the user who clicked the button<br>If this is not given, nothing will be sent"),
                "sub-stage": createHelpOption("Specify the stage that happens after this response (builtin stages: getting_in, robbing, escape, end)"),
                "if": createHelpOption("Specify a condition in the form of &gt;x, &lt;x or =x, where x is the total amount of money gained/lost from heist<br>This response will only happen if the total amount of money is >, <, or = to x"),
            }
        ),
    ]

    yield [
        "periodic-table",
        {
            run: async (_msg, args, sendCallback) => {
                let opts;
                [opts, args] = getOpts(args)


                let reqElem = args.join(" ")

                if (opts['an'] || opts['n']) {
                    reqElem += `AtomicNumber=${opts['n']}`
                }

                if (!reqElem && !opts['r']) {
                    return { content: "No element requesed", status: StatusCode.ERR }
                }

                if (opts['refresh']) {
                    let data = await fetch.default("https://www.rsc.org/periodic-table/")
                    let text = await data.text()
                    let elementsData = text.match(/var elementsData = (.*);/)
                    if (!elementsData?.[1]) {
                        return { content: "Could not fetch data", status: StatusCode.ERR }
                    }
                    fs.writeFileSync("./data/elements.json", elementsData[1])
                }

                let elementsData = fs.readFileSync("./data/elements.json", "utf-8")
                let elementsJSON = JSON.parse(elementsData)["Elements"]

                let [attr, value] = reqElem.split("=").map(v => v.trim())
                let reqElementData;
                if (opts['r']) {
                    let count = Number(opts['r']) || 1
                    reqElementData = []
                    for (let i = 0; i < count; i++) {
                        reqElementData.push(choice(elementsJSON))
                    }
                }
                else {
                    reqElementData = elementsJSON.filter((v: any) => {
                        if (v[attr] !== undefined && String(v[attr]).trim().toLowerCase() === value.trim().toLowerCase()) {
                            return true
                        }
                        return v.Symbol.toLowerCase() === reqElem.toLowerCase() || v.Name.toLowerCase() === reqElem.toLowerCase()
                    })
                }
                if (!reqElementData.length) {
                    return { content: "No  element  found", status: StatusCode.ERR }
                }

                if (opts['list-attributes']) {
                    let text = ""
                    for (let attr in reqElementData[0]) {
                        text += `**${attr}**: ${reqElementData[0][attr]}\n`
                    }
                    return { content: text, status: StatusCode.RETURN }
                }


                let embeds = []
                let elementsNamesList = []
                for (let element of reqElementData) {
                    let embed = new EmbedBuilder()
                    elementsNamesList.push(`${element.Name} (${element.Symbol})`)
                    embed.setTitle(`${element.Name} (${element.Symbol})`)
                    embed.setDescription(`Discovered in ${element.DiscoveryYear == "0" ? "Unknown" : element.DiscoveryYear} by ${element.DiscoveredBy == "-" ? "Unknown" : element.DiscoveredBy}`)
                    embed.addFields(efd(["Atomic Number", String(element.AtomicNumber),], ["Atomic Mass", String(element.RelativeAtomicMass)], ["Melting Point C", String(element.MeltingPointC) || "N/A", true], ["Boiling Point C", String(element.BoilingPointC) || "N/A", true]))
                    embeds.push(embed)
                }
                if (embeds.length > 10 || opts['list-names']) {
                    return { content: elementsNamesList.join("\n"), status: StatusCode.RETURN }
                }
                return { embeds: embeds, status: StatusCode.RETURN }
            }, category: CommandCategory.UTIL,
            help: {
                info: "Get information on elements",
                arguments: {
                    "element_or_search": {
                        description: "Can either be a search, eg: ElementID=1<br>or an element, eg: h",
                        required: true
                    }
                },
                options: {
                    n: createHelpOption("Get the element with an atomic number", ["an"]),
                    "list-names": createHelpOption("List the names of all found elements"),
                    "r": createHelpOption("get n random elements", undefined, "if -r is used: 1"),
                    "list-attributes": createHelpOption("List all attributes of an element"),
                    refresh: createHelpOption("Refresh the periodic table")
                }
            }
        },
    ]

    yield [
        "rand-arg", createCommandV2(
            async ({ args }) => {
                return { content: choice(args), status: StatusCode.RETURN }
            },
            CommandCategory.UTIL,
            "Sends a random argument"
        )
    ]

    yield [
        "yt",
        {
            run: async (msg, _, sc, opts, args) => {
                let instance = 'https://vid.puffyan.us'

                let pageNo = Number(opts['page'] as string) || 1

                let res = await fetch.default(`${instance}/api/v1/search?q=${encodeURI(args.join(" "))}&page=${encodeURI(String(pageNo))}`)
                let jsonData = await res.json()

                let embeds: { embed: EmbedBuilder, button: ButtonBuilder, jsonButton: ButtonBuilder }[] = []
                let current_page = 0

                let valid_thumbnail_qualities = [
                    "maxres",
                    "maxresdefault",
                    "sddefault",
                    "high",
                    "medium",
                    "default",
                    "start",
                    "middle",
                    "end"
                ]
                let thumbnail_quality = valid_thumbnail_qualities.filter(v => v === opts['thumb-quality'])[0] || "high"


                if (opts['list']) {
                    let fmt = opts['list']
                    if (fmt == true) {
                        fmt = "%l\n"
                    }

                    let string = ""
                    for (let res of jsonData) {
                        string += format(fmt, { l: `https://www.youtube.com/watch?v=${res.videoId}` || "N/A", t: res.title || "N/A", c: res.author || "N/A", d: res.lengthSeconds || "N/A", v: res.viewCount || "N/A", u: res.publishedText || "N/A" })
                    }

                    return { content: string, status: StatusCode.RETURN }
                }

                let pages = jsonData.length
                let i = 0

                for (let res of jsonData) {
                    i++;

                    let e = new EmbedBuilder()
                    e.setTitle(String(res['title']))

                    if (res.description) {
                        e.setDescription(res.description)
                    }

                    e.setFooter({ text: `https://www.youtube.com/watch?v=${res.videoId}\n${i}/${pages}` })

                    //@ts-ignore
                    e.setImage(res.videoThumbnails?.filter(v => v.quality == thumbnail_quality)[0].url)

                    let button = new ButtonBuilder({ label: "OPEN", style: ButtonStyle.Link, url: `https://www.youtube.com/watch?v=${res.videoId}` })

                    let json_button = new ButtonBuilder({ label: "JSON", style: ButtonStyle.Secondary, customId: `yt.json:${res.videoId}` })

                    embeds.push({ embed: e, button: button, jsonButton: json_button })
                }

                let next_page = new ButtonBuilder({ customId: `yt.next:${msg.author.id}`, label: "NEXT", style: ButtonStyle.Primary })
                let last_page = new ButtonBuilder({ customId: `yt.back:${msg.author.id}`, label: "BACK", style: ButtonStyle.Secondary })

                let action_row = new ActionRowBuilder<ButtonBuilder>()
                action_row.addComponents(last_page, next_page, embeds[current_page].button, embeds[current_page].jsonButton)

                let m = await handleSending(msg, { components: [action_row], embeds: [embeds[current_page].embed], status: StatusCode.PROMPT }, sc)
                let collector = m.createMessageComponentCollector({ filter: int => int.user.id === msg.author.id })

                let to = setTimeout(collector.stop.bind(collector), 60000)
                collector.on("collect", async (int) => {
                    clearTimeout(to)
                    to = setTimeout(collector.stop.bind(collector), 60000)

                    if (int.customId.startsWith('yt.next')) {
                        current_page++;
                        if (current_page >= pages) {
                            current_page = 0
                        }
                    }

                    else if (int.customId.startsWith('yt.back')) {
                        current_page--;
                        if (current_page < 0) {
                            current_page = 0
                        }
                    }

                    else if (int.customId.startsWith("yt.json")) {
                        let yt_id = int.customId.split(":")[1]
                        //@ts-ignore
                        let json_data = jsonData.filter(v => v.videoId == yt_id)[0]
                        let fn = `${generateFileName("yt", msg.author.id)}.json`
                        fs.writeFileSync(fn, JSON.stringify(json_data))
                        int.reply({
                            files: [
                                {
                                    attachment: fn,
                                    name: fn,
                                }
                            ]
                        }).catch(console.error)
                        fs.rmSync(fn)
                        return
                    }

                    action_row.setComponents(last_page, next_page, embeds[current_page].button, embeds[current_page].jsonButton)

                    await m.edit({ components: [action_row], embeds: [embeds[current_page].embed] })
                    await int.deferUpdate()
                })
                if (opts['json']) {
                    return { content: Buffer.from(JSON.stringify(jsonData)).toString("base64"), status: StatusCode.RETURN }
                }
                return { noSend: true, status: StatusCode.RETURN }
            },
            category: CommandCategory.UTIL,
            help: {
                info: "Searches youtube with an invidious intance",
                arguments: {
                    "search": createHelpArgument("The search query", true)
                },
                options: {
                    page: createHelpOption("The page to search"),
                    "list": createHelpOption(`List the results
<br>
this can be set equal to a format which will be "%l\\n" by default
%l: link
%t: title
%c: author
%d: length in seconds
%v: view count
%u: upload date
`),
                    "json": createHelpOption("Send the resulting json result"),
                    "thumb-quality": createHelpOption(`The quality of the thumbnail,
<br>
Valid options:
maxres
maxresdefault
sddefault
high
medium
default
start
middle
`)

                }
            }
        },
    ]

    yield [
        'fetch-time',
        {
            run: async (msg, args) => {
                let url = args.join(" ") || "https://www.duckduckgo.com"
                try {
                    let start = Date.now()
                    await fetch.default(url, { timeout: 1500 })
                    return { content: `${Date.now() - start}ms`, status: StatusCode.RETURN }
                }
                catch (err) {
                    return { content: "Problem fetching ".concat(url), status: StatusCode.ERR }
                }
            }, category: CommandCategory.UTIL,
            help: {
                info: "Getss the ping to an ip (timeout after 1.5s)"
            }
        },
    ]

    yield [
        "replace", createCommandV2(async ({ args, stdin, opts }) => {
            let search = args[0]
            let repl: string = args[1]
            if (opts.getBool("n", false)) {
                repl = '\0'
            }
            else if (!repl) {
                return { content: "No replacement", status: StatusCode.ERR }
            }

            let restOfArgs = args.slice(1)
            if (repl !== '\0') {
                //remove one more time if there is a replacement
                restOfArgs = restOfArgs.slice(1)
            }

            let text: string = stdin ? getContentFromResult(stdin, "\n") : restOfArgs.join(" ")

            if (!search) {
                return { content: "no search", status: StatusCode.ERR }
            }
            if (!text) {
                return { content: "no text to search through", status: StatusCode.ERR }
            }
            let s: string | RegExp = search
            if (opts.getBool('r', false)) {
                try {
                    s = new RegExp(search, opts.getString("flags", "g"))
                }
                catch (err) {
                    return { content: `Invalid regex\n${err}`, status: StatusCode.ERR }
                }
            }
            if (repl === '\0') {
                repl = ""
            }
            return { content: text.replaceAll(s, repl || ""), status: StatusCode.RETURN }

        }, CAT, "Replaces a string with another string", {
            search: createHelpArgument("The search (1 arg)", true),
            replace: createHelpArgument("The replacement (1 arg)<br>if the -n option is given, this argument is not required", false),
            "...text": createHelpArgument("The text to search/replace through", true)
        }, {
            n: createHelpOption("No replace value"),
            r: createHelpOption("Enable regex")
        })
    ]

    yield [
        "string", createCommandV2(async ({ args }) => {
            let operation = args[0]
            let string = args.slice(1).join(" ")
            let operations: { [key: string]: (string: string) => string } = {
                upper: string => string.toUpperCase(),
                lower: string => string.toLowerCase(),
                title: string => string.split(" ").map(v => v[0].toUpperCase() + v.slice(1)).join(" "),
                lc: string => String(string.split("\n").length),
                wc: string => String(string.split(" ").length),
                bc: string => String(string.split("").length),
                "utf-8c": string => String([...string].length)
            }
            if (!string) {
                return { content: "No text to manipulate", status: StatusCode.ERR }
            }
            if (!Object.keys(operations).includes(operation.toLowerCase())) {
                return { content: `${operation} is not one of: \`${Object.keys(operations).join(", ")}\``, status: StatusCode.ERR }
            }
            return { content: operations[operation.toLowerCase()](string), status: StatusCode.RETURN }
        },
            CommandCategory.UTIL,
            "Do something to some text",
            {
                operation: createHelpArgument(`The operation to do<ul>
    <li>upper: convert to upper case</li>
    <li>lower: convert to lowercase</li>
    <li>title: convert to title</li>
    <li>lc:    get a line count</li>
    <li>wc:    get a word count</li>
    <li>bc:    get a byte count</li>
</ul>`),
                text: createHelpArgument("The text to operate on")
            }
        ),
    ]

    yield [
        "map",
        {
            run: async (msg, args, sendCallback, _, __, rec, bans) => {
                let string = args[0]
                let functions = args.slice(1).join(" ").split(">map>").map(v => v.trim())
                if (!functions) {
                    return { content: "nothing to  do", status: StatusCode.ERR }
                }
                for (let fn of functions) {
                    let replacedFn = fn.replaceAll("{string}", string)
                    if (replacedFn === fn) {
                        replacedFn = `${fn} ${string}`
                    }

                    string = getContentFromResult((await cmd({ msg, command_excluding_prefix: replacedFn, recursion: rec + 1, returnJson: true, disable: bans })).rv).trim()
                }
                return { content: string, status: StatusCode.RETURN }
            },
            category: CommandCategory.UTIL,
            help: {
                info: "Maps a string through various commands",
                arguments: {
                    string: {
                        description: "The first argument is the string to map"
                    },
                    "...maps": {
                        description: "After the first arg, is a command, {string} will be replaced with the current string<br>all maps after the first must start with <code>&gt;map&gt;</code>"
                    }
                }
            }
        },
    ]

    yield [
        "format-seconds", createCommandV2(async ({ args }) => {
            let amountOfTime = parseFloat(args[0])
            if (isNaN(amountOfTime)) {
                return { content: `Invalid command usage\n\`[format-seconds <seconds> <format>\``, status: StatusCode.ERR }
            }
            return { content: format(args.slice(1).join(" ") || "%H:%M:%S", { H: String(Math.floor((amountOfTime / (60 * 60)) % 24)), M: String(Math.floor((amountOfTime / 60) % 60)), S: String(Math.floor(amountOfTime % 60)), d: String((Math.floor(amountOfTime / (60 * 60 * 24)) % 7)) }), status: StatusCode.RETURN }
        }, CommandCategory.UTIL, "Convert seconds into days/hours/minutes/seconds",
            {
                seconds: createHelpArgument("The amount of seconds"),
                format: createHelpArgument("The format to use<br><b>Possible formats</b><ul><li>d: The amount of days</li><li>H: The amount of hours</li><li>M: The amount of minutes</li><li>S: The amount of seconds</li></ul>", false, undefined, "%H:%M:%S")
            }
        )
    ]

    yield [
        "time",
        {
            run: async (_msg, args, sendCallback) => {
                let fmt = args.join(" ")

                const date = new Date()
                let hours = date.getHours()
                let AMPM = hours < 12 ? "AM" : "PM"
                return {
                    content: fmt
                        .replaceAll("fdate", `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`)
                        .replaceAll("fulldate", `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`)
                        .replaceAll("date", `${date.getDate()}`)
                        .replaceAll("hour", `${hours}`)
                        .replaceAll("min", `${date.getMinutes()}`)
                        .replaceAll("sec", `${date.getSeconds()}`)
                        .replaceAll("time", `${hours}:${date.getMinutes()}:${date.getSeconds()}`)
                        .replaceAll("time-s", `${hours}:${date.getMinutes()}`)
                        .replaceAll("milli", `${date.getMilliseconds()}`)
                        .replaceAll("millis", `${date.getMilliseconds()}`)
                        .replaceAll("tz", `${date.getTimezoneOffset()}`)
                        .replaceAll("timezone", `${date.getTimezoneOffset()}`)
                        .replaceAll("ampm", AMPM)
                        .replaceAll("month", `${date.getMonth() + 1}`)
                        .replaceAll("year", `${date.getFullYear()}`)
                        .replaceAll("day", `${date.getDay()}`)
                        .replaceAll("unix", String(Date.now() / 1000)),
                    status: StatusCode.RETURN
                }
            },
            help: {
                info: "Gets the time",
                arguments: {
                    format: {
                        description: "the format to use for the time<br><lh>formats:</lh><br><ul><li>date: the date</li><li>hour: the hour of the day</li><li>min: minute of the day</li><li>time: hours:minutes:seconds</li><li>time-s hours:minutes</li><li>millis: milliseconds</li><li>tz: timezone</li><li>ampm: am or pm</li><li>fdate: full date (monthy/day/year)</li><li>month: month of the year</li><li>year: year of the year</li><li>day: day of the year</li><li>unix: unix time</li></ul>"
                    }
                }
            },
            category: CommandCategory.UTIL
        },
    ]

    yield [
        "rand-role",
        {
            run: async (msg, args, sendCallback) => {
                let roles = await msg.guild?.roles.fetch()
                let role = roles?.random()
                if (!role) {
                    return { content: "Couldn't get random role", status: StatusCode.ERR }
                }
                let fmt = args.join(" ") || "%n"
                return { allowedMentions: { parse: [] }, content: format(fmt, { n: role.name, i: role.id, c: String(role.color), C: String(role.createdAt), hc: role.hexColor, u: String(role.unicodeEmoji), p: String(role.position), I: String(role.icon) }), status: StatusCode.ERR }
            },
            category: CommandCategory.UTIL,
            help: {
                info: "Get information on a random role",
                arguments: {
                    "...format": {
                        description: "The format to show<br><b>formats</b><ul><li>%n: the name</li><li>%i: the id</li><li>%c: the color</li><li>%C: created at</li><li>{hc}: the hex color</li><li>%u: the emoji</li><li>%p: the position number</li><li>%I: the icon</li></ul>",
                        default: "%n"
                    }
                }
            }
        },
    ]

    yield [
        "render-html", createCommandV2(async ({ msg, args }) => {
            return { content: htmlRenderer.renderHTML(args.join(" "), 0), status: StatusCode.RETURN }
        }, CommandCategory.UTIL, "Renders <code>html</code>", {
            html: {
                description: "The html to render",
                required: true
            }
        }),
    ]

    yield [
        "htmlq",
        {
            run: async (_msg, _, sendCallback, opts, args) => {
                let [query, ...html] = args.join(" ").split("|")
                let realHTML = html.join("|")
                let $ = cheerio.load(realHTML)(query)
                if (opts['h']) {
                    let innerHTML = String($.html())
                    return { content: innerHTML, status: StatusCode.RETURN }
                }
                return { content: $.text(), status: StatusCode.RETURN }
            }, category: CommandCategory.UTIL,
            help: {
                info: "Query html",
                arguments: {
                    query: {
                        description: "The css query to query the html with",
                        required: true
                    },
                    "|": {
                        description: "A bar to seperate the query from the html",
                        required: true,
                    },
                    "html": {
                        description: "Anything after the bar is the html to query",
                        required: true
                    }
                },
                options: {
                    h: createHelpOption("Get the inner html instead of inner text")
                }
            }
        },
    ]

    yield [
        "get", createCommandV2(async ({ msg, rawOpts: opts, args }) => {
            let operator = args[0]
            let object = args[1]
            let filterInfo: { type: "with" | "without" | "with!" | "without!", attribute: string, search: string } | null = null
            let filter = function(_k: any, _v: any) {
                return true
            }
            if (["with", "without", "with!"].includes(args[2])) {
                filterInfo = { type: args[2] as "with" | "without" | "without!" | "with!", attribute: args[3], search: args.slice(4).join(" ") }
                filter = function(v: any, k: any) {
                    let search = filterInfo?.search
                    let val = v;
                    for (let attr of filterInfo?.attribute.split(".") ?? ["__BIRCLE_UNDEFINED__"]) {
                        val = val?.[attr]
                        if (val === undefined)
                            break
                    }
                    //@ts-ignore
                    if (val !== undefined && search) {
                        return {
                            with: () => String(val).includes(search as string),
                            without: () => !String(val).includes(search as string),
                            "without!": () => String(val) !== search,
                            "with!": () => String(val) === search
                        }[filterInfo?.type as "with" | "without" | "without!" | "with!"]?.() ?? false
                    }
                    return {
                        "with": val !== undefined,
                        "with!": val !== undefined,
                        "without": val === undefined,
                        "without!": val === undefined
                    }[filterInfo?.type as "with" | "without" | "without!" | "with!"] ?? false
                }
            }
            let data: Collection<any, any> | undefined;
            let number = parseInt(String(opts['n']))
            data = await {
                "channel": async () => await msg.guild?.channels.fetch(),
                "role": async () => await msg.guild?.roles.fetch(),
                "member": async () => await msg.guild?.members.fetch(),
                "user": async () => (await msg.guild?.members.fetch())?.mapValues(v => v.user),
                "bot": async () => (await msg.guild?.members.fetch())?.filter(u => u.user.bot),
                "command": async () => new Collection<string, Command | CommandV2>(getCommands().entries()),
                "aliasv2": async () => new Collection<string, AliasV2>(Object.entries(aliasesV2)),
                "cmd+av2": async () => new Collection<string, AliasV2 | Command | CommandV2>(Object.entries({ ...Object.fromEntries(getCommands().entries()), ...aliasesV2 })),
            }[object as "channel" | "role" | "member" | "user" | "bot" | "command"]()
            data = data?.filter(filter)
            if (!data) {
                return { content: `${object} is invalid`, status: StatusCode.ERR }
            }
            if (data.size < 1) {
                return { content: "No results", status: StatusCode.RETURN }
            }
            switch (operator) {
                case "#": {
                    let c = number ? String(data.at(number)) : String(data.size)
                    return { content: c, allowedMentions: { parse: [] }, status: StatusCode.RETURN }
                }
                case "rand": {
                    if (object === "command") {
                        data = data.mapValues((v, k) => k)
                    }
                    let text = ""
                    for (let i = 0; i < (number || 1); i++) {
                        text += data.random().toString() + "\n"
                    }
                    return { content: text, status: StatusCode.RETURN, allowedMentions: { parse: [] } }
                }
            }
            return { content: "Not a valid option", status: StatusCode.ERR }
        }, CommandCategory.UTIL, "gets stuff :+1:", {
            operator: createHelpArgument(`Can either be # or rand<ul><li><code>#</code>: will get a number of something</li><li><code>rand</code>: will get a random of something</li></ul>`, true),
            of: createHelpArgument("Will get either a <code>rand</code> or <code>#</code> of one of the following<ul><li>channel</li><li>role</li><li>member</li><li>user</li><li>bot</li><li>command</li><li>aliasv2</li><li>cmd+av2</li></ul>", true),
            filter: createHelpArgument(`The filter type to use, <lh>can be one of the following</lh>
<ul><li>with: checks if <code>property</code> is on the object and includes <code>search</code></li>
<li>with!: checks if <code>property</code> is on the object and equals <code>search</code></li>
<li>without: checks if <code>property</code> is not on the object, but if it is, does not include <code>search</code></li>
<li>without!: checks if <code>property</code> is not on the object, but if it is, does not include <code>search</code></li></ul>
`, false),
            property: createHelpArgument("The property to check of the object", false),
            search: createHelpArgument("Searches the property if exists", false)
        }, {
            n: createHelpOption("If <code>operator</code> is <code>#</code>, gets the n'th item<br>if <code>operator</code> is <code>rand</code>, gets n random items")
        }),
    ]

    yield [
        "embed", createCommandV2(
            async ({ rawOpts: opts, args }) => {
                let embed = new EmbedBuilder()
                for (let arg of args.join(" ").split("\n")) {
                    let [type, ...typeArgs] = arg.split(" ")
                    switch (type.trim()) {
                        case "title": {
                            embed.setTitle(typeArgs.join(" "))
                            break
                        }
                        case "field": {
                            let [name, value, inline] = typeArgs.join(" ").split("|").map(v => v.trim())
                            let inlined = false
                            if (!name) {
                                name = "field"
                            }
                            if (!value)
                                value = "value"
                            if (inline === 'true')
                                inlined = true
                            embed.addFields(efd([name, value, inlined]))
                            break
                        }
                        case "color": {
                            try {
                                embed.setColor(typeArgs.join(" ") as ColorResolvable)
                            }
                            catch (err) {
                                embed.setColor("Red")
                            }
                            break
                        }
                        case "author": {
                            let [author, image] = typeArgs.join(" ").split("|").map(v => v.trim())
                            if (image)
                                embed.setAuthor({ iconURL: image, name: author })
                            else {
                                embed.setAuthor({ name: author })
                            }
                            break
                        }
                        case "image": {
                            let image = typeArgs.join(" ")
                            if (image)
                                embed.setImage(image)
                            break
                        }
                        case "thumbnail": {
                            let thumbnail = typeArgs.join(" ")
                            if (thumbnail)
                                embed.setThumbnail(thumbnail)
                            break
                        }
                        case "footer": {
                            let [text, thumbnail] = typeArgs.join(" ").split("|").map(v => v.trim())
                            if (thumbnail) {
                                embed.setFooter({ text: text, iconURL: thumbnail })
                            }
                            else {
                                embed.setFooter({ text: text })
                            }
                            break
                        }
                        case "description": {
                            let description = typeArgs.join(" ")
                            if (description)
                                embed.setDescription(description)
                            break
                        }
                        case "url": {
                            let url = typeArgs.join(" ")
                            if (url) {
                                embed.setURL(url)
                            }
                            break
                        }
                        default: {
                            continue
                        }
                    }
                }
                if (opts['json']) {
                    return { content: JSON.stringify(embed.toJSON()), status: StatusCode.RETURN }
                }
                return { embeds: [embed], status: StatusCode.RETURN }
            }, CommandCategory.UTIL,
            "Create an embed",
            {
                "instructions": createHelpArgument(`The way to create the embed, each line in the instructions should start with something to set for example:
<pre>
${prefix}embed title this is the title
url https://aurl.com
description the description
field name | value | (optional true or false)
image https://....
thumbnail https://...
color #00ffe2
footer this is the footer | (optional link to image)
author this is the author | (optional link to image)
</pre>
The order these are given does not matter, excpet for field, which will be added in the order you gave`)
            },
            {
                "json": createHelpOption("Return the json that makes up the embed")
            }
        ),
    ]

    yield ["sh", createCommandV2(async ({ msg, argList, opts, sendCallback }) => {
        if (!isMsgChannel(msg.channel)) return { noSend: true, status: StatusCode.ERR }
        const cmd = spawn("bash")
        let dataToSend = ""
        let sendingTimeout: NodeJS.Timeout | undefined = undefined;
        cmd.stdout.on("data", data => {
            dataToSend += data.toString("utf-8")

            if (sendingTimeout) clearTimeout(sendingTimeout)

            sendingTimeout = setTimeout(() => {
                handleSending(msg, { content: dataToSend, status: StatusCode.INFO }, sendCallback)
                dataToSend = ""
            }, 100)
        })
        cmd.stderr.on("data", data => {
            dataToSend += data.toString("utf-8")

            if (sendingTimeout) clearTimeout(sendingTimeout)

            sendingTimeout = setTimeout(() => {
                handleSending(msg, { content: dataToSend, status: StatusCode.INFO }, sendCallback)
                dataToSend = ""
            }, 100)
        })
        const collector = msg.channel.createMessageCollector({ filter: m => m.author.id === msg.author.id })
        const TO_INTERVAL = 30000
        let timeout = setTimeout(cmd.kill, TO_INTERVAL)
        collector.on("collect", m => {
            clearTimeout(timeout)
            timeout = setTimeout(cmd.kill, TO_INTERVAL)
            cmd.stdin.write(m.content + "\n")
        })
        return { noSend: true, status: StatusCode.ERR }
    }, CommandCategory.UTIL, undefined, undefined, undefined, undefined, m => ADMINS.includes(m.author.id))]

    yield ["qalc", createCommandV2(async ({ msg, argList, opts, sendCallback }) => {
        if (!isMsgChannel(msg.channel)) return { noSend: true, status: StatusCode.ERR }
        if ((opts.getBool("repl", false) || opts.getBool("r", false) || opts.getBool("interactive", false)) && !globals.IN_QALC.includes(msg.author.id)) {
            globals.IN_QALC.push(msg.author.id)
            const cmd = spawn("qalc", argList)
            cmd.stdout.on("data", data => {
                let text = data.toString("utf-8").replaceAll(/\[[\d;]+m/g, "")
                handleSending(msg, crv(text), sendCallback)
            })
            cmd.stderr.on("data", data => {
                handleSending(msg, crv(data.toString("utf-8")), sendCallback)
            })
            cmd.on("close", () => {
                globals.IN_QALC = globals.IN_QALC.filter(v => v !== msg.author.id)
            })
            cmd.on("exit", () => {
                if (timeout) {
                    clearTimeout(timeout)
                }
                globals.IN_QALC = globals.IN_QALC.filter(v => v !== msg.author.id)
            })
            const collector = msg.channel.createMessageCollector({ filter: m => m.author.id === msg.author.id })
            const TO_INTERVAL = 30000
            let timeout = setTimeout(cmd.kill, TO_INTERVAL)
            collector.on("collect", m => {
                clearTimeout(timeout)
                timeout = setTimeout(cmd.kill, TO_INTERVAL)
                cmd.stdin.write(m.content + "\n")
            })
        }
        const cmd = spawnSync("qalc", ["-t"].concat(argList))
        return { content: cmd.stdout.toString("utf-8"), status: StatusCode.RETURN }
    }, CommandCategory.UTIL, "Fancy calculator")]

    yield [
        "calc",
        {
            run: async (msg, args, sendCallback) => {
                let opts;
                [opts, args] = getOpts(args)
                let sep = opts['sep']
                if (!sep) {
                    sep = "\n"
                } else sep = String(sep)
                let stringifyFn = JSON.stringify
                if (opts['s']) {
                    stringifyFn = String
                }
                if (opts['python']) {
                    let codeStr = `math = __import__("math")
random = __import__("random")
if(hasattr(random, "_os")):
    del random._os
if(hasattr(random, "os")):
    del random.os
__import__ = None
class VarHolder:
    def __init__(self, dict):
        self.__dict__ = dict
    def __repr__(self):
        return repr(self.__dict__)
null = None
g = VarHolder(${JSON.stringify(vars.vars['__global__'])})
u = VarHolder(${JSON.stringify(vars.vars[msg.author.id]) || "{}"})
print(eval("""${args.join(" ").replaceAll('"', "'")}"""))`
                    let moreDat = spawnSync("python3", ["-c", codeStr], {
                        timeout: 3000
                    })
                    let sendText = ""
                    if (moreDat.stderr.toString("utf-8")) {
                        sendText += moreDat.stderr.toString("utf-8").trim() + '\n'
                    }
                    if (moreDat.stdout.toString("utf-8")) {
                        sendText += moreDat.stdout.toString("utf-8").trim()
                    }
                    return { content: sendText, status: StatusCode.RETURN }
                }
                let ret: string = ""
                try {
                    ret = stringifyFn(safeEval(args.join(" "), { args: args, lastCommand: lastCommand[msg.author.id], g: vars.vars["__global__"], u: vars.vars[msg.author.id], ...generateDefaultRecurseBans() || {} }, { timeout: 3000 }))
                }
                catch (err) {
                    console.log(err)
                }
                if (ret && ret.length) {
                    vars.setVar("__calc", ret, msg.author.id)
                }
                return { content: ret, status: StatusCode.RETURN }
            },
            help: {
                info: "Run a calculation",
                arguments: {
                    "...equations": {
                        description: "The equation(s) to evaluate<br>Seperate each equation with a new line"
                    }
                },
                options: {
                    sep: {
                        description: "If multiple equations are given, this seperates each answer"
                    }
                }
            },
            category: CommandCategory.UTIL
        },
    ]

    yield [
        "read-lines", ccmdV2(async function({ msg, args, sendCallback, stdin, pipeTo, opts }) {
            let text = stdin ? getContentFromResult(stdin) : args.join(" ")
            let lines = text.split("\n")
            if (!pipeTo) {
                await handleSending(msg, { content: `Warning: you are not piping the result to anything`, status: StatusCode.WARNING }, sendCallback)
            }
            let waitTime = opts.getNumber("w", 1000)
            if (waitTime < 700) {
                waitTime = 1000
            }
            let id = Math.random()
            globals.SPAMS[id] = true
            for (let line of lines) {
                if (!globals.SPAMS[id])
                    break;

                await handleSending(msg, { content: line, status: StatusCode.INFO, do_change_cmd_user_expansion: false }, sendCallback)
                await new Promise(res => setTimeout(res, waitTime))
            }
            delete globals.SPAMS[id]
            return { noSend: true, status: StatusCode.RETURN }
        }, "Read each line one at a time and send to sendCallback", {
            accepts_stdin: "The text to read one line at a time"
        })
    ]

    yield [
        "pcount",
        {
            run: async (_msg, args) => {
                let id = args[0]
                if (!id) {
                    return { status: StatusCode.ERR, content: "no id given" }
                }
                let str = ""
                for (let key in globals.POLLS[`poll:${id}`]) {
                    str += `${key}: ${globals.POLLS[`poll:${id}`]["votes"][key].length}\n`
                }
                return { content: str, status: StatusCode.RETURN }
            },
            help: {
                info: "Gets the id of a poll",
                arguments: {
                    "id": {
                        description: "The id of the poll to get the count of"
                    }
                }
            },
            category: CommandCategory.UTIL
        },
    ]

    yield [
        "rand", createCommandV2(async ({ opts, args }) => {
            const low = parseFloat(args[0]) || 0
            const high: number = parseFloat(args[1]) || 100
            const count = parseInt(args[2]) || 1
            if (count > 50000) {
                return { content: "Too many numbers", status: StatusCode.ERR }
            }
            let answers = []
            for (let i = 0; i < count; i++) {
                let ans = Math.random() * (high - low) + low
                if (opts.getBool("round", false)) {
                    ans = Math.floor(ans)
                }
                answers.push(ans)
            }
            return {
                content: answers.join(String(opts.getString("s", ", "))),
                status: StatusCode.RETURN
            }
        }, CommandCategory.UTIL, "Generate random number", {
            low: createHelpArgument("The lowest number", false, undefined, "0"),
            high: createHelpArgument("The highest number", false, undefined, "100"),
            count: createHelpArgument("The amount to generate", false)
        }, {
            round: createHelpOption("Round the number"),
            s: createHelpOption("The seperator to seperate each number with")
        })]

    yield [
        "roles",
        {
            run: async (msg, args) => {
                let users = []
                for (let arg of args) {
                    //@ts-ignore
                    users.push(await fetchUser(msg.guild, arg))
                }
                if (users.length == 0) {
                    //@ts-ignore
                    users.push(await fetchUser(msg.guild, msg.author.id))
                }
                let embeds = []
                for (let user of users) {
                    let roles = user?.roles
                    if (!roles) {
                        return {
                            content: "Could not find roles",
                            status: StatusCode.ERR
                        }
                    }
                    let embed = new EmbedBuilder()
                    embed.setTitle(`Roles for: ${user?.user.username}`)
                    embed.addFields(efd(["Role count", String(roles.cache.size)]))
                    let text = roles.cache.toJSON().join(" ")
                    let backup_text = roles.cache.map(v => v.name).join(" ")
                    if (text.length <= 1024) {
                        embed.addFields(efd(["Roles", roles.cache.toJSON().join(" ")]))
                    }
                    else if (backup_text.length <= 1024) {
                        embed.addFields(efd(["Roles", backup_text]))
                    }
                    else {
                        embed.addFields(efd(["Roles", "Too many to list"]))
                    }
                    embeds.push(embed)
                }
                return {
                    embeds: embeds,
                    status: StatusCode.RETURN
                }
            },
            category: CommandCategory.UTIL,
            help: {
                info: "Gets the roles of a user",
                arguments: {
                    "user": createHelpArgument("The user to get the roles of", true)
                }
            }
        },
    ]

    yield [
        "search-cmd-file",
        {
            run: async (_msg, _, sendCallback, opts, args) => {
                let file = args[0]
                let search = args.slice(1).join(" ")
                if (!file) {
                    return { content: "No file specified", status: StatusCode.ERR }
                }
                if (file.match(/\./)) {
                    return { content: "<:Watching1:697677860336304178>", status: StatusCode.ERR }
                }
                if (!fs.existsSync(`./command-results/${file}`)) {
                    return {
                        content: "file does not exist",
                        status: StatusCode.ERR
                    }
                }
                const text = fs.readFileSync(`./command-results/${file}`, "utf-8")
                let lines = text.split(";END")
                if (opts['arg']) {
                    let argNo = Number(opts['args'])
                    if (isNaN(argNo)) {
                        argNo = 1
                    }
                    lines = lines.map(v => v.split(" ")[argNo])
                }
                let final = []
                for (let i = 0; i < lines.length; i++) {
                    let line = lines[i]
                    try {
                        if (line.match(search)) {
                            final.push(`${i + 1}: ${line}`)
                        }
                    }
                    catch (err) {
                        return { content: "Invalid regex", status: StatusCode.ERR }
                    }
                }
                return { content: final.join("\n"), status: StatusCode.RETURN }
            }, category: CommandCategory.UTIL,
            help: {
                info: "Searches a command file",
                arguments: {
                    file: createHelpArgument("The file to search", true),
                    "...search": createHelpArgument("The regex to search for in the file", true)
                }
            }
        },
    ]

    yield [
        "comp-roles",
        {
            run: async (msg, args, sendCallback) => {
                let [user1, user2] = args.join(" ").split("|")
                user1 = user1.trim()
                user2 = user2.trim()
                if (!user1) {
                    return { content: "No users given", status: StatusCode.ERR }
                }
                if (!user2) {
                    return { content: "2 users must be given", status: StatusCode.ERR }
                }
                //@ts-ignore
                let realUser1: GuildMember = await fetchUser(msg.guild, user1)
                if (!realUser1) {
                    return { content: `${user1} not found`, status: StatusCode.ERR }
                }
                //@ts-ignore
                let realUser2: GuildMember = await fetchUser(msg.guild, user2)
                if (!realUser2) {
                    return { content: `${user2} not found`, status: StatusCode.ERR }
                }
                let user1Roles = realUser1.roles.cache.toJSON()
                let user2Roles = realUser2.roles.cache.toJSON()
                let user1RoleIds = user1Roles.map(v => v.id)
                let user2RoleIds = user2Roles.map(v => v.id)
                let sameRoles = user1Roles.filter(v => user2RoleIds.includes(v.id))
                let user1Unique = user1Roles.filter(v => !user2RoleIds.includes(v.id))
                let user2Unique = user2Roles.filter(v => !user1RoleIds.includes(v.id))
                let embed = new EmbedBuilder()
                let same = sameRoles.reduce((prev, cur) => `${prev} ${cur}`, "")
                let user1U = user1Unique.reduce((prev, cur) => `${prev} ${cur}`, "")
                let user2U = user2Unique.reduce((prev, cur) => `${prev} ${cur}`, "")
                let u1Net = user1RoleIds.length - user2RoleIds.length
                embed.setTitle("roles")
                if (u1Net > 0) {
                    embed.setDescription(`${realUser1.displayName} has ${u1Net} more roles than ${realUser2.displayName}`)
                }
                else if (u1Net < 0) {
                    embed.setDescription(`${realUser1.displayName} has ${-u1Net} less roles than ${realUser2.displayName}`)
                }
                else {
                    embed.setDescription(`${realUser1.displayName} has the same amount of roles as ${realUser2.displayName}`)
                }
                embed.addFields(efd(["Same Roles", same || "No same"], [`${realUser1.displayName} unique roles`, user1U || "No unique roles"], [`${realUser2.displayName} unique roles`, user2U || "No unique roles"]))
                return { embeds: [embed], status: StatusCode.RETURN, allowedMentions: { parse: [] } }
            },
            category: CommandCategory.UTIL,
            help: {
                info: "Compare 2 user's roles",
                arguments: {
                    user1: {
                        description: "The first user",
                    },
                    "|": {
                        description: "Seperates the users",
                    },
                    user2: {
                        description: "The second user"
                    }
                }
            }
        },
    ]

    yield [
        "most-roles",
        {
            run: async (msg, args, sendCallback) => {
                let opts;
                [opts, args] = getOpts(args)
                let times = parseInt(args[0]) || 10
                await msg.guild?.members.fetch()
                let sortedMembers = msg.guild?.members.cache.sorted((ua, ub) => ub.roles.cache.size - ua.roles.cache.size)
                let embed = new EmbedBuilder()
                embed.setTitle(`${sortedMembers?.at(0)?.user.username} has the most roles`)
                if (sortedMembers?.at(0)?.displayColor) {
                    embed.setColor(sortedMembers?.at(0)?.displayColor || "Red")
                }
                let ret = ""
                for (let i = 0; i < times; i++) {
                    let member = sortedMembers?.at(i)
                    ret += `${i + 1}: ${member}: ${member?.roles.cache.size}\n`
                    embed.addFields(efd([String(i + 1), `**${member}**\n${member?.roles.cache.size}`, true]))
                }
                let rv: CommandReturn = { allowedMentions: { parse: [] }, status: StatusCode.RETURN }
                if (!opts['E'] && !opts['c!'])
                    rv.embeds = [embed]
                if (opts['c'] || opts['c!']) {
                    rv.content = ret
                }
                return rv
            },
            help: {
                info: "Display a list of users with the most roles",
                arguments: {
                    top: {
                        description: "The top x users to display",
                        required: false,
                    }
                },
                options: {
                    E: {
                        description: "Don't display an embed"
                    },
                    c: {
                        description: "Display the results as a list"
                    },
                    "c!": {
                        description: "Display the results as a list instead of an embed"
                    }
                }
            },
            category: CommandCategory.UTIL
        },
    ]

    yield [
        "whohas", createCommandV2(async ({ msg, argList }) => {
            argList.beginIter()
            let realRole = await argList.expectRole(msg.guild as Guild, () => true) as Role | typeof BADVALUE
            if (realRole === BADVALUE) {
                return {
                    content: "Could not find role",
                    status: StatusCode.ERR
                }
            }
            await msg.guild?.members.fetch()
            let memberTexts = [""]
            let embed = new EmbedBuilder()
            embed.setTitle(realRole.name)
            let i = 0
            let memberCount = 0
            for (let member of realRole.members) {
                memberTexts[i] += `<@${member[1].id}> `
                memberCount += 1
                if (memberTexts[i].length > 1000) {
                    embed.addFields(efd([`members`, memberTexts[i]]))
                    i++
                    memberTexts.push("")
                }
            }
            if (!memberTexts[0].length) {
                return { content: "No one", status: StatusCode.RETURN }
            }
            if ((embed.data.fields?.length || 0) < 1) {
                embed.addFields(efd([`members: ${i}`, memberTexts[i]]))
            }
            embed.addFields(efd(["Member count", String(memberCount)]))
            return { embeds: [embed], status: StatusCode.RETURN, allowedMentions: { parse: [] } }

        }, CAT, "Gets a list of users with a specific role", {
            "...role": createHelpArgument("The role to search for")
        })
    ]

    yield ["printf", createCommandV2(async ({ argList, opts, msg }) => {
        class Format {
            /**
            * @abstract
            */
            async format(text: string): Promise<string> { return text }

            static parseFormatSpecifier(format: string): Format | string {
                if (!format.startsWith("%")) {
                    return format
                }
                format = format.slice(1)
                let dataType = format.slice(-1)
                switch (dataType) {
                    case "f":
                    case "x":
                    case "X":
                    case "o":
                    case "d":
                        return NumberFormat.parseFormatSpecifier(format)
                    case "s":
                        return StringFormat.parseFormatSpecifier(format)
                    case "u":
                        return UserFormat.parseFormatSpecifier(format)
                    case "c":
                        return CommandFormat.parseFormatSpecifier(format)
                    case "%":
                        return "%"
                    default:
                        return format
                }
            }
        }

        class CommandFormat extends Format {
            showType: "$" | "-" | "#" | "?" | "0" | "()"
            joinChar: string
            constructor(showType: "$" | "-" | "#" | "?" | "0" | "()", joinChar?: string) {
                super()
                this.showType = showType
                this.joinChar = joinChar ?? " "
            }
            async format(text: string) {
                let cmds = { ...Object.fromEntries(getCommands().entries()), ...getMatchCommands(), ...getAliasesV2() }
                let cmd = cmds[text]
                if (!cmd) {
                    return text
                }
                switch (this.showType) {
                    case "0":
                        return text
                    case "$":
                        return Object.keys(cmd?.help?.arguments || []).join(this.joinChar)
                    case "-":
                        return Object.keys(cmd?.help?.options || []).join(this.joinChar)
                    case "#":
                        return cmd?.help?.tags?.join(this.joinChar) || ""
                    case "?":
                        return generateCommandSummary(text, cmd)
                    case "()":
                        return String(cmd.run)
                    default:
                        if (!cmd?.help?.info) {
                            return text
                        }
                        return htmlRenderer.renderHTML(cmd.help?.info as string)
                }
            }
            static parseFormatSpecifier(format: string): string | Format {
                let [char, ...rest] = format
                let showType = char
                if (rest[0] === ')') {
                    showType += rest[0]
                    rest = rest.slice(1)
                }
                return new CommandFormat(showType as "$" | "-" | "#" | "?" | "0" | "()")
            }
        }

        class UserFormat extends Format {
            async format(text: string) {
                let user = await fetchUser(msg.guild as Guild, text)
                if (user)
                    return `<@${user.id}>`
                return text
            }
            static parseFormatSpecifier(format: string): string | Format {
                return new UserFormat()
            }
        }

        class StringFormat extends Format {
            lPadding: number
            constructor(lPadding: number) {
                super()
                this.lPadding = lPadding
            }
            async format(text: string) {
                let newText = text
                if (text.length < this.lPadding) {
                    newText = text + " ".repeat(this.lPadding - text.length)
                }
                return newText
            }
            static parseFormatSpecifier(format: string): StringFormat | string {
                let lpad = 0
                let lpadstr = ""
                if (format[0] === '-') {
                    let i = -0
                    let char;
                    while (!isNaN(Number(char = format[++i]))) {
                        lpadstr += char

                    }
                    lpad = Number(lpadstr)
                }
                return new StringFormat(lpad)
            }
        }

        type NumberType = "base10" | "x" | "o" | "X" | "d" | "f"

        class NumberFormat extends Format {
            numLength: number
            type: NumberType
            addCommas: boolean
            decimalCount: number
            constructor(numLength?: number, type?: NumberType, addCommas?: boolean, decimalCount?: number) {
                super()
                this.numLength = numLength ?? 1
                this.type = type ?? "base10"
                this.addCommas = addCommas ?? false
                this.decimalCount = decimalCount ?? (this.type === "f" ? 2 : 0)
            }
            _formatBase(num: number, base: number) {
                let nS = num.toString(base)
                let [numberBit, decBit] = nS.split(".")
                if (this.addCommas) {
                    numberBit = [...numberBit].reverse().join("").replace(/(...)/g, "$1,").split("").reverse().join("")
                    if (numberBit.startsWith(",")) numberBit = numberBit.slice(1)
                }
                if (numberBit.length < this.numLength) {
                    numberBit = "0".repeat(this.numLength - numberBit.length) + numberBit
                }
                if (this.decimalCount) {
                    if (!decBit) {
                        decBit = "0".repeat(this.decimalCount)
                    }
                    else if (decBit.length < this.decimalCount) {
                        decBit += "0".repeat(this.decimalCount - decBit.length)
                    }
                    else if (decBit.length > this.decimalCount) {
                        decBit = decBit.slice(0, this.decimalCount)
                    }
                }
                if (decBit)
                    nS = `${numberBit}.${decBit}`
                else nS = numberBit
                return nS;
            }
            async format(text: string) {
                let num = Number(text)
                if (isNaN(num)) {
                    let text = "0".repeat(this.numLength)
                    if (this.decimalCount) {
                        text += `.${"0".repeat(this.decimalCount)}`
                    }
                    return text
                }
                let fn = this._formatBase.bind(this, num)
                switch (this.type) {
                    case "x": {
                        return fn(16);
                    }
                    case "X": {
                        return fn(16).toUpperCase()
                    }
                    case "o": {
                        return fn(8);
                    }
                    case "f":
                    case "d":
                    case 'base10': {
                        return fn(10)
                    }
                }
            }

            static parseFormatSpecifier(format: string): string | NumberFormat {
                let base = format.slice(-1) as "x" | "X" | "o" | "d"
                format = format.slice(0, -1)
                let digits;
                let paddingCount = 0;
                let decPaddingCount = 0;
                let addCommas = false
                if (format[0] === "0" && (digits = format.slice(1)?.match(/^[0-9]+/))) {
                    paddingCount = Number(format.slice(1, digits[0].length + 1))
                    format = format.slice(1 + digits[0].length)
                }
                if (format[0] === "." && (digits = format.slice(1)?.match(/^[0-9]+/))) {
                    decPaddingCount = Number(format.slice(1, digits[0].length + 1))
                    format = format.slice(1 + digits[0].length)
                }
                if (format[0] === "'") {
                    addCommas = true
                }
                return new NumberFormat(paddingCount, base, addCommas, decPaddingCount)
            }
        }
        let formatSpecifierList: (string | Format)[] = []
        argList.beginIter()
        let formatSpecifier = argList.expectString(1)
        if (formatSpecifier === BADVALUE) {
            return { content: "No specifier given", status: StatusCode.ERR }
        }
        let currentSpecifier = ""
        for (let char of formatSpecifier) {
            if ("sdXxofuc".includes(char)) {
                formatSpecifierList.push(Format.parseFormatSpecifier(currentSpecifier + char))
                currentSpecifier = ""
                continue;
            }
            if ("%".includes(char) && currentSpecifier) {
                formatSpecifierList.push(Format.parseFormatSpecifier(currentSpecifier))
                currentSpecifier = ""
            }
            currentSpecifier += char
        }
        if (currentSpecifier) {
            formatSpecifierList.push(Format.parseFormatSpecifier(currentSpecifier))
        }

        let rv: CommandReturn = { status: StatusCode.RETURN, allowedMentions: { parse: [] } }

        let sendToVar: string | boolean = false

        if (opts.getBool("d", false)) {
            rv.delete = true
        }
        if (opts.getBool("dm", false)) {
            if (msg.author.dmChannel)
                rv.channel = msg.author.dmChannel
        }
        if (sendToVar = opts.getString("v", "")) {
            rv.noSend = true
        }

        if (formatSpecifierList.filter(v => typeof v === 'string').length === formatSpecifierList.length) {
            rv.content = formatSpecifierList.join("")
            if (sendToVar) {
                vars.setVarEasy(msg, sendToVar, rv.content)
            }
            return rv
        }

        let text = ""
        let argNo = 1
        //while there are arguments provided
        while (argNo < argList.length) {
            //go through each format specifier
            for (let i = 0; i < formatSpecifierList.length; i++) {
                let currentSpec = formatSpecifierList[i]
                if (typeof currentSpec === 'string') {
                    text += currentSpec
                }
                else {
                    //when an arg is needed move to the next arg
                    text += await currentSpec.format(argList[argNo++])
                }
            }
        }
        rv.content = text
        if (sendToVar) {
            vars.setVarEasy(msg, sendToVar, rv.content)
        }
        return rv
    }, CAT, "Similar to echo", {
        specifier: createHelpArgument("The format specifier<br>%[fmt]<s|d|x|X|o|f|u><br><ul><li>fmt: special information depending on which type to use</li></ul><lh>types</lh><ul><li>[-leftpad]s: string</li><li>d,x,X,o,f: fmt is in the form of [0<count>][.<count>][']<br>0: to specify how many leading 0s<br>.: to specify the decimal place count<br>': to add commas<br>d: base 10, xX: base 16, o: base 8</li><li>u: format a user mention</li><li>c: command format</li></ul>", true),
        "...data": createHelpArgument("The data to fill the specifier with")
    })]

    yield [
        "pollify",
        {
            run: async (msg, args, sendCallback) => {
                let opts: Opts;
                [opts, args] = getOpts(args)
                if (msg.deletable && opts['d']) await msg.delete()
                let message = await handleSending(msg, { content: args.join(" ") || "poll", status: StatusCode.RETURN }, sendCallback)
                await message.react("<:Blue_check:608847324269248512>")
                await message.react("<:neutral:716078457880051734>")
                await message.react("❌")
                return { noSend: true, status: StatusCode.INFO }
            }, category: CommandCategory.UTIL,
            help: {
                info: "Idk it pollifies what do you want"
            }
        },
    ]

    yield [
        'stackl',
        {
            run: async (msg, args, sendCallback) => {
                const stackl = require("../stackl")
                let opts: Opts;
                [opts, args] = getOpts(args)
                let useStart = true
                if (opts['no-start'] === true) {
                    useStart = false
                }
                if (opts['docs'] === true) {
                    return {
                        files: [
                            {
                                name: "stackl.txt",
                                description: "The stackl documentation",
                                delete: false,
                                attachment: "./data/stackl.norg"
                            }
                        ],
                        status: StatusCode.RETURN
                    }
                }

                let stack = await stackl.parse(args, useStart, msg, globals.SPAMS)
                //@ts-ignore
                if (stack?.err) {
                    //@ts-ignore
                    return { content: stack.content, status: StatusCode.RETURN }
                }

                let embeds = []
                let texts = []

                type stackTypes = number | string | Message | GuildMember | Function | Array<stackTypes> | EmbedBuilder
                for (let item of stack as Array<stackTypes>) {
                    if (item instanceof EmbedBuilder) {
                        embeds.push(item)
                    }
                    else {
                        texts.push(item)
                    }
                }
                return { content: texts.join(String(opts['join'] ?? " ")), embeds: embeds, noSend: (<Array<stackTypes>>stack).length > 0 ? false : true, status: StatusCode.RETURN }
            }, category: CommandCategory.UTIL,
            help: {
                info: "Welcome to stackl",
                arguments: {
                    code: {
                        description: "The code to run"
                    }
                },
                options: {
                    "no-start": {
                        description: "Remove the need for %start"
                    },
                    "docs": {
                        description: "Post the documentation"
                    }
                }
            }
        },
    ]

    yield [
        "expr",
        {
            run: async (msg, args, sendCallback) => {
                let opts;
                [opts, args] = getOpts(args)

                let prefix = ""
                if (opts['u']) {
                    prefix = msg.author.id
                }

                let left = args[0]

                let convFn = opts['s'] ? String : Number

                let isBad = opts['s'] ? (s: string) => s ? false : true : isNaN

                let leftVal = convFn(left)
                if (isBad(leftVal)) {
                    leftVal = convFn(vars.getVar(msg, left, prefix))
                }
                if (isBad(leftVal)) {
                    return crv(`${left} did not pass the ${convFn.name} check`, { status: StatusCode.ERR })
                }

                let op = args[1]

                let right = args[2]

                let rightVal = convFn(right)
                if (right && isBad(rightVal)) {
                    rightVal = convFn(vars.getVar(msg, right, prefix))
                }
                if (right && isBad(rightVal)) {
                    return crv(`${right} is not a number`, { status: StatusCode.ERR })
                }

                let ans: any
                switch (op) {
                    case "++":
                        ans = typeof leftVal === 'string' ? leftVal.repeat(2) : leftVal + 1
                        break
                    case "--":
                        if (typeof leftVal === 'string') {
                            ans = NaN
                        }
                        else ans = leftVal - 1
                        break
                    case "floor":
                        ans = typeof leftVal === 'string' ? NaN : Math.floor(leftVal)
                        break;
                    case "ceil":
                        ans = typeof leftVal === 'string' ? NaN : Math.ceil(leftVal)
                        break;
                    case ",":
                        ans = ""
                        for (let i = 0; i < String(leftVal).length; i++) {
                            if (i % 3 == 0 && i != 0) {
                                ans += ","
                            }
                            ans += left[left.length - i - 1]
                        }
                        let newAns = ""
                        for (let i = ans.length - 1; i >= 0; i--) {
                            newAns += ans[i]
                        }
                        ans = newAns
                        break;
                    case "+":
                        //@ts-ignore
                        ans = leftVal + rightVal
                        break
                    case "-":
                        if (typeof leftVal === 'string' && typeof rightVal === 'string') {
                            ans = leftVal.replaceAll(rightVal, "")
                        }
                        else if (typeof leftVal === 'number' && typeof rightVal == 'number') ans = leftVal - rightVal
                        break
                    case "*":
                        if (!isNaN(Number(rightVal)) && typeof leftVal === 'string') {
                            ans = leftVal.repeat(Number(rightVal))
                        }
                        else if (typeof leftVal === 'number' && typeof rightVal === 'number')
                            ans = leftVal * rightVal
                        break
                    case "/":
                        if (typeof leftVal === 'string' || typeof rightVal === 'string') ans = NaN
                        else ans = leftVal / rightVal
                        break
                    case "^":
                        if (typeof leftVal === 'string' || typeof rightVal === 'string') ans = NaN
                        else ans = leftVal ^ rightVal
                        break;
                    case "%":
                        if (typeof leftVal === 'string' || typeof rightVal === 'string') ans = NaN
                        else ans = leftVal % rightVal
                        break;
                }
                vars.setVarEasy(msg, left, String(ans), prefix)
                return { content: String(ans), status: StatusCode.RETURN }
            },
            help: {
                info: "Modify a variable",
                arguments: {
                    "num1": {
                        description: "Number 1 (can be a variable)"
                    },
                    "operator": {
                        description: "The operator<ul><li>++</li><li>--</li><li>floor</li><li>ceil</li><li>,</li><li>:</li><li>+</li><li>-</li><li>*</li><li>/</li><li>^</li><li>%</li></ul>"
                    },
                    "num2": {
                        description: "The other number (can be a variable)"
                    }
                }, 
                options: {
                    s: createHelpOption("Treat each value as a string, and do not do variable lookup"),
                    u: createHelpOption("Treat each word as a user variable")
                }
            },
            category: CommandCategory.UTIL

        },
    ]

    yield [
        "cut", ccmdV2(async function({ args, opts, stdin }) {
            let fields = opts.getString("f", opts.getString("fields", ""))
            let delimiter = opts.getString("d", opts.getString("delimiter", " "))
            let join = opts.getString("j", opts.getString("join", "\t"))
            let text = stdin ? getContentFromResult(stdin, "\n") : args.join(delimiter)
            let numberField = Number(fields)
            let [start, end] = fields.split("-")
            let [startN, endN] = [Number(start), Number(end)]
            let columns = listComprehension(text.split("\n"), (i) => i.split(delimiter))
            if (!isNaN(numberField)) {
                return crv(columns.map(v => v[numberField - 1]).join("\n"))
            }

            if (isNaN(startN)) {
                startN = 1
            }
            if (isNaN(endN)) {

                return crv(columns.map(v => v.slice(startN - 1).join(join)).join("\n"))
            }
            return crv(columns.map(v => v.slice(startN - 1, endN - 1).join(join)).join("\n"))

        }, "Cuts a string my seperator, and says the requested fields", {
            helpArguments: {
                "...text": createHelpArgument("The text to cut", false)
            },
            helpOptions: {
                "d": createHelpOption("The delimiter", ["delimiter"], "<space>"),
                f: createHelpOption("The fields to get in the format of <code>start[-[end]]</code>", ["fields"], "0-"),
                j: createHelpOption("The text to join the fields by", ["join"], "\\t")
            },
            accepts_stdin: "Can be used instead of <code>...text</code>"
        })
    ]

    yield [
        "file", ccmdV2(async ({ msg, opts, args, stdin }) => {
            let fn = generateFileName("file", msg.author.id, mimeTypeToFileExtension(opts.getString("mime", stdin?.mimetype || "plain/text") as MimeType))
            fs.writeFileSync(fn, stdin ? getContentFromResult(stdin, "\n") : args.join(" "))

            return {
                files: [
                    {
                        attachment: fn,
                        name: fn,
                        description: `data`,
                    }
                ],
                status: StatusCode.RETURN
            }

        }, "Creates a file with data")
    ]

    yield [
        "b64m", createCommandV2(async ({ args }) => {
            let table: { [key: number]: string } = {}
            let j = 0;
            for (let char of "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/") {
                table[j++] = char;
            }
            let encoded = ""
            let binnumber = ""
            for (let char of args.join(" ")) {
                let n = `${char.codePointAt(0)?.toString(2)}`
                if (n.length < 8) {
                    n = mulStr("0", 8 - n.length) + n
                }
                binnumber += n
            }
            let i;
            for (i = 0; i < binnumber.length - 6; i += 6) {
                let binrep = binnumber.slice(i, i + 6)
                encoded += String(table[Number(`0b${binrep}`)])
            }
            let lastBits = binnumber.slice(i)
            lastBits += (() => {
                let x = ""
                for (let i = 0; i < 6 - lastBits.length; i++) {
                    x += "0"
                }
                return x
            })()
            encoded += String(table[Number(`0b${lastBits}`)])


            return { content: encoded, status: StatusCode.RETURN }
        }, CommandCategory.UTIL, "Custom implementation of b64, only works on ascii"),
    ]

    yield [
        "b64", createCommandV2(async ({ args, stdin }) => {
            let text = stdin ? getContentFromResult(stdin, "\n") : args.join(" ")
            return { content: Buffer.from(text).toString("base64"), status: StatusCode.RETURN }
        }, CAT, "Encodes text to base64")
    ]

    yield [
        "b64d", createCommandV2(async ({ args, stdin }) => {
            let text = stdin ? getContentFromResult(stdin, "\n") : args.join(" ")
            return { content: Buffer.from(text, "base64").toString("utf8"), status: StatusCode.RETURN }

        }, CommandCategory.UTIL, "Decodes base64")
    ]

    yield [
        "rfile",
        {
            run: async (msg, args, sendCallback) => {
                let att = msg.attachments.at(0)
                if (att) {
                    let data = await fetch.default(att.attachment.toString())
                    let text = await data.buffer()
                    return { content: text.toString(args[0] as BufferEncoding || "utf-8"), status: StatusCode.RETURN }
                }
                return { noSend: true, status: StatusCode.ERR }
            },
            category: CommandCategory.UTIL,
            help: {
                info: "reads a file",
                arguments: {
                    file: createHelpArgument("must be an attachment", true),
                    "decoding": createHelpArgument("The decoding method to use", false, undefined, "utf-8")
                }
            }
        },
    ]

    yield ["tr", createCommandV2(async ({ argList, stdin, opts }) => {
        let charsToDel = opts.getString("d", "")
        argList.beginIter()
        let from = argList.expectString()
        if (from === BADVALUE && !charsToDel) {
            return { content: "Must have start chars", status: StatusCode.ERR }
        }
        let to = argList.expectString()
        if (to === BADVALUE && !charsToDel) {
            return { content: "Must have end chars", status: StatusCode.ERR }
        }
        let text: string = stdin ? getContentFromResult(stdin, "\n") : argList.expectString(() => true) as string
        if (!text) {
            return { content: "Must have text to translate on", status: StatusCode.ERR }
        }
        if (charsToDel) {
            for (let char of charsToDel) {
                text = text.replaceAll(char, "")
            }
        }
        if (from !== BADVALUE && to !== BADVALUE) {
            for (let i = 0; i < from.length; i++) {
                let charTo = to[i] ?? to.slice(-1)[0]
                text = text.replaceAll(from[i], charTo)
            }
        }
        return { content: text, status: StatusCode.RETURN }
    }, CAT, "translate characters", {
        from: createHelpArgument("The chars to translate from (not required with -d)", false),
        to: createHelpArgument("The chars to translate to (not required with -d)", false, "from")
    }, {
        d: createHelpOption("The chars to delete")
    })]

    yield [
        "timer", createCommandV2(async ({ msg, args }) => {
            let action = args[0]?.toLowerCase()
            let actions = ["create", "delete", "get", "list", "lap", "has-x-units-passed"]

            timer.saveTimers()

            if (!actions.includes(action)) {
                return { content: `${action} is not a valid action\ncommand use: \`[timer <${actions.join(" | ")}> ...\``, status: StatusCode.ERR }
            }
            switch (action) {
                case "has-x-units-passed": {
                    let name = args[1]?.trim()
                    let t = timer.getTimer(msg.author.id, String(name))
                    if (t === undefined) {
                        return { content: `You do not have a timer named ${name}`, status: StatusCode.ERR }
                    }

                    let number = Number(args[2]?.trim())

                    if (isNaN(number)) {
                        return { content: `Must give a number`, status: StatusCode.ERR }
                    }

                    let unit = args[3]?.trim() || "MS"
                    let ms = Date.now() - t
                    let s = ms / 1000
                    let m = s / 60
                    let h = m / 60
                    let d = h / 24
                    let w = d / 7
                    if (unit.startsWith("s")) {
                        return { content: `${s >= number}`, status: StatusCode.RETURN }
                    }
                    else if (unit.startsWith("m")) {
                        return { content: `${m >= number}`, status: StatusCode.RETURN }
                    }
                    else if (unit.startsWith("h")) {
                        return { content: `${h >= number}`, status: StatusCode.RETURN }
                    }
                    else if (unit.startsWith("d")) {
                        return { content: `${d >= number}`, status: StatusCode.RETURN }
                    }
                    else if (unit.startsWith("w")) {
                        return { content: `${w >= number}`, status: StatusCode.RETURN }
                    }
                    return { content: `${Date.now() - t >= number}`, status: StatusCode.RETURN }
                }
                case "create": {
                    let name = String(args.slice(1).join(" ")).trim()
                    if (name[0] === "%") {
                        return { content: "Cannot create timer starting with %", status: StatusCode.ERR }
                    }
                    if (timer.getTimer(msg.author.id, name)) {
                        return { content: `You already have a timer called: ${name}`, status: StatusCode.ERR }
                    }
                    timer.createTimer(msg.author.id, name)
                    return { content: `${name} created`, status: StatusCode.RETURN }
                }
                case "delete": {
                    let name = String(args.slice(1).join(" ")).trim()
                    if (name[0] === "%") {
                        return { content: "Cannot delete timer starting with %", status: StatusCode.ERR }
                    }
                    if (!timer.getTimer(msg.author.id, name)) {
                        return { content: `You do not have a timer called ${name}`, status: StatusCode.ERR }
                    }
                    timer.deleteTimer(msg.author.id, name)
                    return { content: `${name} deleted`, status: StatusCode.RETURN }
                }
                case "get": {
                    return { content: String(timer.getTimer(msg.author.id, args.slice(1).join(" "))), status: StatusCode.RETURN }
                }
                case "list": {
                    let timers = timer.getTimersOfUser(msg.author.id)
                    if (!timers) {
                        return { content: "You do not have any timers", status: StatusCode.ERR }
                    }
                    return { content: Object.entries(timers).map((v) => `${v[0]}: ${Date.now() - v[1]}`).join("\n"), status: StatusCode.RETURN }
                }
                case "lap": {
                    let name = args[1]?.trim()
                    let unit = args[2]?.trim() || ""
                    let t = timer.getTimer(msg.author.id, name)
                    if (!t) {
                        return { content: `You do not have a timer called ${name}`, status: StatusCode.ERR }
                    }
                    let ms = Date.now() - t
                    let s = ms / 1000
                    let m = s / 60
                    let h = m / 60
                    let d = h / 24
                    let w = d / 7
                    if (unit.startsWith("s")) {
                        return { content: `${s}`, status: StatusCode.RETURN }
                    }
                    else if (unit.startsWith("m")) {
                        return { content: `${m}`, status: StatusCode.RETURN }
                    }
                    else if (unit.startsWith("h")) {
                        return { content: `${h}`, status: StatusCode.RETURN }
                    }
                    else if (unit.startsWith("d")) {
                        return { content: `${d}`, status: StatusCode.RETURN }
                    }
                    else if (unit.startsWith("w")) {
                        return { content: `${w}`, status: StatusCode.RETURN }
                    }
                    return { content: `${Date.now() - t}`, status: StatusCode.RETURN }
                }
                default: {
                    return { content: "How did we get here", status: StatusCode.ERR }
                }

            }
        }, CommandCategory.UTIL, "gets info on timers"),
    ]

    yield [
        'blacklist',
        {
            run: async (msg, args, sendCallback) => {
                let addOrRemove = args[0]
                if (!["a", "r"].includes(addOrRemove)) {
                    return {
                        content: "did not specify, (a)dd or (r)emove",
                        status: StatusCode.ERR
                    }
                }
                let cmds: string[] = args.slice(1)
                if (!cmds.length) {
                    return {
                        content: "no cmd given",
                        status: StatusCode.ERR
                    }
                }
                cmds = cmds.filter(v => !commands.get(v))
                if (addOrRemove == "a") {
                    addToPermList(BLACKLIST, "blacklists", msg.author, cmds)

                    return {
                        content: `${msg.member} has been blacklisted from ${cmds.join(" ")}`,
                        status: StatusCode.RETURN
                    }
                } else {
                    removeFromPermList(BLACKLIST, "blacklists", msg.author, cmds)
                    return {
                        content: `${msg.member} has been removed from the blacklist of ${cmds.join(" ")}`,
                        status: StatusCode.RETURN
                    }
                }
            }, category: CommandCategory.UTIL,
            help: {
                info: "Blacklist/unblacklist yourself from an alias"
            }
        },
    ]

    yield [
        "rand-user",
        {
            run: async (msg: Message, args: ArgumentList, sendCallback) => {
                let opts;
                [opts, args] = getOpts(args)
                let member
                if (!opts['f'])
                    member = (msg.channel as TextChannel).guild.members.cache.random()
                if (!member)
                    member = (await (msg.channel as TextChannel).guild.members.fetch()).random()
                let fmt = args.join(" ") || "%u (%n)"
                return Pipe.start(member)
                    .default({ content: "No member found" })
                    .next(function(member: any) {
                        if (!member?.user) {
                            return
                        }
                        return [member, member.user]
                    })
                    .default({ content: "No user found" })
                    .next(function(member: GuildMember, user: User) {
                        return {
                            content: format(fmt,
                                {
                                    id: user.id || "#!N/A",
                                    username: user.username || "#!N/A",
                                    nickname: member.nickname || "#!N/A",
                                    "0xcolor": member.displayHexColor.toString() || "#!N/A",
                                    color: member.displayColor.toString() || "#!N/A",
                                    created: user.createdAt.toString() || "#!N/A",
                                    joined: member.joinedAt?.toString() || "#!N/A",
                                    boost: member.premiumSince?.toString() || "#!N/A",
                                    i: user.id || "#!N/A",
                                    u: user.username || "#!N/A",
                                    n: member.nickname || "#!N/A",
                                    d: member.displayName,
                                    X: member.displayHexColor.toString() || "#!N/A",
                                    x: member.displayColor.toString() || "#!N/A",
                                    c: user.createdAt.toString() || "#!N/A",
                                    j: member.joinedAt?.toString() || "#!N/A",
                                    b: member.premiumSince?.toString() || "#!N/A",
                                    a: user.avatarURL() || "#!N/A"
                                }
                            )
                        }
                    }).done()
            },
            help: {
                info: "Gives a random server member",
                arguments: {
                    "fmt": {
                        description: "The format to print the user, default: \"%u (%n)\"<br>Formats:<br>%i: user id<br>%u: username<br>%n: nickname<br>%X: hex color<br>%x: color<br>%c: Created at<br>%j: Joined at<br>%b: premium since"
                    }
                },
                options: {
                    "f": {
                        description: "Fetch all members in guild, instead of using preloaded members"
                    }
                }
            },
            category: CommandCategory.UTIL
        },
    ]

    yield [
        "role-info", createCommandV2(async ({ msg, argList }) => {

            argList.beginIter()
            let role = await argList.expectRole(msg.guild as Guild, () => true) as Role | null
            if (!role) {
                return { content: "Could not find role", status: StatusCode.ERR }
            }
            let embed = new EmbedBuilder()
            embed.setTitle(role.name)
            embed.setColor(role.color)
            embed.addFields(efd(["id", String(role.id), true]))
            embed.addFields(efd(["name", role.name, true], ["emoji", role.unicodeEmoji || "None", true], ["created", role.createdAt.toTimeString(), true], ["Days Old", String((Date.now() - (new Date(role.createdTimestamp)).getTime()) / (1000 * 60 * 60 * 24)), true]))
            return { embeds: [embed] || "none", status: StatusCode.RETURN, allowedMentions: { parse: [] } }

        }, CAT, "Gets information about a role")]

    yield [
        "channel-info",
        {
            run: async (msg, args, sendCallback) => {
                let channel
                if (!args.join(" ").trim().length)
                    channel = msg.channel
                //@ts-ignore
                else channel = await fetchChannel(msg.guild, args.join(" ").trim())
                if (!channel)
                    return { content: "Channel not found", status: StatusCode.ERR }
                //@ts-ignore
                let pinned = await channel?.messages?.fetchPinned()
                let daysSinceCreation = (Date.now() - (new Date(channel.createdTimestamp as number)).getTime()) / (1000 * 60 * 60 * 24)
                let embed = new EmbedBuilder()
                //@ts-ignore
                embed.setTitle(channel.name || "Unknown name")
                if (pinned) {
                    let pinCount = pinned.size
                    let daysTillFull = (daysSinceCreation / pinCount) * (50 - pinCount)
                    embed.addFields(efd(["Pin Count", String(pinCount), true], ["Days till full", String(daysTillFull), true]))
                }
                embed.addFields(efd(["Created", channel.createdAt?.toString() || "N/A", true], ["Days since Creation", String(daysSinceCreation), true], ["Id", channel.id.toString(), true], ["Type", channel.type.toString(), true]))
                //@ts-ignore
                if (channel.topic) {
                    //@ts-ignore
                    embed.addFields(efd(["Topic", channel.topic, true]))
                }
                //@ts-ignore
                if (channel.nsfw) {
                    //@ts-ignore
                    embed.addFields(efd(["NSFW?", channel.nsfw, true]))
                }
                //@ts-ignore
                if (channel.position) {
                    //@ts-ignore
                    embed.addFields(efd(["Position", channel.position.toString(), true]))
                }
                return { embeds: [embed], status: StatusCode.RETURN }
            },
            category: CommandCategory.UTIL,
            help: {
                info: "Gets info about a channel"
            }
        },
    ]

    yield [
        "emote-info",
        {
            run: async (msg, args, sendCallback) => {
                let emote = args[0].split(":")[2].slice(0, -1)
                let e
                try {
                    e = await msg.guild?.emojis.fetch(emote)
                }
                catch (err) {
                    return { content: "No emoji found", status: StatusCode.ERR }
                }
                if (!e) {
                    return { content: "No emoji foudn", status: StatusCode.ERR }
                }
                let embed = new EmbedBuilder()
                embed.setTitle(String(e.name))
                embed.addFields(efd(["id", e.id, true], ["created Date", e?.createdAt.toDateString(), true], ["Creation time", e?.createdAt.toTimeString(), true], ["THE CREATOR", String(e?.author), true]))
                if (e.url)
                    embed.setThumbnail(e.url)
                embed.addFields(efd(["URL", e?.url, true]))
                return { embeds: [embed], status: StatusCode.RETURN }
            }, category: CommandCategory.UTIL,
            help: {
                info: "Get a random emote"
            }
        },
    ]

    yield ["sticker-info", ccmdV2(async ({ msg, opts, args }) => {
        let sticker = msg.stickers.at(0)
        if (opts.getBool("r", false)) {
            sticker = (await msg.guild?.stickers.fetch())?.random()
        }
        if (!sticker) {
            return { content: "No sticker", status: StatusCode.ERR }
        }
        let fmt = args.join(" ") || "{embed}"
        if (fmt === "{embed}") {
            let embed = new EmbedBuilder()
            embed.setThumbnail(sticker.url)
            embed.addFields([
                { name: "type", value: sticker.type?.toString() || "N/A", inline: true },
                { name: "name", value: sticker.name, inline: true },
                { name: "id", value: sticker.id, inline: true },
                { name: "creator", value: sticker.user?.toString() || "N/A", inline: true },
                { name: "createdAt", value: sticker.createdAt.toString(), inline: true },
                { name: "format", value: sticker.format?.toString(), inline: true },
                { name: "tags", value: sticker.tags?.toString() || "N/A", inline: true }
            ])
            return { embeds: [embed], status: StatusCode.RETURN }
        }
        return { content: format(fmt, { "t": sticker.type?.toString() || "N/A", n: sticker.name, i: sticker.id, c: sticker.user?.username || "N/A", T: sticker.createdAt.toString(), f: sticker.format?.toString(), "#": sticker.tags || "N/A" }), status: StatusCode.RETURN }
    }, "Gets info on a sticker", {
        docs: `<lh>format specifiers</lh><br>
<ul>
<li>t: type</li>
<li>n: name</li>
<li>i: id</li>
<li>c: creator</li>
<li>T: created at</li>
<li>f: format</li>
<li#: tags</li>
</ul>`,
        helpArguments: {
            sticker: createHelpArgument("The sticker to use", true),
            fmt: createHelpArgument("The format specifier", false, "{embed}")
        }
    },)]

    yield [
        "user-info!", ccmdV2(async function({ msg, args }) {
            args.beginIter()

            let search = args.expectString(1)
            if (search === BADVALUE) {
                return { content: "No search given", status: StatusCode.RETURN }
            }

            let user = await fetchUserFromClient(client, search)

            if (!user) {
                return { content: `${search} not found`, status: StatusCode.ERR }
            }

            let fmt = args.expectString(i => i ? true : BADVALUE)
            if (fmt && fmt !== BADVALUE) {
                return {
                    content: format(fmt, {
                        i: user.id || "#!N/A",
                        u: user.username || "#!N/A",
                        c: user.createdAt.toString() || "#!N/A",
                        a: user.avatarURL() || "#!N/A"
                    }),
                    status: StatusCode.RETURN
                }
            }
            let e = new EmbedBuilder()
            e.setTitle(user.username)
            let aurl = user.avatarURL()
            if (aurl)
                e.setThumbnail(aurl)
            e.addFields(efd(["id", user.id], ["created at", user.createdAt.toString()], ["avatar url", String(aurl)]))

            return {
                embeds: [e],
                status: StatusCode.RETURN
            }

        }, "gets the user info of a user", {
            helpArguments: {
                user: createHelpArgument("The user to search for"),
                '...fmt': createHelpArgument("The format to use<br><lh>formats</lh><ul><li>i: user id</li><li>u: username</li><li>c: created at timestamp</li><li>a: avatar url</li></ul>", false, undefined, "an embed")
            },
        })
    ]

    yield [
        "user-info",
        {
            run: async (msg: Message, args: ArgumentList, sendCallback) => {
                if (!args[0]) {
                    return {
                        content: "no member given!",
                        status: StatusCode.ERR
                    }
                }
                let member = msg.guild
                    ? await fetchUser(msg.guild, args[0])
                    : await fetchUserFromClient(client, args[0])
                return Pipe.start(member)
                    .default({ content: "member not found", status: StatusCode.ERR })
                    .next((member: GuildMember) => {
                        if (!member.user) {
                            return
                        }
                        return [member, member.user]
                    })
                    .default({ content: "user not found", status: StatusCode.ERR })
                    .next((member: GuildMember, user: User) => {
                        if (args[1]) {
                            let status = (() => {
                                return member.presence?.clientStatus?.desktop ?? member.presence?.clientStatus?.web ?? member.presence?.clientStatus?.mobile
                            })() ?? "invisible"
                            let platform = member.presence?.clientStatus && Object.keys(member.presence.clientStatus)[0] || "offline"
                            let platform_status = `${platform}/${status}`
                            const fmt = args.slice(1).join(" ")
                            return {
                                content: format(fmt,
                                    {
                                        "{id}": user.id || "#!N/A",
                                        "{username}": user.username || "#!N/A",
                                        "{nickname}": member.nickname || "#!N/A",
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
                                    }
                                )
                            }
                        }
                        let embed = new EmbedBuilder()
                        embed.setColor(member.displayColor)
                        embed.setThumbnail(user.avatarURL() || "")
                        let fields = [{ name: "Id", value: user.id || "#!N/A", inline: true }, { name: "Username", value: user.username || "#!N/A", inline: true }, { name: "Nickname", value: member.nickname || "#!N/A", inline: true }, { name: "0xColor", value: member.displayHexColor.toString() || "#!N/A", inline: true }, { name: "Color", value: member.displayColor.toString() || "#!N/A", inline: true }, { name: "Created at", value: user.createdAt.toString() || "#!N/A", inline: true }, { name: "Joined at", value: member.joinedAt?.toString() || "#!N/A", inline: true }, { name: "Boosting since", value: member.premiumSince?.toString() || "#!N/A", inline: true },]
                        embed.addFields(fields)
                        return {
                            embeds: [embed]
                        }
                    }).done()
            },
            help: {
                info: `Gets info on a member<br>[user-info &lt;user&gt; [format]<br>
valid formats:<br>
<ul>
    <li>
    <code>{id}</code> or <code>{i}</code> or <code>%i</code>: user id
    </li>
    <li>
    <code>{username}</code> or <code>{u}</code> or <code>%u</code>: user username
    </li>
    <li>
    <code>{nickname}</code> or <code>{n}</code> or <code>%n</code>: user nickname
    </li>
    <li>
    <code>{0xcolor}</code> or <code>{X}</code> or <code>%X</code>: user color in hex
    </li>
    <li>
    <code>{color}</code> or <code>{x}</code> or <code>%x</code>: user color
    </li>
    <li>
    <code>{created}</code> or <code>{c}</code> or <code>%c</code>: when the user was created
    </li>
    <li>
    <code>{joined}</code> or <code>{j}</code> or <code>%j</code>: when the user joined the server
    </li>
    <li>
    <code>{boost}</code> or <code>{b}</code> or <code>%b</code>: when the user started boosting the server
    </li>
    <li>
    <code>{status}</code> or <code>{s}</code> or <code>%s</code>: gets the platform/status of the user
</ul>`,
            },
            category: CommandCategory.UTIL

        },
    ]

    yield [
        "rand-emote",
        {
            run: async (msg, args, sendCallback) => {
                let opts: Opts;
                [opts, args] = getOpts(args)
                let amount = parseInt(String(opts['count'] || opts['c'])) || 1
                let sep = opts['sep'] || opts['s'] || "\n"
                sep = String(sep)
                let send = ""
                let emojis = await msg.guild?.emojis.fetch()
                if (!emojis) {
                    return { content: "Could not find emojis", status: StatusCode.ERR }
                }
                if (Boolean(opts['a'])) {
                    emojis = emojis.filter(e => e.animated ? true : false)

                }
                else if (Boolean(opts['A'])) {
                    emojis = emojis.filter(e => e.animated ? false : true)
                }
                else if (opts['f']) {
                    emojis = emojis.filter((e) => Boolean(safeEval(String(opts['f']), { id: e.id, animated: e.animated, url: e.url, createdAt: e.createdAt, createdTimeStamp: e.createdTimestamp, name: e.name, identifier: e.identifier }, { timeout: 1000 })))
                }
                for (let i = 0; i < amount; i++) {
                    send += String(emojis.random())
                    send += sep
                }
                return { content: send, status: StatusCode.RETURN }
            },
            help: {
                info: "Gives a random server emoji",
                options: {
                    "c": {
                        description: "The amount of emojis to send",
                        alternates: ["count"]
                    },
                    "s": {
                        description: "The character to seperate each emoji by",
                        alternates: ["sep"]
                    },
                    "a": {
                        description: "The emoji must be animated"
                    },
                    "A": {
                        description: "The emoji can't be animated"
                    },
                    'f': {
                        description: "Custom filter"
                    }
                }
            },
            category: CommandCategory.UTIL

        },
    ]

    yield [
        "emote-use",
        {
            run: async (msg, args, sendCallback) => {
                let opts;
                [opts, args] = getOpts(args)
                let serverOnly = opts['S'] ? false : true
                let data = globals.generateEmoteUseFile()
                    .split("\n")
                    .map(v => v.split(":"))
                    .filter(v => v[0])
                let newData: [string | GuildEmoji, string][] = []
                let cachedEmojis = await msg.guild?.emojis.fetch()
                for (let i = 0; i < data.length; i++) {
                    let emoji: string | GuildEmoji | undefined | null = data[i][0];
                    try {
                        emoji = cachedEmojis?.find((v) => v.id == data[i][0])
                    }
                    catch (err) {
                        if (serverOnly) continue
                        emoji = data[i][0]
                    }
                    if (!emoji) {
                        if (serverOnly) continue
                        emoji = data[i][0]
                    }
                    newData.push([emoji, data[i][1]])
                }
                let finalData = newData
                    .sort((a, b) => Number(a[1]) - Number(b[1]))
                    .reverse()
                    .map(v => `${v[0]}: ${v[1]}`)
                    .join("\n")
                return { content: finalData, status: StatusCode.RETURN }
            },
            help: {
                options: {
                    "S": {
                        description: "Show emote use of all emojis, even ones not from this server"
                    }
                }
            },
            category: CommandCategory.UTIL
        },
    ]

    yield [
        "invite",
        {
            run: async (msg, _args, sendCallback) => {
                let invites = await msg.guild?.invites.fetch()
                if (invites?.at(0)?.url) {
                    return { content: invites.at(0)?.url, status: StatusCode.RETURN }
                }
                return { content: "No invite found", status: StatusCode.ERR }
            },
            category: CommandCategory.UTIL,
            help: {
                info: "Gets an invite link for the server"
            }
        },
    ]

    yield [
        "non-assigned-roles",
        {
            run: async (msg, _args, sendCallback) => {
                await msg.guild?.members.fetch()
                let roles = await msg.guild?.roles.fetch()
                let rolesNonAssigned: any[] = []
                roles?.forEach(r => {
                    if (r.members.size < 1)
                        rolesNonAssigned.push(r.name)
                })
                return { content: rolesNonAssigned.join("\n") + `\n${rolesNonAssigned.length} roles do not have any members`, status: StatusCode.RETURN }
            },
            category: CommandCategory.UTIL,
            help: {
                info: "Gets a list of non-assigned-roles"
            }
        },
    ]

    yield [
        "tail", createCommandV2(async ({ args, opts, stdin }) => {
            let count = opts.getNumber("count", 10)
            let argText = stdin ? getContentFromResult(stdin, "\n") : args.join(" ")
            return { content: argText.split("\n").reverse().slice(0, count).reverse().join("\n"), status: StatusCode.RETURN }

        }, CAT, "Get the last 10 lines", { text: createHelpArgument("The text to get the last lines of (also accepts pipe)", true) }, { count: createHelpOption("get the lats n lines instead of 1", undefined, "10") })
    ]

    yield [
        "head", createCommandV2(async ({ args, opts, stdin }) => {
            let count = opts.getNumber("count", 10)
            let argText = stdin ? getContentFromResult(stdin, "\n") : args.join(" ")
            return { content: argText.split("\n").slice(0, count).join("\n"), status: StatusCode.RETURN }

        }, CAT, "Say the first 10 lines of somet text", { text: createHelpArgument("Text also accepts pipe") }, { count: createHelpOption("The amount of lines to show") })
    ]

    yield [
        "nl", createCommandV2(async ({ msg, args, stdin }) => {
            let text = stdin ? getContentFromResult(stdin, "\n").split("\n") : args.join(" ").split('\n')
            let rv = ""
            for (let i = 1; i < text.length + 1; i++) {
                rv += `${i}: ${text[i - 1]}\n`
            }
            return { content: rv, status: StatusCode.RETURN }

        }, CommandCategory.UTIL, "Number the lines of text")
    ]

    yield [
        "grep", createCommandV2(async ({ msg, argList, stdin, opts, args }) => {
            argList.beginIter()
            let regex = argList.expectString((_, __, argsUsed) => stdin ? true : argsUsed < 1)
            if (regex === BADVALUE) {
                return {
                    content: "no search given",
                    status: StatusCode.ERR
                }
            }
            let data = stdin ? stdin.content : argList.expectString(() => true)

            if (!data) {
                let attachment = msg.attachments?.at(0)
                if (attachment) {
                    let res = await fetch.default(attachment.url)
                    data = await res.text()
                }
                else return { content: "no data given to search through", status: StatusCode.ERR }
            }
            let match = (<string>data).matchAll(new RegExp(regex, "gm"))
            let finds = ""
            for (let find of match) {
                if (opts.getBool("s", false)) {
                    if (find[1]) {
                        finds += find.slice(1).join(", ")
                    }
                    else {
                        finds += find[0]
                    }
                    finds += '\n'
                }
                else {
                    if (find[1]) {
                        finds += `Found \`${find.slice(1).join(", ")}\` at character ${(find?.index ?? 0) + 1}\n`
                    }
                    else {
                        finds += `Found \`${find[0]}\` at character ${(find?.index ?? 0) + 1}\n`
                    }
                }
            }
            return {
                content: finds,
                status: StatusCode.RETURN
            }
        }, CommandCategory.UTIL, "Search through text with a search", {
            search: createHelpArgument("A regex search", true),
            data: createHelpArgument("Text or a file to search through<br>If data is given through pipe, all arguments become the search")
        }, {
            s: createHelpOption("dont give back the extra \"found x at char...\" text")
        })
    ]
}
