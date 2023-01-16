///<reference path="src/types.d.ts" />
import fs = require("fs")

//TODO: add ArgumentList class to interact with args
//can be added to commandV2 as arguments in the object given to the fn

import http from 'http'

const translate = require("@iamtraction/google-translate")


import { Message, MessageEmbed, Interaction, MessageButton, MessageActionRow, GuildMember, TextChannel, MessageActivity, Collection, MessageFlags, MessageMentions, ReactionManager, InteractionReplyOptions, User } from "discord.js"

const { REST } = require('@discordjs/rest')
const { Routes } = require("discord-api-types/v9")

import pet = require("./src/pets")
require("./src/commands")
import command_commons = require("./src/common_to_commands")

let commands = command_commons.getCommands()

import globals = require("./src/globals")
import timer from "./src/timer"
import { URLSearchParams } from "url"
import { format } from "./src/util"

const economy = require("./src/economy")
const { generateFileName } = require("./src/util")
const { saveItems, hasItem } = require("./src/shop")

const user_options = require("./src/user-options")

let { client, purgeSnipe, prefix, BLACKLIST, saveVars } = require("./src/common")

const rest = new REST({ version: "9" }).setToken(globals.token);

Object.defineProperty(User.prototype, "balance", {
    "get": function() {
        return economy.calculateAmountFromString(this.id, "100%")
    }
});
Object.defineProperty(User.prototype, "loan", {
    "get": function() {
        return economy.calculateLoanAmountFromString(this.id, "100%")
    }
});

Object.defineProperty(User.prototype, "economyData", {
    "get": function() {
        return economy.getEconomy()[this.id]
    }
});
Object.defineProperty(User.prototype, "netWorth", {
    "get": function() {
        return economy.playerLooseNetWorth(this.id)
    }
});

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationGuildCommands(globals.CLIENT_ID, globals.GUILD_ID),
            { body: command_commons.slashCommands },
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();


//as the name implies this  function does  a command based on the contents of a  message
//TODO: Eventually I would  like to make it so that all that is necessary here, is to pass a command

client.on("guildMemberAdd", async (m: Message) => {
    try {
        let role = await m.guild?.roles.fetch("427570287232417793")
        if (role)
            m.member?.roles.add(role)
    }
    catch (err) {
        console.log(err)
    }
})

client.on('ready', async () => {
    Object.keys(user_options.USER_OPTIONS).forEach((v) => {
        if (user_options.getOpt(v, "dm-when-online", "false") !== "false") {
            client.users.fetch(v).then((u: any) => {
                u.createDM().then((channel: any) => {
                    channel.send(user_options.getOpt(v, "dm-when-online", "ONLINE")).catch(console.log)
                })
            }).catch(console.log)
        }
    })
    console.log("ONLINE")
})

client.on("messageDelete", async (m: Message) => {
    if (m.author?.id != client.user?.id) {
        for (let i = 3; i >= 0; i--) {
            command_commons.snipes[i + 1] = command_commons.snipes[i]
        }
        command_commons.snipes[0] = m
    }
})

client.on("messageDeleteBulk", async (m: any) => {
    purgeSnipe = m.toJSON()
    if (purgeSnipe.length > 5)
        purgeSnipe.length = 5
})

async function handleChatSearchCommandType(m: Message, search: RegExpMatchArray) {
    let count = Number(search[1]) || Infinity
    let regexSearch = search[2]
    let rangeSearch = search[3]
    if (!regexSearch && !rangeSearch) {
        return false
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
            return false
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
        m.channel.send = async (_data) => {
            return m
        }
        for (let cmd of cmds) {
            let rv = await command_commons.runCmd(m, `${cmd} ${result}`, 0, true)
            //@ts-ignore
            if (rv?.content) result = rv.content
        }
        m.channel.send = oldSend
        finalMessages = [result]
    }
    command_commons.handleSending(m, { content: finalMessages.join("\n"), allowedMentions: { parse: [] }, status: 0 })
}

const japRegex = /[\u{2E80}-\u{2FD5}\u{3000}-\u{303F}\u{3041}-\u{3096}\u{30A0}-\u{30FF}\u{31F0}-\u{31FF}\u{3220}-\u{3243}\u{3280}-\u{337F}\u{3400}-\u{4DB5}\u{4E00}-\u{9FCB}\u{F900}-\u{FA6A}\u{FF5F}-\u{FF9F}]/u


let shouldDeleteTranslationMessage = false
let lastTranslation = "__BIRCLE_UNDEFINED__"

function messageContainsText(msg: Message, text: string) {
    text = text.toLowerCase()
    if (msg.content.toLowerCase().includes(text))
        return true
    if (msg.components.some(value => {
        return value.components.some(com => {
            if (com.type === "BUTTON") {
                return com.label?.toLowerCase().includes(text)
            }
            return false
        })
    })) {
        return true
    }
}

client.on("messageUpdate", async (m_old: Message, m: Message) => {
    if (m.author.bot && (lastTranslation.toLowerCase() === m.content.toLowerCase() || messageContainsText(m, lastTranslation))){
        if (m.deletable)
            m.delete().catch(console.log)
        shouldDeleteTranslationMessage = false
        //lastTranslation = "__BIRCLE_UNDEFINED__"
    }
})

//For auto translate delete
let lastMessageAuthor: string | null = null

let translateRegex = /^Tr[4a]nslation: ".*" Sent by: ".*" Translated from: .*$/

client.on("messageCreate", async (m: Message) => {
    if(m.author.bot && m.content.match(translateRegex) && user_options.getOpt(lastMessageAuthor || m.author.id, "delete-auto-translate") === "true"){
        if(m.deletable) await m.delete()
    }

    if(m.content.includes(`${prefix}NEW_REGEX `) && m.author.id === "334538784043696130"){
        translateRegex = new RegExp(m.content.slice(`${prefix}NEW_REGEX `.length))
    }

    lastMessageAuthor = m.author.id

    if (m.member?.roles.cache.find(v => v.id == '1031064812995760233')) {
        return
    }
    if (m.channel.type !== "DM" && m.guild && m.guild?.id !== globals.GUILD_ID)
        return
    if (economy.getEconomy()[m.author.id] === undefined && !m.author.bot) {
        economy.createPlayer(m.author.id)
    }

    let local_prefix = user_options.getOpt(m.author.id, "prefix", prefix)

    if (!m.author.bot && (m.mentions.members?.size || 0) > 0) {
        //@ts-ignore
        for (let i = 0; i < m.mentions.members.size; i++) {
            //@ts-ignore
            let pingresponse = user_options.getOpt(m.mentions.members.at(i)?.user.id, "pingresponse", null)
            if (pingresponse) {
                pingresponse = pingresponse.replaceAll("{pinger}", `<@${m.author.id}>`)
                if (command_commons.isCmd(pingresponse, prefix)) {
                    await command_commons.runCmd(m, pingresponse.slice(prefix.length), 0, false, command_commons.generateDefaultRecurseBans())
                }
                else {
                    m.channel.send(pingresponse)
                }
            }
        }
    }

    if (m.content === `<@${client.user.id}>`) {
        await command_commons.handleSending(m, { content: `The prefix is: ${local_prefix}`, status: 0 })
    }

    //saves economy stuff 45% of the time
    if (Math.random() > .55) {
        economy.saveEconomy()
        saveItems()
        pet.savePetData()
    }

    let content = m.content

    if (!m.author.bot) {
        //checks for emotes
        for (let match of content.matchAll(/<a?:([^:]+):([\d]+)>/g)) {
            globals.addToEmoteUse(match[2])
        }
    }

    //if any other bots have an equivelent to [spam they should add u!stop
    if (content == 'u!stop') {
        m.content = '[stop'
        content = m.content
    }
    if (content.startsWith('u!eval')) {
        m.content = `${prefix}calc -python ` + content.slice('u!eval'.length)
        content = m.content
    }
    if (content.startsWith("s!") && local_prefix !== prefix) {
        user_options.unsetOpt(m.author.id, 'prefix')
        local_prefix = prefix
        m.content = m.content.replace("s!", prefix)
        content = m.content
    }

    let search;
    if ((search = content.match(/^(\d*):(\/[^\/]+\/)?(\d+,[\d\$]*)?(?:(.*)\/)*/)) && !m.author.bot) {
        await handleChatSearchCommandType(m, search)
    }
    if (content.slice(0, local_prefix.length) == local_prefix) {
        if (m.content === `${local_prefix}END` && m.author.id === "334538784043696130") {
            server.close()
        }
        for (let cmd of content.split(`\n${local_prefix};\n`)) {
            m.content = `${cmd}`
            let c = m.content.slice(local_prefix.length)
            try {
                await command_commons.runCmd(m, c)
            }
            catch (err) {
                console.error(err)
                await m.channel.send({ content: `Command failure: **${cmd}**\n\`\`\`${err}\`\`\`` })
            }
        }
        globals.writeCmdUse()
    }
    if (economy.canEarn(m.author.id)) {
        let deaths = pet.damageUserPetsRandomly(m.author.id)
        if (deaths.length)
            await m.channel.send(`<@${m.author.id}>'s ${deaths.join(", ")} died`)
        let ap = pet.getActivePet(m.author.id)
        let percent = 1.001
        let pcount = Number(hasItem(m.author.id, "puffle chat"))
        percent += .0001 * pcount
        if (ap == 'cat') {
            economy.earnMoney(m.author.id, percent + .002)
        }
        else {
            economy.earnMoney(m.author.id, percent)
        }
        if (ap == 'puffle') {
            let stuff = await pet.PETACTIONS['puffle'](m)
            if (stuff) {
                let findMessage = user_options.getOpt(m.author.id, "puffle-find", "{user}'s {name} found: {stuff}")
                await command_commons.handleSending(m, { content: format(findMessage, { user: `<@${m.author.id}>`, name: pet.hasPet(m.author.id, ap).name, stuff: stuff.money ? `${user_options.getOpt(m.author.id, "currency-sign", "$")}${stuff.money}` : stuff.items.join(", ") }), status: command_commons.StatusCode.INFO, recurse: command_commons.generateDefaultRecurseBans() })
            }
        }
    }
})

client.on("interactionCreate", async (interaction: Interaction) => {
    if (interaction?.user?.username === undefined) {
        return
    }
    if (interaction.isButton() && !interaction.replied) {
        if (interaction.customId.match(/button\.(rock|paper|scissors)/)) {
            let intendedUser = interaction.customId.split(":")[1]
            let table: { [k: string]: string } = { "rock": "paper", "paper": "scissors", "scissors": "rock" }
            if (interaction.user.id != intendedUser) {
                interaction.reply({ ephemeral: true, content: "You idiot, you already picked" }).catch(console.error)
                return
            }
            let oppChoice = interaction.customId.split(":")[0].split(".")[1]
            if (typeof globals.BUTTONS[interaction.customId] !== 'string') {
                interaction.reply({ content: "Something went wrong" }).catch(console.error)
                return
            }
            //@ts-ignore
            let [userChoice, ogUser, bet] = globals.BUTTONS[interaction.customId].split(":")
            let ogBet = Number(bet)
            if (interaction.member?.user.id === ogUser) {
                interaction.reply({ content: "Ur a dingus" }).catch(console.error)
                return
            }
            if (userChoice == oppChoice) {
                interaction.reply({ content: "TIE" }).catch(console.error)
            }
            else if (table[oppChoice] == userChoice) {
                if (ogBet) {
                    economy.addMoney(ogUser, ogBet)
                    interaction.reply({ content: `<@${ogUser}> user won ${ogBet}` }).catch(console.error)
                }
                else interaction.reply({ content: `<@${ogUser}> user wins!` }).catch(console.error)
            }
            else {
                if (ogBet) {
                    economy.loseMoneyToBank(ogUser, ogBet)
                    if (interaction.member?.user.id) {
                        //@ts-ignore
                        economy.addMoney(interaction.member?.user.id, ogBet)
                        interaction.reply({ content: `<@${interaction.member?.user.id}> user won ${ogBet}!` }).catch(console.error)
                    }
                }
                else interaction.reply({ content: `<@${interaction.member?.user.id}> user wins!` }).catch(console.error)
            }
            for (let b in globals.BUTTONS) {
                if (b.match(/button\.(rock|paper|scissors)/)) {
                    delete globals.BUTTONS[b]
                }
            }
        }
    }
    else if (interaction.isSelectMenu() && !interaction.replied) {
        if (interaction.customId.includes("poll")) {
            let id = interaction.customId
            let key = interaction.values[0]
            if (globals.POLLS[id]["votes"]) {
                //checks if the user voted
                for (let key in globals.POLLS[id]["votes"]) {
                    if (globals.POLLS[id]["votes"][key]?.length) {
                        if (globals.POLLS[id]["votes"][key].includes(String(interaction.member?.user.id))) {
                            return
                        }
                    }
                }

                if (globals.POLLS[id]["votes"][key])
                    globals.POLLS[id]["votes"][key].push(String(interaction.member?.user.id))
                else
                    globals.POLLS[id]["votes"][key] = [String(interaction.member?.user.id)]
            }
            else globals.POLLS[id]["votes"] = { [id]: [String(interaction.member?.user.id)] }
            let str = ""
            for (let key in globals.POLLS[id]["votes"]) {
                str += `${key}: ${globals.POLLS[id]["votes"][key].length}\n`
            }
            let dispId = id.slice(id.indexOf(":"))
            if (interaction.message instanceof Message) {
                if (str.length > 1990 - globals.POLLS[id]["title"].length) {
                    let fn = generateFileName("poll-reply", interaction.member?.user.id)
                    fs.writeFileSync(fn, str)
                    await interaction.message.edit({ files: [{ attachment: fn }], content: dispId })
                    fs.rmSync(fn)
                }
                else {
                    interaction.message.edit({ content: `**${globals.POLLS[id]["title"]}**\npoll id: ${dispId}\n${str}` })
                    interaction.reply({ content: `${interaction.values.toString()} is your vote`, ephemeral: true }).catch(console.error)
                }
            }
            else interaction.reply({ content: interaction.values.toString(), ephemeral: true }).catch(console.error)
        }
    }
    else if (interaction.isCommand() && !interaction.replied) {
        if (BLACKLIST[interaction.member?.user.id as string]?.includes(interaction.commandName)) {
            interaction.reply({ content: "You are blacklisted from this" }).catch(console.error)
            return
        }
        globals.addToCmdUse(`/${interaction.commandName}`)
        if (interaction.commandName == 'attack') {
            let user = interaction.options.get("user")?.['value']
            if (!user) {
                interaction.reply("NO USER GIVEN???").catch(console.error)
                return
            }
            interaction.reply(`Attacking ${user}...`).catch(console.error)
            interaction.channel?.send(`${user} has been attacked by <@${interaction.user.id}>`).catch(console.error)
        }
        else if (interaction.commandName == 'aheist') {
            let userId = interaction.user.id
            let stage = interaction.options.get("stage")?.value
            if (!stage) {
                interaction.reply(`${stage} is not a valid stage`).catch(console.error)
                return
            }
            let gainOrLose = interaction.options.get("gain-or-lose")?.value as string
            if (!gainOrLose) {
                interaction.reply("You messed up bubs").catch(console.error)
                return
            }
            let users = interaction.options.get("users-to-gain-or-lose")?.value as string
            if (!users) {
                interaction.reply("You messed up bubs").catch(console.error)
                return
            }
            if (!users.match(/^(:?(\d+|all),?)+$/)) {
                interaction.reply(`${users} does not match ((digit|all),)+`).catch(console.error)
                return
            }
            let amount = interaction.options.get("amount")?.value
            if (!amount) {
                interaction.reply("You messed up bubs").catch(console.error)
                return
            }
            let message = interaction.options.get("message")?.value
            if (!message) {
                interaction.reply("You messed up bubs").catch(console.error)
                return
            }
            let text = `${userId}: ${message} AMOUNT=${amount} STAGE=${stage} ${gainOrLose.toUpperCase()}=${users}`
            let substage = interaction.options.get("nextstage")?.value
            if (substage)
                text += ` SUBSTAGE=${substage}`
            let location = interaction.options.get("location")?.value
            if (location)
                text += ` LOCATION=${location}`
            let set_location = interaction.options.get("set-location")?.value
            if (set_location)
                text += ` SET_LOCATION=${set_location}`
            let button_response = interaction.options.get("button-response")?.value
            if (button_response) {
                text += ` BUTTONCLICK=${button_response} ENDBUTTONCLICK`
            }
            let condition = interaction.options.get("if")?.value
            if (condition) {
                text += ` IF=${condition}`
            }
            fs.appendFileSync(`./command-results/heist`, `${text};END\n`)
            interaction.reply(`Added:\n${text}`).catch(console.error)
        }
        else if (interaction.commandName == 'ping') {
            let user = interaction.options.get("user")?.value || `<@${interaction.user.id}>`
            let times = interaction.options.get("evilness")?.value || 1
            interaction.reply("Pinging...").catch(console.error)
            globals.SPAM_ALLOWED = true
            for (let i = 0; i < times; i++) {
                if (!globals.SPAM_ALLOWED) break
                await interaction.channel?.send(`<@${user}> has been pinged`)
                await new Promise(res => setTimeout(res, Math.random() * 700 + 200))
            }
        }
        else if (interaction.commandName == 'img') {
            //@ts-ignore
            let rv = await command_commons.commands["img"].run(interaction, [interaction.options.get("width")?.value, interaction.options.get("height")?.value, interaction.options.get("color")?.value], interaction.channel.send.bind(interaction.channel))
            interaction.reply(rv as InteractionReplyOptions).catch(console.error)
            if (rv.files) {
                for (let file of rv.files) {
                    fs.rmSync(file.attachment)
                }
            }
        }
        else if (interaction.commandName == 'help') {
            interaction.reply({
                content: "use `[help -n -plain`, slash commands r boring, so i will not support them that much\nbegrudgingly, here is the current help file",
                files: [{
                    attachment: './help.html',
                    name: "heres some help.html",
                    description: "lmao"
                }]
            }).catch(console.error)
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
            let rv = await command_commons.commands['alias'].run(interaction, arglist, interaction.channel.send.bind(interaction.channel), interaction.channel.send.bind(interaction.channel))
            interaction.reply(rv as InteractionReplyOptions).catch(console.error)
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
            await command_commons.commands['poll'].run(interaction, argList, interaction.channel.send.bind(interaction.channel))
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
            let rv = await command_commons.commands['alias'].run(interaction, arglist, interaction.channel.send.bind(interaction.channel))
            interaction.reply(rv as InteractionReplyOptions).catch(console.error)
        }
        else if (interaction.commandName == 'rccmd') {
            //@ts-ignore
            interaction.author = interaction.member?.user
            //@ts-ignore
            let rv = await command_commons.commands['rccmd'].run(interaction, [interaction.options.get("name")?.value], interaction.channel.send.bind(interaction.channel))
            interaction.reply(rv as InteractionReplyOptions).catch(console.error)
        }
        else if (interaction.commandName == 'say') {
            interaction.reply(interaction.options.get("something")?.value as string | null || "How did we get here").catch(console.error)
        }
        else if (interaction.commandName == "dad") {
            //@ts-ignore
            interaction.author = interaction.member?.user
            //@ts-ignore
            let rv = await command_commons.commands['add'].run(interaction, ["distance", interaction.options.get("response")?.value], interaction.channel.send.bind(interaction.channel))
            interaction.reply(rv as InteractionReplyOptions).catch(console.error)
        }
        else if (interaction.commandName == "add-8") {
            //@ts-ignore
            interaction.author = interaction.member?.user
            let resp = interaction.options.get("response")?.value as string
            //@ts-ignore
            let rv = await command_commons.commands['add'].run(interaction, ["8", resp], interaction.channel.send.bind(interaction.channel))
            interaction.reply(rv as InteractionReplyOptions).catch(console.error)
        }
        else if (interaction.commandName == "add-wordle") {
            //@ts-ignore
            interaction.author = interaction.member?.user
            let resp = interaction.options.get("word")?.value as string
            if (resp.includes(" ")) {
                interaction.reply("no spaces").catch(console.error)
                return
            }
            //@ts-ignore
            let rv = await command_commons.commands['add'].run(interaction, ["wordle", resp], interaction.channel.send.bind(interaction.channel))
            interaction.reply(rv as InteractionReplyOptions).catch(console.error)
        }
        else if (interaction.commandName == 'rps') {
            let opponent = interaction.options.get("opponent")?.value
            let choice = interaction.options.get("choice")?.value as string
            let bet = interaction.options.get("bet")?.value as string
            let nBet = 0
            if (bet) {
                if (interaction.member?.user.id) {
                    nBet = economy.calculateAmountFromString(interaction.member.user.id, bet)
                    if (!economy.canBetAmount(interaction.member.user.id, nBet) || nBet < 0) {
                        interaction.reply({ content: "You cant bet this much" }).catch(console.error)
                        return
                    }
                }
            }
            let rock = new MessageButton({ customId: `button.rock:${opponent}`, label: "rock", style: "PRIMARY" })
            let paper = new MessageButton({ customId: `button.paper:${opponent}`, label: "paper", style: "PRIMARY" })
            let scissors = new MessageButton({ customId: `button.scissors:${opponent}`, label: "scissors", style: "PRIMARY" })
            globals.BUTTONS[`button.rock:${opponent}`] = `${choice}:${interaction.member?.user.id}:${nBet}`
            globals.BUTTONS[`button.paper:${opponent}`] = `${choice}:${interaction.member?.user.id}:${nBet}`
            globals.BUTTONS[`button.scissors:${opponent}`] = `${choice}:${interaction.member?.user.id}:${nBet}`
            let row = new MessageActionRow({ type: "BUTTON", components: [rock, paper, scissors] })
            interaction.reply({ components: [row], content: `<@${opponent}>, Rock, paper.... or scissors BUM BUM BUUUMMMM (idfk)` }).catch(console.error)
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
            let rv = await command_commons.commands['hangman'].run(interaction, cmdsArgs, interaction.channel.send.bind(interaction.channel))
            interaction.reply(rv as InteractionReplyOptions).catch(console.error)
        }
    }
    else if (interaction.isUserContextMenu() && !interaction.replied) {
        globals.addToCmdUse(`${interaction.commandName}:user`)
        if (interaction.commandName == 'ping') {
            interaction.reply(`<@${interaction.user.id}> has pinged <@${interaction.targetUser.id}> by right clicking them`).catch(console.error)
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
            interaction.reply({ embeds: [embed] }).catch(console.error)
        }
    }
    else if (interaction.isMessageContextMenu() && !interaction.replied) {
        globals.addToCmdUse(`${interaction.commandName}:message`)
        if (interaction.commandName == 'fileify') {
            let fn = generateFileName("fileify", interaction.member?.user.id)
            fs.writeFileSync(fn, interaction.targetMessage.content)
            interaction.reply({ files: [{ attachment: fn, description: "Your file, sir" }] }).then(() => {
                fs.rmSync(fn)
            }).catch(console.error)
        }
    }
})

client.login(globals.token)

const server = http.createServer()
server.listen(8222)

server.on("request", (req, res) => {
    let url = req.url
    if (!url) {
        res.writeHead(404)
        res.end(JSON.stringify({ err: "Page not found" }))
        return
    }
    let paramsStart = url.indexOf("?")
    let path = url.slice(0, paramsStart > -1 ? paramsStart : undefined)
    let urlParams: URLSearchParams | null = new URLSearchParams(url.slice(paramsStart))
    if (paramsStart == -1) {
        urlParams = null
    }
    switch (path) {
        case "/economy": {
            let userId = urlParams?.get("user-id")
            let econData = economy.getEconomy()
            let rv;
            if (userId) {
                if (econData[userId])
                    rv = econData[userId]
                else {
                    rv = { error: "Cannot find data for user" }
                }
            }
            else {
                rv = econData
            }
            res.writeHead(200)
            res.end(JSON.stringify(rv))
            break
        }
        case "/files": {
            let files = urlParams?.get("file")?.split(" ")
            if (!files) {
                files = fs.readdirSync(`./command-results/`)
            }
            let data: { [file: string]: string } = {}
            for (let file of files) {
                if (fs.existsSync(`./command-results/${file}`)) {
                    data[file] = fs.readFileSync(`./command-results/${file}`, "utf-8")
                }
            }
            res.writeHead(200)
            res.end(JSON.stringify(data))
            break
        }
        case "/end": {
            economy.saveEconomy()
            saveItems()
            saveVars()
            pet.savePetData()
            client.destroy()
            res.writeHead(200)
            res.end(JSON.stringify({ success: "Successfully ended bot" }))
            server.close()
            break;
        }
        case "/send": {
            let text = urlParams?.get("text")
            if (!text) {
                res.writeHead(400)
                res.end(JSON.stringify({ error: "No text given" }))
                break
            }
            let inChannel = urlParams?.get("channel-id")
            client.channels.fetch(inChannel).then((channel: TextChannel) => {
                channel.send({ content: text }).then((msg) => {
                    res.writeHead(200)
                    res.end(JSON.stringify(msg.toJSON()))
                })
            }).catch((_err: any) => {
                res.writeHead(444)
                res.end(JSON.stringify({ error: "Channel not found" }))
            })
            break
        }
        case "/run": {
            let command = urlParams?.get("cmd")
            if (!command) {
                res.writeHead(400)
                res.end(JSON.stringify({ error: "No text given" }))
                break
            }
            if (!command.startsWith(prefix)) {
                command = `${prefix}${command}`
            }
            let inChannel = urlParams?.get("channel-id")
            client.channels.fetch(inChannel).then((channel: TextChannel) => {
                let msg: Message = {
                    activity: null,
                    applicationId: client.id,
                    id: "_1033110249244213260",
                    attachments: new Collection(),
                    author: client.user,
                    channel: channel,
                    channelId: channel.id,
                    cleanContent: command as string,
                    client: client,
                    components: [],
                    content: command as string,
                    createdAt: new Date(Date.now()),
                    createdTimestamp: Date.now(),
                    crosspostable: false,
                    deletable: false,
                    editable: false,
                    editedAt: null,
                    editedTimestamp: null,
                    embeds: [],
                    flags: new MessageFlags(),
                    groupActivityApplication: null,
                    guild: channel.guild,
                    guildId: channel.guild.id,
                    hasThread: false,
                    interaction: null,
                    member: null,
                    //@ts-ignore
                    mentions: {
                        channels: new Collection(),
                        crosspostedChannels: new Collection(),
                        everyone: false,
                        members: null,
                        repliedUser: null,
                        roles: new Collection(),
                        users: new Collection(),
                        has: (data, options) => false,
                        _channels: null,
                        _content: command as string,
                        _members: null,
                        client: client,
                        guild: channel.guild,
                        toJSON: () => {
                            return {}
                        }
                    },
                    nonce: null,
                    partial: false,
                    pinnable: false,
                    pinned: false,
                    position: null,
                    //@ts-ignore
                    reactions: null,
                    reference: null,
                    stockers: new Collection(),
                    system: false,
                    thread: null,
                    tts: false,
                    type: "DEFAULT",
                    url: "http://localhost:8222/",
                    webhookId: null,
                    _cacheType: false,
                    _patch: (_data) => { }
                }
                command_commons.runCmd(msg, (command as string).slice(prefix), 0, true).then(rv => {
                    command_commons.handleSending(msg, rv as CommandReturn).then(_done => {
                        res.writeHead(200)
                        res.end(JSON.stringify(rv))
                    }).catch(_err => {
                        res.writeHead(500)
                        res.end(JSON.stringify({ error: "Soething went wrong sending message" }))
                    })
                }).catch(_err => {
                    res.writeHead(500)
                    res.end(JSON.stringify({ error: "Soething went wrong executing command" }))
                })
            }).catch((_err: any) => {
                res.writeHead(444)
                res.end(JSON.stringify({ error: "Channel not found" }))
            })
            break
        }
        default:
            res.writeHead(404)
            res.end(JSON.stringify({ error: "Route not found" }))
    }
})
