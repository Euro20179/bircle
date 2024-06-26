import EventEmitter from "events";

import vars from "./vars";
import { Message } from "discord.js";
import { getContentFromResult } from "./util";
import { StatusCode } from "./common_to_commands";

/**
    * @description Event listener for when a command is about to be run
    * @param {Interpreter} the interpreter running the command
*/
const CmdRun = Symbol("cmd")

const FuncUsed = Symbol('func-used')

const HandleSend = Symbol("handle-send")

const botEvents = new EventEmitter()

botEvents.on(CmdRun, function cmdRunEventHandler(int) {
    let varname = `!stats:cmd-usage.${int.args[0]}`
    let msg = int.getMessage()
    vars.setVarEasy(varname, String(Number(vars.getVar(msg, varname)) + 1), msg.author.id)
})

botEvents.on(HandleSend, function HandleSend(msg: Message, rv: CommandReturn) {
    //doing this if user expansion is false can cause problems
    if(rv.do_change_cmd_user_expansion !== false){
        let status = rv.status
        if(rv.status === StatusCode.CMDSTATUS){
            status = String(rv.statusNr || 0)
        }
        vars.setVarEasy(`%:?`, status, msg.author.id)
        let c = getContentFromResult(rv, "\n")
        vars.setVarEasy("%:_!", c, msg.author.id)
    }
})

export default {
    CmdRun,
    HandleSend,
    botEvents,
    FuncUsed
}
