import { Message, CollectorFilter } from "discord.js"
import economy = require("./economy")
import pet = require('./pets')
import shop = require("./shop")
import fetch = require('node-fetch')

const { fetchUser } = require("./util.js")

export const APICmds: {[key: string]: {requirements: string[], exec: (data?: any) => Promise<string |  void | number | boolean>, optional?: string[], extra?: "msg"[]}} = {
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
    playerEconomyLooseTotal: {
        requirements: ["id"],
        exec: async({ id }: {id: string}) => economy.playerEconomyLooseTotal(id)
    },
    canEarnMoney: {
        requirements: ["id"],
        exec: async({ id }: {id: string}) => economy.canEarn(id)
    },
    listPets:  {
        requirements: [],
        exec: async() => Object.keys(pet.getPetShop()).join("\n")
    },
    getActivePet: {
        requirements: ["id"],
        exec: async({ id }: {id: string}) => pet.getActivePet(id)
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
    "input": {
        exec: async ({msg, prompt, who, timeout}: {msg: Message, prompt?: string, who?: boolean | string | number, timeout?: number}) => {
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
    // fetchURL: {
    //     requirements: ["url", "data"],
    //     exec: async({ url, data }: {url: string, data: "text"}) => {
    //         console.log(url)
    //         let respData = await fetch.default(encodeURI(url))
    //         if(data == "text"){
    //             return respData.text()
    //         }
    //     }
    // }
}

export async function handleApiArgumentType(msg: Message, t: string, argument: string){
    switch(t){
        case "id": {
            if(argument.length == 19 && argument[0] == "%"){
                return argument.slice(1)
            }
            let member = msg.guild?.members.cache.find((val, key) => val.id == argument || val.user.username.toLowerCase().indexOf(argument) > -1 || (val.nickname?.toLowerCase().indexOf(argument) || -1) > -1)
            if(member)
                return member.id
            return (await fetchUser(msg.guild, argument))?.user?.id || msg.author.id
        }
        case "who":{
            if(Number(argument) === 0){
                return 0
            }
            else{
                return argument
            }
        }
        case "timeout":
            return parseFloat(argument)
        case "url":
        case "prompt":
        case "data":
        case "symbol": {
            return argument
        }
        default:
            return false
    }
}
