import fs from 'fs'

import { ProcessManager } from "./command-parser/process-manager"

export const PROCESS_MANAGER = new ProcessManager()

export const BOT_CONFIG = JSON.parse(fs.readFileSync("./CONFIG.json", "utf-8"))
export const CLIENT_ID = BOT_CONFIG.secrets['client-id']
export const GUILD_ID = BOT_CONFIG.secrets['guild']
export const CLIENT_SECRET = BOT_CONFIG.secrets['client-secret']

export let DEVBOT = BOT_CONFIG.general?.mode === "dev" ? true : false

export let PREFIX = BOT_CONFIG.general.prefix

export const ADMINS = BOT_CONFIG.general.admins

export let BUTTONS: { [id: string]: string | (() => string) } = {}
export let POLLS: { [id: string]: { title: string, votes: { [k: string]: string[] } } } = {}
export let EDS: { [id: string]: boolean } = {}

//an array of commands that the user is running
export let USER_IN_COMMANDS: { [id: string]: string[] } = {}

export function startCommand(id: string, command: string) {
    if (!USER_IN_COMMANDS[id]) {
        USER_IN_COMMANDS[id] = [command]
    }
    else {
        USER_IN_COMMANDS[id].push(command)
    }
}
export function endCommand(id: string, command: string) {
    if (!USER_IN_COMMANDS[id]) {
        return;
    }
    USER_IN_COMMANDS[id] = USER_IN_COMMANDS[id].filter(v => v !== command)
}
export function userUsingCommand(id: string, command: string) {
    return USER_IN_COMMANDS[id]?.includes(command) ? true : false
}

export const RECURSION_LIMIT = 20

function loadScallyWagTokens() {
    let SCALLYWAG_TOKENS
    if (fs.existsSync("./command-results/scallywag-tokens.json")) {
        SCALLYWAG_TOKENS = JSON.parse(fs.readFileSync("./command-results/scallywag-tokens.json", "utf-8"))
    }
    else {
        SCALLYWAG_TOKENS = {}
    }
    return SCALLYWAG_TOKENS
}

export function saveScallywagTokens() {
    fs.writeFileSync("./command-results/scallywag-tokens.json", JSON.stringify(SCALLYWAG_TOKENS))
}


export let SCALLYWAG_TOKENS: { [key: string]: number } = loadScallyWagTokens()


function _generateUsageFile(OBJECT: { [key: string]: string | number }) {
    let text = ""
    for (let key in OBJECT) {
        text += `${key}:${OBJECT[key]}\n`
    }
    return text;
}

export function generateCmdUseFile() {
    return _generateUsageFile(CMDUSE)
}

export function generateEmoteUseFile() {
    return _generateUsageFile(EMOTEUSE)
}

export function addToEmoteUse(emote: string) {
    if (EMOTEUSE[emote]) {
        EMOTEUSE[emote] += 1
    }
    else {
        EMOTEUSE[emote] = 1
    }
    fs.writeFileSync("data/emoteuse", generateEmoteUseFile())
}

export function addToCmdUse(cmd: string) {
    if (CMDUSE[cmd]) {
        CMDUSE[cmd] += 1
    } else {
        CMDUSE[cmd] = 1
    }
}

export function removeFromCmdUse(cmd: string) {
    CMDUSE[cmd] -= 1
}

export function writeCmdUse() {
    fs.writeFileSync("data/cmduse", generateCmdUseFile())
}

function loadUseFile(fp: string){
    let usage: { [key: string]: number } = {}
    if (!fs.existsSync(fp)) {
        return {}
    }
    let data = fs.readFileSync(fp, "utf-8")
    for (let line of data.split("\n")) {
        if (!line) continue
        let [item, count] = line.split(":")
        usage[item] = parseInt(count)
    }
    return usage
}

export function loadCmdUse() {
    return loadUseFile("data/cmduse")
}

export function loadEmoteUse() {
    return loadUseFile("data/emoteuse")
}

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

export let CMDUSE = loadCmdUse()
export let EMOTEUSE = loadEmoteUse()

export default {
    BOT_CONFIG,
    CLIENT_ID,
    GUILD_ID,
    CLIENT_SECRET,
    DEVBOT,
    PREFIX,
    ADMINS,
    BUTTONS,
    POLLS,
    EDS,
    USER_IN_COMMANDS,
    startCommand,
    endCommand,
    userUsingCommand,
    RECURSION_LIMIT,
    saveScallywagTokens,
    SCALLYWAG_TOKENS,
    generateCmdUseFile,
    generateEmoteUseFile,
    addToEmoteUse,
    addToCmdUse,
    removeFromCmdUse,
    writeCmdUse,
    loadCmdUse,
    loadEmoteUse,
    editConfig,
    getConfigValue,
    saveConfig,
    CMDUSE,
    EMOTEUSE,
    PROCESS_MANAGER
}
