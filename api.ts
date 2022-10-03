import { Message } from "discord.js"
import economy = require("./economy")
import pet = require('./pets')
import shop = require("./shop")

const { fetchUser } = require("./util.js")

export const APICmds: {[key: string]: {requirements: string[], exec: Function}} = {
    userHasStockSymbol:  {
        requirements: ["id", "symbol"],
        exec: ({ id, symbol }: {id: string, symbol: string}) => JSON.stringify(economy.userHasStockSymbol(id, symbol)),
    },
    saveEconomy: {
        requirements: [],
        exec: () => economy.saveEconomy(),
    },
    loan: {
        requirements: ["id"],
        exec: ({ id }: {id: string}) => economy.getEconomy()[id]?.loanUsed || 0
    },
    playerEconomyLooseTotal: {
        requirements: ["id"],
        exec: ({ id }: {id: string}) => economy.playerEconomyLooseTotal(id)
    },
    canEarnMoney: {
        requirements: ["id"],
        exec: ({ id }: {id: string}) => economy.canEarn(id)
    },
    listPets:  {
        requirements: [],
        exec: () => Object.keys(pet.getPetShop()).join("\n")
    },
    getActivePet: {
        requirements: ["id"],
        exec: ({ id }: {id: string}) => pet.getActivePet(id)
    }
}

export async function handleApiArgumentType(msg: Message, t: string, argument: string){
    switch(t){
        case "id": {
            return (await fetchUser(msg.guild, argument))?.user?.id || msg.author.id
        }
        case "symbol": {
            return argument
        }
        default:
            return false
    }
}
