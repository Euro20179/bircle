import fs from 'fs'

import vars, { VarType } from '../vars'


import { aliasesV2, AliasV2, ccmdV2, cmd, createCommandV2, createHelpArgument, createHelpOption, crv, getAliasesV2, getCommands, getMatchCommands, handleSending, Interpreter, lastCommand, PIDS, StatusCode } from "../common_to_commands"
import globals = require("../globals")
import user_options = require("../user-options")
import API = require("../api")
import { Parser, parseBracketPair, formatPercentStr, format } from "../parsing"

import common from '../common'
import { fetchUser, generateSafeEvalContextFromMessage, getContentFromResult, getImgFromMsgAndOpts, safeEval, choice, generateHTMLFromCommandHelp, cmdCatToStr, isSafeFilePath, BADVALUE, fetchUserFromClient, searchList, isMsgChannel, ArgList, fetchUserFromClientOrGuild, truthy } from "../util"


import { Guild, Message, EmbedBuilder, User } from "discord.js"
import { execSync } from 'child_process'
import { performance } from 'perf_hooks'

import fetch from 'node-fetch'
import htmlRenderer from '../html-renderer'


export default function*(CAT: CommandCategory): Generator<[string, Command | CommandV2]> {
    yield ["get-var", ccmdV2(async function({ args, opts, msg }) {
        let as = opts.getString("as", msg.author.id)
        let user: undefined | User = msg.author
        if (msg.guild) {
            user = (await fetchUser(msg.guild, as))?.user
        }
        else
            user = await fetchUserFromClient(common.client, as)
        if (!user) {
            return { content: `Cannot find user ${as}`, status: StatusCode.ERR }
        }

        let oldAuthor = msg.author
        msg.author = user
        let res = vars.getVar(msg, args[0])
        msg.author = oldAuthor

        if (res === false) {
            return { noSend: true, status: StatusCode.ERR }
        }


        return crv(res)
    }, "Gets a variable", {
        helpArguments: {
            name: createHelpArgument("the variable name including prefix, eg: connect4:wins")
        },
        helpOptions: {
            as: createHelpOption("The user to get the variable from")
        }
    })]


    yield ["stdin", createCommandV2(async ({ stdin, args }) => {
        let result: any = stdin
        args.forEach(arg => result = result[arg] ?? result)
        return { content: typeof result === 'string' ? result : JSON.stringify(result), status: StatusCode.RETURN }

    }, CAT, "get specific data from stdin/pipe")]

    yield ["set", ccmdV2(async ({ opts, args, interpreter }) => {
        let newIfs = opts.getString("IFS", "")
        if (newIfs) {
            interpreter.context.export("IFS", newIfs)
        }

        let explicit = opts.getBool("x", null)
        if (explicit !== null) {
            interpreter.context.setOpt("explicit", Number(explicit))
        }

        let intCache = opts.getBool("c", null)
        if (intCache !== null) {
            interpreter.context.setOpt("no-int-cache", Number(intCache))
        }

        let dryRun = opts.getBool("d", null)
        if (dryRun !== null)
            interpreter.context.setOpt("dryRun", Number(dryRun))

        let newProgArgs = args.slice(0)
        if (newProgArgs.length) {
            interpreter.context.programArgs = newProgArgs
        }
        return crv(interpreter.context.programArgs.join(interpreter.context.env.IFS ?? " "))
    }, "Sets program arguments", {
        helpOptions: {
            IFS: createHelpOption("set field seperator for variable expansion and \\a{*}"),
            x: createHelpOption("Say what is being run for each command"),
            d: createHelpOption("Dont actually run the command")
        }
    })]

    yield ["env", ccmdV2(async ({ interpreter }) => {
        return crv(Object.entries(interpreter.context.env).reduce((p, cur) => p + `\n${cur[0]} = ${JSON.stringify(cur[1])}`, ""))
    }, "Gets the interpreter env")]

    yield ['ps', ccmdV2(async function(){
        let text = ''
        for(let i = 0; i < PIDS.length; i++){
            text += `${PIDS.keyAt(i)}: ${PIDS.valueAt(i)}\n`
        }
        return crv(text)
    }, "Gets all running processes")]

    yield ['kill', ccmdV2(async function({argShapeResults}){
        let pid = argShapeResults['pid'] as number
        if(!PIDS.keyExists(pid)){
            return crv(`No process with pid: ${pid}`)
        }
        PIDS.delete(pid)
        return crv(`${pid} killed`)
    }, "Kill a process", {
        helpArguments: {
            pid: createHelpArgument("The pid to kill")
        },
        argShape: async function*(args){
            yield [args.expectInt(1), "pid"]
        }
    })]

    yield ["export", ccmdV2(async ({ interpreter, args }) => {
        let [name, ...val] = args
        let value = val.join(" ")
        if (value[0] === "=") {
            value = value.slice(1)
        }

        value = value.trim()

        if (!name.match(/^[A-Za-z0-9_-]+$/)) {
            return crv("Name must be alphanumeric + _- only", { status: StatusCode.ERR })
        }

        interpreter.context.export(name, value)

        return crv(`${name} = ${value}`)
    }, "Sets a variable for the current runtime")]

    yield ["raw", createCommandV2(async ({ rawArgs }) => {
        let data;
        try {
            data = JSON.parse(rawArgs.join(" "))
            if (data["files"]) {
                delete data["files"]
            }
            if (data["attachments"]) {
                delete data["attachments"]
            }
        }
        catch (err) {
            return { content: "Could not parse json", status: StatusCode.ERR }
        }
        if (typeof data.status !== 'number') {
            return { content: "No status code", status: StatusCode.ERR }
        }
        return data as CommandReturn

    }, CAT, "Return the data raw", {
        json: createHelpArgument("The return json")
    })]

    yield [
        "```bircle", createCommandV2(async ({ msg, args, commandBans: bans, sendCallback }) => {
            for (let line of args.join(" ").replace(/```$/, "").trim().split(";EOL")) {
                line = line.trim()
                if (!line) continue
                await cmd({ msg, command_excluding_prefix: line, recursion: globals.RECURSION_LIMIT - 1, disable: bans, sendCallback })
            }
            return { noSend: true, status: StatusCode.RETURN }
        }, CAT, "Run some commands"),
    ]

    yield [
        "(", createCommandV2(async ({ msg, rawArgs: args, commandBans: bans, recursionCount: rec, sendCallback }) => {
            if (args[args.length - 1] !== ")") {
                return { content: "The last argument to ( must be )", status: StatusCode.ERR }
            }
            return { content: JSON.stringify((await cmd({ msg, command_excluding_prefix: args.slice(0, -1).join(" "), recursion: rec + 1, returnJson: true, disable: bans, sendCallback })).rv), status: StatusCode.RETURN }
        }, CAT),
    ]

    yield [
        'tokenize', createCommandV2(async ({ msg, rawArgs: args }) => {
            let parser: Parser = new Parser(msg, args.join(" ").trim())
            await parser.parse()
            return { content: parser.tokens.map(v => JSON.stringify(v)).join(";\n") + ";", status: StatusCode.RETURN }
        }, CAT, "Tokenize command input"),
    ]

    yield [
        "interprate", ccmdV2(async ({ msg, rawArgs: args }) => {
            let parser = new Parser(msg, args.join(" ").trim())
            await parser.parse()
            let int = new Interpreter(msg, parser.tokens, { modifiers: parser.modifiers })
            await int.interprate()
            return { content: JSON.stringify(int), status: StatusCode.RETURN }
        }, "Interprate args"),
    ]

    yield [
        "typeof", ccmdV2(async function({ args }) {
            let res = []
            let aliasV2s = getAliasesV2()
            let matches = getMatchCommands()
            let userMatches = common.getUserMatchCommands()
            let cmds = getCommands()
            for (let cmd of args) {
                if(fs.existsSync(`./src/bircle-bin/${cmd}.bircle`)){
                    res.push('.bircle')
                }
                else if (aliasV2s[cmd]) {
                    res.push("av2")
                }
                else if (matches[cmd]) {
                    res.push("match")
                }
                else if (userMatches.get(cmd)) {
                    res.push("user-match")
                }
                else if (cmds.get(cmd)) {
                    switch (cmds.get(cmd)?.cmd_std_version) {
                        case 1:
                            res.push("cmdv1")
                            break
                        case 2:
                            res.push("cmdv2")
                            break
                        default:
                            res.push("cmdv1")
                    }
                }
                else {
                    res.push("undefined")
                }
            }

            return { content: res.join(","), status: StatusCode.RETURN }
        }, "Gets the type of a command")
    ]

    yield [
        "is-alias", ccmdV2(async function({ args }) {
            let res = []
            for (let cmd of args) {
                if (getAliasesV2()[cmd]) {
                    res.push(true)
                }
                else {
                    res.push(false)
                }
            }
            return { content: res.join(","), status: StatusCode.RETURN }
        }, "Checks if a command is an alias"),
    ]

    yield [

        "option", createCommandV2(async ({ msg, args }) => {
            let [optname, ...value] = args
            if (!user_options.isValidOption(optname)) {
                return { content: `${optname} is not a valid option`, status: StatusCode.ERR }
            }
            if (value.length === 0) {
                user_options.unsetOpt(msg.author.id, optname)
                user_options.saveUserOptions()
                return { content: `<@${msg.author.id}> unset ${optname}`, status: StatusCode.RETURN }
            }
            else {
                let optVal = value.join(" ")
                user_options.setOpt(msg.author.id, optname, optVal)
                user_options.saveUserOptions()
                return { content: `<@${msg.author.id}> set ${optname}=${optVal}`, status: StatusCode.RETURN }
            }
        }, CAT,
            "Sets a user option",
            {
                option: createHelpArgument("The option to set", true),
                value: createHelpArgument("The value to set the option to, if not given, option will be unset", false)
            },
            null,
            null,
            (m) => !m.author.bot),
    ]

    yield [
        "UNSET", createCommandV2(async ({ msg, args }) => {
            let [user, optname] = args
            if (!user_options.isValidOption(optname)) {
                return { content: `${optname} is not a valid option`, status: StatusCode.ERR }
            }
            let member = await fetchUserFromClientOrGuild(user, msg.guild)
            if (!member)
                return { content: `${user} not found`, status: StatusCode.ERR }
            user_options.unsetOpt(member.id, optname)
            user_options.saveUserOptions()
            return { content: `<@${member.id}> unset ${optname}`, status: StatusCode.RETURN }

        }, CAT, "Lets me unset people's options :watching:", null, null, null, (m) => common.ADMINS.includes(m.author.id)),
    ]

    yield [
        "options", createCommandV2(async ({ msg, rawOpts: opts, args }) => {
            let user: string = msg.author.id
            if (opts['of']) {
                user = (await fetchUser(msg.guild as Guild, String(opts['of'])))?.id || msg.author.id
            }
            if (opts['l']) {
                let name = opts['l']
                if (name && name !== true) {
                    return { content: user_options.getOpt(user, name as any, "__unset__"), status: StatusCode.RETURN }
                }
                return { content: user_options.allowedOptions.join("\n"), status: StatusCode.RETURN }
            }
            if (opts['h']) {
                let requestedNames = opts['h'] as string | true | undefined ?? args.join(" ")
                if (requestedNames === true) {
                    requestedNames = args.join(" ")
                }
                requestedNames ||= user_options.allowedOptions.join(" ")
                let text = []
                for (let n of requestedNames.split(" ")) {
                    if (!user_options.userOptionsInfo[n]) {
                        console.warn(`${n} no info`)
                    }
                    text.push(`${n}: ${htmlRenderer.renderHTML(user_options.userOptionsInfo[n] ?? "")}`)

                }
                return { content: text.join("\n--------------------\n"), status: StatusCode.RETURN }
            }
            if (opts['i'] || opts['import']) {
                let att = msg.attachments.at(0)
                if (!att) {
                    return crv("No json attachment", { status: StatusCode.ERR })
                }
                let res = await fetch(att.url)
                let data
                try {
                    data = await res.json()
                }
                catch (err) {
                    return crv("Could not read json file", { status: StatusCode.ERR })
                }
                if (!data) return crv('Could not read json file', { status: StatusCode.ERR })
                user_options.getUserOptions()[msg.author.id] = data
                return crv(`Loaded: ${JSON.stringify(data)}`, { status: StatusCode.RETURN })
            }
            let userOpts = user_options.getUserOptions()[user]
            if (opts['e'] || opts['export']) {
                return {
                    content: JSON.stringify(userOpts),
                    status: StatusCode.RETURN
                }
            }
            let optionToCheck = args.join(" ").toLowerCase()
            let validOpt = user_options.isValidOption(optionToCheck)
            if (validOpt) {
                return { content: `**${optionToCheck}**\n${user_options.getOpt(user, validOpt, "\\_\\_unset\\_\\_")}`, status: StatusCode.RETURN, do_change_cmd_user_expansion: false }
            }
            let text = ""
            for (let opt of user_options.allowedOptions) {
                text += `**${opt}**\n${userOpts?.[opt] ?? "\\_\\_unset\\_\\_"}\n--------------------\n`
            }
            return { content: text, status: StatusCode.RETURN }
        }, CAT, "Prints the options for [option, and your values for them",
            {
                "option": createHelpArgument("The option to check the value of", false)
            }, {
            l: createHelpOption("List the options and values, if a value is given, get the value of that option"),
            h: createHelpOption("List the options, and give help for them<br>if args are given, give help for those opts"),
            e: createHelpOption("Export options", ['export']),
            i: createHelpOption("Import options", ['import'])
        }),
    ]

    yield [
        'get-source',
        {
            run: async (_msg, _, sendCallback, opts, args) => {

                let commands = getCommands()
                if (opts['of-file']) {
                    let file = opts['of-file']
                    if (fs.existsSync(`./${file}.ts`)) {

                        return {
                            files: [
                                {
                                    attachment: `./${file}.ts`,
                                    delete: false,
                                    name: `${file}.ts`,
                                }
                            ],
                            status: StatusCode.RETURN,
                            mimetype: "application/typescript"
                        }
                    }
                    return { content: `./${file}.ts not found`, status: StatusCode.ERR }
                }
                let cmd = args[0]

                if (!cmd) {
                    return { content: "No cmd  chosen", status: StatusCode.ERR }
                }

                if (fs.existsSync(`./src/bircle-bin/${cmd}.bircle`)) {
                    return crv(`\`\`\`bircle\n${fs.readFileSync(`./src/bircle-bin/${cmd}.bircle`, "utf-8")}\`\`\``, {
                        mimetype: 'application/bircle', onOver2kLimit: (_, rv) => {
                            rv.content = rv.content?.replace("```javascript\n", "")?.replace(/```$/, "")
                            return rv

                        }
                    })
                }

                let attrs = args.slice(1)
                if (attrs.length === 0) {
                    attrs.push("run")
                }

                let command = commands.get(cmd)
                if (!command)
                    return { content: "no command found", status: StatusCode.ERR }

                if(opts['ts']){
                    let category = command.category
                    
                    let data = fs.readFileSync(`./src/commands/${cmdCatToStr(category)}_commands.ts`, "utf-8")
                    const regex = new RegExp(`yield\\s+\\[\\s*"${cmd}",\\s*([\\s\\w\\W]+?)\\](?:\\s*yield\\s*\\[|\\s*\\}\\s*$)`)
                    return crv(`\`\`\`typescript\n${data.match(regex)?.[1]}\n\`\`\``, {
                        mimetype: 'application/typescript'
                    })
                }

                let results = []
                let curAttr = command
                for (let attr of attrs) {
                    for (let subAttr of attr.split(".")) {
                        curAttr = curAttr[subAttr as Exclude<keyof Command | keyof CommandV2, "argShape">]
                        if (curAttr === undefined) break;
                    }

                    if (curAttr !== undefined) {
                        if (typeof curAttr === 'object') {
                            results.push(JSON.stringify(curAttr))
                        }
                        else {
                            results.push(String(curAttr))
                        }
                    }
                }

                return {
                    content: `\`\`\`javascript\n${results.join("\n")}\n\`\`\``, status: StatusCode.RETURN, mimetype: "application/javascript", onOver2kLimit: (_, rv) => {
                        rv.content = rv.content?.replace(/```(?:type|java)script\n/, "")?.replace(/```$/, "")
                        return rv
                    }
                }
            }, category: CAT,
            help: {
                info: "Get the source code of a file, or a command",
                arguments: {
                    command: {
                        description: "The command to get the source code  of",
                        required: true
                    },
                    "...attributes": {
                        description: "Get attributes of a command"
                    }
                },
                options: {
                    'ts': createHelpOption("Return the uncompiled typescript code"),
                    'of-file': {
                        description: "If command is not given, use this to get the source of a file"
                    }
                }
            }
        },
    ]

    yield ["code-info", ccmdV2(async ({opts}) => {
        let info;
        if(opts.getBool("a", false))
            info = execSync("wc -l $(git ls-files | grep -v 'assets/' | grep -v 'changelog/' | grep -v 'wiki/')").toString("utf-8")
        else
            info = execSync('wc -l $(git ls-files | grep "ts$")').toString("utf-8")
        return { content: info, status: StatusCode.RETURN }
    }, "Gets lines of code for each file", {
        helpOptions: {
            a: createHelpOption("Get the lines of code for each file even non-.ts files")
        }
    })]

    yield ["pet-inventory", createCommandV2(async () => {
        return {
            files: [
                {
                    attachment: "./petinventory.json",
                    name: "Pet inventory.json",
                    delete: false
                }
            ], status: StatusCode.RETURN
        }
    }, CAT)]

    yield [
        "economy",
        {
            run: async (_msg, _args, sendCallback) => {
                return {
                    files: [
                        {
                            attachment: `economy.json`,
                            name: `economy.json`,
                            description: "This is the economy",
                            delete: false
                        }
                    ],
                    status: StatusCode.RETURN
                }
            },
            category: CAT,
            help: {
                info: "Get the database economy.json file"
            }
        },
    ]

    yield [
        "inventory.json",
        {
            run: async (_msg, _args, sendCallback) => {
                return {
                    files: [
                        {
                            attachment: `inventory.json`,
                            name: "Inventory.json",
                            description: "Everyone's inventory",
                            delete: false
                        }
                    ],
                    status: StatusCode.RETURN
                }
            }, category: CAT,
            help: {
                info: "Sends the raw inventory.json database file"
            }
        },
    ]

    yield [
        "del-var",
        {
            run: async (msg, args, sendCallback, opts) => {
                let prefix = String(opts['prefix'] || "__global__")
                if (opts['u']) {
                    prefix = msg.author.id
                }
                let names = args
                let delPrefix = opts['p'] ? true : false
                let deleted = []
                for (let name of names) {
                    if (delPrefix && !name.startsWith("!")) {
                        if (vars.delPrefix(name, msg.author.id)) {
                            deleted.push(name)
                        }
                    }
                    else if (!delPrefix) {
                        if (vars.delVar(`${prefix}:${name}`, msg.author.id, false)) {
                            deleted.push(name)
                        }
                    }
                }
                return { content: `Deleted: \`${deleted.join(", ")}\``, status: StatusCode.RETURN }
            }, category: CAT,
            help: {
                info: "Delete a variable",
                arguments: {
                    "variables...": {
                        description: "Delete each variable seperatted by a space",
                        required: true
                    }
                },
                options: {
                    u: {
                        description: "Delete a user variable"
                    },
                    p: createHelpOption("Delete a prefix instead of a var"),
                    prefix: {
                        description: "Delete  a variable from the specified prefix"
                    }
                }
            }
        },
    ]

    yield [
        "savev",
        {
            run: async (_msg, _args, sendCallback) => {
                vars.saveVars()
                return { content: "Variables saved", status: StatusCode.RETURN }
            }, category: CAT,
            help: {
                info: "Save all variables"
            }
        },
    ]

    yield [
        "cmd-search", ccmdV2(async function({ args, opts }) {
            let search = args.join(" ")
            let commands = { ...Object.fromEntries(getCommands().entries()), }

            let top = opts.getNumber("top", 10)

            let mainTopCount = top / 2
            let infoTopCount = top / 2

            if (opts.getBool("ei", opts.getBool("exclude-info", false))) {
                mainTopCount = top
                infoTopCount = 0
            }
            else if (opts.getBool("in", opts.getBool("include-names", false))) {
                mainTopCount = 0
                infoTopCount = top
            }

            let allResults: [string, number][] = []

            if (mainTopCount > 0) {
                let results = searchList(search, Object.keys(commands))
                let sortedResults = Object.entries(results).filter(v => v[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, mainTopCount)
                allResults = sortedResults
            }

            if (infoTopCount > 0) {
                let infos = Object.entries(commands).map(v => `${v[0]}\n${v[1].help?.info || ""}`)
                let infoResults = searchList(search, infos)
                let sortedInfoResults = Object.entries(infoResults).filter(v => v[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, infoTopCount)
                allResults = allResults.concat(sortedInfoResults)
            }

            if (!allResults.length) {
                return crv("No results", { status: StatusCode.ERR })
            }
            return crv(allResults.reduce((p, cur) => `${p}\n--------------------\n${htmlRenderer.renderHTML(cur[0])} (${cur[1]})`, ""), { status: StatusCode.RETURN })
        }, "Search for commands with a search query", {
            helpOptions: {
                top: createHelpOption("Show for the top <code>n</code> results", undefined, "10"),
                ei: createHelpOption("Exclude searching for cmd info", ["exclude-info"], "true"),
                in: createHelpOption("Include searching just cmd names", ["include-names"], "false")
            },
            helpArguments: {
                "...search": createHelpArgument("Search query", true)
            }
        })
    ]

    yield [
        "dwiki", createCommandV2(async ({ args }) => {
            if (fs.existsSync(`./wiki/${args.join(" ")}.txt`)) {
                fs.rmSync(`./wiki/${args.join(" ")}.txt`)
                return { content: `removed: ${args.join(" ")}`, status: StatusCode.RETURN }
            }
            return { content: `${args.join(" ")} not found`, status: StatusCode.ERR }
        }, CAT, undefined, null, null, null, (m) => common.ADMINS.includes(m.author.id)),
    ]

    yield [
        "api", createCommandV2(async ({ msg, args, opts }) => {
            if (opts.getBool('l', false)) {
                let text = ""
                for (let fn in API.APICmds) {
                    let requirements = API.APICmds[fn].requirements
                    let optional = API.APICmds[fn].optional
                    text += `${fn}: `
                    if (optional) {
                        requirements = requirements.filter(v => !optional?.includes(v))
                    }
                    text += `${requirements.join(", ")} `
                    if (optional) {
                        text += `${optional.map(v => `[${v}]`).join(", ")}`
                    }
                    text += `\n--------------------\n`
                }
                return { content: text, status: StatusCode.RETURN }
            }

            let fn = args.join(" ")
            if (!Object.keys(API.APICmds).includes(fn)) {
                return { content: `${fn} is not a valid  api function\nrun \`${common.prefix}api -l\` to see api commands`, status: StatusCode.ERR }
            }
            let apiFn = API.APICmds[fn]
            let argsForFn: { [key: string]: any } = {}
            for (let i of opts.keys()) {
                if (!apiFn.requirements.includes(i))
                    continue;
                else {
                    argsForFn[i] = await API.handleApiArgumentType(msg, i, String(opts.getDefault(i, undefined)))
                }
            }
            let missing = []
            for (let req of apiFn.requirements.filter(v => !(apiFn.optional || []).includes(v))) {
                if (argsForFn[req] === undefined) {
                    missing.push(req)
                }
            }
            if (missing.length) {
                return { content: `You are missing the following options: ${missing.join(", ")}`, status: StatusCode.ERR }
            }
            if (apiFn.extra) {
                let extraArgs: { [key: string]: any } = {}
                for (let arg of apiFn.extra) {
                    if (arg === "msg") {
                        extraArgs[arg] = msg
                    }
                }
                return { content: String(await apiFn.exec({ ...extraArgs, ...argsForFn })), status: StatusCode.RETURN }
            }
            return { content: String(await apiFn.exec(argsForFn)), status: StatusCode.RETURN }

        }, CAT, "Run low level bot commands<br>To see a list of api commands run <code>api -l</code>", {
            command: createHelpArgument("The command to run", true),
        }, {
            "<opt>": createHelpOption("Each command will require different options")

        })
    ]

    yield [
        "del", createCommandV2(async ({ msg, args, recursionCount: rec, commandBans: bans, opts, sendCallback }) => {
            if (!opts.getBool("N", false)) return { noSend: true, delete: true, status: StatusCode.RETURN }
            await cmd({ msg, command_excluding_prefix: args.join(" "), recursion: rec + 1, disable: bans, sendCallback })
            return { noSend: true, delete: true, status: StatusCode.RETURN }
        }, CAT, "delete your message", {
            "...text": createHelpArgument("text"),
        }, {
            N: createHelpOption("Treat text as a command")
        })
    ]

    yield [
        "analyze-cmd", createCommandV2(async ({ msg, sendCallback: sc, rawOpts: opts, args, recursionCount: rec, commandBans: bans }) => {
            let results = []

            let text = args.join(" ").trim()
            let command = parseBracketPair(text, "()")

            text = text.slice(command.length + 2)

            let rv = (await cmd({ msg, command_excluding_prefix: command, recursion: rec + 1, returnJson: true, disable: bans, sendCallback: sc })).rv
            for (let line of text.split("\n")) {
                line = line.trim()
                if (!line) continue
                let val: any = rv;
                let props = line.split(/\s+/)
                for (let i = 0; i < props.length; i++) {
                    let prop = props[i]
                    switch (prop) {
                        case "==": {
                            let test_eq = props[++i]
                            val = val == test_eq
                            break
                        }
                        case "!=": {
                            let test_ne = props[++i]
                            val = val != test_ne
                        }
                        default: {
                            val = val?.[prop]
                        }
                    }
                }
                results.push(val)
            }
            if (opts['index']) {
                return { content: JSON.stringify(results[Number(opts['index'])]) || "null", status: StatusCode.RETURN }
            }
            return { content: results.map(v => String(JSON.stringify(v))).join(";\n") + ";", status: StatusCode.RETURN }
        }, CAT, "Gets specific properties from the return value of a command", {
            "( command )": createHelpArgument("The command to run in ()", true),
            "...property [[<!=|==> <value>] | ...subproperties]": createHelpArgument(`each property should be on it's own line.<br>On each line you may add == or != &lt;value&gt;<br>You may also get subproperties for example: <code>content length</code>`)
        }),
    ]

    yield [
        "for", createCommandV2(async ({ msg, args, recursionCount, commandBans, sendCallback }) => {
            const var_name = args[0]
            const range = args[1]
            let [startS, endS] = range.split("..")
            let [start, end] = [Number(startS), Number(endS)]
            const scriptWithBraces = args.slice(2).join(" ").trim()
            const scriptWithoutBraces = parseBracketPair(scriptWithBraces, "{}")
            if (isNaN(start)) {
                start = 0
            }
            if (isNaN(end)) {
                end = start + 1
            }
            let scriptLines = scriptWithoutBraces.split(";\n").map(v => v.trim()).filter(v => v)
            let id = Math.floor(Math.random() * 100000000)
            globals.SPAMS[id] = true
            outer: for (let i = start; i < end; i++) {
                vars.setVarEasy(`%:${var_name}`, String(i), msg.author.id)
                for (let line of scriptLines) {
                    await cmd({ msg, command_excluding_prefix: line, recursion: recursionCount + 1, disable: commandBans, sendCallback })
                    await new Promise(res => setTimeout(res, 1000))
                    if (!globals.SPAMS[id]) {
                        break outer
                    }
                }
                //this is here in case no lines of code should be run, and ]stop is run
                if (!globals.SPAMS[id]) {
                    break outer
                }
            }
            delete globals.SPAMS[id]
            return { noSend: true, status: StatusCode.RETURN }
        }, CAT, "A for loop", {
            name: createHelpArgument("A variable name<br>can be used like any other bot variable in the commands", true),
            "x..y": createHelpArgument("x is the start, y is the end", true),
            "{ commands }": createHelpArgument("The commands to run in {}, seperated by ; and a blank line", true)
        })
    ]

    yield [
        "switch", ccmdV2(async function({ args, msg, commandBans, recursionCount, sendCallback }) {
            args.beginIter()
            let switchOn = args.expectString(1)
            if (switchOn === BADVALUE) {
                return { content: "No text to switch on", status: StatusCode.ERR }
            }
            let text = args.expectString(truthy)
            if (text === BADVALUE) {
                return { content: "No cases", status: StatusCode.ERR }
            }

            let switchBlock = parseBracketPair(text, "{}")

            let cases = []

            let curCaseText = ""
            let justParsedBlock = false
            for (let i = 0; i < switchBlock.length; i++) {
                if (justParsedBlock && " \t\n".includes(switchBlock[i])) {
                    continue;
                }
                else if (switchBlock[i] === "{") {
                    let block = parseBracketPair(switchBlock, '{}', i + 1)
                    cases.push([curCaseText.trim(), block.trim()])
                    i += block.length + 2
                    curCaseText = ""
                    justParsedBlock = true
                }
                else {
                    justParsedBlock = false
                }
                curCaseText += switchBlock[i]
            }
            for (let caseBlock of cases) {
                let regex;
                try {
                    regex = new RegExp(caseBlock[0])
                }
                catch (err) {
                    await handleSending(msg, { content: `${caseBlock[0]} is not a valid regex, skipping case`, status: StatusCode.WARNING })
                }
                let shouldContinueTesting = true;
                if ((regex as RegExp).test(switchOn)) {
                    for (let line of caseBlock[1].split(";\n")) {
                        line = line.trim()
                        if (line === "}") break;
                        if (line === "&&") {
                            shouldContinueTesting = true;
                            continue;
                        }
                        else {
                            shouldContinueTesting = false;
                        }
                        await cmd({ msg, command_excluding_prefix: line, recursion: recursionCount + 1, disable: commandBans, sendCallback })
                    }
                }
                if (!shouldContinueTesting) {
                    break
                }
            }
            return { noSend: true, status: 0 }

        }, "Does different things depending on what the initial argument is", {
            helpArguments: {
                "value": createHelpArgument("The value to switch on", true),
                "{": createHelpArgument("Start the block of cases", true),
                "...cases": createHelpArgument("the case is a regular expression followed by a block of commands seperated by <code>;&lt;newline&gt;</code>, surrounded by {}<br>if the last command is &&, it will continue testing the cases", true),
                "}": createHelpArgument("End the block of cases", true),
            }
        })
    ]

    yield [
        "[", ccmdV2(async function({ args, opts, sendCallback, commandBans, recursionCount, msg }) {
            if (args.indexOf("]") < 0) {
                return { content: `You must end the check with ]`, status: StatusCode.ERR }
            }

            let testText = args.slice(0, args.indexOf("]"))

            let commandToRun = parseBracketPair(args.slice(args.indexOf("]")).join(" "), "{}").trim()
            let elseCommand = ""
            if (args.lastIndexOf("else") > 0) {
                elseCommand = parseBracketPair(args.slice(args.lastIndexOf("else")).join(" "), "{}").trim()
            }

            async function handleBranch(command: string, code: StatusCode) {
                if (command)
                    return (await cmd({ msg, command_excluding_prefix: command, sendCallback, returnJson: true, disable: commandBans, recursion: recursionCount + 1 })).rv as CommandReturn
                return { content: code === StatusCode.RETURN ? "true" : "false", status: code }

            }

            const handleTruthiness = async () => await handleBranch(commandToRun, StatusCode.RETURN)
            const handleFalsiness = async () => await handleBranch(elseCommand, StatusCode.ERR)

            if (opts.getBool('c', false)) {
                if (getCommands().get(args[0]) || getMatchCommands()[args[0]]) {
                    return await handleTruthiness()
                }
                else {
                    return await handleFalsiness()
                }
            }

            else if (opts.getBool("a", false)) {
                return getAliasesV2()[args[0]] ? await handleTruthiness() : await handleFalsiness()
            }

            else if (opts.getBool("u", false)) {
                return (await fetchUserFromClient(common.client, args[0])) ? await handleTruthiness() : await handleFalsiness()
            }

            else if (opts.getBool("U", false)) {
                if (!msg.guild) {
                    return await handleFalsiness()
                }
                return await fetchUser(msg.guild, args[0]) ? await handleTruthiness() : await handleFalsiness()
            }

            else if (opts.getBool("n", false)) {
                return testText.length ? handleTruthiness() : handleFalsiness()
            }

            else if (opts.getBool("z", false)) {
                return testText.join(" ") ? handleFalsiness() : handleTruthiness()
            }

            else {
                let [v1, op, v2] = args
                return (() => {
                    switch (op) {
                        case "=": case "==":
                            return v1 === v2

                        case "starts-with": case "sw": case "^=":
                            return v1.startsWith(v2)

                        case "ends-with": case "ew": case "$=":
                            return v1.endsWith(v2)

                        case "includes": case "in": case "*=":
                            return v2.includes(v1)

                        case "<":
                            return Number(v1) < Number(v2)
                        case ">":
                            return Number(v1) > Number(v2)
                        case "<=":
                            return Number(v1) <= Number(v2)
                        case ">=":
                            return Number(v1) >= Number(v2)

                        default: {
                            return false;
                        }
                    }
                })() ? await handleTruthiness() : handleFalsiness()
            }

        }, "Similar to if-cmd however it does not need to run a command", {
            helpOptions: {
                c: createHelpOption("Test if the first argument is a command"),
                a: createHelpOption("Test if the first argument is an alias"),
                u: createHelpOption("Test if first argument is a user in bot's cache"),
                U: createHelpOption("Test if first argument is a user"),
                n: createHelpOption("Test if there is text"),
                z: createHelpOption("Test if there is not text")
            },
            helpArguments: {
                "value 1": createHelpArgument("The first value", true),
                operation: createHelpArgument("The operation<br><lh>Operations</lh><ul><li>==: check if the values are equal</li><li>^=: Check if value 1 starts with value 2</li><li>$=: check if value 1 ends with value 2</li><li>*=: check if value 1 includes value2</li><li>&lt;: check if value 1 is less than value 2</li><li>&gt;: check if value 1 is greater than value 2</li><li>&le;: Check if value one is less or equal to value 2</li><li>&ge;: Check if value 1 is greater or equal to value 2</li>", false),
                "value 2": createHelpArgument("The second value", false),
                "]": createHelpArgument("A literal ]", true),
                "{ command }": createHelpArgument("Command to run if check is true", false),
                "else { command }": createHelpArgument("Command to run if check is false", false)
            }
        })
    ]

    yield [
        "if-cmd", createCommandV2(async ({ msg, args, recursionCount: rec, commandBans: bans }) => {

            async function runIf(c: string, operator: string, value: string) {
                let rv = (await cmd({ msg, command_excluding_prefix: c, recursion: rec + 1, returnJson: true, disable: bans })).rv as CommandReturn
                let isTrue = false
                switch (operator) {
                    case "==": {
                        isTrue = rv.content === value
                        break
                    }
                    case "!=": {
                        isTrue = rv.content !== value
                        break
                    }
                    case "<": {
                        if (!rv.content)
                            isTrue = false
                        else
                            isTrue = parseFloat(rv.content) < parseFloat(value)
                        break
                    }
                    case ">": {
                        if (!rv.content)
                            isTrue = false
                        else
                            isTrue = parseFloat(rv.content) > parseFloat(value)
                        break
                    }
                    case "<=": {
                        if (!rv.content)
                            isTrue = false
                        else
                            isTrue = parseFloat(rv.content) <= parseFloat(value)
                        break
                    }
                    case ">=": {
                        if (!rv.content)
                            isTrue = false
                        else
                            isTrue = parseFloat(rv.content) >= parseFloat(value)
                        break
                    }
                    case "*=":
                    case "includes": {
                        isTrue = Boolean(rv.content?.includes(value))
                        break
                    }
                    case "=~":
                    case ":": {
                        try {
                            isTrue = !!rv.content?.match(value)
                        }
                        catch (err) {
                            isTrue = false
                        }
                        break
                    }
                    case "^=":
                    case "starts-with":
                    case "sw": {
                        isTrue = rv.content?.startsWith(value) ?? false
                        break
                    }
                    case "$=":
                    case "ends-with":
                    case "ew": {
                        isTrue = rv.content?.endsWith(value) ?? false
                        break
                    }
                }
                return isTrue
            }

            let text = args.join(" ")

            let cmdToCheck = parseBracketPair(text, "()")
            text = text.slice(cmdToCheck.length + 2)

            let operator = parseBracketPair(text, "  ")
            text = text.slice(operator.length + 2)

            let value = parseBracketPair(text, "()")
            text = text.slice(value.length + 2)

            let isTrue = await runIf(cmdToCheck, operator, value)

            let trueBlock = parseBracketPair(text, "{}")
            text = text.slice(text.indexOf("{") + trueBlock.length).trim().slice(2).trim()

            let elifBlocks: { cmd: string, operator: string, value: string, block: string }[] = []

            while (text.startsWith("elif")) {
                text = text.slice('elif'.length)

                let cmd = parseBracketPair(text, "()")
                text = text.slice(cmd.length + 2)

                let operator = parseBracketPair(text, "  ")
                text = text.slice(operator.length + 2)

                let value = parseBracketPair(text, "()")
                text = text.slice(value.length + 2)

                let block = parseBracketPair(text, "{}")
                text = text.slice(text.indexOf("{") + block.length).trim().slice(2).trim()

                elifBlocks.push({ cmd, operator, value, block })
            }

            //optional else
            let falseBlock = ""
            if (text.startsWith("else")) {
                text = text.slice("else".length)
                falseBlock = parseBracketPair(text, "{}")
                text = text.slice(text.indexOf("{") + falseBlock.length).trim().slice(2).trim()
            }


            if (isTrue) {


                for (let line of trueBlock.split(";\n")) {
                    line = line.trim()
                    if (!line || line.startsWith("}")) continue
                    await cmd({ msg, command_excluding_prefix: line, recursion: rec + 1, disable: bans })
                }
                return { noSend: true, status: StatusCode.RETURN }
            }
            else {
                let foundElse = false
                for (let elif of elifBlocks) {
                    if (await runIf(elif.cmd, elif.operator, elif.value)) {
                        if (!elif.block.trim() || elif.block.trim().startsWith("}")) continue
                        await cmd({ msg, command_excluding_prefix: elif.block.trim(), recursion: rec + 1, disable: bans })
                        foundElse = true
                        break;
                    }
                }
                if (!foundElse) {
                    for (let line of falseBlock.split(";\n")) {
                        line = line.trim()
                        if (!line || line.startsWith("}")) continue
                        await cmd({ msg, command_excluding_prefix: line, recursion: rec + 1, disable: bans })
                    }
                }
                return { noSend: true, status: StatusCode.RETURN }
            }
        }, CAT,
            "Compares the result of a command a value",
            {
                "(command)": createHelpArgument("The command to run surrounded by ()", true),
                "comparator": createHelpArgument(`The comparison operator<br><b>valid operators</b>
<ul>
<li><b>==</b>: exact equality</li>
<li><b>!=</b>: not equal</li>
<li><b>&lt;</b>: less than</li>
<li><b>&gt;</b>: greater than</li>
<li><b>&lt;=</b>: less than or equal</li>
<li><b>&gt;=</b>: greater than or equal</li>
<li><b>*=</b>: result includes value</li>
<li><b>includes</b>: result includes value</li>
<li><b>=~</b>: do a regex match with value in result</li>
<li><b>:</b>: do a regex match with value in result</li>
<li><b>^=</b>: result starts with value</li>
<li><b>starts-with</b>: result starts with value</li>
<li><b>sw</b>: result starts with value</li>
<li><b>$=</b>: result ends with value</li>
<li><b>ends-with</b>: result ends with value</li>
<li><b>ew</b>: result ends with value</li>
</ul>
`, true),
                "(value)": createHelpArgument("The value to compare against surrounded by ()", true)
            }),
    ]

    yield [
        "if",
        {
            run: async (msg, args, sendCallback, opts, deopedArgs, recursion_count, command_bans) => {
                let [condition, cmdToCheck] = args.join(" ").split(";")
                if (!cmdToCheck) {
                    return { content: "You are missing a ; after the condition", status: StatusCode.ERR }
                }
                cmdToCheck = cmdToCheck.split(";end")[0]
                let success;
                if (condition.trim().startsWith(`(${common.prefix}`)) {
                    let command_to_run = ""
                    let check = ""
                    let expected = ""
                    let parenCount = 1

                    let end_of_command = 0;
                    let end_of_check = 0;

                    for (let i = condition.indexOf("(") + 1; i < condition.length; i++) {
                        let ch = condition[i]
                        if (ch === "(") {
                            parenCount++;
                        }
                        else if (ch === ")") {
                            parenCount--;
                        }
                        if (parenCount === 0) {
                            end_of_command = i + 1;
                            break;
                        }
                        command_to_run += ch
                    }
                    for (let i = end_of_command; i < condition.length; i++) {
                        if (condition[i] === "(") {
                            end_of_check = i + 1;
                            break;
                        }
                        check += condition[i];
                    }
                    parenCount = 1;
                    for (let i = end_of_check; i < condition.length; i++) {
                        let ch = condition[i]
                        if (ch === "(") {
                            parenCount++;
                        }
                        else if (ch === ")") {
                            parenCount--;
                        }
                        if (parenCount === 0) {
                            end_of_command = i + 1;
                            break;
                        }
                        expected += ch;
                    }
                    let content = getContentFromResult((await cmd({ msg, command_excluding_prefix: command_to_run.slice(common.prefix.length), recursion: recursion_count + 1, returnJson: true, disable: command_bans })).rv as CommandReturn).trim()
                    expected = expected.trim()
                    switch (check.trim().toLowerCase()) {
                        case "==": {
                            success = content === expected;
                            break;
                        }
                        case ">": {
                            success = Number(content) > Number(expected);
                            break;
                        }
                        case "f>": {
                            success = parseFloat(content) > parseFloat(expected);
                            break;
                        }
                        case "i>": {
                            success = parseInt(content) > parseInt(expected);
                            break;
                        }
                        case "<": {
                            success = Number(content) < Number(expected);
                            break;
                        }
                        case "f<": {
                            success = parseFloat(content) < parseFloat(expected);
                            break;
                        }
                        case "i<": {
                            success = parseInt(content) < parseInt(expected);
                            break;
                        }
                        case ">=": {
                            success = Number(content) >= Number(expected);
                            break;
                        }
                        case "f>=": {
                            success = parseFloat(content) >= parseFloat(expected);
                            break;
                        }
                        case "i>=": {
                            success = parseInt(content) >= parseInt(expected);
                            break;
                        }
                        case "<=": {
                            success = Number(content) <= Number(expected);
                            break;
                        }
                        case "f<=": {
                            success = parseFloat(content) <= parseFloat(expected);
                            break;
                        }
                        case "i<=": {
                            success = parseInt(content) <= parseInt(expected);
                            break;
                        }
                        case ":": {
                            try {
                                success = !!content.match(expected);
                            }
                            catch (err) {
                                success = false;
                            }
                            break;
                        }
                        case "includes": {
                            success = content.includes(expected)
                            break;
                        }
                    }
                }
                if ((success !== undefined && success) || (success === undefined && safeEval(condition, { ...generateSafeEvalContextFromMessage(msg), args: args, lastCommand: lastCommand[msg.author.id] }, { timeout: 3000 }))) {
                    return (await cmd({ msg, command_excluding_prefix: cmdToCheck.trim(), recursion: recursion_count + 1, returnJson: true, disable: command_bans })).rv as CommandReturn
                }
                let elseCmd = args.join(" ").split(`${common.prefix}else;`).slice(1).join(`${common.prefix}else;`)?.trim()
                if (elseCmd) {
                    return (await cmd({ msg, command_excluding_prefix: elseCmd.trim(), recursion: recursion_count, returnJson: true, disable: command_bans })).rv as CommandReturn
                }
                return { content: "?", status: StatusCode.ERR }
            },
            category: CAT,
            help: {
                info: "Evaluate bircle commands conditionally!<br>There are 2 versions of the if statement<ul><li><b>1</b>: standard javascript expression</li><li><b>2</b>:([bircle-command) &lt;operator&gt; (value)</ul><br><b>For the 2nd version</b>, the first set of parentheses indicate a command to run, the operator may be one of the standard comparison operators<br>In addition, the <code>:</code> operator may be used to check if the result of the commands includes the regex expression provided in  the second set of parentheses.<br>Lastly, the <code>includes</code> operator may be used to check if the expected value is in the result of the command.<br>After the condition must be a ;<br><br>after the ; must be  a command  to run followed by <code>;end</code><br>lastly <code>[else;</code> &lt;command&gt; may optionally be added on a new line<br>If  the condition is false and an <code[else;</code> is not provided a ? will be sent",
            }
        },
    ]

    yield [
        "getimg", ccmdV2(async ({ msg, opts, args, stdin }) => {
            let pop = opts.getBool("pop", false)
            let img = getImgFromMsgAndOpts(opts, msg, stdin, pop)
            return { content: String(img), status: StatusCode.RETURN }

        }, "find the link to the image that would be used if you gave the same options to an image command", {
            helpOptions: {
                img: createHelpOption("The link to use"),
                pop: createHelpOption("If given, remove the attachment from message, or stdin wherver the image was gotten from")
            }
        })
    ]

    yield [
        "argc",
        {
            run: async (_msg, args) => {
                return { content: String(args.length), status: StatusCode.RETURN }
            },
            help: {
                info: "Prints the number of arguments given to this command"
            },
            category: CAT
        },
    ]

    yield [
        "argv", createCommandV2(async ({ rawArgs: args }) => {
            return { content: args.map((v, i) => `**${i}**: ${v}`).join("\n"), status: StatusCode.RETURN }
        }, CAT, "prints the argvalues")
    ]

    yield [
        "$argc", createCommandV2(async ({ args }) => {
            return { content: String(args.length), status: StatusCode.RETURN }
        }, CAT, "Prints the number of arguments excluding opts")
    ]

    yield [
        "$argv", createCommandV2(async ({ args }) => {
            return { content: args.map((v, i) => `**${i}**: ${v}`).join("\n"), status: StatusCode.RETURN }
        }, CAT, "prints the argvalues, exccluding opts")
    ]

    yield [
        "opts",
        {
            run: async (_msg, _args, _sendCallback, opts) => {
                let disp = ""
                for (let key in opts) {
                    disp += `**${key}**: \`${opts[key]}\`\n`
                }
                return { content: disp || "#!N/A", status: StatusCode.RETURN }
            },
            help: {
                info: "Print the opts given"
            },
            category: CAT
        },
    ]

    yield [
        "variablize", createCommandV2(async ({ msg, args }) => {
            let reqVars = args
            let str = reqVars.map(v => {
                if (v.startsWith("\\")) {
                    return v.slice(1)
                }
                return vars.getVar(msg, v)
            }).join(" ")
            return { content: str, status: StatusCode.RETURN }
        }, CAT, "Each arg in the arguments is treated as a string, unless it starts with \\"),
    ]

    yield [
        "uptime",
        {
            run: async (_msg: Message, args: ArgumentList) => {
                let uptime = common.client.uptime
                if (!uptime) {
                    return {
                        content: "No uptime found",
                        status: StatusCode.ERR
                    }
                }
                let fmt = args[0] || "%d:%h:%m:%s.%M"
                let days, hours, minutes, seconds, millis;
                seconds = Math.floor(uptime / 1000)
                millis = String(uptime / 1000).split(".")[1]
                days = 0
                hours = 0
                minutes = 0
                while (seconds >= 60) {
                    seconds -= 60
                    minutes += 1
                }
                while (minutes >= 60) {
                    minutes -= 60
                    hours += 1
                }
                while (hours >= 24) {
                    hours -= 24
                    days += 1
                }
                return {
                    content: format(fmt, { "d": `${days}`, "h": `${hours}`, "m": `${minutes}`, "s": `${seconds}`, "M": `${millis}` }),
                    status: StatusCode.RETURN
                }
            },
            help: {
                "info": "gives up time of the bot",
                arguments: {
                    fmt: {
                        "description": "the format to show the uptime in<br>%s: seconds, %m: minutes, %h: hours, %d: days<br>{s}: seconds, {m}: minutes, {h}: hours, {d}: days"
                    }
                }
            },
            category: CAT
        },
    ]

    yield [
        "create-file",
        {
            run: async (_msg, args) => {
                let file = args[0]
                if (!file) {
                    return { content: "No file specified", status: StatusCode.ERR }
                }
                if (!isSafeFilePath(file)) {
                    return { content: `cannot create a file called ${file}`, status: StatusCode.ERR }
                }
                fs.writeFileSync(`./command-results/${file}`, "")
                return { content: `${file} created`, status: StatusCode.RETURN }
            },
            category: CAT,
            help: {
                info: "Create a database file"
            }
        },
    ]

    yield [
        "remove-file",
        {
            run: async (msg, args, sendCallback) => {
                let file = args[0]
                if (!file) {
                    return { content: "No file specified", status: StatusCode.ERR }
                }
                if (!fs.existsSync(`./command-results/${file}`)) {
                    return { content: `${file} does not exist`, status: StatusCode.ERR }
                }
                fs.rmSync(`./command-results/${file}`)
                return { content: `${file} removed`, status: StatusCode.RETURN }
            }, category: CAT,
            permCheck: m => common.ADMINS.includes(m.author.id),
            help: {
                info: "Remove a database file"
            }
        },
    ]

    yield [
        "rand-line", createCommandV2(async ({ args, stdin }) => {
            let text;
            if (args[0]) {
                let file = args[0]
                if (!isSafeFilePath(file)) {
                    return { content: "<:Watching1:697677860336304178>", status: StatusCode.ERR }
                }
                if (!fs.existsSync(`./command-results/${file}`)) {
                    return {
                        content: "file does not exist",
                        status: StatusCode.ERR
                    }
                }
                text = fs.readFileSync(`./command-results/${file}`, "utf-8")
            }
            else if (stdin) {
                text = getContentFromResult(stdin as CommandReturn, "\n")
            }
            else {
                return { content: "No file specified, and no pipe", status: StatusCode.ERR }
            }
            const lines = text.split("\n").map((str) => str.split(": ").slice(1).join(": ").replace(/;END$/, "")).filter((v) => v)
            return { content: choice(lines), status: StatusCode.RETURN }

        }, CAT, "Get a random line from a file or pipe")
    ]

    yield [
        "l-bl",
        {
            run: async (_msg: Message, _args: ArgumentList, sendCallback) => {
                return {
                    content: fs.readFileSync("command-perms/blacklists", "utf-8"),
                    status: StatusCode.RETURN
                }
            },
            category: CAT,
            help: {
                info: "List all blacklists"
            }

        },
    ]

    yield [
        "l-wl",
        {
            run: async (_msg: Message, _args: ArgumentList, sendCallback) => {
                return {
                    content: fs.readFileSync("command-perms/whitelists", "utf-8"),
                    status: StatusCode.RETURN
                }
            },
            category: CAT,
            help: {
                info: "List all whitelists"
            }
        },
    ]

    yield [
        "timeit", ccmdV2(async function({ msg, args, sendCallback, recursionCount: rec, commandBans: bans, opts }) {

            let returnJson = opts.getBool("no-chat", false)

            let start = performance.now()
            await cmd({ msg, command_excluding_prefix: args.join(" ").trim(), recursion: rec + 1, disable: bans, sendCallback, returnJson })
            return { content: `${performance.now() - start}ms`, status: StatusCode.RETURN }
        }, "Time how long a command takes", {
            helpArguments: {
                "...command": createHelpArgument("The command to run", true)
            }, helpOptions: {
                "no-chat": createHelpOption("Exclude the time it takes to send result to chat")
            }
        })
    ]

    yield [
        "do",
        {
            run: async (msg: Message, args: ArgumentList, sendCallback, opts, deopedArgs, recursion, bans) => {
                if (recursion >= globals.RECURSION_LIMIT) {
                    return { content: "Cannot start do after reaching the recursion limit", status: StatusCode.ERR }
                }
                let times = parseInt(args[0])
                if (times) {
                    args.splice(0, 1)
                } else {
                    times = 10
                }
                let cmdArgs = args.join(" ").trim()
                if (cmdArgs == "") {
                    cmdArgs = String(times)
                }
                let totalTimes = times
                let id = String(Math.floor(Math.random() * 100000000))
                await handleSending(msg, { content: `starting ${id}`, status: StatusCode.INFO }, sendCallback)
                let cmdToDo = cmdArgs.split(" ")[0]
                if (['run', 'do', 'spam'].includes(cmdToDo)) {
                    return { content: "Cannot run do, spam, or run", status: StatusCode.ERR }
                }
                globals.SPAMS[id] = true
                while (globals.SPAMS[id] && times--) {
                    await cmd({ msg, command_excluding_prefix: format(cmdArgs, { "number": String(totalTimes - times), "rnumber": String(times + 1) }), recursion: globals.RECURSION_LIMIT, disable: bans, sendCallback })
                    await new Promise(res => setTimeout(res, Math.random() * 1000 + 200))
                }
                delete globals.SPAMS[id]
                return {
                    content: "done",
                    status: StatusCode.INFO
                }
            },
            category: CAT,
            help: {
                info: "Run a command a certain number of times",
                arguments: {
                    count: createHelpArgument("The number of times to run the command", false),
                    "...command": createHelpArgument("The rest of the arguments are the command to run", true)
                }
            }
        },
    ]

    yield [
        "spam", createCommandV2(async ({ msg, args, opts, sendCallback }) => {
            let times = parseInt(args[0])
            if (times) {
                args.splice(0, 1)
            } else times = 10
            let send = args.join(" ").trim()
            if (send == "") {
                send = String(times)
                times = 10
            }
            let totalTimes = times
            let id = String(Math.floor(Math.random() * 100000000))
            await handleSending(msg, { content: `starting ${id}`, status: StatusCode.INFO }, sendCallback)
            globals.SPAMS[id] = true
            let delay: number | null = (opts.getNumber("delay", null) ?? 1) * 1000
            if (delay < 700 || delay > 0x7FFFFFFF) {
                delay = null
            }
            while (globals.SPAMS[id] && times--) {
                await handleSending(msg, { content: format(send, { "count": String(totalTimes - times), "rcount": String(times + 1) }), status: StatusCode.RETURN }, sendCallback)
                await new Promise(res => setTimeout(res, delay ?? Math.random() * 700 + 200))
            }
            delete globals.SPAMS[id]
            return {
                content: "done",
                status: StatusCode.INFO
            }

        }, CAT, "Spam some text", {
            count: createHelpArgument("The amount of times to spam", false),
            "...text": createHelpArgument("The text to send", true)
        }, {
            delay: createHelpOption("The tiem to wait between each send")
        })
    ]

    yield [
        "stop", ccmdV2(async function({msg, args}){
                if (!Object.hasEnumerableKeys(globals.SPAMS)) {
                    return { content: "no spams to stop", status: StatusCode.ERR }
                }

                globals.SPAM_ALLOWED = false;

                if (!args.length) {
                    for (let spam in globals.SPAMS) {
                        delete globals.SPAMS[spam]
                    }
                    return {
                        content: "stopping all",
                        status: StatusCode.RETURN
                    }
                }

                let invalidSpams = []
                let clearedSpams = []
                for (let arg of args) {
                    let spamNo = Number(args)
                    if (!isNaN(spamNo) && globals.SPAMS[arg]) {
                        clearedSpams.push(arg)
                        delete globals.SPAMS[arg]
                    }
                    else invalidSpams.push(arg)
                }
                let finalText = ""
                if (invalidSpams.length) {
                    finalText += `Failed to stop the following spams:\n${invalidSpams.join(", ")}\n`
                }
                if (clearedSpams.length) {
                    finalText += `Stopped the following spams:\n${clearedSpams.join(", ")}\n`
                }

                return {
                    content: finalText,
                    status: StatusCode.RETURN
                }

        }, "Stop spams", {
            helpArguments: {
                "...spams": createHelpArgument("The spams to stop<br>IF not given, will stop all spams", false)
            }
        })
    ]

    yield [
        "match-cmd", ccmdV2(async function({ msg, args }) {
            if (msg.author.bot) {
                return { content: `I dont like match commands dont force me to use them 😩`, status: StatusCode.ERR }
            }
            let name = args[0]
            let searchRegex = args[1]
            let run = args.slice(2).join(" ")
            if (!name) {
                return { content: `No name given`, status: StatusCode.RETURN }
            }
            if (!searchRegex) {
                return { content: "No search regex given", status: StatusCode.RETURN }
            }
            if (!run) {
                return { content: "Does not run anything", status: StatusCode.RETURN }
            }

            name = `user-match:${name}`

            let r: RegExp;
            try {
                r = new RegExp(searchRegex)
            }
            catch (err) {
                return { content: `Failed to turn ${searchRegex} into a regex`, status: StatusCode.RETURN }
            }

            common.addUserMatchCommand(msg.author.id, name, r, run)

            common.saveMatchCommands()

            return { content: `Created match command that searches for ${searchRegex}`, status: StatusCode.RETURN }
        }, "Create a user match command", {
            helpArguments: {
                name: createHelpArgument("Name of the command", true),
                match: createHelpArgument("The regex to match against", true),
                "...run": createHelpArgument("The command to run<br>{match$x} where $x is a number will be replaced with the capture group that it corresponds to, eg: {match1} will be replaced with the first capture group", true)
            }
        })
    ]

    yield [
        "list-match-cmds", ccmdV2(async function({ msg, args }) {
            let user: User | undefined = msg.author
            if (args[0]) {
                user = await fetchUserFromClient(common.client, args[0])
            }
            let userCmds = common.getUserMatchCommands().get(user?.id || msg.author.id)
            if (!userCmds?.size) {
                return { content: "You have no match cmds", status: StatusCode.RETURN }
            }
            return {
                content: Array.from(userCmds.entries()).map(([name, [search, run]]) => `**${name}**:\n\`${search}\`\n\`${run}\``).join("\n"),
                status: StatusCode.RETURN
            }
        }, "List Your match commands")
    ]

    yield [
        "remove-match-cmd", ccmdV2(async function({ msg, args }) {
            if (!isMsgChannel(msg.channel)) return { noSend: true, status: StatusCode.ERR }
            let name = args[0]
            let userCmds = common.getUserMatchCommands().get(msg.author.id)
            if (!userCmds) {
                return { content: "No command", status: StatusCode.RETURN }
            }
            if (!name) {
                await handleSending(msg, { content: `Type the number to remove\n${Array.from(userCmds.entries()).map(([name, _], i) => `**${i + 1}**: ${name}`).join("\n")}`, status: StatusCode.PROMPT })
                let msgs = await msg.channel.awaitMessages({ time: 30000, filter: m => m.author.id === msg.author.id && !isNaN(Number(m.content)), max: 1 })
                let m = msgs.at(0)
                if (!m) {
                    return { content: "Did not respond", status: StatusCode.ERR }
                }

                let name = Array.from(userCmds.entries()).filter((_, i) => i + 1 === Number(m?.content))[0][0]
                common.removeUserMatchCommand(msg.author.id, name)
                common.saveMatchCommands()
                return { content: `Successfully removed: ${name}`, status: StatusCode.RETURN }
            }
            else {
                name = `user-match:${name}`
                if (userCmds.get(name)) {
                    common.removeUserMatchCommand(msg.author.id, name)
                    common.saveMatchCommands()
                    return { content: `Successfully removed: ${name}`, status: StatusCode.RETURN }
                }
            }
            return { content: `Could not remove: ${name}`, status: StatusCode.ERR }
        }, "Removes a user match command")
    ]

    yield [
        "vars", createCommandV2(async ({ args, opts }) => {
            if (opts.getBool("p", false)) {
                return { content: Object.keys(vars.vars).join("\n"), status: StatusCode.RETURN }
            }
            let inPrefix = args[0] ?? ""
            let rv = Object.entries(vars.vars).filter(([prefix, _data]) => inPrefix ? inPrefix === prefix : true).map(([prefix, varData]) => {
                return `**${prefix.replaceAll("_", "\\_")}**:\n` +
                    Object.keys(varData)
                        .map(v => `${v.replaceAll("_", "\\_")}`)
                        .join("\n") +
                    "\n-------------------------"
            }).join("\n")
            return { content: rv, status: StatusCode.RETURN }

        }, CAT, "List all variables", {
            prefix: createHelpArgument("The name of the prefix to look at", false)
        }, {
            p: createHelpArgument("List all the prefixes")
        })
    ]

    yield [
        "run",
        {
            run: async (msg: Message, args, sendCallback, opts, _2, recursion, bans) => {
                if (recursion >= globals.RECURSION_LIMIT) {
                    return { content: "Cannot run after reaching the recursion limit", status: StatusCode.ERR }
                }
                let file = msg.attachments.at(0)
                let text;
                if (!file) {
                    text = args.join(" ").replaceAll("```", "").split(";EOL")
                }
                else {
                    let k = msg.attachments.keyAt(0) as string
                    msg.attachments.delete(k)
                    let data = await fetch(file.url)
                    text = await data.text()
                    let bluecHeader = "%bluecircle37%\n"
                    if (text.slice(0, bluecHeader.length) !== bluecHeader) {
                        return { content: "Does not appear to be a bluec script", status: StatusCode.ERR }
                    }
                    text = text.slice(bluecHeader.length).split("[;")
                }
                if (!text) {
                    return { content: "No script", status: StatusCode.ERR }
                }
                let id = Math.floor(Math.random() * 10000000)
                globals.SPAMS[id] = true
                if (opts['s']) {
                    await handleSending(msg, { content: `Starting id: ${id}`, status: StatusCode.INFO }, sendCallback)
                }
                function handleRunFn(fn: string, contents: string) {
                    switch (fn) {
                        case "RUN_FN_VAR": {
                            return `\\v{${parseRunLine(contents)}}`
                        }
                        case "RUN_FN_DOFIRST": {
                            return `$(${parseRunLine(contents)})`
                        }
                        case "RUN_FN_FMT": {
                            return `{${parseRunLine(contents)}}`
                        }
                        default: {
                            return contents
                        }
                    }
                }
                function parseRunLine(line: string): string {
                    let text = ""
                    let currFn = ""
                    let prefix = "RUN_FN_"
                    for (let i = 0; i < line.length; i++) {
                        let ch = line[i]
                        if (ch == "(" && currFn.startsWith(prefix)) {
                            let parenCount = 1
                            let fnContents = ""
                            for (i++; i < line.length; i++) {
                                ch = line[i]
                                if (ch == "(") {
                                    parenCount++;
                                }
                                else if (ch == ")") {
                                    parenCount--;
                                }
                                if (parenCount == 0)
                                    break;
                                fnContents += ch
                            }
                            text += handleRunFn(currFn, fnContents)
                            currFn = ""
                        }
                        else if ("ABCDEFGHIJKLMNOPQRSTUVWXYZ_".includes(ch)) {
                            currFn += ch
                        }
                        else {
                            text += currFn + ch
                            currFn = ""
                        }
                    }
                    if (currFn) {
                        text += currFn
                    }
                    return text
                }
                for (let line of text) {
                    if (!globals.SPAMS[id])
                        break
                    line = line.trim()
                    if (line.startsWith(common.prefix)) {
                        line = line.slice(common.prefix.length)
                    }
                    await cmd({ msg, command_excluding_prefix: parseRunLine(line), recursion: recursion + 1, disable: bans, sendCallback })
                }
                delete globals.SPAMS[id]
                return { noSend: true, status: StatusCode.INFO }
            }, category: CAT,
            help: {
                info: "Runs bluec scripts. If running from a file, the top line of the file must be %bluecircle37%"
            }
        },
    ]

    yield [
        "silent", ccmdV2(async function({ args, msg, recursionCount, commandBans }) {
            await cmd({ msg, command_excluding_prefix: args.join(" "), recursion: recursionCount, returnJson: true, disable: commandBans, sendCallback: async () => msg })
            return { noSend: true, status: StatusCode.RETURN }
        }, "Run a command silently")
    ]

    yield [
        "var",
        {
            run: async (msg: Message, _, sendCallback, opts, args) => {
                let [name, ...value] = args.join(" ").split("=").map(v => v.trim())
                if (!value.length) {
                    return { content: "no value given, syntax `[var x=value", status: StatusCode.ERR }
                }
                let realVal: string | number = value.join("=")
                let [prefix, realName] = name.split(":")
                if (prefix && realName && prefix.startsWith("!")) {
                    return { content: `prefix cannot start with !`, status: StatusCode.ERR }
                }
                else if (!realName) {
                    realName = prefix
                    prefix = "__global__"
                }
                let type = String(opts['type'] || "string")
                if (type === 'function') {
                    return crv("Cannot create functions", { status: StatusCode.ERR })
                }
                if (!Object.keys(vars.VarType).includes(type)) {
                    return crv("Not a valid type", { status: StatusCode.ERR })
                }

                if (type === 'number') {
                    realVal = Number(realVal)
                }

                if (opts['u']) {
                    if (prefix !== '__global__') {
                        return crv("Invalid prefix", { status: StatusCode.ERR })
                    }
                    vars.createVar(type as VarType, `${msg.author.id}:${name}`, realVal)
                    if (!opts['silent'])
                        return {
                            content: vars.getVar(msg, `${msg.author.id}:${name}`),
                            status: StatusCode.RETURN
                        }
                }
                else {
                    vars.createVar(type as VarType, `${prefix}:${realName}`, realVal, msg.author.id)
                    if (!opts['silent'])
                        return {
                            content: vars.getVar(msg, name),
                            status: StatusCode.RETURN
                        }
                }
                return { noSend: true, status: StatusCode.RETURN }
            },
            help: {
                info: "Creates a variable",
                options: {
                    u: createHelpOption("Create a user variable")
                },
                arguments: {
                    "[prefix:]name=value": {
                        description: "name is the variable name, value is the value<br>prefix is optional, and can be anything that does not start with !<br>the <code>%</code> prefix will also create a user variable.",
                        required: true
                    }
                }
            },
            category: CAT
        },
    ]

    yield [
        "remove",
        {
            run: async (msg: Message, args: ArgumentList, sendCallback) => {
                if (!isMsgChannel(msg.channel)) return { noSend: true, status: StatusCode.ERR }
                const file = common.FILE_SHORTCUTS[args[0] as keyof typeof common.FILE_SHORTCUTS] || args[0]

                if (!file) {
                    return {
                        content: "Nothing given to add to",
                        status: StatusCode.ERR
                    }
                }

                if (!isSafeFilePath(file)) {
                    return {
                        content: "invalid file",
                        status: StatusCode.ERR
                    }
                }

                if (!fs.existsSync(`./command-results/${file}`)) {
                    return {
                        content: "file does not exist",
                        status: StatusCode.ERR
                    }
                }

                let data = fs.readFileSync(`./command-results/${file}`, "utf-8").split(";END")
                let users_data = data.map(v => v.split(":").map(v => v.trim()))
                if (!users_data[0][0]?.match(/\d{18}/)) {
                    return { content: "Not a database file", status: StatusCode.ERR }
                }
                //gets a list of indecies of the items that the user can remove
                let allowedIndicies = data.map(val => val.split(":")).map(v => v[0].trim()).map((v, i) => {
                    return v.trim() === msg.author.id || common.ADMINS.includes(msg.author.id) ? i : undefined
                }).filter(v => v !== undefined)

                let options = data.map((value, i) => [i, value] as const).filter(v => allowedIndicies.includes(v[0]))

                handleSending(msg, { content: options.map(v => `${v[0] + 1}: ${v[1].replace(/^\n/, "")}`).join("\n"), status: StatusCode.INFO }, sendCallback)

                await handleSending(msg, { content: "Say the number of the items you want to remove", status: StatusCode.PROMPT })
                let msgs = await msg.channel.awaitMessages({ filter: m => m.author.id === msg.author.id && !isNaN(Number(m.content)), time: 30000, max: 1 })
                let responseMessage = msgs.at(0)
                if (!responseMessage) {
                    return { content: "Timeout", status: StatusCode.ERR }
                }
                let removedList = []
                for (let numStr of responseMessage.content.split(" ")) {
                    let num = parseInt(numStr)
                    if (isNaN(num)) {
                        await handleSending(msg, { content: `${num} is not a valid number`, status: StatusCode.ERR }, sendCallback)
                        continue;
                    }

                    if (!allowedIndicies.includes(num - 1)) {
                        await handleSending(msg, { content: `You do not have permissions to remove ${num}`, status: StatusCode.ERR }, sendCallback)
                        continue;
                    }

                    let removal = data[num - 1]
                    if (!removal) {
                        await handleSending(msg, { content: `Not a valid index`, status: StatusCode.ERR }, sendCallback)
                        continue;
                    }
                    removedList.push(removal)
                    delete data[num - 1]
                }

                data = data.filter(v => typeof v != 'undefined')

                fs.writeFileSync(`command-results/${file}`, data.join(";END"))

                if (removedList.length)
                    return { content: `removed ${removedList.join("\n")} from file`, status: StatusCode.RETURN }
                return { content: "Nothing removed from file", status: StatusCode.RETURN }
            },
            help: {
                info: "Removes a line from a command file",
                arguments: {
                    file: {
                        description: "The command file to remove from",
                        required: true
                    }
                }
            },
            category: CAT
        },
    ]

    yield [
        "command-file", ccmdV2(async function({args, rawOpts: opts}){
                if (opts["l"]) {
                    return crv( `\`\`\`\n${fs.readdirSync("./command-results").join("\n")}\n\`\`\``)
                }
                const file = common.FILE_SHORTCUTS[args[0] as keyof typeof common.FILE_SHORTCUTS] || args[0]
                if (!isSafeFilePath(file)) {
                    return { content: "<:Watching1:697677860336304178>", status: StatusCode.ERR }
                }
                if (!fs.existsSync(`./command-results/${file}`)) {
                    return crv(`${file} does not exist`, {status: StatusCode.ERR})
                }
                return {
                    files: [
                        {
                            attachment: `./command-results/${file}`,
                            name: `${file}.txt`,
                            description: `data for ${file}`,
                            delete: false
                        }
                    ],
                    status: StatusCode.ERR
                }

        },  "Reads a command file", {
            helpArguments: {
                file: createHelpArgument("The file to see")
            },
            helpOptions: {
                l: createHelpOption("List all possible files")
            },
        })
    ]

    yield [
        'get-source()', ccmdV2(async function({ args, opts }) {
            if (opts.getBool("l", false)) {
                return { content: `modules:\`\`\`\nutil\ncommon_to_commands\nglobals\ncommon\neconomy\ntimer\npets\`\`\``, status: StatusCode.RETURN }
            }

            let data = {
                util: require("../util"),
                common_to_commands: require("../common_to_commands").default,
                globals: () => {
                    let data = require("../globals")
                    delete data['token']
                    return data
                },
                common: require("../common"),
                economy: require("../economy").default,
                timer: require("../timer").default,
                pets: require("../pets").default,
                amount_parser: require("../amount-parser").default
            }
            if (args[0].includes(".")) {
                args = new ArgList(args.join(" ").split("."))
            }
            let curObj = data
            for (let prop of args) {
                curObj = curObj?.[prop as keyof typeof curObj]
            }
            return {
                content: `\`\`\`javascript\n${String(curObj)}\n\`\`\``, status: StatusCode.RETURN, mimetype: "application/javascript", onOver2kLimit: (_, rv) => {
                    rv.content = rv.content?.replace("```javascript\n", "")?.replace(/```$/, "")
                    return rv
                }
            }
        }, "Stringifies an internal function", {
            helpOptions: {
                l: createHelpOption("List the different modules"),
            }
        })
    ]

    yield [
        'send-log',
        {
            run: async (_msg, args, sendCallback) => {
                if (!fs.existsSync(`./command-results/${args.join(" ").replaceAll(/\.\.+/g, ".")}`)) {
                    return { content: "File does not exist", status: StatusCode.ERR }
                }
                return { content: fs.readFileSync(`./command-results/${args.join(" ").replaceAll(/\.\.+/g, ".")}`, "utf-8"), status: StatusCode.RETURN }
            }, category: CAT,
            help: {
                info: "Send names of all log files"
            }
        },
    ]

    yield [
        "add",
        {
            run: async (msg: Message, args: ArgumentList, sendCallback) => {
                const file = common.FILE_SHORTCUTS[args[0] as keyof typeof common.FILE_SHORTCUTS] || args[0]
                if (!file) {
                    return {
                        content: "Nothing given to add to",
                        status: StatusCode.ERR
                    }
                }
                if (!isSafeFilePath(file)) {
                    return {
                        content: "invalid command",
                        status: StatusCode.ERR
                    }
                }
                if (!fs.existsSync(`./command-results/${file}`)) {
                    if (file === "wordle")
                        fs.writeFileSync(`./command-results/${file}`, "")
                    else return { content: `${file} does not exist`, status: StatusCode.ERR }
                }
                args = args.slice(1)
                const data = args?.join(" ")
                if (!data) {
                    return {
                        content: "No data given",
                        status: StatusCode.ERR
                    }
                }
                fs.appendFileSync(`./command-results/${file}`, `${msg.author.id}: ${data};END\n`)
                return {
                    content: `appended \`${data}\` to \`${file}\``,
                    status: StatusCode.RETURN
                }
            },
            help: {
                info: "Adds a line to a command file",
                arguments: {
                    "file": {
                        description: "The command file list to add to",
                        required: true
                    },
                    "data": {
                        description: "The text to add to the file",
                        required: true,
                        requires: "file"
                    }
                }
            },
            category: CAT
        },
    ]

    yield ["alias-type", createCommandV2(async ({ args }) => {
        if (getAliasesV2()[args[0]]) {
            return { content: "V2", status: StatusCode.RETURN }
        }
        return { content: "None", status: StatusCode.ERR }

    }, CAT, "Gets the type of an alias")]

    yield ["cmd-chain", createCommandV2(async ({ msg, args, opts, rawArgs, sendCallback, recursionCount, commandBans }) => {
        let v2 = getAliasesV2()[args[0]]
        let showArgs = true
        if (opts.getBool("n", false) || opts.getBool("no-args", false)) {
            showArgs = false
        }
        let chain: string[] = [args[0]]
        if (!v2) {
            return { noSend: true, status: StatusCode.RETURN }
        }

        let simulatedOpts: Opts = {}

        let argList = args.slice(1)

        while (argList[0] === '-opt') {
            let nextArg = argList[1]
            let [key, value] = nextArg.split("=")
            simulatedOpts[key] = value ?? true
            argList = argList.slice(2)
        }

        let result = v2.expand(argList, simulatedOpts, (alias: any, preArgs: any) => {
            chain.push(showArgs ? preArgs : alias)
            return true
        }, !opts.getBool("F", false))

        if (!result) {
            return { content: "failed to expand alias", status: StatusCode.ERR }
        }
        for (let opt of Object.entries(opts)) {
            vars.delVar(`-${opt[0]}`, msg.author.id)
        }
        if (opts.getBool('e', false)) {
            //-1 because chain starts with the original alias
            return { content: String(chain.length - 1), status: StatusCode.RETURN }
        }
        if (opts.getBool("l", opts.getBool("last", false))) {
            return crv(chain[chain.length - 1])
        }
        let nth = opts.getDefault("i", false, v => !isNaN(Number(v)) ? Number(v) : undefined)
        if (nth !== false) {
            return crv(chain[nth - 1])
        }
        return { content: `${chain.join(" -> ")}`, status: StatusCode.RETURN }

    }, CAT, "Get the cmd chain of an alias", {
        alias: createHelpArgument("The alias to get the chain of", true),
        "-opt": createHelpArgument("Provide fake options<br>syntax: <code>-opt opt-name=value</code><br>Can be used as many times as necessary", false, "alias"),
        "...args": createHelpArgument("Fake args to give the alias", false, "alias")
    }, {
        e: createHelpOption("get the expansion count"),
        n: createHelpOption("put the names of the expanded commands only"),
        F: createHelpOption("Dont fill placeholders such as {args..}"),
        l: createHelpOption("Get the last expansion of the chain", ["last"]),
        i: createHelpOption("Get the ith expansion of the chain")
    })]

    yield ["rccmd", createCommandV2(async ({ msg, args, rawArgs, sendCallback, recursionCount, commandBans }) => {
        let cmdName = args[0]
        let aliasesV2 = getAliasesV2()
        if (aliasesV2[cmdName] && aliasesV2[cmdName].creator === msg.author.id) {
            delete aliasesV2[cmdName]
            fs.writeFileSync("./command-results/aliasV2", JSON.stringify(aliasesV2))
            getAliasesV2(true)
            return { content: `Removed: ${cmdName}`, status: StatusCode.RETURN }
        }
        if (!aliasesV2[cmdName]) {
            return { content: `${cmdName} does not exist`, status: StatusCode.ERR }
        }
        else {
            return { content: `You did not create ${cmdName}`, status: StatusCode.ERR }
        }
    }, CAT, "Removes an aliasv2", {
        name: createHelpArgument("The name of the command to remove", true)
    })]

    yield [
        "ht", {
            //help command
            run: async (msg, args, sendCallback, opts) => {
                let commands = getCommands()
                let files = []
                let commandsToUse = Object.fromEntries(commands.entries())
                if (args[0] && args[0] !== "?") {
                    commandsToUse = {}
                    for (let cmd of args) {
                        if (!commands.get(cmd)) continue
                        commandsToUse[cmd] = commands.get(cmd) as Command | CommandV2
                    }
                }
                if (opts['json']) {
                    return { content: JSON.stringify(commandsToUse), status: StatusCode.RETURN }
                }
                if (!Object.hasEnumerableKeys(commandsToUse)) {
                    return {
                        content: "No help can be given :(",
                        status: StatusCode.ERR
                    }
                }
                if (!fs.existsSync("help.html") || opts["n"] || args.length > 0) {
                    await handleSending(msg, { content: "Generating new help file", status: StatusCode.INFO }, sendCallback)
                    delete opts['n']
                    let styles = fs.readFileSync("help-styles.css")
                    let html = `<style>
${styles}
</style>`
                    for (let command in commandsToUse) {
                        html += generateHTMLFromCommandHelp(command, commands.get(command) as Command | CommandV2)
                    }
                    fs.writeFileSync("help.html", html)
                }
                if (opts["p"] || opts['t']) {
                    opts["plain"] = true
                }
                if (opts["m"]) {
                    opts["markdown"] = true
                }
                if (opts["h"] || opts["html"] || Object.keys(opts).length === 0) {
                    files.push({
                        attachment: "help.html",
                        name: "help.html",
                        description: "help",
                        delete: false
                    })
                    if (opts["h"])
                        delete opts["h"]
                    if (opts["html"])
                        delete opts["html"]
                }
                const exts = {
                    "plain": "txt",
                    "markdown": "md",
                    "man": "1",
                    "commonmark": "md"
                }
                for (let fmt in opts) {
                    if (fmt.length == 1) continue
                    if (!fmt.match(/^\w+$/)) continue
                    const ext = exts[fmt as keyof typeof exts] || fmt
                    try {
                        execSync(`pandoc -o output.${ext} -fhtml -t${fmt} help.html`)
                    }
                    catch (err) {
                        continue
                    }
                    files.push({
                        attachment: `output.${ext}`,
                        name: `help.${ext}`,
                        description: "help"
                    })
                }
                if (fs.existsSync(`output.txt`)) {
                    let content = fs.readFileSync("output.txt", "utf-8")
                    fs.rmSync('output.txt')
                    return {
                        content: `\`\`\`\n${content}\n\`\`\``,
                        status: StatusCode.RETURN
                    }
                }
                if (files.length > 0) {
                    return {
                        files: files,
                        status: StatusCode.RETURN
                    }
                }
                return {
                    content: "cannot send an empty file",
                    status: StatusCode.ERR
                }
            },
            help: {
                info: "A really funky help command",
                options: {
                    "json": {
                        description: "return the json of help"
                    },
                    "l": {
                        description: "List all commands<br>set this equal to a category to list commands in a specific category",
                    },
                    "p": {
                        "description": "give a plain text file intead of html"
                    },
                    "m": {
                        "description": "give a markdown file instead of html"
                    },
                    "n": {
                        "description": "forcefully generate a new help file"
                    },
                    "g": {
                        "description": "show the syntax of the bot"
                    },
                    "*": {
                        "description": "any format that pandoc allows, if you're curious, look up \"pandoc formats\""
                    }
                }
            },
            category: CAT,

        },
    ]

    yield [
        "list-garbage-files", ccmdV2(async () => {
            return crv(fs.readdirSync("./garbage-files").join("\n") || "\\_\\_empty\\_\\_")
        }, "List files that happened as result of command")
    ]

    yield [
        "WHITELIST",
        {
            run: async (msg: Message, args: ArgumentList, sendCallback) => {
                let user: string | undefined = args[0]
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
                let fetchedUser = (await fetchUserFromClientOrGuild(user, msg.guild))
                if (!fetchedUser) return crv(`${user} not found`, { status: StatusCode.ERR })
                if (addOrRemove == "a") {
                    common.addToPermList(common.WHITELIST, "whitelists", fetchedUser, cmds)

                    return {
                        content: `${user} has been whitelisted to use ${cmds.join(" ")}`,
                        status: StatusCode.RETURN
                    }
                } else {
                    common.removeFromPermList(common.WHITELIST, "whitelists", fetchedUser, cmds)
                    return {
                        content: `${user} has been removed from the whitelist of ${cmds.join(" ")}`,
                        status: StatusCode.RETURN
                    }
                }
            },
            permCheck: msg => {
                return common.ADMINS.includes(msg.author.id)
            },
            help: {
                info: "Whitelist, or unwhitelist a user from a command<br>syntax: [WHITELIST @user (a|r) cmd"
            },
            category: CAT
        },
    ]

    yield [
        "RESET_CMDUSE", ccmdV2(async function() {
            fs.writeFileSync("data/cmduse", "")
            globals.CMDUSE = globals.loadCmdUse()
            return { content: "cmd use reset", status: StatusCode.RETURN }
        }, "Resets cmduse", {
            permCheck: m => common.ADMINS.includes(m.author.id)
        })
    ]

    yield [
        "cmd-use",
        {
            run: async (_msg: Message, args: ArgumentList, sendCallback, opts) => {
                let data = globals.generateCmdUseFile()
                    .split("\n")
                    .map(v => v.split(":")) //map into 2d array, idx[0] = cmd, idx[1] = times used
                    .filter(v => v[0] && !isNaN(Number(v[1]))) // remove empty strings
                    .sort((a, b) => Number(a[1]) - Number(b[1])) // sort from least to greatest
                    .reverse() //sort from greatest to least
                    .map(v => `${v[0]}: ${v[1]}`) //turn back from 2d array into array of strings
                    .join(String(opts['s'] ?? "\n"))
                return {
                    content: data,
                    status: StatusCode.RETURN
                }
            },
            category: CAT,
            help: {
                info: "Gets a list of the most  used commands",
                options: {
                    s: createHelpOption("The seperator between commands", undefined, "\\n")
                }
            }
        },
    ]

    yield ["alias", createCommandV2(async ({ msg, args, opts }) => {

        let appendArgs = !opts.getBool("no-args", false)
        let appendOpts = !opts.getBool("no-opts", false)
        let standardizeOpts = !opts.getBool("no-standardize", false)

        let aliasV2s = getAliasesV2()

        if (opts.getBool("rename", false)) {
            let [oldAlias, newName] = args

            let alias = aliasV2s[oldAlias]
            if (!alias) {
                return crv(`${oldAlias} is not an aliasv2`, { status: StatusCode.ERR })
            }

            if (alias.creator !== msg.author.id) {
                return crv("You did not create this alias, and cannot rename it", { status: StatusCode.ERR })
            }

            aliasV2s[newName] = alias
            delete aliasV2s[oldAlias]
            return crv(`\`${oldAlias}\` has been renamed to \`${newName}\``)
        }

        if (!opts.getBool('no-easy', false)) {
            let [name, ...cmd] = args
            if (!name) {
                return { content: "No name given", status: StatusCode.RETURN }
            }

            if (getCommands().get(name) || aliasV2s[name] || fs.existsSync(`./src/bircle-bin/${name}.bircle`)) {
                return { content: `${name} already exists`, status: StatusCode.ERR }
            }
            let command = cmd.join(" ")
            const alias = new AliasV2(name, command, msg.author.id, { info: command }, appendArgs, appendOpts, standardizeOpts)
            aliasesV2[name] = alias
            fs.writeFileSync("./command-results/aliasV2", JSON.stringify(aliasesV2))
            getAliasesV2(true)
            return { content: `added: ${alias.toJsonString()}`, status: StatusCode.RETURN }
        }

        let name: string = ""

        let helpInfo: string = "";

        let tags: string[] = []

        const commandHelpOptions: CommandHelpOptions = {}
        const commandHelpArgs: CommandHelpArguments = {}

        let attrs = {
            "odesc": (name: string, value: string) => commandHelpOptions[name].description = value,
            "oalt": (name: string, value: string) => commandHelpOptions[name].alternates = value.split(","),
            "odefault": (name: string, value: string) => commandHelpOptions[name].default = value,
            "adesc": (name: string, value: string) => commandHelpArgs[name].description = value,
            "adefault": (name: string, value: string) => commandHelpArgs[name].default = value,
            "arequired": (name: string, value: string) => commandHelpArgs[name].required = value === "true" ? true : false
        } as const;

        let currentAction = ""
        let command: string = ""
        for (let line of args.join(" ").split("\n")) {
            if (currentAction === 'cmd') {
                command += `\n${line}`
                continue
            }
            let [action, ...textA] = line.split(" ")
            let text = textA.join(" ")
            switch (action) {
                case "name": {
                    name = text
                    if (getCommands().get(name) || getAliasesV2()[name] || fs.existsSync(`./src/bircle-bin/${name}.bircle`)) {
                        return { content: `${name} already exists`, status: StatusCode.ERR }
                    }
                    break
                }
                case "tag": {
                    tags.push(text)
                    break
                }
                case "tags": {
                    tags = tags.concat(text.split("|").map(v => v.trim()))
                    break;
                }
                case "command":
                case "cmd": {
                    currentAction = "cmd"
                    command += text;
                    break
                }
                case "help-info": {
                    helpInfo = text
                    break;
                }
                case "o":
                case "option":
                case "opt": {
                    let [optName, property, ...data] = text.split("|").map((v: string) => v.trim())
                    let propertyText = data.join("|")
                    if (property === 'description') property = 'desc';
                    if (attrs[`o${property}` as keyof typeof attrs]) {
                        if (!commandHelpOptions[optName]) {
                            commandHelpOptions[optName] = { description: "" }
                        }
                        attrs[`o${property}` as keyof typeof attrs](optName, propertyText)
                    }
                    break;
                }
                case 'a':
                case "argument":
                case "arg": {
                    let [argName, property, ...data] = text.split("|").map((v: string) => v.trim())
                    let propertyText = data.join("|")
                    if (property === 'description') property = 'desc';
                    if (attrs[`a${property}` as keyof typeof attrs]) {
                        if (!commandHelpArgs[argName]) {
                            commandHelpArgs[argName] = { description: "" }
                        }
                        attrs[`a${property}` as keyof typeof attrs](argName, propertyText)
                    }
                    break;

                }
                default: {
                    return {
                        content: `${action} is not a valid action`,
                        status: StatusCode.RETURN
                    }
                }
            }
        }

        if (!name) {
            return { content: "No name given", status: StatusCode.ERR }
        }

        const helpMetaData: CommandHelp = {}

        if (helpInfo) {
            helpMetaData.info = helpInfo
        }
        if (Object.keys(commandHelpOptions).length !== 0) {
            helpMetaData.options = commandHelpOptions
        }
        if (Object.keys(commandHelpArgs).length !== 0) {
            helpMetaData.arguments = commandHelpArgs
        }

        if (tags.length) {
            helpMetaData.tags = tags
        }

        const alias = new AliasV2(name, command, msg.author.id, helpMetaData, appendArgs, appendOpts, standardizeOpts)

        if (getAliasesV2()[name]) {
            return { content: `Failed to add ${name} it already exists as an aliasv2`, status: StatusCode.ERR }
        }
        else if (getCommands().get(name)) {
            return { content: `Failed to add "${name}", it is a builtin`, status: StatusCode.ERR }
        }

        aliasesV2[name] = alias
        fs.writeFileSync("./command-results/aliasV2", JSON.stringify(aliasesV2))
        getAliasesV2(true)
        return { content: `added: ${alias.toJsonString()}`, status: StatusCode.RETURN }
    }, CAT, "<b>There are 2 Modes</b><ul><li>default: How alias has always worked &lt;name&gt; &lt;command&gt;</li><li>no-easy: use the -no-easy option enable this</li></ul><br>Create an aliasv2<br>By default, the user arguments will be appended to the end of exec<br>To access an option in the exec, use \${%:-option-name}, for args use \${%:\\_\\_arg[&lt;i&gt;]}<br>raw args are also accessable with \\_\\_rawarg instead of \\_\\_arg.<br>To access all args, use \${%:\\_\\_arg[...]}<br><br><b>THE REST ONLY APPLIES TO no-easy MODE</b><br>Each argument should be on its own line", {
        "name": createHelpArgument("<code>name</code> followed by the alias name", true),
        "help-info": createHelpArgument("<code>help-info</code> followed by some help information for the command", false),
        "tag": createHelpArgument("<code>tag</code> followed by a tag for the command", false),
        "tags": createHelpArgument("<code>tags</code> followed by tags for the command seperated by |", false),
        "option": createHelpArgument("<code>option</code> followed by the name of the option, followed by a |, then <code>desc|alt|default</code>, followed by another | and lastly the text<br>if desc is chosen, text is a description of the option<br>if alt is chosen, text is a comma separated list of options that do the same thing<br>if default is chosen, text is the default if option is not given.", false),
        "argument": createHelpArgument("<code>argument</code> followed by the name of the option, followed by a |, then <code>desc|required|default</code>, followed by another | and lastly the text<br>if desc is chosen, text is a description of the argument<br>if required is chosen, text is true/false<br>if default is chosen, text is the default if argument is not given.", false),
        "cmd": createHelpArgument("<code>cmd</code> followed by the command to run <b>THIS SHOULD BE LAST</b>", true),
    }, {
        "rename": createHelpOption("Rename an aliasv2 (the first argument is the alias to rename) (the second argument is the new name)"),
        "no-args": createHelpOption("Do not append user arguments to the end of exec (does not requre -no-easy)", undefined, "false"),
        "no-opts": createHelpOption("Do not append user opts to the end of exec (does not require -no-easy)", undefined, "false"),
        "no-easy": createHelpOption("Use the full argument list instead of [aliasv2 &lt;name&gt; &lt;command&gt;"),
        "no-standardize": createHelpOption("Do not standardize the options, IFS, pipe-symbol, and 1-arg-string", undefined, "false")
    })]

    yield ["process", createCommandV2(async ({ args }) => {
        let fmt = args.join(" ")
        if (!fmt) {
            let embed = new EmbedBuilder()
            embed.setTitle(process.argv0)
            embed.addFields([
                { name: "Args", value: process.argv.join(" "), inline: true },
                { name: "Arch", value: process.arch, inline: false },
                { name: "PID", value: String(process.pid), inline: false },
                { name: "Platform", value: process.platform, inline: false },
                { name: "Heap memory (MiB)", value: String(process.memoryUsage().heapTotal / 1024 / 1024), inline: false }
            ])
            return { embeds: [embed], status: StatusCode.RETURN }
        } else return { content: formatPercentStr(fmt, { a: process.argv.join(" "), A: process.arch, p: String(process.pid), P: process.platform, H: String(process.memoryUsage().heapTotal / 1024 / 1024) }), status: StatusCode.RETURN }
    }, CAT, "Gets info about the process")]

    yield [
        "!!",
        {
            run: async (msg: Message, args: ArgumentList, sendCallback, opts, __, rec, bans) => {
                if (opts['check'] || opts['print'] || opts['see'])
                    return { content: `\`${lastCommand[msg.author.id]}\``, status: StatusCode.RETURN }
                if (!lastCommand[msg.author.id]) {
                    return { content: "You ignorance species, there have not been any commands run.", status: StatusCode.ERR }
                }
                msg.content = lastCommand[msg.author.id]
                return (await cmd({ msg, command_excluding_prefix: lastCommand[msg.author.id].slice(user_options.getOpt(msg.author.id, "prefix", common.prefix).length), recursion: rec + 1, returnJson: true, disable: bans, sendCallback })).rv as CommandReturn
            },
            help: {
                info: "Run the last command that was run",
                options: {
                    see: {
                        description: "Just echo the last command that was run instead of running it"
                    }
                }
            },
            category: CAT
        },
    ]

    yield ["ping", ccmdV2(async ({ msg }) => crv(`${(new Date()).getMilliseconds() - msg.createdAt.getMilliseconds()}ms`), "Gets the bot's ping (very accurate)")]

    yield ["cmd-metadata", createCommandV2(async ({ args, opts }) => {
        let cmds = { ...Object.fromEntries(getCommands().entries()), ...getAliasesV2() }
        let cmdObjs: [string, (Command | CommandV2 | AliasV2)][] = Array.from<string, [string, (Command | CommandV2 | AliasV2)]>(args, (arg) => [arg, cmds[arg] as Command | CommandV2 | AliasV2]).filter(v => v[1])
        if (opts.getBool("raw", false)) {
            return {
                content: Array.from(cmdObjs, ([name, cmd]) => `\\["${name}", ${JSON.stringify(cmd)}]`).join("\n"),
                status: StatusCode.RETURN
            }
        }
        let fmt: string = opts.getString("f", opts.getString("fmt", "%i"))
        let av2fmt: string = opts.getString("fa", opts.getString("fmt-alias", "%i"))
        return {
            content: Array.from(cmdObjs, ([name, cmd]) =>
                cmd instanceof AliasV2 ?
                    formatPercentStr(av2fmt, { i: `${name}\nversion: alias\nhelp info: ${cmd.help?.info ? cmd.help.info : "unknown"}`, n: name, h: cmd.help?.info ? cmd.help.info : "unknown" })
                    :
                    formatPercentStr(fmt, {
                        i:
                            `${name}
version: ${cmd.cmd_std_version ? cmd.cmd_std_version : "unknown"}
use cache: ${cmd.use_result_cache ? true : false}
help info: ${cmd.help?.info ? cmd.help.info : "unknown"}
category: ${cmdCatToStr(cmd.category)}
types: ${cmd.make_bot_type ? "true" : "false"}
options: ${cmd.help?.options ? Object.keys(cmd.help.options).join(", ") : ""}
aruments: ${cmd.help?.arguments ? Object.keys(cmd.help.arguments).join(", ") : ""}`,
                        n: name,
                        v: cmd.cmd_std_version ? String(cmd.cmd_std_version) : "unknown",
                        h: cmd.help?.info ? cmd.help.info : "unknown",
                        c: String(cmdCatToStr(cmd.category)),
                        C: String(cmd.use_result_cache ? true : false),
                        t: cmd.make_bot_type ? "true" : "false",
                        o: cmd.help?.options ? Object.keys(cmd.help.options).join(", ") : "",
                        a: cmd.help?.arguments ? Object.keys(cmd.help.arguments).join(", ") : ""
                    })
            ).join("\n-------------------------\n"), status: StatusCode.RETURN
        }
    }, CAT, "Get metadata about a commadn", { "...cmd": createHelpArgument("The command(s) to get metadata on", true) }, {
        f: createHelpOption("Format specifier<br><lh>Formats:</lh><ul><li>n: name of command</li><li>v: cmd version</li><li>h: help info</li><li>c: category</li><li>t: types in chat</li><li>o: available options</li><li>a: available args</li></ul>", ["fmt"]),
        "fa": createHelpOption("Format specifier for aliases<br><lh>Formats:</lh><ul><li>n: name of command</li><li>h: help info</li></ul>", ["fmt-alias"])
    }, undefined, undefined, false, true)]

    yield [
        "version", createCommandV2(async ({ args, opts }) => {
            if (opts.getBool("l", false)) {
                return { content: fs.readdirSync('changelog').map(v => v.replace(/\.md/, "")).join("\n"), status: StatusCode.RETURN }
            }
            let fmt = args[0] || "%v"
            let { major, minor, bug, part, alpha, beta } = common.VERSION
            let mainDisplay = (() => {
                let d = `${major}.${minor}.${bug}`
                if (part)
                    d += `.${part}`
                if (alpha)
                    d = `A.${d}`
                if (beta)
                    d = `B.${d}`
                return d
            })()
            return {
                content: format(fmt, {
                    v: mainDisplay,
                    M: String(major),
                    m: String(minor),
                    b: String(bug),
                    p: part,
                    A: String(alpha),
                    B: String(beta)
                }),
                status: StatusCode.RETURN
            }

        }, CAT, "Says the version<br>formats:<br><ul><li>v: full version</li><li>M: major</li><li>m: minor</li><li>b: bug</li><li>A: alpha</li><li>B: beta</li></ul>", { fmt: createHelpArgument("The format", false) },)
    ]

    yield [
        "changelog",
        {
            run: async (_msg, args, _sendCallback, opts) => {
                if(opts['l']){
                    const tags = execSync("git tag --sort=committerdate | grep ^v")
                    return crv(tags.toString("utf-8"))
                }
                let [start, stop] = args
                const version_regex = /(HEAD|v\d+\.\d+\.\d+)/;
                const mostRecentVersion = execSync("git tag --sort=committerdate | tail -n1").toString("utf-8").trim()
                const lastVersion = execSync("git tag --sort=committerdate | tail -n2 | sed 1q").toString("utf-8").trim()
                if(start === undefined){
                    start = lastVersion
                    stop = mostRecentVersion
                }
                else if(stop === undefined){
                    return crv("If start is given, stop must also be given")
                }
                if(!version_regex.test(start) || !version_regex.test(stop)){
                    return crv(`invalid start/stop version`)
                }
                const changelog = execSync(`git log ${start}..${stop} --format=format:$(gen-chlog -f) | gen-chlog`).toString("utf-8")
                return crv(`\`\`\`\n${changelog}\n\`\`\``)
            },
            help: {
                info: "Get changelog for a version",
                options: {
                    l: {
                        description: "Show all versions"
                    }
                },
                arguments: {
                    start: {
                        description: "Starting version",
                        required: false,
                        requires: "end"
                    }, end: {
                        description: "Ending version",
                        required: false
                    }
                }
            },
            category: CAT,
            use_result_cache: true
        },
    ]

    yield [
        "spams", createCommandV2(async function() {
            return { content: Object.keys(globals.SPAMS).join("\n") || "No spams", status: StatusCode.RETURN }
        }, CAT, "List the ongoing spam ids")
    ]

    yield [
        "shell", ccmdV2(async function({ args, msg, recursionCount, commandBans, sendCallback }) {
            if (!isMsgChannel(msg.channel)) return { noSend: true, status: StatusCode.ERR }
            if (globals.userUsingCommand(msg.author.id, "shell")) {
                return { content: "You are already using this command", status: StatusCode.ERR }
            }

            globals.startCommand(msg.author.id, "shell")
            const collector = msg.channel.createMessageCollector({ filter: m => m.author.id === msg.author.id })

            const timeoutInterval = 30000
            let to = setTimeout(collector.stop.bind(collector), timeoutInterval)

            collector.on("collect", async (m) => {
                clearTimeout(to)
                to = setTimeout(collector.stop.bind(collector), timeoutInterval)

                if (m.content === 'exit') {
                    collector.stop()
                    clearTimeout(to)
                    return
                }

                await cmd({ msg: m, command_excluding_prefix: m.content, recursion: recursionCount + 1, disable: commandBans, sendCallback })
            })

            collector.on("end", () => {
                globals.endCommand(msg.author.id, "shell")
            })

            return { noSend: true, status: StatusCode.RETURN }
        }, "Run commands without having to do a prefix")
    ]
}

