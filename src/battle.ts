//TODO: refactor to be easier to change game logic and stuff

import { Message, EmbedBuilder } from 'discord.js'

import pet from './pets'

import fs = require("fs")

import { getOpts } from './parsing'

//const { calculateAmountFromString, getEconomy, canBetAmount, addMoney, loseMoneyToBank } = require("./economy.js")
import economy from './economy'
import { StatusCode, crv, handleSending } from './common_to_commands'
import { efd, isMsgChannel } from './util'

let BATTLEGAME: boolean = false;

const BATTLE_GAME_BONUS = 1.1;

const ITEM_COOLDOWN: milliseconds_t = 8000

const ITEM_RARITY_TABLE = { "huge": .2, "big": .5, "medium": .7, "small": .9, "tiny": 1 }

type BattleEffect = "damage" | "heal"
type BattleResponse = {
    effects: [BattleEffect, ["all"] | number[]][]
    response: string
}

type BattleResponses = {
    tiny?: BattleResponse[],
    small?: BattleResponse[],
    big?: BattleResponse[],
    huge?: BattleResponse[],
    medium?: BattleResponse[],
}

class Player {
    bet: number
    money_spent: number
    hp: number
    shielded: boolean
    id: string
    itemUses: number
    #lastItemUsage: number | null = null
    constructor(id: string, bet: number, hp: number) {
        this.hp = hp
        this.bet = bet
        this.money_spent = 0
        this.shielded = false
        this.itemUses = 0
        this.id = id
    }

    get total_spent() {
        return this.money_spent + this.bet
    }

    /**
        * @description checks if enough time has passed for the player to use an item
    */
    canUseItem() {
        return Date.now() - (this.#lastItemUsage || 0) > ITEM_COOLDOWN
    }

    useItem(cost: number) {
        this.#lastItemUsage = Date.now()
        this.money_spent += cost
        economy.loseMoneyToBank(this.id, cost)
        this.itemUses++
    }
}

class GameState {
    players: { [key: string]: Player }
    mumboUser: null | string
    constructor(players: { [key: string]: Player }) {
        this.players = players
        this.mumboUser = null
    }

    get player_count() {
        return Object.keys(this.players).length
    }

    calculatebetTotal() {
        return Object.values(this.players).reduce((p, c) => p + c.total_spent, 0)
    }
    //TODO
}

/**
    * @description **filters out invalid responses**,
    * an invalid response references a player that wont be in the game
    * eg: *tries to damage player 4 but there's only 3 players in the game*
*/
function filterInvalidResponses(responses: BattleResponses, playerCount: number): BattleResponses {
    for (let t of Object.keys(responses)) {
        responses[t as keyof typeof responses] = responses[t as keyof typeof responses]!.filter(v => {
            for (let effect of v.effects) {
                let players = effect[1] as "all" | number[]
                if (players === "all") continue
                for (let p of players) {
                    if (p > playerCount) return false
                }
            }
            return true
        })
    }
    return responses
}

function pickBattleResponse(responses: BattleResponses): [keyof BattleResponses, BattleResponse | undefined] {
    let r = Math.random()
    let t: keyof BattleResponses = "tiny"
    for (let k in ITEM_RARITY_TABLE) {
        if (r < ITEM_RARITY_TABLE[k as keyof typeof ITEM_RARITY_TABLE]) {
            t = k as keyof BattleResponses
        }
    }
    if (responses[t]!.length < 1) {
        return [t, undefined]
    }
    return [t, responses[t]![Math.floor(Math.random() * responses[t]!.length)]]
    // responses = responses.filter(v => {
    //     let matches = v.matchAll(/\{user(\d+|all)\}/g)
    //     let count = 0
    //     for (let match of matches) {
    //         count++;
    //         if (!Object.keys(players)[Number(match[1]) - 1]) {
    //             return false
    //         }
    //     }
    //     if (count == 0)
    //         return false
    //     return true
    // })
}

class Item {
    #allowedUses
    #allowedGameUses //uses per game instead of per player
    #useCount = 0
    #percentCost
    #numberCost
    #onUse
    constructor(options: {
        allowedUses?: number,
        percentCost?: number,
        numberCost?: number,
        allowedGameUses?: number,
        onUse: (this: Item, m: Message, embed: EmbedBuilder) => Promise<boolean>
    }) {
        this.#allowedUses = options.allowedUses || Infinity
        this.#percentCost = options.percentCost || 0
        this.#numberCost = options.numberCost || 0
        this.#onUse = options.onUse
        this.#allowedGameUses = options.allowedGameUses || Infinity
    }

    calculateFullCost(playerBalance: number) {
        return playerBalance * this.#percentCost + this.#numberCost
    }
    use(m: Message, embed: EmbedBuilder) {
        this.#useCount++;
        if (this.#useCount >= this.#allowedUses || this.#useCount >= this.#allowedGameUses) {
            return false
        }
        return this.#onUse.bind(this)(m, embed)
    }
}

async function handleDeath(id: string, players: { [key: string]: Player }, winningType: "distribute" | "wta"): Promise<{ amountToRemoveFromBetTotal: number, send: EmbedBuilder }> {
    let remaining = Object.keys(players).length - 1
    let bet = players[id].bet
    let total_spent = bet + players[id].money_spent
    delete players[id]
    let e = new EmbedBuilder()
    e.setTitle("NEW LOSER")
    let rv: { amountToRemoveFromBetTotal: number, send: EmbedBuilder } = { amountToRemoveFromBetTotal: 0, send: e }
    if (winningType === 'distribute' && remaining > 0) {
        rv.amountToRemoveFromBetTotal = total_spent
        e.setDescription(`<@${id}> HAS DIED and distributed ${total_spent / remaining * BATTLE_GAME_BONUS} to each player`)
        e.setColor("Blue")
        for (let player in players) {
            economy.addMoney(player, total_spent / remaining * BATTLE_GAME_BONUS)
        }
    }
    else {
        e.setDescription(`<@${id}> HAS DIED AND LOST $${bet}`)
        e.setColor("Red")
    }
    rv.send = e
    economy.loseMoneyToBank(id, bet)
    return rv
}

async function game(msg: Message, gameState: GameState, cooldowns: { [key: string]: number }, useItems: boolean, winningType: "wta" | "distribute") {

    if (!isMsgChannel(msg.channel)) return
    if (!msg.guild) return

    let players = gameState.players

    let responseMultiplier = 1;

    let negativeHpBonus: { [key: string]: number } = {}

    let start = Date.now() / 1000

    let items: { [key: string]: Item } = {// {{{
        rheal: new Item({
            percentCost: 0.001,
            numberCost: 0.1,

            async onUse(_, e) {
                let playerNames = Object.keys(players)
                let amount = Math.floor(Math.random() * (playerNames.length * 15))
                e.setTitle("RANDOM HEAL")
                e.setColor("Green")
                let below50 = Object.entries(players).filter((p) => p[1].hp <= 50)
                if (below50.length < 1) {
                    await msg.channel.send("No one has less than 50 health")
                    return false
                }
                let playerToHeal = below50[Math.floor(Math.random() * below50.length)][0]

                e.setDescription(`<@${playerToHeal}> healed for ${amount}`)
                if (players[playerToHeal])
                    players[playerToHeal].hp += amount
                return true

            }
        }),
        "heal": new Item({
            percentCost: 0.01,
            numberCost: 0.1,
            async onUse(m, e) {
                let amount = Math.floor(Math.random() * 19 + 1)
                e.setTitle("HEAL")
                e.setColor("Green")
                e.setDescription(`<@${m.author.id}> healed for ${amount}`)
                if (players[m.author.id])
                    players[m.author.id].hp += amount
                return true
            }
        }),
        "anger toolbox": new Item({
            numberCost: 3,
            async onUse(m, e) {
                e.setTitle("TOOLBOX IS ANGRY")
                e.setColor("Red")
                e.setDescription(`<@${m.author.id}> has angered toolbox`)
                for (let player in players) {
                    players[player].hp *= .99432382
                }
                return true
            }
        }),
        "anger euro": new Item({
            numberCost: 3,
            async onUse(m, e) {
                if (!isMsgChannel(msg.channel)) return false
                await msg.channel.send("STOPPING")
                return false
            }
        }),
        "blowtorch": new Item({
            percentCost: 0.01,
            numberCost: 1,
            async onUse(m, e) {
                let amount = Math.floor(Math.random() * 19 + 1)
                e.setTitle("BLOWTORCH")
                e.setColor("Red")
                e.setDescription(`<@${m.author.id}> blowtorches everyone for ${amount} damage`)
                for (let player in players) {
                    if (player === m.author.id) continue
                    players[player].hp -= amount
                }
                return true
            }
        }),
        "swap": new Item({
            allowedUses: 1,
            percentCost: (3 * Object.keys(players).length) / 100,
            async onUse(m, e) {
                let playerKeys = Object.keys(players).filter(v => v !== m.author.id)
                let p = playerKeys[Math.floor(Math.random() * playerKeys.length)]
                let thisPlayerHealth = players[m.author.id]
                let otherPlayerHealth = players[p]
                e.setTitle(`SWAP HEALTH`)
                e.setDescription(`<@${m.author.id}> <-> <@${p}>`)
                e.setColor("#ffff00")
                players[m.author.id] = otherPlayerHealth
                players[p] = thisPlayerHealth
                return true
            }
        }),
        "double": new Item({
            percentCost: 0.05,
            numberCost: 2,
            async onUse(m, e) {
                responseMultiplier *= 2
                e.setTitle("DOUBLE")
                e.setColor("Green")
                e.setDescription(`<@${m.author.id}> has doubled the multiplier\n**multiplier: ${responseMultiplier}**`)
                return true
            }
        }),
        "triple": new Item({
            percentCost: 0.10,
            numberCost: 3,
            async onUse(m, e) {
                responseMultiplier *= 3

                e.setTitle("TRIPLE")
                e.setColor("Green")
                e.setDescription(`<@${m.author.id}> has tripled the multiplier\n**multiplier: ${responseMultiplier}**`)
                return true
            }
        }),
        "blue shell": new Item({
            allowedUses: 1,
            numberCost: 0.5,
            percentCost: 0.02,
            async onUse(m, e) {
                if (!isMsgChannel(msg.channel)) return false
                e.setTitle("BLUE SHELL")
                e.setColor("Blue")
                let sort = Object.entries(players).sort((a, b) => b[1].hp - a[1].hp)
                let firstPlace = sort[0]
                if (firstPlace[1].hp < 50) {
                    await msg.channel.send("No one has more than 50 health")
                    return false
                }
                e.setDescription(`<@${m.author.id}> hit <@${firstPlace[0]}> with a blue shell`)
                players[firstPlace[0]].hp -= 50
                return true
            }
        }),
        "shield": new Item({
            allowedUses: 1,
            numberCost: 0.5,
            percentCost: 0.003,
            async onUse(m, e) {
                players[m.author.id].shielded = true
                e.setTitle("SHIELD")
                e.setColor("White")
                e.setDescription(`<@${m.author.id}> bought a shield`)
                return true
            }
        }),
        "mumbo": new Item({
            numberCost: 1,
            percentCost: 0.01,
            async onUse(m, e) {
                if (gameState.mumboUser)
                    return false
                gameState.mumboUser = m.author.id
                players['mumbo'] = new Player("mumbo", 0, 100)
                e.setTitle("MUMBO JOINS THE BATTLE")
                return true
            }
        }),
        "suicide": new Item({
            numberCost: 1,
            percentCost: 0.001,
            async onUse(m, e) {
                e.setTitle("SUICIDE")
                e.setColor("DarkRed")
                let damage = Math.floor(Math.random() * 8 + 2)
                e.setDescription(`<@${m.author.id}> took ${damage} damage`)
                players[m.author.id].hp -= damage
                return true
            }
        }),
        "axe": new Item({
            numberCost: 1,
            percentCost: 0.001,
            async onUse(m, e) {
                let damage = Math.floor(Math.random() * Object.keys(players).length * 5)
                let playerNames = Object.keys(players)
                let player = playerNames[Math.floor(Math.random() * playerNames.length)]
                e.setDescription(`𝐘𝐎𝐔'𝐕𝐄 𝐁𝐄𝐄𝐍 𝐀𝐗𝐄𝐃 <@${player}>`)
                if (player == m.author.id) {
                    damage *= 2
                }
                e.setFooter({ text: `𝐀𝐗𝐄 ${damage}` })
                players[player].hp -= damage
                return true
            }
        }),
        "earthquake": new Item({
            allowedGameUses: 1,
            numberCost: 2,
            percentCost: 0.04,
            async onUse(m, e) {
                let sumHealths = Object.values(players).reduce((a, b) => a + b.hp, 0)
                let average = sumHealths / Object.keys(players).length
                e.setTitle("EARTHQUAKE")
                e.setColor("Grey")
                for (let player in players) {
                    players[player].hp = average
                }
                e.setDescription(`<@${m.author.id}> CAUSED AN EARTHQUAKE`)
                return true
            }
        }),
        "yoink": new Item({
            numberCost: 2,
            async onUse(m, e) {
                gameState.mumboUser = m.author.id
                e.setTitle(`YOINK`)
                e.setDescription(`<@${m.author.id}> HAS STOLEN MUMBOくん`)
                return true
            }
        })
    }// }}}

    let itemUseCollector = msg.channel.createMessageCollector({ filter: m => useItems && Object.keys(players).includes(m.author.id) && Object.keys(items).includes(m.content.toLowerCase()) })

    itemUseCollector.on("collect", async (m) => {
        if (!isMsgChannel(msg.channel) || !isMsgChannel(m.channel)) return
        if (!economy.getEconomy()[m.author.id]) {
            return
        }
        if (!players[m.author.id].canUseItem()) {
            await msg.channel.send(`<@${m.author.id}> Used an item on cooldown -5 hp (cooldown remaining: **${8 - (Date.now() / 1000 - cooldowns[m.author.id])}**`)
            players[m.author.id].hp -= 5
            if (players[m.author.id].hp <= 0) {
                let rv = await handleDeath(m.author.id, players, winningType)
                await m.channel.send({ embeds: [rv.send] })
            }
            return
        }
        let i = m.content.toLowerCase()
        let item = items[i]
        let cost = item.calculateFullCost(m.author.economyData.money)
        if (m.author.economyData.money - players[m.author.id].total_spent < cost) {
            await m.channel.send("You cannot afford this")
            return
        }
        let e = new EmbedBuilder()
        e.setFooter({ text: `Cost: ${cost}` })
        let rv = await item.use(m, e)
        if (rv) {
            players[m.author.id].useItem(cost)
            await m.channel.send({ embeds: [e] })
        }
    })

    let lastMessages = []
    let responses: BattleResponses = {
        "huge": [{
            effects: [["damage", ["all"]]],
            response: "{userall} died"
        }],
        small: [{
            effects: [["heal", ["all"]]],
            response: "{userall} lived"
        }]
    }
    if (fs.existsSync("./database/battleV2")) {
        let d = fs.readFileSync("./database/battleV2", "utf-8")
        responses = JSON.parse(d)
    }
    let playerCount = Object.keys(players).length
    responses = filterInvalidResponses(responses, playerCount)
    //if every responselist is empty we have no valid responses
    if (Object.values(responses).every(v => v.length < 1)) {
        await msg.channel.send("No responses do anything, add better responses or you will die for real 100% factual statement")
        itemUseCollector.stop()
        return
    }
    while (Object.values(players).length > 0) {
        let embed = new EmbedBuilder()
        let amount, responseChoice;
        do {
            [amount, responseChoice] = pickBattleResponse(responses)
        } while (responseChoice === undefined)
        // while (true) {
        //     responseChoice = responses[Math.floor(Math.random() * responses.length)]
        //     amount = responseChoice.match(/AMOUNT=(huge|big|medium|small|tiny)/)
        //     if (!amount)
        //         continue
        //     if (Math.random() < ITEM_RARITY_TABLE[amount[1] as 'huge' | 'big' | 'medium' | 'small' | 'tiny']) {
        //         break
        //     }
        // }
        let shuffledPlayers = Object.keys(players).sort(() => Math.random() - .5)
        let playersToDoStuffTo: string[] = []
        let responseText = responseChoice.response.replaceAll(/\{user(\d+|all)\}/g, (v, pn) => {
            if (pn === 'all') {
                let text = ""
                for (let player of shuffledPlayers) {
                    text += `<@${player}>, `
                    playersToDoStuffTo.push(player)
                }
                return text.trim().replace(/,$/, "")
            }
            else {
                let playerNo = Number(pn) - 1
                playersToDoStuffTo.push(shuffledPlayers.at(playerNo) as string)
                return `<@${shuffledPlayers.at(playerNo)}>`
            }
        })
        let nAmount = {
            tiny:  Math.floor(Math.random() * 10),
            small:  Math.floor(Math.random() * (20 - 10) + 10),
            medium:  Math.floor(Math.random() * (35 - 20) + 20),
            big:  Math.floor(Math.random() * (50 - 35) + 35),
            "huge":  Math.floor(Math.random() * (75 - 50) + 50)
        }[amount]
        let eliminations = []
        if (responseMultiplier > 1) {
            nAmount *= responseMultiplier
            responseMultiplier = 1
        }

        let tawCount = 0
        for (let effect of responseChoice.effects) {
            let [t, affected] = effect
            tawCount++
            switch (t) {
                case "heal": {
                    embed.setColor("Green")
                    //dont damage the same player twice
                    let p: Set<number> = new Set();
                    let playerCount = Object.keys(shuffledPlayers).length
                    for (let match of affected) {
                        if (match == 'all') {
                            for(let i = 0; i < playerCount; i++){
                                p.add(i)
                            }
                        }
                        else {
                            let n = Number(match)
                            p.add(n)
                        }
                    }
                    for (let playerNumber of p) {
                        players[shuffledPlayers.at(playerNumber - 1) as string].hp += nAmount
                    }
                    break
                }
                case "damage": {
                    embed.setColor("Red")
                    nAmount *= -1
                    for (let player of affected) {
                        let n = Number(player)
                        let p = [n]
                        if (player == 'all')
                            p = Object.keys(shuffledPlayers).map(v => Number(v))
                        for (let id of p) {
                            if (players[shuffledPlayers.at(id - 1) as string].shielded) {
                                players[shuffledPlayers.at(id - 1) as string].shielded = false
                                let e = new EmbedBuilder()
                                e.setTitle("BLOCKED")
                                e.setDescription(`<@${shuffledPlayers.at(id - 1) as string}> BLOCKED THE ATTACK`)
                                e.setColor("Navy")
                                await msg.channel.send({ embeds: [e] })
                            }
                            else {
                                players[shuffledPlayers.at(id - 1) as string].hp += nAmount
                                if (players[shuffledPlayers.at(id - 1) as string].hp <= 0) {
                                    eliminations.push(shuffledPlayers.at(id - 1) as string)
                                }
                            }
                        }
                    }
                    break
                }
            }
        }
        if (!tawCount) continue

        for (let player in players) {
            let mem = msg.guild.members.cache.find((v) => v.id == player)
            if (!mem) {
                embed.addFields(efd([`${player}`, `${players[player]}`, true]))
            }
            else {
                embed.addFields(efd([`${mem.user.username}`, `${players[player]}`, true]))
            }
            if (players[player].hp < 0) {
                if (negativeHpBonus[player] && negativeHpBonus[player] > players[player].hp) {
                    negativeHpBonus[player] = players[player].hp
                }
                else if (!negativeHpBonus[player]) {
                    negativeHpBonus[player] = players[player].hp
                }
            }
        }
        responseText = responseText.replaceAll("{amount}", String(nAmount))
        let ms = await msg.channel.send({ content: `**${responseChoice}**`, embeds: [embed] })
        lastMessages.push(ms)
        if (lastMessages.length >= 4) {
            let m = lastMessages.shift()
            if (m?.deletable) {
                await m.delete()
            }
        }
        let text = ""

        for (let elim of eliminations) {
            if (elim === 'mumbo' && gameState.mumboUser) {
                text += `<@${gameState.mumboUser}>'s MUMBO HAS DIED and <@${gameState.mumboUser}> LOST ${economy.getEconomy()[gameState.mumboUser]?.money * 0.005} \n`
                economy.loseMoneyToBank(gameState.mumboUser, economy.getEconomy()[gameState.mumboUser]?.money * 0.005)
                gameState.mumboUser = null
                delete players[elim]
            }
            else {
                let rv = await handleDeath(elim, players, winningType)
                await msg.channel.send({ embeds: [rv.send] })
            }
        }

        for (let player in players) {
            if (isNaN(players[player].hp)) {
                if (player === 'mumbo' && gameState.mumboUser) {
                    await msg.channel.send(`<@${gameState.mumboUser}>'s MUMBO HAS DIED and <@${gameState.mumboUser}> LOST ${economy.getEconomy()[gameState.mumboUser]?.money * 0.005} \n`)
                    economy.loseMoneyToBank(gameState.mumboUser, economy.getEconomy()[gameState.mumboUser]?.money * 0.005)
                    gameState.mumboUser = null
                }
                else {
                    let rv = await handleDeath(player, players, winningType)
                    await msg.channel.send(`<@${player}> HAS NaN HEALTH AND DIED`)
                }
            }
        }
        if (text) {
            await handleSending(msg, { content: text, status: StatusCode.INFO })
        }
        if (Object.keys(players).length <= 1) {
            break
        }
        await new Promise(res => setTimeout(res, 4000))
    }
    let winner = Object.entries(players).filter(v => v[1].hp > 0)?.[0]
    let e = new EmbedBuilder()
    let bonusText = ""
    let betTotal = gameState.calculatebetTotal()
    if (!winner) {
        let last = Object.keys(players)[0]
        economy.loseMoneyToBank(last, players[last].bet)
        e.setDescription(`THE GAME IS A TIE`)
        e.setTitle("TIE")
        e.setColor("Yellow")
    }
    else if (winner[0] == 'mumbo') {
        economy.addMoney(gameState.mumboUser || "", betTotal / 2)
        e.setTitle("GAME OVER")
        e.setColor("DarkGreen")
        e.setDescription(`MUMBO WINS, <@${gameState.mumboUser}> SUMMONED MUMBO AND GETS HALF THE WINNINGS! ($${betTotal / 2})`)
    }
    else {
        economy.addMoney(winner[0], betTotal * BATTLE_GAME_BONUS)
        if (negativeHpBonus[winner[0]]) {
            bonusText += `<@${winner[0]}> GOT THE NEGATIVE HP BONUS FOR ${negativeHpBonus[winner[0]]}\n`
            economy.addMoney(winner[0], Math.abs(negativeHpBonus[winner[0]]))
        }
        e.setTitle("GAME OVER!")
        e.setColor("Green")
        if (winningType === 'wta') {
            e.setDescription(`<@${winner[0]}> IS THE WINNER WITH ${winner[1]} HEALTH REMAINING\nAND WON: $${betTotal * BATTLE_GAME_BONUS}`)
        }
        else {
            e.setDescription(`<@${winner[0]}> IS THE WINNER WITH ${winner[1]} HEALTH REMAINING\nAND WON THE REMAINING: $${betTotal * BATTLE_GAME_BONUS}`)
        }
    }
    e.setFooter({ text: `The game lasted: ${Date.now() / 1000 - start} seconds` })
    if (winner && winner[1].hp >= 100) {
        if (economy.getEconomy()[winner[0]]) {
            economy.addMoney(winner[0], winner[1].hp - 100)
            bonusText += `<@${winner[0]}> GOT THE 100+ HP BONUS\n`
        }
    }
    let mostUsed = Object.values(players).sort((a, b) => b.itemUses - a.itemUses)
    let bonusAmount = mostUsed[0].itemUses - (mostUsed[1] || { itemUses: 0 }).itemUses
    if (bonusAmount && economy.getEconomy()[mostUsed[0].id]) {
        economy.addMoney(mostUsed[0].id, bonusAmount)
        bonusText += `<@${mostUsed[0].id}> GOT THE ITEM BONUS BY USING ${mostUsed[0].itemUses} ITEMS AND WON $${bonusAmount}\n`
    }
    if (bonusText)
        await handleSending(msg, { embeds: [e], content: bonusText, status: StatusCode.INFO })
    else
        await handleSending(msg, { embeds: [e], status: StatusCode.INFO })
    itemUseCollector.stop()
}

async function battle(msg: Message, args: ArgumentList) {
    if (BATTLEGAME || !isMsgChannel(msg.channel))
        return { content: "A game is already happening", status: StatusCode.ERR }
    let opts;
    [opts, args] = getOpts(args)
    let useItems = !opts['no-items']
    if (args.length < 1) {
        return crv("No bet given", { status: StatusCode.ERR })
    }
    let bet = args[0]
    let wt = args[1]
    let winningType = wt || "distribute"
    if (!["wta", "distribute", "dist", "winnertakesall", "winnertakeall"].includes(winningType)) {
        return { content: "Betting type must be wta (winner takes all) or distribute", status: StatusCode.ERR }
    }
    if (winningType == 'dist')
        winningType = 'distribute'
    let nBet = economy.calculateAmountFromString(msg.author.id, bet, { min: (t, a) => t * 0.002 })

    if (!nBet || !economy.canBetAmount(msg.author.id, nBet) || nBet < 0) {
        return { content: "Not a valid bet", status: StatusCode.ERR }
    }
    if (nBet / economy.getEconomy()[msg.author.id].money < 0.002) {
        return { content: "You must bet at least 0.2%", status: StatusCode.ERR }
    }

    let players: { [key: string]: Player } = { [msg.author.id]: new Player(msg.author.id, nBet, pet.getActivePet(msg.author.id) == 'dog' ? pet.PETACTIONS['dog'](100) : 100) }
    let cooldowns: { [key: string]: number } = { [msg.author.id]: 0 }

    await msg.channel.send(`${msg.author} has joined the battle with a $${nBet} bet`)

    let collector = msg.channel.createMessageCollector({ time: 15000, filter: m => !m.author.bot && m.content.toLowerCase().includes('join') })

    BATTLEGAME = true

    collector.on("collect", async (m) => {
        if (!isMsgChannel(msg.channel)) return
        if (players[m.author.id]) return
        let bet = m.content.split(" ")[1]
        let nBet = economy.calculateAmountFromString(m.author.id, bet, { min: (t, a) => t * 0.002 })
        if (!nBet || !economy.canBetAmount(m.author.id, nBet) || nBet < 0) {
            await msg.channel.send(`${m.author}: ${nBet} is not a valid bet`)
            return
        }

        if (nBet / economy.getEconomy()[m.author.id].money < 0.002) {
            if (!isMsgChannel(m.channel)) return
            await m.channel.send("You must bet at least 0.2%")
            return
        }

        if (!Object.keys(players).includes(m.author.id)) {
            let p = new Player(m.author.id, nBet, pet.getActivePet(msg.author.id) == 'dog' ? pet.PETACTIONS['dog'](100) : 100)
            cooldowns[m.author.id] = 0
            players[m.author.id] = p
        }
        await msg.channel.send(`${m.author} has joined the battle with a $${nBet} bet`)
    })
    collector.on("end", async (collection, reason) => {
        let playerCount = Object.keys(players).length
        if (playerCount < 2) {
            if (!isMsgChannel(msg.channel)) return
            await msg.channel.send("Only 1 person joined, game ending")
        }
        else {
            let gameState = new GameState(players)
            await game(msg, gameState, cooldowns, useItems, winningType as "distribute" | "wta")
        }
        BATTLEGAME = false
    })
    let e = new EmbedBuilder()
    e.setTitle("TYPE `join <BET AMOUNT>` TO JOIN THE BATTLE")
    return { embeds: [e], status: StatusCode.RETURN }
}

export {
    battle
}
