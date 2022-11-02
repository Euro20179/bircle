import fs = require("fs")
import https = require('https')
import Stream = require('stream')
import sharp = require('sharp')
import fetch = require("node-fetch")
import cheerio = require('cheerio')

import ytdl = require("ytdl-core")

import canvas = require("canvas")

import { Worker, isMainThread, workerData } from "node:worker_threads"
import { execFile, execFileSync, spawnSync } from "child_process"
import { MessageOptions, MessageEmbed, Message, PartialMessage, GuildMember, ColorResolvable, TextChannel, MessageButton, MessageActionRow, MessageSelectMenu, GuildEmoji, User, MessagePayload, Guild, Role, RoleManager, EmbedFieldData } from 'discord.js'

import { AudioPlayer, AudioPlayerStatus, createAudioPlayer, createAudioResource, getVoiceConnection, joinVoiceChannel, NoSubscriberBehavior, VoiceConnection } from '@discordjs/voice'
import { execSync, exec } from 'child_process'
import globals = require("./globals")
import uno = require("./uno")
import battle = require("./battle")
import API = require("./api")
import economy = require("./economy")
import pet = require("./pets")
import user_options = require("./user-options")

import { getVar } from "./common"

import { prefix, vars, ADMINS, FILE_SHORTCUTS, WHITELIST, BLACKLIST, addToPermList, removeFromPermList, VERSION, client, setVar, saveVars } from './common'
const { parseCmd, parsePosition, parseAliasReplacement, parseDoFirst } = require('./parsing.js')
import { downloadSync, fetchUser, fetchChannel, format, generateFileName, createGradient, randomColor, rgbToHex, safeEval, mulStr, escapeShell, strlen, cmdCatToStr, getImgFromMsgAndOpts, getOpts, getContentFromResult, generateTextFromCommandHelp, generateHTMLFromCommandHelp, Pipe, getFonts, intoColorList, cycle } from './util'
import { choice, generateSafeEvalContextFromMessage } from "./util"
import { parentPort } from "worker_threads"
const { saveItems, INVENTORY, buyItem, ITEMS, hasItem, useItem, resetItems, resetPlayerItems, giveItem } = require("./shop.js")

export enum StatusCode{
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

export const illegalLastCmds = ["!!", "spam"]

function createAliases() {
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
function createChatCommandOption(type: number, name: string, description: string, { min, max, required }: { min?: number, max?: number | null, required?: boolean }) {
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

type ArgumentType = "str" | "num" | string

function createHelpArgument(description: string, required?: boolean, requires?: string) {
    return {
        description: description,
        required: required,
        requires: requires
    }
}

function createHelpOption(description: string, alternatives?: string[]) {
    return {
        description: description,
        alternatives: alternatives
    }
}

function createCommand(
    cb: (msg: Message, args: ArgumentList, sendCallback: (_data: MessageOptions | MessagePayload | string) => Promise<Message>, opts: Opts, deopedArgs: ArgumentList) => Promise<CommandReturn>,
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
        permCheck: permCheck
    }
}
let currently_playing: {link: string, filename: string} | undefined;
let connection: VoiceConnection | undefined;
let vc_queue: {link: string, filename: string}[] = []
const player = createAudioPlayer({
    behaviors: {
        noSubscriber: NoSubscriberBehavior.Pause
    }
})
async function play_link({link, filename}: {link: string, filename: string}){
    currently_playing = {link: link, filename: filename}
    let is_valid_url
    let fn = filename
    try{
        is_valid_url = ytdl.validateURL(link)
    }
    catch(err){
        let new_link = vc_queue.shift()
        if(new_link){
            play_link(new_link)
        }
        else{
            vc_queue = []
            connection?.destroy()
        }
        return
    }
    if(is_valid_url){
        let info = await ytdl.getInfo(link)
        if(info.videoDetails.isLiveContent || parseFloat(info.videoDetails.lengthSeconds) > 60 * 30){
            let new_link = vc_queue.shift()
            if(new_link){
                play_link(new_link)
            }
            else{
                vc_queue = []
                connection?.destroy()
            }
        }
        ytdl(link, {filter: "audioonly"}).pipe(fs.createWriteStream(fn)).on("close", () => {
            let resource = createAudioResource(fn)

            player.play(resource)
            connection?.subscribe(player)
        })
    }
    else{
        fetch.default(link).then(data => {
            data.buffer().then(value => {
                if(value.byteLength >= 1024 * 1024 * 20){
                    let new_link = vc_queue.shift()
                    if(new_link){
                        play_link(new_link)
                    }
                    else{
                        vc_queue = []
                        connection?.destroy()
                    }
                    return
                }
                fs.writeFile(fn, value, () => {
                    let resource = createAudioResource(fn)
                    player.play(resource)
                    connection?.subscribe(player)
                })
            })
        }).catch(err => {
            let new_link = vc_queue.shift()
            if(new_link){
                play_link(new_link)
            }
            else{
                vc_queue = []
                connection?.destroy()
            }
        })
    }
}
player.on(AudioPlayerStatus.Idle, (err) => {
    fs.rmSync(currently_playing?.filename as string)
    let new_link = vc_queue.shift()
    if(new_link){
        play_link(new_link)
    }
    else{
        vc_queue = []
        connection?.destroy()
    }

})


export const commands: { [command: string]: Command } = {

    'scorigami': createCommand(async(msg, _, sc, opts, args) => {
        let data
        try{
            data = await fetch.default('https://nflscorigami.com/data')
        }
        catch(err){
            return {content:  "Unable to fetch  scorigami", status: StatusCode.ERR}
        }
        let json = await data.json()
        let scores = json.matrix

        let less_than = 100000000000
        let greater_than = -1
        if(opts['total-lt']){
            less_than = Number(opts['total-lt'])
        }
        if(opts['total-gt']){
            greater_than = Number(opts['total-gt'])
        }

        if(!isNaN(Number(opts['count']))){
            let count = Number(opts['count'])
            let results: {data: any, score: [number, number]}[] = []
            for(let i = 0; i < scores.length; i++){
                let range = scores[i]
                for(let j = 0; j < range.length; j++){
                    if(scores[i][j].count === count && i + j < less_than && i + j > greater_than){
                        results.push({data: scores[i][j], score: [i, j]})
                    }
                }
            }
            let text = ""
            for(let i = 0; i < (parseInt(String(opts['result-count'])) || 1) && i < results.length; i++){
                text +=  results[Math.floor(Math.random() * results.length)].score.join(" to ") + '\n'
            }
            return {content: text, status:  StatusCode.RETURN}
        }

        let [score1_str, score2_str] = args
        let score1 = Number(score1_str)
        let score2 = Number(score2_str)
        if (score1 > score2){
            [score1, score2] = [score2, score1]
        }

        let score = scores[score1]?.[score2]
        if(!score){
            return {content: "Invalid score", status: StatusCode.ERR}
        }
        if(score.count === 0){
            let closestDistance = 10000
            let closestScore = ""
            for(let i = 0; i < scores.length; i++){
                let range = scores[i]
                for(let j = 0; j < range.length; j++){
                    if(scores[i][j].count === 0) continue;
                    let win_diff = Math.abs(scores[i][j].pts_win - score2)
                    let lose_diff = Math.abs(scores[i][j].pts_lose - score1)
                    if(win_diff + lose_diff < closestDistance){
                        closestDistance = win_diff + lose_diff
                        closestScore = `${scores[i][j].pts_win} - ${scores[i][j].pts_lose}`
                    }
                }
            }
            return {content: `SCORIGAMI!\nNearest score: ${closestScore} (${closestDistance} difference)`,  status: StatusCode.RETURN}
        }
        let first_time_embed = new MessageEmbed()
        first_time_embed.setTitle(`${score.first_team_away} @ ${score.first_team_home}`)
        first_time_embed.setDescription(`First time during ${(new Date(score.first_date)).toDateString()}`)
        first_time_embed.setFooter({text: score.first_link})
        let last_time_embed = new MessageEmbed()
        last_time_embed.setTitle(`${score.last_team_away} @ ${score.last_team_home}`)
        last_time_embed.setDescription(`Most recent during ${(new Date(score.last_date)).toDateString()}`)
        last_time_embed.setFooter({text: score.last_link})
        let info_embed =  new MessageEmbed()
        info_embed.setTitle(`Count:  ${score.count}`)
        let nfl_years  = (new Date()).getFullYear() - 1922
        let years_since_first = (new Date()).getFullYear() - (new Date(score.first_date)).getFullYear()
        let scores_per_year = score.count / nfl_years
        let scores_per_year_since_first = score.count / years_since_first
        let drought = new Date(Date.now() - (new Date(score.last_date)).getTime())
        let years = drought.getFullYear() - 1970
        console.log(drought)
        info_embed.addFields([
            {inline: true, name: "Times per year", value: String(scores_per_year)},
            {inline: true, name: "Times per year since first occurance", value: String(scores_per_year_since_first)},
            {inline: false,  name: "Drought", value: `${years} years`},
        ])

        return {embeds: [info_embed, first_time_embed, last_time_embed], status: StatusCode.RETURN}
    }, CommandCategory.FUN),

    'play': createCommand(async(msg, args) => {
        let link = args.join(" ")
        let attachment = msg.attachments.at(0)
        if(attachment){
            link = attachment.url
        }
        let voice_state = msg.member?.voice
        if(!voice_state?.channelId){
            return {content: "No voice", status: StatusCode.ERR}
        }
        connection = joinVoiceChannel({
            channelId: voice_state.channelId,
            guildId: msg.guildId as string,
            //dont unleash the beast that is this massive error message that doesn't even do anything
            //@ts-ignore
            adapterCreator: voice_state.guild.voiceAdapterCreator
        })

        vc_queue.push({link: link, filename: `${generateFileName("play", msg.author.id).replace(/\.txt$/, ".mp3").replaceAll(":", "_")}`})
        if(player.state.status === AudioPlayerStatus.Playing){
            return {content: `${link} added to queue`, status: StatusCode.RETURN}
        }
        play_link(vc_queue.shift() as {link: string, filename: string})
        return {content: `loading: ${link}`, status: StatusCode.RETURN}
    }, CommandCategory.VOICE),
    'queue': createCommand(async(msg, args) => {
        let embed = new MessageEmbed()
        embed.setTitle("queue")
        embed.setDescription(String(currently_playing?.link) || "None")
        return {content: vc_queue.map(v => v.link).join("\n"), embeds: [embed], status: StatusCode.RETURN}
    }, CommandCategory.VOICE),
    'next': createCommand(async(msg, args) =>  {
        let voice_state = msg.member?.voice
        if(!voice_state?.channelId){
            return {content: "No voice", status: StatusCode.ERR}
        }
        fs.rmSync(currently_playing?.filename as string)
        let new_link = vc_queue.shift()
        if(new_link){
            play_link(new_link)
        }
        else{
            vc_queue = []
            connection?.destroy()
        }
        return {content: "next", status: StatusCode.RETURN}
    }, CommandCategory.VOICE),
    'leave': createCommand(async(msg, args) => {
        vc_queue = []
        let voice_state = msg.member?.voice
        if(!voice_state?.channelId){
            return {content: "No voice", status: StatusCode.ERR}
        }
        let con = getVoiceConnection(voice_state.guild.id)
        if(con){
            vc_queue = []
            con.destroy()
            return {content: "Left vc", status: StatusCode.RETURN}
        }
        else{
            return {content: "Not in vc", status: StatusCode.ERR}
        }
    }, CommandCategory.VOICE),

    "count": createCommand(async (msg, args) => {
        if (msg.channel.id !== '468874244021813258') {
            return { content: "You are not in the counting channel", status: StatusCode.ERR}
        }
        let latestMessage = msg.channel.messages.cache.at(-2)
        if (!latestMessage) {
            return { noSend: true, delete: true, status: StatusCode.ERR }
        }
        let number = latestMessage.content.split(".")[1]
        if (!number) {
            return { noSend: true, delete: true, status: StatusCode.ERR }
        }
        let numeric = Number(number) + 1
        if (!numeric) {
            return { noSend: true, delete: true, status: StatusCode.ERR }
        }
        let count_text = args.join(" ").trim()
        if (!count_text) {
            count_text = user_options.getOpt(msg.author.id, "count-text", "{count}")
        }
        if (!count_text.match("{count}")) {
            count_text = "{count}"
        }
        count_text = count_text.replaceAll("{count}", `.${numeric}.`)
        if (count_text.startsWith(user_options.getOpt(msg.author.id, "prefix", prefix))) {
            msg.content = count_text
            let rv = await doCmd(msg, true)
            if (!rv) {
                return { delete: true, noSend: true, status: StatusCode.RETURN }
            }
            rv['delete'] = true
            return rv
        }
        return { content: count_text, delete: true, status: StatusCode.RETURN, do_change_cmd_user_expansion: false }
    }, CommandCategory.FUN),

    "is-alias": createCommand(async(msg, args) => {
        let res = []
        for(let cmd of args){
            if(commands[cmd] === undefined){
                res.push(true)
            }
            else{
                res.push(false)
            }
        }
        return {content: res.join(","), status: StatusCode.RETURN}
    }, CommandCategory.META, "Checks if a command is an alias"),

    "has-role": createCommand(async(msg, args) => {
        let user = args[0]
        let search = args.slice(1).join(" ")
        if(!search){
            return {content: "No role given",  status: StatusCode.ERR}
        }
        if(!user){
            return {content: "No user given",  status: StatusCode.ERR}
        }
        let roles = await msg.guild?.roles.fetch()
        if(!roles){
            return {content: "No roles",  status: StatusCode.ERR}
        }
        let foundRoles = roles.filter(r => r.name.toLowerCase() == search.toLowerCase() ? true : false)
        if (!foundRoles.size) {
            foundRoles = roles.filter(r => r.name.toLowerCase().includes(search.toLowerCase()) ? true : false)
        }
        if (!foundRoles.size) {
            foundRoles = roles.filter(r => r.id == search ? true : false)
        }

        let role = foundRoles?.at(0)
        if (!role) {
            return { content: "Could not find role",  status: StatusCode.ERR }
        }
        let member: GuildMember | undefined = await fetchUser(msg.guild as Guild, user)
        if(!member){
            return {content: "No member found",  status: StatusCode.ERR}
        }
        return {content: String(member.roles.cache.has(role.id)),  status: StatusCode.RETURN}
    }, CommandCategory.UTIL),

    "option": createCommand(async (msg, args) => {
        let [optname, ...value] = args
        if (!user_options.isValidOption(optname)) {
            return { content: `${optname} is not a valid option`, status: StatusCode.ERR }
        }
        if (value.length === 0) {
            user_options.unsetOpt(msg.author.id, optname)
            user_options.saveUserOptions()
            return { content: `<@${msg.author.id}> unset ${optname}`, status: StatusCode.RETURN}
        }
        else {
            let optVal = value.join(" ")
            user_options.setOpt(msg.author.id, optname, optVal)
            user_options.saveUserOptions()
            return { content: `<@${msg.author.id}> set ${optname}=${optVal}`, status: StatusCode.RETURN }
        }
    }, CommandCategory.META,
        "Sets a user option",
        {
            option: createHelpArgument("The option to set", true),
            value: createHelpArgument("The value to set the option to, if not given, option will be unset", false)
        },
        null,
        null,
        (m) => !m.author.bot),

    "UNSET": createCommand(async (msg, args) => {
        let [user, optname] = args
        if (!user_options.isValidOption(optname)) {
            return { content: `${optname} is not a valid option`, status: StatusCode.ERR }
        }
        //@ts-ignore
        let member = await fetchUser(msg.guild, user)
        if (!member)
            return { content: `${user} not found`, status: StatusCode.ERR }
        user_options.unsetOpt(member.id, optname)
        user_options.saveUserOptions()
        return { content: `<@${member.id}> unset ${optname}`, status:  StatusCode.RETURN }

    }, CommandCategory.META, "Lets me unset people's options :watching:", null, null, null, (m) => ADMINS.includes(m.author.id)),

    "options": createCommand(async (msg, _, __, opts, args) => {
        let user = msg.author.id
        if (opts['of']) {
            user = (await fetchUser(msg.guild as Guild, String(opts['of'])))?.id || msg.author.id
        }
        let userOpts = user_options.getUserOptions()[user]
        let optionToCheck = args.join(" ").toLowerCase()
        if (optionToCheck) {
            //@ts-ignore
            return { content: `**${optionToCheck}**\n${user_options.getOpt(user, optionToCheck, "\\_\\_unset\\_\\_")}`, status: StatusCode.RETURN, do_change_cmd_user_expansion: false }
        }
        let text = ""
        for (let opt of user_options.allowedOptions) {
            text += `**${opt}**\n${userOpts?.[opt] ?? "\\_\\_unset\\_\\_"}\n--------------------\n`
        }
        return { content: text, status: StatusCode.RETURN }
    }, CommandCategory.META, "Prints the options for [option, and your values for them",
        {
            "option": createHelpArgument("The option to check the value of", false)
        }),

    "img-diff": {
        run: async(msg, args) => {
            let [img1, img2] = args
            if(!img1 || !img2){
                return {content: "Must provide 2 image links", status: StatusCode.ERR}
            }
            let image1 = await canvas.loadImage(img1 as string)
            if(image1.width * image1.height > 1000000){
                return {content: "Image 1 is too large", status: StatusCode.ERR}
            }
            let canv = new canvas.Canvas(image1.width, image1.height)
            let ctx = canv.getContext("2d")
            ctx.drawImage(image1, 0, 0)
            let data1 = ctx.getImageData(0, 0, canv.width, canv.height)

            let image2 = await canvas.loadImage(img2 as string)
            canv = new canvas.Canvas(image1.width, image1.height)
            ctx = canv.getContext("2d")
            ctx.scale(image1.width / image2.width, image1.height / image2.height)
            ctx.drawImage(image2, 0, 0)
            let data2 = ctx.getImageData(0, 0, canv.width, canv.height)
            if(image2.width * image2.height > 1000000){
                return {content: "Image 2 is too large", status: StatusCode.ERR}
            }

            let diffData = data1.data.map((v, idx) =>{
                let mod = idx % 4 == 3
                //@ts-ignore
                return (mod * 255) + (Math.abs(v - (data2.data.at(idx) ?? v)) * (mod^1))
            })

            //console.log(diffData)
            ctx.putImageData(new canvas.ImageData(diffData, data1.width, data1.height), 0, 0)
            let fn = `${generateFileName("img-diff", msg.author.id)}.png`
            fs.writeFileSync(fn, canv.toBuffer())
            return {files: [
                {
                    attachment: fn,
                    name: fn,
                    delete: true
                }
            ],
            status: StatusCode.RETURN}
        }, category: CommandCategory.IMAGES
    },
    "picsum.photos": createCommand(async(msg, args) => {
        let opts;
        [opts, args] = getOpts(args)
        let width = parseInt(args[0]) || 100;
        let height = parseInt(args[1]) || 100;
        let data = await fetch.default(`https://picsum.photos/${width}/${height}`);
        if(data.status !== 200){
            return {content: `picsum returned a ${data.status} error`, status: StatusCode.ERR}
        }
        if(opts['url']){
            return {content: data.url, status: StatusCode.RETURN}
        }
        let png_fetch = await fetch.default(data.url)
        let png = await png_fetch.buffer()
        let fn = `${generateFileName("picsum.photos", msg.author.id)}.png`
        fs.writeFileSync(fn, png)
        return {files: [
            {
                attachment: fn,
                name: `Image(${width}x${height}).png`,
                description: `A random image with a width of ${width} and height of ${height}`,
                delete: true
            }
        ],
        status: StatusCode.RETURN}
    }, CommandCategory.IMAGES,
        "Gets an image from picsum.photos",
        {
            "width": createHelpArgument("The width of the image", false),
            "height": createHelpArgument("The height of the image", false, "width")
        },
        {
            "url": createHelpOption("Print the image url instead of giving back the image")
        }),
    'invert': {
        run: async(msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            let channel = args.map(v => v.toLowerCase())
            let above = parseInt(opts['above'] as string) || 0
            let below = parseInt(opts['below'] as string) || 255
            if(!channel.length){
                channel = ["red", "green", "blue"]
            }
            let img = getImgFromMsgAndOpts(opts, msg)
            let image = await canvas.loadImage(img as string)
            if(image.width * image.height > 1000000){
                return {content: "Image is too large", status: StatusCode.ERR}
            }
            let canv = new canvas.Canvas(image.width, image.height)
            let ctx = canv.getContext("2d")
            ctx.drawImage(image, 0, 0)
            let rgba_cycle = cycle(["red", "green", "blue", "alpha"])
            let data = ctx.getImageData(0, 0, canv.width, canv.height).data.map((v, idx) => {
                let cur_channel = rgba_cycle.next().value
                if(idx % 4 === 3)
                    return v
                if(channel.includes(cur_channel) && (v >= above && v <= below)){
                    return 255 - v
                }
                return v
            })
            ctx.putImageData(new canvas.ImageData(data, canv.width, canv.height), 0, 0)
            let fn = `${generateFileName("img-channel", msg.author.id)}.png`
            fs.writeFileSync(fn, canv.toBuffer())
            return  {files: [
                {
                    attachment: fn,
                    name: fn,
                    delete: true
                }
            ],
            status: StatusCode.RETURN}
        }, category: CommandCategory.IMAGES,
        help: {
            arguments: {
                channel: {
                    description: "The channel to invert, defaults to all",
                    required: false
                }
            },
            options: {
                "above": {
                    description: "Above what value to invert for the channel"
                },
                below: {
                    description: "Below what value to invert for the channel"
                }
            }
        }
    },
    "img-channel": {
        run: async(msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            let channel = args.map(v => v.toLowerCase())
            if(!channel.length){
                return {content: "No channel", status: StatusCode.ERR}
            }
            let img = getImgFromMsgAndOpts(opts, msg)
            let image = await canvas.loadImage(img as string)
            let canv = new canvas.Canvas(image.width, image.height)
            let ctx = canv.getContext("2d")
            ctx.drawImage(image, 0, 0)
            let rgba_cycle = cycle(["red", "green", "blue", "alpha"])
            let data = ctx.getImageData(0, 0, canv.width, canv.height).data.map((v, idx) => {
                let cur_channel = rgba_cycle.next().value
                if(idx % 4 === 3 && !channel.includes("alpha"))
                    return v
                if(channel.includes(cur_channel)){
                    return v
                }
                return 0
            })
            ctx.putImageData(new canvas.ImageData(data, canv.width, canv.height), 0, 0)
            let fn = `${generateFileName("img-channel", msg.author.id)}.png`
            fs.writeFileSync(fn, canv.toBuffer())
            return  {files: [
                {
                    attachment: fn,
                    name: fn,
                    delete: true
                }
            ], status: StatusCode.RETURN}
        }, category: CommandCategory.IMAGES
    },

    draw: createCommand(async(msg, args, sendCallback) => {
        let opts;
        [opts, args] = getOpts(args)
        let width = Pipe.start(opts['w']).default(500).next((v: any) => String(v)).done()
        let height = Pipe.start(opts['h']).default(500).next((v: any) => String(v)).done()
        let canv = new canvas.Canvas(width, height, "image")
        let ctx = canv.getContext('2d')
        ctx.textBaseline = 'top'
        function createColor(type: string, data: string[], m: Message){
            switch(type){
                // case "pattern": {
                //     let opts: {[key: string]: string} = {};
                //     if(data.join(" ").trim()){
                //         opts['img'] = data.join(" ").trim()
                //     }
                //     let img_url = getImgFromMsgAndOpts(opts, m)
                //     console.log(img_url)
                //     return {color: ctx.createPattern(img_url, "repeat")}
                // }
                case 'lgrad':
                case 'lgradient':
                case 'linear': {
                    let info = data.join(" ")
                    let coords = info.split("|")[0].split(" ").map((v: string) => v.trim())
                    let x1 = parsePosition(coords[0], canv.width)
                    let y1 = parsePosition(coords[1], canv.height)
                    let x2 = parsePosition(coords[2], canv.width)
                    let y2 = parsePosition(coords[3], canv.height)
                    const grad = ctx.createLinearGradient(x1, y1, x2, y2)
                    let colors = info.split("|").slice(1).join("|").replaceAll("|", ">").split(">").map((v: string) => v.trim())
                    for(let color of colors){
                        let [stop, ...c] = color.split(" ")
                        color = c.join(" ")
                        if(color === "rand"){
                            color = `#${randomColor().map(v => `0${v.toString(16)}`.slice(-2))}`
                        }
                        try{
                            grad.addColorStop(parseFloat(stop), color)
                        }
                        catch(err){
                            return {err:  `Could not add ${color} at stop point ${stop}`}
                        }
                    }
                    return {color: grad}
                }
                case 'rgrad':
                case 'rgradient':
                case 'radial': {
                    let info = data.join(" ")
                    let coords = info.split("|")[0].split(" ").map((v: string) => v.trim())
                    let x1 = parsePosition(coords[0], canv.width)
                    let y1 = parsePosition(coords[1], canv.height)
                    let r1 = parsePosition(coords[2], canv.width)
                    let x2 = parsePosition(coords[3], canv.width)
                    let y2 = parsePosition(coords[4], canv.height)
                    let r2 = parsePosition(coords[5], canv.width)
                    const grad = ctx.createRadialGradient(x1, y1, r1, x2, y2, r2)
                    let colors = info.split("|").slice(1).join("|").replaceAll("|", ">").split(">").map((v: string) => v.trim())
                    for(let color of colors){
                        let [stop, ...c] = color.split(" ")
                        color = c.join(" ")
                        if(color === "rand"){
                            color = `#${randomColor().map(v => `0${v.toString(16)}`.slice(-2))}`
                        }
                        try{
                            grad.addColorStop(parseFloat(stop), color)
                        }
                        catch(err){
                            return {err:  `Could not add ${color} at stop point ${stop}`}
                        }
                    }
                    return {color: grad}
                }
                case 'solid':{
                    return {color: data.join(" ")}
                }
                default:{
                    if(data.length){
                        return {color: type + data.join(" ")}
                    }
                    return {color: type}
                }
            }
        }
        draw_loop: while(true){
            let m;
            try{
                m = await msg.channel.awaitMessages({filter: m => m.author.id == msg.author.id, max: 1, time: 120000})
            }
            catch(err){
                let fn = `${generateFileName("draw", msg.author.id)}.png`
                fs.writeFileSync(fn, canv.toBuffer())
                return {files: [
                    {
                        attachment: fn,
                        name: fn,
                        delete: true
                    }
                ],
                status: StatusCode.RETURN}
            }
            let actionMessage = m.at(0)
            if(!actionMessage){
                break
            }
            let action = actionMessage.content.split(" ")[0]
            let args = actionMessage.content.split(" ").slice(1)
            switch(action){
                case "help": {
                    await handleSending(msg, {status: StatusCode.INFO, content: `
COLOR TYPES:
    #rgb
    #rrggbb
    #rrggbbaa
    rgb(r, g, b)
    rgba(r, g, b, a)
    hsl(h, s, l)
    hsla(h, s, l, a)
    <html color name>
    lgradient <x1> <y1> <x2> <y2> | <stop1> <css-color> > <stop2> <css-color2> > ...
        (<x1>, <y1>) is the start of the gradient, (<x2>, <y2>) is the end
        the stops must be a percentage 0-1
        css-color must be a basic css-color as listed above
    rgradient <x1> <y1> <r1> <x2> <y2> <r2> | <stop1> <css-color> > <stop2> <css-color2> > ...
        I honestly could not tell you how radial gradients work

COMMANDS:

**done**: end drawing
**no** <type>:
    set <type> back to default
    values for type:
        shadow
        color
        text-align
        text-baseline
        outline

**start-path** | **path** | **begin-path** | **begin-stroke** :
    begin a path

**end-path** | **stroke** | **end-stroke**:
    end a path

**fill** | **fill-stroke**:
    end a path and fill it

**goto** | **move-to** <x> <y>:
    change the current position to (<x>, <y>)
**image** <dx> <dy> [dw [dh [sx [sy [sw [sh]]]]]] | <image>:
    put the area: (<sx>, <sy>) through (<sx + sw>, <sy + sh>) <image> on the canvas at (<dx>, <dy>) with a width of (<dw>, <dh>)

**shadow** [xo [yo [blur [color]]]]:
    set shadowOffsetX to <xo> or 0
    set shadowOffsetY to <yo> or 0
    set shadowBlur to <blur> or 0
    set shadowColor to <color> or red

**shadow-color** <color>:
    set shadowColor to a basic css color

**shadow-x** <x>:
    set shadowOffsetY to <x>

**shadow-y** <y>:
    set shadowOffsetY to <y>

**shadow-blur** <blur>:
    set shadowBlur to <blur>

**outline** | **stroke** [color]:
    set the stroke style (outline color) to [color] or red
    see COLOR TYPES for types of colors

**outline-width** | **line-width** | **stroke-width** <width>:
    set the outline width to <width>

**outline-type** | **line-type** | **stroke-type** <style>:
    set the line type to <style>
    style can be:
        round
        bevel
        miter

**color** <color>:
    set the fill color to <color>
    see COLOR TYPES for types of colors

**font** [size]:
**font** [font]:
**font** [size] [font]:
    sets the font size to [size], and the font to [font]
    for a list of fonts, run ${prefix}api getFonts

**text-align** <alignment>:
    alignment can be:
        left
        right
        center
        start
        end

**text-baseline** [baseline]:
    sets the text baseline to [baseline] or top
    baseline can be:
        top
        hanging
        middle
        alphabet
        ideographic
        bottom

**stroke-text** | **stext** <x> <y> <text>:
    Put an outline of <text> at <x> <y>

**text** <x> <y> <text>:
    Put <text> at (<x>, <y>)

**box** <x> <y> <w> <h>:
    draw an outline of a box at (<x>, <y>) with a width of <w> and height of <h>

**rect** <x> <y> <w> <h>:
    put a rectangle at (<x>, <y>) with a width of <w> and height of <h>

**fill-screen** [color]:
    fill the screen with color
    see COLOR TYPES for types of colors

**orect** <x> <y> <w> <h>:
    put an outlined rectangle at (<x>, <y>) with a width of <w> and height of <h>

**rotate** <angle (degrees)>:
    rotate the canvas by <angle>

The commands below, only work after **path** has been run:

    **line-to** <x> <y>:
        draw a line starting from the current position, and going to (<x>, <y>)

    **arc** <x> <y> <r> [start-angle [end-angle]]:
        create an arc at (<x>, <y>) with radius <r>

`}, sendCallback)
                    continue;
                }
                case "done": {//{{{
                    break draw_loop
                }//}}}
                case "no": {//{{{
                    let type = args[0]
                    switch(type){
                        case "shadow-color":
                        case "shadow":{
                            ctx.shadowColor = "transparent"
                            break
                        }
                        case "color": {
                            ctx.fillStyle = "transparent"
                            break
                        }
                        case "text-align":{
                            ctx.textAlign = "start"
                            break
                        }
                        case "text-baseline":
                        case "baseline": {
                            ctx.textBaseline = "top"
                            break
                        }
                        case "outline": {
                            ctx.strokeStyle = "transparent"
                            break;
                        }
                    }
                    continue
                }//}}}
                case "start-path"://{{{
                case "path":
                case "begin-path":
                case "begin-stroke":{
                    ctx.beginPath()
                    continue
                }//}}}
                case "end-path"://{{{
                case "stroke":
                case "end-stroke":{
                    ctx.stroke()
                    break
                }//}}}
                case "fill"://{{{
                case "fill-stroke": {
                    ctx.fill()
                    break
                }//}}}
                case "line-to": {//{{{
                    let [str_x, str_y] = args
                    let x = parsePosition(str_x, canv.width)
                    let y = parsePosition(str_y, canv.height)
                    ctx.lineTo(x, y)
                    continue
                }//}}}
                case "goto"://{{{
                case "move-to": {
                    let [str_x, str_y] = args
                    let x = parsePosition(str_x, canv.width)
                    let y = parsePosition(str_y, canv.height)
                    ctx.moveTo(x, y)
                    continue
                }//}}}
                case "arc": {//{{{
                    let [str_x, str_y, str_r, str_sa, str_ea] = args
                    let r = parsePosition(str_r, canv.width / 2)
                    let x = parsePosition(str_x, canv.width, r)
                    let y = parsePosition(str_y, canv.height, r)
                    let start_angle = parseFloat(str_sa) || 0
                    let end_angle = parseFloat(str_ea) || 2 * Math.PI
                    ctx.arc(x, y, r, start_angle * (Math.PI / 180), end_angle)
                    continue
                }//}}}
                case "image": {//{{{{{{
                    let [args_str, image] = args.join(" ").split("|")
                    args = args_str.split(" ")
                    let [str_dx, str_dy, str_dw, str_dh, str_sx, str_sy, str_sw, str_sh] = args
                    let opts: any = {};
                    if(image?.trim()){
                        opts['img'] = image.trim()
                    }
                    image = getImgFromMsgAndOpts(opts, actionMessage) as string
                    let canv_img = await canvas.loadImage(image as string)
                    let dx = parsePosition(str_dx || "0", canv.width)
                    let dy = parsePosition(str_dy || "0", canv.height)
                    let dw = parsePosition(str_dw || `${canv.width}`, canv.width)
                    let dh = parsePosition(str_dh  || `${canv.height}`, canv.height)
                    let sx = parsePosition(str_sx || "0", canv_img.width)
                    let sy = parsePosition(str_sy || "0", canv_img.height)
                    let sw = parsePosition(str_sw || `${canv_img.width}`, canv_img.width)
                    let sh = parsePosition(str_sh || `${canv_img.height}`, canv_img.height)
                    ctx.drawImage(canv_img, sx, sy, sw, sh, dx, dy, dw, dh)
                    break

                }//}}}}}}
                case "shadow": {//{{{
                    let [str_xo, str_yo, str_blur, color] = args
                    ctx.shadowOffsetX = parseFloat(str_xo) || 0
                    ctx.shadowOffsetY = parseFloat(str_yo) || 0
                    ctx.shadowBlur = parseFloat(str_blur) || 0
                    ctx.shadowColor = color || "red"
                    continue
                }//}}}
                case "shadow-color": {//{{{
                    ctx.shadowColor = args.join(" ").trim()
                    continue
                }//}}}
                case "shadow-blur": {//{{{
                    ctx.shadowBlur = parseFloat(args.join(" "))
                    continue
                }//}}}
                case "shadow-x": {//{{{
                    ctx.shadowOffsetX = parseFloat(args.join(" "))
                    continue
                }
                case "shadow-y": {
                    ctx.shadowOffsetY = parseFloat(args.join(" "))
                    continue
                }//}}}
                case "stroke"://{{{
                case "outline": {
                    let type = args[0]
                    let {color, err} = createColor(type, args.slice(1), actionMessage)
                    if(err){
                        await handleSending(msg, {status: StatusCode.ERR, content: err}, sendCallback)
                    }
                    ctx.strokeStyle = color ?? "red"
                    continue
                }//}}}
                case "outline-width"://{{{
                case "line-width":
                case "stroke-width": {
                    ctx.lineWidth = parseFloat(args.join(" "))
                    continue
                }//}}}
                case "outline-type"://{{{
                case "line-type":
                case "stroke-type": {
                    ctx.lineJoin = args.join(" ")  as CanvasLineJoin
                    continue
                }//}}}
                case "color": {//{{{
                    let type = args[0]
                    let {color, err} = createColor(type, args.slice(1), actionMessage)
                    if(err){
                        await handleSending(msg, {content: err, status: StatusCode.ERR}, sendCallback)
                        continue
                    }
                    ctx.fillStyle = color ?? "red"
                    continue
                }//}}}
                case 'font': {//{{{
                    let [size, ...font] = args
                    let font_name = font.join(" ") || ctx.font.split(" ")[1].trim() || "serif"
                    let trueSize = parseFloat(size)
                    if (!trueSize){
                        font_name = size + font_name
                        trueSize = 50
                    }
                    ctx.font = `${trueSize}px ${font_name}`
                    continue
                }//}}}
                case 'text-align': {//{{{
                    ctx.textAlign = args.join(" ") as CanvasTextAlign
                    continue
                }//}}}
                case 'text-baseline': {//{{{
                    try{
                        //@ts-ignore
                        ctx.textBaseline = args.join(" ")
                    }
                    catch(err){
                        ctx.textBaseline = 'top'
                    }
                    continue
                }//}}}
                case 'stroke-text'://{{{
                case 'stext': {
                    let [strx, stry, ...text] = args
                    let textInfo = ctx.measureText(text.join(" "))
                    let font_size = parseFloat(ctx.font)
                    let [x, y] = [parsePosition(strx, canv.width, textInfo.width), parsePosition(stry, canv.height, font_size * (72/96) + textInfo.actualBoundingBoxDescent)]
                    ctx.strokeText(text.join(" ").replaceAll("\\n", "\n"), x, y )
                    break;
                }//}}}
                case 'text': {//{{{
                    let [strx, stry, ...text] = args
                    let textInfo = ctx.measureText(text.join(" "))
                    let font_size = parseFloat(ctx.font)
                    let [x, y] = [parsePosition(strx, canv.width, textInfo.width), parsePosition(stry, canv.height, font_size * (72/96) + textInfo.actualBoundingBoxDescent)]
                    ctx.fillText(text.join(" ").replaceAll("\\n", "\n"), x, y )
                    break;
                }//}}}
                case 'box':{//{{{
                    let [str_x, str_y, str_w, str_h] = args
                    if(!str_x) str_x = "0";
                    if(!str_y) str_y = "0";
                    if(!str_w) str_w = String(canv.width);
                    if(!str_h) str_h = String(canv.height);
                    let x, y, w, h
                    w = parsePosition(str_w, canv.width - ctx.lineWidth)
                    h = parsePosition(str_h, canv.width - ctx.lineWidth)
                    x = parsePosition(str_x, canv.width, w - ctx.lineWidth / 2)
                    y = parsePosition(str_y, canv.height, h - ctx.lineWidth / 2)
                    ctx.strokeRect(x, y, w, h)
                    break
                }//}}}
                case "fill-screen": {//{{{
                    let type = args[0]
                    if(type){
                        let {color, err} = createColor(type, args.slice(1), actionMessage)
                        if(err){
                            await handleSending(msg, {content: err, status: StatusCode.ERR}, sendCallback)
                            continue
                        }
                        ctx.fillStyle = color ?? "red"
                    }
                    ctx.fillRect(0, 0, canv.width, canv.height)
                    break
                }//}}}
                case "rect": {//{{{
                    let [str_x, str_y, str_w, str_h] = args
                    if(!str_x) str_x = "0";
                    if(!str_y) str_y = "0";
                    if(!str_w) str_w = String(canv.width);
                    if(!str_h) str_h = String(canv.height);
                    let x, y, w, h
                    w = parsePosition(str_w, canv.width)
                    h = parsePosition(str_h, canv.width)
                    x = parsePosition(str_x, canv.width, w)
                    y = parsePosition(str_y, canv.height, h)

                    ctx.fillRect(x, y, w, h)
                    break;
                }//}}}
                case "orect": {//{{{
                    let [str_x, str_y, str_w, str_h] = args
                    if(!str_x) str_x = "0";
                    if(!str_y) str_y = "0";
                    if(!str_w) str_w = String(canv.width);
                    if(!str_h) str_h = String(canv.height);
                    let x, y, w, h
                    w = parsePosition(str_w, canv.width - ctx.lineWidth)
                    h = parsePosition(str_h, canv.width - ctx.lineWidth)
                    x = parsePosition(str_x, canv.width, w - ctx.lineWidth / 2)
                    y = parsePosition(str_y, canv.height, h - ctx.lineWidth / 2)
                    ctx.strokeRect(x, y, w, h)
                    ctx.fillRect(x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth)
                    break
                }//}}}
                case 'rotate': {//{{{
                    let angle = parseFloat(args.join(" "))
                    ctx.rotate(angle)
                    break
                }//}}}
                default: continue
            }
            let fn = `${generateFileName("draw", msg.author.id)}.png`
            fs.writeFileSync(fn, canv.toBuffer())
            await handleSending(msg, {files: [
                {
                    attachment: fn,
                    name: fn,
                }
            ], status: StatusCode.INFO}, sendCallback)

                    
        }
        let fn = `${generateFileName("draw", msg.author.id)}.png`
        fs.writeFileSync(fn, canv.toBuffer())
        return {files: [
            {
                attachment: fn,
                name: fn,
                delete: true
            }
        ], status: StatusCode.RETURN}
    }, CommandCategory.IMAGES),
    "ed": createCommand(async (msg, args) => {
        if (globals.EDS[msg.author.id]) {
            return { content: "Ur already editing", status: StatusCode.ERR }
        }
        let opts: Opts;
        [opts, args] = getOpts(args)
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
                        console.log(rgx)
                    }
                    catch (err) {
                        handleSending(msg, {status: StatusCode.ERR, content: "? Invalid regex'" })
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
                    await handleSending(msg, {status: StatusCode.ERR, content: "?" })
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
            args = newArgs.split(" ")
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
                await handleSending(msg, {status: StatusCode.INFO, content: textToSend })
                return true
            },
            n: async (range, _args) => {
                commandLines = getLinesFromRange(range).map(v => v - 1)
                let textToSend = ""
                for (let line of commandLines) {
                    textToSend += `${String(line + 1)} ${text[line]}\n`
                }
                await handleSending(msg, {status: StatusCode.INFO, content: textToSend })
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
                    await handleSending(msg, {status: StatusCode.INFO, content: "? Invalid regex'" })
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
                        let oldContent = msg.content
                        setVar("__ed_line", textAtLine, msg.author.id)
                        msg.content = `${prefix}${args}`
                        let rv = await doCmd(msg, true)
                        msg.content = oldContent
                        let t = getContentFromResult(rv as CommandReturn).trim()
                        delete vars[msg.author.id]["__ed_line"]
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
    }, CommandCategory.UTIL
    ),

    "help": createCommand(async (_msg, args) => {
        let opts
        [opts, args] = getOpts(args)
        if (opts["g"]) {
            let text = fs.readFileSync("./help.txt", "utf-8")
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
            }
            let rv = ""
            for (let cmd in commands) {
                if (catNum == -1 || commands[cmd].category == catNum)
                    rv += `${cmd}: ${cmdCatToStr(commands[cmd].category)}\n`
            }
            return { content: rv, status: StatusCode.RETURN }
        }
        let commandsToUse = commands
        if (args[0]) {
            commandsToUse = {}
            if (args[0] == "?") {
                commandsToUse = commands
            }
            else {
                for (let cmd of args) {
                    if (!commands[cmd]) continue
                    commandsToUse[cmd] = commands[cmd]
                }
            }
        }
        if (opts['json']) {
            return { content: JSON.stringify(commandsToUse), status: StatusCode.RETURN }
        }
        let text = ""
        for (let command in commandsToUse) {
            text += generateTextFromCommandHelp(command, commandsToUse[command]) + "--------------------------------------\n"
        }
        return { content: text, status: StatusCode.RETURN }
    }, CommandCategory.UTIL,
        "Get help with specific commands",
        {
            commands: createHelpArgument("The commands to get help on, seperated by a space<br>If command is ?, it will do all commands", false)
        },
        {
            "g": createHelpOption("List the bot syntax")
        }
    ),

    "clear-logs": {
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
        permCheck: (m) => ADMINS.includes(m.author.id)
    },

    "stk": createCommand(async (msg, args, sendCallback) => {
        https.get(`https://www.google.com/search?q=${encodeURI(args.join(" "))}+stock`, resp => {
            let data = new Stream.Transform()
            resp.on("data", chunk => {
                data.push(chunk)
            })
            resp.on("end", async () => {
                let html = data.read().toString()
                let embed = new MessageEmbed()
                let stockData = html.match(/<div class="BNeawe iBp4i AP7Wnd">(.*?)<\/div>/)
                if (!stockData) {
                    await handleSending(msg, {status: StatusCode.ERR, content: "No data found"}, sendCallback)
                    return
                }
                stockData = stockData[0]
                let price = stockData.match(/>(\d+\.\d+)/)
                if (!price) {
                    await handleSending(msg, {status: StatusCode.ERR, content: "No price found"}, sendCallback)
                    return
                }
                price = price[1]
                let change = stockData.match(/(\+|-)(\d+\.\d+)/)
                if (!change) {
                    await handleSending(msg, {status: StatusCode.ERR, content: "No change found"}, sendCallback)
                    return
                }
                change = `${change[1]}${change[2]}`
                let numberchange = Number(change)
                let stockName = html.match(/<span class="r0bn4c rQMQod">([^a-z]+)<\/span>/)
                if (!stockName) {
                    await handleSending(msg, {status: StatusCode.ERR, content: "Could not get stock name"}, sendCallback)
                    return
                }
                stockName = stockName[1]
                if (numberchange > 0) {
                    embed.setColor("GREEN")
                }
                else {
                    embed.setColor("RED")
                }
                embed.setTitle(stockName)
                embed.addField("Price", price)
                embed.addField("Price change", change, true)
                await handleSending(msg, {status: StatusCode.RETURN,  embeds: [embed] }, sendCallback)
            })
        }).end()
        return { content: "Getting data", status: StatusCode.INFO }
    }, CommandCategory.UTIL,
        "Gets the stock symbol for a stock"
    ),

    stock: {
        run: async (msg, args, sendCallback) => {
            let opts: Opts;
            [opts, args] = getOpts(args)
            let fmt = String(opts['fmt'] || "{embed}")
            let stock = args.join(" ")
            if (!stock) {
                return { content: "Looks like u pulled a cam", status: StatusCode.ERR }
            }
            let data = await economy.getStockInformation(stock)
            if (!data) {
                return { content: "No  info found", status: StatusCode.ERR }
            }
            await handleSending(msg, {content: "Getting data", status: StatusCode.INFO}, sendCallback)
            if (fmt == "{embed}") {
                let embed = new MessageEmbed()
                let nChange = Number(data.change)
                let nPChange = Number(data["%change"]) * 100
                embed.setTitle(stock.toUpperCase().trim() || "N/A")
                embed.addField("price", String(data.price).trim() || "N/A", true)
                embed.addField("change", String(data.change).trim() || "N/A", true)
                embed.addField("%change", String(nPChange).trim() || "N/A", true)
                embed.addField("volume", data.volume?.trim() || "N/A")
                if (nChange < 0) {
                    embed.setColor("RED")
                }
                else if (nChange > 0) {
                    embed.setColor("#00ff00")
                }
                else {
                    embed.setColor("#ffff00")
                }
                return { embeds: [embed], status: StatusCode.RETURN }
            }
            else {
                return {
                    content: format(fmt, {
                        p: String(data.price).trim() || "0",
                        n: stock.toUpperCase().trim(),
                        c: String(data.change).trim() || "0",
                        C: String(data["%change"]).trim() || "0",
                        v: String(data.volume?.trim()) || "N/A"
                    }),
                    status: StatusCode.RETURN
                }
            }
        },
        category: CommandCategory.FUN,
        help: {
            info: "Get information about a stock symbol",
            options: {
                "fmt": {
                    description: "Specify the format<br><ul><li><b>%p</b>: price</li><li><b>%n</b>: stock name</li><li><b>%c</b>: $change</li><li><b>%C</b>: %change</li><li><b>%v</b>: volume<li><b>{embed}</b>: give an embed instead</li></ul>"
                }
            }
        }
    },

    'get-source': {
        run: async (_msg, args, sendCallback) => {
            let opts;
            [opts, args] = getOpts(args)
            if (opts['of-file']) {
                let file = opts['of-file']
                if (fs.existsSync(`./${file}.ts`)) {

                    return {
                        files: [
                            {
                                attachment: `./${file}.ts`,
                                delete: false,
                                name: `${file}.ts`,
                            }
                        ],
                        status: StatusCode.RETURN
                    }
                }
                return { content: `./${file}.ts not found`, status: StatusCode.ERR }
            }
            let cmd = args[0]

            if (!cmd) {
                return { content: "No cmd  chosen", status: StatusCode.ERR }
            }
            let command = Object.keys(commands).filter(v => v.toLowerCase() === cmd.toLowerCase())
            if (!command.length)
                return { content: "no command found", status: StatusCode.ERR }
            return { content: String(commands[command[0]].run), status: StatusCode.RETURN }
        }, category: CommandCategory.META,
        help: {
            info: "Get the source code of a file, or a command",
            arguments: {
                command: {
                    description: "The command to get the source code  of",
                    required: false
                }
            },
            options: {
                'of-file': {
                    description: "If command is not given, use this to get the source of a file"
                }
            }
        }
    },

    buy: {
        run: async (msg, args, sendCallback, _, _2, recursion) => {
            let allowedTypes = ["stock", "pet", "item"]
            let type = args[0]
            let item = args.slice(1).join(" ")
            if (!item) {
                return { content: "No item specified", status: StatusCode.ERR }
            }
            let amount = Number(args[args.length - 1])
            if (!isNaN(amount)) {
                item = item.split(" ").slice(0, -1).join(" ")
            }
            if (!allowedTypes.includes(type)) {
                //if is in format of old [buy <stock> <shares>
                if (Number(item) && !allowedTypes.includes(type)) {
                    await handleSending(msg, {content: `WARNING: <@${msg.author.id}>, this method for buying a stock is outdated, please use\n\`${prefix}buy stock <stockname> <shares>\` or \`${prefix}bstock <stockname> <shares>\`\ninstead`, status: StatusCode.WARNING}, sendCallback)
                    return await commands['bstock'].run(msg, args, sendCallback, {}, args, recursion)
                }
                //else
                return { content: `Usage: \`${prefix}buy <${allowedTypes.join("|")}> ...\``, status: StatusCode.ERR }
            }
            switch (type) {
                case "stock": {
                    if (!amount || amount < 0) {
                        return { content: `${amount} is an invalid amount`, status: StatusCode.ERR }
                    }
                    let data = await economy.getStockInformation(item)
                    if (data === false) {
                        return { content: `${item} does not exist`, status: StatusCode.ERR }
                    }
                    let realStock = economy.userHasStockSymbol(msg.author.id, item)
                    if (!economy.canBetAmount(msg.author.id, data.price * amount)) {
                        return { content: "You cannot afford this", status: StatusCode.ERR }
                    }
                    if (realStock) {
                        economy.buyStock(msg.author.id, realStock.name, amount, data.price)
                    }
                    else {
                        economy.buyStock(msg.author.id, item.toUpperCase(), amount, data.price)
                    }
                    return { content: `${msg.author} has bought ${amount} shares of ${item.toUpperCase()} for $${data.price * amount}`, status: StatusCode.RETURN }
                }
                case "pet": {
                    if (!item) {
                        return { content: "You didnt specify a pet", status: StatusCode.ERR }
                    }
                    let shopData = pet.getPetShop()
                    item = item.toLowerCase()
                    if (!shopData[item]) {
                        return { content: `${item}: not a valid pet`, status: StatusCode.ERR }
                    }
                    let petData = shopData[item]
                    let totalCost = 0
                    for (let cost of petData.cost) {
                        totalCost += economy.calculateAmountFromStringIncludingStocks(msg.author.id, cost)
                    }
                    if (!economy.canBetAmount(msg.author.id, totalCost)) {
                        return { content: "You do not have enough money to buy this pet", status: StatusCode.ERR }
                    }
                    if (pet.buyPet(msg.author.id, item)) {
                        return { content: `You have successfuly bought: ${item} for: $${totalCost}\nTo activate it run ${prefix}sapet ${item}`, status: StatusCode.RETURN }
                    }
                    return { content: "You already have this pet", status: StatusCode.ERR }
                }
                case "item": {
                    if (!amount)
                        amount = 1
                    if (msg.author.bot) {
                        return { content: "Bots cannot buy items", status: StatusCode.ERR }
                    }
                    if (!ITEMS()[item]) {
                        return { content: `${item} does not exist`, status: StatusCode.ERR }
                    }
                    let itemData = ITEMS()[item]
                    let totalSpent = 0
                    for (let i = 0; i < amount; i++) {
                        let totalCost = 0
                        let { total } = economy.economyLooseGrandTotal()
                        for (let cost of ITEMS()[item].cost) {
                            totalCost += economy.calculateAmountOfMoneyFromString(msg.author.id, total, `${cost}`)
                        }
                        if (economy.canBetAmount(msg.author.id, totalCost) || totalCost == 0) {
                            if (buyItem(msg.author.id, item)) {
                                economy.loseMoneyToBank(msg.author.id, totalCost)
                                totalSpent += totalCost
                            }
                            else {
                                return { content: `You already have the maximum of ${item}`, status: StatusCode.ERR }
                            }
                        }
                        else {
                            if (i > 0) {
                                return { content: `You ran out of money but bought ${i} item(s) for ${totalSpent}`, status: StatusCode.RETURN }
                            }
                            return { content: `This item is too expensive for u`, status: StatusCode.ERR  }
                        }
                    }
                    return { content: `You bought: ${amount} ${item}(s) for $${totalSpent}`, status: StatusCode.RETURN }
                }
            }
            return { noSend: true, status: StatusCode.RETURN }
        }, category: CommandCategory.ECONOMY,
        help: {
            info: "Buy stuff!",
            arguments: {
                shop: {
                    description: "can be either: <code>stock, pet, item</code>"
                },
                item: {
                    description: "What to buy from the  specified shop"
                },
                amount: {
                    description: "The  amount of items to buy from <q>shop</q>",
                    required: false
                }
            }
        }
    },

    "heist-info": {
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

    bstock: {
        run: async (msg, args, sendCallback) => {
            let stock = args[0]
            if (!stock) {
                return { content: "No stock given", status: StatusCode.ERR }
            }
            if (stock == prefix) {
                return { content: "nah ah ah", status: StatusCode.ERR }
            }
            stock = stock.toUpperCase()
            let amount = Number(args[1])
            if (!amount) {
                return { content: "No share count given", status: StatusCode.ERR }
            }
            if (amount < .1) {
                return { content: "You must buy at least 1/10 of a share", status: StatusCode.ERR }
            }
            economy.getStockInformation(stock, (data) => {
                if (data === false) {
                    handleSending(msg, { content: `${stock} does not exist`, status: StatusCode.ERR }, sendCallback)
                    return
                }
                let realStock = economy.userHasStockSymbol(msg.author.id, stock)
                if (!economy.canBetAmount(msg.author.id, data.price * amount)) {
                    handleSending(msg, { content: "You cannot afford this", status: StatusCode.ERR }, sendCallback)
                    return
                }
                if (realStock) {
                    economy.buyStock(msg.author.id, realStock.name, amount, data.price)
                }
                else {
                    economy.buyStock(msg.author.id, stock.toLowerCase(), amount, data.price)
                }
                handleSending(msg, { content: `${msg.author} has bought ${amount} shares of ${stock.toUpperCase()} for $${data.price * amount}`, status: StatusCode.RETURN }, sendCallback)
            }, () => {
                handleSending(msg, {content: `Failed to get stock data for: ${stock}`, status: StatusCode.ERR}, sendCallback)
            })
            return { noSend: true, status: StatusCode.RETURN }
        }, category: CommandCategory.ECONOMY,
        help: {
            info: `Buy a stock, this is the same as ${prefix}buy stock <symbol> <amount>`,
            arguments: {
                symbol: {
                    description: `The stock symbol to buy, if you do not know the symbol for a stock, use ${prefix}stk <search>`,
                    required: true
                },
                amount: {
                    description: "The amount of shares to buy of the stock",
                    required: true
                }
            }
        }
    },

    "ustock": {
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

    "stocks": {
        run: async (msg, args, sendCallback) => {
            let user = args[0]
            let member = msg.member
            if (user) {
                //@ts-ignore
                member = await fetchUser(msg.guild, user)
                if (!member) {
                    return { content: `${args[0]} not found`, status: StatusCode.ERR }
                }
            }
            if (!member) {
                return { content: ":weary:", status: StatusCode.ERR }
            }
            if (!economy.getEconomy()[member.id] || !economy.getEconomy()[member.id].stocks) {
                return { content: "You own no stocks", status: StatusCode.ERR }
            }
            let text = `<@${member.id}>\n`
            for (let stock in economy.getEconomy()[member.id].stocks) {
                //@ts-ignore
                let stockInfo = economy.getEconomy()[member.id].stocks[stock]
                text += `**${stock}**\nbuy price: ${stockInfo.buyPrice}\nshares: (${stockInfo.shares})\n-------------------------\n`
            }
            return { content: text || "No stocks", allowedMentions: { parse: [] }, status: StatusCode.RETURN }
        }, category: CommandCategory.ECONOMY,
        help: {
            info: "Get the stocks of a user",
            arguments: {
                user: {
                    description: "The user to check the stocks of",
                    required: false
                }
            }
        }
    },

    loan: {
        run: async (msg, _args, sendCallback) => {
            if (economy.getEconomy()[msg.author.id].loanUsed) {
                return { content: "U have not payed off your loan", status: StatusCode.ERR }
            }
            if (economy.getEconomy()[msg.author.id].money >= 0) {
                return { content: "Ur not in debt", status: StatusCode.ERR }
            }
            let top = Object.entries(economy.getEconomy()).sort((a, b) => a[1].money - b[1].money).reverse()[0]
            //@ts-ignore
            let max = top[1]?.money || 100
            let needed = Math.abs(economy.getEconomy()[msg.author.id].money) + 1
            if (needed > max) {
                needed = max
            }
            economy.addMoney(msg.author.id, needed)
            economy.useLoan(msg.author.id, needed)
            if (hasItem(msg.author.id, "loan")) {
                useItem(msg.author.id, "loan")
            }
            return { content: `<@${msg.author.id}> Used a loan and got ${needed}`, status: StatusCode.RETURN }
        }, category: CommandCategory.ECONOMY,
        help: {
            info: `Use a loan
<br>A loan can only be used if you have payed off previous loans, and you are in debt`
        }
    },

    work: {
        run: async (msg, _args, sendCallback) => {
            if (economy.canWork(msg.author.id)) {
                let amount = economy.work(msg.author.id)
                return { content: `You earned: ${amount}`, status: StatusCode.RETURN }
            }
            return { content: "No working for you bubs", status: StatusCode.ERR }
        }, category: CommandCategory.UTIL,
        help: {
            info: `Earn money (.1% of the economy) if your net worth is below 0`
        }
    },

    "pay-loan": {
        run: async (msg, args, sendCallback) => {
            let amount = args[0] || "all!"
            let nAmount = economy.calculateLoanAmountFromString(msg.author.id, amount) * 1.01
            if (!economy.getEconomy()[msg.author.id].loanUsed) {
                return { content: "You have no loans to pay off", status: StatusCode.ERR }
            }
            if (!economy.canBetAmount(msg.author.id, nAmount)) {
                return { content: "U do not have enough money to pay that back", status: StatusCode.ERR }
            }
            if (economy.payLoan(msg.author.id, nAmount)) {
                return { content: "You have fully payed off your loan", status: StatusCode.RETURN }
            }
            return { content: `You have payed off ${nAmount} of your loan and have ${economy.getEconomy()[msg.author.id].loanUsed} left`, status: StatusCode.RETURN }
        }, category: CommandCategory.ECONOMY
    },

    bitem: {
        run: async (msg, args, sendCallback) => {
            let opts;
            [opts, args] = getOpts(args)
            let count = Number(opts['count'] || opts['c'])
            if (!count) {
                count = Number(args[args.length - 1])
                if (count) {
                    args = args.slice(0, -1)
                }
                else {
                    count = 1
                }
            }
            let item = args.join(" ")
            if (!item) {
                return { content: "no item", status: StatusCode.ERR }
            }
            if (msg.author.bot) {
                return { content: "Bots cannot buy items", status: StatusCode.ERR }
            }
            if (!ITEMS()[item]) {
                return { content: `${item} does not exist`, status: StatusCode.ERR }
            }
            let totalSpent = 0
            for (let i = 0; i < count; i++) {
                let totalCost = 0
                let { total } = economy.economyLooseGrandTotal()
                for (let cost of ITEMS()[item].cost) {
                    totalCost += economy.calculateAmountOfMoneyFromString(msg.author.id, total, `${cost}`)
                }
                if (economy.canBetAmount(msg.author.id, totalCost) || totalCost == 0) {
                    if (buyItem(msg.author.id, item)) {
                        economy.loseMoneyToBank(msg.author.id, totalCost)
                        totalSpent += totalCost
                    }
                    else {
                        return { content: `You already have the maximum of ${item}`, status: StatusCode.ERR }
                    }
                }
                else {
                    if (i > 0) {
                        return { content: `You ran out of money but bought ${i} item(s) for ${totalSpent}`, status: StatusCode.RETURN }
                    }
                    return { content: `This item is too expensive for u`, status: StatusCode.ERR }
                }
            }
            return { content: `You bought: ${item} for $${totalSpent}`, status: StatusCode.RETURN }
        }, category: CommandCategory.ECONOMY
    },

    inventory: {
        run: async (msg, args, sendCallback) => {
            //@ts-ignore
            let user = await fetchUser(msg.guild, args[0] || msg.author.id)
            if (!user)
                return { content: `${args[0]}  not  found`, status: StatusCode.ERR }
            let e = new MessageEmbed()
            e.setTitle("ITEMS")
            let au = user.user.avatarURL()
            if (au)
                e.setThumbnail(au)
            for (let item in INVENTORY()[user.id]) {
                e.addField(item, `${INVENTORY()[user.id][item]}`)
            }
            return { embeds: [e], status: StatusCode.RETURN }
        }, category: CommandCategory.ECONOMY
    },

    "pet-shop": {
        run: async (msg, _args, sendCallback) => {
            let embed = new MessageEmbed()
            let shopData = pet.getPetShop()
            for (let pet in shopData) {
                let data = shopData[pet]
                let totalCost = 0
                for (let cost of data.cost) {
                    totalCost += economy.calculateAmountFromStringIncludingStocks(msg.author.id, cost)
                }
                embed.addField(`${pet}\n$${totalCost}`, `${data.description}`, true)
            }
            embed.setFooter({ text: `To buy a pet, do ${prefix}bpet <pet name>` })
            return { embeds: [embed], status: StatusCode.RETURN }
        }, category: CommandCategory.ECONOMY
    },

    'bpet': {
        run: async (msg, args, sendCallback) => {
            let requested_pet = args[0]
            if (!requested_pet) {
                return { content: "You didnt specify a pet", status: StatusCode.ERR }
            }
            let shopData = pet.getPetShop()
            requested_pet = requested_pet.toLowerCase()
            if (!shopData[requested_pet]) {
                return { content: `${requested_pet}: not a valid pet`, status: StatusCode.ERR }
            }
            let petData = shopData[requested_pet]
            let totalCost = 0
            for (let cost of petData.cost) {
                totalCost += economy.calculateAmountFromStringIncludingStocks(msg.author.id, cost)
            }
            if (!economy.canBetAmount(msg.author.id, totalCost)) {
                return { content: "You do not have enough money to buy this pet", status:  StatusCode.ERR }
            }
            if (pet.buyPet(msg.author.id, requested_pet)) {
                return { content: `You have successfuly bought: ${requested_pet} for: $${totalCost}`, status: StatusCode.RETURN }
            }
            return { content: "You already have this pet", status: StatusCode.ERR }
        }, category: CommandCategory.ECONOMY
    },

    "gapet": {
        run: async (msg, args, sendCallback) => {
            //@ts-ignore
            let user = await fetchUser(msg.guild, args[0] || msg.author.id)
            return { content: String(pet.getActivePet(user?.user.id || "")), status: StatusCode.RETURN }
        }, category: CommandCategory.UTIL
    },

    "sapet": {
        run: async (msg, args, sendCallback) => {
            let newActivePet = args[0]?.toLowerCase()
            if (!pet.hasPet(msg.author.id, newActivePet)) {
                return { content: `You do not have a ${newActivePet}`, status: StatusCode.ERR }
            }
            if (pet.setActivePet(msg.author.id, newActivePet)) {
                return { content: `Your new active pet is ${newActivePet}`, status: StatusCode.RETURN }
            }
            return { content: "Failed to set active pet", status: StatusCode.ERR }
        }, category: CommandCategory.UTIL
    },

    pets: {
        run: async (msg, args, sendCallback) => {
            //@ts-ignore
            let user = await fetchUser(msg.guild, args[0] || msg.author.id)
            if (!user)
                return { content: "User not found", status: StatusCode.ERR }
            let pets = pet.getUserPets(user.user.id)
            if (!pets) {
                return { content: `<@${user.user.id}> does not have pets`, allowedMentions: { parse: [] }, status: StatusCode.ERR }
            }
            let e = new MessageEmbed()
            e.setTitle(`${user.user.username}'s pets`)
            let activePet = pet.getActivePet(msg.author.id)
            e.setDescription(`active pet: ${activePet}`)
            for (let pet in pets) {
                e.addField(pet, `${pets[pet]} hunger`, true)
            }
            if (!activePet) {
                e.setFooter({ text: `To set an active pet run: ${prefix}sapet <pet name>` })
            }
            return { embeds: [e], status: StatusCode.RETURN }
        }, category: CommandCategory.ECONOMY
    },

    "feed-pet": {
        run: async (msg, args, sendCallback) => {
            let petName = args[0]?.toLowerCase()
            let item = args.slice(1).join(" ").toLowerCase()
            if (!pet.hasPet(msg.author.id, petName)) {
                return { content: `You do not  have a ${petName}`, status: StatusCode.ERR }
            }
            if (!hasItem(msg.author.id, item)) {
                return { content: `You do not have the item: ${item}`, status: StatusCode.ERR }
            }
            useItem(msg.author.id, item)
            let feedAmount = pet.feedPet(msg.author.id, petName, item)
            if (feedAmount) {
                return { content: `You fed ${petName} with a ${item} and  it got ${feedAmount} hunger back`, status: StatusCode.RETURN }
            }
            return { contnet: "The feeding was unsuccessful", status: StatusCode.ERR }
        }, category: CommandCategory.FUN,
        help: {
            info: "feed-peth <pet> <item>"
        }
    },

    shop: {
        run: async (msg, args, sendCallback) => {
            let opts;
            [opts, args] = getOpts(args)
            let items = fs.readFileSync("./shop.json", "utf-8")
            //@ts-ignore
            let user = await fetchUser(msg.guild, opts['as'] || msg.author.id)
            if (!user) {
                return { content: `${opts['as']} not found`,  status: StatusCode.ERR }
            }
            let userCheckingShop = user.user
            let itemJ = JSON.parse(items)
            let pages = []
            let i = 0
            let e = new MessageEmbed()
            let au = msg.author.avatarURL()
            if (au) {
                e.setThumbnail(au)
            }
            let userShopAu = userCheckingShop.avatarURL()
            if (userShopAu)
                e.setFooter({ text: `Viewing shop as: ${userCheckingShop.username}`, iconURL: userShopAu })
            else {
                e.setFooter({ text: `Viewing shop as: ${userCheckingShop.username}` })
            }
            let round = !opts['no-round']
            for (let item in itemJ) {
                i++;
                let totalCost = 0
                let { total } = economy.economyLooseGrandTotal()
                for (let cost of itemJ[item].cost) {
                    totalCost += economy.calculateAmountOfMoneyFromString(userCheckingShop.id, total, cost)
                }
                if (round) {
                    totalCost = Math.floor(totalCost * 100) / 100
                }
                e.addField(item.toUpperCase(), `**${totalCost == Infinity ? "puffle only" : `$${totalCost}`}**\n${itemJ[item].description}`, true)
                if (i % 25 == 0) {
                    pages.push(e)
                    e = new MessageEmbed()
                    if (au)
                        e.setThumbnail(au)
                    i = 0
                }
            }
            if (e.fields.length > 0) {
                pages.push(e)
            }
            return { embeds: pages, status: StatusCode.RETURN }
        }, category: CommandCategory.ECONOMY,
        help: {
            info: "List items in the shop",
            options: {
                "as": {
                    description: "View the shop as another user"
                }
            }
        }
    },

    profits: {
        run: async (msg, args, sendCallback) => {
            if (!economy.getEconomy()[msg.author.id] || !economy.getEconomy()[msg.author.id].stocks) {
                return { content: "You own no stocks", status: StatusCode.ERR }
            }
            let totalProfit = 0
            let totalDailiyProfit = 0
            let text = ""
            let totalValue = 0
            let promises = []
            let opts;
            [opts, args] = getOpts(args)
            let fmt = args.join(" ") || "%i"
            let ffmt = opts['ffmt'] || "%i\n%f"
            for (let stock in economy.getEconomy()[msg.author.id].stocks) {
                stock = stock.replace(/\(.*/, "").toUpperCase().trim()
                promises.push(economy.getStockInformation(stock))
            }
            try {
                let rPromises = await Promise.all(promises)
                for (let stockInfo of rPromises) {
                    if (!stockInfo) continue;

                    let userStockData = economy.userHasStockSymbol(msg.author.id, stockInfo.name)
                    if (!userStockData)
                        continue

                    let stockName = userStockData.name

                    let userStockInfo = economy.getEconomy()[msg.author.id].stocks?.[stockName]
                    if (!userStockInfo) continue;

                    let profit = (stockInfo.price - userStockInfo.buyPrice) * userStockInfo.shares
                    totalProfit += profit

                    let todaysProfit = (Number(stockInfo.change) * userStockInfo.shares)
                    totalDailiyProfit += todaysProfit

                    totalValue += stockInfo.price * userStockInfo.shares

                    text += format(fmt, {
                        i: `**${stockName}**\nPrice: ${stockInfo.price}\nChange: ${stockInfo.change}\nProfit: ${profit}\nTodays profit: ${todaysProfit}\n---------------------------\n`,
                        p: String(stockInfo.price),
                        c: String(stockInfo.change),
                        "+": String(profit),
                        "^": String(todaysProfit),
                        v: String(stockInfo.price * userStockInfo.shares),
                        n: stockInfo.name,
                        "internal-name": stockName,
                        div: "\n---------------------------\n"
                    })
                }
            }
            catch (err) {
                return { content: "Something went wrong", status: StatusCode.ERR }
            }
            return { content: format(String(ffmt), { i: text, f: `TOTAL TODAY: ${totalDailiyProfit}\nTOTAL PROFIT: ${totalProfit}\nTOTAL VALUE: ${totalValue}`, '^': String(totalDailiyProfit), '+': String(totalProfit), v: String(totalValue) }), status: StatusCode.RETURN }
        }, category: CommandCategory.ECONOMY
    },

    "surround-text": createCommand(async (msg, args, sendCB) => {
        let opts;
        [opts, args] = getOpts(args)
        let maxWidth = Number(opts['max-width']) || 50
        let vertChar = String(opts['vert-char'] || "|")
        let horChar = String(opts['hor-char'] || "-")
        let text = args.join(" ")
        let lines = [horChar.repeat(maxWidth + 2)]
        let currLine = ""
        for (let i = 1; i <= text.length; i++) {
            let ch = text[i - 1]
            currLine += ch
            if (i % maxWidth === 0) {
                lines.push(vertChar + currLine + vertChar)
                currLine = ""
            }
        }
        if (currLine) {
            lines.push(`${vertChar}${" ".repeat((maxWidth - currLine.length) / 2)}${currLine}${" ".repeat((maxWidth - currLine.length) / 2)}${vertChar}`)
        }
        lines.push(horChar.repeat(maxWidth + 2))
        return { content: `\`\`\`\n${lines.join("\n")}\n\`\`\``, status: StatusCode.RETURN }
    }, CommandCategory.UTIL, "Surrounds text with a character"),

    "align-table": {
        run: async (_msg, args, sendCallback) => {
            let opts;
            [opts, args] = getOpts(args)
            let align = opts['align'] || "left"
            let raw = opts['raw'] || false
            let columnCounts = opts['cc'] || false
            let table = args.join(" ")
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
                return { content: `\\${JSON.stringify(finalColumns)}`, status:  StatusCode.RETURN }
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
                return { content: text, status:  StatusCode.RETURN }
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
        }, category: CommandCategory.UTIL,
        help: {
            info: "Align a table",
            arguments: {
                table: {
                    description: "The markdown formatted table to align"
                }
            },
            options: {
                align: {
                    description: "Align either: <code>left</code>, <code>center</code> or <code>right</code>"
                },
                raw: {
                    description: "Give a javascript list containing lists of columns"
                },
                cc: {
                    description: "Give the length of the longest column in each column"
                }
            }
        }
    },

    "profit": {
        run: async (msg, args, sendCallback) => {
            if (!economy.getEconomy()[msg.author.id] || !economy.getEconomy()[msg.author.id].stocks) {
                return { content: "You own no stocks", status: StatusCode.ERR }
            }
            let stock = args[0]
            let fmt = args.slice(1).join(" ").trim() || "{embed}"
            if (!stock) {
                return { content: "No stock given", status: StatusCode.ERR }
            }
            let data = await economy.getStockInformation(stock)
            if (!data) {
                return { content: "No stock data found", status: StatusCode.ERR }
            }
            let embed = new MessageEmbed()
            let stockInfo = economy.userHasStockSymbol(msg.author.id, stock)
            if (!stockInfo) {
                return { content: "You do not have this stock", status: StatusCode.ERR }
            }
            let stockName = stockInfo.name
            let profit = (data.price - stockInfo.info.buyPrice) * stockInfo.info.shares
            let todaysProfit = (Number(data.change) * stockInfo.info.shares)
            embed.setTitle(stockName)
            embed.setThumbnail(msg.member?.user.avatarURL()?.toString() || "")
            if (profit > 0) {
                embed.setColor("GREEN")
            }
            else {
                embed.setColor("RED")
            }
            embed.addField("Price", String(data.price), true)
            embed.addField("Change", String(data.change) || "N/A", true)
            embed.addField("Change %", String(data["%change"]) || "N/A", true)
            embed.addField("Profit", String(profit), true)
            embed.addField("Today's Profit", String(todaysProfit), true)
            embed.addField("Value", String(data.price * stockInfo.info.shares))
            if (fmt == "{embed}") {
                return { embeds: [embed], status: StatusCode.ERR }
            }
            else {
                return {
                    content: format(fmt, {
                        p: String(data.price),
                        c: String(data.change),
                        C: String(data["%change"]),
                        P: String(profit),
                        T: String(todaysProfit),
                        v: String(data.price * stockInfo.info.shares)
                    }),
                    status: StatusCode.RETURN
                }
            }
        }, category: CommandCategory.ECONOMY
    },

    sell: {
        run: async (msg, args, sendCallback) => {
            if (!economy.getEconomy()[msg.author.id] || !economy.getEconomy()[msg.author.id].stocks) {
                return { content: "You own no stocks", status: StatusCode.ERR }
            }
            let stock = args[0]
            if (!stock)
                return { content: "no stock given", status: StatusCode.ERR }
            if (stock == prefix) {
                return { "content": "Looks like ur pulling a tool", status: StatusCode.ERR }
            }
            stock = stock.toUpperCase()
            let amount = args[1]
            let data
            try {
                //@ts-ignore
                data = await fetch.default(`https://finance.yahoo.com/quote/${encodeURI(args[0])}`)
            }
            catch (err) {
                return { content: "Could not fetch data", status: StatusCode.ERR }
            }
            let text = await data.text()
            if (!text) {
                return { content: "No data found", status: StatusCode.ERR }
            }
            let stockData = text.matchAll(new RegExp(`data-symbol="${args[0].toUpperCase().trim().replace("^", ".")}"([^>]+)>`, "g"))
            let jsonStockInfo: { [key: string]: string } = {}
            //sample: {"regularMarketPrice":"52.6","regularMarketChange":"-1.1000023","regularMarketChangePercent":"-0.020484215","regularMarketVolume":"459,223"}
            for (let stockInfo of stockData) {
                if (!stockInfo[1]) continue;
                let field = stockInfo[1].match(/data-field="([^"]+)"/)
                let value = stockInfo[1].match(/value="([^"]+)"/)
                if (!value || !field) continue
                jsonStockInfo[field[1]] = value[1]
            }
            if (Object.keys(jsonStockInfo).length < 1) {
                return { content: "This does not appear to be a stock", status: StatusCode.ERR }
            }
            let nPrice = Number(jsonStockInfo["regularMarketPrice"])
            let realStockInfo = economy.userHasStockSymbol(msg.author.id, stock)
            let stockName = stock
            if (realStockInfo)
                stockName = realStockInfo.name
            if (!economy.getEconomy()[msg.author.id].stocks?.[stockName]) {
                return { content: "You do not own this stock", status: StatusCode.ERR }
            }
            else {
                //@ts-ignore
                let stockInfo = economy.getEconomy()[msg.author.id].stocks[stockName]
                let sellAmount = economy.calculateStockAmountFromString(msg.author.id, stockInfo.shares, amount)
                if (!sellAmount || sellAmount <= 0) {
                    return { content: "You must sell a number of shares of your stock", status: StatusCode.ERR }
                }
                if (sellAmount > stockInfo.shares) {
                    return { content: "YOu do not own that many shares", status: StatusCode.ERR }
                }
                if (sellAmount <= 0) {
                    return { content: "Must sell more than 0", status: StatusCode.ERR }
                }
                let profit = (nPrice - stockInfo.buyPrice) * sellAmount
                economy.sellStock(msg.author.id, stockName, sellAmount, nPrice)
                economy.addMoney(msg.author.id, profit)
                return { content: `You sold: ${stockName} and made $${profit} in total`, status: StatusCode.RETURN }
            }
        }, category: CommandCategory.ECONOMY
    },

    battle: {
        run: async (msg, args, sendCallback) => {
            return battle.battle(msg, args)
        }, category: CommandCategory.GAME,
        help: {
            info: `<h1>A BATTLE SIMULATOR</h1>
            <br>Rules:<br>
            <ul>
                <li>
                    Every 4 seconds a random message will be sent dealing damage, or giving health to random players
                </li>
                <li>
                    An item can only be used every 8 seconds<br>
                    Lose 5 hp if you use an item on cooldown (can kill you)
                </li>
            </ul>
            <br>Bonuses:<br>
            <ul>
                <li>
                    If the winner has 100+ hp, they get $1 for every hp they had above 100
                </li>
                <li>
                    The person who uses the most items gets the item bonus and wins $(most items used - 2nd most items used)
                </li>
            </ul>
            <br>Items:<br>
            <ul>
                <li>
                    <b>heal</b>: gain randomly 1-20 hp (cost: $0.1 + 1%)
                </li>
                <li>
                    <b>anger toolbox</b>: reduce everyone's health by 0.1% (cost: $3)
                </li>
                <li>
                    <b>anger euro</b>: say STOPPING (cost: $3)
                </li>
                <li>
                    <b>blowtorch*</b>: deal randomly 1-20 hp to all other players (cost: $1 + 1%)
                </li>
                <li>
                    <b>double bet</b>: Double your bet (cost: 1%)
                </li>
                <li>
                    <b>swap*</b>: Swap health with a random player (cost (3 * player count)%)
                </li>
                <li>
                    <b>double</b>: Double the damage of the next game attack (cost: $2 + 5%)
                </li>
                <li>
                    <b>triple</b>: Triple the damage of the next game attack (cost: $3 + 10%)
                </li>
                <li>
                    <b>blue shll</b>: Deal 50 damage to the player with the most health (if they have more than 50 health) (cost: $0.5 + 2%)
                </li>
                    <b>shield</b>: Block the next game attack (cost: $0.5 + 0.3%)
                </li>
                <li>
                    <b>mumbo</b>: Add a dummy player. When he dies lose 0.5%, If he wins, you get half of the pool (cost: $1)
                </li>
                <li>
                    <b>suicide*</b>: Deal randomly 2-10 damage to yourself (cost: $1 + 0.1%)
                </li>
            </ul>
            <p>*Cannot kill players, they will remain in the negatives until a game message targets them</p>
            `,
            arguments: {
                "bet": {
                    description: "Your bet (must be at minimum 0.2%)"
                },
                "pool type": {
                    description: "The type of pool, can be winnter take all (wta) or distribute (where when someone dies, their money gets distributed)"
                }
            },
            options: {
                "no-items": {
                    description: "Disable items"
                }
            }
        }
    },

    abattle: {
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

    ticket: {
        run: async (msg, args, sendCallback) => {
            let opts;
            [opts, args] = getOpts(args)
            let round = !opts['no-round']
            let amount = economy.calculateAmountFromString(msg.author.id, args[0], { min: (t: number, _a: string) => t * 0.005 })
            let numbers = args.slice(1, 4)
            if (!amount) {
                return { content: "No amount given", status: StatusCode.ERR }
            }
            if (!economy.canBetAmount(msg.author.id, amount)) {
                return { content: "You do not have enough money for this", status: StatusCode.ERR }
            }
            if (amount / economy.getEconomy()[msg.author.id].money < 0.005) {
                return { content: "You must bet at least 0.5%", status: StatusCode.ERR }
            }
            let ticket = economy.buyLotteryTicket(msg.author.id, amount)
            if (!ticket) {
                return { content: "Could not buy ticket", status: StatusCode.ERR }
            }
            if (numbers && numbers.length == 1) {
                ticket = numbers[0].split("").map(v => Number(v))
            }
            else if (numbers && numbers.length == 3) {
                ticket = numbers.map(v => Number(v))
            }
            let answer = economy.getLottery()
            let e = new MessageEmbed()
            if (round) {
                amount = Math.floor(amount * 100) / 100
            }
            e.setFooter({ text: `Cost: ${amount}` })
            if (JSON.stringify(ticket) == JSON.stringify(answer.numbers)) {
                let userFormat = user_options.getOpt(msg.author.id, "lottery-win", "__default__")
                let winningAmount = answer.pool * 2 + economy.calculateAmountOfMoneyFromString(msg.author.id, economy.economyLooseGrandTotal().total, "0.2%")
                economy.addMoney(msg.author.id, winningAmount)
                economy.newLottery()
                if (userFormat !== "__default__") {
                    return { content: format(userFormat, { numbers: ticket.join(" "), amount: String(winningAmount) }), recurse: true, status: StatusCode.RETURN, do_change_cmd_user_expansion: false }
                }
                e.setTitle("WINNER!!!")
                e.setColor("GREEN")
                e.setDescription(`<@${msg.author.id}> BOUGHT THE WINNING TICKET! ${ticket.join(" ")}, AND WON **${winningAmount}**`)
            }
            else {
                e.setColor("RED")
                e.setTitle(["Nope", "Loser"][Math.floor(Math.random() * 2)])
                e.setDescription(`<@${msg.author.id}> bought the ticket: ${ticket.join(" ")}, for $${amount} and didnt win`)
            }
            return { embeds: [e], status: StatusCode.RETURN }
        }, category: CommandCategory.GAME,
        help: {
            info: "Buy a lottery ticket",
            arguments: {
                "amount": {
                    description: "The amount to pay for the ticket (minimum of 0.5% of your money)",
                },
                "numbers": {
                    description: "The numbers to buy seperated by spaces"
                }
            }
        }
    },

    lottery: {
        run: async (msg, _args, sendCallback) => {
            return { content: `The lottery pool is: ${economy.getLottery().pool * 2 + economy.calculateAmountOfMoneyFromString(msg.author.id, economy.economyLooseGrandTotal().total, "0.2%")}`, status: StatusCode.RETURN }
        }, category: CommandCategory.FUN
    },

    calcet: {
        run: async (msg, args, sendCallback) => {
            let opts;
            [opts, args] = getOpts(args)
            let fmt = String(opts['fmt'] || "Money: %m\nStocks: %s\nLoans: %l\n---------------------\nGRAND TOTAL: %t")
            let reqAmount = args.join(" ") || "all!"
            let { money, stocks, loan, total } = economy.economyLooseGrandTotal()
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

    calcm: {
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
        }, category: CommandCategory.UTIL
    },

    calcl: {
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
        }, category: CommandCategory.UTIL
    },

    calcms: {
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
            let amount = economy.calculateAmountFromStringIncludingStocks(String(as), args.join(" ").trim())
            if (dollarSign === true) {
                return { content: `${amount}`, status: StatusCode.RETURN }
            }
            return { content: `${dollarSign}${amount}`, status: StatusCode.RETURN }
        }, category: CommandCategory.UTIL
    },

    "calcam": {
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
        }, category: CommandCategory.UTIL
    },

    nw: createCommand(async (msg, args) => {
        let user;

        if (!args.join(" ")) {
            user = msg.member
        }
        else {
            //@ts-ignore
            user = await fetchUser(msg.guild, args.join(" "))
        }
        //@ts-ignore
        if (!user) user = msg.member
        if (!user) return { content: "No user found", status: StatusCode.ERR }
        let amount = economy.playerLooseNetWorth(user.id)
        let money_format = user_options.getOpt(user.id, "money-format", "**{user}**\n${amount}")
        return { content: format(money_format, { user: user.user.username, amount: String(amount), ramount: String(Math.floor(amount * 100) / 100) }), recurse: generateDefaultRecurseBans(), status: StatusCode.RETURN, do_change_cmd_user_expansion: false }
    }, CommandCategory.ECONOMY),

    money: createCommand(async (msg, args) => {
        let opts;
        [opts, args] = getOpts(args)
        let user = msg.member
        if (args.join(" "))
            //@ts-ignore
            user = await fetchUser(msg.guild, args.join(" "))
        if (!user)
            user = msg.member
        if (!user) {
            return { content: "How are you not a member?", status: StatusCode.ERR }
        }
        let money_format = user_options.getOpt(user.id, "money-format", "{user}\n${amount}")
        let text = ""
        if (economy.getEconomy()[user.id]) {
            if (opts['m']) {
                text += `${economy.getEconomy()[user.id].money}\n`
            }
            if (opts['l']) {
                text += `${economy.getEconomy()[user.id].lastTalk}\n`
            }
            if (opts['t']) {
                text += `${economy.getEconomy()[user.id].lastTaxed}\n`
            }
            if (opts['nw']) {
                text += `${economy.playerLooseNetWorth(user.id)}\n`
            }
            if (text) {
                return { content: text, status: StatusCode.RETURN }
            }
            if (opts['no-round']) {
                return { content: format(money_format, { user: user.user.username, amount: String(economy.getEconomy()[user.id].money) }), recurse: generateDefaultRecurseBans(), allowedMentions: { parse: [] }, status: StatusCode.RETURN, do_change_cmd_user_expansion: false }
            }
            return { content: format(money_format, { user: user.user.username, amount: String(Math.round(economy.getEconomy()[user.id].money * 100) / 100) }), recurse: generateDefaultRecurseBans(), allowedMentions: { parse: [] }, status: StatusCode.RETURN, do_change_cmd_user_expansion: false }
        }
        return { content: "none", status: StatusCode.RETURN }
    }, CommandCategory.ECONOMY,
        "Get the money of a user",
        {
            "user": createHelpArgument("The user to get the money of", false)
        },
        {
            "m": createHelpOption("Show money only"),
            "l": createHelpOption("Show the last time they got money from talking"),
            "t": createHelpOption("Show the  last time they got taxed"),
            "nw": createHelpOption("Get the raw networth of a player"),
            "no-round": createHelpOption("No rounding"),
        }
    ),

    give: {
        run: async (msg, args, sendCallback) => {
            let [amount, ...user] = args
            let userSearch = user.join(" ")
            if (!userSearch) {
                return { content: "No user to search for", status: StatusCode.ERR }
            }
            //@ts-ignore
            let member = await fetchUser(msg.guild, userSearch)
            if (!member)
                return { content: `${userSearch} not found`, status: StatusCode.ERR }
            let realAmount = economy.calculateAmountFromString(msg.author.id, amount)
            if (!realAmount) {
                return { content: "Nothing to give", status: StatusCode.ERR }
            }
            if (realAmount < 0) {
                return { content: "What are you trying to pull <:Watching1:697677860336304178>", status: StatusCode.ERR }
            }
            if(economy.getEconomy()[member.id] ===  undefined){
                return {content: `${member.id} is not in the economy`, status: StatusCode.ERR}
            }
            if (economy.canBetAmount(msg.author.id, realAmount) && !member.user.bot) {
                economy.loseMoneyToPlayer(msg.author.id, realAmount, member.id)
                return { content: `You gave ${realAmount} to ${member.user.username}`, status: StatusCode.RETURN }
            }
            else {
                return { content: `You cannot give away ${realAmount}`, status: StatusCode.ERR }
            }
        }, category: CommandCategory.ECONOMY
    },

    "give-stock": createCommand(async (msg, args) => {
        let stock = args[0]
        let a = args[1]
        let sn = stock
        let userStockData = economy.userHasStockSymbol(msg.author.id, sn)
        if (!userStockData) {
            return { content: "You do not own that stock", status: StatusCode.ERR }
        }
        let amount = economy.calculateStockAmountFromString(msg.author.id, userStockData.info.shares, a) as number
        if (amount <= 0) {
            return { content: `Invalid share count`, status: StatusCode.ERR }
        }
        if (amount > userStockData.info.shares) {
            return { content: "You dont have that many shares", status: StatusCode.ERR }
        }
        let player = args.slice(2).join(" ")
        //@ts-ignore
        let member = await fetchUser(msg.guild, player)
        if (!member) {
            return { content: `Member: ${player} not found`, status: StatusCode.ERR }
        }
        if (!economy.getEconomy()[member.id]) {
            return { content: "Cannot give stocks to this player" , status: StatusCode.ERR}
        }
        userStockData.info.shares -= amount
        //let otherStockInfo = economy.getEconomy()[member.id]?.stocks?.[stockName] || {}
        let otherStockInfo = economy.userHasStockSymbol(member.id, sn)
        if (!otherStockInfo) {
            otherStockInfo = {
                name: sn, info: {
                    buyPrice: userStockData.info.buyPrice,
                    shares: amount
                }
            }
        }
        else {
            let oldShareCount = otherStockInfo.info.shares
            let newShareCount = otherStockInfo.info.shares + amount
            otherStockInfo.info.buyPrice = (otherStockInfo.info.buyPrice * (oldShareCount / newShareCount)) + (userStockData.info.buyPrice * (amount / newShareCount))
            otherStockInfo.info.shares += amount
        }
        //@ts-ignore
        //economy.giveStock(member.id, stockName, otherStockInfo.buyPrice, otherStockInfo.shares)
        economy.setUserStockSymbol(msg.author.id, sn, userStockData)
        economy.setUserStockSymbol(member.id, sn, otherStockInfo)
        if (userStockData.info.shares == 0) {
            economy.removeStock(msg.author.id, sn)
        }
        return { content: `<@${msg.author.id}> gave ${member} ${amount} shares of ${sn}`, allowedMentions: { parse: [] } , status: StatusCode.RETURN}
    }, CommandCategory.ECONOMY,
        "Give a stock to a user",
        {
            stock: createHelpArgument("The stock to give"),
            shares: createHelpArgument("The amount of shares to give"),
            user: createHelpArgument("The user to give the shares to"),
        }
    ),

    "give-item": {
        run: async (msg, args, sendCallback) => {
            let [i, user] = args.join(" ").split("|").map(v => v.trim())
            if (!user) {
                return { content: `Improper  command usage, \`${prefix}give-item <count> <item> | <user>\``, status: StatusCode.ERR }
            }
            let [count, ...item] = i.split(" ")
            let itemstr = item.join(" ")
            if (!itemstr) {
                return { content: `Improper  command usage, \`${prefix}give-item <count> <item> | <user>\``, status: StatusCode.ERR }
            }
            //@ts-ignore
            let member = await fetchUser(msg.guild, user)
            if (!member) {
                return { content: `${user} not found`, status: StatusCode.ERR }
            }
            let itemData = hasItem(msg.author.id, itemstr.toLowerCase())
            if (!itemData) {
                return { content: `You do not have ${itemstr.toLowerCase()}`, status: StatusCode.ERR }
            }
            let countnum = Math.floor(economy.calculateAmountOfMoneyFromString(msg.author.id, itemData, count))
            if (countnum <= 0 || countnum > itemData.count) {
                return { content: `You only have ${itemData.count} of ${itemstr.toLowerCase()}`, status: StatusCode.ERR }
            }
            giveItem(member.id, itemstr.toLowerCase(), countnum)
            useItem(msg.author.id, itemstr.toLowerCase(), countnum)
            return { content: `<@${msg.author.id}> gave <@${member.id}> ${countnum} of ${itemstr.toLowerCase()}`, allowedMentions: { parse: [] }, status: StatusCode.RETURN }

        }, category: CommandCategory.ECONOMY,
    },

    tax: createCommand(async (msg, args, sendCallback) => {
        if (msg.author.bot) {
            return { content: "Bots cannot steal", status: StatusCode.ERR }
        }
        let opts;
        [opts, args] = getOpts(args)
        if (!args.length) {
            await handleSending(msg, { content: "No user specified, erasing balance", status: StatusCode.INFO }, sendCallback)
            await new Promise(res => setTimeout(res, 1000))
            return { content: "Balance erased", status: StatusCode.RETURN }
        }
        //@ts-ignore
        let user = await fetchUser(msg.guild, args.join(" "))
        if (!user)
            return { content: `${args.join(" ")} not found`, status: StatusCode.ERR }
        if (user.user.bot) {
            return { content: "Looks like ur taxing a fake person", status: StatusCode.ERR }
        }
        let ct = economy.canTax(user.id)
        if (hasItem(user.id, "tax evasion")) {
            ct = economy.canTax(user.id, INVENTORY()[user.id]['tax evasion'] * 30)
        }
        let embed = new MessageEmbed()
        if (ct) {
            embed.setTitle("Taxation Time")
            let userBeingTaxed = user.id
            let userGainingMoney = msg.author.id
            let taxAmount;
            let reflected = false
            let max = Infinity
            if (hasItem(userBeingTaxed, "tax shield")) {
                max = economy.getEconomy()[userBeingTaxed].money
            }
            taxAmount = economy.taxPlayer(userBeingTaxed, max)
            if (taxAmount.amount == max) {
                useItem(userBeingTaxed, "tax shield")
            }
            economy.addMoney(userGainingMoney, taxAmount.amount)
            if (opts['no-round'])
                embed.setDescription(`<@${userBeingTaxed}> has been taxed for ${taxAmount.amount} (${taxAmount.percent}% of their money)`)
            else
                embed.setDescription(`<@${userBeingTaxed}> has been taxed for ${Math.round(taxAmount.amount * 100) / 100} (${Math.round(taxAmount.percent * 10000) / 100}% of their money)`)
            if (reflected) {
                return { content: "REFLECTED", embeds: [embed], status: StatusCode.RETURN }
            }
        }
        else if (economy.playerEconomyLooseTotal(msg.author.id) - (economy.getEconomy()[msg.author.id]?.loanUsed || 0) > 0) {
            embed.setTitle("REVERSE Taxation time")
            let amount = economy.calculateAmountFromStringIncludingStocks(msg.author.id, ".1%")
            embed.setDescription(`<@${user.user.id}> cannot be taxed yet, you are forced to give them: ${amount}`)
            economy.loseMoneyToPlayer(msg.author.id, amount, user.user.id)
        }
        else {
            embed.setTitle("TAX FAILURE")
            embed.setDescription(`<@${user.user.id}> cannot be taxed yet`)
        }
        return { embeds: [embed], status: StatusCode.RETURN }
    }, CommandCategory.ECONOMY,
        "Tax someone evily",
        {
            "no-round": createHelpOption("Dont round numbers"),
        }
    ),

    aheist: createCommand(async (msg, args, sendCallback) => {
        let opts;
        [opts, args] = getOpts(args)
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
            "if": createHelpOption("Specify a condition in the form of >x, <x or =x, where x is the total amount of money gained/lost from heist<br>This response will only happen if the total amount of money is >, <, or = to x"),
        }
    ),

    heist: createCommand(async (msg, args, sendCallback) => {
        let opts: Opts;
        [opts, args] = getOpts(args)
        if (globals.HEIST_PLAYERS.includes(msg.author.id)) {
            return { content: "U dingus u are already in the game", status: StatusCode.ERR }
        }
        if ((economy.getEconomy()[msg.author.id]?.money || 0) <= 0) {
            return { content: "U dont have money", status: StatusCode.ERR }
        }
        if (globals.HEIST_STARTED) {
            return { content: "The game  has already started", status: StatusCode.ERR }
        }
        globals.HEIST_PLAYERS.push(msg.author.id)
        let timeRemaining = 30000
        if (globals.HEIST_TIMEOUT === null) {
            let int = setInterval(async () => {
                timeRemaining -= 1000
                if (timeRemaining % 8000 == 0)
                    await handleSending(msg, { content: `${timeRemaining / 1000} seconds until the heist commences!`, status: StatusCode.INFO }, sendCallback)
            }, 1000)
            let data: { [key: string]: number } = {} //player_id: amount won
            let data_floor: {[key: string]: number} = {} // player_id: amount won (non-percentage based)
            globals.HEIST_TIMEOUT = setTimeout(async () => {
                globals.HEIST_STARTED = true
                clearInterval(int)
                await handleSending(msg, { content: `Commencing heist with ${globals.HEIST_PLAYERS.length} players`, status: StatusCode.INFO }, sendCallback)
                for (let player of globals.HEIST_PLAYERS) {
                    data[player] = 0
                    data_floor[player] = 0 
                    setVar("__heist", "0", player)
                }
                let fileResponses = fs.readFileSync("./command-results/heist", "utf-8").split(";END").map(v => v.split(":").slice(1).join(":").trim())
                //let fileResponses: string[] = []
                let legacyNextStages = { "getting_in": "robbing", "robbing": "escape", "escape": "end" }
                let lastLegacyStage = "getting_in"
                let responses: { [key: string]: string[] } = {
                    getting_in_positive: [
                        "{userall} got into the building {+amount}, click the button to continue GAIN=all AMOUNT=normal IF=>10"
                    ],
                    getting_in_negative: [
                        "{userall} spent {=amount} on a lock pick to get into the building, click the button to continue LOSE=all AMOUNT=normal IF=>10"
                    ],
                    getting_in_neutral: [
                        "{userall} is going in"
                    ],
                    robbing_positive: [
                        "{user1} successfuly stole the gold {amount} GAIN=1 AMOUNT=large  LOCATION=bank",
                    ],
                    robbing_negative: [
                        "{user1} got destracted by the hot bank teller {amount} LOSE=1 AMOUNT=normal  LOCATION=bank"
                    ],
                    robbing_neutral: [
                        "{user1} found nothing"
                    ],
                    escape_positive: [
                        "{userall} escapes {amount}! GAIN=all AMOUNT=normal"
                    ],
                    escape_negative: [
                        "{userall} did not escape {amount}! LOSE=all AMOUNT=normal"
                    ],
                    escape_neutral: [
                        "{userall} finished the game"
                    ]
                }
                let LOCATIONS = ["__generic__"]
                for (let resp of fileResponses) {
                    let stage = resp.match(/STAGE=([^ ]+)/)
                    if (!stage?.[1]) {
                        continue
                    }
                    let location = resp.match(/(?<!SET_)LOCATION=([^ ]+)/)
                    if (location?.[1]) {
                        if (!LOCATIONS.includes(location[1])) {
                            LOCATIONS.push(location[1])
                        }
                    }
                    resp = resp.replace(/STAGE=[^ ]+/, "")
                    let type = ""
                    let gain = resp.match(/GAIN=([^ ]+)/)
                    if (gain?.[1])
                        type = "positive"
                    let lose = resp.match(/LOSE=([^ ]+)/)
                    if (lose?.[1]) {
                        type = "negative"
                    }
                    let neutral = resp.match(/(NEUTRAL=true|AMOUNT=none)/)
                    if (neutral) {
                        type = "neutral"
                    }
                    let t = `${stage[1]}_${type}`
                    if (responses[t]) {
                        responses[t].push(resp)
                    }
                    else {
                        responses[t] = [resp]
                    }
                }

                let current_location = "__generic__"

                let stats: { locationsVisited: { [key: string]: { [key: string]: number } }, adventureOrder: [string, string][] } = { locationsVisited: {}, adventureOrder: [] }

                function addToLocationStat(location: string, user: string, amount: number) {
                    if (!stats.locationsVisited[location][user]) {
                        stats.locationsVisited[location][user] = amount
                    }
                    else {
                        stats.locationsVisited[location][user] += amount
                    }
                }

                async function handleStage(stage: string): Promise<boolean> {//{{{
                    if (!stats.locationsVisited[current_location]) {
                        stats.locationsVisited[current_location] = {}
                    }
                    stats.adventureOrder.push([current_location, stage])
                    let shuffledPlayers = globals.HEIST_PLAYERS.sort(() => Math.random() - .5)
                    let amount = Math.random() * 0.5
                    let negpos = ["negative", "positive", "neutral"][Math.floor(Math.random() * 3)]
                    let responseList = responses[stage.replaceAll(" ", "_") + `_${negpos}`]
                    //neutral should be an optional list for a location, pick a new one if there's no neutral responses for the location
                    if (!responseList?.length && negpos === 'neutral') {
                        let negpos = ["positive", "negative"][Math.floor(Math.random() * 2)]
                        responseList = responses[stage.replaceAll(" ", "_") + `_${negpos}`]
                    }
                    if (!responseList) {
                        return false
                    }
                    responseList = responseList.filter(v => {
                        let enough_players = true
                        let u = v.matchAll(/\{user(\d+|all)\}/g)
                        if (!u)
                            return true
                        for (let match of u) {
                            if (match?.[1]) {
                                if (match[1] === 'all') {
                                    enough_players = true
                                    continue
                                }
                                let number = Number(match[1])
                                if (number > globals.HEIST_PLAYERS.length)
                                    return false
                                enough_players = true
                            }
                        }
                        return enough_players
                    })
                    responseList = responseList.filter(v => {
                        let location = v.match(/(?<!SET_)LOCATION=([^ ]+)/)
                        if (!location?.[1] && current_location == "__generic__") {
                            return true
                        }
                        if (location?.[1].toLowerCase() == current_location.toLowerCase()) {
                            return true
                        }
                        if (location?.[1].toLowerCase() === '__all__') {
                            return true
                        }
                        return false
                    })
                    let sum = Object.values(data).reduce((a, b) => a + b, 0)
                    responseList = responseList.filter(v => {
                        let condition = v.match(/IF=(<|>|=)(\d+)/)
                        if (!condition?.[1])
                            return true;
                        let conditional = condition[1]
                        let conditionType = conditional[0]
                        let number = Number(conditional.slice(1))
                        if (isNaN(number))
                            return true;
                        switch (conditionType) {
                            case "=": {
                                return sum == number
                            }
                            case ">": {
                                return sum > number
                            }
                            case "<": {
                                return sum < number
                            }
                        }
                        return true
                    })
                    if (responseList.length < 1) {
                        return false
                    }
                    let response = choice(responseList)
                    let amountType = response.match(/AMOUNT=([^ ]+)/)
                    while (!amountType?.[1]) {
                        response = choice(responseList)
                        amountType = response.match(/AMOUNT=([^ ]+)/)
                    }
                    if (amountType[1] === 'cents') {
                        amount = Math.random() / 100
                    }
                    // else {
                    //     //@ts-ignore
                    //     let multiplier = Number({ "none": 0, "normal": 1, "medium": 1, "large": 1 }[amountType[1]])
                    //     amount *= multiplier
                    // }

                    response = response.replaceAll(/\{user(\d+|all)\}/g, (_all: any, capture: any) => {
                        if (capture === "all") {
                            let text = []
                            for (let player of shuffledPlayers) {
                                text.push(`<@${player}>`)
                            }
                            return text.join(', ')
                        }
                        let nUser = Number(capture) - 1
                        return `<@${shuffledPlayers[nUser]}>`
                    })
                    let gainUsers = response.match(/GAIN=([^ ]+)/)
                    if (gainUsers?.[1]) {
                        for (let user of gainUsers[1].split(",")) {
                            if (user == 'all') {
                                for (let player in data) {
                                    addToLocationStat(current_location, player, amount)
                                    data[player] += amount
                                    data_floor[player] += 1
                                    let oldValue = Number(getVar(msg, `__heist`, player))
                                    setVar("__heist", String(oldValue + amount), player)
                                }
                            }
                            else {
                                addToLocationStat(current_location, shuffledPlayers[Number(user) - 1], amount)
                                data[shuffledPlayers[Number(user) - 1]] += amount
                                data_floor[shuffledPlayers[Number(user) - 1]] += 1
                                let oldValue = Number(getVar(msg, "__heist", shuffledPlayers[Number(user) - 1])) || 0
                                setVar("__heist", String(oldValue + amount), shuffledPlayers[Number(user) - 1])
                            }
                        }
                    }
                    let loseUsers = response.match(/LOSE=([^ ]+)/)
                    if (loseUsers?.[1]) {
                        amount *= -1
                        for (let user of loseUsers[1].split(",")) {
                            if (user == 'all') {
                                for (let player in data) {
                                    addToLocationStat(current_location, player, amount)
                                    data[player] += amount
                                    data_floor[player] -= 1
                                    let oldValue = Number(getVar(msg, `__heist`, player))
                                    setVar("__heist", String(oldValue + amount), player)
                                }
                            }
                            else {
                                addToLocationStat(current_location, shuffledPlayers[Number(user) - 1], amount)
                                data[shuffledPlayers[Number(user) - 1]] += amount
                                data_floor[shuffledPlayers[Number(user) - 1]] -= 1
                                let oldValue = Number(getVar(msg, "__heist", shuffledPlayers[Number(user) - 1])) || 0
                                setVar("__heist", String(oldValue + amount), shuffledPlayers[Number(user) - 1])
                            }
                        }
                    }
                    let subStage = response.match(/SUBSTAGE=([^ ]+)/)
                    if (subStage?.[1]) {
                        response = response.replace(/SUBSTAGE=[^ ]+/, "")
                    }
                    let setLocation = response.match(/SET_LOCATION=([^ ]+)/)
                    if (setLocation?.[1]) {
                        response = response.replace(/SET_LOCATION=[^ ]+/, "")
                        current_location = setLocation[1].toLowerCase()
                    }
                    response = response.replace(/LOCATION=[^ ]+/, "")
                    response = response.replaceAll(/\{(\+|-|=|!|\?)?amount\}/g, (_match: any, pm: any) => {
                        if (pm && pm == "+") {
                            return `+${Math.abs(amount)}%`
                        }
                        else if (pm && pm == "-") {
                            return `-${Math.abs(amount)}%`
                        }
                        else if (pm && (pm == "=" || pm == "!" || pm == "?")) {
                            return `${Math.abs(amount)}%`
                        }
                        return amount >= 0 ? `+${amount}%` : `${amount}%`
                    })
                    response = response.replace(/GAIN=[^ ]+/, "")
                    response = response.replace(/LOSE=[^ ]+/, "")
                    response = response.replace(/AMOUNT=[^ ]+/, "")
                    response = response.replace(/IF=(<|>|=)\d+/, "")
                    let locationOptions = current_location.split("|").map(v => v.trim())
                    if (locationOptions.length > 1) {
                        let rows: MessageActionRow[] = []
                        let buttonClickResponseInChoice = response.match(/BUTTONCLICK=(.*) ENDBUTTONCLICK/)
                        let buttonResponse = ""
                        if (buttonClickResponseInChoice?.[1]) {
                            buttonResponse = buttonClickResponseInChoice[1]
                            response = response.replace(/BUTTONCLICK=(.*) ENDBUTTONCLICK/, "")
                        }
                        let row = new MessageActionRow()
                        for (let op of locationOptions) {
                            if (!op) continue;
                            if (op == "__random__") {
                                op = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)]
                            }
                            let button = new MessageButton({ customId: `button.heist:${op}`, label: op, style: "PRIMARY" })
                            row.addComponents(button)
                            if (row.components.length > 2) {
                                rows.push(row)
                                row = new MessageActionRow()
                            }
                        }
                        if (row.components.length > 0) {
                            rows.push(row)
                        }
                        let m = await sendCallback({ content: response, components: rows })
                        let choice = ""
                        try {
                            let interaction = await m.awaitMessageComponent({ componentType: "BUTTON", time: 30000 })
                            choice = interaction.customId.split(":")[1]
                            buttonResponse = buttonResponse.replaceAll("{user}", `<@${interaction.user.id}>`)
                        }
                        catch (err) {
                            choice = locationOptions[Math.floor(Math.random() * locationOptions.length)]
                            buttonResponse = buttonResponse.replaceAll("{user}", ``)
                        }
                        if (buttonResponse) {
                            await m.reply({ content: buttonResponse.replaceAll("{location}", choice) })
                        }
                        current_location = choice
                    }
                    else {
                        await handleSending(msg, { content: response, status: StatusCode.INFO })
                    }

                    if (current_location == "__random__") {
                        current_location = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)]
                    }

                    await new Promise(res => setTimeout(res, 4000))
                    if (subStage?.[1] && responses[`${subStage[1]}_positive`] && responses[`${subStage[1]}_negative`]) {
                        if (Object.keys(legacyNextStages).includes(subStage[1])) {
                            lastLegacyStage = subStage[1]
                        }
                        stage = subStage[1]
                        return await handleStage(subStage[1])
                    }
                    if (subStage?.[1] == 'end') {
                        lastLegacyStage = 'end'
                        stage = 'end'
                    }
                    return true
                }//}}}
                let stage: string = lastLegacyStage
                while (stage != 'end') {
                    if (!await handleStage(stage)) {
                        stats.adventureOrder[stats.adventureOrder.length - 1][1] += " *(fail)*"
                        let oldStage = stage
                        await sendCallback(`FAILURE on stage: ${oldStage} ${current_location == '__generic__' ? "" : `at location: ${current_location}`}, resetting to location __generic__`)
                        current_location = '__generic__'
                    }
                    else {
                        console.log("fallback", lastLegacyStage, stage)
                        //@ts-ignore
                        if (legacyNextStages[lastLegacyStage]) {
                            //@ts-ignore
                            stage = legacyNextStages[lastLegacyStage]
                            lastLegacyStage = stage
                        }
                        else {
                            stage = 'end'
                        }
                    }
                }
                globals.HEIST_PLAYERS = []
                globals.HEIST_TIMEOUT = null
                globals.HEIST_STARTED = false
                if (Object.keys(data).length > 0) {
                    let useEmbed = false
                    let e = new MessageEmbed()
                    let text = ''
                    if (!opts['no-location-stats'] && !opts['nls'] && !opts['no-stats'] && !opts['ns']) {
                        text += 'STATS:\n---------------------\n'
                        for (let location in stats.locationsVisited) {
                            text += `${location}:\n`
                            for (let player in stats.locationsVisited[location]) {
                                text += `<@${player}>: ${stats.locationsVisited[location][player]},  `
                            }
                            text += '\n'
                        }
                    }
                    if (!opts['no-total'] && !opts['nt']) {
                        e.setTitle("TOTALS")
                        useEmbed = true
                        for (let player in data) {
                            if (!isNaN(data[player])) {
                                let member = msg.guild?.members.cache.get(player)
                                let netWorth = economy.playerLooseNetWorth(player)
                                let gain = netWorth * (data[player] / 100)
                                gain += data_floor[player] ? data_floor[player] : 0
                                if (member) {
                                    e.addField(String(member.nickname || member.user.username), `$${gain} (${data[player]}%)`)
                                }
                                else {
                                    e.addField(String(data[player]), `<@${player}>`)
                                }
                                economy.addMoney(player, gain)
                            }
                        }
                    }
                    if (!opts['no-adventure-order'] && !opts['nao'] && !opts['no-stats'] && !opts['ns']) {
                        text += '\n---------------------\nADVENTURE ORDER:\n---------------------\n'
                        for (let place of stats.adventureOrder) {
                            text += `${place[0]} (${place[1]})\n`
                        }
                    }
                    await handleSending(msg, { content: text || "The end!", embeds: useEmbed ? [e] : undefined, status: StatusCode.RETURN })
                }
            }, timeRemaining)
        }
        let heistJoinFormat = user_options.getOpt(msg.author.id, "heist-join", `${msg.author} joined the heist`)
        return { content: heistJoinFormat, recurse: true, status: StatusCode.INFO, do_change_cmd_user_expansion: false }

    }, CommandCategory.GAME,
        "Go on a \"heist\"",
        {
            "no-stats": createHelpOption("Display only the amount gained/lost from the heist", ['ns']),
            "no-adventure-order": createHelpOption("Do not display  the  adventure order", ["noa"]),
            "no-location-stats": createHelpOption("Do not display amount gained/lost from each location", ["nls"]),
            "no-total": createHelpOption("Do not display the amount gained/lost", ["nt"]),
        }
    ),

    // "egyption-war": {
    //     run: async (msg, args, sendCallback) => {
    //
    //         function giveRandomCard(cardsToChooseFrom: string[], deck: string[]) {
    //             let no = Math.floor(Math.random() * cardsToChooseFrom.length)
    //             let c = cardsToChooseFrom[no]
    //             cards = cardsToChooseFrom.filter((_v, i) => i != no)
    //             deck.push(c)
    //         }
    //         let cards = []
    //         let stack: string[] = []
    //         for (let suit of ["♦", "S", "♥️", "C"]) {
    //             for (let num of ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]) {
    //                 cards.push(`${num} of ${suit}`)
    //             }
    //         }
    //         let totalCards = cards.length
    //         let players: { [key: string]: string[] } = { [msg.author.id]: [] }
    //         for (let arg of args) {
    //             //@ts-ignore
    //             let user = await fetchUser(msg.guild, arg)
    //             players[user?.id] = []
    //         }
    //         let cardsPerPlayer = Math.floor(cards.length / Object.keys(players).length)
    //         for (let player in players) {
    //             for (let i = 0; i < cardsPerPlayer; i++) {
    //                 giveRandomCard(cards, players[player])
    //             }
    //         }
    //         if (cards.length) {
    //             stack = JSON.parse(JSON.stringify(cards))
    //         }
    //         let collector = msg.channel.createMessageCollector({ filter: m => ['slap', 's'].includes(m.content) && !m.author.bot })
    //         collector.on("collect", m => {
    //             let lastCard = stack[stack.length - 1]?.split(" of")[0]
    //             let secondLastCard = stack[stack.length - 2]?.split(" of")[0]
    //             let thirdLastCard = stack[stack.length - 3]?.split(" of")[0]
    //             if ((lastCard === secondLastCard || thirdLastCard === lastCard) && lastCard != undefined) {
    //                 if (players[m.author.id]) {
    //                     players[m.author.id] = [...players[m.author.id], ...stack]
    //                 }
    //                 else {
    //                     players[m.author.id] = [...stack]
    //                 }
    //                 playerKeys.push(m.author.id)
    //                 stack = []
    //                 sendCallback(`${m.author} got the stack`)
    //             }
    //             else {
    //                 sendCallback("No slap")
    //             }
    //         })
    //         let attemptsDict = {
    //             "A": 4,
    //             "K": 3,
    //             "Q": 2,
    //             "J": 1
    //         }
    //         let playerKeys = Object.keys(players)
    //         let attempts = 0
    //         let lastPlayer;
    //         for (let i = 0; true; i = ++i >= playerKeys.length ? 0 : i) {
    //             let turn = playerKeys[i]
    //             if (attempts && lastPlayer) {
    //                 let gotFaceCard = false
    //                 for (; attempts > 0; attempts--) {
    //                     await sendCallback(`<@${turn}>: FACE CARD: ${attempts} attempts remaining`)
    //                     try {
    //                         giveRandomCard(players[turn], stack)
    //                         let recentCard = stack[stack.length - 1]
    //                         let isFaceCard = ['K', 'Q', "J", "A"].includes(recentCard.split(" of")[0])
    //                         await sendCallback(`${recentCard} (${stack.length})`)
    //                         if (isFaceCard) {
    //                             attempts = attemptsDict[recentCard.split(" of")[0] as 'A' | 'K' | 'Q' | 'J']
    //                             gotFaceCard = true
    //                             break
    //                         }
    //                     }
    //                     catch (err) {
    //                         await handleSending(msg, { content: `<@${turn}> didnt go in time they are out` })
    //                         delete players[turn]
    //                         playerKeys = playerKeys.filter(v => v != turn)
    //                     }
    //                 }
    //                 if (!gotFaceCard) {
    //                     players[lastPlayer] = [...players[lastPlayer], ...stack]
    //                     await sendCallback(`<@${lastPlayer}> got the stack (${stack.length} cards)`)
    //                     stack = []
    //                 }
    //             }
    //             else {
    //                 await sendCallback(`<@${turn}> (${players[turn].length} / ${totalCards} cards ): GO`)
    //                 try {
    //                     giveRandomCard(players[turn], stack)
    //                     let recentCard = stack[stack.length - 1]
    //                     let isFaceCard = ['K', 'Q', "J", "A"].includes(recentCard.split(" of")[0])
    //                     if (isFaceCard) {
    //                         attempts = attemptsDict[recentCard.split(" of")[0] as 'A' | 'K' | 'Q' | 'J']
    //                     }
    //                     await sendCallback(`${recentCard} (${stack.length})`)
    //                 }
    //                 catch (err) {
    //                     await handleSending(msg, { content: `<@${turn}> didnt go in time they are out` })
    //                     delete players[turn]
    //                     playerKeys = playerKeys.filter(v => v != turn)
    //                 }
    //             }
    //             if (playerKeys.length <= 1) {
    //                 return { content: "Everyone left" }
    //             }
    //             for (let player in players) {
    //                 if (players[player].length == totalCards) {
    //                     return { content: `<@${player}> WINS` }
    //                 }
    //             }
    //             lastPlayer = turn
    //         }
    //     }, category: CommandCategory.GAME
    // },

    blackjack: createCommand(async (msg, args, sendCallback) => {
        let opts;
        [opts, args] = getOpts(args)
        let hardMode = Boolean(opts['hard'])
        let betStr = args[0]
        if (!betStr) {
            betStr = user_options.getOpt(msg.author.id, "default-bj-bet", "0")
        }
        let bet = economy.calculateAmountFromString(msg.author.id, betStr)
        if (!bet) {
            return { content: "no bet given", status: StatusCode.ERR }
        }
        if (bet <= 0) {
            return { content: "No reverse blackjack here", status: StatusCode.ERR }
        }
        if (hardMode)
            bet *= 2

        if (!economy.canBetAmount(msg.author.id, bet)) {
            return { content: "That bet is too high for you", status: StatusCode.ERR }
        }
        if (globals.BLACKJACK_GAMES[msg.author.id]) {
            return { content: "You idiot u already playing the game", status: StatusCode.ERR }
        }
        let blackjack_screen = user_options.getOpt(msg.author.id, "bj-screen", "**BLACKJACK!**\nYou got: **{amount}**")
        globals.BLACKJACK_GAMES[msg.author.id] = true
        let cards = []
        for (let _suit of ["Diamonds", "Spades", "Hearts", "Clubs"]) {
            for (let num of ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]) {
                cards.push(`${num}`)
            }
        }
        function calculateCardValue(card: string, total: number) {
            if (card == "A") {
                if (total + 11 >= 22) {
                    return { amount: 1, soft: false }
                }
                else {
                    return { amount: 11, soft: true }
                }
            }
            else if (["10", "J", "Q", "K"].includes(card)) {
                return { amount: 10, soft: false }
            }
            else if (Number(card)) {
                return { amount: Number(card), soft: false }
            }
            return { amount: NaN, soft: false }
        }
        function calculateTotal(cards: string[]) {
            let total = 0
            let soft = false
            for (let card of cards.filter(v => v.split(" of")[0] !== 'A')) {
                let val = calculateCardValue(card, total)
                if (!isNaN(val.amount)) {
                    total += val.amount
                }
            }
            for (let card of cards.filter(v => v.split(" of")[0] === 'A')) {
                let val = calculateCardValue(card, total)
                if (!isNaN(val.amount)) {
                    total += val.amount
                }
                if (val.soft) {
                    soft = true
                }
            }
            return { total: total, soft: soft }
        }
        function giveRandomCard(cardsToChooseFrom: string[], deck: string[]) {
            let no = Math.floor(Math.random() * cardsToChooseFrom.length)
            let c = cardsToChooseFrom[no]
            cards = cardsToChooseFrom.filter((_v, i) => i != no)
            deck.push(c)
        }
        let playersCards: string[] = []
        let dealerCards: string[] = []
        for (let i = 0; i < 2; i++) {
            giveRandomCard(cards, playersCards)
            giveRandomCard(cards, dealerCards)
        }
        if (calculateTotal(playersCards).total === 21) {
            economy.addMoney(msg.author.id, bet * 3)
            delete globals.BLACKJACK_GAMES[msg.author.id]
            return { content: format(blackjack_screen, { amount: String(bet * 3) }), recurse: true, status: StatusCode.RETURN, do_change_cmd_user_expansion: false }
        }
        if (calculateTotal(dealerCards).total === 21) {
            economy.loseMoneyToBank(msg.author.id, bet)
            delete globals.BLACKJACK_GAMES[msg.author.id]
            if (Math.random() > .999) {
                economy.loseMoneyToBank(msg.author.id, bet * 2)
                return {content: "Bowser was actually the dealer and got blackjack, and forrces you to pay 3x what you bet", status: StatusCode.RETURN}
            }
            return { content: `**BLACKJACK!**\nYou did not get: **${bet * 3}**`, status: StatusCode.RETURN }
        }
        let total = 0
        while ((total = calculateTotal(dealerCards).total) < 22) {
            let awayFrom21 = 21 - total
            let countOfAwayInDeck = cards.filter(v => calculateCardValue(v, total).amount <= awayFrom21).length

            let chance = countOfAwayInDeck / cards.length
            if (Math.random() < chance || total < 17) {
                giveRandomCard(cards, dealerCards)
            }
            else {
                break
            }
        }
        while (true) {
            let embed = new MessageEmbed()
            embed.setTitle("Blackjack")
            if (msg.member?.user.avatarURL()) {
                //@ts-ignore
                embed.setThumbnail(msg.member.user.avatarURL().toString())
            }
            let playerTotal = calculateTotal(playersCards)
            if (playerTotal.soft) {
                embed.addField("Your cards", `value: **${playerTotal.total}** (soft)`, true)
            }
            else embed.addField("Your cards", `value: **${playerTotal.total}**`, true)
            //FIXME: edge case where dealerCards[0] is "A", this could be wrong
            embed.addField("Dealer cards", `value: **${calculateCardValue(dealerCards[0], 0).amount}**`, true)
            embed.setFooter({ text: `Cards Remaining, \`${cards.length}\`` })
            if (hasItem(msg.author.id, "reset")) {
                embed.setDescription(`\`reset\`: restart the game\n\`hit\`: get another card\n\`stand\`: end the game\n\`double bet\`: to double your bet\n(current bet: ${bet})`)
            }
            else {
                embed.setDescription(`\`hit\`: get another card\n\`stand\`: end the game\n\`double bet\`: to double your bet\n(current bet: ${bet})`)
            }
            let _message = await sendCallback({ embeds: [embed] })
            let response
            while (!response) {
                let collectedMessages
                try {
                    collectedMessages = await msg.channel.awaitMessages({
                        filter: m => {
                            if (m.author.id === msg.author.id) {
                                if (hasItem(msg.author.id, "reset") && (['hit', 'stand', 'double bet', 'reset'].includes(m.content.toLowerCase()))) {
                                    return true
                                }
                                else if (['hit', 'stand', 'double bet'].includes(m.content.toLowerCase())) {
                                    return true
                                }
                            }
                            return false
                        }, max: 1, time: 30000, errors: ["time"]
                    })
                }
                catch (err) {
                    economy.loseMoneyToBank(msg.author.id, bet)
                    delete globals.BLACKJACK_GAMES[msg.author.id]
                    return { content: `Did not respond  in time, lost ${bet}`, status: StatusCode.ERR }
                }
                response = collectedMessages.at(0)
            }
            let choice = response.content.toLowerCase()
            if (choice === 'double bet') {
                if (!economy.canBetAmount(msg.author.id, bet * 2)) {
                    await sendCallback({ content: "That bet is too high for you" })
                    continue
                }
                bet *= 2
                choice = "hit"
            }
            if (choice === 'hit') {
                giveRandomCard(cards, playersCards)
            }
            if (choice === 'reset' && hasItem(msg.author.id, "reset")) {
                cards = []
                for (let _suit of ["Diamonds", "Spades", "Hearts", "Clubs"]) {
                    for (let num of ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]) {
                        cards.push(`${num}`)
                    }
                }
                playersCards = []
                dealerCards = []
                for (let i = 0; i < 2; i++) {
                    giveRandomCard(cards, playersCards)
                    giveRandomCard(cards, dealerCards)
                }
                if (calculateTotal(playersCards).total === 21) {
                    economy.addMoney(msg.author.id, bet * 3)
                    delete globals.BLACKJACK_GAMES[msg.author.id]
                    useItem(msg.author.id, "reset")
                    return { content: format(blackjack_screen, { amount: String(bet * 3) }), recurse: true, status: StatusCode.RETURN, do_change_cmd_user_expansion: false }
                }
                if (calculateTotal(dealerCards).total === 21) {
                    economy.loseMoneyToBank(msg.author.id, bet)
                    delete globals.BLACKJACK_GAMES[msg.author.id]
                    if (Math.random() > .999) {
                        economy.loseMoneyToBank(msg.author.id, bet * 2)
                        return {content: "Bowser was actually the dealer and got blackjack, and forrces you to pay 3x what you bet", status: StatusCode.RETURN}
                    }
                    return { content: `**BLACKJACK!**\nYou did not get: **${bet * 3}**`, status: StatusCode.RETURN }
                }
                let total = 0
                while ((total = calculateTotal(dealerCards).total) < 22) {
                    let awayFrom21 = 21 - total
                    let countOfAwayInDeck = cards.filter(v => calculateCardValue(v, total).amount <= awayFrom21).length

                    let chance = countOfAwayInDeck / cards.length
                    if (Math.random() < chance || total < 17) {
                        giveRandomCard(cards, dealerCards)
                    }
                    else {
                        break
                    }
                }
                useItem(msg.author.id, "reset")
            }
            if ((choice === 'stand' && (hardMode == false || calculateTotal(playersCards).total >= 17)) || calculateTotal(playersCards).total > 21) {
                break
            }
        }
        let playerTotal = calculateTotal(playersCards).total
        let dealerTotal = calculateTotal(dealerCards).total
        let stats = `Your total: ${playerTotal} (${playersCards.length})\nDealer total: ${dealerTotal} (${dealerCards.length})`
        let status = "You won"
        if (playerTotal > 21) {
            status = `You lost: $${bet} (over 21)`
            economy.loseMoneyToBank(msg.author.id, bet)
        }
        else if (playerTotal === dealerTotal) {
            status = "TIE"
            if (Math.random() > 0.999) {
                let UserHp = 60;
                let SpiderHp = 50;

                await handleSending(msg, {status: StatusCode.INFO, content: "a spider jum pon tablew!121 You must defend honor!1 (attack/heal)"}, sendCallback);

                let newmsg = await handleSending(msg, {status: StatusCode.INFO, content: `UserHp: ${UserHp}\nSpiderHp: ${SpiderHp}`}, sendCallback);
                while (UserHp >= 0 && SpiderHp >= 0) {
                    let action = await msg.channel.awaitMessages({ filter: m => m.author.id === msg.author.id, max: 1 })
                    let actionMessage = action.at(0)
                    if (!actionMessage) continue
                    if (actionMessage.deletable) {
                        await actionMessage.delete()
                    }
                    let UserInput = actionMessage.content
                    if (UserInput == "attack") {
                        SpiderHp = SpiderHp - Math.floor(Math.random() * 26);
                    }
                    else if (UserInput == "heal") {
                        UserHp = UserHp + Math.floor(Math.random() * 11);
                    }
                    else {
                        await newmsg.edit(`Thaat not right fuk\nUserHp: ${UserHp}\nSpiderHp: ${SpiderHp}`)
                        continue
                    }
                    UserHp = UserHp - Math.floor(Math.random() * 26);
                    await newmsg.edit(`spider attack u\nUserHp: ${UserHp}\nSpiderHp: ${SpiderHp}`)
                }
                delete globals.BLACKJACK_GAMES[msg.author.id]
                if (UserHp > 0) {

                    let amount = Math.random() * 2 + 1
                    economy.addMoney(msg.author.id, bet * amount);
                    return { content: `congratulation u win the spid\n${format(blackjack_screen, { amount: String(bet * amount) })}`, status: StatusCode.RETURN, do_change_cmd_user_expansion: false };
                } else {
                    economy.loseMoneyToBank(msg.author.id, bet);
                    return { content: "u r ez dead", status: StatusCode.RETURN };
                }
            }
        }
        else if (playerTotal < dealerTotal && dealerTotal < 22) {
            status = `You lost: $${bet} (dealer won)`
            economy.loseMoneyToBank(msg.author.id, bet)
        }
        else {
            status = `You won: $${bet}`
            economy.addMoney(msg.author.id, bet)
        }
        delete globals.BLACKJACK_GAMES[msg.author.id]
        return { content: `**${status}**\n${stats}` , status: StatusCode.RETURN}
    }, CommandCategory.GAME,
        "Play a round of blackjack",
        {
            "hard": createHelpOption("You can only stand if you have 17+"),
        },
    ),

    "periodic-table": {
        run: async (_msg, args, sendCallback) => {
            let opts;
            [opts, args] = getOpts(args)


            let reqElem = args.join(" ")

            if (opts['an'] || opts['n']) {
                reqElem += `AtomicNumber=${opts['n']}`
            }

            if (!reqElem && !opts['r']) {
                return { content: "No element requesed" , status: StatusCode.ERR}
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
                let embed = new MessageEmbed()
                elementsNamesList.push(`${element.Name} (${element.Symbol})`)
                embed.setTitle(`${element.Name} (${element.Symbol})`)
                embed.setDescription(`Discovered in ${element.DiscoveryYear == "0" ? "Unknown" : element.DiscoveryYear} by ${element.DiscoveredBy == "-" ? "Unknown" : element.DiscoveredBy}`)
                embed.addField("Atomic Number", String(element.AtomicNumber),)
                embed.addField("Atomic Mass", String(element.RelativeAtomicMass))
                embed.addField("Melting Point C", String(element.MeltingPointC) || "N/A", true)
                embed.addField("Boiling Point C", String(element.BoilingPointC) || "N/A", true)
                embeds.push(embed)
            }
            if (embeds.length > 10 || opts['list-names']) {
                return { content: elementsNamesList.join("\n"), status: StatusCode.RETURN }
            }
            return { embeds: embeds, status: StatusCode.RETURN }
        }, category: CommandCategory.UTIL
    },

    economy: {
        run: async (_msg, _args, sendCallback) => {
            return {
                files: [
                    {
                        attachment: `economy.json`,
                        name: `economy.json`,
                        description: "This is the economy",
                        delete: false
                    }
                ],
                status: StatusCode.RETURN
            }
        },
        category: CommandCategory.META
    },

    "inventory.json": {
        run: async (_msg, _args, sendCallback) => {
            return {
                files: [
                    {
                        attachment: `inventory.json`,
                        name: "Inventory.json",
                        description: "Everyone's inventory",
                        delete: false
                    }
                ],
                status: StatusCode.RETURN
            }
        }, category: CommandCategory.META
    },

    leaderboard: {
        run: async (msg, args, sendCallback) => {
            let opts;
            [opts, args] = getOpts(args)
            let place = Number(args[0]) || 10
            if (opts['top']) {
                place = parseInt(String(opts['top']))
                if (isNaN(place)) {
                    place = 10
                }
            }
            if (!msg.guild) {
                return { content: "No guild", status: StatusCode.ERR }
            }
            let embed = new MessageEmbed()
            let text = ""
            let sortedEconomy: [string, economy.EconomyData][] = []
            let econ = economy.getEconomy()
            if (opts['nw']) {
                sortedEconomy = Object.entries(economy.getEconomy()).sort((a, b) => economy.playerLooseNetWorth(b[0]) - economy.playerLooseNetWorth(a[0]))
            }
            else if (opts['loan']) {
                sortedEconomy = Object.entries(economy.getEconomy()).sort((a, b) => (b[1].loanUsed || 0) - (a[1].loanUsed || 0))
            }
            else {
                sortedEconomy = Object.entries(economy.getEconomy()).sort((a, b) => a[1].money - b[1].money).reverse()
            }
            sortedEconomy = sortedEconomy.slice(0, place)
            let totalEconomy = 0
            if (opts['nw']) {
                for (let id in econ) {
                    totalEconomy += economy.playerLooseNetWorth(id)
                }
            }
            else if (opts['loan']) {
                for (let id in econ) {
                    let value = econ[id]
                    totalEconomy += value.loanUsed || 0
                }
            }
            else {
                for (let id in econ) {
                    let value = econ[id]
                    totalEconomy += value.money
                }
            }
            place = 0
            for (let user of sortedEconomy) {
                let id = user[0]
                let money = econ[id].money
                if (opts['nw']) {
                    money = economy.playerLooseNetWorth(id)
                }
                else if (opts['loan']) {
                    money = econ[id].loanUsed || 0
                }
                let percent = money / totalEconomy * 100
                if (!opts['no-round']) {
                    money = Math.round(money * 100) / 100
                    percent = Math.round(percent * 100) / 100
                }
                if (opts['text']) {
                    text += `**${place + 1}**: <@${id}>: ${money} (${percent}%)\n`
                }
                else {
                    embed.addField(`${place + 1}`, `<@${id}>: ${money} (${percent}%)`, true)
                }
                place++
            }
            if (opts['text'])
                return { content: text, allowedMentions: { parse: [] }, status: StatusCode.RETURN }
            embed.setTitle(`Leaderboard`)
            if (opts['no-round'])
                embed.setDescription(`Total wealth: ${totalEconomy}`)
            else
                embed.setDescription(`Total wealth: ${Math.round(totalEconomy * 100) / 100}`)
            return { embeds: [embed], status: StatusCode.RETURN }

        }, category: CommandCategory.ECONOMY,
        help: {
            info: "Get the top players in the economy",
            arguments: {
                amount: {
                    description: "Show the  top x players",
                    required: false
                }
            },
            options: {
                "text": {
                    description: "Show text instead of an embed"
                },
                "loan": {
                    description: "Show the loan leaderboard",
                },
                "nw": {
                    description: "Show the net worth  leaderboard"
                }
            },
        }
    },

    "del-var": {
        run: async (msg, args, sendCallback) => {
            let opts;
            [opts, args] = getOpts(args)
            let prefix = String(opts['prefix'] || "__global__")
            if (opts['u']) {
                prefix = msg.author.id
            }
            let names = args
            let deleted = []
            for (let name of names) {
                if (vars[prefix]?.[name] !== undefined && typeof vars[prefix]?.[name] !== 'function') {
                    delete vars[prefix][name]
                    deleted.push(name)
                }
            }
            return { content: `Deleted: \`${deleted.join(", ")}\``, status: StatusCode.RETURN }
        }, category: CommandCategory.META,
        help: {
            info: "Delete a variable",
            arguments: {
                "variables...": {
                    description: "Delete each variable seperatted by a space",
                    required: true
                }
            },
            options: {
                u: {
                    description: "Delete a user variable"
                },
                prefix: {
                    description: "Delete  a variable from the specified prefix"
                }
            }
        }
    },

    "savev": {
        run: async (_msg, _args, sendCallback) => {
            saveVars()
            return { content: "Variables saved", status: StatusCode.RETURN }
        }, category: CommandCategory.META
    },

    savee: {
        run: async (_msg, _args, sendCallback) => {
            economy.saveEconomy()
            saveItems()
            pet.savePetData()
            return { content: "Economy saved", status: StatusCode.RETURN }
        }, category: CommandCategory.ECONOMY
    },

    coin: {
        run: async (msg, args, sendCallback) => {
            let opts;
            [opts, args] = getOpts(args)
            let guess = args[0]
            let bet = economy.calculateAmountFromString(msg.author.id, String(opts['bet'] || opts['b'])) || 0
            if (bet && !guess) {
                return { content: "You cannot bet, but not have a guess", status: StatusCode.ERR }
            }
            let side = Math.random() > .5 ? "heads" : "tails"
            if (!bet || bet < 0) {
                return { content: side, status: StatusCode.RETURN }
            }
            if (!economy.canBetAmount(msg.author.id, bet)) {
                return { content: "You dont have enough money for this bet", status: StatusCode.ERR }
            }
            guess = guess.toLowerCase()
            if (side == guess) {
                economy.addMoney(msg.author.id, bet)
                return { content: `The side was: ${side}\nYou won: ${bet}`, status: StatusCode.RETURN }
            }
            else {
                economy.loseMoneyToBank(msg.author.id, bet)
                return { content: `The side was: ${side}\nYou lost: ${bet}`, status: StatusCode.RETURN }
            }
        }, category: CommandCategory.GAME
    },

    // "bowser": createCommand(async(msg, args, sendCB) => {
    //     let totalEconomy = 0
    //     for (let id in economy.getEconomy()) {
    //         totalEconomy += economy.playerLooseNetWorth(id)
    //     }
    //     let userNetWorth = economy.playerLooseNetWorth(msg.author.id)
    //     if(userNetWorth / totalEconomy < .001){
    //         return {content: "You must have at least .1% of the economy to run this command"}
    //     }
    //     if(economy.getEconomy()[msg.author.id]?.usedBowser && Date.now() / 1000 - economy.getEconomy()[msg.author.id]?.usedBowser / 1000 < 3600){
    //         return {content: "You cannot use bowser"}
    //     }
    //     economy.useBowser(msg.author.id)
    //
    //     let cost = userNetWorth * .1
    //     economy.loseMoneyToBank(msg.author.id, cost)
    //     let options = {
    //         //lose 10%
    //         "lava pit": () => {
    //             economy.loseMoneyToBank(msg.author.id, userNetWorth * .1)
    //             return "lmao you lost 10% in a lava pit"
    //         },
    //         //gain $0.01
    //         "LUCKY WINNER!!!": () => {
    //             economy.addMoney(msg.author.id, 0.01)
    //             return "YOU WON A TON  OF MONEY"
    //         },
    //         //forced to go through an interaction where bowser forces you to buy a useless item.
    //         // "bowser shop": () => {
    //         //
    //         // },
    //         // //force bj 10% (nw)
    //         // "lucky blackjack time": () => {
    //         // },
    //         //divide everyone's net worth by 2
    //         "deflation time": () => {
    //             for(let user in economy.getEconomy()){
    //                 let nw = economy.playerLooseNetWorth(user)
    //                 economy.loseMoneyToBank(user, nw / 2)
    //                 return "i love division"
    //             }
    //         },
    //         //steal 10% from 1st place
    //         "yoink": () => {
    //             let sortedEconomy = Object.entries(economy.getEconomy()).sort((a, b) => economy.playerLooseNetWorth(b[0]) - economy.playerLooseNetWorth(a[0]))
    //             let firstPlaceTotal = economy.playerLooseNetWorth(sortedEconomy[0][0])
    //             economy.loseMoneyToPlayer(sortedEconomy[0][0], firstPlaceTotal * .1, msg.author.id)
    //             return "yoinky doinky 10%"
    //         },
    //         //double balance
    //         "2": () => {
    //             economy.addMoney(msg.author.id, economy.getEconomy()[msg.author.id].money)
    //             return "DOUBLE BALANCE"
    //         }
    //     }
    //     let option_choices = Object.keys(options)
    //     let choice = option_choices[Math.floor(Math.random() * option_choices.length)]
    //     let e = new MessageEmbed()
    //     e.setTitle(choice)
    //     //@ts-ignore
    //     e.setDescription(options[choice]?.())
    //     e.setFooter({text: `cost: ${cost}`})
    //     return {embeds: [e]}
    //
    //     //TOOD: add things
    //     //can be used every hour
    //     //force battle with everyone in chat
    //     //3 free items
    //     
    // }, CommandCategory.ECONOMY, "The bowser command"),
    //
    yt: {
        run: async(msg, _, sc, opts, args) => {
            let instance = 'https://vid.puffyan.us'

            let pageNo = Number(opts['page'] as string) || 1

            let res = await fetch.default(`${instance}/api/v1/search?q=${encodeURI(args.join(" "))}&page=${encodeURI(String(pageNo))}`)
            let jsonData = await res.json()

            let embeds: {embed: MessageEmbed, button: MessageButton, jsonButton: MessageButton}[] = []
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


            if(opts['list']){
                let fmt = opts['list']
                if(fmt == true){
                    fmt = "%l\n"
                }

                let string = ""
                for(let res of jsonData){
                    string += format(fmt, {l: `https://www.youtube.com/watch?v=${res.videoId}` || "N/A", t: res.title || "N/A", c: res.author || "N/A", d: res.lengthSeconds || "N/A", v: res.viewCount || "N/A", u: res.publishedText || "N/A"})
                }

                return {content: string, status: StatusCode.RETURN}
            }

            let pages = jsonData.length
            let i = 0

            for(let res of jsonData){
                i++;

                let e = new MessageEmbed()
                e.setTitle(String(res['title']))

                if(res.description){
                    console.log(res.description)
                    e.setDescription(res.description)
                }

                e.setFooter({text: `https://www.youtube.com/watch?v=${res.videoId}\n${i}/${pages}`})

                //@ts-ignore
                e.setImage(res.videoThumbnails.filter(v => v.quality == thumbnail_quality)[0].url)

                let button = new MessageButton({label: "OPEN", style: "LINK", url: `https://www.youtube.com/watch?v=${res.videoId}`})

                let json_button = new MessageButton({label: "JSON", style: "SECONDARY", customId: `yt.json:${res.videoId}`})

                embeds.push({embed: e, button: button, jsonButton: json_button})
            }

            let next_page = new MessageButton({ customId: `yt.next:${msg.author.id}`, label: "NEXT", style: "PRIMARY"})
            let last_page = new MessageButton({ customId: `yt.back:${msg.author.id}`, label: "BACK", style: "SECONDARY"})

            let action_row = new MessageActionRow()
            action_row.addComponents(last_page, next_page, embeds[current_page].button, embeds[current_page].jsonButton)

            let m = await handleSending(msg, {components: [action_row], embeds: [embeds[current_page].embed], status: StatusCode.PROMPT}, sc)
            let collector = m.createMessageComponentCollector({filter: int => int.user.id === msg.author.id})

            let to = setTimeout(collector.stop.bind(collector), 60000)
            collector.on("collect", async(int) => {
                clearTimeout(to)
                to = setTimeout(collector.stop.bind(collector), 60000)

                if(int.customId.startsWith('yt.next')){
                    current_page++;
                    if(current_page >= pages){
                        current_page = 0
                    }
                }

                else if(int.customId.startsWith('yt.back')){
                    current_page--;
                    if(current_page < 0){
                        current_page = 0
                    }
                }

                else if(int.customId.startsWith("yt.json")){
                    let yt_id = int.customId.split(":")[1]
                    //@ts-ignore
                    let json_data = jsonData.filter(v => v.videoId == yt_id)[0]
                    let fn = `${generateFileName("yt", msg.author.id)}.json`
                    fs.writeFileSync(fn, JSON.stringify(json_data))
                    await int.reply({
                        files: [
                            {
                                attachment: fn,
                                name: fn,
                            }
                        ]
                    })
                    fs.rmSync(fn)
                    return
                }

                action_row.setComponents(last_page, next_page, embeds[current_page].button, embeds[current_page].jsonButton)

                await m.edit({components: [action_row], embeds: [embeds[current_page].embed]})
                await int.deferUpdate()
            })
            if(opts['json']){
                return {content: Buffer.from(JSON.stringify(jsonData)).toString("base64"), status: StatusCode.RETURN}
            }
            return {noSend: true, status: StatusCode.RETURN}
        },
        category: CommandCategory.UTIL,
        help: {
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
    'fetch-time': {
        run: async(msg, args) => {
            let url = args.join(" ") || "https://www.duckduckgo.com"
            try{
                let start = Date.now()
                await fetch.default(url)
                return {content: `${Date.now() - start}ms`, status: StatusCode.RETURN}
            }
            catch(err){
                return {content: "Problem fetching ".concat(url), status: StatusCode.ERR}
            }
        }, category: CommandCategory.UTIL
    },
    replace: {
        run: async (_msg, args, sendCallback) => {
            let opts: Opts;
            [opts, args] = getOpts(args)
            let search = args[0]
            let repl = args[1]
            let text = args.slice(2).join(" ")
            if (opts['n']) {
                text = args.slice(1).join(" ")
                if (!search) {
                    return { content: "no search", status: StatusCode.ERR }
                }
                return { content: text.replaceAll(search, ""), status: StatusCode.RETURN }
            }
            else if (!repl) {
                return { content: "No replacement", status: StatusCode.ERR }
            }
            if (!search) {
                return { content: "no search", status: StatusCode.ERR }
            }
            if (!text) {
                return { content: "no text to search through", status: StatusCode.ERR }
            }
            return { content: text.replaceAll(search, repl || ""), status: StatusCode.RETURN }
        }, category: CommandCategory.UTIL
    },

    "string": createCommand(async (_msg, args) => {
        let operation = args[0]
        let validOperations = ["upper", "lower", "title", "lc", "wc", "bc"]
        let string = args.slice(1).join(" ")
        if (!string) {
            return { content: "No text to manipulate", status: StatusCode.ERR }
        }
        if (!validOperations.includes(operation.toLowerCase())) {
            return { content: `${operation} is not one of: \`${validOperations.join(", ")}\``, status: StatusCode.ERR }
        }
        switch (operation) {
            case "upper":
                return { content: string.toUpperCase(), status: StatusCode.RETURN }
            case "lower":
                return { content: string.toLowerCase(), status: StatusCode.RETURN }
            case "title":
                return { content: string.split(" ").map(v => v[0].toUpperCase() + v.slice(1)).join(" "), status: StatusCode.RETURN }
            case "lc":
                return { content: String(string.split("\n").length), status: StatusCode.RETURN }
            case "wc":
                return { content: String(string.split(" ").length), status: StatusCode.RETURN }
            case "bc":
                return { content: String(string.split(" ").length), status: StatusCode.RETURN }
        }
        return { content: "Invalid Operation", status: StatusCode.ERR }
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

    map: {
        run: async (msg, args, sendCallback) => {
            let string = args[0]
            let functions = args.slice(1).join(" ").split(">map>").map(v => `${prefix}${v.trim()}`)
            if (!functions) {
                return { content: "nothing to  do", status: StatusCode.ERR }
            }
            for (let fn of functions) {
                let replacedFn = fn.replaceAll("{string}", string)
                if (replacedFn === fn) {
                    msg.content = `${fn} ${string}`
                }
                else {
                    msg.content = `${replacedFn}`
                }
                string = getContentFromResult(await doCmd(msg, true) as CommandReturn).trim()
            }
            return { content: string, status: StatusCode.RETURN }
        },
        category: CommandCategory.UTIL
    },

    time: {
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
                    .replaceAll("day", `${date.getDay()}`),
                status: StatusCode.RETURN
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

    /*
    play: {
    run: async(msg, args, sendCallback) => {
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
            await sendCallback("You are about to listen to some wonderful ***t u n e s***")
        })
        player.play(resource)
        })
        return {noSend: true}
    }
    },
    */
    nothappening: {
        run: async (_msg, _args, sendCallback) => {
            return { content: ["reddit - impossible to set up api", "socialblade - socialblade blocks automated web requests", "donate/work command -boring (use last-run)"].join("\n"), status: StatusCode.RETURN }
        },
        category: CommandCategory.META
    },
    "rand-role": {
        run: async (msg, args, sendCallback) => {
            let roles = await msg.guild?.roles.fetch()
            let role = roles?.random()
            if (!role) {
                return { content: "Couldn't get random role", status: StatusCode.ERR }
            }
            let fmt = args.join(" ") || "%n"
            return { allowedMentions: { parse: [] }, content: format(fmt, { n: role.name, i: role.id, c: String(role.color), C: String(role.createdAt), hc: role.hexColor, u: String(role.unicodeEmoji), p: String(role.position), I: String(role.icon) }), status: StatusCode.ERR }
        },
        category: CommandCategory.UTIL
    },
    "cmd-search": {
        run: async (_msg, args, sendCallback) => {
            let search = args.join(" ")
            let regexp;
            try {
                regexp = new RegExp(search)
            }
            catch (err) {
                return { content: "Invalid regex", status: StatusCode.ERR }
            }
            let results = []
            for (let cmd in commands) {
                if (cmd.match(regexp)) {
                    if (commands[cmd].help?.info) {
                        results.push(`**${cmd}**: ${commands[cmd].help?.info}`)
                    }
                    else results.push(cmd)
                }
                else if (commands[cmd].help) {
                    let help = commands[cmd].help
                    if (help?.info?.match(search)) {
                        results.push(`**${cmd}**: ${commands[cmd].help?.info}`)
                    }
                    else if (help?.tags?.includes(search)) {
                        results.push(`**${cmd}**: ${commands[cmd].help?.info}`)
                    }
                }
            }
            if (results.length == 0) {
                return { content: "No results", status: StatusCode.ERR }
            }
            return { content: results.join("\n"), status: StatusCode.RETURN }
        },
        help: {
            info: "Search for commands with a search query"
        },
        category: CommandCategory.META
    },
    "6": {
        run: async (msg, args, sendCallback) => {
            let opts;
            [opts, args] = getOpts(args)
            let getRankMode = opts['rank'] || false
            let content = args.join(" ")
            let requestedUsers = content.split("|")
            if (!requestedUsers[0]) {
                requestedUsers[0] = msg.author.id
            }
            let embeds = []
            const url = `https://mee6.xyz/api/plugins/levels/leaderboard/${globals.GUILD_ID}`
            let data
            try {
                //@ts-ignore
                data = await fetch.default(url)
            }
            catch (err) {
                return { content: "Could not fetch data", status: StatusCode.ERR }
            }
            let text = await data.text()
            if (!text) {
                return { content: "No data found", status: StatusCode.ERR }
            }
            const JSONData = JSON.parse(text)
            function getAmountUntil(userData: any) {
                const desired_rank = userData.level + 1
                const xp_to_desired_rank = 5 / 6 * desired_rank * (2 * desired_rank * desired_rank + 27 * desired_rank + 91)
                const xp_needed = xp_to_desired_rank - userData.xp
                const min_messages_for_next_level = Math.ceil(xp_needed / 26) //26 = max xp per minute
                const max_messages_for_next_level = Math.ceil(xp_needed / 15) //15 = min xp per minute
                const avg_messages_for_next_level = (min_messages_for_next_level + max_messages_for_next_level) / 2
                return [xp_needed, min_messages_for_next_level, max_messages_for_next_level, avg_messages_for_next_level]
            }
            for (let requestedUser of requestedUsers) {
                if (!requestedUser) continue
                let [ruser1, ruser2] = requestedUser.split("-")
                if (ruser1.trim() && ruser2?.trim()) {
                    //@ts-ignore
                    let member1, member2;
                    if (getRankMode) {
                        member1 = JSONData.players[Number(ruser1) - 1]
                        //@ts-ignore
                        member1 = await fetchUser(msg.guild, member1.id)
                        member2 = JSONData.players[Number(ruser2) - 1]
                        //@ts-ignore
                        member2 = await fetchUser(msg.guild, member2.id)
                    }
                    else {
                        //@ts-ignore
                        member1 = await fetchUser(msg.guild, ruser1.trim())
                        //@ts-ignore
                        member2 = await fetchUser(msg.guild, ruser2.trim())
                    }
                    if (!member1) {
                        return { content: `Could not find ${ruser1}`, status: StatusCode.ERR }
                    }
                    if (!member2) {
                        return { content: `Could not find ${ruser2}`, status: StatusCode.ERR }
                    }
                    //@ts-ignore
                    const user1Data = JSONData.players.filter(v => v.id == member1.id)?.[0]
                    //@ts-ignore
                    const user2Data = JSONData.players.filter(v => v.id == member2.id)?.[0]
                    if (!user1Data) {
                        return { content: `No data for ${member1.user.username} found`, status: StatusCode.ERR }
                    }
                    if (!user2Data) {
                        return { content: `No data for ${member2.user.username} found`, status: StatusCode.ERR }
                    }
                    const rank1 = JSONData.players.indexOf(user1Data)
                    const rank2 = JSONData.players.indexOf(user2Data)
                    let [xp_needed1, min_messages_for_next_level1, max_messages_for_next_level1, avg_messages_for_next_level1] = getAmountUntil(user1Data)
                    let [xp_needed2, min_messages_for_next_level2, max_messages_for_next_level2, avg_messages_for_next_level2] = getAmountUntil(user2Data)
                    const embed = new MessageEmbed()
                    embed.setTitle(`${member1.user?.username} - ${member2.user?.username} #${(rank1 + 1) - (rank2 + 1)}`)
                    let redness = Math.floor(Math.abs((user2Data.xp) / (user1Data.xp + user2Data.xp) * 255))
                    let greenness = Math.floor(Math.abs((user1Data.xp) / (user1Data.xp + user2Data.xp) * 255))
                    if (redness > 255)
                        redness = 255
                    if (greenness > 255)
                        greenness = 255
                    let hex = rgbToHex(redness, greenness, 0)
                    embed.setFooter({ text: `color: rgb(${redness}, ${greenness}, 0)` })
                    embed.setColor(hex as ColorResolvable)
                    embed.addField("Level", String(user1Data.level - user2Data.level), true)
                    embed.addField("XP", String(user1Data.xp - user2Data.xp), true)
                    embed.addField("Message Count", String(user1Data.message_count - user2Data.message_count), true)
                    embed.addField("XP for next level", String(xp_needed1 - xp_needed2))
                    embed.addField("Minimum messages for next level", String(min_messages_for_next_level1 - min_messages_for_next_level2), true)
                    embed.addField("Maximum messages for next level", String(max_messages_for_next_level2 - max_messages_for_next_level2), true)
                    embed.addField("Average messages for next level", String(avg_messages_for_next_level1 - avg_messages_for_next_level2), true)
                    embeds.push(embed)
                    continue
                }
                let member: GuildMember;
                if (getRankMode) {
                    member = JSONData.players[Number(requestedUser.trim()) - 1]
                    //@ts-ignore
                    member = await fetchUser(msg.guild, member.id)
                }
                else
                    //@ts-ignore
                    member = await fetchUser(msg.guild, requestedUser.trim())
                if (!member) {
                    member = msg.member as GuildMember
                }
                //@ts-ignore
                const userData = JSONData.players.filter(v => v.id == member.id)?.[0]
                if (!userData) {
                    return { content: `No data for ${member.user.username} found`, status: StatusCode.ERR }
                }
                const rank = JSONData.players.indexOf(userData)
                let [xp_needed, max_messages_for_next_level, min_messages_for_next_level, avg_messages_for_next_level] = getAmountUntil(userData)
                const embed = new MessageEmbed()
                let aurl = member.user.avatarURL()
                if(aurl){
                    embed.setThumbnail(aurl)
                }
                embed.setTitle(`${member.user?.username || member?.nickname} #${rank + 1}`)
                embed.setColor(member.displayColor)
                embed.addField("Level", String(userData.level), true)
                embed.addField("XP", String(userData.xp), true)
                embed.addField("Message Count", String(userData.message_count), true)
                embed.addField("XP for next level", String(xp_needed))
                embed.addField("Minimum messages for next level", String(min_messages_for_next_level), true)
                embed.addField("Maximum messages for next level", String(max_messages_for_next_level), true)
                embed.addField("Average messages for next level", String(avg_messages_for_next_level), true)
                embeds.push(embed)
            }
            return { embeds: embeds, status: StatusCode.RETURN }

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
    "wiki": createCommand(async(msg, _,  sb, opts, args) => {
        let search = args.join(" ").toLowerCase().replaceAll("/", "%2f")
        for(let  file of fs.readdirSync("./wiki")){
            let name = file.toLowerCase()
            if(name.replace(".txt", "") === search){
                return {
                    content: fs.readFileSync(`./wiki/${file}`, "utf-8"),
                    status: StatusCode.RETURN
                }
            }
        }
        return {content: "No results", status: StatusCode.ERR}
    }, CommandCategory.FUN),
    "search-wiki": createCommand(async(msg, _, sb, opts, args) => {
        let search = args.join(" ").toLowerCase()
        let results: {[key: string]: number} = {}
        for(let  file of fs.readdirSync("./wiki")){
            file = file.replaceAll("%2f", "/").slice(0, -4).toLowerCase()
            // let accuracy = 0
            // let sequence = 1
            let lastMatch = 0;
            let matchIndicies: number[] = []
            for(let i = 0; i < search.length; i++){
                // let foundMatch = false
                for(let j = lastMatch; j < file.length; j++){
                    if(file[j] === search[i]){
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
            for(let i = 1; i < matchIndicies.length; i++){
                if(matchIndicies[i] - matchIndicies[i - 1] === 0){
                    continue
                }
                total += matchIndicies.length / (matchIndicies[i] - matchIndicies[i - 1])
            }
            results[file] = total
        }
        if(opts['all']){
            return {content: Object.entries(results).sort((a, b) => b[1] - a[1]).map(v => `**${v[0]}** (${v[1]})`).join("\n"), status: StatusCode.RETURN}
        }
        return {content: Object.entries(results).sort((a, b) => b[1] - a[1]).filter(v => v[1] > 0).map(v => `**${v[0]}** (${v[1]})`).join("\n"), status: StatusCode.RETURN}
    }, CommandCategory.FUN),
    "awiki": createCommand(async(msg, args) => {
        let [title, ...txt] = args.join(" ").split("|")
        title = title.trim().replaceAll("/", "%2f")
        let text = txt.join("|")
        if(fs.existsSync(`./wiki/${title.trim()}.txt`)){
            return {content: `${title} already exists`, status: StatusCode.ERR}
        }
        fs.writeFileSync(`./wiki/${title.trim()}.txt`, text)
        return {content: `created a page called: ${title}`, status: StatusCode.RETURN}

    }, CommandCategory.FUN),
    "ewiki": createCommand(async(msg, _, cb, opts, args) => {
        let [page, type, ...text] = args
        let valid_types = ["new", "n", "append", "a"]
        type = type.toLowerCase()
        if(!valid_types.includes(type)){
            return {content: `type must be one of new, append`, status: StatusCode.ERR}
        }
        if(!fs.existsSync(`./wiki/${page}.txt`)){
            return {content: `${page} does not exist`, status: StatusCode.ERR}
        }
        if(type === "n" || type === "new"){
            fs.writeFileSync(`./wiki/${page}.txt`, text.join(" "))
            return {content: `${page} rewritten`, status: StatusCode.ERR}
        }
        else if(type === "a" || type === "append"){
            let oldData = fs.readFileSync(`./wiki/${page}.txt`, "utf-8")
            fs.writeFileSync(`./wiki/${page}.txt`, oldData + "\n" + args.join(" "))
            return {content: `${page} appended to`, status: StatusCode.ERR}
        }
        return {content: "How did we get here (ewiki)", status: StatusCode.ERR}
    }, CommandCategory.FUN),
    "dwiki": createCommand(async(msg, args) => {
        if(fs.existsSync(`./wiki/${args.join(" ")}.txt`)){
            fs.rmSync(`./wiki/${args.join(" ")}.txt`)
            return {content: `removed: ${args.join(" ")}`, status: StatusCode.RETURN}
        }
        return {content: `${args.join(" ")} not found`, status: StatusCode.ERR}
    }, CommandCategory.META, undefined, null, null, null, (m) => ADMINS.includes(m.author.id)),
    wikipedia: {
        run: async (msg, args, sendCallback) => {
            let opts;
            [opts, args] = getOpts(args)
            let baseurl = "en.wikipedia.org"
            let path = "/wiki/Special:Random"
            if (args[0]) {
                path = `/wiki/${args.join("_")}`
            }
            if (opts['full']) {
                path = String(opts['full'])
            }
            let sentences = parseInt(String(opts['s'])) || 1
            let options = { hostname: baseurl, path: path }
            if (path == "/wiki/Special:Random") {
                https.get(options, req => {
                    let data = new Stream.Transform()
                    req.on("error", err => {
                        console.log(err)
                    })
                    req.on("data", chunk => {
                        data.push(chunk)
                    })
                    req.on("end", async () => {
                        //@ts-ignore
                        let rv = await commands['wiki'].run(msg, [`-full=/wiki/${req.headers.location?.split("/wiki/")[1]}`])
                        await sendCallback(rv)
                    })
                }).end()
                return { content: "Generating random article", status: StatusCode.INFO }
            }
            else {
                let resp
                try {
                    resp = await fetch.default(`https://${baseurl}${path}`)
                }
                catch (err) {
                    return { content: "not found", status: StatusCode.ERR }
                }
                if (resp.headers.get("location")) {
                    await commands['wiki'].run(msg, [`-full=/wiki/${resp.headers.get("location")?.split("/wiki/")[1]}`], sendCallback, {}, args)
                }
                else {
                    let respText = await resp.text()
                    let $ = cheerio.load(respText)
                    let text = $("p").text().trim().split("\n")
                    if (!text.length) {
                        return { content: "nothing", status: StatusCode.ERR }
                    }
                    let rv = text.slice(0, sentences <= text.length ? sentences : text.length).join("\n")
                    return { content: rv, status: StatusCode.ERR }
                }
            }
            return { content: "how did we get here (wikipedia)", status: StatusCode.ERR }
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
        run: async (_msg, args, sendCallback) => {
            let opts;
            [opts, args] = getOpts(args)
            let sep = opts['sep']
            if (sep == undefined) {
                sep = " "
            } else sep = String(sep)
            let words = []
            for (let word of args) {
                if (word.match(/^[aeiou]/)) {
                    words.push(`${word}ay`)
                }
                else {
                    let firstVowel = -1
                    for (let i = 0; i < word.length; i++) {
                        if (word[i].match(/[aeiou]/)) {
                            firstVowel = i
                            break
                        }
                    }
                    if (firstVowel == -1) {
                        words.push(`${word}ay`)
                    }
                    else {
                        words.push(`${word.slice(firstVowel)}${word.slice(0, firstVowel)}ay`)
                    }
                }
            }
            return { content: words.join(sep), status: StatusCode.RETURN }
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
    "api": {
        run: async (msg, args, sendCallback) => {
            let opts: Opts;
            [opts, args] = getOpts(args)
            if (opts['l']) {
                let text = ""
                for (let fn in API.APICmds) {
                    let requirements = API.APICmds[fn].requirements
                    let optional = API.APICmds[fn].optional
                    text += `${fn}: `
                    if (optional) {
                        //@ts-ignore
                        requirements = requirements.filter(v => !optional.includes(v))
                    }
                    text += `${requirements.join(", ")} `
                    if (optional) {
                        text += `${optional.map(v => `[${v}]`).join(", ")}`
                    }
                    text += `\n--------------------\n`
                }
                return { content: text, status: StatusCode.RETURN }
            }
            let fn = args.join(" ")
            if (!Object.keys(API.APICmds).includes(fn)) {
                return { content: `${fn} is not a valid  api function\nrun \`${prefix}api -l\` to see api commands`, status: StatusCode.ERR }
            }
            let apiFn = API.APICmds[fn]
            let argsForFn: { [key: string]: any } = {}
            for (let i in opts) {
                if (!apiFn.requirements.includes(i))
                    continue;
                else {
                    argsForFn[i] = await API.handleApiArgumentType(msg, i, String(opts[i]))
                }
            }
            let missing = []
            for (let req of apiFn.requirements.filter(v => !(apiFn.optional || []).includes(v))) {
                if (argsForFn[req] === undefined) {
                    missing.push(req)
                }
            }
            if (missing.length) {
                return { content: `You are missing the following options: ${missing.join(", ")}`, status: StatusCode.ERR }
            }
            if (apiFn.extra) {
                let extraArgs: { [key: string]: any } = {}
                for (let arg of apiFn.extra) {
                    if (arg === "msg") {
                        extraArgs[arg] = msg
                    }
                }
                return { content: String(await apiFn.exec({ ...extraArgs, ...argsForFn })), status: StatusCode.RETURN }
            }
            return { content: String(await apiFn.exec(argsForFn)), status: StatusCode.RETURN }
        }, category: CommandCategory.META
    },
    "htmlq": {
        run: async (_msg, args, sendCallback) => {
            let [query, ...html] = args.join(" ").split("|")
            let realHTML = html.join("|")
            let $ = cheerio.load(realHTML)(query).text()
            return { content: $, status: StatusCode.RETURN }
        }, category: CommandCategory.UTIL
    },
    "get": {
        run: async (msg, opts, sendCallback) => {
            let operator = opts[0]
            let object = opts[1]
            switch (operator) {
                case "#": {
                    let number = parseInt(opts[2])
                    let data;
                    switch (object) {
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
                            data = bots?.filter(u => u.user.bot).size
                            break
                        }
                        case "command": {
                            data = Object.keys(commands).length
                            break
                        }
                    }
                    if (!data) {
                        return { content: `${object} is invalid`, status: StatusCode.ERR }
                    }
                    if (typeof data === 'number') {
                        return { content: String(data), status: StatusCode.RETURN }
                    }
                    if (number) {
                        return { content: String(data.at(number)), allowedMentions: { parse: [] }, status: StatusCode.RETURN }
                    }
                    else {
                        return { content: String(data.size), allowedMentions: { parse: [] }, status: StatusCode.RETURN }
                    }
                }
                case "rand": {
                    switch (object) {
                        case "channel": {
                            let channels = await msg.guild?.channels.fetch()
                            return { content: channels?.random()?.toString(), status: StatusCode.RETURN }
                        }
                        case "role": {
                            let roles = await msg.guild?.roles.fetch()
                            return { content: String(roles?.random()), allowedMentions: { parse: [] }, status: StatusCode.RETURN }
                        }
                        case "member": {
                            let members = await msg.guild?.members.fetch()
                            return { content: String(members?.random()), allowedMentions: { parse: [] }, status: StatusCode.RETURN }
                        }
                    }
                }
            }
            return { content: "Not a valid option", status: StatusCode.ERR }
        },
        category: CommandCategory.UTIL

    },
    embed: createCommand(
        async (msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            let embed = new MessageEmbed()
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
                        embed.addField(name, value, inlined)
                        break
                    }
                    case "color": {
                        try {
                            embed.setColor(typeArgs.join(" ") as ColorResolvable)
                        }
                        catch (err) {
                            embed.setColor("RED")
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
    calc: {
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
g = VarHolder(${JSON.stringify(vars['__global__'])})
u = VarHolder(${JSON.stringify(vars[msg.author.id]) || "{}"})
print(eval("""${args.join(" ").replaceAll('"', "'")}"""))`
                let moreDat = spawnSync("python3", ["-c", codeStr])
                let sendText = ""
                if (moreDat.stderr.toString("utf-8")) {
                    sendText += moreDat.stderr.toString("utf-8").trim() + '\n'
                }
                if (moreDat.stdout.toString("utf-8")) {
                    sendText += moreDat.stdout.toString("utf-8").trim()
                }
                return { content: sendText, status: StatusCode.RETURN }
            }
            if(opts['f']){
                //TODO: TESTING
                //FIXME: this should work when node-canvas updates and is able to be installed normally
    //             if(isMainThread){
    //                 return new Promise((res, rej) => {
    //                     const worker = new Worker(__filename, {
    //                         workerData: [args, generateSafeEvalContextFromMessage(msg)]
    //                     })
    //                     worker.on("message", (m) => res(m))
    //                     worker.on("error", (r) => rej(r))
    //                     worker.on("exit", code => {
    //                         if(code !== 0){
    //                             rej(new Error(`Exit with code: ${code}`))
    //                         }
    //                     })
    //                 })
    //             }
    //             else{
    //                 let ret = ""
    //                 let str = `
    // "use strict";
    // // const g = arguments[0]; 
    // // const u = arguments[1];
    // const args = arguments[0]
    // // const { uid, uavatar, ubannable, ucolor, uhex, udispname, ujoinedAt, ujoinedTimeStamp, unick, ubot } = arguments[3]
    // return (${args.join(" ")})`
    //                 let func =  Function(str)
    //                 ret = func(...workerData)
    //                 parentPort?.postMessage(ret)
    //             }
//                 try{
//                     let ans = await new Promise((res, rej) => {
//                         const timer = setTimeout(() => rej(new Error("timeout")), 3000)
//                         setInterval(() => console.log(timer), 3000)
//                         callFunc(vars["__global__"], vars[msg.author.id] || {}, args, generateSafeEvalContextFromMessage(msg))
//                             .then(data => res(data))
//                             .finally(() => clearTimeout(timer))
//                     })
//                     return {content: stringifyFn(ans)}
//                 }
//                 catch(err){
//                     return {content: String(err) }
//                 }
            }
            let ret: string = ""
            try {
                ret = stringifyFn(safeEval(args.join(" "), { ...generateSafeEvalContextFromMessage(msg), args: args, lastCommand: lastCommand[msg.author.id], g: vars["__global__"], u: vars[msg.author.id] || {} }, { timeout: 3000 }))
            }
            catch (err) {
                console.log(err)
            }
            if (ret && ret.length) {
                setVar("__calc", ret, msg.author.id)
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
    del: {
        run: async (msg, args, sendCallback) => {
            let opts;
            [opts, args] = getOpts(args)
            if (!opts['N']) return { noSend: true, delete: true, status: StatusCode.RETURN}
            msg.content = `${prefix}${args.join(" ")}`
            await doCmd(msg, false)
            return { noSend: true, delete: true, status: StatusCode.RETURN }
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
        run: async (msg, args, sendCallback) => {
            let [condition, cmd] = args.join(" ").split(";")
            if (!cmd) {
                return { content: "You are missing a ; after the condition", status: StatusCode.ERR }
            }
            cmd = cmd.split(";end")[0]
            let success;
            if(condition.trim().startsWith(`(${prefix}`)){
                let command_to_run = ""
                let check = ""
                let expected = ""
                let parenCount = 1

                let end_of_command = 0;
                let end_of_check = 0;

                for(let i = condition.indexOf("(") + 1; i < condition.length; i++){
                    let ch = condition[i]
                    if(ch === "("){
                        parenCount++;
                    }
                    else if(ch === ")"){
                        parenCount--;
                    }
                    if(parenCount === 0){
                        end_of_command = i + 1;
                        break;
                    }
                    command_to_run += ch
                }
                for(let i = end_of_command; i < condition.length; i++){
                    if(condition[i] === "("){
                        end_of_check = i + 1;
                        break;
                    }
                    check += condition[i];
                }
                parenCount = 1;
                for(let i = end_of_check; i < condition.length; i++){
                    let ch = condition[i]
                    if(ch === "("){
                        parenCount++;
                    }
                    else if(ch === ")"){
                        parenCount--;
                    }
                    if(parenCount === 0){
                        end_of_command = i + 1;
                        break;
                    }
                    expected += ch;
                }
                let oldContent = msg.content;
                msg.content = command_to_run;
                let content = getContentFromResult(await doCmd(msg, true) as CommandReturn).trim();
                expected = expected.trim()
                msg.content = oldContent;
                switch(check.trim().toLowerCase()){
                    case "==": {
                        success = content === expected;
                        break;
                    }
                    case ">": {
                        success = Number(content) > Number(expected);
                        break;
                    }
                    case "f>": {
                        success = parseFloat(content) > parseFloat(expected);
                        break;
                    }
                    case "i>": {
                        success = parseInt(content) > parseInt(expected);
                        break;
                    }
                    case "<": {
                        success = Number(content) < Number(expected);
                        break;
                    }
                    case "f<": {
                        success = parseFloat(content) < parseFloat(expected);
                        break;
                    }
                    case "i<": {
                        success = parseInt(content) < parseInt(expected);
                        break;
                    }
                    case ">=": {
                        success = Number(content) >= Number(expected);
                        break;
                    }
                    case "f>=": {
                        success = parseFloat(content) >= parseFloat(expected);
                        break;
                    }
                    case "i>=": {
                        success = parseInt(content) >= parseInt(expected);
                        break;
                    }
                    case "<=": {
                        success = Number(content) <= Number(expected);
                        break;
                    }
                    case "f<=": {
                        success = parseFloat(content) <= parseFloat(expected);
                        break;
                    }
                    case "i<=": {
                        success = parseInt(content) <= parseInt(expected);
                        break;
                    }
                    case ":": {
                        try{
                            success = !!content.match(expected);
                        }
                        catch(err){
                            success = false;
                        }
                        break;
                    }
                    case "includes": {
                        success = content.includes(expected)
                        break;
                    }
                }
            }
            if ((success !== undefined && success) || (success === undefined && safeEval(condition, { ...generateSafeEvalContextFromMessage(msg), args: args, lastCommand: lastCommand[msg.author.id] }, { timeout: 3000 }))) {
                msg.content = `${prefix}${cmd.trim()}`
                return await doCmd(msg, true) as CommandReturn
            }
            let elseCmd = args.join(" ").split(`${prefix}else;`).slice(1).join(`${prefix}else;`)?.trim()
            if (elseCmd) {
                msg.content = `${prefix}${elseCmd.trim()}`
                return await doCmd(msg, true) as CommandReturn
            }
            return { content: "?", status: StatusCode.ERR }
        },
        category: CommandCategory.META
    },
    getimg: {
        run: async (msg, _, sendCallback, opts, args) => {
            let img = getImgFromMsgAndOpts(opts, msg)
            if(opts['pop'] && msg.attachments.at(0)){
                msg.attachments.delete(msg.attachments.keyAt(0) as string)
            }
            return { content: String(img), status: StatusCode.RETURN }
        },
        help: {
            info: "find the link to the image that would be used if you gave the same options to an image command",
            options: {
                img: {
                    description: "The image link to use"
                },
                pop: {
                    description: "If given, remove the attachment from message"
                }
            }
        },
        category: CommandCategory.META
    },
    "argc": {
        run: async (_msg, args) => {
            return { content: String(args.length), status: StatusCode.RETURN }
        },
        help: {
            info: "Prints the number of arguments given to this command"
        },
        category: CommandCategory.META
    },
    opts: {
        run: async (_msg, _args, _sendCallback, opts) => {
            let disp = ""
            for (let key in opts) {
                disp += `**${key}**: \`${opts[key]}\`\n`
            }
            return { content: disp || "#!N/A", status: StatusCode.RETURN }
        },
        help: {
            info: "Print the opts given"
        },
        category: CommandCategory.META
    },
    echo: {
        run: async (msg: Message, _, __, opts, args) => {
            let wait = parseFloat(String(opts['wait'])) || 0
            let dm = Boolean(opts['dm'] || false)
            let embedText = opts['e'] || opts['embed']
            let embed
            if (embedText) {
                embed = new MessageEmbed()
                if (embedText !== true)
                    embed.setTitle(embedText)
                let img;
                //esentially if the user put `-img=` or `-img`
                if (opts['img'] == "" || opts['img'] === true) {
                    img = null
                }
                else img = getImgFromMsgAndOpts(opts, msg)
                if (img) {
                    embed.setImage(String(img))
                }
                let color
                if (color = opts['color'] || opts['e-color'] || opts['embed-color']) {
                    try {
                        embed.setColor(color as ColorResolvable)
                    }
                    catch (err) {
                    }
                }
            }
            let stringArgs = args.join(" ")
            let files = msg.attachments?.toJSON()
            if (!stringArgs && !embed && !files.length) {
                return {
                    content: "cannot send nothing",
                    status: StatusCode.ERR
                }
            }
            if (wait) {
                await new Promise((res) => setTimeout(res, wait * 1000))
            }
            let rv: CommandReturn = { delete: !(opts["D"] || opts['no-del']), deleteFiles: false, status: StatusCode.RETURN }
            if (dm) {
                rv['dm'] = true
            }
            if (stringArgs) {
                rv["content"] = stringArgs
            }
            if (files.length) {
                rv["files"] = files as CommandFile[]
            }
            if (embed) {
                rv["embeds"] = [embed]
            }
            if (opts['recurse']) {
                rv.recurse = true
            }
            if(opts['status']){
                let status = {
                    "return": StatusCode.RETURN,
                    "err": StatusCode.ERR,
                    "error": StatusCode.ERR,
                    "prompt": StatusCode.PROMPT,
                    "info": StatusCode.INFO,
                    "warning": StatusCode.WARNING
                }[String(opts['status']).toString()]
                if(status){
                    rv.status = status
                }
            }
            if (wait) {
                await new Promise(res => setTimeout(res, wait * 1000))
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
                },
                "wait": {
                    description: "The seconds to wait before deleting and sending the message"
                },
                "status": {
                    description: `The status  code of the  command, can be:
<ul>
    <li>
    return
    </li>
    <li>
    err
    </li>
    <li>
    info
    </li>
    <li>
    prompt
    </li>
    <li>
    warning
    </li>
</ul>
`
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
        run: async (msg, _, sendCallback, opts, args) => {
            let content = opts['content']
            let delAfter = NaN
            if (opts['timealive'])
                delAfter = parseInt(String(opts['timealive']))
            if (typeof content === 'boolean') {
                content = `button:${msg.author.id}`
            }
            let text = args.join(" ") || "hi"
            let button = new MessageButton({ customId: `button:${msg.author.id}`, label: text, style: "PRIMARY" })
            let row = new MessageActionRow({ type: "BUTTON", components: [button] })
            let m = await handleSending(msg, { components: [row], content: content, status: StatusCode.PROMPT }, sendCallback)
            let collector = m.createMessageComponentCollector({ filter: interaction => interaction.customId === `button:${msg.author.id}` && interaction.user.id === msg.author.id || opts['anyone'] === true, time: 30000 })
            collector.on("collect", async (interaction) => {
                if (interaction.user.id !== msg.author.id && opts['anyone'] !== true) {
                    return
                }
                if (opts['say']) {
                    await interaction.reply({ content: String(opts['say']) })
                }
                else {
                    await interaction.reply({ content: text })
                }
            })
            if (!isNaN(delAfter)) {
                setTimeout(async () => await m.delete(), delAfter * 1000)
            }
            return { noSend: true, status: StatusCode.RETURN }
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
                },
                "anyone": {
                    description: "Allow anyone to click the button"
                }
            }
        },
        category: CommandCategory.FUN
    },
    "pcount": {
        run: async (_msg, args) => {
            let id = args[0]
            if (!id) {
                return {status: StatusCode.ERR, content: "no id given" }
            }
            let str = ""
            for (let key in globals.POLLS[`poll:${id}`]) {
                str += `${key}: ${globals.POLLS[`poll:${id}`]["votes"][key].length}\n`
            }
            return { content: str, status: StatusCode.RETURN}
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
        run: async (_msg, _, _sendCallback, opts, args) => {
            let actionRow = new MessageActionRow()
            let id = String(Math.floor(Math.random() * 100000000))
            args = args.join(" ").split("|")
            let choices = []
            for (let arg of args) {
                if (!arg.trim()) {
                    continue
                }
                choices.push({ label: arg, value: arg })
            }
            if (choices.length < 1) {
                return {status: StatusCode.ERR, content: "no options given" }
            }
            let selection = new MessageSelectMenu({ customId: `poll:${id}`, placeholder: "Select one", options: choices })
            actionRow.addComponents(selection)
            globals.POLLS[`poll:${id}`] = { title: String(opts['title'] || "") || "Select one", votes: {} }
            return { components: [actionRow], content: `**${String(opts['title'] || "") || "Select one"}**\npoll id: ${id}`, status: StatusCode.PROMPT }
        },
        help: {
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
        run: async (msg, _, _sendCallback, opts, args) => {
            let link = args[0]
            if (!link) {
                link = String(getImgFromMsgAndOpts(opts, msg))
            }
            if (!link)
                return { content: "no link given", status:  StatusCode.ERR }
            try {
                await client.user?.setAvatar(link)
            }
            catch (err) {
                console.log(err)
                return { content: "could not set pfp", status:  StatusCode.ERR }
            }
            return { content: 'set pfp', delete: Boolean(opts['d'] || opts['delete']), status: StatusCode.RETURN }
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
        run: async (_msg: Message, args: ArgumentList) => {
            let uptime = client.uptime
            if (!uptime) {
                return {
                    content: "No uptime found",
                    status: StatusCode.ERR
                }
            }
            let fmt = args[0] || "%d:%h:%m:%s.%M"
            let days, hours, minutes, seconds, millis;
            seconds = Math.floor(uptime / 1000)
            millis = String(uptime / 1000).split(".")[1]
            days = 0
            hours = 0
            minutes = 0
            while (seconds >= 60) {
                seconds -= 60
                minutes += 1
            }
            while (minutes >= 60) {
                minutes -= 60
                hours += 1
            }
            while (hours >= 24) {
                hours -= 24
                days += 1
            }
            return {
                content: format(fmt, { "d": `${days}`, "h": `${hours}`, "m": `${minutes}`, "s": `${seconds}`, "M": `${millis}` }),
                status: StatusCode.RETURN
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
        run: async (_msg: Message, _: ArgumentList, _sendCallback, opts, args) => {
            const low = parseFloat(args[0]) || 0
            const high = parseFloat(args[1]) || 100
            const count = parseInt(args[2]) || 1
            if(count > 50000){
                return {content: "Too many numbers", status: StatusCode.ERR}
            }
            let answers = []
            for(let i  = 0; i < count; i++){
                let ans = Math.random() * (high - low) + low
                if (opts['round']) {
                    ans = Math.floor(ans)
                }
                answers.push(ans)
            }
            return {
                content: answers.join(String(opts['s'] || ", ")),
                status: StatusCode.ERR
            }
        },
        help: {
            arguments: {
                low: {
                    "description": "the lowest number (default: 0)"
                },
                high: {
                    "description": "the highest number (default: 100)"
                },
                count: {
                    description: "The amount of nubers to generate"
                }
            },
            options: {
                round: {
                    description: "Round the number"
                },
                s: {
                    description: "What to seperate each number by"
                }
            }
        },
        category: CommandCategory.UTIL
    },
    roles: {
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
                let embed = new MessageEmbed()
                embed.setTitle(`Roles for: ${user?.user.username}`)
                embed.addField("Role count", String(roles.cache.size))
                let text = roles.cache.toJSON().join(" ")
                let backup_text = roles.cache.map(v => v.name).join(" ")
                if(text.length <= 1024){
                    embed.addField("Roles", roles.cache.toJSON().join(" "))
                }
                else if(backup_text.length <= 1024){
                    embed.addField("Roles", backup_text)
                }
                else{
                    embed.addField("Roles", "Too many to list")
                }
                embeds.push(embed)
            }
            return {
                embeds: embeds,
                status: StatusCode.RETURN
            }
        },
        category: CommandCategory.UTIL
    },
    "create-file": {
        run: async (_msg, args, sendCallback) => {
            let file = args[0]
            if (!file) {
                return { content: "No file specified", status: StatusCode.ERR }
            }
            fs.writeFileSync(`./command-results/${file}`, "")
            return { content: `${file} created`, status: StatusCode.RETURN }
        },
        permCheck: m => ADMINS.includes(m.author.id),
        category: CommandCategory.META
    },
    "remove-file": {
        run: async (msg, args, sendCallback) => {
            let file = args[0]
            if (!file) {
                return { content: "No file specified", status: StatusCode.ERR }
            }
            if (!fs.existsSync(`./command-results/${file}`)) {
                return { content: `${file} does not exist`, status: StatusCode.ERR }
            }
            fs.rmSync(`./command-results/${file}`)
            return { content: `${file} removed`, status: StatusCode.ERR }
        }, category: CommandCategory.META,
        permCheck: m => ADMINS.includes(m.author.id)
    },
    "rt": {
        run: async (msg, _, sendCallback, opts, args) => {
            if (opts['t']) {
                handleSending(msg, {content: "SEND A MESSAGE NOWWWWWWWWWWWWWWWWWWWWWWWWW", status: -1}, sendCallback).then(_m => {
                    try {
                        let collector = msg.channel.createMessageCollector({ filter: m => m.author.id == msg.author.id, time: 3000 })
                        let start = Date.now()
                        collector.on("collect", async (_m) => {
                            await handleSending(msg, {content: `${Date.now() - start}ms`, status: StatusCode.RETURN}, sendCallback)
                            collector.stop()
                        })
                    }
                    catch (err) {
                    }
                })
            }
            else {
                let button = new MessageButton({ customId: `button:${msg.author.id}`, label: "CLICK THE BUTTON NOWWWWWWW !!!!!!!", style: "DANGER" })
                let row = new MessageActionRow({ type: "BUTTON", components: [button] })
                let start = Date.now()
                let message = await handleSending(msg, { components: [row], status: StatusCode.PROMPT }, sendCallback)
                let collector = message.createMessageComponentCollector({ filter: interaction => interaction.user.id === msg.author.id && interaction.customId === `button:${msg.author.id}` })
                collector.on("collect", async (interaction) => {
                    await interaction.reply({ content: `${Date.now() - start}ms` })
                })
            }
            return { noSend: true, status: StatusCode.RETURN }
        },
        help: {
            info: "Gets your truely 100% accurate reaction time"
        },
        category: CommandCategory.FUN
    },
    "search-cmd-file": {
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
        }, category: CommandCategory.UTIL
    },
    "rand-line": {
        run: async (_msg, args, sendCallback) => {
            let file = args[0]
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
            const lines = text.split("\n").map((str) => str.split(": ").slice(1).join(": ").replace(/;END$/, "")).filter((v) => v)
            return { content: choice(lines), status: StatusCode.RETURN }
        },
        help: {
            info: "Gets a random line from a file"
        },
        category: CommandCategory.META

    },
    nick: {
        //@ts-ignore
        run: async (msg, _, sendCallback, opts, args) => {
            if(args.join(" ").length > 31){
                return {content: "Too long", status: StatusCode.ERR}
            }
            try {
                (await msg.guild?.members.fetch(client.user?.id || ""))?.setNickname(args.join(" "))
            }
            catch (err) {
                return { content: "Could not set name", statu: StatusCode.ERR }
            }
            return {
                content: `Changed name to \`${args.join(" ")}\``,
                //@ts-ignore
                delete: opts['d'] || opts['delete'],
                status: StatusCode.RETURN
            }
        },
        category: CommandCategory.FUN

    },
    uno: {
        run: async (msg, _, sendCallback, opts, args) => {
            let requestPlayers = args.join(" ").trim().split("|").map(v => v.trim()).filter(v => v.trim())
            //@ts-ignore
            let players: (GuildMember)[] = [await fetchUser(msg.guild, msg.author.id)]
            for (let player of requestPlayers) {
                //@ts-ignore
                let p = await fetchUser(msg.guild, player)
                if (!p) {
                    await handleSending(msg, {content: `${player} not found`, status: StatusCode.ERR}, sendCallback)
                    continue
                }
                players.push(p)
            }
            if (players.length == 1) {
                return { content: "No one to play with :(", status: StatusCode.ERR }
            }
            let max = parseInt(String(opts["max"])) || 9
            if (max > 1000) {
                await handleSending(msg, {content: "The maximum is to high, defaulting to 1000", status: StatusCode.WARNING})
                max = 1000
            }
            let cards = uno.createCards(max, { enableGive: opts['give'], enableShuffle: opts['shuffle'], "enable1": opts['1'] })
            let deck = new uno.Stack(cards)
            let pile = new uno.Stack([])
            let playerData: { [k: string]: uno.Hand } = {}
            let order = []
            for (let player of players) {
                playerData[player.id] = new uno.Hand(7, deck)
                order.push(player.id)
            }
            let forcedDraw = 0
            let turns = cycle(order, (i: any) => {
                let playerIds = Object.keys(playerData)
                //@ts-ignore
                fetchUser(msg.guild, playerIds[i % playerIds.length]).then((u: any) => {
                    if (players.map(v => v.id).indexOf(going) < 0) {
                        going = turns.next().value
                        return
                    }
                    if (forcedDraw) {
                        handleSending(msg, {content: `<@${going}> is forced to draw ${forcedDraw} cards`, status: StatusCode.INFO},)
                        for (let i = 0; i < forcedDraw; i++) {
                            let rv = playerData[going].draw(deck)
                            if (!rv) {
                                handleSending(msg, {content: "Deck empty, shuffling pile into deck", status: StatusCode.INFO},)
                                pile.shuffle()
                                deck = new uno.Stack(pile.cards)
                                pile = new uno.Stack([])
                            }
                        }
                        forcedDraw = 0
                    }
                    if (!(pile.top()?.type == 'skip')) {
                        let player = players[players.map(v => v.id).indexOf(going)]
                        let send = displayStack(playerData[player.id])
                        send += "\n-------------------------"
                        player.send({ content: send })
                        if (pile.cards.length)
                            player.send({ content: `stack:\n${pile.cards[pile.cards.length - 1].display()}` })
                    }
                    if (pile.cards.length) {
                        handleSending(msg, { content: `${u}, it's your turn\nstack:\n${pile.cards[pile.cards.length - 1].display()}`, status: StatusCode.INFO },)
                    }
                    else {
                        handleSending(msg, { content: `${u}, it's your turn`, status: StatusCode.INFO },)
                    }
                })
            })
            let going = turns.next().value
            let cardsPlayed = 0
            let cardsDrawn = 0
            let choosing = false
            function displayStack(stack: uno.Stack | uno.Hand, count = -1) {
                let send = "card\n"
                if (count < 0) count = stack.cards.length
                for (let i = 0; i < count; i++) {
                    send += `${i + 1}:\n`
                    send += stack.cards[i]?.display()
                }
                return send
            }
            for (let player of players) {
                await player.user.createDM()
                let collection = player.user.dmChannel?.createMessageCollector({ filter: (m) => (!isNaN(Number(m.content)) || m.content.toLowerCase().trim() == 'draw' || m.content.toLowerCase() == "stack" || m.content.toLowerCase() == "stop" || m.content.toLowerCase() == 'cards') && choosing == false })
                if (!collection) {
                    return { content: `Couldnt listen in ${player}'s dms`, status: StatusCode.ERR }
                }
                collection.on("collect", async (m) => {
                    if (m.content.toLowerCase() == "stop") {
                        players = players.filter(v => v.id != m.author.id)
                        if (players.length == 0) {
                            await handleSending(msg, {content: "game over", status: StatusCode.RETURN},)
                        }
                        collection?.stop()
                        if (m.author.id == client.user?.id) return
                        await handleSending(msg, {content: `${m.author} quit`, status: StatusCode.RETURN},)
                        going = turns.next().value
                        return
                    }
                    if (playerData[player.id].cards.length <= 0) {
                        await handleSending(msg, {content: `${player} wins!!\n${cardsPlayed} cards were played\n${cardsDrawn} cards were drawn`, status: StatusCode.RETURN})
                        for (let player of players) {
                            await player.send("STOP")
                        }
                        collection?.stop()
                        return
                    }
                    if (player.id != going) return
                    if (m.content.toLowerCase() == "stack") {
                        let text = displayStack(pile)
                        if (text.length > 1900) {
                            text = ""
                            for (let i = pile.cards.length - 1; i > pile.cards.length - 10; i--) {
                                text += `${pile.cards[i].display()}\n`
                            }
                        }
                        await m.channel.send(text)
                        return
                    }
                    if (m.content.toLowerCase() == "cards") {
                        await m.channel.send(displayStack(playerData[player.id]))
                        return
                    }
                    if (m.content.toLowerCase() == 'draw') {
                        let rv = playerData[player.id].draw(deck)
                        cardsDrawn++
                        if (!rv) {
                            await handleSending(msg, {content: "Deck empty, shuffling pile into deck", status: StatusCode.INFO})
                            pile.shuffle()
                            deck = new uno.Stack(pile.cards)
                            pile = new uno.Stack([])
                            playerData[player.id].draw(deck)
                        }
                        await handleSending(msg, {content: `${player} drew a card`, status: StatusCode.INFO})
                        let send = displayStack(playerData[player.id])
                        send += "\n-------------------------"
                        await m.channel.send(send)
                        await handleSending(msg, {content: `**${player.nickname || player.user.username} has ${playerData[player.id].cards.length} cards**`, status: StatusCode.INFO})
                        if (pile.cards.length)
                            player.send({ content: `stack:\n${pile.cards[pile.cards.length - 1].display()}` })
                        return
                    }
                    let selectedCard = playerData[player.id].cards[Number(m.content) - 1]
                    if (!selectedCard) {
                        await player.user.send(`${m.content} is not a valid choice`)
                    }
                    else if (selectedCard.type == "+2") {
                        if (selectedCard.canBePlayed(pile)) {
                            cardsPlayed++;
                            forcedDraw = 2
                            pile.add(selectedCard)
                            playerData[player.id].remove(Number(m.content) - 1)
                            going = turns.next().value
                        }
                        else {
                            await m.channel.send("You cannot play that card")
                        }
                    }
                    else if (selectedCard.type == 'shuffle-stack') {
                        if (selectedCard.canBePlayed(pile)) {
                            cardsPlayed++
                            playerData[player.id].remove(Number(m.content) - 1)
                            await handleSending(msg, {content: "**stack was shuffled**", status: StatusCode.INFO},)
                            pile.add(selectedCard)
                            pile.shuffle()
                            going = turns.next().value
                        }
                        else {
                            await handleSending(msg, {content: "You cannot play that card", status: StatusCode.ERR})
                        }
                    }
                    else if (selectedCard.type == 'give') {
                        if (selectedCard.canBePlayed(pile)) {
                            cardsPlayed++;
                            playerData[player.id].remove(Number(m.content) - 1)
                            await player.send({ content: displayStack(playerData[m.author.id]) })
                            await player.send("Pick a card from your deck to give to a random opponent")
                            choosing = true
                            try {
                                let cardM = (await m.channel.awaitMessages({ max: 1, time: 20000 })).at(0)
                                while (!cardM) {
                                    await m.channel.send("Not a valid card")
                                    cardM = (await m.channel.awaitMessages({ max: 1, time: 20000 })).at(0)
                                }
                                while (!parseInt(cardM?.content as string)) {
                                    await m.channel.send("Not a valid card")
                                    cardM = (await m.channel.awaitMessages({ max: 1, time: 20000 })).at(0)
                                }
                                let n = parseInt(cardM?.content as string)
                                let selectedRemovealCard = playerData[m.author.id].cards[n - 1]
                                let tempPlayerData = Object.keys(playerData).filter(v => v != m.author.id)
                                let randomPlayer = choice(tempPlayerData)
                                let hand = playerData[randomPlayer]
                                playerData[m.author.id].remove(selectedRemovealCard)
                                hand.add(selectedRemovealCard)
                            }
                            catch (err) {
                                console.log(err)
                                choosing = false
                            }
                            choosing = false
                            pile.add(selectedCard)
                            going = turns.next().value
                        }
                        else {
                            await m.channel.send("You cannot play that card")
                        }
                    }
                    else if (selectedCard.type == '-1') {
                        if (selectedCard.canBePlayed(pile)) {
                            cardsPlayed++;
                            playerData[player.id].remove(Number(m.content) - 1)
                            pile.add(selectedCard)
                            let randomPlayer = choice(players.filter(v => v.id != player.id)).id
                            await handleSending(msg, {content: `**${player} played the ${selectedCard.color} -1 card, and <@${randomPlayer}> lost a card**`, status: StatusCode.INFO})
                            let newTopCard = playerData[randomPlayer].cards[0]
                            playerData[randomPlayer].remove(0)
                            pile.add(newTopCard)
                            going = turns.next().value
                        }
                    }
                    else if (selectedCard.type == "wild") {
                        cardsPlayed++;
                        await player.send("Pick a color\nred, green, yellow, or blue")
                        try {
                            let colorM = (await m.channel.awaitMessages({ max: 1, time: 20000 })).at(0)
                            if (!colorM) {
                                await handleSending(msg, {content: "User picked incorrect color, using red", status: StatusCode.ERR})
                                selectedCard.color = "red"
                            }
                            else if (["red", "yellow", "green", "blue"].includes(colorM.content.toLowerCase().trim())) {
                                selectedCard.color = colorM.content
                            }
                            else {
                                await handleSending(msg, {content: "User picked incorrect color, using red", status: StatusCode.ERR})
                                selectedCard.color = "red"
                            }
                        }
                        catch (err) {
                            console.log(err)
                            await handleSending(msg, {content: "Something went wrong, defaulting to red", status: StatusCode.ERR})
                            selectedCard.color = "red"
                        }
                        pile.add(selectedCard)
                        playerData[player.id].remove(Number(m.content) - 1)
                        going = turns.next().value
                    }
                    else if (selectedCard.type == "wild+4") {
                        cardsPlayed++;
                        await player.send("Pick a color\nred, green, yellow, or blue")
                        try {
                            let colorM = (await m.channel.awaitMessages({ max: 1, time: 20000 })).at(0)
                            console.log(colorM?.content)
                            if (!colorM) {
                                await handleSending(msg, {content: "User picked incorrect color, using red", status: StatusCode.ERR})
                                selectedCard.color = "red"
                            }
                            else if (["red", "yellow", "green", "blue"].includes(colorM.content.toLowerCase().trim())) {
                                selectedCard.color = colorM.content
                            }
                            else {
                                await handleSending(msg, {content: "User picked incorrect color, using red", status: StatusCode.ERR})
                                selectedCard.color = "red"
                            }
                        }
                        catch (err) {
                            console.log(err)
                            await handleSending(msg, {content: "Something went wrong, defaulting to red", status: StatusCode.ERR})
                            selectedCard.color = "red"
                        }
                        pile.add(selectedCard)
                        playerData[player.id].remove(Number(m.content) - 1)
                        forcedDraw = 4
                        going = turns.next().value
                    }
                    else if (selectedCard.type == 'skip') {
                        if (selectedCard.canBePlayed(pile)) {
                            cardsPlayed++
                            let skipped = turns.next().value
                            await handleSending(msg, {content: `<@${skipped}> was skipped`, status: StatusCode.INFO})
                            going = turns.next().value
                            await new Promise(res => {
                                pile.add(selectedCard)
                                playerData[player.id].remove(Number(m.content) - 1)
                                let gP = players.filter(v => v.id == going)[0]
                                let send = displayStack(playerData[going])
                                send += "\n-------------------------"
                                gP.send({ content: send })
                                if (pile.cards.length)
                                    gP.send({ content: `stack:\n${pile.cards[pile.cards.length - 1].display()}` })
                                res("")
                            })
                        }
                        else {
                            await m.channel.send("You cannot play that card")
                        }
                    }
                    else {
                        if (selectedCard.canBePlayed(pile)) {
                            cardsPlayed++
                            pile.add(selectedCard)
                            playerData[player.id].remove(Number(m.content) - 1)
                            going = turns.next().value
                        }
                        else {
                            await m.channel.send("You cannot play that card")
                        }
                    }
                    await handleSending(msg, {content: `**${player.nickname || player.user.username} has ${playerData[player.id].cards.length} cards**`, status:  StatusCode.INFO})
                    if (playerData[player.id].cards.length <= 0) {
                        await handleSending(msg, {content: `${player} wins!!\n${cardsPlayed} cards were played\n${cardsDrawn} cards were drawn`, status: StatusCode.RETURN})
                        for (let player of players) {
                            await player.send("STOP")
                        }
                        collection?.stop()
                    }
                })
            }
            return { content: "Starting game", status: StatusCode.INFO }
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
        run: async (msg, args, sendCallback) => {
            https.get(`https://www.google.com/search?q=${encodeURI(args.join(" "))}+game`, resp => {
                let data = new Stream.Transform()
                resp.on("data", chunk => {
                    data.push(chunk)
                })
                resp.on("end", async () => {
                    let html = data.read().toString()
                    let embed = new MessageEmbed()
                    //winner should be in *****
                    let [inning, homeTeam, awayTeam] = html.match(/<div class="BNeawe s3v9rd AP7Wnd lRVwie">(.*?)<\/div>/g)
                    try {
                        inning = inning.match(/span class=".*?">(.*?)<\//)[1]
                            .replace(/&#(\d+);/gi, function(_match: any, numStr: string) {
                                var num = parseInt(numStr, 10);
                                return String.fromCharCode(num);
                            });
                    }
                    catch (err) {
                        await handleSending(msg, {content: "No results", status: StatusCode.ERR}, sendCallback)
                        return
                    }
                    homeTeam = homeTeam.match(/div class=".*?">(.*?)<\//)[1].replace(/<(?:span|div) class=".*?">/, "")
                    awayTeam = awayTeam.match(/div class=".*?">(.*?)<\//)[1].replace(/<(?:span|div) class=".*?">/, "")
                    let homeScore, awayScore
                    try {
                        [homeScore, awayScore] = html.match(/<div class="BNeawe deIvCb AP7Wnd">(\d*?)<\/div>/g)
                    }
                    catch (err) {
                        await handleSending(msg, {content: "Failed to get data", status: StatusCode.ERR}, sendCallback)
                        return
                    }
                    homeScore = parseInt(homeScore.match(/div class=".*?">(.*?)<\//)[1])
                    awayScore = parseInt(awayScore.match(/div class=".*?">(.*?)<\//)[1])
                    embed.setTitle(`${args.join(" ")}`)
                    if (awayScore >= homeScore) {
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
                    await handleSending(msg, { embeds: [embed], status: StatusCode.RETURN}, sendCallback)
                })
            }).end()
            return {
                content: "getting data",
                status: StatusCode.INFO
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
        run: async (msg, args, sendCallback) => {
            let opts: Opts
            [opts, args] = getOpts(args)
            let min = parseInt(opts["min"] as string) || 5
            let max = parseInt(opts["max"] as string) || 5
            if (min > max) {
                max = min
            }
            let words = fs.readFileSync(`./command-results/wordle`, "utf-8").split(";END").map(v => v.split(" ").slice(1).join(" ").trim()).filter(v => v.length <= max && v.length >= min ? true : false)
            if (words.length == 0) {
                return { content: "no words found", status: StatusCode.ERR }
            }
            let word = choice(words)
            let guesses = []
            let collector = msg.channel.createMessageCollector({ filter: m => m.author.id == msg.author.id && (m.content.length >= min && m.content.length <= max) || m.content == "STOP" })
            let guessCount = parseInt(opts["lives"] as string) || 6
            let display: string[] = []
            await handleSending(msg, {content: "key: **correct**, *wrong place*, `wrong`", status: StatusCode.INFO}, sendCallback)
            await handleSending(msg, {content: `The word is ${word.length} characters long`, status: StatusCode.INFO}, sendCallback)
            for (let i = 0; i < guessCount; i++) {
                display.push(mulStr("⬛ ", word.length))
            }
            await handleSending(msg, {content: display.join("\n"), status: StatusCode.INFO}, sendCallback)
            let letterCount: { [k: string]: number } = {}
            for (let letter of word) {
                if (letterCount[letter] === undefined) {
                    letterCount[letter] = 1
                }
                else {
                    letterCount[letter] += 1
                }
            }
            collector.on("collect", async (m) => {
                if (m.content == "STOP") {
                    collector.stop()
                    await handleSending(msg, {content: "stopped", status: StatusCode.RETURN}, sendCallback)
                    return
                }
                guesses.push(m.content)
                let nextInDisplay = ""
                let guessLetterCount: { [key: string]: number } = {}
                for (let i = 0; i < word.length; i++) {
                    let correct = word[i]
                    let guessed = m.content[i]
                    if (guessLetterCount[guessed] === undefined) {
                        guessLetterCount[guessed] = 1
                    } else {
                        guessLetterCount[guessed] += 1
                    }
                    if (correct == guessed)
                        nextInDisplay += `**${guessed}** `
                    else if (word.includes(guessed) && guessLetterCount[guessed] <= letterCount[guessed])
                        nextInDisplay += `*${guessed}* `
                    else nextInDisplay += `\`${guessed}\` `
                }
                display[6 - guessCount] = nextInDisplay
                guessCount--
                await handleSending(msg, {content: display.join("\n"), status: StatusCode.INFO}, sendCallback)
                if (m.content == word) {
                    await handleSending(msg, {content: `You win`, status: StatusCode.RETURN}, sendCallback)
                    collector.stop()
                    return
                }
                if (guessCount == 0) {
                    await handleSending(msg, {content: `You lose, it was ${word}`, status: StatusCode.RETURN}, sendCallback)
                    collector.stop()
                    return
                }
            })
            return { content: "starting wordle", status: StatusCode.INFO }
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
        run: async (msg, args, sendCallback) => {
            let opponent = msg.author
            let opts: Opts;
            [opts, args] = getOpts(args)
            let caseSensitive = opts['case']
            let wordstr: string;
            let everyone = false
            let users: any[] = []
            for (let arg of args) {
                if (['all', 'everyone'].includes(arg)) {
                    users.push("Everyone")
                    everyone = true
                    break
                }
                //@ts-ignore
                opponent = await fetchUser(msg.guild, arg)
                if (opponent) {
                    users.push(opponent)
                }
            }
            if (users.length == 0) {
                users.push(msg.author)
            }
            try {
                await msg.author.createDM()
            }
            catch (err) {
                return { content: "Could not dm you", status: StatusCode.ERR }
            }
            let points = 0
            let losingStreak = 0
            let winningStreak = 0
            let participants: { [key: string]: number } = {}
            async function game(wordstr: string) {
                let wordLength = strlen(wordstr)
                if (!caseSensitive) {
                    wordstr = wordstr.toLowerCase()
                }
                let guessed = ""
                let disp = ""
                let lives = parseInt(opts["lives"] as string) || 10
                let _startingLives = lives
                let word = [...wordstr]
                for (let i = 0; i < wordLength; i++) {
                    if (word[i] == " ") {
                        disp += '   '
                    }
                    else {
                        disp += "\\_ "
                    }
                }
                try {
                    await handleSending(msg, { content: `${disp}\n${users.join(", ")}, guess` , status: StatusCode.PROMPT})
                }
                catch (err) {
                    return { content: "2K char limit reached", status: StatusCode.ERR }
                }
                let collection = msg.channel.createMessageCollector({ filter: m => (strlen(m.content) < 2 || m.content == wordstr || (m.content[0] == 'e' && strlen(m.content) > 2 && strlen(m.content) < 5) || ["<enter>", "STOP", "\\n"].includes(m.content)) && (users.map(v => v.id).includes(m.author.id) || everyone), idle: 40000 })
                let gameIsGoing = true
                collection.on("collect", async (m) => {
                    if (!gameIsGoing) return
                    if (m.content == '\\n' || m.content == "<enter>")
                        m.content = '\n'
                    if (m.content == "STOP") {
                        await handleSending(msg, {content: "STOPPED", status: StatusCode.RETURN}, sendCallback)
                        collection.stop()
                        gameIsGoing = false
                        return
                    }
                    if (!caseSensitive) {
                        m.content = m.content.toLowerCase()
                    }
                    if (participants[m.author.id] === undefined && !m.author.bot) {
                        participants[m.author.id] = .5
                    }
                    if ([...guessed].indexOf(m.content) > -1) {
                        await handleSending(msg, {content: `You've already guessed ${m.content}`, status: StatusCode.ERR}, sendCallback)
                        return
                    }
                    else if (m.content == wordstr) {
                        await handleSending(msg, { content: `YOU WIN, it was\n${wordstr}`,status: StatusCode.RETURN })
                        collection.stop()
                        gameIsGoing = false
                        return
                    }
                    else guessed += m.content
                    if (word.indexOf(m.content) < 0) {
                        losingStreak++
                        winningStreak = 0
                        points -= losingStreak ** 2
                        participants[m.author.id] /= 1.2
                        lives--
                    }
                    else {
                        participants[m.author.id] *= 1.2
                        winningStreak++
                        losingStreak = 0
                        points += winningStreak ** 2
                    }
                    if (lives < 1) {
                        await handleSending(msg, { content: `You lost, the word was:\n${wordstr}`, allowedMentions: { parse: [] }, status: StatusCode.RETURN })
                        collection.stop()
                        gameIsGoing = false
                        return
                    }
                    let correctIndecies: { [k: number]: string } = {}
                    for (let i = 0; i < strlen(guessed); i++) {
                        let letter = [...guessed][i]
                        //@ts-ignore
                        let tempWord = [...word]
                        let totalIdx = 0
                        let idx;
                        while ((idx = [...tempWord].indexOf(letter)) >= 0) {
                            correctIndecies[idx + totalIdx] = letter
                            totalIdx += idx + 1
                            tempWord = tempWord.slice(idx + 1)
                        }
                    }
                    let disp = ""
                    for (let i = 0; i < wordLength; i++) {
                        if (correctIndecies[i]) {
                            disp += correctIndecies[i]
                        }
                        else if (word[i] == " ") {
                            disp += '   '
                        }
                        else {
                            disp += "\\_ "
                        }
                    }
                    if (disp.replaceAll("   ", " ") == wordstr) {
                        await handleSending(msg, { content: `YOU WIN, it was\n${wordstr}\nscore: ${points}`, allowedMentions: { parse: [] }, status: StatusCode.RETURN })
                        collection.stop()
                        gameIsGoing = false
                        return
                    }
                    await handleSending(msg, { content: `(score: ${points})\n${disp}\n${users.join(", ")}, guess (${lives} lives left)`, status: StatusCode.INFO })
                })
            }
            if (opts["random"]) {
                let channels = (await msg.guild?.channels.fetch())?.toJSON()
                if (!channels) {
                    return { content: "no channels found", status: StatusCode.ERR }
                }
                let channel = choice(channels)
                while (!channel.isText())
                    channel = choice(channels)
                let messages
                try {
                    messages = await channel.messages.fetch({ limit: 100 })
                }
                catch (err) {
                    messages = await msg.channel.messages.fetch({ limit: 100 })
                }
                let times = 0;
                //@ts-ignore
                while (!(wordstr = messages.random()?.content)) {
                    times++
                    if (times > 20) break
                }
                await game(wordstr)
            }
            else {
                await msg.author.send("Type a word")
                let collector = msg.author.dmChannel?.createMessageCollector({ time: 30000, max: 1 })
                collector?.on("collect", async (m) => {
                    wordstr = m.content
                    await game(wordstr)
                })
            }
            return {
                content: "STARTING HANGMAN, WOOOOOO",
                status: StatusCode.INFO
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
        run: async (msg, args, sendCallback) => {
            let opts;
            [opts, args] = getOpts(args)
            if (opts['d'] && msg.deletable) await msg.delete()
            let edits = args.join(" ").split("|")
            let message
            try {
                message = await handleSending(msg, {content: edits[0], status: StatusCode.INFO}, sendCallback)
            }
            catch (err) {
                return { content: "message too big", status: StatusCode.ERR }
            }
            edits = edits.slice(1)
            let lastEdit = message.content
            for (let edit of edits) {
                let match
                if (match = edit.match(/^!(\d+)!$/)) {
                    let time = parseFloat(match[1])
                    await new Promise(res => setTimeout(res, time * 1000))
                    continue
                }
                if (edit[0] == "-") {
                    edit = lastEdit.replaceAll(edit.slice(1), "")
                }
                else if (edit[0] == "+") {
                    edit = lastEdit + edit.slice(1)
                }
                else if (edit[0] == "*") {
                    let times = parseInt(edit.slice(1))
                    edit = lastEdit
                    for (let i = 1; i < times; i++) {
                        edit += lastEdit
                    }
                }
                else if (edit[0] == "/") {
                    let divideBy = parseInt(edit.slice(1))
                    edit = lastEdit.slice(0, lastEdit.length / divideBy)
                }
                else if (edit[0] == ";") {
                    try {
                        message = await handleSending(msg, {content: edit.slice(1), status: StatusCode.INFO}, sendCallback)
                    }
                    catch (err) {
                        return { content: "message too big", status: StatusCode.ERR }
                    }
                    continue
                }
                try {
                    await message.edit({ content: edit })
                }
                catch (err) {
                    if (!message.deletable) {
                        return { noSend: true,status: StatusCode.ERR }
                    }
                    await handleSending(msg, {content: `Could not edit message with: ${edit}`, status: StatusCode.ERR}, sendCallback)
                }
                await new Promise(res => setTimeout(res, Math.random() * 800 + 200))
                lastEdit = message.content
            }
            return { noSend: true, status: StatusCode.INFO }
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
            let embed = new MessageEmbed()
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
            embed.addField("Same Roles", same || "No same")
            embed.addField(`${realUser1.displayName} unique roles`, user1U || "No unique roles")
            embed.addField(`${realUser2.displayName} unique roles`, user2U || "No unique roles");
            return { embeds: [embed], status: StatusCode.RETURN }
        },
        category: CommandCategory.UTIL
    },
    "most-roles": {
        run: async (msg, args, sendCallback) => {
            let opts;
            [opts, args] = getOpts(args)
            let times = parseInt(args[0]) || 10
            await msg.guild?.members.fetch()
            let sortedMembers = msg.guild?.members.cache.sorted((ua, ub) => ub.roles.cache.size - ua.roles.cache.size)
            let embed = new MessageEmbed()
            embed.setTitle(`${sortedMembers?.at(0)?.user.username} has the most roles`)
            if (sortedMembers?.at(0)?.displayColor) {
                embed.setColor(sortedMembers?.at(0)?.displayColor || "RED")
            }
            let ret = ""
            for (let i = 0; i < times; i++) {
                let member = sortedMembers?.at(i)
                ret += `${i + 1}: ${member}: ${member?.roles.cache.size}\n`
                embed.addField(String(i + 1), `**${member}**\n${member?.roles.cache.size}`, true)
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
    whohas: {
        run: async (msg, args, sendCallback) => {
            let role = args.join(" ")
            if (!role) {
                return { content: "No role given", status: StatusCode.ERR }
            }
            await msg.guild?.members.fetch()
            let roleRef = await msg.guild?.roles.fetch()
            if (!roleRef) {
                return { content: "no roles found somehow", status: StatusCode.ERR }
            }
            let realRole = roleRef.filter(v => v.name.toLowerCase() == role.toLowerCase())?.at(0)
            if (!realRole) {
                realRole = roleRef.filter(v => v.name.toLowerCase().match(role.toLowerCase()) ? true : false)?.at(0)
            }
            if (!realRole) {
                realRole = roleRef.filter(v => v.id == role.toLowerCase() ? true : false)?.at(0)
            }
            if (!realRole) {
                return {
                    content: "Could not find role",
                    status: StatusCode.ERR
                }
            }
            let memberTexts = [""]
            let embed = new MessageEmbed()
            embed.setTitle(realRole.name)
            let i = 0
            let memberCount = 0
            for (let member of realRole.members) {
                memberTexts[i] += `<@${member[1].id}> `
                memberCount += 1
                if (memberTexts[i].length > 1000) {
                    embed.addField(`members`, memberTexts[i])
                    i++
                    memberTexts.push("")
                }
            }
            if (!memberTexts[0].length) {
                return { content: "No one", status: StatusCode.RETURN }
            }
            if (embed.fields.length < 1) {
                embed.addField(`members: ${i}`, memberTexts[i])
            }
            embed.addField("Member count", String(memberCount))
            return { embeds: [embed], status: StatusCode.RETURN }
        },
        category: CommandCategory.UTIL
    },
    img: {
        run: async (_msg: Message, args: ArgumentList, sendCallback) => {
            let opts
            [opts, args] = getOpts(args)
            let gradOpt = opts['gradient']
            let gradient;
            if (typeof gradOpt == 'boolean') {
                gradOpt = false
            } else if (gradOpt) {
                gradient = gradOpt.split(">")
            }
            const width = Math.min(parseFloat(args[0]) || parseFloat(opts['w'] as string) || parseFloat(opts['width'] as string) || parseFloat(opts['size'] as string) || 100, 2000)
            const height = Math.min(parseFloat(args[1]) || parseFloat(opts['h'] as string) || parseFloat(opts['height'] as string) || parseFloat(opts['size'] as string) || width || 100, 2000)
            if (width < 0) {
                return {
                    content: "Width must be > 0",
                    status: StatusCode.ERR
                }
            }
            if (height < 0) {
                return {
                    content: "Height must be > 0",
                    status: StatusCode.ERR
                }
            }
            let img;
            if (gradient) {
                img = await sharp(await createGradient(gradient, width, height)).toBuffer()
            }
            else {
                let colorHint = args[2] || opts['color'] || "black"
                let color = "black"
                if (typeof colorHint !== 'boolean') {
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
                files: [
                    {
                        attachment: `out.png`,
                        name: `file.png`,
                        description: "why can i describe this"
                    }
                ],
                content: "Your image, sir",
                status: StatusCode.RETURN
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
                "h": {
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
        run: async (msg: Message, args: ArgumentList, sendCallback) => {
            let opts;
            [opts, args] = getOpts(args)
            let color = opts['color'] || "white"
            let img_link = getImgFromMsgAndOpts(opts, msg)
            if (!img_link) {
                return {
                    content: "no img found",
                    status: StatusCode.ERR
                }
            }
            let coords = args.join(" ")
            let positions: [string, string][] = []
            for (let pos of coords.split('|')) {
                let [x, y] = pos.trim().split(" ").map(v => v.replace(/[\(\),]/g, ""))
                positions.push([x, y])
            }
            let img_data = await fetch.default(String(img_link))
            let fn = `${generateFileName("polygon", msg.author.id)}.png`
            fs.writeFileSync(fn, await img_data.buffer())
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
            for (let pos of positions.slice(1)) {
                let x = parsePosition(pos[0], img.width)
                let y = parsePosition(pos[1], img.width)
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y
                ctx.lineTo(x, y)
            }
            ctx.fillStyle = String(color)
            ctx.fill()
            const buffer = canv.toBuffer("image/png")
            fs.writeFileSync(fn, buffer)
            handleSending(msg, { files: [{ attachment: fn, name: fn }], status: StatusCode.RETURN }, sendCallback).then(res => {
                fs.rmSync(fn)
            })
            return {
                content: "generating img",
                status: StatusCode.INFO
            }
        },
        category: CommandCategory.IMAGES,
        help: {
            info: "Create a polygon",
            arguments: {
                "positions": {
                    description: "a list of <x> <y> positions seperated by |",
                    required: true
                }
            },
            options: {
                color: {
                    description: "The color of the polygon"
                }
            }
        }
    },
    rect: {
        run: async (msg: Message, args: ArgumentList, sendCallback) => {
            let opts;
            [opts, args] = getOpts(args)
            let color: string = <string>opts['color'] || "white"
            let _outline = opts['outline']
            let img = getImgFromMsgAndOpts(opts, msg)
            if (!img) {
                return {
                    content: "no img found",
                    status: StatusCode.ERR
                }
            }
            let gradient: Array<string> | undefined
            if (typeof opts["gradient"] == 'string')
                gradient = opts['gradient'].split(">")
            let [x, y, width, height] = args.slice(0, 4)
            if (!x) {
                x = typeof opts['x'] === 'string' ? opts['x'] : "0"
            }
            if (!y) {
                y = typeof opts['y'] === 'string' ? opts['y'] : "0"
            }
            if (!width) {
                //@ts-ignore
                width = opts['w'] || opts['width'] || opts['size'] || "50"
            }
            if (!height) {
                //@ts-ignore
                height = opts['h'] || opts['height'] || opts['size'] || width || "50"
            }
            let intWidth = parseInt(width as string) || 50
            let intHeight = parseInt(height as string) || 50
            //@ts-ignore
            https.request(img, resp => {
                let data = new Stream.Transform()
                resp.on("data", chunk => {
                    data.push(chunk)
                })
                resp.on("end", async () => {
                    let fn = `${generateFileName("rect", msg.author.id)}.png`
                    fs.writeFileSync(fn, data.read())
                    let oldImg = sharp(fn).png()
                    let oldMeta = await oldImg.metadata()
                    let [oldWidth, oldHeight] = [oldMeta.width, oldMeta.height]

                    let newImg
                    if (gradient) {
                        newImg = sharp(await createGradient(gradient, intWidth, intHeight))
                    }
                    else {
                        let trueColor
                        if (typeof color === 'boolean') {
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
                    let composedImg = await oldImg.composite([{ input: await newImg.png().toBuffer(), top: parsePosition(y, oldHeight, intHeight), left: parsePosition(x, oldWidth, intWidth) }]).png().toBuffer()
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
                    handleSending(msg, { files: [{ attachment: fn, name: fn }], status: StatusCode.RETURN }, sendCallback).then(_res => {
                        fs.rmSync(fn)
                    }).catch(_err => {
                    })
                })
            }).end()
            return {
                content: "generating img",
                status: StatusCode.INFO
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
        run: async (_msg: Message, _args: ArgumentList, sendCallback) => {
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
                            await sendCallback("Could not generate image")
                            return
                        }
                        fs.writeFileSync(fn, buffer)
                        sendCallback({files: [{attachment: fn, name: fn,}]}).then(res => {
                            fs.rmSync(fn)
                        }).catch(err => {
                        })
                    })
                }).end()
            */
            return {
                content: "generating img",
                status: StatusCode.INFO
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
        run: async (_msg: Message, _args: ArgumentList, sendCallback) => {
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
                        sendCallback({files: [{attachment: fn, name: fn,}]}).then(res => {
                            fs.rmSync(fn)
                        }).catch(err => {
                        })
                    })
                }).end()
            */
            return {
                content: "generating img",
                status: StatusCode.INFO
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
    "img-info": createCommand(async(msg, args, sendCallback) => {
        let opts;
        [opts, args] = getOpts(args)
        let img = getImgFromMsgAndOpts(opts, msg)
        if(!img || img === true){
            return {content: "No image given", status: StatusCode.ERR}
        }
        let image = await canvas.loadImage(img)

        return {content: `width: ${image.width}\nheight: ${image.height}`, status: StatusCode.RETURN}
    }, CommandCategory.IMAGES),
    overlay: createCommand(async(msg, _, sc, opts, args) => {
        let [img1, img2] = args.join(" ").split("|")
        img1 = img1.trim()
        img2 = img2.trim()
        if(img1 && !img1.startsWith("http")){
            let new_img1 = getVar(msg, img1, msg.author.id)
            if(!new_img1){
                new_img1 = getVar(msg, img1, "__global__")
            }
            img1 = String(new_img1)
        }
        if(!img1 || !img1.startsWith("http")){
            img1 = getImgFromMsgAndOpts(opts, msg) as  string
            if(msg.attachments.keyAt(0)){
                msg.attachments.delete(msg.attachments.keyAt(0) as string)
            }
        }
        if(img2 && !img2.startsWith("http")){
            let  new_img2 = getVar(msg, img2, msg.author.id)
            if(!new_img2){
                new_img2 = getVar(msg, img2, "__global__")
            }
            img2 = String(new_img2)
        }
        if(!img2 || !img2.startsWith("http")){
            img2 = getImgFromMsgAndOpts(opts, msg) as string
        }
        console.log(img1, img2)
        if(!img2 || !img1){
            return {content: `Must provide 2 images\nimg1: ${img1}\nimg2: ${img2}`, status: StatusCode.ERR}
        }
        let image1 = await canvas.loadImage(img1)
        let image2 = await canvas.loadImage(img2)
        let canv = new canvas.Canvas(image2.width, image2.height)
        let ctx = canv.getContext("2d")
        ctx.drawImage(image2, 0, 0)
        ctx.globalAlpha = parseFloat(String(opts['alpha'])) || 0.5
        ctx.drawImage(image1, 0, 0, canv.width, canv.height)

        let fn = `${generateFileName("overlay", msg.author.id)}.png`
        fs.writeFileSync(fn, canv.toBuffer("image/png"))

        return {
            files: [
                {
                    attachment: fn,
                    name: fn,
                    delete: true
                }
            ],
            status: StatusCode.RETURN
        }

    }, CommandCategory.IMAGES,
                          `overlay image 1 onto image 2 seperated by |
<br>
If an image is not provided it will be pulled from chat, or an image you gave it`,
                          {
                              img1: createHelpArgument("The first image, put a | if you just want to use an image from chat"),
                              img2: createHelpArgument("A link to image, an image you  gave as attachment, or an image from chat")
                          },
                          {
                              alpha: createHelpOption("The alpha to use, defaults to 0.5")
                          }),
    text: {
        //text command
        run: async (msg: Message, args: ArgumentList, sendCallback) => {
            let opts: Opts;
            [opts, args] = getOpts(args)

            let img;
            if(opts['img'] || msg.attachments.at(0)){
                img = getImgFromMsgAndOpts(opts, msg)
            }

            let width = Number(opts['w']) || 0
            let height = Number(opts['h']) || 0
            if(width * height > 4000000){
                return {content: "Too large", status: StatusCode.ERR}
            }

            let text = args.join(" ")
            if(!text){
                return {content: "No text", status: StatusCode.ERR}
            }

            let lineCount = text.split("\n").length

            let font_size = String(opts['size'] || "10") + "px"
            let font = String(opts['font'] || "serif")

            if(width === 0 || height === 0){
                let c = new canvas.Canvas(1000, 1000)
                let ctx = c.getContext("2d")
                ctx.font = `${font_size} ${font}`
                let textInfo = ctx.measureText(text)
                width ||= textInfo.width
                //@ts-ignore
                height ||= parseFloat(font_size) * (72/96) + (textInfo.emHeightDescent / lineCount) + textInfo.actualBoundingBoxDescent
            }

            let canv, ctx;
            if(img){
                let image = await canvas.loadImage(img as string)
                width = width || image.width
                height = height || image.height
                canv = new canvas.Canvas(width, height, "image")
                ctx = canv.getContext("2d")
                ctx.drawImage(image, 0, 0)
            }
            else{
                width = width || 100
                height = height || 100
                canv = new canvas.Canvas(width, height, "image")
                ctx = canv.getContext("2d")
            }


            ctx.font = `${font_size} ${font}`
            let textInfo = ctx.measureText(text)

            if(opts['measure']){
                if(opts['measure'] !== true){
                    //@ts-ignore
                    return {content: String(textInfo[opts['measure']]), status: StatusCode.RETURN}
                }
                return {content: JSON.stringify(textInfo), status: StatusCode.RETURN}
            }

            ctx.textBaseline = Pipe.start(opts['baseline']).default("top").next((v: string) => String(v)).done()

            let req_x = String(opts['x'] || 0)
            let x = parsePosition(req_x, width, textInfo.width)
            let req_y = String(opts['y'] || 0)
            //@ts-ignore
            let y = parsePosition(req_y, width, parseFloat(font_size) * (72/96) + (textInfo.emHeightDescent / lineCount) + textInfo.actualBoundingBoxDescent)

            let bg_colors = intoColorList(String(opts['bg'] || "transparent"))
            if(bg_colors.length == 1){
                if(bg_colors[0] !== 'transparent'){
                    ctx.fillStyle = bg_colors[0]
                    //@ts-ignore
                    ctx.fillRect(x, y, textInfo.width, parseFloat(font_size) * (72/96) + (textInfo.emHeightDescent / lineCount) + textInfo.actualBoundingBoxDescent)
                }
            }
            else{
                //@ts-ignore
                let grad = ctx.createLinearGradient(x, y, x + textInfo.width, y + parseFloat(font_size) * (72/96) + (textInfo.emHeightDescent / lineCount) + textInfo.actualBoundingBoxDescent)
                let interval = 1 /(bg_colors.length - 1)
                for(let i = 0; i < bg_colors.length; i++){
                    console.log(bg_colors[i])
                    grad.addColorStop(interval * i, bg_colors[i])
                }
                ctx.fillStyle = grad
                //@ts-ignore
                ctx.fillRect(x, y, textInfo.width, parseFloat(font_size) * (72/96) + (textInfo.emHeightDescent / lineCount) + textInfo.actualBoundingBoxDescent)
            }

            let colors = intoColorList(String(opts['color'] || "red"))
            if(colors.length == 1){
                ctx.fillStyle = colors[0]
            }
            else{
                //@ts-ignore
                let grad = ctx.createLinearGradient(x, y, x + textInfo.width, y + parseFloat(font_size) * (72/96) + textInfo.actualBoundingBoxDescent + (textInfo.emHeightDescent / lineCount))
                let interval = 1 /(colors.length - 1)
                for(let i = 0; i < colors.length; i++){
                    console.log(colors[i])
                    grad.addColorStop(interval * i, colors[i])
                }
                ctx.fillStyle = grad
            }

            ctx.fillText(text, x, y, width)

            let fn = `${generateFileName("text", msg.author.id)}.png`
            fs.writeFileSync(fn, canv.toBuffer("image/png"))

            return {
                files: [
                    {
                        attachment: fn,
                        name: fn,
                        delete: true
                    }
                ],
                status: StatusCode.RETURN
            }
        },
        help: {
            info: "Put text on an image",
            arguments: {
                text: {
                    description: "The text to put",
                    required: true
                }
            },
            options: {
                img: {
                    description: "Whether or not to use an existing image, either pulled from chat, or the message sent"
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
                },
                bg: {
                    description: "The color behind the text"
                },
                measure: {
                    description: `Sends information about the text size
            <br>
            Possible values for this option:
            <ul>
                <li>None</li>
                <li>width</li>
                <li>actualBoundingBoxLeft</li>
                <li>actualBoundingBoxRight</li>
                <li>actualBoundingBoxAscent</li>
                <li>actualBoundingBoxDescent</li>
                <li>emHeightAscent</li>
                <li>emHeightDescent</li>
                <li>alphabeticBaseline</li>
            </ul>`
                }
            }
        },
        category: CommandCategory.IMAGES
    },
    choose: {
        run: async (_msg: Message, args: ArgumentList, sendCallback) => {
            let opts;
            [opts, args] = getOpts(args)
            let times = 1
            let sep = String(opts["sep"] || opts["s"] || "\n")
            if (opts["t"]) {
                if (typeof opts['t'] == 'string')
                    times = parseInt(opts["t"])
                else times = 3
            }
            let ans = []
            args = args.join(" ").split("|")
            for (let i = 0; i < times; i++) {
                ans.push(choice(args).trim())
            }
            return {
                content: ans.join(sep) || "```invalid message```",
                status: StatusCode.RETURN
            }
        },
        category: CommandCategory.FUN
    },
    weather: {
        run: async (msg: Message, _: ArgumentList, sendCallback, opts, args) => {
            let url = "https://www.wttr.in"
            let town = args.join(" ") || "tokyo"

            let  data = await (await fetch.default(`${url}/${encodeURI(town)}?format=1`)).text()
            let tempData = data.match(/(\S*)\s*[+-](\d+).(C|F)/)
            if(!tempData){
                return {content: "Could not find weather", status: StatusCode.ERR}
            }
            let condition, temp, unit
            try {
                [condition, temp, unit] = tempData.slice(1, 4)
            }
            catch (err) {
                return { content: "Could not find weather :(" , status: StatusCode.ERR}
            }
            temp = Number(temp)
            let tempC, tempF
            if (unit == "C") {
                tempF = temp * 9 / 5 + 32
                tempC = temp
            } else if (unit == "F") {
                tempC = (temp - 32) * 5 / 9
                tempF = temp
            }
            else {
                tempC = 843902438
                tempF = tempC * 9 / 5 + 32
            }
            let color = "DARK_BUT_NOT_BLACK"
            if (tempF >= 110) color = "#aa0000"
            if (tempF < 110) color = "#ff0000"
            if (tempF < 100) color = "#ff412e"
            if (tempF < 90) color = "ORANGE"
            if (tempF < 75) color = "YELLOW"
            if (tempF < 60) color = "GREEN"
            if (tempF < 45) color = "BLUE"
            if (tempF < 32) color = "#5be6ff"
            if (tempF < 0) color = "PURPLE"
            let embed = new MessageEmbed()
            embed.setTitle(town)
            embed.setColor(color as ColorResolvable)
            embed.addField("condition", condition, false)
            embed.addField("Temp F", `${tempF}F`, true)
            embed.addField("Temp C", `${tempC}C`, true)
            embed.setFooter({ text: `For more info, visit ${url}/${encodeURI(town)}` })
            if(opts['fmt']){
                return {content: format(String(opts['fmt']), {f: String(tempF), c: String(tempC), g: color, s: condition, l: town}), status: StatusCode.RETURN}
            }
            return {embeds: [embed], status: StatusCode.RETURN}
        },
        help: {
            info: "Get weather for a specific place, default: tokyo",
            arguments: {
                "location": {
                    description: "Where do you want the weather for"
                }
            },
            options: {
                fmt: createHelpOption(`The format to use instead of an embed
<br>
Valid formats:
    %f: temp in F
    %c: temp in C
    %g: color
    %s: condition
    %l: town
`)
            }

        },
        category: CommandCategory.FUN
    },
    rotate: {
        run: async (msg: Message, args: ArgumentList, sendCallback) => {
            let opts: Opts;
            [opts, args] = getOpts(args)
            let img = getImgFromMsgAndOpts(opts, msg)
            if (!img || img === true) {
                return { content: "No image found", status: StatusCode.ERR }
            }
            let amount = Number(args[0]) || 90
            let color = args[1] || "#00000000"
            let img_data = await fetch.default(img)
            let buf = await img_data.buffer()
            let fn = `${generateFileName("rotate", msg.author.id)}.png`
            try {
                await sharp(buf)
                    .rotate(amount, { background: color })
                    .toFile(fn)
                return {
                    files: [
                        {
                            attachment: fn,
                            name: fn,
                            delete: true
                        }
                    ],
                    status: StatusCode.RETURN
                }
            }
            catch {
                return { content: "Something went wrong rotating image", status: StatusCode.ERR }
            }
        },
        category: CommandCategory.IMAGES
    },
    color: {
        run: async (msg: Message, args: ArgumentList, sendCallback) => {
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
            if (colors.length > 1) {
                let gradient = []
                let colorStrings = []
                for (let i = 0; i < Math.min(colors.length, 1e9); i++) {
                    let R, G, B
                    if (colors[i]) {
                        colorStrings.push(colors[i])
                        gradient.push(colors[i])
                    }
                    else {
                        [R, G, B] = randomColor()
                        gradient.push(`rgb(${R}, ${G}, ${B})`)
                        colorStrings.push(rgbToHex(R, G, B))
                    }
                }
                try {
                    buffer = await sharp(await createGradient(gradient, width, height)).png().toBuffer()
                }
                catch (err) {
                    return { content: "error making color", status: StatusCode.ERR }
                }
                content = colorStrings.join(" > ")
            }
            else {
                if (color == "RANDOM") {
                    let [R, G, B] = randomColor()
                    color = `rgb(${R}, ${G}, ${B})`
                    content = rgbToHex(R, G, B)
                }
                try {
                    buffer = await sharp({
                        create: {
                            width: width,
                            height: height,
                            channels: 4,
                            background: color
                        }
                    }).png().toBuffer()
                }
                catch (err) {
                    return { content: "error making color", status: StatusCode.ERR }
                }
            }
            fs.writeFileSync(fn, buffer)
            return {
                files: [
                    {
                        attachment: fn,
                        name: `file.png`,
                        description: "why can i describe this"
                    }
                ],
                content: content,
                status: StatusCode.RETURN
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
                "w": {
                    description: "width of image"
                },
                "h": {
                    description: "height of image"
                }
            }
        },
        category: CommandCategory.IMAGES

    },
    "l-bl": {
        run: async (_msg: Message, _args: ArgumentList, sendCallback) => {
            return {
                content: fs.readFileSync("command-perms/blacklists", "utf-8"),
                status: StatusCode.RETURN
            }
        },
        category: CommandCategory.META

    },
    "l-wl": {
        run: async (_msg: Message, _args: ArgumentList, sendCallback) => {
            return {
                content: fs.readFileSync("command-perms/whitelists", "utf-8"),
                status: StatusCode.RETURN
            }
        },
        category: CommandCategory.META
    },
    ship: {
        run: async (_msg, args, sendCallback) => {
            let opts;
            [opts, args] = getOpts(args)
            if (args.length < 2) {
                return { content: "2 users must be given", delete: opts['d'] as boolean, status: StatusCode.ERR }
            }
            let [user1Full, user2Full] = args.join(" ").split("|")
            if (!user1Full || !user2Full) {
                return { content: "2 users not given", status: StatusCode.ERR }
            }
            let user1 = user1Full.slice(0, Math.ceil(user1Full.length / 2))
            let user2 = user2Full.slice(Math.floor(user2Full.length / 2))
            let options = fs.readFileSync(`command-results/ship`, "utf-8").split(";END").map(v => v.split(" ").slice(1).join(" ")).filter(v => v.trim())
            return { content: format(choice(options), { "u1": user1Full, "u2": user2Full, "ship": `${user1}${user2}`, "strength": `${Math.floor(Math.random() * 99 + 1)}%` }), delete: opts['d'] as boolean, status: StatusCode.RETURN }
        },
        help: {
            info: "Create your favorite fantacies!!!!"
        },
        category: CommandCategory.FUN
    },
    aship: {
        run: async (msg, args, sendCallback) => {
            return await commands['add'].run(msg, ["ship", args.join(" ")], sendCallback, {}, ["ship", args.join(" ")])
        },
        help: {
            info: "{u1} is the first user, {u2} is the second user, {ship} is the ship name for the users"
        },
        category: CommandCategory.FUN
    },
    timeit: {
        run: async (msg, args, sendCallback) => {
            msg.content = `${prefix}${args.join(" ").trim()}`
            let start = new Date().getTime()
            await doCmd(msg)
            return { content: `${new Date().getTime() - start} ms`, status: StatusCode.RETURN }
        },
        category: CommandCategory.META
    },
    "do": {
        run: async (msg: Message, args: ArgumentList, sendCallback, opts, deopedArgs, recursion) => {
            if(recursion >= globals.RECURSION_LIMIT){
                return {content: "Cannot start do after reaching the recursion limit", status: StatusCode.ERR}
            }
            let times = parseInt(args[0])
            if (times) {
                args.splice(0, 1)
            } else {
                times = 10
            }
            let cmdArgs = args.join(" ").trim()
            if (cmdArgs == "") {
                cmdArgs = String(times)
            }
            let totalTimes = times
            let id = String(Math.floor(Math.random() * 100000000))
            await handleSending(msg, {content: `starting ${id}`, status: StatusCode.INFO}, sendCallback)
            let cmd = cmdArgs.split(" ")[0]
            let expansion = await expandAlias(cmd, (alias) => {
                console.log(alias)
                if(alias === "do" || alias === "spam" || alias === "run"){
                    return false
                }
                return true
            })
            if(!expansion){
                return {content: "Cannot run do, spam, or run", status: StatusCode.ERR}
            }
            globals.SPAMS[id] = true
            while (globals.SPAMS[id] && times--) {
                msg.content = `${prefix}${format(cmdArgs, { "number": String(totalTimes - times), "rnumber": String(times + 1) })}`
                await doCmd(msg, false, globals.RECURSION_LIMIT)
                await new Promise(res => setTimeout(res, Math.random() * 700 + 200))
            }
            delete globals.SPAMS[id]
            return {
                content: "done",
                status: StatusCode.INFO
            }
        },
        category: CommandCategory.META
    },
    spasm: {
        run: async (msg, args, sendCallback) => {
            let [times, ...text] = args
            let sendText = text.join(" ")
            let timesToGo = 10
            if (!isNaN(parseInt(times))) {
                timesToGo = parseInt(times)
            }
            else {
                sendText = [times, ...text].join(" ")
            }
            let id = String(Math.floor(Math.random() * 100000000))
            await handleSending(msg, {content: `starting ${id}`, status: StatusCode.INFO}, sendCallback)
            globals.SPAMS[id] = true
            let message = await handleSending(msg, {content: sendText, status: StatusCode.RETURN}, sendCallback)
            while (globals.SPAMS[id] && timesToGo--) {
                if (message.deletable) await message.delete()
                message = await handleSending(msg, {content: sendText, status: StatusCode.RETURN}, sendCallback)
                await new Promise(res => setTimeout(res, Math.random() * 700 + 200))
            }
            delete globals.SPAMS[id]
            return { content: "done",status: StatusCode.INFO }
        }, category: CommandCategory.FUN
    },
    spam: {
        run: async (msg: Message, _: ArgumentList, sendCallback, opts, args) => {
            let times = parseInt(args[0])
            if (times) {
                args.splice(0, 1)
            } else times = 10
            let send = args.join(" ").trim()
            if (send == "") {
                send = String(times)
                times = 10
            }
            let totalTimes = times
            let id = String(Math.floor(Math.random() * 100000000))
            await handleSending(msg, {content: `starting ${id}`, status: StatusCode.INFO}, sendCallback)
            globals.SPAMS[id] = true
            let delay: number | null = parseFloat(String(opts['delay'])) * 1000 || 0
            if(delay < 700 || delay > 0x7FFFFFFF){
                delay = null
            }
            while (globals.SPAMS[id] && times--) {
                await handleSending(msg, { content: format(send, { "count": String(totalTimes - times), "rcount": String(times + 1) }), status: StatusCode.RETURN })
                await new Promise(res => setTimeout(res, delay ?? Math.random() * 700 + 200))

            }
            delete globals.SPAMS[id]
            return {
                content: "done",
                status: StatusCode.INFO
            }
        },
        help: {
            info: "This technically runs the echo command with the -D option in the background, so any special syntax such as $() should work (if preceded with a \\)",
            arguments: {
                count: {
                    description: "The amount of times to send a message",
                    required: false
                },
                text: {
                    description: "TThe text to send",
                    required: true
                }
            },
            options: {
                delay: {
                    description: "The time between each time a mesage is sent"
                }
            }
        },
        category: CommandCategory.META
    },
    stop: {
        run: async (_msg: Message, args: ArgumentList, sendCallback) => {
            if (!Object.keys(globals.SPAMS).length) {
                return { content: "no spams to stop", status: StatusCode.ERR }
            }
            if (args[0]) {
                if (globals.SPAMS[args[0]]) {
                    delete globals.SPAMS[args[0]]
                    return {
                        content: `stopping ${args[0]}`,
                        status: StatusCode.RETURN
                    }
                }
                return {
                    content: `${args[0]} is not a spam id`,
                    status: StatusCode.ERR
                }
            }
            globals.SPAM_ALLOWED = false;
            for (let spam in globals.SPAMS) {
                delete globals.SPAMS[spam]
            }
            return {
                content: "stopping all",
                status: StatusCode.RETURN
            }
        },
        category: CommandCategory.META
    },
    "pollify": {
        run: async (msg, args, sendCallback) => {
            let opts: Opts;
            [opts, args] = getOpts(args)
            if (msg.deletable && opts['d']) await msg.delete()
            let message = await handleSending(msg, {content: args.join(" ") || "poll", status: StatusCode.RETURN}, sendCallback)
            await message.react("<:Blue_check:608847324269248512>")
            await message.react("<:neutral:716078457880051734>")
            await message.react("❌")
            return { noSend: true, status: StatusCode.INFO }
        }, category: CommandCategory.UTIL,
        help: {
            info: "Idk it pollifies what do you want"
        }
    },
    "udict": {
        run: async (_msg, args, sendCallback) => {
            //@ts-ignore
            try {
                //@ts-ignore
                let data = await fetch.default(`https://www.urbandictionary.com/define.php?term=${args.join("+")}`)
                let text = await data.text()
                let match = text.match(/(?<=<meta content=")([^"]+)" name="Description"/)
                return { content: match?.[1] || "Nothing found :(", status: StatusCode.RETURN }
            }
            catch (err) {
                return { content: "An error occured", status: StatusCode.ERR }
            }
        }, category: CommandCategory.FUN
    },
    "vars": {
        run: async (_msg, _args, sendCallback) => {
            let rv = ""
            for (let prefix in vars) {
                rv += `${prefix}:\n`
                for (let v in vars[prefix]) {
                    rv += `${v.replaceAll("_", "\\_")}\n`
                }
                rv += '-------------------------\n'
            }
            return { content: rv, status: StatusCode.RETURN }
        },
        category: CommandCategory.META
    },

    'stackl': {
        run: async (msg, args, sendCallback) => {
            const stackl = require("./stackl")
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
                            attachment: "stackl.norg"
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

            type stackTypes = number | string | Message | GuildMember | Function | Array<stackTypes> | MessageEmbed
            for (let item of stack as Array<stackTypes>) {
                if (item instanceof MessageEmbed) {
                    embeds.push(item)
                }
                else {
                    texts.push(item)
                }
            }
            return { content: texts.join(" "), embeds: embeds, noSend: (<Array<stackTypes>>stack).length > 0 ? false : true, status: StatusCode.RETURN }
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

    "reddit": {
        run: async (_msg, args, sendCallback) => {
            let subreddit = args[0]
            //@ts-ignore
            let data = await fetch.default(`https://libreddit.spike.codes/r/${subreddit}`)
            let text = await data.text()
            if (!text) {
                return { content: "nothing found", status: StatusCode.ERR }
            }
            const $ = cheerio.load(text)
            type data = { text?: string, link?: string }
            let foundData: data[] = []
            for (let item of $("h2.post_title a[href]")) {
                let dataToAdd: data = {}
                //@ts-ignore
                if (item.children[0].data) {
                    //@ts-ignore
                    dataToAdd['text'] = item.children[0].data
                }
                else { continue }
                if (item.attribs.href) {
                    dataToAdd['link'] = `https://libreddit.spike.codes${item.attribs.href}`
                }
                foundData.push(dataToAdd)
            }
            let post = choice(foundData)
            let embed = new MessageEmbed()
            embed.setTitle(post.text || "None")
            embed.setFooter({ text: post.link || "None" })
            return { embeds: [embed], status: StatusCode.RETURN }
        }, category: CommandCategory.FUN
    },

    "expr": {
        run: async (msg, args, sendCallback) => {
            let opts;
            [opts, args] = getOpts(args)
            let vname = args[0]
            let varValRet
            let mainScope = "__global__"
            let secondaryScope = msg.author.id
            if (opts['u']) {
                mainScope = msg.author.id
                secondaryScope = "__global__"
            }
            let vardict = vars[mainScope]
            if (isNaN(parseFloat(vname))) {
                let vvalue = getVar(msg, vname, mainScope)
                if (vvalue === false) {
                    vardict = vars[secondaryScope]
                    vvalue = getVar(msg, vname, secondaryScope)
                }
                if (vvalue === undefined) {
                    vardict = vars[mainScope]
                    setVar(vname, "0", mainScope)
                    vvalue = getVar(msg, vname, mainScope)
                }
                varValRet = vvalue
            }
            else {
                varValRet = vname
                vname = "__expr"
            }
            let op = args[1]
            let expr = args[2]
            if (expr && isNaN(parseFloat(expr))) {
                expr = getVar(msg, expr, mainScope)
                if (expr === undefined) {
                    setVar(vname, "0", mainScope)
                    expr = getVar(msg, expr, mainScope)
                }
                if (expr === undefined) {
                    return { content: `var: **${expr}** does not exist`, status: StatusCode.ERR }
                }
            }
            let ans: any
            switch (op) {
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
                    for (let i = 0; i < varValRet.length; i++) {
                        if (i % 3 == 0 && i != 0) {
                            ans += ","
                        }
                        ans += varValRet[varValRet.length - i - 1]
                    }
                    let newAns = ""
                    for (let i = ans.length - 1; i >= 0; i--) {
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
                    ans = parseFloat(varValRet) ^ parseFloat(expr)
                    break;
                case "%":
                    ans = parseFloat(varValRet) % parseFloat(expr)
                    break;
            }
            vardict[vname] = ans
            return { content: String(ans), status: StatusCode.RETURN }
        },
        help: {
            info: "Modify a variable",
            arguments: {
                "num1": {
                    description: "Number 1 (can be a variable)"
                },
                "operator": {
                    description: "The operator<ul><li>++</li><li>--</li><li>floor</li><li>ceil</li><li>,</li><li>:</li><li>+</li><li>-</li><li>*</li>/</li><li>^</li><li>%</li></ul>"
                },
                "num2": {
                    description: "The other number (can be a variable)"
                }
            }
        },
        category: CommandCategory.UTIL

    },
    "run": {
        run: async (msg: Message, args, sendCallback, _, _2, recursion, bans) => {
            if(recursion >= globals.RECURSION_LIMIT){
                return {content: "Cannot run after reaching the recursion limit", status: StatusCode.ERR}
            }
            let opts: Opts;
            [opts, args] = getOpts(args)
            let file = msg.attachments.at(0)
            let text;
            if (!file) {
                text = args.join(" ").replaceAll("```", "").split(";EOL")
            }
            else {
                let k = msg.attachments.keyAt(0) as string
                msg.attachments.delete(k)
                //@ts-ignore
                let data = await fetch.default(file.url)
                text = await data.text()
                let bluecHeader = "%bluecircle37%\n"
                if (text.slice(0, bluecHeader.length) !== bluecHeader) {
                    return { content: "Does not appear to be a bluec script", status: StatusCode.ERR }
                }
                text = text.slice(bluecHeader.length).split(";EOL")
            }
            if (!text) {
                return { content: "No script", status: StatusCode.ERR }
            }
            let id = Math.floor(Math.random() * 10000000)
            globals.SPAMS[id] = true
            if (!opts['s']) {
                await handleSending(msg, {content: `Starting id: ${id}`, status: StatusCode.INFO}, sendCallback)
            }
            function handleRunFn(fn: string, contents: string) {
                switch (fn) {
                    case "RUN_FN_VAR": {
                        return `\\v{${parseRunLine(contents)}}`
                    }
                    case "RUN_FN_DOFIRST": {
                        return `$(${parseRunLine(contents)})`
                    }
                    case "RUN_FN_FMT": {
                        return `{${parseRunLine(contents)}}`
                    }
                    default: {
                        return contents
                    }
                }
            }
            function parseRunLine(line: string): string {
                let text = ""
                let currFn = ""
                let prefix = "RUN_FN_"
                for (let i = 0; i < line.length; i++) {
                    let ch = line[i]
                    if (ch == "(" && currFn.startsWith(prefix)) {
                        let parenCount = 1
                        let fnContents = ""
                        for (i++; i < line.length; i++) {
                            ch = line[i]
                            if (ch == "(") {
                                parenCount++;
                            }
                            else if (ch == ")") {
                                parenCount--;
                            }
                            if (parenCount == 0)
                                break;
                            fnContents += ch
                        }
                        text += handleRunFn(currFn, fnContents)
                        currFn = ""
                    }
                    else if ("ABCDEFGHIJKLMNOPQRSTUVWXYZ_".includes(ch)) {
                        currFn += ch
                    }
                    else {
                        text += currFn + ch
                        currFn = ""
                    }
                }
                if (currFn) {
                    text += currFn
                }
                return text
            }
            for (let line of text) {
                if (!globals.SPAMS[id])
                    break
                line = line.trim()
                if (line.startsWith(prefix)) {
                    line = line.slice(prefix.length)
                }
                msg.content = `${prefix}${parseRunLine(line)}`
                await doCmd(msg, false, recursion + 1, bans)
            }
            delete globals.SPAMS[id]
            return { noSend: true, status: StatusCode.INFO }
        }, category: CommandCategory.META,
        help: {
            info: "Runs bluec scripts. If running from a file, the top line of the file must be %bluecircle37%"
        }
    },
    "gvar": {
        run: async (msg, args, sendCallback) => {
            let [scope, ...nameList] = args.join(" ").split(":")
            let name = nameList.join(":")
            if (scope == "%") {
                scope = msg.author.id
            }
            else if (scope == ".") {
                let v = getVar(msg, name)
                if (v)
                    return { content: String(v), status: StatusCode.RETURN }
                else return { content: `\\v{${args.join(" ")}}`, status: StatusCode.RETURN }
            }
            let v = getVar(msg, name, scope)
            if (v)
                return { content: String(v), status: StatusCode.RETURN}
            else return { content: `\\v{${args.join(" ")}}` , status: StatusCode.RETURN}
        }, category: CommandCategory.META
    },
    "var": {
        run: async (msg: Message, args: ArgumentList, sendCallback) => {
            let opts;
            [opts, args] = getOpts(args)
            let [name, ...value] = args.join(" ").split("=").map(v => v.trim())
            if (!value.length) {
                return { content: "no value given, syntax `[var x=value", status: StatusCode.ERR }
            }
            let realVal = value.join("=")
            if (opts['prefix']) {
                let prefix = String(opts['prefix'])
                if (prefix.match(/^\d{18}/)) {
                    return { content: "No ids allowed", status: StatusCode.ERR}
                }
                setVar(name, realVal, prefix)
                if (!opts['silent'])
                    return { content: getVar(msg, name, prefix), status: StatusCode.RETURN }
            }
            else if (opts['u']) {
                setVar(name, realVal, msg.author.id)
                if (!opts['silent'])
                    return {
                        content: getVar(msg, name, msg.author.id),
                        status: StatusCode.RETURN
                    }
            }
            else {
                setVar(name, realVal)
                console.log(getVar(msg, name))
                if (!opts['silent'])
                    return {
                        content: getVar(msg, name),
                        status: StatusCode.RETURN
                    }
            }
            return { noSend: true, status: StatusCode.RETURN }
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
        run: async (msg: Message, args: ArgumentList, sendCallback) => {
            //@ts-ignore
            const file = FILE_SHORTCUTS[args[0]] || args[0]
            if (!file) {
                return {
                    content: "Nothing given to add to",
                    status: StatusCode.ERR
                }
            }
            if (file.match(/[\.]/)) {
                return {
                    content: "invalid command",
                    status: StatusCode.ERR
                }
            }
            if (!fs.existsSync(`./command-results/${file}`)) {
                return {
                    content: "file does not exist",
                    status: StatusCode.ERR
                }
            }
            let data = fs.readFileSync(`./command-results/${file}`, "utf-8").split(";END")
            let options = data.map((value, i) => value.trim() ? `${i + 1}:\t${value.trim()}` : "")
            let fn = generateFileName("remove", msg.author.id)
            fs.writeFileSync(fn, options.join("\n"))
            await handleSending(msg, {
                files: [{
                    attachment: fn,
                    name: "remove.txt"
                }],
                status: StatusCode.PROMPT
            }, sendCallback)
            fs.rmSync(fn)
            try {
                let collector = msg.channel.createMessageCollector({ filter: m => m.author.id == msg.author.id, time: 30000 })
                collector.on("collect", async (m) => {
                    if (['cancel', 'c'].includes(m.content || "c")) {
                        collector.stop()
                        return
                    }
                    let removedList = []
                    for (let numStr of m.content.split(" ")) {
                        let num = parseInt(numStr || "0")
                        if (!num) {
                            await handleSending(msg, {content: `${num} is not a valid number`, status: StatusCode.ERR}, sendCallback)
                            return
                        }
                        let removal = data[num - 1]
                        if (!removal)
                            return
                        let userCreated = removal.split(":")[0].trim()
                        if (userCreated != msg.author.id && ADMINS.indexOf(msg.author.id) < 0) {
                            await handleSending(msg, {
                                content: "You did not create that message, and are not a bot admin",
                                status: StatusCode.ERR
                            }, sendCallback)
                            continue
                        }
                        removedList.push(data[num - 1])
                        delete data[num - 1]
                    }
                    data = data.filter(v => typeof v != 'undefined')
                    fs.writeFileSync(`command-results/${file}`, data.join(";END"))
                    await handleSending(msg, {
                        status: StatusCode.RETURN,
                        content: `removed ${removedList.join("\n")} from ${file}`
                    }, sendCallback)
                    collector.stop()
                })
            }
            catch (err) {
                return {
                    content: "didnt respond in time",
                    status: StatusCode.ERR
                }
            }
            return { content: 'Say the number of what you want to remove or type cancel', status: StatusCode.PROMPT }
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
        run: async (msg, args, sendCallback) => {
            let fn = generateFileName("file", msg.author.id)
            fs.writeFileSync(fn, args.join(" "))
            return {
                files: [
                    {
                        attachment: fn,
                        name: `${fn}.txt`,
                        description: `data`,
                    }
                ],
                status: StatusCode.RETURN
            }
        },
        category: CommandCategory.UTIL

    },
    "b64": {
        run: async (_msg, args, sendCallback) => {
            let text = args.join(" ")
            return { content: Buffer.from(text).toString("base64"), status: StatusCode.RETURN }
        }, category: CommandCategory.UTIL
    },
    "b64d": {
        run: async (_msg, args, sendCallback) => {
            let text = args.join(" ")
            return { content: Buffer.from(text, "base64").toString("utf8"), status: StatusCode.RETURN }
        }, category: CommandCategory.UTIL
    },
    "rfile": {
        run: async (msg, args, sendCallback) => {
            let att = msg.attachments.at(0)
            if (att) {
                let data = await fetch.default(att.attachment.toString())
                let text = await data.buffer()
                return { content: text.toString(args[0] as BufferEncoding || "utf-8"), status: StatusCode.RETURN }
            }
            return { noSend: true, status: StatusCode.ERR }
        },
        category: CommandCategory.UTIL
    },
    "command-file": {
        run: async (_msg: Message, args: ArgumentList, sendCallback) => {
            let opts
            [opts, args] = getOpts(args)
            if (opts["l"]) {
                return {
                    content: `\`\`\`
${fs.readdirSync("./command-results").join("\n")}
\`\`\`
`,
                    status: StatusCode.RETURN
                }
            }
            //@ts-ignore
            const file = FILE_SHORTCUTS[args[0]] || args[0]
            if (!file) {
                return {
                    content: "Nothing given to add to",
                    status: StatusCode.ERR
                }
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
            return {
                files: [
                    {
                        attachment: `./command-results/${file}`,
                        name: `${file}.txt`,
                        description: `data for ${file}`,
                        delete: false
                    }
                ],
                status: StatusCode.ERR
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
    'send-log': {
        run: async (_msg, args, sendCallback) => {
            if (!fs.existsSync(`./command-results/${args.join(" ").replaceAll(/\.\.+/g, ".")}`)) {
                return { content: "File does not exist", status: StatusCode.ERR }
            }
            return { content: fs.readFileSync(`./command-results/${args.join(" ").replaceAll(/\.\.+/g, ".")}`, "utf-8"), status: StatusCode.RETURN }
        }, category: CommandCategory.META
    },
    "list-files": {
        run: async (_msg, _args, sendCallback) => {
            return { content: fs.readdirSync('./command-results').join("\n"), status: StatusCode.RETURN }
        },
        category: CommandCategory.META
    },
    add: {
        run: async (msg: Message, args: ArgumentList, sendCallback) => {
            //@ts-ignore
            const file = FILE_SHORTCUTS[args[0]] || args[0]
            if (!file) {
                return {
                    content: "Nothing given to add to",
                    status: StatusCode.ERR
                }
            }
            if (file.match(/[\.]/)) {
                return {
                    content: "invalid command",
                    status: StatusCode.ERR
                }
            }
            if (!fs.existsSync(`./command-results/${file}`)) {
                if (file === "wordle")
                    fs.writeFileSync(`./command-results/${file}`, "")
                else return { content: `${file} does not exist`, status: StatusCode.ERR }
            }
            args = args.slice(1)
            const data = args?.join(" ")
            if (!data) {
                return {
                    content: "No data given",
                    status: StatusCode.ERR
                }
            }
            fs.appendFileSync(`./command-results/${file}`, `${msg.author.id}: ${data};END\n`)
            return {
                content: `appended \`${data}\` to \`${file}\``,
                status: StatusCode.RETURN
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
        run: async (msg, args, sendCallback) => {
            let opts;
            [opts, args] = getOpts(args)
            let showArgs = true
            let expand = opts['e'] || false
            if (opts['n'] || opts['no-args']) {
                showArgs = false
            }
            let chain: string[] = [args[0]]
            let a = ""
            if (aliases[args[0]]) {
                let result = expandAlias(args[0], (alias: any, preArgs: any) => {
                    if (expand) {
                        a = parseAliasReplacement(msg, preArgs.join(" "), args.slice(1)) + " " + a + " "
                    }
                    else {
                        a = preArgs.join(" ") + " " + a + " "
                    }
                    if (showArgs) {
                        chain.push(`${alias} ${a}`)
                    }
                    else {
                        chain.push(alias)
                    }
                    return true
                })
                if (!result) {
                    return { content: "failed to expand alias", status: StatusCode.ERR }
                }
                return { content: `${chain.join(" -> ")}`, status: StatusCode.RETURN }
            }
            return { content: `${args[0].trim() || "No command given"}`, status: StatusCode.ERR }
        },
        help: {
            info: "Shows which command the alias turns into when run",
            arguments: {
                cmd: {
                    description: "The command to get the chain for"
                }
            },
            options: {
                "n": {
                    description: "Do not show extra arguments",
                    alternates: ["no-args"]
                },
                "e": {
                    description: "Expand alias arguments, eg: {sender}"
                }
            }
        },
        category: CommandCategory.META

    },
    rccmd: {
        run: async (msg, args, sendCallback) => {
            let name = args[0]
            if (!name) {
                return {
                    content: "No command name given",
                    status: StatusCode.ERR
                }
            }
            let commands = args.map(v => v.trim())
            let data = fs.readFileSync("command-results/alias", "utf-8").split(";END")
            let successfullyRemoved = []
            for (let i = 0; i < commands.length; i++) {
                let command = commands[i]
                let line = data.filter(v => v && v.split(" ")[1]?.trim() == command)[0]
                let idx = data.indexOf(line)
                if (idx >= 0) {
                    let [user, _] = line.trim().split(":")
                    user = user.trim()
                    if (user != msg.author.id && ADMINS.indexOf(msg.author.id) < 0) {
                        await sendCallback(`Cannot remove ${command}`)
                    }
                    else {
                        successfullyRemoved.push(command)
                        data.splice(idx, 1)
                    }
                }
            }
            fs.writeFileSync("command-results/alias", data.join(";END"))
            aliases = createAliases()
            return {
                content: `Removed: ${successfullyRemoved.join(", ")}`,
                status: StatusCode.RETURN
            }
        },
        category: CommandCategory.META

    },
    "8": {
        run: async (msg: Message, args: ArgumentList, sendCallback) => {
            let content = args.join(" ")
            let options = fs.readFileSync(`./command-results/8ball`, "utf-8").split(";END").slice(0, -1)
            return {
                content: choice(options)
                    .slice(20)
                    .replaceAll("{content}", content)
                    .replaceAll("{u}", `${msg.author}`),
                status: StatusCode.RETURN
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
        run: async (msg: Message, args: ArgumentList, sendCallback) => {
            let opts;
            [opts, args] = getOpts(args)
            let speed = parseInt(opts['speed'] as string) || 1
            let joinedArgs = args.join(" ")
            let [from, to] = joinedArgs.split("|")
            if (!to) {
                return { content: "No second place given, fmt: `place 1 | place 2`", status: StatusCode.ERR }
            }
            //@ts-ignore
            let fromUser = await fetchUser(msg.guild, from)
            //@ts-ignore
            let toUser = await fetchUser(msg.guild, to)
            if (fromUser && toUser) {
                let options = fs.readFileSync("./command-results/distance-easter-egg", "utf-8").split(';END').slice(0, -1)
                return {
                    content: choice(options)
                        .slice(20)
                        .replaceAll("{from}", fromUser.id)
                        .replaceAll("{to}", toUser.id)
                        .replaceAll("{f}", `${fromUser}`)
                        .replaceAll("{t}", `${toUser}`)
                        .trim(),
                    status: StatusCode.RETURN
                }
            }
            from = encodeURI(from.trim())
            to = encodeURI(to.trim())
            const url = `https://www.travelmath.com/distance/from/${from}/to/${to}`
            //@ts-ignore
            const resp = await fetch.default(url, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36",
                }
            })
            const $ = cheerio.load(await resp.text())
            let text = $("p.home2").text()
            let drivingDistText = text.match(/The total driving distance from [^\.]* is ([\d,]*) miles/)
            let drivingDist = 0;
            if (drivingDistText) {
                drivingDist = parseInt(drivingDistText[1]?.replaceAll(",", ""))
            }
            let straightLineText = text.match(/The total straight line flight distance from [^\.]* is ([\d,]*) miles/)
            let straightLineDist = 0
            if (straightLineText) {
                straightLineDist = parseInt(straightLineText[1]?.replaceAll(",", ""))
            }
            const embed = new MessageEmbed()
            embed.setTitle("Distances")
            if (drivingDist) {
                embed.addField("Driving distance", `${drivingDist} miles`)
                if (speed)
                    embed.addField("Driving distance time", `${drivingDist / speed} hours`)
            }
            if (straightLineDist) {
                embed.addField("Straight line distance", `${straightLineDist} miles`)
                if (speed)
                    embed.addField("Straight line distance time", `${straightLineDist / speed} hours`)
            }
            if (!drivingDist && !straightLineDist) {
                let options = fs.readFileSync("./command-results/distance-easter-egg", "utf-8").split(';END').slice(0, -1)
                return {
                    content: choice(options)
                        .slice(20)
                        .replaceAll("{from}", from)
                        .replaceAll("{to}", to)
                        .replaceAll("{f}", decodeURI(from))
                        .replaceAll("{t}", decodeURI(to))
                        .trim(),
                    status: StatusCode.RETURN
                }
            }
            return {
                embeds: [embed],
                status: StatusCode.RETURN
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
        run: async (_msg: Message, _args: ArgumentList, sendCallback) => {
            let values = ''
            let typeConv = { 1: "chat", 2: "user", 3: "message" }
            for (let cmd in commands) {
                values += `${cmd}\n`
            }
            for (let cmd of slashCommands) {
                //@ts-ignore
                if (cmd.type) {
                    //@ts-ignore
                    values += `${cmd["name"]}:${typeConv[cmd["type"]] || "chat"}\n`
                }
                else values += `/${cmd["name"]}\n`
            }
            return {
                content: values,
                status: StatusCode.RETURN
            }
        },
        category: CommandCategory.FUN
    },
    ht: {
        //help command
        run: async (msg, args, sendCallback) => {
            let opts
            [opts, args] = getOpts(args)
            let files = []
            let commandsToUse = commands
            if (args[0]) {
                commandsToUse = {}
                if (args[0] == "?") {
                    commandsToUse = commands
                }
                else {
                    for (let cmd of args) {
                        if (!commands[cmd]) continue
                        commandsToUse[cmd] = commands[cmd]
                    }
                }
            }
            if (opts['json']) {
                return { content: JSON.stringify(commandsToUse), status: StatusCode.RETURN }
            }
            if (Object.keys(commandsToUse).length < 1) {
                return {
                    content: "No help can be given :(",
                    status: StatusCode.ERR
                }
            }
            if (!fs.existsSync("help.html") || opts["n"] || args.length > 0) {
                await sendCallback("generating new help file")
                delete opts['n']
                let styles = fs.readFileSync("help-styles.css")
                let html = `<style>
${styles}
</style>`
                for (let command in commandsToUse) {
                    html += generateHTMLFromCommandHelp(command, commands[command])
                }
                fs.writeFileSync("help.html", html)
            }
            if (opts["p"] || opts['t']) {
                opts["plain"] = true
            }
            if (opts["m"]) {
                opts["markdown"] = true
            }
            if (opts["h"] || opts["html"] || Object.keys(opts).length === 0) {
                files.push({
                    attachment: "help.html",
                    name: "help.html",
                    description: "help",
                    delete: false
                })
                if (opts["h"])
                    delete opts["h"]
                if (opts["html"])
                    delete opts["html"]
            }
            const exts = {
                "plain": "txt",
                "markdown": "md",
                "man": "1",
                "commonmark": "md"
            }
            for (let fmt in opts) {
                if (fmt.length == 1) continue
                if (!fmt.match(/^\w+$/)) continue
                //@ts-ignore
                const ext = exts[fmt] || fmt
                try {
                    execSync(`pandoc -o output.${ext} -fhtml -t${fmt} help.html`)
                }
                catch (err) {
                    continue
                }
                files.push({
                    attachment: `output.${ext}`,
                    name: `help.${ext}`,
                    description: "help"
                })
            }
            if (fs.existsSync("output.txt")) {
                let content = fs.readFileSync("output.txt", "utf-8")
                fs.rmSync('output.txt')
                return {
                    content: `\`\`\`\n${content}\n\`\`\``,
                    status: StatusCode.RETURN
                }
            }
            if (files.length > 0) {
                return {
                    files: files,
                    status: StatusCode.RETURN
                }
            }
            return {
                content: "cannot send an empty file",
                status: StatusCode.ERR
            }
        },
        help: {
            options: {
                "json": {
                    description: "return the json of help"
                },
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
        run: async (_msg: Message, _args: ArgumentList, sendCallback) => {
            return {
                content: "https://github.com/euro20179/bircle",
                status: StatusCode.RETURN
            }
        },
        category: CommandCategory.META

    },
    WHITELIST: {
        run: async (msg: Message, args: ArgumentList, sendCallback) => {
            let user = args[0]
            if (!user) {
                return {
                    content: "no user given",
                    status: StatusCode.ERR
                }
            }
            let addOrRemove = args[1]
            if (!["a", "r"].includes(addOrRemove)) {
                return {
                    content: "did not specify, (a)dd or (r)emove",
                    status: StatusCode.ERR
                }
            }
            let cmds = args.slice(2)
            if (!cmds.length) {
                return {
                    content: "no cmd given",
                    status: StatusCode.ERR
                }
            }
            //@ts-ignore
            user = await fetchUser(msg.guild, user)
            if (addOrRemove == "a") {
                //@ts-ignore
                addToPermList(WHITELIST, "whitelists", user, cmds)

                return {
                    content: `${user} has been whitelisted to use ${cmds.join(" ")}`,
                    status: StatusCode.RETURN
                }
            } else {
                //@ts-ignore
                removeFromPermList(WHITELIST, "whitelists", user, cmds)
                return {
                    content: `${user} has been removed from the whitelist of ${cmds.join(" ")}`,
                    status: StatusCode.RETURN
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
    RESET_ECONOMY: {
        run: async (_msg, _args, sendCallback) => {
            economy.resetEconomy()

            return { content: "Economy reset", status: StatusCode.RETURN }

        }, category: CommandCategory.ADMIN,
        permCheck: (m) => ADMINS.includes(m.author.id)
    },
    RESET_LOTTERY: {
        run: async(msg, args, sb) => {
            economy.newLottery()
            return {content: "Lottery reset", status: StatusCode.RETURN}
        },
        category: CommandCategory.ADMIN
    },
    RESET_PLAYER: {
        run: async (msg, args, sendCallback) => {
            //@ts-ignore
            let player = await fetchUser(msg.guild, args[0])
            if (!player)
                return { content: "No player found", status: StatusCode.ERR }
            economy.resetPlayer(player.user.id)
            return { content: `Reset: <@${player.user.id}>`, status: StatusCode.RETURN }
        },
        category: CommandCategory.ADMIN,
        permCheck: m => ADMINS.includes(m.author.id)
    },
    RESET_PLAYER_ITEMS: {
        run: async (msg, args, sendCallback) => {
            //@ts-ignore
            let player = await fetchUser(msg.guild, args[0])
            if (!player)
                return { content: "No player found", status: StatusCode.ERR }
            resetPlayerItems(player.user.id)
            return { content: `Reset: <@${player.user.id}>`, status: StatusCode.RETURN }
        },
        category: CommandCategory.ADMIN,
        permCheck: m => ADMINS.includes(m.author.id)
    },
    RESET_ITEMS: {
        run: async (_msg, _args, sendCallback) => {
            resetItems()
            return { content: "Items reset", status: StatusCode.RETURN }
        },
        permCheck: (m) => ADMINS.includes(m.author.id),
        category: CommandCategory.ADMIN
    },
    SETMONEY: {
        run: async (msg, args, sendCallback) => {
            //@ts-ignore
            let user = await fetchUser(msg.guild, args[0])
            if (!user) {
                return { content: "user not found", status: StatusCode.ERR }
            }
            let amount = economy.calculateAmountFromString(msg.author.id, args[1])
            if (amount) {
                economy.setMoney(user.id, amount)
                return { content: `${user.id} now has ${amount}`, status: StatusCode.RETURN }
            }
            return { content: "nothing happened", status: StatusCode.ERR }
        }, category: CommandCategory.ADMIN,
        permCheck: (m) => ADMINS.includes(m.author.id)
    },
    'blacklist': {
        run: async (msg, args, sendCallback) => {
            let addOrRemove = args[0]
            if (!["a", "r"].includes(addOrRemove)) {
                return {
                    content: "did not specify, (a)dd or (r)emove",
                    status: StatusCode.ERR
                }
            }
            let cmds = args.slice(1)
            if (!cmds.length) {
                return {
                    content: "no cmd given",
                    status: StatusCode.ERR
                }
            }
            if (addOrRemove == "a") {
                //@ts-ignore
                addToPermList(BLACKLIST, "blacklists", msg.member, cmds)

                return {
                    content: `${msg.member} has been blacklisted from ${cmds.join(" ")}`,
                    status: StatusCode.RETURN
                }
            } else {
                //@ts-ignore
                removeFromPermList(BLACKLIST, "blacklists", msg.member, cmds)
                return {
                    content: `${msg.member} has been removed from the blacklist of ${cmds.join(" ")}`,
                    status: StatusCode.RETURN
                }
            }
        }, category: CommandCategory.UTIL
    },
    BLACKLIST: {
        run: async (msg: Message, args: ArgumentList, sendCallback) => {
            let user = args[0]
            if (!user) {
                return {
                    content: "no user given",
                    status: StatusCode.ERR
                }
            }
            let addOrRemove = args[1]
            if (!["a", "r"].includes(addOrRemove)) {
                return {
                    content: "did not specify, (a)dd or (r)emove",
                    status: StatusCode.ERR
                }
            }
            let cmds = args.slice(2)
            if (!cmds.length) {
                return {
                    content: "no cmd given",
                    status: StatusCode.ERR
                }
            }
            //@ts-ignore
            user = await fetchUser(msg.guild, user)
            if (addOrRemove == "a") {
                //@ts-ignore
                addToPermList(BLACKLIST, "blacklists", user as User, cmds)

                return {
                    content: `${user} has been blacklisted from ${cmds.join(" ")}`,
                    status: StatusCode.RETURN
                }
            } else {
                //@ts-ignore
                removeFromPermList(BLACKLIST, "blacklists", user, cmds)
                return {
                    content: `${user} has been removed from the blacklist of ${cmds.join(" ")}`,
                    status: StatusCode.RETURN
                }
            }
        },
        permCheck: msg => {
            return ADMINS.includes(msg.author.id)
        },
        help: {
            info: "Blacklist, or unblacklist a user from a command<br>syntax: [BLACKLIST @user (a|r) cmd"
        },
        category: CommandCategory.ADMIN

    },
    END: {
        run: async (msg: Message, _args: ArgumentList, sendCallback) => {
            if(fs.existsSync(String(currently_playing?.filename))){
                try{
                    fs.rmSync(String(currently_playing?.filename))
                }
                catch(err){}
            }
            await sendCallback("STOPPING")
            economy.saveEconomy()
            saveItems()
            saveVars()
            pet.savePetData()
            client.destroy()
            return {
                content: "STOPPING",
                status: StatusCode.RETURN
            }
        },
        permCheck: (msg) => {
            return ADMINS.includes(msg.author.id)
        },
        category: CommandCategory.ADMIN

    },

    "last-run": {
        run: async (msg, args, sendCallback) => {
            let lastRun;
            let fmt = args.join(" ") || "%D days, %H hours, %M minutes, %S seconds, %i milliseconds ago"
            if (fs.existsSync("./command-results/last-run")) {
                let data = fs.readFileSync("./command-results/last-run", "utf-8")
                lastRun = new Date()
                lastRun.setTime(Number(data))
            }
            else {
                lastRun = new Date(Date.now())
            }
            let diff = Date.now() - lastRun.getTime()
            let milliseconds = Math.floor(diff % 1000).toString()
            let seconds = Math.floor(diff / 1000 % 60).toString().replace(/^(\d)$/, "0$1")
            let minutes = Math.floor((diff / (1000 * 60)) % 60).toString().replace(/^(\d)$/, "0$1")
            let hours = Math.floor((diff / (1000 * 60 * 60) % 24)).toString().replace(/^(\d)$/, "0$1")
            let days = Math.floor((diff / (1000 * 60 * 60 * 24) % 7)).toString().replace(/^(\d)$/, "0$1")
            if (economy.canEarn(msg.author.id)) {
                let amount = diff / (1000 * 60 * 60)
                if (hours == minutes) {
                    amount *= 1.001
                }
                if (hours == minutes && minutes == seconds) {
                    amount *= 1.5
                }
                economy.addMoney(msg.author.id, amount)
                fmt += `\n{earnings}`
                fs.writeFileSync("./command-results/last-run", String(Date.now()))
            }
            return { content: format(fmt, { T: lastRun.toString(), t: `${days}:${hours}:${minutes}:${seconds}.${milliseconds}`, H: hours, M: minutes, S: seconds, D: days, i: milliseconds, f: String(diff), d: String(diff / (1000 * 60 * 60 * 24)), h: String(diff / (1000 * 60 * 60)), m: String(diff / (1000 * 60)), s: String(diff / 1000), hours: hours, minutes: minutes, seconds: seconds, millis: milliseconds, diff: String(diff), days: days, date: lastRun.toDateString(), time: lastRun.toTimeString(), earnings: `${msg.author} Earned: ${diff / (1000 * 60 * 60)}` }), status: StatusCode.RETURN }
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
                                X: member.displayHexColor.toString() || "#!N/A",
                                x: member.displayColor.toString() || "#!N/A",
                                c: user.createdAt.toString() || "#!N/A",
                                j: member.joinedAt?.toString() || "#!N/A",
                                b: member.premiumSince?.toString() || "#!N/A"
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
    "role-info": {
        run: async (msg, args, sendCallback) => {
            let search = args.join(" ").toLowerCase()
            let roles = await msg.guild?.roles.fetch()
            if (!roles) {
                return { content: "No roles found", status: StatusCode.ERR}
            }
            let foundRoles = roles.filter(r => r.name.toLowerCase() == search ? true : false)
            if (!foundRoles.size) {
                foundRoles = roles.filter(r => r.name.toLowerCase().match(search) ? true : false)
            }
            if (!foundRoles.size) {
                foundRoles = roles.filter(r => r.id == search ? true : false)
            }

            let role = foundRoles.at(0)
            if (!role) {
                return { content: "Could not find role", status: StatusCode.ERR }
            }
            let embed = new MessageEmbed()
            embed.setTitle(role.name)
            embed.setColor(role.color)
            embed.addField("id", String(role.id), true)
            embed.addField("name", role.name, true)
            embed.addField("emoji", role.unicodeEmoji || "None", true)
            embed.addField("created", role.createdAt.toTimeString(), true)
            embed.addField("Days Old", String((Date.now() - (new Date(role.createdTimestamp)).getTime()) / (1000 * 60 * 60 * 24)), true)
            return { embeds: [embed] || "none", status: StatusCode.RETURN }
        },
        category: CommandCategory.UTIL
    },
    "channel-info": {
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
            let embed = new MessageEmbed()
            //@ts-ignore
            embed.setTitle(channel.name || "Unknown name")
            if (pinned) {
                let pinCount = pinned.size
                let daysTillFull = (daysSinceCreation / pinCount) * (50 - pinCount)
                embed.addField("Pin Count", String(pinCount), true)
                embed.addField("Days till full", String(daysTillFull), true)
            }
            embed.addField("Created", channel.createdAt?.toString() || "N/A", true)
            embed.addField("Days since Creation", String(daysSinceCreation), true)
            embed.addField("Id", channel.id.toString(), true)
            embed.addField("Type", channel.type, true)
            //@ts-ignore
            if (channel.topic) {
                //@ts-ignore
                embed.addField("Topic", channel.topic, true)
            }
            //@ts-ignore
            if (channel.nsfw) {
                //@ts-ignore
                embed.addField("NSFW?", channel.nsfw, true)
            }
            //@ts-ignore
            if (channel.position) {
                //@ts-ignore
                embed.addField("Position", channel.position.toString(), true)
            }
            return { embeds: [embed], status: StatusCode.RETURN }
        },
        category: CommandCategory.UTIL
    },
    "emote-info": {
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
            let embed = new MessageEmbed()
            embed.setTitle(String(e.name))
            embed.addField("id", e.id, true)
            embed.addField("created Date", e?.createdAt.toDateString(), true)
            embed.addField("Creation time", e?.createdAt.toTimeString(), true)
            embed.addField("THE CREATOR", String(e?.author), true)
            if (e.url)
                embed.setThumbnail(e.url)
            embed.addField("URL", e?.url, true)
            return { embeds: [embed], status: StatusCode.RETURN }
        }, category: CommandCategory.UTIL
    },
    "user-info": {
        run: async (msg: Message, args: ArgumentList, sendCallback) => {
            if (!args[0]) {
                return {
                    content: "no member given!"
                }
            }
            //@ts-ignore
            let member = await fetchUser(msg.guild, args[0])
            return Pipe.start(member)
                .default({ content: "member not found" })
                .next((member: GuildMember) => {
                    if (!member.user) {
                        return
                    }
                    return [member, member.user]
                })
                .default({ content: "user not found" })
                .next((member: GuildMember, user: User) => {
                    if (args[1]) {
                        const fmt = args.slice(1).join(" ")
                        return {
                            content: format(fmt
                                .replaceAll("{id}", user.id || "#!N/A")
                                .replaceAll("{username}", user.username || "#!N/A")
                                .replaceAll("{nickname}", member.nickname || "#!N/A")
                                .replaceAll("{0xcolor}", member.displayHexColor.toString() || "#!N/A")
                                .replaceAll("{color}", member.displayColor.toString() || "#!N/A")
                                .replaceAll("{created}", user.createdAt.toString() || "#!N/A")
                                .replaceAll("{joined}", member.joinedAt?.toString() || "#!N/A")
                                .replaceAll("{boost}", member.premiumSince?.toString() || "#!N/A"),
                                {
                                    i: user.id || "#!N/A",
                                    u: user.username || "#!N/A",
                                    n: member.nickname || "#!N/A",
                                    X: member.displayHexColor.toString() || "#!N/A",
                                    x: member.displayColor.toString() || "#!N/A",
                                    c: user.createdAt.toString() || "#!N/A",
                                    j: member.joinedAt?.toString() || "#!N/A",
                                    b: member.premiumSince?.toString() || "#!N/A",
                                    a: user.avatarURL() || "#!N/A"
                                }
                            )
                        }
                    }
                    let embed = new MessageEmbed()
                    embed.setColor(member.displayColor)
                    embed.setThumbnail(user.avatarURL() || "")
                    embed.addField("Id", user.id || "#!N/A", true)
                    embed.addField("Username", user.username || "#!N/A", true)
                    embed.addField("Nickname", member.nickname || "#!N/A", true)
                    embed.addField("0xColor", member.displayHexColor.toString() || "#!N/A", true)
                    embed.addField("Color", member.displayColor.toString() || "#!N/A", true)
                    embed.addField("Created at", user.createdAt.toString() || "#!N/A", true)
                    embed.addField("Joined at", member.joinedAt?.toString() || "#!N/A", true)
                    embed.addField("Boosting since", member.premiumSince?.toString() || "#!N/A", true)
                    return {
                        embeds: [embed]
                    }
                }).done()
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
    "emote-use": {
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
    "cmd-use": {
        run: async (_msg: Message, args: ArgumentList, sendCallback) => {
            let opts;
            [opts, args] = getOpts(args)
            let data = globals.generateCmdUseFile()
                .split("\n")
                .map(v => v.split(":")) //map into 2d array, idx[0] = cmd, idx[1] = times used
                .filter(v => v[0] && !isNaN(Number(v[1]))) // remove empty strings
                //@ts-ignore
                .sort((a, b) => a[1] - b[1]) // sort from least to greatest
                .reverse() //sort from greatest to least
                .map(v => `${v[0]}: ${v[1]}`) //turn back from 2d array into array of strings
                .join(String(opts['s'] ?? "\n"))
            return {
                content: data,
                status: StatusCode.RETURN
            }
        },
        category: CommandCategory.META

    },
    invite: {
        run: async (msg, _args, sendCallback) => {
            let invites = await msg.guild?.invites.fetch()
            if (invites?.at(0)?.url) {
                return { content: invites.at(0)?.url, status: StatusCode.RETURN }
            }
            return { content: "No invite found", status: StatusCode.ERR }
        },
        category: CommandCategory.UTIL
    },
    "non-assigned-roles": {
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
        category: CommandCategory.UTIL
    },
    tail: {
        run: async (msg, args, sendCallback) => {
            let opts;
            [opts, args] = getOpts(args)
            let count = parseInt(String(opts['count'])) || 10
            let argText = args.join(" ")
            return { content: argText.split("\n").reverse().slice(0, count).reverse().join("\n"), status: StatusCode.RETURN }
        }, category: CommandCategory.UTIL
    },
    head: {
        run: async (msg, args, sendCallback) => {
            let opts;
            [opts, args] = getOpts(args)
            let count = parseInt(String(opts['count'])) || 10
            let argText = args.join(" ")
            return { content: argText.split("\n").slice(0, count).join("\n"), status: StatusCode.RETURN }
        },
        help: {
            info: "Say the first 10 lines of some text",
            arguments: {
                text: {
                    description: "Text"
                }
            },
            options: {
                count: {
                    description: "The amount of lines to show"
                }
            }
        },
        category: CommandCategory.UTIL
    },
    nl: {
        run: async (msg, args, sendCallback) => {
            let text = args.join(" ").split('\n')
            let rv = ""
            for (let i = 1; i < text.length + 1; i++) {
                rv += `${i}: ${text[i - 1]}\n`
            }
            return { content: rv, status: StatusCode.RETURN }
        }, category: CommandCategory.UTIL
    },
    grep: {
        run: async (msg: Message, args: ArgumentList, sendCallback) => {
            let opts: Opts;
            [opts, args] = getOpts(args)
            let regex = args[0]
            if (!regex) {
                return {
                    content: "no search given",
                    status: StatusCode.ERR
                }
            }
            let data = args.slice(1).join(" ").trim()
            if (!data) {
                if (msg.attachments?.at(0)) {
                    data = downloadSync(msg.attachments?.at(0)?.attachment as string).toString()
                }
                else return { content: "no data given to search through", status: StatusCode.ERR }
            }
            let match = data.matchAll(new RegExp(regex, "gm"))
            let finds = ""
            for (let find of match) {
                if (opts['s']) {
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
            },
            options: {
                "s": createHelpOption("dont give back the extra \"Foudn x at char...\" text")
            }
        },
        category: CommandCategory.UTIL
    },
    alias: {
        run: async (msg: Message, args: ArgumentList, sendCallback) => {
            let cmd
            [cmd, ...args] = args
            let realCmd = args[0]
            if (!realCmd) {
                return { content: "No  alias name given", status: StatusCode.ERR }
            }
            realCmd = realCmd.trim()
            if (realCmd.includes(" ")) {
                return { content: "Name cannot have space", status: StatusCode.ERR }
            }
            args = args.slice(1)
            if (!args) {
                return { content: "No command given", status: StatusCode.ERR }
            }
            if (aliases[cmd]) {
                return { content: `Failed to add "${cmd}", it already exists`, status: StatusCode.ERR }
            }
            if (commands[cmd]) {
                return { content: `Failed to add "${cmd}", it is a builtin`, status: StatusCode.ERR }
            }
            fs.appendFileSync("command-results/alias", `${msg.author.id}: ${cmd} ${realCmd} ${args.join(" ")};END\n`)
            aliases = createAliases()
            return {
                content: `Added \`${cmd}\` = \`${realCmd}\` \`${args.join(" ")}\``,
                status: StatusCode.RETURN
            }
        },
        category: CommandCategory.META
    },
    "!!": {
        run: async (msg: Message, args: ArgumentList, sendCallback) => {
            let opts;
            [opts, args] = getOpts(args)
            if (opts['check'] || opts['print'] || opts['see'])
                return { content: `\`${lastCommand[msg.author.id]}\``, status: StatusCode.RETURN }
            if (!lastCommand[msg.author.id]) {
                return { content: "You ignorance species, there have not been any commands run.", status: StatusCode.ERR }
            }
            msg.content = lastCommand[msg.author.id]
            return await doCmd(msg, true) as CommandReturn
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
        run: async (_msg, _args, sendCallback) => {
            if (!purgeSnipe) {
                return { content: "Nothing has been purged yet", status: StatusCode.ERR }
            }
            let content = ""
            let files: CommandFile[] = []
            let embeds: MessageEmbed[] = []
            for (let m of purgeSnipe) {
                if (m.content) {
                    content += `${m.author} says: \`\`\`${m.content}\`\`\`\n`
                }
                let mAttachments = m.attachments?.toJSON()
                if (mAttachments) {
                    files = files.concat(mAttachments as CommandFile[])
                }
                if (m.embeds) {
                    embeds = embeds.concat(m.embeds)
                }
            }
            return { content: content ? content : undefined, files: files, embeds: embeds, status: StatusCode.RETURN }
        },
        help: {
            info: "Similar to snipe, but shows the messages deleted from commands such as !clear"
        },
        category: CommandCategory.FUN
    },
    snipe: {
        run: async (_msg: Message, args: ArgumentList, sendCallback) => {
            let snipeC = ((parseInt(args[0]) - 1) || 0)
            if (snipeC >= 5) {
                return { content: "it only goes back 5", status: StatusCode.ERR }
            }
            if (snipeC > snipes.length) {
                return { content: "Not that many messages have been deleted yet", status: StatusCode.ERR }
            }
            if (!snipes.length) {
                return { content: "Nothing has been deleted", status: StatusCode.ERR }
            }
            let snipe = snipes[snipeC]
            if (!snipe) {
                return { content: "no snipe", status: StatusCode.ERR }
            }
            let rv: CommandReturn = { deleteFiles: false, content: `${snipe.author} says:\`\`\`\n${snipe.content}\`\`\``, status: StatusCode.RETURN }
            let files = snipe.attachments?.toJSON()
            if (files) {
                rv["files"] = files as CommandFile[]
            }
            if (snipe.embeds) {
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
        run: async (msg, _args, sendCallback) => {
            return { content: `${(new Date()).getMilliseconds() - msg.createdAt.getMilliseconds()}ms`, status: StatusCode.RETURN }
        },
        category: CommandCategory.META
    },
    version: {
        run: async (_msg, args, sendCallback) => {
            let opts;
            [opts, args] = getOpts(args)
            if (opts['l']) {
                return { content: fs.readdirSync('changelog').map(v => v.replace(/\.md/, "")).join("\n"), status: StatusCode.RETURN }
            }
            let fmt = args[0] || "%v"
            console.log(VERSION)
            let { major, minor, bug, part, alpha, beta } = VERSION
            let mainDisplay = (() => {
                let d = `${major}.${minor}.${bug}`
                if (part)
                    d += `.${part}`
                if (alpha)
                    d = `A.${d}`
                if (beta)
                    d = `B.${d}`
                return d
            })()
            return {
                content: format(fmt, {
                    v: mainDisplay,
                    M: String(major),
                    m: String(minor),
                    b: String(bug),
                    p: part,
                    A: String(alpha),
                    B: String(beta)
                }),
                status: StatusCode.RETURN
            }
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
        run: async (_msg, args, sendCallback) => {
            let opts;
            [opts, args] = getOpts(args)
            if (opts['l']) {
                return { content: fs.readdirSync('changelog').map(v => v.replace(/\.md/, "")).join("\n"), status: StatusCode.RETURN }
            }
            let version = args[0]
            if (!args[0]) {
                version = (() => {
                    let d = `${VERSION.major}.${VERSION.minor}.${VERSION.bug}`
                    if (VERSION.part)
                        d += `.${VERSION.part}`
                    if (VERSION.alpha)
                        d = `A.${d}`
                    if (VERSION.beta)
                        d = `B.${d}`
                    return d
                })()
            }
            if (!fs.existsSync(`changelog/${version}.md`)) {
                return { content: `${version} does not exist`, status: StatusCode.ERR }
            }
            if (opts['f']) {
                return { files: [{ attachment: `changelog/${version}.md`, name: `${version}.md`, description: `Update: ${version}` }], deleteFiles: false, status: StatusCode.RETURN }
            }
            return { content: fs.readFileSync(`changelog/${version}.md`, "utf-8"), status: StatusCode.RETURN }
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
        run: async (_msg, _args, sendCallback) => {
            let data = ""
            for (let id in globals.SPAMS) {
                data += `${id}\n`
            }
            return { content: data || "No spams", status: StatusCode.RETURN }
        },
        category: CommandCategory.META
    }
}

export let aliases = createAliases()

export function isCmd(text: string, prefix: string) {
    return text.slice(0, prefix.length) === prefix
}

export async function doCmd(msg: Message, returnJson = false, recursion = 0, disable?: { categories?: CommandCategory[], commands?: string[] }) {
    let command: string
    let args: Array<string>
    let doFirsts: { [item: number]: string }

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
    let rv: CommandReturn = {status: StatusCode.RETURN};

    let local_prefix = user_options.getOpt(msg.author.id, "prefix", prefix)

    //Get the command (the first word in the message content)
    command = msg.content.split(" ")[0].slice(local_prefix.length)

    setVar("_!!", command, msg.author.id)

    //the rest of the stuff are the arguments
    args = msg.content.split(" ").slice(1)

    //first check for modifiers

    let sendCallback = msg.channel.send.bind(msg.channel)


    let skipParsing = false

    if (command.startsWith("s:")) { //s: (silent) modifier
        //change this function to essentially do nothing, it just returns the orriginal message as it must return a message
        //msg.channel.send = async (_data) => msg
        command = command.slice(2)
        sendCallback = async (_data) => msg
    }
    let m; //variable to keep track of the match
    //this regex matches: /redir!?\((prefix)?:variable\)
    if (m = command.match(/^redir(!)?\(([^:]*):([^:]+)\):/)) { //the redir: modifier
        //whether or not to redirect *all* message sends to the variable, or just the return value from the command
        let all = m[1] //this matches the ! after redir
        let skip = 9 //the base length of redir(:):
        if (all) {
            //add 1 for the !
            skip++
            //change this function to redirect into the variable requested
            sendCallback = async (_data) => {
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
                return msg
            }
        }
        //the variable scope
        let prefix = m[2] //matches the text before the  : in the parens in redir
        console.log(prefix.length)
        skip += prefix.length
        //the variable name
        let name = m[3] //matches the text after the :  in the parens in redir
        if (!prefix) {
            prefix = "__global__"
            redir = [vars["__global__"], name]
        }
        else if (prefix) {
            skip += prefix.length
            if (!vars[prefix])
                vars[prefix] = {}
            redir = [vars[prefix], name]
        }
        skip += name.length
        command = command.slice(skip)
    }
    if (command.startsWith("t:")) {
        typing = true
        command = command.slice(2)
    }
    if (command.startsWith("d:")) {
        if (msg.deletable) await msg.delete()
        command = command.slice(2)
    }
    if (command.startsWith("n:")){
        skipParsing = true
        command = command.slice(2)
    }

    //next expand aliases
    if (!commands[command] && aliases[command]) {
        //expand the alias to find the true command
        let expansion = await expandAlias(command, (alias: any) => {
            globals.addToCmdUse(alias) //for every expansion, add to cmd use
            if (BLACKLIST[msg.author.id]?.includes(alias)) { //make sure they're not blacklisted from the alias
                handleSending(msg, { content: `You are blacklisted from ${alias}`, status: StatusCode.ERR }, sendCallback, recursion + 1)
                return false
            }
            return true
        })
        //if it was able to expand (not blacklisted, and no misc errors)
        if (expansion) {
            //alias is actually the real command
            //aliasPreArgs are the arguments taht go after the commnad
            let [alias, aliasPreArgs] = expansion
            msg.content = `${local_prefix}${alias} ${aliasPreArgs.join(" ")}`
            let oldC = msg.content
            //aliasPreArgs.join is the command  content, args is what the user typed
            msg.content = `${local_prefix}${alias} ${parseAliasReplacement(msg, aliasPreArgs.join(" "), args)}`
            if (oldC == msg.content) {
                msg.content = msg.content + ` ${args.join(" ")}`
            }
            //set the args again as alias expansion can change it
            args = msg.content.split(" ").slice(1)
            //set the command to the new alias
            command = alias
            //rv = await doCmd(msg, true) as CommandReturn
        }
        else {
            rv = { content: `failed to expand ${command}`, status: StatusCode.ERR }
            exists = false
        }
    }
    if (!commands[command]) {
        //We dont want to keep running commands if the command doens't exist
        //fixes the [[[[[[[[[[[[[[[[[ exploit
        if(command.startsWith(prefix)){
            command = `\\${command}`
        }
        rv = { content: `${command} does not exist`, status: StatusCode.ERR }
        exists = false
    }

    if(skipParsing === false){
        //Then parse cmd to get the cmd, arguments, and dofirsts
        let _
        //get the new parsed args
        [_, args, doFirsts] = await parseCmd({ msg: msg })

        let doFirstData: { [key: number]: string } = {} //where key is the argno that the dofirst is at
        let doFirstCountNoToArgNo: { [key: number]: string } = {} //where key is the doFirst number

        //idxNo is the doFirst count (the number  of dofirst)
        let idxNo = 0
        //idx is the position in the args variable, not the doFirst count
        for (let idx in doFirsts) {
            let cmd = doFirsts[idx]
            let oldContent = msg.content
            //hack to run command as if message is cmd
            msg.content = cmd
            let rv = await doCmd(msg, true, recursion + 1, disable) as CommandReturn
            msg.content = oldContent
            //recursively evaluate msg.content as a command
            if (rv.recurse && rv.content && isCmd(rv.content, local_prefix) && recursion < 20) {
                let oldContent = msg.content
                msg.content = rv.content
                rv = await doCmd(msg, true, recursion + 1, rv.recurse === true ? undefined : rv.recurse) as CommandReturn
                msg.content = oldContent
            }
            let data = getContentFromResult(rv as CommandReturn).trim()
            msg.content = oldContent
            //end hack
            doFirstData[idx] = data
            doFirstCountNoToArgNo[idxNo] = idx
            idxNo++
        }

        //If there is a dofirst, parse the %{...} stuff
        if (Object.keys(doFirstData).length > 0) {
            args = parseDoFirst(doFirstData, doFirstCountNoToArgNo, args)
            //%{-1} expands to __BIRCLE__UNDEFINED__, replace with nothing
            args = args.map(v => v.replaceAll("__BIRCLE__UNDEFINED__", ""))
        }
    }


    if (exists) {
        //make sure it passes the command's perm check if it has one
        if (commands[command].permCheck) {
            canRun = commands[command].permCheck?.(msg) ?? true
        }
        //is whitelisted
        if (WHITELIST[msg.author.id]?.includes(command)) {
            canRun = true
        }
        //is blacklisted
        if (BLACKLIST[msg.author.id]?.includes(command)) {
            canRun = false
        }
        if (disable?.commands && disable.commands.includes(command)) {
            canRun = false
        }
        if (disable?.categories && disable.categories.includes(commands[command].category)) {
            canRun = false
        }
        if (canRun) {
            if (typing)
                await msg.channel.sendTyping()
            let [opts, args2] = getOpts(args)
            setVar("_!!!", command, msg.author.id)
            rv = await commands[command].run(msg, args, sendCallback, opts, args2, recursion, typeof rv.recurse === "object" ? rv.recurse : undefined)
                //if normal command, it counts as use
            globals.addToCmdUse(command)
        }
        else rv = { content: "You do not have permissions to run this command", status: StatusCode.ERR }
    }

    //illegalLastCmds is a list that stores commands that shouldn't be counted as last used, !!, and spam
    if (!illegalLastCmds.includes(command)) {
        //this is for the !! command
        lastCommand[msg.author.id] = msg.content
    }
    if (returnJson) {
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
    handleSending(msg, rv, sendCallback, recursion + 1)
}

export async function expandAlias(command: string, onExpand?: (alias: string, preArgs: string[]) => any): Promise<[string, string[]] | false> {
    let expansions = 0
    let aliasPreArgs = aliases[command].slice(1)
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
    if(rv.content && rv.do_change_cmd_user_expansion !== false){
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
        if(opt !== ""){
            rv.content = opt
            if(rv.recurse && rv.recurse !== true){
                //if rv specified different bans, we want those to take priority
                rv.recurse = {...rv.recurse}
            }
            else{
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
    else if (recursion < globals.RECURSION_LIMIT && rv.recurse && rv.content.slice(0, local_prefix.length) === local_prefix) {
        let oldContent = msg.content
        msg.content = rv.content
        let do_change_cmd_user_expansion = rv.do_change_cmd_user_expansion
        rv = await doCmd(msg, true, recursion + 1, rv.recurse === true ? undefined : rv.recurse) as CommandReturn
        //we only want to override it if the command doens't explicitly want to do it
        if(rv.do_change_cmd_user_expansion !== true && do_change_cmd_user_expansion === false){
            rv.do_change_cmd_user_expansion = do_change_cmd_user_expansion
        }
            
        msg.content = oldContent
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

export function generateDefaultRecurseBans() {
    return { categories: [CommandCategory.GAME, CommandCategory.ADMIN], commands: ["sell", "buy", "bitem", "bstock", "bpet", "option", "!!", "rccmd", "var", "expr", "do", "runas"] }
}

