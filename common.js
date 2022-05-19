const { readFileSync, writeFileSync } = require("fs");

const prefix = readFileSync("./prefix", "utf-8").trim()

const ADMINS = ["334538784043696130"]

const LOGFILE = "log.txt"

const VERSION = {major: 1, minor: 4, bug: 0, part: "", beta: false, alpha: false}

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
    sender: (msg) => `<@${msg.author.id}>`
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
    VERSION: VERSION
}
