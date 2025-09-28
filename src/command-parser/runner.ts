import fs from 'fs'
import { Message, MessageCreateOptions, MessagePayload } from "discord.js";
import { AliasV2, CommandCategory, StatusCode, commands, crv, getAliasesV2, promptUser } from "../common_to_commands";
import { getOpts, getOptsUnix, getOptsWithNegate } from "../parsing";
import lexer, { TT } from './lexer'
import { ArgList, BADVALUE, Options, cmdCatToStr, generateCommandSummary, iterAsyncGenerator } from "../util";

import user_options from "../user-options"
import cmds, { RuntimeOptions, SymbolTable } from "./cmds";
import common from "../common";
import globals from '../globals';

import events from './events'
import configManager, { PREFIX } from '../config-manager';
import economy from '../economy';

const CMD_CACHE: Map<string, CommandReturn[]> = new Map()

async function* run_command_v2(msg: Message, cmd: string, cmdObject: CommandV2, args: ArgList, raw_args: ArgumentList, opts: Opts, runtime_options: RuntimeOptions, symbols: SymbolTable, stdin?: CommandReturn, sendCallback?: ((options: MessageCreateOptions | MessagePayload | string) => Promise<Message>), pid_label?: string) {
    if (cmdObject.use_result_cache) {
        let generator = CMD_CACHE.get(raw_args.join(" "))
        if (generator) {
            yield* generator[Symbol.iterator]()
            return
        }
    }

    let argShapeResults: Record<string, any> = {}
    let obj: CommandV2RunArg = {
        msg: msg,
        rawArgs: raw_args,
        args,
        sendCallback: sendCallback ?? msg.channel.send.bind(msg.channel),
        recursionCount: runtime_options.get("recursion", runtime_options.get("recursion_limit", configManager.RECURSION_LIMIT) - 1),
        commandBans: undefined,
        opts: new Options(opts),
        rawOpts: opts,
        argList: args,
        stdin,
        pipeTo: undefined,
        //@ts-ignore
        interpreter: this,
        argShapeResults,
        runtime_opts: runtime_options,
        symbols,
        pid_label: pid_label as string
    }

    if (cmdObject.argShape) {
        args.beginIter()
        for await (const [result, type, optional, default_] of cmdObject.argShape(args, msg)) {
            if (result === BADVALUE && !optional) {
                return { content: `Expected ${type}\nUsage: ${generateCommandSummary(cmd, cmdObject)}`, status: StatusCode.ERR }
            }
            else if (result === BADVALUE && default_ !== undefined) argShapeResults[type] = default_
            else argShapeResults[type] = result
        }
    }
    let runObj = cmdObject.run.bind([cmd, cmdObject])(obj) ?? { content: `${cmd} happened`, status: StatusCode.RETURN }

    let l: CommandReturn[] = []
    try {
        yield* iterAsyncGenerator(runObj)
    } catch (err) {
        let res = await runObj
        yield res
        l.push(res)
    }
    if (cmdObject.use_result_cache) {
        CMD_CACHE.set(raw_args.join(" "), l)
    }
}

async function* run_file(msg: Message, name: string, args: string[]): AsyncGenerator<CommandReturn> {
    let data = `${fs.readFileSync(`./src/bircle-bin/${name}.bircle`, 'utf-8')}`

    let runtime_opts = new cmds.RuntimeOptions()
    runtime_opts.set("program-args", args)

    for await (let result of globals.PROCESS_MANAGER.spawn_cmd(
        { command: data, prefix: "", msg, runtime_opts },
        `${name}.bircle`,
    )) {
        yield result
    }
}

//TODO: aliases
async function* command_runner(tokens: TT<any>[], msg: Message, symbols: SymbolTable, runtime_options: RuntimeOptions, stdin?: CommandReturn, sendCallback?: ((options: MessageCreateOptions | MessagePayload | string) => Promise<Message>), pid_label?: string): AsyncGenerator<CommandReturn> {
    if (runtime_options.get("typing", false)) {
        await msg.channel.sendTyping()
    }

    if (runtime_options.get("delete", false) && msg.deletable) {
        msg.delete().catch(console.error)
    }

    let cmdIdx = tokens.findIndex(v => String(v.data).trim() !== "")
    let cmd = tokens[cmdIdx].data!.trimStart()
    tokens = tokens.slice(cmdIdx)

    if (common.BLACKLIST[msg.author.id]?.includes(cmd)) {
        yield { content: "You are blacklisted from this command", status: StatusCode.ERR, responseTo: cmd }
        return
    }

    //item 1 is a command, skip it
    let raw_args = tokens.slice(1).map(t => t.data) as string[]

    let cmdObject: CommandV2 | AliasV2 | undefined;
    if (runtime_options.get("alias", false)) {
        cmdObject = getAliasesV2()[cmd]
        runtime_options.delete("alias")
    }
    else if (runtime_options.get('command', false)) {
        cmdObject = commands.get(cmd)
        runtime_options.delete("command")
    }
    else {
        cmdObject = commands.get(cmd) || getAliasesV2()[cmd]
    }

    if (cmdObject && "permCheck" in cmdObject && cmdObject.permCheck !== undefined && !cmdObject.permCheck(msg)) {
        yield { content: "You failed the permissions check for this command", status: StatusCode.ERR, responseTo: cmd }
        return
    }

    if(!msg.author.bot && !economy.playerExists(msg.author.id) && [CommandCategory.GAME, CommandCategory.ECONOMY].includes(cmdObject?.category)) {
        economy.createPlayer(msg.author.id, 100)
    }

    let disabled = runtime_options.get("disable", false)
    if (disabled && (disabled.commands?.includes(cmd) || disabled.categories?.includes(cmdObject?.category))) {
        yield { content: "This command has been banned in this context", status: StatusCode.ERR, responseTo: cmd }
        return
    }

    let warn_cmds = user_options.getOpt(msg.author.id, "warn-cmds", "").split(" ")
    let warn_categories = user_options.getOpt(msg.author.id, "warn-categories", "").split(" ")

    let doWarn = !runtime_options.get("disableCmdConfirmations", false)

    const cmdCategory = cmdCatToStr(cmdObject?.category)

    if (doWarn && (warn_cmds.includes(cmd) || warn_categories.includes(cmdCategory) || (!(cmdObject instanceof AliasV2) && cmdObject?.prompt_before_run === true))) {
        let m = await promptUser(msg, `You are about to run the \`${cmd}\` command with args \`${raw_args.join(" ")}\`\nAre you sure you want to do this **(y/n)**`)

        if (!m || m.content.toLowerCase() !== 'y') {
            yield { content: `Declined to run ${cmd}`, status: StatusCode.RETURN, responseTo: cmd }
            return
        }
    }

    if (!cmdObject) {
        if (fs.existsSync(`./src/bircle-bin/${cmd}.bircle`)) {
            for await (let result of run_file(msg, cmd, raw_args)) {
                yield {...result, responseTo: cmd}
            }
            return
        }
        if(cmd.startsWith(PREFIX)){
            cmd = `\\${cmd}`
        }
        yield { content: `${cmd} is not a valid command`, status: StatusCode.ERR, responseTo: cmd }

        return
    }

    let opts_parser = ({
        "with-negate": getOptsWithNegate,
        unix: getOptsUnix,
        normal: getOpts
    }[runtime_options.get("optsParser", "") || user_options.getOpt(msg.author.id, "opts-parser", "normal")]) ?? getOpts;
    let [opts, parsed_args] = opts_parser(raw_args, (cmdObject as CommandV2).short_opts || "", (cmdObject as CommandV2).long_opts || [])

    if (opts['?']) {
        parsed_args = [cmd]
        cmdObject = commands.get("help") as CommandV2
        delete opts['?']
    }

    let args = new ArgList(parsed_args)

    events.commandEventListener.emit(events.cmdRun, {
        msg,
        cmdObject,
        args,
        opts,
        runtimeOpts: runtime_options,
        cmd,
        raw_args
    })

    if (cmdObject instanceof AliasV2) {
        let rv;
        for await (let result of
            cmdObject.run({
                msg,
                rawArgs: raw_args,
                args,
                opts: opts,
                recursionCount: runtime_options.get("recursion", runtime_options.get("recursion_limit", configManager.RECURSION_LIMIT)),
                symbols,
                runtime_opts: runtime_options
            })) {
            rv = result
            events.commandEventListener.emit(events.cmdResult, { rv: result, msg })
            yield {...result, responseTo: cmd}
        }
        events.commandEventListener.emit(events.cmdOver, {
            msg,
            finalRv: rv,
            cmd,
            args: raw_args
        })
        return
    }

    else if (cmdObject.cmd_std_version === 2) {
        let rv
        for await (let item of run_command_v2(msg, cmd, cmdObject, args, raw_args, opts, runtime_options, symbols, stdin, sendCallback, pid_label)) {
            events.commandEventListener.emit(events.cmdResult, { rv: item, msg })
            rv = item
            yield {...item, responseTo: cmd}
        }
        events.commandEventListener.emit(events.cmdOver, {
            msg,
            finalRv: rv,
            cmd,
            args: raw_args
        })
        return
    }
    yield crv("NOTHING")
}


export default {
    command_runner,
    CMD_CACHE
}
