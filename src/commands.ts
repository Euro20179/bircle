import { CommandCategory, registerCommand, registerMatchCommand } from "./common_to_commands"

for(let [name, cmd] of require("./util_commands").default(CommandCategory.UTIL)){
    registerCommand(name, cmd)
}
for(let [name, cmd] of require("./fun_commands").default(CommandCategory.FUN)){
    registerCommand(name, cmd)
}
for(let [name, cmd] of require("./game_commands").default(CommandCategory.GAME)){
    registerCommand(name, cmd)
}
for(let [name, cmd] of require("./admin_commands").default(CommandCategory.ADMIN)){
    registerCommand(name, cmd)
}
for(let [name, cmd] of require("./image_commands").default(CommandCategory.IMAGES)){
    registerCommand(name, cmd)
}
for(let [name, cmd] of require("./voice_commands").default(CommandCategory.VOICE)){
    registerCommand(name, cmd)
}
for(let [name, cmd] of require("./economy_commands").default(CommandCategory.ECONOMY)){
    registerCommand(name, cmd)
}
for(let [name, cmd] of require("./meta_commands").default(CommandCategory.META)){
    registerCommand(name, cmd)
}
for(let [cmd] of require("./match_commands").default(CommandCategory.MATCH)){
    registerMatchCommand(cmd)
}

export {}
