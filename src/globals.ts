import { User } from "discord.js"
import fs = require("fs")
import { listComprehension } from "./util"

export const token = fs.readFileSync("./data/TOKEN", "utf-8").trim()
export const CLIENT_ID = fs.readFileSync("./data/CLIENT", "utf-8").trim()
export const GUILD_ID = fs.readFileSync("./data/GUILD", "utf-8").trim()

export let SPAM_ALLOWED = true

export let DEVBOT = fs.existsSync("./data/IS-DEV-BOT")

export let BUTTONS: { [id: string]: string | (() => string) } = {}
export let POLLS: { [id: string]: { title: string, votes: { [k: string]: string[] } } } = {}
export let SPAMS: { [id: string]: boolean } = {}
export let BLACKJACK_GAMES: { [id: string]: boolean } = {}
export let EDS: { [id: string]: boolean } = {}

export let HEIST_PLAYERS: string[] = []

export let HEIST_TIMEOUT: NodeJS.Timeout | null = null
export let HEIST_STARTED = false

export let IN_QALC: string[] = []

export let YAHTZEE_WAITING_FOR_PLAYERS = false

export let KNOW_YOUR_MEME_TIMEOUT: NodeJS.Timeout;
export let KNOW_YOUR_MEME_PLAYERS: User[] = []

//an array of commands that the user is running
export let USER_IN_COMMANDS: {[id: string]: string[]} = {}

export function startCommand(id: string, command: string){
    if(!USER_IN_COMMANDS[id]){
        USER_IN_COMMANDS[id] = [command]
    }
    else{
        USER_IN_COMMANDS[id].push(command)
    }
}
export function endCommand(id: string, command: string){
    if(!USER_IN_COMMANDS[id]){
        return;
    }
    USER_IN_COMMANDS[id] = USER_IN_COMMANDS[id].filter(v => v!==command)
}
export function userUsingCommand(id: string, command: string){
    return USER_IN_COMMANDS[id]?.includes(command) ? true : false
}

export const RECURSION_LIMIT = 20

function loadScallyWagTokens () {
    let SCALLYWAG_TOKENS
    if(fs.existsSync("./command-results/scallywag-tokens.json")){
        SCALLYWAG_TOKENS = JSON.parse(fs.readFileSync("./command-results/scallywag-tokens.json", "utf-8"))
    }
    else{
        SCALLYWAG_TOKENS = {}
    }
    return SCALLYWAG_TOKENS
}

export function saveScallywagTokens () {
    fs.writeFileSync("./command-results/scallywag-tokens.json", JSON.stringify(SCALLYWAG_TOKENS))
}


export let SCALLYWAG_TOKENS: {[key: string]: number} = loadScallyWagTokens()


function _generateUsageFile(OBJECT: {[key: string]: string | number}){
    return listComprehension(Object.keys(OBJECT), key => `${key}:${OBJECT[key]}`).join("\n")
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

export function removeFromCmdUse(cmd: string){
    CMDUSE[cmd] -= 1
}

export function writeCmdUse() {
    fs.writeFileSync("data/cmduse", generateCmdUseFile())
}

export function loadCmdUse() {
    let cmduse: { [key: string]: number } = {}
    if (!fs.existsSync("data/cmduse")) {
        return {}
    }
    let data = fs.readFileSync("data/cmduse", "utf-8")
    for (let line of data.split("\n")) {
        if (!line) continue
        let [cmd, times] = line.split(":")
        cmduse[cmd] = parseInt(times)
    }
    return cmduse
}

export function loadEmoteUse() {
    let emoteuse: { [key: string]: number } = {}
    if (!fs.existsSync("data/emoteuse")) {
        return {}
    }
    let data = fs.readFileSync("data/emoteuse", "utf-8")
    for (let line of data.split("\n")) {
        if (!line) continue
        let [emote, times] = line.split(":")
        emoteuse[emote] = parseInt(times)
    }
    return emoteuse
}

export let CMDUSE = loadCmdUse()
export let EMOTEUSE = loadEmoteUse()
