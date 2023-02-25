import { client, prefix, setVarEasy } from "./common"
import { CommandCategory, createHelpArgument, createMatchCommand, handleSending, Interpreter, lastCommand, registerCommand, registerMatchCommand, runCmd, StatusCode } from "./common_to_commands"
import { Parser } from "./parsing"
import { fetchUserFromClient, getContentFromResult } from "./util"

import user_options = require("./user-options")
import { DMChannel } from "discord.js"

export default function*(CAT: CommandCategory) {
    yield [createMatchCommand(async ({ msg, match }) => {
        let find = match[1]
        let replace = match[2]
        lastCommand[msg.author.id] = lastCommand[msg.author.id].replaceAll(find, replace)
        return await runCmd(msg, lastCommand[msg.author.id].slice(1), 1, true) as CommandReturn

    }, /^\^([^\^]+)\^(.*)$/, "match:run-replace", {
        info: "^&lt;find&gt;^&lt;replace&gt;",
        arguments: {
            find: createHelpArgument("The text to find for replacing", true),
            replace: createHelpArgument("The text to replace find with", false)
        }
    })]

    yield [createMatchCommand(async ({msg, match}) => {

        if(msg.guild){
            return {noSend: true, status: StatusCode.RETURN}
        }

        let searchUser: string = match[1]
        let textToSend = match[2]

        let user = await fetchUserFromClient(client, searchUser)

        if(!user){
            return {content: `${searchUser} not found`, status: StatusCode.ERR}
        }
        if (user_options.getOpt(user.id, "enable-mail", "false").toLowerCase() !== "true") {
            return { content: `${user.username} does not have mail enabled`, status: StatusCode.ERR }
        }
        let signature = user_options.getOpt(msg.author.id, "mail-signature", "")
        if (signature.slice(0, prefix.length) === prefix) {
            signature = getContentFromResult(await runCmd(msg, signature.slice(prefix.length), 19, true))
            if (signature.startsWith(prefix)) {
                signature = "\\" + signature
            }
        }
        if(!user.dmChannel){
            try{
                await user.createDM()
            }
            catch(err){
                return {content: `Cannot send to ${user.username}`}
            }
        }
        await handleSending(msg, { content: textToSend + `\n${signature}` ||`${msg.member?.displayName || msg.author.username} says hi` , status: StatusCode.RETURN, delete: true, channel: user.dmChannel as DMChannel })

        return {content: `Message sent to ${user.username}`, status: StatusCode.RETURN}



    }, /@([^\s]+) (.*)/, "match:send-mail-from-dms")]

    yield [createMatchCommand(async ({ msg, match }) => {
        let prefix = match[1]
        let name = match[2]
        let quoteType = match[3]
        let data = match[4]

        if(quoteType === '"'){
            let p = new Parser(msg, data, false)
            await p.parse()
            let int = new Interpreter(msg, p.tokens, p.modifiers, 10)
            data = (await int.interprate()).join(" ")
        }

        setVarEasy(msg, name, data, prefix)
        return {noSend: true, status: StatusCode.RETURN}
    }, /(?:(%):)?([A-za-z-_]+)=(['"])(.*)\3$/m, "match:create-var", {
        info: "var=\"data\" or var='data'",
            arguments: {
            name: createHelpArgument("Name of the variable", true),
            data: createHelpArgument("Data for the variable surrounded by \"\" or '', if \"\" is used, the text will be interpreted", true)
        }
    })]

    yield [createMatchCommand(async function({msg, match}) {
        return {content: 'https://media.discordapp.net/attachments/969326196733136906/1035812838813474836/Screenshot_20221029-001015.png?width=278&height=602', status: StatusCode.RETURN}
    }, /Screenshot \(Oct 29, 2022 00:10:15\)/, "match:img")]

    yield [createMatchCommand(async ({ msg: m, match: search }) => {
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
                return m
            }
            for (let cmd of cmds) {
                let rv = await runCmd(m, `${cmd} ${result}`, 0, true)
                //@ts-ignore
                if (rv?.content) result = rv.content
            }
            m.channel.send = oldSend
            finalMessages = [result]
        }
        return { content: finalMessages.join("\n"), allowedMentions: { parse: [] }, status: StatusCode.RETURN }

    }, /^(\d*):(\/[^\/]+\/)(?:(.*)\/)*/, "match:find-run")]
}
