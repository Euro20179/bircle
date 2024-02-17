import { CommandCategory, registerCommand, registerMatchCommand } from '../common_to_commands'
import { strToCommandCat } from '../util'

import match_commands from './match_commands'

export default function(){
    for (let path of ["UTIL", "FUN", "GAME", "ADMIN", "VOICE", "ECONOMY", "META", "IMAGES"] as (keyof typeof CommandCategory)[]) {
        import(`./${path.toLowerCase()}_commands`).then(f => {
            for(let [name, cmd] of f.default(strToCommandCat(path))){
                registerCommand(name, cmd, strToCommandCat(path))
            }
        })
    }

    for(let [cmd] of match_commands()){
        registerMatchCommand(cmd)
    }
}
