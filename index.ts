///<reference path="src/types.d.ts" />
import { ChannelType, Events, ChatInputCommandInteraction } from 'discord.js'
import cmds from './src/command-parser/cmds'


import { REST } from '@discordjs/rest'

import { Routes } from 'discord-api-types/v9'

import pet from './src/pets'

import commands from './src/commands/commands'
commands()

import { slashCmds } from './src/slashCommands'

import command_commons from './src/common_to_commands'

import globals  from './src/globals'
import useTracker from './src/use-tracker'
import { defer, isMsgChannel } from './src/util'
import { format, getOptsUnix } from './src/parsing'
import { getOpt } from './src/user-options'
import common from './src/common'
import timer from './src/timer'

import economy from './src/economy'
import { Message, } from 'discord.js'

import { hasItem } from './src/shop'

import user_options from './src/user-options'

import init from './src/init'
import common_to_commands from './src/common_to_commands'

import configManager, { GLOBAL_CURRENCY_SIGN } from './src/config-manager'

const nodemailer = require("nodemailer")

init.init(() => console.log("\x1b[33mINITLIZED\x1b[0m"))

const rest = new REST({ version: "10" })
    .setToken(configManager.getConfigValue("secrets.token"));

const PROCESS_OPTS = getOptsUnix(process.argv.slice(2), "", [["headless"]])
const HEADLESS = PROCESS_OPTS[0]['headless']

Array.prototype.shuffleArray = function() {
    for (let i = this.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        [this[i], this[j]] = [this[j], this[i]];
    }
    return this;
}

// defer(() => {
//     console.log('Started refreshing application (/) commands.');
//
//     rest.put(
//         Routes.applicationGuildCommands(configManager.CLIENT_ID, configManager.GUILD_ID),
//         { body: slashCmds },
//     ).then(
//         _res => console.log("Successfully reloaded application (/) commands.")
//     ).catch(console.error)
// })

common.client.on(Events.GuildMemberAdd, async (member) => {
    try {
        let role = await member.guild?.roles.fetch("427570287232417793")
        if (role)
            member.roles.add(role)
    }
    catch (err) {
        console.error(err)
    }
})

common.client.on(Events.ClientReady, async () => {
    economy.loadEconomy()

    const transport = nodemailer.createTransport({
        host: "10.0.0.2",
        port: 25,
        secure: false,
        tls: {
            rejectUnauthorized: false
        }
    })

    await transport.sendMail({
        from: '"bircle" <bircle@raspberrypi>',
        to: '"Euro" <user@raspberrypi>',
        subject: "ONLINE",
        html: "The discord bot is online",
    }).then(console.log).catch(console.error)

    if (!HEADLESS) {
        defer(() => {

            for (let v in user_options.USER_OPTIONS) {
                if (user_options.getOpt(v, "dm-when-online", "false") !== "false") {
                    common.client.users.fetch(v).then((u) => {
                        u.createDM().then((channel) => {
                            channel.send(
                                user_options.getOpt(v, "dm-when-online", "ONLINE")
                            ).catch(console.error)
                        })
                    }).catch(console.error)
                }
            }
        })
    }
    console.log("ONLINE")
})

common.client.on(Events.MessageDelete, async (m) => {
    if (m.author?.bot) return
    if (m.author?.id != common.client.user?.id) {
        common_to_commands.snipes.unshift(m)
    }
})

setInterval(() => {
    common.saveDb();
}, 30000)

async function handlePingResponse(m: Message) {
    for (let i = 0; i < (m.mentions.members?.size || 0); i++) {
        let member = m.mentions.members?.at(i)
        let pingresponse = user_options.getOpt(member?.user.id as string, "pingresponse", null)
        if (!pingresponse) {
            continue
        }
        pingresponse = pingresponse.replaceAll("{pinger}", `<@${m.author.id}>`)
        //this makes a copy otherwise, if the command is running while another user pings the user that pinged, the ids will get messed up
        let original_author = m.author
        let author_copy = {...m.author}
        author_copy.id = member!.user.id
        m.author = author_copy
        const gPrefix = configManager.PREFIX;
        if (common_to_commands.isCmd(pingresponse, gPrefix)) {
            for await (let result of globals.PROCESS_MANAGER.spawn_cmd(
                { command: pingresponse, prefix: gPrefix, msg: m },
                `${pingresponse} - ${m.author.id}`,
            )) {
                result.allowedMentions = { parse: [] }
                await cmds.handleSending(m, result)
            }
        }
        else {
            m.channel.send(pingresponse)
        }
        m.author = original_author
    }
}

function handleMinuteInterest(activePet: string | false, m: Message) {
    let percent = economy.calculateBaseInterest({
        puffle_chat_count: Number(hasItem(m.author.id, "puffle chat")),
        has_capitalism_hat: hasItem(m.author.id, "capitalism hat") ? true : false,
        has_cat: activePet === 'cat'
    })
    economy.earnMoney(m.author.id, percent)
}

async function handleEarnings(m: Message) {
    if (!economy.getEconomy()[m.author.id] && !m.author.bot) {
        return;
    }

    let deaths = pet.damageUserPetsRandomly(m.author.id)
    if (deaths.length)
        await m.channel.send(`<@${m.author.id}>'s ${deaths.join(", ")} died`)

    let ap = pet.getActivePet(m.author.id)

    handleMinuteInterest(ap, m)

    if (ap == 'puffle') {
        let stuff = await pet.PETACTIONS['puffle'](m)
        if (!HEADLESS && stuff) {
            let findMessage = user_options.getOpt(
                m.author.id,
                "puffle-find",
                "{user}'s {name} found: {stuff}"
            )
            await cmds.handleSending(m, {
                content: format(findMessage, {
                    user: `<@${m.author.id}>`,
                    name: pet.hasPet(m.author.id, ap)?.name,
                    stuff: stuff.money ? `${user_options.getOpt(
                        m.author.id,
                        "currency-sign",
                        GLOBAL_CURRENCY_SIGN
                    )}${stuff.money}` : stuff.items.join(", ")
                }),
                status: command_commons.StatusCode.INFO,
                recurse: command_commons.generateDefaultRecurseBans()
            })
        }
    }
}

common.client.on(Events.MessageCreate, async (m: Message) => {
    if (!isMsgChannel(m.channel)) return
    if (m.member?.roles.cache.find(
        (v: any) => common.BLACKLISTED_ROLES()?.includes(v.id)
    ) || common.BLACKLISTED_USERS().includes(m.author.id)) {
        return
    }
    if (m.channel.type !== ChannelType.DM && m.guild && m.guild?.id !== configManager.GUILD_ID)
        return

    if (!timer.getTimer(m.author.id, "%can-earn") && !m.author.bot) {
        //for backwards compatibility
        timer.createTimer(m.author.id, "%can-earn")
    }

    //you get reset if you have less than -99% of the economy
    if (
        (economy.playerLooseNetWorth(m.author.id) / economy.economyLooseGrandTotal().total) < -0.99
    ) {
        economy.createPlayer(m.author.id)
        economy.setMoney(m.author.id, 0)
    }

    let local_prefix = m.author.getBOpt("prefix", configManager.PREFIX)

    let content = m.content

    if (!m.author.bot) {
        //checks for emotes
        for (let match of content.matchAll(/<a?:([^:]+):([\d]+)>/g)) {
            useTracker.emoteUsage.addToUsage(match[2])
        }
    }

    if (timer.has_x_s_passed(m.author.id, "%can-earn", 60) && !m.author.bot) {
        handleEarnings(m)
    }

    if (HEADLESS) {
        return
    }

    let validPingResponseChannels: any = configManager.getConfigValue("general.ping-response-channels")
    if(!Array.isArray(validPingResponseChannels)){
        validPingResponseChannels = []
    }
    if (!m.author.bot
        && (m.mentions.members?.size || 0) > 0
        && getOpt(m.author.id, "no-pingresponse", "false") === "false"
        && validPingResponseChannels.includes(m.channel.id)) {
        handlePingResponse(m)
    }

    if (m.content === `<@${common.client.user?.id}>`) {
        await cmds.handleSending(m, {
            content: `The prefix is: ${local_prefix}`,
            status: 0
        })
    }

    let att = m.attachments.at(0)
    if (att?.name?.endsWith(".bircle")) {
        let res = await fetch(att.url)
        m.attachments.delete(m.attachments.keyAt(0) as string)

        let args = await cmds.expandSyntax(m.content, m)

        let runtime_opts = new cmds.RuntimeOptions()
        runtime_opts.set("program-args", args)

        let cmd = await res.text()
        cmd = "(PREFIX)" + cmd

        for await (let result of globals.PROCESS_MANAGER.spawn_cmd(
            { command: cmd, prefix: "(PREFIX)", msg: m, runtime_opts },
            att.name,
        )) {
            await cmds.handleSending(m, result)
        }
    }

    if (command_commons.isCmd(content, local_prefix)) {
        for await (let result of globals.PROCESS_MANAGER.spawn_cmd(
            { command: content, prefix: local_prefix, msg: m },
            content,
        )) {
            await cmds.handleSending(m, result)
        }
    }
    else {
        await command_commons.handleMatchCommands(m, m.content, true)
    }
})

common.client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction?.user?.username === undefined) {
        return
    }
    if (interaction.isButton() && !interaction.replied) {
        if (interaction.customId.match(/button\.(rock|paper|scissors)/)) {
            let intendedUser = interaction.customId.split(":")[1]
            let table: { [k: string]: string } = {
                "rock": "paper",
                "paper": "scissors",
                "scissors": "rock"
            }
            if (interaction.user.id != intendedUser) {
                interaction.reply({
                    ephemeral: true,
                    content: "You idiot, you already picked"
                }).catch(console.error)
                return
            }
            let oppChoice = interaction.customId.split(":")[0].split(".")[1]
            if (typeof globals.BUTTONS[interaction.customId] !== 'string') {
                interaction.reply({ content: "Something went wrong" }).catch(console.error)
                return
            }
            let data = globals.BUTTONS[interaction.customId]
            if (typeof data !== 'string') {
                return;
            }
            let [userChoice, ogUser, bet] = data.split(":")
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
                    interaction.reply({ content: `<@${ogUser}> user won ${ogBet}` })
                        .catch(console.error)
                }
                else interaction.reply({ content: `<@${ogUser}> user wins!` }).catch(console.error)
            }
            else {
                if (ogBet) {
                    economy.loseMoneyToBank(ogUser, ogBet)
                    if (interaction.member?.user.id) {
                        economy.addMoney(interaction.member?.user.id, ogBet)
                        interaction.reply({
                            content: `<@${interaction.member?.user.id}> user won ${ogBet}!`
                        }).catch(console.error)
                    }
                }
                else interaction.reply({
                    content: `<@${interaction.member?.user.id}> user wins!`
                }).catch(console.error)
            }
            for (let button in globals.BUTTONS) {
                if (button.match(/button\.(rock|paper|scissors)/)) {
                    delete globals.BUTTONS[button]
                }
            }
        }
    }
    else if (interaction.isCommand() && !interaction.replied) {
        if (
            common.BLACKLIST[interaction.member?.user.id as string]
                ?.includes(interaction.commandName)
        ) {
            interaction.reply({ content: "You are blacklisted from this" }).catch(console.error)
            return
        }
        for (let cmd of slashCmds) {
            if (cmd.name === interaction.commandName) {
                useTracker.cmdUsage.addToUsage(`/${interaction.commandName}`)
                cmd.run(interaction as ChatInputCommandInteraction)
                break
            }
        }
    }
})

common.client.login(configManager.getConfigValue("secrets.token"))
