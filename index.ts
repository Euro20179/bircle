///<reference path="index.d.ts" />
import fs = require("fs")

import { Message, MessageEmbed, Interaction, MessageButton, MessageActionRow, GuildMember } from "discord.js"

const { REST } = require('@discordjs/rest')
const { Routes } = require("discord-api-types/v9")

import pet = require("./pets")
import commands = require("./commands")

const economy = require("./economy")

const {generateFileName} = require("./util")
const { saveItems, hasItem } = require("./shop")
const globals = require("./globals")

const user_options = require("./user-options")

let {client, purgeSnipe,  prefix, BLACKLIST} = require("./common")

const rest = new REST({ version: "9" }).setToken(globals.token);

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationGuildCommands(globals.CLIENT_ID, globals.GUILD_ID),
            { body: commands.slashCommands },
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

    client.guilds.fetch("427567510611820544").then((guild: any) => {
        guild.members.fetch("334538784043696130").then((user: any) => {
            user.createDM().then((dmChannel: any) => {
                dmChannel.send("ONLINE").then(console.log).catch(console.log)
            }).catch(console.log)
        }).catch(console.log)
    }).catch(console.log)
    console.log("ONLINE")
})

client.on("messageDelete", async (m: Message) => {
    if (m.author?.id != client.user?.id) {
        for (let i = 3; i >= 0; i--) {
            commands.snipes[i + 1] = commands.snipes[i]
        }
        commands.snipes[0] = m
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
            m.content = `${prefix}${cmd} ${result}`
            let rv = await commands.doCmd(m, true)
            //@ts-ignore
            if (rv?.content) result = rv.content
        }
        m.channel.send = oldSend
        finalMessages = [result]
    }
    commands.handleSending(m, { content: finalMessages.join("\n"), allowedMentions: { parse: [] } })
}

client.on("messageCreate", async (m: Message) => {
    if (economy.getEconomy()[m.author.id] === undefined && !m.author.bot) {
        economy.createPlayer(m.author.id)
    }

    let local_prefix = user_options.getOpt(m.author.id, "prefix", prefix)

    if(!m.author.bot && (m.mentions.members?.size || 0) > 0){
        //@ts-ignore
        for(let i = 0; i < m.mentions.members.size; i++){
            //@ts-ignore
            let pingresponse = user_options.getOpt(m.mentions.members.at(i)?.user.id, "pingresponse", null).replaceAll("{pinger}", `<@${m.author.id}>`)
            if(pingresponse){
                if(commands.isCmd(pingresponse, local_prefix)){
                    let oldContent = m.content
                    m.content = pingresponse
                    await commands.doCmd(m, false, 0, { categories: [commands.CommandCategory.GAME] }) as CommandReturn
                    m.content = oldContent
                }
                else{
                    m.channel.send(pingresponse)
                }
            }
        }
    }

    if(m.content === `<@${client.user.id}>`){
        await commands.handleSending(m, {content: `The prefix is: ${local_prefix}`})
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

    let search;
    if ((search = content.match(/^(\d*):(\/[^\/]+\/)?(\d+,[\d\$]*)?(?:(.*)\/)*/)) && !m.author.bot) {
        await handleChatSearchCommandType(m, search)
    }
    if (content.slice(0, local_prefix.length) == local_prefix) {
        for(let cmd of content.split(`\n${local_prefix};\n`)){
            m.content = `${cmd}`
            await commands.doCmd(m)
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
            if (stuff)
                await m.channel.send(`<@${m.author.id}>'s puffle found: ${stuff.items.join(", ")}, and $${stuff.money}`)
        }
    }
})

client.on("interactionCreate", async (interaction: Interaction) => {
    if(interaction?.user?.username === undefined){
        return
    }
    if (interaction.isButton() && !interaction.replied) {
        if (interaction.customId.match(/button\.(rock|paper|scissors)/)) {
            let intendedUser = interaction.customId.split(":")[1]
            let table: { [k: string]: string } = { "rock": "paper", "paper": "scissors", "scissors": "rock" }
            if (interaction.user.id != intendedUser) {
                interaction.reply({ ephemeral: true, content: "You idiot, you already picked" })
                return
            }
            let oppChoice = interaction.customId.split(":")[0].split(".")[1]
            if (typeof globals.BUTTONS[interaction.customId] !== 'string') {
                interaction.reply({ content: "Something went wrong" })
                return
            }
            //@ts-ignore
            let [userChoice, ogUser, bet] = globals.BUTTONS[interaction.customId].split(":")
            let ogBet = Number(bet)
            if (interaction.member?.user.id === ogUser) {
                interaction.reply({ content: "Ur a dingus" })
                return
            }
            if (userChoice == oppChoice) {
                interaction.reply({ content: "TIE" })
            }
            else if (table[oppChoice] == userChoice) {
                if (ogBet) {
                    economy.addMoney(ogUser, ogBet)
                    interaction.reply({ content: `<@${ogUser}> user won ${ogBet}` })
                }
                else interaction.reply({ content: `<@${ogUser}> user wins!` })
            }
            else {
                if (ogBet) {
                    economy.loseMoneyToBank(ogUser, ogBet)
                    if (interaction.member?.user.id) {
                        //@ts-ignore
                        economy.addMoney(interaction.member?.user.id, ogBet)
                        interaction.reply({ content: `<@${interaction.member?.user.id}> user won ${ogBet}!` })
                    }
                }
                else interaction.reply({ content: `<@${interaction.member?.user.id}> user wins!` })
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
                    interaction.reply({ content: `${interaction.values.toString()} is your vote`, ephemeral: true })
                }
            }
            else interaction.reply({ content: interaction.values.toString(), ephemeral: true })
        }
    }
    else if (interaction.isCommand() && !interaction.replied) {
        if (BLACKLIST[interaction.member?.user.id as string]?.includes(interaction.commandName)) {
            interaction.reply({ content: "You are blacklisted from this" })
            return
        }
        globals.addToCmdUse(`/${interaction.commandName}`)
        if (interaction.commandName == 'attack') {
            let user = interaction.options.get("user")?.['value']
            if (!user) {
                await interaction.reply("NO USER GIVEN???")
            }
            await interaction.reply(`Attacking ${user}...`)
            await interaction.channel?.send(`${user} has been attacked by <@${interaction.user.id}>`)
        }
        else if (interaction.commandName == 'aheist') {
            let userId = interaction.user.id
            let stage = interaction.options.get("stage")?.value
            if (!stage) {
                interaction.reply(`${stage} is not a valid stage`)
                return
            }
            let gainOrLose = interaction.options.get("gain-or-lose")?.value as string
            if (!gainOrLose) {
                interaction.reply("You messed up bubs")
                return
            }
            let users = interaction.options.get("users-to-gain-or-lose")?.value as string
            if (!users) {
                interaction.reply("You messed up bubs")
                return
            }
            if (!users.match(/^(:?(\d+|all),?)+$/)) {
                interaction.reply(`${users} does not match ((digit|all),)+`)
                return
            }
            let amount = interaction.options.get("amount")?.value
            if (!amount) {
                interaction.reply("You messed up bubs")
                return
            }
            let message = interaction.options.get("message")?.value
            if (!message) {
                interaction.reply("You messed up bubs")
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
            interaction.reply(`Added:\n${text}`)
        }
        else if (interaction.commandName == 'ping') {
            let user = interaction.options.get("user")?.value || `<@${interaction.user.id}>`
            let times = interaction.options.get("evilness")?.value || 1
            interaction.reply("Pinging...")
            globals.SPAM_ALLOWED = true
            for (let i = 0; i < times; i++) {
                if (!globals.SPAM_ALLOWED) break
                await interaction.channel?.send(`<@${user}> has been pinged`)
                await new Promise(res => setTimeout(res, Math.random() * 700 + 200))
            }
        }
        else if (interaction.commandName == 'img') {
            //@ts-ignore
            let rv = await commands.commands["img"].run(interaction, [interaction.options.get("width")?.value, interaction.options.get("height")?.value, interaction.options.get("color")?.value], interaction.channel.send.bind(interaction.channel))
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
            let rv = await commands.commands['alias'].run(interaction, arglist, interaction.channel.send.bind(interaction.channel), interaction.channel.send.bind(interaction.channel))
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
            await commands.commands['poll'].run(interaction, argList, interaction.channel.send.bind(interaction.channel))
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
            let rv = await commands.commands['alias'].run(interaction, arglist, interaction.channel.send.bind(interaction.channel))
            await interaction.reply(rv)
        }
        else if (interaction.commandName == 'rccmd') {
            //@ts-ignore
            interaction.author = interaction.member?.user
            //@ts-ignore
            let rv = await commands.commands['rccmd'].run(interaction, [interaction.options.get("name")?.value], interaction.channel.send.bind(interaction.channel))
            await interaction.reply(rv)
        }
        else if (interaction.commandName == 'say') {
            await interaction.reply(interaction.options.get("something")?.value as string | null || "How did we get here")
        }
        else if (interaction.commandName == "dad") {
            //@ts-ignore
            interaction.author = interaction.member?.user
            //@ts-ignore
            let rv = await commands.commands['add'].run(interaction, ["distance", interaction.options.get("response")?.value], interaction.channel.send.bind(interaction.channel))
            await interaction.reply(rv)
        }
        else if (interaction.commandName == "add-8") {
            //@ts-ignore
            interaction.author = interaction.member?.user
            let resp = interaction.options.get("response")?.value as string
            //@ts-ignore
            let rv = await commands.commands['add'].run(interaction, ["8", resp], interaction.channel.send.bind(interaction.channel))
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
            let rv = await commands.commands['add'].run(interaction, ["wordle", resp], interaction.channel.send.bind(interaction.channel))
            await interaction.reply(rv)
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
                        interaction.reply({ content: "You cant bet this much" })
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
            let rv = await commands.commands['hangman'].run(interaction, cmdsArgs, interaction.channel.send.bind(interaction.channel))
            await interaction.reply(rv)
        }
    }
    else if (interaction.isUserContextMenu() && !interaction.replied) {
        globals.addToCmdUse(`${interaction.commandName}:user`)
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
        globals.addToCmdUse(`${interaction.commandName}:message`)
        if (interaction.commandName == 'fileify') {
            let fn = generateFileName("fileify", interaction.member?.user.id)
            fs.writeFileSync(fn, interaction.targetMessage.content)
            interaction.reply({ files: [{ attachment: fn, description: "Your file, sir" }] }).then(() => {
                fs.rmSync(fn)
            })
        }
    }
})

client.login(globals.token)
