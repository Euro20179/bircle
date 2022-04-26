import fs from 'fs' 
import https from 'https'
import Stream from 'stream'
import { execSync } from 'child_process'

import {REST} from '@discordjs/rest'
import { Routes } from "discord-api-types/v9"
import {Client, Intents, Message, MessageEmbed } from 'discord.js'

import canvas from 'canvas'
import got from 'got'
import cheerio from 'cheerio'

import { prefix, vars, ADMINS, FILE_SHORTCUTS, WHITELIST, BLACKLIST, addToPermList, removeFromPermList } from './common.js'
import { parseCmd } from './parsing.js'
import { fetchUser, generateFileName } from './util.js'
import { argv0 } from 'process'


const client = new Client({intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES]})

const token = fs.readFileSync("./TOKEN", "utf-8")
const CLIENT_ID = fs.readFileSync("./CLIENT", "utf-8")
const GUILD_ID = fs.readFileSync("./GUILD", "utf-8")

let SPAM_ALLOWED = true

let SPAMS = {}

function createChatCommand(name, description, options){
    return {
        name: name,
        description: description,
        options: options
    }
}

const STRING = 3
const INTEGER = 4
const BOOL = 5
const USER = 6
const CHANNEL = 7
const ROLE = 8
const MENTIONABLE = 9
const NUMBER = 10
const ATTACH = 11


function createChatCommandOption(type, name, description, {min, max, required}){
    let obj = {
        type: type,
        name: name,
        description: description,
        required: required || false
    }
    if(min){
        obj["min"] = min
    }
    if(max){
        obj["max"] = max
    }
    return obj
}

const slashCommands = [
    createChatCommand("attack", "attacks chris, and no one else", [createChatCommandOption(USER, "user", "who to attack", {required: true})]),
    createChatCommand("ping", "Pings a user for some time", [
        createChatCommandOption(USER, "user", "who to ping twice", {required: true}),
        createChatCommandOption(INTEGER, "evilness", "on a scale of 1 to 10 how evil are you", {})
    ]),
    createChatCommand("img", "create an image", [
        createChatCommandOption(INTEGER, "width", "width of image", {required: true, min: 0, max: 5000}),
        createChatCommandOption(INTEGER, "height", "height of image", {required: true, min: 0, max: 5000}),
        createChatCommandOption(STRING, "color", "color of image", {})
    ]),
    {
        name: "ping",
        type: 2
    },
    {
        name: "info",
        type: 2
    }
]

function getContentFromResult(result){
    return result["content"] || ""
}

function turnArgsToString(args){
    let ans = ""
    for(let arg of args){
        if(typeof arg !== "string"){
            ans += `${getContentFromResult(arg).trim()} `
        }
        else{
            ans += `${arg.trim()} `
        }
    }
    return ans
}

function getOpts(args){
    let opts = {} 
    let newArgs = []
    let idxOfFirstRealArg = 0
    for(let arg of args){
        idxOfFirstRealArg++
        if(arg[0] == "-"){
            if(arg[1]){
                let [opt, value] = arg.slice(1).split("=")
                opts[opt] = value == undefined ? true : value;
            }
        }else{
            idxOfFirstRealArg--
            break
        }
    }
    for(let i = idxOfFirstRealArg; i < args.length; i++){
        newArgs.push(args[i])
    }
    return [opts, newArgs]
}

function generateHTMLFromCommandHelp(name, command){
    let html = `<div class="command-section"><h1 class="command-title">${name}</h1>`
    let help = command["help"]
    if(help){
        let info = help["info"] || ""
        let aliases = help["aliases"] || []
        let options = help["options"] || {}
        let args = help["arguments"] || {}
        if(info !== ""){
            html += `<h2 class="command-info">Info</h2><p class="command-info">${info}</p>`
        }
        if(args !== {}){
            html += `<h2 class="command-arguments">Arguments</h2><ul class="command-argument-list">`
            for(let argName in args){
                let argument = args[argName].description
                let required = args[argName].required || false
                let requires = args[argName].requires || ""
                let extraText = ""
                if(requires){
                    extraText = `<span class="requires">requires: ${requires}</span>`
                }
                html += `<li class="command-argument" data-required="${required}">
    <details class="command-argument-details-label" data-required="${required}" title="required: ${required}"><summary class="command-argument-summary" data-required="${required}">${argName}</summary>${argument}<br>${extraText}</details>
    </li>`
            }
            html += "</ul>"
        }
        if(options !== {}){
            html += `<h2 class="command-options">Options</h2><ul class="command-option-list">`
            for(let option in options){
                let desc = options[option].description || ""
                let requiresValue = options[option].requiresValue || false
                html += `<li class="command-option">
    <details class="command-option-details-label" title="requires value: ${requiresValue}"><summary class="command-option-summary">${option}</summary>${desc}</details></li>`
            }
            html += "</ul>"

        }
        if(aliases !== []){
            html += `<h2 class="commmand-aliases">Aliases</h2><ul class="command-alias-list">`
            for(let alias of aliases){
                html += `<li class="command-alias">${alias}</li>`
            }
            html += "</ul>"
        }
    }
    return `${html}</div><hr>`
}

const commands = {
    echo:{
        run: async (msg, args) => {
            let opts, _
            [opts, args] = getOpts(args)
            args = turnArgsToString(args).trim();
            if(!args){
                return {
                    content: "cannot send nothing"
                }
            }
            return {
                delete: !opts["D"],
                content: args
            }
        },
        help: {
            info: "the bot will say the <code>text</code>",
            aliases: [],
            options: {
                "D": {
                    description: "If given, dont delete original message"
                }
            },
            arguments: {
                text: {
                    description: "what to say",
                    required: true
                }
            }
        }
    },
    rand: {
        run: async (msg, args) => {
            const low = parseFloat(args[0]) || 0
            const high = parseFloat(args[1]) || 1
            return {
                content: String(Math.random() * (high - low) + low)
            }
        },
        help: {
            arguments: {
                low: {
                    "description": "the lowest number"
                },
                high: {
                    "description": "the highest number"
                }
            }
        }
    },
    img: {
        run: async (msg, args) => {
            let opts = {};
            [opts, args] = getOpts(args)
            const width = parseFloat(args[0]) || 100
            const height = parseFloat(args[1]) || 100
            if(width < 0){
                return {
                    content: "Width must be > 0"
                }
            }
            if(height < 0){
                return {
                    content: "Height must be > 0"
                }
            }
            const fmts = {
                "jpg": "image/jpeg",
                "jpeg": "image/jpeg",
                "png": "image/png"
            }
            const exts = {
                "image/jpeg": "jpg",
                "image/png": "png"
            }
            const img = canvas.createCanvas(width, height)
            const ctx = img.getContext("2d")
            ctx.fillStyle = args[2] || "black"
            ctx.fillRect(0, 0, width, height)
            let fmt = fmts[opts["fmt"]] || "image/png"
            let ext = exts[fmt]
            const buffer = img.toBuffer(fmt)
            fs.writeFileSync(`./out.${ext}`, buffer)
            return {
                files:[
                    {
                        attachment: `out.${ext}`,
                        name: `file.${ext}`,
                        description: "why can i describe this"
                    }
                ],
                content: "Your image, sir"
            }
        },
        help: {
            arguments: {
                width: {
                    description: "the width of the image",
                    required: false
                },
                height: {
                    description: "the height of the image",
                    requires: "width"
                },
                color: {
                    description: "color of the image",
                    requires: "height"
                }
            },
            options: {
                "fmt": {
                    description: "The image format to use, can be png, or jpg, eg: -fmt=png"
                }
            }
        }
    },
    text: {
        run: async(msg, args) => {
            let opts
            [opts, args] = getOpts(args)
            let img = opts["img"]
            let size = opts["size"] || "20px"
            let font = opts["font"] || "Arial"
            let color = opts["color"] || "red"
            let x = opts["x"] || 0
            let y = opts["y"] || 0
            if(!img) {
                img = msg.channel.messages.cache.filter(m => m.attachments?.first())?.last()?.attachments?.first()?.attachment
            }

            let fn = `${generateFileName("text", msg.author.id)}.png`

            https.request(img, resp => {
                let data = new Stream.Transform()
                resp.on("data", chunk => {
                    data.push(chunk)
                })
                resp.on("end", async() => {
                    fs.writeFileSync(fn, data.read())
                    let img = await canvas.loadImage(fn)
                    fs.rmSync(fn)
                    let canv = new canvas.Canvas(img.width, img.height)
                    let ctx = canv.getContext("2d")
                    ctx.drawImage(img, 0, 0, img.width, img.height)
                    ctx.font = `${size} ${font}`
                    ctx.fillStyle = color
                    let textInfo = ctx.measureText(args.join(" ").trim() || "?")
                    console.log(textInfo)
                    let [textW, textH] = [textInfo.width, textInfo.emHeightAscent]
                    if(x == "center"){
                        x = img.width / 2 - textW / 2
                    }
                    if(y == "center"){
                        y = img.height / 2 - textH / 2
                    }
                    x = parseInt(x)
                    y = parseInt(y)
                    y += textH
                    ctx.fillText(args.join(" ").trim() || "?", x, y)
                    const buffer = canv.toBuffer("image/png")
                    fs.writeFileSync(`./out.png`, buffer)
                    msg.channel.send({files: [{attachment: './out.png', name: './out.png',}]}).then(res => {
                        fs.rmSync('./out.png')
                    }).catch(err => {
                    })
                })
            }).end()
            return {
                content: "generating img"
            }
        }
    },
    choose: {
        run: async(msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            let times = 1
            let sep = String(opts["sep"] || opts["s"] || "\n")
            if(opts["times"] || opts["t"]){
                times = parseInt(opts["t"])
            }
            let ans = []
            args = args.join(" ").split("|")
            for(let i = 0; i < times; i++){
                ans.push(args[Math.floor(Math.random() * args.length)].trim())
            }
            return {
                content: ans.join(sep) || "```invalid message```"
            }
        }
    },
    spam: {
        run: async(msg, args) => {
            let times = parseInt(args[0])
            if(times){
                args.splice(0, 1)
            } else times = 10
            let send = args.join(" ").trim()
            if(send == ""){
                send = String(times)
                times = 10
            }
            let id = String(Math.floor(Math.random() * 100000000))
            await msg.channel.send(`starting ${id}`)
            SPAMS[id] = true
            while(SPAMS[id] && times--){
                await msg.channel.send(send)
                await new Promise(res => setTimeout(res, Math.random() * 700 + 200))
            }
            return {
                content: "done"
            }
        }
    },
    stop: {
        run: async(msg, args) => {
            if(args[0]){
                if(SPAMS[args[0]]){
                    delete SPAMS[args[0]]
                    return {
                        content: `stopping ${args[0]}`
                    }
                }
                return {
                    content: `${args[0]} is not a spam id`
                }
            }
            SPAM_ALLOWED = false;
            for(let spam in SPAMS){
                delete SPAMS[spam]
            }
            return {
                content: "stopping all"
            }
        }
    },
    "var": {
        run: async(msg, args) => {
            let name, value
            [name, value] = args.join(" ").split("=")
            vars[name] = () => value
            return {
                content: vars[name]()
            }
        },
        help: {
            arguments: {
                "name=value": {
                    description: "name is the variable name, value is the value",
                    required: true
                }
            }
        }
    },
    remove: {
        run: async(msg, args) => {
            const file = FILE_SHORTCUTS[args[0]] || args[0]
            if(!file){
                return {
                    content: "Nothing given to add to"
                }
            }
            if(file.match(/[\.]/)){
                return {
                    content: "invalid command"
                }
            }
            if(!fs.existsSync(`./command-results/${file}`)){
                return {
                    content: "file does not exist"
                }
            }
            let data = fs.readFileSync(`./command-results/${file}`, "utf-8").split(";END")
            let options = data.map((value, i) => `${i + 1}:\t${value.trim()}`)
            let fn = generateFileName("remove", msg.author.id)
            fs.writeFileSync(fn, options.join("\n"))
            await msg.channel.send({
                content: "Say the number of what you want to remove",
                files: [{
                    attachment: fn,
                    name: "remove.txt"
                }]
            })
            fs.rmSync(fn)
            try{
                let m = await msg.channel.awaitMessages({filter: m => m.author.id == msg.author.id, max: 1, time: 30000, errors: ['time']})
                let num = parseInt(m.at(0).content)
                if(!num){
                    await msg.channel.send(`${num} is not a valid number`)
                }
                let removal = data[num -1]
                let userCreated = removal.split(":")[0].trim()
                if(userCreated != msg.author.id && ADMINS.indexOf(msg.author.id) < 0) {
                    return {
                        content: "You did not create that message, and are not a bot admin"
                    }
                }
                data.splice(num - 1, 1)
                fs.writeFileSync(`command-results/${file}`, data.join(";END"))
                return {
                    content: `removed ${removal} from ${file}`
                }
            }
            catch(err){
                return {
                    content: "didnt respond in time"
                }
            }
        },
        help: {
            arguments: {
                file: {
                    description: "The command file to remove from",
                    required: true
                }
            }
        }
    },
    "command-file": {
        run : async(msg, args) => {
            let opts
            [opts, args] = getOpts(args)
            if(opts["l"]){
                return {
                    content: `\`\`\`
${fs.readdirSync("./command-results").join("\n")}
\`\`\`
`
                }
            }
            const file = FILE_SHORTCUTS[args[0]] || args[0]
            if(!file){
                return {
                    content: "Nothing given to add to"
                }
            }
            if(!fs.existsSync(`./command-results/${file}`)){
                return {
                    content: "file does not exist"
                }
            }
            return {
                files: [
                    {
                        attachment: `./command-results/${file}`,
                        name: `${file}.txt`,
                        description: `data for ${file}`,
                        delete: false
                    }
                ]
            }
        },
        help: {
            arguments: {
                file: {
                    description: "the file to see"
                }
            }
        }
    },
    add: {
        run: async(msg, args) =>{
            const file = FILE_SHORTCUTS[args[0]] || args[0]
            if(!file){
                return {
                    content: "Nothing given to add to"
                }
            }
            if(file.match(/[\.]/)){
                return {
                    content: "invalid command"
                }
            }
            if(!fs.existsSync(`./command-results/${file}`)){
                return {
                    content: "file does not exist"
                }
            }
            args = args.slice(1)
            const data = args?.join(" ")
            if(!data){
                return {
                    content: "No data given"
                }
            }
            fs.appendFileSync(`./command-results/${file}`, `${msg.author.id}: ${data};END\n`)
            return {
                content: `appended \`${data}\` to \`${file}\``
            }
        },
        help: {
            arguments: {
                "file": {
                    description: "The command file list to add to",
                    required: true
                },
                "data": {
                    description: "The text to add to the file",
                    required: true,
                    requires: "file"
                }
            }
        }
    },
    "8": {
        run: async(msg, args) => {
            let content = args.join(" ")
            let options = fs.readFileSync(`./command-results/8ball`, "utf-8").split(";END").slice(0, -1)
            return {
                content: options[Math.floor(Math.random() * options.length)]
                            .slice(20)
                            .replaceAll("{content}", content)
                            .replaceAll("{u}", `${msg.author}`)
            }
        },
        help: {
            info: "<code>[8 question</code><br>for the <code>[add</code> command, <code>{u}</code> represents user using this command, and <code>{content}</code> is their question",
            arguments: {
                question: {
                    description: "What is on your mind?"
                }
            }
        }
    },
    distance: {
        run: async(msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            let speed = opts['speed']
            args = args.join(" ")
            let [from, to] = args.split("|")
            if(!to){
                return {content: "No second place given, fmt: `place 1 | place 2`"}
            }
            let fromUser = await fetchUser(msg.guild, from)
            let toUser = await fetchUser(msg.guild, to)
            if(fromUser && toUser){
                let options = fs.readFileSync("./command-results/distance-easter-egg", "utf-8").split(';END').slice(0, -1)
                return {
                    content: options[Math.floor(Math.random() * options.length)]
                        .slice(20)
                        .replaceAll("{from}", fromUser.id)
                        .replaceAll("{to}", toUser.id)
                        .replaceAll("{f}", `${fromUser}`)
                        .replaceAll("{t}", `${toUser}`)
                        .trim()
                }
            }
            from = encodeURI(from.trim())
            to = encodeURI(to.trim())
            const url = `https://www.travelmath.com/distance/from/${from}/to/${to}`
            const resp = await got(url, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36",
                }
            })
            const $ = cheerio.load(resp.body)
            let text = $("p.home2").text()
            let drivingDistText = text.match(/The total driving distance from [^\.]* is ([\d,]*) miles/)
            let drivingDist = 0;
            if(drivingDistText){
                drivingDist = parseInt(drivingDistText[1]?.replaceAll(",", ""))
            }
            let straightLineText = text.match(/The total straight line flight distance from [^\.]* is ([\d,]*) miles/)
            let straightLineDist = 0
            if(straightLineText){
                straightLineDist = parseInt(straightLineText[1]?.replaceAll(",", ""))
            }
            const embed = new MessageEmbed()
            embed.setTitle("Distances")
            if(drivingDist){
                embed.addField("Driving distance", `${drivingDist} miles`)
                if(speed)
                    embed.addField("Driving distance time", `${drivingDist / speed} hours`)
            }
            if(straightLineDist){
                embed.addField("Straight line distance", `${straightLineDist} miles`)
                if(speed)
                    embed.addField("Straight line distance time", `${straightLineDist / speed} hours`)
            }
            if(!drivingDist && !straightLineDist){
                let dist = Math.floor(Math.random() * 1000 + 500)
                embed.addField("Fictional distance", `${dist} miles`)
                if(speed)
                    embed.addField("Fictional distance time", `${dist / speed} hours`)
            }
            return {
                embeds: [embed]
            }
        },
        help: {
            arguments: {
                "city 1": {
                    "description": "The starting city, seperate the cities with |",
                    "required": true
                },
                "city 2": {
                    "description": "The ending city, seperate the cities with |",
                    required: true
                }
            }
        }
    },
    "list-cmds": {
        run: async(msg, args) => {
            let values = ''
            for(let cmd in commands){
                values += `${cmd}\n`
            }
            return {
                content: values
            }
        }
    },
    help: {
        run: async (msg, args) => {
            let opts
            [opts, args] = getOpts(args)
            if(opts["g"]){
                return {content: `\`\`\`
[command [args...]
escapes:
    \\n: new line
    \\t: tab
    \\U{hex}: unicode
    \\u{hex}: unicode
    \\s: space
    \\s{text}: all the text inside is treated as 1 argument
    \\b{text}: bold
    \\i{text}: italic
    \\S{text}: strikethrough
    \\d{date}: date
    \\D{unix timestamp}: date from timestamp
    \\V{variable name}: value of a variable
    \\\\: backslash
formats:
    {user}: mention yourself
    {arg}: give back the current text that prefixes {arg}
variables:
    random: random number
    rand: random number
    prefix: bot's prefix
    vcount: variable count
    sender: mention yourself
    you may also define custom variables like: [var x=y
        or [var x=\\s{this is a long variable}
\`\`\`
`}
            }
            let files = []
            let commandsToUse = commands
            if(args[0]){
                commandsToUse = {}
                if(args[0] == "?"){
                    commandsToUse = commands
                }
                else{
                    for(let cmd of args){
                        if(!commands[cmd]) continue
                        commandsToUse[cmd] = commands[cmd]
                    }
                }
            }
            if(Object.keys(commandsToUse).length < 1){
                return {
                    content: "No help can be given :("
                }
            }
            if(!fs.existsSync("help.html") || opts["n"] || args.length > 0){
                await msg.channel.send("generating new help file")
                let styles = fs.readFileSync("help-styles.css")
                let html = `<style>
${styles}
</style>`
                let skip = []
                for(let cmd in commandsToUse){
                    if(skip.includes(cmd)) continue
                    if(commands[cmd]["help"]?.aliases){
                        skip = skip.concat(commands[cmd].help.aliases)
                    }
                    html += generateHTMLFromCommandHelp(cmd, commands[cmd])
                }
                fs.writeFileSync("help.html", html)
            }
            if(opts["p"]){
                opts["plain"] = true
            }
            if(opts["m"]){
                opts["markdown"] = true
            }
            if(opts["h"] || opts["html"] || Object.keys(opts).length === 0){
                files.push({
                    attachment: "help.html",
                    name: "help.html",
                    description: "help",
                    delete: false
                })
                if(opts["h"])
                    delete opts["h"]
                if(opts["html"])
                    delete opts["html"]
            }
            const exts = {
                "plain": "txt",
                "markdown": "md",
                "man": "1",
                "commonmark": "md"
            }
            for(let fmt in opts){
                if(fmt.length == 1) continue
                if(!fmt.match(/^\w+$/)) continue
                const ext = exts[fmt] || fmt
                try{
                    execSync(`pandoc -o output.${ext} -fhtml -t${fmt} help.html`)
                }
                catch(err){
                    continue
                }
                files.push({
                    attachment: `output.${ext}`,
                    name: `help.${ext}`,
                    description: "help"
                })
            }
            if(files.length > 0){
                return {
                    files: files
                }
            }
            return {
                content: "cannot send an empty file"
            }
        },
        help: {
            options: {
                "p": {
                    "description": "give a plain text file intead of html"
                },
                "m": {
                    "description": "give a markdown file instead of html"
                },
                "n": {
                    "description": "forcefully generate a new help file"
                },
                "g": {
                    "description": "show the syntax of the bot"
                },
                "*": {
                    "description": "any format that pandoc allows, if you're curious, look up \"pandoc formats\""
                }
            }
        }
    },
    WHITELIST: {
        run: async(msg, args) => {
            let user = args[0]
            if(!user){
                return {
                    content: "no user given"
                }
            }
            let addOrRemove = args[1]
            if(!["a", "r"].includes(addOrRemove)){
                return {
                    content: "did not specify, (a)dd or (r)emove"
                }
            }
            let cmds = args.slice(2)
            if(!cmds.length){
                return {
                    content: "no cmd given"
                }
            }
            user = await fetchUser(msg.guild, user)
            if(addOrRemove == "a"){
                addToPermList(WHITELIST, "whitelists", user, cmds)

                return {
                    content: `${user} has been whitelisted to use ${cmds.join(" ")}`
                }
            } else {
                removeFromPermList(WHITELIST, "whitelists", user, cmds)
                return {
                    content: `${user} has been removed from the whitelist of ${cmds.join(" ")}`
                }
            }
        },
        permCheck: msg => {
            return ADMINS.includes(msg.author.id)
        }
    },
    BLACKLIST: {
        run: async(msg, args) => {
            let user = args[0]
            if(!user){
                return {
                    content: "no user given"
                }
            }
            let addOrRemove = args[1]
            if(!["a", "r"].includes(addOrRemove)){
                return {
                    content: "did not specify, (a)dd or (r)emove"
                }
            }
            let cmds = args.slice(2)
            if(!cmds.length){
                return {
                    content: "no cmd given"
                }
            }
            user = await fetchUser(msg.guild, user)
            if(addOrRemove == "a"){
                addToPermList(BLACKLSIT, "blacklists", user, cmds)

                return {
                    content: `${user} has been blacklisted from ${cmds.join(" ")}`
                }
            } else {
                removeFromPermList(BLACKLIST, "blacklists", user, cmds)
                return {
                    content: `${user} has been removed from the blacklist of ${cmds.join(" ")}`
                }
            }
        },
        permCheck: msg => {
            return ADMINS.includes(msg.author.id)
        }
    },
    END: {
        run: async(msg, args) => {
            await msg.channel.send("STOPPING")
            client.destroy()
            return {
                content: "STOPPING"
            }
        },
        permCheck: (msg) => {
            return ADMINS.includes(msg.author.id)
        }
    }
}

function alias(a, o){
    commands[a] = commands[o]
    let aliases = commands[o].help.aliases
    if(aliases){
        commands[o].help.aliases.push(a)
    }
    else{
        commands[o].help.aliases = [a]
    }
}
alias("e", "echo")

const rest = new REST({version: "9"}).setToken(token);

(async () => {
    try {
      console.log('Started refreshing application (/) commands.');
  
      await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
        { body: slashCommands },
      );
  
      console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
      console.error(error);
    }
})();

async function doCmd(msg, returnJson=false){
    let [command, args, doFirsts] = parseCmd({msg: msg})
    for(let idx in doFirsts){
        let oldContent = msg.content
        msg.content = doFirsts[idx]
        args[idx] = args[idx].replaceAll("%{}", getContentFromResult(await doCmd(msg, true)).trim())
        msg.content = oldContent
    }
    if(command in commands >= 0){
        if(! commands[command]){
            return
        }
        let canRun = true
        if(commands[command].permCheck){
            canRun = commands[command].permCheck(msg)
        }
        if(WHITELIST[msg.author.id]?.includes(command)){
            canRun = true
        }
        if(BLACKLIST[msg.author.id]?.includes(command)){
            canRun = false
        }
        let rv;
        if(canRun)
            rv = await commands[command].run(msg, args)
        else rv = {content: "You do not have permissions to run this command"}
        if(returnJson){
            return rv;
        }
        if(!Object.keys(rv).length){
            return
        }
        if(rv.delete){
            msg.delete()
        }
        if(rv.content?.length >= 2000){
            fs.writeFileSync("out", rv.content)
            delete rv["content"]
            if(rv.files){
                rv.files.push({attachment: "out", name: "cmd.txt", description: "command output too long"})
            } else{
                rv.files = [{
                    attachment: "out", name: "cmd.txt", description: "command output too long"
                }]
            }
        }
        await msg.channel.send(rv)
        if(rv.files){
            for(let file of rv.files){
                if(file.delete !== false)
                    fs.rmSync(file.attachment)
            }
        }
    }
}

client.on('ready', () => {
    console.log("ONLINE")
})

client.on("messageCreate", async(m) => {
    let content = m.content
    if(content.slice(0, prefix.length) !== prefix){
        return
    }
    await doCmd(m)
})

client.on("interactionCreate", async(interaction) => {
    if(interaction.isCommand()){
        if(interaction.commandName == 'attack'){
            let user = interaction.options.get("user")['value']
            await interaction.reply(`Attacking ${user}...`)
            await interaction.channel.send(`${user} has been attacked by <@${interaction.user.id}>`)
        }
        else if(interaction.commandName == 'ping'){
            let user = interaction.options.get("user")?.value || `<@${interaction.user.id}>`
            let times = interaction.options.get("evilness")?.value || 1
            interaction.reply("Pinging...")
            SPAM_ALLOWED = true
            for(let i = 0; i < times; i++){
                if(!SPAM_ALLOWED) break
                await interaction.channel.send(`<@${user}> has been pinged`)
                await new Promise(res => setTimeout(res, Math.random() * 700 + 200))
            }
        }
        else if(interaction.commandName == 'img'){
            let rv = await commands["img"].run(interaction, [interaction.options.get("width")?.value, interaction.options.get("height")?.value, interaction.options.get("color")?.value])
            await interaction.reply(rv)
            if(rv.files){
                for(let file of rv.files){
                    fs.rmSync(file.attachment)
                }
            }
        }
    }
    else if(interaction.isUserContextMenu()){
        if(interaction.commandName == 'ping'){
            interaction.reply(`<@${interaction.user.id}> has pinged <@${interaction.targetUser.id}> by right clicking them`)
        }
        else if(interaction.commandName == 'info'){
            const user = interaction.targetUser
            const member = interaction.targetMember
            let embed = new MessageEmbed()
            embed.setColor(interaction.targetMember.displayColor)
            embed.setThumbnail(user.avatarURL())
            embed.addField("Id", user.id || "#!N/A", true)
            embed.addField("Username", user.username || "#!N/A", true)
            embed.addField("Nickname", member.nickName || "#!N/A", true)
            embed.addField("0xColor", member.displayHexColor.toString() || "#!N/A", true)
            embed.addField("Color", member.displayColor.toString() || "#!N/A", true)
            embed.addField("Created at", user.createdAt.toString() || "#!N/A", true)
            embed.addField("Joined at", member.joinedAt.toString() || "#!N/A", true)
            embed.addField("Boosting since", member.premiumSince?.toString() || "#!N/A", true)
            interaction.reply({embeds: [embed]})
        }
    }
})

client.login(token)
