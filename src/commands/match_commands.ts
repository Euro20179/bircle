import common from '../common'
import { createHelpArgument, createMatchCommand, crv, lastCommand, StatusCode } from '../common_to_commands'
import { fetchUserFromClient, getContentFromResult, isMsgChannel } from '../util'

import user_options from '../user-options'
import vars from '../vars'
import { DMChannel, Message } from 'discord.js'

import configManager, { PREFIX } from '../config-manager'

import cmds from '../command-parser/cmds'
import globals from '../globals'

const handleSending = cmds.handleSending

export default function*() {
    yield [createMatchCommand(async function({ msg, match }) {
        return await globals.PROCESS_MANAGER.spawn_cmd_then_die({
            msg, command: `stop${match[1] ?? ""}`, prefix: ""
        })
    }, /^u!stop(.*)/, "!stop", {
        info: "same as [stop"
    })]

    yield [createMatchCommand(async function({ msg, match }) {
        return await globals.PROCESS_MANAGER.spawn_cmd_then_die({
            msg, command: `calc -python ${match[1] ?? ""}`, prefix: ""
        })
    }, /^u!eval(.*)/, "!eval", {
        info: "same as [calc -python"
    })]

    yield [createMatchCommand(async function({ msg, match }) {
        user_options.unsetOpt(msg.author.id, 'prefix')
        return await globals.PROCESS_MANAGER.spawn_cmd_then_die({
            msg, command: match[1] ?? "echo -D prefix unset", prefix: ""
        })
    }, /^s!(.*)/, "!", {
        info: "In case of a bad prefix, unsets it"
    })]

    yield [createMatchCommand(async ({ msg, match }) => {

        if (msg.guild) {
            return { noSend: true, status: StatusCode.RETURN }
        }

        let searchUser: string = match[1]
        let textToSend = match[2]

        let user = await fetchUserFromClient(common.client, searchUser)

        if (!user) {
            return { content: `${searchUser} not found`, status: StatusCode.ERR }
        }
        if (user_options.getOpt(user.id, "enable-mail", "false").toLowerCase() !== "true") {
            return { content: `${user.username} does not have mail enabled`, status: StatusCode.ERR }
        }
        let signature = user_options.getOpt(msg.author.id, "mail-signature", "")
        if (signature.slice(0, PREFIX.length) === PREFIX) {
            const ctx = new cmds.RuntimeOptions()
            ctx.set("recursion", 19)
            signature = getContentFromResult((await globals.PROCESS_MANAGER.spawn_cmd_then_die({ msg, command: signature.slice(PREFIX.length), runtime_opts: ctx, prefix: "" })))
            if (signature.startsWith(PREFIX)) {
                signature = "\\" + signature
            }
        }
        if (!user.dmChannel) {
            try {
                await user.createDM()
            }
            catch (err) {
                return { content: `Cannot send to ${user.username}`, status: StatusCode.ERR }
            }
        }
        await handleSending(msg, { content: textToSend + `\n${signature}` || `${msg.member?.displayName || msg.author.username} says hi`, status: StatusCode.RETURN, delete: true, channel: user.dmChannel as DMChannel })

        return { content: `Message sent to ${user.username}`, status: StatusCode.RETURN }



    }, /^@([^\s]+) (.*)/, "end-mail-from-dms")]

    yield [createMatchCommand(async ({ msg, match }) => {
        let prefix = match[1] ?? "__global__"
        if (prefix?.startsWith("!")) {
            return { noSend: true, status: StatusCode.ERR }
        }
        let name = match[2]
        let quoteType = match[3]
        let data = match[4]

        if (quoteType === '"') {
            data = (await cmds.expandSyntax(data, msg)).join("\n")
        }

        vars.setVarEasy(`${prefix}:${name}`, data, msg.author.id)
        return { noSend: true, status: StatusCode.RETURN }
    }, /^(?:([^ ]+):)?([A-za-z-_]+)=(['"])(.*)\3$/m, "reate-var", {
        info: "var=\"data\" or var='data'",
        arguments: {
            name: createHelpArgument("Name of the variable", true),
            data: createHelpArgument("Data for the variable surrounded by \"\" or '', if \"\" is used, the text will be interpreted", true)
        }
    })]

    yield [createMatchCommand(async function() {
        return { content: 'https://media.discordapp.net/attachments/969326196733136906/1035812838813474836/Screenshot_20221029-001015.png?width=278&height=602', status: StatusCode.RETURN }
    }, /^Screenshot \(Oct 29, 2022 00:10:15\)$/, "mg")]

    yield [createMatchCommand(async ({ msg: m, match: search }) => {
        if (!isMsgChannel(m.channel)) return { noSend: true, status: StatusCode.ERR }
        let count = Number(search[1]) || Infinity
        let regexSearch = search[2]
        let rangeSearch = search[3]
        if (!regexSearch && !rangeSearch) {
            return { noSend: true, status: StatusCode.RETURN }
        }

        let after = search[4]
        let messages = await m.channel.messages.fetch({ limit: 100 })
        let index = -1
        let finalMessages: string[] = []
        if (regexSearch) {
            let regexpSearch: RegExp
            try {
                regexpSearch = new RegExp(regexSearch.slice(1).slice(0, regexSearch.length - 2))
            }
            catch (err) {
                await m.channel.send("Bad regex")
                return { noSend: true, status: StatusCode.RETURN }
            }
            let success = 0
            //FIXME: dont rely on msg.content, possibly take in a {content} argument
            messages.forEach(async (msg) => {
                index++
                if (index == 0 || success >= count) return
                if (msg.content.match(regexpSearch)) {
                    success++
                    finalMessages.push(msg.content)

                }
            })
        }
        else if (rangeSearch) {
            let [num1, num2] = rangeSearch.split(",")
            messages.forEach(async (msg) => {
                index++
                if (!isNaN(Number(num2)) && index == Number(num1)) {
                    finalMessages.push(msg.content)
                    return { noSend: true, status: StatusCode.RETURN }
                }
                if (index >= Number(num1) && index < Number(num2)) {
                    finalMessages.push(msg.content)
                }
            })
        }
        if (after) {
            let cmds = after.split("/")
            let result = finalMessages.join("\n")
            let oldSend = m.channel.send
            m.channel.send = async (_data) => {
                return m as Message<true>
            }
            for (let c of cmds) {
                let rv = await globals.PROCESS_MANAGER.spawn_cmd_then_die({ msg: m, command: `${c} ${result}`, prefix: "" })
                if (rv?.content) result = rv.content
            }
            m.channel.send = oldSend
            finalMessages = [result]
        }
        return { content: finalMessages.join("\n"), allowedMentions: { parse: [] }, status: StatusCode.RETURN }

    }, /^(\d*):(\/[^\/]+\/)(?:(.*)\/)*/, "ind-run")]
}
