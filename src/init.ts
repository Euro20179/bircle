import fs from 'fs'

import { User } from 'discord.js'
import common from './common'
import {loadItems} from './shop'
import economy from './economy'
import user_options from './user-options'

let INITIALIZED = false

function init(done?: Function){
    common.loadMatchCommands()
    common.reloadBlackList()
    common.reloadWhiteList()
    common.reloadIDBlackLists()
    common.loadEndpointsDB()
    loadItems()
    INITIALIZED = true
    if(!fs.existsSync("data/graduates.list")){
        fs.writeFileSync("data/graduates.list", "")
    }
    done?.()
}

Object.defineProperty(User.prototype, "loan", {
    "get": function() {
        return economy.getEconomy()[this.id]?.loanUsed
    },
});
Object.defineProperty(User.prototype, "economyData", {
    "get": function() {
        return economy.getEconomy()[this.id]
    }
});
Object.defineProperty(User.prototype, "netWorth", {
    "get": function() {
        return economy.playerLooseNetWorth(this.id)
    }
});

User.prototype.getBOpt = function(opt, fallback){
    return user_options.getOpt(this.id, opt, fallback)
}

String.prototype.stripStart = function(chars) {
    for (var newStr = this; chars.includes(newStr[0]); newStr = newStr.slice(1));
    return newStr.valueOf()
}

String.prototype.stripEnd = function(chars) {
    for (var newStr = this; chars.includes(newStr[newStr.length - 1]); newStr = newStr.slice(0, -1));
    return newStr.valueOf()
}

Object.hasEnumerableKeys = function(o){
    for(let key in o){
        if(o.hasOwnProperty(key))
            return true
    }
    return false
}

export default {
    INITIALIZED,
    init
}
