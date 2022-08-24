///<reference path="index.d.ts" />
import fs = require("fs")
import vm = require("vm")

import https = require('https')
import Stream = require('stream')
const { execSync, exec } = require('child_process')

const { createAudioPlayer, joinVoiceChannel } = require("@discordjs/voice")
const { REST } = require('@discordjs/rest')
const { Routes } = require("discord-api-types/v9")
import {Client, Intents, MessageEmbed, User, Message, PartialMessage, Interaction, GuildMember, ColorResolvable, TextChannel, MessageButton, MessagePayload, MessageActionRow, MessageSelectMenu, ButtonInteraction, GuildEmoji } from 'discord.js'

import uno = require("./uno")

import sharp = require('sharp')
import got = require('got')
import cheerio = require('cheerio')
import jimp = require('jimp')
import { AudioPlayerStatus, createAudioResource, NoSubscriberBehavior } from "@discordjs/voice"


const { LOGFILE, prefix, vars, userVars, ADMINS, FILE_SHORTCUTS, WHITELIST, BLACKLIST, addToPermList, removeFromPermList, VERSION } = require('./common.js')
const { parseCmd, parsePosition } = require('./parsing.js')
const { cycle, downloadSync, fetchUser, fetchChannel, format, generateFileName, createGradient, applyJimpFilter, randomColor, rgbToHex, safeEval, mulStr, escapeShell, strlen, UTF8String, cmdCatToStr } = require('./util.js')


enum CommandCategory{
    UTIL,
    GAME,
    FUN,
    META,
    IMAGES
}

const client = new Client({intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_MEMBERS, Intents.FLAGS.DIRECT_MESSAGES, Intents.FLAGS.GUILD_VOICE_STATES]})

const token = fs.readFileSync("./TOKEN", "utf-8").trim()
const CLIENT_ID = fs.readFileSync("./CLIENT", "utf-8").trim()
const GUILD_ID = fs.readFileSync("./GUILD", "utf-8").trim()

let SPAM_ALLOWED = true

let BUTTONS: {[id: string]: string | (() => string)} = {}
let POLLS: {[id: string]: {title: string, votes: {[k: string]: string[]}}} = {}
let SPAMS: {[id: string]: boolean} = {}

let lastCommand:  Message;
let snipes:  (Message | PartialMessage)[] = [];
let purgeSnipe: (Message | PartialMessage)[];

const illegalLastCmds = ["!!", "spam"]

function createChatCommand(name: string, description: string, options: any){
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

const CMD_CHAT_INPUT = 1
const CMD_USER = 2
const CMD_MESSAGE = 3


function createChatCommandOption(type: number, name: string, description: string, {min, max, required}: {min?: number, max?: number | null, required?: boolean}){
    let obj: {[key: string]: any} = {
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
    createChatCommand("ccmd", "create a custom command, WOWZERS", [
        createChatCommandOption(STRING, "name", "name of command (NO SPACES)", {required: true}),
        createChatCommandOption(STRING, "text", "what to say", {required: true})
    ]),
    createChatCommand("alias", "A more powerful ccmd", [
        createChatCommandOption(STRING, "name", "name of command (NO SPACES)", {required: true}),
        createChatCommandOption(STRING, "command", "command to run", {required: true}),
        createChatCommandOption(STRING, "text", "Text to give to command", {})
    ]),
    createChatCommand("rps", "Rock paper scissors", [
	createChatCommandOption(USER, "opponent", "opponent", {required: true}),
	createChatCommandOption(STRING, "choice", "choice", {required: true})
    ]),
    createChatCommand("rccmd", "remove a custom command, WOWZERS", [
        createChatCommandOption(STRING, "name", "name of command to remove (NO SPACES)", {required: true}),
    ]),
    createChatCommand("say", "says something", [
	createChatCommandOption(STRING, "something", "the something to say", {required: true})
    ]),
    createChatCommand("poll", "create a poll", [
	createChatCommandOption(STRING, "options", "Options are seperated by |", {required: true}),
	createChatCommandOption(STRING, "title", "The title of the poll", {required: false}),
    ]),
    createChatCommand("help", "get help", []),
    createChatCommand("add-wordle", "add a word to wordle", [createChatCommandOption(STRING, "word", "the word", {required: true})]),
    createChatCommand("add-8", "add a response to 8ball", [createChatCommandOption(STRING, "response", "the response", {required: true})]),
    createChatCommand("dad", "add a distance response", [createChatCommandOption(STRING, "response", "The response", {required: true})]),
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

function getContentFromResult(result: CommandReturn){
    let res = ""
    if(result.content)
	res += result.content + "\n"
    if(result.files){
	for(let file of result.files){
	    res += fs.readFileSync(file.attachment, "base64") + "\n"
	}
    }
    return res
}

function getOpts(args: Array<string>): [Opts, ArgumentList]{
    let opts: Opts = {}
    let newArgs = []
    let idxOfFirstRealArg = 0
    for(let arg of args){
        idxOfFirstRealArg++
        if(arg[0] == "-"){
            if(arg[1]){
                let [opt, ...value] = arg.slice(1).split("=")
                opts[opt] = value[0] == undefined ? true : value.join("=");
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

function generateHTMLFromCommandHelp(name: string, command: any){
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
                let alternates = options[option].alternates || []
                let requiresValue = options[option].requiresValue || false
                html += `<li class="command-option">
    <span class="command-option-details-label" title="requires value: ${requiresValue}"><summary class="command-option-summary">-${option}</summary> ${desc}</details>`
                if(alternates){
                    html += '<span class="option-alternates-title">Aliases:</span>'
                    html += `<ul class="option-alternates">`
                    for(let alternate of alternates){
                        html += `<li class="option-alternate">-${alternate}</li>`
                    }
                    html += "</ul>"
                }
                html += "</li>"
            }
            html += "</ul>"

        }
        if(aliases !== []){
            html += `<h2 class="command-aliases">Aliases</h2><ul class="command-alias-list">`
            for(let alias of aliases){
                html += `<li class="command-alias">${alias}</li>`
            }
            html += "</ul>"
        }
    }
    return `${html}</div><hr>`
}

function getImgFromMsgAndOpts(opts: Opts, msg: Message): string{
    let img: undefined | string | boolean | Stream | Buffer = opts['img']
    if(msg.attachments?.at(0)){
        img = msg.attachments.at(0)?.attachment
    }
    //@ts-ignore
    else if(msg.reply?.attachments?.at(0)){
	//@ts-ignore
        img = msg.reply.attachments.at(0)?.attachment
    }
    else if(msg.embeds?.at(0)?.image?.url){
	img = msg.embeds?.at(0)?.image?.url
    }
    else if(!img) {
        img = msg.channel.messages.cache.filter((m: Message) => m.attachments?.first()?.size ? true : false)?.last()?.attachments?.first()?.attachment
    }
    return img as string
}

const player = createAudioPlayer()
let connection: any;

const commands: {[command: string]: Command} = {
    time: {
        run: async(msg, args) => {
            let fmt = args.join(" ")
            console.log(fmt)

            const date = new Date()
            let hours = date.getHours()
            let AMPM = hours < 12 ? "AM" : "PM"
            return {content: fmt
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
                    }
        },
        help: {
            arguments: {
                format: {
                    description: "the format to use for the time<br>formats:<br><ul><li>date: the date</li><li>hour: the hour of the day</li><li>min: minute of the day</li><li>time: hours:minutes:seconds</li><li>time-s hours:minutes</li><li>millis: milliseconds</li><li>tz: timezone</li><li>ampm: am or pm</li><li>fdate: full date (monthy/day/year)</li><li>month: month of the year</li><li>year: year of the year</li><li>day: day of the year</li>"
                }
            }
        },
        category: CommandCategory.UTIL
    },
    join:{
        run: async(msg, args) => {
            const memberData = await fetchUser(msg.guild, msg.author.id)
            const voiceState = memberData.voice
            if(!voiceState){
            return {content: "NOT IN VC"}
            }
            connection = joinVoiceChannel({
                channelId: voiceState.channel.id,
                guildId: msg.guild?.id,
                adapterCreator: msg.guild?.voiceAdapterCreator
            })
            return {noSend: true}
        },
        category: CommandCategory.UTIL

    },
    leave: {
        run: async(msg, args) => {
            connection.destroy()
            connection = null
            return {noSend: true}
        },
        category: CommandCategory.UTIL
    },
    /*
    play: {
	run: async(msg, args) => {
	    if(!args[0]){
		return {content: "no link"}
	    }
	    const fn = generateFileName("play", msg.author.id).replace(".txt", "")
	    exec(`yt-dlp -x --audio-format=mp3 -o ${fn}.mp3 ${args[0]}`, () => {
		const resource = createAudioResource(__dirname + "/" + fn + ".mp3")
		//console.log(__dirname + "/" + fn + ".mp3", fs.existsSync(__dirname + "/" + fn + ".mp3")
		if(!connection){
		    return {content: "Not in vc"}
		}
		connection.subscribe(player)
		player.on(AudioPlayerStatus.Playing, async() => {
		    //fs.rmSync(__dirname + "/" + fn + ".mp3")
		    await msg.channel.send("You are about to listen to some wonderful ***t u n e s***")
		})
		player.play(resource)
	    })
	    return {noSend: true}
	}
    },
    */
    nothappening: {
        run: async(msg, args) => {
            return {content: ["reddit - impossible to set up api", "socialblade - socialblade blocks automated web requests"].join("\n")}
        },
        category: CommandCategory.META
    },
    "rand-role": {
        run: async(msg, args) => {
            let roles = await msg.guild?.roles.fetch()
            let role = roles?.random()
            if(!role){
                return {content: "Couldn't get random role"}
            }
            let fmt = args.join(" ") || "%n"
            return {allowedMentions: {parse: []}, content: format(fmt, {n: role.name, i: role.id, c: role.color, C: role.createdAt, hc: role.hexColor, u: role.unicodeEmoji, p: role.position, I: role.icon})}
        },
        category: CommandCategory.UTIL
    },
    "cmd-search": {
        run: async(msg, args) => {
            let search = args.join(" ")
            let results = []
            for(let cmd in commands){
                if(cmd.match(search)){
                    if(commands[cmd].help?.info){
                        results.push(`${cmd}: ${commands[cmd].help?.info}`)
                    }
                    else results.push(cmd)
                }
                else if(commands[cmd].help){
                    let help = commands[cmd].help
                    if(help?.info?.match(search)){
                        results.push(`${cmd}: ${commands[cmd].help?.info}`)
                    }
                }
            }
            if(results.length == 0){
                return {content: "No results"}
            }
            return {content: results.join("\n")}
        },
        help: {
            info: "Search for commands with a search query"
        },
        category: CommandCategory.META
    },
    "6": {
        run: async(msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            let getRankMode = opts['rank'] || false
            let content = args.join(" ")
            let requestedUsers = content.split("|")
            if(!requestedUsers[0]){
                requestedUsers[0] = msg.author.id
            }
            let embeds = []
            const url = `https://mee6.xyz/api/plugins/levels/leaderboard/${GUILD_ID}`
            let data
            try{
            //@ts-ignore
                data = await got(url)
            }
            catch(err){
                return {content: "Could not fetch data"}
            }
            if(!data?.body){
                return {content: "No data found"}
            }
            const JSONData = JSON.parse(data.body)
            for(let requestedUser of requestedUsers){
                if(!requestedUser) continue
                let [ruser1, ruser2] = requestedUser.split("-")
                if(ruser1.trim() && ruser2?.trim()){
                    //@ts-ignore
                    let member1, member2;
                    if(getRankMode){
                        member1 = JSONData.players[Number(ruser1) - 1]
                        member1 = await fetchUser(msg.guild, member1.id)
                        member2 = JSONData.players[Number(ruser2) - 1]
                        member2 = await fetchUser(msg.guild, member2.id)
                    }
                    else{
                        member1 = await fetchUser(msg.guild, ruser1.trim())
                        member2 = await fetchUser(msg.guild, ruser2.trim())
                    }
                    if(!member1){
                        return {content: `Could not find ${ruser1}`}
                    }
                    if(!member2){
                        return {content: `Could not find ${ruser1}`}
                    }
                    //@ts-ignore
                    const user1Data = JSONData.players.filter(v => v.id == member1.id)?.[0]
                    //@ts-ignore
                    const user2Data = JSONData.players.filter(v => v.id == member2.id)?.[0]
                    if(!user1Data){
                        return {content: `No data for ${member1.user.username} found`}
                    }
                    if(!user2Data){
                        return {content: `No data for ${member2.user.username} found`}
                    }
                    const rank1 = JSONData.players.indexOf(user1Data)
                    const rank2 = JSONData.players.indexOf(user2Data)
                    const embed = new MessageEmbed()
                    embed.setTitle(`${member1.user?.username} - ${member2.user?.username} #${(rank1 + 1) - (rank2 + 1)}`)
                    if(user1Data.level < user2Data.level)
                        embed.setColor("#00ff00")
                    else if(user1Data.level == user2Data.level)
                        embed.setColor("#0000ff")
                    else
                        embed.setColor("#00ff00")
                    embed.addField("Level", String(user1Data.level - user2Data.level), true)
                    embed.addField("XP", String(user1Data.xp - user2Data.xp), true)
                    embed.addField("Message Count", String(user1Data.message_count - user2Data.message_count), true)
                    embeds.push(embed)
                    continue
                }
                let member: any;
                if(getRankMode){
                    member = JSONData.players[Number(requestedUser.trim()) - 1]
                    member = await fetchUser(msg.guild, member.id)
                }
                else
                    member = await fetchUser(msg.guild, requestedUser.trim())
                if(!member){
                    member = msg.author
                }
                console.log(member)
                //@ts-ignore
                const userData = JSONData.players.filter(v => v.id == member.id)?.[0]
                if(!userData){
                    return {content: `No data for ${member.user.username} found`}
                }
                const rank = JSONData.players.indexOf(userData)
                const embed = new MessageEmbed()
                embed.setTitle(`${member.user?.username || member?.nickname} #${rank + 1}`)
                embed.setColor(member.displayColor)
                embed.addField("Level", String(userData.level), true)
                embed.addField("XP", String(userData.xp), true)
                embed.addField("Message Count", String(userData.message_count), true)
                embeds.push(embed)
            }
            return {embeds: embeds}
        },
        help: {
            info: "Get the mee6 rank of a user",
            arguments: {
            users: {
                description: "A list of users seperated by |, if you do user1 - user2, it will find the xp, level, and message count difference in the 2 users"
            }
            },
            options: {
            rank: {
                description: "Instead of searching by user, search by rank"
            }
            }
        },
        category: CommandCategory.FUN
    },
    yt: {
        run: async(msg, args) => {
            const fn = generateFileName("yt", msg.author.id)
            exec(`YTFZF_CONFIG_FILE="" ytfzf -A -IJ ${escapeShell(args.join(" "))}`, async(excep: any, stdout: any, stderr: any) => {
            if(excep){
                console.log(excep)
            }
            else{
                const JSONData = JSON.parse(stdout.replaceAll("[]", "").replaceAll(/\]\s+\[/g, ","))
                let embed = new MessageEmbed()
                for(let item of JSONData){
                embed.addField(`title: ${item.title}`, `url: ${item.url}`)
                }
                await msg.channel.send({embeds: [embed]})
            }
            })
            return {noSend: true}
        },
        help: {
            info: "https://github.com/pystardust/ytfzf/wiki"
        },
        category: CommandCategory.FUN
    },
    ani: {
        run: async(msg, args) => {
            const fn = generateFileName("ani", msg.author.id)
            exec(`YTFZF_CONFIG_FILE="" ytfzf -A -IJ -cani ${escapeShell(args.join(" "))}`, async(excep: any, stdout: any, stderr: any) => {
            if(excep){
                console.log(excep)
            }
            else{
                const JSONData = JSON.parse(stdout.replaceAll("[]", "").replaceAll(/\]\s+\[/g, ","))
                let embed = new MessageEmbed()
                for(let item of JSONData){
                embed.addField(`tiitle: ${item.title}`, `url: ${item.url}`)
                }
                await msg.channel.send({embeds: [embed]})
            }
            })
            return {noSend: true}
        },
        help: {
            info: "get anime :)))))))))"
        },
        category: CommandCategory.FUN
    },
    wiki: {
        run: async(msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            let baseurl = "en.wikipedia.org"
            let path = "/wiki/Special:Random"
            if(args[0]){
            path = `/wiki/${args.join("_")}`
            }
            if(opts['full']){
            path = String(opts['full'])
            }
            let sentences = parseInt(String(opts['s'])) || 1
            let options = {hostname: baseurl, path: path}
            if(path == "/wiki/Special:Random"){
            https.get(options, req => {
                let data = new Stream.Transform()
                req.on("error", err => {
                console.log(err)
                })
                req.on("data", chunk => {
                data.push(chunk)
                })
                req.on("end", async() => {
                //@ts-ignore
                let rv = await commands['wiki'].run(msg, [`-full=/wiki/${req.headers.location?.split("/wiki/")[1]}`])
                await msg.channel.send(rv)
                })
            }).end()
            return {content: "Generating random article"}
            }
            else{
            let resp
            try{
                //@ts-ignore
                resp = await got(`https://${baseurl}${path}`)
            }
            catch(err){
                return {content: "not found"}
            }
            if(resp.headers?.location){
                await commands['wiki'].run(msg, [`-full=/wiki/${resp.headers.location.split("/wiki/")[1]}`])
            }
            else{
                let $ = cheerio.load(resp.body)
                let text = $("p").text().trim().split("\n")
                if(!text.length){
                return {content: "nothing"}
                }
                let rv = text.slice(0, sentences <= text.length ? sentences : text.length).join("\n")
                return {content: rv}
            }
            }
            return {content: "how did we get here"}
        },
        help: {
            info: "Get information about something, defaults to random",
            arguments: {
            page: {
                description: "The page to look at",
                required: false
            }
            },
            options: {
            s: {
                description: "The amount of sentences to see"
            }
            }
        },
        category: CommandCategory.FUN
    },
    piglatin: {
        run: async(msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            let sep = opts['sep']
            if(sep == undefined){
            sep = " "
            } else sep = String(sep)
            let words = []
            for(let word of args){
            if(word.match(/^[aeiou]/)){
                words.push(`${word}ay`)
            }
            else{
                let firstVowel = -1
                for(let i = 0; i < word.length; i++){
                if(word[i].match(/[aeiou]/)){
                    firstVowel = i
                    break
                }
                }
                if(firstVowel == -1){
                words.push(`${word}ay`)
                }
                else{
                words.push(`${word.slice(firstVowel)}${word.slice(0, firstVowel)}ay`)
                }
            }
            }
            return {content: words.join(sep)}
        },
        help: {
            info: "igpay atinlay",
            arguments: {
            text: {
                description: "Text to igpay atinlay-ify"
            }
            },
            options: {
            sep: {
                description: "The seperator between words"
            }
            }
        },
        category: CommandCategory.FUN
    },
    "get": {
        run: async(msg, opts) => {
            let operator = opts[0]
            let object = opts[1]
            switch(operator){
                case "#": {
                    let number = parseInt(opts[2])
                    let data;
                    switch(object){
                        case "channel": {
                            data = await msg.guild?.channels.fetch()
                            break
                        }
                        case "role": {
                            data = await msg.guild?.roles.fetch()
                            break
                        }
                        case "member": {
                            data = await msg.guild?.members.fetch()
                            break
                        }
                        case "bot": {
                            let bots = await msg.guild?.members.fetch()
                            data = bots?.filter(u => u.user.bot)
                            break
                        }
                    }
                    if(!data){
                        return {content: `${object} is invalid`}
                    }
                    if(number){
                        return {content: String(data.at(number)), allowedMentions: {parse: []}}
                    }
                    else{
                        return {content: String(data.size), allowedMentions: {parse: []}}
                    }
                }
                case "rand": {
                    switch(object){
                        case "channel": {
                            let channels = await msg.guild?.channels.fetch()
                            return {content: channels?.random()?.toString()}
                        }
                        case "role": {
                            let roles = await msg.guild?.roles.fetch()
                            return {content: String(roles?.random()), allowedMentions: {parse: []}}
                        }
                        case "member": {
                            let members = await msg.guild?.members.fetch()
                            return {content: String(members?.random()), allowedMentions: {parse: []}}
                        }
                    }
                }
            }
            return {content: "Not a valid option"}
        },
        category: CommandCategory.UTIL

    },
    calc: {
        run: async(msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            let sep = opts['sep']
            if(!sep){
            sep = "\n"
            } else sep = String(sep)
            let ret: any[] = []
            for(let line of args.join(" ").split("\n")){
                try{
                    ret.push(String(safeEval(line, {yes: true, no: false, uid: msg.member?.id, uavatar: msg.member?.avatar, ubannable: msg.member?.bannable, ucolor: msg.member?.displayColor, uhex: msg.member?.displayHexColor, udispname: msg.member?.displayName, ujoinedAt: msg.member?.joinedAt, ujoinedTimeStamp: msg.member?.joinedTimestamp, unick: msg.member?.nickname, args: args, lastCommand: lastCommand?.content, ...vars}, {timeout: 3000})))
                }
                catch(err){
                    console.log(err)
                }
            }
            if(ret.length){
            if(userVars && userVars[msg.author.id])
                userVars[msg.author.id]["__calc"] = () => ret.join(sep as string)
            else
                userVars[msg.author.id] = {"__calc": () => ret.join(sep as string)}
            }
            return {content: ret.join(sep)}
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
    d: {
        run: async(msg, args) => {
            msg.content = `${prefix}${args.join(" ")}`
            await doCmd(msg, false)
            return {noSend: true, delete: true}
        },
        category: CommandCategory.META
    },
    del: {
        run: async(msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            if(!opts['N']) return {noSend: true, delete: true}
            msg.content = `${prefix}${args.join(" ")}`
            await doCmd(msg, false)
            return {noSend: true, delete: true}
        },
        help: {
            arguments: {
                text: {
                    description: "Text"
                }
            },
            options: {
                "N": {
                    description: "Treat text as a command"
                }
            }
        },
        category: CommandCategory.META
    },
    "if": {
        run: async(msg, args) => {
            let [condition, cmd] = args.join(" ").split(";")
            cmd = cmd.split(";end")[0]
            if(safeEval(condition, {uid: msg.member?.id, uavatar: msg.member?.avatar, ubannable: msg.member?.bannable, ucolor: msg.member?.displayColor, uhex: msg.member?.displayHexColor, udispname: msg.member?.displayName, ujoinedAt: msg.member?.joinedAt, ujoinedTimeStamp: msg.member?.joinedTimestamp, unick: msg.member?.nickname, args: args, lastCommand: lastCommand?.content}, {timeout: 3000})){
            msg.content = `${prefix}${cmd.trim()}`
            return await doCmd(msg, true) as CommandReturn
            }
            let elseCmd = args.join(" ").split(`${prefix}else;`).slice(1).join(`${prefix}else;`)?.trim()
            if(elseCmd){
            msg.content = `${prefix}${elseCmd.trim()}`
            return await doCmd(msg, true) as CommandReturn
            }
            return {content: "?"}
        },
        category: CommandCategory.META
    },
    getimg: {
        run: async(msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            let img = getImgFromMsgAndOpts(opts, msg)
            return {content: String(img)}
        },
        help: {
            info: "find the link to the image that would be used if you gave the same options to an image command",
            options: {
            img: {
                description: "The image link to use"
            }
            }
        },
        category: CommandCategory.META
    },
    "argc": {
        run: async(msg, args) => {
            return {content: String(args.length)}
        },
        help: {
            info: "Prints the number of arguments given to this command"
        },
        category: CommandCategory.META
    },
    opts: {
        run: async(msg, args) => {
            let opts;
            [opts, args ] = getOpts(args)
            let disp = ""
            for(let key in opts){
            disp += `**${key}**: \`${opts[key]}\`\n`
            }
            return {content: disp || "#!N/A"}
        },
        help: {
            info: "Print the opts given"
        },
        category: CommandCategory.META
    },
    echo:{
        run: async (msg: Message, args: ArgumentList) => {
            let opts
            [opts, args] = getOpts(args)
            let wait = parseInt(String(opts['wait'])) || 0
            let dm = Boolean(opts['dm'] || false)
            let embedText = opts['e'] || opts['embed']
            let embed
            if(embedText){
                embed = new MessageEmbed()
                if(embedText !== true)
                    embed.setTitle(embedText)
                let img;
                //esentially if the user put `-img=` or `-img`
                if(opts['img'] == "" || opts['img'] === true){
                    img = null
                }
                else img = getImgFromMsgAndOpts(opts, msg)
                if(img){
                    embed.setImage(img)
                }
                let color
                if(color = opts['color'] || opts['e-color'] || opts['embed-color']){
                    try{
                        embed.setColor(color as ColorResolvable)
                    }
                    catch(err){
                    }
                }
            }
            let stringArgs = args.join(" ")
            let files = msg.attachments?.toJSON()
            if(!stringArgs && !embed && !files.length){
                return {
                    content: "cannot send nothing"
                }
            }
            if(wait){
                await new Promise((res) => setTimeout(res, wait * 1000))
            }
            let rv: CommandReturn = {delete: !(opts["D"] || opts['no-del']), deleteFiles: false}
            if(dm){
                rv['dm'] = true
            }
            if(stringArgs){
                rv["content"] = stringArgs
            }
            if(files.length){
                rv["files"] = files as CommandFile[]
            }
            if(embed){
                rv["embeds"] = [embed]
            }
            return rv
        },
        help: {
            info: "the bot will say the <code>text</code>",
            options: {
                "D": {
                    description: "If given, don't delete original message"
                },
                "dm": {
                    description: "Will dm you, instead of sending to channel"
                },
                "no-del": {
                    description: "same as -D"
                },
                "embed": {
                    description: "Create an embed with the text following ="
                },
                "color": {
                    description: "Color of the embed"
                },
                "img": {
                    description: "Image of the embed<br>If not provided, an image will be chosen from chat (if exists)<br>set -img= to stop this"
                }
            },
            arguments: {
                text: {
                    description: "what to say",
                    required: true
                }
            }
        },
        category: CommandCategory.FUN
    },
    button: {
        run: async(msg, args) => {
            let opts: Opts
            [opts, args] = getOpts(args)
            let content = opts['content']
            let delAfter = NaN
            if(opts['timealive'])
                delAfter = parseInt(String(opts['timealive']))
            if(typeof content === 'boolean'){
                content = `button:${msg.author.id}`
            }
            let text = args.join(" ") || "hi"
            let button = new MessageButton({customId: `button:${msg.author.id}`, label:text, style: "PRIMARY"})
            let row = new MessageActionRow({type: "BUTTON", components: [button]})
            let m = await msg.channel.send({components: [row], content: content})
            if(opts['say'])
                BUTTONS[msg.author.id] = String(opts['say'])
            else BUTTONS[msg.author.id] = text
            if(! isNaN(delAfter)){
                setTimeout(async() => await m.delete(), delAfter * 1000)
            }
            return {noSend: true}
        },
        help: {
            arguments: {
                "text": {
                    description: "Text on the button"
                }
            },
            options: {
                "timealive": {
                    description: "How long before the button gets deleted"
                },
                "say": {
                    description: "The text on the button"
                }
            }
        },
        category: CommandCategory.FUN
    },
    "pcount": {
        run: async(msg, args) => {
            let id = args[0]
            if(!id){
                return {content: "no id given"}
            }
            let str = ""
            for(let key in POLLS[`poll:${id}`]){
                str += `${key}: ${POLLS[`poll:${id}`]["votes"][key].length}\n`
            }
            return {content: str}
        },
        help: {
            arguments: {
                "id": {
                    description: "The id of the poll to get the count of"
                }
            }
        },
        category: CommandCategory.UTIL
    },
    poll: {
        run: async(msg, args) => {
            let actionRow = new MessageActionRow()
            let opts: Opts;
            [opts, args] = getOpts(args)
            let id = String(Math.floor(Math.random() * 100000000))
            args = args.join(" ").split("|")
            let choices = []
            for(let arg of args){
            if(!arg.trim()){
                continue
            }
            choices.push({label: arg, value: arg})
            }
            if(choices.length < 1){
                return {content: "no options given"}
            }
            let selection = new MessageSelectMenu({customId: `poll:${id}`, placeholder: "Select one", options: choices})
            actionRow.addComponents(selection)
            POLLS[`poll:${id}`] = {title: String(opts['title'] || "") || "Select one", votes: {} }
            await msg.channel.send({components: [actionRow], content: `**${String(opts['title'] || "") || "Select one"}**\npoll id: ${id}`})
            return {noSend: true}
        },
        help:{
            info: "create a poll",
            arguments: {
                options: { description: "Options separated by |" }
            },
            options: {
                title: { description: "Title of the poll, no spaces" }
            }
        },
        category: CommandCategory.FUN
    },
    pfp: {
        run: async(msg, args) => {
            let opts: Opts
            [opts, args] = getOpts(args)
            let link = args[0]
            if(!link){
                link = getImgFromMsgAndOpts(opts, msg)
            }
            if(!link)
                return {content: "no link given"}
            try{
                await client.user?.setAvatar(link)
            }
            catch(err){
                console.log(err)
                return {content: "could not set pfp"}
            }
            return {content: 'set pfp', delete: Boolean(opts['d'] || opts['delete'])}
        },
        help: {
            arguments: {
                "link": {
                    description: "Link to an image to use as the pfp"
                }
            }
        },
        category: CommandCategory.FUN
    },
    uptime: {
        run: async(_msg: Message, args:ArgumentList) => {
            let uptime = client.uptime
            if(!uptime){
                return {
                    content: "No uptime found"
                }
            }
            let fmt = args[0] || "%d:%h:%m:%s.%M"
            let days, hours, minutes, seconds, millis;
            seconds = Math.floor(uptime / 1000)
            millis = String(uptime / 1000).split(".")[1]
            days = 0
            hours = 0
            minutes = 0
            while(seconds >= 60){
                seconds -= 60
                minutes += 1
            }
            while(minutes >= 60){
                minutes -= 60
                hours += 1
            }
            while(hours >= 24){
                hours -= 24
                days += 1
            }
            return {
                content: format(fmt, {"d": `${days}`, "h": `${hours}`, "m": `${minutes}`, "s": `${seconds}`, "M": `${millis}`})
            }
        },
        help: {
            "info": "gives up time of the bot",
            arguments: {
                fmt: {
                    "description": "the format to show the uptime in<br>%s: seconds, %m: minutes, %h: hours, %d: days<br>{s}: seconds, {m}: minutes, {h}: hours, {d}: days"
                }
            }
        },
        category: CommandCategory.META
    },
    rand: {
        run: async (msg: Message, args: ArgumentList) => {
	    let opts;
	    [opts, args] = getOpts(args)
            const low = parseFloat(args[0]) || 0
            const high = parseFloat(args[1]) || 1
	    if(opts["round"]){
		return {
		    content: String(Math.floor(Math.random() * (high - low) + low))
		}
	    }
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
        },
        category: CommandCategory.UTIL

    },
    roles: {
        run: async(msg, args) => {
            let users = []
            for(let arg of args){
                users.push(await fetchUser(msg.guild, arg))
            }
            if(users.length == 0){
                users.push(await fetchUser(msg.guild, msg.author.id))
            }
            let embeds = []
            for(let user of users){
            let roles = user._roles
            if(!roles){
                return {
                contnet: "Could not find roles"
                }
            }
            let embed = new MessageEmbed()
            embed.setTitle(`Roles for: ${user.user.username}`)
            let roleList = []
            for(let role of roles){
                roleList.push(await msg.guild?.roles.fetch(role))
            }
            embed.addField("Role count", String(roleList.length))
            embed.addField("Roles", roleList.join(" "))
            embeds.push(embed)
            }
            return {
            embeds: embeds
            }
        },
        category: CommandCategory.UTIL
    },
    "create-file": {
        run: async(msg, args) => {
            let file = args[0]
            if(!file){
                return {content: "No file specified"}
            }
            fs.writeFileSync(`./command-results/${file}`, "")
            return {content: `${file} created`}
        },
        permCheck: m => ADMINS.includes(m.author.id),
        category: CommandCategory.META
    },
    "rt": {
        run: async(msg, args) => {
            let opts: Opts;
            [opts, args] = getOpts(args)
            if(opts['t']){
                msg.channel.send("SEND A MESSAGE NOWWWWWWWWWWWWWWWWWWWWWWWWW").then(m => {
                    try{
                        let collector = msg.channel.createMessageCollector({filter: m => m.author.id == msg.author.id, time: 3000})
                        let start = Date.now()
                        collector.on("collect", async(m) => {
                            await msg.channel.send(`${Date.now() - start}ms`)
                            collector.stop()
                        })
                    }
                    catch(err){
                    }
                })
            }
            else{
                let button = new MessageButton({customId: `button:${msg.author.id}`, label: "CLICK THE BUTTON NOWWWWWWW !!!!!!!", style: "DANGER"})
                let row = new MessageActionRow({type: "BUTTON", components: [button]})
                let start = Date.now()
                BUTTONS[msg.author.id] = () => {
                    return `${Date.now() - start}ms`
                }
                await msg.channel.send({components: [row]})
            }
            return {noSend: true}
        },
        help: {
            info: "Gets your truely 100% accurate reaction time"
        },
        category: CommandCategory.FUN
    },
    "rand-line": {
        run: async(msg, args) => {
            let file = args[0]
            if(!file){
                return {content: "No file specified"}
            }
            if(!fs.existsSync(`./command-results/${file}`)){
                return {
                    content: "file does not exist"
                }
            }
            const text = fs.readFileSync(`./command-results/${file}`, "utf-8")
            const lines = text.split("\n").map((str) => str.split(": ").slice(1).join(": ").replace(/;END$/, "")).filter((v) => v)
            return {content: lines[Math.floor(Math.random() * lines.length)]}
        },
        help: {
            info: "Gets a random line from a file"
        },
        category: CommandCategory.META

    },
    todo: {
        run: async(msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            if(opts['list']){
                let data = fs.readFileSync('./command-results/todo', "utf-8").split(";END").map((v) => `* ${v.split(" ").slice(1).join(" ")}`)
                let strdata = data.slice(0, data.length - 1).join("\n")
                return {content: strdata}
            }
            let item = args.join(" ")
            return await commands['add'].run(msg, ["todo", item])
        },
        category: CommandCategory.META

    },
    "todo-list": {
        run: async(msg, args) => {
            let data = fs.readFileSync('./command-results/todo', "utf-8").split(";END").map((v) => `* ${v.split(" ").slice(1).join(" ")}`)
            let strdata = data.slice(0, data.length - 1).join("\n")
            return {content: strdata}
        },
        category: CommandCategory.META

    },
    nick: {
		//@ts-ignore
        run: async(msg, args) => {
            let opts: Opts;
            [opts, args] = getOpts(args)
            try{
                (await msg.guild?.members.fetch(client.user?.id || ""))?.setNickname(args.join(" "))
            }
            catch(err){
                return {content: "Could not set name"}
            }
            return {
                content: `Changed name to \`${args.join(" ")}\``,
                //@ts-ignore
                delete: opts['d'] || opts['delete']
            }
        },
        category: CommandCategory.FUN

    },
    uno: {
        run: async(msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            let requestPlayers = args.join(" ").trim().split("|").map(v => v.trim()).filter(v => v.trim())
            let players: (GuildMember)[] = [await fetchUser(msg.guild, msg.author.id)]
            for(let player of requestPlayers){
            let p = await fetchUser(msg.guild, player)
            if(!p){
                await msg.channel.send(`${player} not found`)
                continue
            }
            players.push(p)
            }
            if(players.length == 1){
            return {content: "No one to play with :("}
            }
            let max = parseInt(String(opts["max"])) || 9
            if(max > 1000){
            await msg.channel.send("The maximum is to high, defaulting to 1000")
            max = 1000
            }
            let cards = uno.createCards(max, {enableGive: opts['give'], enableShuffle: opts['shuffle'], "enable1": opts['1']})
            let deck = new uno.Stack(cards)
            let pile = new uno.Stack([])
            let playerData: {[k: string]: uno.Hand} = {}
            let order = []
            for(let player of players){
            playerData[player.id] = new uno.Hand(7, deck)
            order.push(player.id)
            }
            let forcedDraw = 0
            let turns = cycle(order, (i: any) => {
            let playerIds = Object.keys(playerData)
            fetchUser(msg.guild, playerIds[i % playerIds.length]).then((u: any) => {
                if(players.map(v => v.id).indexOf(going) < 0){
                going = turns.next().value
                return
                }
                if(forcedDraw){
                msg.channel.send(`<@${going}> is forced to draw ${forcedDraw} cards`)
                for(let i = 0; i < forcedDraw; i++){
                    let rv = playerData[going].draw(deck)
                    if(!rv){
                    msg.channel.send("Deck empty, shuffling pile into deck")
                    pile.shuffle()
                    deck = new uno.Stack(pile.cards)
                    pile = new uno.Stack([])
                    }
                }
                forcedDraw = 0
                }
                if(!(pile.top()?.type == 'skip')){
                let player = players[players.map(v => v.id).indexOf(going)]
                let send = displayStack(playerData[player.id])
                send += "\n-------------------------"
                player.send({content: send})
                if(pile.cards.length)
                    player.send({content: `stack:\n${pile.cards[pile.cards.length - 1].display()}`})
                }
                if(pile.cards.length){
                msg.channel.send({content: `${u}, it's your turn\nstack:\n${pile.cards[pile.cards.length - 1].display()}`})
                }
                else{
                msg.channel.send({content: `${u}, it's your turn`})
                }
            })
            })
            let going = turns.next().value
            let cardsPlayed = 0
            let cardsDrawn = 0
            let choosing = false
            function displayStack(stack: uno.Stack | uno.Hand, count=-1){
            let send = "card\n"
            if(count < 0) count = stack.cards.length
            for(let i = 0; i < count; i++){
                send += `${i + 1}:\n`
                send += stack.cards[i]?.display()
            }
            return send
            }
            for(let player of players){
            await player.user.createDM()
            let collection = player.user.dmChannel?.createMessageCollector({filter: (m) => (!isNaN(Number(m.content)) || m.content.toLowerCase().trim() == 'draw' || m.content.toLowerCase() == "stack" || m.content.toLowerCase() == "stop" || m.content.toLowerCase() == 'cards') && choosing == false})
            if(!collection){
                return {content: `Couldnt listen in ${player}'s dms`}
            }
            collection.on("collect", async(m) => {
                console.log(m.content)
                if(m.content.toLowerCase() == "stop"){
                players = players.filter(v => v.id != m.author.id)
                if(players.length == 0){
                    await msg.channel.send("game over")
                }
                collection?.stop()
                if(m.author.id == client.user?.id) return
                await msg.channel.send(`${m.author} quit`)
                going = turns.next().value
                return
                }
                if(playerData[player.id].cards.length <= 0){
                await msg.channel.send(`${player} wins!!\n${cardsPlayed} cards were played\n${cardsDrawn} cards were drawn`)
                for(let player of players){
                    await player.send("STOP")
                }
                collection?.stop()
                return
                }
                if(player.id != going) return
                if(m.content.toLowerCase() == "stack"){
                let text = displayStack(pile)
                if(text.length > 1900){
                    text = ""
                    for(let i = pile.cards.length - 1; i > pile.cards.length - 10; i--){
                    text += `${pile.cards[i].display()}\n`
                    }
                }
                await m.channel.send(text)
                return
                }
                if(m.content.toLowerCase() == "cards"){
                await m.channel.send(displayStack(playerData[player.id]))
                return
                }
                if(m.content.toLowerCase() == 'draw'){
                let rv = playerData[player.id].draw(deck)
                cardsDrawn++
                if(!rv){
                    await msg.channel.send("Deck empty, shuffling pile into deck")
                    pile.shuffle()
                    deck = new uno.Stack(pile.cards)
                    pile = new uno.Stack([])
                    playerData[player.id].draw(deck)
                }
                await msg.channel.send(`${player} drew a card`)
                let send = displayStack(playerData[player.id])
                send += "\n-------------------------"
                await m.channel.send(send)
                await msg.channel.send(`**${player.nickname || player.user.username} has ${playerData[player.id].cards.length} cards**`)
                if(pile.cards.length)
                    player.send({content: `stack:\n${pile.cards[pile.cards.length - 1].display()}`})
                return
                }
                let selectedCard = playerData[player.id].cards[Number(m.content) - 1]
                if(!selectedCard){
                await player.user.send(`${m.content} is not a valid choice`)
                }
                else if(selectedCard.type == "+2"){
                if(selectedCard.canBePlayed(pile)){
                    cardsPlayed++;
                    forcedDraw = 2
                    pile.add(selectedCard)
                    playerData[player.id].remove(Number(m.content) - 1)
                    going = turns.next().value
                }
                else{
                    await m.channel.send("You cannot play that card")
                }
                }
                else if(selectedCard.type == 'shuffle-stack'){
                if(selectedCard.canBePlayed(pile)){
                    cardsPlayed++
                    playerData[player.id].remove(Number(m.content) - 1)
                    await msg.channel.send("**stack was shuffled**")
                    pile.add(selectedCard)
                    pile.shuffle()
                    going = turns.next().value
                }
                else{
                    await m.channel.send("You cannot play that card")
                }
                }
                else if(selectedCard.type == 'give'){
                if(selectedCard.canBePlayed(pile)){
                    cardsPlayed++;
                    playerData[player.id].remove(Number(m.content) - 1)
                    await player.send({content: displayStack(playerData[m.author.id])})
                    await player.send("Pick a card from your deck to give to a random opponent")
                    choosing = true
                    try{
                    let cardM = (await m.channel.awaitMessages({max: 1, time: 20000})).at(0)
                    while(!cardM){
                        await m.channel.send("Not a valid card")
                        cardM = (await m.channel.awaitMessages({max: 1, time: 20000})).at(0)
                    }
                    while(!parseInt(cardM?.content as string)){
                        console.log(cardM?.content, parseInt(cardM?.content as string))
                        await m.channel.send("Not a valid card")
                        cardM = (await m.channel.awaitMessages({max: 1, time: 20000})).at(0)
                    }
                    let n = parseInt(cardM?.content as string)
                    let selectedRemovealCard = playerData[m.author.id].cards[n - 1]
                    let tempPlayerData = Object.keys(playerData).filter(v => v != m.author.id)
                    let randomPlayer = tempPlayerData[Math.floor(Math.random() * tempPlayerData.length)]
                    let hand = playerData[randomPlayer]
                    playerData[m.author.id].remove(selectedRemovealCard)
                    hand.add(selectedRemovealCard)
                    }
                    catch(err){
                    console.log(err)
                    choosing = false
                    }
                    choosing = false
                    pile.add(selectedCard)
                    going = turns.next().value
                }
                else{
                    await m.channel.send("You cannot play that card")
                }
                }
                else if(selectedCard.type == '-1'){
                if(selectedCard.canBePlayed(pile)){
                    cardsPlayed++;
                    playerData[player.id].remove(Number(m.content) - 1)
                    pile.add(selectedCard)
                    let randomPlayer = players.filter(v => v.id != player.id)[Math.floor(Math.random() * (players.length - 1))].id
                    await msg.channel.send(`**${player} played the ${selectedCard.color} -1 card, and <@${randomPlayer}> lost a card**`)
                    let newTopCard = playerData[randomPlayer].cards[0]
                    playerData[randomPlayer].remove(0)
                    pile.add(newTopCard)
                    going = turns.next().value
                }
                }
                else if(selectedCard.type == "wild"){
                cardsPlayed++;
                await player.send("Pick a color\nred, green, yellow, or blue")
                try{
                    let colorM = (await m.channel.awaitMessages({max: 1, time: 20000})).at(0)
                    if(!colorM){
                    await msg.channel.send("User picked incorrect color, using red")
                    selectedCard.color = "red"
                    }
                    else if(["red", "yellow", "green", "blue"].includes(colorM.content.toLowerCase().trim())){
                    selectedCard.color = colorM.content
                    }
                    else{
                    await msg.channel.send("User picked incorrect color, using red")
                    selectedCard.color = "red"
                    }
                }
                catch(err){
                    console.log(err)
                    await msg.channel.send("Something went wrong, defaulting to red")
                    selectedCard.color = "red"
                }
                pile.add(selectedCard)
                playerData[player.id].remove(Number(m.content) - 1)
                going = turns.next().value
                }
                else if(selectedCard.type == "wild+4"){
                cardsPlayed++;
                await player.send("Pick a color\nred, green, yellow, or blue")
                try{
                    let colorM = (await m.channel.awaitMessages({max: 1, time: 20000})).at(0)
                    console.log(colorM?.content)
                    if(!colorM){
                    await msg.channel.send("User picked incorrect color, using red")
                    selectedCard.color = "red"
                    }
                    else if(["red", "yellow", "green", "blue"].includes(colorM.content.toLowerCase().trim())){
                    selectedCard.color = colorM.content
                    }
                    else{
                    await msg.channel.send("User picked incorrect color, using red")
                    selectedCard.color = "red"
                    }
                }
                catch(err){
                    console.log(err)
                    await msg.channel.send("Something went wrong, defaulting to red")
                    selectedCard.color = "red"
                }
                pile.add(selectedCard)
                playerData[player.id].remove(Number(m.content) - 1)
                forcedDraw = 4
                going = turns.next().value
                }
                else if(selectedCard.type == 'skip'){
                if(selectedCard.canBePlayed(pile)){
                    cardsPlayed++
                    let skipped = turns.next().value
                    await msg.channel.send(`<@${skipped}> was skipped`)
                    going = turns.next().value
                    await new Promise(res => {
                    pile.add(selectedCard)
                    playerData[player.id].remove(Number(m.content) - 1)
                    let gP = players.filter(v => v.id == going)[0]
                    let send = displayStack(playerData[going])
                    send += "\n-------------------------"
                    gP.send({content: send})
                    if(pile.cards.length)
                        gP.send({content: `stack:\n${pile.cards[pile.cards.length - 1].display()}`})
                    res("")
                    })
                }
                else{
                    await m.channel.send("You cannot play that card")
                }
                }
                else {
                if(selectedCard.canBePlayed(pile)){
                    cardsPlayed++
                    pile.add(selectedCard)
                    playerData[player.id].remove(Number(m.content) - 1)
                    going = turns.next().value
                }
                else{
                    await m.channel.send("You cannot play that card")
                }
                }
                await msg.channel.send(`**${player.nickname || player.user.username} has ${playerData[player.id].cards.length} cards**`)
                if(playerData[player.id].cards.length <= 0){
                await msg.channel.send(`${player} wins!!\n${cardsPlayed} cards were played\n${cardsDrawn} cards were drawn`)
                for(let player of players){
                    await player.send("STOP")
                }
                collection?.stop()
                }
            })
            }
            return {content:"Starting game"}
        },
        help: {
            info: "UNO<br>things you can do in dms<br><ul><li>draw - draw a card</li><li>stack - see all cards in the pile if it can send, otherwise the top 10 cards</li><li>stop - quit the game</li><li>cards - see your cards</li></ul>",
            arguments: {
            players: {
                description: "Players to play, seperated by |"
            }
            },
            options: {
            max: {
                description: "the amount of numbers, default: 10"
            },
            give: {
                description: "enable the give card"
            },
            shuffle: {
                description: "enable the shuffle card"
            },
            "1": {
                description: "enable the -1 card"
            }
            }
        },
        category: CommandCategory.GAME

    },
    sport: {
        run: async(msg, args) => {
            https.get(`https://www.google.com/search?q=${encodeURI(args.join(" "))}+game`, resp => {
                    let data = new Stream.Transform()
                    resp.on("data", chunk => {
                        data.push(chunk)
                    })
                    resp.on("end", async() => {
                let html = data.read().toString()
                let embed = new MessageEmbed()
                //winner should be in *****
                let [inning, homeTeam, awayTeam] = html.match(/<div class="BNeawe s3v9rd AP7Wnd lRVwie">(.*?)<\/div>/g)
                try{
                inning = inning.match(/span class=".*?">(.*?)<\//)[1]
                    .replace(/&#(\d+);/gi, function(_match: any, numStr: string) {
                    var num = parseInt(numStr, 10);
                    return String.fromCharCode(num);
                    });
                }
                catch(err){
                await msg.channel.send("No results")
                return
                }
                homeTeam = homeTeam.match(/div class=".*?">(.*?)<\//)[1].replace(/<(?:span|div) class=".*?">/, "")
                awayTeam = awayTeam.match(/div class=".*?">(.*?)<\//)[1].replace(/<(?:span|div) class=".*?">/, "")
                let homeScore, awayScore
                try{
                [homeScore, awayScore] = html.match(/<div class="BNeawe deIvCb AP7Wnd">(\d*?)<\/div>/g)
                }
                catch(err){
                await msg.channel.send("Failed to get data")
                return
                }
                homeScore = parseInt(homeScore.match(/div class=".*?">(.*?)<\//)[1])
                awayScore = parseInt(awayScore.match(/div class=".*?">(.*?)<\//)[1])
                embed.setTitle(`${args.join(" ")}`)
                if(awayScore >= homeScore){
                awayTeam = `***${awayTeam}***`
                awayScore = `***${awayScore}***`
                embed.setColor("#ff0000")
                }
                else {
                homeTeam = `***${homeTeam}***`
                homeScore = `***${homeScore}***`
                embed.setColor("#00ff00")
                }
                embed.addField("Time", inning)
                embed.addField(`${homeTeam}`, String(homeScore))
                embed.addField(`${awayTeam}`, String(awayScore))
                await msg.channel.send({embeds: [embed]})
            })
            }).end()
            return {
            content: "getting data"
            }
        }, help: {
            info: "Print information about a sport game",
            arguments: {
            team: {
                description: "The team to get info on"
            }
            }
        },
        category: CommandCategory.FUN

    },
    wordle: {
        run: async(msg, args) => {
            let opts: Opts
            [opts, args] = getOpts(args)
            let min = parseInt(opts["min"] as string) || 5
            let max = parseInt(opts["max"] as string) || 5
            if(min > max){
            max = min
            }
            let words = fs.readFileSync(`./command-results/wordle`, "utf-8").split(";END").map(v => v.split(" ").slice(1).join(" ").trim()).filter(v => v.length <= max && v.length >= min ? true : false)
            if(words.length == 0){
            return {content: "no words found"}
            }
            let word = words[Math.floor(Math.random() * words.length)].toLowerCase()
            let guesses = []
            let collector = msg.channel.createMessageCollector({filter: m => m.author.id == msg.author.id && (m.content.length >= min && m.content.length <= max) || m.content == "STOP"})
            let guessCount = parseInt(opts["lives"] as string) || 6
            let display: string[] = []
            await msg.channel.send("key: **correct**, *wrong place*, `wrong`")
            await msg.channel.send(`The word is ${word.length} characters long`)
            for(let i = 0; i < guessCount; i++){
            display.push(mulStr("⬛ ", word.length))
            }
            await msg.channel.send(display.join("\n"))
            let letterCount: {[k: string]: number} = {}
            for(let letter of word){
            if(letterCount[letter] === undefined){
                letterCount[letter] = 1
            }
            else{
                letterCount[letter] += 1
            }
            }
            collector.on("collect", async(m) => {
            if(m.content == "STOP"){
                collector.stop()
                await msg.channel.send("stopped")
                return
            }
            guesses.push(m.content)
            let nextInDisplay = ""
            let guessLetterCount: {[key: string]: number} = {}
            for(let i = 0; i < word.length; i++){
                let correct = word[i]
                let guessed = m.content[i]
                if(guessLetterCount[guessed] === undefined){
                guessLetterCount[guessed] = 1
                } else {
                guessLetterCount[guessed] += 1
                }
                if(correct == guessed)
                nextInDisplay += `**${guessed}** `
                else if(word.includes(guessed) && guessLetterCount[guessed] <= letterCount[guessed])
                nextInDisplay += `*${guessed}* `
                else nextInDisplay += `\`${guessed}\` `
            }
            display[6 - guessCount] = nextInDisplay
            guessCount--
            await msg.channel.send(display.join("\n"))
            if(m.content == word){
                await msg.channel.send(`You win`)
                collector.stop()
                return
            }
            if(guessCount == 0){
                await msg.channel.send(`You lose, it was ${word}`)
                collector.stop()
                return
            }
            })
            return {content: "starting wordle"}
        },
        help: {
            info: "wordle",
            options: {
            "min": {
                description: "The minimum length of the word, default: 5"
            },
            "max": {
                description: "The maximum length of the word, default: 5"
            },
            "lives": {
                description: "Lives, default: 6"
            }
            }
        },
        category: CommandCategory.GAME

    },
    hangman: {
        run: async(msg, args) => {
            let opponent = msg.author
            let opts: Opts;
            [opts, args] = getOpts(args)
            let caseSensitive = opts['case']
            let wordstr: string;
            let everyone = false
            let users: any[] = []
            for(let arg of args){
            if(['all', 'everyone'].includes(arg)){
                users.push("Everyone")
                everyone = true
                break
            }
            opponent = await fetchUser(msg.guild, arg)
            if(opponent){
                users.push(opponent)
            }
            }
            if(users.length == 0){
            users.push(msg.author)
            }
            try{
            await msg.author.createDM()
            }
            catch(err){
            return {content: "Could not dm you"}
            }
            async function game(wordstr: string){
                let wordLength = strlen(wordstr)
                if(!caseSensitive){
                    wordstr = wordstr.toLowerCase()
                }
                let guessed = ""
                let disp = ""
                let lives = parseInt(opts["lives"] as string) || 10
                let word = [...wordstr]
                for(let i = 0; i < wordLength; i++){
                    if(word[i] == " "){
                    disp += '   '
                    }
                    else {
                    disp += "\\_ "
                    }
                }
                await msg.channel.send({content: `${disp}\n${users.join(", ")}, guess`})
                let collection = msg.channel.createMessageCollector({filter: m => (strlen(m.content) < 2 || m.content == wordstr || (m.content[0] == 'e' && strlen(m.content) > 2 && strlen(m.content) < 5) || ["<enter>", "STOP", "\\n"].includes(m.content)) && (users.map(v => v.id).includes(m.author.id) || everyone), idle: 40000})
                collection.on("collect", async(m) => {
                    if(m.content == '\\n' || m.content == "<enter>")
                    m.content = '\n'
                    if(m.content == "STOP"){
                        await msg.channel.send("STOPPED")
                        collection.stop()
                        return
                    }
                    let match
                    if(match = m.content.match(/e\s*(.)/u)){
                    m.content = match[1]
                    console.log(m.content)
                    }
                    if(!caseSensitive){
                    m.content = m.content.toLowerCase()
                    }
                    if([...guessed].indexOf(m.content) > -1){
                    await msg.channel.send(`You've already guessed ${m.content}`)
                    return
                    }
                    else if(m.content == wordstr){
                    await msg.channel.send(`YOU WIN, it was\n${wordstr}`)
                    collection.stop()
                    return
                    }
                    else guessed += m.content
                    if(word.indexOf(m.content) < 0)
                    lives--
                    if(lives < 1){
                    await msg.channel.send(`You lost, the word was:\n${wordstr}`)
                    collection.stop()
                    return
                    }
                    let correctIndecies: {[k: number]: string} = {}
                    for(let i = 0; i < strlen(guessed); i++){
                        let letter = [...guessed][i]
                        //@ts-ignore
                        let tempWord = [...word]
                        let totalIdx = 0
                        let idx;
                        while((idx = [...tempWord].indexOf(letter)) >= 0){
                            correctIndecies[idx + totalIdx] = letter
                            totalIdx += idx + 1
                            tempWord = tempWord.slice(idx + 1)
                        }
                    }
                    let disp = ""
                    console.log(wordLength, correctIndecies)
                    for(let i = 0; i < wordLength; i++){
                    if(correctIndecies[i]){
                        disp += correctIndecies[i]
                    }
                    else if(word[i] == " "){
                        disp += '   '
                    }
                    else {
                        disp += "\\_ "
                    }
                    }
                    if(disp.replaceAll("   ", " ") == wordstr){
                    await msg.channel.send(`YOU WIN, it was\n${wordstr}`)
                    collection.stop()
                    return
                    }
                    await msg.channel.send({content: `${disp}\n${users.join(", ")}, guess (${lives} lives left)`})
                })
            }
            if(opts["random"]){
                let channels = (await msg.guild?.channels.fetch())?.toJSON()
                if(!channels){
                    return {content: "no channels found"}
                }
                let channel = channels[Math.floor(Math.random() * channels.length)]
                while(!channel.isText())
                    channel = channels[Math.floor(Math.random() * channels.length)]
                let messages
                try{
                    messages = await channel.messages.fetch({limit: 100})
                }
                catch(err){
                    messages = await msg.channel.messages.fetch({limit: 100})
                }
                let times = 0;
                //@ts-ignore
                while(!(wordstr = messages.random()?.content)){
                    times++
                    if(times > 20) break
                }
                await game(wordstr)
            }
            else{
            await msg.author.send("Type a word")
            let collector = msg.author.dmChannel?.createMessageCollector({time: 30000, max: 1})
            collector?.on("collect", async(m) => {
                wordstr = m.content
                await game(wordstr)
            })
            }
            return {
            content: "STARTING HANGMAN, WOOOOOO"
            }
        },
        help: {
            arguments: {
                users: {
                    description: "List of users seperated by space to play against, or put all so everyone can play"
                },
            },
            options: {
                "random": {
                    description: "Picks a random message from the channel and uses that as the word"
                },
                "case": {
                    description: "Enabled case sensitive"
                },
                "lives": {
                    description: "The amount of lives to have"
                }
            }
        },
        category: CommandCategory.GAME
    },
    "edit": {
        run: async(msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            if(opts['d'] && msg.deletable) await msg.delete()
            let edits = args.join(" ").split("|")
            let message
            try{
                message = await msg.channel.send(edits[0])
            }
            catch(err){
                return {content: "message too big"}
            }
            edits = edits.slice(1)
            let lastEdit = message.content
            for(let edit of edits){
                let match
                if(match = edit.match(/^!(\d+)!$/)){
                    let time = parseFloat(match[1])
                    await new Promise(res => setTimeout(res, time * 1000))
                    continue
                }
                if(edit[0] == "-"){
                    edit = lastEdit.replaceAll(edit.slice(1), "")
                }
                else if(edit[0] == "+"){
                    edit = lastEdit + edit.slice(1)
                }
                else if(edit[0] == "*"){
                    let times = parseInt(edit.slice(1))
                    edit = lastEdit
                    for(let i = 1; i < times; i++){
                        edit += lastEdit
                    }
                }
                else if(edit[0] == "/"){
                    let divideBy = parseInt(edit.slice(1))
                    edit = lastEdit.slice(0, lastEdit.length / divideBy)
                }
                else if(edit[0] == ";"){
                    try{
                        message = await msg.channel.send(edit.slice(1))
                    }
                    catch(err){
                        return {content: "message too big"}
                    }
                    continue
                }
                try{
                    await message.edit({content:edit})
                }
                catch(err){
                    await msg.channel.send(`Could not edit message with: ${edit}`)
                }
                await new Promise(res => setTimeout(res, Math.random() * 800 + 200))
                lastEdit = message.content
            }
            return {noSend: true}
        },
        help: {
            arguments: {
                texts: {
                    description: "Seperate each edit with a |<br><b>Sepcial Operators:</b><ul><li><i>-</i>: remove letters from the last edit</li><li><i>+</i>: add to the previous edit instead of replacing it</li><li><i>*</i>: Multiply the last edit a certain number of times</li><li><i>/</i>: divide the last edit by a number</li><li><i>;</i>start a new message</li><li><i>!&lt;number&gt;!</i>: Wait &lt;number&gt; seconds before going to the next edit</li></ul>"
                }
            }
        },
        category: CommandCategory.FUN
    },
    "comp-roles": {
        run: async(msg, args) => {
            let [user1, user2] = args.join(" ").split("|")
            user1 = user1.trim()
            user2 = user2.trim()
            if(!user1){
            return {content: "No users given"}
            }
            if(!user2){
            return {content: "2 users must be given"}
            }
            let realUser1: GuildMember = await fetchUser(msg.guild, user1)
            if(!realUser1){
            return {content: `${user1} not found`}
            }
            let realUser2: GuildMember = await fetchUser(msg.guild, user2)
            if(!realUser2){
            return {content: `${user2} not found`}
            }
            let user1Roles = realUser1.roles.cache.toJSON()
            let user2Roles = realUser2.roles.cache.toJSON()
            let user1RoleIds = user1Roles.map(v => v.id)
            let user2RoleIds = user2Roles.map(v => v.id)
            let sameRoles = user1Roles.filter(v => user2RoleIds.includes(v.id))
            let user1Unique = user1Roles.filter(v => !user2RoleIds.includes(v.id))
            let user2Unique = user2Roles.filter(v => !user1RoleIds.includes(v.id))
            let embed = new MessageEmbed()
            let same = sameRoles.reduce((prev, cur) => `${prev} ${cur}`, "")
            let user1U = user1Unique.reduce((prev, cur) => `${prev} ${cur}`, "")
            let user2U = user2Unique.reduce((prev, cur) => `${prev} ${cur}`, "")
            let u1Net = user1RoleIds.length - user2RoleIds.length
            embed.setTitle("roles")
            if(u1Net > 0){
            embed.setDescription(`${realUser1.displayName} has ${u1Net} more roles than ${realUser2.displayName}`)
            }
            else if(u1Net < 0){
            embed.setDescription(`${realUser1.displayName} has ${-u1Net} less roles than ${realUser2.displayName}`)
            }
            else {
            embed.setDescription(`${realUser1.displayName} has the same amount of roles as ${realUser2.displayName}`)
            }
            embed.addField("Same Roles", same || "No same")
            embed.addField(`${realUser1.displayName} unique roles`, user1U || "No unique roles")
            embed.addField(`${realUser2.displayName} unique roles`, user2U || "No unique roles");
            return {embeds: [embed]}
        },
        category: CommandCategory.UTIL
    },
    "most-roles": {
        run: async(msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            let times = parseInt(args[0]) || 10
            await msg.guild?.members.fetch()
            let sortedMembers = msg.guild?.members.cache.sorted((ua, ub) => ub.roles.cache.size - ua.roles.cache.size)
            let embed = new MessageEmbed()
            embed.setTitle(`${sortedMembers?.at(0)?.user.username} has the most roles`)
            if(sortedMembers?.at(0)?.displayColor){
            embed.setColor(sortedMembers?.at(0)?.displayColor || "RED")
            }
            let ret = ""
            for(let i = 0; i < times; i++){
            let member = sortedMembers?.at(i)
            ret += `${i + 1}: ${member}: ${member?.roles.cache.size}\n`
            embed.addField(String(i + 1), `**${member}**\n${member?.roles.cache.size}`, true)
            }
            let rv: CommandReturn = {allowedMentions: {parse: []}}
            if(!opts['E'] && !opts['c!'])
            rv.embeds = [embed]
            if(opts['c'] || opts['c!']){
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
    whohas: {
        run: async(msg, args) => {
            let role = args[0]
            if(!role){
            return {content: "No role given"}
            }
            await msg.guild?.members.fetch()
            let roleRef = await msg.guild?.roles.fetch()
            if(!roleRef){
            return {content: "no roles found somehow"}
            }
            let realRole = roleRef.filter(v => v.name.toLowerCase() == role.toLowerCase())?.at(0)
            if(!realRole){
                realRole = roleRef.filter(v => v.name.toLowerCase().match(role.toLowerCase()) ? true : false)?.at(0)
            }
            if(!realRole){
                realRole = roleRef.filter(v => v.id == role.toLowerCase() ? true : false)?.at(0)
            }
            if(!realRole){
            return {
                content: "Could not find role"
            }
            }
            let memberTexts = [""]
            let embed = new MessageEmbed()
            embed.setTitle(realRole.name)
            let i = 0
            let memberCount = 0
            for (let member of realRole.members){
            memberTexts[i] += `<@${member[1].id}> `
            memberCount += 1
            if(memberTexts[i].length > 1000){
                embed.addField(`members`, memberTexts[i])
                i++
                memberTexts.push("")
            }
            }
            if(!memberTexts[0].length){
            return {content: "No one"}
            }
            if(embed.fields.length < 1){
            embed.addField(`members: ${i}`, memberTexts[i])
            }
            embed.addField("Member count", String(memberCount))
            return {embeds: [embed]}
        },
        category: CommandCategory.UTIL
    },
    img: {
        run: async (msg: Message, args: ArgumentList) => {
            let opts
            [opts, args] = getOpts(args)
            let gradOpt = opts['gradient']
	    let gradient;
	    if(typeof gradOpt == 'boolean'){
		gradOpt = false
	    } else if(gradOpt) {
		gradient = gradOpt.split(">")
	    }
            const width = Math.min(parseFloat(args[0]) || parseFloat(opts['w'] as string) || parseFloat(opts['width'] as string) || parseFloat(opts['size'] as string) || 100, 2000)
            const height = Math.min(parseFloat(args[1]) || parseFloat(opts['h'] as string) || parseFloat(opts['height'] as string) || parseFloat(opts['size'] as string) || width || 100, 2000)
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
	    let img;
            if(gradient){
		img = await sharp(await createGradient(gradient, width, height)).toBuffer()
            }
	    else{
		let colorHint = args[2] || opts['color'] || "black"
		let color = "black"
		if(typeof colorHint !== 'boolean'){
		    color = colorHint
		}
		img = await sharp({
		    create: {
			width: width,
			height: height,
			channels: 4,
			background: color
		    }
		}).png().toBuffer()
	    }
            fs.writeFileSync(`./out.png`, img)
            return {
                files:[
                    {
                        attachment: `out.png`,
                        name: `file.png`,
                        description: "why can i describe this"
                    }
                ],
                content: "Your image, sir"
            }
        },
        help: {
            arguments: {
                width: {
                    description: "the width of the image, max of 2000",
                    required: false
                },
                height: {
                    description: "the height of the image, max of 2000",
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
                },
                "gradient": {
                    description: "Put a gradient instead of solid color, syntax: <code>-gradient=color1>color2>color3...</code>"
                },
                "grad-angle": {
                    description: "The angle to put the gradient at in degrees"
                },
                "size": {
                    description: "Width, and height of the image, syntax: <code>-size=number</code>, max of 2000"
                },
                "height": {
                    description: "Height of the image"
                },
                "h":{
                    description: "Height of the image, overrides -height"
                },
                "width": {
                    description: "Width of the image"
                },
                "w": {
                    description: "Width of the image, overrides -width"
                }
            }
        },
        category: CommandCategory.IMAGES
    },
    polygon: {
        run: async(msg: Message, args: ArgumentList) => {
            let opts;
	    return {
		content: "Broken"
	    }
	    /*
            [opts, args] = getOpts(args)
            let gradient = opts['gradient']?.split(">")
            let color = opts['color'] || "white"
            let img = getImgFromMsgAndOpts(opts, msg)
            if(!img){
                return {
                    content: "no img found"
                }
            }
            args = args.join(" ")
            let positions = []
            for(let pos of args.split('|')){
                let [x, y] = pos.trim().split(" ").map(v => v.replace(/[\(\),]/g, ""))
                positions.push([x, y])
            }
            https.request(img, resp => {
                let data = new Stream.Transform()
                resp.on("data", chunk => {
                    data.push(chunk)
                })
                resp.on("end", async() => {
                    let fn = `${generateFileName("polygon", msg.author.id)}.png`
                    fs.writeFileSync(fn, data.read())
                    let img = await canvas.loadImage(fn)
                    fs.rmSync(fn)
                    let canv = new canvas.Canvas(img.width, img.height)
                    let ctx = canv.getContext("2d")
                    ctx.drawImage(img, 0, 0, img.width, img.height)
                    ctx.beginPath()

                    let startX = parsePosition(positions[0][0], img.width)
                    let startY = parsePosition(positions[0][1], img.height)
                    ctx.moveTo(startX, startY)
                    let minX = startX, minY = startY
                    let maxX = startX, maxY = startY
                    for(let pos of positions.slice(1)){
                        let x = parsePosition(pos[0], img.width)
                        let y = parsePosition(pos[1], img.width)
                        if(x < minX) minX = x;
                        if(x > maxX) maxX = x;
                        if(y < minY) minY = y;
                        if(y > maxY) maxY = y
                        ctx.lineTo(x, y)
                    }
                    let width = maxX - minX
                    let height = maxY - minY
                    if(gradient){
                        let [lastGrad, grad_angle] = gradient.slice(-1)[0].split(":")
                        grad_angle = parseFloat(grad_angle) * Math.PI / 180
                        if(!grad_angle) grad_angle = (opts['grad-angle'] || 0.0) * Math.PI / 180
                        else gradient[gradient.length - 1] = lastGrad
                        ctx.fillStyle = await createGradient(gradient, grad_angle, startX, startY, width, height, msg, ctx)
                    }
                    else ctx.fillStyle = color
                    ctx.fill()
                    const buffer = canv.toBuffer("image/png")
                    fs.writeFileSync(fn, buffer)
                    msg.channel.send({files: [{attachment: fn, name: fn}]}).then(res => {
                        fs.rmSync(fn)
                    }).catch(err => {
                    })
                })
            }).end()
            return {
                content: "generating img"
            }
	    */
        },
        category: CommandCategory.IMAGES
    },
    rect: {
        run: async(msg: Message, args: ArgumentList) => {
            let opts;
            [opts, args] = getOpts(args)
            let color: string = <string>opts['color'] || "white"
            let outline = opts['outline']
            let img = getImgFromMsgAndOpts(opts, msg)
            if(!img){
                return {
                    content: "no img found"
                }
            }
	    let gradient: Array<string> | undefined
	    if(typeof opts["gradient"] == 'string')
		gradient = opts['gradient'].split(">")
            let [x, y, width, height] = args.slice(0,4)
            if(!x){
                x = typeof opts['x'] === 'string' ? opts['x'] : "0"
            }
            if(!y){
                y = typeof opts['y'] === 'string' ? opts['y'] : "0"
            }
            if(!width){
		//@ts-ignore
                width = opts['w'] || opts['width'] || opts['size'] || "50"
            }
            if(!height){
		//@ts-ignore
                height = opts['h'] || opts['height'] || opts['size'] || width || "50"
            }
            let intWidth = parseInt(width as string) || 50
            let intHeight = parseInt(height as string) || 50
            https.request(img, resp => {
                let data = new Stream.Transform()
                resp.on("data", chunk => {
                    data.push(chunk)
                })
                resp.on("end", async() => {
                    let fn = `${generateFileName("rect", msg.author.id)}.png`
                    fs.writeFileSync(fn, data.read())
		    let oldImg = sharp(fn).png()
		    let oldMeta = await oldImg.metadata()
		    let [oldWidth, oldHeight] = [oldMeta.width, oldMeta.height]

		    let newImg
                    if(gradient){
			newImg = sharp(await createGradient(gradient, intWidth, intHeight))
                    }
                    else {
			let trueColor
			if(typeof color === 'boolean'){
			    trueColor = 'black'
			} else {
			    trueColor = color;
			}
			newImg = sharp({
			    create: {
				width: intWidth,
				height: intHeight,
				channels: 4,
				background: trueColor
			    }
			})
		    }
		    let composedImg = await oldImg.composite([{input: await newImg.png().toBuffer(), top: parsePosition(y, oldHeight, intHeight), left: parsePosition(x, oldWidth, intWidth)}]).png().toBuffer()
		    /*
                    if(outline){
                        let [color, lineWidth] = outline.split(":")
                        ctx.lineWidth = parseInt(lineWidth || opts['o-width'] || "1")
                        let outline_gradient = color.split(">")
                        if((outline_gradient?.length || 0) <= 1)
                            outline_gradient = opts['o-gradient']?.split(">")
                        if(outline_gradient){
                            let grad_angle = (opts['o-grad-angle'] || 0.0) * Math.PI / 180
                            ctx.strokeStyle = await createGradient(outline_gradient, grad_angle, x - ctx.lineWidth / 2, y - ctx.lineWidth / 2, width + ctx.lineWidth, height + ctx.lineWidth, msg, ctx)
                        }
                        else ctx.strokeStyle = color || opts['o-color'] || 'white'
                        ctx.strokeRect(x - ctx.lineWidth / 2, y - ctx.lineWidth / 2, width + ctx.lineWidth, height + ctx.lineWidth)
                    }
		    */
                    fs.writeFileSync(fn, composedImg)
                    msg.channel.send({files: [{attachment: fn, name: fn}]}).then(res => {
                        fs.rmSync(fn)
                    }).catch(err => {
                    })
                })
            }).end()
            return {
                content: "generating img"
            }
        },
        help: {
            info: "Generate rectangles :))",
            arguments: {
                x: {
                    description: "x position of rectangle",
                    required: false
                },
                y: {
                    description: "y position of rectangle",
                    requires: "x"
                },
                width: {
                    description: "width of rectangle",
                    requires: "y"
                },
                height: {
                    description: "height of rectangle",
                    requires: "width"
                }
            },
            options: {
                color: {
                    description: "color of the rectangle, if color is 'transparent', it will make that section of the image transparent"
                },
                gradient: {
                    description: "Use a gradient, syntax: <code>-gradient=color1>color2...[:angle]</code>"
                },
                "grad-angle": {
                    description: "The angle of the gradient, in degrees"
                },
                "outline": {
                    description: "Outline of the rectangle, syntax: <code>-outline=color[>color2][:size]</code>"
                },
                "o-color": {
                    description: "Color of the outline, overrides outline-color"
                },
                "o-width": {
                    description: "Width of the outline, overrides outline-width"
                },
                "o-gradient": {
                    description: "Same as outline-gradient, and overrides it"
                },
                "o-grad-angle": {
                    description: "Outline gradient angle, overrides outline-grad-angle"
                },
                "width": {
                    description: "The width of the rectangle"
                },
                "w": {
                    description: "The width of the rectangle, overrides -width"
                },
                "height": {
                    description: "The height of the rectangle"
                },
                "h": {
                    description: "The height of the rectangle, overrides -height"
                },
                "size": {
                    description: "The width, and height of the rectangle, given as 1 number"
                },
                "img": {
                    description: "A link to the image to use"
                }
            }
        },
        category: CommandCategory.IMAGES
    },
    scale: {
        run: async(msg: Message, args: ArgumentList) => {
	    /*
            let opts;
            [opts, args] = getOpts(args)
            let xScale = args[0] || "2.0"
            let yScale = args[1] || "2.0"
            let img = getImgFromMsgAndOpts(opts, msg)
            if(!img){
                return {content: "no img found"}
            }
            https.request(img, resp => {
                let data = new Stream.Transform()
                resp.on("data", chunk => {
                    data.push(chunk)
                })
                let fn = `${generateFileName("scale", msg.author.id)}.png`
                resp.on("end", async() => {
                    fs.writeFileSync(fn, data.read())
                    let img = await canvas.loadImage(fn)
                    fs.rmSync(fn)
                    xScale = Math.min(parsePosition(xScale, img.width, img.width, parseFloat), 2000)
                    yScale = Math.min(parsePosition(yScale, img.height, img.height, parseFloat), 2000)
                    let canv = new canvas.Canvas(img.width * xScale, img.height * yScale)
                    let ctx = canv.getContext("2d")
                    ctx.drawImage(img, 0, 0, img.width * xScale, img.height * yScale)
                    let buffer
                    try{
                        buffer = canv.toBuffer("image/png")
                    }
                    catch(err){
                        await msg.channel.send("Could not generate image")
                        return
                    }
                    fs.writeFileSync(fn, buffer)
                    msg.channel.send({files: [{attachment: fn, name: fn,}]}).then(res => {
                        fs.rmSync(fn)
                    }).catch(err => {
                    })
                })
            }).end()
	    */
            return {
                content: "generating img"
            }
        },
        help: {
            arguments: {
                "scale-width": {
                    description: "The amount to scale the width by"
                },
                'scale-height': {
                    description: 'The amount to scale the height by'
                }
            }
        },
        category: CommandCategory.IMAGES
    },
    filter: {
        run: async(msg: Message, args:ArgumentList) => {
	    /*
            let opts;
            [opts, args] = getOpts(args)
            let stringArgs = args.join(" ")
            let filters = stringArgs.split("|")
            let img = getImgFromMsgAndOpts(opts, msg)
            if(!img){
                return {content: "no img found"}
            }
            https.request(img, resp => {
                let data = new Stream.Transform()
                resp.on("data", chunk => {
                    data.push(chunk)
                })
                let fn = `${generateFileName("scale", msg.author.id)}.png`
                resp.on("end", async() => {
                    fs.writeFileSync(fn, data.read())
                    let img = await canvas.loadImage(fn)
                    fs.rmSync(fn)
                    let canv = new canvas.Canvas(img.width, img.height)
                    let ctx = canv.getContext("2d")
                    ctx.drawImage(img, 0, 0, img.width, img.height)
                    let buffer = canv.toBuffer("image/png")
                    let jimpImg = await jimp.read(buffer)
                    for(let filter of filters){
                        let args;
                        [filter, args] = filter.split(":")
                        jimpImg = await applyJimpFilter(jimpImg, filter, args)
                    }
                    buffer = await jimpImg.getBufferAsync("image/png")
                    fs.writeFileSync(fn, buffer)
                    msg.channel.send({files: [{attachment: fn, name: fn,}]}).then(res => {
                        fs.rmSync(fn)
                    }).catch(err => {
                    })
                })
            }).end()
	    */
            return {
                content: "generating img"
            }
        },
        help: {
            info: "Filters:<br>rotate[:angle]<br>flip[:hor|vert]<br>brightness[:val]<br>grey|greyscale|gray|grayscale<br>invert<br>contrast[:val]",
            arguments: {
                filter: {
                    description: "The filters to use, each filter is seperated by |"
                }
            }
        },
        category: CommandCategory.IMAGES
    },
    text: {
        run: async(msg: Message, args: ArgumentList) => {
    /*
            let opts
            [opts, args] = getOpts(args)
            let img = getImgFromMsgAndOpts(opts, msg)
            if(!img){
                return {content: "no img found"}
            }
            let size = opts["size"] || "20"
            let font = opts["font"] || "Arial"
            let color = opts["color"] || "red"
            let rotation = opts['rotate'] || opts['angle'] || "0.0"
            rotation = parseFloat(rotation)
            let x = opts["x"] || "0"
            let y = opts["y"] || "0"

            let fn = `${generateFileName("text", msg.author.id)}.png`

            https.request(img, resp => {
                let data = new Stream.Transform()
                resp.on("data", chunk => {
                    data.push(chunk)
                })
                resp.on("end", async() => {
		    let d = data.read()
		    let img = sharp(d)
		    let imgMeta = await img.metadata()
		    let [width, height] = [imgMeta.width, imgMeta.height]
		    let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"> <text x="0" y="0" font-size="${size}" style="font-family: ${font}" fill="${color}">${args.join(" ").trim() || "?"}</text></svg>`
		    svg2img(svg, (err, buf) => {
			console.log(err, buf)
			fs.writeFileSync('foo.png', buf)
			img.composite([{input: 'foo.png'}]).png().toBuffer().then(buf => {
			    fs.writeFileSync(fn, buf)
			    msg.channel.send({files: [{attachment: fn, name: fn,}]}).then(res => {
				fs.rmSync(fn)
			    }).catch(err => {
			    })
			})
		    })
		    /*
		    let textMeta = await newText.metadata()
		    let [textW, textH] = [textMeta.width, textMeta.height]
                    ctx.drawImage(img, 0, 0, img.width, img.height)
                    ctx.font = `${size} ${font}`
                    ctx.fillStyle = color
                    let textInfo = ctx.measureText(args.join(" ").trim() || "?")
                    let [textW, textH] = [textInfo.width, textInfo.emHeightAscent]
                    x = parsePosition(x, width, textW)
                    y = parsePosition(y, height, textH)
                })
            }).end()
	    */
            return {
                content: "generating img"
            }
        },
        help: {
            info: "Put text on an image",
            arguments: {
                text: {
                    description: "The text to put",
                    required: true
                },
                img: {
                    description: "Image file to use"
                }
            },
            options: {
                img: {
                    description: "Link to image to use"
                },
                size: {
                    description: "Size of the text"
                },
                font: {
                    description: "Font of text (restricted to fonts i have installed)"
                },
                color: {
                    description: "Color of the text"
                },
                x: {
                    description: "x of the text"
                },
                y: {
                    description: "y of the text"
                }
            }
        },
        category: CommandCategory.IMAGES
    },
    choose: {
        run: async(msg: Message, args: ArgumentList) => {
            let opts;
            [opts, args] = getOpts(args)
            let times = 1
            let sep = String(opts["sep"] || opts["s"] || "\n")
            if(opts["t"]){
		if(typeof opts['t'] == 'string')
		    times = parseInt(opts["t"])
		else times = 3
            }
            let ans = []
            args = args.join(" ").split("|")
            for(let i = 0; i < times; i++){
                ans.push(args[Math.floor(Math.random() * args.length)].trim())
            }
            return {
                content: ans.join(sep) || "```invalid message```"
            }
        },
        category: CommandCategory.FUN
    },
    weather: {
        run: async(msg: Message, args: ArgumentList) => {
            let url = "https://www.wttr.in"
            let town = args.join(" ") || "tokyo"

            https.request(`${url}/${encodeURI(town)}?format=1`, resp => {
                let data = new Stream.Transform()
                resp.on("data", chunk => {
                    data.push(chunk)
                })
                resp.on('end', async() => {
		    //@ts-ignore
                    data = data.read().toString() as string
		    //@ts-ignore
                    let tempData = data.match(/(\S*)\s*[+-](\d+).(C|F)/)
                    let condition, temp, unit
                    try{
                        [condition, temp, unit] = tempData.slice(1,4)
                    }
                    catch(err){
                        await msg.channel.send({content: "Could not find weather :("})
                        return
                    }
                    temp = Number(temp)
                    let tempC, tempF
                    if(unit == "C"){
                        tempF = temp * 9/5 + 32
                        tempC = temp
                    } else if(unit == "F"){
                        tempC = (temp - 32) * 5/9
                        tempF = temp
                    }
		    else{
			tempC = 843902438
			tempF = tempC * 9/5 + 32
		    }
                    let color = "DARK_BUT_NOT_BLACK"
                    if(tempF >= 110) color = "#aa0000"
                    if(tempF < 110) color = "#ff0000"
                    if(tempF < 100) color = "#ff412e"
                    if(tempF < 90) color = "ORANGE"
                    if(tempF < 75) color = "YELLOW"
                    if(tempF < 60) color = "GREEN"
                    if(tempF < 45) color = "BLUE"
                    if(tempF < 32) color = "#5be6ff"
                    if(tempF < 0) color = "PURPLE"
                    let embed = new MessageEmbed()
                    embed.setTitle(town)
                    embed.setColor(color as ColorResolvable)
                    embed.addField("condition", condition, false)
                    embed.addField("Temp F", `${tempF}F`, true)
                    embed.addField("Temp C", `${tempC}C`, true)
                    embed.setFooter({text: `For more info, visit ${url}/${encodeURI(town)}`})
                    await msg.channel.send({embeds: [embed]})
                })
            }).end()
            return {
                content: 'getting weather'
            }
        },
        help: {
            info: "Get weather for a specific place, default: tokyo",
            arguments: {
                "location": {
                    description: "Where do you want the weather for"
                }
            }
        },
        category: CommandCategory.FUN
    },
    rotate: {
        run: async(msg: Message, args: ArgumentList) => {
            return commands['filter'].run(msg, [`rotate:${args[0]},${args[1]}`])
        },
        category: CommandCategory.IMAGES
    },
    color: {
        run: async(msg: Message, args: ArgumentList) => {
            let opts;
            [opts, args] = getOpts(args)
            let stringArgs = args.join(" ")
            let color = stringArgs || "RANDOM"
            let colors = stringArgs.split(">")

            const width = Math.min(parseInt(opts['w'] as string) || 250, 2000)
            const height = Math.min(parseInt(opts['h'] as string) || 250, 2000)

            let content = color
            let fn = `${generateFileName("color", msg.author.id)}.png`
	    let buffer
            if(colors.length > 1){
                let gradient = []
                let colorStrings = []
                for(let i = 0; i < Math.min(colors.length, 1e9); i++){
                    let R, G, B
                    if(colors[i]){
                        colorStrings.push(colors[i])
                        gradient.push(colors[i])
                    }
                    else{
                        [R, G, B] = randomColor()
                        gradient.push(`rgb(${R}, ${G}, ${B})`)
                        colorStrings.push(rgbToHex(R, G, B))
                    }
                }
                try{
                    buffer = await sharp(await createGradient(gradient, width, height)).png().toBuffer()
                }
                catch(err){
                    return {content: "error making color"}
                }
                content = colorStrings.join(" > ")
            }
            else{
                if(color == "RANDOM"){
                    let [R, G, B] = randomColor()
                    color = `rgb(${R}, ${G}, ${B})`
                    content = rgbToHex(R, G, B)
                }
                try{
                    buffer = await sharp({create: {
                            width: width,
                            height: height,
                            channels: 4,
                            background: color
                        }}).png().toBuffer()
                }
                catch(err){
                    return {content: "error making color"}
                }
            }
            fs.writeFileSync(fn, buffer)
            return {
                files:[
                    {
                        attachment: fn,
                        name: `file.png`,
                        description: "why can i describe this"
                    }
                ],
                content: content
            }
        },
        help: {
            info: "Generate a random color",
            arguments: {
                "color": {
                    description: "The color to generate, can also be >, which will create a gradient"
                }
            },
            options: {
                "width": {
                    description: "width of image"
                },
                "height": {
                    description: "height of image"
                }
            }
        },
        category: CommandCategory.IMAGES

    },
    "l-bl": {
        run: async(msg: Message, args: ArgumentList) => {
            return {
                content: fs.readFileSync("command-perms/blacklists", "utf-8")
            }
        },
        category: CommandCategory.META

    },
    "l-wl": {
        run: async(msg: Message, args: ArgumentList) => {
            return {
                content: fs.readFileSync("command-perms/whitelists", "utf-8")
            }
        },
        category: CommandCategory.META
    },
    ship: {
        run: async(msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            if(args.length < 2){
            return {content: "2 users must be given", delete: opts['d'] as boolean}
            }
            let [user1Full, user2Full] = args.join(" ").split("|")
            if(!user1Full || !user2Full){
            return {content: "2 users not given"}
            }
            let user1 = user1Full.slice(0, Math.ceil(user1Full.length / 2))
            let user2 = user2Full.slice(Math.floor(user2Full.length / 2))
            let options = fs.readFileSync(`command-results/ship`, "utf-8").split(";END").map(v => v.split(" ").slice(1).join(" ")).filter(v => v.trim())
            return {content: format(options[Math.floor(Math.random() * options.length)], {"u1": user1Full, "u2": user2Full, "ship": `${user1}${user2}`, "strength": `${Math.floor(Math.random() * 99 + 1)}%`}) , delete: opts['d'] as boolean}
        },
        help: {
            info: "Create your favorite fantacies!!!!"
        },
        category: CommandCategory.FUN
    },
    aship: {
        run: async(msg, args) => {
            return await commands['add'].run(msg, ["ship", args.join(" ")])
        },
        help: {
            info: "{u1} is the first user, {u2} is the second user, {ship} is the ship name for the users"
        },
        category: CommandCategory.FUN
    },
    timeit: {
        run: async(msg, args) => {
                msg.content = `${prefix}${args.join(" ").trim()}`
                let start = new Date().getTime()
                await doCmd(msg)
                return {content: `${new Date().getTime() - start} ms`}
        },
        category: CommandCategory.META
    },
    "do": {
        run: async(msg: Message, args: ArgumentList) => {
            let times = parseInt(args[0])
            if(times){
                args.splice(0, 1)
            } else {
                times = 10
            }
            let cmdArgs = args.join(" ").trim()
            if(cmdArgs == ""){
                cmdArgs = String(times)
            }
            let totalTimes = times
            let id = String(Math.floor(Math.random() * 100000000))
            await msg.channel.send(`starting ${id}`)
            SPAMS[id] = true
            while(SPAMS[id] && times--){
                msg.content = `${prefix}${format(cmdArgs, {"number": String(totalTimes - times), "rnumber": String(times + 1)})}`
                await doCmd(msg)
                await new Promise(res => setTimeout(res, Math.random() * 700 + 200))
            }
            return {
                content: "done"
            }
        },
        category: CommandCategory.META
    },
    spasm: {
        run: async(msg, args) => {
            let [times, ...text] = args
            let sendText = text.join(" ")
            let timesToGo = 10
            if(!isNaN(parseInt(times))){
                timesToGo = parseInt(times)
            }
            else{
                sendText = [times, ...text].join(" ")
            }
            let id = String(Math.floor(Math.random() * 100000000))
            await msg.channel.send(`starting ${id}`)
            SPAMS[id] = true
            let message = await msg.channel.send(sendText)
            while(SPAMS[id] && timesToGo--){
                if(message.deletable) await message.delete()
                message = await msg.channel.send(sendText)
                await new Promise(res => setTimeout(res, Math.random() * 700 + 200))
            }
            return {content: "done"}
        }, category: CommandCategory.FUN
    },
    spam: {
        run: async(msg: Message, args: ArgumentList) => {
            let times = parseInt(args[0])
            if(times){
                args.splice(0, 1)
            } else times = 10
            let send = args.join(" ").trim()
            if(send == ""){
                send = String(times)
                times = 10
            }
            let totalTimes = times
            let id = String(Math.floor(Math.random() * 100000000))
            await msg.channel.send(`starting ${id}`)
            SPAMS[id] = true
            while(SPAMS[id] && times--){
                await msg.channel.send(`${format(send, {"number": String(totalTimes - times), "rnumber": String(times + 1)})}`)
                await new Promise(res => setTimeout(res, Math.random() * 700 + 200))
            }
            return {
                content: "done"
            }
        },
        help: {
            info: "This technically runs the echo command with the -D option in the background, so any special syntax such as $() should work (if preceded with a \\)"
        },
        category: CommandCategory.META
    },
    stop: {
        run: async(msg: Message, args: ArgumentList) => {
            if(!Object.keys(SPAMS).length){
                return { content: "no spams to stop"}
            }
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
        },
        category: CommandCategory.META
    },
    "pollify": {
        run: async(msg, args) => {
            let opts: Opts;
            [opts, args] = getOpts(args)
            if(msg.deletable && opts['d']) await msg.delete()
            let message = await msg.channel.send(args.join(" ") || "poll")
            await message.react("<:Blue_check:608847324269248512>")
            await message.react("<:neutral:716078457880051734>")
            await message.react("❌")
            return {noSend: true}
        }, category: CommandCategory.UTIL,
        help: {
            info: "Idk it pollifies what do you want"
        }
    },
    "udict": {
        run: async(msg, args) => {
            //@ts-ignore
            let data = await got(`https://www.urbandictionary.com/define.php?term=${args.join("+")}`)
            let text = data.body
            let match = text.match(/(?<=<meta content=")([^"]+)" name="Description"/)
            return {content: match[1] || "Nothing found :("}
        }, category: CommandCategory.FUN
    },
    "vars": {
        run: async(msg, args) => {
            let rv = "Global Vars:\n"
            for(let v in vars){
            rv += `${v.replaceAll("_", "\\_")}\n`
            }
            rv += "----------------------\nUser Vars:\n"
            if(userVars[msg.author.id]){
            for(let v in userVars[msg.author.id]){
                rv += `${v.replaceAll("_", "\\_")}\n`
            }
            }
            return {content: rv}
        },
        category: CommandCategory.META
    },
    'stackl': {
        run: async(msg, args) => {
            let stack: (number | string)[] = []
            let ram: {[key: string]: number | string} = {}
            let stacklArgs = []
            let text = args.join(" ")
            let word = ""
            let inStr = false
            for(let i = 0; i < text.length; i++){
                if(text[i] == '"'){
                    word += '"'
                    inStr = !inStr
                    continue
                }
                if(text[i].match(/\s/) && ! inStr){
                    stacklArgs.push(word)
                    word = ""
                    continue
                }
                word += text[i]
            }
            if(word)
                stacklArgs.push(word)
            args = stacklArgs
            async function parseArg(arg: string, argNo: number, argCount: number): Promise<any>{
                switch(arg){
                    case "++":{
                        if(typeof stack[stack.length - 1] !== 'number'){
                            return {content: `${stack[stack.length - 1]} is not a number`, err: true}
                        }
                        //@ts-ignore
                        let ans = stack[stack.length - 1] + 1
                        stack.pop()
                        stack.pop()
                        stack.push(ans)
                        break;
                    }
                    case "--": {
                        if(typeof stack[stack.length - 1] !== 'number'){
                            return {content: `${stack[stack.length -1 ]} is not a number`, err: true}
                        }
                        //@ts-ignore
                        let ans = stack[stack.length - 1] - 1
                        stack.pop()
                        stack.pop()
                        stack.push(ans)
                        break;
                    }
                    case "+": {
                        let arg2 = stack.pop()
                        let arg1 = stack.pop()
                        switch(typeof arg1){
                            case "number": {
                                if(typeof arg2 !== 'number'){
                                    return {content: `${arg2} is not a number`, err: true}
                                }
                                stack.push(arg1 + arg2)
                                break
                            }
                            case "string": {
                                if(typeof arg2 !== 'string'){
                                    return {content: `${arg2} is not a string`, err: true}
                                }
                                stack.push(arg1 + arg2)
                                break
                            }
                            default: {
                                return {err: true, content: `type of ${arg1} is unknown`}
                            }
                        }
                        break
                    }
                    case "-": {
                        let arg2 = stack.pop()
                        let arg1 = stack.pop()
                        switch(typeof arg1){
                            case "number": {
                                if(typeof arg2 !== 'number'){
                                    return {content: `${arg2} is not a number`, err: true}
                                }
                                stack.push(arg1 - arg2)
                                break
                            }
                            case "string": {
                                if(typeof arg2 !== 'string'){
                                    return {content: `${arg2} is not a string`, err: true}
                                }
                                stack.push(arg1.replaceAll(arg2, ""))
                                break
                            }
                            default: {
                                return {err: true, content: `type of ${arg1} is unknown`}
                            }
                        }
                        break
                    }
                    case "%s": {
                        let arg2 = stack.pop()
                        let arg1 = stack.pop()
                        if(typeof arg2 == "string"){
                            while((arg2 = arg2.replace(/%(s|d|f)/, (_match, type) => {
                                if(type == "s"){
                                    return String(arg1)
                                }
                                else if(type == "d"){
                                    return String(parseInt(String(arg1)))
                                }
                                else if(type == "f"){
                                    return String(parseFloat(String(arg1)))
                                }
                                return ""
                            })).match(/%(s|d)/)){
                                arg1 = stack.pop()
                                if(typeof arg1 === "undefined"){
                                    return {content: `ran out of replacements for %s`, err: true}
                                }
                            }
                            stack.push(arg2)
                        }
                        else{
                            return {content: `${arg2} is not a string`, err: true}
                        }
                        break
                    }
                    case "%": {
                        let arg2 = stack.pop()
                        let arg1 = stack.pop()
                        console.log(arg1, arg2)
                        switch(typeof arg1){
                            case "number": {
                                if(typeof arg2 !== 'number'){
                                    return {content: `${arg2} is not a number`, err: true}
                                }
                                stack.push(arg1 - arg2)
                                break
                            }
                            default: {
                                return {err: true, content: `${arg} is not a number`}
                            }
                        }
                        break
                    }
                    case ">": {
                        let arg2 = stack.pop()
                        let arg1 = stack.pop()
                        switch(typeof arg1){
                            case "number": {
                                if(typeof arg2 !== 'number'){
                                    return {content: `${arg2} is not a number`, err: true}
                                }
                                stack.push(arg1 > arg2 ? 1 : 0)
                                break
                            }
                            case "string": {
                                if(typeof arg2 !== 'string'){
                                    return {content: `${arg2} is not a string`, err: true}
                                }
                                stack.push(arg1.length > arg2.length ? 1 : 0)
                                break
                            }
                            default: {
                                return {err: true, content: `type of ${arg1} is unknown`}
                            }
                        }
                        break
                    }
                    case "<": {
                        let arg2 = stack.pop()
                        let arg1 = stack.pop()
                        switch(typeof arg1){
                            case "number": {
                                if(typeof arg2 !== 'number'){
                                    return {content: `${arg2} is not a number`, err: true}
                                }
                                stack.push(arg1 < arg2 ? 1 : 0)
                                break
                            }
                            case "string": {
                                if(typeof arg2 !== 'string'){
                                    return {content: `${arg2} is not a string`, err: true}
                                }
                                stack.push(arg1.length < arg2.length ? 1 : 0)
                                break
                            }
                            default: {
                                return {err: true, content: `type of ${arg1} is unknown`}
                            }
                        }
                        break
                    }
                    case "==": {
                        let ans = stack.pop() == stack.pop() ? true : false
                        stack.push(ans ? 1 : 0)
                        break
                    }
                    case "%or": {
                        let arg1 = stack.pop()
                        let arg2 = stack.pop()
                        if(typeof arg1 !== 'number'){
                            return {err: true, content: `${arg1} is not a boolean`}
                        }
                        if(arg1 === 1 || arg2 === 1){
                            stack.push(1)
                        }
                        else{
                            stack.push(0)
                        }
                        break;
                    }
                    case "%and": {
                        let arg1 = stack.pop()
                        let arg2 = stack.pop()
                        if(arg1 === 1 && arg2 === 1){
                            stack.push(1)
                        }
                        else{
                            stack.push(0)
                        }
                        break
                    }
                    case "%xor": {
                        let arg1 = stack.pop()
                        let arg2 = stack.pop()
                    }
                    case "%saveas": {
                        stack.push("%saveas")
                        break
                    }
                    case "%sram": {
                        stack.push("%sram")
                        break
                    }
                    case "%lram": {
                        stack.push('%lram')
                        break
                    }
                    case "%pop": {
                        stack.pop()
                        break
                    }
                    case "%send": {
                        let ans = stack.pop()
                        if(ans == undefined || ans == null){
                            return {content: "Nothing to send", err: true}
                        }
                        await msg.channel.send(String(ans))
                        break
                    }
                    case "%rand": {
                        stack.push(Math.random())
                        break
                    }
                    case "%end": {
                        return {end: true}
                    }
                    case "%if": {
                        if(isNaN(parseInt(String(stack[stack.length - 1])))){
                            return {content: `${stack[stack.length - 1]} is not a bool`, err: true}
                        }
                        let bool = parseInt(String(stack.pop())) > 0 ? true : false
                        if(bool){
                            for(let i = argNo + 1; i < argCount; i++){
                                //@ts-ignore
                                if(args[i] == "%else"){
                                    for(let j = i + 1; j < argCount; j++){
                                        if(args[j] == "%end"){
                                            return {chgI: j - argNo}
                                        }
                                    }
                                    return {chgI: i - argNo}
                                }
                                if(args[i] == "%end"){
                                    return {chgI: i - argNo}
                                }
                                let rv = await parseArg(args[i], i, argCount)
                                if(rv?.end) return {end: true}
                                if(rv?.chgI)
                                    i += parseInt(rv.chgI)
                                if(rv?.err){
                                    return {chgI: i - argNo, ...rv}
                                }
                            }
                        }
                        else{
                            for(let i = argNo; i < argCount; i++){
                                if(args[i] == "%else"){
                                    for(let j = i + 1; j < argCount; j++){
                                        if(args[j] == "%end"){
                                            return {chgI: j - argNo}
                                        }
                                        let rv = await parseArg(args[j], j, argCount)
                                        if(rv?.end) return {end: true}
                                        if(rv?.chgI)
                                            j += parseInt(rv.chgI)
                                        if(rv?.err){
                                            return {chgI: j - argNo, ...rv}
                                        }
                                    }
                                }
                                if(args[i] == "%end"){
                                    return {chgI: i - argNo}
                                }
                            }
                        }
                        break
                    }
                    default: {
                        if(arg.match(/^"([^"]+)"$/)){
                            //strings
                            stack.push(arg.replace(/^"/, "").replace(/"$/, ""))
                        }
                        else if(!isNaN(parseFloat(arg))){
                            stack.push(parseFloat(arg))
                        }
                        else if(stack[stack.length - 1] == "%saveas"){
                            let ans = stack[stack.length - 2]
                            vars[arg] = () => ans
                            stack.pop()
                            stack.pop()
                            stack.pop()
                        }
                        else if(stack[stack.length - 1] == "%sram"){
                            if(isNaN(parseFloat(String(stack[stack.length - 2])))){
                                return {content: `${stack[stack.length - 2]} is not a number`, err: true}
                            }
                            ram[arg] = parseFloat(stack[stack.length - 2] as string)
                            stack.pop()
                            stack.pop()
                            stack.pop()
                        }
                        else if(stack[stack.length - 1] == '%lram'){
                            if(ram[arg] === undefined){
                                return {content: `${arg} not in ram`}
                            }
                            stack.pop()
                            stack.push(ram[arg])
                        }
                        else{
                            let value = vars[arg]
                            if(!value){
                                value = userVars[msg.author.id]?.[arg]
                            }
                            if(!value){
                                return {content: `var: **${arg}** does not exist`, err: true}
                            }
                            stack.push(value(msg))
                        }
                    }
                }
            }
            for(let i = 0; i < args.length; i++){
                let arg = args[i]
                arg = arg.trim()
                let rv = await parseArg(arg, i, args.length)
                console.log(rv)
                if(rv?.end) break
                if(rv?.chgI)
                    i += parseInt(rv.chgI)
                if(rv?.err){
                    return rv
                }
            }
            return {content: stack.join(" ")}
        }, category: CommandCategory.UTIL
    },
    "expr": {
        run: async(msg, args) => {
            let vname = args[0]
            let varValRet
            let vardict = vars
            if(typeof parseFloat(vname) !== 'number'){
                let vvalue = vars[vname]
                if(!vvalue){
                    vardict = userVars[msg.author.id]
                    vvalue = userVars[msg.author.id]?.[vname]
                }
                if(!vvalue){
                    return {content: `var: **${vname}** does not exist`}
                }
                varValRet = vvalue(msg)
            }
            else{
                varValRet = vname
                vname = "__expr"
            }
            let op = args[1]
            let expr = args[2]
            if(expr && typeof parseFloat(expr) !== 'number'){
                let vvalue = vars[expr]
                if(!vvalue){
                    vvalue = userVars[msg.author.id]?.[expr]
                }
                if(!vvalue){
                    return {content: `var: **${expr}** does not exist`}
                }
                expr = vvalue(msg)
            }
            let ans: any
            switch(op){
                case "++":

                    ans = parseFloat(varValRet) + 1
                    break
                case "--":
                    ans = parseFloat(varValRet) - 1
                    break
                case "floor":
                    ans = Math.floor(parseFloat(varValRet))
                    break;
                case "ceil":
                    ans = Math.ceil(parseFloat(varValRet))
                    break;
                case ":":
                    ans = parseFloat(varValRet)
                    break;
                case ",":
                    ans = ""
                    for(let i = 0; i < varValRet.length; i++){
                        if(i % 3 == 0 && i != 0){
                            ans += ","
                        }
                        ans += varValRet[varValRet.length - i - 1]
                    }
                    let newAns = ""
                    for(let i = ans.length - 1; i >= 0; i--){
                        newAns += ans[i]
                    }
                    ans = newAns
                    break;
                case "+":
                    ans = parseFloat(varValRet) + parseFloat(expr)
                    break
                case "-":
                    ans = parseFloat(varValRet) - parseFloat(expr)
                    break
                case "*":
                    ans = parseFloat(varValRet) * parseFloat(expr)
                    break
                case "/":
                    ans = parseFloat(varValRet) / parseFloat(expr)
                    break
                case "^":
                    ans = parseFloat(varValRet) / parseFloat(expr)
                    break;
            }
            vardict[vname] = () => ans
            return {content: String(ans)}
        },
        help: {
            info: "Modify a variable",
            arguments: {
                "num1": {
                    description: "Number 1 (can be a variable)"
                },
                "operator": {
                    description: "The operator<ul><li>++</li><li>--</li><li>floor</li><li>ceil</li><li>,</li><li>:</li><li>+</li><li>-</li><li>*</li>/</li><li>^</li></ul>"
                },
                "num2": {
                    description: "The other number (can be a variable)"
                }
            }
        },
        category: CommandCategory.UTIL

    },
    "var": {
        run: async(msg: Message, args: ArgumentList) => {
            let opts;
            [opts, args] = getOpts(args)
            let [name, ...value] = args.join(" ").split("=")
            if(!value.length){
                return {content: "no value given, syntax `[var x=value"}
            }
            let realVal = value.join(" ")
            if (opts['u']){
                if(userVars[msg.author.id]){
                    userVars[msg.author.id][name] = () => realVal
                }
                else{
                    userVars[msg.author.id] = {[name]: () => realVal}
                }
                return {
                    content: userVars[msg.author.id][name]()
                }
            }
            else{
                vars[name] = () => realVal
                return {
                    content: vars[name]()
                }
            }
        },
        help: {
            arguments: {
                "name=value": {
                    description: "name is the variable name, value is the value",
                    required: true
                }
            }
        },
        category: CommandCategory.META
    },
    remove: {
        run: async(msg: Message, args: ArgumentList) => {
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
            let options = data.map((value, i) => value.trim() ? `${i + 1}:\t${value.trim()}` : "")
            let fn = generateFileName("remove", msg.author.id)
            fs.writeFileSync(fn, options.join("\n"))
            await msg.channel.send({
                files: [{
                    attachment: fn,
                    name: "remove.txt"
                }]
            })
            fs.rmSync(fn)
            try{
                let collector = msg.channel.createMessageCollector({filter: m => m.author.id == msg.author.id, time: 30000})
                collector.on("collect", async(m) => {
                    if(['cancel', 'c'].includes(m.content || "c")){
                        collector.stop()
                        return
                    }
                    let removedList = []
                    for(let numStr of m.content.split(" ")){
                    let num = parseInt(numStr || "0")
                    if(!num){
                        await msg.channel.send(`${num} is not a valid number`)
                        return
                    }
                    let removal = data[num -1]
                    let userCreated = removal.split(":")[0].trim()
                    if(userCreated != msg.author.id && ADMINS.indexOf(msg.author.id) < 0) {
                        await msg.channel.send({
                        content: "You did not create that message, and are not a bot admin"
                        })
                        continue
                    }
                    removedList.push(data[num -1])
                    delete data[num - 1]
                    }
                    data = data.filter(v => typeof v != 'undefined')
                    fs.writeFileSync(`command-results/${file}`, data.join(";END"))
                    await msg.channel.send({
                        content: `removed ${removedList.join("\n")} from ${file}`
                    })
                    collector.stop()
                })
            }
            catch(err){
                return {
                    content: "didnt respond in time"
                }
            }
            return {content: 'Say the number of what you want to remove or type cancel'}
        },
        help: {
            arguments: {
                file: {
                    description: "The command file to remove from",
                    required: true
                }
            }
        },
        category: CommandCategory.META

    },
    "file": {
        run: async(msg, args) => {
            let fn = generateFileName("file", msg.author.id)
            fs.writeFileSync(fn, args.join(" "))
            return {
                files: [
                    {
                        attachment: fn,
                        name: `${fn}.txt`,
                        description: `data`,
                    }
                ]
            }
        },
        category: CommandCategory.UTIL

    },
    "rfile": {
        run: async(msg, args) => {
            let att = msg.attachments.at(0)
            if(att){
                //@ts-ignore
                let data: string = await got(att.attachment).text()
                return {content: data}
            }
            return {noSend: true}
        },
        category: CommandCategory.UTIL
    },
    "command-file": {
        run : async(msg: Message, args: ArgumentList) => {
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
        },
        category: CommandCategory.META
    },
    "list-files": {
        run: async(msg, args) => {
            return {content: fs.readdirSync('./command-results').join("\n")}
        },
        category: CommandCategory.META
    },
    add: {
        run: async(msg: Message, args: ArgumentList) =>{
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
		if(file === "wordle")
		    fs.writeFileSync(`./command-results/${file}`, "")
		else return {content: `${file} does not exist`}
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
        },
        category: CommandCategory.META
    },
    "cmd-chain": {
        run: async(msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            let showArgs = true
            console.log(opts)
            if(opts['n'] || opts['no-args']){
                showArgs = false
            }
            let chain = []
            let command = args[0]
            let a = ""
            chain.push(command)
            //finds the original command
            while(aliases[command]?.[0]){
                a = aliases[command].slice(1).join(" ") +" " + a + " "
                console.log(aliases[command][0], showArgs)
                if(showArgs)
                    chain.push(`${aliases[command][0]} ${a}`.trim())
                else
                    chain.push(aliases[command][0])
                command = aliases[command][0]
            }

            return {content: chain.join(" -> ")}
        },
        help:{
            info: "Shows which command the alias turns into when run",
            arguments: {
                cmd: {
                    description: "The command to get the chain for"
                }
            }
        },
        category: CommandCategory.META

    },
    rccmd: {
        run: async(msg, args) => {
            let name = args[0]
            if(!name){
                return {
                    content: "No command name given"
                }
            }
            let commands = args.map(v => v.trim())
            let data = fs.readFileSync("command-results/alias", "utf-8").split(";END")
            let successfullyRemoved = []
            for(let i = 0; i < commands.length; i++){
                let command = commands[i]
                let line = data.filter(v => v && v.split(" ")[1]?.trim() == command)[0]
                let idx = data.indexOf(line)
                if(idx >= 0){
                    let [user, _] = line.trim().split(":")
                    user = user.trim()
                    if(user != msg.author.id && ADMINS.indexOf(msg.author.id) < 0){
                        await msg.channel.send(`Cannot remove ${command}`)
                    }
                    else{
                        successfullyRemoved.push(command)
                        data.splice(idx, 1)
                    }
                }
            }
            fs.writeFileSync("command-results/alias", data.join(";END"))
                aliases = createAliases()
            return {
            content: `Removed: ${successfullyRemoved.join(", ")}`
            }
        },
        category: CommandCategory.META

    },
    "8": {
        run: async(msg: Message, args: ArgumentList) => {
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
        },
        category: CommandCategory.FUN

    },
    distance: {
        run: async(msg: Message, args: ArgumentList) => {
            let opts;
            [opts, args] = getOpts(args)
            let speed = parseInt(opts['speed'] as string) || 1
	    let joinedArgs = args.join(" ")
            let [from, to] = joinedArgs.split("|")
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
		//@ts-ignore
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
                let options = fs.readFileSync("./command-results/distance-easter-egg", "utf-8").split(';END').slice(0, -1)
                return {
                    content: options[Math.floor(Math.random() * options.length)]
                        .slice(20)
                        .replaceAll("{from}", from)
                        .replaceAll("{to}", to)
                        .replaceAll("{f}", decodeURI(from))
                        .replaceAll("{t}", decodeURI(to))
                        .trim()
                }
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
        },
        category: CommandCategory.FUN
    },
    "list-cmds": {
        run: async(msg: Message, args: ArgumentList) => {
            let values = ''
	    let typeConv = {1: "chat", 2: "user", 3: "message"}
            for(let cmd in commands){
                values += `${cmd}\n`
            }
	    for(let cmd of slashCommands){
		//@ts-ignore
		if(cmd.type){
		    //@ts-ignore
		    values += `${cmd["name"]}:${typeConv[cmd["type"]] || "chat"}\n`
		}
		else values += `/${cmd["name"]}\n`
	    }
            return {
                content: values
            }
        },
        category: CommandCategory.FUN
    },
    help: {
	//help command
        run: async (msg, args) => {
            let opts
            [opts, args] = getOpts(args)
            if(opts["g"]){
                return {content: `\`\`\`
Anything may be prefixed with a \\ to prevent it from happening immediately

[command [args...]

do first:
    $(command)
    put %{-1}$(command) to replace $(command) with nothing
    %{0}$(command) gets replaced with the first word of the result
    %{do-first-index:} gets replaces with the result of a specific $(command)
    %{do-first-index:word-index} gets replaced with the word index of a specific $(cmd)
calc:
    $[calculation]
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
    {ruser[|fmt]}: generate a user
    {user}: mention yourself
    {channel}: The current channel
    {cmd}: the command
    {fhex|number}: convert a number from a base
    {hex|number}: convert a number to a base
    {rev|string}: reverse a string
    {c}: content used
    {rand[|item1|item2...]}: random item
    {time[|datetime format]}: time date format
    {channel[|format]}: channel
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
            if(opts['l']){
                let category = String(opts['l']) || "all"
                let catNum = -1
                switch(category.toLowerCase()){
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
                }
                let rv = ""
                for(let cmd in commands){
                    if(catNum == -1 || commands[cmd].category == catNum)
                        rv += `${cmd}: ${cmdCatToStr(commands[cmd].category)}\n`
                }
                return {content: rv}
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
                delete opts['n']
                let styles = fs.readFileSync("help-styles.css")
                let html = `<style>
${styles}
</style>`
                for(let command in commandsToUse){
                    html += generateHTMLFromCommandHelp(command, commands[command])
                }
                fs.writeFileSync("help.html", html)
            }
            if(!Object.keys(opts).length){
                opts['p'] = true
            }
            if(opts["p"] || opts['t']){
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
		//@ts-ignore
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
            if(fs.existsSync("output.txt")){
                let content = fs.readFileSync("output.txt", "utf-8")
                fs.rmSync('output.txt')
                return {
                    content: `\`\`\`\n${content}\n\`\`\``
                }
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
                "l": {
                    description: "List all commands<br>set this equal to a category to list commands in a specific category",
                },
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
        },
        category: CommandCategory.META

    },
    code: {
        run: async(msg: Message, args: ArgumentList) => {
            return {
                content: "https://github.com/euro20179/bircle"
            }
        },
        category: CommandCategory.META

    },
    WHITELIST: {
        run: async(msg: Message, args: ArgumentList) => {
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
        },
        help: {
            info: "Whitelist, or unwhitelist a user from a command<br>syntax: [WHITELIST @user (a|r) cmd"
        },
        category: CommandCategory.META

    },
    BLACKLIST: {
        run: async(msg: Message, args: ArgumentList) => {
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
                addToPermList(BLACKLIST, "blacklists", user, cmds)

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
        },
        help: {
            info: "Blacklist, or unblacklist a user from a command<br>syntax: [BLACKLIST @user (a|r) cmd"
        },
        category: CommandCategory.META

    },
    END: {
        run: async(msg: Message, args: ArgumentList) => {
            await msg.channel.send("STOPPING")
            client.destroy()
            return {
                content: "STOPPING"
            }
        },
        permCheck: (msg) => {
            return ADMINS.includes(msg.author.id)
        },
        category: CommandCategory.META

    },
    "last-run": {
        run: async(msg, args) => {
            let lastRun;
            let fmt = args.join(" ") || "%D days, %H hours, %M minutes, %S seconds, %i milliseconds ago"
            if(fs.existsSync("./command-results/last-run")){
                let data = fs.readFileSync("./command-results/last-run", "utf-8")
                console.log(data)
                lastRun = new Date()
                lastRun.setTime(Number(data))
            }
            else{
                lastRun = new Date(Date.now())
            }
            let diff = Date.now() - lastRun.getTime()
            let milliseconds = Math.floor(diff % 1000)
            let seconds = Math.floor(diff / 1000 % 60).toString().replace(/^(\d)$/,"0$1")
            let minutes = Math.floor((diff / (1000 * 60)) % 60).toString().replace(/^(\d)$/,"0$1")
            let hours = Math.floor((diff / (1000 * 60 * 60) % 24)).toString().replace(/^(\d)$/,"0$1")
            let days = Math.floor((diff / (1000 * 60 * 60 * 24) % 7)).toString().replace(/^(\d)$/,"0$1")
            fs.writeFileSync("./command-results/last-run", String(Date.now()))
            return {content: format(fmt, {T: lastRun.toString(), t: `${days}:${hours}:${minutes}:${seconds}.${milliseconds}`, H: hours, M: minutes, S: seconds, D: days, i: milliseconds, f: diff, d: diff / ( 1000 * 60 * 60 * 24), h: diff / (1000 * 60 * 60), m: diff / (1000 * 60), s: diff / 1000, hours: hours, minutes: minutes, seconds: seconds, millis: milliseconds, diff: diff, days: days, date: lastRun.toDateString(), time: lastRun.toTimeString()})}
        },
        help: {
            arguments: {
                fmt: {
                    description: "The format to show the time in"
                }
            },
            info: "Formats:<ul><li>%H: hours</li><li>%M: minutes</li><li>%S: seconds</li><li>%D: days</li><li>%i: milliseconds</li><li>%f: total milliseconds</li><li>%d: total days</li><li>%h: total hours</li><li>%m: total minutes</li><li>%s: total seconds</li><li>%T: The full time it was last run</li><li>%t: the time ago it was run</li> <li>{date}: the date it was last run</li><li>{time}: las time it was run</li></ul>"
        },
        category: CommandCategory.GAME

    },
    "rand-user": {
        run: async(msg: Message, args: ArgumentList) => {
            let opts;
            [opts, args] = getOpts(args)
            let member
            if(!opts['f'])
                member = (msg.channel as TextChannel).guild.members.cache.random()
            if(!member)
                member = (await (msg.channel as TextChannel).guild.members.fetch()).random()
            let fmt = args.join(" ") || "%u (%n)"
	    if(!member) return {content: "No member found"}
            let user = member?.user
	    if(!user) return {content: "No user found"}
            return {
                    content: format(fmt,
                                    {
					id:  user.id || "#!N/A",
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
                                        X: member.displayHexColor.toString() || "#!N/A",
                                        x: member.displayColor.toString() || "#!N/A",
                                        c: user.createdAt.toString() || "#!N/A",
                                        j: member.joinedAt?.toString() || "#!N/A",
                                        b: member.premiumSince?.toString() || "#!N/A"
                                    }
                    )
            }
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
    "role-info": {
        run: async(msg, args) => {
            let search = args.join(" ").toLowerCase()
            let roles = await msg.guild?.roles.fetch()
            if(!roles){
                return {content: "No roles found"}
            }
            let foundRoles = roles.filter(r => r.name.toLowerCase() == search ? true : false)
            if(!foundRoles){
                foundRoles = roles.filter(r => r.name.toLowerCase().match(search) ? true : false)
            }
            if(!foundRoles){
                foundRoles = roles.filter(r => r.id == search ? true : false)
            }

            let role = foundRoles.at(0)
            if(!role){
                return {content: "Could not find role"}
            }
            let embed = new MessageEmbed()
            embed.setTitle(role.name)
            embed.setColor(role.color)
            embed.addField("id", String(role.id), true)
            embed.addField("name", role.name, true)
            embed.addField("emoji", role.unicodeEmoji || "None", true)
            embed.addField("created", role.createdAt.toTimeString(), true)
            embed.addField("Days Old", String((Date.now() - (new Date(role.createdTimestamp)).getTime()) / (1000 * 60 * 60 * 24)), true)
            return {embeds: [embed] || "none"}
        },
        category: CommandCategory.UTIL
    },
    "channel-info": {
        run: async(msg, args) => {
            let channel
            if(!args.join(" ").trim().length)
            channel = msg.channel
            else channel = await fetchChannel(msg.guild, args.join(" ").trim())
            let pinned = await channel?.messages?.fetchPinned()
            let daysSinceCreation = (Date.now() - (new Date(channel.createdTimestamp)).getTime()) / (1000 * 60 * 60 * 24)
            let embed = new MessageEmbed()
            embed.setTitle(channel.name)
            if(pinned){
                let pinCount = pinned.size
                let daysTillFull = (daysSinceCreation / pinCount) * (50 - pinCount)
                embed.addField("Pin Count", String(pinCount), true)
                embed.addField("Days till full", String(daysTillFull), true)
            }
            embed.addField("Created", channel.createdAt.toString(), true)
            embed.addField("Days since Creation", String(daysSinceCreation), true)
            embed.addField("Id", channel.id.toString(), true)
            embed.addField("Type", channel.type, true)
            if(channel.topic){
                embed.addField("Topic", channel.topic, true)
            }
            if(channel.nsfw){
                embed.addField("NSFW?", channel.nsfw, true)
            }
            if(channel.position){
                embed.addField("Position", channel.position.toString(), true)
            }
            return {embeds: [embed]}
        },
        category: CommandCategory.UTIL
    },
    "user-info": {
        run: async(msg: Message, args: ArgumentList) => {
            if(!args[0]){
                return {
                    content: "no member given!"
                }
            }
            const member = await fetchUser(msg.guild, args[0])
            if(!member){
                return {
                    content: "member not found"
                }
            }
            const user = member.user
            if(args[1]){
                const fmt = args.slice(1).join(" ")
                return {
                    content: format(fmt
                                    .replaceAll("{id}", user.id || "#!N/A")
                                    .replaceAll("{username}", user.username || "#!N/A")
                                    .replaceAll("{nickname}", member.nickname || "#!N/A")
                                    .replaceAll("{0xcolor}", member.displayHexColor.toString() || "#!N/A")
                                    .replaceAll("{color}", member.displayColor.toString() || "#!N/A")
                                    .replaceAll("{created}", user.createdAt.toString() || "#!N/A")
                                    .replaceAll("{joined}", member.joinedAt.toString() || "#!N/A")
                                    .replaceAll("{boost}", member.premiumSince?.toString() || "#!N/A"),
                                    {
                                        i: user.id || "#!N/A",
                                        u: user.username || "#!N/A",
                                        n: member.nickname || "#!N/A",
                                        X: member.displayHexColor.toString() || "#!N/A",
                                        x: member.displayColor.toString() || "#!N/A",
                                        c: user.createdAt.toString() || "#!N/A",
                                        j: member.joinedAt.toString() || "#!N/A",
                                        b: member.premiumSince?.toString() || "#!N/A"
                                    }
                    )
                }
            }
            let embed = new MessageEmbed()
            embed.setColor(member.displayColor)
            embed.setThumbnail(user.avatarURL())
            embed.addField("Id", user.id || "#!N/A", true)
            embed.addField("Username", user.username || "#!N/A", true)
            embed.addField("Nickname", member.nickname || "#!N/A", true)
            embed.addField("0xColor", member.displayHexColor.toString() || "#!N/A", true)
            embed.addField("Color", member.displayColor.toString() || "#!N/A", true)
            embed.addField("Created at", user.createdAt.toString() || "#!N/A", true)
            embed.addField("Joined at", member.joinedAt.toString() || "#!N/A", true)
            embed.addField("Boosting since", member.premiumSince?.toString() || "#!N/A", true)
            return {
                embeds: [embed]
            }
        },
        help: {
            info: `[user-info &lt;user&gt; [format]<br>
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
</ul>`,
        },
        category: CommandCategory.UTIL

    },
    "rand-emote": {
        run: async(msg, args) => {
            let opts: Opts;
            [opts, args] = getOpts(args)
            let amount = parseInt(String(opts['count'] || opts['c'])) || 1
            let sep = opts['sep'] || opts['s'] || "\n"
            sep = String(sep)
            let send = ""
            let emojis = await msg.guild?.emojis.fetch()
            if(!emojis){
                return {content: "Could not find emojis"}
            }
            if(Boolean(opts['a'])){
                emojis = emojis.filter(e => e.animated ? true : false)

            }
            else if(Boolean(opts['A'])){
                emojis = emojis.filter(e => e.animated ? false : true)
            }
            else if(opts['f']){
                emojis = emojis.filter((e) => Boolean(safeEval(String(opts['f']), {id: e.id, animated: e.animated, url: e.url, createdAt: e.createdAt, createdTimeStamp: e.createdTimestamp, name: e.name, identifier: e.identifier}, {timeout: 1000})))
            }
            for(let i = 0; i < amount; i++){
                send += String(emojis.random())
                send += sep
            }
            return {content: send}
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
    "emote-use":{
        run: async(msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            let serverOnly = opts['S'] ? false : true
            let data = generateEmoteUseFile()
                        .split("\n")
                        .map(v => v.split(":"))
                        .filter(v => v[0])
            let newData: [string | GuildEmoji, string][] = []
            let cachedEmojis = await msg.guild?.emojis.fetch()
            for(let i = 0; i < data.length; i++){
                let emoji: string | GuildEmoji | undefined | null = data[i][0];
                try{
                    emoji =  cachedEmojis?.find((v) => v.id == data[i][0])
                }
                catch(err){
                    if(serverOnly) continue
                    emoji = data[i][0]
                }
                if(!emoji){
                    if(serverOnly) continue
                    emoji = data[i][0]
                }
                newData.push([emoji, data[i][1]])
            }
            let finalData = newData
                            .sort((a, b) => Number(a[1]) - Number(b[1]))
                            .reverse()
                            .map(v => `${v[0]}: ${v[1]}`)
                            .join("\n")
            return {content: finalData}
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
    "cmd-use": {
        run: async(_msg: Message, _args: ArgumentList) => {
            let data = generateCmdUseFile()
                        .split("\n")
                        .map(v => v.split(":")) //map into 2d array, idx[0] = cmd, idx[1] = times used
                        .filter(v => v[0] && ! isNaN(Number(v[1]))) // remove empty strings
			//@ts-ignore
                        .sort((a, b) => a[1] - b[1]) // sort from least to greatest
                        .reverse() //sort from greatest to least
                        .map(v => `${v[0]}: ${v[1]}`) //turn back from 2d array into array of strings
                        .join("\n")
            return {
                content: data
            }
        },
        category: CommandCategory.META

    },
    invite: {
        run: async(msg, args) => {
            let invites = await msg.guild?.invites.fetch()
            if(invites?.at(0)?.url){
                return {content: invites.at(0)?.url}
            }
            return {content: "No invite found"}
        },
        category: CommandCategory.UTIL
    },
    "non-assigned-roles": {
        run: async(msg, args) => {
            await msg.guild.members.fetch()
            let roles = await msg.guild?.roles.fetch()
            let rolesNonAssigned: any[] = []
            roles?.forEach(r => {
                if(r.members.size < 1)
                    rolesNonAssigned.push(r.name)
            })
            return {content: rolesNonAssigned.join("\n") + `\n${rolesNonAssigned.length} roles do not have any members`}
        },
        category: CommandCategory.UTIL
    },
    head: {
        run: async(msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            let count = parseInt(String(opts['count'])) || 10
            let argText = args.join(" ")
            return {content: argText.split("\n").slice(0, count).join("\n")}
        },
        help: {
            info: "Say the first 10 lines of some text",
            arguments: {
            text: {
                description: "Text"
            }
            },
            options: {
            count:{
                description: "The amount of lines to show"
            }
            }
        },
        category: CommandCategory.UTIL
    },
    grep: {
        run: async(msg: Message, args: ArgumentList) => {
            let regex = args[0]
            if(!regex){
                return {
                    content: "no search given"
                }
            }
            let data = args.slice(1).join(" ").trim()
            if(!data){
                if(msg.attachments?.at(0)){
                    data = downloadSync(msg.attachments?.at(0)?.attachment).toString()
                }
                else return {content: "no data given to search through"}
            }
            let match = data.matchAll(new RegExp(regex, "g"))
            let finds = ""
            for(let find of match){
                if(find[1]){
                    finds += `Found ${find.slice(1).join(", ")} at character ${(find?.index ?? 0) + 1}\n`
                }
                else {
                    finds += `Found ${find[0]} at character ${(find?.index ?? 0) + 1}\n`
                }
            }
            return {
                content: finds
            }
        },
        help: {
            "info": "search through text with a search",
            "arguments": {
                search: {
                    description: "a regular expression search",
                    required: true
                },
                data: {
                    description: "either a file, or text to search through",
                    required: true
                }
            }
        },
        category: CommandCategory.UTIL
    },
    alias: {
        run: async(msg: Message, args: ArgumentList) => {
            let cmd
            [cmd, ...args] = args
            let realCmd = args[0]
            args = args.slice(1)
            fs.appendFileSync("command-results/alias", `${msg.author.id}: ${cmd} ${realCmd} ${args.join(" ")};END\n`)
            aliases = createAliases()
            return {
                content: `Added \`${cmd}\` = \`${realCmd}\` \`${args.join(" ")}\``
            }
        },
        category: CommandCategory.META
    },
    "!!": {
        run: async(msg: Message, args: ArgumentList) => {
	    let opts;
	    [opts, args] = getOpts(args)
	    if(opts['check'] || opts['print'] || opts['see'])
		return {content: `\`${lastCommand.content}\``}
            if(!lastCommand){
                return {content: "You ignorance species, there have not been any commands run."}
            }
            return await doCmd(lastCommand, true) as CommandReturn
        },
        help: {
            info: "Run the last command that was run",
            options: {
            see: {
                description: "Just echo the last command that was run instead of running it"
            }
            }
        },
        category: CommandCategory.META
    },
    "psnipe": {
        run: async(msg, args) => {
            if(!purgeSnipe){
            return {content: "Nothing has been purged yet"}
            }
            let content = ""
            let files: CommandFile[] = []
            let embeds: MessageEmbed[] = []
            for(let m of purgeSnipe){
            if(m.content){
                content += `${m.author} says: \`\`\`${m.content}\`\`\`\n`
            }
            let mAttachments = m.attachments?.toJSON()
            if(mAttachments){
                files = files.concat(mAttachments as CommandFile[])
            }
            if(m.embeds){
                embeds = embeds.concat(m.embeds)
            }
            }
            return {content: content ? content : undefined, files: files, embeds: embeds}
        },
        help: {
            info: "Similar to snipe, but shows the messages deleted from commands such as !clear"
        },
        category: CommandCategory.FUN
    },
    snipe: {
        run: async(msg: Message, args: ArgumentList) => {
	    let snipeC = ((parseInt(args[0]) - 1) || 0)
	    if(snipeC >= 5){
		return {content: "it only goes back 5"}
	    }
	    if(snipeC > snipes.length){
		return {content: "Not that many messages have been deleted yet"}
	    }
	    if(!snipes.length){
		return {content: "Nothing has been deleted"}
	    }
	    let snipe = snipes[snipeC]
	    if(!snipe){
		return {content: "no snipe"}
	    }
	    let rv: CommandReturn = {deleteFiles: false, content: `${snipe.author} says:\`\`\`\n${snipe.content}\`\`\``}
	    let files = snipe.attachments?.toJSON()
	    if(files){
		rv["files"] = files as CommandFile[]
	    }
	    if(snipe.embeds){
		rv["embeds"] = snipe.embeds
	    }
            return rv
        },
        help: {
            info: "Give the most recently deleted message<br>It stores the 5 most recently deleted messages",
            arguments: {
            number: {
                description: "the message you want to see"
            }
            }
        },
        category: CommandCategory.FUN
    },
    ping: {
        run: async(msg, args) => {
            return {content: `${(new Date()).getMilliseconds() - msg.createdAt.getMilliseconds()}ms`}
        },
        category: CommandCategory.META
    },
    version: {
        run: async(msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            if(opts['l']){
            return {content: fs.readdirSync('changelog').map(v => v.replace(/\.md/, "")).join("\n")}
            }
            let fmt = args[0] || "%v"
            console.log(VERSION)
            let {major, minor, bug, part, alpha, beta} = VERSION
            let mainDisplay = (() => {
            let d = `${major}.${minor}.${bug}`
            if(part)
                d += `.${part}`
            if(alpha)
                d = `A.${d}`
            if(beta)
                d = `B.${d}`
            return d
            })()
            return {content: format(fmt, {
            v: mainDisplay,
            M: String(major),
            m: String(minor),
            b: String(bug),
            p: part,
            A: String(alpha),
            B: String(beta)
            })}
        },
        help: {
            info: "Says the version<br>formats:<br><ul><li>v: full version</li><li>M: major</li><li>m: minor</li><li>b: bug</li><li>A: alpha</li><li>B: beta</li></ul>",
            options: {
            l: {
                description: "List all versions"
            }
            }
        },
        category: CommandCategory.META
    },
    changelog: {
        run: async(msg, args) => {
            let  opts;
            [opts, args] = getOpts(args)
            if(opts['l']){
            return {content: fs.readdirSync('changelog').map(v => v.replace(/\.md/, "")).join("\n")}
            }
            let version = args[0]
            if(!args[0]){
            version = (() => {
                let d = `${VERSION.major}.${VERSION.minor}.${VERSION.bug}`
                if(VERSION.part)
                d += `.${VERSION.part}`
                if(VERSION.alpha)
                d = `A.${d}`
                if(VERSION.beta)
                d = `B.${d}`
                return d
            })()
            }
            if(!fs.existsSync(`changelog/${version}.md`)){
            return {content: `${version} does not exist`}
            }
            if(opts['f']){
            return {files: [{attachment: `changelog/${version}.md`, name: `${version}.md`, description: `Update: ${version}`}], deleteFiles: false}
            }
            return {content: fs.readFileSync(`changelog/${version}.md`, "utf-8")}
        },
        help: {
            info: "Get changelog for a version",
            options: {
            l: {
                description: "List all versions"
            },
            f: {
                description: "Get changelog file instead of text"
            }
            }
        },
        category: CommandCategory.META
    },
    spams: {
        run: async(msg, args) => {
            let data = ""
            for(let id in SPAMS){
            data += `${id}\n`
            }
            return {content: data || "No spams"}
        },
        category: CommandCategory.META
    }
}

function createAliases(){
    let a: {[key: string]: Array<string>} = {}
    let data = fs.readFileSync("command-results/alias", "utf-8")
    for (let cmd of data.split(';END')){
        if(!cmd.trim()) continue
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
let aliases = createAliases()

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

async function doCmd(msg: Message, returnJson=false){
    let command: string
    let args: Array<string>
    let doFirsts: {[item: number]: string}
    [command, args, doFirsts] = await parseCmd({msg: msg})
    let idxNo = 0;
    for(let idx in doFirsts){
        let oldContent = msg.content
        let cmd = doFirsts[idx]
        msg.content = cmd
        let data = getContentFromResult((await doCmd(msg, true) as CommandReturn)).trim()
        let splitData = data.split(" ")
        //replaces %{\d:} with the full result
        args = args.map((v) => v.replaceAll(`%{${idxNo}:}`, data))
        //replaces %{\d:\d} with the argno result
        args = args.map((v) => {
            return v.replaceAll(new RegExp(`%\\{${idxNo}:(\\d+)\\}`, "g"), (_fullMatch, index) => {
                return splitData[index]
            })
        })
        //@ts-ignore
        args[idx] = args[idx].replaceAll("%{}", data)
        args[idx] = args[idx].replaceAll("%{-1}", "__BIRCLE__UNDEFINED__")
        for(let m of args[idx].matchAll(/%\{(\d+)\}/g)){
            args[idx] = args[idx].replace(m[0], splitData[parseInt(m[1])])
        }
        msg.content = oldContent
        idxNo++
    }
    args = args.filter(v => v !== "__BIRCLE__UNDEFINED__")
    let canRun = true
    let exists = true
    let rv: CommandReturn;
    if(!commands[command]){
        rv = {content: `${command} does not exist`}
        exists = false
    }
    if(exists){
        if(commands[command].permCheck){
            canRun = commands[command].permCheck?.(msg) ?? true
        }
        if(WHITELIST[msg.author.id]?.includes(command)){
            canRun = true
        }
        if(BLACKLIST[msg.author.id]?.includes(command)){
            canRun = false
        }
        if(canRun){
            rv = await commands[command].run(msg, args)
            //if normal command, it counts as use
            addToCmdUse(command)
        }
        else rv = {content: "You do not have permissions to run this command"}
    }
    else if(aliases[command]){
        //if it's an alias, it counts as use
        addToCmdUse(command)
        let aliasPreArgs = aliases[command].slice(1);
        command = aliases[command][0]
        //finds the original command
        while(aliases[command]?.[0]){
            //for every expansion, it counts as a use
            addToCmdUse(command)
            aliasPreArgs = aliases[command].slice(1).concat(aliasPreArgs)
            command = aliases[command][0]
        }
        msg.content = `${prefix}${command} ${aliasPreArgs.join(" ")}`
        let oldC = msg.content
        msg.content = msg.content.replaceAll(/(?<!\\)\{args#\}/g, String(args.length))
        msg.content = msg.content.replaceAll(/(?<!\\)\{args(\d+)?\.\.\.\}/g, (...repl) => {
            let argStart = parseInt(repl[1])
            if(argStart){
                return args.slice(argStart - 1).join(" ")
            }
            else{
                return args.join(" ")
            }
        })
        msg.content = msg.content.replaceAll(/(?<!\\)\{arg(\d+)(..\d+)?\}/g, (...repl) => {
            let argNo = parseInt(repl[1])
            let argTo = parseInt(repl[2]?.replace(/\./g, ""))
            console.log(repl, argNo, argTo)
            if(argTo){
                return args.slice(argNo - 1, argTo).join(" ")
            }
            else{
                return args[argNo - 1]
            }
        })
        msg.content = msg.content.replaceAll("{sender}", String(msg.author))
        msg.content = msg.content.replaceAll("{sendername}", String(msg.author.username))
        msg.content = msg.content.replaceAll("{channel}", String(msg.channel))
        if(oldC == msg.content){
            msg.content = msg.content + ` ${args.join(" ")}`
        }
        rv = await doCmd(msg, true) as CommandReturn
    }
    else {
        rv = {content: `${command} does not exist`}
    }
    if(!illegalLastCmds.includes(command)){
        lastCommand = msg
    }
    if(returnJson){
        return rv;
    }
    if(!Object.keys(rv).length){
        return
    }
    if(rv.delete && msg.deletable){
        msg.delete().catch(err => console.log("Message not deleted"))
    }
    if(rv.noSend){
        return
    }
    if((rv.content?.length || 0) >= 2000){
        fs.writeFileSync("out", rv.content as string)
        delete rv["content"]
        if(rv.files){
            rv.files.push({attachment: "out", name: "cmd.txt", description: "command output too long"})
        } else{
            rv.files = [{
                attachment: "out", name: "cmd.txt", description: "command output too long"
            }]
        }
    }
    if(!rv.content)
        delete rv['content']
    else
	if(userVars[msg.author.id]){
	    userVars[msg.author.id][`_!`] = () => rv.content
	}
	else
	    userVars[msg.author.id] = {"_!": () => rv.content}
	vars[`_!`] = () => rv.content
    let location: any = msg.channel
    if(rv['dm']){
        location = msg.author
    }
    try{
        await location.send(rv)
    }
    catch(err){
        console.log(err)
        await location.send("broken")
    }
    if(rv.files){
        for(let file of rv.files){
            if(file.delete !== false && rv.deleteFiles)
                fs.rmSync(file.attachment)
        }
    }
}

client.on("guildMemberAdd", async(m) => {
    try{
        let role = await m.guild.roles.fetch("427570287232417793")
        if(role)
            m.roles.add(role)
    }
    catch(err){
        console.log(err)
    }
})

client.on('ready', async() => {

    client.guilds.fetch("427567510611820544").then(guild => {
        guild.members.fetch("334538784043696130").then(user => {
            user.createDM().then(dmChannel => {
                dmChannel.send("ONLINE").then(console.log).catch(console.log)
            }).catch(console.log)
        }).catch(console.log)
        if(prefix != 'd['){
            for(let member of ["334538784043696130"]){
                guild.members.fetch(member).then(user => {
                    user.createDM().then(dmChannel => {
                        dmChannel.send(`USERBOT ONLINE\nVERSION: ${VERSION.major}.${VERSION.minor}.${VERSION.bug}${VERSION.part ? "." + VERSION.part : ""}`).then(() => console.log(`sent to: ${member}`)).catch(console.log)
                    }).catch(console.log)
                }).catch(console.log)
            }
        }
    }).catch(console.log)
    console.log("ONLINE")
})

client.on("messageDelete", async(m) => {
    if(m.author?.id != client.user?.id){
	snipes.push(m)
	if(snipes.length > 5){
	    snipes = snipes.filter((_, i) => i != 0)
	}
    }
})

client.on("messageDeleteBulk", async(m) => {
    purgeSnipe = m.toJSON()
    if(purgeSnipe.length > 5)
	purgeSnipe.length = 5
})

client.on("messageCreate", async(m:  Message) => {
    let content = m.content
    if(!m.author.bot){
        for(let match of content.matchAll(/<a?:([^:]+):([\d]+)>/g)){
            addToEmoteUse(match[2])
        }
    }
    if(content == 'u!stop'){
        m.content = '[stop'
        content = m.content
    }
    if(content.slice(0, prefix.length) !== prefix){
        return
    }
    await doCmd(m)
})

client.on("interactionCreate", async(interaction: Interaction) => {
    if(interaction.isButton()){
	if(interaction.customId == `button:${interaction.member?.user.id}`){
	    //@ts-ignore
        if(typeof BUTTONS[interaction.member?.user.id] === "string"){
            //@ts-ignore
            interaction.reply(String(BUTTONS[interaction.member?.user.id]))
        }
        else{
            //@ts-ignore
            interaction.reply(String(BUTTONS[interaction.member?.user.id]()))
        }
	    //@ts-ignore
	    delete BUTTONS[interaction.member?.user.id]
	}
	if(interaction.customId.match(/button\.(rock|paper|scissors)/)){
	    let intendedUser = interaction.customId.split(":")[1]
	    let table: {[k: string]: string} = {"rock": "paper", "paper": "scissors", "scissors": "rock"}
	    if(interaction.user.id != intendedUser){
		interaction.reply({ephemeral: true, content: "You idiot, you already picked"})
		return
	    }
	    let oppChoice = interaction.customId.split(":")[0].split(".")[1]
	    let [userChoice, ogUser] = BUTTONS[interaction.customId].split(":")
	    if(userChoice == oppChoice){
		interaction.reply({content: "TIE"})
	    }
	    else if(table[userChoice] == oppChoice){
		interaction.reply({content: `<@${ogUser}> user wins!`})
	    }
	    else{
		interaction.reply({content: `<@${interaction.member?.user.id}> user wins!`})
	    }
	    for(let b in BUTTONS){
		if(b.match(/button\.(rock|paper|scissors)/)){
		    delete BUTTONS[b]
		}
	    }
	}
    }
    else if(interaction.isSelectMenu()){
	if(interaction.customId.includes("poll")){
	    let id = interaction.customId
	    let key = interaction.values[0]
	    if(POLLS[id]["votes"]){
		//checks if the user voted
		for(let key in POLLS[id]["votes"]){
		    if (POLLS[id]["votes"][key]?.length){
			if(POLLS[id]["votes"][key].includes(String(interaction.member?.user.id))){
			    return
			}
		    }
		}

		if(POLLS[id]["votes"][key])
		    POLLS[id]["votes"][key].push(String(interaction.member?.user.id))
		else
		    POLLS[id]["votes"][key] = [String(interaction.member?.user.id)]
	    }
	    else POLLS[id]["votes"] = {[id]: [String(interaction.member?.user.id)]}
	    let str = ""
	    for(let key in POLLS[id]["votes"]){
		str += `${key}: ${POLLS[id]["votes"][key].length}\n`
	    }
	    let dispId = id.slice(id.indexOf(":"))
	    if(interaction.message instanceof Message){
		if(str.length  > 1990 - POLLS[id]["title"].length){
		    let fn = generateFileName("poll-reply", interaction.member?.user.id)
		    fs.writeFileSync(fn, str)
		    await interaction.message.edit({files: [{attachment: fn}], content: dispId})
		    fs.rmSync(fn)
		}
		else {
		    interaction.message.edit({content: `**${POLLS[id]["title"]}**\npoll id: ${dispId}\n${str}`})
		    interaction.reply({content: `${interaction.values.toString()} is your vote`, ephemeral: true})
		}
	    }
	    else interaction.reply({content: interaction.values.toString(), ephemeral: true})
	}
    }
    else if(interaction.isCommand()){
        addToCmdUse(`/${interaction.commandName}`)
        if(interaction.commandName == 'attack'){
            let user = interaction.options.get("user")?.['value']
	    if(!user){
		await interaction.reply("NO USER GIVEN???")
	    }
            await interaction.reply(`Attacking ${user}...`)
            await interaction.channel?.send(`${user} has been attacked by <@${interaction.user.id}>`)
        }
        else if(interaction.commandName == 'ping'){
            let user = interaction.options.get("user")?.value || `<@${interaction.user.id}>`
            let times = interaction.options.get("evilness")?.value || 1
            interaction.reply("Pinging...")
            SPAM_ALLOWED = true
            for(let i = 0; i < times; i++){
                if(!SPAM_ALLOWED) break
                await interaction.channel?.send(`<@${user}> has been pinged`)
                await new Promise(res => setTimeout(res, Math.random() * 700 + 200))
            }
        }
        else if(interaction.commandName == 'img'){
	    //@ts-ignore
            let rv = await commands["img"].run(interaction, [interaction.options.get("width")?.value, interaction.options.get("height")?.value, interaction.options.get("color")?.value])
            await interaction.reply(rv)
            if(rv.files){
                for(let file of rv.files){
                    fs.rmSync(file.attachment)
                }
            }
        }
        else if(interaction.commandName == 'help'){
            await interaction.reply({
                content: "use `[help -n -plain`, slash commands r boring, so i will not support them that much\nbegrudgingly, here is the current help file",
                files: [{
                    attachment: './help.html',
                    name: "heres some help.html",
                    description: "lmao"
                }]
            })
        }
        else if(interaction.commandName == "alias"){
	    //@ts-ignore
            interaction.author = interaction.member?.user
            let arglist = [interaction.options.get("name")?.value, interaction.options.get("command")?.value].filter(v => String(v)) as string[]
            let args = interaction.options.get("text")?.value as string
            if(args){
                arglist = arglist.concat(args.split(" "))
            }
	    //@ts-ignore
            let rv = await commands['alias'].run(interaction, arglist)
            await interaction.reply(rv)
        }
	else if(interaction.commandName == 'poll'){
	    //@ts-ignore
	    interaction.author = interaction?.member.user
	    let argList = []
	    let title = interaction.options.get("title")?.value
	    let options = interaction.options.get("options")?.value as string
	    if(title){
		argList.push(`-title=${title}`)
	    }
	    argList.push(options)
	    //@ts-ignore
	    await commands['poll'].run(interaction, argList)
	}
	else if(interaction.commandName == 'ccmd'){
	    //@ts-ignore
            interaction.author = interaction.member?.user
            let arglist = [String(interaction.options.get("name")?.value), "say"] as string[]
            let args = interaction.options.get("text")?.value as string
            if(args){
                arglist = arglist.concat(args.split(" "))
            }
	    //@ts-ignore
            let rv = await commands['alias'].run(interaction, arglist)
            await interaction.reply(rv)
	}
	else if(interaction.commandName == 'rccmd'){
	    //@ts-ignore
	    interaction.author = interaction.member?.user
	    //@ts-ignore
	    let rv = await commands['rccmd'].run(interaction, [interaction.options.get("name")?.value])
	    await interaction.reply(rv)
	}
	else if(interaction.commandName == 'say'){
	    await interaction.reply(interaction.options.get("something")?.value as string | null || "How did we get here")
	}
	else if(interaction.commandName == "dad"){
	    //@ts-ignore
	    interaction.author = interaction.member?.user
	    //@ts-ignore
	    let rv = await commands['add'].run(interaction, ["distance", interaction.options.get("response")?.value])
	    await interaction.reply(rv)
	}
	else if(interaction.commandName == "add-8"){
	    //@ts-ignore
	    interaction.author = interaction.member?.user
	    let resp = interaction.options.get("response")?.value as string
	    //@ts-ignore
	    let rv = await commands['add'].run(interaction, ["8", resp])
	    await interaction.reply(rv)
	}
	else if(interaction.commandName == "add-wordle"){
	    //@ts-ignore
	    interaction.author = interaction.member?.user
	    let resp = interaction.options.get("word")?.value as string
	    if(resp.includes(" ")){
		await interaction.reply("no spaces")
		return
	    }
	    //@ts-ignore
	    let rv = await commands['add'].run(interaction, ["wordle", resp])
	    await interaction.reply(rv)
	}
	else if(interaction.commandName == 'rps'){
	    let opponent = interaction.options.get("opponent")?.value
	    let choice = interaction.options.get("choice")?.value as string
	    let rock = new MessageButton({customId: `button.rock:${opponent}`, label: "rock", style: "PRIMARY"})
	    let paper = new MessageButton({customId: `button.paper:${opponent}`, label: "paper", style: "PRIMARY"})
	    let scissors = new MessageButton({customId: `button.scissors:${opponent}`, label: "scissors", style: "PRIMARY"})
	    BUTTONS[`button.rock:${opponent}`] = `${choice}:${interaction.member?.user.id}`
	    BUTTONS[`button.paper:${opponent}`] = `${choice}:${interaction.member?.user.id}`
	    BUTTONS[`button.scissors:${opponent}`] = `${choice}:${interaction.member?.user.id}`
	    let row = new MessageActionRow({type: "BUTTON", components: [rock, paper, scissors]})
	    interaction.reply({components: [row], content: `<@${opponent}>, Rock, paper.... or scissors BUM BUM BUUUMMMM (idfk)`})
	}
	else if(interaction.commandName == "hangman"){
	    let caseSensitive = interaction.options.get("case")?.value
	    let lives = interaction.options.get("lives")?.value
	    let user = interaction.options.get("user")?.value
	    let cmdsArgs = []
	    if(caseSensitive){
		cmdsArgs.push("-case")
	    }
	    if(lives !== undefined){
		cmdsArgs.push(`-lives=${lives}`)
	    }
	    cmdsArgs.push(user)
	    //@ts-ignore
	    interaction.author = interaction.member.user
	    //@ts-ignore
	    let rv = await commands['hangman'].run(interaction, cmdsArgs)
	    await interaction.reply(rv)
	}
    }
    else if(interaction.isUserContextMenu()){
        addToCmdUse(`${interaction.commandName}:user`)
        if(interaction.commandName == 'ping'){
            interaction.reply(`<@${interaction.user.id}> has pinged <@${interaction.targetUser.id}> by right clicking them`)
        }
        else if(interaction.commandName == 'info'){
            const user = interaction.targetUser
            const member: GuildMember = interaction.targetMember as GuildMember
            let embed = new MessageEmbed()
            embed.setColor(member.displayColor)
	    if(user.avatarURL())
		//@ts-ignore
		embed.setThumbnail(user.avatarURL())
            embed.addField("Id", user.id || "#!N/A", true)
            embed.addField("Username", user.username || "#!N/A", true)
            embed.addField("Nickname", member?.nickname || "#!N/A", true)
            embed.addField("0xColor", member?.displayHexColor?.toString() || "#!N/A", true)
            embed.addField("Color", member?.displayColor?.toString() || "#!N/A", true)
            embed.addField("Created at", user.createdAt.toString() || "#!N/A", true)
            embed.addField("Joined at", member?.joinedAt?.toString() || "#!N/A", true)
            embed.addField("Boosting since", member?.premiumSince?.toString() || "#!N/A", true)
            interaction.reply({embeds: [embed]})
        }
    }
    else if(interaction.isMessageContextMenu()){
        addToCmdUse(`${interaction.commandName}:message`)
	if(interaction.commandName == 'fileify'){
	    let fn = generateFileName("fileify", interaction.member?.user.id)
	    fs.writeFileSync(fn, interaction.targetMessage.content)
	    interaction.reply({files: [{attachment: fn, description: "Your file, sir"}]})
	    fs.rmSync(fn)
	}
    }
})

function generateCmdUseFile(){
    let data = ""
    for(let cmd in CMDUSE){
        data += `${cmd}:${CMDUSE[cmd]}\n`
    }
    return data
}

function generateEmoteUseFile(){
    let data = ""
    for(let emote in EMOTEUSE){
        data += `${emote}:${EMOTEUSE[emote]}\n`
    }
    return data
}

function addToEmoteUse(emote: string){
    if(EMOTEUSE[emote]){
        EMOTEUSE[emote] += 1
    }
    else{
        EMOTEUSE[emote] = 1
    }
    fs.writeFileSync("emoteuse", generateEmoteUseFile())
}

function addToCmdUse(cmd: string){
    if(CMDUSE[cmd]){
        CMDUSE[cmd] += 1
    } else {
        CMDUSE[cmd] = 1
    }
    fs.writeFileSync("cmduse", generateCmdUseFile())
}

function loadCmdUse(){
    let cmduse: {[key: string]: number} = {}
    if(!fs.existsSync("cmduse")){
        return {}
    }
    let data = fs.readFileSync("cmduse", "utf-8")
   for(let line of data.split("\n")){
        if(!line) continue
        let [cmd, times] = line.split(":")
        cmduse[cmd] = parseInt(times)
    }
    return cmduse
}

function loadEmoteUse(){
    let emoteuse: {[key: string]: number} = {}
    if(!fs.existsSync("emoteuse")){
        return {}
    }
    let data = fs.readFileSync("emoteuse", "utf-8")
    for(let line of data.split("\n")){
        if(!line) continue
        let [emote, times] = line.split(":")
        emoteuse[emote] = parseInt(times)
    }
    return emoteuse
}

let CMDUSE = loadCmdUse()
let EMOTEUSE = loadEmoteUse()

client.login(token)
