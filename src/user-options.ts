import fs from "fs"
import common from "./common"

export const allowedOptions = ["prefix", "default-bj-bet", "bj-screen", "money-format", "pingresponse", "heist-join", "lottery-win", "count-text", "dm-when-online", "currency-sign", "puffle-find", "enable-mail", "mail-signature", "no-pingresponse", "pipe-symbol", "1-arg-string", "warn-cmds", "connect4-win", "connect4-symbol", "warn-categories", "error-on-no-cmd", "opts-parser", "location", "css"] as const

export type UserOption = typeof allowedOptions[number]

export const userOptionsInfo: {[name: string]: string} = {}

let optionsData = fs.readFileSync("./data/user-options", "utf-8")
for(let userOptionDataItem of optionsData.split("\n\n")){
    let [option, ...desc] = userOptionDataItem.split(":")
    let description = desc.join(":")
    userOptionsInfo[option as UserOption] = description
}

export let USER_OPTIONS: { [user: string]: { [option: string]: string } } = {}

export function getUserOptions() {
    return USER_OPTIONS
}

export function loadUserOptions() {
    if (fs.existsSync("./database/user-options.json")) {
        USER_OPTIONS = JSON.parse(fs.readFileSync("./database/user-options.json", "utf-8"))
    }
}

loadUserOptions()

export function saveUserOptions() {
    fs.writeFileSync("./database/user-options.json", JSON.stringify(USER_OPTIONS))
}

export function getOpt<T>(user: string | number, opt: UserOption, fallback: T) {
    return USER_OPTIONS[String(user)]?.[opt] ?? fallback
}

export function setOpt(user: string, opt: string, value: string) {
    if (!USER_OPTIONS[user]) {
        USER_OPTIONS[user] = { [opt]: value }
    }
    else {
        USER_OPTIONS[user][opt] = value
    }
}

export function unsetOpt(user: string, opt: string) {
    if (USER_OPTIONS[user]?.[opt] !== undefined) {
        delete USER_OPTIONS[user][opt]
    }
}

export function isValidOption(opt: string): UserOption | false {
    return allowedOptions.includes(opt as UserOption) && opt as UserOption
}

export function formatMoney(user: string, amount: string | number) {
    return `${getOpt(user, "currency-sign", common.GLOBAL_CURRENCY_SIGN)}${amount}`
}

export default{
    allowedOptions,
    userOptionsInfo,
    USER_OPTIONS,
    getUserOptions,
    loadUserOptions,
    saveUserOptions,
    getOpt,
    setOpt,
    unsetOpt,
    isValidOption,
    formatMoney,

}
