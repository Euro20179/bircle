import fs from 'fs'

import { AwaitMessagesOptions, Channel, ChannelType, ClientUser, Collection, DMChannel, Guild, GuildChannel, Message, MessageFlagsBitField, MessageMentions, MessageType, ReactionManager, TextChannel, User } from 'discord.js'
import http from 'http'
import common_to_commands, { CommandCategory, Interpreter } from '../src/common_to_commands'

import economy from '../src/economy'
import user_options from '../src/user-options'
import { generateHTMLFromCommandHelp, strToCommandCat, searchList, isCommandCategory, fetchUserFromClient, isSafeFilePath } from '../src/util'

import common from '../src/common'
import { CLIENT_SECRET, CLIENT_ID, getConfigValue } from '../src/globals'
import pets from '../src/pets'
import timer from '../src/timer'
import { getInventory } from '../src/shop'

import ws from 'ws'


function sendFile(res: http.ServerResponse, fp: string, contentType?: string, status?: number) {
    let stat = fs.statSync(fp)
    res.writeHead(status ?? 200, { content: contentType ?? "text/html", "Content-Length": stat.size })
    let stream = fs.createReadStream(fp)
    stream.pipe(res).on("finish", () => {
        res.end()
    })
}

let ACCESS_TOKENS: { [key: string]: { token: string, refresh: string, user_id?: string } } = {

}

export const server = http.createServer()
server.listen(8222)

function handlePost(req: http.IncomingMessage, res: http.ServerResponse, body: string) {
    let url = req.url
    if (!url) {
        res.writeHead(404)
        res.end(JSON.stringify({ err: "Page not found" }))
        return
    }
    let paramsStart = url.indexOf("?")
    let path = url.slice(0, paramsStart > -1 ? paramsStart : undefined)
    let urlParams: URLSearchParams | null = new URLSearchParams(url.slice(paramsStart))
    if (paramsStart == -1) {
        urlParams = null
    }
    let [_blank, mainPath, ..._subPaths] = path.split("/")
    switch (mainPath) {
        case "set-option": {
            if (!urlParams?.get("code")) {
                res.writeHead(403)
                res.end(JSON.stringify({ error: "You must be logged into discord to access this page" }))
                return
            }
            let codeToken = urlParams.get("code") as string
            let discordToken = ACCESS_TOKENS[codeToken]?.token
            if (!discordToken) {
                res.writeHead(403)
                res.end(JSON.stringify({ error: "Bad code token" }))
                return
            }
            if (!user_options.isValidOption(_subPaths[0])) {
                res.writeHead(404)
                res.end(JSON.stringify({ error: `${_subPaths[0]} is not a valid option` }))
                return
            }
            fetch('https://discord.com/api/v10/users/@me', {
                headers: {
                    "Authorization": `Bearer ${discordToken}`
                }
            }).then(res => {
                return res.json()
            }).then((user) => {
                if (!body) {
                    user_options.unsetOpt(user.id, _subPaths[0])
                }
                else user_options.setOpt(user.id, _subPaths[0], body)
                res.writeHead(200)
                res.end(JSON.stringify({ success: `Set ${_subPaths[0]} to ${body}` }))
            })
            break;

        }
        case "discord-sign-in": {
            let userCodeToken = urlParams?.get("code-token")
            let host = urlParams?.get("host")

            if (!userCodeToken) {
                res.writeHead(403)
                res.end(JSON.stringify({ error: "No code-token parameter" }))
                return
            }
            if (!host) {
                res.writeHead(400)
                res.end(JSON.stringify({ error: "No host url given" }))
                return
            }

            fetch(`https://discord.com/api/v10/oauth2/token`, {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                body: `client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&code=${userCodeToken}&redirect_uri=http://${host}&grant_type=authorization_code`,
                method: "POST"
            })
                .then(r => r.json())
                .then((json) => {
                    res.writeHead(200)
                    res.end()
                    ACCESS_TOKENS[userCodeToken as string] = { token: json.access_token, refresh: json.refresh_token }
                })
            break
        }
    }

}

function _handlePost(req: http.IncomingMessage, res: http.ServerResponse) {
    let body = ''
    req.on("data", chunk => body += chunk.toString())
    req.on("end", () => {
        handlePost(req, res, body)
    })
}

function _apiSubPath(req: http.IncomingMessage, res: http.ServerResponse, subPaths: string[], urlParams: URLSearchParams | null) {
    let [apiEndPoint] = subPaths
    subPaths = subPaths.splice(1)
    res.setHeader("Content-Type", "application/json")
    switch (apiEndPoint) {
        case "resolve-ids": {
            let userIds = urlParams?.get("ids")?.split(",")
            if (!userIds?.length) {
                res.writeHead(400)
                res.end('{"error": "No user ids given"}')
                break
            }
            let fetches = []
            for (let user of userIds) {
                fetches.push(common.client.users.fetch(user))
            }
            Promise.all(fetches).then(users => {
                let json: any = {}
                for (let user of users) {
                    json[user.id] = user
                }
                res.writeHead(200)
                res.end(JSON.stringify(json))
            })
            break
        }
        case "profile": {
            const sendJson = (userId: string) => {
                let json = {
                    economy: economy.getEconomy()[userId],
                    pets: pets.getUserPets(userId),
                    timers: timer.getTimersOfUser(userId),
                    sandCounter: economy.getSandCounter(userId),
                    inventory: getInventory()[userId],
                    id: userId,
                    options: user_options.USER_OPTIONS[userId]
                }
                res.writeHead(200)
                res.end(JSON.stringify(json))
            }
            const sendPfp = (user: User) => {
                let url = user.avatarURL()
                if (!url) {
                    sendFile(res, "./website/404.html", undefined, 404)
                    return
                }
                fetch(url)
                    .then(value => value.arrayBuffer())
                    .then(buf => {
                        res.setHeader("Content-Type", "image/png")
                        res.writeHead(200)
                        res.end(Buffer.from(buf))
                    })
            }
            if (subPaths[0] === 'by-name') {
                if (!subPaths[1]) {
                    res.writeHead(404)
                    res.end(JSON.stringify({ error: "No user given" }))
                    return
                }
                fetchUserFromClient(common.client, subPaths[1]).then(user => {
                    if (!user) {
                        res.writeHead(404)
                        res.end(JSON.stringify({ error: "User not found" }))
                        return
                    }
                    if (subPaths[2] === 'pfp') {
                        sendPfp(user)
                    }
                    else sendJson(user.id)
                })
            }
            else {
                let userId = subPaths[0]
                if (!userId) {
                    res.writeHead(404)
                    res.end(JSON.stringify({ error: "No user given" }))
                }
                else if (subPaths[1] === 'pfp') {
                    common.client.users.fetch(userId).then(user => {
                        sendPfp(user)
                    }).catch(_reason => {
                        sendFile(res, "./website/404.html", undefined, 404)
                    })
                }
                else {
                    sendJson(userId)
                }
            }
            break
        }
        case "option": {
            let userId = subPaths[0] ?? urlParams?.get("user-id")
            if (!userId) {
                res.writeHead(400)
                res.end('{"error": "No user id given"}')
                break;
            }
            let option = urlParams?.get("option")
            if (!option) {
                res.writeHead(400)
                res.end('{"error": "No option given"}')
                break;
            }
            let validOption = user_options.isValidOption(option)
            if (!validOption) {
                res.writeHead(400)
                res.end('{"error": "No option given"}')
                break;
            }
            res.end(JSON.stringify(user_options.getOpt(userId, validOption, null)))
            break;
        }
        case "set-option": {
        }
        case "reload-api-keys": {
            if (!urlParams) {
                res.writeHead(403)
                res.end("Permission denied")
                break;
            }
            let apiKey = urlParams.get("key") || ""

            let VALID_API_KEYS = getConfigValue("secrets.valid-api-keys") || []

            if (!VALID_API_KEYS.includes(apiKey)) {
                res.writeHead(403)
                res.end("Permission denied")
                break;
            }

            res.writeHead(200)
            res.end('"success"')
            break;
        }
        case "give-money": {
            if (!urlParams) {
                res.writeHead(403)
                res.end("Permission denied")
                break;
            }
            let apiKey = urlParams.get("key") || ""
            if (!(getConfigValue("secrets.valid-api-keys") || []).includes(apiKey)) {
                res.writeHead(403)
                res.end("Permission denied")
                break;
            }
            let userId = subPaths[0]
            if (!userId) {
                res.writeHead(400)
                res.end(JSON.stringify({ "error": "no user id" }))
                break;
            }
            let amount = subPaths[1]
            if (!amount || isNaN(Number(amount))) {
                res.writeHead(400)
                res.end(JSON.stringify({ "error": "no amount" }))
                break
            }
            if (!economy.getEconomy()[userId]) {
                res.writeHead(400)
                res.end(JSON.stringify({ "error": "Invalid user" }))
                break;
            }
            economy.addMoney(userId, Number(amount))
            res.writeHead(200)
            res.end(JSON.stringify({ "amount": Number(amount) }))
            break;
        }
        case "economy": {
            let userId = subPaths[0] ?? urlParams?.get("user-id")
            if (userId === "total") {
                res.writeHead(200)
                res.end(JSON.stringify(economy.economyLooseGrandTotal()))
                break;
            }
            let econData = economy.getEconomy()
            let rv;
            if (userId) {
                if (econData[userId])
                    rv = econData[userId]
                else {
                    rv = { error: "Cannot find data for user" }
                }
            }
            else {
                rv = econData
            }
            res.writeHead(200)
            res.end(JSON.stringify(rv))
            break
        }
        case "files": {
            let files = urlParams?.get("file")?.split(" ")
            if (!files) {
                files = fs.readdirSync(`./command-results/`)
            }
            let data: { [file: string]: string } = {}
            for (let file of files) {
                if (fs.existsSync(`./command-results/${file}`)) {
                    data[file] = fs.readFileSync(`./command-results/${file}`, "utf-8")
                }
            }
            res.writeHead(200)
            res.end(JSON.stringify(data))
            break
        }
        case "command-search": {
            let search = urlParams?.get("search")
            let category = urlParams?.get("category")
            switch (subPaths.length) {
                case 1: {
                    if (!search)
                        search = subPaths[0]
                    else category = subPaths[0];
                    break;
                }
                case 2: {
                    [category, search] = subPaths
                    break;
                }
            }
            let cmdToGet = urlParams?.get("cmd")
            let hasAttr = urlParams?.get("has-attr")
            let cmds = common_to_commands.getCommands()
            let commands: [(string | [string, string]), Command | CommandV2][] = Array.from(cmds.entries())
            if (category && isCommandCategory(category.toUpperCase()))
                commands = commands.filter(([_name, cmd]) => cmd.category === strToCommandCat(category as keyof typeof CommandCategory))

            if (hasAttr) {
                commands = commands.filter(([_name, cmd]) => {
                    let obj = cmd
                    for (let prop of hasAttr?.split(".") || "") {
                        obj = obj[prop as keyof typeof obj]
                        if (obj === undefined) break;
                    }
                    return obj ? true : false
                })
            }

            if (search && search !== '*') {
                let infos = commands.map(v => `${v[0]}\n${v[1].help?.info || ""}`)
                let results = searchList(search, infos, true)
                commands = Array.from(Object.entries(results).filter(([_, v]) => v > 0).sort((a, b) => b[1] - a[1]), (([name, strength]) => {
                    name = name.split("\n")[0]
                    return [[name, `<span class='cmd-search-strength'>(${strength})</span>`], common_to_commands.getCommands().get(name) as Command | CommandV2]
                }))
            }
            else if (cmdToGet) {
                commands = [[cmdToGet || "NO RESULTS", cmds.get(cmdToGet) as Command | CommandV2]]
            }

            //the input only works nicely when it's inside of main for some reason
            let html = ''
            for (let [name, command] of commands) {
                if (!command) continue
                let resultPriority = ""
                if (typeof name === 'object') {
                    [name, resultPriority] = name
                }
                html += generateHTMLFromCommandHelp(name, command as Command | CommandV2).replace(`>${name}</h1>`, `>${name} ${resultPriority}</h1>`)
            }
            html += ""
            res.writeHead(200, { "Content-Type": "text/html" })
            res.end(html)
            break;
        }
        case "send": {
            let text = urlParams?.get("text")
            if (!text) {
                res.writeHead(400)
                res.end(JSON.stringify({ error: "No text given" }))
                break
            }

            //******************************
            /*YOU WERE FIXING WARNINGS, YOU GOT RID OF ALL OF THEM HERE*/
            //******************************


            let inChannel = urlParams?.get("channel-id")
            common.client.channels.fetch(String(inChannel)).then((channel) => {
                if (!channel || channel.type !== ChannelType.GuildText) {
                    res.writeHead(445)
                    res.end(JSON.stringify({ error: "Bad channel id" }))
                    return
                }
                channel.send({ content: text as string }).then((msg: any) => {
                    res.writeHead(200)
                    res.end(JSON.stringify(msg.toJSON()))
                })
            }).catch((_err: any) => {
                res.writeHead(444)
                res.end(JSON.stringify({ error: "Channel not found" }))
            })
            break
        }

    }

}

function handleGet(req: http.IncomingMessage, res: http.ServerResponse) {
    let url = req.url
    if (!url) {
        res.writeHead(404)
        res.end("Page not found")
        return
    }
    let paramsStart = url.indexOf("?")
    let path = url.slice(0, paramsStart > -1 ? paramsStart : undefined)
    let urlParams: URLSearchParams | null = new URLSearchParams(url.slice(paramsStart))
    if (paramsStart == -1) {
        urlParams = null
    }
    let [_blank, mainPath, ...subPaths] = path.split("/")

    if (mainPath.endsWith(".css") && fs.existsSync(`./website/css/${mainPath}`)) {
        sendFile(res, `./website/css/${mainPath}`, "text/css")
        return
    }
    else if (mainPath.endsWith(".js") && fs.existsSync(`./website/js/${mainPath}`)) {
        sendFile(res, `./website/js/${mainPath}`, "application/javascript")
        return
    }
    switch (mainPath) {
        case "": {
            sendFile(res, "./website/home.html")
            break;
        }
        case "robots.txt": {
            res.writeHead(200)
            res.end("User-agent: *\nDisallow: /")
            break;
        }
        case "options": {
            if (!urlParams?.get("code")) {
                res.writeHead(403)
                res.end("<h1>You must be logged into discord to use this page</h1>")
                return
            }
            let codeToken = urlParams.get("code") as string
            let discordToken = ACCESS_TOKENS[codeToken]?.token
            if (!discordToken) {
                res.writeHead(403)
                res.end("<h1>Bad code token</h1>")
                return
            }
            fetch('https://discord.com/api/v10/users/@me', {
                headers: {
                    "Authorization": `Bearer ${discordToken}`
                }
            }).then(res => {
                return res.json()
            }).then((user) => {
                let id = user.id
                fs.readFile("./src/user-options.json", (err, data) => {
                    let html = "<!DOCTYPE html><html><head><link rel='stylesheet' href='common.css'><link rel='stylesheet' href='options.css'></head><body><h1 id='saved-popup'>saved</h1>"
                    if (err) {
                        res.writeHead(500)
                        res.end("Server error<br>Could not read user options file")
                        return
                    }
                    let json = JSON.parse(data.toString())
                    for (let option in json) {
                        let h = `<h1>${option}</h1>`
                        let desc = `<p>${json[option].description || ""}</p>`
                        let input
                        if (json[option].type === 'textarea') {
                            input = `<textarea id="${option}" type="${json[option].type || "text"}" placeholder="${json[option].placeholder || "text"}">${user_options.getOpt(id, option as any, "")}</textarea>`
                        }
                        else if (json[option].type === 'checkbox') {
                            input = `<input type="checkbox" placeholder="${json[option].placeholder || "text"}" id="${option}" `
                            if (user_options.getOpt(id, option as any, "")) {
                                input += "checked"
                            }
                            input += ">"
                        }
                        else {
                            input = `<input id="${option}"  type="${json[option].type || "text"}"  value="${user_options.getOpt(id, option as any, "")}" placeholder="${json[option].placeholder || "text"}">`
                        }
                        html += `${h}${desc}${input}<hr>`
                    }
                    res.writeHead(200)
                    res.end(html + "</body><script src='/options.js'></script></html>")
                })
                return
            })
            break;
        }
        case "discord": {
            sendFile(res, "./website/discord-login.html")
            break;
        }
        case "leaderboard": {
            sendFile(res, "./website/leaderboard.html")
            break;
        }
        case "commands": {
            sendFile(res, "./website/commands.html")
            break;
        }
        case "help": {
            sendFile(res, "./website/help-web.html")
            break;
        }
        case "api": {
            return _apiSubPath(req, res, subPaths, urlParams)
        }
        case "garbage": {
            if (subPaths[0] && isSafeFilePath(subPaths[0]) && fs.existsSync(`./garbage-files/${subPaths[0]}`)) {
                fs.readFile(`./garbage-files/${subPaths[0]}`, (err, data) => {
                    if (err) {
                        res.writeHead(500)
                        res.end("Internal server error")
                        return
                    }
                    let html = `<head><meta charset='utf-8'><link rel='stylesheet' href='/common.css'></head><pre>${data.toString("utf-8")}</pre>`
                    res.writeHead(200)
                    res.end(html)
                })
                break
            }
            fs.readdir("./garbage-files", (err, files) => {
                let html = "<head><meta charset='utf-8'><link rel=\"stylesheet\" href=\"/common.css\"></head><h1 style='text-align: center'>Custom Pages</h1><ul>"
                if (err) {
                    res.writeHead(500)
                    res.end("Internal server error")
                    return
                }
                for (let file of files) {
                    html += `<li><a href="/garbage/${file}">${file}</a></li>`
                }
                res.writeHead(200)
                res.end(html)
            })
            break;
        }
        case "custom": {
            if (subPaths[0] && isSafeFilePath(subPaths[0]) && fs.existsSync(`./data/custom-endpoints/${subPaths[0]}.html`)) {
                sendFile(res, `./data/custom-endpoints/${subPaths[0]}.html`)
            }
            else if (subPaths.length) {
                sendFile(res, "./website/404.html", undefined, 404)
            }
            else {
                let html = "<head><meta charset='utf-8'><link rel=\"stylesheet\" href=\"/common.css\"></head><h1 style='text-align: center'>Custom Pages</h1><ul>"
                fs.readdir("./data/custom-endpoints", (err, files) => {
                    if (err) {
                        res.writeHead(500)
                        res.end("Internal server error")
                        return
                    }
                    for (let file of files) {
                        html += `<li><a href="/custom/${file.replace(".html", "")}">${file}</a></li>`
                    }
                    res.writeHead(200)
                    res.end(html + "</ul>")
                })
            }
            break
        }
        default:
            sendFile(res, "./website/404.html", undefined, 404)
    }
}

server.on("request", (req, res) => {
    if (req.method === 'POST') {
        return _handlePost(req, res)
    }
    else if (req.method === 'GET') {
        return handleGet(req, res)
    }
})
function createFakeMessage(author: User, channel: DMChannel | TextChannel, content: string, guild: Guild = null) {
    //@ts-ignore
    let msg: Message = {
        activity: null,
        applicationId: String(common.client.user?.id),
        id: "_1033110249244213260",
        attachments: new Collection(),
        author: author,
        channel: channel,
        channelId: channel.id,
        cleanContent: content as string,
        client: common.client,
        components: [],
        content: content as string,
        createdAt: new Date(Date.now()),
        createdTimestamp: Date.now(),
        crosspostable: false,
        deletable: false,
        editable: false,
        editedAt: null,
        editedTimestamp: null,
        embeds: [],
        flags: new MessageFlagsBitField(),
        groupActivityApplication: null,
        guild: guild,
        guildId: guild?.id,
        hasThread: false,
        interaction: null,
        member: null,
        mentions: {
            parsedUsers: new Collection(),
            channels: new Collection(),
            crosspostedChannels: new Collection(),
            everyone: false,
            members: null,
            repliedUser: null,
            roles: new Collection(),
            users: new Collection(),
            has: (_data: any, _options: any) => false,
            _parsedUsers: new Collection(),
            _channels: null,
            _content: content as string,
            _members: null,
            client: common.client,
            guild: guild,
            toJSON: () => {
                return {}
            }
        } as unknown as MessageMentions,
        nonce: null,
        partial: false,
        pinnable: false,
        pinned: false,
        position: null,
        reactions: new Object() as ReactionManager,
        reference: null,
        stickers: new Collection(),
        system: false,
        thread: null,
        tts: false,
        type: MessageType.Default,
        url: "http://localhost:8222/",
        webhookId: null,
        _cacheType: false,
        _patch: (_data: any) => { }
    }
    return msg
}
function _run(ws: ws.WebSocket, command: string, author: User, inChannel: string, handleReturn: (rv: { interpreter: Interpreter | undefined, rv: CommandReturn }) => any, handleError: (err: any) => any) {
    common.client.channels.fetch(inChannel).then((channel) => {
        if (!channel || channel.type !== ChannelType.GuildText) {
            handleError("Channel not found")
            return
        }

        //prevents from sending to chat
        let oldSend = channel.send

        let msg = createFakeMessage(author, channel, command, channel.guild)

        //instead of sending to chat, send to the client
        channel.send = (async (data: object) => {
            ws.send(JSON.stringify({ event: "append-data", rv: data }))
            return msg as Message<true>
        }).bind(channel)

        let prompt_replies: [string, Message][] = []
        //listens for inputs from the client
        ws.on("message", data => {
            let result = JSON.parse(data.toString())
            if (result['prompt-response']) {
                prompt_replies.push([author.id, createFakeMessage(author, channel, result['prompt-response'], channel.guild)])
            }
        })

        let oldAwaitMessage = channel.awaitMessages

        //resets the input list every time we want to listen for inputs
        channel.awaitMessages = async (data: AwaitMessagesOptions | undefined) => {
            //tell the client we are ready for inputs
            ws.send(JSON.stringify({ event: "prompt-user", }))
            prompt_replies = []
            await new Promise(res => setTimeout(res, data?.time || 30000))
            //after the specified timeout (or 30 seconds if not given) return the collection
            return new Collection(prompt_replies)
        }

        common_to_commands.cmd({
            msg, command_excluding_prefix: command as string, returnJson: true, sendCallback: async (data) => {
                //make sendcallback go to the client
                ws.send(JSON.stringify({ event: "append-data", rv: data }))
                return msg as Message<true>
            }
        }).then((data) => {
            channel.send = oldSend
            channel.awaitMessages = oldAwaitMessage
            return handleReturn(data)
        }
        ).catch((data) => {
            channel.send = oldSend
            channel.awaitMessages = oldAwaitMessage
            return handleError(data)
        })

    }).catch(handleError)
}


const wsServer = new ws.WebSocketServer({ path: "/run", server })

wsServer.on("connection", function(ws, req) {
    let urlParams = new URLSearchParams(req.url?.split("?").slice(1).join("?"))
    let inChannel = urlParams?.get("channel-id") || getConfigValue("general.default-channel")

    let codeToken = urlParams?.get("code-token")

    ws.on("error", console.error)

    ws.on("message", data => {
        let jsonData = JSON.parse(data.toString())
        if (jsonData.event === "run") {
            let cmd = jsonData.data
            if (codeToken) {
                let discordToken = ACCESS_TOKENS[codeToken]?.token
                if (!discordToken) {
                    ws.send(JSON.stringify({ error: "Bad code token" }))
                    return
                }
                fetch('https://discord.com/api/v10/users/@me', {
                    headers: {
                        "Authorization": `Bearer ${discordToken}`
                    }
                }).then(res => {
                    return res.json()
                }).then(user =>
                    _run(ws, cmd, user, inChannel, (rv) => {
                        ws.send(JSON.stringify(rv))
                        ws.close()
                    }, err => console.log(err))
                )
            }
            else {
                _run(ws, cmd, common.client.user as User, inChannel, rv => {
                    ws.send(JSON.stringify(rv))
                    ws.close()
                }, err => {
                    console.log(err)
                })
            }
        }
    })
    ws.send(JSON.stringify({ event: "ready" }))
})
