import fs from 'fs'
import { User } from "discord.js";

import { Client, GatewayIntentBits } from "discord.js"
import economy from './economy';
import { saveItems } from './shop';
import { saveConfig } from './config-manager';
import vars from './vars';
import timer from './timer';
import pets from './pets';

import user_options from './user-options'

const VERSION = { major: 9, minor: 7, bug: 19, part: "", beta: false, alpha: false  }

const client = new Client({ intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.MessageContent
], allowedMentions: {} })

let USER_SETTINGS = {}

let WHITELIST: { [key: string]: string[] } = {}
let BLACKLIST: { [key: string]: string[] } = {}

let USER_MATCH_COMMANDS: Map<string, Map<string, [RegExp, string]>> = new Map()

let ENDPOINTS: { [key: string]: string[] } = {}

function saveDb() {
        economy.saveEconomy()
        saveItems()
        saveConfig()
        vars.saveVars()
        timer.saveTimers()
        pets.savePetData()
        user_options.saveUserOptions()
}


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


function savePermList(list: { [key: string]: string[] }, listFile: string) {
    let data = Object.entries(list)
                .map(([user, perms]) => `${user}: ${perms.join(" ")}`).join("\n")
    fs.writeFileSync(`command-perms/${listFile}`, data)
}

function addToPermList(
    list: { [key: string]: string[] },
    listFile: string,
    user: User,
    cmds: string[]
) {
    if (list[user.id]) {
        list[user.id] = list[user.id].concat(cmds)
    } else {
        list[user.id] = cmds
    }
    savePermList(list, listFile)
}
function removeFromPermList(
    list: { [key: string]: string[] },
    listFile: string,
    user: User,
    cmds: string[]
) {
    list[user.id] = list[user.id] ? list[user.id].filter(v => !cmds.includes(v)) : []
    savePermList(list, listFile)
}

function loadIDBlackList(type: "user" | "role") {
    let data = fs.readFileSync(`./data/blacklist/${type}`, "utf-8")
    return data.split("\n")
}

function loadEndpointsDB() {
    if (fs.existsSync("./data/custom-endpoints.json"))
        ENDPOINTS = JSON.parse(fs.readFileSync("./data/custom-endpoints.json", "utf-8"))
    else ENDPOINTS = {}
}

function usersEndpoints(user: string) {
    return ENDPOINTS[user] || []
}

function addEndpointToUser(user: string, endpoint: string) {
    if (ENDPOINTS[user])
        ENDPOINTS[user].push(endpoint)
    else {
        ENDPOINTS[user] = [endpoint]
    }
}

function removeEndPointFromUser(user: string, endpoint: string) {
    ENDPOINTS[user] = ENDPOINTS[user].filter(v => v !== endpoint)
}

function saveEndPointsDB() {
    fs.writeFileSync(`./data/custom-endpoints.json`, JSON.stringify(ENDPOINTS))
    loadEndpointsDB()
}

function reloadIDBlackLists() {
    _BLACKLISTED_USERS = loadIDBlackList("user")
    _BLACKLISTED_ROLES = loadIDBlackList("role")
}

let _BLACKLISTED_USERS: string[], _BLACKLISTED_ROLES: string[];

const FILE_SHORTCUTS = { "distance": "distance-easter-egg", "8": "8ball" }

export default {
    FILE_SHORTCUTS,
    WHITELIST,
    BLACKLIST,
    BLACKLISTED_ROLES: () => _BLACKLISTED_ROLES,
    BLACKLISTED_USERS: () => _BLACKLISTED_USERS,
    reloadIDBlackLists,
    reloadBlackList,
    reloadWhiteList,
    addToPermList,
    removeFromPermList,
    VERSION,
    USER_SETTINGS,
    client,
    getUserMatchCommands,
    saveMatchCommands,
    addUserMatchCommand,
    removeUserMatchCommand,
    loadMatchCommands,
    ENDPOINTS: () => ENDPOINTS,
    loadEndpointsDB,
    saveEndPointsDB,
    usersEndpoints,
    addEndpointToUser,
    removeEndPointFromUser,
    saveDb
}

