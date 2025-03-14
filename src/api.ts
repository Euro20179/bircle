import { Message, CollectorFilter } from "discord.js"
import economy from './economy'
import pet from './pets'
import timer from './timer'
import shop, { hasItem } from "./shop"
import { getAliasesV2 } from "./common_to_commands"
import { isMsgChannel, getFonts, fetchUserFromClientOrGuild } from "./util"
import cmds from "./command-parser/cmds"
import { DEVBOT } from "./config-manager"

import dns from "node:dns"

export const APICmds: {
    [key: string]: {
        requirements: string[],
        exec: (data?: any) => Promise<string | void | number | boolean>,
        optional?: string[],
        extra?: "msg"[]
    }
} = {
    aliasType: {
        requirements: ["alias"],
        exec: async ({ alias }: { alias: string }) => getAliasesV2()[alias] ? "V2" : "None"
    },
    userHasStockSymbol: {
        requirements: ["id", "symbol"],
        exec: async ({ id, symbol }: { id: string, symbol: string }) =>
            JSON.stringify(economy.userHasStockSymbol(id, symbol)),
    },
    saveEconomy: {
        requirements: [],
        exec: async () => economy.saveEconomy(),
    },
    loan: {
        requirements: ["id"],
        exec: async ({ id }: { id: string }) => economy.getEconomy()[id]?.loanUsed || 0
    },
    canTax: {
        requirements: ["id"],
        exec: async ({ id }: { id: string }) =>
            economy.canTax(id, Number(shop.hasItem(id, "tax evasion") || 0) * 60)
    },
    taxAmount: {
        requirements: ["id"],
        exec: async ({ id }: { id: string }) => {
            return economy.calculateTaxPercent(id, {
                max: hasItem(id, "tax shield") ? economy.getEconomy()[id]?.money : Infinity,
                taxPercent: false,
                hasTiger: pet.getActivePet(id) === 'tiger'
            })
        }
    },
    playerEconomyLooseTotal: {
        requirements: ["id"],
        exec: async ({ id }: { id: string }) => economy.playerEconomyLooseTotal(id)
    },
    canEarnMoney: {
        requirements: ["id"],
        exec: async ({ id }: { id: string }) => timer.has_x_s_passed(id, "%can-earn", 60)
    },
    isRetired: {
        requirements: ["id"],
        exec: async ({ id }: { id: string }) => economy.isRetired(id)
    },
    listPets: {
        requirements: [],
        exec: async () => Object.keys(pet.getPetShop()).join("\n")
    },
    getActivePet: {
        requirements: ["id"],
        exec: async ({ id }: { id: string }) => pet.getActivePet(id)
    },
    getSandCounter: {
        requirements: ["id"],
        exec: async ({ id }: { id: string }) => economy.getSandCounter(id)
    },
    getStockInformation: {
        requirements: ["symbol"],
        exec: async ({ symbol }: { symbol: string }) => {
            let data = await economy.getStockInformation(symbol)
            if (data)
                return JSON.stringify(data)
            return false
        }
    },
    run: {
        requirements: ["cmd"],
        extra: ['msg'],
        exec: async ({ msg, cmd: command }: { msg: Message, cmd: string }) => {
            let rv;
            for await (rv of cmds.runcmdv2({
                msg, command, prefix: ""
            }));
            return JSON.stringify(rv)
        }
    },
    economyLooseGrandTotal: {
        requirements: ["of"],
        exec: async ({ of }: { of: "money" | "loan" | "stock" | "all" }) => {
            let { money, stocks, loan, total } = economy.economyLooseGrandTotal()
            switch (of) {
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
    fetch: {
        requirements: ['url'],
        exec: async ({ url }: { url: string }) => {
            // if (DEVBOT) {
            //     return "NOT ALLOWED"
            // }
            if (!url.startsWith("http")) {
                return "NOT ALLOWED"
            }
            if (url.match(/^https?:\/\/(127|10|192|localhost)\.?/) && !url.startsWith("http://10.0.0.2")) {
                return "NOT ALLOWED"
            }

            const authorityStart = url.indexOf("//") + 2
            let domain = url.slice(authorityStart)

            let domainEnd = domain.indexOf("/")
            if(domainEnd == -1) domainEnd = domain.length + 1

            domain = domain.slice(0, domainEnd)

            const addrs = await dns.promises.resolve4(domain, { ttl: true })
            for (const addr of addrs) {
                if (["10.0.0.2", "192.168.9.2", "127.0.0.1", "192.168.0.145"].includes(addr.address)) {
                    return "NOT ALLOWED"
                }
            }

            let res = await fetch(url)
            return await res.text()
        }
    },
    "getFonts": {
        requirements: [],
        exec: async () => getFonts().join(", "),
    },
    percentPerMinute: {
        exec: async ({ id }: { id: string }) => {
            return economy.calculateBaseInterest({
                has_cat: pet.getActivePet(id) === 'cat',
                has_capitalism_hat: shop.hasItem(id, 'capitalism hat') ? true : false,
                puffle_chat_count: Number(shop.hasItem(id, "puffle chat"))
            })
        },
        requirements: ["id"]
    },
    "input": {
        exec: async ({ msg, prompt, who, timeout }: {
            msg: Message,
            prompt?: string,
            who?: boolean | string | number,
            timeout?: number
        }) => {
            if (!isMsgChannel(msg.channel)) return "0"
            if (prompt && typeof prompt === 'string') {
                await msg.channel.send(prompt)
            }
            let filter: CollectorFilter<[Message<boolean>]> | undefined =
                (m: any) => m.author.id === msg.author.id && !m.author.bot
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
                let collected = await msg.channel.awaitMessages({
                    filter: filter,
                    max: 1,
                    time: t,
                    errors: ["time"]
                })
                let resp = collected.at(0)
                const j = JSON.stringify(resp)
                if (typeof resp === 'undefined') {
                    return "0"
                }
                return j
            }
            catch (err) {
                console.log(err)
                return "0"
            }
        },
        requirements: ["prompt", "who", "timeout"],
        optional: ["who", "timeout"],
        extra: ['msg']
    },
}

export async function handleApiArgumentType(
    msg: Message,
    t: string,
    argument: string
): Promise<any> {
    switch (t) {
        case "id": {
            if (argument.length == 19 && argument[0] == "%") {
                return argument.slice(1)
            }
            let member = msg.guild?.members.cache.find(
                (val, _key) => val.id == argument
                    || val.user.username.toLowerCase().indexOf(argument) > -1
                    || (val.nickname?.toLowerCase().indexOf(argument) || -1) > -1
            )
            if (member)
                return member.id
            return (await fetchUserFromClientOrGuild(argument, msg.guild))?.id || msg.author.id
        }
        case "who": {
            if (Number(argument) === 0) {
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

export default {
    handleApiArgumentType,
    APICmds
}
