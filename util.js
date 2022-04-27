import { DiscordAPIError } from "discord.js";
import {execFileSync} from 'child_process'

async function fetchUser(guild, find){
    let res;
    if(res = find.match(/<@!?(\d{18})>/)){
        find = res[1]
    }
    let user = (await guild.members.search({query: find}))?.at(0)
    if(!user){
        try{
            user = await guild.members.fetch({user: find})
        }
        catch(DiscordAPIError){
            user = null
        }
    }
    if(!user){
        user = (await guild.members.list()).filter(u => u.id == find || u.username?.indexOf(find) > -1 || u.nickName?.indexOf(find) > -1)?.at(0)
        if(user?.size < 1){
            user = null
        }
    }
    return user
}

function generateFileName(cmd, userId){
    return `${cmd}::${userId}.txt`
}

function downloadSync(url){
    return execFileSync(`curl`, ['--silent', url])
}

function format(str, formats, doPercent, doBraces){
    if(doBraces === undefined) doBraces = true
    if(doPercent === undefined) doPercent = true
    for(let fmt in formats){
        if(fmt.length > 1){
            str = str.replaceAll(`{${fmt}}`, formats[fmt])
        }
        else str = str.replaceAll(new RegExp(`((?<!%)%${fmt}|(?<!\\\\)\\{${fmt}\\})`, "g"), formats[fmt])
    }
    return str
}

export{
    fetchUser,
    generateFileName,
    downloadSync,
    format
}