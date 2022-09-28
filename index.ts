///<reference path="index.d.ts" />
import fs = require("fs")
import https = require('https')
import Stream = require('stream')

const { execSync, exec } = require('child_process')

const { createAudioPlayer, joinVoiceChannel } = require("@discordjs/voice")
const { REST } = require('@discordjs/rest')
const { Routes } = require("discord-api-types/v9")
import { Client, Intents, MessageEmbed, Message, PartialMessage, Interaction, GuildMember, ColorResolvable, TextChannel, MessageButton, MessageActionRow, MessageSelectMenu, GuildEmoji, CollectorFilter, CommandInteraction } from 'discord.js'

import uno = require("./uno")

import sharp = require('sharp')
import got = require('got')
import cheerio = require('cheerio')
import { intToRGBA } from "jimp/*"


const { prefix, vars, userVars, ADMINS, FILE_SHORTCUTS, WHITELIST, BLACKLIST, addToPermList, removeFromPermList, VERSION, USER_SETTINGS } = require('./common.js')
const { parseCmd, parsePosition } = require('./parsing.js')
const { cycle, downloadSync, fetchUser, fetchChannel, format, generateFileName, createGradient, applyJimpFilter, randomColor, rgbToHex, safeEval, mulStr, escapeShell, strlen, UTF8String, cmdCatToStr, getImgFromMsgAndOpts } = require('./util.js')

const { ECONOMY, canEarn, earnMoney, createPlayer, addMoney, saveEconomy, canTax, taxPlayer, loseMoneyToBank, canBetAmount, calculateAmountFromString, loseMoneyToPlayer, setMoney, resetEconomy, buyStock, calculateStockAmountFromString, sellStock, LOTTERY, buyLotteryTicket, newLottery, removeStock, giveStock, calculateAmountFromStringIncludingStocks, resetPlayer, userHasStockSymbol, useLoan, payLoan, calculateLoanAmountFromString } = require("./economy.js")

const {saveItems, INVENTORY, buyItem, ITEMS, hasItem, useItem, resetItems, resetPlayerItems} = require("./shop.js")


enum CommandCategory {
    UTIL,
    GAME,
    FUN,
    META,
    IMAGES,
    ECONOMY
}

const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_MEMBERS, Intents.FLAGS.DIRECT_MESSAGES, Intents.FLAGS.GUILD_VOICE_STATES], allowedMentions: { parse: ["users"] } })

const token = fs.readFileSync("./TOKEN", "utf-8").trim()
const CLIENT_ID = fs.readFileSync("./CLIENT", "utf-8").trim()
const GUILD_ID = fs.readFileSync("./GUILD", "utf-8").trim()

let SPAM_ALLOWED = true

let BUTTONS: { [id: string]: string | (() => string) } = {}
let POLLS: { [id: string]: { title: string, votes: { [k: string]: string[] } } } = {}
let SPAMS: { [id: string]: boolean } = {}

let BLACKJACK_GAMES: {[id: string]: boolean} = {}

let BATTLEGAME: boolean = false;
let CRIME: boolean = false;

let lastCommand: Message;
let snipes: (Message | PartialMessage)[] = [];
let purgeSnipe: (Message | PartialMessage)[];

const illegalLastCmds = ["!!", "spam"]

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

const slashCommands = [
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
        createChatCommandOption(STRING, "bet", "bet", {required: false})
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

function getContentFromResult(result: CommandReturn) {
    let res = ""
    if (result.content)
        res += result.content + "\n"
    if (result.files) {
        for (let file of result.files) {
            res += fs.readFileSync(file.attachment, "base64") + "\n"
        }
    }
    if(result.embeds){
        for(let embed of result.embeds){
            res += `${JSON.stringify(embed.toJSON())}\n`
        }
    }
    return res
}


function getOpts(args: Array<string>): [Opts, ArgumentList] {
    let opts: Opts = {}
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
    <details class="command-argument-details-label" data-required="${required}" title="required: ${required}"><summary class="command-argument-summary" data-required="${required}">${argName}</summary>${argument}<br>${extraText}</details>
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
    <span class="command-option-details-label" title="requires value: ${requiresValue}"><summary class="command-option-summary">-${option}</summary> ${desc}</details>`
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

let connection: any;

let HEIST_PLAYERS: string[] = []
let HEIST_TIMEOUT: NodeJS.Timeout | null = null

const commands: { [command: string]: Command } = {
    "stk": {
        run: async(msg, args) => {
            https.get(`https://www.google.com/search?q=${encodeURI(args.join(" "))}+stock`, resp => {
                let data = new Stream.Transform()
                resp.on("data", chunk => {
                    data.push(chunk)
                })
                resp.on("end", async () => {
                    let html = data.read().toString()
                    let embed = new MessageEmbed()
                    let stockData = html.match(/<div class="BNeawe iBp4i AP7Wnd">(.*?)<\/div>/)
                    if(!stockData){
                        await msg.channel.send("No data found")
                        return
                    }
                    stockData = stockData[0]
                    let price = stockData.match(/>(\d+\.\d+)/)
                    if(!price){
                        await msg.channel.send("No price found")
                        return
                    }
                    price = price[1]
                    let change = stockData.match(/(\+|-)(\d+\.\d+)/)
                    if(!change){
                        await msg.channel.send("No change found")
                        return
                    }
                    change = `${change[1]}${change[2]}`
                    let numberchange = Number(change)
                    let stockName = html.match(/<span class="r0bn4c rQMQod">([^a-z]+)<\/span>/)
                    if(!stockName){
                        await msg.channel.send("Could not get stock name")
                        return
                    }
                    stockName = stockName[1]
                    if(numberchange > 0){
                        embed.setColor("GREEN")
                    }
                    else{
                        embed.setColor("RED")
                    }
                    embed.setTitle(stockName)
                    embed.addField("Price", price)
                    embed.addField("Price change", change, true)
                    await msg.channel.send({ embeds: [embed] })
                })
            }).end()
            return {content: "Getting data"}
        }, category: CommandCategory.UTIL,
        help: {
            info: "Gets the stock symbol for a stock"
        }
    },
    stock: {
        run: async(msg, args) => {
            https.get(`https://finance.yahoo.com/quote/${encodeURI(args[0])}`, resp => {
                let data = new Stream.Transform()
                resp.on("data", chunk => {
                    data.push(chunk)
                })
                resp.on("end", async () => {
                    let html = data.read().toString()
                    let stockData = html.matchAll(new RegExp(`data-symbol="${args[0].toUpperCase().trim().replace("^", '.')}"([^>]+)>`, "g"))
                    let jsonStockInfo: {[key: string]: string} = {}
                    //sample: {"regularMarketPrice":"52.6","regularMarketChange":"-1.1000023","regularMarketChangePercent":"-0.020484215","regularMarketVolume":"459,223"}
                    for(let stockInfo of stockData){
                        if(!stockInfo[1]) continue;
                        let field = stockInfo[1].match(/data-field="([^"]+)"/)
                        let value = stockInfo[1].match(/value="([^"]+)"/)
                        if(!value || !field) continue
                        jsonStockInfo[field[1]] = value[1]
                    }
                    if(Object.keys(jsonStockInfo).length < 1){
                        await handleSending(msg, {content: "This does not appear to be a stock"})
                        return
                    }
                    let embed = new MessageEmbed()
                    let nChange = Number(jsonStockInfo["regularMarketChange"])
                    let nPChange = Number(jsonStockInfo["regularMarketChangePercent"]) * 100
                    embed.setTitle(args[0].toUpperCase())
                    embed.addField("price", jsonStockInfo["regularMarketPrice"] || "N/A", true)
                    embed.addField("change", jsonStockInfo["regularMarketChange"] || "N/A", true)
                    embed.addField("%change", String(nPChange) || "N/A", true)
                    embed.addField("volume", jsonStockInfo["regularMarketVolume"] || "N/A")
                    if(nChange < 0){
                        embed.setColor("RED")
                    }
                    else if(nChange > 0){
                        embed.setColor("#00ff00")
                    }
                    else{
                        embed.setColor("#ffff00")
                    }
                    await handleSending(msg, {embeds: [embed]})
                    //await msg.channel.send({ embeds: [embed] })
                })
            }).end()
            return {
                content: "getting data"
            }
        },
        category: CommandCategory.FUN
    },
    buy: {
        run: async(msg, args) => {
            let stock = args[0]
            if(!stock){
                return {content: "No stock given"}
            }
            stock = stock.toUpperCase()
            let amount = Number(args[1])
            if(!amount){
                return {content: "No share count given"}
            }
            if(amount < .1){
                return {content: "You must buy at least 1/10 of a share"}
            }
            https.get(`https://finance.yahoo.com/quote/${encodeURI(stock)}`, resp => {
                let data = new Stream.Transform()
                resp.on("data", chunk => {
                    data.push(chunk)
                })
                resp.on("end", async () => {
                    let html = data.read().toString()
                    let stockData = html.matchAll(new RegExp(`data-symbol="${stock.toUpperCase().trim().replace("^", '.')}"([^>]+)>`, "g"))
                    let jsonStockInfo: {[key: string]: string} = {}
                    //sample: {"regularMarketPrice":"52.6","regularMarketChange":"-1.1000023","regularMarketChangePercent":"-0.020484215","regularMarketVolume":"459,223"}
                    for(let stockInfo of stockData){
                        if(!stockInfo[1]) continue;
                        let field = stockInfo[1].match(/data-field="([^"]+)"/)
                        let value = stockInfo[1].match(/value="([^"]+)"/)
                        if(!value || !field) continue
                        jsonStockInfo[field[1]] = value[1]
                    }
                    if(Object.keys(jsonStockInfo).length < 1){
                        await handleSending(msg, {content: "This does not appear to be a stock"})
                        return
                    }
                    let embed = new MessageEmbed()
                    let nChange = Number(jsonStockInfo["regularMarketChange"])
                    let nPrice = Number(jsonStockInfo["regularMarketPrice"]) || 0
                    embed.setTitle(args[0].toUpperCase())
                    embed.addField("price", jsonStockInfo["regularMarketPrice"] || "N/A", true)
                    embed.addField("change", jsonStockInfo["regularMarketChange"] || "N/A", true)
                    embed.addField("%change", jsonStockInfo["regularMarketChangePercent"] || "N/A", true)
                    embed.addField("volume", jsonStockInfo["regularMarketVolume"] || "N/A")
                    if(nChange < 0){
                        embed.setColor("RED")
                    }
                    else if(nChange > 0){
                        embed.setColor("#00ff00")
                    }
                    else{
                        embed.setColor("#ffff00")
                    }
                    await handleSending(msg, {embeds: [embed]})
                    let realStock = userHasStockSymbol(msg.author.id, stock)
                    if(!amount)
                        return
                    if(!canBetAmount(msg.author.id, nPrice * amount)){
                        await msg.channel.send("You cannot afford this")
                        return
                    }
                    if(realStock){
                        buyStock(msg.author.id, realStock.name, amount, nPrice)
                    }
                    else{
                        buyStock(msg.author.id, stock.toUpperCase(), amount, nPrice)
                    }
                    await msg.channel.send({content: `${msg.author} has bought ${amount} shares of ${stock.toUpperCase()} for $${nPrice * amount}`})
                })
            }).end()
            return {noSend: true}
        }, category: CommandCategory.ECONOMY
    },
    "ustock": {
        run: async(msg, args) => {
            let user = args[1] || msg.author.id
            let member = await fetchUser(msg.guild, user)
            if(!member)
                member = msg.member
            let stockName = args[0]
            return {content: JSON.stringify(userHasStockSymbol(member.user.id, stockName))}
        }, category: CommandCategory.UTIL
    },
    "stocks": {
        run: async(msg, args) => {
            let user = args[0]
            let member = msg.member
            if(user){
                member = await fetchUser(msg.guild, user)
                if(!member){
                    return {content: `${args[0]} not found`}
                }
            }
            if(!member){
                return {content: ":weary:"}
            }
            if(!ECONOMY()[member.id] || !ECONOMY()[member.id].stocks){
                return {content: "You own no stocks"}
            }
            let text = `<@${member.id}>\n`
            for(let stock in ECONOMY()[member.id].stocks){
                let stockInfo = ECONOMY()[member.id].stocks[stock]
                text += `**${stock}**\nbuy price: ${stockInfo.buyPrice}\nshares: (${stockInfo.shares})\n-------------------------\n`
            }
            return {content: text || "No stocks", allowedMentions: {parse: []}}
        }, category: CommandCategory.ECONOMY
    },
    loan: {
        run: async(msg, args) => {
            if(!hasItem(msg.author.id, "loan")){
                return {content: "You do not have a loan"}
            }
            if(ECONOMY()[msg.author.id].loanUsed){
                return {content: "U have not payed off your loan"}
            }
            if(ECONOMY()[msg.author.id].money >= 0){
                return {content: "Ur not in debt"}
            }
            let top = Object.entries(ECONOMY()).sort((a, b) => a[1].money - b[1].money).reverse()[0]
            //@ts-ignore
            let max = top[1]?.money || 100
            let needed = Math.abs(ECONOMY()[msg.author.id].money) + 1
            if(needed  > max){
                needed = max
            }
            addMoney(msg.author.id, needed)
            useLoan(msg.author.id, needed)
            useItem(msg.author.id, "loan")
            return {content: `<@${msg.author.id}> Used a loan and got ${needed}`}
        }, category: CommandCategory.ECONOMY
    },
    "pay-loan": {
        run: async(msg, args) => {
            let amount = args[0] || "all"
            let nAmount = calculateLoanAmountFromString(msg.author.id, amount) * 1.01
            if(!ECONOMY()[msg.author.id].loanUsed){
                return {content: "You have no loans to pay off"}
            }
            if(!canBetAmount(msg.author.id, nAmount)){
                return {content: "U do not have enough money to pay that back"}
            }
            if(payLoan(msg.author.id, nAmount)){
                return {content: "You have fully payed off your loan"}
            }
            return {content: `You have payed off ${nAmount} of your loan and have ${ECONOMY()[msg.author.id].loanUsed} left`}
        }, category: CommandCategory.ECONOMY
    },
    bitem: {
        run: async(msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            let count = Number(opts['count'] || opts['c'])
            if(!count)
                count = 1
            let item = args.join(" ")
            if(!item){
                return {content: "no item"}
            }
            if(msg.author.bot){
                return {content: "Bots cannot buy items"}
            }
            if(!ITEMS()[item]){
                return {content: `${item} does not exist`}
            }
            let itemData = ITEMS()[item]
            let totalSpent = 0
            for(let i = 0; i < count; i++){
                let totalCost = 0
                for(let cost of ITEMS()[item].cost){
                    totalCost += calculateAmountFromStringIncludingStocks(msg.author.id, cost)
                }
                if(canBetAmount(msg.author.id, totalCost) || totalCost == 0){
                    if(buyItem(msg.author.id, item)){
                        loseMoneyToBank(msg.author.id, totalCost)
                        totalSpent += totalCost
                    }
                    else{
                        return {content: `You already have the maximum of ${item}`}
                    }
                }
                else{
                    if(i > 0){
                        return {content: `You ran out of money but bought ${i} item(s) for ${totalSpent}`}
                    }
                    return {content: `This item is too expensive for u`}
                }
            }
            return {content: `You bought: ${item} for $${totalSpent}`}
        }, category: CommandCategory.ECONOMY
    },
    inventory: {
        run: async(msg, args) => {
            let e = new MessageEmbed()
            e.setTitle("ITEMS")
            let au = msg.author.avatarURL()
            if(au)
                e.setThumbnail(au)
            for(let item in INVENTORY()[msg.author.id]){
                e.addField(item, `${INVENTORY()[msg.author.id][item]}`)
            }
            return {embeds: [e]}
        }, category: CommandCategory.ECONOMY
    },
    shop: {
        run: async(msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            let items = fs.readFileSync("./shop.json", "utf-8")
            let itemJ = JSON.parse(items)
            let pages = []
            let i = 0
            let e = new MessageEmbed()
            let au = msg.author.avatarURL()
            if(au)
                e.setThumbnail(au)
            let round = !opts['no-round']
            for(let item in itemJ){
                i++;
                let totalCost = 0
                for(let cost of itemJ[item].cost){
                    totalCost += calculateAmountFromStringIncludingStocks(msg.author.id, cost)
                }
                if(round){
                    totalCost = Math.floor(totalCost * 100) / 100
                }
                e.addField(item.toUpperCase(), `**$${totalCost}**\n${itemJ[item].description}`, true)
                if(i % 25 == 0){
                    pages.push(e)
                    e = new MessageEmbed()
                    if(au)
                        e.setThumbnail(au)
                    i = 0
                }
            }
            if(e.fields.length > 0){
                pages.push(e)
            }
            return {embeds: pages}
        }, category: CommandCategory.ECONOMY
    },
    profits: {
        run: async(msg, args) => {
            if(!ECONOMY()[msg.author.id] || !ECONOMY()[msg.author.id].stocks){
                return {content: "You own no stocks"}
            }
            let totalProfit = 0
            let totalDailiyProfit = 0
            let text = ""
            let totalValue = 0
            for(let stock in ECONOMY()[msg.author.id].stocks){
                let data
                stock = stock.replace(/\(.*/, "").toUpperCase().trim()
                try {
                    //@ts-ignore
                    data = await got(`https://finance.yahoo.com/quote/${encodeURI(stock)}`)
                }
                catch (err) {
                    continue
                }
                if (!data?.body) {
                    continue
                }
                let stockData = data.body.matchAll(new RegExp(`data-symbol="${stock.replace("^", '.')}"([^>]+)>`, "g"))
                let jsonStockInfo: {[key: string]: string} = {}
                //sample: {"regularMarketPrice":"52.6","regularMarketChange":"-1.1000023","regularMarketChangePercent":"-0.020484215","regularMarketVolume":"459,223"}
                for(let stockInfo of stockData){
                    if(!stockInfo[1]) continue;
                    let field = stockInfo[1].match(/data-field="([^"]+)"/)
                    let value = stockInfo[1].match(/value="([^"]+)"/)
                    if(!value || !field) continue
                    jsonStockInfo[field[1]] = value[1]
                }
                if(Object.keys(jsonStockInfo).length < 1){
                    continue
                }
                let price = Number(jsonStockInfo["regularMarketPrice"])
                if(!price){
                    continue
                }
                let numberchange = Number(jsonStockInfo["regularMarketChange"])
                if(isNaN(numberchange)){
                    continue
                }
                let userStockData = userHasStockSymbol(msg.author.id, stock)
                if(!userStockData){
                    continue
                }
                let stockName = userStockData.name
                text += `**${stockName}**\n`
                let stockInfo = ECONOMY()[msg.author.id].stocks[stockName]
                let profit = (price - stockInfo.buyPrice) * stockInfo.shares
                totalProfit += profit
                let todaysProfit = (numberchange * stockInfo.shares)
                totalDailiyProfit += todaysProfit
                totalValue += price * stockInfo.shares
                text += `Price: ${price}\n`
                text += `Change: ${numberchange}\n`
                text += `Profit: ${profit}\n`
                text += `Todays profit: ${todaysProfit}\n`
                text += "---------------------------\n"
            }
            return {content: `${text}\nTOTAL TODAY: ${totalDailiyProfit}\nTOTAL PROFIT: ${totalProfit}\nTOTAL VALUE: ${totalValue}`}
        }, category: CommandCategory.ECONOMY
    },
    "profit": {
        run: async(msg, args) => {
            if(!ECONOMY()[msg.author.id] || !ECONOMY()[msg.author.id].stocks){
                return {content: "You own no stocks"}
            }
            let stock = args[0]
            let data
            stock = stock.replace(/\(.*/, "").toUpperCase().trim()
            try {
                //@ts-ignore
                data = await got(`https://finance.yahoo.com/quote/${encodeURI(stock)}`)
            }
            catch (err) {
                return {contnet: "err"}
            }
            if (!data?.body) {
                return {content: "no text"}
            }
            let stockData = data.body.matchAll(new RegExp(`data-symbol="${stock.replace("^", '.')}"([^>]+)>`, "g"))
            let jsonStockInfo: {[key: string]: string} = {}
            //sample: {"regularMarketPrice":"52.6","regularMarketChange":"-1.1000023","regularMarketChangePercent":"-0.020484215","regularMarketVolume":"459,223"}
            for(let stockInfo of stockData){
                if(!stockInfo[1]) continue;
                let field = stockInfo[1].match(/data-field="([^"]+)"/)
                let value = stockInfo[1].match(/value="([^"]+)"/)
                if(!value || !field) continue
                jsonStockInfo[field[1]] = value[1]
            }
            if(Object.keys(jsonStockInfo).length < 1){
                return {content: "No stock info"}
            }
            let price = Number(jsonStockInfo["regularMarketPrice"])
            if(!price){
                return {content: "No price"}
            }
            let numberchange = Number(jsonStockInfo["regularMarketChange"])
            if(isNaN(numberchange)){
                return {content: "change is NaN"}
            }
            let stockInfo = userHasStockSymbol(msg.author.id, stock)
            if(!stockInfo){
                return {content: "You dont have this stock"}
            }
            let stockName = stockInfo.name
            let profit = (price - stockInfo.info.buyPrice) * stockInfo.info.shares
            let todaysProfit = (numberchange * stockInfo.info.shares)
            let embed = new MessageEmbed()
            embed.setTitle(stockName)
            embed.setThumbnail(msg.member?.user.avatarURL()?.toString() || "")
            if(profit > 0){
                embed.setColor("GREEN")
            }
            else{
                embed.setColor("RED")
            }
            embed.addField("Price", String(price), true)
            embed.addField("Change", String(numberchange), true)
            embed.addField("Change %", String(numberchange / (price + numberchange)), true)
            embed.addField("Profit", String(profit), true)
            embed.addField("Today's Profit", String(todaysProfit), true)
            embed.addField("Value", String(price * stockInfo.info.shares))
            return {embeds: [embed]}
        }, category: CommandCategory.ECONOMY
    },
    sell: {
        run: async(msg, args) => {
            if(!ECONOMY()[msg.author.id] || !ECONOMY()[msg.author.id].stocks){
                return {content: "You own no stocks"}
            }
            let stock = args[0]
            if(!stock)
                return {content: "no stock given"}
            stock = stock.toUpperCase()
            let amount = args[1]
            let data
            try {
                //@ts-ignore
                data = await got(`https://finance.yahoo.com/quote/${encodeURI(args[0])}`)
            }
            catch (err) {
                return { content: "Could not fetch data" }
            }
            if (!data?.body) {
                return { content: "No data found" }
            }
            let stockData = data.body.matchAll(new RegExp(`data-symbol="${args[0].toUpperCase().trim().replace("^", ".")}"([^>]+)>`, "g"))
            let jsonStockInfo: {[key: string]: string} = {}
            //sample: {"regularMarketPrice":"52.6","regularMarketChange":"-1.1000023","regularMarketChangePercent":"-0.020484215","regularMarketVolume":"459,223"}
            for(let stockInfo of stockData){
                if(!stockInfo[1]) continue;
                let field = stockInfo[1].match(/data-field="([^"]+)"/)
                let value = stockInfo[1].match(/value="([^"]+)"/)
                if(!value || !field) continue
                jsonStockInfo[field[1]] = value[1]
            }
            if(Object.keys(jsonStockInfo).length < 1){
                return {content: "This does not appear to be a stock"}
            }
            let nPrice = Number(jsonStockInfo["regularMarketPrice"])
            if(!nPrice)
                return {content: `${stock} does not appear to have a price`}
            let realStockInfo = userHasStockSymbol(msg.author.id, stock)
            let stockName = stock
            if(realStockInfo)
                stockName = realStockInfo.name
            if(!ECONOMY()[msg.author.id].stocks[stockName]){
                return {content: "You do not own this stock"}
            }
            else{
                let stockInfo = ECONOMY()[msg.author.id].stocks[stockName]
                let sellAmount = calculateStockAmountFromString(msg.author.id, stockInfo.shares, amount)
                if(!sellAmount){
                    return {content: "You must sell a number of shares of your stock"}
                }
                if(sellAmount > stockInfo.shares){
                    return {content: "YOu do not own that many shares"}
                }
                if(sellAmount <= 0){
                    return {content: "Must sell more than 0"}
                }
                let profit = (nPrice - stockInfo.buyPrice) * sellAmount
                sellStock(msg.author.id, stockName, sellAmount, nPrice)
                addMoney(msg.author.id, profit)
                return {content: `You sold: ${stockName} and made $${profit} in total`}
            }
        }, category: CommandCategory.ECONOMY
    },
    battle: {
        run: async(msg, args) => {
            if(BATTLEGAME)
                return {content: "A game is already happening"}
            let opts;
            [opts, args] = getOpts(args)
            let useItems = !opts['no-items']
            let bet = args[0]
            let winningType = args[1]
            if(!winningType){
                winningType = "wta"
            }
            if(!["wta", "distribute", "dist"].includes(winningType)){
                return {content: "Betting type must be wta (winner takes all) or distribute"}
            }
            if (winningType == 'dist')
                winningType = 'distribute'
            let nBet = calculateAmountFromString(msg.author.id, bet, {min: (t, a) => t * 0.002})

            if(!nBet || !canBetAmount(msg.author.id, nBet) || nBet < 0){
                return {content: "Not a valid bet"}
            }
            if(nBet / ECONOMY()[msg.author.id].money < 0.002){
                return {content: "You must bet at least 0.2%"}
            }

            let players: {[key: string]: number} = {[msg.author.id]: 100}
            //total bet
            let bets: {[key: string]: number} = {[msg.author.id]: nBet}
            //initial bet
            let ogBets: {[key: string]: number} = {[msg.author.id]: nBet}
            let cooldowns: {[key: string]: number} = {[msg.author.id]: Date.now() / 1000}
            let usedSwap: string[] = []
            let usedShell: string[] = []
            let usedYoink: string[] = []
            let shields: {[key: string]: boolean} = {}
            let betTotal = nBet
            let bonus = 1.1
            let mumboUser: string | null = null
            let negativeHpBonus: {[key: string]: number} = {}

            let usedEarthquake = false

            let itemUses: {[key: string]: number} = {}

            let responseMultiplier = 1

            await msg.channel.send(`${msg.author} has joined the battle with a $${nBet} bet`)
            let collector = msg.channel.createMessageCollector({time: 15000, filter: m => !m.author.bot && m.content.toLowerCase().includes('join')})
            BATTLEGAME = true
            collector.on("collect", async(m) => {
                if(players[m.author.id]) return
                let bet = m.content.split(" ")[1]
                let nBet = calculateAmountFromString(m.author.id, bet, {min: (t, a) => t * 0.002})
                if(!nBet || !canBetAmount(m.author.id, nBet) || nBet < 0){
                    await msg.channel.send(`${m.author}: ${nBet} is not a valid bet`)
                    return
                }
                if(nBet / ECONOMY()[m.author.id].money < 0.002){
                    await m.channel.send("You must bet at least 0.2%")
                    return
                }
                betTotal += nBet
                if(!Object.keys(players).includes(m.author.id)){
                    bets[m.author.id] = nBet
                    ogBets[m.author.id] = nBet
                    cooldowns[m.author.id] = 0
                    players[m.author.id] = 100
                }
                await msg.channel.send(`${m.author} has joined the battle with a $${nBet} bet`)
            })
            collector.on("end", async(collection, reason) => {
                let midGameCollector = msg.channel.createMessageCollector({filter: m => !m.author.bot && m.content.toLowerCase() == 'join' && hasItem(m.author.id, "intrude")})
                midGameCollector.on("collect", async(m) => {
                    if(players[m.author.id]) return
                    if(!Object.keys(players).includes(m.author.id) && ogBets[m.author.id] === undefined){
                        let bet = calculateAmountFromString(m.author.id, "min", {min: (t, a) => t * .002})
                        bets[m.author.id] = bet
                        ogBets[m.author.id] = bet
                        cooldowns[m.author.id] = 0
                        players[m.author.id] = Math.floor(Object.values(players).reduce((p, c) => p + c, 0) / Object.values(players).length)
                        betTotal += bet
                        await msg.channel.send(`${m.author} has intruded the battle with a bet of ${ogBets[m.author.id]}`)
                    }
                })

                let start = Date.now() / 1000
                let items: {[key: string]: {percent?: number, amount?: number}} = {
                    "heal": {percent: 0.01, amount: 0.1},
                    "anger toolbox": {amount: 3},
                    "anger euro": {amount: 3},
                    "blowtorch": {percent: 0.01, amount: 1},
                    "double bet": {percent: 0.01},
                    "swap": {percent: (3 * Object.keys(players).length) / 100},
                    "double": {percent: 0.05, amount: 2},
                    "triple": {percent: 0.10, amount: 3},
                    "blue shell": {amount: 0.5, percent: 0.02},
                    "shield": {amount: 0.5, percent: 0.003},
                    "mumbo": {amount: 1, percent: 0.01},
                    "suicide": {amount: 1, percent: 0.001},
                    "earthquake": {amount: 2, percent: 0.04},
                    "yoink": {amount: 2},
                }

                let itemUseCollector = msg.channel.createMessageCollector({filter: m => Object.keys(players).includes(m.author.id) && Object.keys(items).includes(m.content.toLowerCase())})
                let rarityTable = {"huge": .2, "big": .5, "medium": .7, "small": .9, "tiny": 1}
                if(useItems){
                    itemUseCollector.on("collect", async(m) => {
                        if(!ECONOMY()[m.author.id]){
                            return
                        }
                        if(Date.now() / 1000 - cooldowns[m.author.id] < 8){
                            await msg.channel.send(`<@${m.author.id}> Used an item on cooldown -5 hp (cooldown remaining: **${8 - (Date.now() / 1000 - cooldowns[m.author.id])}**`)
                            players[m.author.id] -= 5
                            loseMoneyToBank(m.author.id, ogBets[m.author.id])
                            if(players[m.author.id] <= 0){
                                let remaining = Object.keys(players).length - 1
                                delete players[m.author.id]
                                let e = new MessageEmbed()
                                e.setTitle("NEW LOSER")
                                if(winningType === 'distribute'){
                                    betTotal -= bets[m.author.id]
                                    e.setDescription(`<@${m.author.id}> HAS DIED and distributed ${bets[m.author.id] / remaining * bonus} to each player`)
                                    e.setColor("BLUE")
                                    for(let player in players){
                                        addMoney(player, bets[m.author.id] / remaining * bonus)
                                    }
                                }
                                else{
                                    e.setDescription(`<@${m.author.id}> HAS DIED AND LOST $${ogBets[m.author.id]}`)
                                    e.setColor("RED")
                                }
                                await msg.channel.send({embeds: [e]})
                            }
                            return
                        }
                        let i = m.content.toLowerCase()
                        let cost = items[i]
                        let a = cost.amount ?? 0
                        if(cost.percent){
                            a += calculateAmountFromString(m.author.id, `${cost.percent * 100}%`)
                        }
                        if(ECONOMY()[m.author.id].money - bets[m.author.id] < a){
                            await m.channel.send("You cannot afford this")
                            return
                        }
                        let e = new MessageEmbed()
                        e.setFooter({text: `Cost: ${a}`})
                        //reset cooldown AFTER purchase
                        switch(i){
                            case "heal": {
                                cooldowns[m.author.id] = Date.now() / 1000
                                let amount =  Math.floor(Math.random() * 19 + 1)
                                e.setTitle("HEAL")
                                e.setColor("GREEN")
                                e.setDescription(`<@${m.author.id}> healed for ${amount}`)
                                if(players[m.author.id])
                                    players[m.author.id] += amount
                                await msg.channel.send({embeds: [e]})
                                break
                            }
                            case "anger toolbox": {
                                cooldowns[m.author.id] = Date.now() / 1000
                                e.setTitle("TOOLBOX IS ANGRY")
                                e.setColor("RED")
                                e.setDescription(`<@${m.author.id}> has angered toolbox`)
                                await msg.channel.send({embeds: [e]})
                                for(let player in players){
                                    players[player] *= .99432382
                                }
                                break
                            }
                            case "anger euro": {
                                cooldowns[m.author.id] = Date.now() / 1000
                                await msg.channel.send("STOPPING")
                                break
                            }
                            case "double bet": {
                                if(ECONOMY()[m.author.id].money - bets[m.author.id] >= bets[m.author.id]){
                                    cooldowns[m.author.id] = Date.now() / 1000
                                    betTotal += bets[m.author.id]
                                    bets[m.author.id] *= 2
                                    e.setTitle("DOUBLE BET")
                                    e.setDescription(`${m.author} has doubled their bet to ${bets[m.author.id]}`)
                                    e.setColor("GREEN")
                                    await msg.channel.send({embeds: [e]})
                                }
                                break
                            }
                            case "blowtorch": {
                                cooldowns[m.author.id] = Date.now() / 1000
                                let amount = Math.floor(Math.random() * 19 + 1)
                                e.setTitle("BLOWTORCH")
                                e.setColor("RED")
                                e.setDescription(`<@${m.author.id}> blowtorches everyone for ${amount} damage`)
                                await msg.channel.send({embeds: [e]})
                                for(let player in players){
                                    if(player === m.author.id) continue
                                    players[player] -= amount
                                }
                                break
                            }
                            case "swap": {
                                if(usedSwap.includes(m.author.id)){
                                    return
                                }
                                cooldowns[m.author.id] = Date.now() / 1000
                                let playerKeys = Object.keys(players).filter(v => v !== m.author.id)
                                let p = playerKeys[Math.floor(Math.random() * playerKeys.length)]
                                let thisPlayerHealth = players[m.author.id]
                                let otherPlayerHealth = players[p]
                                e.setTitle(`SWAP HEALTH`)
                                e.setDescription(`<@${m.author.id}> <-> <@${p}>`)
                                e.setColor("#ffff00")
                                players[m.author.id] = otherPlayerHealth
                                players[p] = thisPlayerHealth
                                await msg.channel.send({embeds: [e]})
                                usedSwap.push(m.author.id)
                                break
                            }
                            case "double": {
                                cooldowns[m.author.id] = Date.now() / 1000
                                responseMultiplier *= 2
                                e.setTitle("DOUBLE")
                                e.setColor("GREEN")
                                e.setDescription(`<@${m.author.id}> has doubled the multiplier\n**multiplier: ${responseMultiplier}**`)
                                await msg.channel.send({embeds: [e]})
                                break
                            }
                            case "triple": {
                                cooldowns[m.author.id] = Date.now() / 1000
                                responseMultiplier *= 3
                                e.setTitle("TRIPLE")
                                e.setColor("GREEN")
                                e.setDescription(`<@${m.author.id}> has tripled the multiplier\n**multiplier: ${responseMultiplier}**`)
                                await msg.channel.send({embeds: [e]})
                                break
                            }
                            case "blue shell": {
                                if(usedShell.includes(m.author.id)){
                                    return
                                }
                                e.setTitle("BLUE SHELL")
                                e.setColor("BLUE")
                                let sort = Object.entries(players).sort((a, b) => b[1] - a[1])
                                let firstPlace = sort[0]
                                if(firstPlace[1] < 50){
                                    await msg.channel.send("No one has more than 50 health")
                                    return
                                }
                                cooldowns[m.author.id] = Date.now() / 1000
                                e.setDescription(`<@${m.author.id}> hit <@${firstPlace[0]}> with a blue shell`)
                                players[firstPlace[0]] -= 50
                                await msg.channel.send({embeds: [e]})
                                usedShell.push(m.author.id)
                                break
                            }
                            case "shield": {
                                if(!Object.keys(shields).includes(m.author.id)){
                                    cooldowns[m.author.id] = Date.now() / 1000
                                    shields[m.author.id] = true
                                    e.setTitle("SHIELD")
                                    e.setColor("WHITE")
                                    e.setDescription(`<@${m.author.id}> bout a shield`)
                                    await msg.channel.send({embeds: [e]})
                                    break
                                }
                                else{
                                    return
                                }
                            }
                            case "mumbo": {
                                if(mumboUser)
                                    return
                                else
                                    mumboUser = m.author.id
                                cooldowns[m.author.id] = Date.now() / 1000
                                players['mumbo'] = 100
                                e.setTitle("MUMBO JOINS THE BATTLE")
                                await msg.channel.send({embeds: [e]})
                                break
                            }
                            case "yoink": {
                                if(usedYoink.includes(m.author.id))
                                    return
                                else
                                    usedYoink.push(m.author.id)
                                cooldowns[m.author.id] = Date.now() / 1000
                                mumboUser = m.author.id
                                e.setTitle(`YOINK`)
                                e.setDescription(`<@${m.author.id}> HAS STOLEN MUMBOくん`)
                                await msg.channel.send({embeds: [e]})
                                break
                            }
                            case "suicide": {
                                cooldowns[m.author.id] = Date.now() / 1000
                                e.setTitle("SUICIDE")
                                e.setColor("DARK_RED")
                                let damage =  Math.floor(Math.random() * 8 + 2)
                                e.setDescription(`<@${m.author.id}> took ${damage} damage`)
                                await msg.channel.send({embeds: [e]})
                                players[m.author.id] -= damage
                                break
                            }
                            case "earthquake": {
                                if(usedEarthquake)
                                    break
                                let sumHealths = Object.values(players).reduce((a, b) => a + b, 0)
                                let average = sumHealths / Object.keys(players).length
                                e.setTitle("EARTHQUAKE")
                                e.setColor("GREY")
                                for(let player in players){
                                    players[player] = average
                                }
                                e.setDescription(`<@${m.author.id}> CAUSED AN EARTHQUAKE`)
                                await msg.channel.send({embeds: [e]})
                                usedEarthquake = true
                                break
                            }
                        }
                        loseMoneyToBank(m.author.id, a)
                        //buying an item increases the bet
                        betTotal += a
                        bets[m.author.id] += a
                        if(itemUses[m.author.id]){
                            itemUses[m.author.id]++
                        }
                        else{
                            itemUses[m.author.id] = 1
                        }
                    })
                }
                let playerCount = Object.keys(players).length
                if(playerCount < 2){
                    midGameCollector.stop()
                    await msg.channel.send("Only 1 person joined, game ending")
                    itemUseCollector.stop()
                    BATTLEGAME = false
                    itemUseCollector.stop()
                    return
                }
                let responses = [
                    "{userall} died AMOUNT=huge DAMAGE=all",
                    "{userall} lived AMOUNT=small HEAL=all",
                ]
                if(fs.existsSync("./command-results/battle")){
                    let d = fs.readFileSync("./command-results/battle", "utf-8")
                    responses = d.split(";END").map(v => v.split(":").slice(1).join(":").trim())
                }
                let lastMessages = []
                while(Object.values(players).length > 0){
                    let embed = new MessageEmbed()
                    responses = responses.filter(v => {
                        let valid = true
                        let matches = v.matchAll(/\{user(\d+|all)\}/g)
                        let count = 0
                        for(let match of matches){
                            count++;
                            if(match[1] == 'all'){
                                valid = true
                            }
                            else if(!Object.keys(players)[Number(match[1]) - 1]){
                                valid = false
                                break
                            }
                        }
                        if(count == 0)
                            return false
                        return valid
                    })
                    if(responses.length < 1){
                        midGameCollector.stop()
                        await msg.channel.send("No responses do anything, add better responses or you will die for real 100% factual statement")
                        BATTLEGAME = false
                        itemUseCollector.stop()
                        return
                    }
                    let responseChoice;
                    let amount;
                    while(true){
                        responseChoice = responses[Math.floor(Math.random() * responses.length)]
                        amount = responseChoice.match(/AMOUNT=(huge|big|medium|small|tiny)/)
                        if(!amount)
                            continue
                        if(Math.random() < rarityTable[amount[1] as 'huge' | 'big' | 'medium' | 'small' | 'tiny']){
                            break
                        }
                    }
                    let shuffledPlayers = Object.keys(players).sort(() => Math.random() - .5)
                    let playersToDoStuffTo: string[] = []
                    responseChoice =  responseChoice.replaceAll(/\{user(\d+|all)\}/g, (v, pn) => {
                        if(pn ===  'all'){
                            let text = ""
                            for(let player of shuffledPlayers){
                                text += `<@${player}>, `
                                playersToDoStuffTo.push(player)
                            }
                            return text.trim().replace(/,$/, "")
                        }
                        else{
                            let playerNo = Number(pn) - 1
                            //@ts-ignore
                            playersToDoStuffTo.push(shuffledPlayers.at(playerNo))
                            return `<@${shuffledPlayers.at(playerNo)}>`
                        }
                    })
                    let responseTypeAndTwoWho = responseChoice.matchAll(/\b(DAMAGE|HEAL)=((?:(?:\d+|all),?)+)/g)
                    responseChoice = responseChoice.replace(amount[0], "")
                    let nAmount = 0;
                    let eliminations = []
                    switch(amount[1]){
                        case "huge": {
                            nAmount = Math.floor(Math.random() * (75 - 50) + 50)
                            break
                        }
                        case "big": {
                            nAmount = Math.floor(Math.random() * (50 - 35) + 35)
                            break
                        }
                        case "medium": {
                            nAmount = Math.floor(Math.random() * (35 - 20) + 20)
                        }
                        case "small": {
                            nAmount = Math.floor(Math.random() * (20 - 10) + 10)
                            break
                        }
                        case "tiny": {
                            nAmount = Math.floor(Math.random() * 10)
                            break
                        }
                        default: {
                            continue
                        }
                    }
                    if(responseMultiplier > 0){
                        responseMultiplier = 1
                        nAmount *= responseMultiplier
                    }

                    let tawCount = 0
                    for(let typeAndWho of responseTypeAndTwoWho){
                        tawCount++
                        responseChoice = responseChoice.replace(typeAndWho[0], "")
                        let type = typeAndWho[1]
                        let toWho = typeAndWho[2].split(",")
                        switch(type){
                            case "HEAL": {
                                embed.setColor("GREEN")
                                for(let match of toWho){
                                    let n = Number(match)
                                    let p = [n]
                                    if(match == 'all')
                                        //@ts-ignore
                                        p = Object.keys(shuffledPlayers)
                                    for(let id of p){
                                        players[shuffledPlayers.at(id - 1) as string] += nAmount
                                    }
                                }
                                break
                            }
                            case "DAMAGE": {
                                embed.setColor("RED")
                                nAmount *= -1
                                for(let player of toWho){
                                    let n = Number(player)
                                    let p = [n]
                                    if(player == 'all')
                                        //@ts-ignore
                                        p = Object.keys(shuffledPlayers)
                                    for(let id of p){
                                        if(shields[shuffledPlayers.at(id - 1) as string]){
                                            shields[shuffledPlayers.at(id - 1) as string] = false
                                            let e = new MessageEmbed()
                                            e.setTitle("BLOCKED")
                                            e.setDescription(`<@${shuffledPlayers.at(id - 1) as string}> BLOCKED THE ATTACK`)
                                            e.setColor("NAVY")
                                            await msg.channel.send({embeds: [e]})
                                        }
                                        else{
                                            players[shuffledPlayers.at(id - 1) as string] += nAmount
                                            if(players[shuffledPlayers.at(id - 1) as string] <= 0){
                                                eliminations.push(shuffledPlayers.at(id - 1) as string)
                                            }
                                        }
                                    }
                                }
                                break
                            }
                        }
                    }
                    if(!tawCount) continue

                    //let healthRemainingTable = "Health Remaining:\n"
                    for(let player in players){
                        //@ts-ignore
                        let mem = msg.guild.members.cache.find((v) => v.id == player)
                        if(!mem){
                            embed.addField(`${player}`, `${players[player]}`, true)
                        }
                        else{
                            embed.addField(`${mem.user.username}`, `${players[player]}`, true)
                        }
                        if(players[player] < 0){
                            if(negativeHpBonus[player] && negativeHpBonus[player] > players[player]){
                                negativeHpBonus[player] = players[player]
                            }
                            else if(!negativeHpBonus[player]){
                                negativeHpBonus[player] = players[player]
                            }
                        }
                        //healthRemainingTable += `<@${player}>: ${players[player]}\n`
                    }
                    responseChoice = responseChoice.replaceAll("{amount}", String(nAmount))
                    //embed.setDescription(responseChoice)
                    //let ms = await msg.channel.send(`${responseChoice}\n-------------------------\n${healthRemainingTable}`)
                    let ms = await msg.channel.send({content: `**${responseChoice}**`, embeds: [embed]})
                    lastMessages.push(ms)
                    if(lastMessages.length >= 4){
                        let m = lastMessages.shift()
                        if(m?.deletable){
                            await m.delete()
                        }
                    }
                    let text = ""
                    let remaining = Object.keys(players).length - eliminations.length

                    for(let elim of eliminations){
                        if(elim === 'mumbo'){
                            //@ts-ignore
                            text += `<@${mumboUser}>'s MUMBO HAS DIED and <@${mumboUser}> LOST ${ECONOMY()[mumboUser]?.money * 0.005} \n`
                            //@ts-ignore
                            loseMoneyToBank(mumboUser, ECONOMY()[mumboUser]?.money * 0.005)
                            mumboUser = null
                        }
                        else{
                            loseMoneyToBank(elim, ogBets[elim])
                            text += `<@${elim}> HAS BEEN ELIMINATED AND LOST $${ogBets[elim]} \n`
                            if(winningType === 'distribute'){
                                let e = new MessageEmbed()
                                e.setTitle("NEW LOSER")
                                e.setDescription(`<@${elim}> HAS DIED and distributed ${bets[elim] / remaining * bonus} to each player`)
                                e.setColor("BLUE")
                                betTotal -= bets[elim]
                                for(let player in players){
                                    if(!eliminations.includes(player)){
                                        addMoney(player, bets[elim] / remaining * bonus)
                                    }
                                }
                                await msg.channel.send({embeds: [e]})
                            }
                        }
                        delete players[elim]
                    }

                    for(let player in players){
                        if(isNaN(players[player])){
                            if(player === 'mumbo'){
                                //@ts-ignore
                                await msg.channel.send( `<@${mumboUser}>'s MUMBO HAS DIED and <@${mumboUser}> LOST ${ECONOMY()[mumboUser]?.money * 0.005} \n`)
                                //@ts-ignore
                                loseMoneyToBank(mumboUser, ECONOMY()[mumboUser]?.money * 0.005)
                                mumboUser = null
                            }
                            else{
                                loseMoneyToBank(player, ogBets[player])
                                await msg.channel.send(`<@${player}> HAS NaN HEALTH AND DIED`)
                            }
                            delete players[player]
                        }
                    }
                    if(text){
                        await handleSending(msg, {content: text})
                    }
                    if(Object.keys(players).length <= 1){
                        break
                    }
                    await new Promise(res => setTimeout(res, 4000))
                }
                let winner = Object.entries(players).filter(v => v[1] > 0)?.[0]
                let e = new MessageEmbed()
                let bonusText = ""
                if(!winner){
                    let last = Object.keys(players)[0]
                    loseMoneyToBank(last, ogBets[last])
                    e.setDescription(`THE GAME IS A TIE`)
                    e.setTitle("TIE")
                    e.setColor("YELLOW")
                }
                else if(winner[0] == 'mumbo'){
                    addMoney(mumboUser, betTotal / 2)
                    e.setTitle("GAME OVER")
                    e.setColor("DARK_GREEN")
                    e.setDescription(`MUMBO WINS, <@${mumboUser}> SUMMONED MUMBO AND GETS HALF THE WINNINGS! ($${betTotal / 2})`)
                }
                else{
                    addMoney(winner[0], betTotal * bonus)
                    if(negativeHpBonus[winner[0]]){
                        bonusText += `<@${winner[0]}> GOT THE NEGATIVE HP BONUS FOR ${negativeHpBonus[winner[0]]}\n`
                        addMoney(winner[0], Math.abs(negativeHpBonus[winner[0]]))
                    }
                    e.setTitle("GAME OVER!")
                    e.setColor("GREEN")
                    if(winningType === 'wta'){
                        e.setDescription(`<@${winner[0]}> IS THE WINNER WITH ${winner[1]} HEALTH REMAINING\nAND WON: $${betTotal * bonus}`)
                    }
                    else{
                        e.setDescription(`<@${winner[0]}> IS THE WINNER WITH ${winner[1]} HEALTH REMAINING\nAND WON THE REMAINING: $${betTotal * bonus}`)
                    }
                }
                e.setFooter({text: `The game lasted: ${Date.now() / 1000 - start} seconds`})
                midGameCollector.stop()
                if(winner && winner[1] >= 100){
                    if(ECONOMY()[winner[0]]){
                        addMoney(winner[0], winner[1] - 100)
                        bonusText += `<@${winner[0]}> GOT THE 100+ HP BONUS\n`
                    }
                }
                if(Object.keys(itemUses).length > 0){
                    let mostUsed = Object.entries(itemUses).sort((a, b) => b[1] - a[1])
                    let bonusAmount = mostUsed[0][1] - (mostUsed[1]?.[1] || 0)
                    if(bonusAmount && ECONOMY()[mostUsed[0][0]]){
                        addMoney(mostUsed[0][0], bonusAmount)
                        bonusText += `<@${mostUsed[0][0]}> GOT THE ITEM BONUS BY USING ${mostUsed[0][1]} ITEMS AND WON $${bonusAmount}\n`
                    }
                }
                if(bonusText)
                    await handleSending(msg, {embeds: [e], content: bonusText})
                else
                    await handleSending(msg, {embeds: [e]})
                BATTLEGAME = false
                itemUseCollector.stop()
            })
            let e = new MessageEmbed()
            e.setTitle("TYPE `join <BET AMOUNT>` TO JOIN THE BATTLE")
            return {embeds: [e]}
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
        run: async(msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            let text = args.join(" ")
            let damageUsers = opts['damage'] || opts['d']
            let healUsers = opts['heal'] || opts['h']
            let amounts = ['huge', 'big', 'medium', 'small', 'tiny']
            let givenAmount = opts['amount']  || opts['a']
            if(typeof givenAmount !== 'string'){
                return {content: `You must provide an amount (${amounts.join(", ")})`}
            }
            if(typeof damageUsers !== 'string' && typeof healUsers !== 'string'){
                return {content: `You must provide a user to damage/heal`}
            }
            if(damageUsers !== undefined && typeof damageUsers !== 'string'){
                return {content: "-damage must be a user number or all"}
            }
            if(healUsers !== undefined && typeof healUsers !== 'string'){
                return {content: "-heal must be a user number or all"}
            }
            if(!amounts.includes(givenAmount)){
                return {content: `You did not provide a valid amount (${amounts.join(", ")})`}
            }
            let damageHealText = ""
            if(damageUsers){
                if(!damageUsers.match(/(?:(\d+|all),?)+/)){
                    return {content: "Users must be numbers seperated by ,"}
                }
                damageHealText += ` DAMAGE=${damageUsers}`
            }
            if(healUsers){
                if(!healUsers.match(/(?:(\d+|all),?)+/)){
                    return {content: "Users must be numbers seperated by ,"}
                }
                damageHealText += ` HEAL=${healUsers}`
            }
            fs.appendFileSync("./command-results/battle", `${msg.author.id}: ${text} AMOUNT=${givenAmount} ${damageHealText};END\n`)
            return {content: `Added\n${text} AMOUNT=${givenAmount} ${damageHealText}`}
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
        run: async(msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            let round = !opts['no-round']
            let amount = calculateAmountFromString(msg.author.id, args[0], {min: (t: number, a: string) => t * 0.005})
            let numbers = args.slice(1, 4)
            if(!amount){
                return {content: "No amount given"}
            }
            if(!canBetAmount(msg.author.id, amount)){
                return {content: "You do not have enough money for this"}
            }
            if(amount / ECONOMY()[msg.author.id].money < 0.005){
                return {content: "You must bet at least 0.5%"}
            }
            let ticket = buyLotteryTicket(msg.author.id, amount)
            if(!ticket){
                return {content: "Could not buy ticket"}
            }
            if(numbers && numbers.length == 1){
                ticket = numbers[0].split("")
                for(let i = 0; i < ticket.length; i++){
                    ticket[i] = Number(ticket[i])
                }
            }
            else if(numbers && numbers.length == 3){
                ticket = numbers
                for(let i = 0; i < ticket.length; i++){
                    ticket[i] = Number(ticket[i])
                }
            }
            let answer = LOTTERY()
            let e = new MessageEmbed()
            if(round){
                amount = Math.floor(amount * 100) / 100
            }
            e.setFooter({text: `Cost: ${amount}`})
            if(JSON.stringify(ticket) == JSON.stringify(answer.numbers)){
                let winningAmount = answer.pool * 2
                addMoney(msg.author.id, winningAmount)
                newLottery()
                e.setTitle("WINNER!!!")
                e.setColor("GREEN")
                e.setDescription(`<@${msg.author.id}> BOUGHT THE WINNING TICKET! ${ticket.join(" ")}, AND WON **${winningAmount}**`)
            }
            else{
                e.setColor("RED")
                e.setTitle(["Nope", "Loser"][Math.floor(Math.random() * 2)])
                e.setDescription( `<@${msg.author.id}> bought the ticket: ${ticket.join(" ")}, for $${amount} and didnt win`)
            }
            return {embeds: [e]}
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
        run: async(msg, args) => {
            return {content: `The lottery pool is: ${LOTTERY().pool * 2}`}
        }, category: CommandCategory.FUN
    },
    calcm: {
        run: async(msg, args) => {
            let amount = calculateAmountFromString(msg.author.id, args.join(" "))
            return {content: `$${amount}`}
        }, category: CommandCategory.UTIL
    },
    calcl: {
        run: async(msg, args) => {
            let amount = calculateLoanAmountFromString(msg.author.id, args.join(" "))
            if(!amount){
                return {content: "None"}
            }
            return {content: `$${amount}`}
        }, category: CommandCategory.UTIL
    },
    calcms: {
        run: async(msg, args) => {
            let amount = calculateAmountFromStringIncludingStocks(msg.author.id, args.join(" ").trim())
            return {content: `$${amount}`}
        }, category: CommandCategory.UTIL
    },
    money: {
        run: async (msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            let user = msg.member
            if (args.join(" "))
                user = await fetchUser(msg.guild, args.join(" "))
            if (!user)
                user = msg.member
            if (!user) {
                return { content: "How are you not a member?" }
            }
            let text = ""
            if (ECONOMY()[user.id]) {
                if (opts['m']) {
                    text += `${ECONOMY()[user.id].money}\n`
                }
                if (opts['l']) {
                    text += `${ECONOMY()[user.id].lastTalk}\n`
                }
                if (opts['t']) {
                    text += `${ECONOMY()[user.id].lastTaxed}\n`
                }
                if(text){
                    return {content: text}
                }
                if(opts['no-round']){
                    return { content: `${user.user.username}\n$${ECONOMY()[user.id].money}` }
                }
                return { content: `${user.user.username}\n$${Math.round(ECONOMY()[user.id].money * 100) / 100}` }
            }
            return { content: "none" }
        }, category: CommandCategory.ECONOMY,
        help: {
            info: "Get the money of a user",
            arguments: {
                "user": {
                    required: false,
                    description: "The user to get the money of"
                }
            },
            options: {
                "m": {
                    description: "Show money only"
                },
                "l": {
                    description: "Show the last time they got money from talking",
                },
                "t": {
                    description: "Show the  last time they got taxed"
                },
                "no-round": {
                    description: "No rounding"
                }
            }
        }
    },
    give: {
        run: async(msg, args) => {
            let [amount, ...user] = args
            let userSearch = user.join(" ")
            if(!userSearch){
                return {content: "No user to search for"}
            }
            let member = await fetchUser(msg.guild, userSearch)
            if(!member)
                return {content: `${userSearch} not found`}
            let realAmount = calculateAmountFromString(msg.author.id, amount)
            if (!realAmount){
                return {content: "Nothing to give"}
            }
            if(realAmount < 0){
                return {content: "What are you trying to pull <:Watching1:697677860336304178>"}
            }
            if(canBetAmount(msg.author.id, realAmount) && !member.user.bot){
                loseMoneyToPlayer(msg.author.id, realAmount, member.id)
                return {content: `You gave ${realAmount} to ${member.user.username}`}
            }
            else{
                return {content: `You cannot give away ${realAmount}`}
            }
        }, category: CommandCategory.ECONOMY
    },
    "give-stock": {
        run: async(msg, args) => {
            let stock = args[0]
            let a = args[1]
            let data
            try {
                //@ts-ignore
                data = await got(`https://www.google.com/search?q=${encodeURI(stock)}+stock`)
            }
            catch (err) {
                return {content: "No data found"}
            }
            if (!data?.body) {
                return {content: "No data found"}
            }
            let stockData = data.body.match(/<div class="BNeawe iBp4i AP7Wnd">(.*?)<\/div>/)
            if(!stockData){
                return {content: "No data found"}
            }
            let stockName = data.body.match(/<span class="r0bn4c rQMQod">([^a-z]+)<\/span>/)
            if(!stockName){
                return {content: "Stock not found"}
            }
            stockName = stockName[1]
            if(!ECONOMY()[msg.author.id].stocks?.[stockName]){
                return {content: "You do not own that stock"}
            }
            let amount = calculateStockAmountFromString(msg.author.id, ECONOMY()[msg.author.id].stocks[stockName].shares, a) as number
            if(!amount){
                return {content: `Invalid share count`}
            }
            let userStockInfo = ECONOMY()[msg.author.id].stocks[stockName]
            if(amount > userStockInfo.shares){
                return {content: "You dont have that many shares"}
            }
            let player = args.slice(2).join(" ")
            let member = await fetchUser(msg.guild, player)
            if(!member){
                return {content: `Member: ${player} not found`}
            }
            if(!ECONOMY()[member.id]){
                return {content: "Cannot give stocks to this player"}
            }
            let oldUserShares = userStockInfo.shares
            userStockInfo.shares -= amount
            let otherStockInfo = ECONOMY()[member.id]?.stocks?.[stockName] || {}
            if(!otherStockInfo.buyPrice){
                otherStockInfo.buyPrice = userStockInfo.buyPrice
                otherStockInfo.shares = amount
            }
            else{
                let oldShareCount = otherStockInfo.shares
                let newShareCount = otherStockInfo.shares + amount
                otherStockInfo.buyPrice = (otherStockInfo.buyPrice * (oldShareCount / newShareCount)) + (userStockInfo.buyPrice * (oldUserShares / newShareCount))
                otherStockInfo.shares += amount
            }
            giveStock(member.id, stockName, otherStockInfo.buyPrice, otherStockInfo.shares)
            if(userStockInfo.shares == 0){
                removeStock(msg.author.id, stockName)
            }
            return {content: `<@${msg.author.id}> gave ${member} ${amount} shares of ${stockName}`}
        }, category: CommandCategory.ECONOMY
    },
    tax: {
        run: async (msg, args) => {
            if(msg.author.bot){
                return {content: "Bots cannot steal"}
            }
            let opts;
            [opts, args] = getOpts(args)
            if (!args.length) {
                await msg.channel.send({ content: "No user specified, erasing balance" })
                await new Promise(res => setTimeout(res, 1000))
                return { content: "Balance erased" }
            }
            let user = await fetchUser(msg.guild, args.join(" "))
            if (!user)
                return { content: `${args.join(" ")} not found` }
            let ct = canTax(user.id)
            if(hasItem(user.id, "tax evasion")){
                ct = canTax(user.id, INVENTORY()[user.id]['tax evasion'] * 30)
            }
            if (ct) {
                let embed = new MessageEmbed()
                embed.setTitle("Taxation Time")
                let userBeingTaxed = user.id
                let userGainingMoney = msg.author.id
                let taxAmount;
                let reflected = false
                if(hasItem(user.id, "reflect")){
                    reflected = true
                    userBeingTaxed = msg.author.id
                    userGainingMoney = user.id
                    useItem(user.id, "reflect")
                    taxAmount = taxPlayer(msg.author.id)
                    addMoney(user.id, taxAmount.amount * 5)
                }
                else{
                    taxAmount = taxPlayer(userBeingTaxed)
                }
                addMoney(userGainingMoney, taxAmount.amount)
                if (opts['no-round'])
                    embed.setDescription(`<@${userBeingTaxed}> has been taxed for ${taxAmount.amount} (${taxAmount.percent}% of their money)`)
                else
                    embed.setDescription(`${userBeingTaxed} has been taxed for ${Math.round(taxAmount.amount * 100) / 100} (${Math.round(taxAmount.percent * 10000) / 100}% of their money)`)
                if(reflected){
                    return {content: "REFLECTED", embeds: [embed]}
                }
                return { embeds: [embed] }
            }
            return { content: `${user.user.username} cannot be taxed` }
        }, category: CommandCategory.ECONOMY,
        help: {
            info: "Tax someone evily",
            options: {
                "no-round": {
                    description: "Dont round numbers"
                }
            }
        }
    },
    aheist: {
        run: async(msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            let text = args.join(" ")
            let damageUsers = opts['lose'] || opts['l']
            let healUsers = opts['gain'] || opts['g']
            let amounts = ['none', 'normal', 'medium', 'large']
            let givenAmount = opts['amount']  || opts['a']
            let stage = opts['stage'] || opts['s']
            let substage = opts['sub-stage'] || opts['ss']
            let isNeutral = Boolean(opts['neutral'])
            let location = opts['location']
            let set_location = opts['set-location']
            if(isNeutral){
                givenAmount = 'none'
                healUsers = 'all'
                //@ts-ignore
                damageUsers = undefined
            }
            let textOptions = ""
            if(typeof stage !== 'string'){
                return {content: `You did not provide a valid stage`}
            }
            if (typeof substage !== 'undefined' && typeof substage !== 'string'){
                return {content: "You did not provide a valid substage"}
            }
            if(typeof givenAmount !== 'string'){
                return {content: `You must provide an amount (${amounts.join(", ")})`}
            }
            if(typeof damageUsers !== 'string' && typeof healUsers !== 'string'){
                return {content: `You must provide a user to lose/gain`}
            }
            if(damageUsers !== undefined && typeof damageUsers !== 'string'){
                return {content: "-lose must be a user number or all"}
            }
            if(healUsers !== undefined && typeof healUsers !== 'string'){
                return {content: "-gain must be a user number or all"}
            }
            if(!amounts.includes(givenAmount)){
                return {content: `You did not provide a valid amount (${amounts.join(", ")})`}
            }
            let damageHealText = ""
            if(damageUsers && healUsers){
                return {content: "Only -lose or -gain can be given, not both"}
            }
            if(damageUsers){
                if(!damageUsers.match(/(?:(\d+|all),?)+/)){
                    return {content: "Users must be numbers seperated by ,"}
                }
                textOptions += ` LOSE=${damageUsers}`
            }
            if(healUsers){
                if(!healUsers.match(/(?:(\d+|all),?)+/)){
                    return {content: "Users must be numbers seperated by ,"}
                }
                textOptions += ` GAIN=${healUsers}`
            }
            textOptions += ` STAGE=${stage}`
            if(substage){
                textOptions += ` SUBSTAGE=${substage}`
            }
            if(location && typeof location === 'string'){
                textOptions += ` LOCATION=${location}`
            }
            if(set_location && typeof set_location === 'string'){
                textOptions += ` SET_LOCATION=${set_location}`
            }
            fs.appendFileSync("./command-results/heist", `${msg.author.id}: ${text} AMOUNT=${givenAmount} ${textOptions};END\n`)
            return {content: `Added\n${text} AMOUNT=${givenAmount} ${textOptions}`}
        }, category: CommandCategory.UTIL,
        help: {
            info: "Add a heist prompt with a nice ui ™️",
            arguments: {
                "text": {
                    description: "The text to show<br>{user1} will be replaced with user1, {user2} with user2, etc...",
                    required: true
                }
            },
            options: {
                "gain": {
                    alternates: ['g'],
                    description: "The user(s) to heal"
                },
                "lose": {
                    alternates: ['l'],
                    description: "The user(s) to damage"
                },
                "stage": {
                    alternates: ['s'],
                    description: "the stage of the game that the message is for (getting_in, robbing, escape)"
                },
                "amount": {
                    alternates: ["a"],
                    description: "The amount to gain/lose, (normal, medium, large)"
                }
            }
        }
    },
    heist: {
        run: async(msg, args) => {
            if(HEIST_PLAYERS.includes(msg.author.id)){
                return {content: "U dingus u are already in the game"}
            }
            if((ECONOMY()[msg.author.id]?.money || 0) <= 0){
                return {content: "U dont have money"}
            }
            HEIST_PLAYERS.push(msg.author.id)
            let timeRemaining = 30000
            if(HEIST_TIMEOUT === null){
                let int = setInterval(async() => {
                    timeRemaining -= 1000
                    if(timeRemaining % 8000 == 0)
                        await msg.channel.send({content: `${timeRemaining / 1000} seconds until the heist commences!`})
                }, 1000)
                let data: {[key: string]: number} = {} //player_id: amount won
                HEIST_TIMEOUT = setTimeout(async() => {
                    clearInterval(int)
                    await msg.channel.send({content: `Commencing heist with ${HEIST_PLAYERS.length} players`})
                    let stages = ["getting in", "robbing", "escape"]
                    for(let player of HEIST_PLAYERS){
                        data[player] = 0
                    }
                    let fileResponses = fs.readFileSync("./command-results/heist", "utf-8").split(";END").map(v => v.split(":").slice(1).join(":").trim())
                    let legacyNextStages = {"getting_in": "robbing", "robbing": "escape", "escape": "end"}
                    let lastLegacyStage = "getting_in"
                    let responses: {[key: string]: string[]} = {
                        getting_in_positive: [
                            "{userall} got into the building GAIN=all AMOUNT=normal "
                        ],
                        getting_in_negative: [
                            "{userall} spent {amount} on a lock pick to get into the building LOSE=all AMOUNT=normal"
                        ],
                        robbing_positive: [
                            "{user1} successfuly stole the gold {amount} GAIN=1 AMOUNT=large",
                        ],
                        robbing_negative: [
                            "{user1} got destracted by the hot bank teller {amount} LOSE=1 AMOUNT=normal"
                        ],
                        escape_positive: [
                            "{userall} escapes {amount}! GAIN=all AMOUNT=normal"
                        ],
                        escape_negative: [
                            "{userall} did not escape {amount}! LOSE=all AMOUNT=normal"
                        ],
                    }
                    for(let resp of fileResponses){
                        let stage = resp.match(/STAGE=([^ ]+)/)
                        if(!stage?.[1]){
                            continue
                        }
                        resp = resp.replace(/STAGE=[^ ]+/, "")
                        let type = ""
                        let gain = resp.match(/GAIN=([^ ]+)/)
                        if(gain?.[1])
                            type = "positive"
                        let lose = resp.match(/LOSE=([^ ]+)/)
                        if(lose?.[1]){
                            type = "negative"
                        }
                        let t = `${stage[1]}_${type}`
                        if(responses[t]){
                            responses[t].push(resp)
                        }
                        else{
                            responses[t] = [resp]
                        }
                    }

                    let current_location = "__generic__"

                    async function handleStage(stage: string): Promise<boolean>{
                        let shuffledPlayers = HEIST_PLAYERS.sort(() => Math.random() - .5)
                        let amount = Math.floor(Math.random() * 10)
                        let negpos = ["negative", "positive"][Math.floor(Math.random() * 2)]
                        let responseList = responses[stage.replaceAll(" ", "_") + `_${negpos}`]
                        if(!responseList){
                            return false
                        }
                        responseList = responseList.filter(v => {
                            let enough_players = false
                            let u = v.matchAll(/\{user(\d+|all)\}/g)
                            for(let match of u){
                                if(match?.[1]){
                                    if(match[1] === 'all') enough_players = true
                                    let number = Number(match[1])
                                    if(number > HEIST_PLAYERS.length)
                                        return false
                                    enough_players = true
                                }
                            }
                            return enough_players
                        })
                        responseList = responseList.filter(v => {
                            let location = v.match(/(?<!SET_)LOCATION=([^ ]+)/)
                            if(!location?.[1] && current_location == "__generic__"){
                                return true
                            }
                            if(location?.[1].toLowerCase() == current_location.toLowerCase()){
                                return true
                            }
                            return false
                        })
                        if(responseList.length < 1){
                            return false
                        }
                        let response = responseList[Math.floor(Math.random() * responseList.length)]
                        let amountType = response.match(/AMOUNT=([^ ]+)/)
                        while(!amountType?.[1]){
                            response = responseList[Math.floor(Math.random() * responseList.length)]
                            amountType = response.match(/AMOUNT=([^ ]+)/)
                        }
                        let multiplier = Number({"none": 0, "normal": 1, "medium": 1, "large": 1}[amountType[1]])
                        amount *= multiplier

                        response = response.replaceAll(/\{user(\d+|all)\}/g, (all, capture) => {
                            if(capture === "all"){
                                let text = []
                                for(let player of shuffledPlayers){
                                    text.push(`<@${player}>`)
                                }
                                return text.join(', ')
                            }
                            let nUser = Number(capture) - 1
                            return `<@${shuffledPlayers[nUser]}>`
                        })
                        let gainUsers = response.match(/GAIN=([^ ]+)/)
                        if(gainUsers?.[1]){
                            for(let user of gainUsers[1].split(",")){
                                if(user == 'all'){
                                    for(let player in data){
                                        data[player] += amount
                                    }
                                }
                                else{
                                    data[shuffledPlayers[Number(user) - 1]] += amount
                                }
                            }
                        }
                        let loseUsers = response.match(/LOSE=([^ ]+)/)
                        if(loseUsers?.[1]){
                            amount *= -1
                            for(let user of loseUsers[1].split(",")){
                                if(user == 'all'){
                                    for(let player in data){
                                        data[player] += amount
                                    }
                                }
                                else{
                                    data[shuffledPlayers[Number(user) - 1]] += amount
                                }
                            }
                        }
                        let subStage = response.match(/SUBSTAGE=([^ ]+)/)
                        if(subStage?.[1]){
                            response = response.replace(/SUBSTAGE=[^ ]+/, "")
                        }
                        let setLocation = response.match(/SET_LOCATION=([^ ]+)/)
                        if(setLocation?.[1]){
                            response = response.replace(/SET_LOCATION=[^ ]+/, "")
                            current_location = setLocation[1].toLowerCase()
                        }
                        response = response.replace(/LOCATION=[^ ]+/, "")
                        response = response.replaceAll(/\{amount\}/g, amount >= 0 ? `+${amount}` : `${amount}`)
                        response = response.replace(/GAIN=[^ ]+/, "")
                        response = response.replace(/LOSE=[^ ]+/, "")
                        response = response.replace(/AMOUNT=[^ ]+/, "")
                        await handleSending(msg, {content: response})
                        await new Promise(res => setTimeout(res, 4000))
                        console.log(lastLegacyStage, subStage?.[1])
                        if(subStage?.[1] && responses[`${subStage[1]}_positive`] && responses[`${subStage[1]}_negative`]){
                            if(Object.keys(legacyNextStages).includes(subStage[1])){
                                lastLegacyStage = subStage[1]
                            }
                            stage = subStage[1]
                            return await handleStage(subStage[1])
                        }
                        return true
                    }
                    let stage: string = lastLegacyStage
                    while(stage != 'end'){
                        if (!await handleStage(stage)){
                            HEIST_PLAYERS = []
                            HEIST_TIMEOUT = null
                            await msg.channel.send(`FAILURE on stage: ${stage} ${current_location == '__generic__' ? "" : `at location: ${current_location}`}`)
                            return
                        }
                        else{
                            console.log("fallback", lastLegacyStage, stage)
                            //@ts-ignore
                            if(legacyNextStages[lastLegacyStage]){
                                //@ts-ignore
                                stage = legacyNextStages[lastLegacyStage]
                                lastLegacyStage = stage
                            }
                            else{
                                stage = 'end'
                            }
                        }
                    }
                    HEIST_PLAYERS = []
                    HEIST_TIMEOUT = null
                    if(Object.keys(data).length > 0){
                        let text = "TOTALS\n--------------------\n"
                        for(let player in data){
                            addMoney(player, data[player])
                            text += `<@${player}>: ${data[player]}\n`
                        }
                        await handleSending(msg, {content: text})
                    }
                }, timeRemaining)
            }
            return {content: `${msg.author} joined the heist`}

        }, category: CommandCategory.GAME
    },
    "egyption-war": {
        run: async(msg, args) => {

            function giveRandomCard(cardsToChooseFrom: string[], deck: string[]) {
                let no = Math.floor(Math.random() * cardsToChooseFrom.length)
                let c = cardsToChooseFrom[no]
                cards = cardsToChooseFrom.filter((_v, i) => i != no)
                deck.push(c)
            }
            let cards = []
            let stack: string[] = []
            for (let suit of ["♦", "S", "♥️", "C"]) {
                for (let num of ["A",  "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]) {
                    cards.push(`${num} of ${suit}`)
                }
            }
            let totalCards = cards.length
            let players: {[key: string]: string[]} = {[msg.author.id]: []}
            for(let arg of args){
                let user = await fetchUser(msg.guild, arg)
                players[user.id] = []
            }
            let cardsPerPlayer = Math.floor(cards.length / Object.keys(players).length)
            for(let player in players){
                for(let i = 0; i < cardsPerPlayer; i++){
                    giveRandomCard(cards, players[player])
                }
            }
            if(cards.length){
                stack = JSON.parse(JSON.stringify(cards))
            }
            let collector = msg.channel.createMessageCollector({filter: m => ['slap', 's'].includes(m.content) && !m.author.bot})
            collector.on("collect", m => {
                let lastCard = stack[stack.length - 1]?.split(" of")[0]
                let secondLastCard = stack[stack.length - 2]?.split(" of")[0]
                let thirdLastCard = stack[stack.length - 3]?.split(" of")[0]
                if((lastCard === secondLastCard || thirdLastCard === lastCard) && lastCard != undefined){
                    if(players[m.author.id]){
                        players[m.author.id] = [...players[m.author.id], ...stack]
                    }
                    else{
                        players[m.author.id] = [...stack]
                    }
                    playerKeys.push(m.author.id)
                    stack = []
                    msg.channel.send(`${m.author} got the stack`)
                }
                else{
                    msg.channel.send("No slap")
                }
            })
            let attemptsDict = {
                "A": 4,
                "K": 3,
                "Q": 2,
                "J": 1
            }
            let playerKeys = Object.keys(players)
            let attempts = 0
            let lastPlayer;
            for(let i = 0; true; i = ++i >= playerKeys.length ? 0 : i){
                let turn = playerKeys[i]
                if(attempts && lastPlayer){
                    let gotFaceCard = false
                    for(; attempts > 0; attempts--){
                        await msg.channel.send(`<@${turn}>: FACE CARD: ${attempts} attempts remaining`)
                        try{
                            let m = await msg.channel.awaitMessages({filter: m => m.author.id === turn && ['go', 'g'].includes(m.content.toLowerCase()), time: 10000, max: 1, errors: ['time']})
                            giveRandomCard(players[turn], stack)
                            let recentCard = stack[stack.length - 1]
                            let isFaceCard = ['K', 'Q', "J", "A"].includes(recentCard.split(" of")[0])
                            await msg.channel.send(`${recentCard} (${stack.length})`)
                            if(isFaceCard){
                                attempts = attemptsDict[recentCard.split(" of")[0] as 'A' | 'K' | 'Q' | 'J']
                                gotFaceCard = true
                                break
                            }
                        }
                        catch(err){
                            await handleSending(msg, {content: `<@${turn}> didnt go in time they are out`})
                            delete players[turn]
                            playerKeys = playerKeys.filter(v => v != turn)
                        }
                    }
                    if(!gotFaceCard){
                        players[lastPlayer] = [...players[lastPlayer], ...stack]
                        await msg.channel.send(`<@${lastPlayer}> got the stack (${stack.length} cards)`)
                        stack = []
                    }
                }
                else{
                    await msg.channel.send(`<@${turn}> (${players[turn].length} / ${totalCards} cards ): GO`)
                    try{
                        let m = await msg.channel.awaitMessages({filter: m => m.author.id === turn && ['go', 'g'].includes(m.content.toLowerCase()), time: 10000, max: 1, errors: ['time']})
                        giveRandomCard(players[turn], stack)
                        let recentCard = stack[stack.length - 1]
                        let isFaceCard = ['K', 'Q', "J", "A"].includes(recentCard.split(" of")[0])
                        if(isFaceCard){
                            attempts = attemptsDict[recentCard.split(" of")[0] as 'A' | 'K' | 'Q' | 'J']
                        }
                        await msg.channel.send(`${recentCard} (${stack.length})`)
                    }
                    catch(err){
                        await handleSending(msg, {content: `<@${turn}> didnt go in time they are out`})
                        delete players[turn]
                        playerKeys = playerKeys.filter(v => v != turn)
                    }
                }
                if(playerKeys.length <= 1){
                    return {content: "Everyone left"}
                }
                for(let player in players){
                    if(players[player].length == totalCards){
                        return {content: `<@${player}> WINS`}
                    }
                }
                lastPlayer = turn
            }
            return {content: "Starting"}
        }, category: CommandCategory.GAME
    },
    blackjack: {
        run: async (msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            let hardMode = Boolean(opts['hard'])
            let bet = calculateAmountFromString(msg.author.id, args[0])
            if (!bet) {
                return { content: "no bet given" }
            }
            if(bet <= 0){
                return {content: "No reverse blackjack here"}
            }
            if(hardMode)
                bet *= 2

            if(!canBetAmount(msg.author.id, bet)){
                return {content: "That bet is too high for you"}
            }
            if(BLACKJACK_GAMES[msg.author.id]){
                return {content: "You idiot u already playing the game"}
            }
            BLACKJACK_GAMES[msg.author.id] = true
            let cards = []
            for (let suit of ["Diamonds", "Spades", "Hearts", "Clubs"]) {
                for (let num of ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]) {
                    cards.push(`${num}`)
                }
            }
            function calculateCardValue(card: string, total: number) {
                if (card == "A") {
                    if (total + 11 >= 22) {
                        return {amount: 1, soft: false}
                    }
                    else {
                        return {amount: 11, soft: true}
                    }
                }
                else if (["10", "J", "Q", "K"].includes(card)) {
                    return {amount: 10, soft: false}
                }
                else if (Number(card)) {
                    return {amount: Number(card), soft: false}
                }
                return {amount: NaN, soft: false}
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
                for(let card of cards.filter(v => v.split(" of")[0] === 'A')){
                    let val = calculateCardValue(card, total)
                    if(!isNaN(val.amount)){
                        total += val.amount
                    }
                    if(val.soft){
                        soft = true
                    }
                }
                return {total: total, soft: soft}
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
                addMoney(msg.author.id, bet * 3)
                delete BLACKJACK_GAMES[msg.author.id]
                return { content: `BLACKJACK!\nYou got: ${bet * 3}` }
            }
            if(calculateTotal(dealerCards).total === 21){
                loseMoneyToBank(msg.author.id, bet)
                delete BLACKJACK_GAMES[msg.author.id]
                return { content: `BLACKJACK!\nYou did not get: ${bet * 3}` }
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
                if(msg.member?.user.avatarURL()){
                    //@ts-ignore
                    embed.setThumbnail(msg.member.user.avatarURL().toString())
                }
                let playerTotal = calculateTotal(playersCards)
                if(playerTotal.soft){
                    embed.addField("Your cards", `value: **${playerTotal.total}** (soft)`, true)
                }
                else embed.addField("Your cards", `value: **${playerTotal.total}**`, true)
                //FIXME: edge case where dealerCards[0] is "A", this could be wrong
                embed.addField("Dealer cards", `value: **${calculateCardValue(dealerCards[0], 0).amount}**`, true)
                embed.setFooter({ text: `Cards Remaining, \`${cards.length}\`` })
                if(hasItem(msg.author.id, "reset")){
                    embed.setDescription(`\`reset\`: restart the game\n\`hit\`: get another card\n\`stand\`: end the game\n\`double bet\`: to double your bet\n(current bet: ${bet})`)
                }
                else{
                    embed.setDescription(`\`hit\`: get another card\n\`stand\`: end the game\n\`double bet\`: to double your bet\n(current bet: ${bet})`)
                }
                let message = await msg.channel.send({ embeds: [embed] })
                let response
                while (!response) {
                    let collectedMessages
                    try {
                        collectedMessages = await msg.channel.awaitMessages({
                            filter: m => {
                                if (m.author.id === msg.author.id) {
                                    if(hasItem(msg.author.id, "reset") && (['hit', 'stand', 'double bet', 'reset'].includes(m.content.toLowerCase()))) {
                                        return true
                                    }
                                    else if(['hit', 'stand', 'double bet' ].includes(m.content.toLowerCase())) {
                                        return true
                                    }
                                }
                                return false
                            }, max: 1, time: 30000, errors: ["time"]
                        })
                    }
                    catch (err) {
                        loseMoneyToBank(msg.author.id, bet)
                        delete BLACKJACK_GAMES[msg.author.id]
                        return { content: `Did not respond  in time, lost ${bet}` }
                    }
                    response = collectedMessages.at(0)
                }
                let choice = response.content.toLowerCase()
                if (choice === 'double bet') {
                    if(!canBetAmount(msg.author.id, bet * 2)){
                        await msg.channel.send({content: "That bet is too high for you"})
                        continue
                    }
                    bet *= 2
                    choice = "hit"
                }
                if (choice === 'hit') {
                    giveRandomCard(cards, playersCards)
                }
                if(choice === 'reset' && hasItem(msg.author.id, "reset")){
                    cards = []
                    for (let suit of ["Diamonds", "Spades", "Hearts", "Clubs"]) {
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
                        addMoney(msg.author.id, bet * 3)
                        delete BLACKJACK_GAMES[msg.author.id]
                        useItem(msg.author.id, "reset")
                        return { content: `BLACKJACK!\nYou got: ${bet * 3}` }
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
                    if(calculateTotal(dealerCards).total === 21){
                        loseMoneyToBank(msg.author.id, bet)
                        delete BLACKJACK_GAMES[msg.author.id]
                        return { content: `BLACKJACK!\nYou did not get: ${bet * 3}` }
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
                loseMoneyToBank(msg.author.id, bet)
            }
            else if (playerTotal === dealerTotal) {
                status = "TIE"
            }
            else if (playerTotal < dealerTotal && dealerTotal < 22) {
                status = `You lost: $${bet} (dealer won)`
                loseMoneyToBank(msg.author.id, bet)
            }
            else {
                status = `You won: $${bet}`
                addMoney(msg.author.id, bet)
            }
            delete BLACKJACK_GAMES[msg.author.id]
            return { content: `**${status}**\n${stats}` }
        }, category: CommandCategory.GAME,
        help: {
            info: "Play a round of blackjack",
            options: {
                "hard": {
                    description: "You can only stand if you have 17+"
                }
            },
            arguments: {
                "bet": {
                    description: "The amount to bet"
                }
            }
        }
    },
    economy: {
        run: async(msg, args) => {
            return {files: [
                {
                    attachment: `economy.json`,
                    name: `economy.json`,
                    description: "This is the economy",
                    delete: false
                }
            ]}
        },
        category: CommandCategory.META
    },
    "inventory.json": {
        run: async(msg, args) => {
            return {
                files: [
                    {
                        attachment: `inventory.json`,
                        name: "Inventory.json",
                        description: "Everyone's inventory",
                        delete: false
                    }
                ]
            }
        }, category: CommandCategory.META
    },
    leaderboard: {
        run: async (msg, args) => {
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
                return { content: "No guild" }
            }
            let embed = new MessageEmbed()
            let text = ""
            //@ts-ignore
            let sortedEconomy = Object.entries(ECONOMY()).sort((a, b) => a[1].money - b[1].money).reverse().slice(0, place)
            //@ts-ignore
            let allValues = Object.values(ECONOMY())
            let totalEconomy = 0
            for(let value of allValues){
                //@ts-ignore
                totalEconomy += value.money
            }
            place = 0
            for (let user of sortedEconomy) {
                let id = user[0]
                let money = ECONOMY()[id].money
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
                return { content: text, allowedMentions: { parse: [] } }
            embed.setTitle(`Leaderboard`)
            if(opts['no-round'])
                embed.setDescription(`Total wealth: ${totalEconomy}`)
            else
                embed.setDescription(`Total wealth: ${Math.round(totalEconomy * 100) / 100}`)
            return { embeds: [embed] }

        }, category: CommandCategory.ECONOMY
    },
    savee: {
        run: async (msg, args) => {
            saveEconomy()
            saveItems()
            return { content: "Economy saved" }
        }, category: CommandCategory.ECONOMY
    },
    coin: {
        run: async (msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            let guess = args[0]
            let bet = calculateAmountFromString(msg.author.id, String(opts['bet'] || opts['b'])) || 0
            if (bet && !guess) {
                return { content: "You cannot bet, but not have a guess" }
            }
            let side = Math.random() > .5 ? "heads" : "tails"
            if (!bet) {
                return { content: side }
            }
            if (!canBetAmount(msg.author.id, bet)) {
                return { content: "You dont have enough money for this bet" }
            }
            guess = guess.toLowerCase()
            if (side == guess) {
                addMoney(msg.author.id, bet)
                return { content: `The side was: ${side}\nYou won: ${bet}` }
            }
            else {
                loseMoneyToBank(msg.author.id, bet)
                return { content: `The side was: ${side}\nYou lost: ${bet}` }
            }
        }, category: CommandCategory.GAME
    },
    replace: {
        run: async (_msg, args) => {
            let opts: Opts;
            [opts, args] = getOpts(args)
            let search = args[0]
            let repl = args[1]
            let text = args.slice(2).join(" ")
            if (opts['n']) {
                text = args.slice(1).join(" ")
                if (!search) {
                    return { content: "no search" }
                }
                return { content: text.replaceAll(search, "") }
            }
            else if (!repl) {
                return { content: "No replacement" }
            }
            if (!search) {
                return { content: "no search" }
            }
            if (!text) {
                return { content: "no text to search through" }
            }
            return { content: text.replaceAll(search, repl || "") }
        }, category: CommandCategory.UTIL
    },
    time: {
        run: async (msg, args) => {
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
        run: async (msg, args) => {
            return { content: ["reddit - impossible to set up api", "socialblade - socialblade blocks automated web requests", "donate/work command -boring (use last-run)"].join("\n") }
        },
        category: CommandCategory.META
    },
    "rand-role": {
        run: async (msg, args) => {
            let roles = await msg.guild?.roles.fetch()
            let role = roles?.random()
            if (!role) {
                return { content: "Couldn't get random role" }
            }
            let fmt = args.join(" ") || "%n"
            return { allowedMentions: { parse: [] }, content: format(fmt, { n: role.name, i: role.id, c: role.color, C: role.createdAt, hc: role.hexColor, u: role.unicodeEmoji, p: role.position, I: role.icon }) }
        },
        category: CommandCategory.UTIL
    },
    "cmd-search": {
        run: async (msg, args) => {
            let search = args.join(" ")
            let results = []
            for (let cmd in commands) {
                if (cmd.match(search)) {
                    if (commands[cmd].help?.info) {
                        results.push(`${cmd}: ${commands[cmd].help?.info}`)
                    }
                    else results.push(cmd)
                }
                else if (commands[cmd].help) {
                    let help = commands[cmd].help
                    if (help?.info?.match(search)) {
                        results.push(`${cmd}: ${commands[cmd].help?.info}`)
                    }
                }
            }
            if (results.length == 0) {
                return { content: "No results" }
            }
            return { content: results.join("\n") }
        },
        help: {
            info: "Search for commands with a search query"
        },
        category: CommandCategory.META
    },
    "6": {
        run: async (msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            let getRankMode = opts['rank'] || false
            let content = args.join(" ")
            let requestedUsers = content.split("|")
            if (!requestedUsers[0]) {
                requestedUsers[0] = msg.author.id
            }
            let embeds = []
            const url = `https://mee6.xyz/api/plugins/levels/leaderboard/${GUILD_ID}`
            let data
            try {
                //@ts-ignore
                data = await got(url)
            }
            catch (err) {
                return { content: "Could not fetch data" }
            }
            if (!data?.body) {
                return { content: "No data found" }
            }
            const JSONData = JSON.parse(data.body)
            for (let requestedUser of requestedUsers) {
                if (!requestedUser) continue
                let [ruser1, ruser2] = requestedUser.split("-")
                if (ruser1.trim() && ruser2?.trim()) {
                    //@ts-ignore
                    let member1, member2;
                    if (getRankMode) {
                        member1 = JSONData.players[Number(ruser1) - 1]
                        member1 = await fetchUser(msg.guild, member1.id)
                        member2 = JSONData.players[Number(ruser2) - 1]
                        member2 = await fetchUser(msg.guild, member2.id)
                    }
                    else {
                        member1 = await fetchUser(msg.guild, ruser1.trim())
                        member2 = await fetchUser(msg.guild, ruser2.trim())
                    }
                    if (!member1) {
                        return { content: `Could not find ${ruser1}` }
                    }
                    if (!member2) {
                        return { content: `Could not find ${ruser1}` }
                    }
                    //@ts-ignore
                    const user1Data = JSONData.players.filter(v => v.id == member1.id)?.[0]
                    //@ts-ignore
                    const user2Data = JSONData.players.filter(v => v.id == member2.id)?.[0]
                    if (!user1Data) {
                        return { content: `No data for ${member1.user.username} found` }
                    }
                    if (!user2Data) {
                        return { content: `No data for ${member2.user.username} found` }
                    }
                    const rank1 = JSONData.players.indexOf(user1Data)
                    const rank2 = JSONData.players.indexOf(user2Data)
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
                    embed.setColor(hex)
                    embed.addField("Level", String(user1Data.level - user2Data.level), true)
                    embed.addField("XP", String(user1Data.xp - user2Data.xp), true)
                    embed.addField("Message Count", String(user1Data.message_count - user2Data.message_count), true)
                    embeds.push(embed)
                    continue
                }
                let member: any;
                if (getRankMode) {
                    member = JSONData.players[Number(requestedUser.trim()) - 1]
                    member = await fetchUser(msg.guild, member.id)
                }
                else
                    member = await fetchUser(msg.guild, requestedUser.trim())
                if (!member) {
                    member = msg.author
                }
                //@ts-ignore
                const userData = JSONData.players.filter(v => v.id == member.id)?.[0]
                if (!userData) {
                    return { content: `No data for ${member.user.username} found` }
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
            return { embeds: embeds }
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
        run: async (msg, args) => {
            const fn = generateFileName("yt", msg.author.id)
            exec(`YTFZF_CONFIG_FILE="" ytfzf -A -IJ ${escapeShell(args.join(" "))}`, async (excep: any, stdout: any, stderr: any) => {
                if (excep) {
                    console.log(excep)
                }
                else {
                    const JSONData = JSON.parse(stdout.replaceAll("[]", "").replaceAll(/\]\s+\[/g, ","))
                    let embed = new MessageEmbed()
                    for (let item of JSONData) {
                        embed.addField(`title: ${item.title}`, `url: ${item.url}`)
                    }
                    await msg.channel.send({ embeds: [embed] })
                }
            })
            return { noSend: true }
        },
        help: {
            info: "https://github.com/pystardust/ytfzf/wiki"
        },
        category: CommandCategory.FUN
    },
    ani: {
        run: async (msg, args) => {
            const fn = generateFileName("ani", msg.author.id)
            exec(`YTFZF_CONFIG_FILE="" ytfzf -A -IJ -cani ${escapeShell(args.join(" "))}`, async (excep: any, stdout: any, stderr: any) => {
                if (excep) {
                    console.log(excep)
                }
                else {
                    const JSONData = JSON.parse(stdout.replaceAll("[]", "").replaceAll(/\]\s+\[/g, ","))
                    let embed = new MessageEmbed()
                    for (let item of JSONData) {
                        embed.addField(`tiitle: ${item.title}`, `url: ${item.url}`)
                    }
                    await msg.channel.send({ embeds: [embed] })
                }
            })
            return { noSend: true }
        },
        help: {
            info: "get anime :)))))))))"
        },
        category: CommandCategory.FUN
    },
    wiki: {
        run: async (msg, args) => {
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
                        await msg.channel.send(rv)
                    })
                }).end()
                return { content: "Generating random article" }
            }
            else {
                let resp
                try {
                    //@ts-ignore
                    resp = await got(`https://${baseurl}${path}`)
                }
                catch (err) {
                    return { content: "not found" }
                }
                if (resp.headers?.location) {
                    await commands['wiki'].run(msg, [`-full=/wiki/${resp.headers.location.split("/wiki/")[1]}`])
                }
                else {
                    let $ = cheerio.load(resp.body)
                    let text = $("p").text().trim().split("\n")
                    if (!text.length) {
                        return { content: "nothing" }
                    }
                    let rv = text.slice(0, sentences <= text.length ? sentences : text.length).join("\n")
                    return { content: rv }
                }
            }
            return { content: "how did we get here" }
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
        run: async (msg, args) => {
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
            return { content: words.join(sep) }
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
        run: async (msg, opts) => {
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
                            data = bots?.filter(u => u.user.bot)
                            break
                        }
                    }
                    if (!data) {
                        return { content: `${object} is invalid` }
                    }
                    if (number) {
                        return { content: String(data.at(number)), allowedMentions: { parse: [] } }
                    }
                    else {
                        return { content: String(data.size), allowedMentions: { parse: [] } }
                    }
                }
                case "rand": {
                    switch (object) {
                        case "channel": {
                            let channels = await msg.guild?.channels.fetch()
                            return { content: channels?.random()?.toString() }
                        }
                        case "role": {
                            let roles = await msg.guild?.roles.fetch()
                            return { content: String(roles?.random()), allowedMentions: { parse: [] } }
                        }
                        case "member": {
                            let members = await msg.guild?.members.fetch()
                            return { content: String(members?.random()), allowedMentions: { parse: [] } }
                        }
                    }
                }
            }
            return { content: "Not a valid option" }
        },
        category: CommandCategory.UTIL

    },
    calc: {
        run: async (msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            let sep = opts['sep']
            if (!sep) {
                sep = "\n"
            } else sep = String(sep)
            let ret: any[] = []
            try {
                ret.push(String(safeEval(args.join(" "), { yes: true, no: false, uid: msg.member?.id, uavatar: msg.member?.avatar, ubannable: msg.member?.bannable, ucolor: msg.member?.displayColor, uhex: msg.member?.displayHexColor, udispname: msg.member?.displayName, ujoinedAt: msg.member?.joinedAt, ujoinedTimeStamp: msg.member?.joinedTimestamp, unick: msg.member?.nickname, ubot: msg.author.bot, args: args, lastCommand: lastCommand?.content, ...vars }, { timeout: 3000 })))
            }
            catch (err) {
                console.log(err)
            }
            if (ret.length) {
                if (userVars && userVars[msg.author.id])
                    userVars[msg.author.id]["__calc"] = () => ret.join(sep as string)
                else
                    userVars[msg.author.id] = { "__calc": () => ret.join(sep as string) }
            }
            return { content: ret.join(sep) }
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
        run: async (msg, args) => {
            msg.content = `${prefix}${args.join(" ")}`
            await doCmd(msg, false)
            return { noSend: true, delete: true }
        },
        category: CommandCategory.META
    },
    del: {
        run: async (msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            if (!opts['N']) return { noSend: true, delete: true }
            msg.content = `${prefix}${args.join(" ")}`
            await doCmd(msg, false)
            return { noSend: true, delete: true }
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
        run: async (msg, args) => {
            let [condition, cmd] = args.join(" ").split(";")
            cmd = cmd.split(";end")[0]
            if (safeEval(condition, { uid: msg.member?.id, uavatar: msg.member?.avatar, ubannable: msg.member?.bannable, ucolor: msg.member?.displayColor, uhex: msg.member?.displayHexColor, udispname: msg.member?.displayName, ujoinedAt: msg.member?.joinedAt, ujoinedTimeStamp: msg.member?.joinedTimestamp, unick: msg.member?.nickname, args: args, lastCommand: lastCommand?.content }, { timeout: 3000 })) {
                msg.content = `${prefix}${cmd.trim()}`
                return await doCmd(msg, true) as CommandReturn
            }
            let elseCmd = args.join(" ").split(`${prefix}else;`).slice(1).join(`${prefix}else;`)?.trim()
            if (elseCmd) {
                msg.content = `${prefix}${elseCmd.trim()}`
                return await doCmd(msg, true) as CommandReturn
            }
            return { content: "?" }
        },
        category: CommandCategory.META
    },
    getimg: {
        run: async (msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            let img = getImgFromMsgAndOpts(opts, msg)
            return { content: String(img) }
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
        run: async (msg, args) => {
            return { content: String(args.length) }
        },
        help: {
            info: "Prints the number of arguments given to this command"
        },
        category: CommandCategory.META
    },
    opts: {
        run: async (msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            let disp = ""
            for (let key in opts) {
                disp += `**${key}**: \`${opts[key]}\`\n`
            }
            return { content: disp || "#!N/A" }
        },
        help: {
            info: "Print the opts given"
        },
        category: CommandCategory.META
    },
    echo: {
        run: async (msg: Message, args: ArgumentList) => {
            let opts
            [opts, args] = getOpts(args)
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
                    embed.setImage(img)
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
                    content: "cannot send nothing"
                }
            }
            if (wait) {
                await new Promise((res) => setTimeout(res, wait * 1000))
            }
            let rv: CommandReturn = { delete: !(opts["D"] || opts['no-del']), deleteFiles: false }
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
        run: async (msg, args) => {
            let opts: Opts
            [opts, args] = getOpts(args)
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
            let m = await msg.channel.send({ components: [row], content: content })
            if (opts['say'])
                BUTTONS[msg.author.id] = String(opts['say'])
            else BUTTONS[msg.author.id] = text
            if (!isNaN(delAfter)) {
                setTimeout(async () => await m.delete(), delAfter * 1000)
            }
            return { noSend: true }
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
        run: async (msg, args) => {
            let id = args[0]
            if (!id) {
                return { content: "no id given" }
            }
            let str = ""
            for (let key in POLLS[`poll:${id}`]) {
                str += `${key}: ${POLLS[`poll:${id}`]["votes"][key].length}\n`
            }
            return { content: str }
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
        run: async (msg, args) => {
            let actionRow = new MessageActionRow()
            let opts: Opts;
            [opts, args] = getOpts(args)
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
                return { content: "no options given" }
            }
            let selection = new MessageSelectMenu({ customId: `poll:${id}`, placeholder: "Select one", options: choices })
            actionRow.addComponents(selection)
            POLLS[`poll:${id}`] = { title: String(opts['title'] || "") || "Select one", votes: {} }
            await msg.channel.send({ components: [actionRow], content: `**${String(opts['title'] || "") || "Select one"}**\npoll id: ${id}` })
            return { noSend: true }
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
        run: async (msg, args) => {
            let opts: Opts
            [opts, args] = getOpts(args)
            let link = args[0]
            if (!link) {
                link = getImgFromMsgAndOpts(opts, msg)
            }
            if (!link)
                return { content: "no link given" }
            try {
                await client.user?.setAvatar(link)
            }
            catch (err) {
                console.log(err)
                return { content: "could not set pfp" }
            }
            return { content: 'set pfp', delete: Boolean(opts['d'] || opts['delete']) }
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
                content: format(fmt, { "d": `${days}`, "h": `${hours}`, "m": `${minutes}`, "s": `${seconds}`, "M": `${millis}` })
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
            if (opts["round"]) {
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
        run: async (msg, args) => {
            let users = []
            for (let arg of args) {
                users.push(await fetchUser(msg.guild, arg))
            }
            if (users.length == 0) {
                users.push(await fetchUser(msg.guild, msg.author.id))
            }
            let embeds = []
            for (let user of users) {
                let roles = user._roles
                if (!roles) {
                    return {
                        contnet: "Could not find roles"
                    }
                }
                let embed = new MessageEmbed()
                embed.setTitle(`Roles for: ${user.user.username}`)
                let roleList = []
                for (let role of roles) {
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
        run: async (msg, args) => {
            let file = args[0]
            if (!file) {
                return { content: "No file specified" }
            }
            fs.writeFileSync(`./command-results/${file}`, "")
            return { content: `${file} created` }
        },
        permCheck: m => ADMINS.includes(m.author.id),
        category: CommandCategory.META
    },
    "rt": {
        run: async (msg, args) => {
            let opts: Opts;
            [opts, args] = getOpts(args)
            if (opts['t']) {
                msg.channel.send("SEND A MESSAGE NOWWWWWWWWWWWWWWWWWWWWWWWWW").then(m => {
                    try {
                        let collector = msg.channel.createMessageCollector({ filter: m => m.author.id == msg.author.id, time: 3000 })
                        let start = Date.now()
                        collector.on("collect", async (m) => {
                            await msg.channel.send(`${Date.now() - start}ms`)
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
                BUTTONS[msg.author.id] = () => {
                    return `${Date.now() - start}ms`
                }
                await msg.channel.send({ components: [row] })
            }
            return { noSend: true }
        },
        help: {
            info: "Gets your truely 100% accurate reaction time"
        },
        category: CommandCategory.FUN
    },
    "search-cmd-file": {
        run: async (msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            let file = args[0]
            let search = args.slice(1).join(" ")
            if (!file) {
                return { content: "No file specified" }
            }
            if (file.match(/\./)) {
                return { content: "<:Watching1:697677860336304178>" }
            }
            if (!fs.existsSync(`./command-results/${file}`)) {
                return {
                    content: "file does not exist"
                }
            }
            const text = fs.readFileSync(`./command-results/${file}`, "utf-8")
            let lines = text.split("\n")
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
                if (line.match(search)) {
                    final.push(`${i}: ${line}`)
                }
            }
            return { content: final.join("\n") }
        }, category: CommandCategory.UTIL
    },
    "rand-line": {
        run: async (msg, args) => {
            let file = args[0]
            if (!file) {
                return { content: "No file specified" }
            }
            if (file.match(/\./)) {
                return { content: "<:Watching1:697677860336304178>" }
            }
            if (!fs.existsSync(`./command-results/${file}`)) {
                return {
                    content: "file does not exist"
                }
            }
            const text = fs.readFileSync(`./command-results/${file}`, "utf-8")
            const lines = text.split("\n").map((str) => str.split(": ").slice(1).join(": ").replace(/;END$/, "")).filter((v) => v)
            return { content: lines[Math.floor(Math.random() * lines.length)] }
        },
        help: {
            info: "Gets a random line from a file"
        },
        category: CommandCategory.META

    },
    todo: {
        run: async (msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            if (opts['list']) {
                let data = fs.readFileSync('./command-results/todo', "utf-8").split(";END").map((v) => `* ${v.split(" ").slice(1).join(" ")}`)
                let strdata = data.slice(0, data.length - 1).join("\n")
                return { content: strdata }
            }
            let item = args.join(" ")
            return await commands['add'].run(msg, ["todo", item])
        },
        category: CommandCategory.META

    },
    "todo-list": {
        run: async (msg, args) => {
            let data = fs.readFileSync('./command-results/todo', "utf-8").split(";END").map((v) => `* ${v.split(" ").slice(1).join(" ")}`)
            let strdata = data.slice(0, data.length - 1).join("\n")
            return { content: strdata }
        },
        category: CommandCategory.META

    },
    nick: {
        //@ts-ignore
        run: async (msg, args) => {
            let opts: Opts;
            [opts, args] = getOpts(args)
            try {
                (await msg.guild?.members.fetch(client.user?.id || ""))?.setNickname(args.join(" "))
            }
            catch (err) {
                return { content: "Could not set name" }
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
        run: async (msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            let requestPlayers = args.join(" ").trim().split("|").map(v => v.trim()).filter(v => v.trim())
            let players: (GuildMember)[] = [await fetchUser(msg.guild, msg.author.id)]
            for (let player of requestPlayers) {
                let p = await fetchUser(msg.guild, player)
                if (!p) {
                    await msg.channel.send(`${player} not found`)
                    continue
                }
                players.push(p)
            }
            if (players.length == 1) {
                return { content: "No one to play with :(" }
            }
            let max = parseInt(String(opts["max"])) || 9
            if (max > 1000) {
                await msg.channel.send("The maximum is to high, defaulting to 1000")
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
                fetchUser(msg.guild, playerIds[i % playerIds.length]).then((u: any) => {
                    if (players.map(v => v.id).indexOf(going) < 0) {
                        going = turns.next().value
                        return
                    }
                    if (forcedDraw) {
                        msg.channel.send(`<@${going}> is forced to draw ${forcedDraw} cards`)
                        for (let i = 0; i < forcedDraw; i++) {
                            let rv = playerData[going].draw(deck)
                            if (!rv) {
                                msg.channel.send("Deck empty, shuffling pile into deck")
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
                        msg.channel.send({ content: `${u}, it's your turn\nstack:\n${pile.cards[pile.cards.length - 1].display()}` })
                    }
                    else {
                        msg.channel.send({ content: `${u}, it's your turn` })
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
                    return { content: `Couldnt listen in ${player}'s dms` }
                }
                collection.on("collect", async (m) => {
                    if (m.content.toLowerCase() == "stop") {
                        players = players.filter(v => v.id != m.author.id)
                        if (players.length == 0) {
                            await msg.channel.send("game over")
                        }
                        collection?.stop()
                        if (m.author.id == client.user?.id) return
                        await msg.channel.send(`${m.author} quit`)
                        going = turns.next().value
                        return
                    }
                    if (playerData[player.id].cards.length <= 0) {
                        await msg.channel.send(`${player} wins!!\n${cardsPlayed} cards were played\n${cardsDrawn} cards were drawn`)
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
                            await msg.channel.send("**stack was shuffled**")
                            pile.add(selectedCard)
                            pile.shuffle()
                            going = turns.next().value
                        }
                        else {
                            await m.channel.send("You cannot play that card")
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
                                let randomPlayer = tempPlayerData[Math.floor(Math.random() * tempPlayerData.length)]
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
                            let randomPlayer = players.filter(v => v.id != player.id)[Math.floor(Math.random() * (players.length - 1))].id
                            await msg.channel.send(`**${player} played the ${selectedCard.color} -1 card, and <@${randomPlayer}> lost a card**`)
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
                                await msg.channel.send("User picked incorrect color, using red")
                                selectedCard.color = "red"
                            }
                            else if (["red", "yellow", "green", "blue"].includes(colorM.content.toLowerCase().trim())) {
                                selectedCard.color = colorM.content
                            }
                            else {
                                await msg.channel.send("User picked incorrect color, using red")
                                selectedCard.color = "red"
                            }
                        }
                        catch (err) {
                            console.log(err)
                            await msg.channel.send("Something went wrong, defaulting to red")
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
                                await msg.channel.send("User picked incorrect color, using red")
                                selectedCard.color = "red"
                            }
                            else if (["red", "yellow", "green", "blue"].includes(colorM.content.toLowerCase().trim())) {
                                selectedCard.color = colorM.content
                            }
                            else {
                                await msg.channel.send("User picked incorrect color, using red")
                                selectedCard.color = "red"
                            }
                        }
                        catch (err) {
                            console.log(err)
                            await msg.channel.send("Something went wrong, defaulting to red")
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
                            await msg.channel.send(`<@${skipped}> was skipped`)
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
                    await msg.channel.send(`**${player.nickname || player.user.username} has ${playerData[player.id].cards.length} cards**`)
                    if (playerData[player.id].cards.length <= 0) {
                        await msg.channel.send(`${player} wins!!\n${cardsPlayed} cards were played\n${cardsDrawn} cards were drawn`)
                        for (let player of players) {
                            await player.send("STOP")
                        }
                        collection?.stop()
                    }
                })
            }
            return { content: "Starting game" }
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
        run: async (msg, args) => {
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
                        await msg.channel.send("No results")
                        return
                    }
                    homeTeam = homeTeam.match(/div class=".*?">(.*?)<\//)[1].replace(/<(?:span|div) class=".*?">/, "")
                    awayTeam = awayTeam.match(/div class=".*?">(.*?)<\//)[1].replace(/<(?:span|div) class=".*?">/, "")
                    let homeScore, awayScore
                    try {
                        [homeScore, awayScore] = html.match(/<div class="BNeawe deIvCb AP7Wnd">(\d*?)<\/div>/g)
                    }
                    catch (err) {
                        await msg.channel.send("Failed to get data")
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
                    await msg.channel.send({ embeds: [embed] })
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
        run: async (msg, args) => {
            let opts: Opts
            [opts, args] = getOpts(args)
            let min = parseInt(opts["min"] as string) || 5
            let max = parseInt(opts["max"] as string) || 5
            if (min > max) {
                max = min
            }
            let words = fs.readFileSync(`./command-results/wordle`, "utf-8").split(";END").map(v => v.split(" ").slice(1).join(" ").trim()).filter(v => v.length <= max && v.length >= min ? true : false)
            if (words.length == 0) {
                return { content: "no words found" }
            }
            let word = words[Math.floor(Math.random() * words.length)].toLowerCase()
            let guesses = []
            let collector = msg.channel.createMessageCollector({ filter: m => m.author.id == msg.author.id && (m.content.length >= min && m.content.length <= max) || m.content == "STOP" })
            let guessCount = parseInt(opts["lives"] as string) || 6
            let display: string[] = []
            await msg.channel.send("key: **correct**, *wrong place*, `wrong`")
            await msg.channel.send(`The word is ${word.length} characters long`)
            for (let i = 0; i < guessCount; i++) {
                display.push(mulStr("⬛ ", word.length))
            }
            await msg.channel.send(display.join("\n"))
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
                    await msg.channel.send("stopped")
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
                await msg.channel.send(display.join("\n"))
                if (m.content == word) {
                    await msg.channel.send(`You win`)
                    collector.stop()
                    return
                }
                if (guessCount == 0) {
                    await msg.channel.send(`You lose, it was ${word}`)
                    collector.stop()
                    return
                }
            })
            return { content: "starting wordle" }
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
        run: async (msg, args) => {
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
                return { content: "Could not dm you" }
            }
            let points = 0
            let losingStreak = 0
            let winningStreak = 0
            let participants: {[key: string]: number} = {}
            async function game(wordstr: string) {
                let wordLength = strlen(wordstr)
                if (!caseSensitive) {
                    wordstr = wordstr.toLowerCase()
                }
                let guessed = ""
                let disp = ""
                let lives = parseInt(opts["lives"] as string) || 10
                let startingLives = lives
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
                    await handleSending(msg, { content: `${disp}\n${users.join(", ")}, guess` })
                }
                catch (err) {
                    return { content: "2K char limit reached" }
                }
                let collection = msg.channel.createMessageCollector({ filter: m => (strlen(m.content) < 2 || m.content == wordstr || (m.content[0] == 'e' && strlen(m.content) > 2 && strlen(m.content) < 5) || ["<enter>", "STOP", "\\n"].includes(m.content)) && (users.map(v => v.id).includes(m.author.id) || everyone), idle: 40000 })
                let gameIsGoing = true
                collection.on("collect", async (m) => {
                    if(!gameIsGoing) return
                    if (m.content == '\\n' || m.content == "<enter>")
                        m.content = '\n'
                    if (m.content == "STOP") {
                        await msg.channel.send("STOPPED")
                        collection.stop()
                        gameIsGoing = false
                        return
                    }
                    if (!caseSensitive) {
                        m.content = m.content.toLowerCase()
                    }
                    if(participants[m.author.id] === undefined && !m.author.bot){
                        participants[m.author.id] = .5
                    }
                    if ([...guessed].indexOf(m.content) > -1) {
                        await msg.channel.send(`You've already guessed ${m.content}`)
                        return
                    }
                    else if (m.content == wordstr) {
                        let money = "Earnings\n"
                        if(participants[msg.author.id]){
                            delete participants[msg.author.id]
                        }
                        if(Object.keys(participants).length >= 1){
                            let uniqueCharacters = ""
                            for(let letter of [...wordstr]){
                                if(!uniqueCharacters.includes(letter)){
                                    uniqueCharacters += letter
                                }
                            }
                            if(startingLives <= uniqueCharacters.length * 10){
                                if(ECONOMY()[msg.author.id] !== undefined){
                                    money += `<@${msg.author.id}>: ${lives / uniqueCharacters.length}\n`
                                    addMoney(msg.author.id, lives / uniqueCharacters.length)
                                }
                                for(let participant in participants){
                                    if(participant === msg.author.id) continue
                                    if(ECONOMY()[participant] !== undefined){
                                        money += `<@${participant}>: ${lives / uniqueCharacters.length}\n`
                                        addMoney(participant, lives / uniqueCharacters.length)
                                    }
                                }
                                await handleSending(msg, {content: money})
                            }
                            else{
                                await handleSending(msg, {content: "There were too many lives to earn money"})
                            }
                        }
                        await handleSending(msg, { content: `YOU WIN, it was\n${wordstr}` })
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
                        let money = "Earnigns\n"
                        if(ECONOMY()[msg.author.id] !== undefined){
                            let amount = -(ECONOMY()[msg.author.id].money * .01)
                            money += `<@${msg.author.id}>: ${amount}\n`
                            addMoney(msg.author.id, amount)
                        }
                        if(participants[msg.author.id]){
                            delete participants[msg.author.id]
                        }
                        for(let participant in participants){
                            if(ECONOMY()[participant] !== undefined){
                                let amount = -(ECONOMY()[participant].money * .01)
                                money += `<@${participant}>: ${amount}\n`
                                addMoney(participant, amount)
                            }
                        }
                        await handleSending(msg, {content: money})
                        await handleSending(msg, { content: `You lost, the word was:\n${wordstr}`, allowedMentions: { parse: [] } })
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
                        let money = "Earnings\n"
                        let amount = 0
                        if(wordLength < 5){
                            amount = 0.005
                        }
                        if(wordLength < 10){
                            amount = 0.01
                        }
                        if(wordLength < 20){
                            amount = 0.015
                        }
                        if(wordLength >= 20){
                            amount = 0.02
                        }
                        if(participants[msg.author.id]){
                            delete participants[msg.author.id]
                        }
                        if(Object.keys(participants).length >= 1){
                            let uniqueCharacters = ""
                            for(let letter of [...wordstr]){
                                if(!uniqueCharacters.includes(letter)){
                                    uniqueCharacters += letter
                                }
                            }
                            if(startingLives <= uniqueCharacters.length * 10){
                                if(ECONOMY()[msg.author.id] !== undefined){
                                    money += `<@${msg.author.id}>: ${lives / uniqueCharacters.length}\n`
                                    addMoney(msg.author.id, lives / uniqueCharacters.length)
                                }
                                for(let participant in participants){
                                    if(participant === msg.author.id) continue
                                    if(ECONOMY()[participant] !== undefined){
                                        money += `<@${participant}>: ${lives / uniqueCharacters.length}\n`
                                        addMoney(participant, lives / uniqueCharacters.length)
                                    }
                                }
                                await handleSending(msg, {content: money})
                            }
                            else{
                                await handleSending(msg, {content: "There were too many lives to earn money"})
                            }
                        }
                        await handleSending(msg, { content: `YOU WIN, it was\n${wordstr}\nscore: ${points}`, allowedMentions: { parse: [] } })
                        collection.stop()
                        gameIsGoing = false
                        return
                    }
                    await handleSending(msg, { content: `(score: ${points})\n${disp}\n${users.join(", ")}, guess (${lives} lives left)` })
                })
            }
            if (opts["random"]) {
                let channels = (await msg.guild?.channels.fetch())?.toJSON()
                if (!channels) {
                    return { content: "no channels found" }
                }
                let channel = channels[Math.floor(Math.random() * channels.length)]
                while (!channel.isText())
                    channel = channels[Math.floor(Math.random() * channels.length)]
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
        run: async (msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            if (opts['d'] && msg.deletable) await msg.delete()
            let edits = args.join(" ").split("|")
            let message
            try {
                message = await msg.channel.send(edits[0])
            }
            catch (err) {
                return { content: "message too big" }
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
                        message = await msg.channel.send(edit.slice(1))
                    }
                    catch (err) {
                        return { content: "message too big" }
                    }
                    continue
                }
                try {
                    await message.edit({ content: edit })
                }
                catch (err) {
                    if (!message.deletable) {
                        return { noSend: true }
                    }
                    await msg.channel.send(`Could not edit message with: ${edit}`)
                }
                await new Promise(res => setTimeout(res, Math.random() * 800 + 200))
                lastEdit = message.content
            }
            return { noSend: true }
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
        run: async (msg, args) => {
            let [user1, user2] = args.join(" ").split("|")
            user1 = user1.trim()
            user2 = user2.trim()
            if (!user1) {
                return { content: "No users given" }
            }
            if (!user2) {
                return { content: "2 users must be given" }
            }
            let realUser1: GuildMember = await fetchUser(msg.guild, user1)
            if (!realUser1) {
                return { content: `${user1} not found` }
            }
            let realUser2: GuildMember = await fetchUser(msg.guild, user2)
            if (!realUser2) {
                return { content: `${user2} not found` }
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
            return { embeds: [embed] }
        },
        category: CommandCategory.UTIL
    },
    "most-roles": {
        run: async (msg, args) => {
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
            let rv: CommandReturn = { allowedMentions: { parse: [] } }
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
        run: async (msg, args) => {
            let role = args.join(" ")
            if (!role) {
                return { content: "No role given" }
            }
            await msg.guild?.members.fetch()
            let roleRef = await msg.guild?.roles.fetch()
            if (!roleRef) {
                return { content: "no roles found somehow" }
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
                    content: "Could not find role"
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
                return { content: "No one" }
            }
            if (embed.fields.length < 1) {
                embed.addField(`members: ${i}`, memberTexts[i])
            }
            embed.addField("Member count", String(memberCount))
            return { embeds: [embed] }
        },
        category: CommandCategory.UTIL
    },
    img: {
        run: async (msg: Message, args: ArgumentList) => {
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
                    content: "Width must be > 0"
                }
            }
            if (height < 0) {
                return {
                    content: "Height must be > 0"
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
        run: async (msg: Message, args: ArgumentList) => {
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
        run: async (msg: Message, args: ArgumentList) => {
            let opts;
            [opts, args] = getOpts(args)
            let color: string = <string>opts['color'] || "white"
            let outline = opts['outline']
            let img = getImgFromMsgAndOpts(opts, msg)
            if (!img) {
                return {
                    content: "no img found"
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
                    msg.channel.send({ files: [{ attachment: fn, name: fn }] }).then(res => {
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
        run: async (msg: Message, args: ArgumentList) => {
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
        run: async (msg: Message, args: ArgumentList) => {
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
        run: async (msg: Message, args: ArgumentList) => {
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
        run: async (msg: Message, args: ArgumentList) => {
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
                ans.push(args[Math.floor(Math.random() * args.length)].trim())
            }
            return {
                content: ans.join(sep) || "```invalid message```"
            }
        },
        category: CommandCategory.FUN
    },
    weather: {
        run: async (msg: Message, args: ArgumentList) => {
            let url = "https://www.wttr.in"
            let town = args.join(" ") || "tokyo"

            https.request(`${url}/${encodeURI(town)}?format=1`, resp => {
                let data = new Stream.Transform()
                resp.on("data", chunk => {
                    data.push(chunk)
                })
                resp.on('end', async () => {
                    //@ts-ignore
                    data = data.read().toString() as string
                    //@ts-ignore
                    let tempData = data.match(/(\S*)\s*[+-](\d+).(C|F)/)
                    let condition, temp, unit
                    try {
                        [condition, temp, unit] = tempData.slice(1, 4)
                    }
                    catch (err) {
                        await msg.channel.send({ content: "Could not find weather :(" })
                        return
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
                    await msg.channel.send({ embeds: [embed] })
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
        run: async (msg: Message, args: ArgumentList) => {
            return commands['filter'].run(msg, [`rotate:${args[0]},${args[1]}`])
        },
        category: CommandCategory.IMAGES
    },
    color: {
        run: async (msg: Message, args: ArgumentList) => {
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
                    return { content: "error making color" }
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
                    return { content: "error making color" }
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
        run: async (msg: Message, args: ArgumentList) => {
            return {
                content: fs.readFileSync("command-perms/blacklists", "utf-8")
            }
        },
        category: CommandCategory.META

    },
    "l-wl": {
        run: async (msg: Message, args: ArgumentList) => {
            return {
                content: fs.readFileSync("command-perms/whitelists", "utf-8")
            }
        },
        category: CommandCategory.META
    },
    ship: {
        run: async (msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            if (args.length < 2) {
                return { content: "2 users must be given", delete: opts['d'] as boolean }
            }
            let [user1Full, user2Full] = args.join(" ").split("|")
            if (!user1Full || !user2Full) {
                return { content: "2 users not given" }
            }
            let user1 = user1Full.slice(0, Math.ceil(user1Full.length / 2))
            let user2 = user2Full.slice(Math.floor(user2Full.length / 2))
            let options = fs.readFileSync(`command-results/ship`, "utf-8").split(";END").map(v => v.split(" ").slice(1).join(" ")).filter(v => v.trim())
            return { content: format(options[Math.floor(Math.random() * options.length)], { "u1": user1Full, "u2": user2Full, "ship": `${user1}${user2}`, "strength": `${Math.floor(Math.random() * 99 + 1)}%` }), delete: opts['d'] as boolean }
        },
        help: {
            info: "Create your favorite fantacies!!!!"
        },
        category: CommandCategory.FUN
    },
    aship: {
        run: async (msg, args) => {
            return await commands['add'].run(msg, ["ship", args.join(" ")])
        },
        help: {
            info: "{u1} is the first user, {u2} is the second user, {ship} is the ship name for the users"
        },
        category: CommandCategory.FUN
    },
    timeit: {
        run: async (msg, args) => {
            msg.content = `${prefix}${args.join(" ").trim()}`
            let start = new Date().getTime()
            await doCmd(msg)
            return { content: `${new Date().getTime() - start} ms` }
        },
        category: CommandCategory.META
    },
    "do": {
        run: async (msg: Message, args: ArgumentList) => {
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
            await msg.channel.send(`starting ${id}`)
            SPAMS[id] = true
            while (SPAMS[id] && times--) {
                msg.content = `${prefix}${format(cmdArgs, { "number": String(totalTimes - times), "rnumber": String(times + 1) })}`
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
        run: async (msg, args) => {
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
            await msg.channel.send(`starting ${id}`)
            SPAMS[id] = true
            let message = await msg.channel.send(sendText)
            while (SPAMS[id] && timesToGo--) {
                if (message.deletable) await message.delete()
                message = await msg.channel.send(sendText)
                await new Promise(res => setTimeout(res, Math.random() * 700 + 200))
            }
            return { content: "done" }
        }, category: CommandCategory.FUN
    },
    spam: {
        run: async (msg: Message, args: ArgumentList) => {
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
            await msg.channel.send(`starting ${id}`)
            SPAMS[id] = true
            while (SPAMS[id] && times--) {
                await msg.channel.send(`${format(send, { "number": String(totalTimes - times), "rnumber": String(times + 1) })}`)
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
        run: async (msg: Message, args: ArgumentList) => {
            if (!Object.keys(SPAMS).length) {
                return { content: "no spams to stop" }
            }
            if (args[0]) {
                if (SPAMS[args[0]]) {
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
            for (let spam in SPAMS) {
                delete SPAMS[spam]
            }
            return {
                content: "stopping all"
            }
        },
        category: CommandCategory.META
    },
    "pollify": {
        run: async (msg, args) => {
            let opts: Opts;
            [opts, args] = getOpts(args)
            if (msg.deletable && opts['d']) await msg.delete()
            let message = await msg.channel.send(args.join(" ") || "poll")
            await message.react("<:Blue_check:608847324269248512>")
            await message.react("<:neutral:716078457880051734>")
            await message.react("❌")
            return { noSend: true }
        }, category: CommandCategory.UTIL,
        help: {
            info: "Idk it pollifies what do you want"
        }
    },
    "udict": {
        run: async (msg, args) => {
            //@ts-ignore
            try {
                let data = await got(`https://www.urbandictionary.com/define.php?term=${args.join("+")}`)
                let text = data.body
                let match = text.match(/(?<=<meta content=")([^"]+)" name="Description"/)
                return { content: match[1] || "Nothing found :(" }
            }
            catch (err) {
                return { content: "An error occured" }
            }
        }, category: CommandCategory.FUN
    },
    "vars": {
        run: async (msg, args) => {
            let rv = "Global Vars:\n"
            for (let v in vars) {
                rv += `${v.replaceAll("_", "\\_")}\n`
            }
            for (let prefix in userVars) {
                rv += `----------------------\n${prefix}:\n`
                for (let v in userVars[prefix]) {
                    rv += `${v.replaceAll("_", "\\_")}\n`
                }
            }
            return { content: rv }
        },
        category: CommandCategory.META
    },

    'stackl': {
        run: async (msg, args) => {
            let opts: Opts;
            [opts, args] = getOpts(args)
            let useStart = true
            if (opts['no-start'] === true) {
                useStart = false
            }
            type stackTypes = number | string | Message | GuildMember | Function | Array<stackTypes> | MessageEmbed
            let stacks: { [key: string]: stackTypes[] } = { __main__: [] }
            let currScopes = ["__main__"]
            let stack = stacks["__main__"]
            let initialArgs: string[] = []
            if (useStart) {
                let curArg;
                while ((curArg = args.shift()) !== "%start") {
                    if (curArg !== undefined)
                        initialArgs.push(curArg)
                    else break
                }
            }
            let argc = stack.length
            let ram: { [key: string]: number | string | Message | GuildMember | Function } = {
                true: 1,
                false: 0,
                NaN: NaN,
                Infinity: Infinity,
                rec: async () => recursionC,
                "random": async (low: number, high: number) => { low ??= 1; high ??= 10; return Math.random() * (high - low) + low },
                "input": async (prompt?: string, useFilter?: boolean | string | number, reqTimeout?: number) => {
                    if (prompt && typeof prompt === 'string') {
                        await msg.channel.send(prompt)
                    }
                    let filter: CollectorFilter<[Message<boolean>]> | undefined = (m: any) => m.author.id === msg.author.id && !m.author.bot
                    if (useFilter === false || useFilter === 0) {
                        filter = m => !m.author.bot
                    }
                    else if (typeof useFilter === 'string') {
                        filter = (m: any) => m.author.id === useFilter && !m.author.bot
                    }
                    let timeout = 30000
                    if (typeof reqTimeout === 'number') {
                        timeout = reqTimeout * 1000
                    }
                    try {
                        let collected = await msg.channel.awaitMessages({ filter: filter, max: 1, time: timeout, errors: ["time"] })
                        let resp = collected.at(0)
                        if (typeof resp === 'undefined') {
                            return 0
                        }
                        return resp
                    }
                    catch (err) {
                        return 0
                    }
                }
            }
            let stacklArgs = []
            let text = args.join(" ")
            let word = ""
            let inStr = false
            for (let i = 0; i < text.length; i++) {
                if (text[i] == '"') {
                    word += '"'
                    inStr = !inStr
                    continue
                }
                if (text[i].match(/\s/) && !inStr) {
                    stacklArgs.push(word)
                    word = ""
                    continue
                }
                word += text[i]
            }
            if (word)
                stacklArgs.push(word)
            args = stacklArgs.filter(a => a ? true : false)
            let recursionC = 0

            async function parseArg(arg: string, argNo: number, argCount: number, args: string[], stack: stackTypes[]): Promise<any> {
                switch (arg) {
                    //vars
                    case "$stacksize": {
                        stack.push(stack.length)
                        break
                    }
                    case "$bottom": {
                        if (stack[0] === undefined) {
                            return { err: true, content: "Cannot access the bottom of empty stack" }
                        }
                        stack.push(stack[0])
                        break
                    }
                    case "$argc": {
                        stack.push(argc)
                        break
                    }
                    case "$carson": {
                        stack.push("The all legendary Carson Williams")
                        break
                    }
                    case "$argv": {
                        stack.push(initialArgs)
                        break
                    }

                    case "%argv": {
                        let index = stack.pop()
                        if (typeof index !== 'number') {
                            return { err: true, content: `argv index must be a number` }
                        }
                        if (index >= initialArgs.length) {
                            return { err: true, content: `Argv index out: ${index} of bounds` }
                        }
                        stack.push(initialArgs[index])
                        break
                    }

                    //operators
                    case "++": {
                        let val = stack.pop()
                        if (typeof val !== 'number') {
                            return { content: `${stack[stack.length - 1]} is not a number`, err: true }
                        }
                        //@ts-ignore
                        let ans = val + 1
                        stack.push(ans)
                        break;
                    }
                    case "--": {
                        let val = stack.pop()
                        switch (typeof val) {
                            case 'number': {
                                let ans = val - 1
                                stack.push(ans)
                                break
                            }
                            case 'object': {
                                if (Array.isArray(val)) {
                                    val.pop()
                                    stack.push(val)
                                    break
                                }
                            }
                            default: {
                                return { content: `${typeof val} -- is not supported`, err: true }
                            }
                        }
                        break
                    }
                    case "+": {
                        let arg2 = stack.pop()
                        let arg1 = stack.pop()
                        switch (typeof arg1) {
                            case "number": {
                                if (typeof arg2 !== 'number') {
                                    return { content: `${arg2} is not a number`, err: true }
                                }
                                stack.push(arg1 + arg2)
                                break
                            }
                            case "string": {
                                if (typeof arg2 !== 'string') {
                                    return { content: `${arg2} is not a string`, err: true }
                                }
                                stack.push(arg1 + arg2)
                                break
                            }
                            default: {
                                return { err: true, content: `type of ${arg1} is unknown` }
                            }
                        }
                        break
                    }
                    case "-": {
                        let arg2 = stack.pop()
                        let arg1 = stack.pop()
                        switch (typeof arg1) {
                            case "number": {
                                if (typeof arg2 !== 'number') {
                                    return { content: `${arg2} is not a number`, err: true }
                                }
                                stack.push(arg1 - arg2)
                                break
                            }
                            case "string": {
                                if (typeof arg2 !== 'string') {
                                    return { content: `${arg2} is not a string`, err: true }
                                }
                                stack.push(arg1.replaceAll(arg2, ""))
                                break
                            }
                            default: {
                                return { err: true, content: `type of ${arg1} is unknown` }
                            }
                        }
                        break
                    }
                    case "/": {
                        let arg2 = stack.pop()
                        let arg1 = stack.pop()
                        if (typeof arg1 !== 'number') {
                            return { err: true, content: `${arg1} is not a number` }
                        }
                        if (typeof arg2 !== 'number') {
                            return { err: true, content: `${arg2} is not a number` }
                        }
                        stack.push(arg1 / arg2)
                        break
                    }
                    case "*": {
                        let arg2 = stack.pop()
                        let arg1 = stack.pop()
                        switch (typeof arg1) {
                            case 'number': {
                                if (typeof arg2 !== 'number') {
                                    return { err: true, content: `${arg2} is not a number` }
                                }
                                stack.push(arg1 * arg2)
                                break
                            }
                            case 'string': {
                                if (typeof arg2 !== 'number') {
                                    return { err: true, content: `${arg2} is not a number` }
                                }
                                let ans = ""
                                for (let i = 0; i < arg2; i++) {
                                    ans += arg1
                                }
                                stack.push(ans)
                                break
                            }
                        }
                        break
                    }
                    case "%s": {
                        let arg2 = stack.pop()
                        let arg1 = stack.pop()
                        if (typeof arg2 == "string") {
                            while ((arg2 = arg2.replace(/%(s|d|.l|f)/, (_match, type) => {
                                if (type === "s") {
                                    return String(arg1)
                                }
                                else if (type === "d") {
                                    return String(parseInt(String(arg1)))
                                }
                                else if (type === "f") {
                                    return String(parseFloat(String(arg1)))
                                }
                                else if (type[1] === 'l') {
                                    if (Array.isArray(arg1)) {
                                        return arg1.join(type[0])
                                    }
                                    return `%${type}`
                                }
                                return ""
                            })).match(/%(s|d)/)) {
                                arg1 = stack.pop()
                                if (typeof arg1 === "undefined") {
                                    return { content: `ran out of replacements for %s`, err: true }
                                }
                            }
                            stack.push(arg2)
                        }
                        else {
                            return { content: `${arg2} is not a string`, err: true }
                        }
                        break
                    }
                    case "%": {
                        let arg2 = stack.pop()
                        let arg1 = stack.pop()
                        switch (typeof arg1) {
                            case "number": {
                                if (typeof arg2 !== 'number') {
                                    return { content: `${arg2} is not a number`, err: true }
                                }
                                stack.push(arg1 - arg2)
                                break
                            }
                            default: {
                                return { err: true, content: `${arg} is not a number` }
                            }
                        }
                        break
                    }
                    case ">": {
                        let arg2 = stack.pop()
                        let arg1 = stack.pop()
                        switch (typeof arg1) {
                            case "number": {
                                if (typeof arg2 !== 'number') {
                                    return { content: `${arg2} is not a number`, err: true }
                                }
                                stack.push(arg1 > arg2 ? 1 : 0)
                                break
                            }
                            case "string": {
                                if (typeof arg2 !== 'string') {
                                    return { content: `${arg2} is not a string`, err: true }
                                }
                                stack.push(arg1.length > arg2.length ? 1 : 0)
                                break
                            }
                            default: {
                                return { err: true, content: `type of ${arg1} is unknown` }
                            }
                        }
                        break
                    }
                    case "<": {
                        let arg2 = stack.pop()
                        let arg1 = stack.pop()
                        switch (typeof arg1) {
                            case "number": {
                                if (typeof arg2 !== 'number') {
                                    return { content: `${arg2} is not a number`, err: true }
                                }
                                stack.push(arg1 < arg2 ? 1 : 0)
                                break
                            }
                            case "string": {
                                if (typeof arg2 !== 'string') {
                                    return { content: `${arg2} is not a string`, err: true }
                                }
                                stack.push(arg1.length < arg2.length ? 1 : 0)
                                break
                            }
                            default: {
                                return { err: true, content: `type of ${arg1} is unknown` }
                            }
                        }
                        break
                    }
                    case "==": {
                        let ans = stack.pop() == stack.pop() ? true : false
                        stack.push(ans ? 1 : 0)
                        break
                    }

                    //logic
                    case "%or": {
                        let arg1 = stack.pop()
                        let arg2 = stack.pop()
                        if (typeof arg1 !== 'number') {
                            return { err: true, content: `${arg1} is not a boolean` }
                        }
                        if (typeof arg2 !== 'number') {
                            return { err: true, content: `${arg2} is not a boolean` }
                        }
                        if (arg1 === 1 || arg2 === 1) {
                            stack.push(1)
                        }
                        else {
                            stack.push(0)
                        }
                        break;
                    }
                    case "%and": {
                        let arg1 = stack.pop()
                        let arg2 = stack.pop()
                        if (typeof arg1 !== 'number') {
                            return { err: true, content: `${arg1} is not a boolean` }
                        }
                        if (typeof arg2 !== 'number') {
                            return { err: true, content: `${arg2} is not a boolean` }
                        }
                        if (arg1 === 1 && arg2 === 1) {
                            stack.push(1)
                        }
                        else {
                            stack.push(0)
                        }
                        break
                    }
                    case "%xor": {
                        let arg1 = stack.pop()
                        let arg2 = stack.pop()
                        if (typeof arg1 !== 'number') {
                            return { err: true, content: `${arg1} is not a boolean` }
                        }
                        if (typeof arg2 !== 'number') {
                            return { err: true, content: `${arg2} is not a boolean` }
                        }
                        if (arg1 === arg2 && arg1 === 1) {
                            stack.push(0)
                        }
                        else if ((arg1 === 1 && arg2 === 0) || (arg1 === 0 && arg2 === 1)) {
                            stack.push(1)
                        }
                        else {
                            stack.push(0)
                        }
                        break
                    }
                    case "%nand": {
                        let arg1 = stack.pop()
                        let arg2 = stack.pop()
                        if (typeof arg1 !== 'number') {
                            return { err: true, content: `${arg1} is not a boolean` }
                        }
                        if (typeof arg2 !== 'number') {
                            return { err: true, content: `${arg2} is not a boolean` }
                        }
                        if (arg1 !== 1 && arg2 !== 1) {
                            stack.push(1)
                        }
                        else {
                            stack.push(0)
                        }
                        break
                    }
                    case "!": {
                        let arg1 = stack.pop()
                        if (typeof arg1 !== 'number') {
                            return { err: true, content: `${arg1} is not a boolean` }
                        }
                        stack.push(arg1 === 1 ? 0 : 1)
                        break
                    }

                    //stack manipulation
                    case "%istack": {
                        let index = stack.pop()
                        if (typeof index !== "number") {
                            return { err: true, content: `Cannot index stack with non-number: ${index}` }
                        }
                        if (index >= stack.length) {
                            return { err: true, content: `Index greater than stack size` }
                        }
                        stack.push(stack[index])
                        break
                    }
                    case "%cpy": {
                        let itemToCopy = stack.pop()
                        if (typeof itemToCopy === 'undefined') {
                            return { err: true, content: `Cannot copy undefined` }
                        }
                        stack.push(itemToCopy)
                        stack.push(itemToCopy)
                        break
                    }
                    case "%cpystack": {
                        stack.push(...stack)
                        break
                    }
                    case "%swp": {
                        let last = stack.pop()
                        let secondLast = stack.pop()
                        if (last === undefined) {
                            return { err: true, content: `The top of the stack is undefined` }
                        }
                        if (secondLast === undefined) {
                            return { err: true, content: "The 2nd top itemf of the stack is undefined" }
                        }
                        stack.push(last)
                        stack.push(secondLast)
                        break
                    }
                    case "%rstack": {
                        stack = stack.reverse()
                        break
                    }
                    case "%pop": {
                        stack.pop()
                        break
                    }

                    //functions
                    case "%call": {
                        let fnArgC = stack.pop()
                        if (typeof fnArgC !== 'number') {
                            return { err: true, content: `${fnArgC} is not a number` }
                        }
                        let fnArgs = []
                        for (let i = 0; i < fnArgC; i++) {
                            let item = stack.pop()
                            if (item === undefined) {
                                return { err: true, content: `Argument: ${i} is undefined` }
                            }
                            fnArgs.push(item)
                        }
                        //otherwise you'd have to put the args in reverse order
                        fnArgs = fnArgs.reverse()
                        let f = stack.pop()
                        if (typeof f !== 'function') {
                            return { err: true, content: `${f} is not a function` }
                        }
                        recursionC++
                        if (recursionC > 1000) {
                            recursionC = 0
                            return { err: true, content: "Recursion limit reeached" }
                        }
                        let resp = await f(...fnArgs)
                        recursionC--
                        if (resp?.err) {
                            return resp
                        }
                        else if (resp?.ret) {
                            for (let item of resp?.stack) {
                                stack.push(item)
                            }
                            return { ret: true, stack: stack }
                        }
                        else if (resp?.stack) {
                            for (let arg of resp.stack) {
                                stack.push(arg)
                            }
                        }
                        else stack.push(resp)
                        break
                    }
                    case "%return": {
                        return { ret: true, stack: stack }
                    }
                    case "%function": {
                        let name = args[argNo + 1]
                        if (name === undefined || name === null) {
                            return { err: true, content: `${name} is not a valid function name` }
                        }
                        let code: any = []
                        let chgI = 1
                        for (let i = argNo + 2; i < argCount; i++) {
                            chgI++
                            if (args[i] == '%functionend') {
                                break
                            }
                            code.push(args[i])
                        }
                        ram[name] = async (...args: any[]) => {
                            let stack = args
                            for (let i = 0; i < code.length; i++) {
                                let rv = await parseArg(code[i], i, code.length, code, stack)
                                if (rv?.end) return { end: true }
                                if (rv?.chgI)
                                    i += parseInt(rv.chgI)
                                if (rv?.err) {
                                    return { chgI: i - argNo, ...rv }
                                }

                            }
                            return { stack: stack }
                        }
                        return { chgI: chgI }
                    }

                    //misc
                    case "%json": {
                        let value = stack.pop()
                        stack.push(JSON.stringify(value))
                        break
                    }
                    case "%obj": {
                        let value = stack.pop()
                        if (value === undefined) {
                            return { err: true, content: "Cannot convert undefined to an object" }
                        }
                        if (typeof value !== 'string') {
                            value = JSON.stringify(value)
                        }
                        stack.push(JSON.parse(value))
                        break
                    }
                    case "%isnumeric": {
                        let val = stack.pop()
                        if (typeof val === 'number') {
                            stack.push(1)
                        }
                        else if (typeof val === 'string' && val.match(/^-?\d+(\.\d+)?$/)) {
                            stack.push(1)
                        }
                        else {
                            stack.push(0)
                        }
                        break
                    }
                    case "%time": {
                        stack.push(Date.now())
                        break
                    }
                    case "%sleep": {
                        let amount = stack.pop()
                        if (typeof amount !== 'number') {
                            return { err: true, content: "Time to sleep is NaN" }
                        }
                        await new Promise(res => setTimeout(res, amount as number))
                        break
                    }


                    //vars
                    case "%stack": {
                        let scopeName = args[argNo + 1]
                        if (typeof scopeName !== 'string') {
                            return { err: true, content: "Scope name must be a string" }
                        }
                        if (stacks[scopeName] !== undefined) {
                            return { err: true, content: `Scope name: ${scopeName} already exists` }
                        }
                        stacks[scopeName] = []
                        currScopes.push(scopeName)
                        return { chgI: 1 }
                    }
                    case "%stackend": {
                        let scopeName = args[argNo + 1]
                        if (typeof scopeName !== 'string') {
                            return { err: true, content: "Scope name must be a string" }
                        }
                        if (scopeName === '__main__') {
                            return { end: true }
                        }
                        if (currScopes[currScopes.length - 1] !== scopeName) {
                            return { err: true, content: `Scope name: ${scopeName} is not the newest scope` }
                        }
                        stacks[scopeName] = []
                        currScopes.pop()
                        return { chgI: 1 }
                    }
                    case "%saveas": {
                        stack.push("%saveas")
                        break
                    }
                    case "%vexists": {
                        let varName = stack.pop()
                        if (typeof varName !== 'string') {
                            return { err: true, content: `${varName} is not a valid variable name` }
                        }
                        if (vars[varName]) {
                            stack.push(1)
                        }
                        else {
                            stack.push(0)
                        }
                        break
                    }
                    case "%uvexists": {
                        let varName = stack.pop()
                        if (typeof varName !== 'string') {
                            return { err: true, content: `${varName} is not a valid variable name` }
                        }
                        if (userVars[msg.author.id]?.[varName]) {
                            stack.push(1)
                        }
                        else {
                            stack.push(0)
                        }
                        break
                    }
                    case "%lvar": {
                        stack.push("%lvar")
                        break
                    }
                    case "%gvar": {
                        let name = stack.pop()
                        if (typeof name !== 'string') {
                            return { err: true, content: `${name} is not a valid variable name` }
                        }
                        if (vars[name]) {
                            stack.push(vars[name](msg))
                        }
                        else {
                            return { err: true, content: `${name} is not defined` }
                        }
                        break
                    }
                    case "%sram": {
                        stack.push("%sram")
                        break
                    }
                    case "%gexists": {
                        let name = stack.pop()
                        if (typeof name !== 'string') {
                            return { err: true, content: `${name} is not a valid variable name` }
                        }
                        if (ram[name] !== undefined) {
                            stack.push(1)
                        }
                        else {
                            stack.push(0)
                        }
                        break

                    }
                    case "%gram": {
                        let name = stack.pop()
                        if (typeof name !== 'string') {
                            return { err: true, content: `${name} is not a valid variable name` }
                        }
                        if (ram[name]) {
                            stack.push(ram[name])
                        }
                        else {
                            return { err: true, content: `${name} is not defined` }
                        }
                        break
                    }
                    case "%lram": {
                        stack.push('%lram')
                        break
                    }

                    //message manipulation
                    case "%send": {
                        let ans = stack.pop()
                        if (ans == undefined || ans == null) {
                            return { content: "Nothing to send", err: true }
                        }
                        stack.push(await msg.channel.send(String(ans)))
                        break
                    }
                    case "%edit": {
                        let newText = stack.pop()
                        let m = stack.pop()
                        if (!(m instanceof Message)) {
                            return { content: `${m} is not a message`, err: true }
                        }
                        if (typeof newText !== 'string') {
                            return { content: `${newText} is not a string`, err: true }
                        }
                        stack.push(await m.edit(newText));
                        break
                    }
                    case "%reply": {
                        let text = stack.pop()
                        let msgToRTo = stack.pop()
                        if (typeof text !== 'string') {
                            return { err: true, content: `${text} is not a string` }
                        }
                        if (!(msgToRTo instanceof Message)) {
                            return { err: true, content: `Cannot reply to non-message: ${msgToRTo}` }
                        }
                        stack.push(await msgToRTo.reply(text))
                        break
                    }
                    case "%getmsg": {
                        let val = stack.pop()
                        if (typeof val !== 'string') {
                            return { content: `${val} is not a string`, err: true }
                        }
                        try {
                            let m = await msg.channel.messages.fetch(val)
                            if (!m) {
                                stack.push(0)
                            }
                            else stack.push(m)
                        }
                        catch (err) {
                            console.log(err)
                            stack.push(0)
                        }
                        break
                    }

                    //embeds
                    case "%embed": {
                        stack.push(new MessageEmbed())
                        break
                    }
                    case "%etitle": {
                        let title = stack.pop()
                        if (typeof title !== 'string') {
                            return { err: true, content: `Title for %etitle must be string` }
                        }
                        let e = stack.pop()
                        if (!(e instanceof MessageEmbed)) {
                            return { err: true, content: `${e} is not an embed, cannot set title` }
                        }
                        e.setTitle(title)
                        stack.push(e)
                        break
                    }
                    case "%eimg": {
                        let imgUrl = stack.pop()
                        if (typeof imgUrl !== 'string') {
                            return { err: true, content: `imgUrl for %eimg must be a string` }
                        }
                        let e = stack.pop()
                        if (!(e instanceof MessageEmbed)) {
                            return { err: true, content: `${e} is not an embed, cannot set thumbnail` }
                        }
                        e.setImage(imgUrl)
                        stack.push(e)
                        break
                    }
                    case "%ethumb": {
                        let thumbUrl = stack.pop()
                        if (typeof thumbUrl !== 'string') {
                            return { err: true, content: `thumburl for %ethumb must be a string` }
                        }
                        let e = stack.pop()
                        if (!(e instanceof MessageEmbed)) {
                            return { err: true, content: `${e} is not an embed, cannot set thumbnail` }
                        }
                        e.setThumbnail(thumbUrl)
                        stack.push(e)
                        break
                    }
                    case "%efld": {
                        let inline = stack.pop()
                        if (typeof inline !== 'number') {
                            return { err: true, content: `Inline must be a boolean` }
                        }
                        let value = stack.pop()
                        if (typeof value !== 'string') {
                            return { err: true, content: `value must be a string` }
                        }
                        let title = stack.pop()
                        if (typeof title !== 'string') {
                            return { err: true, content: `name must be a string` }
                        }
                        let e = stack.pop()
                        if (!(e instanceof MessageEmbed)) {
                            return { err: true, content: `${e} is not an embed` }
                        }
                        e.addField(title, value, Boolean(inline))
                        stack.push(e)
                        break
                    }
                    case "%eftr": {
                        let image = stack.pop()
                        if (typeof image !== 'string' && image !== 0) {
                            return { err: true, content: `Footer image must be a string or 0` }
                        }
                        let footer = stack.pop()
                        if (typeof footer !== 'string') {
                            return { err: true, content: `footer must be a string` }
                        }
                        let e = stack.pop()
                        if (!(e instanceof MessageEmbed)) {
                            return { err: true, content: `${e} is not an embed` }
                        }
                        if (image) {
                            e.setFooter({ text: footer, iconURL: image })
                        }
                        else {
                            e.setFooter({ text: footer })
                        }
                        stack.push(e)
                        break
                    }
                    case "%edesc": {
                        let description = stack.pop()
                        if (typeof description !== 'string') {
                            return { err: true, content: `description must be a string` }
                        }
                        let e = stack.pop()
                        if (!(e instanceof MessageEmbed)) {
                            return { err: true, content: `${e} is not an embed` }
                        }
                        e.setDescription(description)
                        stack.push(e)
                        break
                    }
                    case "%etstmp": {
                        let time = stack.pop()
                        if (typeof time !== 'number') {
                            return { err: true, content: `Timestamp must be a number` }
                        }
                        let e = stack.pop()
                        if (!(e instanceof MessageEmbed)) {
                            return { err: true, content: `${e} is not an embed` }
                        }
                        e.setTimestamp(new Date(time || Date.now()))
                        stack.push(e)
                        break
                    }
                    case "%eauth": {
                        let image = stack.pop()
                        if (typeof image !== 'string' && image !== 0) {
                            return { err: true, content: `Footer image must be a string or 0` }
                        }
                        let author = stack.pop()
                        if (typeof author !== 'string') {
                            return { err: true, content: `author must be a string` }
                        }
                        let e = stack.pop()
                        if (!(e instanceof MessageEmbed)) {
                            return { err: true, content: `${e} is not an embed` }
                        }
                        if (image) {
                            e.setAuthor({ name: author, iconURL: image })
                        }
                        else {
                            e.setAuthor({ name: author })
                        }
                        stack.push(e)
                        break
                    }
                    case "%eclr": {
                        let color = stack.pop()
                        let e = stack.pop()
                        if (!(e instanceof MessageEmbed)) {
                            return { err: true, content: `${e} is not an embed` }
                        }
                        try {
                            let colorsToStrings = {
                                "red": [255, 0, 0],
                                "green": [0, 255, 0],
                                "blue": [0, 0, 255],
                                "yellow": [255, 255, 0],
                                "purple": [255, 0, 255],
                                "cyan": [0, 255, 255],
                                "white": [255, 255, 255],
                                "black": [1, 1, 1],
                                "blackblack": [0, 0, 0],
                                "random": [Math.floor(Math.random() * 256), Math.floor(Math.random() * 256), Math.floor(Math.random() * 256)]
                            }
                            if (typeof color === 'string') {
                                //@ts-ignore
                                color = colorsToStrings[color.toLowerCase()]
                            }
                            e.setColor(color as ColorResolvable)
                        }
                        catch (err) {
                            console.log(err)
                            return { err: true, content: `${color} is not a valid color` }
                        }
                        stack.push(e)
                        break
                    }

                    //string manipulation
                    case "%repl": {
                        let repl = stack.pop()
                        if (typeof repl !== 'string') {
                            return { err: true, content: 'Replacement must be a string' }
                        }
                        let find = stack.pop()
                        if (typeof find !== 'string') {
                            return { err: true, content: 'Search must be a string' }
                        }
                        let str = stack.pop()
                        if (typeof str !== 'string') {
                            return { err: true, content: "String to operate on must be string" }
                        }
                        stack.push(str.replaceAll(find, repl))
                        break
                    }
                    case "%rtrunc": {
                        let bytes = stack.pop()
                        if (typeof bytes !== 'number') {
                            return { err: true, content: "The amount of bytes must be a number" }
                        }
                        let str = stack.pop()
                        if (typeof str !== 'string') {
                            return { err: true, content: "Cannot truncate non string" }
                        }
                        let ans = str.slice(0, str.length - bytes)
                        if (ans.length == 0) {
                            return { err: true, content: "Truncatation size is larger than string size" }
                        }
                        stack.push(ans)
                        break
                    }
                    case "%ltrunc": {
                        let bytes = stack.pop()
                        if (typeof bytes !== 'number') {
                            return { err: true, content: "The amount of bytes must be a number" }
                        }
                        let str = stack.pop()
                        if (typeof str !== 'string') {
                            return { err: true, content: "Cannot truncate non string" }
                        }
                        let ans = str.slice(bytes, str.length)
                        if (ans.length == 0) {
                            return { err: true, content: "Truncatation size is larger than string size" }
                        }
                        stack.push(ans)
                        break
                    }
                    case "%trim": {
                        let val = stack.pop()
                        if (typeof val !== 'string') {
                            return { err: true, content: `${val} is not a string` }
                        }
                        stack.push(val.trim())
                        break
                    }
                    case "%split": {
                        let val = stack.pop()
                        if (typeof val !== 'string') {
                            return { err: true, content: `${val} is not a string` }
                        }
                        let str = stack.pop()
                        if (typeof str !== 'string') {
                            return { err: true, content: `${str} is not a string` }
                        }
                        stack.push(str.split(val))
                        break
                    }
                    case "%upper": {
                        let val = stack.pop()
                        if (typeof val !== "string") {
                            return { content: `${val} is not a string`, err: true }
                        }
                        stack.push(val.toUpperCase())
                        break
                    }
                    case "%str": {
                        let val = stack.pop()
                        stack.push(String(val))
                        break
                    }
                    case "%int": {
                        let val = stack.pop()
                        if (typeof val !== 'string') {
                            return { err: true, content: `${val} is not a string` }
                        }
                        let ans = parseInt(val)
                        if (isNaN(ans)) {
                            return { err: true, content: `Result was NaN` }
                        }
                        stack.push(ans)
                        break
                    }
                    case "%float": {
                        let val = stack.pop()
                        if (typeof val !== 'string') {
                            return { err: true, content: `${val} is not a string` }
                        }
                        let ans = parseFloat(val)
                        if (isNaN(ans)) {
                            return { err: true, content: `Result was NaN` }
                        }
                        stack.push(ans)
                        break
                    }

                    //number manipulation
                    case "%lower": {
                        let val = stack.pop()
                        if (typeof val !== "string") {
                            return { content: `${val} is not a string`, err: true }
                        }
                        stack.push(val.toLowerCase())
                        break
                    }
                    case "%floor": {
                        let val = stack.pop()
                        if (typeof val !== 'number') {
                            return { err: true, content: `${val} is not a number` }
                        }
                        stack.push(Math.floor(val))
                        break
                    }
                    case "%ceil": {
                        let val = stack.pop()
                        if (typeof val !== 'number') {
                            return { err: true, content: `${val} is not a number` }
                        }
                        stack.push(Math.ceil(val))
                        break
                    }
                    case "%rand": {
                        stack.push(Math.random())
                        break
                    }

                    //users
                    case "%getusr": {
                        let val = stack.pop()
                        if (typeof val !== 'string') {
                            return { content: `${val} is not a string`, err: true }
                        }
                        try {
                            let u = await msg.guild?.members.fetch(val)
                            if (!u) {
                                stack.push(0)
                            }
                            else stack.push(u)
                        }
                        catch (err) {
                            console.log(err)
                            stack.push(0)
                        }
                        break
                    }

                    //list manipulation
                    case "%join": {
                        let val = stack.pop()
                        if (typeof val !== 'string') {
                            return { err: true, content: `${val} is not a string` }
                        }
                        let arr = stack.pop()
                        if (!Array.isArray(arr)) {
                            return { err: true, content: `${arr} is not a list` }
                        }
                        stack.push(arr.join(val))
                        break
                    }
                    case "%index": {
                        let indexNo = stack.pop()
                        let startIndex = null
                        let indexee = stack.pop()
                        if (typeof indexNo === 'string') {
                            [startIndex, indexNo] = indexNo.split(":")
                            startIndex = Number(startIndex)
                            indexNo = Number(indexNo)
                            if (isNaN(startIndex) || isNaN(indexNo)) {
                                return { err: true, content: `Cannot index with non-range: ${indexNo}` }
                            }
                        }
                        if (typeof indexNo !== 'number') {
                            return { err: true, content: `cannot index with non-number: ${indexNo}` }
                        }
                        switch (typeof indexee) {
                            case 'string': {
                                if (startIndex !== null) {
                                    stack.push(indexee.slice(startIndex, indexNo))
                                }
                                else {
                                    stack.push(indexee[indexNo])
                                }
                                break
                            }
                            case 'object': {
                                if (Array.isArray(indexee)) {
                                    if (startIndex !== null) {
                                        stack.push(indexee.slice(startIndex, indexNo))
                                    }
                                    else {
                                        stack.push(indexee[indexNo])
                                    }
                                    break
                                }
                            }
                            default: {
                                return { err: true, content: `Cannot index ${typeof indexee}` }
                            }
                        }
                        break
                    }
                    case "%list": {
                        let list = []
                        let chgI = 0
                        let count = stack.pop()
                        if (!isNaN(Number(count))) {
                            for (let i = 0; i < parseInt(String(count)); i++) {
                                let val = stack.pop()
                                if (typeof val === 'undefined') {
                                    return { err: true, content: `arg: ${i} in list is undefined` }
                                }
                                list.push(val)
                            }
                        }
                        else {
                            return { err: true, content: `No list length given` }
                        }
                        stack.push(list.reverse())
                        return { chgI: chgI }
                    }
                    case "%end": {
                        return { end: true }
                    }
                    case "%break": {
                        return { end: true }
                    }
                    case "%find": {
                        let matcher = stack.pop()
                        if (matcher === undefined) {
                            return { err: true, content: `Matcher cant be undefined` }
                        }
                        let matchee = stack.pop()
                        if (Array.isArray(matchee)) {
                            let index = matchee.indexOf(matcher)
                            stack.push(index)
                        }
                        else if (typeof matchee === 'string') {
                            if (typeof matcher !== 'string') {
                                return { err: true, content: `The matcher for a string must be a string` }
                            }
                            let match = matchee.match(matcher)
                            if (match?.index) {
                                stack.push(match.index)
                            }
                            else {
                                stack.push(-1)
                            }
                        }
                        else {
                            return { err: true, content: `Matchee cannot be of type: ${typeof matchee}` }
                        }
                        break
                    }

                    //control flow
                    case "%loop": {
                        let code = []
                        let chgI = 0
                        for (let i = argNo + 1; i < argCount; i++) {
                            chgI++
                            if (args[i] == "%loopend") {
                                break
                            }
                            if (args[i] == "%loop") {
                                return { err: true, content: `Nested loops are not allowed` }
                            }
                            code.push(args[i])
                        }
                        let loopCount = 0
                        let id = Math.floor(Math.random() * 100000000)
                        SPAMS[id] = true
                        forever: while (true) {
                            if (!SPAMS[id])
                                break
                            loopCount++
                            for (let i = 0; i < code.length; i++) {
                                let rv = await parseArg(code[i], i, code.length, code, stacks[currScopes[currScopes.length - 1]])
                                if (rv?.end) break forever
                                if (rv?.chgI) {
                                    i += parseInt(rv.chgI)
                                }
                                if (rv?.err) {
                                    return rv
                                }
                            }
                            if (loopCount > 2000) {
                                stack.push(0)
                                break
                            }
                            let topOfStack = stack[stack.length - 1]
                            if (topOfStack instanceof Message) {
                                if (topOfStack.content == '%loopend') {
                                    stack.pop()
                                    break
                                }
                            }
                        }
                        return { chgI: chgI }
                    }
                    case "%if": {
                        let bool = Boolean(stack.pop()) ? true : false
                        if (bool) {
                            for (let i = argNo + 1; i < argCount; i++) {
                                //@ts-ignore
                                let ifCount = 0
                                if (args[i] == "%else") {
                                    let ifCount = 0
                                    for (let j = i + 1; j < argCount; j++) {
                                        if (args[j] == '%if') {
                                            ifCount++
                                        }
                                        if (args[j] == "%ifend") {
                                            ifCount--
                                            if (ifCount < 0)
                                                return { chgI: j - argNo }
                                        }
                                    }
                                    return { chgI: i - argNo }
                                }
                                else if (args[i] == "%if") {
                                    ifCount++
                                }
                                else if (args[i] == "%ifend") {
                                    ifCount--
                                }
                                if (args[i] == "%ifend" && ifCount < 0) {
                                    return { chgI: i - argNo }
                                }
                                let rv = await parseArg(args[i], i, argCount, args, stacks[currScopes[currScopes.length - 1]])
                                if (rv?.end) return { end: true }
                                if (rv?.chgI)
                                    i += parseInt(rv.chgI)
                                if (rv?.err) {
                                    return { chgI: i - argNo, ...rv }
                                }
                            }
                        }
                        else {
                            for (let i = argNo; i < argCount; i++) {
                                if (args[i] == "%else") {
                                    for (let j = i + 1; j < argCount; j++) {
                                        if (args[j] == "%ifend") {
                                            return { chgI: j - argNo }
                                        }
                                        let rv = await parseArg(args[j], j, argCount, args, stacks[currScopes[currScopes.length - 1]])
                                        if (rv?.end) return { end: true }
                                        if (rv?.chgI)
                                            j += parseInt(rv.chgI)
                                        if (rv?.err) {
                                            return { chgI: j - argNo, ...rv }
                                        }
                                    }
                                }
                                if (args[i] == "%ifend") {
                                    return { chgI: i - argNo }
                                }
                            }
                        }
                        break
                    }
                    default: {
                        if (arg.match(/^"([^"]*)"$/)) {
                            //strings
                            stack.push(arg.replace(/^"/, "").replace(/"$/, ""))
                        }
                        else if (arg.match(/^\.[^ ]+$/)) {
                            let data = stack.pop()
                            if (typeof data === 'undefined') {
                                return { err: true, content: `${data} is undefined` }
                            }
                            let val = (data as any)[arg.slice(1)]
                            if (typeof val === 'function') {
                                stack.push(String(val))
                            }
                            else if (val) {
                                stack.push(val)
                            }
                            else {
                                stack.push(0)
                            }
                        }
                        else if (!isNaN(parseFloat(arg))) {
                            stack.push(parseFloat(arg))
                        }
                        else if (stack[stack.length - 1] == "%saveas") {
                            stack.pop()
                            let ans = stack.pop()
                            if (typeof ans === 'undefined') {
                                return { err: true, content: `Cannot save undefined as variable` }
                            }
                            vars[arg] = () => ans
                            stack.push(ans)
                        }
                        else if (stack[stack.length - 1] == '%lvar') {
                            let value = vars[arg]?.(msg)
                            if (typeof value === 'undefined') {
                                value = userVars[msg.author.id]?.[arg]?.(msg)
                            }
                            if (typeof value === 'undefined') {
                                return { content: `var: **${arg}** does not exist`, err: true }
                            }
                            stack.push(value)
                        }
                        else if (stack[stack.length - 1] == "%sram") {
                            let sram = stack.pop()
                            let item = stack.pop()
                            ram[arg as string] = item
                        }
                        else if (stack[stack.length - 1] == '%lram') {
                            if (ram[arg] === undefined) {
                                return { content: `${arg} not in ram` }
                            }
                            stack.pop()
                            stack.push(ram[arg])
                        }
                        else {
                            let value = ram[arg]
                            if (typeof value === 'undefined')
                                value = vars[arg]?.(msg)
                            if (typeof value === 'undefined') {
                                value = userVars[msg.author.id]?.[arg]?.(msg)
                            }
                            if (typeof value === 'undefined') {
                                return { content: `var: **${arg}** does not exist`, err: true }
                            }
                            stack.push(value)
                        }
                    }
                }
            }

            for (let i = 0; i < args.length; i++) {
                let arg = args[i]
                arg = arg.trim()
                let rv = await parseArg(arg, i, args.length, args, stacks[currScopes[currScopes.length - 1]])
                if (rv?.end) break
                if (rv?.chgI)
                    i += parseInt(rv.chgI)
                if (rv?.err) {
                    return rv
                }
            }
            let embeds = []
            let texts = []
            for (let item of stack) {
                if (item instanceof MessageEmbed) {
                    embeds.push(item)
                }
                else {
                    texts.push(item)
                }
            }
            return { content: texts.join(" "), embeds: embeds, noSend: stack.length > 0 ? false : true }
        }, category: CommandCategory.UTIL,
        help: {
            info: "Welcome to stackl",
            arguments: {
                code: {
                    description: "The code to run"
                }
            }
        }
    },

    "reddit": {
        run: async (msg, args) => {
            let subreddit = args[0]
            //@ts-ignore
            let data = await got(`https://libreddit.spike.codes/r/${subreddit}`)
            if (!data.body) {
                return { content: "nothing found" }
            }
            const $ = cheerio.load(data.body)
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
            let post = foundData[Math.floor(Math.random() * foundData.length)]
            let embed = new MessageEmbed()
            embed.setTitle(post.text || "None")
            embed.setFooter({ text: post.link || "None" })
            return { embeds: [embed] }
        }, category: CommandCategory.FUN
    },

    "expr": {
        run: async (msg, args) => {
            let vname = args[0]
            let varValRet
            let vardict = vars
            if (isNaN(parseFloat(vname))) {
                let vvalue = vars[vname]
                if (vvalue === undefined) {
                    vardict = userVars[msg.author.id]
                    vvalue = userVars[msg.author.id]?.[vname]
                }
                if (vvalue === undefined) {
                    vardict = vars
                    vars[vname] = () => '0'
                    vvalue = vars[vname]
                }
                varValRet = vvalue(msg)
            }
            else {
                varValRet = vname
                vname = "__expr"
            }
            let op = args[1]
            let expr = args[2]
            if (expr && isNaN(parseFloat(expr))) {
                let vvalue = vars[expr]
                if (vvalue === undefined) {
                    vvalue = userVars[msg.author.id]?.[expr]
                }
                if (vvalue === undefined) {
                    vars[expr] = () => '0'
                    vvalue = vars[expr]
                }
                if (vvalue === undefined) {
                    return { content: `var: **${expr}** does not exist` }
                }
                expr = vvalue(msg)
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
            vardict[vname] = () => ans
            return { content: String(ans) }
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
        run: async (msg: Message, args) => {
            let file = msg.attachments.at(0)
            let text;
            if (!file) {
                text = args.join(" ").replaceAll("```", "").split(";EOL")
            }
            else {
                let k = msg.attachments.keyAt(0) as string
                msg.attachments.delete(k)
                //@ts-ignore
                let data = got(file.url)
                text = await data.text()
                let bluecHeader = "%bluecircle37%\n"
                if (text.slice(0, bluecHeader.length) !== bluecHeader) {
                    return { content: "Does not appear to be a bluec script" }
                }
                text = text.slice(bluecHeader.length).split(";EOL")
            }
            if (!text) {
                return { content: "No script" }
            }
            let id = Math.floor(Math.random() * 10000000)
            SPAMS[id] = true
            await msg.channel.send(`Starting id: ${id}`)
            for (let line of text) {
                if (!SPAMS[id])
                    break
                line = line.trim()
                if (line.startsWith(prefix)) {
                    line = line.slice(prefix.length)
                }
                msg.content = `${prefix}${line}`
                await doCmd(msg, false)
            }
            return { noSend: true }
        }, category: CommandCategory.META,
        help: {
            info: "Runs bluec scripts. If running from a file, the top line of the file must be %bluecircle37%"
        }
    },
    "var": {
        run: async (msg: Message, args: ArgumentList) => {
            let opts;
            [opts, args] = getOpts(args)
            let [name, ...value] = args.join(" ").split("=")
            if (!value.length) {
                return { content: "no value given, syntax `[var x=value" }
            }
            let realVal = value.join(" ")
            if (opts['prefix']) {
                let prefix = String(opts['prefix'])
                if (prefix.match(/^\d{19}/)) {
                    return { content: "No ids allowed" }
                }
                if (userVars[prefix]) {
                    userVars[prefix][name] = () => realVal
                }
                else {
                    userVars[prefix] = { [name]: () => realVal }
                }
                if (!opts['silent'])
                    return { content: userVars[prefix][name]() }
            }
            else if (opts['u']) {
                if (userVars[msg.author.id]) {
                    userVars[msg.author.id][name] = () => realVal
                }
                else {
                    userVars[msg.author.id] = { [name]: () => realVal }
                }
                if (!opts['silent'])
                    return {
                        content: userVars[msg.author.id][name]()
                    }
            }
            else {
                vars[name] = () => realVal
                if (!opts['silent'])
                    return {
                        content: vars[name]()
                    }
            }
            return { noSend: true }
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
        run: async (msg: Message, args: ArgumentList) => {
            const file = FILE_SHORTCUTS[args[0]] || args[0]
            if (!file) {
                return {
                    content: "Nothing given to add to"
                }
            }
            if (file.match(/[\.]/)) {
                return {
                    content: "invalid command"
                }
            }
            if (!fs.existsSync(`./command-results/${file}`)) {
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
                            await msg.channel.send(`${num} is not a valid number`)
                            return
                        }
                        let removal = data[num - 1]
                        let userCreated = removal.split(":")[0].trim()
                        if (userCreated != msg.author.id && ADMINS.indexOf(msg.author.id) < 0) {
                            await msg.channel.send({
                                content: "You did not create that message, and are not a bot admin"
                            })
                            continue
                        }
                        removedList.push(data[num - 1])
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
            catch (err) {
                return {
                    content: "didnt respond in time"
                }
            }
            return { content: 'Say the number of what you want to remove or type cancel' }
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
        run: async (msg, args) => {
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
    "b64": {
        run: async (msg, args) => {
            let text = args.join(" ")
            return { content: Buffer.from(text).toString("base64") }
        }, category: CommandCategory.UTIL
    },
    "b64d": {
        run: async (msg, args) => {
            let text = args.join(" ")
            return { content: Buffer.from(text, "base64").toString("utf8") }
        }, category: CommandCategory.UTIL
    },
    "rfile": {
        run: async (msg, args) => {
            let att = msg.attachments.at(0)
            if (att) {
                //@ts-ignore
                let data: string = await got(att.attachment).text()
                return { content: data }
            }
            return { noSend: true }
        },
        category: CommandCategory.UTIL
    },
    "command-file": {
        run: async (msg: Message, args: ArgumentList) => {
            let opts
            [opts, args] = getOpts(args)
            if (opts["l"]) {
                return {
                    content: `\`\`\`
${fs.readdirSync("./command-results").join("\n")}
\`\`\`
`
                }
            }
            const file = FILE_SHORTCUTS[args[0]] || args[0]
            if (!file) {
                return {
                    content: "Nothing given to add to"
                }
            }
            if (file.match(/\./)) {
                return { content: "<:Watching1:697677860336304178>" }
            }
            if (!fs.existsSync(`./command-results/${file}`)) {
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
        run: async (msg, args) => {
            return { content: fs.readdirSync('./command-results').join("\n") }
        },
        category: CommandCategory.META
    },
    add: {
        run: async (msg: Message, args: ArgumentList) => {
            const file = FILE_SHORTCUTS[args[0]] || args[0]
            if (!file) {
                return {
                    content: "Nothing given to add to"
                }
            }
            if (file.match(/[\.]/)) {
                return {
                    content: "invalid command"
                }
            }
            if (!fs.existsSync(`./command-results/${file}`)) {
                if (file === "wordle")
                    fs.writeFileSync(`./command-results/${file}`, "")
                else return { content: `${file} does not exist` }
            }
            args = args.slice(1)
            const data = args?.join(" ")
            if (!data) {
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
        run: async (msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            let showArgs = true
            if (opts['n'] || opts['no-args']) {
                showArgs = false
            }
            let chain = []
            let command = args[0]
            let a = ""
            chain.push(command)
            //finds the original command
            let expansions = 0
            while (aliases[command]?.[0]) {
                expansions++;
                if(expansions >= 1000)
                    return {content: "Alias expansion limit reached"}
                a = aliases[command].slice(1).join(" ") + " " + a + " "
                if (showArgs)
                    chain.push(`${aliases[command][0]} ${a}`.trim())
                else
                    chain.push(aliases[command][0])
                command = aliases[command][0]
            }

            return { content: chain.join(" -> ") }
        },
        help: {
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
        run: async (msg, args) => {
            let name = args[0]
            if (!name) {
                return {
                    content: "No command name given"
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
                        await msg.channel.send(`Cannot remove ${command}`)
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
                content: `Removed: ${successfullyRemoved.join(", ")}`
            }
        },
        category: CommandCategory.META

    },
    "8": {
        run: async (msg: Message, args: ArgumentList) => {
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
        run: async (msg: Message, args: ArgumentList) => {
            let opts;
            [opts, args] = getOpts(args)
            let speed = parseInt(opts['speed'] as string) || 1
            let joinedArgs = args.join(" ")
            let [from, to] = joinedArgs.split("|")
            if (!to) {
                return { content: "No second place given, fmt: `place 1 | place 2`" }
            }
            let fromUser = await fetchUser(msg.guild, from)
            let toUser = await fetchUser(msg.guild, to)
            if (fromUser && toUser) {
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
        run: async (msg: Message, args: ArgumentList) => {
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
            if (opts["g"]) {
                return {
                    content: `\`\`\`
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
special commands:
    [count]:<range>[cmd/...]
    [t:cmd
    [s:cmd
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
    \\v{(g:)variable name}: value of a variable (put g: to garantee global scope)
    \\V{scope:variable name}: get a variable from a specific scope (. for global and % for user)
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
                }
                let rv = ""
                for (let cmd in commands) {
                    if (catNum == -1 || commands[cmd].category == catNum)
                        rv += `${cmd}: ${cmdCatToStr(commands[cmd].category)}\n`
                }
                return { content: rv }
            }
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
                return { content: JSON.stringify(commandsToUse) }
            }
            if (Object.keys(commandsToUse).length < 1) {
                return {
                    content: "No help can be given :("
                }
            }
            if (!fs.existsSync("help.html") || opts["n"] || args.length > 0) {
                await msg.channel.send("generating new help file")
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
            if (!Object.keys(opts).length) {
                opts['p'] = true
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
                    content: `\`\`\`\n${content}\n\`\`\``
                }
            }
            if (files.length > 0) {
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
        run: async (msg: Message, args: ArgumentList) => {
            return {
                content: "https://github.com/euro20179/bircle"
            }
        },
        category: CommandCategory.META

    },
    WHITELIST: {
        run: async (msg: Message, args: ArgumentList) => {
            let user = args[0]
            if (!user) {
                return {
                    content: "no user given"
                }
            }
            let addOrRemove = args[1]
            if (!["a", "r"].includes(addOrRemove)) {
                return {
                    content: "did not specify, (a)dd or (r)emove"
                }
            }
            let cmds = args.slice(2)
            if (!cmds.length) {
                return {
                    content: "no cmd given"
                }
            }
            user = await fetchUser(msg.guild, user)
            if (addOrRemove == "a") {
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
    RESET_ECONOMY: {
        run: async(msg, args) => {
            resetEconomy()

            return {content: "Economy reset"}

        }, category: CommandCategory.META,
        permCheck: (m) => ADMINS.includes(m.author.id)
    },
    RESET_PLAYER: {
        run: async(msg, args) => {
            let player = await fetchUser(msg.guild, args[0])
            if(!player)
                return {content: "No player found"}
            resetPlayer(player.user.id)
            return {content: `Reset: <@${player.user.id}>`}
        },
        category: CommandCategory.META,
        permCheck: m => ADMINS.includes(m.author.id)
    },
    RESET_PLAYER_ITEMS: {
        run: async(msg, args) => {
            let player = await fetchUser(msg.guild, args[0])
            if(!player)
                return {content: "No player found"}
            resetPlayerItems(player.user.id)
            return {content: `Reset: <@${player.user.id}>`}
        },
        category: CommandCategory.META,
        permCheck: m => ADMINS.includes(m.author.id)
    },
    RESET_ITEMS: {
        run: async(msg, args) => {
            resetItems()
            return {content: "Items reset"}
        },
        permCheck: (m) => ADMINS.includes(m.author.id),
        category: CommandCategory.META
    },
    SETMONEY: {
        run: async(msg, args) => {
            let user = await fetchUser(msg.guild, args[0])
            if(!user){
                return {content: "user not found"}
            }
            let amount = calculateAmountFromString(msg.author.id, args[1])
            if(amount){
                setMoney(user.id, amount)
                return {content: `${user.id} now has ${amount}`}
            }
            return {content: "nothign happened"}
        }, category: CommandCategory.META,
        permCheck: (m) => ADMINS.includes(m.author.id)
    },
    BLACKLIST: {
        run: async (msg: Message, args: ArgumentList) => {
            let user = args[0]
            if (!user) {
                return {
                    content: "no user given"
                }
            }
            let addOrRemove = args[1]
            if (!["a", "r"].includes(addOrRemove)) {
                return {
                    content: "did not specify, (a)dd or (r)emove"
                }
            }
            let cmds = args.slice(2)
            if (!cmds.length) {
                return {
                    content: "no cmd given"
                }
            }
            user = await fetchUser(msg.guild, user)
            if (addOrRemove == "a") {
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
        run: async (msg: Message, args: ArgumentList) => {
            await msg.channel.send("STOPPING")
            saveEconomy()
            saveItems()
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
        run: async (msg, args) => {
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
            if (canEarn(msg.author.id)) {
                let amount = diff / (1000 * 60 * 60)
                if(hours == minutes){
                    amount *= 1.001
                }
                if(hours == minutes && minutes == seconds){
                    amount *= 1.5
                }
                addMoney(msg.author.id, amount)
                fmt += `\n{earnings}`
                fs.writeFileSync("./command-results/last-run", String(Date.now()))
            }
            return { content: format(fmt, { T: lastRun.toString(), t: `${days}:${hours}:${minutes}:${seconds}.${milliseconds}`, H: hours, M: minutes, S: seconds, D: days, i: milliseconds, f: diff, d: diff / (1000 * 60 * 60 * 24), h: diff / (1000 * 60 * 60), m: diff / (1000 * 60), s: diff / 1000, hours: hours, minutes: minutes, seconds: seconds, millis: milliseconds, diff: diff, days: days, date: lastRun.toDateString(), time: lastRun.toTimeString(), earnings: `${msg.author} Earned: ${diff / (1000 * 60 * 60)}` }) }
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
        run: async (msg: Message, args: ArgumentList) => {
            let opts;
            [opts, args] = getOpts(args)
            let member
            if (!opts['f'])
                member = (msg.channel as TextChannel).guild.members.cache.random()
            if (!member)
                member = (await (msg.channel as TextChannel).guild.members.fetch()).random()
            let fmt = args.join(" ") || "%u (%n)"
            if (!member) return { content: "No member found" }
            let user = member?.user
            if (!user) return { content: "No user found" }
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
        run: async (msg, args) => {
            let search = args.join(" ").toLowerCase()
            let roles = await msg.guild?.roles.fetch()
            if (!roles) {
                return { content: "No roles found" }
            }
            let foundRoles = roles.filter(r => r.name.toLowerCase() == search ? true : false)
            if (!foundRoles) {
                foundRoles = roles.filter(r => r.name.toLowerCase().match(search) ? true : false)
            }
            if (!foundRoles) {
                foundRoles = roles.filter(r => r.id == search ? true : false)
            }

            let role = foundRoles.at(0)
            if (!role) {
                return { content: "Could not find role" }
            }
            let embed = new MessageEmbed()
            embed.setTitle(role.name)
            embed.setColor(role.color)
            embed.addField("id", String(role.id), true)
            embed.addField("name", role.name, true)
            embed.addField("emoji", role.unicodeEmoji || "None", true)
            embed.addField("created", role.createdAt.toTimeString(), true)
            embed.addField("Days Old", String((Date.now() - (new Date(role.createdTimestamp)).getTime()) / (1000 * 60 * 60 * 24)), true)
            return { embeds: [embed] || "none" }
        },
        category: CommandCategory.UTIL
    },
    "channel-info": {
        run: async (msg, args) => {
            let channel
            if (!args.join(" ").trim().length)
                channel = msg.channel
            else channel = await fetchChannel(msg.guild, args.join(" ").trim())
            if(!channel)
                return {content: "Channel not found"}
            let pinned = await channel?.messages?.fetchPinned()
            let daysSinceCreation = (Date.now() - (new Date(channel.createdTimestamp)).getTime()) / (1000 * 60 * 60 * 24)
            let embed = new MessageEmbed()
            embed.setTitle(channel.name)
            if (pinned) {
                let pinCount = pinned.size
                let daysTillFull = (daysSinceCreation / pinCount) * (50 - pinCount)
                embed.addField("Pin Count", String(pinCount), true)
                embed.addField("Days till full", String(daysTillFull), true)
            }
            embed.addField("Created", channel.createdAt.toString(), true)
            embed.addField("Days since Creation", String(daysSinceCreation), true)
            embed.addField("Id", channel.id.toString(), true)
            embed.addField("Type", channel.type, true)
            if (channel.topic) {
                embed.addField("Topic", channel.topic, true)
            }
            if (channel.nsfw) {
                embed.addField("NSFW?", channel.nsfw, true)
            }
            if (channel.position) {
                embed.addField("Position", channel.position.toString(), true)
            }
            return { embeds: [embed] }
        },
        category: CommandCategory.UTIL
    },
    "emote-info": {
        run: async (msg, args) => {
            let emote = args[0].split(":")[2].slice(0, -1)
            let e
            try {
                e = await msg.guild?.emojis.fetch(emote)
            }
            catch (err) {
                return { content: "No emoji found" }
            }
            if (!e) {
                return { content: "No emoji foudn" }
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
            return { embeds: [embed] }
        }, category: CommandCategory.UTIL
    },
    "user-info": {
        run: async (msg: Message, args: ArgumentList) => {
            if (!args[0]) {
                return {
                    content: "no member given!"
                }
            }
            const member = await fetchUser(msg.guild, args[0])
            if (!member) {
                return {
                    content: "member not found"
                }
            }
            const user = member.user
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
                            b: member.premiumSince?.toString() || "#!N/A",
                            a: user.avatarURL() || "#!N/A"
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
        run: async (msg, args) => {
            let opts: Opts;
            [opts, args] = getOpts(args)
            let amount = parseInt(String(opts['count'] || opts['c'])) || 1
            let sep = opts['sep'] || opts['s'] || "\n"
            sep = String(sep)
            let send = ""
            let emojis = await msg.guild?.emojis.fetch()
            if (!emojis) {
                return { content: "Could not find emojis" }
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
            return { content: send }
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
        run: async (msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            let serverOnly = opts['S'] ? false : true
            let data = generateEmoteUseFile()
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
            return { content: finalData }
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
        run: async (_msg: Message, args: ArgumentList) => {
            let data = generateCmdUseFile()
                .split("\n")
                .map(v => v.split(":")) //map into 2d array, idx[0] = cmd, idx[1] = times used
                .filter(v => v[0] && !isNaN(Number(v[1]))) // remove empty strings
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
        run: async (msg, args) => {
            let invites = await msg.guild?.invites.fetch()
            if (invites?.at(0)?.url) {
                return { content: invites.at(0)?.url }
            }
            return { content: "No invite found" }
        },
        category: CommandCategory.UTIL
    },
    "non-assigned-roles": {
        run: async (msg, args) => {
            await msg.guild.members.fetch()
            let roles = await msg.guild?.roles.fetch()
            let rolesNonAssigned: any[] = []
            roles?.forEach(r => {
                if (r.members.size < 1)
                    rolesNonAssigned.push(r.name)
            })
            return { content: rolesNonAssigned.join("\n") + `\n${rolesNonAssigned.length} roles do not have any members` }
        },
        category: CommandCategory.UTIL
    },
    tail: {
        run: async (msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            let count = parseInt(String(opts['count'])) || 10
            let argText = args.join(" ")
            return { content: argText.split("\n").reverse().slice(0, count).reverse().join("\n") }
        }, category: CommandCategory.UTIL
    },
    head: {
        run: async (msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            let count = parseInt(String(opts['count'])) || 10
            let argText = args.join(" ")
            return { content: argText.split("\n").slice(0, count).join("\n") }
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
        run: async (msg, args) => {
            let text = args.join(" ").split('\n')
            let rv = ""
            for (let i = 1; i < text.length + 1; i++) {
                rv += `${i}: ${text[i - 1]}\n`
            }
            return { content: rv }
        }, category: CommandCategory.UTIL
    },
    grep: {
        run: async (msg: Message, args: ArgumentList) => {
            let regex = args[0]
            if (!regex) {
                return {
                    content: "no search given"
                }
            }
            let data = args.slice(1).join(" ").trim()
            if (!data) {
                if (msg.attachments?.at(0)) {
                    data = downloadSync(msg.attachments?.at(0)?.attachment).toString()
                }
                else return { content: "no data given to search through" }
            }
            let match = data.matchAll(new RegExp(regex, "gm"))
            let finds = ""
            for (let find of match) {
                if (find[1]) {
                    finds += `Found \`${find.slice(1).join(", ")}\` at character ${(find?.index ?? 0) + 1}\n`
                }
                else {
                    finds += `Found \`${find[0]}\` at character ${(find?.index ?? 0) + 1}\n`
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
        run: async (msg: Message, args: ArgumentList) => {
            let cmd
            [cmd, ...args] = args
            let realCmd = args[0]
            args = args.slice(1)
            if (aliases[cmd]) {
                return { content: `Failed to add "${cmd}", it already exists` }
            }
            if(commands[cmd]){
                return {content: `Failed to add "${cmd}", it is a builtin`}
            }
            fs.appendFileSync("command-results/alias", `${msg.author.id}: ${cmd} ${realCmd} ${args.join(" ")};END\n`)
            aliases = createAliases()
            return {
                content: `Added \`${cmd}\` = \`${realCmd}\` \`${args.join(" ")}\``
            }
        },
        category: CommandCategory.META
    },
    "!!": {
        run: async (_msg: Message, args: ArgumentList) => {
            let opts;
            [opts, args] = getOpts(args)
            if (opts['check'] || opts['print'] || opts['see'])
                return { content: `\`${lastCommand.content}\`` }
            if (!lastCommand) {
                return { content: "You ignorance species, there have not been any commands run." }
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
        run: async (_msg, _args) => {
            if (!purgeSnipe) {
                return { content: "Nothing has been purged yet" }
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
            return { content: content ? content : undefined, files: files, embeds: embeds }
        },
        help: {
            info: "Similar to snipe, but shows the messages deleted from commands such as !clear"
        },
        category: CommandCategory.FUN
    },
    snipe: {
        run: async (_msg: Message, args: ArgumentList) => {
            let snipeC = ((parseInt(args[0]) - 1) || 0)
            if (snipeC >= 5) {
                return { content: "it only goes back 5" }
            }
            if (snipeC > snipes.length) {
                return { content: "Not that many messages have been deleted yet" }
            }
            if (!snipes.length) {
                return { content: "Nothing has been deleted" }
            }
            let snipe = snipes[snipeC]
            if (!snipe) {
                return { content: "no snipe" }
            }
            let rv: CommandReturn = { deleteFiles: false, content: `${snipe.author} says:\`\`\`\n${snipe.content}\`\`\`` }
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
        run: async (msg, _args) => {
            return { content: `${(new Date()).getMilliseconds() - msg.createdAt.getMilliseconds()}ms` }
        },
        category: CommandCategory.META
    },
    version: {
        run: async (_msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            if (opts['l']) {
                return { content: fs.readdirSync('changelog').map(v => v.replace(/\.md/, "")).join("\n") }
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
                })
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
        run: async (_msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            if (opts['l']) {
                return { content: fs.readdirSync('changelog').map(v => v.replace(/\.md/, "")).join("\n") }
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
                return { content: `${version} does not exist` }
            }
            if (opts['f']) {
                return { files: [{ attachment: `changelog/${version}.md`, name: `${version}.md`, description: `Update: ${version}` }], deleteFiles: false }
            }
            return { content: fs.readFileSync(`changelog/${version}.md`, "utf-8") }
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
        run: async (_msg, _args) => {
            let data = ""
            for (let id in SPAMS) {
                data += `${id}\n`
            }
            return { content: data || "No spams" }
        },
        category: CommandCategory.META
    }
}

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
let aliases = createAliases()

const rest = new REST({ version: "9" }).setToken(token);

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

async function handleSending(msg: Message, rv: CommandReturn) {
    if (!Object.keys(rv).length) {
        return
    }
    if (rv.deleteFiles === undefined) {
        rv.deleteFiles = true
    }
    if (rv.delete && msg.deletable) {
        msg.delete().catch(_err => console.log("Message not deleted"))
    }
    if (rv.noSend) {
        return
    }
    if ((rv.content?.length || 0) >= 2000) {
        fs.writeFileSync("out", rv.content as string)
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
        delete rv['content']
    }
    else {
        if (userVars[msg.author.id]) {
            userVars[msg.author.id][`_!`] = () => rv.content
        }
        else
            userVars[msg.author.id] = { "_!": () => rv.content }
        vars[`_!`] = () => rv.content
    }
    let location: any = msg.channel
    if (rv['dm']) {
        location = msg.author
    }
    try {
        await location.send(rv)
    }
    catch (err) {
        console.log(err)
        await location.send("broken")
    }
    if (rv.files) {
        for (let file of rv.files) {
            if (file.delete !== false && rv.deleteFiles)
                fs.rmSync(file.attachment)
        }
    }
}

async function doCmd(msg: Message, returnJson = false) {
    let command: string
    let args: Array<string>
    let doFirsts: { [item: number]: string }
    [command, args, doFirsts] = await parseCmd({ msg: msg })
    let idxNo = 0;
    for (let idx in doFirsts) {
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
        for (let m of args[idx].matchAll(/%\{(\d+)\}/g)) {
            args[idx] = args[idx].replace(m[0], splitData[parseInt(m[1])])
        }
        msg.content = oldContent
        idxNo++
    }
    args = args.filter(v => v !== "__BIRCLE__UNDEFINED__")
    let canRun = true
    let exists = true
    let rv: CommandReturn;
    let oldSend = msg.channel.send
    let typing = false
    let redir: boolean | [Object, string] = false
    let redirAll = false
    let m;
    if (m = command.match(/^s:/)) {
        msg.channel.send = async (_data) => msg
        command = command.slice(2)
    }
    else if (m = command.match(/^redir(!)?\(([^:]*):([^:]+)\):/)) {
        let all = m[1]
        let skip = 9
        if (all) {
            skip++
            redirAll = true
            msg.channel.send = async (_data) => {
                //@ts-ignore
                if (_data.content) {
                    if (typeof redir === 'object') {
                        let [place, name] = redir
                        //@ts-ignore
                        place[name] = () => _data.content
                    }
                }
                return msg
            }
        }
        let prefix = m[2]
        let name = m[3]
        if (!prefix) {
            redir = [vars, name]
        }
        else if (prefix) {
            skip += prefix.length
            if (!userVars[prefix])
                userVars[prefix] = {}
            redir = [userVars[prefix], name]
        }
        skip += name.length
        command = command.slice(skip)
    }
    else if (m = command.match(/^t:/)) {
        command = command.slice(2)
        typing = true
    }
    else if (m = command.match(/^d:/)) {
        command = command.slice(2)
        if (msg.deletable) await msg.delete()
    }
    if (!commands[command]) {
        rv = { content: `${command} does not exist` }
        exists = false
    }
    if (exists) {
        if (commands[command].permCheck) {
            canRun = commands[command].permCheck?.(msg) ?? true
        }
        if (WHITELIST[msg.author.id]?.includes(command)) {
            canRun = true
        }
        if (BLACKLIST[msg.author.id]?.includes(command)) {
            canRun = false
        }
        if (canRun) {
            rv = await commands[command].run(msg, args)
            //if normal command, it counts as use
            addToCmdUse(command)
        }
        else rv = { content: "You do not have permissions to run this command" }
    }
    else if (aliases[command]) {
        //if it's an alias, it counts as use
        if (CMDUSE[command]) {
            CMDUSE[command] += 1
        } else {
            CMDUSE[command] = 1
        }
        let aliasPreArgs = aliases[command].slice(1);
        command = aliases[command][0]
        let expansions = 0
        //finds the original command
        while (aliases[command]?.[0]) {
            expansions++;
            if (expansions > 1000) {
                await msg.channel.send("Alias expansion limit reached")
                return {}
            }
            if (CMDUSE[command]) {
                CMDUSE[command] += 1
            } else {
                CMDUSE[command] = 1
            }
            //for every expansion, it counts as a use
            aliasPreArgs = aliases[command].slice(1).concat(aliasPreArgs)
            command = aliases[command][0]
        }
        writeCmdUse()
        msg.content = `${prefix}${command} ${aliasPreArgs.join(" ")}`
        let oldC = msg.content
        msg.content = msg.content.replaceAll(/(?<!\\)\{args#\}/g, String(args.length))
        msg.content = msg.content.replaceAll(/(?<!\\)\{args(\d+)?\.\.\.\}/g, (...repl) => {
            let argStart = parseInt(repl[1])
            if (argStart) {
                if(args.slice(argStart -1).join(" "))
                    return args.slice(argStart - 1).join(" ")
                return ""
            }
            else {
                return args.join(" ")
            }
        })
        msg.content = msg.content.replaceAll(/(?<!\\)\{arg(\d+)(..\d+)?\}/g, (...repl) => {
            let argNo = parseInt(repl[1])
            let argTo = parseInt(repl[2]?.replace(/\./g, ""))
            if (argTo) {
                if(args.slice(argNo  - 1, argTo).join(" "))
                    return args.slice(argNo - 1, argTo).join(" ")
                return ""
            }
            else {
                if(args[argNo - 1])
                    return args[argNo - 1]
                return ""
            }
        })
        msg.content = msg.content.replaceAll("{sender}", String(msg.author))
        msg.content = msg.content.replaceAll("{sendername}", String(msg.author.username))
        msg.content = msg.content.replaceAll("{channel}", String(msg.channel))
        if (oldC == msg.content) {
            msg.content = msg.content + ` ${args.join(" ")}`
        }
        if (typing) {
            await msg.channel.sendTyping()
        }
        rv = await doCmd(msg, true) as CommandReturn
    }
    else {
        rv = { content: `${command} does not exist` }
    }
    if (!illegalLastCmds.includes(command)) {
        lastCommand = msg
    }
    if (returnJson) {
        msg.channel.send = oldSend
        return rv;
    }
    if (redir) {
        let [place, name] = redir
        //@ts-ignore
        place[name] = () => rv?.content
        msg.channel.send = oldSend
        return
    }
    handleSending(msg, rv)
    msg.channel.send = oldSend
}

client.on("guildMemberAdd", async (m) => {
    try {
        let role = await m.guild.roles.fetch("427570287232417793")
        if (role)
            m.roles.add(role)
    }
    catch (err) {
        console.log(err)
    }
})

client.on('ready', async () => {

    client.guilds.fetch("427567510611820544").then(guild => {
        guild.members.fetch("334538784043696130").then(user => {
            user.createDM().then(dmChannel => {
                dmChannel.send("ONLINE").then(console.log).catch(console.log)
            }).catch(console.log)
        }).catch(console.log)
        if (prefix != 'd[') {
            for (let member of ["334538784043696130"]) {
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

client.on("messageDelete", async (m) => {
    if (m.author?.id != client.user?.id) {
        for (let i = 3; i >= 0; i--) {
            snipes[i + 1] = snipes[i]
        }
        snipes[0] = m
    }
})

client.on("messageDeleteBulk", async (m) => {
    purgeSnipe = m.toJSON()
    if (purgeSnipe.length > 5)
        purgeSnipe.length = 5
})

client.on("messageCreate", async (m: Message) => {
    if (ECONOMY()[m.author.id] === undefined && !m.author.bot) {
        createPlayer(m.author.id)
    }
    if (Math.random() > .60) {
        saveEconomy()
        saveItems()
    }
    let content = m.content
    if (!m.author.bot) {
        for (let match of content.matchAll(/<a?:([^:]+):([\d]+)>/g)) {
            addToEmoteUse(match[2])
        }
    }
    if (content == 'u!stop') {
        m.content = '[stop'
        content = m.content
    }
    let search;
    if ((search = content.match(/^(\d*):(\/[^\/]+\/)?(\d+,[\d\$]*)?(?:(.*)\/)*/)) && !m.author.bot) {
        let count = Number(search[1]) || Infinity
        let regexSearch = search[2]
        let rangeSearch = search[3]
        if (!regexSearch && !rangeSearch) {
            if (canEarn(m.author.id)) {
                earnMoney(m.author.id)
            }
            return
        }

        let after = search[4]
        let messages = await m.channel.messages.fetch({ limit: 100 })
        let index = -1
        let finalMessages: string[] = []
        if (regexSearch) {
            let regexpSearch: RegExp
            try {
                regexpSearch = new RegExp(regexSearch.slice(1).slice(0, regexSearch.length - 2))
            }
            catch (err) {
                await m.channel.send("Bad regex")
                return
            }
            let success = 0
            messages.forEach(async (msg) => {
                index++
                if (index == 0 || success >= count) return
                if (msg.content.match(regexpSearch)) {
                    success++
                    finalMessages.push(msg.content)

                }
            })
        }
        else if (rangeSearch) {
            let [num1, num2] = rangeSearch.split(",")
            messages.forEach(async (msg) => {
                index++
                if (!isNaN(Number(num2)) && index == Number(num1)) {
                    finalMessages.push(msg.content)
                    return
                }
                if (index >= Number(num1) && index < Number(num2)) {
                    finalMessages.push(msg.content)
                }
            })
        }
        if (after) {
            let cmds = after.split("/")
            let result = finalMessages.join("\n")
            let oldSend = m.channel.send
            m.channel.send = async (data) => {
                return m
            }
            for (let cmd of cmds) {
                m.content = `${prefix}${cmd} ${result}`
                let rv = await doCmd(m, true)
                //@ts-ignore
                if (rv?.content) result = rv.content
            }
            m.channel.send = oldSend
            finalMessages = [result]
        }
        handleSending(m, { content: finalMessages.join("\n"), allowedMentions: { parse: [] } })
    }
    if (content.slice(0, prefix.length) !== prefix) {
        if (canEarn(m.author.id)) {
            earnMoney(m.author.id)
        }
        return
    }
    await doCmd(m)
    if (canEarn(m.author.id)) {
        earnMoney(m.author.id)
    }
})

client.on("interactionCreate", async (interaction: Interaction) => {
    if (interaction.isButton() && !interaction.replied) {
        if (interaction.customId == `button:${interaction.member?.user.id}`) {
            //@ts-ignore
            if (BUTTONS[interaction.member?.user.id] !== undefined) {
                //@ts-ignore
                if (typeof BUTTONS[interaction.member?.user.id] === "string") {
                    //@ts-ignore
                    interaction.reply(String(BUTTONS[interaction.member?.user.id]))
                }
                else {
                    //@ts-ignore
                    interaction.reply(String(BUTTONS[interaction.member?.user.id]()))
                }
                //@ts-ignore
                delete BUTTONS[interaction.member?.user.id]
            }
        }
        if (interaction.customId.match(/button\.(rock|paper|scissors)/)) {
            let intendedUser = interaction.customId.split(":")[1]
            let table: { [k: string]: string } = { "rock": "paper", "paper": "scissors", "scissors": "rock" }
            if (interaction.user.id != intendedUser) {
                interaction.reply({ ephemeral: true, content: "You idiot, you already picked" })
                return
            }
            let oppChoice = interaction.customId.split(":")[0].split(".")[1]
            let [userChoice, ogUser, bet] = BUTTONS[interaction.customId].split(":")
            let ogBet = Number(bet)
            if(interaction.member?.user.id === ogUser){
                interaction.reply({content: "Ur a dingus"})
                return
            }
            if (userChoice == oppChoice) {
                interaction.reply({ content: "TIE" })
            }
            else if (table[oppChoice] == userChoice) {
                if(ogBet){
                    addMoney(ogUser, ogBet)
                    interaction.reply({ content: `<@${ogUser}> user won ${ogBet}` })
                }
                else interaction.reply({ content: `<@${ogUser}> user wins!` })
            }
            else {
                if(ogBet){
                    loseMoneyToBank(ogUser, ogBet)
                    addMoney(interaction.member?.user.id, ogBet)
                    interaction.reply({ content: `<@${interaction.member?.user.id}> user won ${ogBet}!` })
                }
                else interaction.reply({ content: `<@${interaction.member?.user.id}> user wins!` })
            }
            for (let b in BUTTONS) {
                if (b.match(/button\.(rock|paper|scissors)/)) {
                    delete BUTTONS[b]
                }
            }
        }
    }
    else if (interaction.isSelectMenu() && !interaction.replied) {
        if (interaction.customId.includes("poll")) {
            let id = interaction.customId
            let key = interaction.values[0]
            if (POLLS[id]["votes"]) {
                //checks if the user voted
                for (let key in POLLS[id]["votes"]) {
                    if (POLLS[id]["votes"][key]?.length) {
                        if (POLLS[id]["votes"][key].includes(String(interaction.member?.user.id))) {
                            return
                        }
                    }
                }

                if (POLLS[id]["votes"][key])
                    POLLS[id]["votes"][key].push(String(interaction.member?.user.id))
                else
                    POLLS[id]["votes"][key] = [String(interaction.member?.user.id)]
            }
            else POLLS[id]["votes"] = { [id]: [String(interaction.member?.user.id)] }
            let str = ""
            for (let key in POLLS[id]["votes"]) {
                str += `${key}: ${POLLS[id]["votes"][key].length}\n`
            }
            let dispId = id.slice(id.indexOf(":"))
            if (interaction.message instanceof Message) {
                if (str.length > 1990 - POLLS[id]["title"].length) {
                    let fn = generateFileName("poll-reply", interaction.member?.user.id)
                    fs.writeFileSync(fn, str)
                    await interaction.message.edit({ files: [{ attachment: fn }], content: dispId })
                    fs.rmSync(fn)
                }
                else {
                    interaction.message.edit({ content: `**${POLLS[id]["title"]}**\npoll id: ${dispId}\n${str}` })
                    interaction.reply({ content: `${interaction.values.toString()} is your vote`, ephemeral: true })
                }
            }
            else interaction.reply({ content: interaction.values.toString(), ephemeral: true })
        }
    }
    else if (interaction.isCommand() && !interaction.replied) {
        addToCmdUse(`/${interaction.commandName}`)
        if (interaction.commandName == 'attack') {
            let user = interaction.options.get("user")?.['value']
            if (!user) {
                await interaction.reply("NO USER GIVEN???")
            }
            await interaction.reply(`Attacking ${user}...`)
            await interaction.channel?.send(`${user} has been attacked by <@${interaction.user.id}>`)
        }
        else if(interaction.commandName == 'aheist'){
            //
            // {
            //     name: 'aheist',
            //     description: 'Add a heist response',
            //     options: [
            //         {
            //             type: STRING,
            //             name: "stage",
            //             required: true,
            //             description: "The stage (getting_in, robbing, escape)",
            //
            //         },
            //         {
            //             type: STRING,
            //             name: "gain-or-lose",
            //             description: "Whether to gain or lose money",
            //             required: true,
            //             choices: [
            //                 {
            //                     name: "gain",
            //                     value: "GAIN",
            //                 },
            //                 {
            //                     name: "lose",
            //                     value: "LOSE",
            //                 }
            //             ]
            //         },
            //         {
            //             type: STRING,
            //             name: "amount",
            //             description: "The amount to gain/lose",
            //             required: true,
            //             choices: [
            //                 {
            //                     name: "none",
            //                     value: "none"
            //                 },
            //                 {
            //                     name: "normal",
            //                     value: "normal",
            //                 },
            //                 {
            //                     name: "medium",
            //                     value: "medium",
            //                 },
            //                 {
            //                     name: "large",
            //                     value: "large"
            //                 }
            //             ]
            //         },
            //         {
            //             type: STRING,
            //             name: "message",
            //             description: "The message, {userx} is replaced w/ user x, {userall} with all users, and {amount} with amount",
            //             required: true
            //         },
            //         {
            //             type: STRING,
            //             name: "substage",
            //             description: "The substage to enter into after this response",
            //             required: false,
            //         },
            //         {
            //             type: STRING,
            //             name: "location",
            //             description: "The location of this response",
            //             required: false,
            //         },
            //         {
            //             type: STRING,
            //             name: "set-location",
            //             description: "The location that this response will set the game to",
            //             required: false
            //         }
            //     ]
            // }
            let userId = interaction.user.id
            let stage = interaction.options.get("stage")?.value
            if(!stage){
                interaction.reply(`${stage} is not a valid stage`)
                return
            }
            let gainOrLose = interaction.options.get("gain-or-lose")?.value as string
            if(!gainOrLose){
                interaction.reply("You messed up bubs")
                return
            }
            let users = interaction.options.get("users-to-gain-or-lose")?.value as string
            if(!users){
                interaction.reply("You messed up bubs")
                return
            }
            if(!users.match(/^(:?(\d+|all),?)+$/)){
                interaction.reply(`${users} does not match ((digit|all),)+`)
                return
            }
            let amount = interaction.options.get("amount")?.value
            if(!amount){
                interaction.reply("You messed up bubs")
                return
            }
            let message = interaction.options.get("message")?.value
            if(!message){
                interaction.reply("You messed up bubs")
                return
            }
            let text = `${userId}: ${message} AMOUNT=${amount} STAGE=${stage} ${gainOrLose.toUpperCase()}=${users}`
            let substage = interaction.options.get("nextstage")?.value
            if(substage)
                text += ` SUBSTAGE=${substage}`
            let location = interaction.options.get("location")?.value
            if(location)
                text += ` LOCATION=${location}`
            let set_location = interaction.options.get("set-location")?.value
            if(set_location)
                text += ` SET_LOCATION=${set_location}`
            fs.appendFileSync(`./command-results/heist`, `${text};END\n`)
            interaction.reply(`Added:\n${text}`)
        }
        else if (interaction.commandName == 'ping') {
            let user = interaction.options.get("user")?.value || `<@${interaction.user.id}>`
            let times = interaction.options.get("evilness")?.value || 1
            interaction.reply("Pinging...")
            SPAM_ALLOWED = true
            for (let i = 0; i < times; i++) {
                if (!SPAM_ALLOWED) break
                await interaction.channel?.send(`<@${user}> has been pinged`)
                await new Promise(res => setTimeout(res, Math.random() * 700 + 200))
            }
        }
        else if (interaction.commandName == 'img') {
            //@ts-ignore
            let rv = await commands["img"].run(interaction, [interaction.options.get("width")?.value, interaction.options.get("height")?.value, interaction.options.get("color")?.value])
            await interaction.reply(rv)
            if (rv.files) {
                for (let file of rv.files) {
                    fs.rmSync(file.attachment)
                }
            }
        }
        else if (interaction.commandName == 'help') {
            await interaction.reply({
                content: "use `[help -n -plain`, slash commands r boring, so i will not support them that much\nbegrudgingly, here is the current help file",
                files: [{
                    attachment: './help.html',
                    name: "heres some help.html",
                    description: "lmao"
                }]
            })
        }
        else if (interaction.commandName == "alias") {
            //@ts-ignore
            interaction.author = interaction.member?.user
            let arglist = [interaction.options.get("name")?.value, interaction.options.get("command")?.value].filter(v => String(v)) as string[]
            let args = interaction.options.get("text")?.value as string
            if (args) {
                arglist = arglist.concat(args.split(" "))
            }
            //@ts-ignore
            let rv = await commands['alias'].run(interaction, arglist)
            await interaction.reply(rv)
        }
        else if (interaction.commandName == 'poll') {
            //@ts-ignore
            interaction.author = interaction?.member.user
            let argList = []
            let title = interaction.options.get("title")?.value
            let options = interaction.options.get("options")?.value as string
            if (title) {
                argList.push(`-title=${title}`)
            }
            argList.push(options)
            //@ts-ignore
            await commands['poll'].run(interaction, argList)
        }
        else if (interaction.commandName == 'ccmd') {
            //@ts-ignore
            interaction.author = interaction.member?.user
            let arglist = [String(interaction.options.get("name")?.value), "say"] as string[]
            let args = interaction.options.get("text")?.value as string
            if (args) {
                arglist = arglist.concat(args.split(" "))
            }
            //@ts-ignore
            let rv = await commands['alias'].run(interaction, arglist)
            await interaction.reply(rv)
        }
        else if (interaction.commandName == 'rccmd') {
            //@ts-ignore
            interaction.author = interaction.member?.user
            //@ts-ignore
            let rv = await commands['rccmd'].run(interaction, [interaction.options.get("name")?.value])
            await interaction.reply(rv)
        }
        else if (interaction.commandName == 'say') {
            await interaction.reply(interaction.options.get("something")?.value as string | null || "How did we get here")
        }
        else if (interaction.commandName == "dad") {
            //@ts-ignore
            interaction.author = interaction.member?.user
            //@ts-ignore
            let rv = await commands['add'].run(interaction, ["distance", interaction.options.get("response")?.value])
            await interaction.reply(rv)
        }
        else if (interaction.commandName == "add-8") {
            //@ts-ignore
            interaction.author = interaction.member?.user
            let resp = interaction.options.get("response")?.value as string
            //@ts-ignore
            let rv = await commands['add'].run(interaction, ["8", resp])
            await interaction.reply(rv)
        }
        else if (interaction.commandName == "add-wordle") {
            //@ts-ignore
            interaction.author = interaction.member?.user
            let resp = interaction.options.get("word")?.value as string
            if (resp.includes(" ")) {
                await interaction.reply("no spaces")
                return
            }
            //@ts-ignore
            let rv = await commands['add'].run(interaction, ["wordle", resp])
            await interaction.reply(rv)
        }
        else if (interaction.commandName == 'rps') {
            let opponent = interaction.options.get("opponent")?.value
            let choice = interaction.options.get("choice")?.value as string
            let bet = interaction.options.get("bet")?.value as string
            let nBet = 0
            if(bet){
                nBet = calculateAmountFromString(interaction.member?.user.id, bet)
                if(!canBetAmount(interaction.member?.user.id, nBet) || nBet < 0){
                    interaction.reply({content: "You cant bet this much"})
                    return
                }
            }
            let rock = new MessageButton({ customId: `button.rock:${opponent}`, label: "rock", style: "PRIMARY" })
            let paper = new MessageButton({ customId: `button.paper:${opponent}`, label: "paper", style: "PRIMARY" })
            let scissors = new MessageButton({ customId: `button.scissors:${opponent}`, label: "scissors", style: "PRIMARY" })
            BUTTONS[`button.rock:${opponent}`] = `${choice}:${interaction.member?.user.id}:${nBet}`
            BUTTONS[`button.paper:${opponent}`] = `${choice}:${interaction.member?.user.id}:${nBet}`
            BUTTONS[`button.scissors:${opponent}`] = `${choice}:${interaction.member?.user.id}:${nBet}`
            let row = new MessageActionRow({ type: "BUTTON", components: [rock, paper, scissors] })
            interaction.reply({ components: [row], content: `<@${opponent}>, Rock, paper.... or scissors BUM BUM BUUUMMMM (idfk)` })
        }
        else if (interaction.commandName == "hangman") {
            let caseSensitive = interaction.options.get("case")?.value
            let lives = interaction.options.get("lives")?.value
            let user = interaction.options.get("user")?.value
            let cmdsArgs = []
            if (caseSensitive) {
                cmdsArgs.push("-case")
            }
            if (lives !== undefined) {
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
    else if (interaction.isUserContextMenu() && !interaction.replied) {
        addToCmdUse(`${interaction.commandName}:user`)
        if (interaction.commandName == 'ping') {
            interaction.reply(`<@${interaction.user.id}> has pinged <@${interaction.targetUser.id}> by right clicking them`)
        }
        else if (interaction.commandName == 'info') {
            const user = interaction.targetUser
            const member: GuildMember = interaction.targetMember as GuildMember
            let embed = new MessageEmbed()
            embed.setColor(member.displayColor)
            if (user.avatarURL())
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
            interaction.reply({ embeds: [embed] })
        }
    }
    else if (interaction.isMessageContextMenu() && !interaction.replied) {
        addToCmdUse(`${interaction.commandName}:message`)
        if (interaction.commandName == 'fileify') {
            let fn = generateFileName("fileify", interaction.member?.user.id)
            fs.writeFileSync(fn, interaction.targetMessage.content)
            interaction.reply({ files: [{ attachment: fn, description: "Your file, sir" }] }).then(() => {
                fs.rmSync(fn)
            })
        }
    }
})

function generateCmdUseFile() {
    let data = ""
    for (let cmd in CMDUSE) {
        data += `${cmd}:${CMDUSE[cmd]}\n`
    }
    return data
}

function generateEmoteUseFile() {
    let data = ""
    for (let emote in EMOTEUSE) {
        data += `${emote}:${EMOTEUSE[emote]}\n`
    }
    return data
}

function addToEmoteUse(emote: string) {
    if (EMOTEUSE[emote]) {
        EMOTEUSE[emote] += 1
    }
    else {
        EMOTEUSE[emote] = 1
    }
    fs.writeFileSync("emoteuse", generateEmoteUseFile())
}

function addToCmdUse(cmd: string) {
    if (CMDUSE[cmd]) {
        CMDUSE[cmd] += 1
    } else {
        CMDUSE[cmd] = 1
    }
    fs.writeFileSync("cmduse", generateCmdUseFile())
}

function writeCmdUse() {
    fs.writeFileSync("cmduse", generateCmdUseFile())
}

function loadCmdUse() {
    let cmduse: { [key: string]: number } = {}
    if (!fs.existsSync("cmduse")) {
        return {}
    }
    let data = fs.readFileSync("cmduse", "utf-8")
    for (let line of data.split("\n")) {
        if (!line) continue
        let [cmd, times] = line.split(":")
        cmduse[cmd] = parseInt(times)
    }
    return cmduse
}

function loadEmoteUse() {
    let emoteuse: { [key: string]: number } = {}
    if (!fs.existsSync("emoteuse")) {
        return {}
    }
    let data = fs.readFileSync("emoteuse", "utf-8")
    for (let line of data.split("\n")) {
        if (!line) continue
        let [emote, times] = line.split(":")
        emoteuse[emote] = parseInt(times)
    }
    return emoteuse
}

let CMDUSE = loadCmdUse()
let EMOTEUSE = loadEmoteUse()

client.login(token)
