import { CommandCategory, createHelpArgument, createMatchCommand, handleSending, lastCommand, registerCommand, registerMatchCommand, runCmd, StatusCode } from "./common_to_commands"

export default function(CAT: CommandCategory) {
    registerMatchCommand(createMatchCommand(async ({ msg, match }) => {
        let find = match[1]
        let replace = match[2]
        lastCommand[msg.author.id] = lastCommand[msg.author.id].replaceAll(find, replace)
        console.log(lastCommand[msg.author.id])
        return await runCmd(msg, lastCommand[msg.author.id].slice(1), 1, true) as CommandReturn

    }, /^\^([^\^]+)\^(.*)$/, "match:run-replace", {
        info: "^&lt;find&gt;^&lt;replace&gt;",
        arguments: {
            find: createHelpArgument("The text to find for replacing", true),
            replace: createHelpArgument("The text to replace find with", false)
        }
    }))

    registerMatchCommand(createMatchCommand(async ({ msg: m, match: search }) => {
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

    }, /^(\d*):(\/[^\/]+\/)?(\d+,[\d\$]*)?(?:(.*)\/)*/, "match:find-run"))
}
