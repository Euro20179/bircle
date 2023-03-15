import EventEmitter from "events";

import vars from "./vars";
import { Interpreter } from "./common_to_commands";

/**
    * @description Event listener for when a command is about to be run
    * @param {Interpreter} the interpreter running the command
*/
const CmdRun = Symbol("cmd")

const botEvents = new EventEmitter()

botEvents.on(CmdRun, async (int: Interpreter) => {
    let varname = `!stats:cmd-usage.${int.real_cmd}`
    let msg = int.getMessage()
    vars.setVarEasy(msg, varname, String(Number(vars.getVar(msg, varname)) + 1))
})

export default {
    CmdRun,
    botEvents
}
