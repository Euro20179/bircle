"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleApiArgumentType = exports.APICmds = void 0;
const economy = require("./economy");
const pet = require("./pets");
const { fetchUser } = require("./util.js");
exports.APICmds = {
    userHasStockSymbol: {
        requirements: ["id", "symbol"],
        exec: ({ id, symbol }) => JSON.stringify(economy.userHasStockSymbol(id, symbol)),
    },
    saveEconomy: {
        requirements: [],
        exec: () => economy.saveEconomy(),
    },
    loan: {
        requirements: ["id"],
        exec: ({ id }) => economy.getEconomy()[id]?.loanUsed || 0
    },
    playerEconomyLooseTotal: {
        requirements: ["id"],
        exec: ({ id }) => economy.playerEconomyLooseTotal(id)
    },
    canEarnMoney: {
        requirements: ["id"],
        exec: ({ id }) => economy.canEarn(id)
    },
    listPets: {
        requirements: [],
        exec: () => Object.keys(pet.getPetShop()).join("\n")
    },
    getActivePet: {
        requirements: ["id"],
        exec: ({ id }) => pet.getActivePet(id)
    }
};
async function handleApiArgumentType(msg, t, argument) {
    switch (t) {
        case "id": {
            if (argument.length == 19 && argument[0] == "%") {
                return argument.slice(1);
            }
            let member = msg.guild?.members.cache.find((val, key) => val.id == argument || val.user.username.toLowerCase().indexOf(argument) > -1 || (val.nickname?.toLowerCase().indexOf(argument) || -1) > -1);
            if (member)
                return member.id;
            return (await fetchUser(msg.guild, argument))?.user?.id || msg.author.id;
        }
        case "symbol": {
            return argument;
        }
        default:
            return false;
    }
}
exports.handleApiArgumentType = handleApiArgumentType;
