import fs from 'fs'

import { Message } from "discord.js"
import { GLOBAL_CURRENCY_SIGN, prefix } from "./common"
import economy from "./economy"
import { allowedOptions, getOpt } from "./user-options"

let defaultVars = {
    random: () => String(Math.random()),
    rand: () => String(Math.random()),
    prefix: (msg: Message) => getOpt(msg.author.id, "prefix", prefix),
    scopecount: () => Object.keys(vars).length,
    sender: (msg: Message) => `<@${msg.author.id}>`,
    carson: () => "The all legendary Carson Williams",
    money: (msg: Message) => economy.getEconomy()[msg.author.id] ? economy.getEconomy()[msg.author.id].money : 0,
    "$": (msg: Message) => economy.getEconomy()[msg.author.id] ? economy.getEconomy()[msg.author.id].money : 0,
    "__global_currency_sign": () => GLOBAL_CURRENCY_SIGN,
    "_": (msg: Message) => getVar(msg, "_!", msg.author.id)
}

for (let v of allowedOptions) {
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
    fs.writeFileSync("./data/vars", JSON.stringify(vars))
    vars['__global__'] = { ...vars['__global__'], ...defaultVars }
}

function readVars() {
    if (fs.existsSync("./data/vars")) {
        vars = JSON.parse(fs.readFileSync("./data/vars", "utf-8"))
        vars["__global__"] = { ...vars["__global__"], ...defaultVars }
    }
}

readVars()

function delVar(varName: string, prefix?: string, id?: string, systemDel: boolean = true) {
    prefix ??= "__global__"
    let path
    if (prefix === "__global__" && vars[prefix]?.[varName]) {
        path = vars[prefix]
    }
    else if (prefix.match(/\d{18}/) && vars[prefix]?.[varName]) {
        path = vars[prefix]
    }
    else if (id && vars[id]?.[prefix]?.[varName] !== undefined) {
        path = vars[id][prefix]
    }
    else return false

    if(!systemDel && typeof path[varName] === 'function'){
        return false
    }

    delete path[varName]

    return true
}

function getPrefixAndVarname(varName: string){
        let [prefix, ...v] = varName.split(":")
        varName = v.join(":")
        if (!varName) {
            varName = prefix
            prefix = "__global__"
        }
        return [prefix, varName]
}

function setVarEasy(msg: Message, varName: string, value: string, prefix?: string) {
    if (!prefix) {
        [prefix, varName] = getPrefixAndVarname(varName)
    }
    if (prefix.match(/\d{18}/)) {
        return false
    }
    if (prefix === "%") {
        prefix = msg.author.id
    }
    return setVar(varName, value, prefix, msg.author.id)
}

function setVar(varName: string, value: string | Function, prefix?: string, id?: string) {
    if (!prefix) {
        [prefix, varName] = getPrefixAndVarname(varName)
    }
    let path;
    if (prefix === "__global__") {
        path = vars["__global__"]
    }
    if (prefix && id) {
        if (!vars[id]) {
            vars[id] = {}
        }
        if(!vars[id][prefix]){
            vars[id][prefix] = {}
        }
        path = vars[id][prefix]
    }
    else if(prefix.match(/\d{18}/)){
        if(!vars[prefix]){
            vars[prefix] = {}
        }
        path = vars[prefix]
    }
    //functions are builtin vars and should not be overwritten
    if(typeof path[varName] === 'function'){
        return false
    }
    path[varName] = value
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
    else if (typeof variableData === 'object') {
        return JSON.stringify(variableData)
    }
    else {
        return String(variableData)
    }
}

function getVar(msg: Message, varName: string, prefix?: string, id?: string) {
    if (!prefix) {
        if (!prefix) {
            [prefix, varName] = getPrefixAndVarname(varName)
        }
    }
    if (prefix === "%") {
        prefix = id ?? msg.author.id
    }

    if(prefix.includes(".") && prefix.slice(0, 18).match(/\d{18}/)){
        let user;
        [user, prefix] = prefix.split(".")
        if(vars[user]?.[prefix]?.[varName])
            return readVarVal(msg, vars[user]?.[prefix][varName])
    }

    //global vars
    else if (prefix === "__global__" && vars[prefix][varName] !== undefined) {
        return readVarVal(msg, vars[prefix][varName])
    }
    //for standard user vars
    else if (prefix.match(/^\d{18}$/) && vars[prefix]?.[varName] !== undefined) {
        return readVarVal(msg, vars[prefix][varName])
    }
    //for prefixed vars
    else if (vars[id ?? msg.author.id]?.[prefix]?.[varName] !== undefined) {
        return readVarVal(msg, vars[id ?? msg.author.id][prefix][varName])
    }
    return false
}

export default {
    defaultVars,
    vars,
    getVar,
    setVar,
    setVarEasy,
    readVarVal,
    readVars,
    saveVars,
    delVar,
    getPrefixAndVarname
}
