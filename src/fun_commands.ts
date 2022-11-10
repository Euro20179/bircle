import fs from 'fs'
import cheerio from 'cheerio'
import https from 'https'
import { Stream } from 'stream'

import { ColorResolvable, GuildMember, Message, MessageActionRow, MessageButton, MessageEmbed, MessageSelectMenu } from "discord.js";
import fetch = require("node-fetch")

import economy = require("./economy")
import { client, prefix } from "./common";
import { choice, fetchUser, format, getImgFromMsgAndOpts, getOpts, rgbToHex } from "./util"
import user_options = require("./user-options")
import pet = require("./pets")
import globals = require("./globals")
import { CommandCategory, createCommand, createCommandV2, createHelpOption, getCommands, handleSending, purgeSnipe, registerCommand, runCmd, slashCommands, snipes, StatusCode } from "./common_to_commands";

const { useItem, hasItem } = require("./shop")

export default function() {
    registerCommand(

        'scorigami', createCommandV2(async ({ args, opts }) => {
            let data
            try {
                data = await fetch.default('https://nflscorigami.com/data')
            }
            catch (err) {
                return { content: "Unable to fetch  scorigami", status: StatusCode.ERR }
            }
            let json = await data.json()
            let scores = json.matrix

            let less_than = opts.getNumber("total-lt", 100000000000)
            let greater_than = opts.getNumber("total-gt", -1)

            let count = opts.getNumber("count", NaN)

            if (!isNaN(count)) {
                let results: { data: any, score: [number, number] }[] = []
                for (let i = 0; i < scores.length; i++) {
                    let range = scores[i]
                    for (let j = 0; j < range.length; j++) {
                        if (scores[i][j].count === count && i + j < less_than && i + j > greater_than) {
                            results.push({ data: scores[i][j], score: [i, j] })
                        }
                    }
                }
                let text = ""
                let result_count = opts.getNumber("result-count", 1, parseInt)
                for (let i = 0; i < result_count && i < results.length; i++) {
                    text += results[Math.floor(Math.random() * results.length)].score.join(" to ") + '\n'
                }
                return { content: text, status: StatusCode.RETURN }
            }

            let [score1_str, score2_str] = args
            let score1 = Number(score1_str)
            let score2 = Number(score2_str)
            if (score1 > score2) {
                [score1, score2] = [score2, score1]
            }

            let score = scores[score1]?.[score2]
            if (!score) {
                return { content: "Invalid score", status: StatusCode.ERR }
            }
            if (score.count === 0) {
                let closestDistance = 10000
                let closestScore = ""
                for (let i = 0; i < scores.length; i++) {
                    let range = scores[i]
                    for (let j = 0; j < range.length; j++) {
                        if (scores[i][j].count === 0) continue;
                        let win_diff = Math.abs(scores[i][j].pts_win - score2)
                        let lose_diff = Math.abs(scores[i][j].pts_lose - score1)
                        if (win_diff + lose_diff < closestDistance) {
                            closestDistance = win_diff + lose_diff
                            closestScore = `${scores[i][j].pts_win} - ${scores[i][j].pts_lose}`
                        }
                    }
                }
                return { content: `SCORIGAMI!\nNearest score: ${closestScore} (${closestDistance} difference)`, status: StatusCode.RETURN }
            }
            let first_time_embed = new MessageEmbed()
            first_time_embed.setTitle(`${score.first_team_away} @ ${score.first_team_home}`)
            first_time_embed.setDescription(`First time during ${(new Date(score.first_date)).toDateString()}`)
            first_time_embed.setFooter({ text: score.first_link })
            let last_time_embed = new MessageEmbed()
            last_time_embed.setTitle(`${score.last_team_away} @ ${score.last_team_home}`)
            last_time_embed.setDescription(`Most recent during ${(new Date(score.last_date)).toDateString()}`)
            last_time_embed.setFooter({ text: score.last_link })
            let info_embed = new MessageEmbed()
            info_embed.setTitle(`Count:  ${score.count}`)
            let nfl_years = (new Date()).getFullYear() - 1922
            let years_since_first = (new Date()).getFullYear() - (new Date(score.first_date)).getFullYear()
            let scores_per_year = score.count / nfl_years
            let scores_per_year_since_first = score.count / years_since_first
            let drought = new Date(Date.now() - (new Date(score.last_date)).getTime())
            let years = drought.getFullYear() - 1970
            console.log(drought)
            info_embed.addFields([
                { inline: true, name: "Times per year", value: String(scores_per_year) },
                { inline: true, name: "Times per year since first occurance", value: String(scores_per_year_since_first) },
                { inline: false, name: "Drought", value: `${years} years` },
            ])

            return { embeds: [info_embed, first_time_embed, last_time_embed], status: StatusCode.RETURN }
        }, CommandCategory.FUN),
    )

    registerCommand(
        "count", createCommand(async (msg, args, _, __, ___, rec, disable) => {
            if (msg.channel.id !== '468874244021813258') {
                return { content: "You are not in the counting channel", status: StatusCode.ERR }
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
            if (count_text.startsWith(prefix)) {
                let rv = await runCmd(msg, count_text.slice(prefix.length), rec, true, disable)
                if (!rv) {
                    return { delete: true, noSend: true, status: StatusCode.RETURN }
                }
                rv['delete'] = true
                return rv
            }
            return { content: count_text, delete: true, status: StatusCode.RETURN, do_change_cmd_user_expansion: false }
        }, CommandCategory.FUN),
    )

    registerCommand(
        "stock", {
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
            await handleSending(msg, { content: "Getting data", status: StatusCode.INFO }, sendCallback)
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
    )

    registerCommand(
        "feed-pet", {
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
    )

    registerCommand(
        "lottery", {
        run: async (msg, _args, sendCallback) => {
            return { content: `The lottery pool is: ${economy.getLottery().pool * 2 + economy.calculateAmountOfMoneyFromString(msg.author.id, economy.economyLooseGrandTotal().total, "0.2%")}`, status: StatusCode.RETURN }
        }, category: CommandCategory.FUN
    },
    )

    registerCommand(
        "6", {
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
                if (aurl) {
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
    )

    registerCommand(
        "wiki", createCommand(async (msg, _, sb, opts, args) => {
            let search = args.join(" ").toLowerCase().replaceAll("/", "%2f")
            for (let file of fs.readdirSync("./wiki")) {
                let name = file.toLowerCase()
                if (name.replace(".txt", "") === search) {
                    return {
                        content: fs.readFileSync(`./wiki/${file}`, "utf-8"),
                        status: StatusCode.RETURN
                    }
                }
            }
            return { content: "No results", status: StatusCode.ERR }
        }, CommandCategory.FUN),
    )

    registerCommand(
        "search-wiki", createCommand(async (msg, _, sb, opts, args) => {
            let search = args.join(" ").toLowerCase()
            let results: { [key: string]: number } = {}
            for (let file of fs.readdirSync("./wiki")) {
                file = file.replaceAll("%2f", "/").slice(0, -4).toLowerCase()
                // let accuracy = 0
                // let sequence = 1
                let lastMatch = 0;
                let matchIndicies: number[] = []
                for (let i = 0; i < search.length; i++) {
                    // let foundMatch = false
                    for (let j = lastMatch; j < file.length; j++) {
                        if (file[j] === search[i]) {
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
                results[file] = total
            }
            if (opts['all']) {
                return { content: Object.entries(results).sort((a, b) => b[1] - a[1]).map(v => `**${v[0]}** (${v[1]})`).join("\n"), status: StatusCode.RETURN }
            }
            return { content: Object.entries(results).sort((a, b) => b[1] - a[1]).filter(v => v[1] > 0).map(v => `**${v[0]}** (${v[1]})`).join("\n"), status: StatusCode.RETURN }
        }, CommandCategory.FUN),
    )

    registerCommand(
        "awiki", createCommand(async (msg, args) => {
            let [title, ...txt] = args.join(" ").split("|")
            title = title.trim().replaceAll("/", "%2f")
            let text = txt.join("|")
            if (fs.existsSync(`./wiki/${title.trim()}.txt`)) {
                return { content: `${title} already exists`, status: StatusCode.ERR }
            }
            fs.writeFileSync(`./wiki/${title.trim()}.txt`, text)
            return { content: `created a page called: ${title}`, status: StatusCode.RETURN }

        }, CommandCategory.FUN),
    )

    registerCommand(
        "ewiki", createCommand(async (msg, _, cb, opts, args) => {
            let [page, type, ...text] = args
            let valid_types = ["new", "n", "append", "a"]
            type = type.toLowerCase()
            if (!valid_types.includes(type)) {
                return { content: `type must be one of new, append`, status: StatusCode.ERR }
            }
            if (!fs.existsSync(`./wiki/${page}.txt`)) {
                return { content: `${page} does not exist`, status: StatusCode.ERR }
            }
            if (type === "n" || type === "new") {
                fs.writeFileSync(`./wiki/${page}.txt`, text.join(" "))
                return { content: `${page} rewritten`, status: StatusCode.ERR }
            }
            else if (type === "a" || type === "append") {
                let oldData = fs.readFileSync(`./wiki/${page}.txt`, "utf-8")
                fs.writeFileSync(`./wiki/${page}.txt`, oldData + "\n" + args.join(" "))
                return { content: `${page} appended to`, status: StatusCode.ERR }
            }
            return { content: "How did we get here (ewiki)", status: StatusCode.ERR }
        }, CommandCategory.FUN),
    )

    registerCommand(
        "wikipedia", {
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
                        let rv = await commands['wikipedia'].run(msg, [`-full=/wiki/${req.headers.location?.split("/wiki/")[1]}`])
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
                    await (getCommands()['wikipedia'] as Command).run(msg, [`-full=/wiki/${resp.headers.get("location")?.split("/wiki/")[1]}`], sendCallback, {}, args, 1)
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
    )

    registerCommand(
        "piglatin", {
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
    )

    registerCommand(
        "echo", {
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
            if (opts['status']) {
                let status = {
                    "return": StatusCode.RETURN,
                    "err": StatusCode.ERR,
                    "error": StatusCode.ERR,
                    "prompt": StatusCode.PROMPT,
                    "info": StatusCode.INFO,
                    "warning": StatusCode.WARNING
                }[String(opts['status']).toString()]
                if (status) {
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
    )

    registerCommand(
        "button", {
        run: async (msg, _, sendCallback, opts, args) => {
            let content = opts['content']
            let delAfter = NaN
            if (opts['timealive'])
                delAfter = parseInt(String(opts['timealive']))
            if (typeof content === 'boolean') {
                content = `button:${msg.author.id}`
            }
            let text = args.join(" ") || "hi"
            let emoji = opts['emoji'] ? String(opts['emoji']) : undefined
            let button = new MessageButton({ emoji: emoji, customId: `button:${msg.author.id}`, label: text, style: "PRIMARY" })
            let row = new MessageActionRow({ type: "BUTTON", components: [button] })
            let m = await handleSending(msg, { components: [row], content: content, status: StatusCode.PROMPT }, sendCallback)
            let collector = m.createMessageComponentCollector({ filter: interaction => interaction.customId === `button:${msg.author.id}` && interaction.user.id === msg.author.id || opts['anyone'] === true, time: 30000 })
            collector.on("collect", async (interaction) => {
                if (interaction.user.id !== msg.author.id && opts['anyone'] !== true) {
                    return
                }
                if (opts['say']) {
                    await interaction.reply({ content: String(opts['say']).trim() || "_ _" })
                }
                else {
                    await interaction.reply({ content: text.trim() || "_ _" })
                }
            })
            setTimeout(() => {
                button.setDisabled(true)
                m.edit({ components: [row], content: content ? String(content) : undefined })
                collector.stop()
            }, Number(opts['stop-button-after']) * 1000 || 5000)
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
                },
                "emoji": {
                    description: "The emoji on the button",
                },
                "stop-button-after": {
                    description: "Disable the button after x seconds"
                }
            }
        },
        category: CommandCategory.FUN
    },
    )

    registerCommand(
        "poll", {
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
                return { status: StatusCode.ERR, content: "no options given" }
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
    )

    registerCommand(
        "pfp", {
        run: async (msg, _, _sendCallback, opts, args) => {
            let link = args[0]
            if (!link) {
                link = String(getImgFromMsgAndOpts(opts, msg))
            }
            if (!link)
                return { content: "no link given", status: StatusCode.ERR }
            try {
                await client.user?.setAvatar(link)
            }
            catch (err) {
                console.log(err)
                return { content: "could not set pfp", status: StatusCode.ERR }
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
    )

    registerCommand(
        "rt", {
        run: async (msg, _, sendCallback, opts, args) => {
            if (opts['t']) {
                handleSending(msg, { content: "SEND A MESSAGE NOWWWWWWWWWWWWWWWWWWWWWWWWW", status: -1 }, sendCallback).then(_m => {
                    try {
                        let collector = msg.channel.createMessageCollector({ filter: m => m.author.id == msg.author.id, time: 3000 })
                        let start = Date.now()
                        collector.on("collect", async (_m) => {
                            await handleSending(msg, { content: `${Date.now() - start}ms`, status: StatusCode.RETURN }, sendCallback)
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
    )

    registerCommand(
        "nick", {
        //@ts-ignore
        run: async (msg, _, sendCallback, opts, args) => {
            if (args.join(" ").length > 31) {
                return { content: "Too long", status: StatusCode.ERR }
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
    )

    registerCommand(
        "sport", {
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
                        await handleSending(msg, { content: "No results", status: StatusCode.ERR }, sendCallback)
                        return
                    }
                    homeTeam = homeTeam.match(/div class=".*?">(.*?)<\//)[1].replace(/<(?:span|div) class=".*?">/, "")
                    awayTeam = awayTeam.match(/div class=".*?">(.*?)<\//)[1].replace(/<(?:span|div) class=".*?">/, "")
                    let homeScore, awayScore
                    try {
                        [homeScore, awayScore] = html.match(/<div class="BNeawe deIvCb AP7Wnd">(\d*?)<\/div>/g)
                    }
                    catch (err) {
                        await handleSending(msg, { content: "Failed to get data", status: StatusCode.ERR }, sendCallback)
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
                    await handleSending(msg, { embeds: [embed], status: StatusCode.RETURN }, sendCallback)
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
    )

    registerCommand(
        "edit", {
        run: async (msg, args, sendCallback) => {
            let opts;
            [opts, args] = getOpts(args)
            if (opts['d'] && msg.deletable) await msg.delete()
            let edits = args.join(" ").split("|")
            let message
            try {
                message = await handleSending(msg, { content: edits[0], status: StatusCode.INFO }, sendCallback)
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
                        message = await handleSending(msg, { content: edit.slice(1), status: StatusCode.INFO }, sendCallback)
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
                        return { noSend: true, status: StatusCode.ERR }
                    }
                    await handleSending(msg, { content: `Could not edit message with: ${edit}`, status: StatusCode.ERR }, sendCallback)
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
    )

    registerCommand(
        "choose", {
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
    )

    registerCommand(
        "weather", {
        run: async (msg: Message, _: ArgumentList, sendCallback, opts, args) => {
            let url = "https://www.wttr.in"
            let town = args.join(" ") || "tokyo"

            let data = await (await fetch.default(`${url}/${encodeURI(town)}?format=1`)).text()
            let tempData = data.match(/(\S*)\s*[+-](\d+).(C|F)/)
            if (!tempData) {
                return { content: "Could not find weather", status: StatusCode.ERR }
            }
            let condition, temp, unit
            try {
                [condition, temp, unit] = tempData.slice(1, 4)
            }
            catch (err) {
                return { content: "Could not find weather :(", status: StatusCode.ERR }
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
            if (opts['fmt']) {
                return { content: format(String(opts['fmt']), { f: String(tempF), c: String(tempC), g: color, s: condition, l: town }), status: StatusCode.RETURN }
            }
            return { embeds: [embed], status: StatusCode.RETURN }
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
    )

    registerCommand(
        "ship", {
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
    )

    registerCommand(
        "aship", {
        run: async (msg, args, sendCallback) => {
            return await (getCommands()['add'] as Command).run(msg, ["ship", args.join(" ")], sendCallback, {}, ["ship", args.join(" ")], 1)
        },
        help: {
            info: "{u1} is the first user, {u2} is the second user, {ship} is the ship name for the users"
        },
        category: CommandCategory.FUN
    },
    )

    registerCommand(
        "spasm", {
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
            await handleSending(msg, { content: `starting ${id}`, status: StatusCode.INFO }, sendCallback)
            globals.SPAMS[id] = true
            let message = await handleSending(msg, { content: sendText, status: StatusCode.RETURN }, sendCallback)
            while (globals.SPAMS[id] && timesToGo--) {
                if (message.deletable) await message.delete()
                message = await handleSending(msg, { content: sendText, status: StatusCode.RETURN }, sendCallback)
                await new Promise(res => setTimeout(res, Math.random() * 700 + 200))
            }
            delete globals.SPAMS[id]
            return { content: "done", status: StatusCode.INFO }
        }, category: CommandCategory.FUN,
        help: {
            info: "Repeatedly send and delete a message"
        }
    },
    )

    registerCommand(
        "udict", {
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
    )

    registerCommand(
        "reddit", {
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
                //@ts-ignore
                if (item.attribs?.href) {
                    //@ts-ignore
                    dataToAdd['link'] = `https://libreddit.spike.codes${item.attribs?.href}`
                }
                foundData.push(dataToAdd)
            }
            let post = choice(foundData)
            let embed = new MessageEmbed()
            embed.setTitle(post.text || "None")
            embed.setFooter({ text: post.link || "None" })
            return { embeds: [embed], status: StatusCode.RETURN }
        }, category: CommandCategory.FUN,
        help: {
            info: "Gets a random post  from a subreddit"
        }
    },
    )

    registerCommand(
    "8", {
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
    )

    registerCommand(
    "distance", {
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
    )

    registerCommand(
    "list-cmds", {
        run: async (_msg: Message, _args: ArgumentList, sendCallback) => {
            let values = ''
            let typeConv = { 1: "chat", 2: "user", 3: "message" }
            for (let cmd in getCommands()) {
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
        category: CommandCategory.FUN,
        help: {
            info: "List all builtin commands"
        }
    },
    )

    registerCommand(
    "psnipe", {
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
    )

    registerCommand(
    "snipe", {
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
    )
}

