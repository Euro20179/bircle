import { Message } from "discord.js";
import { AliasV2, StatusCode, commands, crv, getAliasesV2 } from "../common_to_commands";
import { getOpts } from "../parsing";
import { TT } from './lexer'
import { ArgList, BADVALUE, Options, generateCommandSummary } from "../util";

async function run_command_v2(msg: Message, cmd: string, cmdObject: CommandV2, args: ArgList, raw_args: ArgumentList, opts: Opts, stdin?: CommandReturn) {

    let argShapeResults: Record<string, any> = {}
    let obj: CommandV2RunArg = {
        msg: msg,
        rawArgs: raw_args,
        args,
        sendCallback: msg.channel.send.bind(msg.channel),
        recursionCount: 19,
        commandBans: undefined,
        opts: new Options(opts),
        rawOpts: opts,
        argList: args,
        stdin,
        pipeTo: undefined,
        //@ts-ignore
        interpreter: this,
        argShapeResults
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
    return await cmdObject.run.bind([cmd, cmdObject])(obj) ?? { content: `${cmd} happened`, status: StatusCode.RETURN }
}

async function command_runner(tokens: TT<any>[], msg: Message, stdin?: CommandReturn) {
    let cmd = tokens[0].data as string
    //item 1 is a command, skip it
    let raw_args = tokens.slice(1).map(t => t.data) as string[]
    let opts;
    [opts, raw_args] = getOpts(raw_args)
    //@ts-ignore
    let args = new ArgList(raw_args)

    let cmdObject: CommandV2 | AliasV2 | undefined = commands.get(cmd) || getAliasesV2()[cmd]

    if (cmdObject.cmd_std_version === 2) {
        return await run_command_v2(msg, cmd, cmdObject, args, raw_args, opts, stdin)
    }
    return crv("NOTHING")
}


export default {
    command_runner,
}
