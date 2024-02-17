import fs from 'fs'

import { ProcessManager } from "./command-parser/process-manager"
import useTracker from './use-tracker'

export const PROCESS_MANAGER = new ProcessManager()

export let BUTTONS: { [id: string]: string | (() => string) } = {}
export let POLLS: { [id: string]: { title: string, votes: { [k: string]: string[] } } } = {}

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

export default {
    BUTTONS,
    POLLS,
    USER_IN_COMMANDS,
    startCommand,
    endCommand,
    userUsingCommand,
    RECURSION_LIMIT,
    saveScallywagTokens,
    SCALLYWAG_TOKENS,
    PROCESS_MANAGER
}
