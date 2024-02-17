import { EventEmitter } from "events";
import { AliasV2, lastCommand } from "../common_to_commands";
import { ArgList, Options, getContentFromResult } from "../util";
import { Message } from "discord.js";
import { RuntimeOptions } from "./cmds";
import vars from "../vars";
import { addToCmdUse } from "../globals";

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
    cmd: string
}

type CmdOverEvent = {
    msg: Message,
    finalRv: CommandReturn,
    cmd: string
}

type CmdResultEvent = {
    rv: CommandReturn,
    msg: Message
}

commandEventListener.on(cmdRun, function(event: CmdRunEvent){
    addToCmdUse(event.cmd)
})

commandEventListener.on(cmdResult, function(event: CmdResultEvent){
    vars.setVarEasy("%:_!", getContentFromResult(event.rv), event.msg.author.id)
})

commandEventListener.on(cmdOver, function(event: CmdOverEvent){
    const excluded_cmds = ["!!"]
    if(!excluded_cmds.includes(event.cmd)){
        lastCommand[event.msg.author.id] = event.msg.content
    }
    vars.setVarEasy("%:_?", event.finalRv.status, event.msg.author.id)
})

export default {
    cmdResult,
    cmdRun,
    cmdOver,
    commandEventListener
}
