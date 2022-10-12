import fs = require("fs")

export const token = fs.readFileSync("./TOKEN", "utf-8").trim()
export const CLIENT_ID = fs.readFileSync("./CLIENT", "utf-8").trim()
export const GUILD_ID = fs.readFileSync("./GUILD", "utf-8").trim()

export let SPAM_ALLOWED = true

export let BUTTONS: { [id: string]: string | (() => string) } = {}
export let POLLS: { [id: string]: { title: string, votes: { [k: string]: string[] } } } = {}
export let SPAMS: { [id: string]: boolean } = {}
export let BLACKJACK_GAMES: { [id: string]: boolean } = {}
export let EDS: { [id: string]: boolean } = {}

export let HEIST_PLAYERS: string[] = []

export let HEIST_TIMEOUT: NodeJS.Timeout | null = null
export let HEIST_STARTED = false

export function generateCmdUseFile() {
    let data = ""
    for (let cmd in CMDUSE) {
        data += `${cmd}:${CMDUSE[cmd]}\n`
    }
    return data
}

export function generateEmoteUseFile() {
    let data = ""
    for (let emote in EMOTEUSE) {
        data += `${emote}:${EMOTEUSE[emote]}\n`
    }
    return data
}

export function addToEmoteUse(emote: string) {
    if (EMOTEUSE[emote]) {
        EMOTEUSE[emote] += 1
    }
    else {
        EMOTEUSE[emote] = 1
    }
    fs.writeFileSync("emoteuse", generateEmoteUseFile())
}

export function addToCmdUse(cmd: string) {
    if (CMDUSE[cmd]) {
        CMDUSE[cmd] += 1
    } else {
        CMDUSE[cmd] = 1
    }
}

export function writeCmdUse() {
    fs.writeFileSync("cmduse", generateCmdUseFile())
}

export function loadCmdUse() {
    let cmduse: { [key: string]: number } = {}
    if (!fs.existsSync("cmduse")) {
        return {}
    }
    let data = fs.readFileSync("cmduse", "utf-8")
    for (let line of data.split("\n")) {
        if (!line) continue
        let [cmd, times] = line.split(":")
        cmduse[cmd] = parseInt(times)
    }
    return cmduse
}

export function loadEmoteUse() {
    let emoteuse: { [key: string]: number } = {}
    if (!fs.existsSync("emoteuse")) {
        return {}
    }
    let data = fs.readFileSync("emoteuse", "utf-8")
    for (let line of data.split("\n")) {
        if (!line) continue
        let [emote, times] = line.split(":")
        emoteuse[emote] = parseInt(times)
    }
    return emoteuse
}

export let CMDUSE = loadCmdUse()
export let EMOTEUSE = loadEmoteUse()
