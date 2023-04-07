import { client, prefix } from "../common"
import { cmd, CommandCategory, createHelpArgument, createMatchCommand, crv, handleSending, Interpreter, lastCommand, StatusCode } from "../common_to_commands"
import { Parser } from "../parsing"
import { fetchUserFromClient, getContentFromResult, isMsgChannel } from "../util"

import user_options = require("../user-options")
import vars from "../vars"
import { DMChannel, Message } from "discord.js"

export default function*(CAT: CommandCategory) {
    yield [createMatchCommand(async ({ msg, match }) => {
        let find = match[1]
        let replace = match[2]
        if(!lastCommand[msg.author.id])
            return crv("You have not ran a command")
        lastCommand[msg.author.id] = lastCommand[msg.author.id].replaceAll(find, replace)
        return (await cmd({ msg, command_excluding_prefix: lastCommand[msg.author.id].slice(1), recursion: 1, returnJson: true })).rv as CommandReturn

    }, /^\^([^\^]+)\^(.*)$/, "match:run-replace", {
        info: "^&lt;find&gt;^&lt;replace&gt;",
        arguments: {
            find: createHelpArgument("The text to find for replacing", true),
            replace: createHelpArgument("The text to replace find with", false)
        }
    })]

    yield [createMatchCommand(async ({ msg, match }) => {

        if (msg.guild) {
            return { noSend: true, status: StatusCode.RETURN }
        }

        let searchUser: string = match[1]
        let textToSend = match[2]

        let user = await fetchUserFromClient(client, searchUser)

        if (!user) {
            return { content: `${searchUser} not found`, status: StatusCode.ERR }
        }
        if (user_options.getOpt(user.id, "enable-mail", "false").toLowerCase() !== "true") {
            return { content: `${user.username} does not have mail enabled`, status: StatusCode.ERR }
        }
        let signature = user_options.getOpt(msg.author.id, "mail-signature", "")
        if (signature.slice(0, prefix.length) === prefix) {
            signature = getContentFromResult((await cmd({ msg, command_excluding_prefix: signature.slice(prefix.length), recursion: 19, returnJson: true })).rv as CommandReturn)
            if (signature.startsWith(prefix)) {
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



    }, /^@([^\s]+) (.*)/, "match:send-mail-from-dms")]

    yield [createMatchCommand(async function({ msg, match }) {
        return (await cmd({ msg, command_excluding_prefix: `stop${match[1] ?? ""}`, returnJson: true })).rv as CommandReturn
    }, /u!stop(.*)/, "match:u!stop", {
        info: "same as [stop"
    })]

    yield [createMatchCommand(async function({ msg, match }) {
        return (await cmd({ msg, command_excluding_prefix: `calc -python ${match[1] ?? ""}`, returnJson: true })).rv as CommandReturn
    }, /u!eval(.*)/, "match:u!eval", {
        info: "same as [calc -python"
    })]

    yield [createMatchCommand(async function({ msg, match }) {
        user_options.unsetOpt(msg.author.id, 'prefix')
        return (await cmd({ msg, command_excluding_prefix: match[1] ?? "echo -D prefix unset", returnJson: true })).rv as CommandReturn

    }, /s!(.*)/, "match:s!", {
        info: "In case of a bad prefix, unsets it"
    })]

    yield [createMatchCommand(async ({ msg, match }) => {
        return (await cmd({ msg, command_excluding_prefix: `stop${match[1] ?? ""}`, returnJson: true })).rv
    }, /^u!stop(.*)/, "match:u!stop", {
        info: "same as [stop",
        arguments: {
            id: createHelpArgument("The id of the spam to stop", false, undefined, "Stops all spams")
        }
    })]

    yield [createMatchCommand(async ({ msg, match }) => {
        return (await cmd({ msg, command_excluding_prefix: `calc -python${match[1] ?? ""}`, returnJson: true })).rv
    }, /^u!eval(.*)/, "match:u!eval", {
        info: "same as <code>[calc -python</code>",
        arguments: {
            expression: createHelpArgument("The python expression to run", true)
        }
    })]

    yield [createMatchCommand(async ({ msg, match }) => {
        if (user_options.getOpt(msg.author.id, "prefix", prefix) === prefix) {
            return { noSend: true, status: StatusCode.RETURN }
        }
        user_options.setOpt(msg.author.id, "prefix", prefix)
        return (await cmd({ msg, command_excluding_prefix: match[1], returnJson: true })).rv

    }, /^s!(.*)/, "match:s!", {
        info: "run <code>s!</code> in case you mess up the prefix"
    })]

    yield [createMatchCommand(async ({ msg, match }) => {

        if (msg.guild) {
            return { noSend: true, status: StatusCode.RETURN }
        }

        let searchUser: string = match[1]
        let textToSend = match[2]

        let user = await fetchUserFromClient(client, searchUser)

        if (!user) {
            return { content: `${searchUser} not found`, status: StatusCode.ERR }
        }
        if (user_options.getOpt(user.id, "enable-mail", "false").toLowerCase() !== "true") {
            return { content: `${user.username} does not have mail enabled`, status: StatusCode.ERR }
        }
        let signature = user_options.getOpt(msg.author.id, "mail-signature", "")
        if (signature.slice(0, prefix.length) === prefix) {
            signature = getContentFromResult((await cmd({ msg, command_excluding_prefix: signature.slice(prefix.length), recursion: 19, returnJson: true })).rv)
            if (signature.startsWith(prefix)) {
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



    }, /^@([^\s]+) (.*)/, "match:send-mail-from-dms")]

    yield [createMatchCommand(async ({ msg, match }) => {
        let prefix = match[1] ?? "__global__"
        if (prefix?.startsWith("!")) {
            return { noSend: true, status: StatusCode.ERR }
        }
        let name = match[2]
        let quoteType = match[3]
        let data = match[4]

        if (quoteType === '"') {
            let p = new Parser(msg, data, false)
            await p.parse()
            let int = new Interpreter(msg, p.tokens, {
                modifiers: p.modifiers,
                recursion: 10
            })
            data = (await int.interprate()).join(" ")
        }

        vars.setVarEasy(`${prefix}:${name}`, data, msg.author.id)
        return { noSend: true, status: StatusCode.RETURN }
    }, /(?:([^ ]+):)?([A-za-z-_]+)=(['"])(.*)\3$/m, "match:create-var", {
        info: "var=\"data\" or var='data'",
        arguments: {
            name: createHelpArgument("Name of the variable", true),
            data: createHelpArgument("Data for the variable surrounded by \"\" or '', if \"\" is used, the text will be interpreted", true)
        }
    })]

    yield [createMatchCommand(async function({ msg, match }) {
        return { content: 'https://media.discordapp.net/attachments/969326196733136906/1035812838813474836/Screenshot_20221029-001015.png?width=278&height=602', status: StatusCode.RETURN }
    }, /Screenshot \(Oct 29, 2022 00:10:15\)/, "match:img")]

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
                let {rv} = await cmd({ msg: m, command_excluding_prefix: `${c} ${result}`, returnJson: true })
                if (rv?.content) result = rv.content
            }
            m.channel.send = oldSend
            finalMessages = [result]
        }
        return { content: finalMessages.join("\n"), allowedMentions: { parse: [] }, status: StatusCode.RETURN }

    }, /^(\d*):(\/[^\/]+\/)(?:(.*)\/)*/, "match:find-run")]
}
