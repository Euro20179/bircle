import { Message, CollectorFilter } from "discord.js"
import economy from './economy'
import pet from './pets'
import timer from './timer'
import shop = require("./shop")
import { cmd, getAliasesV2 } from "./common_to_commands"
import { RECURSION_LIMIT } from "./globals"
import { isMsgChannel, fetchUser, getFonts, fetchUserFromClientOrGuild } from "./util"

export const APICmds: {[key: string]: {requirements: string[], exec: (data?: any) => Promise<string |  void | number | boolean>, optional?: string[], extra?: "msg"[]}} = {
    aliasType: {
        requirements: ["alias"],
        exec: async({alias}: {alias: string}) => getAliasesV2()[alias] ? "V2" : "None"
    },
    userHasStockSymbol:  {
        requirements: ["id", "symbol"],
        exec: async({ id, symbol }: {id: string, symbol: string}) => JSON.stringify(economy.userHasStockSymbol(id, symbol)),
    },
    saveEconomy: {
        requirements: [],
        exec: async() => economy.saveEconomy(),
    },
    loan: {
        requirements: ["id"],
        exec: async({ id }: {id: string}) => economy.getEconomy()[id]?.loanUsed || 0
    },
    canTax: {
        requirements: ["id"],
        exec: async({ id }: {id: string}) => economy.canTax(id, Number(shop.hasItem(id, "tax evasion") || 0) * 60)
    },
    playerEconomyLooseTotal: {
        requirements: ["id"],
        exec: async({ id }: {id: string}) => economy.playerEconomyLooseTotal(id)
    },
    canEarnMoney: {
        requirements: ["id"],
        exec: async({ id }: {id: string}) => timer.has_x_s_passed(id, "%can-earn", 60)
    },
    isRetired: {
        requirements: ["id"],
        exec: async({ id }: {id: string}) => economy.isRetired(id)
    },
    listPets:  {
        requirements: [],
        exec: async() => Object.keys(pet.getPetShop()).join("\n")
    },
    getActivePet: {
        requirements: ["id"],
        exec: async({ id }: {id: string}) => pet.getActivePet(id)
    },
    getSandCounter: {
        requirements: ["id"],
        exec: async({ id }: {id: string}) => economy.getSandCounter(id)
    },
    getStockInformation: {
        requirements: ["symbol"],
        exec: async({ symbol }: {symbol:  string}) => {
            let data = await economy.getStockInformation(symbol)
            if(data)
                return JSON.stringify(data)
            return false
        }
    },
    run: {
        requirements: ["cmd"],
        extra: ['msg'],
        exec: async({msg, cmd: command}: {msg: Message, cmd: string}) => {
            return JSON.stringify((await cmd({msg, command_excluding_prefix: command, recursion: RECURSION_LIMIT - 1, returnJson: true})).rv)
        }
    },
    economyLooseGrandTotal: {
        requirements: ["of"],
        exec: async({ of }: {of: "money" | "loan" | "stock" | "all"}) => {
            let {money, stocks, loan, total} = economy.economyLooseGrandTotal()
            switch(of){
                case "loan":
                    return loan
                case "money":
                    return money
                case "stock":
                    return stocks
                case "all":
                default:
                    return total
            }
        }
    },
    "getFonts": {
        requirements: [],
        exec: async() => getFonts().join(", "),
    },
    percentPerMinute: {
        exec: async({id}: {id: string}) => {
            let base_amount = 1.001
            if(pet.getActivePet(id) === "cat"){
                base_amount += pet.PETACTIONS['cat']()
            }
            if(shop.hasItem(id, 'capitalism hat')){
                base_amount += 0.002
            }
            let puffle_chat = shop.hasItem(id, "puffle chat")
            if(puffle_chat){
                base_amount += .0001 * puffle_chat
            }
            return String(base_amount)
        },
        requirements: ["id"]
    },
    "input": {
        exec: async ({msg, prompt, who, timeout}: {msg: Message, prompt?: string, who?: boolean | string | number, timeout?: number}) => {
            if(!isMsgChannel(msg.channel)) return "0"
            if (prompt && typeof prompt === 'string') {
                await msg.channel.send(prompt)
            }
            let filter: CollectorFilter<[Message<boolean>]> | undefined = (m: any) => m.author.id === msg.author.id && !m.author.bot
            if (who === false || who === 0) {
                filter = (m: Message) => !m.author.bot
            }
            else if (typeof who === 'string') {
                filter = (m: any) => m.author.id === who && !m.author.bot
            }
            let t = 30000
            if (typeof timeout === 'number') {
                t = timeout * 1000
            }
            try {
                let collected = await msg.channel.awaitMessages({ filter: filter, max: 1, time: t, errors: ["time"] })
                let resp = collected.at(0)
                if (typeof resp === 'undefined') {
                    return "0"
                }
                return JSON.stringify(resp)
            }
            catch (err) {
                return "0"
            }
        },
        requirements: ["prompt", "who", "timeout"],
        optional: ["who", "timeout"],
        extra: ['msg']
    },
}

export async function handleApiArgumentType(msg: Message, t: string, argument: string): Promise<any>{
    switch(t){
        case "id": {
            if(argument.length == 19 && argument[0] == "%"){
                return argument.slice(1)
            }
            let member = msg.guild?.members.cache.find((val, key) => val.id == argument || val.user.username.toLowerCase().indexOf(argument) > -1 || (val.nickname?.toLowerCase().indexOf(argument) || -1) > -1)
            if(member)
                return member.id
            return (await fetchUserFromClientOrGuild(argument, msg.guild))?.id || msg.author.id
        }
        case "who":{
            if(Number(argument) === 0){
                return 0
            }
            return await handleApiArgumentType(msg, "id", argument)
        }
        case "timeout":
            return parseFloat(argument)
        case "role": case "url": case "prompt": case "data": case "cmd": case "symbol":
        default:
            return argument
    }
}
