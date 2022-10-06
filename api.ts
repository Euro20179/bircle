import { Message } from "discord.js"
import economy = require("./economy")
import pet = require('./pets')
import shop = require("./shop")

const { fetchUser } = require("./util.js")

export const APICmds: {[key: string]: {requirements: string[], exec: (data?: any) => Promise<string |  void | number | boolean>}} = {
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
            let moneyTotal = 0
            let stockTotal = 0
            let loanTotal = 0
            let econ = economy.getEconomy()
            for(let player in econ){
                let pst = 0
                moneyTotal += econ[player].money
                for(let stock in econ[player].stocks){
                    //@ts-ignore
                    pst += econ[player].stocks[stock].shares * econ[player].stocks[stock].buyPrice
                }
                stockTotal += pst
                if(econ[player].loanUsed){
                    //@ts-ignore
                    loanTotal += econ[player].loanUsed
                }
            }
            switch(of){
                case "loan":
                    return loanTotal
                case "money":
                    return moneyTotal
                case "stock":
                    return stockTotal
                case "all":
                default:
                    return moneyTotal + stockTotal - loanTotal
            }
        }
    }
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
        case "symbol": {
            return argument
        }
        default:
            return false
    }
}
