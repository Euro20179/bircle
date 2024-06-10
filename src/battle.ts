//TODO: refactor to be easier to change game logic and stuff

import { Message, EmbedBuilder } from 'discord.js'

import pet from './pets'

import fs from 'fs'

import { getOpts } from './parsing'

import economy from './economy'
import { StatusCode, crv, promptUser } from './common_to_commands'
import cmds from './command-parser/cmds'

import { choice, efd, isMsgChannel, randInt } from './util'

const handleSending = cmds.handleSending

let BATTLEGAME: boolean = false;

const BATTLE_GAME_BONUS = 1.1;

const ITEM_RARITY_TABLE = { "huge": .2, "big": .5, "medium": .7, "small": .9, "tiny": 1 }

export type BattleEffect = "damage" | "heal"
export type BattleResponse = {
    effects: [BattleEffect, ["all"] | number[]][]
    response: string
}

export type BattleResponses = {
    tiny?: BattleResponse[],
    small?: BattleResponse[],
    big?: BattleResponse[],
    huge?: BattleResponse[],
    medium?: BattleResponse[],
}

function replacePlaceholdersInBattleResponse(response: string, players: string[]) {
    return response.replaceAll(/\{user(\d+|all)\}/g, (_v, pn) => {
        if (pn === 'all') {
            let text = ""
            for (let player of players) {
                text += `<@${player}>, `
            }
            return text.trim().replace(/,$/, "")
        }
        else {
            let playerNo = Number(pn) - 1
            return `<@${players.at(playerNo)}>`
        }
    })
}

class Player {
    bet: number
    money_spent: number
    hp: number
    shielded: boolean
    id: string
    itemUses: number
    protected dead: boolean
    #lowestHp: number = 100
    #lastItemUsage: number | null = null
    #itemUsageTable: { [key: string]: number }
    #hp100Requirement = 50
    constructor(id: string, bet: number, hp: number) {
        this.hp = hp
        this.bet = bet
        this.money_spent = 0
        this.shielded = false
        this.itemUses = 0
        this.id = id
        this.#itemUsageTable = {}
        this.dead = false
    }

    use100Hp(){
        this.#hp100Requirement -= 15
    }

    get hp100Requirement () {
        return this.#hp100Requirement
    }

    get lowestHp() {
        return this.#lowestHp
    }

    get above0() {
        return this.hp > 0
    }

    get alive() {
        return !this.dead
    }
    get total_spent() {
        return this.money_spent + this.bet
    }

    async kill(msg: Message, gameState: GameState) {
        if (this.above0) {
            return false
        }
        if (this.dead) {
            return true
        }
        let rv = await handleDeath(this.id, gameState.alivePlayers(), "wta")
        await msg.channel.send({ embeds: [rv.send] })
        this.dead = true
        return true
    }

    /**
        * @description checks if enough time has passed for the player to use an item
    */
    canUseItem(item: Item) {
        return item.cooldownTimeHasPassed(Date.now(), this.#lastItemUsage || 0)
    }

    canUseItemAgain(itemName: string, item: Item) {
        if ((this.#itemUsageTable[itemName] || 0) >= item.allowedUses) {
            return false
        }
        return true
    }

    cooldownRemaining(cur_time: milliseconds_t, item: Item) {
        return item.allowedAfter - (cur_time - (this.#lastItemUsage || 0))
    }

    useItem(itemName: string, cost: number) {
        this.#lastItemUsage = Date.now()
        if (!this.#itemUsageTable[itemName]) {
            this.#itemUsageTable[itemName] = 1
        }
        else this.#itemUsageTable[itemName] += 1
        this.money_spent += cost
        economy.loseMoneyToBank(this.id, cost)
        this.itemUses++
    }

    heal(amount: number) {
        this.hp += amount
        if (this.above0) {
            this.dead = false
        }
        return true
    }

    #damage(amount: number) {
        this.hp -= amount
        if (this.hp < this.#lowestHp) {
            this.#lowestHp = this.hp
        }
        if (this.above0) {
            this.dead = false
        }
    }

    damageThroughShield(amount: number) {
        this.#damage(amount)
        return true
    }

    damage(amount: number) {
        if (this.shielded) {
            this.shielded = false
            return false
        }
        this.#damage(amount)
        return true
    }

    createStatusEmbed(msg: Message) {
        let mem = msg.guild?.members.cache.find((v) => v.id == this.id)
        if (!mem) {
            return efd([`${this.id}`, `${this.hp}`, true])
        }
        else {
            return efd([`${mem.user.username}`, `${this.hp}`, true])
        }
    }
}

class Mumbo extends Player {
    async kill(msg: Message<boolean>, gameState: GameState): Promise<boolean> {
        if (this.above0) {
            return false
        }
        if (this.dead) {
            return true
        }
        if (gameState.mumboUser) {
            economy.loseMoneyToBank(
                gameState.mumboUser,
                economy.getEconomy()[gameState.mumboUser]?.money * 0.005
            )
            await handleSending(msg, { content: `<@${gameState.mumboUser}>'s MUMBO HAS DIED and <@${gameState.mumboUser}> LOST ${economy.getEconomy()[gameState.mumboUser]?.money * 0.005} \n`, status: StatusCode.INFO })
            gameState.mumboUser = null
        }
        this.dead = true
        return true
    }
}

class GameState {
    players: { [key: string]: Player }
    mumboUser: null | string
    damageMultiplier: number
    gameMessages: Message[]
    constructor(players: { [key: string]: Player }) {
        this.players = players
        this.mumboUser = null
        this.damageMultiplier = 1
        this.gameMessages = []
    }

    alivePlayers() {
        return Object.fromEntries(Object.entries(this.players).filter(([_, p]) => p.alive))
    }

    get player_count() {
        return Object.keys(this.alivePlayers()).length
    }

    calculatebetTotal() {
        return Object.values(this.players).reduce((p, c) => p + c.total_spent, 0)
    }

    async sendMessage(msg: Message, responseText: string, embed: EmbedBuilder) {
        let ms = await msg.channel.send({ content: `**${responseText}**`, embeds: [embed] })

        this.gameMessages.push(ms)
        if (this.gameMessages.length >= 4) {
            let m = this.gameMessages.shift()
            if (m?.deletable) {
                await m.delete()
            }
        }

    }
    //TODO
}

/**
    * @description **filters out invalid responses**,
    * an invalid response references a player that wont be in the game
    * eg: *tries to damage player 4 but there's only 3 players in the game*
*/
function filterInvalidResponses(
    responses: BattleResponses,
    playerCount: number
): BattleResponses {
    let t: keyof BattleResponses
    for (t in responses) {
        responses[t] = responses[t]!.filter(v => {
            for (let effect of v.effects) {
                let players = effect[1]
                for (let p of players) {
                    if (p === "all") continue
                    if (p > playerCount) return false
                }
            }
            return true
        })
    }
    return responses
}

function pickBattleResponse(responses: BattleResponses): [
    keyof BattleResponses,
    BattleResponse | undefined
] {
    let types = Object.keys(responses)
    let t: keyof BattleResponses = types[
        Math.floor(Math.random() * types.length)
    ] as keyof BattleResponses
    while (Math.random() > ITEM_RARITY_TABLE[t]) {
        t = types[Math.floor(Math.random() * types.length)] as keyof BattleResponses
    }
    if (!responses[t] || (responses[t]?.length || 0) < 1) {
        return [t, undefined]
    }
    return [t, responses[t]![Math.floor(Math.random() * responses[t]!.length)]]
}

class Item {
    #allowedUses
    #allowedGameUses //uses per game instead of per player
    #useCount = 0
    #percentCost
    #numberCost
    #onUse
    /**
        * @description The amount of time the player must wait after their last item use before using this item
        * Eg: *if 0, the player can use immediately after using the previous item.*
        * Eg: *if 5000, the player must wait 5 seconds after using the previous item.*
    */
    #allowedAfter: milliseconds_t
    constructor(options: {
        allowedUses?: number,
        percentCost?: number,
        numberCost?: number,
        allowedGameUses?: number,
        allowedAfter?: milliseconds_t,
        onUse: (this: Item, m: Message, embed: EmbedBuilder) => Promise<boolean>
    }) {
        this.#allowedUses = options.allowedUses ?? Infinity
        this.#percentCost = options.percentCost ?? 0
        this.#numberCost = options.numberCost ?? 0
        this.#onUse = options.onUse
        this.#allowedGameUses = options.allowedGameUses ?? Infinity
        this.#allowedAfter = options.allowedAfter ?? 8000
    }

    get useCount(){
        return this.#useCount
    }

    get allowedAfter() {
        return this.#allowedAfter
    }

    get allowedUses() {
        return this.#allowedUses
    }

    cooldownRemaining(curTime: milliseconds_t) {
        return curTime - this.#allowedAfter
    }

    cooldownTimeHasPassed(curTime: milliseconds_t, lastTime: milliseconds_t) {
        return curTime - lastTime > this.#allowedAfter
    }

    calculateFullCost(playerBalance: number) {
        return playerBalance * this.#percentCost + this.#numberCost
    }
    use(m: Message, embed: EmbedBuilder) {
        if (this.#useCount >= this.#allowedGameUses) {
            return false
        }
        this.#useCount++;
        return this.#onUse.bind(this)(m, embed)
    }
}

async function handleDeath(
    id: string,
    players: { [key: string]: Player },
    winningType: "distribute" | "wta"
): Promise<{ amountToRemoveFromBetTotal: number, send: EmbedBuilder }> {
    let remaining = Object.keys(players).length - 1
    let bet = players[id].bet
    let total_spent = bet + players[id].money_spent
    let e = new EmbedBuilder()
    e.setTitle("NEW LOSER")
    let rv: { amountToRemoveFromBetTotal: number, send: EmbedBuilder } = {
        amountToRemoveFromBetTotal: 0,
        send: e
    }
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

function getPlayerNumbersFromBattleEffectList(list: BattleResponse['effects'][1][1], playerCount: number) {
    //dont hit the same player twice
    let numbers: Set<number> = new Set()
    for (let player of list) {
        if (player === 'all') {
            for (let i = 0; i < playerCount; i++) {
                numbers.add(i)
            }
        }
        else {
            numbers.add(player)
        }
    }
    return numbers
}

async function game(msg: Message, gameState: GameState, useItems: boolean, winningType: "wta" | "distribute") {

    if (!isMsgChannel(msg.channel)) return
    if (!msg.guild) return

    let allPlayers = gameState.players

    let start = Date.now() / 1000

    let items: { [key: string]: Item } = {// {{{
        round: new Item({
            numberCost: 10,
            percentCost: 0.008,
            allowedAfter: 4000,
            async onUse(m, embed){
                embed.setTitle(`${m.author} made some nice whole numbers`)
                allPlayers[m.author.id].hp = Math.ceil(allPlayers[m.author.id].hp / 10) * 10
                for(let player in allPlayers){
                    if(allPlayers[player].alive){
                        allPlayers[player].hp = Math.floor(allPlayers[player].hp / 10) * 10
                    }
                }
                return true
            }
        }),
        split: new Item({
            numberCost: 5,
            async onUse(m, embed) {
                let alive = gameState.alivePlayers()
                for(let p in alive){
                    if(alive[p].hp < 200){
                        await m.channel.send("Everyone must be above 200")
                        return false;
                    }
                }
                for(let p in alive){
                    alive[p].damageThroughShield(alive[p].hp / 2)
                }
                embed.setTitle("Split")
                embed.setDescription("🍌 T̷h̷e̷ B̷A̷N̷A̷N̷A̷ h̷a̷s̷ S̷P̷L̷I̷T̷! 🍌")
                embed.setColor("DarkGold")
                return true
            },
        }),
        rheal: new Item({
            percentCost: 0.001,
            numberCost: 0.1,

            async onUse(_, e) {
                let alive = gameState.alivePlayers()
                let playerNames = Object.keys(alive)
                let amount = Math.floor(Math.random() * (playerNames.length * 15))
                e.setTitle("RANDOM HEAL")
                e.setColor("Green")
                let below50 = Object.entries(alive).filter((p) => p[1].hp <= 50)
                if (below50.length < 1) {
                    await msg.channel.send("No one has less than 50 health")
                    return false
                }
                let playerToHeal = below50[Math.floor(Math.random() * below50.length)][0]

                e.setDescription(`<@${playerToHeal}> healed for ${amount}`)
                if (allPlayers[playerToHeal])
                    allPlayers[playerToHeal].heal(amount)
                return true

            }
        }),
        "heal": new Item({
            percentCost: 0.008,
            numberCost: 0.1,
            async onUse(m, e) {
                let amount = Math.floor(Math.random() * 19 + 1)
                e.setTitle("HEAL")
                e.setColor("Green")
                e.setDescription(`<@${m.author.id}> healed for ${amount}`)
                if (allPlayers[m.author.id])
                    allPlayers[m.author.id].heal(amount)
                return true
            }
        }),
        chance: new Item({
            percentCost: 0.005,
            numberCost: 0.1,
            async onUse(m, e) {
                let randItems = ["heal", "suicide"]
                let name = randItems[Math.floor(Math.random() * randItems.length)]
                let multiplier = Math.floor(Math.random() * (4 - 2) + 2)
                if (name == "heal") {
                    let amount = Math.floor(Math.random() * 19 + 1) * multiplier
                    e.setTitle("HEAL")
                    e.setColor("Green")
                    e.setDescription(`<@${m.author.id}> healed for ${amount}`)
                    if (allPlayers[m.author.id])
                        allPlayers[m.author.id].heal(amount)
                }
                else {
                    e.setTitle("SUICIDE")
                    e.setColor("DarkRed")
                    let damage = Math.floor(Math.random() * 19 + 1) * multiplier
                    e.setDescription(`<@${m.author.id}> took ${damage} damage`)
                    allPlayers[m.author.id].damage(damage)
                    await allPlayers[m.author.id].kill(m, gameState)
                }
                return true
            }
        }),
        "100 hp": new Item({
            percentCost: 0.002,
            async onUse(m, embed) {
                if(allPlayers[m.author.id].hp > allPlayers[m.author.id].hp100Requirement){
                    await m.channel.send(`You must be below ${allPlayers[m.author.id].hp100Requirement} to use this`)
                    return false
                }

                allPlayers[m.author.id].use100Hp()

                embed.setTitle("100 HP FAIL")
                embed.setColor("Red")
                embed.setDescription(`# ${m.author} failed to get 100 hp`)

                const restrictions = [
                    "alive",
                    "losehp",
                    "none",
                    "overtime"
                ]

                const restrict = choice(restrictions)

                const n1 = Math.floor(randInt(1, 100))

                const n2 = Math.floor(randInt(1, 100))

                const ans = await promptUser(m,  `You got the ${restrict} restriction\n${m.author} what is "${n1} + ${n2}", you have 4 seconds`, undefined, {
                    filter: u => u.author.id === m.author.id,
                    timeout: 4000
                })

                if(!ans){
                    if(restrict === "losehp"){
                        embed.setDescription(`# ${m.author} lost 100 hp`)
                        allPlayers[m.author.id].damageThroughShield(100)
                    }
                    return true
                }

                if(ans.content === String(n1 + n2)) {
                    if(restrict === "alive" && !allPlayers[m.author.id].alive){
                        embed.setDescription(`# ${m.author} did not get 100 hp because they died`)
                    }
                    else{
                        embed.setTitle("100 HP")
                        embed.setColor("Green")
                        if(restrict !== "overtime"){
                            embed.setDescription(`# ${m.author} GOT 100 HP`)
                            allPlayers[m.author.id].heal(100)
                        } else {
                            const step = 100 / (Math.random() * 99 + 1)
                            const time = Math.random() * 10000
                            embed.setDescription(`# ${m.author} will get ${step} hp every ${time} seconds`)
                            let totalEarned = 0
                            let int = setInterval(() => {
                                allPlayers[m.author.id].heal(step)
                                totalEarned += step
                                if(!BATTLEGAME || totalEarned >= 100){
                                    clearInterval(int)
                                }
                            }, time)
                        }
                    }
                    return true
                }

                if(restrict === "losehp"){
                    embed.setDescription(`# ${m.author} lost 100 hp`)
                    allPlayers[m.author.id].damageThroughShield(100)
                }

                return true
            },
        }),
        "anger toolbox": new Item({
            numberCost: 3,
            async onUse(m, e) {
                e.setTitle("TOOLBOX IS ANGRY")
                e.setColor("Red")
                e.setDescription(`<@${m.author.id}> has angered toolbox`)
                for (let player in gameState.alivePlayers()) {
                    allPlayers[player].hp *= .991
                }
                return true
            }
        }),
        "anger euro": new Item({
            numberCost: 3,
            async onUse(_m, _e) {
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
                for (let player in gameState.alivePlayers()) {
                    if (player === m.author.id) continue
                    allPlayers[player].damageThroughShield(amount)
                }
                return true
            }
        }),
        "swap": new Item({
            allowedUses: 1,
            percentCost: (3 * Object.keys(allPlayers).length) / 100,
            allowedAfter: 4000,
            async onUse(m, e) {
                let playerKeys = Object.keys(gameState.alivePlayers()).filter(v => v !== m.author.id)
                let p = playerKeys[Math.floor(Math.random() * playerKeys.length)]
                let thisPlayerHealth = allPlayers[m.author.id].hp
                let otherPlayerHealth = allPlayers[p]?.hp
                e.setTitle(`SWAP HEALTH`)
                e.setDescription(`<@${m.author.id}> <-> <@${p}>`)
                e.setColor("#ffff00")
                allPlayers[m.author.id].hp = otherPlayerHealth
                allPlayers[p].hp = thisPlayerHealth
                return true
            }
        }),
        half: new Item({
            percentCost: 0.01,
            allowedUses: 1,
            async onUse(m, e){
                if(allPlayers[m.author.id].shielded){
                    await m.channel.send(`Half cannot be used with an active shield`)
                    return false
                }
                gameState.damageMultiplier *= 0.5
                e.setTitle("HALF")
                e.setColor("Orange")
                e.setDescription(`<@${m.author.id}> has halved the multiplier\n**multiplier: ${gameState.damageMultiplier}**`)
                return true
            }
        }),
        "double": new Item({
            percentCost: 0.05,
            numberCost: 2,
            allowedAfter: 0,
            allowedUses: 1,
            async onUse(m, e) {
                if (allPlayers[m.author.id].shielded) {
                    await m.channel.send(`double cannot be used while your shield is active`)
                    return false
                }
                gameState.damageMultiplier *= 2
                e.setTitle("DOUBLE")
                e.setColor("Green")
                e.setDescription(`<@${m.author.id}> has doubled the multiplier\n**multiplier: ${gameState.damageMultiplier}**`)
                return true
            }
        }),
        "triple": new Item({
            percentCost: 0.10,
            numberCost: 3,
            allowedAfter: 0,
            allowedUses: 1,
            async onUse(m, e) {
                if (allPlayers[m.author.id].shielded) {
                    await m.channel.send(`double cannot be used while your shield is active`)
                    return false
                }
                gameState.damageMultiplier *= 3

                e.setTitle("TRIPLE")
                e.setColor("Green")
                e.setDescription(`<@${m.author.id}> has tripled the multiplier\n**multiplier: ${gameState.damageMultiplier}**`)
                return true
            }
        }),
        "blue shell": new Item({
            allowedUses: 1,
            numberCost: 0.5,
            percentCost: 0.02,
            allowedAfter: 0,
            async onUse(m, e) {
                if (!isMsgChannel(msg.channel)) return false
                e.setTitle("BLUE SHELL")
                e.setColor("Blue")
                let sort = Object.entries(gameState.alivePlayers()).sort((a, b) => b[1].hp - a[1].hp)
                let firstPlace = sort[0]
                if (firstPlace[1].hp < 50) {
                    await msg.channel.send("No one has more than 50 health")
                    return false
                }
                e.setDescription(`<@${m.author.id}> hit <@${firstPlace[0]}> with a blue shell`)
                allPlayers[firstPlace[0]].hp -= 50
                return true
            }
        }),
        "shield": new Item({
            allowedUses: 1,
            numberCost: 0.5,
            percentCost: 0.003,
            allowedAfter: 4000,
            async onUse(m, e) {
                allPlayers[m.author.id].shielded = true
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
                allPlayers['mumbo'] = new Mumbo("mumbo", 0, 100)
                e.setTitle("MUMBO JOINS THE BATTLE")
                return true
            }
        }),
        "suicide": new Item({
            numberCost: 1,
            percentCost: 0.001,
            allowedAfter: 0,
            async onUse(m, e) {
                e.setTitle("SUICIDE")
                e.setColor("DarkRed")
                let damage = Math.floor(Math.random() * 12 + 2)
                e.setDescription(`<@${m.author.id}> took ${damage} damage`)
                allPlayers[m.author.id].damage(damage)
                return true
            }
        }),
        "axe": new Item({
            numberCost: 1,
            percentCost: 0.001,
            allowedAfter: 3500,
            async onUse(m, e) {
                let damage = Math.floor(Math.random() * Object.keys(allPlayers).length * 5)
                let playerNames = Object.keys(gameState.alivePlayers())
                let player = playerNames[Math.floor(Math.random() * playerNames.length)]
                e.setDescription(`𝐘𝐎𝐔'𝐕𝐄 𝐁𝐄𝐄𝐍 𝐀𝐗𝐄𝐃 <@${player}>\n𝐀𝐗𝐄 ${damage}`)
                if (player == m.author.id) {
                    damage *= 2
                }
                allPlayers[player].damageThroughShield(damage)
                if(!allPlayers[player].shielded){
                    allPlayers[player].kill(m, gameState)
                }
                return true
            }
        }),
        "earthquake": new Item({
            allowedUses: 1,
            numberCost: 2,
            percentCost: 0.04,
            allowedAfter: 0,
            async onUse(m, e) {
                let players = gameState.alivePlayers()
                if(Object.keys(players).length < 3){
                    await m.channel.send("There must be 3 or more players alive to use this")
                    return false
                }
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
            allowedUses: 1,
            async onUse(m, e) {
                gameState.mumboUser = m.author.id
                e.setTitle(`YOINK`)
                e.setDescription(`<@${m.author.id}> HAS STOLEN MUMBOくん`)
                return true
            }
        })
    }// }}}

    let itemUseCollector = msg.channel.createMessageCollector({ filter: m => useItems && Object.keys(allPlayers).includes(m.author.id) && Object.keys(items).includes(m.content.toLowerCase()) })

    itemUseCollector.on("collect", async (m) => {
        let alivePlayers = gameState.alivePlayers()
        if (!alivePlayers[m.author.id]) {
            return
        }
        if (!isMsgChannel(msg.channel) || !isMsgChannel(m.channel)) return
        if (!economy.getEconomy()[m.author.id]) {
            return
        }
        let itemName = m.content.toLowerCase()
        let item = items[itemName]
        let playerUsingItem = allPlayers[m.author.id]
        if (!playerUsingItem.canUseItemAgain(itemName, item)) {
            await msg.channel.send(`<@${m.author.id}> have reached the limit on ${itemName}`)
            return
        }
        else if (!playerUsingItem.canUseItem(item)) {
            await msg.channel.send(`<@${m.author.id}> Used an item on cooldown -5 hp (cooldown remaining: **${playerUsingItem.cooldownRemaining(Date.now(), item) / 1000}**`)
            playerUsingItem.damageThroughShield(5)
            playerUsingItem.kill(m, gameState)
            return
        }
        let cost = item.calculateFullCost(m.author.economyData.money)
        if (m.author.economyData.money - allPlayers[m.author.id].total_spent < cost) {
            await m.channel.send("You cannot afford this")
            return
        }
        let e = new EmbedBuilder()
        e.setFooter({ text: `Cost: ${cost}` })
        let rv = await item.use(m, e)
        if (rv) {
            allPlayers[m.author.id].useItem(itemName, cost)
            await m.channel.send({ embeds: [e] })
        }
    })

    let responses: BattleResponses = {
        "huge": [{
            effects: [["damage", ["all"]]],
            response: "{userall} died"
        }, {
            effects: [["heal", ["all"]]],
            response: "{userall} lived"
        }, {
            effects: [["damage", ["all"]]],
            response: "ELEVATOR 👍"
        }],
    }
    if (fs.existsSync("./database/battleV2")) {
        let d = fs.readFileSync("./database/battleV2", "utf-8")
        responses = JSON.parse(d)
    }
    responses = filterInvalidResponses(responses, gameState.player_count)
    //if every responselist is empty we have no valid responses
    if (Object.values(responses).every(v => v.length < 1)) {
        await msg.channel.send("No responses do anything, add better responses or you will die for real 100% factual statement")
        itemUseCollector.stop()
        return
    }
    while (Object.values(gameState.alivePlayers()).length > 1) {
        let players = gameState.alivePlayers()

        let embed = new EmbedBuilder()

        let amount, responseChoice;
        do {
            [amount, responseChoice] = pickBattleResponse(responses)
        } while (responseChoice === undefined)

        let shuffledPlayers = Object.keys(players).shuffleArray()

        let responseText = replacePlaceholdersInBattleResponse(responseChoice.response, shuffledPlayers)

        let nAmount = {
            tiny: Math.floor(Math.random() * 10),
            small: Math.floor(Math.random() * (20 - 10) + 10),
            medium: Math.floor(Math.random() * (35 - 20) + 20),
            big: Math.floor(Math.random() * (50 - 35) + 35),
            "huge": Math.floor(Math.random() * (75 - 50) + 50)
        }[amount] * gameState.damageMultiplier

        if (gameState.damageMultiplier != 1) {
            gameState.damageMultiplier = 1
        }

        if (responseChoice.effects.length < 1) continue

        for (let effect of responseChoice.effects) {
            let [t, affected] = effect
            let affectedPlayers = Array.from(
                getPlayerNumbersFromBattleEffectList(affected, gameState.player_count),
                n => players[shuffledPlayers.at(n - 1) as string]
            )
            switch (t) {
                case "heal": {
                    embed.setColor("Green")
                    for (let player of affectedPlayers) {
                        player.heal(nAmount)
                    }
                    break
                }
                case "damage": {
                    embed.setColor("Red")
                    for (let player of affectedPlayers) {
                        if (!player.damage(nAmount)) {
                            let e = new EmbedBuilder()
                            e.setTitle("BLOCKED")
                            e.setDescription(`<@${player.id}> BLOCKED THE ATTACK`)
                            e.setColor("Navy")
                            await msg.channel.send({ embeds: [e] })
                        } else {
                            player.kill(msg, gameState)
                        }
                    }
                    break
                }
            }
        }

        for (let player in players) {
            embed.addFields(players[player].createStatusEmbed(msg))
        }

        responseText = responseText.replaceAll("{amount}", String(nAmount))

        await gameState.sendMessage(msg, responseText, embed)

        if (Object.keys(players).length <= 1) {
            break
        }
        await new Promise(res => setTimeout(res, 4000))
    }
    let winner = Object.entries(allPlayers).filter(v => v[1].hp > 0)?.[0]
    let e = new EmbedBuilder()
    let bonusText = ""
    let betTotal = gameState.calculatebetTotal()
    if (!winner) {
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
        if (winner[1].lowestHp < 0) {
            const amount = economy.calculateAmountFromString(winner[0], `${Math.abs(winner[1].lowestHp)}%`)
            bonusText += `<@${winner[0]}> GOT THE NEGATIVE HP BONUS FOR ${amount} by reaching a low of ${winner[1].lowestHp} hp\n`
            economy.addMoney(winner[0], amount)
        }
        e.setTitle("GAME OVER!")
        e.setColor("Green")
        if (winningType === 'wta') {
            e.setDescription(`<@${winner[0]}> IS THE WINNER WITH ${winner[1].hp} HEALTH REMAINING\nAND WON: $${betTotal * BATTLE_GAME_BONUS}`)
        }
        else {
            e.setDescription(`<@${winner[0]}> IS THE WINNER WITH ${winner[1].hp} HEALTH REMAINING\nAND WON THE REMAINING: $${betTotal * BATTLE_GAME_BONUS}`)
        }
        if (winner[1].hp >= 100) {
            if (economy.playerExists(winner[0])) {
                economy.addMoney(winner[0], winner[1].hp)
                bonusText += `<@${winner[0]}> GOT THE 100+ HP BONUS\n`
            }
        }
    }
    e.setFooter({ text: `The game lasted: ${Date.now() / 1000 - start} seconds` })

    bonusText += mostUsedBonus(allPlayers)

    if (bonusText)
        await handleSending(msg, { embeds: [e], content: bonusText, status: StatusCode.INFO })
    else
        await handleSending(msg, { embeds: [e], status: StatusCode.INFO })

    itemUseCollector.stop()
}

function mostUsedBonus(players: { [key: string]: Player }) {
    let mostUsed = Object.values(players).sort((a, b) => b.itemUses - a.itemUses)
    const itemUseGap = mostUsed[0].itemUses - (mostUsed[1] || { itemUses: 0 }).itemUses 
    let bonusAmount = itemUseGap
    if (bonusAmount && economy.playerExists(mostUsed[0].id)) {
        const fullAmount = economy.calculateAmountFromNetWorth(mostUsed[0].id, `${bonusAmount}+${bonusAmount/10}%`)
        economy.addMoney(mostUsed[0].id, fullAmount)
        return `<@${mostUsed[0].id}> GOT THE ITEM BONUS BY USING ${mostUsed[0].itemUses} (${itemUseGap} more items) ITEMS AND WON $${fullAmount}\n`
    }
    return ""
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
    let nBet = economy.calculateAmountFromString(msg.author.id, bet, { min: (t, _a) => t * 0.002 })

    if (!nBet || !economy.canBetAmount(msg.author.id, nBet) || nBet < 0) {
        return { content: "Not a valid bet", status: StatusCode.ERR }
    }
    if (nBet / economy.getEconomy()[msg.author.id].money < 0.002) {
        return { content: "You must bet at least 0.2%", status: StatusCode.ERR }
    }

    let players: { [key: string]: Player } = { [msg.author.id]: new Player(msg.author.id, nBet, pet.getActivePet(msg.author.id) == 'dog' ? 150 : 100) }
    let cooldowns: { [key: string]: number } = { [msg.author.id]: 0 }

    await msg.channel.send(`${msg.author} has joined the battle with a $${nBet} bet`)

    let collector = msg.channel.createMessageCollector({ time: 15000, filter: m => !m.author.bot && m.content.toLowerCase().includes('join') })

    BATTLEGAME = true

    collector.on("collect", async (m) => {
        if (!isMsgChannel(msg.channel)) return
        if (players[m.author.id]) return
        let bet = m.content.trim().split(" ")[1] || "min"
        let nBet = economy.calculateAmountFromString(m.author.id, bet, { min: (t, _a) => t * 0.002 })
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
            let p = new Player(m.author.id, nBet, pet.getActivePet(m.author.id) == 'dog' ? 150 : 100)
            cooldowns[m.author.id] = 0
            players[m.author.id] = p
        }
        await msg.channel.send(`${m.author} has joined the battle with a $${nBet} bet`)
    })
    collector.on("end", async (_collection, _reason) => {
        let playerCount = Object.keys(players).length
        if (playerCount < 2) {
            if (!isMsgChannel(msg.channel)) return
            await msg.channel.send("Only 1 person joined, game ending")
        }
        else {
            let gameState = new GameState(players)
            await game(msg, gameState, useItems, winningType as "distribute" | "wta")
        }
        BATTLEGAME = false
    })
    let e = new EmbedBuilder()
    e.setTitle("TYPE `join <BET AMOUNT>` TO JOIN THE BATTLE")
    return { embeds: [e], status: StatusCode.RETURN }
}

export default {
    battle
}
