///<reference path="index.d.ts" />

import fs = require("fs")

import https = require('https')
import Stream = require('stream')
const { execSync } = require('child_process')

const { REST } = require('@discordjs/rest')
const { Routes } = require("discord-api-types/v9")
import {Client, Intents, MessageEmbed, Message, PartialMessage, Interaction, GuildMember, ColorResolvable } from 'discord.js'

import svg2img = require("svg2img")
import sharp = require('sharp')
import got = require('got')
import cheerio = require('cheerio')
import jimp = require('jimp')

import { CLIENT_RENEG_LIMIT } from "tls"

const { prefix, vars, ADMINS, FILE_SHORTCUTS, WHITELIST, BLACKLIST, addToPermList, removeFromPermList } = require('./common.js')
const { parseCmd, parsePosition } = require('./parsing.js')
const { downloadSync, fetchUser, format, generateFileName, createGradient, applyJimpFilter, randomColor, rgbToHex, safeEval } = require('./util.js')

const client = new Client({intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_MEMBERS]})

const token = fs.readFileSync("./TOKEN", "utf-8").trim()
const CLIENT_ID = fs.readFileSync("./CLIENT", "utf-8").trim()
const GUILD_ID = fs.readFileSync("./GUILD", "utf-8").trim()

let SPAM_ALLOWED = true

let SPAMS: {[id: string]: boolean} = {}

let lastCommand:  Message;
let snipe:  Message | PartialMessage;

const illegalLastCmds = ["!!", "spam"]

function createChatCommand(name: string, description: string, options){
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

function createChatCommandOption(type: number, name: string, description: string, {min, max, required}: {min?: number, max?: number | null, required?: boolean}){
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
    createChatCommand("ccmd", "create a custom command, WOWZERS", [
        createChatCommandOption(STRING, "name", "name of command (NO SPACES)", {required: true}),
        createChatCommandOption(STRING, "text", "what to say", {required: true})
    ]),
    createChatCommand("alias", "A more powerful ccmd", [
        createChatCommandOption(STRING, "name", "name of command (NO SPACES)", {required: true}),
        createChatCommandOption(STRING, "command", "command to run", {required: true}),
        createChatCommandOption(STRING, "text", "Text to give to command", {})
    ]),
    createChatCommand("rccmd", "remove a custom command, WOWZERS", [
        createChatCommandOption(STRING, "name", "name of command to remove (NO SPACES)", {required: true}),
    ]),
    createChatCommand("say", "says something", [
	createChatCommandOption(STRING, "something", "the something to say", {required: true})
    ]),
    createChatCommand("help", "get help", []),
    {
        name: "ping",
        type: 2
    },
    {
        name: "info",
        type: 2
    }
]

function getContentFromResult(result: CommandReturn){
    return result['content'] || ""
}

function getOpts(args: Array<string>): [Opts, ArgumentList]{
    let opts: Opts = {} 
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
                let requiresValue = options[option].requiresValue || false
                html += `<li class="command-option">
    <details class="command-option-details-label" title="requires value: ${requiresValue}"><summary class="command-option-summary">-${option}</summary>${desc}</details></li>`
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

function getImgFromMsgAndOpts(opts: {}, msg: Message){
    let img: undefined | string = opts['img']
    if(msg.attachments?.at(0)){
        img = msg.attachments.at(0)?.attachment
    }
    if(msg.reply?.attachments?.at(0)){
        img = msg.reply.attachments.at(0)?.attachment
    }
    if(!img) {
        img = msg.channel.messages.cache.filter((m: Message) => m.attachments?.first())?.last()?.attachments?.first()?.attachment
    }
    return img
}

const commands: {[command: string]: Command} = {
    calc: {
	run: async(msg, args) => {
	    try{
		return {content: String(safeEval(args.join(" "), {user: msg.author, args: args}))}
	    }
	    catch(err){
		console.log(err)
	    }
	},
	help: {
	    info: "Run a calculation",
	    arguments: {
		equation: {
		    description: "The equation to evaluate"
		}
	    }
	}
    },
    echo:{
        run: async (msg: Message, args: ArgumentList) => {
            let opts
            [opts, args] = getOpts(args)
	    let wait = parseInt(String(opts['wait'])) || 0
            let embedText = opts['e'] || opts['embed']
            let embed
            if(embedText){
                embed = new MessageEmbed()
                if(embedText !== true)
                    embed.setTitle(embedText)
                let img = getImgFromMsgAndOpts(opts, msg)
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
            args = args.join(" ")
            let files = msg.attachments?.toJSON()
            if(!args && !embed && !files.length){
                return {
                    content: "cannot send nothing"
                }
            }
	    if(wait){
		await new Promise((res) => setTimeout(res, wait * 1000))
	    }
            return {
                delete: !(opts["D"] || opts['no-del']),
                content: args,
                embeds: embed ? [embed] : undefined,
                files: files,
                deleteFiles: false
            }
        },
        help: {
            info: "the bot will say the <code>text</code>",
            options: {
                "D": {
                    description: "If given, dont delete original message"
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
                    description: "Image of the embed"
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
    uptime: {
        run: async(msg: Message, args:ArgumentList) => {
            let uptime = client.uptime
	    if(!uptime){
		return {
		    content: "No uptime found"
		}
	    }
            let fmt = args[0] || "%d:%h:%m:%s"
            let days, hours, minutes, seconds;
            seconds = uptime / 1000
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
                content: format(fmt, {"d": `${days}`, "h": `${hours}`, "m": `${minutes}`, "s": `${seconds}`})
            }
        },
        help: {
            "info": "gives up time of the bot",
            arguments: {
                fmt: {
                    "description": "the format to show the uptime in<br>%s: seconds, %m: minutes, %h: hours, %d: days<br>{s}: seconds, {m}: minutes, {h}: hours, {d}: days"
                }
            }
        }
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
        }
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
	}
    },
    whohas: {
	run: async(msg, args) => {
	    let role = args[0]
	    if(!role){
		return {content: "No role given"}
	    }
	    let roleRef = await msg.guild?.roles.fetch()
	    if(!roleRef){
		return {content: "no roles found somehow"}
	    }
	    let realRole = roleRef.filter(v => v.name.toLowerCase() == role.toLowerCase() || v.name.toLowerCase().startsWith(role.toLowerCase()))?.at(0)
	    if(!realRole){
		return {
		    content: "Could not find role"
		}
	    }
	    let memberTexts = [""]
	    let embed = new MessageEmbed()
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
	}
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
		console.log("hi")
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
                    description: "Put a gradient instead of solid color, stynax: <code>-gradient=color1>color2>color3...</code>"
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
        }
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
        }
    },
    rect: {
        run: async(msg: Message, args: ArgumentList) => {
            let opts;
            [opts, args] = getOpts(args)
            let color: string = opts['color'] || "white"
            let outline = opts['outline']
            let img = getImgFromMsgAndOpts(opts, msg)
            if(!img){
                return {
                    content: "no img found"
                }
            }
            let gradient: Array<string> | undefined = opts['gradient']?.split(">")
            let [x, y, width, height] = args.slice(0,4)
            if(!x){
                x = opts['x'] || "0"
            }
            if(!y){
                y = opts['y'] || "0"
            }
            if(!width){
                width = opts['w'] || opts['width'] || opts['size'] || "50"
            }
            if(!height){
                height = opts['h'] || opts['height'] || opts['size'] || width || "50"
            }
            width = parseInt(width as string) || 50
            height = parseInt(height as string) || 50
            https.request(img, resp => {
                let data = new Stream.Transform()
                resp.on("data", chunk => {
                    data.push(chunk)
                })
                resp.on("end", async() => {
                    let fn = `${generateFileName("rect", msg.author.id)}.png`
                    fs.writeFileSync(fn, data.read())
		    let oldImg = await sharp(fn).png()
		    let oldMeta = await oldImg.metadata()
		    let [oldWidth, oldHeight] = [oldMeta.width, oldMeta.height]

		    let newImg
                    if(gradient){
			newImg = sharp(await createGradient(gradient, width, height))
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
				width: width,
				height: height,
				channels: 4,
				background: trueColor
			    }
			})
		    }
		    let composedImg = await oldImg.composite([{input: await newImg.png().toBuffer(), top: parsePosition(y, oldHeight, height), left: parsePosition(x, oldWidth, width)}]).png().toBuffer()
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
        }
    },
    scale: {
        run: async(msg: Message, args: ArgumentList) => {
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
        }
    },
    filter: {
        run: async(msg: Message, args:ArgumentList) => {
            let opts;
            [opts, args] = getOpts(args)
            args = args.join(" ")
            let filters = args.split("|")
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
        }
    },
    /*
    text: {
        run: async(msg: Message, args: ArgumentList) => {
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
        }
    },
    */
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
        }
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
        }
    },
    rotate: {
        run: async(msg: Message, args: ArgumentList) => {
            return commands['filter'].run(msg, [`rotate:${args[0]},${args[1]}`])
        }
    },
    color: {
        run: async(msg: Message, args: ArgumentList) => {
            let opts;
            [opts, args] = getOpts(args)
            args = args.join(" ")
            let color = args || "RANDOM"
            let colors = args.split(">")

            const width = Math.min(parseInt(opts['w']) || 250, 2000)
            const height = Math.min(parseInt(opts['h']) || 250, 2000)

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
		buffer = await sharp(await createGradient(gradient, width, height)).png().toBuffer()
                content = colorStrings.join(" > ")
            }
            else{
                if(color == "RANDOM"){
                    let [R, G, B] = randomColor()
                    color = `rgb(${R}, ${G}, ${B})`
                    content = rgbToHex(R, G, B)
                }
		buffer = await sharp({create: {
		    width: width,
		    height: height,
		    channels: 4,
		    background: color
		}}).png().toBuffer()
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
        }
    },
    "l-bl": {
        run: async(msg: Message, args: ArgumentList) => {
            return {
                content: fs.readFileSync("command-perms/blacklists", "utf-8")
            }
        }
    },
    "l-wl": {
        run: async(msg: Message, args: ArgumentList) => {
            return {
                content: fs.readFileSync("command-perms/whitelists", "utf-8")
            }
        }
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
                await msg.channel.send(format(send, {"number": String(totalTimes - times), "rnumber": String(times + 1)}))
                await new Promise(res => setTimeout(res, Math.random() * 700 + 200))
            }
            return {
                content: "done"
            }
        }
    },
    stop: {
        run: async(msg: Message, args: ArgumentList) => {
            if(!Object.keys(SPAMS).length){
                return {
                }
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
        }
    },
    "var": {
        run: async(msg: Message, args: ArgumentList) => {
            let [name, ...value] = args.join(" ").split("=")
	    if(!value.length){
		return {content: "no value given, syntax `[var x=value"}
	    }
	    let realVal = value.join(" ")
            vars[name] = () => realVal
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
            fs.writeFileSync(fn, options)
            await msg.channel.send({
                content: "Say the number of what you want to remove, or type cancel",
                files: [{
                    attachment: fn,
                    name: "remove.txt"
                }]
            })
            fs.rmSync(fn)
            try{
                let m = await msg.channel.awaitMessages({filter: m => m.author.id == msg.author.id, max: 20, time: 30000, errors: ['time']})
                if(['cancel', 'c'].includes(m.at(0)?.content || "c")){
                    return {
                        content: "cancelled"
                    }
                }
                let num = parseInt(m.at(0)?.content || "0")
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
        }
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
		    console.log(user, ADMINS, msg.author.id)
		    if(user != msg.author.id && ADMINS.indexOf(user) < 0){
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
	}
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
        }
    },
    distance: {
        run: async(msg: Message, args: ArgumentList) => {
            let opts;
            [opts, args] = getOpts(args)
            let speed = opts['speed']
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
        }
    },
    "list-cmds": {
        run: async(msg: Message, args: ArgumentList) => {
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
	    if(!Object.keys(opts).length){
		opts['p'] = true
	    }
            if(!fs.existsSync("help.html") || opts["n"] || args.length > 0){
                await msg.channel.send("generating new help file")
                let styles = fs.readFileSync("help-styles.css")
                let html = `<style>
${styles}
</style>`
		for(let command in commandsToUse){
		    html += generateHTMLFromCommandHelp(command, commands[command])
		}
                fs.writeFileSync("help.html", html)
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
    code: {
        run: async(msg: Message, args: ArgumentList) => {
            return {
                content: "https://github.com/euro20179/bircle"
            }
        }
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
        }
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
        }
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
        }
    },
    "rand-user": {
        run: async(msg: Message, args: ArgumentList) => {
            let opts;
            [opts, args] = getOpts(args)
            let member 
            if(!opts['f'])
                member = msg.channel.guild.members.cache.random()
            if(!member)
                member = (await msg.channel.guild.members.fetch()).random()
            let fmt = args.join(" ") || "%u (%n)"
            let user = member.user
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
        }
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
        }
    },
    "cmd-use": {
        run: async(msg: Message, args: ArgumentList) => {
            let data = generateCmdUseFile()
                        .split("\n")
                        .map(v => v.split(":")) //map into 2d array, idx[0] = cmd, idx[1] = times used
                        .filter(v => v[0]) // remove empty strings
                        .sort((a, b) => a[1] - b[1]) // sort from least to greatest
                        .reverse() //sort from greatest to least
                        .map(v => `${v[0]}: ${v[1]}`) //turn back from 2d array into array of strings
                        .join("\n")
            return {
                content: data
            }
        }
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
                    data = downloadSync(msg.attachments.at(0).attachment).toString()
                }
                else return {content: "no data given to search through"}
            }
            let match = data.matchAll(new RegExp(regex, "g"))
            let finds = ""
            for(let find of match){
                if(find[1]){
                    finds += `Found ${find.slice(1).join(", ")} at character ${find.index + 1}\n`
                }
                else {
                    finds += `Found ${find[0]} at character ${find.index + 1}\n`
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
        }
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
        }
    },
    "!!": {
        run: async(msg: Message, args: ArgumentList) => {
            if(!lastCommand){
                return {content: "You ignorance species, there have not been any commands run."}
            }
            return await doCmd(lastCommand, true)
        }
    },
    snipe: {
        run: async(msg: Message, args: ArgumentList) => {
            if(!snipe){
                return {content: "You idiot, nothing was ever said ever in the history of this server"}
            }
            return {content: `${snipe.author} says:\`\`\`\n${snipe.content}\`\`\``, files: snipe.attachments?.toJSON(), deleteFiles: false, embeds: snipe.embeds}
        }
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

async function doCmd(msg, returnJson=false){
    let command: string
    let args: Array<string>
    let doFirsts: {[item: number]: string}
    [command, args, doFirsts] = await parseCmd({msg: msg})
    for(let idx in doFirsts){
        let oldContent = msg.content
        let cmd = doFirsts[idx]
        msg.content = cmd
        args[idx] = args[idx].replaceAll("%{}", getContentFromResult(await doCmd(msg, true)).trim())
        msg.content = oldContent
    }
    let canRun = true
    let exists = true
    let rv: CommandReturn;
    if(!commands[command]){
        rv = {content: `${command} does not exist`}
        exists = false
    }
    if(exists){
        if(commands[command].permCheck){
            canRun = commands[command].permCheck(msg)
        }
        if(WHITELIST[msg.author.id]?.includes(command)){
            canRun = true
        }
        if(BLACKLIST[msg.author.id]?.includes(command)){
            canRun = false
        }
        if(canRun){
            rv = await commands[command].run(msg, args)
            addToCmdUse(command)
        }
        else rv = {content: "You do not have permissions to run this command"}
    }
    else if(aliases[command]){
	let aliasPreArgs = aliases[command].slice(1);
        command = aliases[command][0]
        //finds the original command
        while(aliases[command]?.[0]){
	    aliasPreArgs = aliases[command].slice(1).concat(aliasPreArgs)
            command = aliases[command][0]
        }
        msg.content = `${prefix}${command} ${aliasPreArgs.join(" ")} ${args.join(" ")}`
        rv = await doCmd(msg, true)
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
    if(!rv.content)
        delete rv['content']
    await msg.channel.send(rv)
    if(rv.files){
        for(let file of rv.files){
            if(file.delete !== false && rv.deleteFiles)
                fs.rmSync(file.attachment)
        }
    }
}

client.on('ready', () => {
    console.log("ONLINE")
})

client.on("messageDelete", async(m) => {
    if(m.author.id != client.id)
        snipe = m
})

client.on("messageCreate", async(m:  Message) => {
    let content = m.content
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
    if(interaction.isCommand()){
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
	    interaction.author = interaction.member.user
	    //@ts-ignore
	    let rv = await commands['rccmd'].run(interaction, [interaction.options.get("name")?.value])
	    await interaction.reply(rv)
	}
	else if(interaction.commandName == 'say'){
	    await interaction.reply({contnet: interaction.options.get("something")?.value || "How did we get here"})
	}
    }
    else if(interaction.isUserContextMenu()){
        addToCmdUse(`/${interaction.commandName}`)
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
})

function generateCmdUseFile(){
    let data = ""
    for(let cmd in CMDUSE){
        data += `${cmd}:${CMDUSE[cmd]}\n`
    }
    return data
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

let CMDUSE = loadCmdUse()

client.login(token)
