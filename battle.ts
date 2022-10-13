import { Message, MessageEmbed } from 'discord.js'

import pet = require('./pets')

import fs = require("fs")

const { getOpts, handleSending } = require("./util.js")

//const { calculateAmountFromString, getEconomy, canBetAmount, addMoney, loseMoneyToBank } = require("./economy.js")
import economy = require("./economy")
const { hasItem } = require("./shop.js")

let BATTLEGAME: boolean = false;

const BATTLE_GAME_BONUS = 1.1;

async function handleDeath(id: string, players: {[key: string]: number}, winningType: "distribute" | "wta", bets: {[key: string]: number}, ogBets: {[key: string]: number}): Promise<{amountToRemoveFromBetTotal: number, send: MessageEmbed}>{
    let remaining = Object.keys(players).length - 1
    delete players[id]
    let e = new MessageEmbed()
    e.setTitle("NEW LOSER")
    let rv: {amountToRemoveFromBetTotal: number, send: MessageEmbed} = {amountToRemoveFromBetTotal: 0, send: e}
    if(winningType === 'distribute' && remaining > 0){
        rv.amountToRemoveFromBetTotal = bets[id]
        e.setDescription(`<@${id}> HAS DIED and distributed ${bets[id] / remaining * BATTLE_GAME_BONUS} to each player`)
        e.setColor("BLUE")
        for(let player in players){
            economy.addMoney(player, bets[id] / remaining * BATTLE_GAME_BONUS)
        }
    }
    else{
        e.setDescription(`<@${id}> HAS DIED AND LOST $${ogBets[id]}`)
        e.setColor("RED")
    }
    rv.send = e
    economy.loseMoneyToBank(id, ogBets[id])
    return rv
}

async function game(msg: Message, players: {[key: string]: number}, ogBets: {[key: string]: number}, cooldowns: {[key: string]: number}, usedSwap: string[], usedShell: string[], bets: {[key: string]: number}, betTotal: number, useItems: boolean, winningType: "wta" | "distribute", shields: {[key: string]: boolean}){
    let midGameCollector = msg.channel.createMessageCollector({filter: m => !m.author.bot && m.content.toLowerCase() == 'join' && hasItem(m.author.id, "intrude")})

    let responseMultiplier = 1;

    let usedEarthquake = false;
    let mumboUser: string | null = null

    let usedYoink: string[] = []

    let negativeHpBonus: {[key: string]: number} = {}

    let itemUses: {[key: string]: number} = {}

    midGameCollector.on("collect", async(m) => {
        if(players[m.author.id]) return
        if(!Object.keys(players).includes(m.author.id) && ogBets[m.author.id] === undefined &&  Object.keys(players).length < 2){
            players[Object.keys(players)[0]] = 100
            players[m.author.id] = 0
            usedSwap.push(m.author.id)
            usedShell.push(m.author.id)
            usedEarthquake = true
        }
        else if(!Object.keys(players).includes(m.author.id) && ogBets[m.author.id] === undefined){
            let bet = economy.calculateAmountFromString(m.author.id, "min", {min: (t, a) => t * .002})
            bets[m.author.id] = bet
            ogBets[m.author.id] = bet
            cooldowns[m.author.id] = 0
            players[m.author.id] = Math.floor(Object.values(players).reduce((p, c) => p + c, 0) / Object.values(players).length)
            betTotal += bet
            await msg.channel.send(`${m.author} has intruded the battle with a bet of ${ogBets[m.author.id]}`)
        }
    })

    let start = Date.now() / 1000

    //item cost table{{{
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
    //}}}

    let itemUseCollector = msg.channel.createMessageCollector({filter: m => Object.keys(players).includes(m.author.id) && Object.keys(items).includes(m.content.toLowerCase())})

    let rarityTable = {"huge": .2, "big": .5, "medium": .7, "small": .9, "tiny": 1}

    //item table{{{
    let itemFunctionTable: {[key: string]:  (m: Message, e: MessageEmbed) => Promise<boolean>} = {
        heal: async(m: Message, e: MessageEmbed) => {
            let amount =  Math.floor(Math.random() * 19 + 1)
            e.setTitle("HEAL")
            e.setColor("GREEN")
            e.setDescription(`<@${m.author.id}> healed for ${amount}`)
            if(players[m.author.id])
                players[m.author.id] += amount
            return true
        },
        "anger toolbox": async(m, e) => {
            e.setTitle("TOOLBOX IS ANGRY")
            e.setColor("RED")
            e.setDescription(`<@${m.author.id}> has angered toolbox`)
            for(let player in players){
                players[player] *= .99432382
            }
            return true
        },
        "anger euro": async(m, e) => {
            await msg.channel.send("STOPPING")
            return false
        },
        "double bet": async(m, e) => {
            if(economy.getEconomy()[m.author.id].money - bets[m.author.id] >= bets[m.author.id]){
                betTotal += bets[m.author.id]
                bets[m.author.id] *= 2
                e.setTitle("DOUBLE BET")
                e.setDescription(`${m.author} has doubled their bet to ${bets[m.author.id]}`)
                e.setColor("GREEN")
                return true
            }
            return false
        },
        "blowtorch": async(m, e) => {
            let amount = Math.floor(Math.random() * 19 + 1)
            e.setTitle("BLOWTORCH")
            e.setColor("RED")
            e.setDescription(`<@${m.author.id}> blowtorches everyone for ${amount} damage`)
            for(let player in players){
                if(player === m.author.id) continue
                players[player] -= amount
            }
            return true
        },
        swap: async(m, e) => {
            if(usedSwap.includes(m.author.id))
                return false
            let playerKeys = Object.keys(players).filter(v => v !== m.author.id)
            let p = playerKeys[Math.floor(Math.random() * playerKeys.length)]
            let thisPlayerHealth = players[m.author.id]
            let otherPlayerHealth = players[p]
            e.setTitle(`SWAP HEALTH`)
            e.setDescription(`<@${m.author.id}> <-> <@${p}>`)
            e.setColor("#ffff00")
            players[m.author.id] = otherPlayerHealth
            players[p] = thisPlayerHealth
            usedSwap.push(m.author.id)
            return true
        },
        double: async(m, e) => {
            responseMultiplier *= 2
            e.setTitle("DOUBLE")
            e.setColor("GREEN")
            e.setDescription(`<@${m.author.id}> has doubled the multiplier\n**multiplier: ${responseMultiplier}**`)
            return true
        },
        triple: async(m, e) => {
            responseMultiplier *= 3
            e.setTitle("TRIPLE")
            e.setColor("GREEN")
            e.setDescription(`<@${m.author.id}> has tripled the multiplier\n**multiplier: ${responseMultiplier}**`)
            return true
        },
        "blue shell": async(m, e) => {
            if(usedShell.includes(m.author.id)){
                return false
            }
            e.setTitle("BLUE SHELL")
            e.setColor("BLUE")
            let sort = Object.entries(players).sort((a, b) => b[1] - a[1])
            let firstPlace = sort[0]
            if(firstPlace[1] < 50){
                await msg.channel.send("No one has more than 50 health")
                return false
            }
            e.setDescription(`<@${m.author.id}> hit <@${firstPlace[0]}> with a blue shell`)
            players[firstPlace[0]] -= 50
            usedShell.push(m.author.id)
            return true
        },
        "shield": async(m, e) => {
            if(!Object.keys(shields).includes(m.author.id)){
                shields[m.author.id] = true
                e.setTitle("SHIELD")
                e.setColor("WHITE")
                e.setDescription(`<@${m.author.id}> bought a shield`)
                return true
            }
            return false
        },
        mumbo: async(m, e) => {
            if(mumboUser)
                return false
            mumboUser = m.author.id
            players['mumbo'] = 100
            e.setTitle("MUMBO JOINS THE BATTLE")
            return true
        },
        yoink: async(m, e) => {
            if(usedYoink.includes(m.author.id))
                return false
            usedYoink.push(m.author.id)
            mumboUser = m.author.id
            e.setTitle(`YOINK`)
            e.setDescription(`<@${m.author.id}> HAS STOLEN MUMBOくん`)
            return true
        },
        suicide: async(m, e) => {
            e.setTitle("SUICIDE")
            e.setColor("DARK_RED")
            let damage =  Math.floor(Math.random() * 8 + 2)
            e.setDescription(`<@${m.author.id}> took ${damage} damage`)
            players[m.author.id] -= damage
            return true
        },
        earthquake: async(m, e) => {
            if(usedEarthquake)
                return false
            let sumHealths = Object.values(players).reduce((a, b) => a + b, 0)
            let average = sumHealths / Object.keys(players).length
            e.setTitle("EARTHQUAKE")
            e.setColor("GREY")
            for(let player in players){
                players[player] = average
            }
            e.setDescription(`<@${m.author.id}> CAUSED AN EARTHQUAKE`)
            usedEarthquake = true
            return true
        }
    }
    //}}}

    if(useItems){
        itemUseCollector.on("collect", async(m) => {
            if(!economy.getEconomy()[m.author.id]){
                return
            }
            if(Date.now() / 1000 - cooldowns[m.author.id] < 8){
                await msg.channel.send(`<@${m.author.id}> Used an item on cooldown -5 hp (cooldown remaining: **${8 - (Date.now() / 1000 - cooldowns[m.author.id])}**`)
                players[m.author.id] -= 5
                if(players[m.author.id] <= 0){
                    let rv = await  handleDeath(m.author.id, players, winningType, bets, ogBets)
                    betTotal -= rv.amountToRemoveFromBetTotal
                    await m.channel.send({embeds: [rv.send]})
                }
                return
            }
            let i = m.content.toLowerCase()
            let cost = items[i]
            let a = cost.amount ?? 0
            if(cost.percent){
                a += economy.calculateAmountFromString(m.author.id, `${cost.percent * 100}%`)
            }
            if(economy.getEconomy()[m.author.id].money - bets[m.author.id] < a){
                await m.channel.send("You cannot afford this")
                return
            }
            let e = new MessageEmbed()
            e.setFooter({text: `Cost: ${a}`})
            let rv = await itemFunctionTable[i](m, e)
            if(rv){
                economy.loseMoneyToBank(m.author.id, a)
                await m.channel.send({embeds: [e]})
                betTotal += a
                bets[m.author.id] += a
                if(itemUses[m.author.id]){
                    itemUses[m.author.id]++
                }
                else{
                    itemUses[m.author.id] = 1
                }
            }
        })
    }
    let lastMessages = []
    let responses = [
        "{userall} died AMOUNT=huge DAMAGE=all",
        "{userall} lived AMOUNT=small HEAL=all",
    ]
    if(fs.existsSync("./command-results/battle")){
        let d = fs.readFileSync("./command-results/battle", "utf-8")
        responses = d.split(";END").map(v => v.split(":").slice(1).join(":").trim())
    }
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
        let nAmount = 0
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
        if(responseMultiplier > 1){
            nAmount *= responseMultiplier
            responseMultiplier = 1
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

        for(let elim of eliminations){
            if(elim === 'mumbo'){
                //@ts-ignore
                text += `<@${mumboUser}>'s MUMBO HAS DIED and <@${mumboUser}> LOST ${economy.getEconomy()[mumboUser]?.money * 0.005} \n`
                //@ts-ignore
                economy.loseMoneyToBank(mumboUser, economy.getEconomy()[mumboUser]?.money * 0.005)
                mumboUser = null
                delete players[elim]
            }
            else{
                let rv = await  handleDeath(elim, players, winningType, bets, ogBets)
                betTotal -= rv.amountToRemoveFromBetTotal
                await msg.channel.send({embeds: [rv.send]})
            }
        }

        for(let player in players){
            if(isNaN(players[player])){
                if(player === 'mumbo'){
                    //@ts-ignore
                    await msg.channel.send( `<@${mumboUser}>'s MUMBO HAS DIED and <@${mumboUser}> LOST ${economy.getEconomy()[mumboUser]?.money * 0.005} \n`)
                    //@ts-ignore
                    economy.loseMoneyToBank(mumboUser, economy.getEconomy()[mumboUser]?.money * 0.005)
                    mumboUser = null
                }
                else{
                    let rv = await  handleDeath(player, players, winningType, bets, ogBets)
                    betTotal -= rv.amountToRemoveFromBetTotal
                    await msg.channel.send(`<@${player}> HAS NaN HEALTH AND DIED`)
                }
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
        economy.loseMoneyToBank(last, ogBets[last])
        e.setDescription(`THE GAME IS A TIE`)
        e.setTitle("TIE")
        e.setColor("YELLOW")
    }
    else if(winner[0] == 'mumbo'){
        economy.addMoney(mumboUser || "", betTotal / 2)
        e.setTitle("GAME OVER")
        e.setColor("DARK_GREEN")
        e.setDescription(`MUMBO WINS, <@${mumboUser}> SUMMONED MUMBO AND GETS HALF THE WINNINGS! ($${betTotal / 2})`)
    }
    else{
        economy.addMoney(winner[0], betTotal * BATTLE_GAME_BONUS)
        if(negativeHpBonus[winner[0]]){
            bonusText += `<@${winner[0]}> GOT THE NEGATIVE HP BONUS FOR ${negativeHpBonus[winner[0]]}\n`
            economy.addMoney(winner[0], Math.abs(negativeHpBonus[winner[0]]))
        }
        e.setTitle("GAME OVER!")
        e.setColor("GREEN")
        if(winningType === 'wta'){
            e.setDescription(`<@${winner[0]}> IS THE WINNER WITH ${winner[1]} HEALTH REMAINING\nAND WON: $${betTotal * BATTLE_GAME_BONUS}`)
        }
        else{
            e.setDescription(`<@${winner[0]}> IS THE WINNER WITH ${winner[1]} HEALTH REMAINING\nAND WON THE REMAINING: $${betTotal * BATTLE_GAME_BONUS}`)
        }
    }
    e.setFooter({text: `The game lasted: ${Date.now() / 1000 - start} seconds`})
    midGameCollector.stop()
    if(winner && winner[1] >= 100){
        if(economy.getEconomy()[winner[0]]){
            economy.addMoney(winner[0], winner[1] - 100)
            bonusText += `<@${winner[0]}> GOT THE 100+ HP BONUS\n`
        }
    }
    if(Object.keys(itemUses).length > 0){
        let mostUsed = Object.entries(itemUses).sort((a, b) => b[1] - a[1])
        let bonusAmount = mostUsed[0][1] - (mostUsed[1]?.[1] || 0)
        if(bonusAmount && economy.getEconomy()[mostUsed[0][0]]){
            economy.addMoney(mostUsed[0][0], bonusAmount)
            bonusText += `<@${mostUsed[0][0]}> GOT THE ITEM BONUS BY USING ${mostUsed[0][1]} ITEMS AND WON $${bonusAmount}\n`
        }
    }
    if(bonusText)
        await handleSending(msg, {embeds: [e], content: bonusText})
    else
        await handleSending(msg, {embeds: [e]})
    itemUseCollector.stop()
}

async function battle(msg: Message, args: ArgumentList){
    if(BATTLEGAME)
        return {content: "A game is already happening"}
    let opts;
    [opts, args] = getOpts(args)
    let useItems = !opts['no-items']
    let bet = args[0]
    let wt = args[1]
    let winningType = wt || "distribute"
    if(!["wta", "distribute", "dist", "winnertakesall", "winnertakeall"].includes(winningType)){
        return {content: "Betting type must be wta (winner takes all) or distribute"}
    }
    if (winningType == 'dist')
        winningType = 'distribute'
    //@ts-ignore
    let nBet = economy.calculateAmountFromString(msg.author.id, bet, {min: (t, a) => t * 0.002})

    if(!nBet || !economy.canBetAmount(msg.author.id, nBet) || nBet < 0){
        return {content: "Not a valid bet"}
    }
    if(nBet / economy.getEconomy()[msg.author.id].money < 0.002){
        return {content: "You must bet at least 0.2%"}
    }

    let players: {[key: string]: number} = {[msg.author.id]: pet.getActivePet(msg.author.id) == 'dog' ? pet.PETACTIONS['dog'](100) : 100}
    //total bet
    let bets: {[key: string]: number} = {[msg.author.id]: nBet}
    //initial bet
    let ogBets: {[key: string]: number} = {[msg.author.id]: nBet}
    let cooldowns: {[key: string]: number} = {[msg.author.id]: 0}

    let usedSwap: string[] = []
    let usedShell: string[] = []
    let shields: {[key: string]: boolean} = {}
    let betTotal = nBet


    await msg.channel.send(`${msg.author} has joined the battle with a $${nBet} bet`)

    let collector = msg.channel.createMessageCollector({time: 15000, filter: m => !m.author.bot && m.content.toLowerCase().includes('join')})

    BATTLEGAME = true

    collector.on("collect", async(m) => {
        if(players[m.author.id]) return
        let bet = m.content.split(" ")[1]
        //@ts-ignore
        let nBet = economy.calculateAmountFromString(m.author.id, bet, {min: (t, a) => t * 0.002})
        if(!nBet || !economy.canBetAmount(m.author.id, nBet) || nBet < 0){
            await msg.channel.send(`${m.author}: ${nBet} is not a valid bet`)
            return
        }

        if(nBet / economy.getEconomy()[m.author.id].money < 0.002){
            await m.channel.send("You must bet at least 0.2%")
            return
        }

        betTotal += nBet

        if(!Object.keys(players).includes(m.author.id)){
            bets[m.author.id] = nBet
            ogBets[m.author.id] = nBet
            cooldowns[m.author.id] = 0
            if(pet.getActivePet(m.author.id) == 'dog'){
                players[m.author.id] = pet.PETACTIONS['dog'](100)
            }
            else{
                players[m.author.id] = 100
            }
        }
        await msg.channel.send(`${m.author} has joined the battle with a $${nBet} bet`)
    })
    collector.on("end", async(collection, reason) => {
        let playerCount = Object.keys(players).length
        if(playerCount < 2){
            await msg.channel.send("Only 1 person joined, game ending")
        }
        else{
            await game(msg, players, ogBets, cooldowns, usedSwap, usedShell, bets, betTotal, useItems, winningType as "distribute" | "wta", shields)
        }
        BATTLEGAME = false
    })
    let e = new MessageEmbed()
    e.setTitle("TYPE `join <BET AMOUNT>` TO JOIN THE BATTLE")
    return {embeds: [e]}
}

export{
    battle
}
