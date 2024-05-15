import fs from 'fs'

import vars, { VarType } from '../vars'


import { aliasesV2, AliasV2, ccmdV2, clearSnipes, commands, createCommandV2, createHelpArgument, createHelpOption, crv, crvFile, getAliasesV2, getCommands, getMatchCommands, helpArg, lastCommand, promptUser, StatusCode } from '../common_to_commands'
import globals from '../globals'
import useTracker from '../use-tracker'
import user_options from '../user-options'
import API from '../api'
import { parseBracketPair, formatPercentStr, format } from '../parsing'

import common from '../common'
import { fetchUser, generateSafeEvalContextFromMessage, getContentFromResult, getImgFromMsgAndOpts, safeEval, choice, generateHTMLFromCommandHelp, cmdCatToStr, isSafeFilePath, BADVALUE, fetchUserFromClient, searchList, isMsgChannel, ArgList, fetchUserFromClientOrGuild, truthy, efd } from '../util'


import { Guild, EmbedBuilder, User } from 'discord.js'
import { execSync } from 'child_process'
import { performance } from 'perf_hooks'

import htmlRenderer from '../html-renderer'
import { BattleEffect, BattleResponse, BattleResponses } from '../battle'
import cmds from '../command-parser/cmds'
import lexer from '../command-parser/lexer'
import timer from '../timer'
import configManager from '../config-manager'

const handleSending = cmds.handleSending


export default function*(CAT: CommandCategory): Generator<[string, CommandV2]> {
    yield ['clear-snipes', ccmdV2(async function() {
        clearSnipes()
        return crv("Snipes cleared")
    }, "Clears all snipes")]

    yield ['assert', ccmdV2(async function({ args, msg, symbols, runtime_opts, opts }) {
        args.beginIter()
        const syntax = args.expect(str => str !== ">test>", function(final) {
            return final.join(" ")
        }) as string
        //ignore "last part of syntax and assert:"
        args.expectString(2)
        const assertionCmp = args.expectString(1) as string
        const assertion = (args.expectString(() => true) as string).trim()
        const runtimeOpts = runtime_opts.copy()

        //we want the inside to evaluate as well, if the user doesn't want this then they can use n:
        runtimeOpts.set("skip", false)
        const evaledSyntax = await cmds.expandSyntax(syntax as string, msg, symbols, runtimeOpts)

        const joined = evaledSyntax.join(" ")

        const title = opts.getString("title", assertion)

        const outputFmt = opts.getString("fmt", "{embed}")

        let pass = false
        switch (assertionCmp) {
            case "T=": {
                pass = assertion === joined.trim()
                break
            }
            case "T!=": {
                pass = assertion !== joined.trim()
                break
            }
            case "=": {
                pass = assertion === joined
                break
            }
            case "!=": {
                pass = assertion !== joined
                break
            }
            default: {
                return crv("Invalid assertion expecatation", { status: StatusCode.ERR })
            }
        }
        if (outputFmt === "{embed}") {
            let desc = `Expression: \`\`\`bircle\n${syntax}\n\`\`\`\nExpected (${assertionCmp}): \`\`\`bircle\n${assertion}\n\`\`\``
            if (!pass) {
                desc += `\nGot: \`\`\`bircle\n${joined}\n\`\`\``
            }
            return {
                status: StatusCode.CMDSTATUS,
                statusNr: pass ? 0 : 101,
                embeds: [
                    new EmbedBuilder()
                        .setColor(pass ? "Green" : "Red")
                        .setDescription(desc)
                        .setTitle(title)
                        .setFooter({ text: pass ? "pass" : "fail" })
                ]
            }
        }
        return crv(format(outputFmt, {
            syntax,
            test: assertionCmp,
            evaled: joined,
            assert: assertion,
            result: pass ? "pass" : "fail"
        }), {
            status: StatusCode.CMDSTATUS,
            statusNr: pass ? 0 : 101
        })
    }, "Returns green embed if assert succeeds, red if fails")]

    yield ['runas', ccmdV2(async function*({ msg, args, runtime_opts, symbols }) {
        let oldId = msg.author
        let user = await fetchUserFromClient(common.client, args[0])
        if (!user) {
            return crv("User not found")
        }
        msg.author = user
        let c = args.slice(1).join(" ")
        for await (let result of globals.PROCESS_MANAGER.spawn_cmd({ msg, command: c, prefix: "", runtime_opts, symbols }, "runas(SUB)")) {
            yield result
        }
        msg.author = oldId
    }, "Runas", {
        permCheck: m => configManager.ADMINS.includes(m.author.id)
    })]

    yield ['endpoint', ccmdV2(async function({ opts, args, stdin, msg }) {
        if (opts.getBool("l", false)) {
            return crv(fs.readdirSync('./data/custom-endpoints').join("\n"))
        }
        let name = args[0]
        if (!isSafeFilePath(name)) {
            return crv("Bad name", { status: StatusCode.ERR })
        }
        if (!name) {
            return crv("No name given", { status: StatusCode.ERR })
        }
        if (opts.getBool("d", false)) {
            if (!fs.existsSync(`./data/custom-endpoints/${name}.html`)) {
                return crv("Endpoint does not exist", { status: StatusCode.ERR })
            }
            let userEndpoints = common.usersEndpoints(msg.author.id)
            if (userEndpoints.includes(name)) {
                common.removeEndPointFromUser(msg.author.id, name)
                fs.rmSync(`./data/custom-endpoints/${name}.html`)
                common.saveEndPointsDB()
                return crv(`Endpoint, ${name}, deleted`)
            }
            return crv("You do not own this endpoint", { status: StatusCode.ERR })
        }

        if (fs.existsSync(`./data/custom-endpoints/${name}.html`)) {
            return crv("That endpoint already exists", { status: StatusCode.ERR })
        }

        let data = stdin ? getContentFromResult(stdin) : args.slice(1).join(" ")

        if (msg.attachments.at(0)) {
            data = await (await fetch(msg.attachments.at(0)!.url)).text()
        }

        if (!data) {
            return crv("No data to put on the page", { status: StatusCode.ERR })
        }

        if (!opts.getBool("no-head", false)) {
            data = "<!DOCTYPE html><head><meta charset='utf-8'><link rel='stylesheet' href='/common.css'></link></head>" + data
        }

        fs.writeFileSync(`./data/custom-endpoints/${name}.html`, data)

        common.addEndpointToUser(msg.author.id, name)

        common.saveEndPointsDB()

        return crv(`You can access the page [here](http://bircle.euro20179.com:8080/custom/${name})`)
    }, "Create an endpoint on the website", {
        accepts_stdin: "Can be used instead of the data argument",
        helpArguments: {
            name: createHelpArgument("The name of the endpoint", true),
            data: createHelpArgument("The data to put on the website")
        },
        helpOptions: {
            d: createHelpOption("Delete the endpoint"),
            "no-head": createHelpOption("Do not add the default head which includes the default styling")
        }
    })]

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

    yield ["set", ccmdV2(async ({ opts, args, runtime_opts }) => {
        let explicit = opts.getBool("x", null)
        if (explicit !== null) {
            runtime_opts.set("verbose", explicit)
        }
        let quiet = opts.getBool("q", null)
        if (quiet !== null) {
            runtime_opts.set("silent", quiet)
        }
        let no_run = opts.getBool("d", null)
        if (no_run !== null) {
            runtime_opts.set("no-run", no_run)
        }
        if (args.length) {
            runtime_opts.set("program-args", args)
        }
        if (!opts.getBool("n", false)) {
            const args = runtime_opts.get("program-args", [])
            if (!args.length) {
                return { noSend: true, status: StatusCode.RETURN }
            }
            return crv(args.join(" "))
        }
    }, "Sets program arguments", {
        helpOptions: {
            IFS: createHelpOption("set field seperator for variable expansion and \\a{*}"),
            x: createHelpOption("Say what is being run for each command"),
            d: createHelpOption("Dont actually run the command"),
            n: createHelpOption("Dont say the program arguments")
        }
    })]

    yield ["env", ccmdV2(async ({ symbols }) => {
        return crv(Object.entries(symbols.symbols).reduce((p, cur) => p + `\n${cur[0]} = ${JSON.stringify(cur[1])}`, ""))
    }, "Gets the interpreter env")]

    yield ['ps', ccmdV2(async function() {
        let procs = globals.PROCESS_MANAGER.getprocids()
        return crv(Array.from(procs, (v) => `${v}: ${globals.PROCESS_MANAGER.getproclabel(v)}`).join("\n"))
    }, "Gets all running processes")]

    yield ['kill', ccmdV2(async function({ args }) {
        let killed: string[] = []
        let dne: string[] = []
        for (let pid of args) {
            (
                globals.PROCESS_MANAGER.killproc(Number(pid))
                    ? killed
                    : dne
            ).push(pid)
        }
        let text = ""
        if (killed.length) {
            text += `pids: ${killed.join(", ")} have been killed`
        }
        if (dne.length) {
            text += `pids: ${dne.join(", ")} do not exist`
        }
        return crv(text)
    }, "Kill process(es)", {
        helpArguments: {
            "...pids": createHelpArgument("The pid(s) to kill")
        },
    })]

    yield ["export", ccmdV2(async ({ args, symbols, opts }) => {
        let [name, ...val] = args
        let value = val.join(" ")
        if (value[0] === "=") {
            value = value.slice(1)
        }

        value = value.trim()

        if (!name.match(/^[A-Za-z0-9_-]+$/)) {
            return crv("Name must be alphanumeric + _- only", { status: StatusCode.ERR })
        }

        if (symbols)
            symbols.set(name, value)

        return opts.getBool("s", false)
            ? { noSend: true, status: StatusCode.RETURN }
            : crv(`${name} = ${value}`)
    }, "Sets a variable for the current runtime", {
        helpOptions: {
            s: createHelpOption("Send nothing after creating the variable")
        }
    })]

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
            if (data["allowedMentions"]) {
                if (data["allowedMentions"]["roles"]) {
                    delete data["allowedMentions"]["roles"]
                }
                if (data["allowedMentions"]["parse"] && data["allowedMentions"]["parse"].length) {
                    data["allowedMentions"]["parse"] = data["allowedMentions"]["parse"].filter(v => !["roles", "everyone"].includes(v))
                }
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
        "```bircle", createCommandV2(async function*({ msg, args, runtime_opts, symbols }) {
            for (let line of args.join(" ").replace(/```$/, "").trim().split(";EOL")) {
                line = line.trim()
                if (!line) continue
                for await (let result of globals.PROCESS_MANAGER.spawn_cmd({ command: line, prefix: "", runtime_opts, msg, symbols })) {
                    yield result
                }
            }
            return { noSend: true, status: StatusCode.RETURN }
        }, CAT, "Run some commands"),
    ]

    yield [
        "(", createCommandV2(async ({ msg, rawArgs: args, symbols }) => {
            if (args[args.length - 1] !== ")") {
                return { content: "The last argument to ( must be )", status: StatusCode.ERR }
            }
            let rv: CommandReturn = { noSend: true, status: 0 }
            for await (let res of globals.PROCESS_MANAGER.spawn_cmd({ command: "(PREFIX)" + args.slice(0, -1).join(" "), prefix: "(PREFIX)", msg, symbols }, "( (SUB)")) {
                rv = res
            }
            return { content: JSON.stringify(rv), status: StatusCode.RETURN }
        }, CAT),
    ]

    yield [
        'tokenize', createCommandV2(async ({ rawArgs: args }) => {
            let tokens = new lexer.Lexer(args.join(" ").trim(), { prefix: "" }).lex()
            return crv(tokens.map(v => `${v.constructor.name} ${JSON.stringify(v)}`).join(";\n") + ";")
        }, CAT, "Tokenize command input"),
    ]

    yield [
        "interprate", ccmdV2(async ({ msg, rawArgs: args }) => {
            let strings = await cmds.expandSyntax(args.join(" ").trim(), msg)
            return crv(JSON.stringify(strings))
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
                if (fs.existsSync(`./src/bircle-bin/${cmd}.bircle`)) {
                    res.push('.bircle')
                }
                else if (cmds.get(cmd)) {
                    switch (cmds.get(cmd)?.cmd_std_version) {
                        case 2:
                            res.push("cmdv2")
                            break
                        default:
                            res.push("cmdv1")
                    }
                }
                else if (matches[cmd]) {
                    res.push("match")
                }
                else if (userMatches.get(cmd)) {
                    res.push("user-match")
                }
                else if (aliasV2s[cmd]) {
                    res.push("av2")
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

        "option", ccmdV2(async ({ msg, args }) => {
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
                if (!user_options.validateOption(optname, optVal)) {
                    return crv(`${optname} cannot be set to ${optVal}`, { status: StatusCode.ERR })
                }
                user_options.setOpt(msg.author.id, optname, optVal)
                user_options.saveUserOptions()
                return { content: `<@${msg.author.id}> set ${optname}=${optVal}`, status: StatusCode.RETURN }
            }
        }, "Sets a user option",
            {
                helpOptions: {
                    option: createHelpArgument("The option to set", true),
                    value: createHelpArgument("The value to set the option to, if not given, option will be unset", false)
                },
                permCheck: (m) => !m.author.bot,
                prompt_before_run: true
            }
        ),
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

        }, CAT, "Lets me unset people's options :watching:", null, null, null, (m) => configManager.ADMINS.includes(m.author.id)),
    ]

    yield [
        "options", createCommandV2(async ({ msg, rawOpts: opts, args, runtime_opts }) => {
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
            if (runtime_opts.get("remote", false)) {
                let html = ""
                for (let opt of user_options.allowedOptions) {
                    html += `<h3>${opt}</h3><br><p><pre>${userOpts?.[opt] ?? "\\_\\_unset\\_\\_"}</pre></p><hr><br>`
                }
                return crv(html)
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
            i: createHelpOption('Import options', ['import'])
        }),
    ]

    yield [
        'get-source', ccmdV2(async function({ rawOpts: opts, args }) {

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

            if (opts['ts']) {
                let category = command.category

                let data = fs.readFileSync(`./src/commands/${cmdCatToStr(category)}_commands.ts`, "utf-8")
                const regex = new RegExp(`yield\\s*\\[\\s*["']${cmd}["'],\\s*([\\s\\w\\W]+?)\\](?:[\\s\\n]*yield\\s*\\[|\\s*\\}\\s*$)`)
                return crv(`\`\`\`typescript\n${data.match(regex)?.[1]}\n\`\`\``, {
                    mimetype: 'application/typescript',
                    onOver2kLimit: (_, rv) => {
                        rv.content = rv.content?.replace(/```typescript\n/, "")?.replace(/```$/, "")
                        return rv
                    }
                })
            }

            let results = []
            let curAttr = command
            for (let attr of attrs) {
                for (let subAttr of attr.split(".")) {
                    curAttr = curAttr[subAttr as Exclude<keyof CommandV2, "argShape">]
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
                content: `\`\`\`javascript\n${results.join("\n")}\n\`\`\``, status: StatusCode.RETURN, mimetype: "application/javascript", onOver2kLimit: (_: any, rv: any) => {
                    rv.content = rv.content?.replace(/```(?:type|java)script\n/, "")?.replace(/```$/, "")
                    return rv
                }
            }
        }, "Get the source code of a file, or a command", {
            helpArguments: {
                command: {
                    description: "The command to get the source code  of",
                    required: true
                },
                "...attributes": {
                    description: "Get attributes of a command"
                }
            },
            helpOptions: {
                'ts': createHelpOption("Return the uncompiled typescript code"),
                'of-file': {
                    description: "If command is not given, use this to get the source of a file"
                }
            }
        })
    ]

    yield ["code-info", ccmdV2(async ({ opts }) => {
        let info;
        if (opts.getBool("a", false))
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
                    attachment: "./database/petinventory.json",
                    name: "Pet inventory.json",
                    delete: false
                }
            ], status: StatusCode.RETURN
        }
    }, CAT)]

    yield [
        "economy", ccmdV2(async function() {
            return {
                files: [
                    crvFile("database/economy.json", "economy.json", "The economy")
                ],
                status: StatusCode.RETURN
            }

        }, "Get the database economy.json file")
    ]

    yield [
        "inventory.json", ccmdV2(async function() {
            return {
                files: [
                    crvFile("database/inventory.json", "Inventory.json", "Everyone's inventory")
                ],
                status: StatusCode.RETURN
            }
        }, "Sends the raw inventory.json database file")
    ]

    yield [
        "del-var", ccmdV2(async function({ msg, args, rawOpts: opts }) {
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
        }, "Delete a variable", {
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
        })
    ]

    yield [
        "savev", ccmdV2(async () => vars.saveVars() && crv("Variables saved"), "Save all variables")
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
        }, CAT, undefined, null, null, null, (m) => configManager.ADMINS.includes(m.author.id)),
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
                return { content: `${fn} is not a valid  api function\nrun \`${configManager.PREFIX}api -l\` to see api commands`, status: StatusCode.ERR }
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
        "del", createCommandV2(async function*({ msg, args, opts, runtime_opts, symbols }) {
            if (!opts.getBool("N", false)) return { noSend: true, delete: true, status: StatusCode.RETURN }

            for await (let result of globals.PROCESS_MANAGER.spawn_cmd({ command: "(PREFIX)" + args.join(" "), msg, runtime_opts, prefix: "(PREFIX)", symbols }, "del(SUB)")) {
                yield result
            }
            return { noSend: true, delete: true, status: StatusCode.RETURN }
        }, CAT, "delete your message", {
            "...text": createHelpArgument("text"),
        }, {
            N: createHelpOption("Treat text as a command")
        })
    ]

    yield [
        "analyze-cmd", createCommandV2(async ({ msg, rawOpts: opts, args, runtime_opts, symbols }) => {
            let results = []

            let text = args.join(" ").trim()
            let command = parseBracketPair(text, "()")

            text = text.slice(command.length + 2)

            let rv: CommandReturn = { noSend: true, status: 0 }
            for await (let result of globals.PROCESS_MANAGER.spawn_cmd({ command: "(PREFIX)" + command, prefix: "(PREFIX)", msg, runtime_opts, symbols }, "analyze-cmd(SUB)")) {
                rv = result
            }
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
        "for", createCommandV2(async function*({ msg, args, sendCallback, runtime_opts, pid_label, symbols }) {
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

            if (scriptLines.length < 1) {
                return crv("No commands given to run (be sure to put the commands in {})", { status: StatusCode.ERR })
            }

            let parentPID = globals.PROCESS_MANAGER.getprocidFromLabel(pid_label) ?? 0

            for (let i = start; i < end; i++) {
                symbols.set(`%:${var_name}`, String(i))
                for (let line of scriptLines) {
                    for await (let result of globals.PROCESS_MANAGER.spawn_cmd(
                        { command: "(PREFIX)" + line, prefix: "(PREFIX)", msg, sendCallback, runtime_opts, symbols }, `${pid_label}:${i}`, { parentPID }
                    )) {
                        yield result
                        // await new Promise(res => setTimeout(res, 1000))
                    }
                }
                yield { noSend: true, status: StatusCode.CHECKIN }
            }
            return { noSend: true, status: StatusCode.RETURN }
        }, CAT, "A for loop", {
            name: createHelpArgument("A variable name<br>can be used like any other bot variable in the commands", true),
            "x..y": createHelpArgument("x is the start, y is the end", true),
            "{ commands }": createHelpArgument("The commands to run in {}, seperated by ; and a blank line", true)
        })
    ]

    yield [
        "send", ccmdV2(async function({ msg, args, stdin }) {
            if (!timer.has_x_s_passed(msg.author.id, "%send-timer", 1, true)) {
                return { noSend: true, status: StatusCode.ERR }
            }
            let text = stdin ? getContentFromResult(stdin, '\n') : args.join(" ")
            await cmds.handleSending(msg, crv(text))
            return { noSend: true, status: StatusCode.RETURN }
        }, "Send a message to chat")
    ]

    yield [
        "loop", ccmdV2(async function({ msg, args, symbols, sendCallback, pid_label, runtime_opts }) {
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

            let parentPID = globals.PROCESS_MANAGER.getprocidFromLabel(pid_label) ?? 0

            sendCallback = async (data) => {
                symbols.set("LOOP_REPLY", getContentFromResult(data))
                return msg
            }

            console.log(parentPID)

            for (let i = start; i < end; i++) {
                symbols.set(var_name, String(i))
                for (let line of scriptLines) {
                    for await (let result of globals.PROCESS_MANAGER.spawn_cmd(
                        { command: line, prefix: "", msg, sendCallback, runtime_opts, symbols },
                        `${pid_label}:${i}`,
                        { parentPID }
                    )) {
                        symbols.set("LOOP_REPLY", getContentFromResult(result, "\n"))
                    }
                }
            }
            //there will be no builtin sleep mechanism (or if there needs to be, maybe make it like 10ms or smth, to make sure the cpu doesnt die)
            //nor will there be a hard coded max
            //the output of each command is redirected into the REPLY environment variable, instead of sent to chat
            //the syntax of this command will look something like
            //loop i min..max {
            //  send ${%:i};
            //  sleep 1001
            //}

            //TODO: create a send command that works similarly to echo, but can only be used once per second
            //that way the user can send messages with this command
            return { noSend: true, status: 0 }
        }, "Loops")
    ]

    yield [
        "foreach", ccmdV2(async function*({ msg, args, runtime_opts, sendCallback, pid_label, symbols }) {
            const var_name = args.splice(0, 1)[0]
            if (args.splice(0, 1)[0] !== '(') {
                return { content: "Expected '('", status: StatusCode.ERR }
            }

            let items = []
            let item = args.splice(0, 1)[0]
            while (item !== ')' && args.length) {
                items.push(item)
                item = args.splice(0, 1)[0]
            }

            if (!args.length) {
                return { content: "could not parse items", status: StatusCode.ERR }
            }

            const scriptWithoutBraces = parseBracketPair(args[0], "{}")

            let parentPID = globals.PROCESS_MANAGER.getprocidFromLabel(pid_label) ?? 0

            let scriptLines = scriptWithoutBraces.split(";\n").map(v => v.trim()).filter(v => v)
            for (let item of items) {
                vars.setVarEasy(`%:${var_name}`, item, msg.author.id)
                for (let line of scriptLines) {
                    for await (let result of globals.PROCESS_MANAGER.spawn_cmd({
                        command: line, prefix: "", msg, sendCallback, runtime_opts, symbols
                    }, `${pid_label}:${item}`, { parentPID })) {
                        yield result
                        await new Promise(res => setTimeout(res, 1000))
                    }
                }
            }
        }, "Does code for each item in a list", {
            docs: `<h3>Syntax</h3><code>foreach NAME ( item1 item2 ... ) {<br>&nbsp;line1;<br>&nbsp;line2<br>}</code><br>Yes the spaces in (  ) are necessary<br>The last line of code should not end with ";"`
        })
    ]

    yield [
        "switch", ccmdV2(async function*({ args, msg, sendCallback, runtime_opts, pid_label, symbols }) {

            let parentPID = globals.PROCESS_MANAGER.getprocidFromLabel(pid_label) ?? 0

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
                    yield { content: `${caseBlock[0]} is not a valid regex, skipping case`, status: StatusCode.WARNING }
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
                        for await (let result of globals.PROCESS_MANAGER.spawn_cmd(
                            { command: "(PREFIX)" + line, prefix: "(PREFIX)", msg, sendCallback, runtime_opts, symbols },
                            "switch(SUB)",
                            { parentPID }
                        )) {
                            yield result
                        }
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
        "[", ccmdV2(async function({ args, opts, sendCallback, msg, runtime_opts, symbols, pid_label }) {
            let endKeyword = "]"
            let end_of_check = args.indexOf("]")
            if (end_of_check === -1) {
                end_of_check = args.indexOf("then")
                endKeyword = "then"
            }
            if (end_of_check < 0) {
                return { content: `You must end the check with ] or then`, status: StatusCode.ERR }
            }

            let testText = args.slice(0, end_of_check)

            let commandToRun = parseBracketPair(args.slice(args.indexOf(endKeyword)).join(" "), "{}").trim()
            let elseCommand = ""
            if (args.lastIndexOf("else") > 0) {
                elseCommand = parseBracketPair(args.slice(args.lastIndexOf("else")).join(" "), "{}").trim()
            }

            let parentPID = globals.PROCESS_MANAGER.getprocidFromLabel(pid_label)

            async function handleBranch(command: string, code: StatusCode) {
                let lastrv;
                if (command) {
                    for await (let result of globals.PROCESS_MANAGER.spawn_cmd(
                        { command: command, prefix: "", sendCallback, runtime_opts, msg, symbols },
                        "[(SUB)",
                        { parentPID }
                    )
                    ) {
                        lastrv = result
                    }
                } else {
                    lastrv = { noSend: true, status: code }
                }
                return lastrv
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
                let [v1, op, v2] = testText
                return (() => {
                    switch (op) {
                        case "=": case "==":
                            return v1 === v2

                        case "!=":
                            return v1 !== v2

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
                z: createHelpOption("Test if there is not text"),
                s: createHelpOption("Do not use the parent interpreter context")
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
        "if-cmd", createCommandV2(async function*({ msg, args, sendCallback, runtime_opts, pid_label, symbols }) {
            let parentPID = globals.PROCESS_MANAGER.getprocidFromLabel(pid_label)


            async function runIf(c: string, operator: string, value: string) {
                let rv
                for await (let result of globals.PROCESS_MANAGER.spawn_cmd(
                    { command: "(PREFIX)" + c, prefix: "(PREFIX)", msg, sendCallback, runtime_opts, symbols },
                    "if-cmd(SUB)",
                    { parentPID }
                )) {
                    //we only care about the last rv
                    rv = result
                }
                if (rv === undefined) {
                    rv = { noSend: true, status: 0 }
                }
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
                    for await (let result of globals.PROCESS_MANAGER.spawn_cmd(
                        { command: "(PREFIX)" + line, prefix: "(PREFIX)", msg, sendCallback, runtime_opts, symbols },
                        "if-cmd(SUB)",
                        { parentPID }
                    )) {
                        //we only care about the last rv
                        yield result
                    }
                }
                return { noSend: true, status: StatusCode.RETURN }
            }
            else {
                let foundElse = false
                for (let elif of elifBlocks) {
                    if (await runIf(elif.cmd, elif.operator, elif.value)) {
                        if (!elif.block.trim() || elif.block.trim().startsWith("}")) continue
                        for await (let result of globals.PROCESS_MANAGER.spawn_cmd(
                            { command: "(PREFIX)" + elif.block.trim(), prefix: "(PREFIX)", msg, sendCallback, runtime_opts, symbols },
                            "if-cmd(SUB)",
                            { parentPID }
                        )) {
                            //we only care about the last rv
                            yield result
                        }
                        foundElse = true
                        break;
                    }
                }
                if (!foundElse) {
                    for (let line of falseBlock.split(";\n")) {
                        line = line.trim()
                        if (!line || line.startsWith("}")) continue
                        for await (let result of globals.PROCESS_MANAGER.spawn_cmd(
                            { command: "(PREFIX)" + line, prefix: "(PREFIX)", msg, sendCallback, runtime_opts, symbols },
                            "if-cmd(SUB)",
                            { parentPID }
                        )) {
                            //we only care about the last rv
                            yield result
                        }
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

    yield ["IF", ccmdV2(async function*({ msg, args, symbols, runtime_opts, sendCallback }) {
        args.beginIter()

        let cmd = args.expectString(s => s !== 'THEN')
        if (cmd === BADVALUE) {
            return crv("Exepcted `THEN`", { status: StatusCode.ERR })
        }

        //skip past the ;then
        args.expectString(2)

        let invert = false

        if (cmd[0] === "!") {
            invert = true
            cmd = cmd.slice(1)
        }

        let initalSkip = runtime_opts.get("skip", false)

        //for running the condition, it's very unlikely the user wants skip, if they do they can enable it
        runtime_opts.set("skip", false)
        let success = false
        for await (let item of globals.PROCESS_MANAGER.spawn_cmd({ prefix: "", msg, command: cmd, symbols, runtime_opts, sendCallback })) {
            success = item.status === StatusCode.RETURN
            yield item
        }

        runtime_opts.set("skip", initalSkip)

        while (true) {
            const body = args.expectString(s => !["ELSE", "ELIF", "FI"].includes(s.trim()))
            //skip past last item in body
            args.expectString(1)

            if (body == BADVALUE) {
                return crv("Expected `ELIF`, `ELSE` or `FI`", { status: StatusCode.ERR })
            }

            const ending = args.expectString(1)

            if (success !== invert) {
                return crv(`${configManager.PREFIX}${body}`, { recurse: true })
            } else if (ending === "ELIF") {
                let cmd = args.expectString(s => s !== "THEN")
                //skip past last item in cmd and THEN
                args.expectString(2)
                if (cmd === BADVALUE) {
                    return crv("expected `THEN`", { status: StatusCode.ERR })
                }

                let initalSkip = runtime_opts.get("skip", false)

                //for running the condition, it's very unlikely the user wants skip, if they do they can enable it
                runtime_opts.set("skip", false)

                for await (let item of globals.PROCESS_MANAGER.spawn_cmd({ prefix: "", msg, command: cmd, symbols, runtime_opts, sendCallback })) {
                    success = item.status === StatusCode.RETURN
                    yield item
                }

                runtime_opts.set("skip", initalSkip)
            } else if (ending === "ELSE") {
                success = !success
                continue
            } else if (ending === "FI") {
                break
            }
        }

        return { noSend: true, status: StatusCode.RETURN }
    }, "an if/elif/else chain that runs based on the status code of the command", {
        docs: "Syntax:<br><code>IF &lt;cmd&gt; THEN &lt;body&gt; [(ELIF &lt;cmd&gt; THEN body)* [ELSE body]] FI</code>",
        helpArguments: {
            "condition": createHelpArgument("The initial condition command"),
            "body": createHelpArgument("The cmds to run if the condition returns status 0"),
            "ELIF": createHelpArgument("Start an elif condition", false, "body"),
            "elifcmd": createHelpArgument("The command to run for the ELIF (there can be as many ELIFs as you want)", false, "ELIF"),
            "elifbody": createHelpArgument("The command if the elifcmd rreturns status 0", false, "ELIF"),
            "ELSE": createHelpArgument("Start the else block", false, "body"),
            "elsebody": createHelpArgument("The block to run if any of the above conditions failed", false, "ELSE"),
            "FI": createHelpArgument("End the if chain", true, "body")
        }
    })]

    yield [
        "if", ccmdV2(async function*({ msg, rawArgs: args, runtime_opts, pid_label, symbols }) {
            let parentPID = globals.PROCESS_MANAGER.getprocidFromLabel(pid_label)

            let [condition, cmdToCheck] = args.join(" ").split(";")
            if (!cmdToCheck) {
                return { content: "You are missing a ; after the condition", status: StatusCode.ERR }
            }
            cmdToCheck = cmdToCheck.split(";end")[0]
            let success;
            if (condition.trim().startsWith(`(${configManager.PREFIX}`)) {
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
                let rv: CommandReturn = { status: 0, noSend: true }
                for await (let result of globals.PROCESS_MANAGER.spawn_cmd(
                    { command: command_to_run, prefix: configManager.PREFIX, runtime_opts, msg, symbols },
                    "if(SUB)",
                    { parentPID }
                )) {
                    rv = result
                }
                let content = getContentFromResult(rv)
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
            let elseCmd = args.join(" ").split(`${configManager.PREFIX}else;`).slice(1).join(`${configManager.PREFIX}else;`)?.trim()
            if ((success !== undefined && success) || (success === undefined && safeEval(condition, { ...generateSafeEvalContextFromMessage(msg), args: args, lastCommand: lastCommand[msg.author.id] }, { timeout: 3000 }))) {
                for await (let result of globals.PROCESS_MANAGER.spawn_cmd(
                    { command: "(PREFIX)" + cmdToCheck.trim(), prefix: "(PREFIX)", runtime_opts, msg, symbols },
                    "if(SUB)",
                    { parentPID }
                )) {
                    yield result
                }
            }
            else if (elseCmd) {
                for await (let result of globals.PROCESS_MANAGER.spawn_cmd(
                    { command: "(PREFIX)" + elseCmd.trim(), prefix: "(PREFIX)", runtime_opts, msg, symbols },
                    "if(SUB)",
                    { parentPID }
                )) {
                    yield result
                }
            }
            else {
                return { content: "?", status: StatusCode.ERR }
            }

        }, "Run commands conditionally", {
            docs: "Evaluate bircle commands conditionally!<br>There are 2 versions of the if statement<ul><li><b>1</b>: standard javascript expression</li><li><b>2</b>:([bircle-command) &lt;operator&gt; (value)</ul><br><b>For the 2nd version</b>, the first set of parentheses indicate a command to run, the operator may be one of the standard comparison operators<br>In addition, the <code>:</code> operator may be used to check if the result of the commands includes the regex expression provided in  the second set of parentheses.<br>Lastly, the <code>includes</code> operator may be used to check if the expected value is in the result of the command.<br>After the condition must be a ;<br><br>after the ; must be  a command  to run followed by <code>;end</code><br>lastly <code>[else;</code> &lt;command&gt; may optionally be added on a new line<br>If  the condition is false and an <code[else;</code> is not provided a ? will be sent"
        })
    ]

    yield [
        "getimg", ccmdV2(async ({ msg, opts, stdin }) => {
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
        "argc", ccmdV2(async ({ args }) => crv(String(args.length)), "Prints the number of arguments given to this command")
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
        "opts", ccmdV2(async function({ rawOpts: opts }) {
            let disp = ""
            for (let key in opts) {
                disp += `**${key}**: \`${opts[key]}\`\n`
            }
            return { content: disp || "#!N/A", status: StatusCode.RETURN }
        }, "Print the opts given", {
        }),
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
        "uptime", ccmdV2(async function({ args }) {
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
        }, "gives up time of the bot",
            {
                arguments: {
                    fmt: {
                        "description": "the format to show the uptime in<br>%s: seconds, %m: minutes, %h: hours, %d: days<br>{s}: seconds, {m}: minutes, {h}: hours, {d}: days"
                    }
                }
            })
    ]

    yield [
        "create-file", ccmdV2(async function({ args }) {
            let file = args[0]
            if (!file) {
                return { content: "No file specified", status: StatusCode.ERR }
            }
            if (!isSafeFilePath(file)) {
                return { content: `cannot create a file called ${file}`, status: StatusCode.ERR }
            }
            fs.writeFileSync(`./command-results/${file}`, "")
            return { content: `${file} created`, status: StatusCode.RETURN }
        }, "Create a database file")
    ]

    yield [
        "remove-file", ccmdV2(async function({ args }) {
            let file = args[0]
            if (!file) {
                return { content: "No file specified", status: StatusCode.ERR }
            }
            if (!fs.existsSync(`./command-results/${file}`)) {
                return { content: `${file} does not exist`, status: StatusCode.ERR }
            }
            fs.rmSync(`./command-results/${file}`)
            return { content: `${file} removed`, status: StatusCode.RETURN }
        }, "Remove a database file", {
            permCheck: m => configManager.ADMINS.includes(m.author.id)
        })
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
        "l-bl", ccmdV2(async function() {
            return { files: [crvFile("command-perms/blacklists", "Blacklists")], status: StatusCode.RETURN }
        }, "Lists all blacklists")
    ]

    yield [
        "l-wl", ccmdV2(async function() {
            return { files: [crvFile("command-perms/whitelists", "Whitelists")], status: StatusCode.RETURN }
        }, "Lists all whitelists")
    ]

    yield [
        "timeit", ccmdV2(async function({ msg, args, sendCallback, opts, runtime_opts, symbols, pid_label }) {
            let cmd = args.join(" ").trim()
            let count = Math.min(opts.getNumber("c", 1), 2000)
            let i = 0
            let total = 0
            let parentPID = globals.PROCESS_MANAGER.getprocidFromLabel(pid_label)

            let min = Infinity
            let max = -Infinity

            while (i++ != count) {
                let start = performance.now()
                for await (let result of globals.PROCESS_MANAGER.spawn_cmd(
                    { command: cmd, prefix: "", msg, sendCallback, runtime_opts, symbols },
                    "TIMEIT",
                    { parentPID }
                )) {
                }
                let end = performance.now()
                const t = end - start
                if (t > max) {
                    max = t
                } else if (t < min) {
                    min = t
                }
                total += t
            }
            if (count !== 1) {
                return crv(`total: ${total}ms\nmax: ${max}ms\nmin: ${min}ms\n${total / count}ms`)
            }
            return { content: `${total / count}ms`, status: StatusCode.RETURN }
        }, "Time how long a command takes", {
            helpArguments: {
                "...command": createHelpArgument("The command to run", true)
            }, helpOptions: {
                "c": createHelpOption("The amount of times to run the command, max of 2000"),
                "no-chat": createHelpOption("Dont include the time it takes to send to chat")
            },
            short_opts: "n",
            long_opts: [["no-chat"]]
        })
    ]


    yield [
        "do", ccmdV2(async function*({ msg, rawArgs: args, sendCallback, recursionCount: recursion, runtime_opts, symbols, pid_label }) {
            if (recursion >= configManager.RECURSION_LIMIT) {
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
            await handleSending(msg, { content: `starting ${3}`, status: StatusCode.INFO }, sendCallback)
            let cmdToDo = cmdArgs.split(" ")[0]
            if (['run', 'do', 'spam'].includes(cmdToDo)) {
                yield { content: "Cannot run do, spam, or run", status: StatusCode.ERR }
                return
            }

            let parentPID = globals.PROCESS_MANAGER.getprocidFromLabel(pid_label)

            while (times--) {
                for await (let result of globals.PROCESS_MANAGER.spawn_cmd(
                    {
                        command: "(PREFIX)" + format(cmdArgs, { "number": String(totalTimes - times), "rnumber": String(times + 1) }),
                        prefix: "(PREFIX)",
                        msg,
                        sendCallback,
                        runtime_opts,
                        symbols
                    },
                    "DO",
                    { parentPID }
                )) {
                    yield result
                    await new Promise(res => setTimeout(res, Math.random() * 1000 + 200))
                }
                yield { noSend: true, status: StatusCode.CHECKIN }
            }
            yield {
                content: "done",
                status: StatusCode.INFO
            }

        }, "Run a command a certain number of times", {
            arguments: {
                count: createHelpArgument("The number of times to run the command", false),
                "...command": createHelpArgument("The rest of the arguments are the command to run", true)
            }
        })
    ]

    yield [
        "spam", createCommandV2(async function*({ args, opts }) {
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
            // await handleSending(msg, { content: `starting ${interpreter.context.env['PID']}`, status: StatusCode.INFO }, sendCallback)
            let delay: number | null = (opts.getNumber("delay", null) ?? 1) * 1000
            if (delay < 700 || delay > 0x7FFFFFFF) {
                delay = null
            }
            while (times--) {
                yield { content: format(send, { "count": String(totalTimes - times), "rcount": String(times + 1) }), status: StatusCode.RETURN }
                await new Promise(res => setTimeout(res, delay ?? Math.random() * 700 + 200))
            }
            yield {
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
        "stop", ccmdV2(async function*({ args, pid_label }) {
            if (args.length) {
                for (let pid of args) {
                    if (globals.PROCESS_MANAGER.killproc(pid))
                        yield crv(`Stopped: ${pid}`)
                }
            }
            for (let pid of globals.PROCESS_MANAGER.getprocids()) {
                //dont kill itself
                if (globals.PROCESS_MANAGER.getproclabel(pid) === pid_label) {
                    continue
                }
                globals.PROCESS_MANAGER.killproc(pid)
            }
            return crv("stopping all")
        }, "Stop all spams, and running commands")
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
        "run", ccmdV2(async function*({ msg, rawArgs: args, sendCallback, recursionCount: recursion, runtime_opts, pid_label, symbols }) {
            if (recursion >= configManager.RECURSION_LIMIT) {
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
            function handleRunFn(fn: string, contents: string) {
                switch (fn) {
                    case "RUN_FN_VAR": {
                        return `\${${parseRunLine(contents)}}`
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
            let parentPID = globals.PROCESS_MANAGER.getprocidFromLabel(pid_label)
            for (let line of text) {
                line = line.trim()
                if (line.startsWith(configManager.PREFIX)) {
                    line = line.slice(configManager.PREFIX.length)
                }
                for await (let result of globals.PROCESS_MANAGER.spawn_cmd(
                    { command: `(PREFIX)${parseRunLine(line)}`, prefix: "(PREFIX)", msg, sendCallback, runtime_opts, symbols },
                    "RUN",
                    { parentPID }
                )) {
                    yield result
                }
                runtime_opts.set("recursion", runtime_opts.get("recursion", 1) - 1)
            }
        }, "Runs bluec scripts. If running from a file, the top line of the file must be %bluecircle37%")
    ]

    yield [
        "silent", ccmdV2(async function({ args, msg, runtime_opts, pid_label, symbols }) {
            const initialSilent = runtime_opts.get("silent", false)
            runtime_opts.set("silent", true)
            let parentPID = globals.PROCESS_MANAGER.getprocidFromLabel(pid_label)
            let gen = globals.PROCESS_MANAGER.spawn_cmd({ command: "(PREFIX)" + args.join(" "), prefix: "(PREFIX)", runtime_opts, msg, symbols }, "silent(SUB)", { parentPID })
            while (!(await gen.next()).done);
            runtime_opts.set("silent", initialSilent)
            return { noSend: true, status: StatusCode.RETURN }
        }, "Run a command silently")
    ]

    yield [
        "var", ccmdV2(async function({ msg, rawOpts: opts, args }) {
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
            if (realName.match(/[>|#%/&<]/)) {
                return crv("Name cannot contain any of: `>|#%/&<`", { status: StatusCode.ERR })
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

            if (realName.startsWith("&")) {
                user_options.setOpt(msg.author.id, realName.slice(1), String(realVal))
            }
            else if (opts['u']) {
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
        }, "Creates a variable", {
            options: {
                u: createHelpOption("Create a user variable")
            },
            arguments: {
                "[prefix:]name=value": {
                    description: "name is the variable name, value is the value<br>prefix is optional, and can be anything that does not start with !<br>the <code>%</code> prefix will also create a user variable.<br>If name starts with an &, it will be treated as an option name",
                    required: true
                }
            }
        })
    ]

    yield [
        "remove", ccmdV2(async function({ msg, args, sendCallback }) {
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
                return v.trim() === msg.author.id || configManager.ADMINS.includes(msg.author.id) ? i : undefined
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
        }, "Removes a line from a command file", {
            arguments: {
                file: {
                    description: "The command file to remove from",
                    required: true
                }
            }
        })
    ]

    yield [
        "command-file", ccmdV2(async function({ args, rawOpts: opts }) {
            if (opts["l"]) {
                return crv(`\`\`\`\n${fs.readdirSync("./command-results").join("\n")}\n\`\`\``)
            }
            const file = common.FILE_SHORTCUTS[args[0] as keyof typeof common.FILE_SHORTCUTS] || args[0]
            if (!isSafeFilePath(file)) {
                return { content: "<:Watching1:697677860336304178>", status: StatusCode.ERR }
            }
            if (!fs.existsSync(`./command-results/${file}`)) {
                return crv(`${file} does not exist`, { status: StatusCode.ERR })
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

        }, "Reads a command file", {
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

            let data = {
                util: await import("../util"),
                parsing: await import("../parsing"),
                cmds: await import("../command-parser/cmds"),
                common_to_commands: await import("../common_to_commands"),
                globals: await import("../globals"),
                common: await import("../common"),
                economy: await import("../economy"),
                timer: await import("../timer"),
                pets: await import("../pets"),
                amount_parser: await import("../amount-parser")
            }
            if (opts.getBool("l", false)) {
                return { content: Object.keys(data).join("\n"), status: StatusCode.RETURN }
            }
            if (args[0].includes(".")) {
                args = new ArgList(args.join(" ").split("."))
            }
            let curObj: object = data
            for (let prop of args) {
                curObj = curObj?.[prop as keyof typeof curObj]
            }
            return {
                content: `\`\`\`javascript\n${String(curObj)}\n\`\`\``, status: StatusCode.RETURN, mimetype: "application/javascript", onOver2kLimit: (_: any, rv: any) => {
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
        ccmdV2(async function({ args }) {
            if (!fs.existsSync(`./command-results/${args.join(" ").replaceAll(/\.\.+/g, ".")}`)) {
                return { content: "File does not exist", status: StatusCode.ERR }
            }
            return { content: fs.readFileSync(`./command-results/${args.join(" ").replaceAll(/\.\.+/g, ".")}`, "utf-8"), status: StatusCode.RETURN }
        }, "Send names of all log files")
    ]

    yield [
        "add",
        ccmdV2(async function({ msg, args }) {
            const file = common.FILE_SHORTCUTS[args[0] as keyof typeof common.FILE_SHORTCUTS] || args[0]
            if (!file)
                return crv("No file given", { status: StatusCode.ERR })

            if (!isSafeFilePath(file))
                return crv("Invalid file name", { status: StatusCode.ERR })

            if (!fs.existsSync(`./command-results/${file}`))
                return { content: `${file} does not exist`, status: StatusCode.ERR }

            const data = args.slice(1).join(" ")
            if (!data)
                return crv("No data given")

            fs.appendFileSync(`./command-results/${file}`, `${msg.author.id}: ${data};END\n`)
            return crv(`appended \`${data}\` to \`${file}\``)
        }, "Adds a line to a command file", {
            helpArguments: {
                "file": createHelpArgument("The command file list to add to", true),
                "data": createHelpArgument("The text to add to the file", true, "file")
            }
        })
    ]

    yield ["cmd-chain", createCommandV2(async ({ msg, args, opts, }) => {
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

        const stopAtCmd = !opts.getBool("E", true)

        let result = v2.expand(argList, simulatedOpts, (alias: any, preArgs: any) => {
            chain.push(showArgs ? preArgs : alias)
            if (commands.get(alias) && stopAtCmd) {
                return false
            }
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
        i: createHelpOption("Get the ith expansion of the chain"),
        E: createHelpOption("Keep expanding even after hitting a real command")
    })]

    yield ["rccmd", createCommandV2(async ({ msg, args, }) => {
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
        "ht", ccmdV2(async function({ msg, args, sendCallback, rawOpts: opts }) {
            let commands = getCommands()
            let files = []
            let commandsToUse = Object.fromEntries(commands.entries())
            if (args[0] && args[0] !== "?") {
                commandsToUse = {}
                for (let cmd of args) {
                    if (!commands.get(cmd)) continue
                    commandsToUse[cmd] = commands.get(cmd) as CommandV2
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
                let styles = ""
                if (fs.existsSync("help-styles.css")) {
                    styles = fs.readFileSync("help-styles.css", "utf-8")
                }
                styles = user_options.getOpt(msg.author.id, "css", styles)
                let html = `<style>
${styles}
</style>`
                for (let command in commandsToUse) {
                    html += generateHTMLFromCommandHelp(command, commands.get(command) as CommandV2)
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
        }, "A really funky help command", {
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
        })
    ]

    yield [
        "list-garbage-files", ccmdV2(async () => {
            return crv(fs.readdirSync("./garbage-files").join("\n") || "\\_\\_empty\\_\\_")
        }, "List files that happened as result of command")
    ]

    yield [
        "WHITELIST", ccmdV2(async function({ msg, args }) {
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
            // return configManager.ADMINS.includes(msg.author.id)
        }, "Whitelist, or unwhitelist a user from a command<br>syntax: [WHITELIST @user (a|r) cmd")
    ]

    yield [
        "RESET_CMDUSE", ccmdV2(async function() {
            useTracker.cmdUsage.reset()
            return { content: "cmd use reset", status: StatusCode.RETURN }
        }, "Resets cmduse", {
            permCheck: m => configManager.ADMINS.includes(m.author.id)
        })
    ]

    yield ["cmd-use", ccmdV2(async function({ rawOpts: opts }) {
        let data = useTracker.cmdUsage.generateUsageText()
            .split("\n")
            .map(v => v.split(":")) //map into 2d array, idx[0] = cmd, idx[1] = times used
            .filter(v => v[0] && !isNaN(Number(v[1]))) // remove empty strings
            .sort((a, b) => Number(a[1]) - Number(b[1])) // sort from least to greatest
            .reverse() //sort from greatest to least
            .map(v => `${v[0]}: ${v[1]}`) //turn back from 2d array into array of strings
            .join(String(opts['s'] ?? "\n"))
        return crv(data)
    }, "Gets a list of the most  used commands", {
        helpOptions: {
            s: createHelpOption("The seperator between commands", undefined, "\\n")
        }
    })
    ]

    yield ["abattle", ccmdV2(async function({ args }) {
        let responses: BattleResponses = {}
        if (fs.existsSync("./database/battleV2")) {
            let d = fs.readFileSync("./database/battleV2", "utf-8")
            responses = JSON.parse(d)
        }
        args.beginIter()
        let size = args[0]
        if (!["tiny", "small", "big", "medium", "huge"].includes(size)) {
            return crv("The first argument must be a size, eg: tiny/small/medium/big/huge", { status: StatusCode.ERR })
        }
        args = new ArgList(args.slice(1))
        let response = args.join(" ").split('\n')[0]
        if (!response) {
            return crv("No response", { status: StatusCode.ERR })
        }
        let effects = args.join(" ").split("\n").slice(1)
        let effectList: BattleResponse['effects'] = []
        for (let effect of effects) {
            let [t, players] = effect.split("|").map(v => v.trim())
            if (!["heal", "damage"].includes(t)) {
                return crv(`${t} must be heal or damage`, { status: StatusCode.ERR })
            }
            let playerNumbers: ["all"] | number[] = []
            for (let p of players.split(" ")) {
                if (p === "all") {
                    //@ts-ignore
                    playerNumbers.push(p as "all")
                    break
                }
                let n = Number(p)
                if (isNaN(n)) {
                    return crv(`${p} is not a player number`, { status: StatusCode.ERR })
                }
                playerNumbers.push(n)
            }
            effectList.push([t as BattleEffect, playerNumbers])
        }
        let added = {
            effects: effectList,
            response: response
        }
        if (!responses[size as keyof BattleResponses]) {
            responses[size as keyof BattleResponses] = [added]
        }
        else {
            responses[size as keyof BattleResponses]!.push(added)
        }
        fs.writeFileSync("./database/battleV2", JSON.stringify(responses))
        return crv(`added: ${JSON.stringify(added)}`)
    }, "Creates a battle response", {
        helpArguments: {
            size: helpArg("Amount of damage, can be<ul><li>tiny</li><li>small</li><li>medium</li><li>big</li><li>huge</li></ul>"),
            response: helpArg("Must be on its own line<br>What it says, <code>{user&lt;n&gt;}</code> will be replaced with a player, if n is all it gets replaced with everyone in the game, if it is 1, it will be replaced with player 1, and so on, <code>{amount}</code> will be replaced with the amount of damage/heal it does"),
            effects: helpArg("Each effect must be on its own line<br>format: <code>&lt;damage|heal&gt; | &lt;playern|all&gt;</code>")
        }
    })]

    yield ["alias", createCommandV2(async ({ msg, args, opts, sendCallback }) => {

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

            if (aliasV2s[newName] && aliasesV2[newName].creator !== msg.author.id) {
                return crv(`the alias ${newName} already exists, and you did not create it`, { status: StatusCode.ERR })
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

            if (aliasV2s[name]) {
                let failed = false
                if (aliasV2s[name].creator === msg.author.id || configManager.ADMINS.includes(msg.author.id)) {
                    if (!opts.getBool("y", false)) {
                        let validRespones = ["yes", "y"]
                        let resp = await promptUser(msg, "This alias already exists, do you want to override it [y/N]", sendCallback, {
                            timeout: 30000
                        })
                        failed = !resp || !validRespones.includes(resp.content.toLowerCase())
                    }
                }
                else failed = true
                if (failed)
                    return { content: `Failed to add ${name} it already exists as an aliasv2`, status: StatusCode.ERR }
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
            "oalt": (name: string, value: string) => commandHelpOptions[name].alternatives = value.split(","),
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
                    if (getAliasesV2()[name]) {
                        let failed = false
                        if (aliasV2s[name].creator === msg.author.id || configManager.ADMINS.includes(msg.author.id)) {
                            if (!opts.getBool("y", false)) {
                                let validRespones = ["yes", "y"]
                                let resp = await promptUser(msg, "This alias already exists, do you want to override it [y/N]", sendCallback, {
                                    timeout: 30000
                                })
                                failed = !resp || !validRespones.includes(resp.content.toLowerCase())
                            }
                        }
                        else failed = true
                        if (failed)
                            return { content: `Failed to add ${name} it already exists as an aliasv2`, status: StatusCode.ERR }
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
        "no-standardize": createHelpOption("Do not standardize the options, IFS, pipe-symbol, and 1-arg-string", undefined, "false"),
        "y": createHelpOption("If the alias already exists and you create it, override the alias")
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
                { name: "Heap memory (MiB)", value: String(process.memoryUsage().heapUsed / 1024 / 1024), inline: false }
            ])
            return { embeds: [embed], status: StatusCode.RETURN }
        } else return { content: formatPercentStr(fmt, { a: process.argv.join(" "), A: process.arch, p: String(process.pid), P: process.platform, H: String(process.memoryUsage().heapUsed / 1024 / 1024) }), status: StatusCode.RETURN }
    }, CAT, "Gets info about the process")]

    yield [
        "!!", ccmdV2(async function*({ msg, rawOpts: opts, runtime_opts }) {
            console.log("LAST", lastCommand[msg.author.id])
            if (opts['p'] || opts['check'] || opts['print'] || opts['see'])
                return { content: `\`${lastCommand[msg.author.id]}\``, status: StatusCode.RETURN }
            if (!lastCommand[msg.author.id]) {
                return { content: "You ignorance species, there have not been any commands run.", status: StatusCode.ERR }
            }

            return crv(lastCommand[msg.author.id], {
                recurse: true,
            })
        }, "Run the last command that was run", {
            helpOptions: {
                p: createHelpOption("Just echo the last command that was run instead of running it", ["print", "check", "see"])
            },
            permCheck: m => !m.author.bot
        })
    ]

    yield ["ping", ccmdV2(async ({ msg }) => crv(`${(new Date()).getMilliseconds() - msg.createdAt.getMilliseconds()}ms`), "Gets the bot's ping (very accurate)")]

    yield ["cmd-metadata", createCommandV2(async ({ args, opts }) => {
        let cmds = { ...Object.fromEntries(getCommands().entries()), ...getAliasesV2() }
        let cmdObjs: [string, (CommandV2 | AliasV2)][] = Array.from<string, [string, (CommandV2 | AliasV2)]>(args, (arg) => [arg, cmds[arg] as CommandV2 | AliasV2]).filter(v => v[1])
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
    }, CAT, "Get metadata about a command", { "...cmd": createHelpArgument("The command(s) to get metadata on", true) }, {
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
            let mainDisplay = `${major}.${minor}.${bug}`
            if (part) mainDisplay += `.${part}`
            if (alpha) mainDisplay = `A.${mainDisplay}`
            if (beta) mainDisplay = `B.${mainDisplay}`
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
        "changelog", ccmdV2(async function({ args, rawOpts: opts }) {
            if (opts['l']) {
                const tags = execSync("git tag --sort=committerdate | grep ^v")
                return crv(tags.toString("utf-8"))
            }
            let [start, stop] = args
            const version_regex = /(HEAD|\d+\.\d+\.\d+)/;
            const mostRecentVersion = execSync("git tag --sort=committerdate | tail -n1").toString("utf-8").trim()
            const lastVersion = execSync("git tag --sort=committerdate | tail -n2 | sed 1q").toString("utf-8").trim()

            if (start && start !== "HEAD") start = `v${start}`
            if (stop && stop !== "HEAD") stop = `v${stop}`

            if (start === undefined) {
                start = lastVersion
                stop = mostRecentVersion
            }
            else if (stop === undefined) {
                stop = "HEAD"
            }
            if (!version_regex.test(start) || !version_regex.test(stop)) {
                return crv(`invalid start/stop version`)
            }
            const changelog = execSync(`git log ${start}..${stop} --format=format:$(gen-chlog -f) | gen-chlog`).toString("utf-8")
            return crv(changelog || "No changes")

        }, "Get a changelog for a version", {
            helpOptions: {
                l: createHelpOption("List all versions")
            },
            helpArguments: {
                start: createHelpArgument("Starting version", false),
                end: createHelpArgument("Ending version", false, "start")
            }
        })
        ,
    ]

    yield [
        "shell", ccmdV2(async function({ msg, runtime_opts, symbols }) {
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

                for await (let result of globals.PROCESS_MANAGER.spawn_cmd({ msg, command: m.content, prefix: "", runtime_opts, symbols })) {
                    await cmds.handleSending(msg, result)
                }
            })

            collector.on("end", () => {
                globals.endCommand(msg.author.id, "shell")
            })

            return { noSend: true, status: StatusCode.RETURN }
        }, "Run commands without having to do a prefix")
    ]
}


