import fs from 'fs'

export const BOT_CONFIG = JSON.parse(fs.readFileSync("./CONFIG.json", "utf-8"))
export const CLIENT_ID = BOT_CONFIG.secrets['client-id']
export const GUILD_ID = BOT_CONFIG.secrets['guild']
export const CLIENT_SECRET = BOT_CONFIG.secrets['client-secret']
export let DEVBOT = BOT_CONFIG.general?.mode === "dev" ? true : false
export let PREFIX = BOT_CONFIG.general.prefix
export const ADMINS = BOT_CONFIG.general.admins

export function editConfig(path: string, newValue: any) {
    let WORKING_OBJ: any = BOT_CONFIG
    let items = path.split(".")
    for (let i = 0; i < items.length - 1; i++) {
        WORKING_OBJ = WORKING_OBJ?.[items[i] as keyof typeof WORKING_OBJ]
        if (WORKING_OBJ === undefined) throw new Error(`${path} is not a valid config item`)
    }
    if (WORKING_OBJ[items[items.length - 1] as keyof typeof WORKING_OBJ] === undefined) throw new Error(`${path} is not a valid config item`)
    saveConfig()
    return WORKING_OBJ[items[items.length - 1]] = newValue
}

export function getConfigValue(path: string) {
    let WORKING_OBJ: any = BOT_CONFIG
    let items = path.split(".")
    for (let i = 0; i < items.length; i++) {
        WORKING_OBJ = WORKING_OBJ?.[items[i] as keyof typeof WORKING_OBJ]
        if (WORKING_OBJ === undefined) {
            return false
        }
    }
    return WORKING_OBJ
}

export function saveConfig() {
    fs.writeFileSync('./CONFIG.json', JSON.stringify(BOT_CONFIG))
}

export default {
    BOT_CONFIG,
    CLIENT_ID,
    GUILD_ID,
    CLIENT_SECRET,
    DEVBOT,
    PREFIX,
    ADMINS,
    editConfig,
    getConfigValue,
    saveConfig
}
