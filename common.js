const { readFileSync, writeFileSync } = require("fs");


const economy = require("./economy");

const prefix = readFileSync("./prefix", "utf-8").trim()

const ADMINS = ["334538784043696130"]

const LOGFILE = "log.txt"

const VERSION = {major: 2, minor: 1, bug: 2, part: "", beta: false, alpha: false}

let USER_SETTINGS = {}

let WHITELIST = {}
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
let BLACKLIST = {}
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

function addToPermList(list, listFile, user, cmds){
    if(list[user.id]){
        list[user.id] = list[user.id].concat(cmds)
    } else{
        list[user.id] = cmds
    }
    let data = ""
    for(let user in list){
        data += `${user}: ${list[user].join(" ")}\n`
    }
    writeFileSync(`command-perms/${listFile}`, data)
}
function removeFromPermList(list, listFile, user, cmds){
    if(list[user.id]){
        list[user.id] = list[user.id].filter(v => !cmds.includes(v))
    } else{
        list[user.id] = []
    }
    let data = ""
    for(let user in list){
        data += `${user}: ${list[user].join(" ")}\n`
    }
    writeFileSync(`command-perms/${listFile}`, data)
}

const FILE_SHORTCUTS = {"distance": "distance-easter-egg", "8": "8ball"}

let vars = {
    random: () => Math.random(),
    rand: () => Math.random(),
    prefix: () => prefix,
    vcount: () => Object.keys(vars).length,
    sender: (msg) => `<@${msg.author.id}>`,
    carson: () => "The all legendary Carson Williams",
    money: (msg) => economy.getEconomy()[msg.author.id] ? economy.getEconomy()[msg.author.id].money : 0,
    "$": (msg) => economy.getEconomy()[msg.author.id] ? economy.getEconomy()[msg.author.id].money : 0
}
let userVars = {}

function getVarFn(varName, isUserVar, prefix){
    if(isUserVar && userVars[prefix]?.[varName]){
        return userVars[prefix][varName]
    }
    else if(isUserVar && vars[varName]){
        return vars[varName]
    }
    else if(prefix && !isUserVar && userVars[prefix]?.[varName]){
        return userVars[prefix][varName]
    }
    else if(vars[varName]){
        return vars[varName]
    }
    else{
        return false
    }
}

module.exports = {
    prefix: prefix,
    vars: vars,
    ADMINS: ADMINS,
    FILE_SHORTCUTS: FILE_SHORTCUTS,
    WHITELIST: WHITELIST,
    BLACKLIST: BLACKLIST,
    reloadBlackList: reloadBlackList,
    reloadWhiteList: reloadWhiteList,
    addToPermList: addToPermList,
    removeFromPermList: removeFromPermList,
    LOGFILE: LOGFILE,
    VERSION: VERSION,
    userVars: userVars,
    USER_SETTINGS: USER_SETTINGS,
    getVarFn: getVarFn
}
