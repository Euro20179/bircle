import fs from 'fs'

import { User } from "discord.js";

import { Client, Intents } from "discord.js"
const prefix = fs.readFileSync("./data/prefix", "utf-8").trim()


const ADMINS = ["334538784043696130"]

const VERSION = { major: 5, minor: 21, bug: 3, part: "", beta: false, alpha: false }

//@ts-ignore
const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_MEMBERS, Intents.FLAGS.DIRECT_MESSAGES, Intents.FLAGS.GUILD_VOICE_STATES, Intents.FLAGS.GUILD_PRESENCES], allowedMentions: { parse: ["users"] } })

let USER_SETTINGS = {}

let WHITELIST: { [key: string]: string[] } = {}
let BLACKLIST: { [key: string]: string[] } = {}

let USER_MATCH_COMMANDS: Map<string, Map<string, [RegExp, string]>> = new Map()

function loadMatchCommands() {
    if (fs.existsSync("./data/match-commands")) {
        let data = fs.readFileSync("./data/match-commands", "utf-8")
        let jsonData: { [id: string]: { [name: string]: [string, string] } } = JSON.parse(data)
        let final: typeof USER_MATCH_COMMANDS = new Map()
        for (let user in jsonData) {
            let data: Map<string, [RegExp, string]> = new Map()
            for (let [name, [regexp, run]] of Object.entries(jsonData[user])) {
                data.set(name, [new RegExp(regexp), run])
            }
            final.set(user, data)
        }
        USER_MATCH_COMMANDS = final
    }
    return USER_MATCH_COMMANDS
}

function removeUserMatchCommand(user: string, name: string) {
    return USER_MATCH_COMMANDS.get(user)?.delete(name)
}

function addUserMatchCommand(user: string, name: string, search: RegExp, run: string) {
    if (USER_MATCH_COMMANDS.get(user)) {
        (USER_MATCH_COMMANDS.get(user) as Map<string, [RegExp, string]>).set(name, [search, run])
    }
    else {
        let m: Map<string, [RegExp, string]> = new Map()
        m.set(name, [search, run])
        USER_MATCH_COMMANDS.set(user, m)
    }
}

function saveMatchCommands() {
    let data: { [id: string]: { [name: string]: [string, string] } } = {}
    for (let user of USER_MATCH_COMMANDS.keys()) {
        let userData: typeof data[string] = {}
        let userCmds = USER_MATCH_COMMANDS.get(user)
        if (!userCmds) continue;
        for (let [name, [regexp, run]] of userCmds.entries()) {
            userData[name] = [regexp.toString().replace(/^\//, "").replace(/\/$/, ""), run]
        }
        data[user] = userData
    }
    fs.writeFileSync("./data/match-commands", JSON.stringify(data))
}

function getUserMatchCommands() {
    return USER_MATCH_COMMANDS
}

loadMatchCommands()

function reloadList(list: string, listHolder: { [key: string]: string[] }) {
    let lf = fs.readFileSync(`command-perms/${list}`, "utf-8")
    for (let line of lf.split("\n")) {
        if (!line) continue;
        let [user, cmdlist] = line.split(":").map((v: any) => v.trim())
        listHolder[user] = cmdlist.split(" ")
    }
}

const reloadWhiteList = reloadList.bind(this, "whitelists", WHITELIST)
const reloadBlackList = reloadList.bind(this, "blacklists", BLACKLIST)

reloadBlackList()
reloadWhiteList()

function savePermList(list: { [key: string]: string[] }, listFile: string) {
    let data = Object.entries(list).map(([user, perms]) => `${user}: ${perms.join(" ")}`).join("\n")
    fs.writeFileSync(`command-perms/${listFile}`, data)
}

function addToPermList(list: { [key: string]: string[] }, listFile: string, user: User, cmds: string[]) {
    if (list[user.id]) {
        list[user.id] = list[user.id].concat(cmds)
    } else {
        list[user.id] = cmds
    }
    savePermList(list, listFile)
}
function removeFromPermList(list: { [key: string]: string[] }, listFile: string, user: User, cmds: string[]) {
    if (list[user.id]) {
        list[user.id] = list[user.id].filter(v => !cmds.includes(v))
    } else {
        list[user.id] = []
    }
    savePermList(list, listFile)
}

const FILE_SHORTCUTS = { "distance": "distance-easter-egg", "8": "8ball" }

const GLOBAL_CURRENCY_SIGN = "$"


export {
    prefix,
    ADMINS,
    FILE_SHORTCUTS,
    WHITELIST,
    BLACKLIST,
    reloadBlackList,
    reloadWhiteList,
    addToPermList,
    removeFromPermList,
    VERSION,
    USER_SETTINGS,
    client,
    GLOBAL_CURRENCY_SIGN,
    getUserMatchCommands,
    saveMatchCommands,
    addUserMatchCommand,
    removeUserMatchCommand
}

