import fs = require("fs")

export const allowedOptions = ["prefix", "default-bj-bet", "bj-screen", "money-format", "pingresponse", "heist-join", "lottery-win", "count-text", "change-cmd-return", "change-cmd-info", "change-cmd-prompt", "change-cmd-warning", "change-cmd-error", "dm-when-online", "currency-sign"] as const

export type UserOption = typeof allowedOptions[number]

export let USER_OPTIONS: {[user: string]: {[option: string]: string}} = {}

export  function getUserOptions(){
    return USER_OPTIONS
}

export function loadUserOptions(){
    if(fs.existsSync("./user-options.json")){
        USER_OPTIONS = JSON.parse(fs.readFileSync("./user-options.json", "utf-8"))
    }
}

loadUserOptions()

export function saveUserOptions(){
    fs.writeFileSync("./user-options.json", JSON.stringify(USER_OPTIONS))
}

export function getOpt(user: string, opt: UserOption, fallback: string){
    if(USER_OPTIONS[user]){
        return USER_OPTIONS[user][opt] ?? fallback
    }
    return fallback
}

export function setOpt(user: string, opt: string, value: string){
    if(!USER_OPTIONS[user]){
        USER_OPTIONS[user] = {[opt]: value}
    }
    else{
        USER_OPTIONS[user][opt] = value
    }
}

export function unsetOpt(user: string, opt: string){
    if(USER_OPTIONS[user]?.[opt] !== undefined){
        delete USER_OPTIONS[user][opt]
    }
}

export function isValidOption(opt: string){
    return allowedOptions.includes(opt as UserOption)
}
