import fs from 'fs'

import { Message, Collection, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonInteraction, Guild, User, ButtonStyle, ComponentType, GuildMember, NonThreadGuildBasedChannel, ChannelType } from 'discord.js'
import { StatusCode, createHelpArgument, createHelpOption, ccmdV2, crv, promptUser } from '../common_to_commands'

import globals from '../globals'
import economy from '../economy'
import user_options from '../user-options'
import battle from '../battle'
import pet from '../pets'
import iterators from '../iterators'

import uno, { Hand, Stack } from '../uno'

import { choice, efd, fetchUser, mulStr, strlen, BADVALUE, isBetween, isMsgChannel, fetchUserFromClientOrGuild, truthy } from '../util'

import { format } from '../parsing'

import common from '../common'
import vars from '../vars'
import timer from '../timer'

import connect4, { Board } from '../connect4'
import achievements from '../achievements'
import amountParser from '../amount-parser'

import cmds from '../command-parser/cmds'

import shop from '../shop'
import configManager, { GLOBAL_CURRENCY_SIGN } from '../config-manager'
import userOptions from '../user-options'

const handleSending = cmds.handleSending


export default function*(): Generator<[string, CommandV2]> {
    yield ["anagrams", ccmdV2(async function*({ msg, args, opts }) {
        const LETTERS = "abcdefghijklmnoqprstuvwxyz".split("")
        const VOWELS = "aeiou".split("")
        const letterCount = opts.getNumber("count", 5)
        const words = fs.readFileSync("/home/cloud/DRIVE/www/words", "utf-8").split("\n")
        for (let i = 0; i < words.length; i++) {
            words[i] = words[i].toLowerCase()
        }
        if (args.length === 0) {
            return crv("No bet", { status: StatusCode.ERR })
        }
        const betS = args.join(" ")
        let bet = economy.calculateAmountFromString(msg.author.id, betS)
        if (!bet) {
            return crv("No bet", { status: StatusCode.ERR })
        }
        let playerLetters = choice(VOWELS)
        for (let i = 0; i < letterCount - 1; i++) {
            playerLetters += choice(LETTERS)
        }
        let points = 0
        const guessedWords: string[] = []
        gameLoop: while (true) {
            const r = await promptUser(msg, `### Your letters\n${playerLetters}\n\nType a word (type DONE) to finish`, undefined, { filter: m => m.author.id === msg.author.id, timeout: 60000 })
            if (!r || !r.content.length) {
                return crv("Timeout or no answer", { status: StatusCode.ERR })
            }
            if (r.content === "DONE") {
                break
            }
            for (let letter of r.content.toLowerCase()) {
                if (!playerLetters.includes(letter)) {
                    yield `You do not have a ${letter}`
                    continue gameLoop
                }
            }
            if (guessedWords.includes(r.content.toLowerCase())) {
                yield `You have already guessed: ${r.content}`
            } else if (words.includes(r.content.toLowerCase())) {
                guessedWords.push(r.content.toLowerCase())
                points += r.content.length
                yield `You got ${points} points`
            } else {
                yield "That's not a word"
            }
        }
        let reward = (((100 - letterCount * 5) + points) / 100) * bet - bet

        let symbol = userOptions.getOpt(msg.author.id, "currency-sign", GLOBAL_CURRENCY_SIGN)

        economy.addMoney(msg.author.id, reward)

        return crv(`POINTS: ${points}\nYou WON ${symbol}${reward}!!!`)

    }, "Make as many words as you can!")]

    yield ["connect4", ccmdV2(async function({ msg, args, opts }) {
        if (!isMsgChannel(msg.channel)) return { noSend: true, status: StatusCode.ERR }

        let board: Board = connect4.createBoard(opts.getNumber("rows", 6), opts.getNumber("cols", 7))

        let p1Color = user_options.getOpt(msg.author.id, "connect4-symbol", opts.getString('symbol', "🔴"))
        let p2Color = '🔵'

        let players: (User | undefined)[] = [msg.author]
        if (args.length) {
            players[1] = await fetchUserFromClientOrGuild(args.join(" "), msg.guild)
            if (players[1] === players[0]) {
                return { content: ":watching:", status: StatusCode.ERR }
            }
        }
        if (!players[1]) {
            if (args.length) {
                await handleSending(msg, { content: `${args.join(" ")} not found`, status: StatusCode.WARNING })
            }
            let e = new EmbedBuilder()
            e.setTitle("Type `join` to join the connect4 game")
            await handleSending(msg, { embeds: [e], status: StatusCode.PROMPT })
            let joinMessages = await msg.channel.awaitMessages({ filter: m => m.content.toLowerCase().startsWith("join") && m.author.id !== msg.author.id, time: 30000, max: 1 })
            let m = joinMessages.at(0)
            if (!m) {
                return { content: `No one wanted to play :(`, status: StatusCode.RETURN }
            }

            p2Color = user_options.getOpt(m.author.id, "connect4-symbol", m.content.slice("join".length).trim() || p2Color)
            players[1] = m.author
        }
        p2Color = user_options.getOpt(players[1].id, "connect4-symbol", p2Color)

        for (let user of players as User[])
            globals.startCommand(user.id, "connect4")

        //main game


        let cycler = iterators.cycle(Array.from(players, (p, idx) => [p as User, idx === 0 ? "R" : "B"] as const))

        let editableMsg = await handleSending(msg, { content: `${players[0]}\nType the number column you want to go in\n${connect4.createBoardText(board, p1Color, p2Color)}`, status: StatusCode.INFO })

        let going = players[0]

        let ENDGAME = false

        let listener = msg.channel.createMessageCollector({ filter: m => players.includes(m.author) && ["resend", "board", "new", "quit", "q"].includes(m.content) })
        listener.on("collect", m => {
            if (["quit", "q"].includes(m.content)) {
                for (let user of players as User[])
                    globals.endCommand(user.id, 'connect4')
                ENDGAME = true
                handleSending(m, { content: `${m.author} quit the game`, status: StatusCode.INFO })
                listener.stop()
                return
            }
            handleSending(msg, { content: `${going}\nType the number column you want to go in\n${connect4.createBoardText(board, p1Color, p2Color)}`, status: StatusCode.INFO }).then(m => editableMsg = m)
        })

        const needed = opts.getNumber("needed", opts.getNumber("n", 4))

        for (let [player, turnColor] of cycler) {
            await editableMsg.edit(`${player}\nType the number column you want to go in\n${connect4.createBoardText(board, p1Color, p2Color)}`)
            if (ENDGAME) {
                break
            }
            //for the listener that refreshes the board
            going = player
            let msgs = await msg.channel.awaitMessages({
                filter: m =>
                    m.author.id === player.id &&
                    !isNaN(Number(m.content)) &&
                    connect4.canPlaceInColumn(board, Number(m.content) - 1),
                max: 1, time: 30000
            })
            let m = msgs.at(0)
            if (!m) {
                await handleSending(msg, { content: `<@${player.id}> took too long, skipping turn`, status: StatusCode.INFO })
                continue;
            }
            if (m.deletable) {
                await m.delete()
            }
            let column = Number(m.content) - 1
            board = connect4.placeColorInColumn(board, turnColor, column)
            if (connect4.checkWin(board, needed)) {
                for (let user of players as User[]) {
                    globals.endCommand(user.id, 'connect4')
                    if (user !== player) {
                        vars.setVar("!connect4:losses", String(Number(vars.getVar(msg, "!connect4:losses")) + 1), user.id)
                        economy.addMoney(user.id, economy.calculateAmountFromNetWorth(user.id, "neg(0.05%)"))
                    }
                }
                listener.stop()

                let wins = Number(vars.getVar(msg, "!connect4:wins", player.id)) + 1
                let losses = Number(vars.getVar(msg, "!connect4:losses", player.id))

                vars.setVar("!connect4:wins", String(wins), player.id)
                vars.saveVars()

                let winnings = economy.calculateAmountFromNetWorth(player.id, "0.1%")
                economy.addMoney(player.id, winnings)

                await handleSending(msg, { content: connect4.createBoardText(board, p1Color, p2Color), status: StatusCode.INFO })

                let sign = user_options.getOpt(player.id, "currency-sign", configManager.GLOBAL_CURRENCY_SIGN)

                return { content: format(user_options.getOpt(player.id, "connect4-win", `Player: ${player} HAS WON!!\n${player} has\nwins: {wins}\nlosses: {losses}\n+{amount_won}`), { wins: String(wins), losses: String(losses), amount_won: sign + String(winnings) }), status: StatusCode.RETURN, recurse: true }
            }
            if (connect4.boardIsFull(board)) {
                await handleSending(msg, { content: connect4.createBoardText(board, p1Color, p2Color), status: StatusCode.INFO })
                return crv("TIE")
            }
        }

        //end main game

        for (let user of players as User[])
            globals.endCommand(user.id, 'connect4')

        listener.stop()
        return { noSend: true, status: StatusCode.RETURN }

    }, "Play some connect 4\nto join type <code>join</code>, after the word join you may put a symbol to use instead of <code>🔵</code><br>The winner will win .1% of their net worth, the loser will lose 0.05% of their net worth.", {
        permCheck: m => !globals.userUsingCommand(m.author.id, "connect4"),
        helpArguments: {
            "player": createHelpArgument("The player you want to play against", false)
        }, helpOptions: {
            "needed": createHelpOption("The amount you need to get in a row to win", undefined, "4", true),
            "rows": createHelpOption("The number of rows", undefined, "6", true),
            "cols": createHelpOption("The number of cols", undefined, "7", true),
            "symbol": createHelpOption("The symbol to use for yourself", undefined, "🔴", true)
        }
    })]

    yield ["madlibs", ccmdV2(async ({ sendCallback, msg }) => {
        if (!isMsgChannel(msg.channel)) return { noSend: true, status: StatusCode.ERR }

        const stories = fs.readFileSync("./command-results/madlibs", "utf-8").split(";END").map(v => v.split(":").slice(1).join(":").trim()).filter(v => v)

        const story = choice(stories)

        let variables = new Map<string, string | null>()

        let processedStory = ""

        let inPromptSection = false
        let currentPrompt = ""


        const processPrompt = async (prompt: string) => {
            if (!isMsgChannel(msg.channel)) return ""
            if (prompt.startsWith("$")) {
                prompt = prompt.slice(1)
                if (variables.get(prompt) !== undefined) {
                    return variables.get(prompt)
                }
                else {
                    await handleSending(msg, { content: prompt, status: StatusCode.PROMPT }, sendCallback)
                    let msgs = await msg.channel.awaitMessages({ time: 30000, filter: m => m.author.id === msg.author.id, max: 1 })
                    let resp = msgs.at(0)
                    variables.set(prompt, resp?.content || "")
                    return resp?.content || ""
                }
            }
            else if (prompt.includes(":=")) {
                let [varName, newPrompt] = prompt.split(":=")
                await handleSending(msg, { content: newPrompt, status: StatusCode.PROMPT }, sendCallback)
                let msgs = await msg.channel.awaitMessages({ time: 30000, filter: m => m.author.id === msg.author.id, max: 1 })
                let resp = msgs.at(0)
                variables.set(varName, resp?.content || "")
                return resp?.content || ""
            }
            else {
                await handleSending(msg, { content: prompt, status: StatusCode.PROMPT }, sendCallback)
                let msgs = await msg.channel.awaitMessages({ time: 30000, filter: m => m.author.id === msg.author.id, max: 1 })
                let resp = msgs.at(0)
                return resp?.content || ""
            }
        }

        for (let char of story) {
            if (char === "{") {
                inPromptSection = true
            }
            else if (char === "}") {
                if (currentPrompt) {
                    processedStory += await processPrompt(currentPrompt)
                }
                currentPrompt = ""
                inPromptSection = false
            }
            else if (!inPromptSection) {
                processedStory += char
            }
            else {
                currentPrompt += char
            }
        }

        return { content: processedStory, status: StatusCode.RETURN }

    }, "Play madlibs", {
        docs: `<h1>Creating a madlib</h1>
<p indent=1>
    write any text you want.<br>
    <br>
    If text is between {} it will prompt the user for what is between {}<br>
    <u>Example:</u> <code indent=2>{noun}</code><br>
    To create a variable you may do this:<br>
    <br>
    <code>{users-name:=Your name}</code><br>
    This will have the prompt <code>Your name</code> and save in the variable <code>users-name</code><br>
    <br>
    To user a variable use <code>{$var-name}</code>.<br>
    To use the variable from above you can do <code>{$users-name}</code>
</p>`
    })]

    yield ["know-your-meme", ccmdV2(async function({ msg, sendCallback, opts }) {

        let state = this[1].state ?? {
            KNOW_YOUR_MEME_PLAYERS: [],
            KNOW_YOUR_MEME_TIMEOUT: undefined
        }
        this[1].state = state

        if (!isMsgChannel(msg.channel)) return { noSend: true, status: StatusCode.ERR }

        if (msg.author.bot) {
            return crv("Bots cannot join know your meme", { status: StatusCode.ERR })
        }

        const amountOfRounds = opts.getNumber("r", 1) || opts.getNumber("rounds", 1)

        async function game() {
            if (state.KNOW_YOUR_MEME_PLAYERS.length < 2) {
                state.KNOW_YOUR_MEME_PLAYERS = []
                await handleSending(msg, { content: "Game not starting with 1 player", status: StatusCode.ERR }, sendCallback)
                state.KNOW_YOUR_MEME_TIMEOUT = undefined;
                return 0
            }
            const prompts = fs.readFileSync("./command-results/kym", "utf-8").split(";END").map(v => v.split(":").slice(1).join(":")).map(v => v.trim()).filter(v => v)

            for (let i = 0; i < amountOfRounds; i++) {
                await handleSending(msg, { content: `round: ${i + 1} is starting`, status: StatusCode.INFO }, sendCallback)
                const prompt = prompts[Math.floor(Math.random() * prompts.length)]
                await handleSending(msg, { content: `The prompt is: ${prompt}`, status: StatusCode.INFO }, sendCallback)
                for (let user of state.KNOW_YOUR_MEME_PLAYERS) {
                    try {
                        await user.send(`The prompt is: ${prompt}`)
                    }
                    catch (err) {
                        await handleSending(msg, { content: `${user.username} has their dms closed`, status: StatusCode.ERR }, sendCallback)
                    }
                }

                let gifs = (await Promise.all(state.KNOW_YOUR_MEME_PLAYERS.map((user: any) => user.dmChannel?.awaitMessages({ max: 1, filter: (m: any) => m.content ? true : false, time: 30000 }))))
                    .map(gif => gif?.first())

                let votes: { [key: number]: number } = {}

                let buttons: ButtonBuilder[] = []

                for (let i = 0; i < gifs.length; i++) {
                    let gif = gifs[i]
                    if (!gif) {
                        await handleSending(msg, { content: `${i + 1}: \\_\\_NO\\_GIF\\_\\_`, status: StatusCode.INFO })
                        continue
                    }
                    let attachments = gif.attachments.toJSON()[0]
                    if (!attachments) {
                        await handleSending(msg, { content: `${i + 1}: \\_\\_NO\\_GIF\\_\\_`, status: StatusCode.INFO })
                        continue
                    }
                    let b = new ButtonBuilder({ customId: `${i}`, style: ButtonStyle.Primary, label: `Vote for gif ${i + 1})` })
                    buttons.push(b)
                    let row = new ActionRowBuilder<ButtonBuilder>()
                    row.addComponents(b)
                    let m = await handleSending(msg, {
                        content: `${i + 1}:\n${gif.content}`,
                        files: [{
                            name: attachments?.name || "image",
                            attachment: attachments.url
                        }], status: StatusCode.INFO, components: [row]
                    })

                    const handleVoting = (int: ButtonInteraction) => {
                        let user = int.user
                        if (!voted.includes(user.id)) {
                            int.reply({ content: `You voted for: gif ${Number(int.customId) + 1}`, ephemeral: true })
                            if (!votes[Number(int.customId)]) {
                                votes[Number(int.customId)] = 1
                            }
                            else {
                                votes[Number(int.customId)]++;
                            }
                            voted.push(user.id)
                        }
                        else {
                            int.reply({ content: "You already voted", ephemeral: true })
                        }
                        m.awaitMessageComponent({ componentType: ComponentType.Button }).then(handleVoting)
                    }

                    m.awaitMessageComponent({ componentType: ComponentType.Button }).then(handleVoting)
                }

                await handleSending(msg, { content: `Vote for your favorite gif`, status: StatusCode.PROMPT });
                let voted: string[] = []

                if (!isMsgChannel(msg.channel)) return { noSend: true, status: StatusCode.ERR }

                //This acts as the timer for the whole voting thing, if removed there will be no timer for voting
                let messagevotes = await msg.channel.awaitMessages({
                    filter: (m) => {
                        let n = Number(m.content)
                        if (!voted.includes(m.author.id) && !m.author.bot && !isNaN(n) && isBetween(0, n, gifs.length)) {
                            voted.push(m.author.id)
                            handleSending(msg, { content: `You voted for gif: ${m.content}`, status: StatusCode.INFO })
                            return true
                        }
                        return false
                    }, time: 30000
                })

                for (let button of buttons) {
                    button.setDisabled(true)
                }

                let numberVotes = messagevotes.mapValues(value => Number(value.content) - 1).toJSON()

                for (let vote of numberVotes) {
                    if (!votes[vote]) {
                        votes[vote] = 1
                    }
                    else {
                        votes[vote]++;
                    }
                }
                let mostCommon = Object.entries(votes).sort((a, b) => a[1] - b[1])[0]
                await handleSending(msg, { content: `gif: ${Number(mostCommon[0]) + 1} has won with ${mostCommon[1]} vote`, status: StatusCode.RETURN })
            }
            state.KNOW_YOUR_MEME_TIMEOUT = undefined;
            state.KNOW_YOUR_MEME_PLAYERS = []
        }

        if (!state.KNOW_YOUR_MEME_PLAYERS.find((u: User) => u.id === msg.author.id)) {
            state.KNOW_YOUR_MEME_PLAYERS.push(msg.author)
        }
        else {
            return { content: "You are already in a game", status: StatusCode.ERR }
        }
        if (!state.KNOW_YOUR_MEME_TIMEOUT) {
            state.KNOW_YOUR_MEME_TIMEOUT = setTimeout(game, 30000)
        }
        return { content: "You joined the game", status: StatusCode.INFO }
    }, "Know your meme", {
        helpOptions: {
            rounds: createHelpOption("Number of rounds", undefined, "1"),
            r: createHelpOption("Number of rounds", undefined, "1")
        }
    })]

    yield [
        "yahtzee", ccmdV2(async function({ msg, rawOpts: opts, args }) {
            if (!isMsgChannel(msg.channel)) return { noSend: true, status: StatusCode.ERR }

            let new_rules = Boolean(opts['new-rules'])

            class ScoreSheet {
                nrs: [number, number, number, number, number, number]
                nrs_applied: [number, number, number, number, number, number]
                three_of_a_kind: number | undefined
                four_of_a_kind: number | undefined
                full_house: number[]
                small_straight: number[]
                large_straight: number[]
                chance: number | undefined

                yahtzee: number[]

                constructor() {
                    this.yahtzee = []
                    this.full_house = []
                    this.small_straight = []
                    this.large_straight = []
                    this.nrs = [0, 0, 0, 0, 0, 0]
                    this.nrs_applied = [0, 0, 0, 0, 0, 0]
                }

                #is_x_of_a_kind(dice: number[], size: number) {
                    let diceSet = new Set(dice)
                    //dice.length + 1 comes from the fact that if you subtract size from it,
                    //you get the maximum number of different dice that can be rolled while still haveing
                    //a <size> of a kind
                    //

                    let isKind = false
                    if (diceSet.size > (dice.length + 1) - size) {
                        return false
                    }
                    for (let num of diceSet) {
                        if (dice.filter(v => v === num).length >= size) {
                            isKind = true
                            break
                        }
                    }
                    return isKind
                }

                #is_a_straight(dice: number[], size: number) {
                    let sorted = dice.sort()
                    let isStraight = false
                    let last = sorted[0]
                    let inARow = 1
                    for (let item of sorted.slice(1)) {
                        if (inARow === size) {
                            isStraight = true
                            break
                        }
                        if (item === last) {
                            continue
                        }
                        if (item !== last + 1) {
                            inARow = 1
                        }
                        else {
                            inARow++;
                        }
                        last = item
                    }
                    if (isStraight || inARow == size) {
                        return true
                    }
                    else {
                        return false
                    }
                }

                is_applied(type: string) {
                    let val = Reflect.get(this, type.replaceAll(" ", "_")) as unknown
                    if (typeof val !== 'object' || val === null) return val !== undefined
                    if (!new_rules && type !== "yahtzee" && "length" in val) {
                        if (val?.length) {
                            return true
                        }
                    }
                    let nr = Number(type)
                    if (!isNaN(nr)) {
                        return this.nrs_applied[nr - 1] === 1
                    }
                    if (Array.isArray(val) && (val?.length && !val?.includes(0) || val?.length === 0)) {
                        return false
                    }
                    return false
                }

                apply(type: string, dice: number[]) {
                    let nr = Number(type)
                    if (!isNaN(nr)) {
                        this.nrs[nr - 1] = dice.filter(v => v === nr).length * nr
                        this.nrs_applied[nr - 1] = 1
                    }
                    else {
                        let fn = Reflect.get(this, `apply_${type.replaceAll(" ", "_")}`)
                        if (fn && typeof fn === 'function') {
                            fn.bind(this)(dice)
                        }
                    }
                }
                apply_chance(dice: number[]) {
                    this.chance = dice.reduce((p, c) => p + c, 0)
                }
                apply_three_of_a_kind(dice: number[]) {

                    if (this.#is_x_of_a_kind(dice, 3)) {
                        this.three_of_a_kind = dice.reduce((p, c) => p + c, 0)
                    }
                    else {
                        this.three_of_a_kind = 0
                    }
                }
                apply_four_of_a_kind(dice: number[]) {
                    if (this.#is_x_of_a_kind(dice, 4)) {
                        this.four_of_a_kind = dice.reduce((p, c) => p + c, 0)
                    }
                    else {
                        this.four_of_a_kind = 0
                    }
                }
                apply_full_house(dice: number[]) {
                    let diceSet = new Set(dice)
                    //Only 2 numbers can be in a full house
                    if (diceSet.size !== 2) {
                        this.full_house.push(0)
                        return
                    }
                    let fullHouseNumbs: { 2: number, 3: number } = { 2: 0, 3: 0 }
                    for (let number of new Set(dice)) {
                        let count = dice.filter(v => v === number).length
                        if (fullHouseNumbs[count as keyof typeof fullHouseNumbs] === undefined) {
                            break
                        }
                        if (fullHouseNumbs[count as 2 | 3]) {
                            break
                        }
                        fullHouseNumbs[count as 2 | 3] = 1
                    }
                    if (fullHouseNumbs[2] && fullHouseNumbs[3]) {
                        this.full_house.push(25)
                    }
                    else {
                        this.full_house.push(0)
                    }
                }
                apply_small_straight(dice: number[]) {
                    let val = 0
                    if (this.#is_a_straight(dice, 4)) {
                        if (this.small_straight?.includes(0)) {
                            val = 0
                        }
                        else {
                            val = 30
                        }
                    }
                    else {
                        val = 0
                    }
                    this.small_straight.push(val)
                }
                apply_large_straight(dice: number[]) {
                    let val = 0
                    if (this.#is_a_straight(dice, 5)) {
                        if (this.large_straight?.includes(0)) {
                            val = 0
                        }
                        else {
                            val = 40
                        }
                    }
                    else {
                        val = 0
                    }
                    this.large_straight.push(val)
                }
                apply_yahtzee(dice: number[]) {
                    let s = new Set(dice)
                    if (s.size === 1) {
                        if (this.yahtzee.includes(0)) {
                            this.yahtzee.push(0)
                        }
                        else {
                            this.yahtzee.push(50)
                        }
                    }
                    else {
                        this.yahtzee.push(0)
                    }
                }
                is_filled() {
                    if (this.yahtzee.length === 0) {
                        return false
                    }
                    if (this.nrs_applied.indexOf(0) !== -1) {
                        return false
                    }
                    for (let item in this) {
                        let value = this[item]
                        if (value === undefined || (value && typeof value === 'object' && "length" in value && value.length === 0)) {
                            return false
                        }
                    }
                    return true
                }
                score() {
                    let total = this.nrs.map((v, i) => v * (i + 1)).reduce((p, c) => p + c, 0)
                    for (let category of [
                        this.three_of_a_kind,
                        this.small_straight,
                        this.large_straight,
                        this.four_of_a_kind,
                        this.yahtzee,
                        this.chance,
                        this.full_house
                    ]) {
                        if (typeof category === 'number') {
                            total += category
                        }
                        else if (category) {
                            total += category.reduce((p: number, c: number) => p + c, 0)
                        }
                    }
                    return total
                }
                async go(id: string, rollCount: number, diceRolls: number[]): Promise<any> {
                    this.score()

                    await handleSending(msg, { content: `<@${id}>  YOUR UP:\n${this.toString()}\n\n${diceRolls.join(", ")}`, status: StatusCode.INFO })

                    let filter = (function(this: ScoreSheet, m: Message) {
                        if (m.author.id !== id) {
                            return false
                        }
                        if (m.content.toUpperCase() === "STOP") {
                            return true
                        }
                        let choiceArgs = m.content.split(/\s+/)

                        if (!(options.includes(choiceArgs[0].toLowerCase()) || Object.keys(aliases).includes(choiceArgs[0].toLowerCase()))) {
                            return false
                        }
                        let choice: string = aliases[choiceArgs[0].toLowerCase() as keyof typeof aliases] ?? choiceArgs[0].toLowerCase()

                        if (choice == "reroll") {
                            if (rollCount >= 3) {
                                m.reply("You have already rerolled twice")
                                return false
                            }
                        }
                        if (this.is_applied(choice)) {
                            m.reply("U did that already")
                            return false
                        }
                        return true
                    }).bind(this)

                    if (!isMsgChannel(msg.channel)) return { noSend: true, status: StatusCode.ERR }
                    let choiceMessageCollection = await msg.channel.awaitMessages({ filter: filter, max: 1 })
                    let choiceMessage = choiceMessageCollection.at(0)

                    if (!choiceMessage) {
                        return { noSend: true, status: StatusCode.RETURN }
                    }

                    if (choiceMessage.content.toLowerCase() === 'stop') {
                        return false
                    }

                    let choiceArgs = choiceMessage.content.split(/\s+/)

                    let choice: string = aliases[choiceArgs[0].toLowerCase() as keyof typeof aliases] ?? choiceArgs[0].toLowerCase()

                    if (choice == "reroll") {
                        let diceToReRoll = new Set()
                        for (let arg of choiceArgs.slice(1)) {
                            for (let n of arg) {
                                diceToReRoll.add(Number(n))
                            }
                        }
                        for (let val of diceToReRoll) {
                            if ((val as number) > diceRolls.length) {
                                continue
                            }
                            diceRolls[(val as number) - 1] = Math.floor(Math.random() * (7 - 1) + 1)
                        }
                        return await this.go(id, rollCount + 1, diceRolls)
                    }
                    this.apply(choice, diceRolls)
                    return true
                }
                toString() {
                    let st = ``
                    for (let kv of Object.entries(this)) {
                        if (kv[0] === 'nrs_applied') {
                            continue
                        }
                        st += `**${kv[0]}**: ${kv[1] ?? "-"}\n`
                    }
                    return st
                }
            }

            const aliases = {
                "five": "5",
                "four": "4",
                "three": "3",
                "two": "2",
                "one": "1",
                "six": "6",
                "fh": "full house",
                "sm": "small straight",
                "ss": "small straight",
                "lg": "large straight",
                "ls": "large straight",
                "3k": "three of a kind",
                "tk": "three of a kind",
                "tok": "three of a kind",
                "toak": "three of a kind",
                "4k": "four of a kind",
                "fk": "four of a kind",
                "fok": "four of a kind",
                "foak": "four of a kind",
                "c": "chance",
                "ch": "chance",
                "y!": "yahtzee",
                "rr": "reroll",
                "roll": "reroll"
            }
            let options = ["ones", "twos", "threes", "fours", "fives", "sixes", "three of a kind", "four of a kind", "full house", "small straight", "large straight", "chance", "yahtzee"]

            let state: { YAHTZEE_WAITING_FOR_PLAYERS: boolean } = this[1].state ?? {
                YAHTZEE_WAITING_FOR_PLAYERS: false
            }

            this[1].state = state

            if (state.YAHTZEE_WAITING_FOR_PLAYERS) {
                return { content: "A yahtzee game has already been started", status: StatusCode.ERR }
            }

            let gameModes = ["single", "multi"];

            let mode = args[0]?.toLowerCase()
            if (!gameModes.includes(mode)) {
                return { content: `${mode} is not a valid mode, must be \`single\` or \`multi\``, status: StatusCode.ERR }
            }

            let users: { [key: string]: ScoreSheet } = {}
            let bets: { [key: string]: number } = {}
            users[msg.author.id] = new ScoreSheet()
            if (mode === "single") {
                let bet = economy.calculateAmountFromString(msg.author.id, args[1], { min: total => total * 0.001 })
                if (!bet || bet < 0) {
                    return { content: "No bet", status: StatusCode.ERR }
                }
                bets[msg.author.id] = bet
            }
            if (mode === 'multi') {
                let bet = economy.calculateAmountFromString(msg.author.id, args[1], { min: (total) => total * .001 })
                if (!bet) {
                    return { content: `Not a valid bet`, status: StatusCode.ERR }
                }
                else if (!economy.canBetAmount(msg.author.id, bet)) {
                    return { content: `Bet too high`, status: StatusCode.ERR }
                }

                bets[msg.author.id] = bet

                await handleSending(msg, { content: "A YAHTZEE GAME HAS STARTED type `join <bet>` to join", status: StatusCode.INFO })
                state.YAHTZEE_WAITING_FOR_PLAYERS = true
                if (state.YAHTZEE_WAITING_FOR_PLAYERS) {
                    let timeLeft = 8000
                    let int = setInterval(async () => {
                        timeLeft -= 8000
                        await handleSending(msg, { content: `Yahtzee begins in ${Math.round(timeLeft / 1000)} seconds`, status: StatusCode.INFO })
                    }, 8000)
                    let playersJoining;
                    try {
                        let filter = function(m: Message) {
                            if (m.author.bot)
                                return false
                            let args = m.content.split(/\s/).map(v => v.toLowerCase())
                            if (args[0] === "join") {
                                let bet = economy.calculateAmountFromString(m.author.id, args[1], { min: (total) => total * .001 })
                                if (!bet || bet < 0) {
                                    m.reply("No bet")
                                    return false
                                }
                                if (!economy.canBetAmount(m.author.id, bet)) {
                                    m.reply("Bet too high")
                                    return false
                                }
                                bets[m.author.id] = bet
                                m.reply("U joined")
                                return true
                            }
                            return false
                        }
                        playersJoining = await msg.channel.awaitMessages({ filter: filter, time: 30000, errors: ["time"] })
                    }
                    catch (err) {
                        if (err instanceof Collection) {
                            playersJoining = err
                        }
                    }
                    clearInterval(int)
                    for (let i = 0; i < (playersJoining?.size || 0); i++) {
                        if (users[playersJoining?.at(i)?.author.id]) {
                            continue
                        }
                        users[(playersJoining as Collection<any, any>).at(i)?.author.id as string] = new ScoreSheet()
                    }
                }
            }

            let turnNo = 0

            if (Object.keys(users).length < 2 && mode === "multi") {
                state.YAHTZEE_WAITING_FOR_PLAYERS = false
                return { content: "Only  one user joined :(", status: StatusCode.ERR }
            }


            while (Object.values(users).filter(v => !v.is_filled()).length > 0) {
                let validPlayers = Object.fromEntries(Object.entries(users).filter(v => {
                    return !v[1].is_filled()
                }))

                let validPlayerKeys = Object.keys(validPlayers)
                let going = validPlayerKeys[turnNo % validPlayerKeys.length]

                let diceRolls = []

                for (let i = 0; i < 5; i++) {
                    diceRolls.push(Math.floor(Math.random() * (7 - 1) + 1))
                }

                if (!(await users[going].go(going, 1, diceRolls))) {
                    return crv("Stopped early")
                }

                users[going]
                turnNo++;
            }

            let embed = new EmbedBuilder()
            embed.setTitle("Game Over")
            let fields = []
            if (mode === "multi") {
                let sorted_users = Object.entries(users).sort((a, b) => a[1].score() - b[1].score())
                let winner = sorted_users.slice(-1)[0]
                let amount = Object.values(bets).reduce((p, c) => p + c, 0)
                embed.setDescription(`<@${winner[0]}> WINS ${amount}`)
                economy.addMoney(winner[0], amount)
                for (let user in users) {
                    if (user === winner[0]) continue;
                    economy.loseMoneyToBank(user, bets[user])
                }
                return crv(sorted_users.reduce((p, c) => `${p}\n${c[0]}: ${c[1]}`, ""))
            }
            for (let kv of Object.entries(users)) {
                let [user, scoreSheet] = kv
                fields.push({ name: msg.guild?.members.cache.get(user)?.displayName || user, value: String(scoreSheet.score()), inline: true })
            }
            if (mode === 'single') {
                let score = Object.values(users).at(0)?.score() as number
                let bet = Object.values(bets).at(0) as number
                let amount_earned = (bet / score)
                if (score - bet < 0) {
                    amount_earned *= -1
                }
                let money_earned = economy.calculateAmountFromString(Object.keys(users).at(0) as string, `${amount_earned}%`)
                economy.addMoney(Object.keys(users).at(0) as string, money_earned)
                await handleSending(msg, { content: `You earned $${money_earned}`, status: StatusCode.INFO })
                return crv(`Final score: ${score}`)
            }
            embed.addFields(fields)

            state.YAHTZEE_WAITING_FOR_PLAYERS = false

            return { content: `Game Over!!`, status: StatusCode.INFO, embeds: [embed] }

        }, "play a game of yahtzee, can be single or multi player", {
            helpArguments: {
                mode: createHelpArgument("must be multi (multiplayer) or single (single player)", true),
                bet: createHelpArgument(`The bet for the game<br>
if it's single player, tthe bet should actually be a guess on what your final  score is
the amount you earn will be <code>(bet/score)%</code> of your net worth

If it's multiplayer, it's just the amount you want to bet
`, true)
            },
            helpOptions: {
                "new-rules": createHelpOption(`Whether or not to play with the new rules<br>
If enabled, full houses, small straights, and large straights may be played an infinite number of times
until you put a 0 in the box`)
            }
        }),
    ]

    yield [
        "battle", ccmdV2(async function({ msg, args }) {
            return battle.battle(msg, args)

        }, `<h1>A BATTLE SIMULATOR</h1>`, {

            docs: `
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
                    <b>blue shell</b>: Deal 50 damage to the player with the most health (if they have more than 50 health) (cost: $0.5 + 2%)
                </li>
                <li>
                    <b>shield</b>: Block the next game attack (cost: $0.5 + 0.3%)
                </li>
                <li>
                    <b>mumbo</b>: Add a dummy player. When he dies lose 0.5%, If he wins, you get half of the pool (cost: $1)
                </li>
                <li>
                    <b>suicide*</b>: Deal randomly 2-10 damage to yourself (cost: $1 + 0.1%)
                </li>
                <li>
                    <b>50 hp</b>: gives you 50 hp if you pass the test (cost: 0.2%)
                </li>
                <li>
                    <b>chance</b>: Randomly heal or take 2 to 80 damage (cost 0.1 + 0.5%)
                </li>
                <li>
                    <b>half</b>: take half damage (cannot be used with shield) (cost: 1%)
                </li>
                <li>
                    <b>axe</b>: hit a random player for 0 to playercount*5 damage (kills) (cost: 1 + 0.1%)
                </li>
                <li>
                    <b>split</b>: reduce all player's hp by half (if all players are above 200) (cost: 5)
                </li>
                <li>
                    <b>rheal</b>: randomly heal a player who has less than 50 hp for 0 to playerCount * 15 damage (cost: 0.1 + 0.1%)
                </li>
                <li>
                    <b>round</b>: round yourself up to the nearest 10 hp, round all other users down to the nearest 10 hp (cost: 10 + 0.8%)
                </li>
                <li>
                    <b>sacrifice</b>: every second you lose 1hp, but everyone else has an increased damage multiplier of 1.5 (can only be used once)
                </li>
                <li>
                    <b>yoink</b>: steal mumbo (can only be used once)
                </li>
                <li>
                    <b>brew</b>: brews one of the following potions
                    <ul>
                        <li><b>general poision</b>: takes 2 seconds to brew, deals 30 damage to ALL players</li>
                        <li><b>deadly poison</b>: takes 7 seconds to brew, deals 50 damage to all players hp% chance to hit the brewer (eg, if the brewer has 10 hp, its a 10% chance to hit the brewer)</li>
                        <li><b>bomb rain</b>: deal 5 * playercount damage 3 times (happens immediately)</li>
                    </ul>
                </li>
            </ul>
            <p>*Cannot kill players, they will remain in the negatives until a game message targets them</p>
            `,
            helpArguments: {
                "bet": {
                    description: "Your bet (must be at minimum 0.2%)"
                },
                "pool type": {
                    description: "The type of pool, can be winnter take all (wta) or distribute (where when someone dies, their money gets distributed)"
                }
            },
            helpOptions: {
                "no-items": {
                    description: "Disable items"
                }
            }

        })
    ]

    yield [
        "roulette", ccmdV2(async function({ msg, args }) {
            if (!isMsgChannel(msg.channel)) return { noSend: true, status: StatusCode.ERR }
            globals.startCommand(msg.author.id, "roulette")

            args.beginIter()

            let sign = user_options.getOpt(msg.author.id, "currency-sign", configManager.GLOBAL_CURRENCY_SIGN)

            let reqMoney = args.expectString(1)
            if (reqMoney === BADVALUE) {
                globals.endCommand(msg.author.id, "roulette")
                return crv(`Usage: \`${configManager.PREFIX}roulette <bet> <guess>\``)
            }

            let min = economy.calculateAmountFromNetWorth(msg.author.id, "0.02%")
            let money = economy.calculateAmountFromString(msg.author.id, reqMoney, {
                min: () => {
                    return min
                }
            })

            if (!economy.canBetAmount(msg.author.id, money)) {
                globals.endCommand(msg.author.id, "roulette")
                return crv(`You do not have ${sign}${money}`)
            }
            if (money < min) {
                globals.endCommand(msg.author.id, "roulette")
                return crv("Cannot less than 0.02%")
            }

            const thirds = {
                1: "1st third",
                2: "2nd third",
                3: "3rd third"
            }

            const isValidGuess = (text: string) => {
                let n = Number(text)
                if (!isNaN(n)) {
                    if (n < 37 && n >= 0) {
                        return text
                    }
                    return false
                }

                let validList = Object.values(thirds).concat(["red", "black", "1st half", "2nd half"])

                if (validList.includes(text)) return text

                return false
            }

            let guess = args.expect(truthy, i => {
                if (!i.length) return BADVALUE
                let v = isValidGuess(i.join(" "))

                if (v) return v

                return BADVALUE
            })

            if (guess === BADVALUE) {
                globals.endCommand(msg.author.id, "roulette")
                return crv(`Usage: \`${configManager.PREFIX}roulette <bet> <guess>\``)
            }

            let bets: { [key: string]: [number, string] } = { [msg.author.id]: [money, guess] }

            await handleSending(msg, crv(`${msg.author} played ${sign}${money} on ${guess}\nStarting in 30 seconds, place your bets now\ntype \`<bet> <guess>\` to join`, { status: StatusCode.PROMPT }))

            await msg.channel.awaitMessages({
                filter: m => {
                    if (globals.userUsingCommand(m.author.id, "roulette")) return false
                    let [amount, ...location] = m.content.split(" ")
                    let min = economy.calculateAmountFromNetWorth(m.author.id, "0.02%")
                    let money = economy.calculateAmountFromString(m.author.id, amount, {
                        min: () => min
                    })
                    if (!economy.canBetAmount(m.author.id, money) || money < min) {
                        return false
                    }
                    if (isValidGuess(location.join(" "))) {
                        bets[m.author.id] = [money, location.join(" ")]
                        handleSending(msg, crv(`${m.author} played $${money} on ${location.join(" ")}`))
                        return true
                    }
                    return false
                }, time: 30000
            })

            let pot = 0
            for (let [playerId, [amount, _location]] of Object.entries(bets)) {
                pot += amount
                economy.loseMoneyToBank(playerId, amount)
            }

            let result = Math.floor(Math.random() * 36)
            let resultText = String(result)

            let color = result % 2 === 0 ? "red" : "black"

            let halfText = result < 19 ? "1st half" : "2nd half"

            let third = Math.ceil(result / 12)
            let thirdText = thirds[third as keyof typeof thirds] ?? "0"

            if (result === 0) ((color = "green") && (halfText = "0"))

            let totaltext = `The rolled number is ${resultText} (${color})\n`
            for (let [playerId, [amount, guess]] of Object.entries(bets)) {
                let text = `<@${playerId}> did not win`
                let winnings = 0
                if (guess === resultText) {
                    winnings = pot * 37
                    text = `<@${playerId}> GUESSED THE EXACT NUMBER OF ${guess}`
                }
                else if (guess === halfText) {
                    winnings = amount * 2
                    text = `<@${playerId}> guessed the correct half of ${guess}`
                }
                else if (guess === color) {
                    winnings = amount * 2
                    text = `<@${playerId}> guessed the correct color of ${guess}`
                }
                else if (guess === thirdText) {
                    winnings = amount * 3
                    text = `<@${playerId}> guessed the correct third of ${guess}`
                }
                economy.addMoney(playerId, winnings)
                let sign = user_options.getOpt(playerId, "currency-sign", configManager.GLOBAL_CURRENCY_SIGN)
                if (winnings > 0)
                    text += `\nearnings: **${sign}${winnings - amount}** (earnings - bet) (${winnings} - ${amount})`
                totaltext += text + "\n--------------\n"
            }

            globals.endCommand(msg.author.id, "roulette")

            return crv(totaltext)

        }, "Is it black or red, bet your life savings to find out!!!!", {
            permCheck: m => !globals.userUsingCommand(m.author.id, "roulette"),
            helpArguments: {
                bet: createHelpArgument("Your bet", true),
                guess: createHelpArgument(`The guess<br><lh>Must be one of</lh>
<ul>
<li>
    <b>number</b>: any number 0-36 (get 37x the pot)
</li>
<li>
    <b>red/black</b>: red is even, black is odd (get 2x the pot)
</li>
<li>
    <b>1st half/2nd half</b>: either the 1st or 2nd half (get 2x the pot)
</li>
<li>
    <b>1st third/2nd third/3rd third</b>: Either the 1st, 2nd, or 3rd third of numbers (get 3x the pot)
</li>
</ul>`, true)

            }
        })
    ]

    yield [
        "ticket", ccmdV2(async function({ rawOpts: opts, msg, args }) {
            let round = !opts['no-round']
            let amount = economy.calculateAmountFromString(msg.author.id, args[0], { min: (t: number, _a: string) => t * 0.005 })
            let numbers = args.slice(1, 4)
            if (!amount) {
                return { content: "No amount given", status: StatusCode.ERR }
            }
            if (!economy.canBetAmount(msg.author.id, amount)) {
                return { content: "You do not have enough money for this", status: StatusCode.ERR }
            }
            if (amount / msg.author.economyData.money < 0.005) {
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
                ticket = numbers.map(v => Number(v)) as [number, number, number]
            }
            for(let number of ticket) {
                if(number < 1 || number > 5) {
                    return crv(`Only numbers 1-5 can be used`, { status: StatusCode.ERR })
                }
            }
            let answer = economy.getLottery()
            let e = new EmbedBuilder()
            if (round) {
                amount = Math.floor(amount * 100) / 100
            }
            e.setFooter({ text: `Cost: ${amount}` })
            if (JSON.stringify(ticket) == JSON.stringify(answer.numbers)) {
                let userFormat = user_options.getOpt(msg.author.id, "lottery-win", "__default__")
                let winningAmount = answer.pool * 2 + amountParser.calculateAmountRelativeTo(economy.economyLooseGrandTotal().total, "0.2%")
                economy.addMoney(msg.author.id, winningAmount)
                economy.newLottery()
                if (userFormat !== "__default__") {
                    return { content: format(userFormat, { numbers: ticket.join(" "), amount: String(winningAmount) }), recurse: true, status: StatusCode.RETURN, do_change_cmd_user_expansion: false }
                }
                e.setTitle("WINNER!!!")
                e.setColor("Green")
                e.setDescription(`<@${msg.author.id}> BOUGHT THE WINNING TICKET! ${ticket.join(" ")}, AND WON **${winningAmount}**`)
            }
            else {
                e.setColor("Red")
                e.setTitle(["Nope", "Loser"][Math.floor(Math.random() * 2)])
                e.setDescription(`<@${msg.author.id}> bought the ticket: ${ticket.join(" ")}, for $${amount} and didnt win`)
            }
            return { embeds: [e], status: StatusCode.RETURN }

        }, "Buy a lottery ticket", {
            arguments: {
                "amount": {
                    description: "The amount to pay for the ticket (minimum of 0.5% of your money)",
                },
                "numbers": {
                    description: "The numbers to buy seperated by spaces"
                }
            }
        })
    ]

    yield [
        "heist", ccmdV2(async function({ msg, rawOpts: opts, sendCallback }) {

            let state = this[1].state ?? {
                HEIST_PLAYERS: [],
                HEIST_STARTED: false,
                HEIST_TIMEOUT: null
            }
            this[1].state = state

            if (state.HEIST_PLAYERS.includes(msg.author.id)) {
                return { content: "U dingus u are already in the game", status: StatusCode.ERR }
            }
            if ((economy.getEconomy()[msg.author.id]?.money || 0) <= 0) {
                return { content: "U dont have money", status: StatusCode.ERR }
            }
            if (state.HEIST_STARTED) {
                return { content: "The game  has already started", status: StatusCode.ERR }
            }
            state.HEIST_PLAYERS.push(msg.author.id)
            let timeRemaining = 30000

            if (state.HEIST_TIMEOUT !== null) {
                let heistJoinFormat = user_options.getOpt(msg.author.id, "heist-join", `${msg.author} joined the heist`)
                return { content: heistJoinFormat, recurse: true, status: StatusCode.INFO, do_change_cmd_user_expansion: false }
            }

            let int = setInterval(async () => {
                timeRemaining -= 1000
                if (timeRemaining % 8000 == 0)
                    await handleSending(msg, { content: `${timeRemaining / 1000} seconds until the heist commences!`, status: StatusCode.INFO }, sendCallback)
            }, 1000)

            let data: { [key: string]: number } = {} //player_id: amount won
            state.HEIST_TIMEOUT = setTimeout(async () => {
                state.HEIST_STARTED = true
                clearInterval(int)

                await handleSending(msg, { content: `Commencing heist with ${state.HEIST_PLAYERS.length} players`, status: StatusCode.INFO }, sendCallback)

                for (let player of state.HEIST_PLAYERS) {
                    data[player] = 0
                    vars.setVar("__heist", "0", player)
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

                let edge = 0

                for (let resp of fileResponses) {
                    let stage = resp.match(/STAGE=([^ ]+)/)
                    if (!stage?.[1]) {
                        continue
                    }

                    resp = resp.replace(/STAGE=[^ ]+/, "")

                    let location = resp.match(/(?<!SET_)LOCATION=([^ ]+)/)
                    if (location?.[1]) {
                        if (!LOCATIONS.includes(location[1])) {
                            LOCATIONS.push(location[1])
                        }
                    }

                    let type = ""

                    let size = resp.match(/AMOUNT=([^ ]+)/)

                    let gain = resp.match(/GAIN=([^ ]+)/)
                    if (gain?.[1]) {
                        type = "positive"
                        edge += { none: 0, cents: 1, normal: 2, medium: 3, large: 4 }[size[1]]
                    }

                    let lose = resp.match(/LOSE=([^ ]+)/)
                    if (lose?.[1]) {
                        type = "negative"
                        edge -= { none: 0, cents: 1, normal: 2, medium: 3, large: 4 }[size[1]]
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

                //if there's way more positives than negatives, then edge will be closer to 10
                //later on it will subtract edge from `amount` to reduce, well, the edge towards positivity lol
                edge = edge / fileResponses.length * 10

                await handleSending(msg, { content: `Starting heist with an edge of ${edge}`, status: StatusCode.INFO }, sendCallback)

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

                async function handleStage(stage: string): Promise<true | [false, "positive" | "negative" | "neutral"]> {//{{{
                    if (!stats.locationsVisited[current_location]) {
                        stats.locationsVisited[current_location] = {}
                    }

                    stats.adventureOrder.push([current_location, stage])

                    let shuffledPlayers = state.HEIST_PLAYERS.shuffle()

                    let amount = (Math.random() * 10)

                    let negpos: "negative" | "positive" | "neutral" = (["negative", "positive", "neutral"] as const)[Math.floor(Math.random() * 3)]

                    let responseList = responses[stage.replaceAll(" ", "_") + `_${negpos}`]

                    //neutral should be an optional list for a location, pick a new one if there's no neutral responses for the location
                    if (!responseList?.length && negpos === 'neutral') {
                        let negpos = ["positive", "negative"][Math.floor(Math.random() * 2)]
                        responseList = responses[stage.replaceAll(" ", "_") + `_${negpos}`]
                    }

                    if (!responseList) {
                        return [false, negpos]
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
                                if (number > state.HEIST_PLAYERS.length)
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
                        return [false, negpos]
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
                    else {
                        let multiplier = Number({ "none": 0, "normal": 1, "medium": 2, "large": 3 }[amountType[1]])
                        amount *= multiplier
                    }

                    amount -= edge

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
                                    let oldValue = Number(vars.getVar(msg, `__heist`, player))
                                    vars.setVar("__heist", String(oldValue + amount), player)
                                }
                            }
                            else {
                                addToLocationStat(current_location, shuffledPlayers[Number(user) - 1], amount)
                                data[shuffledPlayers[Number(user) - 1]] += amount
                                let oldValue = Number(vars.getVar(msg, "__heist", shuffledPlayers[Number(user) - 1])) || 0
                                vars.setVar("__heist", String(oldValue + amount), shuffledPlayers[Number(user) - 1])
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
                                    let oldValue = Number(vars.getVar(msg, `__heist`, player))
                                    vars.setVar("__heist", String(oldValue + amount), player)
                                }
                            }
                            else {
                                addToLocationStat(current_location, shuffledPlayers[Number(user) - 1], amount)
                                data[shuffledPlayers[Number(user) - 1]] += amount
                                let oldValue = Number(vars.getVar(msg, "__heist", shuffledPlayers[Number(user) - 1])) || 0
                                vars.setVar("__heist", String(oldValue + amount), shuffledPlayers[Number(user) - 1])
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
                        let clickResponse = response.match(/BUTTONCLICK=(.*) ENDBUTTONCLICK/)
                        let buttonResponse = ""
                        if (clickResponse?.[1]) {
                            buttonResponse = clickResponse[1]
                            response = response.replace(/BUTTONCLICK=(.*) ENDBUTTONCLICK/, "")
                        }
                        let askText = ""
                        let validLocations = []
                        for (let op of locationOptions) {
                            if (!op) continue;
                            if (op == "__random__") {
                                op = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)]
                            }
                            validLocations.push(op)
                            askText += `**${op}**\n`
                        }
                        let m = await promptUser(msg, `${response}\n${askText}`, sendCallback, {
                            filter: m => {
                                return validLocations.includes(m.content)
                            }
                        })
                        let resp = validLocations[0]
                        if (m) {
                            resp = m.content
                        }
                        await handleSending(msg, { content: `Advancing to: ${resp}`, status: StatusCode.INFO })
                        current_location = resp
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
                    let res = await handleStage(stage)
                    //it returned [false, "positive" | "neutral" | "negative"] meaning there was no response for the {stage}_{ty}
                    if (typeof res === 'object') {
                        let ty = res[1]
                        stats.adventureOrder[stats.adventureOrder.length - 1][1] += " *(fail)*"
                        let oldStage = stage
                        await handleSending(msg, { content: `FAILURE on stage: ${oldStage} (${ty}) ${current_location == '__generic__' ? "" : `at location: ${current_location}`}, resetting to location __generic__`, status: StatusCode.ERR }, sendCallback)
                        current_location = '__generic__'
                    }
                    else {
                        if (legacyNextStages[lastLegacyStage as keyof typeof legacyNextStages]) {
                            stage = legacyNextStages[lastLegacyStage as keyof typeof legacyNextStages]
                            lastLegacyStage = stage
                        }
                        else {
                            stage = 'end'
                        }
                    }
                }
                state.HEIST_PLAYERS = []
                state.HEIST_TIMEOUT = null
                state.HEIST_STARTED = false
                if (Object.hasEnumerableKeys(data)) {
                    let useEmbed = false
                    let e = new EmbedBuilder()
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
                                if (member) {
                                    e.addFields(efd([String(member.displayName || member.user.username), `$${gain} (${data[player]}%)`]))
                                }
                                else {
                                    e.addFields(efd([String(data[player]), `<@${player}>`]))
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
            }, timeRemaining) as NodeJS.Timeout
            return { content: "You started a heist", status: StatusCode.ERR }

        },
            "Go on a \"heist\"", {
            docs: "<p>Heist is a game where you go from stage to stage and location to location</p><h2>Stages</h2><p>Each location has stages, by default each location has 3 stages<ul><li>getting_in</li><li>robbing</li><li>escape</li></ul> However more can be added.<br><h2>Locations</h2><p>By default there is only 1 location, <code>__generic__</code></p>",
            helpOptions: {
                "no-stats": createHelpOption("Display only the amount gained/lost from the heist", ['ns']),
                "no-adventure-order": createHelpOption("Do not display  the  adventure order", ["noa"]),
                "no-location-stats": createHelpOption("Do not display amount gained/lost from each location", ["nls"]),
                "no-total": createHelpOption("Do not display the amount gained/lost", ["nt"]),
            }
        }
        )
    ]

    yield [
        "last-run", ccmdV2(async function({ msg, args }) {
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
            let amount = 0

            //solves a bug where the user has to run last-run once in order to create the timer
            let bypassCheck = false
            if (timer.getTimer(msg.author.id, "%last-run") === undefined) {
                timer.createTimer(msg.author.id, "%last-run")
                timer.saveTimers()
                bypassCheck = true
            }

            if (timer.has_x_s_passed(msg.author.id, "%last-run", 60) || bypassCheck) {
                timer.restartTimer(msg.author.id, "%last-run")
                timer.saveTimers()
                amount = diff / (1000 * 60 * 60)
                if (hours == minutes) {
                    amount *= 1.1
                }
                if (minutes == seconds) {
                    amount *= 1.1
                }
                if (hours == minutes && minutes == seconds) {
                    amount *= 1.5
                }
                if (pet.getActivePet(msg.author.id) == "bird") {
                    amount *= 2
                }
                economy.addMoney(msg.author.id, amount)

                if (Number(days) >= 1) {
                    let ach = achievements.achievementGet(msg, "patience")
                    if (ach) {
                        await handleSending(msg, ach)
                    }
                }

                if (Number(days) === 0 && Number(hours) === 0 && Number(minutes) === 0 && Number(seconds) === 0) {
                    let ach = achievements.achievementGet(msg, "impatient")
                    if (ach) await handleSending(msg, ach)
                }

                vars.setVarEasy("!stats:last-run.count", String(Number(vars.getVar(msg, "!stats:last-run.count")) + 1), msg.author.id)
                vars.setVarEasy("!stats:last-run.last", String(amount))
                vars.setVarEasy("!stats:last-run.total", String(Number(vars.getVar(msg, "!stats:last-run.total")) + amount), msg.author.id)
                vars.saveVars()

                fmt += `\n{earnings}`
                fs.writeFileSync("./command-results/last-run", String(Date.now()))
            }
            return { content: format(fmt, { T: lastRun.toString(), t: `${days}:${hours}:${minutes}:${seconds}.${milliseconds}`, H: hours, M: minutes, S: seconds, D: days, i: milliseconds, f: String(diff), d: String(diff / (1000 * 60 * 60 * 24)), h: String(diff / (1000 * 60 * 60)), m: String(diff / (1000 * 60)), s: String(diff / 1000), hours: hours, minutes: minutes, seconds: seconds, millis: milliseconds, diff: String(diff), days: days, date: lastRun.toDateString(), time: lastRun.toTimeString(), earnings: `${msg.author} Earned: ${user_options.getOpt(msg.author.id, "currency-sign", configManager.GLOBAL_CURRENCY_SIGN)}${amount}` }), status: StatusCode.RETURN }
        }, "Formats:<ul><li>%H: hours</li><li>%M: minutes</li><li>%S: seconds</li><li>%D: days</li><li>%i: milliseconds</li><li>%f: total milliseconds</li><li>%d: total days</li><li>%h: total hours</li><li>%m: total minutes</li><li>%s: total seconds</li><li>%T: The full time it was last run</li><li>%t: the time ago it was run</li> <li>{date}: the date it was last run</li><li>{time}: las time it was run</li></ul>", {
            arguments: {
                fmt: {
                    description: "The format to show the time in"
                }
            },
        })
    ]

    yield [
        "blackjack", ccmdV2(async ({ msg, args, rawOpts: opts, sendCallback }) => {
            if (!isMsgChannel(msg.channel)) return { noSend: true, status: StatusCode.ERR }
            let hardMode = Boolean(opts['hard'])
            let betStr = args[0]
            if (!betStr) {
                betStr = user_options.getOpt(msg.author.id, "default-bj-bet", "0")
            }
            const lastBet = vars.getVar2(msg, msg.author.id, "", "!bj")
            let bet = economy.calculateAmountFromString(msg.author.id, betStr, {
                last: lastBet || 0,
                l: lastBet || 0
            })
            if (!bet) {
                return { content: "no bet given", status: StatusCode.ERR }
            }
            if (bet <= 0) {
                return { content: "No reverse blackjack here", status: StatusCode.ERR }
            }
            if (hardMode)
                bet *= 2

            vars.setVar2(msg.author.id, "", "!bj", new vars.Variable('number', bet))

            if (!economy.canBetAmount(msg.author.id, bet)) {
                return { content: "That bet is too high for you", status: StatusCode.ERR }
            }
            if (globals.userUsingCommand(msg.author.id, "blackjack")) {
                return { content: "You idiot u already playing the game", status: StatusCode.ERR }
            }

            globals.startCommand(msg.author.id, "blackjack")

            let blackjack_screen = user_options.getOpt(msg.author.id, "bj-screen", "**BLACKJACK!**\nYou got: **{amount}**")

            if (shop.hasItem(msg.author.id, "conspiracy")) {
                shop.useItem(msg.author.id, "conspiracy")
                economy.addMoney(msg.author.id, bet * 3)
                globals.endCommand(msg.author.id, "blackjack")
                return { content: format(blackjack_screen, { amount: String(bet * 3) }), recurse: true, status: StatusCode.RETURN, do_change_cmd_user_expansion: false }
            }

            let cards: string[] = []

            let numbers = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]
            for (let _suit of ["Diamonds", "Spades", "Hearts", "Clubs"]) {
                for (let num of numbers) {
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


            function dealCards(playerCards: string[], dealerCards: string[]) {
                for (let i = 0; i < 2; i++) {
                    giveRandomCard(cards, playerCards)
                    giveRandomCard(cards, dealerCards)
                }
            }

            function letDealerPlay(dealerCards: string[]) {
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
            }

            function winBJ(bet: number) {
                economy.addMoney(msg.author.id, bet * 3)
                globals.endCommand(msg.author.id, "blackjack")
                return { content: format(blackjack_screen, { amount: String(bet * 3) }), recurse: true, status: StatusCode.RETURN, do_change_cmd_user_expansion: false }

            }

            function dealerBJ(bet: number) {
                economy.loseMoneyToBank(msg.author.id, bet)
                globals.endCommand(msg.author.id, "blackjack")
                if (Math.random() > .999) {
                    economy.loseMoneyToBank(msg.author.id, bet * 2)
                    return { content: "Bowser was actually the dealer and got blackjack, and forrces you to pay 3x what you bet", status: StatusCode.RETURN }
                }
                return { content: `**BLACKJACK!**\nYou did not get: **${bet * 3}**`, status: StatusCode.RETURN }

            }

            let playersCards: string[] = []
            let dealerCards: string[] = []

            dealCards(playersCards, dealerCards)

            if (calculateTotal(playersCards).total === 21) {
                return winBJ(bet)
            }

            if (calculateTotal(dealerCards).total === 21) {
                return dealerBJ(bet)
            }

            letDealerPlay(dealerCards)

            let usedReset = false;

            let aurl = msg.member?.user.avatarURL()

            let editMsg;

            while (true) {
                let embed = new EmbedBuilder()

                embed.setTitle("Blackjack")

                if (aurl) {
                    embed.setThumbnail(aurl.toString())
                }

                let playerTotal = calculateTotal(playersCards)

                if (playerTotal.soft) {
                    embed.addFields(efd(["Your cards", `value: **${playerTotal.total}** (soft)`, true]))
                }
                else embed.addFields(efd(["Your cards", `value: **${playerTotal.total}**`, true]))

                //FIXME: edge case where dealerCards[0] is "A", this could be wrong
                embed.addFields(efd(["Dealer cards", `value: **${calculateCardValue(dealerCards[0], 0).amount}**`, true]))

                embed.setFooter({ text: `Cards Remaining, \`${cards.length}\`` })

                let turnOptions = ["hit", "stand", "double bet"]

                if (shop.hasItem(msg.author.id, "reset")) {
                    embed.setDescription(`\`reset\`: restart the game\n\`hit\`: get another card\n\`stand\`: end the game\n\`double bet\`: to double your bet\n(current bet: ${bet})`)
                    turnOptions.push("reset")
                }
                else {
                    embed.setDescription(`\`hit\`: get another card\n\`stand\`: end the game\n\`double bet\`: to double your bet\n(current bet: ${bet})`)
                }


                if (!editMsg)
                    editMsg = await handleSending(msg, { embeds: [embed], status: StatusCode.INFO })
                else await editMsg.edit({ embeds: [embed] })

                let response, collectedMessages
                collectedMessages = await msg.channel.awaitMessages({
                    filter: m => m.author.id === msg.author.id && turnOptions.includes(m.content.toLowerCase())
                    , max: 1, time: 30000
                })
                response = collectedMessages.at(0)
                if (!response) {
                    economy.loseMoneyToBank(msg.author.id, bet)
                    globals.endCommand(msg.author.id, "blackjack")
                    return { content: `Did not respond  in time, lost ${bet}`, status: StatusCode.ERR }
                }

                if (response.deletable) await response.delete()


                let choice = response.content.toLowerCase()
                if (choice === 'double bet') {
                    if (!economy.canBetAmount(msg.author.id, bet * 2)) {
                        await handleSending(msg, { content: "That bet is too high for you", status: StatusCode.ERR }, sendCallback)
                        continue
                    }
                    bet *= 2
                    choice = "hit"
                }

                if (choice === 'hit') {
                    giveRandomCard(cards, playersCards)
                }

                if (choice === 'reset' && shop.hasItem(msg.author.id, "reset") && !usedReset) {

                    shop.useItem(msg.author.id, "reset")

                    cards = []
                    for (let _suit of ["Diamonds", "Spades", "Hearts", "Clubs"]) {
                        for (let num of ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]) {
                            cards.push(`${num}`)
                        }
                    }

                    playersCards = []
                    dealerCards = []

                    dealCards(playersCards, dealerCards)

                    if (calculateTotal(playersCards).total === 21) {
                        return winBJ(bet)
                    }
                    if (calculateTotal(dealerCards).total === 21) {
                        return dealerBJ(bet)
                    }

                    letDealerPlay(dealerCards)

                    usedReset = true
                }
                if ((choice === 'stand' && (hardMode == false || calculateTotal(playersCards).total >= 17)) || calculateTotal(playersCards).total > 21) {
                    break
                }
            }

            let playerTotal = calculateTotal(playersCards).total
            let dealerTotal = calculateTotal(dealerCards).total

            let stats = `Your total: ${playerTotal} (${playersCards.length})\nDealer total: ${dealerTotal} (${dealerCards.length})`

            let status = "You won"

            let currency_sign = user_options.getOpt(msg.author.id, "currency-sign", configManager.GLOBAL_CURRENCY_SIGN)

            if (playerTotal > 21) {
                status = `You lost: $${bet} (over 21)`
                economy.loseMoneyToBank(msg.author.id, bet)
            }
            else if (playerTotal === dealerTotal) {
                status = "TIE"

                //spider stuff{{{
                if (Math.random() > 0.999) {
                    let UserHp = 60;
                    let SpiderHp = 50;

                    await handleSending(msg, { status: StatusCode.INFO, content: "a spider jum pon tablew!121 You must defend honor!1 (attack/heal)" });

                    let newmsg = await handleSending(msg, { status: StatusCode.INFO, content: `UserHp: ${UserHp}\nSpiderHp: ${SpiderHp}` });
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
                    globals.endCommand(msg.author.id, "blackjack")
                    if (UserHp > 0) {

                        let amount = Math.random() * 2 + 1
                        economy.addMoney(msg.author.id, bet * amount);
                        return { content: `congratulation u win the spid\n${format(blackjack_screen, { amount: String(bet * amount) })}`, status: StatusCode.RETURN, do_change_cmd_user_expansion: false };
                    } else {
                        economy.loseMoneyToBank(msg.author.id, bet);
                        return { content: "u r ez dead", status: StatusCode.RETURN };
                    }
                }//}}}
            }
            else if (playerTotal < dealerTotal && dealerTotal < 22) {
                status = `You lost: ${currency_sign}${bet} (dealer won)`
                economy.loseMoneyToBank(msg.author.id, bet)
            }
            else {
                status = `You won: ${currency_sign}${bet}`
                economy.addMoney(msg.author.id, bet)
            }
            globals.endCommand(msg.author.id, "blackjack")

            return { content: `<@${msg.author.id}>\n**${status}**\n${stats}`, status: StatusCode.RETURN }
        }, "Play a round of blackjack",
            {
                can_run_on_web: false,
                helpArguments: { "hard": createHelpOption("You can only stand if you have 17+") },
            },
        ),
    ]

    yield [
        "coin", ccmdV2(async function({ rawOpts: opts, msg, args }) {
            if (!args.length) {
                return crv(choice(['heads', 'tails']))
            }
            let [betstr, guess] = args
            if (!guess) {
                guess = betstr
                betstr = ""
            }
            guess = guess.toLowerCase()
            let bet = economy.calculateAmountFromString(msg.author.id, String(betstr || opts['bet'] || opts['b'])) || 0
            if (bet && !guess) {
                return { content: "You cannot bet, but not have a guess", status: StatusCode.ERR }
            }
            if (!["heads", "tails"].includes(guess)) {
                return crv("Guess must be `heads` or `tails`")
            }
            let other = guess === "heads" ? "tails" : "heads"
            let side = Math.random() > .51 ? guess : other
            if (Math.random() < 0.01) {
                side = "side"
            }
            if (!bet || bet < 0) {
                return { content: side, status: StatusCode.RETURN }
            }
            if (!economy.canBetAmount(msg.author.id, bet)) {
                return { content: "You dont have enough money for this bet", status: StatusCode.ERR }
            }
            if (side == guess) {
                economy.addMoney(msg.author.id, bet)
                return { content: `The side was: ${side}\nYou won: ${bet}`, status: StatusCode.RETURN }
            } else if (side === "side") {
                let blackjack_screen = user_options.getOpt(msg.author.id, "bj-screen", "**BLACKJACK!**\nYou got: **{amount}**")
                economy.addMoney(msg.author.id, bet * 5)
                return { content: format(blackjack_screen, { amount: String(bet * 3) }), recurse: true, status: StatusCode.RETURN, do_change_cmd_user_expansion: false }
            }
            else {
                economy.loseMoneyToBank(msg.author.id, bet)
                return { content: `The side was: ${side}\nYou lost: ${bet}`, status: StatusCode.RETURN }
            }
        }, "flip a coin", {
            options: {
                bet: createHelpOption("The bet to put on a side")
            },
            arguments: {
                betAmount: createHelpArgument("Amount of money to put on the line", false, "guess"),
                guess: createHelpArgument("The guess (heads/tails)", false, "betAmount")
            }
        })
    ]

    yield [
        "uno", ccmdV2(async function({ msg, rawOpts: opts, args, sendCallback }) {
            if (!msg.member || !msg.guild) return crv("Not in a guild", { status: StatusCode.ERR })
            let requestPlayers = args.join(" ").trim().split("|").map(v => v.trim()).filter(v => v.trim())
            let players: GuildMember[] = [msg.member]
            for (let player of requestPlayers) {
                let p = await fetchUser(msg.guild, player)
                if (!p) {
                    await handleSending(msg, { content: `${player} not found`, status: StatusCode.ERR }, sendCallback)
                    continue
                }
                players.push(p)
            }
            if (players.length == 1) {
                return { content: "No one to play with :(", status: StatusCode.ERR }
            }

            let maxNumber = parseInt(String(opts["max"])) || 9
            if (maxNumber > 1000) {
                await handleSending(msg, { content: "The maximum is to high, defaulting to 1000", status: StatusCode.WARNING })
                maxNumber = 1000
            }
            let cards = uno.createCards(maxNumber, { enableGive: opts['give'] !== undefined, enableShuffle: opts['shuffle'] !== undefined, "enable1": opts['1'] !== undefined })

            let deck = new uno.Stack(cards)
            let pile = new uno.Stack([])

            let playerData = new Map<string, Hand>()

            for (let player of players) {
                playerData.set(player.id, new uno.Hand(7, deck))
            }

            let order = [...playerData.keys()]

            let forcedDraw = 0
            let turns = iterators.cycle(order, (i: any) => {
                let playerIds = order
                fetchUser(msg.guild as Guild, playerIds[i % playerIds.length]).then((u: any) => {
                    if (players.map(v => v.id).indexOf(going) < 0) {
                        going = turns.next().value
                        return
                    }
                    if (forcedDraw) {
                        handleSending(msg, { content: `<@${going}> is forced to draw ${forcedDraw} cards`, status: StatusCode.INFO },)
                        for (let i = 0; i < forcedDraw; i++) {
                            let rv = playerData.get(going)?.draw(deck)
                            if (!rv) {
                                handleSending(msg, { content: "Deck empty, shuffling pile into deck", status: StatusCode.INFO },)
                                pile.shuffle()
                                deck = new uno.Stack(pile.cards)
                                pile = new uno.Stack([])
                            }
                        }
                        forcedDraw = 0
                    }
                    if (!(pile.top()?.type == 'skip')) {
                        let player = players[players.map(v => v.id).indexOf(going)]
                        let send = displayStack(playerData.get(player.id) as Hand)
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
            function displayStack(stack: Stack | Hand, count = -1) {
                let send = "card\n"
                if (count < 0) count = stack.cards.length
                for (let i = 0; i < count; i++) {
                    send += `${i + 1}:\n`
                    send += stack.cards[i]?.display()
                }
                return send
            }
            let keywords = ["draw", "stack", "stop", "cards"]
            for (let player of players) {
                await player.user.createDM()
                let collection = player.user.dmChannel?.createMessageCollector({ filter: (m: Message) => (!isNaN(Number(m.content)) || keywords.includes(m.content.toLowerCase())) && choosing == false })
                if (!collection) {
                    return { content: `Couldnt listen in ${player}'s dms`, status: StatusCode.ERR }
                }
                collection.on("collect", async (m: any) => {
                    if (m.content.toLowerCase() == "stop") {
                        players = players.filter(v => v.id != m.author.id)
                        if (players.length == 0) {
                            await handleSending(msg, { content: "game over", status: StatusCode.RETURN },)
                        }
                        collection?.stop()
                        if (m.author.id == common.client.user?.id) return
                        await handleSending(msg, { content: `${m.author} quit`, status: StatusCode.RETURN },)
                        going = turns.next().value
                        return
                    }
                    if ((playerData.get(player.id) as Hand).cards.length <= 0) {
                        await handleSending(msg, { content: `${player} wins!!\n${cardsPlayed} cards were played\n${cardsDrawn} cards were drawn`, status: StatusCode.RETURN })
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
                        await m.channel.send(displayStack(playerData.get(player.id) as Hand))
                        return
                    }
                    if (m.content.toLowerCase() == 'draw') {
                        let rv = (playerData.get(player.id) as Hand).draw(deck)
                        cardsDrawn++
                        if (!rv) {
                            await handleSending(msg, { content: "Deck empty, shuffling pile into deck", status: StatusCode.INFO })
                            pile.shuffle()
                            deck = new uno.Stack(pile.cards)
                            pile = new uno.Stack([]);
                            (playerData.get(player.id) as Hand).draw(deck)
                        }
                        await handleSending(msg, { content: `${player} drew a card`, status: StatusCode.INFO })
                        let send = displayStack(playerData.get(player.id) as Hand)
                        send += "\n-------------------------"
                        await m.channel.send(send)
                        await handleSending(msg, { content: `**${player.displayName || player.user.username} has ${(playerData.get(player.id) as Hand).cards.length} cards**`, status: StatusCode.INFO })
                        if (pile.cards.length)
                            player.send({ content: `stack:\n${pile.cards[pile.cards.length - 1].display()}` })
                        return
                    }
                    let selectedCard = (playerData.get(player.id) as Hand).cards[Number(m.content) - 1]
                    if (!selectedCard) {
                        await player.user.send(`${m.content} is not a valid choice`)
                    }
                    else if (selectedCard.type == "+2") {
                        if (selectedCard.canBePlayed(pile)) {
                            cardsPlayed++;
                            forcedDraw = 2
                            pile.add(selectedCard);
                            (playerData.get(player.id) as Hand).remove(Number(m.content) - 1)
                            going = turns.next().value
                        }
                        else {
                            await m.channel.send("You cannot play that card")
                        }
                    }
                    else if (selectedCard.type == 'shuffle-stack') {
                        if (selectedCard.canBePlayed(pile)) {
                            cardsPlayed++
                            (playerData.get(player.id) as Hand).remove(Number(m.content) - 1)
                            await handleSending(msg, { content: "**stack was shuffled**", status: StatusCode.INFO },)
                            pile.add(selectedCard)
                            pile.shuffle()
                            going = turns.next().value
                        }
                        else {
                            await handleSending(msg, { content: "You cannot play that card", status: StatusCode.ERR })
                        }
                    }
                    else if (selectedCard.type == 'give') {
                        if (selectedCard.canBePlayed(pile)) {
                            cardsPlayed++;
                            (playerData.get(player.id) as Hand).remove(Number(m.content) - 1)
                            await player.send({ content: displayStack((playerData.get(m.author.id) as Hand)) })
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
                                let selectedRemovealCard = (playerData.get(m.author.id) as Hand).cards[n - 1]
                                let tempPlayerData = Object.keys(playerData).filter(v => v != m.author.id)
                                let randomPlayer = choice(tempPlayerData)
                                let hand = playerData.get(randomPlayer) as Hand
                                (playerData.get(m.author.id) as Hand).remove(selectedRemovealCard)
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
                            (playerData.get(player.id) as Hand).remove(Number(m.content) - 1)
                            pile.add(selectedCard)
                            let randomPlayer = choice(players.filter(v => v.id != player.id)).id
                            await handleSending(msg, { content: `**${player} played the ${selectedCard.color} -1 card, and <@${randomPlayer}> lost a card**`, status: StatusCode.INFO });
                            let newTopCard = (playerData.get(randomPlayer) as Hand).cards[0];
                            (playerData.get(randomPlayer) as Hand).remove(0)
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
                                await handleSending(msg, { content: "User picked incorrect color, using red", status: StatusCode.ERR })
                                selectedCard.color = "red"
                            }
                            else if (["red", "yellow", "green", "blue"].includes(colorM.content.toLowerCase().trim())) {
                                selectedCard.color = colorM.content
                            }
                            else {
                                await handleSending(msg, { content: "User picked incorrect color, using red", status: StatusCode.ERR })
                                selectedCard.color = "red"
                            }
                        }
                        catch (err) {
                            console.log(err)
                            await handleSending(msg, { content: "Something went wrong, defaulting to red", status: StatusCode.ERR })
                            selectedCard.color = "red"
                        }
                        pile.add(selectedCard);
                        (playerData.get(player.id) as Hand).remove(Number(m.content) - 1)
                        going = turns.next().value
                    }
                    else if (selectedCard.type == "wild+4") {
                        cardsPlayed++;
                        await player.send("Pick a color\nred, green, yellow, or blue")
                        try {
                            let colorM = (await m.channel.awaitMessages({ max: 1, time: 20000 })).at(0)
                            if (!colorM) {
                                await handleSending(msg, { content: "User picked incorrect color, using red", status: StatusCode.ERR })
                                selectedCard.color = "red"
                            }
                            else if (["red", "yellow", "green", "blue"].includes(colorM.content.toLowerCase().trim())) {
                                selectedCard.color = colorM.content
                            }
                            else {
                                await handleSending(msg, { content: "User picked incorrect color, using red", status: StatusCode.ERR })
                                selectedCard.color = "red"
                            }
                        }
                        catch (err) {
                            console.log(err)
                            await handleSending(msg, { content: "Something went wrong, defaulting to red", status: StatusCode.ERR })
                            selectedCard.color = "red"
                        }
                        pile.add(selectedCard);
                        (playerData.get(player.id) as Hand).remove(Number(m.content) - 1)
                        forcedDraw = 4
                        going = turns.next().value
                    }
                    else if (selectedCard.type == 'skip') {
                        if (selectedCard.canBePlayed(pile)) {
                            cardsPlayed++
                            let skipped = turns.next().value
                            await handleSending(msg, { content: `<@${skipped}> was skipped`, status: StatusCode.INFO })
                            going = turns.next().value
                            await new Promise(res => {
                                pile.add(selectedCard);
                                (playerData.get(player.id) as Hand).remove(Number(m.content) - 1)
                                let gP = players.filter(v => v.id == going)[0]
                                let send = displayStack((playerData.get(going) as Hand))
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
                            cardsPlayed++;
                            pile.add(selectedCard);
                            (playerData.get(player.id) as Hand).remove(Number(m.content) - 1)
                            going = turns.next().value
                        }
                        else {
                            await m.channel.send("You cannot play that card")
                        }
                    }
                    await handleSending(msg, { content: `**${player.displayName || player.user.username} has ${(playerData.get(player.id) as Hand).cards.length} cards**`, status: StatusCode.INFO })
                    if ((playerData.get(player.id) as Hand).cards.length <= 0) {
                        await handleSending(msg, { content: `${player} wins!!\n${cardsPlayed} cards were played\n${cardsDrawn} cards were drawn`, status: StatusCode.RETURN })
                        for (let player of players) {
                            await player.send("STOP")
                        }
                        collection?.stop()
                    }
                })
            }
            return { content: "Starting game", status: StatusCode.INFO }
        }, "UNO<br>things you can do in dms<br><ul><li>draw - draw a card</li><li>stack - see all cards in the pile if it can send, otherwise the top 10 cards</li><li>stop - quit the game</li><li>cards - see your cards</li></ul>", {
            arguments: {
                players: createHelpArgument("Players to play, seperated by |", true)

            },
            options: {
                max: createHelpOption("the amount of numbers, default: 10"),
                give: createHelpOption("enable the give card"),
                shuffle: createHelpOption("enable the shuffle card"),
                "1": createHelpOption("enable the -1 card")
            }
        })
    ]

    yield [
        "wordle", ccmdV2(async function({ rawOpts: opts, msg, sendCallback }) {
            if (!isMsgChannel(msg.channel)) return { noSend: true, status: StatusCode.ERR }
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
            await handleSending(msg, { content: "key: **correct**, *wrong place*, `wrong`", status: StatusCode.INFO }, sendCallback)
            await handleSending(msg, { content: `The word is ${word.length} characters long`, status: StatusCode.INFO }, sendCallback)
            for (let i = 0; i < guessCount; i++) {
                display.push(mulStr("⬛ ", word.length))
            }
            await handleSending(msg, { content: display.join("\n"), status: StatusCode.INFO }, sendCallback)
            collector.on("collect", async (m) => {
                if (m.content == "STOP") {
                    collector.stop()
                    await handleSending(msg, { content: "stopped", status: StatusCode.RETURN }, sendCallback)
                    return
                }
                guesses.push(m.content)
                let nextInDisplay = ""
                let guess = m.content
                console.log(word)
                for (let i = 0; i < word.length; i++) {
                    let correct = word[i]
                    let guessed = guess[i]
                    if (guessed == correct) {
                        guess = guess.replace(correct, "\0")
                        nextInDisplay += `**${guessed}** `
                    }
                    else if (guess.includes(correct)) {
                        guess = guess.replace(correct, "\0")
                        nextInDisplay += `${correct}? `
                    }
                    else {
                        nextInDisplay += `~~${guessed}~~ `
                    }
                }
                display[6 - guessCount] = nextInDisplay
                guessCount--
                await handleSending(msg, { content: display.join("\n"), status: StatusCode.INFO }, sendCallback)
                if (m.content == word) {
                    await handleSending(msg, { content: `You win`, status: StatusCode.RETURN }, sendCallback)
                    collector.stop()
                    return
                }
                if (guessCount == 0) {
                    await handleSending(msg, { content: `You lose, it was ${word}`, status: StatusCode.RETURN }, sendCallback)
                    collector.stop()
                    return
                }
            })
            return { content: "starting wordle", status: StatusCode.INFO }
        }, "wordle", {
            options: {
                "min": createHelpOption("The minimum length of the word, default: 5"),
                "max": createHelpOption("The maximum length of the word, default: 5"),
                "lives": createHelpOption("Lives, default: 6")
            }
        })
    ]

    yield [
        "hangman", ccmdV2(async function({ rawOpts: opts, msg, args, sendCallback }) {
            if (!isMsgChannel(msg.channel)) return { noSend: true, status: StatusCode.ERR }
            if (!msg.guild || !msg.member) return crv("Not in a guild", { status: StatusCode.ERR })
            let opponent: GuildMember | undefined = msg.member
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
                    await handleSending(msg, { content: `${disp}\n${users.join(", ")}, guess`, status: StatusCode.PROMPT })
                }
                catch (err) {
                    return { content: "2K char limit reached", status: StatusCode.ERR }
                }
                if (!isMsgChannel(msg.channel)) return { noSend: true, status: StatusCode.ERR }
                let collection = msg.channel.createMessageCollector({ filter: m => (strlen(m.content) < 2 || m.content == wordstr || (m.content[0] == 'e' && strlen(m.content) > 2 && strlen(m.content) < 5) || ["<enter>", "STOP", "\\n"].includes(m.content)) && (users.map(v => v.id).includes(m.author.id) || everyone), idle: 40000 })
                let gameIsGoing = true
                //add stop flag to make stop not bypaass process manager TODO
                collection.on("collect", async (m) => {
                    if (!gameIsGoing) return
                    if (m.content == '\\n' || m.content == "<enter>")
                        m.content = '\n'
                    if (m.content == "STOP") {
                        await handleSending(msg, { content: "STOPPED", status: StatusCode.RETURN }, sendCallback)
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
                        await handleSending(msg, { content: `You've already guessed ${m.content}`, status: StatusCode.ERR }, sendCallback)
                        return
                    }
                    else if (m.content == wordstr) {
                        await handleSending(msg, { content: `YOU WIN, it was\n${wordstr}`, status: StatusCode.RETURN })
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
                let channel = choice(channels as NonThreadGuildBasedChannel[])
                if (!isMsgChannel(channel)) return { content: "Not a text channel", status: StatusCode.ERR }
                if (channel === null) {
                    return { content: "Cannot do random in this non-channel", status: StatusCode.ERR }
                }
                while (!isMsgChannel(channel) || channel.type === ChannelType.GuildCategory)
                    channel = choice(channels as NonThreadGuildBasedChannel[])
                if (!isMsgChannel(channel)) return { content: "Not a text channel", status: StatusCode.ERR }
                let messages
                try {
                    messages = await channel?.messages.fetch({ limit: 100 })
                }
                catch (err) {
                    messages = await msg.channel.messages.fetch({ limit: 100 })
                }
                let times = 0;
                while (!(wordstr = messages.random()?.content ?? "UNDEFINED")) {
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
        }, "hangman", {
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
        })
    ]
}
