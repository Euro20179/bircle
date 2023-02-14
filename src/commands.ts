import { CommandCategory } from "./common_to_commands"

require("./util_commands").default(CommandCategory.UTIL)
require("./fun_commands").default(CommandCategory.FUN)
require("./game_commands").default(CommandCategory.GAME)
require("./admin_commands").default(CommandCategory.ADMIN)
require("./image_commands").default(CommandCategory.IMAGES)
require("./voice_commands").default(CommandCategory.VOICE)
require("./economy_commands").default(CommandCategory.ECONOMY)
require("./meta_commands").default(CommandCategory.META)
require("./match_commands").default(CommandCategory.MATCH)

export {}
