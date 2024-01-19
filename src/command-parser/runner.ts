import fs from 'fs'
import { Message, MessageCreateOptions, MessagePayload } from "discord.js";
import { AliasV2, StatusCode, commands, crv, getAliasesV2 } from "../common_to_commands";
import { getOpts, getOptsUnix, getOptsWithNegate } from "../parsing";
import { TT } from './lexer'
import { ArgList, BADVALUE, Options, generateCommandSummary } from "../util";

import user_options from "../user-options"
import cmds, { RuntimeOptions, SymbolTable } from "./cmds";
import common from "../common";

async function* run_command_v2(msg: Message, cmd: string, cmdObject: CommandV2, args: ArgList, raw_args: ArgumentList, opts: Opts, runtime_options: RuntimeOptions, symbols: SymbolTable, stdin?: CommandReturn, sendCallback?: ((options: MessageCreateOptions | MessagePayload | string) => Promise<Message>)) {

    let argShapeResults: Record<string, any> = {}
    let obj: CommandV2RunArg = {
        msg: msg,
        rawArgs: raw_args,
        args,
        sendCallback: sendCallback ?? msg.channel.send.bind(msg.channel),
        recursionCount: 19,
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
        symbols
    }

    if (cmdObject.argShape) {
        args.beginIter()
        for await (const [result, type, optional, default_] of cmdObject.argShape(args, msg)) {
            if (result === BADVALUE && !optional) {
                yield { content: `Expected ${type}\nUsage: ${generateCommandSummary(cmd, cmdObject)}`, status: StatusCode.ERR }
            }
            else if (result === BADVALUE && default_ !== undefined) argShapeResults[type] = default_
            else argShapeResults[type] = result
        }
    }
    let runObj = cmdObject.run.bind([cmd, cmdObject])(obj) ?? { content: `${cmd} happened`, status: StatusCode.RETURN }
    try {
        for await (let item of runObj) {
            yield item
        }
    } catch (err) {
        yield await runObj
    }
}

async function* run_file(msg: Message, name: string, args: string[]): AsyncGenerator<CommandReturn> {
    let data = `(PREFIX)${fs.readFileSync(`./src/bircle-bin/${name}.bircle`, 'utf-8')}`

    let runtime_options = new cmds.RuntimeOptions()
    runtime_options.set("program-args", args)

    for await (let result of cmds.runcmd(data, "(PREFIX)", msg, undefined, runtime_options)) {
        yield result
    }
}

//TODO: aliases
async function* command_runner(tokens: TT<any>[], msg: Message, symbols: SymbolTable, runtime_options: RuntimeOptions, stdin?: CommandReturn, sendCallback?: ((options: MessageCreateOptions | MessagePayload | string) => Promise<Message>)) {
    let opts;

    let cmd = tokens[0].data.trim() as string

    if (common.BLACKLIST[msg.author.id]?.includes(cmd)) {
        yield { content: "You are blacklisted from this command", status: StatusCode.ERR }
        return
    }

    //item 1 is a command, skip it
    let raw_args = tokens.slice(1).map(t => t.data) as string[]

    let cmdObject: CommandV2 | AliasV2 | undefined;
    if (runtime_options.get("alias", false)) {
        cmdObject = getAliasesV2()[cmd]
    }
    else if (runtime_options.get('command', false)) {
        cmdObject = commands.get(cmd)
    }
    else {
        cmdObject = commands.get(cmd) || getAliasesV2()[cmd]
    }

    if (!cmdObject) {
        if (fs.existsSync(`./src/bircle-bin/${cmd}.bircle`)) {
            for await (let result of run_file(msg, cmd, raw_args)) {
                yield result
            }
            return
        }
        yield { content: `\\${cmd} is not a valid command`, status: StatusCode.ERR }
        return
    }

    let opts_parser = ({
        "with-negate": getOptsWithNegate,
        unix: getOptsUnix,
        normal: getOpts
    }[user_options.getOpt(msg.author.id, "opts-parser", "normal")]) ?? getOpts;
    [opts, raw_args] = opts_parser(raw_args, (cmdObject as CommandV2).short_opts || "", (cmdObject as CommandV2).long_opts || [])

    //@ts-ignore
    let args = new ArgList(raw_args)

    if (cmdObject instanceof AliasV2) {
        yield await cmdObject.run({
            msg,
            rawArgs: raw_args,
            args,
            opts: opts,
            recursionCount: 19,
        })
        return
    }

    else if (cmdObject.cmd_std_version === 2) {
        for await (let item of run_command_v2(msg, cmd, cmdObject, args, raw_args, opts, runtime_options, symbols, stdin, sendCallback)) {
            yield item
        }
        return
    }
    yield crv("NOTHING")
}


export default {
    command_runner,
}
