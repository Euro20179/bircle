import { Message, User } from "discord.js";

const { readFileSync, writeFileSync, existsSync } = require("fs");
const {Client, Intents} = require("discord.js")


const economy = require("./economy");

const prefix = readFileSync("./prefix", "utf-8").trim()

const ADMINS = ["334538784043696130"]

const LOGFILE = "log.txt"

const VERSION = {major: 2, minor: 4, bug: 2, part: "", beta: false, alpha: false}

const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_MEMBERS, Intents.FLAGS.DIRECT_MESSAGES, Intents.FLAGS.GUILD_VOICE_STATES], allowedMentions: { parse: ["users"] } })

let USER_SETTINGS = {}

let WHITELIST: {[key: string]: string[]} = {}
function reloadWhiteList(){
    let wlF = readFileSync("command-perms/whitelists", "utf-8")
    for(let line of wlF.split("\n")){
        if(!line) continue
        let [user, cmdlist] = line.split(":")
        cmdlist = cmdlist.trim()
        user = user.trim()
        WHITELIST[user] = cmdlist.split(" ")
    }
}
let BLACKLIST: {[key: string]: string[]} = {}
function reloadBlackList(){
    let blF = readFileSync("command-perms/blacklists", "utf-8")
    for(let line of blF.split("\n")){
        if(!line) continue
        let [user, cmdlist] = line.split(":")
        cmdlist = cmdlist.trim()
        user = user.trim()
        BLACKLIST[user] = cmdlist.split(" ")
    }
}
reloadBlackList()
reloadWhiteList()

function savePermList(list: {[key: string]: string[]}, listFile: string){
    let data = ""
    for(let user in list){
        data += `${user}: ${list[user].join(" ")}\n`
    }
    writeFileSync(`command-perms/${listFile}`, data)
}

function addToPermList(list: {[key: string]: string[]}, listFile: string, user: User, cmds: string[]){
    if(list[user.id]){
        list[user.id] = list[user.id].concat(cmds)
    } else{
        list[user.id] = cmds
    }
    savePermList(list, listFile)
}
function removeFromPermList(list: {[key: string]: string[]}, listFile: string, user: User, cmds: string[]){
    if(list[user.id]){
        list[user.id] = list[user.id].filter(v => !cmds.includes(v))
    } else{
        list[user.id] = []
    }
    savePermList(list, listFile)
}

const FILE_SHORTCUTS = {"distance": "distance-easter-egg", "8": "8ball"}

let defaultVars = {
    random: () => Math.random(),
    rand: () => Math.random(),
    prefix: () => prefix,
    scopecount: () => Object.keys(vars).length,
    sender: (msg: Message) => `<@${msg.author.id}>`,
    carson: () => "The all legendary Carson Williams",
    money: (msg: Message) => economy.getEconomy()[msg.author.id] ? economy.getEconomy()[msg.author.id].money : 0,
    "$": (msg: Message) => economy.getEconomy()[msg.author.id] ? economy.getEconomy()[msg.author.id].money : 0
}

let vars: {[key: string]: {[key: string]: Function | any}} = {
    "__global__": {
        ...defaultVars
    }
}

function  saveVars(){
    for(let vname in vars['__global__']){
        if(Object.keys(defaultVars).includes(vname)){
            delete vars['__global__'][vname]
        }
    }
    writeFileSync("./vars", JSON.stringify(vars))
}

function readVars(){
    if(existsSync("./vars")){
        vars = JSON.parse(readFileSync("./vars", "utf-8"))
        vars["__global__"] = {...vars["__global__"], ...defaultVars}
    }
}

readVars()

function setVar(varName: string, value: string, prefix?: string){
    if(!prefix){
        prefix = "__global__"
    }
    if(!vars[prefix]){
        vars[prefix] = {[varName]: value}
    }
    else if(vars[prefix]){
        vars[prefix][varName] = value
    }
    return true
}

/**
    * @deprecated Use getVar(msg, varName, prefix?) instead
*/
function getVarFn(varName: string, isUserVar: boolean, prefix: string){
    if(!prefix)
        prefix = "__global__"
    if(isUserVar && vars[prefix]?.[varName]){
        return vars[prefix][varName]
    }
    else if(isUserVar && vars['__global__'][varName]){
        return vars[varName]
    }
    else if(prefix && !isUserVar && vars[prefix]?.[varName]){
        return vars[prefix][varName]
    }
    else if(vars["__global__"][varName]){
        return vars["__global__"][varName]
    }
    else{
        return false
    }
}



function readVarVal(msg: Message, variableData: Function | any){
    if(typeof variableData ===  'string'){
        return variableData
    }
    else if(typeof variableData === 'function'){
        return variableData(msg)
    }
    else if(typeof variableData === 'number'){
        return String(variableData)
    }
    else{
        return String(variableData)
    }
}

function getVar(msg: Message, varName: string, prefix?: string){
    if(!prefix){
        let name
        [prefix, ...name] = varName.split(":")
        if(!name.length){
            varName = prefix
            prefix = "__global__"
        }
        else if(prefix === "%"){
            prefix = msg.author.id
            varName = name.join(":")
        }
        else varName  = name.join(":");
    }
    console.log(prefix, vars[prefix], vars[prefix]?.[varName])
    if(vars[prefix] && vars[prefix][varName]){
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
    getVarFn,
    client,
    setVar,
    readVars,
    saveVars,
    getVar
}

