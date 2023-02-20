import { Message, User } from "discord.js";
import { allowedOptions, getOpt } from "./user-options";

const { readFileSync, writeFileSync, existsSync } = require("fs");
import { Client, Intents } from "discord.js"
const economy = require("./economy");
const prefix = readFileSync("./data/prefix", "utf-8").trim()


const ADMINS = ["334538784043696130"]

const LOGFILE = "log.txt"

const VERSION = { major: 5, minor: 9, bug: 4, part: "", beta: false, alpha: false }

//@ts-ignore
const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_MEMBERS, Intents.FLAGS.DIRECT_MESSAGES, Intents.FLAGS.GUILD_VOICE_STATES], allowedMentions: { parse: ["users"] } })

let USER_SETTINGS = {}

let WHITELIST: { [key: string]: string[] } = {}
let BLACKLIST: { [key: string]: string[] } = {}

function reloadList(list: string, listHolder: {[key: string]: string[]}){
    let lf = readFileSync(`command-perms/${list}`, "utf-8")
    for(let line of lf.split("\n")){
        if(!line) continue;
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
    writeFileSync(`command-perms/${listFile}`, data)
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

let defaultVars = {
    random: () => Math.random(),
    rand: () => Math.random(),
    prefix: (msg: Message) => getOpt(msg.author.id, "prefix", prefix),
    scopecount: () => Object.keys(vars).length,
    sender: (msg: Message) => `<@${msg.author.id}>`,
    carson: () => "The all legendary Carson Williams",
    money: (msg: Message) => economy.getEconomy()[msg.author.id] ? economy.getEconomy()[msg.author.id].money : 0,
    "$": (msg: Message) => economy.getEconomy()[msg.author.id] ? economy.getEconomy()[msg.author.id].money : 0,
    "__global_currency_sign": () => GLOBAL_CURRENCY_SIGN,
    "_": (msg: Message) => getVar(msg, "_!", msg.author.id)
}

for(let v of allowedOptions){
    //@ts-ignore
    defaultVars[`__${v.replaceAll("-", "_")}`] = (msg: Message) => getOpt(msg.author.id, v, "unset")
}

let vars: { [key: string]: { [key: string]: Function | any } } = {
    "__global__": {
        ...defaultVars
    }
}

function saveVars() {
    for (let vname in vars['__global__']) {
        if (Object.keys(defaultVars).includes(vname)) {
            delete vars['__global__'][vname]
        }
    }
    writeFileSync("./data/vars", JSON.stringify(vars))
    vars['__global__'] = {...vars['__global__'], ...defaultVars}
}

function readVars() {
    if (existsSync("./data/vars")) {
        vars = JSON.parse(readFileSync("./data/vars", "utf-8"))
        vars["__global__"] = { ...vars["__global__"], ...defaultVars }
    }
}

readVars()

function delVar(varName: string, prefix?: string){
    delete vars[prefix ?? "__global__"][varName]
}

function setVarEasy(msg: Message, varName: string, value: string, prefix?: string){
    if (!prefix) {
        let v;
        [prefix, ...v] = varName.split(":")
        varName = v.join(":")
        if(!varName){
            varName = prefix
            prefix = "__global__"
        }
    }
    if(prefix.match(/\d{18}/)){
        return false
    }
    if(prefix === "%"){
        prefix = msg.author.id
    }
    return setVar(varName, value, prefix)
}

function setVar(varName: string, value: string, prefix?: string) {
    if (!prefix) {
        let v;
        [prefix, ...v] = varName.split(":")
        varName = v.join(":")
        if(!varName){
            varName = prefix
            prefix = "__global__"
        }
    }
    if (!vars[prefix]) {
        vars[prefix] = { [varName]: value }
    }
    else if (vars[prefix]) {
        vars[prefix][varName] = value
    }
    return true
}

function readVarVal(msg: Message, variableData: Function | any) {
    if (typeof variableData === 'string') {
        return variableData
    }
    else if (typeof variableData === 'function') {
        return variableData(msg)
    }
    else if (typeof variableData === 'number') {
        return String(variableData)
    }
    else {
        return String(variableData)
    }
}

function getVar(msg: Message, varName: string, prefix?: string) {
    if (!prefix) {
        let name
        [prefix, ...name] = varName.split(":")
        if (!name.length) {
            varName = prefix
            prefix = "__global__"
        }
        else if (prefix === "%") {
            prefix = msg.author.id
            varName = name.join(":")
        }
        else varName = name.join(":");
    }
    if (vars[prefix] && vars[prefix][varName] !== undefined) {
        return readVarVal(msg, vars[prefix][varName])
    }
    return false
}


export {
    prefix,
    vars,
    ADMINS,
    FILE_SHORTCUTS,
    WHITELIST,
    BLACKLIST,
    reloadBlackList,
    reloadWhiteList,
    addToPermList,
    removeFromPermList,
    LOGFILE,
    VERSION,
    USER_SETTINGS,
    client,
    setVar,
    setVarEasy,
    readVars,
    saveVars,
    getVar,
    delVar,
    GLOBAL_CURRENCY_SIGN
}

