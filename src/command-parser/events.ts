import { EventEmitter } from "events";
import { AliasV2, StatusCode, lastCommand } from "../common_to_commands";
import { ArgList, Options, getContentFromResult } from "../util";
import { Message } from "discord.js";
import { RuntimeOptions } from "./cmds";
import vars from "../vars";
import useTracker from "../use-tracker";
import { PREFIX } from "../config-manager";

const commandEventListener = new EventEmitter()

const cmdRun = Symbol("cmdRun")

const cmdResult = Symbol("cmdResult")

const cmdOver = Symbol("cmdOver")

type CmdRunEvent = {
    cmdObject: AliasV2 | CommandV2 | undefined
    msg: Message,
    args: ArgList,
    opts: Options,
    runtimeOpts: RuntimeOptions
    cmd: string,
    raw_args: string[]
}

type CmdOverEvent = {
    msg: Message,
    finalRv: CommandReturn,
    cmd: string,
    args: string[]
}

type CmdResultEvent = {
    rv: CommandReturn,
    msg: Message
}

commandEventListener.on(cmdRun, function(event: CmdRunEvent){
    const excluded_cmds = ["!!"]
    if(!excluded_cmds.includes(event.cmd)){
        lastCommand[event.msg.author.id] = `${PREFIX}${event.cmd} ${event.raw_args.join(" ")}`
    }
    useTracker.cmdUsage.addToUsage(event.cmd)
})

commandEventListener.on(cmdResult, function(event: CmdResultEvent){
    vars.setVarEasy("%:_!", getContentFromResult(event.rv), event.msg.author.id)
    vars.setVarEasy("%:!", getContentFromResult(event.rv), event.msg.author.id)
})

commandEventListener.on(cmdOver, function(event: CmdOverEvent){
    if(event.finalRv.status === StatusCode.CMDSTATUS){
        vars.setVarEasy("%:_?", String(event.finalRv.statusNr ?? 0), event.msg.author.id)
        vars.setVarEasy("%:?", String(event.finalRv.statusNr ?? 0), event.msg.author.id)
    }
    else {
        vars.setVarEasy("%:?", event.finalRv.status, event.msg.author.id)
        vars.setVarEasy("%:_?", event.finalRv.status, event.msg.author.id)
    }
})

export default {
    cmdResult,
    cmdRun,
    cmdOver,
    commandEventListener
}
