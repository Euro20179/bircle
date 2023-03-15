import EventEmitter from "events";

import vars from "./vars";
import { Interpreter } from "./common_to_commands";
import { Message } from "discord.js";
import { getContentFromResult } from "./util";

/**
    * @description Event listener for when a command is about to be run
    * @param {Interpreter} the interpreter running the command
*/
const CmdRun = Symbol("cmd")

const HandleSend = Symbol("handle-send")

const botEvents = new EventEmitter()

botEvents.on(CmdRun, async (int: Interpreter) => {
    let varname = `!stats:cmd-usage.${int.real_cmd}`
    let msg = int.getMessage()
    vars.setVarEasy(msg, varname, String(Number(vars.getVar(msg, varname)) + 1))
})

botEvents.on(HandleSend, async(msg: Message, rv: CommandReturn) => {
    //doing this if user expansion is false can cause problems
    if(rv.do_change_cmd_user_expansion !== false){
        vars.setVarEasy(msg, `%:?`, rv.status)
        let c = getContentFromResult(rv, "\n")
        vars.setVarEasy(msg, "%:_!", c)
        vars.setVar("_!", c)
    }
})

export default {
    CmdRun,
    HandleSend,
    botEvents,
}
