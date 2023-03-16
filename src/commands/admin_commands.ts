import fs from 'fs'
import vars from '../vars'
import { addToPermList, ADMINS, BLACKLIST, client, removeFromPermList } from '../common'
import { ccmdV2, CommandCategory, createCommandV2, createHelpArgument, crv, currently_playing, handleSending, Interpreter, registerCommand, StatusCode } from '../common_to_commands'
import economy from '../economy'
import user_options = require("../user-options")
import pet from "../pets"
import timer from '../timer'
import { giveItem, saveItems } from '../shop'
import user_country from '../travel/user-country'
import { Message, User } from 'discord.js'
import { fetchUser, fetchUserFromClient, listComprehension } from '../util'
const { hasItem, useItem, resetPlayerItems, resetPlayer, resetItems } = require('../shop')

export default function*(): Generator<[string, Command| CommandV2]> {

    yield [
        "CLEAR_INTERPRETER_CACHE", ccmdV2(async function(){
            Interpreter.resultCache = new Map()
            return crv("Cache cleared")
        }, "Clears the interpreter cache", {
            permCheck: m => ADMINS.includes(m.author.id)
        })
    ]

    yield [
        "eval",
        {
            run: async (msg, args, sendCallback) => {
                return { content: JSON.stringify(eval(args.join(" "))), status: StatusCode.RETURN }
            },
            category: CommandCategory.ADMIN,
            permCheck: v => ADMINS.includes(v.author.id) || v.author.id === "288904417036468225",
            "help": {
                info: "run javascript"
            }
        },
    ]

    yield [
        "REMOVE_TRAVEL_LOCATION", ccmdV2(async function({msg, args}){
            let creator = args[0]
            let user: User | undefined = msg.author
            if(msg.guild)
                user = (await fetchUser(msg.guild, creator))?.user
            else
                user = await fetchUserFromClient(client, creator)
            if(!user){
                return crv(`${creator} not found`)
            }
            let location = args.slice(1).join(" ").trim()
            if(user_country.removeCountry(user.id, location)){
                return crv(`Successfuly removed ${location}`)
            }
            return crv(`Could not remove ${location}`)
        }, "Remove a travel location", {
            permCheck: m => ADMINS.includes(m.author.id)
        })
    ]

    yield [
        "TRASH_EMPTY", ccmdV2(async ({msg, sendCallback}) => {
            fs.readdir("./garbage-files", async(err, files) => {
                for(let file of files){
                    fs.rmSync(`./garbage-files/${file}`)
                }
                await handleSending(msg, crv(`Deleted all files`), sendCallback)
            })
            return crv("Emptying files", {status: StatusCode.INFO})
        }, "Empties the garbage-files folder")
    ]

    yield [
        "REGISTER_COMMAND", createCommandV2(
            async({rawArgs: args}) => {
                let name = args[0]
                args = args.slice(1)
                let func = new (Object.getPrototypeOf(async function(){})).constructor("msg", "rawArgs", "sendCallback", "opts", "args", "recursion_count", "command_bans", args.join(" "))

                registerCommand(name, createCommandV2(func, CommandCategory.FUN), CommandCategory.FUN)
                return {content: "test", status: StatusCode.RETURN}
            },
            CommandCategory.META,
            "Create a command",
            {
                name: createHelpArgument("Name of the command", true),
                body: createHelpArgument("Function body of the command", true)
            },
            {},
            undefined,
            m => ADMINS.includes(m.author.id)
        )
    ]

    yield [
        "RESET_ECONOMY",
        {
            run: async (msg, _args, sendCallback) => {

                if (hasItem(msg.author.id, "reset economy")) {
                    useItem(msg.author.id, "reset economy")
                }
                economy.resetEconomy()

                return { content: "Economy reset", status: StatusCode.RETURN }

            }, category: CommandCategory.ADMIN,
            permCheck: (m) => ADMINS.includes(m.author.id) || hasItem(m.author.id, "reset economy"),
            help: {
                info: "Resets the economy"
            }
        },
    ]

    yield [
        "RESET_LOTTERY",
        {
            run: async (msg, args, sb) => {
                economy.newLottery()
                return { content: "Lottery reset", status: StatusCode.RETURN }
            },
            category: CommandCategory.ADMIN,
            help: {
                info: "Resets the lottery"
            }
        },
    ]

    yield [
        "RESET_PLAYER",
        {
            run: async (msg, args, sendCallback) => {
                //@ts-ignore
                let player = await fetchUser(msg.guild, args[0])
                if (!player)
                    return { content: "No player found", status: StatusCode.ERR }
                economy.resetPlayer(player.user.id)
                return { content: `Reset: <@${player.user.id}>`, status: StatusCode.RETURN }
            },
            category: CommandCategory.ADMIN,
            permCheck: m => ADMINS.includes(m.author.id),
            help: {
                info: "Resets a player's money"
            }
        },
    ]

    yield [
        "RESET_PLAYER_ITEMS",
        {
            run: async (msg, args, sendCallback) => {
                //@ts-ignore
                let player = await fetchUser(msg.guild, args[0])
                if (!player)
                    return { content: "No player found", status: StatusCode.ERR }
                resetPlayerItems(player.user.id)
                return { content: `Reset: <@${player.user.id}>`, status: StatusCode.RETURN }
            },
            category: CommandCategory.ADMIN,
            permCheck: m => ADMINS.includes(m.author.id),
            help: {
                info: "Reset's a players inventory"
            }
        },
    ]

    yield [
        "GIVE_ITEM", ccmdV2(async function({msg, args, opts}){
            if(!msg.guild) return crv("Must be run in a guild", {status: StatusCode.ERR})
            let player = await fetchUser(msg.guild, args[0])
            if(!player){
                return crv(`${args[0]} not found`)
            }
            giveItem(player.user.id, args.slice(1).join(" "), opts.getNumber("count", 1))
            return crv(`Gave ${player.displayName} 1 ${args.slice(1).join(" ")}`)
        }, "Adds an item to a players inventory", {
            permCheck: m => ADMINS.includes(m.author.id)
        })
    ]

    yield [
        "RESET_ITEMS",
        {
            run: async (_msg, _args, sendCallback) => {
                resetItems()
                return { content: "Items reset", status: StatusCode.RETURN }
            },
            permCheck: (m) => ADMINS.includes(m.author.id),
            category: CommandCategory.ADMIN,
            help: {
                info: "Resets all inventories"
            }
        },
    ]

    yield [
        "SETMONEY",
        {
            run: async (msg, args, sendCallback) => {
                //@ts-ignore
                let user = await fetchUser(msg.guild, args[0])
                if (!user) {
                    return { content: "user not found", status: StatusCode.ERR }
                }
                let amount = economy.calculateAmountFromString(msg.author.id, args[1])
                if (amount) {
                    economy.setMoney(user.id, amount)
                    return { content: `${user.id} now has ${amount}`, status: StatusCode.RETURN }
                }
                return { content: "nothing happened", status: StatusCode.ERR }
            }, category: CommandCategory.ADMIN,
            permCheck: (m) => ADMINS.includes(m.author.id),
            help: {
                info: "Sets a player's money to an amount"
            }
        },
    ]

    yield [
        "BLACKLIST",
        {
            run: async (msg: Message, args: ArgumentList, sendCallback) => {
                let user = args[0]
                if (!user) {
                    return {
                        content: "no user given",
                        status: StatusCode.ERR
                    }
                }
                let addOrRemove = args[1]
                if (!["a", "r"].includes(addOrRemove)) {
                    return {
                        content: "did not specify, (a)dd or (r)emove",
                        status: StatusCode.ERR
                    }
                }
                let cmds = args.slice(2)
                if (!cmds.length) {
                    return {
                        content: "no cmd given",
                        status: StatusCode.ERR
                    }
                }
                //@ts-ignore
                user = await fetchUser(msg.guild, user)
                if (addOrRemove == "a") {
                    //@ts-ignore
                    addToPermList(BLACKLIST, "blacklists", user as User, cmds)

                    return {
                        content: `${user} has been blacklisted from ${cmds.join(" ")}`,
                        status: StatusCode.RETURN
                    }
                } else {
                    //@ts-ignore
                    removeFromPermList(BLACKLIST, "blacklists", user, cmds)
                    return {
                        content: `${user} has been removed from the blacklist of ${cmds.join(" ")}`,
                        status: StatusCode.RETURN
                    }
                }
            },
            permCheck: msg => {
                return ADMINS.includes(msg.author.id)
            },
            help: {
                info: "Blacklist, or unblacklist a user from a command<br>syntax: [BLACKLIST @user (a|r) cmd"
            },
            category: CommandCategory.ADMIN

        },
    ]

    yield [
        "END",
        {
            run: async (msg: Message, _args: ArgumentList, sendCallback) => {
                if (fs.existsSync(String(currently_playing?.filename))) {
                    try {
                        fs.rmSync(String(currently_playing?.filename))
                    }
                    catch (err) { }
                }
                await handleSending(msg, {content: "STOPPING", status: StatusCode.RETURN}, sendCallback)
                economy.saveEconomy()
                saveItems()
                vars.saveVars()
                timer.saveTimers()
                pet.savePetData()
                client.destroy()
                user_options.saveUserOptions()
                return {
                    content: "STOPPING",
                    status: StatusCode.RETURN
                }
            },
            permCheck: (msg) => {
                return ADMINS.includes(msg.author.id)
            },
            category: CommandCategory.ADMIN,
            help: {
                info: "End the bot"
            }

        },
    ]
}
