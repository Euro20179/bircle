import fs from 'fs'

import { Message } from "discord.js"
import common from './common'
import economy from "./economy"
import { allowedOptions, getOpt } from "./user-options"

import {GLOBAL_CURRENCY_SIGN, PREFIX} from './config-manager'

export type VarName = `${string}:${string}` | string


//TODO:
//add types
//for example: type <amount>. 
//when ${} is used to get the var, it can check the type and do stuff
//for backwards compatibility, vars with no type are strings
//example: if type is <amount>, it can run economy.calculateAmountFromString on the value of the variable and return that
//by default the type is string
//add helper functions such as getTypeOf(name: string, prefix?: string, id?: string)
//  would use the same getter algorithm as getVar
//
//type ideas:
//  <number>
//      example usage: [expr
//      stored as numbers instead of strings
//
//each type would have a respective class to be able to convert between types
//  NumberVar
//  StringVar
//  AmountVar
//  each type would have a list of compatible types, for example
//  <amount> can be converted to <string>
//  <number> can be converted to <string> and <amount>
//  <string> cannot be converted to anything as it could cause errors
//  convertType(varValue, fromType, toType)
//  getVarAs(varName, toType, id?)

const VarType = {
    "string": 0,
    "number": 1,
    "amount": 2,
    "function": 3,
} as const

export type VarType = keyof typeof VarType

type VarTypeValType<VType extends keyof typeof VarType> = {
    "string": string,
    "number": number,
    "amount": string,
    "function": (msg: Message) => string
}[VType]

//This class is not used when vars are read back into memory from the json file
//instead it's read into raw objects
//do not rely on vars being instances of this class, instead just having the properties of this class
class Variable<T extends keyof typeof VarType>{
    type: keyof typeof VarType
    value: VarTypeValType<T>
    constructor(type: T, value: VarTypeValType<T>){
        this.type = type
        this.value = value
    }
}

let defaultVars: Record<string, Variable<"function" | "number">> = {
    "?return": new Variable("number", 0),
    "?warning": new Variable("number", 1),
    "?error": new Variable("number", 2),
    "?achievement": new Variable("number", -3),
    "?info": new Variable("number", -1),
    "?prompt": new Variable("number", -2),
    "?checkin": new Variable("number", -4),
    "?cmdstatus": new Variable("number", 3),
    random: new Variable('function', () => String(Math.random())),
    rand: new Variable("function", () => String(Math.random())),
    prefix: new Variable("function", (msg) => getOpt(msg.author.id, "prefix", PREFIX)),
    sender: new Variable("function", (msg) => `<@${msg.author.id}>`),
    carson: new Variable("function", () => "The all legendary Carson Williams"),
    money: new Variable(
        "function",
        msg => String(msg.author.economyData.money)
    ),
    "$": new Variable(
        "function",
        msg => String(msg.author.economyData.money)
    ),
    "__global_currency_sign": new Variable("function", () => GLOBAL_CURRENCY_SIGN),
    _: new Variable('function', msg => getVar(msg, "_!", msg.author.id))
}

for (let v of allowedOptions) {
    defaultVars[`__${v.replaceAll("-", "_")}`] = new Variable(
        'function',
        (msg: Message) => getOpt(msg.author.id, v, false)
    )
}

type VarPrefix = Record<string, Variable<any>>

let vars: { [key: string]: { [key: string]: Variable<any> | VarPrefix } } = {
    "__global__": {
        ...defaultVars
    }
}

function saveVars(): true {
    for (let vname in vars['__global__']) {
        if (Object.keys(defaultVars).includes(vname)) {
            delete vars['__global__'][vname]
        }
    }
    fs.writeFileSync("./data/vars", JSON.stringify(vars))
    vars['__global__'] = { ...vars['__global__'], ...defaultVars }
    return true
}

function readVars() {
    if (fs.existsSync("./data/vars")) {
        vars = JSON.parse(fs.readFileSync("./data/vars", "utf-8"))
        vars["__global__"] = { ...vars["__global__"], ...defaultVars }
    }
}

readVars()

function getPathFromPrefix(prefix: string, id?: string){
    if(prefix === '__global__'){
        return vars[prefix]
    }
    else if(prefix.match(/^\d{18,19}$/)){
        if(!vars[prefix]){
            return (vars[prefix] = {})
        }
        return vars[prefix]
    }
    else if(prefix.includes('.') && prefix.match(/^\d{18,19}\./)){
        let user;
        [user, prefix] = prefix.split(".")
        if(!vars[user]){
            vars[user] = {}
        }
        if(vars[user][prefix]){
            return (vars[user][prefix] = {})
        }
        return vars[user][prefix]
    }
    else if(id && prefix){
        if(!vars[id]){
            vars[id] = {}
        }
        if(!vars[id][prefix]){
            return (vars[id][prefix] = {})
        }
        return vars[id][prefix]
    }
    return false
}

function delVar(varName: string, id?: string, systemDel: boolean = true) {
    let prefix;
    [prefix, varName] = getPrefixAndVarname(varName)
    let path = getPathFromPrefix(prefix, id)

    if(path === false) return false

    if(path instanceof Variable) return false;

    if(!systemDel && typeof path[varName] === 'function'){
        return false
    }

    delete path[varName]

    return true
}

function delPrefix(prefixName: string, id: string){
    if(vars[id]?.[prefixName]){
        delete vars[id][prefixName]
        return true
    }
    return false
}

function getPrefixAndVarname(varName: string){
        let [prefix, ...v] = varName.split(":")
        //for the ${x:} case
        if(v[0] === "") return [prefix, ""]
        varName = v.join(":")
        //for the ${x} case
        if (!varName) {
            varName = prefix
            prefix = "__global__"
        }
        //for the ${:x} case
        if(!prefix && v.length){
            prefix = "__global__"
        }
        return [prefix, varName]
}

function createVar<T extends VarType>(
    type: T,
    varName: VarName,
    value: VarTypeValType<T>,
    id?: string
){
    let [prefix, name] = getPrefixAndVarname(varName)
    let path = getPathFromPrefix(prefix, id)

    if(!path) return false;
    if(path instanceof Variable) return false

    return path[name] = new Variable(type, value)
}

function setVarEasy(varName: VarName, value: string, id?: string) {
    let prefix;
    [prefix, varName] = getPrefixAndVarname(varName)
    if (prefix === "%") {
        if(id)
            prefix = id
        else return false
    }
    return setVar(`${prefix}:${varName}`, value, id)
}

function changeVar(varName: VarName, add: string | number, id?: string){
    let prefix;
    [prefix, varName] = getPrefixAndVarname(varName);
    let path = getPathFromPrefix(prefix, id)

    if(!path) return false;
    if(path instanceof Variable) return false

    if(path[varName]?.type === 'function'){
        return false
    }

    switch(path[varName].type){
        case 'string': {
            path[varName].value += String(add)
            break;
        }
        case 'number': {
            path[varName].value += Number(add)
            break;
        }
        default: {
            return false
        }
    }
}

function setVar(varName: VarName, value: string, id?: string) {
    let prefix;
    [prefix, varName] = getPrefixAndVarname(varName)
    let path = getPathFromPrefix(prefix, id)

    if(!path) return false;
    if(path instanceof Variable) return false

    //functions are builtin vars and should not be overwritten
    if(path[varName]?.type === 'function'){
        return false
    }
    path[varName] = new Variable('string', value)
    return true
}

function setVar2(scope: "__global__" | string, prefix: string, varname: string, value: Variable<any>){
    let scopeObject = vars[scope]
    if(!scopeObject){
        return false
    }
    if(prefix){
        scopeObject = scopeObject[prefix] as VarPrefix
    }
    if(!scopeObject){
        vars[scope][prefix] = {}
        scopeObject = vars[scope][prefix] as VarPrefix
    }
    scopeObject[varname] = value
    return true
}

function getVar2(msg: Message, scope: "__global__" | string, prefix: string, varname: string){
    let scopeObject = vars[scope]
    if(!scopeObject){
        return false
    }
    if(prefix){
        scopeObject = scopeObject[prefix] as VarPrefix
    }
    if(!scopeObject){
        return false
    }
    if(!scopeObject[varname]){
        return false
    }
    return readVarValRaw(msg, scopeObject[varname])
}

function readVarVal(msg: Message, variableData: Variable<any> | VarPrefix) {
    if (variableData.type === 'string') {
        return variableData.value
    }
    else if (variableData.type === 'function') {
        return variableData.value(msg)
    }
    else if (variableData.type === 'number') {
        return String(variableData.value)
    }
    else if(variableData.type === 'amount'){
        return String(economy.calculateAmountFromString(msg.author.id, variableData.value))
    }
    else if (typeof variableData === 'object') {
        return JSON.stringify(variableData)
    }
    else {
        return String(variableData)
    }
}

function readVarValRaw(msg: Message, variableData: Variable<any> | VarPrefix){
    if (variableData.type === 'string') {
        return variableData.value
    }
    else if (variableData.type === 'function') {
        return variableData.value(msg)
    }
    else if (variableData.type === 'number') {
        return variableData.value
    }
    else if(variableData.type === 'amount'){
        return economy.calculateAmountFromString(msg.author.id, variableData.value)
    }
    else if (typeof variableData === 'object') {
        return JSON.stringify(variableData)
    }
    else {
        return String(variableData)
    }
}

function getVar(msg: Message, varName: string, id?: string) {
    let prefix;
    [prefix, varName] = getPrefixAndVarname(varName)

    if (prefix === "%") {
        prefix = id ?? msg.author.id
    }

    let varPrefixObj = getPathFromPrefix(prefix, id ?? msg.author.id);

    if(!varPrefixObj)
        return false

    if(varPrefixObj instanceof Variable) {
        return readVarVal(msg, varPrefixObj)
    }

    if(!varName){
        return Object.entries(varPrefixObj).map(v => `${v[0]} = ${
            typeof v[1] === 'string' ? v[1] : v[1].value
        }`).join("\n")
    }
    else if(varPrefixObj[varName] === undefined)
        return false;

    return readVarVal(msg, varPrefixObj[varName])
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
    getPrefixAndVarname,
    delPrefix,
    createVar,
    VarType,
    changeVar,
    setVar2,
    getVar2,
    readVarValRaw,
    Variable
}
