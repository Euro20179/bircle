import fs from 'fs'

import { aliases, aliasesV2, AliasV2, ccmdV2, CommandCategory, createCommand, createCommandV2, createHelpArgument, createHelpOption, expandAlias, getAliases, getAliasesV2, getCommands, getMatchCommands, handleSending, Interpreter, lastCommand, runCmd, StatusCode } from "./common_to_commands"
import globals = require("./globals")
import user_options = require("./user-options")
import economy = require("./economy")
import API = require("./api")
import { parseAliasReplacement, Parser } from "./parsing"
import { addToPermList, ADMINS, client, delVar, FILE_SHORTCUTS, getVar, prefix, removeFromPermList, saveVars, setVar, vars, VERSION, WHITELIST } from "./common"
import { fetchUser, generateSafeEvalContextFromMessage, getContentFromResult, getImgFromMsgAndOpts, getOpts, parseBracketPair, safeEval, format, choice, generateFileName, generateHTMLFromCommandHelp, renderHTML, listComprehension, cmdCatToStr, formatPercentStr, isSafeFilePath } from "./util"
import { Guild, Message, MessageEmbed } from "discord.js"
import { registerCommand } from "./common_to_commands"
import { execSync } from 'child_process'
import { performance } from 'perf_hooks'

import fetch from 'node-fetch'


export default function*(CAT: CommandCategory): Generator<[string, Command | CommandV2]> {

    yield ["stdin", createCommandV2(async ({ stdin, args }) => {
        let result: any = stdin
        args.forEach(arg => result = result[arg] ?? result)
        return { content: typeof result === 'string' ? result : JSON.stringify(result), status: StatusCode.RETURN }

    }, CAT, "get specific data from stdin/pipe")]

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
        "```bircle", createCommandV2(async ({ msg, args, commandBans: bans }) => {
            for (let line of args.join(" ").replace(/```$/, "").trim().split(";EOL")) {
                line = line.trim()
                if (!line) continue
                await runCmd(msg, line, globals.RECURSION_LIMIT - 1, false, bans)
            }
            return { noSend: true, status: StatusCode.RETURN }
        }, CAT, "Run some commands"),
    ]

    yield [
        "(", createCommandV2(async ({ msg, rawArgs: args, commandBans: bans, recursionCount: rec }) => {
            if (args[args.length - 1] !== ")") {
                return { content: "The last argument to ( must be )", status: StatusCode.ERR }
            }
            return { content: JSON.stringify(await runCmd(msg, args.slice(0, -1).join(" "), rec + 1, true, bans)), status: StatusCode.RETURN }
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
            let int = new Interpreter(msg, parser.tokens, parser.modifiers)
            await int.interprate()
            return { content: JSON.stringify(int), status: StatusCode.RETURN }
        }, "Interprate args"),
    ]

    yield [
        "typeof", ccmdV2(async function({ args }) {
            let res = []
            let aliasV2s = getAliasesV2()
            let matches = getMatchCommands()
            let cmds = getCommands()
            let av1;
            for (let cmd of args) {
                if (aliasV2s[cmd]) {
                    res.push("av2")
                }
                else if (matches[cmd]) {
                    res.push("match")
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
                else if ((av1 = await expandAlias(cmd)) && typeof av1 === 'object' && av1[0] && av1[0] !== cmd) {
                    res.push("av1")
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
            let av1;
            for (let cmd of args) {
                if (getAliasesV2()[cmd] || ((av1 = await expandAlias(cmd)) && typeof av1 === 'object' && av1[0] && av1[0] !== cmd)) {
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

        "option", createCommand(async (msg, args) => {
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
        "UNSET", createCommand(async (msg, args) => {
            let [user, optname] = args
            if (!user_options.isValidOption(optname)) {
                return { content: `${optname} is not a valid option`, status: StatusCode.ERR }
            }
            //@ts-ignore
            let member = await fetchUser(msg.guild, user)
            if (!member)
                return { content: `${user} not found`, status: StatusCode.ERR }
            user_options.unsetOpt(member.id, optname)
            user_options.saveUserOptions()
            return { content: `<@${member.id}> unset ${optname}`, status: StatusCode.RETURN }

        }, CAT, "Lets me unset people's options :watching:", null, null, null, (m) => ADMINS.includes(m.author.id)),
    ]

    yield [
        "options", createCommand(async (msg, _, __, opts, args) => {
            let user = msg.author.id
            if (opts['of']) {
                user = (await fetchUser(msg.guild as Guild, String(opts['of'])))?.id || msg.author.id
            }
            if (opts['l']) {
                return { content: user_options.allowedOptions.join("\n"), status: StatusCode.RETURN }
            }
            let userOpts = user_options.getUserOptions()[user]
            let optionToCheck = args.join(" ").toLowerCase()
            if (optionToCheck) {
                //@ts-ignore
                return { content: `**${optionToCheck}**\n${user_options.getOpt(user, optionToCheck, "\\_\\_unset\\_\\_")}`, status: StatusCode.RETURN, do_change_cmd_user_expansion: false }
            }
            let text = ""
            for (let opt of user_options.allowedOptions) {
                text += `**${opt}**\n${userOpts?.[opt] ?? "\\_\\_unset\\_\\_"}\n--------------------\n`
            }
            return { content: text, status: StatusCode.RETURN }
        }, CAT, "Prints the options for [option, and your values for them",
            {
                "option": createHelpArgument("The option to check the value of", false)
            }),
    ]

    yield [
        'get-source',
        {
            run: async (_msg, args, sendCallback) => {
                let opts;
                [opts, args] = getOpts(args)

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
                            status: StatusCode.RETURN
                        }
                    }
                    return { content: `./${file}.ts not found`, status: StatusCode.ERR }
                }
                let cmd = args[0]

                if (!cmd) {
                    return { content: "No cmd  chosen", status: StatusCode.ERR }
                }

                let attrs = args.slice(1)
                if (attrs.length === 0) {
                    attrs.push("run")
                }

                let command = Array.from(commands.entries()).filter(v => v[0] === cmd)[0]?.[1]
                if (!command)
                    return { content: "no command found", status: StatusCode.ERR }

                let results = []
                let curAttr = command
                for (let attr of attrs) {
                    for (let subAttr of attr.split(".")) {
                        //@ts-ignore
                        curAttr = curAttr[subAttr]
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

                return { content: `\`\`\`javascript\n${results.join("\n")}\n\`\`\``, status: StatusCode.RETURN }
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
                    'of-file': {
                        description: "If command is not given, use this to get the source of a file"
                    }
                }
            }
        },
    ]

    yield ["code-info", createCommandV2(async () => {
        let info = execSync("wc -l *.ts src/*.ts").toString("utf-8")
        return { content: info, status: StatusCode.RETURN }
    }, CAT)]

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
            run: async (msg, args, sendCallback) => {
                let opts;
                [opts, args] = getOpts(args)
                let prefix = String(opts['prefix'] || "__global__")
                if (opts['u']) {
                    prefix = msg.author.id
                }
                let names = args
                console.log(prefix, names)
                let deleted = []
                for (let name of names) {
                    if (vars[prefix]?.[name] !== undefined && typeof vars[prefix]?.[name] !== 'function') {
                        delVar(name, prefix)
                        deleted.push(name)
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
                saveVars()
                return { content: "Variables saved", status: StatusCode.RETURN }
            }, category: CAT,
            help: {
                info: "Save all variables"
            }
        },
    ]

    yield [
        "cmd-search",
        {
            run: async (_msg, args, sendCallback) => {
                let search = args.join(" ")
                let regexp;
                try {
                    regexp = new RegExp(search)
                }
                catch (err) {
                    return { content: "Invalid regex", status: StatusCode.ERR }
                }
                let commands = getCommands()
                let results = []
                for (let cmd in commands) {
                    if (cmd.match(regexp)) {
                        if (commands.get(cmd)?.help?.info) {
                            results.push(`**${cmd}**: ${renderHTML(commands.get(cmd)?.help?.info || "")}`)
                        }
                        else results.push(cmd)
                    }
                    else if (commands.get(cmd)?.help) {
                        let help = commands.get(cmd)?.help
                        if (help?.info?.match(search)) {
                            results.push(`**${cmd}**: ${renderHTML(commands.get(cmd)?.help?.info || "")}`)
                        }
                        else if (help?.tags?.includes(search)) {
                            results.push(`**${cmd}**: ${renderHTML(commands.get(cmd)?.help?.info || "")}`)
                        }
                    }
                }
                if (results.length == 0) {
                    return { content: "No results", status: StatusCode.ERR }
                }
                return { content: results.join("\n"), status: StatusCode.RETURN }
            },
            help: {
                info: "Search for commands with a search query"
            },
            category: CAT
        },
    ]

    yield [
        "dwiki", createCommand(async (msg, args) => {
            if (fs.existsSync(`./wiki/${args.join(" ")}.txt`)) {
                fs.rmSync(`./wiki/${args.join(" ")}.txt`)
                return { content: `removed: ${args.join(" ")}`, status: StatusCode.RETURN }
            }
            return { content: `${args.join(" ")} not found`, status: StatusCode.ERR }
        }, CAT, undefined, null, null, null, (m) => ADMINS.includes(m.author.id)),
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
                        //@ts-ignore
                        requirements = requirements.filter(v => !optional.includes(v))
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
                return { content: `${fn} is not a valid  api function\nrun \`${prefix}api -l\` to see api commands`, status: StatusCode.ERR }
            }
            let apiFn = API.APICmds[fn]
            let argsForFn: { [key: string]: any } = {}
            for (let i in opts) {
                if (!apiFn.requirements.includes(i))
                    continue;
                else {
                    argsForFn[i] = await API.handleApiArgumentType(msg, i, String(opts.get(i, undefined)))
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

        }, CAT, "Run low level bot commands<br>To see a list of api commands run <code>api -l</api>", {
            command: createHelpArgument("The command to run", true),
        }, {
            "<opt>": createHelpOption("Each command will require different options")

        })
    ]

    yield [
        "del", createCommandV2(async ({ msg, args, recursionCount: rec, commandBans: bans, opts }) => {
            if (!opts.getBool("N", false)) return { noSend: true, delete: true, status: StatusCode.RETURN }
            await runCmd(msg, args.join(" "), rec + 1, false, bans)
            return { noSend: true, delete: true, status: StatusCode.RETURN }
        }, CAT, "delete your message", {
            "...text": createHelpArgument("text"),
        }, {
            N: createHelpOption("Treat text as a command")
        })
    ]

    yield [
        "analyze-cmd", createCommand(async (msg, _, sc, opts, args, rec, bans) => {
            let results = []

            let text = args.join(" ").trim()
            let command = parseBracketPair(text, "()")

            text = text.slice(command.length + 2)

            let rv = await runCmd(msg, command, rec + 1, true, bans)
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
                            //@ts-ignore
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
        }, CAT),
    ]

    yield [
        "for", createCommandV2(async ({ msg, args, recursionCount, commandBans }) => {
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
                setVar(var_name, String(i), msg.author.id)
                for (let line of scriptLines) {
                    await runCmd(msg, line, recursionCount + 1, false, commandBans)
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
        }, CAT)
    ]

    yield [
        "if-cmd", createCommand(async (msg, _, sc, opts, args, rec, bans) => {
            let text = args.join(" ")

            let cmd = parseBracketPair(text, "()")
            text = text.slice(cmd.length + 2)

            let operator = parseBracketPair(text, "  ")
            text = text.slice(operator.length + 2)

            let value = parseBracketPair(text, "()")
            text = text.slice(value.length + 2)

            let rv = await runCmd(msg, cmd, rec + 1, true, bans) as CommandReturn
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
            let trueBlock = parseBracketPair(text, "{}")
            text = text.slice(trueBlock.length).trim().slice(1)

            //optional else
            let falseBlock = ""
            if (text.startsWith("else")) {
                text = text.slice("else".length)
                falseBlock = parseBracketPair(text, "{}")
                text = text.slice(falseBlock.length).trim().slice(1)
            }


            if (isTrue) {


                for (let line of trueBlock.split(";\n")) {
                    line = line.trim()
                    if (!line) continue
                    await runCmd(msg, line, rec + 1, false, bans)
                }
                return { noSend: true, status: StatusCode.RETURN }
            }
            else {
                for (let line of falseBlock.split(";\n")) {
                    let oldC = msg.content
                    line = line.trim()
                    if (!line) continue
                    await runCmd(msg, line, rec + 1, false, bans)
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
                let [condition, cmd] = args.join(" ").split(";")
                if (!cmd) {
                    return { content: "You are missing a ; after the condition", status: StatusCode.ERR }
                }
                cmd = cmd.split(";end")[0]
                let success;
                if (condition.trim().startsWith(`(${prefix}`)) {
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
                    let content = getContentFromResult(await runCmd(msg, command_to_run.slice(prefix.length), recursion_count + 1, true, command_bans) as CommandReturn).trim();
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
                    return await runCmd(msg, cmd.trim(), recursion_count + 1, true, command_bans) as CommandReturn
                }
                let elseCmd = args.join(" ").split(`${prefix}else;`).slice(1).join(`${prefix}else;`)?.trim()
                if (elseCmd) {
                    return await runCmd(msg, elseCmd.trim(), recursion_count, true, command_bans) as CommandReturn
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
        "getimg",
        {
            run: async (msg, _, sendCallback, opts, args) => {
                let img = getImgFromMsgAndOpts(opts, msg)
                if (opts['pop'] && msg.attachments.at(0)) {
                    msg.attachments.delete(msg.attachments.keyAt(0) as string)
                }
                return { content: String(img), status: StatusCode.RETURN }
            },
            help: {
                info: "find the link to the image that would be used if you gave the same options to an image command",
                options: {
                    img: {
                        description: "The image link to use"
                    },
                    pop: {
                        description: "If given, remove the attachment from message"
                    }
                }
            },
            category: CAT
        },
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
        "variablize", createCommand(async (msg, _, sc, opts, args) => {
            let vars = args
            let str = vars.map(v => {
                if (v.startsWith("\\")) {
                    return v.slice(1)
                }
                return getVar(msg, v)
            }).join(" ")
            return { content: str, status: StatusCode.RETURN }
        }, CAT, "Each arg in the arguments is treated as a string, unless it starts with \\"),
    ]

    yield [
        "uptime",
        {
            run: async (_msg: Message, args: ArgumentList) => {
                let uptime = client.uptime
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
            permCheck: m => ADMINS.includes(m.author.id),
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
        "timeit", ccmdV2(async function({ msg, args, sendCallback, recursionCount: rec, commandBans: bans }) {

            //TODO: add performance markers throughout the different steps of runninga  command
            let start = performance.now()
            await runCmd(msg, args.join(" ").trim(), rec + 1, false, bans)
            return { content: `${performance.now() - start}ms`, status: StatusCode.RETURN }
        }, "Time how long a command takes", {
            helpArguments: {
                "...command": createHelpArgument("The command to run", true)
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
                let cmd = cmdArgs.split(" ")[0]
                let expansion = await expandAlias(cmd, (alias) => {
                    console.log(alias)
                    if (alias === "do" || alias === "spam" || alias === "run") {
                        return false
                    }
                    return true
                })
                if (!expansion) {
                    return { content: "Cannot run do, spam, or run", status: StatusCode.ERR }
                }
                globals.SPAMS[id] = true
                while (globals.SPAMS[id] && times--) {
                    await runCmd(msg, format(cmdArgs, { "number": String(totalTimes - times), "rnumber": String(times + 1) }), globals.RECURSION_LIMIT, false, bans)
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
            //@ts-ignore
            let delay: number | null = opts.getNumber("delay", null) * 1000
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
        "stop",
        {
            run: async (_msg: Message, args: ArgumentList, sendCallback) => {
                if (!Object.keys(globals.SPAMS).length) {
                    return { content: "no spams to stop", status: StatusCode.ERR }
                }
                if (args[0]) {
                    if (globals.SPAMS[args[0]]) {
                        delete globals.SPAMS[args[0]]
                        return {
                            content: `stopping ${args[0]}`,
                            status: StatusCode.RETURN
                        }
                    }
                    return {
                        content: `${args[0]} is not a spam id`,
                        status: StatusCode.ERR
                    }
                }
                globals.SPAM_ALLOWED = false;
                for (let spam in globals.SPAMS) {
                    delete globals.SPAMS[spam]
                }
                return {
                    content: "stopping all",
                    status: StatusCode.RETURN
                }
            },
            category: CAT,
            help: {
                info: "Stop spams",
                arguments: {
                    "spam": {
                        description: "The spam to stop<br>If not given, will stop all spams",
                        required: false
                    }
                }
            }
        },
    ]

    yield [
        "vars", createCommandV2(async () => {
            let rv = Object.entries(vars).map(([prefix, varData]) => {
                return `**${prefix.replaceAll("_", "\\_")}**:\n` +
                    Object.keys(varData)
                        .map(v => `${v.replaceAll("_", "\\_")}`)
                        .join("\n") +
                    "\n-------------------------"
            }).join("\n")
            return { content: rv, status: StatusCode.RETURN }

        }, CAT, "List all variables")
    ]

    yield [
        "run",
        {
            run: async (msg: Message, args, sendCallback, _, _2, recursion, bans) => {
                if (recursion >= globals.RECURSION_LIMIT) {
                    return { content: "Cannot run after reaching the recursion limit", status: StatusCode.ERR }
                }
                let opts: Opts;
                [opts, args] = getOpts(args)
                let file = msg.attachments.at(0)
                let text;
                if (!file) {
                    text = args.join(" ").replaceAll("```", "").split(";EOL")
                }
                else {
                    let k = msg.attachments.keyAt(0) as string
                    msg.attachments.delete(k)
                    //@ts-ignore
                    let data = await fetch.default(file.url)
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
                    if (line.startsWith(prefix)) {
                        line = line.slice(prefix.length)
                    }
                    await runCmd(msg, parseRunLine(line), recursion + 1, false, bans)
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
        "gvar",
        {
            run: async (msg, args, sendCallback) => {
                let [scope, ...nameList] = args.join(" ").split(":")
                let name = nameList.join(":")
                if (scope == "%") {
                    scope = msg.author.id
                }
                else if (scope == ".") {
                    let v = getVar(msg, name)
                    if (v)
                        return { content: String(v), status: StatusCode.RETURN }
                    else return { content: `\\v{${args.join(" ")}}`, status: StatusCode.RETURN }
                }
                let v = getVar(msg, name, scope)
                if (v)
                    return { content: String(v), status: StatusCode.RETURN }
                else return { content: `\\v{${args.join(" ")}}`, status: StatusCode.RETURN }
            }, category: CAT,
            help: {
                info: "Get the value of a variable"
            }
        },
    ]
    yield [
        "var",
        {
            run: async (msg: Message, args: ArgumentList, sendCallback) => {
                let opts;
                [opts, args] = getOpts(args)
                let [name, ...value] = args.join(" ").split("=").map(v => v.trim())
                console.log(name, value)
                if (!value.length) {
                    return { content: "no value given, syntax `[var x=value", status: StatusCode.ERR }
                }
                let realVal = value.join("=")
                if (opts['prefix']) {
                    let prefix = String(opts['prefix'])
                    if (prefix.match(/^\d{18}/)) {
                        return { content: "No ids allowed", status: StatusCode.ERR }
                    }
                    setVar(name, realVal, prefix)
                    if (!opts['silent'])
                        return { content: getVar(msg, name, prefix), status: StatusCode.RETURN }
                }
                else if (opts['u']) {
                    setVar(name, realVal, msg.author.id)
                    if (!opts['silent'])
                        return {
                            content: getVar(msg, name, msg.author.id),
                            status: StatusCode.RETURN
                        }
                }
                else {
                    setVar(name, realVal)
                    console.log(getVar(msg, name))
                    if (!opts['silent'])
                        return {
                            content: getVar(msg, name),
                            status: StatusCode.RETURN
                        }
                }
                return { noSend: true, status: StatusCode.RETURN }
            },
            help: {
                arguments: {
                    "name=value": {
                        description: "name is the variable name, value is the value",
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
                //@ts-ignore
                const file = FILE_SHORTCUTS[args[0]] || args[0]

                if (!file) {
                    return {
                        content: "Nothing given to add to",
                        status: StatusCode.ERR
                    }
                }

                if (file.match(/\/?\.\.\//)) {
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
                    return v.trim() === msg.author.id || ADMINS.includes(msg.author.id) ? i : undefined
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
        "command-file",
        {
            run: async (_msg: Message, args: ArgumentList, sendCallback) => {
                let opts
                [opts, args] = getOpts(args)
                if (opts["l"]) {
                    return {
                        content: `\`\`\`
${fs.readdirSync("./command-results").join("\n")}
\`\`\`
`,
                        status: StatusCode.RETURN
                    }
                }
                //@ts-ignore
                const file = FILE_SHORTCUTS[args[0]] || args[0]
                if (!file) {
                    return {
                        content: "Nothing given to add to",
                        status: StatusCode.ERR
                    }
                }
                if (!isSafeFilePath(file)) {
                    return { content: "<:Watching1:697677860336304178>", status: StatusCode.ERR }
                }
                if (!fs.existsSync(`./command-results/${file}`)) {
                    return {
                        content: "file does not exist",
                        status: StatusCode.ERR
                    }
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
            },
            help: {
                arguments: {
                    file: {
                        description: "the file to see"
                    }
                }
            },
            category: CAT
        },
    ]

    yield [
        'get-source()', ccmdV2(async function({ args, opts }) {
            if (opts.getBool("l", false)) {
                return { content: `modules:\`\`\`\nutil\ncommon_to_commands\nglobals\ncommon\n\`\`\``, status: StatusCode.RETURN }
            }

            let mod;

            if (mod = opts.getString("of", "")) {
                let keyValues: string[] = []
                switch (mod) {
                    case 'util':
                        keyValues = Object.keys(require("./util"))
                        break
                }
                console.log(keyValues)
                return {
                    content: keyValues.join('\n'),
                        status: StatusCode.RETURN
                }
            }

            let data = safeEval(args.join(" "), {
                util: require("./util"),
                common_to_commands: require("./common_to_commands"),
                globals: require("./globals"),
                common: require("./common")
            }, {})
            return { content: String(data), status: StatusCode.RETURN }
        }, "Stringifies an internal function", {
            helpOptions: {
                l: createHelpOption("List the different modules"),
                of: createHelpOption("List the different functions in a module")
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
                //@ts-ignore
                const file = FILE_SHORTCUTS[args[0]] || args[0]
                if (!file) {
                    return {
                        content: "Nothing given to add to",
                        status: StatusCode.ERR
                    }
                }
                if (file.match(/[\.]/)) {
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
        if (getAliases()[args[0]]) {
            return { content: "V1", status: StatusCode.RETURN }
        }
        else if (getAliasesV2()[args[0]]) {
            return { content: "V2", status: StatusCode.RETURN }
        }
        return { content: "None", status: StatusCode.ERR }

    }, CAT)]

    yield ["cmd-chainv2", createCommandV2(async ({ msg, args, opts, rawArgs, sendCallback, recursionCount, commandBans }) => {

        if (getAliases()[args[0]]) {
            await handleSending(msg, { content: `${args[0]} is an alias command, running \`cmd-chain\` instead`, status: StatusCode.INFO }, sendCallback);
            return (getCommands().get('cmd-chain') as Command).run(msg, rawArgs, sendCallback, getOpts(rawArgs)[0], args, recursionCount, commandBans)
        }

        let v2 = getAliasesV2()[args[0]]
        let showArgs = true
        if (opts.getBool("n", false) || opts.getBool("no-args", false)) {
            showArgs = false
        }
        let chain: string[] = [args[0]]
        if (!v2) {
            return { noSend: true, status: StatusCode.RETURN }
        }

        let result = v2.expand(msg, args.slice(1), getOpts(rawArgs)[0], (alias: any, preArgs: any) => {
            if (showArgs) {
                chain.push(preArgs)
            }
            else {
                chain.push(alias)
            }
            return true
        })
        if (!result) {
            return { content: "failed to expand alias", status: StatusCode.ERR }
        }
        for (let opt of Object.entries(opts)) {
            delVar(`-${opt[0]}`, msg.author.id)
        }
        return { content: `${chain.join(" -> ")}`, status: StatusCode.RETURN }

    }, CAT)]

    yield [
        "cmd-chain",
        {
            run: async (msg, args, sendCallback) => {
                let opts;
                [opts, args] = getOpts(args)
                let showArgs = true
                let expand = opts['e'] || false
                if (opts['n'] || opts['no-args']) {
                    showArgs = false
                }
                let chain: string[] = [args[0]]
                let a = ""
                if (getAliasesV2()[args[0]]) {
                    return { content: `${args[0]} is an aliasv2 command, run \`cmd-chainv2\` instead`, status: StatusCode.ERR }
                }
                if (getAliases()[args[0]]) {
                    let result = expandAlias(args[0], (alias: any, preArgs: any) => {
                        if (expand) {
                            a = parseAliasReplacement(msg, preArgs.join(" "), args.slice(1)) + " " + a + " "
                        }
                        else {
                            a = preArgs.join(" ") + " " + a + " "
                        }
                        if (showArgs) {
                            chain.push(`${alias} ${a}`)
                        }
                        else {
                            chain.push(alias)
                        }
                        return true
                    })
                    if (!result) {
                        return { content: "failed to expand alias", status: StatusCode.ERR }
                    }
                    return { content: `${chain.join(" -> ")}`, status: StatusCode.RETURN }
                }
                return { content: `${args[0].trim() || "No command given"}`, status: StatusCode.ERR }
            },
            help: {
                info: "Shows which command the alias turns into when run",
                arguments: {
                    cmd: {
                        description: "The command to get the chain for"
                    }
                },
                options: {
                    "n": {
                        description: "Do not show extra arguments",
                        alternates: ["no-args"]
                    },
                    "e": {
                        description: "Expand alias arguments, eg: {sender}"
                    }
                }
            },
            category: CAT
        },
    ]

    yield ["rccmdv2", createCommandV2(async ({ msg, args }) => {
        let cmdName = args[0]
        let aliasesV2 = getAliasesV2()
        if (aliasesV2[cmdName] && aliasesV2[cmdName].creator === msg.author.id) {
            delete aliasesV2[cmdName]
            fs.writeFileSync("./command-results/aliasV2", JSON.stringify(aliasesV2))
            getAliasesV2(true)
            return { content: `Removed: ${cmdName}`, status: StatusCode.RETURN }
        }
        else if (!aliasesV2[cmdName]) {
            return { content: `${cmdName} does not exist`, status: StatusCode.ERR }
        }
        else {
            return { content: `You did not create ${cmdName}`, status: StatusCode.ERR }
        }
    }, CAT)]

    yield [
        "rccmd",
        {
            run: async (msg, args, sendCallback) => {
                let name = args[0]
                if (!name) {
                    return {
                        content: "No command name given",
                        status: StatusCode.ERR
                    }
                }
                let commands = args.map(v => v.trim())
                let data = fs.readFileSync("command-results/alias", "utf-8").split(";END")
                let successfullyRemoved = []
                for (let i = 0; i < commands.length; i++) {
                    let command = commands[i]
                    let line = data.filter(v => v && v.split(" ")[1]?.trim() == command)[0]
                    let idx = data.indexOf(line)
                    if (idx >= 0) {
                        let [user, _] = line.trim().split(":")
                        user = user.trim()
                        if (user != msg.author.id && ADMINS.indexOf(msg.author.id) < 0) {
                            await handleSending(msg, { content: `Cannot remove ${command}`, status: StatusCode.INFO }, sendCallback)
                        }
                        else {
                            successfullyRemoved.push(command)
                            data.splice(idx, 1)
                        }
                    }
                }
                fs.writeFileSync("command-results/alias", data.join(";END"))
                getAliases(true)
                return {
                    content: `Removed: ${successfullyRemoved.join(", ")}`,
                    status: StatusCode.RETURN
                }
            },
            category: CAT,
            help: {
                info: "Remove an aliasv1",
                arguments: {
                    command: createHelpArgument("The command to remove")
                }
            }
        },
    ]

    yield [
        "ht", {
            //help command
            run: async (msg, args, sendCallback) => {

                let commands = getCommands()
                let opts
                [opts, args] = getOpts(args)
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
                if (Object.keys(commandsToUse).length < 1) {
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
                        html += generateHTMLFromCommandHelp(command, commands.get(command))
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
                    //@ts-ignore
                    const ext = exts[fmt] || fmt
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
                if (fs.existsSync("output.txt")) {
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
            category: CAT

        },
    ]

    yield [
        "WHITELIST",
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
                    addToPermList(WHITELIST, "whitelists", user, cmds)

                    return {
                        content: `${user} has been whitelisted to use ${cmds.join(" ")}`,
                        status: StatusCode.RETURN
                    }
                } else {
                    //@ts-ignore
                    removeFromPermList(WHITELIST, "whitelists", user, cmds)
                    return {
                        content: `${user} has been removed from the whitelist of ${cmds.join(" ")}`,
                        status: StatusCode.RETURN
                    }
                }
            },
            permCheck: msg => {
                return ADMINS.includes(msg.author.id)
            },
            help: {
                info: "Whitelist, or unwhitelist a user from a command<br>syntax: [WHITELIST @user (a|r) cmd"
            },
            category: CAT
        },
    ]

    yield [
        "cmd-use",
        {
            run: async (_msg: Message, args: ArgumentList, sendCallback) => {
                let opts;
                [opts, args] = getOpts(args)
                let data = globals.generateCmdUseFile()
                    .split("\n")
                    .map(v => v.split(":")) //map into 2d array, idx[0] = cmd, idx[1] = times used
                    .filter(v => v[0] && !isNaN(Number(v[1]))) // remove empty strings
                    //@ts-ignore
                    .sort((a, b) => a[1] - b[1]) // sort from least to greatest
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

    yield ["aliasv2", createCommandV2(async ({ msg, args, opts }) => {

        if (!opts.getBool('no-easy', false)) {
            let [name, ...cmd] = args
            if (!name) {
                return { content: "No name given", status: StatusCode.RETURN }
            }
            if (getCommands().get(name) || getAliases()[name] || getAliasesV2()[name]) {
                return { content: `${name} already exists`, status: StatusCode.ERR }
            }
            let command = cmd.join(" ")
            const alias = new AliasV2(name, command, msg.author.id, { info: command })
            if (opts.getBool("no-args", false)) {
                alias.setAppendArgs(false)
            }
            if (opts.getBool("no-opts", false)) {
                alias.setAppendOpts(false)
            }
            aliasesV2[name] = alias
            fs.writeFileSync("./command-results/aliasV2", JSON.stringify(aliasesV2))
            getAliasesV2(true)
            return { content: `added: ${alias.toJsonString()}`, status: StatusCode.RETURN }
        }

        let name: string = ""

        let helpInfo: string = "";

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
                    if (getCommands().get(name) || getAliases()[name] || getAliasesV2()[name]) {
                        return { content: `${name} already exists`, status: StatusCode.ERR }
                    }
                    break
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

        const alias = new AliasV2(name, command, msg.author.id, helpMetaData)

        if (getAliases()[name]) {
            return { content: `Failed to add ${name} it already exists as an alias`, status: StatusCode.ERR }
        }
        else if (getAliasesV2()[name]) {
            return { content: `Failed to add ${name} it already exists as an aliasv2`, status: StatusCode.ERR }
        }
        else if (getCommands().get(name)) {
            return { content: `Failed to add "${name}", it is a builtin`, status: StatusCode.ERR }
        }

        if (opts.getBool("no-args", false)) {
            alias.setAppendArgs(false)
        }
        if (opts.getBool("no-opts", false)) {
            alias.setAppendOpts(false)
        }

        aliasesV2[name] = alias
        fs.writeFileSync("./command-results/aliasV2", JSON.stringify(aliasesV2))
        getAliasesV2(true)
        return { content: `added: ${alias.toJsonString()}`, status: StatusCode.RETURN }
    }, CAT, "<b>There are 2 Modes</b><ul><li>default: How alias has always worked &lt;name&gt; &lt;command&gt;</li><li>no-easy: use the -no-easy option enable this</li></ul><br>Create an aliasv2<br>By default, the user arguments will be appended to the end of exec<br>To access an option in the exec, use \${%:-option-name}, for args use \${%:\\_\\_arg[&lt;i&gt;]}<br>raw args are also accessable with \\_\\_rawarg instead of \\_\\_arg.<br>To access all args, use \${%:\\_\\_arg[...]}<br><br><b>THE REST ONLY APPLIES TO no-easy MODE</b><br>Each argument should be on its own line", {
        "name": createHelpArgument("<code>name</code> followed by the alias name", true),
        "help-info": createHelpArgument("<code>help-info</code> followed by some help information for the command", false),
        "option": createHelpArgument("<code>option</code> followed by the name of the option, followed by a |, then <code>desc|alt|default</code>, followed by another | and lastly the text<br>if desc is chosen, text is a description of the option<br>if alt is chosen, text is a comma separated list of options that do the same thing<br>if default is chosen, text is the default if option is not given.", false),
        "argument": createHelpArgument("<code>argument</code> followed by the name of the option, followed by a |, then <code>desc|required|default</code>, followed by another | and lastly the text<br>if desc is chosen, text is a description of the argument<br>if required is chosen, text is true/false<br>if default is chosen, text is the default if argument is not given.", false),
        "cmd": createHelpArgument("<code>cmd</code> followed by the command to run <b>THIS SHOULD BE LAST</b>", true),
    }, {
        "no-args": createHelpOption("Do not append user arguments to the end of exec (does not requre -no-easy)", undefined, "false"),
        "no-opts": createHelpOption("Do not append user opts to the end of exec (does not require -no-easy)", undefined, "false"),
        "no-easy": createHelpArgument("Use the full argument list instead of [aliasv2 &lt;name&gt; &lt;command&gt;")
    })]

    yield ["process", createCommandV2(async ({ args }) => {
        let fmt = args.join(" ")
        if (!fmt) {
            let embed = new MessageEmbed()
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
        "alias",
        {
            run: async (msg: Message, args: ArgumentList, sendCallback) => {
                let cmd
                [cmd, ...args] = args
                if (!cmd) {
                    return { content: "No  alias name given", status: StatusCode.ERR }
                }
                cmd = cmd.trim()
                if (cmd.includes(" ") || cmd.includes("\n")) {
                    return { content: "Name cannot have space or new lines", status: StatusCode.ERR }
                }
                args = args.slice(1)
                if (!args) {
                    return { content: "No command given", status: StatusCode.ERR }
                }
                if (getAliases()[cmd]) {
                    return { content: `Failed to add "${cmd}", it already exists`, status: StatusCode.ERR }
                }
                if (getAliasesV2()[cmd]) {
                    return { content: `Failed to add ${cmd} it already exists as an aliasv2`, status: StatusCode.ERR }
                }
                if (getCommands().get(cmd)) {
                    return { content: `Failed to add "${cmd}", it is a builtin`, status: StatusCode.ERR }
                }
                fs.appendFileSync("command-results/alias", `${msg.author.id}: ${cmd} ${cmd} ${args.join(" ")};END\n`)
                getAliases(true)
                return {
                    content: `Added \`${cmd}\` = \`${cmd}\` \`${args.join(" ")}\``,
                    status: StatusCode.RETURN
                }
            },
            category: CAT,
            help: {
                info: "Create an alias",
                arguments: {
                    command: createHelpArgument("The command name", true),
                    command_to_run: createHelpArgument("The command to run", true),
                    args: createHelpArgument("Arguments for the command to run", false)
                }
            }
        },
    ]

    yield [
        "!!",
        {
            run: async (msg: Message, args: ArgumentList, sendCallback, _, __, rec, bans) => {
                let opts;
                [opts, args] = getOpts(args)
                if (opts['check'] || opts['print'] || opts['see'])
                    return { content: `\`${lastCommand[msg.author.id]}\``, status: StatusCode.RETURN }
                if (!lastCommand[msg.author.id]) {
                    return { content: "You ignorance species, there have not been any commands run.", status: StatusCode.ERR }
                }
                msg.content = lastCommand[msg.author.id]
                return await runCmd(msg, lastCommand[msg.author.id].slice(user_options.getOpt(msg.author.id, "prefix", prefix).length), rec + 1, true, bans) as CommandReturn
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

    yield [
        "ping", createCommand(async (msg, _args, sendCallback) => {
            return { content: `${(new Date()).getMilliseconds() - msg.createdAt.getMilliseconds()}ms`, status: StatusCode.RETURN }
        },
            CAT,
            "Gets the bot's ping (very accurate)"
        )
    ]

    yield ["cmd-metadata", createCommandV2(async ({ args, opts }) => {
        let cmds = { ...Object.fromEntries(getCommands().entries()), ...getAliasesV2() }
        let cmdObjs: [string, (Command | CommandV2 | AliasV2)][] = listComprehension<string, [string, (Command | CommandV2 | AliasV2)]>(args, (arg) => [arg, cmds[arg] as Command | CommandV2 | AliasV2]).filter(v => v[1])
        if (opts.getBool("raw", false)) {
            return {
                content: listComprehension<typeof cmdObjs[number], string>(cmdObjs, ([name, cmd]) => `\\["${name}", ${JSON.stringify(cmd)}]`).join("\n"),
                status: StatusCode.RETURN
            }
        }
        let fmt: string = opts.getString("f", opts.getString("fmt", "%i"))
        let av2fmt: string = opts.getString("fa", opts.getString("fmt-alias", "%i"))
        return {
            content: listComprehension<typeof cmdObjs[number], string>(cmdObjs, ([name, cmd]) =>
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
            console.log(VERSION)
            let { major, minor, bug, part, alpha, beta } = VERSION
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
            run: async (_msg, args, sendCallback) => {
                let opts;
                [opts, args] = getOpts(args)
                if (opts['l']) {
                    return { content: fs.readdirSync('changelog').map(v => v.replace(/\.md/, "")).join("\n"), status: StatusCode.RETURN }
                }
                let version = args[0]
                if (!args[0]) {
                    version = (() => {
                        let d = `${VERSION.major}.${VERSION.minor}.${VERSION.bug}`
                        if (VERSION.part)
                            d += `.${VERSION.part}`
                        if (VERSION.alpha)
                            d = `A.${d}`
                        if (VERSION.beta)
                            d = `B.${d}`
                        return d
                    })()
                }
                if (!fs.existsSync(`changelog/${version}.md`)) {
                    return { content: `${version} does not exist`, status: StatusCode.ERR }
                }
                if (opts['f']) {
                    return { files: [{ attachment: `changelog/${version}.md`, name: `${version}.md`, description: `Update: ${version}` }], deleteFiles: false, status: StatusCode.RETURN }
                }
                return { content: fs.readFileSync(`changelog/${version}.md`, "utf-8"), status: StatusCode.RETURN }
            },
            help: {
                info: "Get changelog for a version",
                options: {
                    l: {
                        description: "List all versions"
                    },
                    f: {
                        description: "Get changelog file instead of text"
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
            console.log(this)
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

                let rv = await runCmd(m, m.content, recursionCount + 1, true, commandBans)
                console.log(rv)
                await handleSending(m, rv, sendCallback, recursionCount + 1)
            })

            collector.on("end", () => {
                globals.endCommand(msg.author.id, "shell")
            })

            return { noSend: true, status: StatusCode.RETURN }
        }, "Run commands without having to do a prefix")
    ]
}

