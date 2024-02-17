import fs from 'fs'

import { ProcessManager } from "./command-parser/process-manager"

export const PROCESS_MANAGER = new ProcessManager()

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

export let CMDUSE = loadCmdUse()
export let EMOTEUSE = loadEmoteUse()

export default {
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
    CMDUSE,
    EMOTEUSE,
    PROCESS_MANAGER
}
