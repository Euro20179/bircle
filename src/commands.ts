import { CommandCategory, registerCommand, registerMatchCommand } from "./common_to_commands"
import { strToCommandCat } from "./util"


for(let path of ["util", "fun", "game", "admin", "voice", "economy", "meta", "image"]){
    for(let [name, cmd] of require(`./${path}_commands`).default(strToCommandCat(path))){
        registerCommand(name, cmd, strToCommandCat(path))
    }
}

for(let [cmd] of require("./match_commands").default(CommandCategory.MATCH)){
    registerMatchCommand(cmd)
}

export {}
