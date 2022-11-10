import fs from 'fs'

import { CommandCategory, createCommand, createCommandV2, createHelpArgument, createHelpOption, expandAlias, getAliases, getCommands, handleSending, Interprater, lastCommand, runCmd, StatusCode } from "./common_to_commands"
import globals = require("./globals")
import user_options = require("./user-options")
import economy = require("./economy")
import API = require("./api")
import { parseAliasReplacement, Parser } from "./parsing"
import { ADMINS, client, getVar, prefix, saveVars, setVar, vars, VERSION } from "./common"
import { fetchUser, generateSafeEvalContextFromMessage, getContentFromResult, getImgFromMsgAndOpts, getOpts, parseBracketPair, safeEval, format, choice, generateFileName, generateHTMLFromCommandHelp } from "./util"
import { Guild, Message } from "discord.js"
import { registerCommand } from "./common_to_commands"
import { execSync } from 'child_process'

export default function() {
    registerCommand(
        "```bircle", createCommandV2(async ({ msg, args, commandBans: bans }) => {
            for (let line of args.join(" ").replace(/```$/, "").trim().split(";EOL")) {
                line = line.trim()
                if (!line) continue
                await runCmd(msg, line, globals.RECURSION_LIMIT - 1, false, bans)
            }
            return { noSend: true, status: StatusCode.RETURN }
        }, CommandCategory.META, "Run some commands"),
    )

    registerCommand(
        "(", createCommandV2(async ({ msg, rawArgs: args, commandBans: bans, recursionCount: rec }) => {
            if (args[args.length - 1] !== ")") {
                return { content: "The last argument to ( must be )", status: StatusCode.ERR }
            }
            return { content: JSON.stringify(await runCmd(msg, args.slice(0, -1).join(" "), rec + 1, true, bans)), status: StatusCode.RETURN }
        }, CommandCategory.META),
    )

    registerCommand(
        'tokenize', createCommandV2(async ({ msg, rawArgs: args }) => {
            let parser = new Parser(msg, args.join(" ").trim())
            await parser.parse()
            return { content: parser.tokens.map(v => JSON.stringify(v)).join(";\n") + ";", status: StatusCode.RETURN }
        }, CommandCategory.META, "Tokenize command input"),
    )

    registerCommand(
        "interprate", createCommandV2(async ({ msg, rawArgs: args }) => {
            let parser = new Parser(msg, args.join(" ").trim())
            await parser.parse()
            let int = new Interprater(msg, parser.tokens, parser.modifiers)
            await int.interprate()
            return { content: JSON.stringify(int), status: StatusCode.RETURN }
        }, CommandCategory.META, "Interprate args"),
    )

    registerCommand(
        "is-alias", createCommand(async (msg, args) => {
            let res = []
            for (let cmd of args) {
                if (getCommands()[cmd] === undefined) {
                    res.push(true)
                }
                else {
                    res.push(false)
                }
            }
            return { content: res.join(","), status: StatusCode.RETURN }
        }, CommandCategory.META, "Checks if a command is an alias"),
    )

    registerCommand(

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
        }, CommandCategory.META,
            "Sets a user option",
            {
                option: createHelpArgument("The option to set", true),
                value: createHelpArgument("The value to set the option to, if not given, option will be unset", false)
            },
            null,
            null,
            (m) => !m.author.bot),
    )

    registerCommand(
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

        }, CommandCategory.META, "Lets me unset people's options :watching:", null, null, null, (m) => ADMINS.includes(m.author.id)),
    )

    registerCommand(
        "options", createCommand(async (msg, _, __, opts, args) => {
            let user = msg.author.id
            if (opts['of']) {
                user = (await fetchUser(msg.guild as Guild, String(opts['of'])))?.id || msg.author.id
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
        }, CommandCategory.META, "Prints the options for [option, and your values for them",
            {
                "option": createHelpArgument("The option to check the value of", false)
            }),
    )

    registerCommand(
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
                let command = Object.keys(commands).filter(v => v.toLowerCase() === cmd.toLowerCase())
                if (!command.length)
                    return { content: "no command found", status: StatusCode.ERR }
                return { content: String(commands[command[0]].run), status: StatusCode.RETURN }
            }, category: CommandCategory.META,
            help: {
                info: "Get the source code of a file, or a command",
                arguments: {
                    command: {
                        description: "The command to get the source code  of",
                        required: false
                    }
                },
                options: {
                    'of-file': {
                        description: "If command is not given, use this to get the source of a file"
                    }
                }
            }
        },
    )

    registerCommand(
        ".economy", createCommand(async (msg, _, sc, opts, args) => {
            let rw = args[0]
            let data = []
            let econ = economy.getEconomy()
            if (rw === "write") {
                for (let user in econ) {
                    let user_data = econ[user]
                    data.push(Buffer.from(user))
                    data.push(Buffer.from(Number(String(user_data.money).split(".")[0]).toString(16), "hex"))
                    data.push(Buffer.from("."))
                    data.push(Buffer.from(Number(String(user_data.money).split(".")[1]).toString(16), "hex"))
                }
            }
            data.forEach(t => {
                fs.appendFileSync("./test.economy", t)
            })
            return { noSend: true, status: StatusCode.RETURN }
        }, CommandCategory.META),
    )

    registerCommand(
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
            category: CommandCategory.META
        },
    )

    registerCommand(
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
            }, category: CommandCategory.META,
            help: {
                info: "Sends the raw inventory.json database file"
            }
        },
    )

    registerCommand(
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
                let deleted = []
                for (let name of names) {
                    if (vars[prefix]?.[name] !== undefined && typeof vars[prefix]?.[name] !== 'function') {
                        delete vars[prefix][name]
                        deleted.push(name)
                    }
                }
                return { content: `Deleted: \`${deleted.join(", ")}\``, status: StatusCode.RETURN }
            }, category: CommandCategory.META,
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
    )

    registerCommand(
        "savev",
        {
            run: async (_msg, _args, sendCallback) => {
                saveVars()
                return { content: "Variables saved", status: StatusCode.RETURN }
            }, category: CommandCategory.META
        },
    )

    registerCommand(
        "nothappening",
        {
            run: async (_msg, _args, sendCallback) => {
                return { content: ["reddit - impossible to set up api", "socialblade - socialblade blocks automated web requests", "donate/work command -boring (use last-run)"].join("\n"), status: StatusCode.RETURN }
            },
            category: CommandCategory.META
        },
    )

    registerCommand(
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
                        if (commands[cmd].help?.info) {
                            results.push(`**${cmd}**: ${commands[cmd].help?.info}`)
                        }
                        else results.push(cmd)
                    }
                    else if (commands[cmd].help) {
                        let help = commands[cmd].help
                        if (help?.info?.match(search)) {
                            results.push(`**${cmd}**: ${commands[cmd].help?.info}`)
                        }
                        else if (help?.tags?.includes(search)) {
                            results.push(`**${cmd}**: ${commands[cmd].help?.info}`)
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
            category: CommandCategory.META
        },
    )

    registerCommand(
        "dwiki", createCommand(async (msg, args) => {
            if (fs.existsSync(`./wiki/${args.join(" ")}.txt`)) {
                fs.rmSync(`./wiki/${args.join(" ")}.txt`)
                return { content: `removed: ${args.join(" ")}`, status: StatusCode.RETURN }
            }
            return { content: `${args.join(" ")} not found`, status: StatusCode.ERR }
        }, CommandCategory.META, undefined, null, null, null, (m) => ADMINS.includes(m.author.id)),
    )

    registerCommand(
        "api",
        {
            run: async (msg, args, sendCallback) => {
                let opts: Opts;
                [opts, args] = getOpts(args)
                if (opts['l']) {
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
                        argsForFn[i] = await API.handleApiArgumentType(msg, i, String(opts[i]))
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
            }, category: CommandCategory.META
        },
    )

    registerCommand(
        "del",
        {
            run: async (msg, args, sendCallback, _, __, rec, bans) => {
                let opts;
                [opts, args] = getOpts(args)
                if (!opts['N']) return { noSend: true, delete: true, status: StatusCode.RETURN }
                await runCmd(msg, args.join(" "), rec + 1, false, bans)
                return { noSend: true, delete: true, status: StatusCode.RETURN }
            },
            help: {
                arguments: {
                    text: {
                        description: "Text"
                    }
                },
                options: {
                    "N": {
                        description: "Treat text as a command"
                    }
                }
            },
            category: CommandCategory.META
        },
    )

    registerCommand(
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
        }, CommandCategory.META),
    )

    registerCommand(
        "if-cmd", createCommand(async (msg, _, sc, opts, args, rec, bans) => {
            let text = args.join(" ")

            console.log(text)

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
            text = text.slice(trueBlock.length + 2)

            let falseBlock = parseBracketPair(text, "{}")
            text = text.slice(trueBlock.length + 2)


            console.log(isTrue)
            if (isTrue) {


                for (let line of trueBlock.split(";\n")) {
                    line = line.trim()
                    console.log(line)
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
        }, CommandCategory.META),
    )

    registerCommand(
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
            category: CommandCategory.META,
            help: {
                info: "Evaluate bircle commands conditionally!<br>There are 2 versions of the if statement<ul><li><b>1</b>: standard javascript expression</li><li><b>2</b>:([bircle-command) &lt;operator&gt; (value)</ul><br><b>For the 2nd version</b>, the first set of parentheses indicate a command to run, the operator may be one of the standard comparison operators<br>In addition, the <code>:</code> operator may be used to check if the result of the commands includes the regex expression provided in  the second set of parentheses.<br>Lastly, the <code>includes</code> operator may be used to check if the expected value is in the result of the command.<br>After the condition must be a ;<br><br>after the ; must be  a command  to run followed by <code>;end</code><br>lastly <code>[else;</code> &lt;command&gt; may optionally be added on a new line<br>If  the condition is false and an <code[else;</code> is not provided a ? will be sent",
            }
        },
    )

    registerCommand(
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
            category: CommandCategory.META
        },
    )

    registerCommand(
        "argc",
        {
            run: async (_msg, args) => {
                return { content: String(args.length), status: StatusCode.RETURN }
            },
            help: {
                info: "Prints the number of arguments given to this command"
            },
            category: CommandCategory.META
        },
    )

    registerCommand(
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
            category: CommandCategory.META
        },
    )

    registerCommand(
        "variablize", createCommand(async (msg, _, sc, opts, args) => {
            let vars = args
            let str = vars.map(v => {
                if (v.startsWith("\\")) {
                    return v.slice(1)
                }
                return getVar(msg, v)
            }).join(" ")
            return { content: str, status: StatusCode.RETURN }
        }, CommandCategory.META, "Each arg in the arguments is treated as a string, unless it starts with \\"),
    )

    registerCommand(
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
            category: CommandCategory.META
        },
    )

    registerCommand(
        "create-file",
        {
            run: async (_msg, args, sendCallback) => {
                let file = args[0]
                if (!file) {
                    return { content: "No file specified", status: StatusCode.ERR }
                }
                fs.writeFileSync(`./command-results/${file}`, "")
                return { content: `${file} created`, status: StatusCode.RETURN }
            },
            permCheck: m => ADMINS.includes(m.author.id),
            category: CommandCategory.META
        },
    )

    registerCommand(
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
                return { content: `${file} removed`, status: StatusCode.ERR }
            }, category: CommandCategory.META,
            permCheck: m => ADMINS.includes(m.author.id)
        },
    )

    registerCommand(
        "rand-line",
        {
            run: async (_msg, args, sendCallback) => {
                let file = args[0]
                if (!file) {
                    return { content: "No file specified", status: StatusCode.ERR }
                }
                if (file.match(/\./)) {
                    return { content: "<:Watching1:697677860336304178>", status: StatusCode.ERR }
                }
                if (!fs.existsSync(`./command-results/${file}`)) {
                    return {
                        content: "file does not exist",
                        status: StatusCode.ERR
                    }
                }
                const text = fs.readFileSync(`./command-results/${file}`, "utf-8")
                const lines = text.split("\n").map((str) => str.split(": ").slice(1).join(": ").replace(/;END$/, "")).filter((v) => v)
                return { content: choice(lines), status: StatusCode.RETURN }
            },
            help: {
                info: "Gets a random line from a file"
            },
            category: CommandCategory.META

        },
    )

    registerCommand(
        "l-bl",
        {
            run: async (_msg: Message, _args: ArgumentList, sendCallback) => {
                return {
                    content: fs.readFileSync("command-perms/blacklists", "utf-8"),
                    status: StatusCode.RETURN
                }
            },
            category: CommandCategory.META,
            help: {
                info: "List all blacklists"
            }

        },
    )

    registerCommand(
        "l-wl",
        {
            run: async (_msg: Message, _args: ArgumentList, sendCallback) => {
                return {
                    content: fs.readFileSync("command-perms/whitelists", "utf-8"),
                    status: StatusCode.RETURN
                }
            },
            category: CommandCategory.META,
            help: {
                info: "List all whitelists"
            }
        },
    )

    registerCommand(
        "timeit",
        {
            run: async (msg, args, sendCallback, _, __, rec, bans) => {
                let start = new Date().getTime()
                await runCmd(msg, args.join(" ").trim(), rec + 1, false, bans)
                return { content: `${new Date().getTime() - start} ms`, status: StatusCode.RETURN }
            },
            category: CommandCategory.META
        },
    )

    registerCommand(
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
                    await new Promise(res => setTimeout(res, Math.random() * 700 + 200))
                }
                delete globals.SPAMS[id]
                return {
                    content: "done",
                    status: StatusCode.INFO
                }
            },
            category: CommandCategory.META
        },
    )

    registerCommand(
        "spam",
        {
            run: async (msg: Message, _: ArgumentList, sendCallback, opts, args) => {
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
                let delay: number | null = parseFloat(String(opts['delay'])) * 1000 || 0
                if (delay < 700 || delay > 0x7FFFFFFF) {
                    delay = null
                }
                while (globals.SPAMS[id] && times--) {
                    await handleSending(msg, { content: format(send, { "count": String(totalTimes - times), "rcount": String(times + 1) }), status: StatusCode.RETURN })
                    await new Promise(res => setTimeout(res, delay ?? Math.random() * 700 + 200))

                }
                delete globals.SPAMS[id]
                return {
                    content: "done",
                    status: StatusCode.INFO
                }
            },
            help: {
                info: "This technically runs the echo command with the -D option in the background, so any special syntax such as $() should work (if preceded with a \\)",
                arguments: {
                    count: {
                        description: "The amount of times to send a message",
                        required: false
                    },
                    text: {
                        description: "TThe text to send",
                        required: true
                    }
                },
                options: {
                    delay: {
                        description: "The time between each time a mesage is sent"
                    }
                }
            },
            category: CommandCategory.META
        },
    )

    registerCommand(
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
            category: CommandCategory.META,
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
    )

    registerCommand(
        "vars",
        {
            run: async (_msg, _args, sendCallback) => {
                let rv = ""
                for (let prefix in vars) {
                    rv += `${prefix}:\n`
                    for (let v in vars[prefix]) {
                        rv += `${v.replaceAll("_", "\\_")}\n`
                    }
                    rv += '-------------------------\n'
                }
                return { content: rv, status: StatusCode.RETURN }
            },
            category: CommandCategory.META,
            help: {
                info: "List all variables"
            }
        },
    )
    registerCommand(
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
                    text = text.slice(bluecHeader.length).split(";EOL")
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
            }, category: CommandCategory.META,
            help: {
                info: "Runs bluec scripts. If running from a file, the top line of the file must be %bluecircle37%"
            }
        },
    )

    registerCommand(
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
            }, category: CommandCategory.META,
            help: {
                info: "Get the value of a variable"
            }
        },
    )
    registerCommand(
        "var",
        {
            run: async (msg: Message, args: ArgumentList, sendCallback) => {
                let opts;
                [opts, args] = getOpts(args)
                let [name, ...value] = args.join(" ").split("=").map(v => v.trim())
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
            category: CommandCategory.META
        },
    )

    registerCommand(
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
                if (file.match(/[\.]/)) {
                    return {
                        content: "invalid command",
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
                let options = data.map((value, i) => value.trim() ? `${i + 1}:\t${value.trim()}` : "")
                let fn = generateFileName("remove", msg.author.id)
                fs.writeFileSync(fn, options.join("\n"))
                await handleSending(msg, {
                    files: [{
                        attachment: fn,
                        name: "remove.txt"
                    }],
                    status: StatusCode.PROMPT
                }, sendCallback)
                fs.rmSync(fn)
                try {
                    let collector = msg.channel.createMessageCollector({ filter: m => m.author.id == msg.author.id, time: 30000 })
                    collector.on("collect", async (m) => {
                        if (['cancel', 'c'].includes(m.content || "c")) {
                            collector.stop()
                            return
                        }
                        let removedList = []
                        for (let numStr of m.content.split(" ")) {
                            let num = parseInt(numStr || "0")
                            if (!num) {
                                await handleSending(msg, { content: `${num} is not a valid number`, status: StatusCode.ERR }, sendCallback)
                                return
                            }
                            let removal = data[num - 1]
                            if (!removal)
                                return
                            let userCreated = removal.split(":")[0].trim()
                            if (userCreated != msg.author.id && ADMINS.indexOf(msg.author.id) < 0) {
                                await handleSending(msg, {
                                    content: "You did not create that message, and are not a bot admin",
                                    status: StatusCode.ERR
                                }, sendCallback)
                                continue
                            }
                            removedList.push(data[num - 1])
                            delete data[num - 1]
                        }
                        data = data.filter(v => typeof v != 'undefined')
                        fs.writeFileSync(`command-results/${file}`, data.join(";END"))
                        await handleSending(msg, {
                            status: StatusCode.RETURN,
                            content: `removed ${removedList.join("\n")} from ${file}`
                        }, sendCallback)
                        collector.stop()
                    })
                }
                catch (err) {
                    return {
                        content: "didnt respond in time",
                        status: StatusCode.ERR
                    }
                }
                return { content: 'Say the number of what you want to remove or type cancel', status: StatusCode.PROMPT }
            },
            help: {
                arguments: {
                    file: {
                        description: "The command file to remove from",
                        required: true
                    }
                }
            },
            category: CommandCategory.META
        },
    )

    registerCommand(
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
                if (file.match(/\./)) {
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
            category: CommandCategory.META
        },
    )

    registerCommand(
        'send-log',
        {
            run: async (_msg, args, sendCallback) => {
                if (!fs.existsSync(`./command-results/${args.join(" ").replaceAll(/\.\.+/g, ".")}`)) {
                    return { content: "File does not exist", status: StatusCode.ERR }
                }
                return { content: fs.readFileSync(`./command-results/${args.join(" ").replaceAll(/\.\.+/g, ".")}`, "utf-8"), status: StatusCode.RETURN }
            }, category: CommandCategory.META
        },
    )

    registerCommand(
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
            category: CommandCategory.META
        },
    )

    registerCommand(
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
            category: CommandCategory.META
        },
    )

    registerCommand(
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
                            await sendCallback(`Cannot remove ${command}`)
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
            category: CommandCategory.META

        },
    )

    registerCommand(
        "ht", {
        //help command
        run: async (msg, args, sendCallback) => {

            let commands = getCommands()
            let opts
            [opts, args] = getOpts(args)
            let files = []
            let commandsToUse = commands
            if (args[0]) {
                commandsToUse = {}
                if (args[0] == "?") {
                    commandsToUse = commands
                }
                else {
                    for (let cmd of args) {
                        if (!commands[cmd]) continue
                        commandsToUse[cmd] = commands[cmd]
                    }
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
                await sendCallback("generating new help file")
                delete opts['n']
                let styles = fs.readFileSync("help-styles.css")
                let html = `<style>
${styles}
</style>`
                for (let command in commandsToUse) {
                    html += generateHTMLFromCommandHelp(command, commands[command])
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
        category: CommandCategory.META

    },
    )

    registerCommand(
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
            category: CommandCategory.META
        },
    )

    registerCommand(
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
            category: CommandCategory.META,
            help: {
                info: "Gets a list of the most  used commands",
                options: {
                    s: createHelpOption("The seperator between commands", undefined, "\\n")
                }
            }
        },
    )

    registerCommand(
        "alias",
        {
            run: async (msg: Message, args: ArgumentList, sendCallback) => {
                let cmd
                [cmd, ...args] = args
                let realCmd = args[0]
                if (!realCmd) {
                    return { content: "No  alias name given", status: StatusCode.ERR }
                }
                realCmd = realCmd.trim()
                if (realCmd.includes(" ") || realCmd.includes("\n")) {
                    return { content: "Name cannot have space or new lines", status: StatusCode.ERR }
                }
                args = args.slice(1)
                if (!args) {
                    return { content: "No command given", status: StatusCode.ERR }
                }
                if (getAliases()[cmd]) {
                    return { content: `Failed to add "${cmd}", it already exists`, status: StatusCode.ERR }
                }
                if (getCommands()[cmd]) {
                    return { content: `Failed to add "${cmd}", it is a builtin`, status: StatusCode.ERR }
                }
                fs.appendFileSync("command-results/alias", `${msg.author.id}: ${cmd} ${realCmd} ${args.join(" ")};END\n`)
                getAliases(true)
                return {
                    content: `Added \`${cmd}\` = \`${realCmd}\` \`${args.join(" ")}\``,
                    status: StatusCode.RETURN
                }
            },
            category: CommandCategory.META,
            help: {
                info: "Create an alias",
                arguments: {
                    command: createHelpArgument("The command name", true),
                    command_to_run: createHelpArgument("The command to run", true),
                    args: createHelpArgument("Arguments for the command to run", false)
                }
            }
        },
    )

    registerCommand(
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
            category: CommandCategory.META
        },
    )

    registerCommand(
        "ping", createCommand(async (msg, _args, sendCallback) => {
            return { content: `${(new Date()).getMilliseconds() - msg.createdAt.getMilliseconds()}ms`, status: StatusCode.RETURN }
        },
            CommandCategory.META,
            "Gets the bot's ping (very accurate)"
        )
    )

    registerCommand(
        "version",
        {
            run: async (_msg, args, sendCallback) => {
                let opts;
                [opts, args] = getOpts(args)
                if (opts['l']) {
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
            },
            help: {
                info: "Says the version<br>formats:<br><ul><li>v: full version</li><li>M: major</li><li>m: minor</li><li>b: bug</li><li>A: alpha</li><li>B: beta</li></ul>",
                options: {
                    l: {
                        description: "List all versions"
                    }
                }
            },
            category: CommandCategory.META
        },
    )

    registerCommand(
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
            category: CommandCategory.META
        },
    )

    registerCommand(
        "spams",
        {
            run: async (_msg, _args, sendCallback) => {
                let data = ""
                for (let id in globals.SPAMS) {
                    data += `${id}\n`
                }
                return { content: data || "No spams", status: StatusCode.RETURN }
            },
            category: CommandCategory.META,
            help: {
                info: "List the ongoing spam ids"
            }
        }
    )
}

