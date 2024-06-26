import fs from 'fs'
import common from '../common'
import common_to_commands, { ccmdV2, CommandCategory, createCommandV2, createHelpArgument, createHelpOption, crv, crvFile, registerCommand, StatusCode } from '../common_to_commands'
import economy from '../economy'
import timer from '../timer'
import { giveItem } from '../shop'
import user_country from '../travel/user-country'
import { Guild, PermissionsBitField, User } from 'discord.js'
import { fetchRoleFromServer, fetchUser, fetchUserFromClient, fetchUserFromClientOrGuild } from '../util'
import achievements from '../achievements'
import { server } from '../../website/server'
import { hasItem, useItem, resetPlayerItems, resetItems, getInventory } from '../shop'
import amountParser from '../amount-parser'
import { saveConfig, ADMINS, editConfig } from '../config-manager'
import runner from '../command-parser/runner'

import cmds from '../command-parser/cmds'

export default function*(): Generator<[string, CommandV2]> {

    yield [
        "GIVE_ROLES", ccmdV2(async function({ msg, args }) {
            let user = args.splice(0, 1)[0]
            let member = await fetchUser(msg.guild as Guild, user)
            if (!member) {
                return common_to_commands.cre(`Invalid user: ${user}`)
            }
            let roles = []
            for (let roleName of args) {
                let role = await fetchRoleFromServer(msg.guild as Guild, roleName)
                if (!role) {
                    continue
                }
                roles.push(role)
            }
            let adders = []
            for (let role of roles) {
                adders.push(member.roles.add(role))
            }
            await Promise.all(adders)
            return crv(`Gave ${member} some roles`)
        }, "Give a user some roles", {
            permCheck: m => m.member?.permissions.has(PermissionsBitField.Flags.ManageGuild) ?? false,
            helpArguments: {
                "user": createHelpArgument("the user to give roles to"),
                "...roles": createHelpArgument("The roles to give")
            }
        })
    ]

    yield [
        "COPY_ROLES", ccmdV2(async function({ msg, args }) {
            let copy_user = args.splice(0, 1)[0]
            let to_user = args.splice(0, 1)[0]
            let copy_member = await fetchUser(msg.guild as Guild, copy_user)
            let to_member = await fetchUser(msg.guild as Guild, to_user)
            if(!copy_member){
                return common_to_commands.cre(`${copy_user} is not a valid user`)
            }
            if(!to_member){
                return common_to_commands.cre(`${to_user} is not a valid user`)
            }
            for(let role of copy_member.roles.cache){
                if(to_member.roles.cache.has(role[0]))
                    continue
                to_member.roles.add(role[1]).catch(err => {
                    cmds.handleSending(msg, common_to_commands.cre(err))
                })
            }
            return crv(`Gave ${to_user} some roles`)
        }, "Copy roles from one member to another", {
            permCheck: m => m.member?.permissions.has(PermissionsBitField.Flags.ManageGuild) ?? false,
        })
    ]

    yield [
        'CONFIG', ccmdV2(async function({ args }) {
            let [path, value] = args
            editConfig(path, value)
            saveConfig()
            return crv("Set value")
        }, "Set a config value", {
            permCheck: m => ADMINS.includes(m.author.id)
        })
    ]

    yield [
        "RELOAD_BLACKLISTS", ccmdV2(async function() {
            common.reloadIDBlackLists()
            return crv("Blacklists reloaded")
        }, "Reloads user and role blacklists", {
            permCheck: m => ADMINS.includes(m.author.id)
        })
    ]

    yield [
        "CLEAR_INTERPRETER_CACHE", ccmdV2(async function() {
            runner.CMD_CACHE = new Map()
            return crv("Cache cleared")
        }, "Clears the interpreter cache", {
            permCheck: m => ADMINS.includes(m.author.id)
        })
    ]

    yield [
        "eval", ccmdV2(async function({ args, msg }) {
            return crv(JSON.stringify(eval(args.join(" "))))
        }, "Run javascript", {
            permCheck: m => ADMINS.includes(m.author.id)
        })
    ]

    yield [
        "REMOVE_TRAVEL_LOCATION", ccmdV2(async function({ msg, args }) {
            let creator = args[0]
            let user: User | undefined = msg.author
            if (msg.guild)
                user = (await fetchUser(msg.guild, creator))?.user
            else
                user = await fetchUserFromClient(common.client, creator)
            if (!user) {
                return crv(`${creator} not found`)
            }
            let location = args.slice(1).join(" ").trim()
            if (user_country.removeCountry(user.id, location)) {
                return crv(`Successfuly removed ${location}`)
            }
            return crv(`Could not remove ${location}`)
        }, "Remove a travel location", {
            permCheck: m => ADMINS.includes(m.author.id)
        })
    ]

    yield [
        "TRASH_EMPTY", ccmdV2(async ({ msg, sendCallback, opts }) => {
            fs.readdir("./garbage-files", async (_err, files) => {
                let deleteAll = opts.getBool('a', false)
                if (deleteAll && !(common.WHITELIST[msg.author.id] || ADMINS.includes(msg.author.id))) {
                    return crv(`You are not allowed to delete all trash files`, { status: StatusCode.ERR })
                }
                for (let file of files) {
                    if (deleteAll || file.includes(msg.author.id))
                        fs.rmSync(`./garbage-files/${file}`)
                }
                if (deleteAll)
                    await cmds.handleSending(msg, crv(`Deleted all files`), sendCallback)
                else await cmds.handleSending(msg, crv(`Deleted all of your files`), sendCallback)
            })
            return crv("Emptying files", { status: StatusCode.INFO })
        }, "Empties the garbage-files folder", {
            helpOptions: {
                a: createHelpOption("Delete all garbage files")
            }
        })
    ]

    yield [
        "REGISTER_COMMAND", createCommandV2(
            async ({ rawArgs: args }) => {
                let name = args[0]
                args = args.slice(1)
                let func = new (Object.getPrototypeOf(async function() { })).constructor("data", args.join(" "))

                registerCommand(name, createCommandV2(func, CommandCategory.FUN), CommandCategory.FUN)
                return { content: "test", status: StatusCode.RETURN }
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
        "RESET_ECONOMY", ccmdV2(async function({ msg }) {
            if (hasItem(msg.author.id, "reset economy")) {
                useItem(msg.author.id, "reset economy")
            }

            fs.cpSync("./database/economy.json", "./database/economy-old.json")

            economy.resetEconomy()

            return crv("Economy reset", {
                files: [crvFile("./database/economy-old.json", "economy-old.json", "The old economy",)]
            })
        }, "Resets the economy", {
            permCheck: (m) => {
                let { total } = economy.economyLooseGrandTotal(false)
                let necessary = amountParser.calculateAmountRelativeTo(total, `99%+100`)
                return ADMINS.includes(m.author.id) || economy.playerLooseNetWorth(m.author.id) >= necessary || Number(hasItem(m.author.id, "reset economy")) > 0
            },
        })
    ]

    yield ["RESET_LOTTERY", ccmdV2(async () => { economy.newLottery(); return crv("Lottery reset") }, "Resets the lottery")]

    yield [
        "RESET_PLAYER", ccmdV2(async function({ msg, args }) {
            if (!msg.guild) return crv("Not in aguild", { status: StatusCode.ERR })
            let player = await fetchUser(msg.guild, args[0])
            if (!player)
                return { content: "No player found", status: StatusCode.ERR }
            economy.resetPlayer(player.user.id)
            return { content: `Reset: <@${player.user.id}>`, status: StatusCode.RETURN }
        }, "Resets a player's money", {
            permCheck: m => ADMINS.includes(m.author.id),
        })
    ]

    yield [
        "RESET_PLAYER_ITEMS", ccmdV2(async function({ msg, args }) {
            if (!msg.guild) return crv("Not in aguild", { status: StatusCode.ERR })
            let player = await fetchUser(msg.guild, args[0])
            if (!player)
                return { content: "No player found", status: StatusCode.ERR }
            resetPlayerItems(player.user.id)
            return { content: `Reset: <@${player.user.id}>`, status: StatusCode.RETURN }
        }, "Reset's a players inventory", {
            permCheck: m => ADMINS.includes(m.author.id),
        })
    ]

    yield [
        "GIVE_ACHIEVEMENT", ccmdV2(async function({ msg, args }) {
            let [p, ach] = args
            let player = await fetchUserFromClientOrGuild(p, msg.guild)
            if (!player) {
                return crv(`${p} not found`)
            }
            if (!achievements.isAchievement(ach)) {
                return crv(`${ach} is not a valid achievement`)
            }
            let achText = achievements.achievementGet(player.id, ach)
            if (achText) {
                return achText
            }
            return crv(`${player.username} already has ${ach}`)
        }, "Give a player an achievement", {
            permCheck: m => ADMINS.includes(m.author.id)
        })
    ]

    yield [
        "DELETE_ITEM", ccmdV2(async function({ msg, args }) {
            let [user, ...item] = args
            let itemName = item.join(" ")
            let player = await fetchUserFromClientOrGuild(user, msg.guild)
            if (!player) {
                return crv(`${user} not found`)
            }
            if (getInventory()[player.id]?.[itemName] !== undefined) {
                delete getInventory()[player.id][itemName]
                return crv(`${itemName} deleted form ${player}'s inventory`, {
                    allowedMentions: { parse: [] }
                })
            }
            return crv(`${player} does not have ${itemName}`, {
                allowedMentions: { parse: [] }
            })
        }, "Deletes an item from players inventory", {
            permCheck: m => ADMINS.includes(m.author.id)
        })
    ]

    yield [
        "DELETE_TIMER", ccmdV2(async function({ msg, args }) {
            let timerToReset = args[0]
            if (!timerToReset) {
                return crv("No timer to reset given", { status: StatusCode.ERR })
            }
            let user = await fetchUserFromClientOrGuild(args[1] || msg.author.id, msg.guild)
            if(!user){
                return common_to_commands.cre(`Could not find user: ${args[1]}`)
            }
            timer.deleteTimer(user.id, timerToReset)
            return crv(`Reset timer: ${timerToReset} for user: ${user.username}`)
        }, "Resets your travel timer", {
            permCheck: m => ADMINS.includes(m.author.id)
        })
    ]

    yield [
        "GIVE_ITEM", ccmdV2(async function({ msg, args, opts }) {
            if (!msg.guild) return crv("Must be run in a guild", { status: StatusCode.ERR })
            let player = await fetchUser(msg.guild, args[0])
            if (!player) {
                return crv(`${args[0]} not found`)
            }
            giveItem(player.user.id, args.slice(1).join(" "), opts.getNumber("count", 1))
            return crv(`Gave ${player.displayName} 1 ${args.slice(1).join(" ")}`)
        }, "Adds an item to a players inventory", {
            permCheck: m => ADMINS.includes(m.author.id)
        })
    ]

    yield [
        "RESET_ITEMS", ccmdV2(async function() {
            resetItems()
            return { content: "Items reset", status: StatusCode.RETURN }
        }, "Resets all inventories", {
            permCheck: m => ADMINS.includes(m.author.id)
        })
    ]

    yield [
        "SETMONEY", ccmdV2(async function({ msg, args }) {
            if (!msg.guild) return crv("Must be run in a guild", { status: StatusCode.ERR })
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
        }, "Sets a player's money to an amount", {
            permCheck: (m) => ADMINS.includes(m.author.id),
        })
    ]

    yield [
        "BLACKLIST", ccmdV2(async function({ msg, rawArgs: args }) {
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
            let member = await fetchUserFromClientOrGuild(user, msg.guild)
            if (!member) {
                return crv("Member not found", { status: StatusCode.ERR })
            }
            if (addOrRemove == "a") {
                common.addToPermList(common.BLACKLIST, "blacklists", member, cmds)

                return {
                    content: `${user} has been blacklisted from ${cmds.join(" ")}`,
                    status: StatusCode.RETURN
                }
            } else {
                common.removeFromPermList(common.BLACKLIST, "blacklists", member, cmds)
                return {
                    content: `${user} has been removed from the blacklist of ${cmds.join(" ")}`,
                    status: StatusCode.RETURN
                }
            }

        }, "Blacklist, or unblacklist a user from a command<br>syntax: [BLACKLIST @user (a|r) cmd", {
            permCheck: msg => ADMINS.includes(msg.author.id)
        })
    ]

    yield [
        "END", ccmdV2(async function({ msg, sendCallback }) {
            await cmds.handleSending(msg, { content: "STOPPING", status: StatusCode.RETURN }, sendCallback)
            common.saveDb()
            server.close()
            common.client.destroy()
            process.exit()
        }, "End the bot", {
            permCheck: m => ADMINS.includes(m.author.id)
        })
    ]
}
