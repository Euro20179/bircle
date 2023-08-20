import fs from 'fs'

import { ActionRowBuilder, APIApplicationCommandOption, ApplicationCommandType, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder, InteractionReplyOptions, InteractionResponseType} from "discord.js"
import { StatusCode } from "./common_to_commands"
import { efd, fetchUser, isMsgChannel, sleep } from "./util"

import globals = require("./globals")
import economy from "./economy"

export function createChatCommandOption(type: number, name: string, description: string, { min, max, required }: { min?: number, max?: number | null, required?: boolean }): APIApplicationCommandOption {
    let obj: APIApplicationCommandOption = {
        type: type,
        name: name,
        description: description,
        required: required || false,
        min_value: min,
        max_value: max ?? undefined
    }
    return obj
}

const STRING = 3
const INTEGER = 4
const USER = 6

export const slashCmds: {
    name: string,
    description?: string,
    run: SlashCommand['run'],
    type: ApplicationCommandType
    options?: APIApplicationCommandOption[]
}[] = []

function createSlashCommand(name: string, description: string, run: SlashCommand['run'], options?: APIApplicationCommandOption[]) {
    slashCmds.push({
        name,
        description,
        run,
        options,
        type: 1
    })
}

function createCtxMenuCmd(name: string, run: SlashCommand['run'], options?: APIApplicationCommandOption[]){
    slashCmds.push({
        name,
        run,
        type: 2,
        options
    })
}

createSlashCommand("attack", "attacks chris and no one else", async (int) => {
    console.log("working")
    let user = int.options.get("user")?.member
    if (!user) {
        return { reply: true, status: StatusCode.ERR }
    }
    int.reply(`Attacking ${user}...`).catch(console.error)

    if (int.channel && isMsgChannel(int.channel)) {
        int.channel.send(`${user} has been attacked by <@${int.user.id}>`).catch(console.error)
    }
}, [
    createChatCommandOption(USER, "user", "who to ping twice", { required: true })
])

createSlashCommand("ping", "Pings a user for some time", async (int) => {
    let user = int.options.get("user")?.value || `<@${int.user.id}>`
    let times = Number(int.options.get("evilness")?.value) || 1
    int.reply("Pinging...").catch(console.error)
    for (let i = 0; i < times; i++) {
        await int.reply(`<@${user}> has been pinged`)
        await sleep(Math.random() * 700 + 200)
    }
}, [
    createChatCommandOption(USER, "user", "who to ping twice", { required: true }),
    createChatCommandOption(INTEGER, "evilness", "On a scale of 1-10 how evil are you", {})
])

createSlashCommand("help", "get help", async (int) => {
    int.reply({
        content: "use `[help`, slash commands r boring, so i will not support them that much\nhere is some documentation",
        files: [{
            attachment: './help-web.html',
            name: "heres some help.html",
            description: "lmao"
        }]
    }).catch(console.error)
})

createSlashCommand("rps", "Rock paper scissors", async (int) => {
    let opponent = int.options.get("opponent")?.value
    let choice = int.options.get("choice")?.value as string
    let bet = int.options.get("bet")?.value as string
    let nBet = 0
    if (bet) {
        if (int.member?.user.id) {
            nBet = economy.calculateAmountFromString(int.member.user.id, bet)
            if (!economy.canBetAmount(int.member.user.id, nBet) || nBet < 0) {
                int.reply({ content: "You cant bet this much" }).catch(console.error)
                return
            }
        }
    }
    let rock = new ButtonBuilder({ customId: `button.rock:${opponent}`, label: "rock", style: ButtonStyle.Primary })
    let paper = new ButtonBuilder({ customId: `button.paper:${opponent}`, label: "paper", style: ButtonStyle.Primary })
    let scissors = new ButtonBuilder({ customId: `button.scissors:${opponent}`, label: "scissors", style: ButtonStyle.Primary })
    globals.BUTTONS[`button.rock:${opponent}`] = `${choice}:${int.member?.user.id}:${nBet}`
    globals.BUTTONS[`button.paper:${opponent}`] = `${choice}:${int.member?.user.id}:${nBet}`
    globals.BUTTONS[`button.scissors:${opponent}`] = `${choice}:${int.member?.user.id}:${nBet}`
    let row = new ActionRowBuilder<ButtonBuilder>({ type: ComponentType.Button, components: [rock, paper, scissors] })
    int.reply({ components: [row], content: `<@${opponent}>, Rock, paper.... or scissors BUM BUM BUUUMMMM (idfk)` }).catch(console.error)
}, [
    createChatCommandOption(USER, "opponent", "opponent", { required: true }),
    createChatCommandOption(STRING, "choice", "choice", { required: true }),
    createChatCommandOption(STRING, "bet", "bet", { required: false })
])

createSlashCommand("md", "Say markdown", async (int) => {
    int.reply({
        type: InteractionResponseType.ChannelMessageWithSource,
        content: int.options.get("text")?.value as string ?? "Hi"
    } as InteractionReplyOptions)
}, [
    createChatCommandOption(STRING, 'text', 'The text to say', { required: true })
])

createSlashCommand("aheist", "Add a heist response", async (int) => {
    let userId = int.user.id
    let stage = int.options.get("stage")?.value
    if (!stage) {
        int.reply(`${stage} is not a valid stage`).catch(console.error)
        return
    }
    let gainOrLose = int.options.get("gain-or-lose")?.value as string
    if (!gainOrLose) {
        int.reply("You messed up bubs").catch(console.error)
        return
    }
    let users = int.options.get("users-to-gain-or-lose")?.value as string
    if (!users) {
        int.reply("You messed up bubs").catch(console.error)
        return
    }
    if (!users.match(/^(:?(\d+|all),?)+$/)) {
        int.reply(`${users} does not match ((digit|all),)+`).catch(console.error)
        return
    }
    let amount = int.options.get("amount")?.value
    if (!amount) {
        int.reply("You messed up bubs").catch(console.error)
        return
    }
    let message = int.options.get("message")?.value
    if (!message) {
        int.reply("You messed up bubs").catch(console.error)
        return
    }
    let text = `${userId}: ${message} AMOUNT=${amount} STAGE=${stage} ${gainOrLose.toUpperCase()}=${users}`
    let substage = int.options.get("nextstage")?.value
    if (substage)
        text += ` SUBSTAGE=${substage}`
    let location = int.options.get("location")?.value
    if (location)
        text += ` LOCATION=${location}`
    let set_location = int.options.get("set-location")?.value
    if (set_location)
        text += ` SET_LOCATION=${set_location}`
    let button_response = int.options.get("button-response")?.value
    if (button_response) {
        text += ` BUTTONCLICK=${button_response} ENDBUTTONCLICK`
    }
    let condition = int.options.get("if")?.value
    if (condition) {
        text += ` IF=${condition}`
    }
    fs.appendFileSync(`./command-results/heist`, `${text};END\n`)
    int.reply(`Added:\n${text}`).catch(console.error)
}, [
    createChatCommandOption(STRING, "stage", "The stage (getting_in, robbing, escape)", { required: true }),
    {
        type: STRING, name: "gain-or-lose", description: "Whether to gain or lose money", required: true, choices: [
            {
                name: "gain",
                value: "GAIN"
            }, {
                name: "lose",
                value: "LOSE"
            }
        ]
    },
    createChatCommandOption(STRING, 'users-to-gain-or-lose', "User numbers (or all) seperated by ,", { required: true }),
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
    createChatCommandOption(STRING, "message", "The message, {user1} is replaced w/ user 1, {userall} with all users, and {amount} with amount", { required: true }),
    createChatCommandOption(STRING, "nextstage", "The stage to enter into after this response", { required: false }),
    createChatCommandOption(STRING, "location", "The locatino of this response", { required: false }),
    createChatCommandOption(STRING, "set-location", "The location that this response will set the game to", { required: false }),
    createChatCommandOption(STRING, "button-response", "Reply that happens if set-location is multiple locations", { required: false }),
    createChatCommandOption(STRING, "if", "This response can only happen under this condition", { required: false })
])

createCtxMenuCmd("ping",  async (int) => {
    if (int.isContextMenuCommand())
        int.reply(`<@${int.user.id}> has pinged <@${int.targetId}> by right clicking them`).catch(console.error)
})

createCtxMenuCmd("info", async (int) => {
    if (int.isContextMenuCommand()) {
        console.log("working")
        if(!int.guild){
            int.reply("This must be run in a guild")
            return;
        }
        const member = await fetchUser(int.guild, int.targetId)
        if(!member){
            int.reply("Member not found")
            return;
        }
        const user = member.user
        let embed = new EmbedBuilder()
        embed.setColor(member.displayColor)
        let aurl = user.avatarURL()
        if (aurl)
            embed.setThumbnail(aurl)
        embed.addFields(efd(
            ["Id", user.id || "#!N/A", true],
            ["Username", user.username || "#!N/A", true],
            ["Nickname", member?.displayName || "#!N/A", true],
            ["0xColor", member?.displayHexColor?.toString() || "#!N/A", true],
            ["Color", member?.displayColor?.toString() || "#!N/A", true],
            ["Created at", user.createdAt.toString() || "#!N/A", true],
            ["Joined at", member?.joinedAt?.toString() || "#!N/A", true],
            ["Boosting since", member?.premiumSince?.toString() || "#!N/A", true])
        )
        int.reply({ embeds: [embed] }).catch(console.error)
    }
})
